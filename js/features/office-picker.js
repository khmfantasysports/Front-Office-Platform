'use strict';

// -----------------------------------------------------------------------------
// RosterCap V2.68 — My Front Offices / landing polish
//
// Frontend-only enhancement:
// - enriches office cards with current season/cap + Active/Minors counts
// - preserves the existing full loadOffice() path
// - adds a Back action to New Front Office
// - uses a dynamic default NHL season
// -----------------------------------------------------------------------------

let officePickerPolishInstalledV268 = false;

function defaultNhlSeasonLabelV268(date = new Date()) {
  const month = date.getMonth();
  const calendarYear = date.getFullYear();
  const startYear = month >= 6 ? calendarYear : calendarYear - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
}

function formatOfficePickerCapV268(value, currency = '') {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return 'Not set';

  const amount = Number(value);
  let formatted = '';

  if (Math.abs(amount) >= 1000000000) {
    formatted = `$${(amount / 1000000000).toFixed(1).replace(/\.0$/, '')}B`;
  } else if (Math.abs(amount) >= 1000000) {
    formatted = `$${(amount / 1000000).toFixed(1).replace(/\.0$/, '')}M`;
  } else if (Math.abs(amount) >= 1000) {
    formatted = `$${Math.round(amount / 1000)}K`;
  } else {
    formatted = `$${Math.round(amount).toLocaleString()}`;
  }

  return currency ? `${formatted} ${currency}` : formatted;
}

function officePickerRosterValueV268(count, limit) {
  const safeCount = Number.isFinite(Number(count)) ? Number(count) : 0;
  if (limit === null || limit === undefined || !Number.isFinite(Number(limit))) {
    return String(safeCount);
  }
  return `${safeCount} / ${Number(limit)}`;
}

async function enrichFrontOfficePickerListV268(offices) {
  const officeIds = offices
    .map((office) => office.front_office_id)
    .filter(Boolean);

  if (!officeIds.length) return offices;

  const [seasonsResult, rosterResult] = await Promise.all([
    db.from('front_office_seasons')
      .select('front_office_id,season_start_year,salary_cap,is_current')
      .in('front_office_id', officeIds)
      .order('season_start_year'),
    db.from('roster_entries')
      .select('front_office_id,roster_group')
      .in('front_office_id', officeIds)
      .is('removed_at', null)
  ]);

  if (seasonsResult.error) {
    console.warn('Front Office picker season context could not load', seasonsResult.error);
  }

  if (rosterResult.error) {
    console.warn('Front Office picker roster counts could not load', rosterResult.error);
  }

  const seasonsByOffice = new Map();
  (seasonsResult.data || []).forEach((season) => {
    if (!seasonsByOffice.has(season.front_office_id)) {
      seasonsByOffice.set(season.front_office_id, []);
    }
    seasonsByOffice.get(season.front_office_id).push(season);
  });

  const rosterCounts = new Map();
  (rosterResult.data || []).forEach((entry) => {
    if (!rosterCounts.has(entry.front_office_id)) {
      rosterCounts.set(entry.front_office_id, { active:0, minors:0 });
    }

    const counts = rosterCounts.get(entry.front_office_id);
    const group = String(entry.roster_group || 'ACTIVE').toUpperCase();

    if (group === 'FARM') counts.minors += 1;
    else counts.active += 1;
  });

  return offices.map((office) => {
    const seasons = seasonsByOffice.get(office.front_office_id) || [];
    const currentSeason = seasons.find((season) => season.is_current) || seasons[0] || null;
    const counts = rosterCounts.get(office.front_office_id) || { active:0, minors:0 };

    return {
      ...office,
      picker_current_season_start_year:
        currentSeason?.season_start_year === null || currentSeason?.season_start_year === undefined
          ? null
          : Number(currentSeason.season_start_year),
      picker_current_salary_cap:
        currentSeason?.salary_cap === null || currentSeason?.salary_cap === undefined
          ? null
          : Number(currentSeason.salary_cap),
      picker_active_count: counts.active,
      picker_minors_count: counts.minors
    };
  });
}

function renderOfficeListV268() {
  if (!officePicker || officePicker.classList.contains('hidden')) return;

  const list = el('officeList');
  const countLabel = el('officeCountLabel');
  if (countLabel) countLabel.textContent = frontOfficeList.length;

  if (!frontOfficeList.length) {
    list.innerHTML = `
      <div class="office-empty-state office-empty-state-v268">
        <div class="office-empty-mark office-empty-mark-v231">
          <img src="./assets/rostercap-mark.svg" alt="" />
        </div>
        <h3>Create your first Front Office</h3>
        <p>Set up the league essentials once, then manage roster, contracts, cap, minors, assets and transactions from one workspace.</p>
        <button class="btn btn-primary" type="button" data-create-office-v268>+ New Front Office</button>
      </div>`;

    list.querySelector('[data-create-office-v268]')?.addEventListener('click', showCreateOffice);
    return;
  }

  list.innerHTML = frontOfficeList.map((office, index) => {
    const updated = office.updated_at ? formatDateTime(office.updated_at) : 'Recently';
    const teamAccent = normalizeTeamAccent(office.team_accent_color);
    const season = office.picker_current_season_start_year
      ? seasonLabel(office.picker_current_season_start_year)
      : 'Not set';
    const cap = formatOfficePickerCapV268(
      office.picker_current_salary_cap,
      office.currency_code || ''
    );
    const active = officePickerRosterValueV268(
      office.picker_active_count,
      office.roster_limit
    );
    const minors = officePickerRosterValueV268(
      office.picker_minors_count,
      office.minors_limit
    );

    return `
      <button
        class="office-card office-card-v219 office-card-v231 office-card-v268"
        style="--office-team-accent:${teamAccent}"
        type="button"
        data-open-office="${office.front_office_id}"
      >
        <span class="office-card-mark office-card-mark-v231">
          ${teamLogoInnerHtml({
            url:office.team_logo_url,
            teamName:office.team_name,
            alt:`${office.team_name} logo`
          })}
        </span>

        <span class="office-card-copy office-card-copy-v268">
          <span class="office-card-topline">
            <span class="office-card-chip-row-v268">
              <span class="office-sport-chip">${escapeHtml(office.sport || 'NHL')}</span>
              ${index === 0 ? '<span class="office-recent-chip-v268">Most recent</span>' : ''}
            </span>
            <span class="office-updated">Updated ${escapeHtml(updated)}</span>
          </span>

          <strong class="office-card-team-v268">${escapeHtml(office.team_name)}</strong>
          <small class="office-card-league-v268">${escapeHtml(office.league_name)}</small>

          <span class="office-card-context-v268" aria-label="Front Office summary">
            <span>
              <small>Season</small>
              <strong>${escapeHtml(season)}</strong>
            </span>
            <span>
              <small>Cap</small>
              <strong>${escapeHtml(cap)}</strong>
            </span>
            <span>
              <small>Active</small>
              <strong>${escapeHtml(active)}</strong>
            </span>
            <span>
              <small>Minors</small>
              <strong>${escapeHtml(minors)}</strong>
            </span>
          </span>
        </span>

        <span class="office-open-v219 office-open-v268" aria-hidden="true">›</span>
      </button>`;
  }).join('');

  list.querySelectorAll('[data-open-office]').forEach((button) => {
    button.addEventListener('click', () => {
      activeView = 'overview';
      rosterMode = 'depth';
      depthPosition = 'ALL';
      loadOffice(button.dataset.openOffice);
    });
  });
}

function ensureCreateOfficeBackActionV268() {
  const form = el('frontOfficeForm');
  const actions = form?.querySelector('.form-actions');
  if (!actions || el('cancelCreateOfficeBtnV268')) return;

  actions.classList.add('create-office-actions-v268');

  const cancel = document.createElement('button');
  cancel.id = 'cancelCreateOfficeBtnV268';
  cancel.className = 'btn btn-ghost';
  cancel.type = 'button';
  cancel.textContent = 'Back to My Front Offices';
  cancel.addEventListener('click', () => showOfficePicker(false, false));

  actions.insertBefore(cancel, actions.firstChild);
}

function installOfficePickerPolishV268() {
  if (officePickerPolishInstalledV268) return;
  officePickerPolishInstalledV268 = true;

  ensureCreateOfficeBackActionV268();

  loadFrontOffices = async function(showPicker = true) {
    await runCloudAction(async () => {
      const { data, error } = await db.from('front_offices')
        .select('front_office_id,team_name,league_name,sport,currency_code,roster_limit,minors_limit,team_logo_path,team_accent_color,updated_at')
        .eq('is_archived', false)
        .order('updated_at', { ascending: false });

      if (error) throw error;

      const brandedOffices = await hydrateFrontOfficeBranding(data || []);
      frontOfficeList = await enrichFrontOfficePickerListV268(brandedOffices);

      if (showPicker) {
        state = emptyState();
        showOfficePicker(false);
      }
    }, false);
  };

  renderOfficeList = renderOfficeListV268;

  const originalShowCreateOfficeV268 = showCreateOffice;
  showCreateOffice = function() {
    originalShowCreateOfficeV268();
    ensureCreateOfficeBackActionV268();

    const seasonInput = el('currentSeason');
    if (seasonInput) seasonInput.value = defaultNhlSeasonLabelV268();

    window.setTimeout(() => el('teamName')?.focus(), 0);
  };
}

installOfficePickerPolishV268();
