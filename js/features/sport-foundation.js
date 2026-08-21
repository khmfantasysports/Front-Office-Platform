'use strict';

// -----------------------------------------------------------------------------
// RosterCap V2.79 — Multi-sport early-access foundation
//
// Architecture:
// - Sport provides templates/options, not permanent platform rules.
// - Saved Front Office configuration remains authoritative.
// - NHL, NFL, NBA and MLB can now be created for early-access testing.
// - NHL keeps its current full experience.
// - NFL/NBA/MLB use sport-aware creation/player inputs plus the generic Cap Grid
//   while their configurable lineup/depth layouts are still being built.
// - V2.78B roster-group parity diagnostics remain installed.
//
// This release intentionally does NOT:
// - change Supabase tables, columns, RPC signatures or RLS
// - make any sport's suggested roster/cap values permanent rules
// - enable sport-specific import adapters for NFL/NBA/MLB
// - pretend the hockey depth renderer is valid for other sports
// - change transaction formulas
// - change existing NHL behavior
// -----------------------------------------------------------------------------

const ROSTERCAP_SPORT_FOUNDATION_VERSION = 'V2.79';

const ROSTERCAP_SPORTS = Object.freeze({
  NHL: Object.freeze({
    code: 'NHL',
    label: 'NHL',
    status: 'OPERATIONAL',
    order: 1,
    suggestedTemplateKey: 'CURRENT_HOCKEY',
    player: Object.freeze({
      positions: Object.freeze(['C', 'LW', 'RW', 'F', 'D', 'G']),
      eligiblePlaceholder: 'C,LW',
      teamLabel: 'NHL team',
      teamPlaceholder: 'EDM'
    }),
    terminology: Object.freeze({
      primaryRoster: 'Active roster',
      developmentRoster: 'Minors'
    })
  }),
  NFL: Object.freeze({
    code: 'NFL',
    label: 'NFL',
    status: 'EARLY_ACCESS',
    order: 2,
    suggestedTemplateKey: 'NFL_STARTER',
    player: Object.freeze({
      positions: Object.freeze([
        'QB', 'RB', 'WR', 'TE', 'FB',
        'OL', 'DL', 'EDGE', 'LB', 'CB', 'S', 'K', 'P'
      ]),
      eligiblePlaceholder: 'RB,WR',
      teamLabel: 'NFL team',
      teamPlaceholder: 'BUF'
    }),
    terminology: Object.freeze({
      primaryRoster: 'Active roster',
      developmentRoster: 'Development'
    })
  }),
  NBA: Object.freeze({
    code: 'NBA',
    label: 'NBA',
    status: 'EARLY_ACCESS',
    order: 3,
    suggestedTemplateKey: 'NBA_STARTER',
    player: Object.freeze({
      positions: Object.freeze(['PG', 'SG', 'SF', 'PF', 'C']),
      eligiblePlaceholder: 'PG,SG',
      teamLabel: 'NBA team',
      teamPlaceholder: 'TOR'
    }),
    terminology: Object.freeze({
      primaryRoster: 'Active roster',
      developmentRoster: 'Development'
    })
  }),
  MLB: Object.freeze({
    code: 'MLB',
    label: 'MLB',
    status: 'EARLY_ACCESS',
    order: 4,
    suggestedTemplateKey: 'MLB_STARTER',
    player: Object.freeze({
      positions: Object.freeze([
        'C', '1B', '2B', '3B', 'SS',
        'LF', 'CF', 'RF', 'OF', 'DH',
        'SP', 'RP', 'P'
      ]),
      eligiblePlaceholder: '2B,SS',
      teamLabel: 'MLB team',
      teamPlaceholder: 'TOR'
    }),
    terminology: Object.freeze({
      primaryRoster: 'Active roster',
      developmentRoster: 'Minors'
    })
  })
});

// Templates initialize editable creation fields only.
// Blank cap/roster values for early-access sports deliberately avoid inventing
// league rules. Users can enter the values that match their fantasy league.
const ROSTERCAP_SETUP_TEMPLATES = Object.freeze({
  CURRENT_HOCKEY: Object.freeze({
    key: 'CURRENT_HOCKEY',
    label: 'Current hockey setup',
    sport: 'NHL',
    suggestions: Object.freeze({
      seasonDisplay: 'SPLIT_YEAR',
      seasonBoundaryMonth: 6,
      seasonCount: 7,
      currency: 'USD',
      rosterLimit: 30,
      salaryCap: 119600000
    })
  }),
  NFL_STARTER: Object.freeze({
    key: 'NFL_STARTER',
    label: 'NFL starter',
    sport: 'NFL',
    suggestions: Object.freeze({
      seasonDisplay: 'CALENDAR_YEAR',
      seasonCount: 7,
      currency: 'USD',
      rosterLimit: null,
      salaryCap: null
    })
  }),
  NBA_STARTER: Object.freeze({
    key: 'NBA_STARTER',
    label: 'NBA starter',
    sport: 'NBA',
    suggestions: Object.freeze({
      seasonDisplay: 'SPLIT_YEAR',
      seasonBoundaryMonth: 6,
      seasonCount: 7,
      currency: 'USD',
      rosterLimit: null,
      salaryCap: null
    })
  }),
  MLB_STARTER: Object.freeze({
    key: 'MLB_STARTER',
    label: 'MLB starter',
    sport: 'MLB',
    suggestions: Object.freeze({
      seasonDisplay: 'CALENDAR_YEAR',
      seasonCount: 7,
      currency: 'USD',
      rosterLimit: null,
      salaryCap: null
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
  return ['OPERATIONAL', 'EARLY_ACCESS'].includes(getRosterCapSport(value).status);
}

function isRosterCapSportEarlyAccess(value) {
  return getRosterCapSport(value).status === 'EARLY_ACCESS';
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

function formatRosterCapSeasonStart(startYear, sport) {
  const suggestions = rosterCapTemplateSuggestions(sport);
  if (suggestions?.seasonDisplay === 'CALENDAR_YEAR') {
    return calendarYearLabel(startYear);
  }
  return splitYearLabel(startYear);
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
    } else if (sport.status === 'EARLY_ACCESS') {
      option.textContent = `${sport.label} — early access`;
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
  installMultiSportUiV279();

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
  isEarlyAccess: isRosterCapSportEarlyAccess,
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
  formatSeasonStart: formatRosterCapSeasonStart,
  parseSeasonInput: parseRosterCapSeasonInput,
  seasonInputHelp: rosterCapSeasonInputHelp,
  creationSeasonCount: rosterCapCreationSeasonCount,
  resolveSaved: resolveRosterCapSavedLeagueConfiguration
});




// -----------------------------------------------------------------------------
// RosterCap V2.79 — early-access sport UI compatibility
// -----------------------------------------------------------------------------

let multiSportUiInstalledV279 = false;
let legacySeasonLabelV279 = null;
let legacyParseSeasonStartV279 = null;

function sportPlayerConfigV279(sport) {
  return getRosterCapSport(sport).player || getRosterCapSport('NHL').player;
}

function sportTerminologyV279(sport) {
  return getRosterCapSport(sport).terminology || getRosterCapSport('NHL').terminology;
}

function selectedCreateSportV279() {
  return normalizeRosterCapSport(document.getElementById('sport')?.value || 'NHL');
}

function activeWorkspaceSportV279() {
  return normalizeRosterCapSport(
    (typeof state !== 'undefined' && state?.frontOffice?.sport)
      || selectedCreateSportV279()
      || 'NHL'
  );
}

function syncCreateSeasonInputV279() {
  const sport = selectedCreateSportV279();
  const input = document.getElementById('currentSeason');
  if (!input) return;

  const display = rosterCapTemplateSuggestions(sport)?.seasonDisplay || 'SPLIT_YEAR';

  if (display === 'CALENDAR_YEAR') {
    input.pattern = '\\d{4}';
    input.placeholder = '2026';
    input.title = 'Use a season in the format 2026.';
  } else {
    input.pattern = '\\d{4}-\\d{2}';
    input.placeholder = '2026-27';
    input.title = 'Use a season in the format 2026-27.';
  }
}

function ensureSportEarlyAccessNoteV279() {
  const form = document.getElementById('frontOfficeForm');
  if (!form) return null;

  let note = document.getElementById('sportEarlyAccessNoteV279');
  if (note) return note;

  note = document.createElement('small');
  note.id = 'sportEarlyAccessNoteV279';
  note.style.display = 'block';
  note.style.marginTop = '8px';
  note.style.color = 'var(--muted)';
  note.style.lineHeight = '1.4';

  const sportSelect = document.getElementById('sport');
  const section = sportSelect?.closest('.form-section');
  if (section) section.appendChild(note);

  return note;
}

function syncCreateSportUiV279(options = {}) {
  const sport = selectedCreateSportV279();

  if (options.applySuggestions !== false) {
    window.RosterCapLeagueConfig?.applyCreateSuggestions?.(sport);
  }

  syncCreateSeasonInputV279();

  const note = ensureSportEarlyAccessNoteV279();
  if (note) {
    note.textContent = isRosterCapSportEarlyAccess(sport)
      ? `${sport} is available for early testing. Player entry, contracts, cap and the generic roster grid can be tested now; sport-specific lineup/depth and import adapters are still being built.`
      : 'These are editable starting values. Your saved Front Office settings remain authoritative.';
  }
}

function setLabelTextForInputV279(input, text) {
  const label = input?.closest('label');
  if (!label) return;

  const textNode = [...label.childNodes].find(
    (node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim()
  );

  if (textNode) {
    textNode.textContent = `\n            ${text}\n            `;
  }
}

function syncPlayerEditorForSportV279() {
  const sport = activeWorkspaceSportV279();
  const config = sportPlayerConfigV279(sport);
  const terminology = sportTerminologyV279(sport);

  const position = document.getElementById('playerPosition');
  if (position) {
    const current = String(position.value || '').trim().toUpperCase();
    position.replaceChildren();

    config.positions.forEach((value) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      position.appendChild(option);
    });

    if (current && !config.positions.includes(current)) {
      const existing = document.createElement('option');
      existing.value = current;
      existing.textContent = current;
      position.appendChild(existing);
    }

    position.value = current && [...position.options].some((o) => o.value === current)
      ? current
      : config.positions[0];
  }

  const eligible = document.getElementById('playerEligible');
  if (eligible) eligible.placeholder = config.eligiblePlaceholder;

  const team = document.getElementById('realTeam');
  if (team) {
    team.placeholder = config.teamPlaceholder;
    setLabelTextForInputV279(team, config.teamLabel);
  }

  const rosterGroup = document.getElementById('playerRosterGroup');
  if (rosterGroup) {
    const primary = rosterGroup.querySelector('option[value="ACTIVE"]');
    const development = rosterGroup.querySelector('option[value="FARM"]');
    if (primary) primary.textContent = terminology.primaryRoster;
    if (development) development.textContent = terminology.developmentRoster;
  }
}

function syncWorkspaceSportUiV279() {
  const sport = activeWorkspaceSportV279();
  const terminology = sportTerminologyV279(sport);
  const earlyAccess = isRosterCapSportEarlyAccess(sport);

  document.documentElement.dataset.rostercapSport = sport;
  document.documentElement.dataset.rostercapSportMode =
    earlyAccess ? 'EARLY_ACCESS' : 'OPERATIONAL';

  document.querySelectorAll('.nav-tab[data-view="farm"]').forEach((button) => {
    button.textContent = terminology.developmentRoster;
  });

  if (typeof rosterMode !== 'undefined' && earlyAccess) {
    rosterMode = 'grid';
  }

  syncPlayerEditorForSportV279();
}

function installSportAwareSeasonHelpersV279() {
  if (typeof seasonLabel === 'function' && !legacySeasonLabelV279) {
    legacySeasonLabelV279 = seasonLabel;
    seasonLabel = function(startYear) {
      const sport = activeWorkspaceSportV279();
      const formatted = formatRosterCapSeasonStart(startYear, sport);
      return formatted || legacySeasonLabelV279(startYear);
    };
  }

  if (typeof parseSeasonStart === 'function' && !legacyParseSeasonStartV279) {
    legacyParseSeasonStartV279 = parseSeasonStart;
    parseSeasonStart = function(value) {
      const sport = activeWorkspaceSportV279();
      const parsed = parseRosterCapSeasonInput(value, sport);
      return parsed?.startYear ?? legacyParseSeasonStartV279(value);
    };
  }
}

function installPlayerDialogSportAdapterV279() {
  if (typeof openPlayerDialog !== 'function') return;

  const originalOpenPlayerDialogV279 = openPlayerDialog;
  openPlayerDialog = function(...args) {
    const result = originalOpenPlayerDialogV279(...args);
    syncPlayerEditorForSportV279();
    return result;
  };
}

function installRosterEarlyAccessAdapterV279() {
  if (typeof renderRoster !== 'function') return;

  const originalRenderRosterV279 = renderRoster;
  renderRoster = function(...args) {
    const sport = activeWorkspaceSportV279();
    if (isRosterCapSportEarlyAccess(sport) && typeof rosterMode !== 'undefined') {
      rosterMode = 'grid';
    }

    const result = originalRenderRosterV279(...args);

    const depthButton = document.getElementById('rosterDepthModeBtn');
    if (depthButton) {
      depthButton.classList.toggle(
        'hidden',
        isRosterCapSportEarlyAccess(sport)
      );
    }

    return result;
  };
}

function installMultiSportUiV279() {
  if (multiSportUiInstalledV279) return;
  multiSportUiInstalledV279 = true;

  installSportAwareSeasonHelpersV279();
  installPlayerDialogSportAdapterV279();
  installRosterEarlyAccessAdapterV279();

  const sportSelect = document.getElementById('sport');
  sportSelect?.addEventListener('change', () => {
    syncCreateSportUiV279({ applySuggestions: true });
  });

  syncCreateSportUiV279({ applySuggestions: false });
  syncWorkspaceSportUiV279();
}

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

    syncWorkspaceSportUiV279();
    await loadRosterGroupShadowV278b(frontOfficeId);
    syncWorkspaceSportUiV279();
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
