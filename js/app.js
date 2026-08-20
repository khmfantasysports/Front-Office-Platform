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

  const accountDivider = popover.querySelector('.utility-menu-divider');
  const insertBefore = accountDivider || null;

  const label = document.createElement('span');
  label.className = 'utility-menu-section-label mobile-workspace-nav-only';
  label.dataset.mobileWorkspaceNav = 'label';
  label.textContent = 'More';

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

  popover.insertBefore(label, insertBefore);
  popover.insertBefore(transactionsButton, insertBefore);
  popover.insertBefore(settingsButton, insertBefore);
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


// Bootstrap only after every shared/page/feature file above has loaded.
init();
