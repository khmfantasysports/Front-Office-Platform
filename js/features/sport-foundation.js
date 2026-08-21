'use strict';

// -----------------------------------------------------------------------------
// RosterCap V2.77 — League configuration foundation
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
// -----------------------------------------------------------------------------

const ROSTERCAP_SPORT_FOUNDATION_VERSION = 'V2.77';

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

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', installSportFoundationV277, { once: true });
} else {
  installSportFoundationV277();
}
