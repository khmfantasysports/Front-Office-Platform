'use strict';

// Overview dashboard rendering.

function capTone(calc) {
  if (!calc.complete || calc.salaryCap === null) return 'warning';
  if (calc.capSpace < 0) return 'danger';
  if (calc.salaryCap > 0 && calc.capUsed / calc.salaryCap >= 0.95) return 'warning';
  return 'good';
}

function renderSummaryCards() {
  const season = currentSeason();
  const calc = calculateSeason(season.id);
  const rosterLimit = state.frontOffice.rosterLimit;
  const expiring = state.players.filter((p) => p.contractEndSeasonId === season.id).length;
  const deadCap = state.adjustments
    .filter((a) => a.seasonId === season.id)
    .reduce((sum, a) => sum + a.amount, 0);

  const capSpaceValue = calc.complete && calc.salaryCap !== null ? formatMoney(calc.capSpace) : 'Incomplete';
  const capSpaceSub = calc.missingPlayerIds.length ? `${calc.missingPlayerIds.length} missing salary` : 'Current cap result';
  const capState = capTone(calc);
  const activeCount = activeRosterPlayers().length;
  const rosterState = rosterLimit && activeCount > rosterLimit ? 'danger' : 'neutral';

  el('summaryCards').innerHTML = [
    summaryCard('Cap Used', calc.complete ? formatMoney(calc.capUsed) : `${formatMoney(calc.knownCapUsed)} known`, calc.complete ? 'Complete' : 'Incomplete', capState),
    summaryCard('Cap Space', capSpaceValue, capSpaceSub, capState),
    summaryCard('Players', `${activeCount}${rosterLimit ? ` / ${rosterLimit}` : ''}`, `${farmSystemPlayers().length} minors`, rosterState),
    summaryCard('Expiring', String(expiring), seasonLabel(season.startYear), expiring > 0 ? 'warning' : 'neutral'),
    summaryCard('Dead Cap', formatMoney(deadCap), seasonLabel(season.startYear), deadCap > 0 ? 'warning' : 'neutral')
  ].join('');
}

function summaryCard(label, value, subvalue, tone = 'neutral') {
  return `<article class="summary-card tone-${tone}"><div class="label">${escapeHtml(label)}</div><div class="value semantic-value">${escapeHtml(value)}</div><div class="subvalue">${escapeHtml(subvalue)}</div></article>`;
}

function renderCapVisuals() {
  const season = currentSeason();
  const calc = calculateSeason(season.id);
  const tone = capTone(calc);
  const salaryCap = calc.salaryCap;
  const capUsed = calc.complete ? calc.capUsed : calc.knownCapUsed;
  const capRemaining = calc.complete && salaryCap !== null ? calc.capSpace : null;
  const rawPct = salaryCap && salaryCap > 0 ? (calc.knownCapUsed / salaryCap) * 100 : 0;
  const displayPct = Math.max(0, Math.min(100, rawPct));
  const currentStatus = calc.complete
    ? (calc.capSpace < 0 ? `<span class="danger">${formatMoney(Math.abs(calc.capSpace))} over cap</span>` : `<span class="good">${formatMoney(calc.capSpace)} cap remaining</span>`)
    : '<span class="warning">Cap total incomplete</span>';

  const horizon = contractHorizonSeasons();
  const points = horizon.map((s) => ({ season:s, calc:calculateSeason(s.id) }));
  const maxUsed = Math.max(1, ...points.map((p) => Math.max(0, p.calc.knownCapUsed)));
  const trend = points.map((p) => {
    const value = Math.max(0, p.calc.knownCapUsed);
    const height = value === 0 ? 3 : Math.max(8, Math.round((value / maxUsed) * 100));
    const pointTone = p.calc.salaryCap === null ? 'neutral' : capTone(p.calc);
    const shortSeason = String(p.season.startYear).slice(2) + '-' + String((p.season.startYear + 1) % 100).padStart(2,'0');
    return `<div class="trend-item" title="${escapeAttr(seasonLabel(p.season.startYear))}: ${escapeAttr(formatMoney(value))}">
      <div class="trend-bar-track"><div class="trend-bar ${pointTone}" style="height:${height}%"></div></div>
      <div class="trend-season">${shortSeason}</div>
      <div class="trend-value">${formatMoney(value)}</div>
    </div>`;
  }).join('');

  return `<div class="cap-visual-grid cap-visual-grid-v221">
    <section class="overview-cap-card tone-${tone}">
      <div class="overview-cap-head">
        <div><p class="eyebrow">${seasonLabel(season.startYear)} cap summary</p><h3>${currentStatus}</h3></div>
        <span class="cap-limit">Salary Cap <strong>${salaryCap === null ? 'Not set' : formatMoney(salaryCap)}</strong></span>
      </div>
      <div class="overview-metrics">
        <div class="overview-metric primary"><span>Cap Used</span><strong>${calc.complete ? formatMoney(capUsed) : `${formatMoney(capUsed)} known`}</strong></div>
        <div class="overview-metric"><span>Cap Remaining</span><strong>${capRemaining === null ? 'Incomplete' : formatMoney(capRemaining)}</strong></div>
        <div class="overview-metric"><span>Roster Cap</span><strong>${formatMoney(calc.knownRosterCap)}</strong></div>
        <div class="overview-metric"><span>Dead Cap</span><strong>${formatMoney(deadCap)}</strong></div>
      </div>
      <div class="overview-cap-progress">
        <div class="cap-bar" aria-label="Cap used versus salary cap"><div class="cap-bar-fill" style="width:${displayPct}%"></div></div>
        <div class="overview-cap-progress-meta"><span><strong>${Math.round(rawPct)}%</strong> of cap used</span><span>${deadCap !== 0 ? `Dead Cap ${formatMoney(deadCap)}` : 'No Dead Cap'}</span></div>
      </div>
    </section>
    <section class="subpanel overview-trend-compact tone-neutral">
      <div class="overview-commitments-head"><div><p class="eyebrow">Cap outlook</p></div><p>Known cap used by season</p></div>
      <div class="trend-chart" aria-label="Known cap used by season">${trend}</div>
    </section>
  </div>`;
}

function renderOverviewContractWatch(intel) {
  const gapCount = intel.missingFutureSalary.length;
  const currentCount = intel.expiringCurrent.length;
  const nextCount = intel.expiringNext.length;
  const minorsCount = intel.minorsContracts.length;

  const priority = gapCount
    ? `<span class="contract-watch-priority warning"><strong>${gapCount} future salar${gapCount === 1 ? 'y gap' : 'y gaps'}</strong><small>Inside entered contract terms</small></span>`
    : '';

  return `<section class="overview-panel-v227 contract-watch-v246 contract-watch-compact-v3142">
    <div class="overview-section-head-v227 overview-section-head-compact-v3142">
      <div><p class="eyebrow">Contract watch</p><h3>Key contract timing</h3></div>
      <button id="overviewContractRosterBtn" class="overview-text-action" type="button">Open Roster →</button>
    </div>

    <div class="contract-watch-strip-v3142">
      <div>
        <span>Expiring</span>
        <strong>${currentCount}</strong>
        <small>this season</small>
      </div>
      <div>
        <span>Next</span>
        <strong>${nextCount}</strong>
        <small>contract ends</small>
      </div>
      <div class="${gapCount ? 'warning' : ''}">
        <span>Salary gaps</span>
        <strong>${gapCount}</strong>
        <small>future terms</small>
      </div>
      <div>
        <span>Minors deals</span>
        <strong>${minorsCount}</strong>
        <small>contract data</small>
      </div>
    </div>

    ${priority ? `<div class="contract-watch-footer-v246 contract-watch-footer-compact-v3142">${priority}</div>` : ''}
  </section>`;
}

function renderOverview() {
  const season = currentSeason();
  const contractIntel = contractIntelligence();
  const calc = calculateSeason(season.id);
  const capRemaining = calc.complete && calc.salaryCap !== null
    ? calc.capSpace
    : null;

  const activeCount = activeRosterPlayers().length;
  const minorsCount = farmSystemPlayers().length;
  const injuredSummary =
    typeof injuredRosterSummaryV3143 === 'function'
      ? injuredRosterSummaryV3143(season)
      : {
          label:'IR / IL',
          count:0,
          currentCap:0,
          missingSalaryCount:0
        };
  const minorsLimit = state.frontOffice.minorsLimit;
  const minorsOver =
    minorsLimit !== null
    && minorsLimit !== undefined
    && minorsCount > minorsLimit;

  const minorsOpen =
    minorsLimit === null || minorsLimit === undefined
      ? null
      : minorsLimit - minorsCount;

  const rosterLimit = state.frontOffice.rosterLimit;
  const openRosterSpots =
    rosterLimit === null || rosterLimit === undefined
      ? null
      : rosterLimit - activeCount;

  const missingPlayers = calc.missingPlayerIds
    .map((id) => state.players.find((player) => player.id === id))
    .filter(Boolean);

  const isOverCap =
    calc.complete
    && capRemaining !== null
    && capRemaining < 0;

  const attention = [];

  if (isOverCap) {
    attention.push(`
      <div class="overview-attention-row danger">
        <span class="overview-attention-icon">!</span>
        <span>
          <strong>${formatMoney(Math.abs(capRemaining))} over the salary cap</strong>
          <small>Cap relief is required for ${seasonLabel(season.startYear)}.</small>
        </span>
      </div>
    `);
  }

  if (
    rosterLimit !== null
    && rosterLimit !== undefined
    && activeCount > rosterLimit
  ) {
    attention.push(`
      <div class="overview-attention-row warning">
        <span class="overview-attention-icon">!</span>
        <span>
          <strong>${activeCount - rosterLimit} player${activeCount - rosterLimit === 1 ? '' : 's'} over the roster limit</strong>
          <small>${activeCount} active players against a ${rosterLimit}-player limit.</small>
        </span>
      </div>
    `);
  }

  if (minorsOver) {
    attention.push(`
      <div class="overview-attention-row warning">
        <span class="overview-attention-icon">M</span>
        <span>
          <strong>${minorsCount - minorsLimit} player${minorsCount - minorsLimit === 1 ? '' : 's'} over the Minors limit</strong>
          <small>${minorsCount} assigned against a ${minorsLimit}-player maximum.</small>
        </span>
      </div>
    `);
  }


  if (missingPlayers.length) {
    const names = missingPlayers
      .slice(0, 3)
      .map((player) => player.name)
      .join(', ');

    const extra =
      missingPlayers.length > 3
        ? ` +${missingPlayers.length - 3} more`
        : '';

    attention.push(`
      <div class="overview-attention-row warning">
        <span class="overview-attention-icon">$</span>
        <span>
          <strong>${missingPlayers.length} missing current-season salar${missingPlayers.length === 1 ? 'y' : 'ies'}</strong>
          <small>${escapeHtml(names)}${escapeHtml(extra)}</small>
        </span>
      </div>
    `);
  }

  if (!attention.length) {
    attention.push(`
      <div class="overview-attention-row good">
        <span class="overview-attention-icon">✓</span>
        <span>
          <strong>No current cap or salary issues</strong>
          <small>${seasonLabel(season.startYear)} is complete based on the data entered.</small>
        </span>
      </div>
    `);
  }

  const activities = state.activity
    .slice(0, 3)
    .map((item) => `
      <div class="overview-activity-row">
        <span class="overview-activity-dot"></span>
        <span>
          <strong>${escapeHtml(item.label)}</strong>
          <small>${formatDateTime(item.at)}</small>
        </span>
      </div>
    `)
    .join('')
    || `
      <div class="overview-activity-row">
        <span class="overview-activity-dot"></span>
        <span>
          <strong>No recent activity</strong>
          <small>Changes to this Front Office will appear here.</small>
        </span>
      </div>
    `;

  const rosterMeta =
    rosterLimit === null || rosterLimit === undefined
      ? `${activeCount} active`
      : `${activeCount} / ${rosterLimit}`;

  const openSpotText =
    openRosterSpots === null
      ? 'No limit set'
      : openRosterSpots >= 0
        ? `${openRosterSpots} open`
        : `${Math.abs(openRosterSpots)} over`;

  el('overviewView').innerHTML = `
    <div class="overview-v227 overview-v255 overview-dashboard-v3142">
      ${renderCapDashboardV3142({
        season,
        yearCount:3,
        context:'overview'
      })}

      <section class="overview-snapshot-v227 overview-compact-panel-v255">
        <div class="overview-section-head-v227 overview-section-head-compact-v255">
          <p class="eyebrow">Team snapshot</p>
          <button
            id="overviewOpenRosterBtn"
            class="overview-text-action"
            type="button"
          >Open Roster →</button>
        </div>

        <div class="overview-snapshot-grid-v227 overview-snapshot-grid-v3142">
          <div class="overview-snapshot-item">
            <span>Active</span>
            <strong>${escapeHtml(rosterMeta)}</strong>
            <small>${escapeHtml(openSpotText)}</small>
          </div>

          <div class="overview-snapshot-item ${minorsOver ? 'warning' : ''}">
            <span>Minors</span>
            <strong>${minorsLimit === null || minorsLimit === undefined ? minorsCount : `${minorsCount} / ${minorsLimit}`}</strong>
            <small>${minorsLimit === null || minorsLimit === undefined ? 'no limit set' : minorsOver ? `${Math.abs(minorsOpen)} over` : `${minorsOpen} open`}</small>
          </div>

          <div class="overview-snapshot-item ir-snapshot-v3142">
            <span>${escapeHtml(injuredSummary.label)}</span>
            <strong>${injuredSummary.count}</strong>
            <small>${formatMoney(injuredSummary.currentCap)} current cap${injuredSummary.missingSalaryCount ? ` · ${injuredSummary.missingSalaryCount} missing` : ''}</small>
          </div>
        </div>
      </section>

      ${renderOverviewContractWatch(contractIntel)}

      <div class="overview-bottom-grid-v227">
        <section class="overview-panel-v227">
          <div class="overview-section-head-v227">
            <div>
              <p class="eyebrow">Attention</p>
              <h3>Front office status</h3>
            </div>
          </div>
          <div class="overview-attention-list">${attention.join('')}</div>
        </section>

        <section class="overview-panel-v227">
          <div class="overview-section-head-v227">
            <div>
              <p class="eyebrow">Recent activity</p>
              <h3>Latest changes</h3>
            </div>
          </div>
          <div class="overview-activity-list">${activities}</div>
        </section>
      </div>

      <div class="overview-cap-link-v3142">
        <button
          id="overviewOpenCapBtn"
          class="overview-text-action"
          type="button"
        >Open full Cap workspace →</button>
      </div>
    </div>
  `;

  if (el('overviewOpenRosterBtn')) {
    el('overviewOpenRosterBtn').addEventListener(
      'click',
      () => switchView('roster')
    );
  }

  if (el('overviewContractRosterBtn')) {
    el('overviewContractRosterBtn').addEventListener(
      'click',
      () => switchView('roster')
    );
  }

  if (el('overviewOpenCapBtn')) {
    el('overviewOpenCapBtn').addEventListener(
      'click',
      () => switchView('cap')
    );
  }
}
