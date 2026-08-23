'use strict';

// -----------------------------------------------------------------------------
// RosterCap V2.93 — Compact My Front Offices
//
// Frontend-only picker simplification:
// - card content is identity-only: logo, sport, team name, league name
// - removes picker-only Season / Cap / Active / Minors enrichment reads
// - opening a Front Office still uses the established loadOffice() path
// - New Front Office / global shell behavior remains unchanged
// -----------------------------------------------------------------------------

let officePickerPolishInstalledV268 = false;

function defaultCreateSeasonLabelV277(date = new Date()) {
  const sport = el('sport')?.value || 'NHL';
  const configured = window.RosterCapLeagueConfig?.defaultSeasonLabel?.(sport, date);
  if (configured) return configured;

  // Legacy safety fallback only. Platform rules do not live in this helper.
  const month = date.getMonth();
  const calendarYear = date.getFullYear();
  const startYear = month >= 6 ? calendarYear : calendarYear - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
}

function renderOfficeListV268() {
  if (!officePicker || officePicker.classList.contains('hidden')) return;

  syncOfficePickerGlobalShellV269();
  syncOfficePickerSummaryCopyV269();

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
        <p>Set up the league essentials once, then manage roster, contracts, cap, development, assets and transactions from one workspace.</p>
        <button class="btn btn-primary" type="button" data-create-office-v268>+ New Front Office</button>
      </div>`;

    list.querySelector('[data-create-office-v268]')
      ?.addEventListener('click', showCreateOffice);
    return;
  }

  list.innerHTML = frontOfficeList.map((office) => {
    const teamAccent = normalizeTeamAccent(office.team_accent_color);

    return `
      <button
        class="office-card office-card-v219 office-card-v231 office-card-v268 office-card-v293"
        style="--office-team-accent:${teamAccent}"
        type="button"
        data-open-office="${office.front_office_id}"
        aria-label="Open ${escapeAttr(office.team_name)} Front Office"
      >
        <span class="office-card-mark office-card-mark-v231">
          ${teamLogoInnerHtml({
            url:office.team_logo_url,
            teamName:office.team_name,
            alt:`${office.team_name} logo`
          })}
        </span>

        <span class="office-card-copy office-card-copy-v268">
          <span class="office-sport-chip">${escapeHtml(office.sport || 'NHL')}</span>
          <strong class="office-card-team-v268">${escapeHtml(office.team_name)}</strong>
          <small class="office-card-league-v268">${escapeHtml(office.league_name)}</small>
        </span>
      </button>`;
  }).join('');

  list.querySelectorAll('[data-open-office]').forEach((button) => {
    button.addEventListener('click', () => {
      const selectedOffice = frontOfficeList.find(
        (office) => office.front_office_id === button.dataset.openOffice
      );

      activeView = 'overview';
      rosterMode = window.RosterCapSports?.supportsDepth?.(selectedOffice?.sport)
        ? 'depth'
        : 'grid';
      depthPosition = 'ALL';
      document.body.classList.remove('office-global-context-v269');
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
        .select('front_office_id,team_name,league_name,sport,team_logo_path,team_accent_color,updated_at')
        .eq('is_archived', false)
        .order('updated_at', { ascending: false });

      if (error) throw error;

      frontOfficeList = await hydrateFrontOfficeBranding(data || []);

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
    syncOfficePickerGlobalShellV269();

    const sport = el('sport')?.value || 'NHL';
    const applied = window.RosterCapLeagueConfig?.applyCreateSuggestions?.(sport);

    if (!applied) {
      const seasonInput = el('currentSeason');
      if (seasonInput) seasonInput.value = defaultCreateSeasonLabelV277();
    }

    window.setTimeout(() => el('teamName')?.focus(), 0);
  };
}

// -----------------------------------------------------------------------------
// RosterCap V2.69 — Global landing context
//
// My Front Offices / New Front Office are app-level screens, not an opened
// Front Office. Hide workspace-only navigation/actions there and restore them
// automatically when the actual workspace becomes visible.
// -----------------------------------------------------------------------------
let officePickerGlobalShellInstalledV269 = false;
let officePickerGlobalShellObserverV269 = null;

function isVisibleV269(node) {
  return Boolean(node && !node.classList.contains('hidden'));
}

function isGlobalLandingContextV269() {
  const pickerVisible = isVisibleV269(officePicker);
  const onboardingVisible = isVisibleV269(onboarding);
  const workspaceVisible = isVisibleV269(workspace);

  return Boolean(session?.user)
    && !workspaceVisible
    && (pickerVisible || onboardingVisible);
}

function syncOfficePickerGlobalShellV269() {
  const globalContext = isGlobalLandingContextV269();

  document.body.classList.toggle('office-global-context-v269', globalContext);

  const workspaceOnly = [
    el('workspaceBackBtn'),
    el('backToOfficesBtn'),
    el('exportBtn'),
    el('deleteFrontOfficeBtn')
  ].filter(Boolean);

  workspaceOnly.forEach((node) => {
    node.classList.toggle('office-global-hide-v269', globalContext);
  });

  document.querySelectorAll('.utility-menu-section-label').forEach((label) => {
    if (label.textContent.trim().toLowerCase() === 'front office') {
      label.classList.toggle('office-global-hide-v269', globalContext);
    }
  });
}

function installOfficePickerGlobalShellV269() {
  if (officePickerGlobalShellInstalledV269) return;
  officePickerGlobalShellInstalledV269 = true;

  syncOfficePickerGlobalShellV269();

  officePickerGlobalShellObserverV269 = new MutationObserver(() => {
    syncOfficePickerGlobalShellV269();
  });

  [officePicker, onboarding, workspace].filter(Boolean).forEach((node) => {
    officePickerGlobalShellObserverV269.observe(node, {
      attributes: true,
      attributeFilter: ['class']
    });
  });

  window.addEventListener('pageshow', syncOfficePickerGlobalShellV269);
}

// Small content polish for the picker summary. Does not change the data.
function syncOfficePickerSummaryCopyV269() {
  const summary = document.querySelector('#officePicker .office-picker-summary');
  if (!summary) return;

  const countWrap = summary.querySelector('span:first-child');
  if (countWrap && !countWrap.dataset.v269Copy) {
    countWrap.dataset.v269Copy = 'true';
    const count = el('officeCountLabel');
    if (count) {
      countWrap.childNodes.forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE) node.textContent = ' Front Offices';
      });
    }
  }
}

installOfficePickerGlobalShellV269();
window.requestAnimationFrame(syncOfficePickerSummaryCopyV269);

installOfficePickerPolishV268();
