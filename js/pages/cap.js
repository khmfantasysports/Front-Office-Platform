'use strict';

// Salary-cap and Dead Cap page.

function renderCapAdjustments() {
  const seasons = contractHorizonSeasons();
  const grouped = new Map();
  state.adjustments.forEach((a) => {
    if (!grouped.has(a.id)) grouped.set(a.id, { id:a.id, description:a.description, sourceTransactionId:a.sourceTransactionId || null, seasons:{} });
    grouped.get(a.id).seasons[a.seasonId] = a.amount;
  });
  const rows = [...grouped.values()].map((a) => `<tr><td>${escapeHtml(a.description)}</td>${seasons.map((s) => `<td class="money">${a.seasons[s.id] === undefined ? '—' : formatMoney(a.seasons[s.id])}</td>`).join('')}<td>${a.sourceTransactionId ? 'Transaction' : 'Legacy'}</td></tr>`).join('');
  return `<div class="cap-detail-card transaction-cap-card"><div class="section-title-row"><div><p class="eyebrow">Dead Cap</p><h3>Transaction-generated cap costs</h3></div><button id="capRecordTransactionBtn" class="btn btn-secondary btn-small" type="button">+ Transaction</button></div>${rows ? `<div class="cap-detail-scroll-shell"><div class="table-wrap cap-horizontal-scroll"><table><thead><tr><th>Description</th>${seasons.map((s) => `<th>${seasonLabel(s.startYear)}</th>`).join('')}<th>Source</th></tr></thead><tbody>${rows}</tbody></table></div></div>` : `<div class="empty-state compact"><h4>No Dead Cap</h4><p>Buyout penalties, waiver penalties and retained salary will appear here when recorded through Transactions.</p></div>`}</div>`;
}

function renderCap() {
  const rows = contractHorizonSeasons().map((s) => {
    const c = calculateSeason(s.id);
    const deadCap = deadCapForSeason(s.id);
    const capUsed = c.complete ? c.capUsed : c.knownCapUsed;
    const capRemaining = c.complete && c.salaryCap !== null ? formatMoney(c.capSpace) : '—';
    return `<tr>
      <td>${seasonLabel(s.startYear)}</td>
      <td class="money">${c.salaryCap === null ? '—' : formatMoney(c.salaryCap)}</td>
      <td class="money">${formatMoney(c.knownRosterCap)}</td>
      <td class="money">${formatMoney(deadCap)}</td>
      <td class="money">${formatMoney(capUsed)}</td>
      <td class="money">${capRemaining}</td>
    </tr>`;
  }).join('');
  const activeSeason = currentSeason();
  const historicalSeasons = [...state.seasons].filter((season) => activeSeason && season.startYear < activeSeason.startYear).sort((a,b) => b.startYear - a.startYear);
  const historyRows = historicalSeasons.map((season) => `<tr><td>${seasonLabel(season.startYear)}</td><td class="money">${season.salaryCap === null ? '—' : formatMoney(season.salaryCap)}</td></tr>`).join('');

  el('capView').innerHTML = `<div class="cap-page cap-page-v221">
    <div class="page-heading-row"><div><p class="eyebrow">Cap management</p><h3>${seasonLabel(activeSeason.startYear)} financial position</h3></div></div>
    ${renderCapVisuals()}
    <div class="cap-detail-card"><div class="overview-commitments-head"><div><p class="eyebrow">Future cap</p><h3>Cap commitments by season</h3></div><p>Roster Cap + Dead Cap</p></div><div class="cap-scroll-hint" aria-hidden="true">Swipe for full financial detail <span class="scroll-arrow">→</span></div><div class="cap-detail-scroll-shell"><div class="table-wrap cap-horizontal-scroll" role="region" aria-label="Seven-season cap table. Swipe horizontally to view all financial columns." tabindex="0"><table class="cap-detail-table cap-detail-table-v25 cap-detail-table-v221"><thead><tr><th>Season</th><th>Salary Cap</th><th>Roster Cap</th><th>Dead Cap</th><th>Cap Used</th><th>Cap Remaining</th></tr></thead><tbody>${rows}</tbody></table></div></div></div>
    ${renderCapAdjustments()}
    <details class="cap-history-disclosure"><summary><span class="settings-disclosure-title"><strong>Past Seasons</strong><span>Reference prior salary-cap settings</span></span></summary><div class="cap-history-body">${historyRows ? `<div class="cap-history-scroll-shell"><div class="table-wrap cap-horizontal-scroll"><table><thead><tr><th>Season</th><th>Recorded Salary Cap</th></tr></thead><tbody>${historyRows}</tbody></table></div></div>` : '<p class="season-history-empty">No past seasons yet. Historical seasons will appear after the active season advances.</p>'}</div></details>
  </div>`;
  if (el('capRecordTransactionBtn')) el('capRecordTransactionBtn').addEventListener('click', () => openTransactionDialog());
}
