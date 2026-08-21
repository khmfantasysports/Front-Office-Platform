'use strict';

// -----------------------------------------------------------------------------
// RosterCap V2.71 — Multi-sport foundation
//
// Purpose:
// - establish one frontend sport registry at the Front Office boundary
// - keep NHL as the only operational sport in this release
// - expose NFL / NBA / MLB as planned without allowing partially-supported
//   Front Offices to be created
// - preserve the current NHL season default and existing backend contracts
//
// This file does not:
// - change Supabase schema/RLS/RPCs
// - change roster/depth behavior
// - change contract/cap formulas
// - change transaction rules
// - define fantasy roster-slot counts for any sport
// -----------------------------------------------------------------------------

const ROSTERCAP_SPORT_FOUNDATION_VERSION = 'V2.71';

const ROSTERCAP_SPORTS = Object.freeze({
  NHL: Object.freeze({
    code: 'NHL',
    label: 'NHL',
    status: 'OPERATIONAL',
    order: 1,
    season: Object.freeze({
      storage: 'season_start_year',
      display: 'SPLIT_YEAR',
      inputPattern: 'YYYY-YY'
    }),
    terminology: Object.freeze({
      proTeam: 'NHL team',
      developmentRoster: 'Minors'
    })
  }),
  NFL: Object.freeze({
    code: 'NFL',
    label: 'NFL',
    status: 'PLANNED',
    order: 2,
    season: null,
    terminology: null
  }),
  NBA: Object.freeze({
    code: 'NBA',
    label: 'NBA',
    status: 'PLANNED',
    order: 3,
    season: null,
    terminology: null
  }),
  MLB: Object.freeze({
    code: 'MLB',
    label: 'MLB',
    status: 'PLANNED',
    order: 4,
    season: null,
    terminology: null
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

function defaultNhlSeasonLabelV271(date = new Date()) {
  // Preserve the existing RosterCap NHL default exactly:
  // July through June is treated as the same NHL season start year.
  const month = date.getMonth();
  const calendarYear = date.getFullYear();
  const startYear = month >= 6 ? calendarYear : calendarYear - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
}

function defaultRosterCapSeasonLabel(sport, date = new Date()) {
  const preset = getRosterCapSport(sport);
  if (preset.code === 'NHL') return defaultNhlSeasonLabelV271(date);

  // Planned sports intentionally return no season default until their
  // season/storage contracts have been traced and implemented.
  return '';
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

function syncCreateOfficeSportOptionsV271() {
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

function installSportFoundationV271() {
  syncCreateOfficeSportOptionsV271();

  document.documentElement.dataset.rostercapSportFoundation =
    ROSTERCAP_SPORT_FOUNDATION_VERSION;
}

window.RosterCapSports = Object.freeze({
  version: ROSTERCAP_SPORT_FOUNDATION_VERSION,
  sports: ROSTERCAP_SPORTS,
  normalize: normalizeRosterCapSport,
  get: getRosterCapSport,
  isOperational: isRosterCapSportOperational,
  list: rosterCapSportList,
  current: currentRosterCapSport,
  defaultSeasonLabel: defaultRosterCapSeasonLabel,
  syncCreateOfficeOptions: syncCreateOfficeSportOptionsV271
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', installSportFoundationV271, { once: true });
} else {
  installSportFoundationV271();
}
