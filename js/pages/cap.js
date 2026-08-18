'use strict';

// Salary-cap and Dead Cap page.

function renderCapAdjustments() {
  const seasons = contractHorizonSeasons();
  const grouped = new Map();
  state.adjustments.forEach((a) => {
    if (!grouped.has(a.id)) grouped.set(a.id, {
      id:a.id,
      description:a.description,
      sourceTransactionId:a.sourceTransactionId || null,
      seasons:{}
    });
    grouped.get(a.id).seasons[a.seasonId] = a.amount;
  });

  const entries = [...grouped.values()];
  const totalDeadCap = entries.reduce((sum, item) =>
    sum + Object.values(item.seasons).reduce((seasonSum, amount) => seasonSum + Number(amount || 0), 0), 0);

  const cards = entries.map((item) => {
    const seasonChips = seasons
      .filter((season) => item.seasons[season.id] !== undefined && Number(item.seasons[season.id]) !== 0)
      .map((season) => `<span class="cap-dead-season-chip"><span>${seasonLabel(season.startYear)}</span><strong>${formatMoney(item.seasons[season.id])}</strong></span>`)
      .join('');
    return `<article class="cap-dead-entry-v228">
      <div class="cap-dead-entry-head">
        <div><strong>${escapeHtml(item.description)}</strong><span>${item.sourceTransactionId ? 'Transaction' : 'Legacy adjustment'}</span></div>
      </div>
      <div class="cap-dead-season-list">${seasonChips || '<span class="muted">No active season amounts.</span>'}</div>
    </article>`;
  }).join('');

  return `<section class="cap-panel-v228">
    <div class="cap-section-head-v228">
      <div><p class="eyebrow">Dead Cap</p><h3>Money still on the books</h3><p>${entries.length ? `${formatMoney(totalDeadCap)} across ${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}.` : 'Waiver penalties, buyouts and retained salary appear here.'}</p></div>
      <button id="capRecordTransactionBtn" class="overview-text-action" type="button">Record Transaction →</button>
    </div>
    ${entries.length ? `<div class="cap-dead-list-v228">${cards}</div>` : `<div class="cap-empty-v228"><span class="cap-empty-icon">✓</span><span><strong>No Dead Cap</strong><small>No transaction-generated cap costs are currently recorded.</small></span></div>`}
  </section>`;
}

function renderCap() {
  const activeSeason = currentSeason();
  const currentCalc = calculateSeason(activeSeason.id);
  const tone = capTone(currentCalc);
  const salaryCap = currentCalc.salaryCap;
  const currentDeadCap = deadCapForSeason(activeSeason.id);
  const currentUsed = currentCalc.complete ? currentCalc.capUsed : currentCalc.knownCapUsed;
  const currentRemaining = currentCalc.complete && salaryCap !== null ? currentCalc.capSpace : null;
  const isOverCap = currentRemaining !== null && currentRemaining < 0;
  const rawPct = salaryCap && salaryCap > 0 ? (currentCalc.knownCapUsed / salaryCap) * 100 : 0;
  const pct = Math.max(0, Math.min(100, rawPct));

  const horizon = contractHorizonSeasons();
  const maxCommitment = Math.max(1, ...horizon.map((season) => Math.max(0, calculateSeason(season.id).knownCapUsed)));

  const outlook = horizon.map((season) => {
    const calc = calculateSeason(season.id);
    const deadCap = deadCapForSeason(season.id);
    const used = calc.complete ? calc.capUsed : calc.knownCapUsed;
    const remaining = calc.complete && calc.salaryCap !== null ? calc.capSpace : null;
    const width = used === 0 ? 3 : Math.max(7, Math.round((used / maxCommitment) * 100));
    const current = season.id === activeSeason.id;
    return `<article class="cap-season-card-v228 ${current ? 'current' : ''}">
      <div class="cap-season-top-v228"><strong>${seasonLabel(season.startYear)}</strong>${current ? '<span>Current</span>' : ''}</div>
      <div class="cap-season-used-v228">${formatMoney(used)}</div>
      <div class="cap-season-label-v228">Cap Used</div>
      <div class="cap-season-track-v228"><span style="width:${width}%"></span></div>
      <div class="cap-season-metrics-v228">
        <span><small>Roster</small><strong>${formatMoney(calc.knownRosterCap)}</strong></span>
        <span><small>Dead</small><strong>${formatMoney(deadCap)}</strong></span>
      </div>
      <div class="cap-season-footer-v228">
        <span>${calc.salaryCap === null ? 'Cap TBD' : `Cap ${formatMoney(calc.salaryCap)}`}</span>
        <span class="${remaining !== null && remaining < 0 ? 'danger' : ''}">${remaining === null ? 'Remaining —' : `${formatMoney(remaining)} left`}</span>
      </div>
    </article>`;
  }).join('');

  const detailRows = horizon.map((season) => {
    const calc = calculateSeason(season.id);
    const deadCap = deadCapForSeason(season.id);
    const used = calc.complete ? calc.capUsed : calc.knownCapUsed;
    const remaining = calc.complete && calc.salaryCap !== null ? formatMoney(calc.capSpace) : '—';
    return `<tr>
      <td>${seasonLabel(season.startYear)}</td>
      <td class="money">${calc.salaryCap === null ? '—' : formatMoney(calc.salaryCap)}</td>
      <td class="money">${formatMoney(calc.knownRosterCap)}</td>
      <td class="money">${formatMoney(deadCap)}</td>
      <td class="money">${formatMoney(used)}</td>
      <td class="money">${remaining}</td>
    </tr>`;
  }).join('');

  const historicalSeasons = [...state.seasons]
    .filter((season) => activeSeason && season.startYear < activeSeason.startYear)
    .sort((a,b) => b.startYear - a.startYear);
  const historyRows = historicalSeasons.map((season) =>
    `<tr><td>${seasonLabel(season.startYear)}</td><td class="money">${season.salaryCap === null ? '—' : formatMoney(season.salaryCap)}</td></tr>`
  ).join('');

  const primaryValue = currentRemaining === null
    ? 'Incomplete'
    : isOverCap
      ? formatMoney(Math.abs(currentRemaining))
      : formatMoney(currentRemaining);
  const primaryLabel = currentRemaining === null ? 'Cap Status' : isOverCap ? 'Over Cap' : 'Cap Remaining';

  el('capView').innerHTML = `<div class="cap-page-v228">
    <div class="page-heading-row cap-page-heading-v228">
      <div><p class="eyebrow">Cap management</p><h3>Financial workspace</h3><p class="page-copy">Current position, future commitments and transaction-generated Dead Cap.</p></div>
    </div>

    <section class="cap-hero-v228 tone-${tone}">
      <div class="cap-hero-top-v228">
        <div>
          <p class="eyebrow">${seasonLabel(activeSeason.startYear)} cap position</p>
          <div class="cap-hero-primary-v228 ${currentRemaining !== null && isOverCap ? 'danger' : currentRemaining === null ? 'warning' : 'good'}">${primaryValue}</div>
          <div class="cap-hero-primary-label-v228">${primaryLabel}</div>
        </div>
        <div class="cap-hero-limit-v228"><span>Salary Cap</span><strong>${salaryCap === null ? 'Not set' : formatMoney(salaryCap)}</strong></div>
      </div>

      <div class="cap-hero-progress-v228">
        <div class="cap-bar"><div class="cap-bar-fill" style="width:${pct}%"></div></div>
        <div><span><strong>${Math.round(rawPct)}%</strong> used</span><span>${currentCalc.complete ? `${formatMoney(currentUsed)} committed` : `${formatMoney(currentCalc.knownCapUsed)} known`}</span></div>
      </div>

      <div class="cap-hero-strip-v228">
        <div><span>Cap Used</span><strong>${currentCalc.complete ? formatMoney(currentUsed) : `${formatMoney(currentCalc.knownCapUsed)} known`}</strong></div>
        <div><span>Roster Cap</span><strong>${formatMoney(currentCalc.knownRosterCap)}</strong></div>
        <div><span>Dead Cap</span><strong>${formatMoney(currentDeadCap)}</strong></div>
      </div>
    </section>

    <section class="cap-panel-v228">
      <div class="cap-section-head-v228"><div><p class="eyebrow">Cap outlook</p><h3>Seven-season commitments</h3><p>Swipe across seasons for the high-level picture.</p></div></div>
      <div class="cap-outlook-scroll-v228" role="region" aria-label="Seven-season cap outlook. Swipe horizontally to view future seasons." tabindex="0">
        <div class="cap-outlook-grid-v228">${outlook}</div>
      </div>
    </section>

    ${renderCapAdjustments()}

    <details class="cap-detail-disclosure-v228">
      <summary><span><strong>Full Cap Detail</strong><small>Salary Cap · Roster Cap · Dead Cap · Cap Used · Cap Remaining</small></span></summary>
      <div class="cap-detail-body-v228">
        <div class="cap-scroll-hint" aria-hidden="true">Swipe for full financial detail <span class="scroll-arrow">→</span></div>
        <div class="cap-detail-scroll-shell">
          <div class="table-wrap cap-horizontal-scroll" role="region" aria-label="Seven-season cap detail table." tabindex="0">
            <table class="cap-detail-table cap-detail-table-v25 cap-detail-table-v221">
              <thead><tr><th>Season</th><th>Salary Cap</th><th>Roster Cap</th><th>Dead Cap</th><th>Cap Used</th><th>Cap Remaining</th></tr></thead>
              <tbody>${detailRows}</tbody>
            </table>
          </div>
        </div>
      </div>
    </details>

    <details class="cap-history-disclosure">
      <summary><span class="settings-disclosure-title"><strong>Past Seasons</strong><span>Reference prior salary-cap settings</span></span></summary>
      <div class="cap-history-body">${historyRows ? `<div class="cap-history-scroll-shell"><div class="table-wrap cap-horizontal-scroll"><table><thead><tr><th>Season</th><th>Recorded Salary Cap</th></tr></thead><tbody>${historyRows}</tbody></table></div></div>` : '<p class="season-history-empty">No past seasons yet. Historical seasons will appear after the active season advances.</p>'}</div>
    </details>
  </div>`;

  if (el('capRecordTransactionBtn')) el('capRecordTransactionBtn').addEventListener('click', () => openTransactionDialog());
}
