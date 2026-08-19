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

function playerCountsTowardCap(player) {
  if ((player?.rosterGroup || 'ACTIVE') !== 'ACTIVE') return false;
  const status = statusById(player.statusId);
  return Boolean(status?.countsTowardCap);
}

function calculateSeason(seasonId) {
  const season = seasonById(seasonId);
  let knownRosterCap = 0;
  const missingPlayerIds = [];
  state.players.forEach((player) => {
    if (!playerCountsTowardCap(player)) return;
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


// V2.46 — contract & roster intelligence.
// These helpers surface only entered/known contract evidence. They do not
// infer future salary or label contracts as good/bad.

function contractTermSeasons(player) {
  const current = currentSeason();
  const end = seasonById(player?.contractEndSeasonId);
  if (!current || !end) return [];
  return contractHorizonSeasons().filter((season) =>
    season.startYear >= current.startYear && season.startYear <= end.startYear
  );
}

function missingFutureContractSeasons(player) {
  const current = currentSeason();
  if (!current) return [];
  return contractTermSeasons(player).filter((season) =>
    season.startYear > current.startYear && effectivePlayerCharge(player, season.id) === null
  );
}

function playerContractSignals(player) {
  const current = currentSeason();
  const next = contractHorizonSeasons().find((season) => current && season.startYear === current.startYear + 1);
  const missingFuture = missingFutureContractSeasons(player);

  return {
    expiresCurrent: Boolean(current && player.contractEndSeasonId === current.id),
    expiresNext: Boolean(next && player.contractEndSeasonId === next.id),
    missingCurrent: Boolean(current && effectivePlayerCharge(player, current.id) === null),
    missingFuture,
    hasFutureGap: missingFuture.length > 0
  };
}

function knownFutureCommitment(player) {
  const current = currentSeason();
  if (!current) return { total:0, seasons:0 };
  let total = 0;
  let seasons = 0;

  contractHorizonSeasons().forEach((season) => {
    if (season.startYear <= current.startYear) return;
    const charge = effectivePlayerCharge(player, season.id);
    if (charge === null) return;
    total += Number(charge || 0);
    seasons += 1;
  });

  return { total, seasons };
}

function hasEnteredContractData(player) {
  if (player.contractEndSeasonId) return true;
  return Object.values(player.salaries || {}).some((row) =>
    row && (
      (row.salary !== null && row.salary !== undefined) ||
      (row.capOverride !== null && row.capOverride !== undefined)
    )
  );
}

function contractIntelligence() {
  const current = currentSeason();
  const horizon = contractHorizonSeasons();
  const next = horizon.find((season) => current && season.startYear === current.startYear + 1) || null;
  const allPlayers = [...state.players];
  const active = activeRosterPlayers();
  const minors = farmSystemPlayers();

  const expiringCurrent = current
    ? allPlayers.filter((player) => player.contractEndSeasonId === current.id)
    : [];
  const expiringNext = next
    ? allPlayers.filter((player) => player.contractEndSeasonId === next.id)
    : [];

  const missingFutureSalary = allPlayers
    .map((player) => ({ player, seasons:missingFutureContractSeasons(player) }))
    .filter((item) => item.seasons.length > 0)
    .sort((a,b) => b.seasons.length - a.seasons.length || a.player.name.localeCompare(b.player.name));

  const largestCurrent = current
    ? allPlayers
        .map((player) => ({ player, charge:effectivePlayerCharge(player, current.id) }))
        .filter((item) => item.charge !== null)
        .sort((a,b) => Number(b.charge) - Number(a.charge))
    : [];

  const longTermCommitments = allPlayers
    .map((player) => {
      const future = knownFutureCommitment(player);
      return { player, total:future.total, seasons:future.seasons };
    })
    .filter((item) => item.seasons > 0)
    .sort((a,b) => b.total - a.total || b.seasons - a.seasons);

  const minorsContracts = minors
    .filter(hasEnteredContractData)
    .map((player) => ({
      player,
      charge:current ? effectivePlayerCharge(player, current.id) : null
    }))
    .sort((a,b) => Number(b.charge || 0) - Number(a.charge || 0));

  const futureSeasonPressure = horizon
    .filter((season) => current && season.startYear > current.startYear)
    .map((season) => {
      const calc = calculateSeason(season.id);
      return {
        season,
        rosterCap:calc.knownRosterCap,
        capUsed:calc.knownCapUsed,
        missingCount:calc.missingPlayerIds.length
      };
    })
    .sort((a,b) => b.rosterCap - a.rosterCap);

  return {
    current,
    next,
    active,
    minors,
    expiringCurrent,
    expiringNext,
    missingFutureSalary,
    largestCurrent,
    longTermCommitments,
    minorsContracts,
    futureSeasonPressure
  };
}
