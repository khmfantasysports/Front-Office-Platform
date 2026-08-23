'use strict';

// Application bootstrap, global shell/navigation and top-level rendering.
// V2.81: shell/navigation remains owned here. Sport-specific presentation
// labels are applied after page render; sport-foundation supplies configuration.

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
  installTransactionEditorPolish();
  installCapControlsPolish();
  installTransactionModalFitPolish();
  installTransactionModalWidthFix();
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


function workspaceNavigationSportConfig() {
  const sport =
    state?.frontOffice?.sport
    || el('sport')?.value
    || 'NHL';

  return window.RosterCapSports?.get?.(sport) || null;
}

function workspaceSportCodeV281() {
  return workspaceNavigationSportConfig()?.code || state?.frontOffice?.sport || 'NHL';
}

function workspaceDevelopmentLabelV281() {
  return window.RosterCapTerminology?.developmentLabel?.() || 'Minors';
}

function workspaceTeamLabelV281() {
  return workspaceNavigationSportConfig()?.player?.teamLabel || `${workspaceSportCodeV281()} team`;
}

function setLabelLeadingTextV281(control, text) {
  const label = control?.closest('label');
  if (!label) return;

  const node = [...label.childNodes].find(
    (item) => item.nodeType === Node.TEXT_NODE && item.textContent.trim()
  );

  if (node) node.textContent = `${text}`;
}

function replaceGeneratedTextV281(root, fromText, toText) {
  if (!root || !fromText || fromText === toText) return;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);

  nodes.forEach((node) => {
    const parent = node.parentElement;
    if (!parent || parent.closest('[contenteditable="true"]')) return;
    if (['INPUT','TEXTAREA','OPTION'].includes(parent.tagName)) return;
    if (node.textContent.includes(fromText)) {
      node.textContent = node.textContent.split(fromText).join(toText);
    }
  });
}

function syncRosterSportTerminologyV281() {
  const root = el('rosterView');
  if (!root) return;

  const sport = workspaceSportCodeV281();
  const development = workspaceDevelopmentLabelV281();
  const isNhl = sport === 'NHL';

  const summaryCards = root.querySelectorAll('.roster-summary-grid-v252 > div');
  const developmentCardLabel = summaryCards[1]?.querySelector('span');
  if (developmentCardLabel) developmentCardLabel.textContent = development;

  const teamFilter = el('rosterTeamFilter');
  if (teamFilter) setLabelLeadingTextV281(teamFilter, `${sport} team`);

  root.querySelectorAll('th.col-team').forEach((header) => {
    header.textContent = sport;
  });

  const importButton = el('importRosterBtn');
  if (importButton) {
    importButton.textContent = isNhl ? 'Import Fantrax / CSV' : 'Import coming soon';
    importButton.disabled = !isNhl;
    importButton.title = isNhl ? '' : `${sport} import adapters are still being built.`;
  }

  const fantraxFilter = el('rosterFantraxFilter')?.closest('label');
  if (fantraxFilter) fantraxFilter.classList.toggle('hidden', !isNhl);

  const emptyCopy = root.querySelector('.empty-state p');
  if (emptyCopy && !isNhl && /Fantrax/i.test(emptyCopy.textContent)) {
    emptyCopy.textContent = 'Use Add Player above. Sport-specific roster import is coming soon.';
  }
}

function syncSettingsSportTerminologyV281() {
  const root = el('settingsView');
  if (!root) return;

  const development = workspaceDevelopmentLabelV281();
  replaceGeneratedTextV281(root, 'Minors', development);

  root.querySelectorAll('.settings-card-copy').forEach((copy) => {
    copy.textContent = copy.textContent.replace(
      'These are league settings, not NHL rules.',
      'These are league settings, not sport defaults.'
    );
  });
}


function workspaceNavigationLabels() {
  const developmentLabel = workspaceDevelopmentLabelV281();

  return {
    overview: 'Overview',
    roster: 'Roster',
    farm: developmentLabel,
    assets: 'Assets',
    cap: 'Cap',
    transactions: 'Transactions',
    settings: 'Settings'
  };
}

function syncWorkspaceNavigation(view = activeView) {
  const labels = workspaceNavigationLabels();
  const nextView = WORKSPACE_VIEWS.includes(view) ? view : 'overview';

  document.querySelectorAll('#workspaceNav .nav-tab[data-view]').forEach((button) => {
    const buttonView = button.dataset.view;
    const nextLabel = labels[buttonView] || button.textContent.trim() || buttonView;

    if (button.textContent !== nextLabel) {
      button.textContent = nextLabel;
    }

    button.classList.toggle('active', buttonView === nextView);
  });

  const select = el('workspacePageSelect');
  if (!select) return;

  [...select.options].forEach((option) => {
    const nextLabel = labels[option.value] || option.textContent;
    if (option.textContent !== nextLabel) {
      option.textContent = nextLabel;
    }
  });

  const hasCurrentOption = [...select.options].some(
    (option) => option.value === nextView
  );

  if (hasCurrentOption) {
    select.value = nextView;
  } else {
    // Settings intentionally lives in the utility menu rather than Page nav.
    select.value = '';
  }

  const selectedLabel = hasCurrentOption
    ? (
        select.options[select.selectedIndex]?.textContent
        || labels[nextView]
        || 'Overview'
      )
    : 'Pages';

  select.setAttribute(
    'aria-label',
    nextView === 'settings'
      ? 'Workspace pages. Settings is open from the workspace menu.'
      : `Workspace page: ${selectedLabel}`
  );

  const settingsMenuButton = el('settingsMenuBtn');
  settingsMenuButton?.classList.toggle('active', nextView === 'settings');

  if (settingsMenuButton) {
    if (nextView === 'settings') {
      settingsMenuButton.setAttribute('aria-current', 'page');
    } else {
      settingsMenuButton.removeAttribute('aria-current');
    }
  }
}

function installResponsiveWorkspaceNav() {
  const select = el('workspacePageSelect');
  if (!select || select.dataset.navBound === 'true') return;

  select.dataset.navBound = 'true';
  select.addEventListener('change', () => {
    switchView(select.value);
  });

  syncWorkspaceNavigation(activeView);
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

  installResponsiveWorkspaceNav();

  document.querySelectorAll('#workspaceNav .nav-tab[data-view]').forEach((button) => {
    button.addEventListener('click', () => switchView(button.dataset.view));
  });

  el('settingsMenuBtn')?.addEventListener('click', () => {
    switchView('settings');
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

  const sport = el('sport').value;
  const currentSeason = el('currentSeason').value.trim();

  const configuredSeason =
    window.RosterCapLeagueConfig?.parseSeasonInput?.(currentSeason, sport);

  const startYear =
    configuredSeason?.startYear
    ?? parseSeasonStart(currentSeason);

  if (!startYear) {
    alert(
      window.RosterCapLeagueConfig?.seasonInputHelp?.(sport)
      || 'Use a valid season.'
    );
    return;
  }

  const configuredSeasonCount =
    window.RosterCapLeagueConfig?.creationSeasonCount?.(sport);

  const selectedPositions =
    window.RosterCapPositionConfig?.selectedCreatePositions?.()
    || [];

  if (!selectedPositions.length) {
    alert('Choose at least one player position for this Front Office.');
    return;
  }

  await runCloudAction(async () => {
    const { data, error } = await db.rpc('create_front_office_with_seasons_v1', {
      p_team_name: el('teamName').value.trim(),
      p_league_name: el('leagueName').value.trim(),
      p_sport: sport,
      p_currency_code: el('currency').value,
      p_roster_limit: nullableNumber(el('rosterLimit').value),
      p_current_season_start_year: startYear,
      p_current_salary_cap: nullableNumber(el('salaryCap').value),
      p_season_count: configuredSeasonCount ?? 7
    });
    if (error) throw error;

    const { error: positionError } = await db.rpc(
      'save_front_office_position_options_v1',
      {
        p_front_office_id: data,
        p_position_codes: selectedPositions
      }
    );
    if (positionError) throw positionError;

    const developmentLabel =
      window.RosterCapTerminology?.selectedCreateDevelopmentLabel?.()
      || 'Minors';

    const { error: labelError } = await db.rpc(
      'save_front_office_development_label_v1',
      {
        p_front_office_id: data,
        p_display_name: developmentLabel
      }
    );
    if (labelError) throw labelError;

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
  syncWorkspaceNavigation(activeView);
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
  updateRosterBackupExportLabels();
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

  syncWorkspaceNavigation(nextView);

  WORKSPACE_VIEWS.forEach((name) =>
    el(`${name}View`).classList.toggle('hidden', name !== nextView)
  );

  const utilityMenu = document.querySelector('.utility-menu');
  const utilitySummary = utilityMenu?.querySelector('summary');

  utilityMenu?.classList.remove('workspace-secondary-active');
  if (utilitySummary) utilitySummary.setAttribute('aria-label', 'Workspace menu');
  if (utilityMenu?.open) utilityMenu.removeAttribute('open');

  el('summaryCards').classList.add('hidden');
  if (options.persist !== false) persistWorkspaceResumeState();
}

function resetApp() {
  showOfficePicker();
}

const ROSTERCAP_ROSTER_BACKUP_VERSION = 'ROSTERCAP_ROSTER_BACKUP_V1';

function rosterBackupDepthAssignments(playerId) {
  const assignments = [];

  Object.entries(state.depthCharts || {}).forEach(([position, playerIds]) => {
    (playerIds || []).forEach((id, index) => {
      if (id === playerId) assignments.push(`${position}:${index + 1}`);
    });
  });

  return assignments.join('|');
}

function exportRosterCsv() {
  if (!state.frontOffice) return;

  const sortedSeasons = [...state.seasons].sort((a,b) => a.startYear - b.startYear);
  const generatedAt = new Date().toISOString();

  const headers = [
    'RosterCap Backup Version',
    'Backup Generated At',
    'Backup Team',
    'Backup League',
    'RosterCap Player ID',
    'Fantrax ID',
    'Player',
    'Pos',
    'Eligible',
    'NHL Team',
    'Age',
    'Age As Of',
    'Status',
    'Prospect',
    'Roster Location',
    ...sortedSeasons.flatMap((season) => [
      `${seasonLabel(season.startYear)} Salary`,
      `${seasonLabel(season.startYear)} Cap Override`
    ]),
    'Contract End',
    'Depth Assignments',
    'Notes'
  ];

  const rows = state.players.map((player) => [
    ROSTERCAP_ROSTER_BACKUP_VERSION,
    generatedAt,
    state.frontOffice.teamName || '',
    state.frontOffice.leagueName || '',
    player.id || '',
    player.fantraxId || '',
    player.name,
    player.position,
    player.eligiblePositions || player.position || '',
    player.realTeam || '',
    player.ageSnapshot ?? '',
    player.ageAsOf || '',
    statusById(player.statusId)?.name || '',
    player.isProspect ? 'Yes' : 'No',
    player.rosterGroup === 'FARM' ? 'Minors' : 'Active',
    ...sortedSeasons.flatMap((season) => {
      const row = player.salaries?.[season.id] || {};
      return [row.salary ?? '', row.capOverride ?? ''];
    }),
    player.contractEndSeasonId
      ? seasonLabel(seasonById(player.contractEndSeasonId)?.startYear)
      : '',
    rosterBackupDepthAssignments(player.id),
    player.notes || ''
  ]);

  const csv = [headers, ...rows]
    .map((row) => row.map(csvEscape).join(','))
    .join('\n');

  downloadText(
    `${safeFileName(state.frontOffice.teamName)}-rostercap-roster-backup-${todayIsoDate()}.csv`,
    csv,
    'text/csv'
  );
}

function updateRosterBackupExportLabels() {
  const utilityExport = el('exportBtn');
  if (utilityExport) utilityExport.textContent = 'Roster Backup CSV';

  const rosterExport = el('rosterExportBtn');
  if (rosterExport) rosterExport.textContent = 'Roster Backup CSV';
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

  const totalTransactions = (state.transactions || []).length;

  // An "All 0" filter adds visual weight without offering any action.
  // The empty state is enough until the first transaction exists.
  if (!totalTransactions) {
    transactionHistoryFilter = 'ALL';
    return;
  }

  const counts = transactionHistoryTypeCounts();
  const types = transactionHistoryTypes();

  if (
    transactionHistoryFilter !== 'ALL'
    && !counts.has(transactionHistoryFilter)
  ) {
    transactionHistoryFilter = 'ALL';
  }

  const toolbar = document.createElement('div');
  toolbar.className = 'tx-history-toolbar-v259 tx-history-toolbar-v294';

  const filters = document.createElement('div');
  filters.className = 'tx-history-filters-v259';
  filters.setAttribute('role', 'group');
  filters.setAttribute('aria-label', 'Filter transaction history');

  const filterTypes = ['ALL', ...types];
  filterTypes.forEach((type) => {
    const count = type === 'ALL'
      ? totalTransactions
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

  page.classList.add('transactions-page-v294');

  const heading = page.querySelector('.tx-page-heading-v228');
  heading?.classList.add('tx-page-heading-v294');

  const copy = heading?.querySelector('.page-copy');
  if (copy) {
    copy.textContent =
      'Trades, signings and roster moves in one chronological history.';
  }

  const recordButton = page.querySelector('#recordTransactionBtn');
  if (recordButton) {
    recordButton.textContent = '+ Record';
    recordButton.title = 'Record Transaction';
    recordButton.setAttribute('aria-label', 'Record Transaction');
  }

  const cards = [...page.querySelectorAll('.transaction-card-v228')];

  page.classList.toggle('has-transaction-history-v294', cards.length > 0);
  page.classList.toggle('empty-transaction-history-v294', cards.length === 0);

  cards.forEach((card) => {
    const tx = transactionHistoryCardTransaction(card);
    if (!tx) return;

    card.dataset.historyType = tx.type || 'Other';
    card.classList.add('transaction-card-v294');
    moveTransactionHistoryActions(card);
    removeRedundantTransactionPlayerRow(card, tx);
  });

  const emptyState = page.querySelector('.empty-state');
  if (emptyState && !cards.length) {
    emptyState.classList.add('tx-empty-state-v294');

    const title = emptyState.querySelector('h4');
    if (title) title.textContent = 'No transactions yet';

    const emptyCopy = emptyState.querySelector('p');
    if (emptyCopy) {
      emptyCopy.textContent =
        'Record a trade, signing, waiver, buyout, call-up or other roster move.';
    }
  }

  renderTransactionHistoryFilterBar(page);

  if (cards.length) {
    applyTransactionHistoryFilter();
  }
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

function normalizeFarmPositionCodeV292(value) {
  return String(value || '').trim().toUpperCase();
}

function farmPlayerPositionCodesV292(player) {
  return [...new Set([
    normalizeFarmPositionCodeV292(player?.position),
    ...String(player?.eligiblePositions || '')
      .split(/[,;/|]+/)
      .map(normalizeFarmPositionCodeV292)
      .filter(Boolean)
  ].filter(Boolean))];
}

function farmPositionOrderV292() {
  const sport = workspaceSportCodeV281();
  const configured = (
    window.RosterCapPositionConfig?.active?.()
    || []
  )
    .map(normalizeFarmPositionCodeV292)
    .filter(Boolean);

  if (sport === 'NHL') {
    // Keep the classic five hockey columns together. On mobile the final
    // Defense / Goalie columns are reached by horizontal swipe.
    return ['LW','C','RW','D','G'];
  }

  if (configured.length) {
    return [...new Set(configured)];
  }

  return [...new Set(
    (state.players || [])
      .filter((player) => player.rosterGroup === 'FARM')
      .map((player) => normalizeFarmPositionCodeV292(player.position))
      .filter(Boolean)
  )];
}

function farmCardPlayerV292(card) {
  if (!card) return null;

  const cardName = String(
    card.querySelector('.farm-player-copy-v228 strong')?.textContent
    || card.querySelector('strong')?.textContent
    || ''
  ).trim();

  if (!cardName) return null;

  const normalizedName = cardName.toLocaleLowerCase();

  return (state.players || []).find((player) =>
    player.rosterGroup === 'FARM'
    && String(player.name || '').trim().toLocaleLowerCase() === normalizedName
  ) || null;
}

function farmPlayerColumnV292(player, positions) {
  if (!player) return 'OTHER';

  const primary = normalizeFarmPositionCodeV292(player.position);

  if (positions.includes(primary)) return primary;

  const eligible = farmPlayerPositionCodesV292(player);
  return eligible.find((code) => positions.includes(code)) || 'OTHER';
}

function farmPlayerAgeLabelV2982(player) {
  const rawAge = player?.ageSnapshot;

  if (
    rawAge === null
    || rawAge === undefined
    || String(rawAge).trim() === ''
  ) {
    return 'Age —';
  }

  const age = Number(rawAge);
  if (!Number.isFinite(age) || age < 0) return 'Age —';

  return `Age ${Math.round(age)}`;
}

function farmPlayerContractExpiryLabelV2982(player) {
  if (!player?.contractEndSeasonId) return 'No end set';

  const endSeason = (state?.seasons || []).find(
    (season) => season.id === player.contractEndSeasonId
  );

  if (!endSeason?.startYear) return 'No end set';

  return `Expires ${seasonLabel(endSeason.startYear)}`;
}

function decorateFarmPlayerDetailsV2982(card, player) {
  if (!card || !player) return;

  const copy = card.querySelector('.farm-player-copy-v228');
  if (!copy) return;

  let age = copy.querySelector('.farm-player-age-v2982');

  if (!age) {
    age = document.createElement('span');
    age.className = 'farm-player-age-v2982';

    const contractLine = copy.querySelector('em');
    if (contractLine) copy.insertBefore(age, contractLine);
    else copy.appendChild(age);
  }

  age.textContent = farmPlayerAgeLabelV2982(player);

  let contractLine = copy.querySelector('em');

  if (!contractLine) {
    contractLine = document.createElement('em');
    copy.appendChild(contractLine);
  }

  contractLine.classList.add('farm-player-contract-v2982');
  contractLine.textContent = farmPlayerContractExpiryLabelV2982(player);
}

function renderFarmDepthBoardV292(page) {
  const lists = [...page.querySelectorAll('.farm-player-list-v228')];
  const list =
    lists.find((candidate) => candidate.querySelector('[data-call-up]'))
    || lists[0]
    || null;

  if (!list || list.closest('.farm-depth-board-v292')) return;

  const panel = list.closest('.farm-panel-v228') || list.parentElement;
  if (!panel) return;

  const cards = [...list.querySelectorAll('.farm-player-card-v228')];

  cards.forEach((card) => {
    const player = farmCardPlayerV292(card);
    decorateFarmPlayerDetailsV2982(card, player);
  });

  const positions = farmPositionOrderV292();

  if (!positions.length) return;

  const assignedByPosition = new Map(
    positions.map((position) => [position, []])
  );
  const otherCards = [];

  cards.forEach((card) => {
    const player = farmCardPlayerV292(card);
    const column = farmPlayerColumnV292(player, positions);

    if (assignedByPosition.has(column)) {
      assignedByPosition.get(column).push(card);
    } else {
      otherCards.push(card);
    }
  });

  const renderedPositions = [...positions];
  if (otherCards.length) renderedPositions.push('OTHER');

  const scroll = document.createElement('div');
  scroll.className = 'farm-depth-scroll-v292';

  const board = document.createElement('div');
  board.className = 'farm-depth-board-v292';
  board.style.setProperty(
    '--farm-depth-columns',
    String(Math.max(1, renderedPositions.length))
  );

  renderedPositions.forEach((position) => {
    const columnCards =
      position === 'OTHER'
        ? otherCards
        : assignedByPosition.get(position) || [];

    const column = document.createElement('section');
    column.className = 'farm-depth-column-v292';
    column.dataset.farmDepthPosition = position;

    const header = document.createElement('div');
    header.className = 'farm-depth-column-head-v292';
    header.innerHTML = `
      <strong>${escapeHtml(position === 'OTHER' ? 'Other' : position)}</strong>
      <span>${columnCards.length}</span>
    `;

    const stack = document.createElement('div');
    stack.className = 'farm-depth-stack-v292';

    if (!columnCards.length) {
      const empty = document.createElement('div');
      empty.className = 'farm-depth-empty-v292';
      empty.textContent = 'No players';
      stack.appendChild(empty);
    } else {
      columnCards.forEach((card, index) => {
        card.classList.add('farm-depth-player-card-v292');

        const existingRank = card.querySelector('.farm-depth-rank-v292');
        existingRank?.remove();

        const rank = document.createElement('span');
        rank.className = 'farm-depth-rank-v292';
        rank.textContent = `Depth ${index + 1}`;
        card.prepend(rank);

        stack.appendChild(card);
      });
    }

    column.append(header, stack);
    board.appendChild(column);
  });

  scroll.appendChild(board);
  list.replaceWith(scroll);

  panel.classList.add('farm-depth-panel-v292');

  const panelHeading = panel.querySelector('.farm-section-head-v228 h3');
  if (panelHeading) panelHeading.textContent = 'Depth by position';

  const panelEyebrow = panel.querySelector('.farm-section-head-v228 .eyebrow');
  if (panelEyebrow) panelEyebrow.textContent = `${workspaceDevelopmentLabelV281()} roster`;
}

function compactMinorsPageV260() {
  const page = document.querySelector('#farmView .farm-page-v228');
  if (!page) return;

  const development = workspaceDevelopmentLabelV281();
  const sport = workspaceSportCodeV281();
  const isNhl = sport === 'NHL';

  // The development roster and called-up sections already carry their own counts.
  page.querySelector('.farm-summary-grid-v228')?.remove();

  const heading = page.querySelector('.farm-page-heading-v228 h3');
  if (heading) heading.textContent = development;

  const copy = page.querySelector('.farm-page-heading-v228 .page-copy');
  if (copy) {
    copy.textContent =
      `Prospects and ${development} depth, organized by position.`;
  }

  replaceGeneratedTextV281(page, 'Minors', development);
  replaceGeneratedTextV281(page, 'No NHL team', `No ${sport} team`);

  const importButton = page.querySelector('#importMinorsBtn');
  if (importButton) {
    importButton.textContent = isNhl ? 'Import Fantrax' : 'Import coming soon';
    importButton.disabled = !isNhl;
    importButton.title = isNhl ? '' : `${sport} import adapters are still being built.`;
  }

  page.querySelectorAll('.farm-player-card-v228').forEach((card) => {
    const player = farmCardPlayerV292(card);
    decorateFarmPlayerDetailsV2982(card, player);
  });

  page.classList.add('farm-page-v260', 'farm-page-v292', 'farm-page-v2982');
  renderFarmDepthBoardV292(page);
}

function decorateAssetsEmptyStateV292(page) {
  const title = [...page.querySelectorAll('h2,h3,h4,strong')]
    .find((element) =>
      element.textContent.trim().toLocaleLowerCase() === 'no assets tracked'
    );

  if (!title) return;

  const empty =
    title.closest('.empty-state')
    || title.parentElement;

  if (!empty) return;

  empty.classList.add('asset-empty-state-v292');

  const copy =
    empty.querySelector('p')
    || title.nextElementSibling;

  if (copy && copy !== title) {
    copy.textContent =
      'Draft picks, rights and other future assets will appear here.';
  }
}

function compactAssetsPageV260() {
  const page = document.querySelector('#assetsView .assets-page-v230, #assetsView .assets-page-v228, #assetsView .assets-page');
  if (!page) return;

  const summary = page.querySelector('.asset-summary-grid-v230, .asset-summary-grid-v228, .asset-summary-strip');
  summary?.remove();

  const hero = page.querySelector('.asset-hero-v230');
  hero?.classList.add('asset-hero-v292');

  const copy = page.querySelector('.asset-hero-copy-v230 p:last-child');
  if (copy) copy.textContent = 'Draft picks, rights and future assets.';

  page.querySelectorAll('.asset-tab').forEach((button) => {
    if (!button.querySelector('.asset-tab-count-v260')) {
      const count = assetTabCountV260(button.textContent);

      if (count !== null) {
        const badge = document.createElement('strong');
        badge.className = 'asset-tab-count-v260';
        badge.textContent = String(count);
        button.appendChild(badge);
      }
    }

    button.classList.add('asset-tab-v292');
  });

  page
    .querySelector('.asset-portfolio-panel-v230, .asset-portfolio-panel-v228')
    ?.classList.add('asset-portfolio-v292');

  page.querySelectorAll('.asset-grid').forEach((grid) => {
    grid.classList.add('asset-grid-v292');
  });

  page.querySelectorAll('.asset-card').forEach((card) => {
    card.classList.add('asset-card-v292', 'asset-card-v297');
  });

  // V2.97 — the Asset Manager's second filter rail is useful only when the
  // current category contains more than one lifecycle status. For example,
  // if every Draft Pick is Owned, showing "All 1 / Owned 1" is redundant.
  const statusRail = page.querySelector('#assetStatusRailV270');
  const statusEmpty = page.querySelector('#assetStatusEmptyV270');

  if (statusRail) {
    const concreteStatusButtons = [
      ...statusRail.querySelectorAll('[data-asset-status-v270]')
    ].filter((button) => button.dataset.assetStatusV270 !== 'ALL');

    if (concreteStatusButtons.length <= 1) {
      if (typeof assetStatusFilterV270 !== 'undefined') {
        assetStatusFilterV270 = 'ALL';
      }

      statusRail.remove();
      statusEmpty?.remove();

      if (typeof applyAssetStatusFilterV270 === 'function') {
        applyAssetStatusFilterV270();
      }
    } else {
      statusRail.classList.add('asset-status-rail-v297');
    }
  }

  page.querySelectorAll('.asset-year-group-v230').forEach((group) => {
    group.classList.add('asset-year-group-v297');
  });

  page.querySelectorAll('.asset-year-label-v230').forEach((label) => {
    label.classList.add('asset-year-label-v297');
  });

  page.querySelectorAll('.asset-section-head-v230').forEach((head) => {
    head.classList.add('asset-section-head-v297');
  });

  decorateAssetsEmptyStateV292(page);

  page.classList.add('assets-page-v260', 'assets-page-v292', 'assets-page-v297');
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

function ensureDevelopmentLabelSettingV283() {
  const section = document.querySelector(
    '#settingsView details[data-settings-section="team-league"] .settings-fields'
  );
  if (!section || section.querySelector('[data-office-development-label]')) return;

  const label = document.createElement('label');
  label.className = 'settings-development-label-v283';
  label.textContent = 'Minors / secondary roster name';

  const input = document.createElement('input');
  input.type = 'text';
  input.maxLength = 80;
  input.value = workspaceDevelopmentLabelV281();
  input.placeholder = 'Minors';
  input.setAttribute('data-office-development-label', 'true');

  label.appendChild(input);
  section.appendChild(label);

  input.addEventListener('change', async () => {
    const value = String(input.value || '').trim() || 'Minors';

    const success = await saveSettingsChange('team-league', async () => {
      const { error } = await db.rpc(
        'save_front_office_development_label_v1',
        {
          p_front_office_id: state.frontOffice.id,
          p_display_name: value
        }
      );
      if (error) throw error;

      const developmentGroup = (state.rosterGroups || []).find((group) =>
        group?.isDevelopment
        || String(group?.key || '').toUpperCase() === 'FARM'
      );
      if (developmentGroup) developmentGroup.displayName = value;
    });

    if (!success) {
      input.value = workspaceDevelopmentLabelV281();
      return;
    }

    syncWorkspaceNavigation(activeView);
    renderSettings();
  });
}

function positionEditorSelectedCodesV285(container) {
  return [...container.querySelectorAll(
    'input[type="checkbox"][data-settings-position-code]'
  )]
    .filter((input) => input.checked)
    .map((input) => String(input.dataset.settingsPositionCode || '').trim().toUpperCase())
    .filter(Boolean);
}

function positionEditorUsageV285(codes) {
  return (codes || [])
    .map((code) => ({
      code,
      count:(state.players || []).filter(
        (player) => String(player.position || '').trim().toUpperCase() === code
      ).length
    }))
    .filter((item) => item.count > 0);
}

function syncPositionEditorSummaryV285(editor) {
  if (!editor) return;

  const selected = positionEditorSelectedCodesV285(editor);
  const count = editor.querySelector('[data-position-settings-count]');
  const warning = editor.querySelector('[data-position-settings-warning]');
  const current = window.RosterCapPositionConfig?.active?.() || [];
  const selectedSet = new Set(selected);
  const removed = current.filter((code) => !selectedSet.has(code));
  const usage = positionEditorUsageV285(removed);

  if (count) {
    count.textContent = `${selected.length} position${selected.length === 1 ? '' : 's'} selected`;
    count.classList.toggle('warning', selected.length === 0);
  }

  if (warning) {
    if (!usage.length) {
      warning.classList.add('hidden');
      warning.textContent = '';
    } else {
      warning.classList.remove('hidden');
      warning.textContent =
        `Removing ${usage.map((item) => `${item.code} (${item.count})`).join(', ')} will not change those players. Their saved positions are preserved.`;
    }
  }
}

async function savePositionSettingsV285(editor) {
  if (!editor || !state.frontOffice) return;

  const rawSelected = positionEditorSelectedCodesV285(editor);
  if (!rawSelected.length) {
    alert('Choose at least one player position.');
    return;
  }

  const ordered = window.RosterCapPositionConfig?.orderedSelection?.(
    rawSelected,
    state.frontOffice.sport
  ) || rawSelected;

  const current = window.RosterCapPositionConfig?.active?.() || [];
  const selectedSet = new Set(ordered);
  const removed = current.filter((code) => !selectedSet.has(code));
  const usage = positionEditorUsageV285(removed);

  if (usage.length) {
    const affected = usage.reduce((sum, item) => sum + item.count, 0);
    const proceed = confirm(
      `${affected} current player${affected === 1 ? '' : 's'} use a position you are turning off.\n\n`
      + `Their player records will NOT be changed. The removed position will stop appearing in Add Player and Depth.\n\nContinue?`
    );
    if (!proceed) return;
  }

  const saveButton = editor.querySelector('[data-save-position-settings]');
  if (saveButton?.disabled) return;

  if (saveButton) {
    saveButton.disabled = true;
    saveButton.textContent = 'Saving…';
  }

  try {
    const success = await saveSettingsChange('team-league', async () => {
      const { error } = await db.rpc('save_front_office_position_options_v1', {
        p_front_office_id: state.frontOffice.id,
        p_position_codes: ordered
      });
      if (error) throw error;

      const existing = new Map(
        (state.positionOptions || []).map((row) => [
          String(row.code || '').trim().toUpperCase(),
          row
        ])
      );

      state.positionOptions = ordered.map((code, index) => ({
        ...(existing.get(code) || {}),
        code,
        sortOrder:(index + 1) * 10,
        isActive:true
      }));
    });

    if (!success) return;

    if (typeof depthPosition !== 'undefined') {
      const active = new Set(ordered);
      if (depthPosition !== 'ALL' && !active.has(depthPosition)) {
        depthPosition = 'ALL';
      }
    }

    if (typeof syncPlayerEditorForSportV279 === 'function') {
      syncPlayerEditorForSportV279({
        preserveCurrent:Boolean(typeof editingPlayerId !== 'undefined' && editingPlayerId)
      });
    }

    renderRoster();
    renderSettings();
  } finally {
    const currentButton = document.querySelector(
      '#settingsView [data-save-position-settings]'
    );
    if (currentButton) {
      currentButton.disabled = false;
      currentButton.textContent = 'Save positions';
    }
  }
}

function ensurePositionSettingsEditorV285() {
  const page = document.querySelector('#settingsView .settings-accordion');
  if (!page || page.querySelector('[data-settings-position-editor]')) return;

  const sport = state.frontOffice?.sport || 'NHL';
  const available = window.RosterCapPositionConfig?.available?.(sport) || [];
  const active = window.RosterCapPositionConfig?.active?.() || [];
  const activeSet = new Set(active);

  const details = document.createElement('details');
  details.className = 'settings-disclosure settings-position-editor-v285';
  details.dataset.settingsPositionEditor = 'true';

  details.innerHTML = `
    <summary>
      <span class="settings-disclosure-title">
        <strong>Player Positions</strong>
        <span>Choose which positions this Front Office uses.</span>
      </span>
    </summary>
    <div class="settings-disclosure-body">
      <div class="settings-position-editor-head-v285">
        <div>
          <strong>${escapeHtml(sport)} position catalog</strong>
          <p>Selected positions control Add Player and Depth. Existing player data is never rewritten when a position is turned off.</p>
        </div>
        <span class="position-setup-count-v282" data-position-settings-count></span>
      </div>

      <div class="position-setup-options-v282 settings-position-options-v285">
        ${available.map((code) => `
          <label class="position-choice-v282">
            <input
              type="checkbox"
              data-settings-position-code="${escapeHtml(code)}"
              ${activeSet.has(code) ? 'checked' : ''}
            >
            <span>${escapeHtml(code)}</span>
          </label>
        `).join('')}
      </div>

      <div class="settings-position-warning-v285 hidden" data-position-settings-warning></div>

      <div class="settings-position-order-note-v285">
        Current Depth order:
        <strong>${active.map((code) => escapeHtml(code)).join(' → ') || 'None'}</strong>
        <span>Use Roster → Depth → All → Reorder positions to change the display order.</span>
      </div>

      <div class="settings-position-actions-v285">
        <button class="btn btn-primary" data-save-position-settings type="button">
          Save positions
        </button>
      </div>
    </div>
  `;

  const teamLeague = page.querySelector(
    'details[data-settings-section="team-league"]'
  );

  if (teamLeague) {
    teamLeague.insertAdjacentElement('afterend', details);
  } else {
    page.prepend(details);
  }

  details.addEventListener('change', (event) => {
    if (event.target.matches('[data-settings-position-code]')) {
      syncPositionEditorSummaryV285(details);
    }
  });

  details.querySelector('[data-save-position-settings]')?.addEventListener(
    'click',
    () => savePositionSettingsV285(details)
  );

  syncPositionEditorSummaryV285(details);
}

function compactSettingsPageV260() {
  const page = document.querySelector('#settingsView .settings-accordion');
  if (!page) return;
  syncSettingsSportTerminologyV281();
  ensureDevelopmentLabelSettingV283();
  ensurePositionSettingsEditorV285();
  page.classList.add('settings-accordion-v260');
}

function installWorkspaceDensityPass() {
  if (workspaceDensityPassInstalled) return;
  workspaceDensityPassInstalled = true;

  if (typeof renderRoster === 'function') {
    const originalRenderRosterV281 = renderRoster;
    renderRoster = function() {
      const result = originalRenderRosterV281();
      syncRosterSportTerminologyV281();
      return result;
    };
  }

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
    : `${workspaceTeamLabelV281()} · age · eligibility`;
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
        <small id="playerMoreDetailsSummaryV261">Team · age · eligibility</small>
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



// -----------------------------------------------------------------------------
// V2.62 — Transaction Entry + Cap Controls Polish
// Progressive disclosure and compact controls only. No backend contract changes.
// -----------------------------------------------------------------------------
let transactionEditorPolishInstalled = false;
let transactionFormDirtyV262 = false;
let capControlsPolishInstalled = false;

function transactionFieldLabelV262(id) {
  return el(id)?.closest('label') || el(id) || null;
}

function updateTransactionNotesSummaryV262() {
  const summary = el('transactionNotesSummaryV262');
  if (!summary) return;
  summary.textContent = el('transactionNotes')?.value.trim() ? 'Added' : 'Optional';
}

function updateTransactionAdditionalSummaryV262() {
  const summary = el('transactionAdditionalSummaryV262');
  if (!summary) return;

  const incoming = el('transactionIncoming')?.value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean).length || 0;
  const outgoing = el('transactionOutgoing')?.value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean).length || 0;
  const count = incoming + outgoing;

  summary.textContent = count ? `${count} item${count === 1 ? '' : 's'}` : 'Optional';
}

function syncTransactionEditorDisclosuresV262() {
  const itemsDetails = el('transactionAdditionalItemsV262');
  const incomingField = el('transactionIncomingField');
  const outgoingField = el('transactionOutgoingField');

  if (itemsDetails && incomingField && outgoingField) {
    const hasVisibleField =
      !incomingField.classList.contains('hidden')
      || !outgoingField.classList.contains('hidden');

    itemsDetails.classList.toggle('hidden', !hasVisibleField);

    if (hasVisibleField) {
      const hasItems =
        Boolean(el('transactionIncoming')?.value.trim())
        || Boolean(el('transactionOutgoing')?.value.trim());
      itemsDetails.open = hasItems;
    } else {
      itemsDetails.open = false;
    }
  }

  const notesDetails = el('transactionNotesDetailsV262');
  if (notesDetails) {
    notesDetails.open = Boolean(el('transactionNotes')?.value.trim());
  }

  updateTransactionAdditionalSummaryV262();
  updateTransactionNotesSummaryV262();

  const help = el('transactionTypeHelp');
  if (help) help.classList.toggle('hidden', !help.textContent.trim());

  const financial = el('transactionFinancialSection');
  if (financial) financial.classList.add('transaction-financial-v262');

  const snapshot = el('transactionPlayerSnapshot');
  if (snapshot) snapshot.classList.add('transaction-player-snapshot-v262');
}

function ensureTransactionEditorPolishStructure() {
  const dialog = el('transactionDialog');
  if (!dialog || dialog.dataset.v262TransactionPolish === 'true') return;

  dialog.dataset.v262TransactionPolish = 'true';
  dialog.classList.add('transaction-dialog-v262');

  const body = dialog.querySelector('.transaction-form-body');
  body?.classList.add('transaction-form-body-v262');

  const primaryGrid = body?.querySelector(':scope > .form-grid.compact');
  primaryGrid?.classList.add('transaction-primary-grid-v262');

  // Manual/free-text incoming/outgoing items are useful for generic history,
  // but structured Trade/Draft flows already have their own dedicated editors.
  const incomingField = el('transactionIncomingField');
  const outgoingField = el('transactionOutgoingField');

  if (
    primaryGrid
    && incomingField
    && outgoingField
    && !el('transactionAdditionalItemsV262')
  ) {
    const details = document.createElement('details');
    details.id = 'transactionAdditionalItemsV262';
    details.className = 'transaction-disclosure-v262';

    const summary = document.createElement('summary');
    summary.innerHTML = `
      <span>Additional items</span>
      <small id="transactionAdditionalSummaryV262">Optional</small>
    `;

    const content = document.createElement('div');
    content.className = 'transaction-disclosure-body-v262 transaction-item-fields-v262';
    content.append(incomingField, outgoingField);

    details.append(summary, content);
    primaryGrid.insertAdjacentElement('afterend', details);

    ['transactionIncoming', 'transactionOutgoing'].forEach((id) => {
      el(id)?.addEventListener('input', updateTransactionAdditionalSummaryV262);
    });
  }

  const notes = el('transactionNotes');
  const notesField = notes?.closest('label');

  if (notesField && !el('transactionNotesDetailsV262')) {
    const details = document.createElement('details');
    details.id = 'transactionNotesDetailsV262';
    details.className = 'transaction-disclosure-v262 transaction-notes-v262';

    const summary = document.createElement('summary');
    summary.innerHTML = `
      <span>Notes</span>
      <small id="transactionNotesSummaryV262">Optional</small>
    `;

    const content = document.createElement('div');
    content.className = 'transaction-disclosure-body-v262';
    content.appendChild(notesField);

    details.append(summary, content);

    const additional = el('transactionAdditionalItemsV262');
    if (additional) additional.insertAdjacentElement('afterend', details);
    else primaryGrid?.insertAdjacentElement('afterend', details);

    notes.addEventListener('input', updateTransactionNotesSummaryV262);
  }

  // The form already has all type-specific logic. Dirty tracking only protects
  // against accidentally closing the modal after the user starts editing it.
  const form = el('transactionForm');
  if (form) {
    const markDirty = () => {
      if (dialog.open) transactionFormDirtyV262 = true;
    };
    form.addEventListener('input', markDirty);
    form.addEventListener('change', markDirty);
  }

  [el('closeTransactionDialog'), el('cancelTransactionBtn')]
    .filter(Boolean)
    .forEach((button) => {
      button.addEventListener('click', (event) => {
        if (!transactionFormDirtyV262) return;
        if (!confirm('Discard unsaved transaction changes?')) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
      }, true);
    });

  dialog.addEventListener('cancel', (event) => {
    if (!transactionFormDirtyV262) return;
    if (!confirm('Discard unsaved transaction changes?')) event.preventDefault();
  });

  dialog.addEventListener('close', () => {
    transactionFormDirtyV262 = false;
  });

  syncTransactionEditorDisclosuresV262();
}

function syncTransactionEditorStateV262() {
  ensureTransactionEditorPolishStructure();
  syncTransactionEditorDisclosuresV262();

  const title = el('transactionDialogTitle');
  if (title && !title.textContent.trim()) title.textContent = 'Record transaction';
}

function installTransactionEditorPolish() {
  if (transactionEditorPolishInstalled) return;
  transactionEditorPolishInstalled = true;

  ensureTransactionEditorPolishStructure();

  if (typeof handleTransactionTypeChange === 'function') {
    const originalHandleTransactionTypeChangeV262 = handleTransactionTypeChange;
    handleTransactionTypeChange = function() {
      const result = originalHandleTransactionTypeChangeV262();
      syncTransactionEditorDisclosuresV262();
      return result;
    };
  }

  if (typeof openTransactionDialog === 'function') {
    const originalOpenTransactionDialogV262 = openTransactionDialog;
    openTransactionDialog = function(prefill = {}) {
      ensureTransactionEditorPolishStructure();
      transactionFormDirtyV262 = false;
      const result = originalOpenTransactionDialogV262(prefill);
      syncTransactionEditorStateV262();
      transactionFormDirtyV262 = false;
      return result;
    };
  }

  if (typeof openEditTransactionDialog === 'function') {
    const originalOpenEditTransactionDialogV262 = openEditTransactionDialog;
    openEditTransactionDialog = function(transactionId) {
      ensureTransactionEditorPolishStructure();
      transactionFormDirtyV262 = false;
      const result = originalOpenEditTransactionDialogV262(transactionId);
      syncTransactionEditorStateV262();
      transactionFormDirtyV262 = false;
      return result;
    };
  }
}

function openCapSettingsV262() {
  switchView('settings');

  window.requestAnimationFrame(() => {
    const disclosures = [...document.querySelectorAll('#settingsView details')];
    const salaryCaps = disclosures.find((details) =>
      details.querySelector('summary')?.textContent
        .toLowerCase()
        .includes('salary cap')
    );

    if (!salaryCaps) return;
    salaryCaps.open = true;
    salaryCaps.scrollIntoView({ behavior:'smooth', block:'start' });
  });
}

function capPanelByEyebrowV262(label) {
  return [...document.querySelectorAll('#capView .cap-panel-v228')].find((panel) =>
    panel.querySelector('.eyebrow')?.textContent.trim().toLowerCase()
      === String(label).trim().toLowerCase()
  ) || null;
}

function compactDeadCapPanelV262() {
  const panel = capPanelByEyebrowV262('Dead Cap');
  if (!panel) return;

  const head = panel.querySelector('.cap-section-head-v228');
  const button = el('capRecordTransactionBtn');
  const entries = panel.querySelectorAll('.cap-dead-entry-v228');

  if (button) button.textContent = '+ Transaction';

  if (entries.length === 0) {
    panel.classList.add('cap-dead-zero-v262');

    const copy = head?.querySelector('div');
    if (copy) {
      copy.innerHTML = `
        <p class="eyebrow">Dead Cap</p>
        <strong class="cap-dead-zero-value-v262">No active Dead Cap</strong>
      `;
    }

    panel.querySelector('.cap-empty-v228')?.remove();
    return;
  }

  panel.classList.add('cap-dead-active-v262');

  const copy = head?.querySelector('div');
  if (copy) {
    copy.querySelector('h3')?.remove();
    const paragraph = copy.querySelector('p:not(.eyebrow)');
    paragraph?.classList.add('cap-dead-summary-v262');
  }
}

function compactContractIntelligenceV262() {
  const panel = document.querySelector('#capView .contract-intelligence-panel');
  if (!panel || panel.dataset.v262Compact === 'true') return;

  panel.dataset.v262Compact = 'true';
  panel.classList.add('contract-intelligence-v262');

  const head = panel.querySelector('.contract-intelligence-head');
  if (head) {
    head.querySelector('h3')?.remove();
    head.querySelector('p:not(.eyebrow)')?.remove();
  }

  const columns = panel.querySelector('.contract-intel-columns');
  if (columns && !panel.querySelector('.contract-intel-main-details-v262')) {
    const details = document.createElement('details');
    details.className = 'contract-intel-main-details-v262';

    const summary = document.createElement('summary');
    summary.innerHTML = `
      <span>
        <strong>Charges & future commitments</strong>
        <small>Largest current charges and entered future salary</small>
      </span>
    `;

    const body = document.createElement('div');
    body.className = 'contract-intel-main-body-v262';
    body.appendChild(columns);

    details.append(summary, body);

    const summaryGrid = panel.querySelector('.contract-intel-summary');
    if (summaryGrid) summaryGrid.insertAdjacentElement('afterend', details);
    else panel.appendChild(details);
  }
}

function addCapHeroControlsV262() {
  const heroLimit = document.querySelector('#capView .cap-hero-limit-v228');
  if (!heroLimit || heroLimit.querySelector('.cap-edit-settings-v262')) return;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'cap-edit-settings-v262';
  button.textContent = 'Edit Cap';
  button.addEventListener('click', openCapSettingsV262);
  heroLimit.appendChild(button);
}

function compactCapDisclosuresV262() {
  const detail = document.querySelector('#capView .cap-detail-disclosure-v228');
  const detailSummary = detail?.querySelector('summary span');
  if (detailSummary) {
    const strong = detailSummary.querySelector('strong');
    const small = detailSummary.querySelector('small');
    if (strong) strong.textContent = 'Cap Detail';
    if (small) small.textContent = 'All seven seasons';
  }

  const history = document.querySelector('#capView .cap-history-disclosure');
  const historySmall = history?.querySelector('summary .settings-disclosure-title span');
  if (historySmall) historySmall.textContent = 'Prior salary caps';
}

function applyCapControlsPolishV262() {
  const page = document.querySelector('#capView .cap-page-v228');
  if (!page) return;

  page.classList.add('cap-page-v262');

  addCapHeroControlsV262();
  compactDeadCapPanelV262();
  compactContractIntelligenceV262();
  compactCapDisclosuresV262();
}

function installCapControlsPolish() {
  if (capControlsPolishInstalled) return;
  capControlsPolishInstalled = true;

  if (typeof renderCap === 'function') {
    const originalRenderCapV262 = renderCap;
    renderCap = function() {
      const result = originalRenderCapV262();
      applyCapControlsPolishV262();
      return result;
    };
  }
}



// -----------------------------------------------------------------------------
// V2.63 — Transaction Modal Fit Polish
// Mobile-only Trade-side tabs + bounded internal lists.
// No transaction persistence or structured-trade behavior changes.
// -----------------------------------------------------------------------------
let transactionModalFitPolishInstalled = false;
let transactionTradeSideV263 = 'outgoing';

function transactionTradeSidesV263() {
  const grid = el('transactionTradeStructuredSection')?.querySelector('.trade-side-grid');
  if (!grid) return [];

  return [...grid.querySelectorAll(':scope > .trade-side')];
}

function transactionTradeSideKeyV263(side, index) {
  const title = side.querySelector('.trade-side-head h4')?.textContent.trim().toLowerCase() || '';
  if (title.includes('incoming')) return 'incoming';
  if (title.includes('outgoing')) return 'outgoing';
  return index === 1 ? 'incoming' : 'outgoing';
}

function setTransactionTradeSideV263(sideKey) {
  transactionTradeSideV263 = sideKey === 'incoming' ? 'incoming' : 'outgoing';

  transactionTradeSidesV263().forEach((side, index) => {
    const key = transactionTradeSideKeyV263(side, index);
    side.dataset.tradeSideV263 = key;
    side.classList.toggle('trade-side-active-v263', key === transactionTradeSideV263);
  });

  document.querySelectorAll('#transactionDialog [data-trade-side-tab-v263]').forEach((button) => {
    const active = button.dataset.tradeSideTabV263 === transactionTradeSideV263;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

function ensureTransactionTradeTabsV263() {
  const section = el('transactionTradeStructuredSection');
  const grid = section?.querySelector('.trade-side-grid');
  if (!section || !grid) return;

  const sides = transactionTradeSidesV263();
  if (sides.length < 2) return;

  sides.forEach((side, index) => {
    side.dataset.tradeSideV263 = transactionTradeSideKeyV263(side, index);
  });

  if (!el('transactionTradeTabsV263')) {
    const tabs = document.createElement('div');
    tabs.id = 'transactionTradeTabsV263';
    tabs.className = 'transaction-trade-tabs-v263';
    tabs.setAttribute('role', 'group');
    tabs.setAttribute('aria-label', 'Trade side');

    const outgoing = document.createElement('button');
    outgoing.type = 'button';
    outgoing.dataset.tradeSideTabV263 = 'outgoing';
    outgoing.textContent = 'Outgoing';
    outgoing.addEventListener('click', () => setTransactionTradeSideV263('outgoing'));

    const incoming = document.createElement('button');
    incoming.type = 'button';
    incoming.dataset.tradeSideTabV263 = 'incoming';
    incoming.textContent = 'Incoming';
    incoming.addEventListener('click', () => setTransactionTradeSideV263('incoming'));

    tabs.append(outgoing, incoming);
    grid.insertAdjacentElement('beforebegin', tabs);
  }

  setTransactionTradeSideV263(transactionTradeSideV263);
}

function resetTransactionTradeSideV263() {
  transactionTradeSideV263 = 'outgoing';
  setTransactionTradeSideV263('outgoing');
}

function syncTransactionModalFitV263() {
  const dialog = el('transactionDialog');
  if (!dialog) return;

  dialog.classList.add('transaction-dialog-v263');

  const isTrade = el('transactionType')?.value === 'Trade';
  dialog.classList.toggle('transaction-is-trade-v263', isTrade);

  if (isTrade) {
    ensureTransactionTradeTabsV263();
    setTransactionTradeSideV263(transactionTradeSideV263);
  }

  // Scroll the modal body back to the top whenever a fresh transaction opens.
  const body = dialog.querySelector('.transaction-form-body-v262');
  if (body && !dialog.dataset.v263PreserveScroll) body.scrollTop = 0;
  delete dialog.dataset.v263PreserveScroll;
}

function installTransactionModalFitPolish() {
  if (transactionModalFitPolishInstalled) return;
  transactionModalFitPolishInstalled = true;

  ensureTransactionTradeTabsV263();

  if (typeof handleTransactionTypeChange === 'function') {
    const originalHandleTransactionTypeChangeV263 = handleTransactionTypeChange;
    handleTransactionTypeChange = function() {
      const priorType = el('transactionType')?.value;
      const result = originalHandleTransactionTypeChangeV263();

      if (priorType === 'Trade') {
        resetTransactionTradeSideV263();
      }

      syncTransactionModalFitV263();
      return result;
    };
  }

  if (typeof openTransactionDialog === 'function') {
    const originalOpenTransactionDialogV263 = openTransactionDialog;
    openTransactionDialog = function(prefill = {}) {
      resetTransactionTradeSideV263();
      const result = originalOpenTransactionDialogV263(prefill);
      syncTransactionModalFitV263();
      return result;
    };
  }

  if (typeof openEditTransactionDialog === 'function') {
    const originalOpenEditTransactionDialogV263 = openEditTransactionDialog;
    openEditTransactionDialog = function(transactionId) {
      resetTransactionTradeSideV263();
      const result = originalOpenEditTransactionDialogV263(transactionId);
      syncTransactionModalFitV263();
      return result;
    };
  }
}



// -----------------------------------------------------------------------------
// V2.64 — Transaction Modal Width Fix
// Prevents horizontal modal panning and always opens aligned to the left edge.
// No transaction behavior/data changes.
// -----------------------------------------------------------------------------
let transactionModalWidthFixInstalled = false;

function resetTransactionModalHorizontalScrollV264() {
  const dialog = el('transactionDialog');
  if (!dialog) return;

  const card = dialog.querySelector('.modal-card');
  const body = dialog.querySelector('.transaction-form-body-v262');
  const tradeSection = el('transactionTradeStructuredSection');

  [dialog, card, body, tradeSection].filter(Boolean).forEach((node) => {
    node.scrollLeft = 0;
  });
}

function installTransactionModalWidthFix() {
  if (transactionModalWidthFixInstalled) return;
  transactionModalWidthFixInstalled = true;

  const dialog = el('transactionDialog');
  dialog?.classList.add('transaction-dialog-v264');

  if (typeof openTransactionDialog === 'function') {
    const originalOpenTransactionDialogV264 = openTransactionDialog;
    openTransactionDialog = function(prefill = {}) {
      const result = originalOpenTransactionDialogV264(prefill);
      window.requestAnimationFrame(resetTransactionModalHorizontalScrollV264);
      return result;
    };
  }

  if (typeof openEditTransactionDialog === 'function') {
    const originalOpenEditTransactionDialogV264 = openEditTransactionDialog;
    openEditTransactionDialog = function(transactionId) {
      const result = originalOpenEditTransactionDialogV264(transactionId);
      window.requestAnimationFrame(resetTransactionModalHorizontalScrollV264);
      return result;
    };
  }

  dialog?.addEventListener('toggle', () => {
    if (dialog.open) window.requestAnimationFrame(resetTransactionModalHorizontalScrollV264);
  });
}


// Bootstrap only after every shared/page/feature file above has loaded.
init();
