'use strict';

// Authentication, Supabase loading and cloud persistence helpers.

async function signInWithGoogle() {
  showAuthError('');
  setCloudStatus('Redirecting…', 'busy');
  const { error } = await db.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: SITE_URL }
  });
  if (error) {
    setCloudStatus('Auth error', 'error');
    showAuthError(error.message);
  }
}

async function signOut() {
  setCloudStatus('Signing out…', 'busy');
  const { error } = await db.auth.signOut();
  if (error) return showAuthError(error.message);
  session = null;
  state = emptyState();
  frontOfficeList = [];
  render();
}

async function handleSessionChange(nextSession) {
  session = nextSession || null;
  if (!session?.user) {
    state = emptyState();
    frontOfficeList = [];
    setCloudStatus('Signed out', '');
    render();
    return;
  }
  setCloudStatus('Synced', '');
  await loadFrontOffices();
}

async function loadFrontOffices() {
  await runCloudAction(async () => {
    const { data, error } = await db.from('front_offices')
      .select('front_office_id,team_name,league_name,sport,currency_code,roster_limit,updated_at')
      .eq('is_archived', false)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    frontOfficeList = data || [];
    state = emptyState();
    showOfficePicker(false);
  }, false);
}

function showOfficePicker(shouldReload = true) {
  if (!session?.user) return render();
  state = emptyState();
  authGate.classList.add('hidden');
  onboarding.classList.add('hidden');
  workspace.classList.add('hidden');
  el('workspaceNav').classList.add('hidden');
  el('workspaceBackBtn').classList.add('hidden');
  el('exportBtn').classList.add('hidden');
  officePicker.classList.remove('hidden');
  el('topbarActions').classList.remove('hidden');
  el('userEmail').textContent = session.user.email || 'Signed in';
  renderOfficeList();
  if (shouldReload) loadFrontOffices();
}

function showCreateOffice() {
  state = emptyState();
  officePicker.classList.add('hidden');
  workspace.classList.add('hidden');
  el('workspaceNav').classList.add('hidden');
  el('workspaceBackBtn').classList.add('hidden');
  el('exportBtn').classList.add('hidden');
  onboarding.classList.remove('hidden');
  el('teamName').value = '';
  el('leagueName').value = '';
  el('currentSeason').value = '2026-27';
  el('salaryCap').value = '$119,600,000';
  el('rosterLimit').value = '30';
}

function renderOfficeList() {
  if (!officePicker || officePicker.classList.contains('hidden')) return;
  const list = el('officeList');
  const countLabel = el('officeCountLabel');
  if (countLabel) countLabel.textContent = frontOfficeList.length;
  if (!frontOfficeList.length) {
    list.innerHTML = `<div class="office-empty-state"><div class="office-empty-mark">FO</div><h3>No Front Offices yet</h3><p>Create your first private workspace to start managing a roster, contracts and cap.</p></div>`;
    return;
  }
  list.innerHTML = frontOfficeList.map((office) => {
    const initials = String(office.team_name || 'FO').split(/\s+/).filter(Boolean).slice(0,2).map((part) => part[0]).join('').toUpperCase();
    const updated = office.updated_at ? formatDateTime(office.updated_at) : 'Recently';
    return `
    <button class="office-card office-card-v219" type="button" data-open-office="${office.front_office_id}">
      <span class="office-card-mark">${escapeHtml(initials || 'FO')}</span>
      <span class="office-card-copy"><span class="office-card-topline"><span class="office-sport-chip">${escapeHtml(office.sport || 'NHL')}</span><span class="office-updated">Updated ${escapeHtml(updated)}</span></span><strong>${escapeHtml(office.team_name)}</strong><small>${escapeHtml(office.league_name)}</small><span class="office-card-meta">${office.roster_limit ? `${escapeHtml(office.roster_limit)} roster spots` : 'Flexible roster'} · ${escapeHtml(office.currency_code || 'USD')}</span></span>
      <span class="office-open-v219" aria-hidden="true">›</span>
    </button>`;
  }).join('');
  document.querySelectorAll('[data-open-office]').forEach((button) => {
    button.addEventListener('click', () => loadOffice(button.dataset.openOffice));
  });
}

async function loadOffice(frontOfficeId, showBusy = true) {
  if (showBusy) setCloudStatus('Loading…', 'busy');
  const queries = await Promise.all([
    db.from('front_offices').select('*').eq('front_office_id', frontOfficeId).single(),
    db.from('front_office_seasons').select('*').eq('front_office_id', frontOfficeId).order('season_start_year'),
    db.from('front_office_roster_statuses').select('*').eq('front_office_id', frontOfficeId).eq('is_active', true).order('sort_order'),
    db.from('front_office_players').select('*').eq('front_office_id', frontOfficeId).is('archived_at', null),
    db.from('front_office_player_source_links').select('*').eq('front_office_id', frontOfficeId),
    db.from('roster_entries').select('*').eq('front_office_id', frontOfficeId).is('removed_at', null),
    db.from('contracts').select('*').eq('front_office_id', frontOfficeId).eq('is_active', true).is('archived_at', null),
    db.from('contract_seasons').select('*').eq('front_office_id', frontOfficeId),
    db.from('financial_adjustments').select('*').eq('front_office_id', frontOfficeId).eq('is_active', true).is('archived_at', null),
    db.from('financial_adjustment_seasons').select('*').eq('front_office_id', frontOfficeId),
    db.from('front_office_depth_chart_entries').select('*').eq('front_office_id', frontOfficeId).order('position_code').order('depth_order'),
    db.from('front_office_transactions').select('*').eq('front_office_id', frontOfficeId).order('transaction_date', { ascending:false }).order('created_at', { ascending:false }),
    db.from('front_office_transaction_items').select('*').eq('front_office_id', frontOfficeId).order('created_at'),
    db.from('front_office_assets').select('*').eq('front_office_id', frontOfficeId).is('archived_at', null).order('created_at')
  ]);
  const errorResult = queries.find((q) => q.error);
  if (errorResult?.error) {
    setCloudStatus('Load error', 'error');
    alert(errorResult.error.message);
    return;
  }

  const [officeQ,seasonsQ,statusesQ,playersQ,sourceLinksQ,rosterQ,contractsQ,contractSeasonsQ,adjustmentsQ,adjustmentSeasonsQ,depthQ,transactionsQ,transactionItemsQ,assetsQ] = queries;
  const office = officeQ.data;
  const seasons = seasonsQ.data || [];
  const statuses = statusesQ.data || [];
  const rosterByPlayer = new Map((rosterQ.data || []).map((r) => [r.front_office_player_id, r]));
  const sourceLinksByPlayer = new Map();
  (sourceLinksQ.data || []).forEach((link) => {
    if (!sourceLinksByPlayer.has(link.front_office_player_id)) sourceLinksByPlayer.set(link.front_office_player_id, []);
    sourceLinksByPlayer.get(link.front_office_player_id).push(link);
  });
  const contractsByPlayer = new Map((contractsQ.data || []).map((c) => [c.front_office_player_id, c]));
  const contractSeasonGroups = new Map();
  (contractSeasonsQ.data || []).forEach((cs) => {
    if (!contractSeasonGroups.has(cs.contract_id)) contractSeasonGroups.set(cs.contract_id, []);
    contractSeasonGroups.get(cs.contract_id).push(cs);
  });

  const players = (playersQ.data || []).filter((p) => rosterByPlayer.has(p.front_office_player_id)).map((p) => {
    const roster = rosterByPlayer.get(p.front_office_player_id);
    const contract = contractsByPlayer.get(p.front_office_player_id);
    const salaries = {};
    seasons.forEach((s) => { salaries[s.front_office_season_id] = { salary: null, capOverride: null }; });
    (contractSeasonGroups.get(contract?.contract_id) || []).forEach((cs) => {
      salaries[cs.front_office_season_id] = {
        salary: cs.salary_amount === null ? null : Number(cs.salary_amount),
        capOverride: cs.cap_charge_override_amount === null ? null : Number(cs.cap_charge_override_amount)
      };
    });
    return {
      id: p.front_office_player_id,
      name: p.player_name,
      position: p.position || 'F',
      eligiblePositions: p.eligible_positions || p.position || 'F',
      realTeam: p.real_team || '',
      ageSnapshot: p.age_snapshot === null || p.age_snapshot === undefined ? null : Number(p.age_snapshot),
      ageAsOf: p.age_as_of || null,
      fantraxId: (sourceLinksByPlayer.get(p.front_office_player_id) || []).find((link) => link.source_system === 'FANTRAX')?.source_player_id || null,
      statusId: roster.roster_status_id,
      isProspect: Boolean(p.is_prospect),
      rosterGroup: roster.roster_group || 'ACTIVE',
      contractEndSeasonId: contract?.end_season_id || null,
      notes: contract?.notes || '',
      salaries,
      createdAt: p.created_at,
      updatedAt: p.updated_at
    };
  });

  const adjustmentById = new Map((adjustmentsQ.data || []).map((a) => [a.financial_adjustment_id, a]));
  const adjustments = (adjustmentSeasonsQ.data || []).filter((row) => adjustmentById.has(row.financial_adjustment_id)).map((row) => {
    const header = adjustmentById.get(row.financial_adjustment_id);
    return {
      id: header.financial_adjustment_id,
      type: header.adjustment_type,
      description: header.description,
      seasonId: row.front_office_season_id,
      amount: Number(row.amount),
      sourceTransactionId: header.source_transaction_id || null,
      createdAt: header.created_at
    };
  });

  const depthCharts = {};
  (depthQ.data || []).forEach((row) => {
    const position = String(row.position_code || '').toUpperCase();
    if (!depthCharts[position]) depthCharts[position] = [];
    depthCharts[position].push(row.front_office_player_id);
  });

  const transactions = (transactionsQ.data || []).map((row) => ({ id:row.transaction_id, date:row.transaction_date, type:row.transaction_type, counterparty:row.counterparty || '', summary:row.summary, notes:row.notes || '', createdAt:row.created_at }));
  const transactionItems = (transactionItemsQ.data || []).map((row) => ({ id:row.transaction_item_id, transactionId:row.transaction_id, kind:row.item_kind, direction:row.direction, playerId:row.front_office_player_id || null, assetId:row.front_office_asset_id || null, label:row.item_label, metadata:row.metadata || {}, createdAt:row.created_at }));

  const assets = (assetsQ.data || []).map((row) => ({ id:row.asset_id, type:row.asset_type, label:row.asset_label, draftYear:row.draft_year === null ? null : Number(row.draft_year), draftRound:row.draft_round === null ? null : Number(row.draft_round), originalTeam:row.original_team || '', status:row.asset_status, notes:row.notes || '', createdAt:row.created_at, updatedAt:row.updated_at, archivedAt:row.archived_at || null }));

  state = {
    frontOffice: {
      id: office.front_office_id,
      teamName: office.team_name,
      leagueName: office.league_name,
      sport: office.sport,
      currency: office.currency_code,
      rosterLimit: office.roster_limit,
      waiverPenaltyMode: office.waiver_penalty_mode || 'NONE',
      waiverPenaltyValue: office.waiver_penalty_value === null || office.waiver_penalty_value === undefined ? null : Number(office.waiver_penalty_value),
      waiverPenaltyScope: office.waiver_penalty_scope || 'CURRENT_SEASON',
      buyoutPenaltyMode: office.buyout_penalty_mode || 'NONE',
      buyoutPenaltyValue: office.buyout_penalty_value === null || office.buyout_penalty_value === undefined ? null : Number(office.buyout_penalty_value),
      buyoutPenaltyScope: office.buyout_penalty_scope || 'REMAINING_CONTRACT',
      currentSeasonId: seasons.find((s) => s.is_current)?.front_office_season_id || seasons[0]?.front_office_season_id || null,
      createdAt: office.created_at
    },
    seasons: seasons.map((s) => ({ id: s.front_office_season_id, startYear: s.season_start_year, salaryCap: s.salary_cap === null ? null : Number(s.salary_cap) })),
    statuses: statuses.map((s) => ({ id: s.roster_status_id, name: s.status_name, countsTowardCap: s.counts_toward_cap })),
    players,
    adjustments,
    depthCharts,
    transactions,
    transactionItems,
    assets,
    activity: [activity('Cloud data loaded')]
  };
  setCloudStatus('Synced', '');
  render();
}

async function runCloudAction(action, showAlerts = true) {
  setCloudStatus('Saving…', 'busy');
  try {
    await action();
    setCloudStatus('Synced', '');
    return true;
  } catch (error) {
    console.error(error);
    setCloudStatus('Save error', 'error');
    if (showAlerts) alert(error?.message || 'Cloud save failed.');
    return false;
  }
}

function setCloudStatus(label, mode = '') {
  const pill = el('cloudStatus');
  if (!pill) return;
  pill.textContent = label;
  pill.classList.toggle('busy', mode === 'busy');
  pill.classList.toggle('error', mode === 'error');
}

function showAuthError(message) {
  const box = el('authError');
  if (!box) return;
  box.textContent = message || '';
  box.classList.toggle('hidden', !message);
}
