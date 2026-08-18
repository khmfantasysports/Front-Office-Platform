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
  const deadCap = deadCapForSeason(season.id);
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
      <div class="overview-commitments-head"><div><p class="eyebrow">Cap outlook</p><h3>Seven-season commitments</h3></div><p>Known cap used by season</p></div>
      <div class="trend-chart" aria-label="Known cap used by season">${trend}</div>
    </section>
  </div>`;
}

function renderOverview() {
  const season = currentSeason();
  const calc = calculateSeason(season.id);
  const tone = capTone(calc);
  const salaryCap = calc.salaryCap;
  const deadCap = deadCapForSeason(season.id);
  const capUsed = calc.complete ? calc.capUsed : calc.knownCapUsed;
  const capRemaining = calc.complete && salaryCap !== null ? calc.capSpace : null;
  const rawPct = salaryCap && salaryCap > 0 ? (calc.knownCapUsed / salaryCap) * 100 : 0;
  const displayPct = Math.max(0, Math.min(100, rawPct));
  const missingPlayers = calc.missingPlayerIds.map((id) => state.players.find((p) => p.id === id)).filter(Boolean);

  const horizon = contractHorizonSeasons();
  const trendPoints = horizon.map((s) => ({ season:s, calc:calculateSeason(s.id) }));
  const maxUsed = Math.max(1, ...trendPoints.map((point) => Math.max(0, point.calc.knownCapUsed)));
  const trend = trendPoints.map((point) => {
    const value = Math.max(0, point.calc.knownCapUsed);
    const height = value === 0 ? 3 : Math.max(8, Math.round((value / maxUsed) * 100));
    const pointTone = point.calc.salaryCap === null ? 'neutral' : capTone(point.calc);
    const shortSeason = String(point.season.startYear).slice(2) + '-' + String((point.season.startYear + 1) % 100).padStart(2,'0');
    return `<div class="trend-item" title="${escapeAttr(seasonLabel(point.season.startYear))}: ${escapeAttr(formatMoney(value))}">
      <div class="trend-bar-track"><div class="trend-bar ${pointTone}" style="height:${height}%"></div></div>
      <div class="trend-season">${shortSeason}</div>
      <div class="trend-value">${formatMoney(value)}</div>
    </div>`;
  }).join('');

  const futureRows = horizon.map((s) => {
    const c = calculateSeason(s.id);
    const seasonDeadCap = deadCapForSeason(s.id);
    const remaining = c.complete && c.salaryCap !== null ? formatMoney(c.capSpace) : '—';
    const used = c.complete ? c.capUsed : c.knownCapUsed;
    return `<tr>
      <td>${seasonLabel(s.startYear)}</td>
      <td class="money">${formatMoney(c.knownRosterCap)}</td>
      <td class="money">${formatMoney(seasonDeadCap)}</td>
      <td class="money">${formatMoney(used)}</td>
      <td class="money">${remaining}</td>
    </tr>`;
  }).join('');

  const issues = [];
  missingPlayers.forEach((player) => issues.push(`<div class="issue-item"><p><strong>${escapeHtml(player.name)}</strong></p><span class="warning">Missing ${seasonLabel(season.startYear)} salary</span></div>`));
  if (!issues.length) issues.push('<div class="issue-item"><p class="good"><strong>All current salaries are entered.</strong></p></div>');

  const activities = state.activity.slice(0, 4).map((item) => `<div class="activity-item"><p><strong>${escapeHtml(item.label)}</strong></p><small>${formatDateTime(item.at)}</small></div>`).join('') || '<div class="activity-item"><p class="muted">No recent activity.</p></div>';

  const currentStatus = calc.complete
    ? (calc.capSpace < 0 ? `<span class="danger">${formatMoney(Math.abs(calc.capSpace))} over cap</span>` : `<span class="good">${formatMoney(calc.capSpace)} cap remaining</span>`)
    : '<span class="warning">Cap total incomplete</span>';

  el('overviewView').innerHTML = `
    <div class="overview-stack-v220">
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
        <div class="overview-commitments-head"><div><p class="eyebrow">Cap outlook</p><h3>Seven-season commitments</h3></div><p>Known cap used by season</p></div>
        <div class="trend-chart" aria-label="Known cap used by season">${trend}</div>
      </section>

      <section class="subpanel commitments-panel tone-neutral">
        <div class="overview-commitments-head"><div><p class="eyebrow">Future cap</p><h3>Cap commitments by season</h3></div><p>Roster Cap + Dead Cap</p></div>
        <div class="table-wrap compact-table-wrap">
          <table class="commitments-table commitments-table-v220">
            <thead><tr><th>Season</th><th>Roster Cap</th><th>Dead Cap</th><th>Cap Used</th><th>Cap Remaining</th></tr></thead>
            <tbody>${futureRows}</tbody>
          </table>
        </div>
      </section>

      <div class="overview-health-grid">
        <div class="subpanel compact-status-panel tone-${calc.complete ? 'good' : 'warning'}">
          <p class="eyebrow">Roster & Cap</p>
          <h3>${calc.complete ? '<span class="good">Current season complete</span>' : '<span class="warning">Needs attention</span>'}</h3>
          <p class="muted compact-copy">${calc.complete ? 'Current-season roster salaries and cap totals are complete.' : 'Enter a salary for every cap-counting player to complete the current-season cap.'}</p>
        </div>
        <div class="subpanel compact-status-panel tone-${missingPlayers.length ? 'warning' : 'good'}">
          <p class="eyebrow">Salary check</p>
          <div class="issue-list compact-list">${issues.join('')}</div>
        </div>
        <div class="subpanel compact-status-panel activity-panel tone-neutral">
          <p class="eyebrow">Recent activity</p>
          <div class="activity-list compact-list">${activities}</div>
        </div>
      </div>
    </div>`;
}
