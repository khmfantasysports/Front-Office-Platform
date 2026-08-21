'use strict';

// -----------------------------------------------------------------------------
// RosterCap V2.78B — League configuration + roster-group shadow foundation
//
// Architecture:
// - Sport is a catalog/filter, not the platform ruleset.
// - Setup templates provide editable suggestions for new Front Offices.
// - Persisted Front Office / season values remain authoritative after creation.
// - NHL is operational because it was implemented first, not because NHL rules
//   are canonical to RosterCap.
// - NFL / NBA / MLB remain planned until their complete workspace lifecycle is
//   implemented and validated.
//
// This release intentionally does NOT:
// - add or change Supabase tables, columns, RPC signatures or RLS
// - enable NFL / NBA / MLB Front Office creation
// - change roster/depth behavior
// - change cap/contract formulas
// - change transaction formulas
// - persist new roster-slot or terminology configuration yet
//
// V2.78B additionally:
// - reads public.front_office_roster_groups after the established loadOffice()
// - stores normalized roster-group configuration on state.rosterGroups
// - compares generic roster-group behavior against the existing ACTIVE/FARM path
// - reports parity diagnostics without changing any production calculation
// -----------------------------------------------------------------------------

const ROSTERCAP_SPORT_FOUNDATION_VERSION = 'V2.78B';

const ROSTERCAP_SPORTS = Object.freeze({
  NHL: Object.freeze({
    code: 'NHL',
    label: 'NHL',
    status: 'OPERATIONAL',
    order: 1,
    suggestedTemplateKey: 'CURRENT_HOCKEY'
  }),
  NFL: Object.freeze({
    code: 'NFL',
    label: 'NFL',
    status: 'PLANNED',
    order: 2,
    suggestedTemplateKey: null
  }),
  NBA: Object.freeze({
    code: 'NBA',
    label: 'NBA',
    status: 'PLANNED',
    order: 3,
    suggestedTemplateKey: null
  }),
  MLB: Object.freeze({
    code: 'MLB',
    label: 'MLB',
    status: 'PLANNED',
    order: 4,
    suggestedTemplateKey: null
  })
});

// Templates are suggestions only. They are deliberately separate from SPORT.
// A user may edit every field exposed by the creation/settings UI.
const ROSTERCAP_SETUP_TEMPLATES = Object.freeze({
  CURRENT_HOCKEY: Object.freeze({
    key: 'CURRENT_HOCKEY',
    label: 'Current hockey setup',
    sport: 'NHL',
    suggestions: Object.freeze({
      seasonDisplay: 'SPLIT_YEAR',
      seasonBoundaryMonth: 6, // July, zero-indexed
      seasonCount: 7,
      currency: 'USD',
      rosterLimit: 30,
      salaryCap: 119600000
    })
  })
});

function normalizeRosterCapSport(value) {
  const code = String(value || '').trim().toUpperCase();
  return Object.prototype.hasOwnProperty.call(ROSTERCAP_SPORTS, code) ? code : 'NHL';
}

function getRosterCapSport(value) {
  return ROSTERCAP_SPORTS[normalizeRosterCapSport(value)];
}

function isRosterCapSportOperational(value) {
  return getRosterCapSport(value).status === 'OPERATIONAL';
}

function rosterCapSportList() {
  return Object.values(ROSTERCAP_SPORTS)
    .slice()
    .sort((a, b) => a.order - b.order);
}

function getRosterCapSetupTemplate(templateKey) {
  if (!templateKey) return null;
  return ROSTERCAP_SETUP_TEMPLATES[templateKey] || null;
}

function suggestedRosterCapTemplateForSport(sport) {
  const preset = getRosterCapSport(sport);
  return getRosterCapSetupTemplate(preset.suggestedTemplateKey);
}

function rosterCapTemplateSuggestions(sport) {
  return suggestedRosterCapTemplateForSport(sport)?.suggestions || null;
}

function splitYearLabel(startYear) {
  if (!Number.isFinite(Number(startYear))) return '';
  const year = Number(startYear);
  return `${year}-${String((year + 1) % 100).padStart(2, '0')}`;
}

function calendarYearLabel(startYear) {
  if (!Number.isFinite(Number(startYear))) return '';
  return String(Number(startYear));
}

function rosterCapSuggestedSeasonStartYear(sport, date = new Date()) {
  const suggestions = rosterCapTemplateSuggestions(sport);
  if (!suggestions) return null;

  if (suggestions.seasonDisplay === 'SPLIT_YEAR') {
    const boundaryMonth = Number.isInteger(suggestions.seasonBoundaryMonth)
      ? suggestions.seasonBoundaryMonth
      : 6;
    const calendarYear = date.getFullYear();
    return date.getMonth() >= boundaryMonth ? calendarYear : calendarYear - 1;
  }

  if (suggestions.seasonDisplay === 'CALENDAR_YEAR') {
    return date.getFullYear();
  }

  return null;
}

function defaultRosterCapSeasonLabel(sport, date = new Date()) {
  const suggestions = rosterCapTemplateSuggestions(sport);
  const startYear = rosterCapSuggestedSeasonStartYear(sport, date);
  if (!suggestions || startYear === null) return '';

  if (suggestions.seasonDisplay === 'SPLIT_YEAR') return splitYearLabel(startYear);
  if (suggestions.seasonDisplay === 'CALENDAR_YEAR') return calendarYearLabel(startYear);
  return '';
}

function parseSplitYearSeason(value) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(value || '').trim());
  if (!match) return null;
  const startYear = Number(match[1]);
  const endYear = Number(match[2]);
  return ((startYear + 1) % 100) === endYear ? startYear : null;
}

function parseCalendarYearSeason(value) {
  const match = /^(\d{4})$/.exec(String(value || '').trim());
  return match ? Number(match[1]) : null;
}

function parseRosterCapSeasonInput(value, sport) {
  const suggestions = rosterCapTemplateSuggestions(sport);

  if (suggestions?.seasonDisplay === 'SPLIT_YEAR') {
    const startYear = parseSplitYearSeason(value);
    return startYear === null ? null : { startYear, display: 'SPLIT_YEAR' };
  }

  if (suggestions?.seasonDisplay === 'CALENDAR_YEAR') {
    const startYear = parseCalendarYearSeason(value);
    return startYear === null ? null : { startYear, display: 'CALENDAR_YEAR' };
  }

  // No sport template is authoritative here. Accept either neutral storage
  // representation so future templates are not forced through hockey syntax.
  const splitYear = parseSplitYearSeason(value);
  if (splitYear !== null) return { startYear: splitYear, display: 'SPLIT_YEAR' };

  const calendarYear = parseCalendarYearSeason(value);
  if (calendarYear !== null) return { startYear: calendarYear, display: 'CALENDAR_YEAR' };

  return null;
}

function rosterCapSeasonInputHelp(sport) {
  const suggestions = rosterCapTemplateSuggestions(sport);
  if (suggestions?.seasonDisplay === 'CALENDAR_YEAR') return 'Use a season in the format 2026.';
  if (suggestions?.seasonDisplay === 'SPLIT_YEAR') return 'Use a season in the format 2026-27.';
  return 'Use a season in the format 2026 or 2026-27.';
}

function rosterCapCreationSeasonCount(sport) {
  const count = rosterCapTemplateSuggestions(sport)?.seasonCount;
  return Number.isInteger(count) && count > 0 ? count : null;
}

function rosterCapSuggestedMoneyInput(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '';
  return `$${Math.round(Number(value)).toLocaleString('en-US')}`;
}

function applyRosterCapCreateSuggestions(sport, date = new Date()) {
  const preset = getRosterCapSport(sport);
  const suggestions = rosterCapTemplateSuggestions(preset.code);
  if (!suggestions) return false;

  const season = document.getElementById('currentSeason');
  const salaryCap = document.getElementById('salaryCap');
  const rosterLimit = document.getElementById('rosterLimit');
  const currency = document.getElementById('currency');

  if (season) season.value = defaultRosterCapSeasonLabel(preset.code, date);
  if (salaryCap) salaryCap.value = rosterCapSuggestedMoneyInput(suggestions.salaryCap);
  if (rosterLimit) {
    rosterLimit.value = suggestions.rosterLimit === null || suggestions.rosterLimit === undefined
      ? ''
      : String(suggestions.rosterLimit);
  }
  if (currency && suggestions.currency) currency.value = suggestions.currency;

  return true;
}

function rosterCapNumberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

// Neutral read model over fields that are already persisted today.
// This does not invent new storage. It gives downstream UI a configuration
// contract that can later be extended when roster-slot/terminology persistence
// is added deliberately.
function resolveRosterCapSavedLeagueConfiguration(frontOffice, seasons = [], statuses = []) {
  if (!frontOffice) return null;

  return {
    sport: normalizeRosterCapSport(frontOffice.sport),
    financial: {
      currency: frontOffice.currency || frontOffice.currency_code || null,
      salaryCapsBySeason: Object.fromEntries(
        (seasons || []).map((season) => [
          season.id || season.front_office_season_id,
          rosterCapNumberOrNull(
            season.salaryCap !== undefined ? season.salaryCap : season.salary_cap
          )
        ])
      ),
      waiverPenalty: {
        mode: frontOffice.waiverPenaltyMode || frontOffice.waiver_penalty_mode || 'NONE',
        value: rosterCapNumberOrNull(
          frontOffice.waiverPenaltyValue !== undefined
            ? frontOffice.waiverPenaltyValue
            : frontOffice.waiver_penalty_value
        ),
        scope: frontOffice.waiverPenaltyScope || frontOffice.waiver_penalty_scope || 'CURRENT_SEASON'
      },
      buyoutPenalty: {
        mode: frontOffice.buyoutPenaltyMode || frontOffice.buyout_penalty_mode || 'NONE',
        value: rosterCapNumberOrNull(
          frontOffice.buyoutPenaltyValue !== undefined
            ? frontOffice.buyoutPenaltyValue
            : frontOffice.buyout_penalty_value
        ),
        scope: frontOffice.buyoutPenaltyScope || frontOffice.buyout_penalty_scope || 'REMAINING_CONTRACT'
      }
    },
    roster: {
      activeLimit: rosterCapNumberOrNull(
        frontOffice.rosterLimit !== undefined ? frontOffice.rosterLimit : frontOffice.roster_limit
      ),
      developmentLimit: rosterCapNumberOrNull(
        frontOffice.minorsLimit !== undefined ? frontOffice.minorsLimit : frontOffice.minors_limit
      ),
      statuses: (statuses || []).map((status) => ({
        id: status.id || status.roster_status_id,
        name: status.name || status.status_name || 'Status',
        countsTowardCap:
          status.countsTowardCap !== undefined
            ? Boolean(status.countsTowardCap)
            : Boolean(status.counts_toward_cap)
      }))
    }
  };
}

function currentRosterCapSport() {
  const frontOfficeSport =
    typeof state !== 'undefined'
    && state?.frontOffice?.sport
      ? state.frontOffice.sport
      : null;

  const createSport = document.getElementById('sport')?.value || null;
  return getRosterCapSport(frontOfficeSport || createSport || 'NHL');
}

function syncCreateOfficeSportOptionsV277() {
  const select = document.getElementById('sport');
  if (!select) return;

  const previous = normalizeRosterCapSport(select.value || 'NHL');
  select.replaceChildren();

  rosterCapSportList().forEach((sport) => {
    const option = document.createElement('option');
    option.value = sport.code;

    if (sport.status === 'OPERATIONAL') {
      option.textContent = sport.label;
    } else {
      option.textContent = `${sport.label} — coming soon`;
      option.disabled = true;
    }

    select.appendChild(option);
  });

  select.value = isRosterCapSportOperational(previous) ? previous : 'NHL';
  select.dataset.sportFoundation = ROSTERCAP_SPORT_FOUNDATION_VERSION;
}

function installSportFoundationV277() {
  syncCreateOfficeSportOptionsV277();

  document.documentElement.dataset.rostercapSportFoundation =
    ROSTERCAP_SPORT_FOUNDATION_VERSION;
}

window.RosterCapSports = Object.freeze({
  version: ROSTERCAP_SPORT_FOUNDATION_VERSION,
  sports: ROSTERCAP_SPORTS,
  templates: ROSTERCAP_SETUP_TEMPLATES,
  normalize: normalizeRosterCapSport,
  get: getRosterCapSport,
  isOperational: isRosterCapSportOperational,
  list: rosterCapSportList,
  current: currentRosterCapSport,
  suggestedTemplate: suggestedRosterCapTemplateForSport,
  syncCreateOfficeOptions: syncCreateOfficeSportOptionsV277
});

window.RosterCapLeagueConfig = Object.freeze({
  version: ROSTERCAP_SPORT_FOUNDATION_VERSION,
  creationSuggestions: rosterCapTemplateSuggestions,
  applyCreateSuggestions: applyRosterCapCreateSuggestions,
  defaultSeasonLabel: defaultRosterCapSeasonLabel,
  parseSeasonInput: parseRosterCapSeasonInput,
  seasonInputHelp: rosterCapSeasonInputHelp,
  creationSeasonCount: rosterCapCreationSeasonCount,
  resolveSaved: resolveRosterCapSavedLeagueConfiguration
});



// -----------------------------------------------------------------------------
// RosterCap V2.78B — roster-group shadow read + parity diagnostics
//
// IMPORTANT:
// This is deliberately NON-AUTHORITATIVE.
//
// The production paths remain unchanged:
// - activeRosterPlayers()
// - farmSystemPlayers()
// - playerCountsTowardCap()
// - calculateSeason()
// - current depth-chart renderer
// - Call Up / Send Down
// - Fantrax Active / Minors sync
// - transactions / structured trades
//
// V2.78B only proves that the new generic roster-group configuration describes
// today's behavior correctly before a later controlled cutover.
// -----------------------------------------------------------------------------

let rosterGroupShadowInstalledV278b = false;

function normalizeRosterGroupRowV278b(row) {
  return {
    id: row.roster_group_id,
    frontOfficeId: row.front_office_id,
    key: String(row.group_key || '').trim().toUpperCase(),
    displayName: row.display_name || row.group_key || 'Roster group',
    playerLimit:
      row.player_limit === null || row.player_limit === undefined
        ? null
        : Number(row.player_limit),
    limitSource: row.limit_source || 'CUSTOM',
    countsTowardCap: Boolean(row.counts_toward_cap),
    lineupEligible: Boolean(row.lineup_eligible),
    isDevelopment: Boolean(row.is_development),
    isDefault: Boolean(row.is_default),
    sortOrder: Number(row.sort_order || 0),
    isActive: Boolean(row.is_active),
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  };
}

function rosterGroupKeyForPlayerV278b(player) {
  return String(player?.rosterGroup || 'ACTIVE').trim().toUpperCase();
}

function sameNullableNumberV278b(left, right) {
  const a = left === null || left === undefined || left === '' ? null : Number(left);
  const b = right === null || right === undefined || right === '' ? null : Number(right);
  if (a === null || b === null) return a === b;
  return Number.isFinite(a) && Number.isFinite(b) && a === b;
}

function sortedUniqueIdsV278b(players) {
  return [...new Set((players || []).map((player) => player?.id).filter(Boolean))].sort();
}

function sameIdSetV278b(left, right) {
  const a = Array.isArray(left) ? left : [];
  const b = Array.isArray(right) ? right : [];
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function statusCountsTowardCapV278b(player) {
  const status = (state?.statuses || []).find((item) => item.id === player?.statusId);
  return Boolean(status?.countsTowardCap);
}

function buildRosterGroupShadowDiagnosticsV278b(groups) {
  const players = Array.isArray(state?.players) ? state.players : [];
  const activeGroups = (groups || []).filter((group) => group.isActive);
  const byKey = new Map(activeGroups.map((group) => [group.key, group]));

  const unresolvedPlayers = players.filter(
    (player) => !byKey.has(rosterGroupKeyForPlayerV278b(player))
  );

  // Existing production behavior.
  const legacyActiveIds = sortedUniqueIdsV278b(
    players.filter((player) => rosterGroupKeyForPlayerV278b(player) === 'ACTIVE')
  );

  const legacyDevelopmentIds = sortedUniqueIdsV278b(
    players.filter(
      (player) =>
        Boolean(player?.isProspect)
        && rosterGroupKeyForPlayerV278b(player) === 'FARM'
    )
  );

  const legacyCapEligibleIds = sortedUniqueIdsV278b(
    players.filter(
      (player) =>
        rosterGroupKeyForPlayerV278b(player) === 'ACTIVE'
        && statusCountsTowardCapV278b(player)
    )
  );

  // Generic interpretation using V2.78A configuration only.
  const configuredLineupIds = sortedUniqueIdsV278b(
    players.filter((player) => {
      const group = byKey.get(rosterGroupKeyForPlayerV278b(player));
      return Boolean(group?.lineupEligible);
    })
  );

  const configuredDevelopmentIds = sortedUniqueIdsV278b(
    players.filter((player) => {
      const group = byKey.get(rosterGroupKeyForPlayerV278b(player));
      return Boolean(player?.isProspect) && Boolean(group?.isDevelopment);
    })
  );

  const configuredCapEligibleIds = sortedUniqueIdsV278b(
    players.filter((player) => {
      const group = byKey.get(rosterGroupKeyForPlayerV278b(player));
      return Boolean(group?.countsTowardCap) && statusCountsTowardCapV278b(player);
    })
  );

  const defaultGroup =
    activeGroups.find((group) => group.isDefault)
    || null;

  const developmentGroups =
    activeGroups.filter((group) => group.isDevelopment);

  const developmentGroup =
    developmentGroups.length === 1
      ? developmentGroups[0]
      : developmentGroups.find((group) => group.key === 'FARM') || null;

  const activeParity = sameIdSetV278b(legacyActiveIds, configuredLineupIds);
  const developmentParity = sameIdSetV278b(
    legacyDevelopmentIds,
    configuredDevelopmentIds
  );
  const capParity = sameIdSetV278b(
    legacyCapEligibleIds,
    configuredCapEligibleIds
  );

  // Current depth eligibility is tied to the ACTIVE roster. Until the depth
  // renderer is generalized, lineupEligible must describe the same player set.
  const depthEligibilityParity = activeParity;

  const primaryLimitParity = sameNullableNumberV278b(
    state?.frontOffice?.rosterLimit,
    defaultGroup?.playerLimit
  );

  const developmentLimitParity = sameNullableNumberV278b(
    state?.frontOffice?.minorsLimit,
    developmentGroup?.playerLimit
  );

  const coverageParity = unresolvedPlayers.length === 0;

  const parity =
    activeParity
    && developmentParity
    && capParity
    && depthEligibilityParity
    && primaryLimitParity
    && developmentLimitParity
    && coverageParity;

  return {
    version: 'V2.78B',
    mode: 'SHADOW_ONLY',
    status: parity ? 'PASS' : 'MISMATCH',
    frontOfficeId: state?.frontOffice?.id || null,
    sport: state?.frontOffice?.sport || null,
    checkedAt: new Date().toISOString(),

    groupCount: groups.length,
    activeGroupCount: activeGroups.length,
    groupKeys: groups.map((group) => group.key),

    defaultGroupKey: defaultGroup?.key || null,
    developmentGroupKeys: developmentGroups.map((group) => group.key),

    playerCount: players.length,
    unresolvedPlayerCount: unresolvedPlayers.length,
    unresolvedPlayerIds: sortedUniqueIdsV278b(unresolvedPlayers),
    unresolvedGroupKeys: [
      ...new Set(unresolvedPlayers.map(rosterGroupKeyForPlayerV278b))
    ].sort(),

    legacy: {
      activeCount: legacyActiveIds.length,
      developmentCount: legacyDevelopmentIds.length,
      capEligibleCount: legacyCapEligibleIds.length,
      activeIds: legacyActiveIds,
      developmentIds: legacyDevelopmentIds,
      capEligibleIds: legacyCapEligibleIds,
      primaryLimit: state?.frontOffice?.rosterLimit ?? null,
      developmentLimit: state?.frontOffice?.minorsLimit ?? null
    },

    configured: {
      lineupEligibleCount: configuredLineupIds.length,
      developmentCount: configuredDevelopmentIds.length,
      capEligibleCount: configuredCapEligibleIds.length,
      lineupEligibleIds: configuredLineupIds,
      developmentIds: configuredDevelopmentIds,
      capEligibleIds: configuredCapEligibleIds,
      primaryLimit: defaultGroup?.playerLimit ?? null,
      developmentLimit: developmentGroup?.playerLimit ?? null
    },

    parity: {
      activeRoster: activeParity,
      developmentRoster: developmentParity,
      capEligibility: capParity,
      depthEligibility: depthEligibilityParity,
      primaryLimit: primaryLimitParity,
      developmentLimit: developmentLimitParity,
      groupCoverage: coverageParity,
      all: parity
    }
  };
}

async function loadRosterGroupShadowV278b(frontOfficeId) {
  if (!frontOfficeId) {
    const diagnostics = {
      version: 'V2.78B',
      mode: 'SHADOW_ONLY',
      status: 'NO_FRONT_OFFICE',
      frontOfficeId: null,
      checkedAt: new Date().toISOString()
    };

    if (typeof state !== 'undefined') {
      state.rosterGroups = [];
      state.rosterGroupShadow = diagnostics;
    }
    return diagnostics;
  }

  const { data, error } = await db
    .from('front_office_roster_groups')
    .select(
      'roster_group_id,front_office_id,group_key,display_name,player_limit,limit_source,counts_toward_cap,lineup_eligible,is_development,is_default,sort_order,is_active,created_at,updated_at'
    )
    .eq('front_office_id', frontOfficeId)
    .order('sort_order')
    .order('group_key');

  if (error) {
    const diagnostics = {
      version: 'V2.78B',
      mode: 'SHADOW_ONLY',
      status: 'ERROR',
      frontOfficeId,
      checkedAt: new Date().toISOString(),
      error: {
        code: error.code || null,
        message: error.message || String(error)
      }
    };

    if (state?.frontOffice?.id === frontOfficeId) {
      state.rosterGroups = [];
      state.rosterGroupShadow = diagnostics;
    }

    console.error(
      '[RosterCap V2.78B] roster-group shadow read failed. Legacy behavior remains authoritative.',
      error
    );

    return diagnostics;
  }

  // A later navigation may have replaced state while the shadow request was
  // in flight. Do not attach stale configuration to a different Front Office.
  if (state?.frontOffice?.id !== frontOfficeId) {
    return {
      version: 'V2.78B',
      mode: 'SHADOW_ONLY',
      status: 'STALE_LOAD_IGNORED',
      frontOfficeId,
      checkedAt: new Date().toISOString()
    };
  }

  const groups = (data || []).map(normalizeRosterGroupRowV278b);
  const diagnostics = buildRosterGroupShadowDiagnosticsV278b(groups);

  state.rosterGroups = groups;
  state.rosterGroupShadow = diagnostics;

  if (diagnostics.parity.all) {
    console.info(
      '[RosterCap V2.78B] roster-group shadow parity PASS',
      diagnostics
    );
  } else {
    console.warn(
      '[RosterCap V2.78B] roster-group shadow parity MISMATCH. Legacy behavior remains authoritative.',
      diagnostics
    );
  }

  return diagnostics;
}

async function refreshRosterGroupShadowV278b() {
  const frontOfficeId = state?.frontOffice?.id || null;
  return loadRosterGroupShadowV278b(frontOfficeId);
}

function currentRosterGroupShadowReportV278b() {
  return state?.rosterGroupShadow || null;
}

function currentRosterGroupsV278b() {
  return Array.isArray(state?.rosterGroups) ? state.rosterGroups : [];
}

function rosterGroupByKeyV278b(groupKey) {
  const key = String(groupKey || '').trim().toUpperCase();
  return currentRosterGroupsV278b().find((group) => group.key === key) || null;
}

function installRosterGroupShadowV278b() {
  if (rosterGroupShadowInstalledV278b) return;

  if (typeof loadOffice !== 'function') {
    console.error(
      '[RosterCap V2.78B] loadOffice() was unavailable when the roster-group shadow integration initialized.'
    );
    return;
  }

  rosterGroupShadowInstalledV278b = true;

  const originalLoadOfficeV278b = loadOffice;

  loadOffice = async function(frontOfficeId, showBusy = true) {
    const result = await originalLoadOfficeV278b(frontOfficeId, showBusy);

    if (state?.frontOffice?.id !== frontOfficeId) {
      return result;
    }

    await loadRosterGroupShadowV278b(frontOfficeId);
    return result;
  };
}

window.RosterCapRosterGroupsShadow = Object.freeze({
  version: 'V2.78B',
  mode: 'SHADOW_ONLY',
  groups: currentRosterGroupsV278b,
  groupByKey: rosterGroupByKeyV278b,
  report: currentRosterGroupShadowReportV278b,
  refresh: refreshRosterGroupShadowV278b
});

installRosterGroupShadowV278b();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', installSportFoundationV277, { once: true });
} else {
  installSportFoundationV277();
}
