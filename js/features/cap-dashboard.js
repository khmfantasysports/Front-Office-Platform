'use strict';

// RosterCap V3.14.0 — shared cap dashboard presentation.
//
// Presentation only.
// Every value comes from the existing calculateSeason(), deadCapForSeason(),
// contractHorizonSeasons(), activeRosterPlayers() and Front Office settings.

const ROSTERCAP_CAP_DASHBOARD_VERSION_V3140 = '3.14.0';

function capDashboardToneV3140(calc) {
  if (!calc || !calc.complete || calc.salaryCap === null) return 'warning';
  if (calc.capSpace < 0) return 'danger';
  if (calc.salaryCap > 0 && calc.capUsed / calc.salaryCap >= 0.95) return 'warning';
  return 'good';
}

function capDashboardSnapshotV3140(season) {
  const calc = calculateSeason(season.id);
  const salaryCap = calc.salaryCap;
  const deadCap = deadCapForSeason(season.id);
  const used = calc.complete ? calc.capUsed : calc.knownCapUsed;
  const remaining = calc.complete && salaryCap !== null
    ? calc.capSpace
    : null;

  const rawPct = salaryCap && salaryCap > 0
    ? (calc.knownCapUsed / salaryCap) * 100
    : 0;

  return {
    season,
    calc,
    salaryCap,
    deadCap,
    used,
    remaining,
    rawPct,
    pct:Math.max(0, Math.min(100, rawPct)),
    tone:capDashboardToneV3140(calc)
  };
}

function capDashboardPrimaryV3140(snapshot) {
  if (snapshot.salaryCap === null) {
    return {
      value:'Not set',
      label:'Salary cap'
    };
  }

  if (!snapshot.calc.complete || snapshot.remaining === null) {
    return {
      value:formatMoney(snapshot.calc.knownCapUsed),
      label:'Known cap used'
    };
  }

  if (snapshot.remaining < 0) {
    return {
      value:formatMoney(Math.abs(snapshot.remaining)),
      label:'Over cap'
    };
  }

  return {
    value:formatMoney(snapshot.remaining),
    label:'Cap space'
  };
}

function capDashboardRosterTextV3140() {
  const active = activeRosterPlayers().length;
  const limit = state.frontOffice?.rosterLimit;

  if (limit === null || limit === undefined) {
    return `${active} active`;
  }

  return `${active} / ${limit} roster`;
}

function capDashboardYearCellV3140(season, fallbackMax = 1) {
  const snapshot = capDashboardSnapshotV3140(season);
  const shortSeason =
    `${String(season.startYear).slice(2)}-${String((season.startYear + 1) % 100).padStart(2, '0')}`;

  const basisPct = snapshot.salaryCap && snapshot.salaryCap > 0
    ? (snapshot.calc.knownCapUsed / snapshot.salaryCap) * 100
    : (snapshot.calc.knownCapUsed / fallbackMax) * 100;

  const width = snapshot.calc.knownCapUsed === 0
    ? 3
    : Math.max(6, Math.min(100, Math.round(basisPct)));

  let footer = 'Cap incomplete';
  if (snapshot.salaryCap === null) {
    footer = 'Cap not set';
  } else if (snapshot.calc.complete && snapshot.remaining !== null) {
    footer = snapshot.remaining < 0
      ? `${formatMoney(Math.abs(snapshot.remaining))} over`
      : `${formatMoney(snapshot.remaining)} left`;
  }

  return `<div class="rc-year-cell-v3140 ${snapshot.tone}">
    <span class="rc-year-label-v3140">${escapeHtml(shortSeason)}</span>
    <strong>${escapeHtml(formatMoney(snapshot.used))}</strong>
    <div class="rc-year-track-v3140" aria-hidden="true">
      <span style="width:${width}%"></span>
    </div>
    <small>${escapeHtml(footer)}</small>
  </div>`;
}

function renderCapDashboardV3140(options = {}) {
  const season = options.season || currentSeason();
  if (!season) return '';

  const snapshot = capDashboardSnapshotV3140(season);
  const primary = capDashboardPrimaryV3140(snapshot);
  const horizon = contractHorizonSeasons();
  const yearCount = Math.max(1, Math.min(
    Number(options.yearCount || 3),
    horizon.length || 1
  ));
  const shown = horizon.slice(0, yearCount);
  const fallbackMax = Math.max(
    1,
    ...shown.map((item) => Math.max(0, calculateSeason(item.id).knownCapUsed))
  );

  const percentLabel = snapshot.salaryCap === null
    ? '—'
    : `${Math.round(snapshot.rawPct)}%`;

  const capLimit = snapshot.salaryCap === null
    ? 'Not set'
    : formatMoney(snapshot.salaryCap);

  const usedLabel = snapshot.calc.complete
    ? formatMoney(snapshot.used)
    : `${formatMoney(snapshot.calc.knownCapUsed)} known`;

  const primaryTone = snapshot.remaining !== null && snapshot.remaining < 0
    ? 'danger'
    : snapshot.tone;

  return `<section class="rc-cap-dashboard-v3140 ${options.context === 'cap' ? 'cap-page' : 'overview'}">
    <article class="rc-cap-space-card-v3140 tone-${snapshot.tone}">
      <div class="rc-cap-card-head-v3140">
        <div>
          <p class="eyebrow">Cap Space</p>
          <span>${escapeHtml(seasonLabel(season.startYear))}</span>
        </div>
        <small>${escapeHtml(capDashboardRosterTextV3140())}</small>
      </div>

      <div class="rc-cap-space-body-v3140">
        <div class="rc-cap-primary-v3140">
          <strong class="${primaryTone}">${escapeHtml(primary.value)}</strong>
          <span>${escapeHtml(primary.label)}</span>
        </div>

        <div
          class="rc-cap-ring-v3140 tone-${snapshot.tone}"
          style="--rc-cap-pct:${snapshot.pct}"
          aria-label="${escapeAttr(percentLabel)} of salary cap used"
        >
          <div>
            <strong>${escapeHtml(percentLabel)}</strong>
            <span>Cap Used</span>
          </div>
        </div>
      </div>

      <div class="rc-cap-mini-strip-v3140">
        <span><small>Used</small><strong>${escapeHtml(usedLabel)}</strong></span>
        <span><small>Dead</small><strong>${escapeHtml(formatMoney(snapshot.deadCap))}</strong></span>
        <span><small>Limit</small><strong>${escapeHtml(capLimit)}</strong></span>
      </div>
    </article>

    <article class="rc-year-breakdown-card-v3140">
      <div class="rc-cap-card-head-v3140">
        <div>
          <p class="eyebrow">Year Breakdown</p>
          <span>Known cap commitments</span>
        </div>
      </div>
      <div
        class="rc-year-breakdown-v3140"
        style="--rc-year-count:${shown.length}"
      >
        ${shown.map((item) => capDashboardYearCellV3140(item, fallbackMax)).join('')}
      </div>
    </article>
  </section>`;
}

function renderCapHorizonV3140() {
  const horizon = contractHorizonSeasons();
  if (!horizon.length) return '';

  const fallbackMax = Math.max(
    1,
    ...horizon.map((item) => Math.max(0, calculateSeason(item.id).knownCapUsed))
  );

  return `<div
    class="rc-cap-horizon-scroll-v3140"
    role="region"
    aria-label="Seven-season cap commitment horizon. Swipe horizontally to view future seasons."
    tabindex="0"
  >
    <div class="rc-cap-horizon-v3140">
      ${horizon.map((item) => capDashboardYearCellV3140(item, fallbackMax)).join('')}
    </div>
  </div>`;
}

document.documentElement.dataset.rostercapCapDashboard =
  ROSTERCAP_CAP_DASHBOARD_VERSION_V3140;
