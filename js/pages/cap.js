'use strict';

// Salary-cap, Dead Cap and contract-intelligence page.
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

function renderContractIntelligencePanel(intel) {
  const current = intel.current;
  const currentExpiryCharges = intel.activeExpiringCurrent.reduce((sum, player) => {
    const charge = current ? effectivePlayerCharge(player, current.id) : null;
    return sum + (playerCountsTowardCap(player) && charge !== null ? Number(charge) : 0);
  }, 0);

  const nextExpiryCharges = intel.activeExpiringNext.reduce((sum, player) => {
    const charge = intel.next ? effectivePlayerCharge(player, intel.next.id) : null;
    return sum + (playerCountsTowardCap(player) && charge !== null ? Number(charge) : 0);
  }, 0);

  const largestRows = intel.largestCurrentCapCharges.slice(0, 5).map((item) =>
    `<button class="contract-intel-row" data-contract-player="${item.player.id}" type="button"><span><strong>${escapeHtml(item.player.name)}</strong><small>${escapeHtml(item.player.position)} · ${escapeHtml(item.player.realTeam || 'No NHL team')}</small></span><span><strong>${formatMoney(item.charge)}</strong><small>current cap charge</small></span></button>`
  ).join('');

  const futureRows = intel.activeLongTermCommitments.slice(0, 5).map((item) =>
    `<button class="contract-intel-row" data-contract-player="${item.player.id}" type="button"><span><strong>${escapeHtml(item.player.name)}</strong><small>Ends ${escapeHtml(item.player.contractEndSeasonId ? seasonLabel(seasonById(item.player.contractEndSeasonId)?.startYear) : 'not set')}</small></span><span><strong>${formatMoney(item.total)}</strong><small>${item.seasons} future ${item.seasons === 1 ? 'season' : 'seasons'} entered</small></span></button>`
  ).join('');

  const gapRows = intel.activeMissingFutureSalary.slice(0, 8).map((item) => {
    const seasons = item.seasons.map((season) => seasonLabel(season.startYear)).join(', ');
    return `<button class="contract-gap-row" data-contract-player="${item.player.id}" type="button"><span><strong>${escapeHtml(item.player.name)}</strong><small>${escapeHtml(item.player.position)} · Ends ${escapeHtml(item.player.contractEndSeasonId ? seasonLabel(seasonById(item.player.contractEndSeasonId)?.startYear) : 'not set')}</small></span><span><strong>${item.seasons.length}</strong><small>${escapeHtml(seasons)}</small></span></button>`;
  }).join('');

  const minorsRows = intel.minorsContracts.slice(0, 6).map((item) =>
    `<button class="contract-intel-row minors" data-contract-player="${item.player.id}" type="button"><span><strong>${escapeHtml(item.player.name)}</strong><small>Minors · Ends ${escapeHtml(item.player.contractEndSeasonId ? seasonLabel(seasonById(item.player.contractEndSeasonId)?.startYear) : 'not set')}</small></span><span><strong>${item.charge === null ? '—' : formatMoney(item.charge)}</strong><small>salary reference</small></span></button>`
  ).join('');

  return `<section class="cap-panel-v228 contract-intelligence-panel">
    <div class="cap-section-head-v228 contract-intelligence-head">
      <div><p class="eyebrow">Contract intelligence</p><h3>Entered commitments and contract watch</h3><p>Evidence from saved contract terms and salary rows only. No salary values are inferred.</p></div>
    </div>

    <div class="contract-intel-summary">
      <div><span>Expiring now</span><strong>${intel.activeExpiringCurrent.length}</strong><small>${formatMoney(currentExpiryCharges)} current cap charge</small></div>
      <div><span>Expiring next</span><strong>${intel.activeExpiringNext.length}</strong><small>${formatMoney(nextExpiryCharges)} entered next-year charge</small></div>
      <div class="${intel.activeMissingFutureSalary.length ? 'warning' : ''}"><span>Future salary gaps</span><strong>${intel.activeMissingFutureSalary.length}</strong><small>active roster contracts</small></div>
      <div><span>Minors contracts</span><strong>${intel.minorsContracts.length}</strong><small>excluded from cap</small></div>
    </div>

    <div class="contract-intel-columns">
      <div class="contract-intel-block">
        <div class="contract-intel-block-head"><span>Largest current cap charges</span><small>Cap-eligible active roster</small></div>
        <div class="contract-intel-list">${largestRows || '<div class="contract-intel-empty">No current cap charges entered.</div>'}</div>
      </div>
      <div class="contract-intel-block">
        <div class="contract-intel-block-head"><span>Known future commitments</span><small>Total of entered future salary rows</small></div>
        <div class="contract-intel-list">${futureRows || '<div class="contract-intel-empty">No future salary rows entered.</div>'}</div>
      </div>
    </div>

    <details class="contract-intel-disclosure" ${intel.activeMissingFutureSalary.length ? 'open' : ''}>
      <summary><span><strong>Future Salary Gaps</strong><small>${intel.activeMissingFutureSalary.length ? `${intel.activeMissingFutureSalary.length} active-roster ${intel.activeMissingFutureSalary.length === 1 ? 'player has' : 'players have'} missing salary inside an entered contract term` : 'No active-roster future salary gaps detected'}</small></span></summary>
      <div class="contract-intel-detail-body">${gapRows || '<div class="contract-intel-empty good">All entered active-roster contract terms have their future salary rows filled.</div>'}</div>
    </details>

    <details class="contract-intel-disclosure">
      <summary><span><strong>Minors Contracts</strong><small>${intel.minorsContracts.length} tracked · salary reference only · excluded from cap</small></span></summary>
      <div class="contract-intel-detail-body">${minorsRows || '<div class="contract-intel-empty">No Minors contract data entered.</div>'}</div>
    </details>
  </section>`;
}

function renderCap() {
  const activeSeason = currentSeason();
  const intel = contractIntelligence();
  const horizon = contractHorizonSeasons();

  const detailRows = horizon.map((season) => {
    const calc = calculateSeason(season.id);
    const deadCap = deadCapForSeason(season.id);
    const used = calc.complete ? calc.capUsed : calc.knownCapUsed;
    const remaining =
      calc.complete && calc.salaryCap !== null
        ? formatMoney(calc.capSpace)
        : '—';

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
    .filter(
      (season) =>
        activeSeason
        && season.startYear < activeSeason.startYear
    )
    .sort((a, b) => b.startYear - a.startYear);

  const historyRows = historicalSeasons.map((season) =>
    `<tr>
      <td>${seasonLabel(season.startYear)}</td>
      <td class="money">${season.salaryCap === null ? '—' : formatMoney(season.salaryCap)}</td>
    </tr>`
  ).join('');

  el('capView').innerHTML = `
    <div class="cap-page-v228 cap-dashboard-page-v3140">
      <div class="page-heading-row cap-page-heading-v228">
        <div>
          <p class="eyebrow">Cap management</p>
          <h3>Cap Dashboard</h3>
          <p class="page-copy">
            Current cap space, usage and multi-season commitments.
          </p>
        </div>
      </div>

      ${renderCapDashboardV3140({
        season:activeSeason,
        yearCount:3,
        context:'cap'
      })}

      <section class="cap-panel-v228 cap-horizon-panel-v3140">
        <div class="cap-section-head-v228 cap-section-head-compact-v3140">
          <div>
            <p class="eyebrow">Commitment horizon</p>
            <h3>Seven-season outlook</h3>
            <p>Known cap commitments from saved player and adjustment data.</p>
          </div>
        </div>
        ${renderCapHorizonV3140()}
      </section>

      ${renderContractIntelligencePanel(intel)}
      ${renderCapAdjustments()}

      <details class="cap-detail-disclosure-v228">
        <summary>
          <span>
            <strong>Full Cap Detail</strong>
            <small>
              Salary Cap · Roster Cap · Dead Cap · Cap Used · Cap Remaining
            </small>
          </span>
        </summary>

        <div class="cap-detail-body-v228">
          <div class="cap-scroll-hint" aria-hidden="true">
            Swipe for full financial detail
            <span class="scroll-arrow">→</span>
          </div>

          <div class="cap-detail-scroll-shell">
            <div
              class="table-wrap cap-horizontal-scroll"
              role="region"
              aria-label="Seven-season cap detail table."
              tabindex="0"
            >
              <table class="cap-detail-table cap-detail-table-v25 cap-detail-table-v221">
                <thead>
                  <tr>
                    <th>Season</th>
                    <th>Salary Cap</th>
                    <th>Roster Cap</th>
                    <th>Dead Cap</th>
                    <th>Cap Used</th>
                    <th>Cap Remaining</th>
                  </tr>
                </thead>
                <tbody>${detailRows}</tbody>
              </table>
            </div>
          </div>
        </div>
      </details>

      <details class="cap-history-disclosure">
        <summary>
          <span class="settings-disclosure-title">
            <strong>Past Seasons</strong>
            <span>Reference prior salary-cap settings</span>
          </span>
        </summary>

        <div class="cap-history-body">
          ${historyRows
            ? `<div class="cap-history-scroll-shell">
                <div class="table-wrap cap-horizontal-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Season</th>
                        <th>Recorded Salary Cap</th>
                      </tr>
                    </thead>
                    <tbody>${historyRows}</tbody>
                  </table>
                </div>
              </div>`
            : `<p class="season-history-empty">
                No past seasons yet. Historical seasons will appear after the active season advances.
              </p>`
          }
        </div>
      </details>
    </div>
  `;

  if (el('capRecordTransactionBtn')) {
    el('capRecordTransactionBtn').addEventListener(
      'click',
      () => openTransactionDialog()
    );
  }

  document
    .querySelectorAll('[data-contract-player]')
    .forEach((button) =>
      button.addEventListener(
        'click',
        () => openPlayerDialog(button.dataset.contractPlayer)
      )
    );
}
