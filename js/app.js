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

// Bootstrap only after every shared/page/feature file above has loaded.
init();
