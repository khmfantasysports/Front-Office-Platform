'use strict';

// Front-office domain calculations and shared state selectors.

function deadCapForSeason(seasonId) {
  return state.adjustments
    .filter((adjustment) => adjustment.seasonId === seasonId)
    .reduce((sum, adjustment) => sum + Number(adjustment.amount || 0), 0);
}

function effectivePlayerCharge(player, seasonId) {
  const row = player?.salaries?.[seasonId];
  if (!row) return null;
  return row.capOverride !== null && row.capOverride !== undefined ? row.capOverride : row.salary;
}

function activeRosterPlayers() {
  return state.players.filter((player) => (player.rosterGroup || 'ACTIVE') === 'ACTIVE');
}

function farmSystemPlayers() {
  return state.players.filter((player) => player.isProspect && (player.rosterGroup || 'ACTIVE') === 'FARM');
}

function defaultActiveStatusId() {
  return state.statuses.find((status) => String(status.name || '').trim().toLowerCase() === 'active')?.id || state.statuses[0]?.id || null;
}

function calculateSeason(seasonId) {
  const season = seasonById(seasonId);
  let knownRosterCap = 0;
  const missingPlayerIds = [];
  state.players.forEach((player) => {
    const status = statusById(player.statusId);
    if (!status?.countsTowardCap) return;
    const salaryData = player.salaries?.[seasonId];
    const effective = salaryData?.capOverride ?? salaryData?.salary ?? null;
    if (effective === null) missingPlayerIds.push(player.id);
    else knownRosterCap += effective;
  });
  const adjustmentsTotal = state.adjustments.filter((a) => a.seasonId === seasonId).reduce((sum, a) => sum + a.amount, 0);
  const knownCapUsed = knownRosterCap + adjustmentsTotal;
  const complete = missingPlayerIds.length === 0;
  const salaryCap = season?.salaryCap ?? null;
  const capUsed = complete ? knownCapUsed : null;
  const capSpace = complete && salaryCap !== null ? salaryCap - knownCapUsed : null;
  return { knownRosterCap, adjustmentsTotal, knownCapUsed, capUsed, salaryCap, capSpace, complete, missingPlayerIds };
}

function contractHorizonSeasons() {
  const sorted = [...state.seasons].sort((a,b) => a.startYear - b.startYear);
  const current = currentSeason();
  if (!current) return sorted.slice(0, 7);
  return sorted.filter((season) => season.startYear >= current.startYear && season.startYear <= current.startYear + 6);
}

function visibleSeasons() {
  const sorted = [...state.seasons].sort((a,b) => a.startYear - b.startYear);
  const current = currentSeason();
  const index = sorted.findIndex((s) => s.id === current.id);
  return sorted.slice(Math.max(0, index), Math.max(0, index) + 4);
}

function currentSeason() { return seasonById(state.frontOffice.currentSeasonId) || state.seasons[0]; }

function seasonById(id) { return state.seasons.find((s) => s.id === id); }

function statusById(id) { return state.statuses.find((s) => s.id === id); }
