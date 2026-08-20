'use strict';

// Application bootstrap, global navigation and top-level rendering.

async function init() {
  if (!window.__ROSTERCAP_IDENTITY_LOADED__) {
    const message = 'RosterCap could not load its Team Identity module. Refresh once after the latest GitHub deployment.';
    console.error(message);
    showAuthError(message);
    setCloudStatus('Load error', 'error');
    return;
  }

  installDraftHistoryFeature();
  installTransactionHistoryPolish();
  installWorkspaceDensityPass();
  installPlayerEditorPolish();
  bindEvents();
  setCloudStatus('Connecting…', 'busy');

  const { data, error } = await db.auth.getSession();
  if (error) {
    console.error('Initial Supabase session failed', error);
    showAuthError(error.message || 'Unable to restore your RosterCap session.');
  }

  await handleSessionChange(data?.session || null, 'INITIAL_SESSION');

  db.auth.onAuthStateChange((event, nextSession) => {
    window.setTimeout(async () => {
      await handleSessionChange(nextSession, event);
    }, 0);
  });

  if (!data?.session?.user) {
    await initializeGoogleIdentity();
  }
}

function installMobileWorkspaceNav() {
  const popover = document.querySelector('.utility-menu-popover');
  if (!popover || popover.querySelector('[data-mobile-workspace-nav]')) return;

  const frontOfficeLabel = [...popover.querySelectorAll('.utility-menu-section-label')]
    .find((item) => item.textContent.trim() === 'Front Office');
  const insertBefore = frontOfficeLabel || popover.firstElementChild?.nextElementSibling || null;

  const label = document.createElement('span');
  label.className = 'utility-menu-section-label mobile-workspace-nav-only';
  label.dataset.mobileWorkspaceNav = 'label';
  label.textContent = 'Workspace';

  const transactionsButton = document.createElement('button');
  transactionsButton.className = 'btn btn-ghost nav-tab mobile-workspace-nav-only';
  transactionsButton.dataset.mobileWorkspaceNav = 'transactions';
  transactionsButton.dataset.view = 'transactions';
  transactionsButton.type = 'button';
  transactionsButton.textContent = 'Transactions';

  const settingsButton = document.createElement('button');
  settingsButton.className = 'btn btn-ghost nav-tab mobile-workspace-nav-only';
  settingsButton.dataset.mobileWorkspaceNav = 'settings';
  settingsButton.dataset.view = 'settings';
  settingsButton.type = 'button';
  settingsButton.textContent = 'Settings';

  const divider = document.createElement('div');
  divider.className = 'utility-menu-divider mobile-workspace-nav-only mobile-workspace-divider-v260';
  divider.dataset.mobileWorkspaceNav = 'divider';

  popover.insertBefore(label, insertBefore);
  popover.insertBefore(transactionsButton, insertBefore);
  popover.insertBefore(settingsButton, insertBefore);
  popover.insertBefore(divider, insertBefore);
}

function bindEvents() {
  el('signOutBtn').addEventListener('click', signOut);
  el('backToOfficesBtn').addEventListener('click', showOfficePicker);
  el('workspaceBackBtn').addEventListener('click', showOfficePicker);
  el('deleteFrontOfficeBtn').addEventListener('click', deleteCurrentFrontOffice);
  el('newOfficeBtn').addEventListener('click', showCreateOffice);
  el('frontOfficeForm').addEventListener('submit', handleCreateFrontOffice);
  el('salaryCap').addEventListener('input', (event) => formatWholeDollarInput(event.target));
  el('salaryCap').addEventListener('blur', (event) => formatWholeDollarInput(event.target));
  el('exportBtn').addEventListener('click', exportRosterCsv);
  el('seasonSelect').addEventListener('change', async () => {
    const seasonId = el('seasonSelect').value;
    await runCloudAction(async () => {
      const frontOfficeId = state.frontOffice.id;
      const { error } = await db.rpc('set_current_front_office_season_v2', {
        p_front_office_id: frontOfficeId,
        p_front_office_season_id: seasonId
      });
      if (error) throw error;
      await loadOffice(frontOfficeId, false);
    });
    render();
  });

  installMobileWorkspaceNav();

  document.querySelectorAll('.nav-tab').forEach((button) => {
    button.addEventListener('click', () => switchView(button.dataset.view));
  });

  el('closePlayerDialog').addEventListener('click', () => playerDialog.close());
  el('cancelPlayerBtn').addEventListener('click', () => playerDialog.close());
  el('playerForm').addEventListener('submit', savePlayerFromDialog);
  el('playerForm').addEventListener('input', markPlayerDirty);
  el('playerForm').addEventListener('change', markPlayerDirty);
  el('deletePlayerBtn').addEventListener('click', removeEditingPlayer);
  el('applyQuickContractBtn').addEventListener('click', applyQuickContract);
  el('quickSalary').addEventListener('blur', (event) => formatWholeDollarInput(event.target));
  el('salaryChangeMode').addEventListener('change', updateQuickContractControls);
  el('contractYearsRemaining').addEventListener('input', syncContractEndFromYears);
  el('closeImportDialog').addEventListener('click', () => importDialog.close());
  el('cancelImportBtn').addEventListener('click', () => importDialog.close());
  el('csvFile').addEventListener('change', handleCsvFile);
  el('applyImportBtn').addEventListener('click', applyImport);
  el('closeTransactionDialog').addEventListener('click', () => { transactionDialog.close(); resetTransactionEditState(); });
  el('cancelTransactionBtn').addEventListener('click', () => { transactionDialog.close(); resetTransactionEditState(); });
  el('transactionForm').addEventListener('submit', saveTransactionFromDialog);
  el('transactionType').addEventListener('change', handleTransactionTypeChange);
  el('transactionPlayer').addEventListener('change', handleTransactionPlayerChange);
  el('transactionRosterAction').addEventListener('change', updateTransactionRosterStatusVisibility);
  el('transactionSummary').addEventListener('input', () => { transactionSummaryTouched = true; });
  el('transactionCounterparty').addEventListener('input', () => { if (el('transactionType').value === 'Trade') autoTransactionSummary(); });
  el('recalculateTransactionPenaltyBtn').addEventListener('click', applyAutomaticTransactionPenalty);
  el('closeAssetDialog').addEventListener('click', () => assetDialog.close());
  el('cancelAssetBtn').addEventListener('click', () => assetDialog.close());
  el('assetForm').addEventListener('submit', saveAssetFromDialog);
  el('assetType').addEventListener('change', syncAssetTypeFields);
  el('archiveAssetBtn').addEventListener('click', archiveEditingAsset);
  el('playerIsProspect').addEventListener('change', syncProspectLocationControls);
  el('playerRosterGroup').addEventListener('change', syncProspectLocationControls);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') persistWorkspaceResumeState();
  });
  window.addEventListener('pagehide', persistWorkspaceResumeState);
}

async function handleCreateFrontOffice(event) {
  event.preventDefault();
  if (!session?.user) return showAuthError('Sign in before creating a Front Office.');
  const currentSeason = el('currentSeason').value.trim();
  const startYear = parseSeasonStart(currentSeason);
  if (!startYear) {
    alert('Use a season in the format 2026-27.');
    return;
  }
  await runCloudAction(async () => {
    const { data, error } = await db.rpc('create_front_office_with_seasons_v1', {
      p_team_name: el('teamName').value.trim(),
      p_league_name: el('leagueName').value.trim(),
      p_sport: el('sport').value,
      p_currency_code: el('currency').value,
      p_roster_limit: nullableNumber(el('rosterLimit').value),
      p_current_season_start_year: startYear,
      p_current_salary_cap: nullableNumber(el('salaryCap').value),
      p_season_count: 7
    });
    if (error) throw error;
    await loadOffice(data);
  });
}

function render() {
  const appHeader = el('appHeader');
  if (!session?.user) {
    if (appHeader) appHeader.classList.add('hidden');
    authGate.classList.remove('hidden');
    officePicker.classList.add('hidden');
    onboarding.classList.add('hidden');
    workspace.classList.add('hidden');
    el('topbarActions').classList.add('hidden');
    el('workspaceNav').classList.add('hidden');
    el('workspaceBackBtn').classList.add('hidden');
    el('deleteFrontOfficeBtn').classList.add('hidden');
    return;
  }

  if (appHeader) appHeader.classList.remove('hidden');
  el('topbarActions').classList.remove('hidden');
  el('userEmail').textContent = session.user.email || session.user.user_metadata?.full_name || 'Signed in';
  authGate.classList.add('hidden');

  const hasOffice = Boolean(state.frontOffice);
  el('workspaceBackBtn').classList.toggle('hidden', !hasOffice);
  el('deleteFrontOfficeBtn').classList.toggle('hidden', !hasOffice);
  if (!hasOffice) return;

  officePicker.classList.add('hidden');
  onboarding.classList.add('hidden');
  workspace.classList.remove('hidden');
  el('workspaceNav').classList.remove('hidden');
  el('exportBtn').disabled = false;
  el('exportBtn').classList.remove('hidden');
  applyTeamIdentityToShell();
  el('teamLabel').textContent = state.frontOffice.teamName;
  el('leagueLabel').textContent = `${state.frontOffice.leagueName} · ${state.frontOffice.sport}`;
  renderSeasonSelect();
  renderSummaryCards();
  el('summaryCards').classList.add('hidden');
  renderOverview();
  renderRoster();
  renderFarm();
  renderAssets();
  renderCap();
  renderTransactions();
  renderSettings();
  switchView(activeView, { persist: false });
  persistWorkspaceResumeState();
}

function renderSeasonSelect() {
  const select = el('seasonSelect');
  select.innerHTML = state.seasons
    .sort((a, b) => a.startYear - b.startYear)
    .map((season) => `<option value="${season.id}" ${season.id === state.frontOffice.currentSeasonId ? 'selected' : ''}>${seasonLabel(season.startYear)}</option>`)
    .join('');
}

function switchView(view, options = {}) {
  const nextView = WORKSPACE_VIEWS.includes(view) ? view : 'overview';
  activeView = nextView;

  document.querySelectorAll('.nav-tab').forEach((button) =>
    button.classList.toggle('active', button.dataset.view === nextView)
  );

  WORKSPACE_VIEWS.forEach((name) =>
    el(`${name}View`).classList.toggle('hidden', name !== nextView)
  );

  const utilityMenu = document.querySelector('.utility-menu');
  const secondaryActive = nextView === 'transactions' || nextView === 'settings';
  utilityMenu?.classList.toggle('workspace-secondary-active', secondaryActive);

  const utilitySummary = utilityMenu?.querySelector('summary');
  if (utilitySummary) {
    utilitySummary.setAttribute(
      'aria-label',
      secondaryActive
        ? `${nextView === 'transactions' ? 'Transactions' : 'Settings'} selected. Workspace menu`
        : 'Workspace menu'
    );
  }

  if (utilityMenu?.open) utilityMenu.removeAttribute('open');

  el('summaryCards').classList.add('hidden');
  if (options.persist !== false) persistWorkspaceResumeState();
}

function resetApp() {
  showOfficePicker();
}

function exportRosterCsv() {
  if (!state.frontOffice) return;
  const sortedSeasons = [...state.seasons].sort((a,b) => a.startYear - b.startYear);
  const headers = ['Fantrax ID','Player','Pos','Eligible','NHL Team','Age','Status','Prospect','Roster Location', ...sortedSeasons.map((s) => `${seasonLabel(s.startYear)} Salary`), 'Contract End','Notes'];
  const rows = state.players.map((p) => [
    p.fantraxId || '', p.name, p.position, p.eligiblePositions || p.position || '', p.realTeam, p.ageSnapshot ?? '', statusById(p.statusId)?.name || '', p.isProspect ? 'Yes' : 'No', p.rosterGroup || 'ACTIVE',
    ...sortedSeasons.map((s) => p.salaries?.[s.id]?.salary ?? ''),
    p.contractEndSeasonId ? seasonLabel(seasonById(p.contractEndSeasonId)?.startYear) : '', p.notes || ''
  ]);
  const csv = [headers, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n');
  downloadText(`${safeFileName(state.frontOffice.teamName)}-front-office.csv`, csv, 'text/csv');
}

function saveState() {
  // V1.3 writes live data through Supabase. Local storage is no longer the source of truth.
}

function loadState() {
  return emptyState();
}


// -----------------------------------------------------------------------------
// V2.58 — Draft History
// Additive frontend wiring around the established transaction + asset contracts.
// -----------------------------------------------------------------------------
let draftHistoryInstalled = false;

function draftHistoryOwnedPicks() {
  return [...(state.assets || [])]
    .filter((asset) =>
      !asset.archivedAt
      && asset.type === 'DRAFT_PICK'
      && asset.status === 'OWNED'
    )
    .sort((a,b) =>
      Number(a.draftYear || 9999) - Number(b.draftYear || 9999)
      || Number(a.draftRound || 999) - Number(b.draftRound || 999)
      || String(a.originalTeam || '').localeCompare(String(b.originalTeam || ''))
    );
}

function draftHistoryPickLabel(asset) {
  if (!asset) return 'Draft Pick';
  return asset.label
    || `${asset.draftYear || 'Draft'} ${asset.originalTeam || ''} Round ${asset.draftRound || '—'}`.trim();
}

function ensureDraftHistoryUi() {
  const typeSelect = el('transactionType');
  if (typeSelect && ![...typeSelect.options].some((option) => option.value === 'Draft')) {
    const draftOption = document.createElement('option');
    draftOption.value = 'Draft';
    draftOption.textContent = 'Draft';
    const signingOption = [...typeSelect.options].find((option) => option.value === 'Signing' || option.textContent === 'Signing');
    typeSelect.insertBefore(draftOption, signingOption || typeSelect.firstChild?.nextSibling || null);
  }

  if (!el('transactionDraftSection')) {
    const tradeSection = el('transactionTradeStructuredSection');
    if (tradeSection) {
      const section = document.createElement('section');
      section.id = 'transactionDraftSection';
      section.className = 'draft-history-section hidden';
      section.innerHTML = `
        <div class="draft-history-head">
          <div>
            <p class="eyebrow">Draft selection</p>
            <h4>Player + Draft Pick</h4>
            <p>Links the selected player to one Owned Draft Pick and keeps the selection in Front Office history.</p>
          </div>
        </div>
        <div class="draft-history-grid">
          <label>
            Drafted player
            <select id="draftTransactionPlayer"></select>
          </label>
          <label>
            Draft Pick used
            <select id="draftTransactionPick"></select>
          </label>
        </div>
        <div class="draft-history-selection-meta" id="draftTransactionSelectionMeta"></div>
        <div class="draft-history-lock hidden" id="draftTransactionEditLock">
          Player and Draft Pick are locked after the Draft is recorded. Edit the date, summary or notes here; delete and recreate the Draft entry to change the selection.
        </div>
      `;
      tradeSection.insertAdjacentElement('afterend', section);

      el('draftTransactionPlayer')?.addEventListener('change', () => {
        syncDraftHistorySelectionMeta();
        autoDraftHistorySummary();
      });
      el('draftTransactionPick')?.addEventListener('change', () => {
        syncDraftHistorySelectionMeta();
        autoDraftHistorySummary();
      });
    }
  }

  const assetStatus = el('assetStatus');
  if (assetStatus && ![...assetStatus.options].some((option) => option.value === 'USED')) {
    const usedOption = document.createElement('option');
    usedOption.value = 'USED';
    usedOption.textContent = 'Used (Drafted)';
    usedOption.disabled = true;
    assetStatus.appendChild(usedOption);
  }
}

function populateDraftHistorySelectors(transactionId = null) {
  ensureDraftHistoryUi();

  const playerSelect = el('draftTransactionPlayer');
  const pickSelect = el('draftTransactionPick');
  if (!playerSelect || !pickSelect) return;

  const tx = transactionId
    ? state.transactions.find((item) => item.id === transactionId)
    : null;
  const txItems = transactionId ? transactionItemsFor(transactionId) : [];
  const playerItem = txItems.find((item) =>
    item.kind === 'PLAYER' && item.playerId
  ) || null;
  const pickItem = txItems.find((item) =>
    item.kind === 'ASSET'
    && item.assetId
    && (
      item.metadata?.structured_draft === true
      || item.metadata?.structured_draft === 'true'
    )
  ) || null;

  const players = [...state.players].sort((a,b) => a.name.localeCompare(b.name));
  playerSelect.innerHTML =
    `<option value="">Select drafted player</option>`
    + players.map((player) =>
      `<option value="${player.id}">${escapeHtml(player.name)} · ${escapeHtml(player.position || '—')}${player.realTeam ? ` · ${escapeHtml(player.realTeam)}` : ''}</option>`
    ).join('');

  const ownedPicks = draftHistoryOwnedPicks();
  const selectedHistoricalPick = pickItem?.assetId
    ? state.assets.find((asset) => asset.id === pickItem.assetId)
    : null;
  const pickChoices = selectedHistoricalPick && !ownedPicks.some((asset) => asset.id === selectedHistoricalPick.id)
    ? [selectedHistoricalPick, ...ownedPicks]
    : ownedPicks;

  pickSelect.innerHTML =
    `<option value="">Select owned Draft Pick</option>`
    + pickChoices.map((asset) =>
      `<option value="${asset.id}">${escapeHtml(draftHistoryPickLabel(asset))}${asset.status === 'USED' ? ' · Used' : ''}</option>`
    ).join('');

  if (playerItem?.playerId) playerSelect.value = playerItem.playerId;
  if (pickItem?.assetId) pickSelect.value = pickItem.assetId;

  const editingDraft = Boolean(tx && tx.type === 'Draft');
  playerSelect.disabled = editingDraft;
  pickSelect.disabled = editingDraft;
  el('draftTransactionEditLock')?.classList.toggle('hidden', !editingDraft);

  syncDraftHistorySelectionMeta();
}

function syncDraftHistorySelectionMeta() {
  const meta = el('draftTransactionSelectionMeta');
  const playerSelect = el('draftTransactionPlayer');
  const pickSelect = el('draftTransactionPick');
  if (!meta || !playerSelect || !pickSelect) return;

  const player = state.players.find((item) => item.id === playerSelect.value);
  const pick = state.assets.find((item) => item.id === pickSelect.value);
  const ownedPickCount = draftHistoryOwnedPicks().length;

  if (!state.players.length) {
    meta.innerHTML = '<span class="warning">Add the drafted player to RosterCap first, then record the Draft selection.</span>';
    return;
  }

  if (!pick && ownedPickCount === 0) {
    meta.innerHTML = '<span class="warning">No Owned Draft Picks are available. Add the pick in Assets first.</span>';
    return;
  }

  if (!player || !pick) {
    meta.innerHTML = '<span>Select one tracked player and one Owned Draft Pick.</span>';
    return;
  }

  meta.innerHTML = `
    <span><strong>${escapeHtml(player.name)}</strong> will be linked to <strong>${escapeHtml(draftHistoryPickLabel(pick))}</strong>.</span>
    <small>The pick becomes Used and remains visible in Assets/history. The player is not moved or removed.</small>
  `;
}

function autoDraftHistorySummary() {
  if (el('transactionType')?.value !== 'Draft') return;
  if (typeof transactionSummaryTouched !== 'undefined' && transactionSummaryTouched) return;

  const player = state.players.find((item) => item.id === el('draftTransactionPlayer')?.value);
  if (!player) return;

  const summaryInput = el('transactionSummary');
  if (summaryInput) summaryInput.value = `Selected ${player.name}`;
}

function syncDraftHistoryTransactionUi(transactionId = null) {
  ensureDraftHistoryUi();

  const isDraft = el('transactionType')?.value === 'Draft';
  el('transactionDraftSection')?.classList.toggle('hidden', !isDraft);
  if (!isDraft) return;

  const hideIds = [
    'transactionCounterpartyField',
    'transactionPlayerField',
    'transactionRosterActionField',
    'transactionRosterStatusField',
    'transactionIncomingField',
    'transactionOutgoingField'
  ];
  hideIds.forEach((id) => el(id)?.classList.add('hidden'));

  el('transactionTradeStructuredSection')?.classList.add('hidden');
  el('transactionPlayerSnapshot')?.classList.add('hidden');
  el('transactionFinancialSection')?.classList.add('hidden');

  const help = el('transactionTypeHelp');
  if (help) {
    help.textContent = transactionId
      ? 'Draft player and pick are already linked. You can edit the date, summary and notes.'
      : 'Record who you drafted and which Owned Draft Pick was used. Add the player and pick first if they are not already tracked.';
  }

  populateDraftHistorySelectors(transactionId);
  if (!transactionId) autoDraftHistorySummary();
}

function decorateDraftHistoryTransactions() {
  (state.transactions || [])
    .filter((tx) => tx.type === 'Draft')
    .forEach((tx) => {
      const editButton = document.querySelector(`[data-edit-transaction="${tx.id}"]`);
      const card = editButton?.closest('.transaction-card');
      if (!card) return;

      card.classList.add('draft-history-card');

      const items = transactionItemsFor(tx.id);
      const pickItem = items.find((item) =>
        item.kind === 'ASSET'
        && item.direction === 'OUT'
        && (
          item.metadata?.structured_draft === true
          || item.metadata?.structured_draft === 'true'
        )
      );
      if (!pickItem) return;

      card.querySelectorAll('.tx-ledger-flow-v228.out').forEach((row) => {
        if (row.textContent.includes(pickItem.label)) {
          row.classList.add('draft-pick-flow');
          const direction = row.querySelector('.tx-ledger-direction-v228');
          if (direction) direction.textContent = 'PICK';
        }
      });
    });
}

function syncUsedDraftAssetEditor(assetId = null) {
  const asset = assetId ? state.assets.find((item) => item.id === assetId) : null;
  const isUsed = asset?.type === 'DRAFT_PICK' && asset?.status === 'USED';

  const fields = [
    el('assetType'),
    el('assetStatus'),
    el('assetDraftYear'),
    el('assetDraftRound'),
    el('assetOriginalTeam')
  ].filter(Boolean);

  fields.forEach((field) => {
    field.disabled = Boolean(isUsed);
  });

  if (isUsed && el('assetStatus')) el('assetStatus').value = 'USED';

  const note = el('assetFormNote');
  if (note && isUsed) {
    note.textContent = 'This Draft Pick was used in Draft history. Its status and draft identity are locked; delete the linked Draft transaction to restore the pick.';
  }
}

function installDraftHistoryFeature() {
  if (draftHistoryInstalled) return;
  draftHistoryInstalled = true;

  ensureDraftHistoryUi();

  // Asset display + safe editor lock for USED picks.
  if (typeof assetStatusLabel === 'function') {
    const originalAssetStatusLabel = assetStatusLabel;
    assetStatusLabel = function(status) {
      if (status === 'USED') return 'Used';
      return originalAssetStatusLabel(status);
    };
  }

  if (typeof openAssetDialog === 'function') {
    const originalOpenAssetDialog = openAssetDialog;
    openAssetDialog = function(assetId = null) {
      ensureDraftHistoryUi();
      const result = originalOpenAssetDialog(assetId);
      syncUsedDraftAssetEditor(assetId);
      return result;
    };
  }

  // Preserve the established behavior for every non-Draft transaction.
  if (typeof handleTransactionTypeChange === 'function') {
    const originalHandleTransactionTypeChange = handleTransactionTypeChange;
    handleTransactionTypeChange = function() {
      const result = originalHandleTransactionTypeChange();
      syncDraftHistoryTransactionUi(
        typeof editingTransactionId !== 'undefined' ? editingTransactionId : null
      );
      return result;
    };
  }

  if (typeof openTransactionDialog === 'function') {
    const originalOpenTransactionDialog = openTransactionDialog;
    openTransactionDialog = function(prefill = {}) {
      ensureDraftHistoryUi();
      const result = originalOpenTransactionDialog(prefill);
      const txId = typeof editingTransactionId !== 'undefined' ? editingTransactionId : null;
      syncDraftHistoryTransactionUi(txId);
      return result;
    };
  }

  if (typeof openEditTransactionDialog === 'function') {
    const originalOpenEditTransactionDialog = openEditTransactionDialog;
    openEditTransactionDialog = function(transactionId) {
      ensureDraftHistoryUi();
      const result = originalOpenEditTransactionDialog(transactionId);
      const tx = state.transactions.find((item) => item.id === transactionId);
      if (tx?.type === 'Draft') {
        el('transactionType').value = 'Draft';
        syncDraftHistoryTransactionUi(transactionId);
      }
      return result;
    };
  }

  if (typeof saveTransactionFromDialog === 'function') {
    const originalSaveTransactionFromDialog = saveTransactionFromDialog;
    saveTransactionFromDialog = async function(event) {
      const isDraft = el('transactionType')?.value === 'Draft';
      const txId = typeof editingTransactionId !== 'undefined' ? editingTransactionId : null;

      // Existing Draft rows use the established edit RPC. Structured links stay locked.
      if (!isDraft || txId) {
        return originalSaveTransactionFromDialog(event);
      }

      event.preventDefault();

      const playerId = el('draftTransactionPlayer')?.value || '';
      const assetId = el('draftTransactionPick')?.value || '';
      const summary = el('transactionSummary')?.value.trim() || '';

      if (!playerId) {
        alert('Select the player you drafted.');
        return;
      }
      if (!assetId) {
        alert('Select the Draft Pick used.');
        return;
      }
      if (!summary) {
        alert('Transaction summary is required.');
        return;
      }

      const selectedAsset = state.assets.find((item) => item.id === assetId);
      if (!selectedAsset || selectedAsset.type !== 'DRAFT_PICK' || selectedAsset.status !== 'OWNED') {
        alert('The selected Draft Pick is no longer available as an Owned pick. Refresh and choose another pick.');
        return;
      }

      const button = el('saveTransactionBtn');
      if (button?.disabled) return;
      if (button) {
        button.disabled = true;
        button.textContent = 'Recording Draft…';
      }

      try {
        const success = await runCloudAction(async () => {
          const { error } = await db.rpc('record_draft_selection_v1', {
            p_front_office_id: state.frontOffice.id,
            p_transaction_date: el('transactionDate').value || todayIsoDate(),
            p_front_office_player_id: playerId,
            p_asset_id: assetId,
            p_summary: summary,
            p_notes: el('transactionNotes').value.trim() || null
          });
          if (error) throw error;

          await loadOffice(state.frontOffice.id, false);
        });

        if (success) {
          transactionDialog.close();
          if (typeof resetTransactionEditState === 'function') resetTransactionEditState();
        }
      } finally {
        const currentButton = el('saveTransactionBtn');
        if (currentButton) {
          currentButton.disabled = false;
          currentButton.textContent = 'Save Transaction';
        }
      }
    };
  }

  if (typeof deleteTransaction === 'function') {
    const originalDeleteTransaction = deleteTransaction;
    deleteTransaction = async function(transactionId) {
      const tx = state.transactions.find((item) => item.id === transactionId);
      if (tx?.type !== 'Draft') {
        return originalDeleteTransaction(transactionId);
      }

      const items = transactionItemsFor(transactionId);
      const playerItem = items.find((item) => item.kind === 'PLAYER');
      const pickItem = items.find((item) =>
        item.kind === 'ASSET'
        && (
          item.metadata?.structured_draft === true
          || item.metadata?.structured_draft === 'true'
        )
      );

      const message =
        `Delete this Draft history entry?\n\n`
        + `${playerItem?.label || 'Drafted player'} · ${pickItem?.label || 'Draft Pick'}\n\n`
        + `The Draft Pick will return to its prior asset status. The player will stay on your roster.`;

      if (!confirm(message)) return;

      const success = await runCloudAction(async () => {
        const { error } = await db.rpc('delete_draft_transaction_v1', {
          p_front_office_id: state.frontOffice.id,
          p_transaction_id: transactionId
        });
        if (error) throw error;

        await loadOffice(state.frontOffice.id, false);
      });

      return success;
    };
  }

  if (typeof renderTransactions === 'function') {
    const originalRenderTransactions = renderTransactions;
    renderTransactions = function() {
      const result = originalRenderTransactions();
      decorateDraftHistoryTransactions();
      return result;
    };
  }
}



// -----------------------------------------------------------------------------
// V2.59 — Transaction History Polish
// Removes redundant summary blocks, adds type-count filters and compacts cards.
// This is presentation/filtering only; transaction persistence is unchanged.
// -----------------------------------------------------------------------------
let transactionHistoryFilter = 'ALL';

const TRANSACTION_HISTORY_TYPE_ORDER = [
  'Draft',
  'Trade',
  'Signing',
  'Extension',
  'Call Up',
  'Send Down',
  'Waiver',
  'Buyout',
  'Release',
  'Drop',
  'Add',
  'Other'
];

function transactionHistoryTypeCounts() {
  const counts = new Map();
  (state.transactions || []).forEach((tx) => {
    const type = String(tx.type || 'Other').trim() || 'Other';
    counts.set(type, (counts.get(type) || 0) + 1);
  });
  return counts;
}

function transactionHistoryTypes() {
  const counts = transactionHistoryTypeCounts();
  const known = TRANSACTION_HISTORY_TYPE_ORDER.filter((type) => counts.has(type));
  const unknown = [...counts.keys()]
    .filter((type) => !TRANSACTION_HISTORY_TYPE_ORDER.includes(type))
    .sort((a,b) => a.localeCompare(b));
  return [...known, ...unknown];
}

function transactionHistoryFilterLabel(type) {
  return type === 'ALL' ? 'All' : type;
}

function applyTransactionHistoryFilter() {
  const cards = [...document.querySelectorAll('#transactionsView .transaction-card-v228[data-history-type]')];
  const validTypes = new Set(cards.map((card) => card.dataset.historyType));

  if (
    transactionHistoryFilter !== 'ALL'
    && !validTypes.has(transactionHistoryFilter)
  ) {
    transactionHistoryFilter = 'ALL';
  }

  let shown = 0;
  cards.forEach((card) => {
    const visible =
      transactionHistoryFilter === 'ALL'
      || card.dataset.historyType === transactionHistoryFilter;
    card.hidden = !visible;
    if (visible) shown += 1;
  });

  document.querySelectorAll('#transactionsView [data-transaction-history-filter]').forEach((button) => {
    const active = button.dataset.transactionHistoryFilter === transactionHistoryFilter;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });

  const status = document.querySelector('#transactionsView [data-transaction-history-status]');
  if (status) {
    status.textContent =
      transactionHistoryFilter === 'ALL'
        ? `${shown} recorded`
        : `${shown} ${transactionHistoryFilter}`;
  }
}

function transactionHistoryCardTransaction(card) {
  const editButton = card.querySelector('[data-edit-transaction]');
  const deleteButton = card.querySelector('[data-delete-transaction]');
  const transactionId =
    editButton?.dataset.editTransaction
    || deleteButton?.dataset.deleteTransaction
    || '';
  return (state.transactions || []).find((tx) => tx.id === transactionId) || null;
}

function moveTransactionHistoryActions(card) {
  const head = card.querySelector('.tx-ledger-head-v228');
  const actions = card.querySelector('.tx-ledger-actions-v228');
  if (!head || !actions || head.querySelector('.tx-ledger-meta-v259')) return;

  const meta = document.createElement('div');
  meta.className = 'tx-ledger-meta-v259';

  const time = head.querySelector('time');
  if (time) meta.appendChild(time);

  actions.classList.add('tx-ledger-actions-inline-v259');
  meta.appendChild(actions);
  head.appendChild(meta);
}

function removeRedundantTransactionPlayerRow(card, tx) {
  if (!tx) return;

  const compactTypes = new Set([
    'Call Up',
    'Send Down',
    'Extension',
    'Waiver',
    'Buyout',
    'Release',
    'Drop'
  ]);

  if (!compactTypes.has(tx.type)) return;

  const items = transactionItemsFor(tx.id);
  const playerItems = items.filter((item) =>
    item.kind === 'PLAYER'
    && item.direction === 'NONE'
  );

  if (playerItems.length !== 1) return;

  const playerLabel = String(playerItems[0].label || '').trim().toLowerCase();
  const summary = String(tx.summary || '').trim().toLowerCase();
  if (!playerLabel || !summary.includes(playerLabel)) return;

  const body = card.querySelector('.tx-ledger-body-v228');
  if (!body) return;

  const playerRow = [...body.querySelectorAll('.tx-ledger-flow-v228')].find((row) => {
    const direction = row.querySelector('.tx-ledger-direction-v228');
    return direction?.textContent.trim().toUpperCase() === 'PLAYER';
  });

  playerRow?.remove();
  if (!body.children.length) body.remove();
}

function renderTransactionHistoryFilterBar(page) {
  const existingSummary = page.querySelector('.tx-summary-grid-v228');
  existingSummary?.remove();

  const existingBar = page.querySelector('.tx-history-toolbar-v259');
  existingBar?.remove();

  const counts = transactionHistoryTypeCounts();
  const types = transactionHistoryTypes();

  if (
    transactionHistoryFilter !== 'ALL'
    && !counts.has(transactionHistoryFilter)
  ) {
    transactionHistoryFilter = 'ALL';
  }

  const toolbar = document.createElement('div');
  toolbar.className = 'tx-history-toolbar-v259';

  const filters = document.createElement('div');
  filters.className = 'tx-history-filters-v259';
  filters.setAttribute('role', 'group');
  filters.setAttribute('aria-label', 'Filter transaction history');

  const filterTypes = ['ALL', ...types];
  filterTypes.forEach((type) => {
    const count = type === 'ALL'
      ? (state.transactions || []).length
      : (counts.get(type) || 0);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tx-history-filter-v259';
    button.dataset.transactionHistoryFilter = type;
    button.setAttribute(
      'aria-pressed',
      transactionHistoryFilter === type ? 'true' : 'false'
    );
    if (transactionHistoryFilter === type) button.classList.add('active');

    const label = document.createElement('span');
    label.textContent = transactionHistoryFilterLabel(type);

    const badge = document.createElement('strong');
    badge.textContent = String(count);

    button.append(label, badge);
    button.addEventListener('click', () => {
      transactionHistoryFilter = type;
      applyTransactionHistoryFilter();
    });
    filters.appendChild(button);
  });

  const status = document.createElement('span');
  status.className = 'tx-history-status-v259';
  status.dataset.transactionHistoryStatus = '';

  toolbar.append(filters, status);

  const heading = page.querySelector('.tx-page-heading-v228');
  if (heading) heading.insertAdjacentElement('afterend', toolbar);
  else page.prepend(toolbar);
}

function decorateTransactionHistory() {
  const page = document.querySelector('#transactionsView .transactions-page-v228');
  if (!page) return;

  const copy = page.querySelector('.tx-page-heading-v228 .page-copy');
  if (copy) {
    copy.textContent = 'Drafts, trades, signings and roster moves — all in one chronological history.';
  }

  const cards = [...page.querySelectorAll('.transaction-card-v228')];
  cards.forEach((card) => {
    const tx = transactionHistoryCardTransaction(card);
    if (!tx) return;

    card.dataset.historyType = tx.type || 'Other';
    moveTransactionHistoryActions(card);
    removeRedundantTransactionPlayerRow(card, tx);
  });

  renderTransactionHistoryFilterBar(page);
  applyTransactionHistoryFilter();
}

function installTransactionHistoryPolish() {
  if (typeof renderTransactions !== 'function') return;

  const originalRenderTransactionsV259 = renderTransactions;
  renderTransactions = function() {
    const result = originalRenderTransactionsV259();
    decorateTransactionHistory();
    return result;
  };
}



// -----------------------------------------------------------------------------
// V2.60 — Workspace Density Pass
// Applies the compact Transactions philosophy where it removes redundancy.
// Presentation only; page data and mutations remain unchanged.
// -----------------------------------------------------------------------------
let workspaceDensityPassInstalled = false;

function normalizeWorkspaceLabel(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function activeWorkspaceAssets() {
  return (state.assets || []).filter((asset) => !asset.archivedAt);
}

function assetTabCountV260(label) {
  const key = normalizeWorkspaceLabel(label);
  const assets = activeWorkspaceAssets();

  if (key === 'all' || key.includes('allassets')) return assets.length;

  if (key.includes('draft') || key === 'picks' || key.includes('draftpick')) {
    return assets.filter((asset) => asset.type === 'DRAFT_PICK').length;
  }

  if (key.includes('rights')) {
    return assets.filter((asset) =>
      asset.type === 'PROSPECT_RIGHTS' || asset.type === 'PLAYER_RIGHTS'
    ).length;
  }

  if (key.includes('conditional')) {
    return assets.filter((asset) =>
      asset.status === 'CONDITIONAL' || asset.type === 'CONDITIONAL_ASSET'
    ).length;
  }

  if (key.includes('future')) {
    return assets.filter((asset) => asset.type === 'FUTURE_CONSIDERATIONS').length;
  }

  if (key.includes('other')) {
    return assets.filter((asset) =>
      ![
        'DRAFT_PICK',
        'PROSPECT_RIGHTS',
        'PLAYER_RIGHTS',
        'CONDITIONAL_ASSET',
        'FUTURE_CONSIDERATIONS'
      ].includes(asset.type)
    ).length;
  }

  return null;
}

function compactMinorsPageV260() {
  const page = document.querySelector('#farmView .farm-page-v228');
  if (!page) return;

  // The Minors roster and called-up sections already carry their own counts.
  page.querySelector('.farm-summary-grid-v228')?.remove();

  const copy = page.querySelector('.farm-page-heading-v228 .page-copy');
  if (copy) copy.textContent = 'Prospects, Minors assignments and call-ups.';

  page.classList.add('farm-page-v260');
}

function compactAssetsPageV260() {
  const page = document.querySelector('#assetsView .assets-page-v230, #assetsView .assets-page-v228, #assetsView .assets-page');
  if (!page) return;

  const summary = page.querySelector('.asset-summary-grid-v230, .asset-summary-grid-v228, .asset-summary-strip');
  summary?.remove();

  const copy = page.querySelector('.asset-hero-copy-v230 p:last-child');
  if (copy) copy.textContent = 'Draft picks, rights and future assets.';

  page.querySelectorAll('.asset-tab').forEach((button) => {
    if (button.querySelector('.asset-tab-count-v260')) return;

    const count = assetTabCountV260(button.textContent);
    if (count === null) return;

    const badge = document.createElement('strong');
    badge.className = 'asset-tab-count-v260';
    badge.textContent = String(count);
    button.appendChild(badge);
  });

  page.classList.add('assets-page-v260');
}

function compactCapPageV260() {
  const page = document.querySelector('#capView .cap-page-v228');
  if (!page) return;

  // The cap hero already says season + cap position, so this heading is redundant.
  page.querySelector(':scope > .cap-page-heading-v228')?.remove();

  // The first Cap panel after the hero is the outlook. Keep the useful label
  // but remove the second title/paragraph layer.
  const outlookPanel = page.querySelector('.cap-hero-v228 + .cap-panel-v228');
  const outlookHead = outlookPanel?.querySelector('.cap-section-head-v228');
  if (outlookHead) {
    outlookHead.querySelector('h3')?.remove();
    outlookHead.querySelector('p:not(.eyebrow)')?.remove();
    outlookHead.classList.add('cap-section-head-compact-v260');
  }

  page.classList.add('cap-page-v260');
}

function compactSettingsPageV260() {
  const page = document.querySelector('#settingsView .settings-accordion');
  if (!page) return;
  page.classList.add('settings-accordion-v260');
}

function installWorkspaceDensityPass() {
  if (workspaceDensityPassInstalled) return;
  workspaceDensityPassInstalled = true;

  if (typeof renderFarm === 'function') {
    const originalRenderFarmV260 = renderFarm;
    renderFarm = function() {
      const result = originalRenderFarmV260();
      compactMinorsPageV260();
      return result;
    };
  }

  if (typeof renderAssets === 'function') {
    const originalRenderAssetsV260 = renderAssets;
    renderAssets = function() {
      const result = originalRenderAssetsV260();
      compactAssetsPageV260();
      return result;
    };
  }

  if (typeof renderCap === 'function') {
    const originalRenderCapV260 = renderCap;
    renderCap = function() {
      const result = originalRenderCapV260();
      compactCapPageV260();
      return result;
    };
  }

  if (typeof renderSettings === 'function') {
    const originalRenderSettingsV260 = renderSettings;
    renderSettings = function() {
      const result = originalRenderSettingsV260();
      compactSettingsPageV260();
      return result;
    };
  }
}



// -----------------------------------------------------------------------------
// V2.61 — Player Editor Polish
// Progressive disclosure + compact mobile editing. No data contract changes.
// -----------------------------------------------------------------------------
let playerEditorPolishInstalled = false;

function playerEditorLabelFor(id) {
  return el(id)?.closest('label') || null;
}

function updatePlayerMoreDetailsSummaryV261() {
  const summary = el('playerMoreDetailsSummaryV261');
  if (!summary) return;

  const details = [];
  const team = el('realTeam')?.value.trim();
  const age = el('playerAge')?.value.trim();
  const eligible = el('playerEligible')?.value.trim();

  if (team) details.push(team.toUpperCase());
  if (age) details.push(`Age ${age}`);
  if (eligible) details.push(eligible.toUpperCase());

  summary.textContent = details.length
    ? details.join(' · ')
    : 'NHL team · age · eligibility';
}

function updatePlayerNotesSummaryV261() {
  const summary = el('playerNotesSummaryV261');
  if (!summary) return;
  summary.textContent = el('playerNotes')?.value.trim() ? 'Added' : 'Optional';
}

function updateSalaryChangeSummaryV261() {
  const summary = el('salaryChangeSummaryV261');
  const details = el('salaryChangeDetailsV261');
  if (!summary || !details) return;

  const mode = el('salaryChangeMode')?.value || 'same';
  const pct = Number(el('salaryChangePct')?.value || 0);

  if (mode === 'same') {
    summary.textContent = 'Optional';
    return;
  }

  const label = mode === 'increase' ? 'Increase' : 'Decrease';
  summary.textContent = pct > 0 ? `${label} ${pct}% / year` : `${label} each year`;
  details.open = true;
}

function ensurePlayerEditorPolishStructure() {
  const dialog = el('playerDialog');
  if (!dialog || dialog.dataset.v261PlayerPolish === 'true') return;

  dialog.dataset.v261PlayerPolish = 'true';
  dialog.classList.add('player-dialog-v261');

  const intro = el('playerDialogIntro');
  if (intro) intro.classList.add('player-intro-v261');

  const basics = dialog.querySelector('.player-basics-v18');
  if (basics) {
    basics.classList.add('player-basics-v261');

    const extraFields = [
      playerEditorLabelFor('playerEligible'),
      playerEditorLabelFor('realTeam'),
      playerEditorLabelFor('playerAge')
    ].filter(Boolean);

    if (extraFields.length && !el('playerMoreDetailsV261')) {
      const details = document.createElement('details');
      details.id = 'playerMoreDetailsV261';
      details.className = 'player-disclosure-v261 player-more-details-v261';

      const summary = document.createElement('summary');
      summary.innerHTML = `
        <span>More player details</span>
        <small id="playerMoreDetailsSummaryV261">NHL team · age · eligibility</small>
      `;

      const body = document.createElement('div');
      body.className = 'player-more-grid-v261';

      extraFields.forEach((field) => body.appendChild(field));
      details.append(summary, body);
      basics.insertAdjacentElement('afterend', details);

      ['realTeam', 'playerAge', 'playerEligible'].forEach((id) => {
        el(id)?.addEventListener('input', updatePlayerMoreDetailsSummaryV261);
        el(id)?.addEventListener('change', updatePlayerMoreDetailsSummaryV261);
      });
    }
  }

  const quickContract = dialog.querySelector('.quick-contract');
  const quickHead = quickContract?.querySelector('.quick-contract-head');
  if (quickHead) {
    const title = quickHead.querySelector('h4');
    const copy = quickHead.querySelector('p:not(.eyebrow)');
    if (title) title.textContent = 'Contract';
    if (copy) copy.textContent = 'Salary and term first. Use the optional controls only when needed.';
  }

  const quickGrid = quickContract?.querySelector('.quick-contract-grid-v19');
  if (quickGrid) {
    quickGrid.classList.add('quick-contract-grid-v261');

    const modeLabel = playerEditorLabelFor('salaryChangeMode');
    const pctLabel = el('salaryChangePctLabel');
    const contractThrough = quickGrid.querySelector('.contract-through-field');

    if (modeLabel && pctLabel && !el('salaryChangeDetailsV261')) {
      const details = document.createElement('details');
      details.id = 'salaryChangeDetailsV261';
      details.className = 'player-disclosure-v261 salary-change-details-v261';

      const summary = document.createElement('summary');
      summary.innerHTML = `
        <span>Annual salary change</span>
        <small id="salaryChangeSummaryV261">Optional</small>
      `;

      const body = document.createElement('div');
      body.className = 'salary-change-grid-v261';
      body.append(modeLabel, pctLabel);
      details.append(summary, body);

      if (contractThrough) contractThrough.insertAdjacentElement('afterend', details);
      else quickGrid.appendChild(details);

      el('salaryChangeMode')?.addEventListener('change', updateSalaryChangeSummaryV261);
      el('salaryChangePct')?.addEventListener('input', updateSalaryChangeSummaryV261);
      el('salaryChangePct')?.addEventListener('change', updateSalaryChangeSummaryV261);
    }

    const action = quickGrid.querySelector('.quick-contract-action');
    if (action) {
      const button = action.querySelector('#applyQuickContractBtn');
      const helper = action.querySelector('small');
      if (button) button.textContent = 'Apply contract years';
      if (helper) helper.textContent = 'Applies from the current season. Percentage changes compound year to year.';
    }
  }

  const advanced = el('advancedContract');
  const advancedSummary = advanced?.querySelector('summary');
  if (advancedSummary) advancedSummary.textContent = 'Year-by-year salaries & cap overrides';

  const notesSection = dialog.querySelector('.player-notes-section');
  const notesLabel = playerEditorLabelFor('playerNotes');
  if (notesSection && notesLabel && !el('playerNotesDetailsV261')) {
    const details = document.createElement('details');
    details.id = 'playerNotesDetailsV261';
    details.className = 'player-disclosure-v261 player-notes-details-v261';

    const summary = document.createElement('summary');
    summary.innerHTML = `
      <span>Notes</span>
      <small id="playerNotesSummaryV261">Optional</small>
    `;

    const body = document.createElement('div');
    body.className = 'player-notes-body-v261';
    body.appendChild(notesLabel);
    details.append(summary, body);

    notesSection.replaceChildren(details);

    el('playerNotes')?.addEventListener('input', updatePlayerNotesSummaryV261);
  }

  const closeOrCancel = [el('closePlayerDialog'), el('cancelPlayerBtn')].filter(Boolean);
  closeOrCancel.forEach((button) => {
    button.addEventListener('click', (event) => {
      const dirty = typeof playerFormDirty !== 'undefined' && playerFormDirty;
      if (!dirty) return;

      if (!confirm('Discard unsaved player changes?')) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }, true);
  });

  dialog.addEventListener('cancel', (event) => {
    const dirty = typeof playerFormDirty !== 'undefined' && playerFormDirty;
    if (!dirty) return;
    if (!confirm('Discard unsaved player changes?')) event.preventDefault();
  });

  updatePlayerMoreDetailsSummaryV261();
  updatePlayerNotesSummaryV261();
  updateSalaryChangeSummaryV261();
}

function syncPlayerEditorPolishState(playerId = null) {
  ensurePlayerEditorPolishStructure();

  const player = playerId
    ? state.players.find((item) => item.id === playerId)
    : null;

  const more = el('playerMoreDetailsV261');
  if (more) more.open = false;

  const notes = el('playerNotesDetailsV261');
  if (notes) notes.open = Boolean(player?.notes?.trim());

  const salaryChange = el('salaryChangeDetailsV261');
  if (salaryChange) salaryChange.open = el('salaryChangeMode')?.value !== 'same';

  const intro = el('playerDialogIntro');
  if (intro) {
    intro.textContent = player
      ? 'Update roster details and contract.'
      : 'Add roster details and contract.';
  }

  updatePlayerMoreDetailsSummaryV261();
  updatePlayerNotesSummaryV261();
  updateSalaryChangeSummaryV261();
}

function installPlayerEditorPolish() {
  if (playerEditorPolishInstalled) return;
  playerEditorPolishInstalled = true;

  ensurePlayerEditorPolishStructure();

  if (typeof openPlayerDialog === 'function') {
    const originalOpenPlayerDialogV261 = openPlayerDialog;
    openPlayerDialog = function(playerId = null) {
      const result = originalOpenPlayerDialogV261(playerId);
      syncPlayerEditorPolishState(playerId);
      return result;
    };
  }

  if (typeof updateQuickContractControls === 'function') {
    const originalUpdateQuickContractControlsV261 = updateQuickContractControls;
    updateQuickContractControls = function() {
      const result = originalUpdateQuickContractControlsV261();
      updateSalaryChangeSummaryV261();
      return result;
    };
  }
}


// Bootstrap only after every shared/page/feature file above has loaded.
init();
