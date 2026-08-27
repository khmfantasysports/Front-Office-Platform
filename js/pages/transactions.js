'use strict';

// Transaction ledger, smart penalties and structured trades.

// V3.11.6 — compact, data-driven transaction ledger filters.
let transactionLedgerFilterV3116 = 'ALL';

// V3.11.7 — ledger financial season visibility.
const ROSTERCAP_TRANSACTION_LEDGER_FINANCIAL_VERSION_V3117 = '3.11.7';

// V3.11.8 — transaction correction integrity.
const ROSTERCAP_TRANSACTION_CORRECTION_VERSION_V3118 = '3.11.8';

// V3.12.1 — incoming Trade player setup + roster editing.
const ROSTERCAP_TRADE_INCOMING_PLAYER_VERSION_V3121 = '3.12.1';

// V3.13.2 — Trade Block integrated directly into Transactions.
const ROSTERCAP_TRADE_BLOCK_VERSION_V3132 = '3.13.2';

function tradeIncomingPlayerSportConfigV3121() {
  const sport = state.frontOffice?.sport || 'NHL';
  return window.RosterCapSports?.get?.(sport)
    || window.ROSTERCAP_SPORTS?.[sport]
    || null;
}

function tradeIncomingPlayerPositionsV3121() {
  const configured = window.RosterCapPositionConfig?.active?.() || [];
  if (configured.length) return [...configured];

  const sportConfig = tradeIncomingPlayerSportConfigV3121();
  if (sportConfig?.player?.positions?.length) {
    return [...sportConfig.player.positions];
  }

  return ['C','LW','RW','F','D','G'];
}

function tradeIncomingPlayerTeamCopyV3121() {
  const sport = state.frontOffice?.sport || 'NHL';
  const config = tradeIncomingPlayerSportConfigV3121();
  return {
    label:config?.player?.teamLabel || `${sport} team`,
    placeholder:config?.player?.teamPlaceholder || 'Team',
    eligiblePlaceholder:config?.player?.eligiblePlaceholder || 'C,LW'
  };
}

function tradeIncomingPlayerDevelopmentLabelV3121() {
  return window.RosterCapTerminology?.developmentLabel?.()
    || 'Minors';
}

function tradeIncomingPlayerPositionOptionsV3121(selected = '') {
  const positions = tradeIncomingPlayerPositionsV3121();
  const selectedCode = String(selected || '').trim().toUpperCase();
  return positions.map((position) =>
    `<option value="${escapeAttr(position)}" ${position === selectedCode ? 'selected' : ''}>${escapeHtml(position)}</option>`
  ).join('');
}

function tradeIncomingPlayerQuickContractRowsV3121(card, index) {
  if (!card) return false;

  const startingSalary = nullableNumber(
    card.querySelector(`[data-trade-player-quick-salary="${index}"]`)?.value
  );
  const years = nullableInteger(
    card.querySelector(`[data-trade-player-quick-years="${index}"]`)?.value
  );
  const mode =
    card.querySelector(`[data-trade-player-quick-mode="${index}"]`)?.value
    || 'same';
  const pct = mode === 'same'
    ? 0
    : nullableNumber(
        card.querySelector(`[data-trade-player-quick-pct="${index}"]`)?.value
      );

  if (startingSalary === null || startingSalary < 0) {
    alert('Enter a valid starting salary for the incoming player.');
    return false;
  }

  const seasons = contractHorizonSeasons();
  if (!seasons.length) {
    alert('No contract seasons are available.');
    return false;
  }

  if (!years || years < 1) {
    alert('Enter at least 1 year remaining.');
    return false;
  }

  if (mode !== 'same' && (pct === null || pct < 0 || pct > 100)) {
    alert('Annual salary change must be between 0% and 100%.');
    return false;
  }

  const boundedYears = Math.min(years, seasons.length);
  const direction = mode === 'increase' ? 1 : mode === 'decrease' ? -1 : 0;
  const factor = 1 + (direction * Number(pct || 0) / 100);

  card.querySelectorAll(`[data-trade-player-salary="${index}"]`).forEach((input) => {
    const seasonIndex = seasons.findIndex(
      (season) => season.id === input.dataset.seasonId
    );

    if (seasonIndex >= 0 && seasonIndex < boundedYears) {
      const amount = Math.max(
        0,
        Math.round(startingSalary * Math.pow(factor, seasonIndex))
      );
      input.value = String(amount);
    } else {
      input.value = '';
    }
  });

  const endSelect = card.querySelector(`[data-trade-player-end="${index}"]`);
  if (endSelect) endSelect.value = seasons[boundedYears - 1].id;

  const summary = card.querySelector(
    `[data-trade-player-contract-summary-v3121="${index}"]`
  );
  if (summary) {
    const changeText = mode === 'same'
      ? 'same salary'
      : `${Number(pct || 0).toLocaleString(undefined,{maximumFractionDigits:2})}% ${mode} / year`;
    summary.textContent =
      `${boundedYears} ${boundedYears === 1 ? 'season' : 'seasons'} · ${formatMoney(startingSalary)} starting · ${changeText}`;
  }

  return true;
}

function syncTradeIncomingPlayerQuickModeV3121(card, index) {
  if (!card) return;
  const mode = card.querySelector(
    `[data-trade-player-quick-mode="${index}"]`
  )?.value || 'same';
  const pct = card.querySelector(
    `[data-trade-player-quick-pct="${index}"]`
  );
  if (!pct) return;

  pct.disabled = mode === 'same';
  if (mode === 'same') pct.value = '0';
}

function tradeIncomingPlayerCurrentMetaV3121(player) {
  if (!player) return '';

  const status = statusById(player.statusId);
  const endSeason = player.contractEndSeasonId
    ? seasonById(player.contractEndSeasonId)
    : null;
  const development = tradeIncomingPlayerDevelopmentLabelV3121();

  return [
    player.position || '—',
    player.realTeam || 'No team',
    player.ageSnapshot === null || player.ageSnapshot === undefined
      ? null
      : `Age ${player.ageSnapshot}`,
    player.rosterGroup === 'FARM' ? development : 'Active',
    status?.name || null,
    endSeason ? `Through ${seasonLabel(endSeason.startYear)}` : 'No contract end'
  ].filter(Boolean).join(' · ');
}

function structuredTradeIncomingPlayerLabelV3121(item) {
  const player = item?.playerId
    ? (state.players || []).find((candidate) => candidate.id === item.playerId)
    : null;

  if (!player) {
    return `<div class="trade-choice">
      <span class="trade-choice-value">IN</span>
      <span class="trade-choice-main">
        <strong>${escapeHtml(item.label)}</strong>
        <small>Player · no longer on current roster</small>
      </span>
      <span class="trade-choice-value">Historical</span>
    </div>`;
  }

  return `<div class="trade-choice">
    <span class="trade-choice-value">IN</span>
    <span class="trade-choice-main">
      <strong>${escapeHtml(player.name)}</strong>
      <small>${escapeHtml(tradeIncomingPlayerCurrentMetaV3121(player))}</small>
    </span>
    <button
      class="btn btn-secondary btn-small"
      data-edit-trade-incoming-player-v3121="${escapeAttr(player.id)}"
      type="button"
    >Edit Player</button>
  </div>`;
}

function bindStructuredTradeIncomingPlayerEditsV3121() {
  document
    .querySelectorAll('[data-edit-trade-incoming-player-v3121]')
    .forEach((button) => {
      button.addEventListener('click', () => {
        const playerId = button.dataset.editTradeIncomingPlayerV3121;
        const player = (state.players || []).find(
          (candidate) => candidate.id === playerId
        );
        if (!player) {
          alert('This incoming player is no longer on the current roster.');
          return;
        }

        transactionDialog.close();
        resetTransactionEditState();

        if (typeof openPlayerDialog === 'function') {
          openPlayerDialog(playerId);
        }
      });
    });
}


function transactionMetadataFlagV3118(item, key) {
  const value = item?.metadata?.[key];
  return value === true || String(value || '').trim().toLowerCase() === 'true';
}

function transactionExecutionDateLockedV3118(transactionId) {
  return transactionItemsFor(transactionId).some((item) => {
    if (transactionMetadataFlagV3118(item, 'structured_trade')) return true;
    if (transactionMetadataFlagV3118(item, 'structured_draft')) return true;
    if (transactionMetadataFlagV3118(item, 'contract_transaction_v296')) return true;

    if (item.kind === 'PLAYER') {
      const action = String(item.metadata?.roster_action || 'NONE')
        .trim()
        .toUpperCase();
      if (action !== 'NONE') return true;
    }

    return false;
  });
}

function syncTransactionExecutionDateLockV3118(transactionId) {
  const tx = state.transactions.find((item) => item.id === transactionId);
  const dateInput = el('transactionDate');
  if (!tx || !dateInput) return;

  const locked = transactionExecutionDateLockedV3118(transactionId);
  dateInput.disabled = locked;

  if (!locked) return;

  const notice = el('transactionEditNotice');
  const lockCopy =
    'Transaction date is locked because this entry already changed roster, contract or asset state. '
    + 'Keeping the execution date fixed preserves safe reversal ordering.';

  if (notice && !notice.textContent.includes('Transaction date is locked')) {
    notice.textContent = `${notice.textContent.trim()} ${lockCopy}`.trim();
    notice.classList.remove('hidden');
  }

  // Draft History is installed later by app.js and rewrites its own helper copy.
  // Re-apply the integrity language after all synchronous wrappers finish.
  queueMicrotask(() => {
    if (editingTransactionId !== transactionId) return;

    const currentDateInput = el('transactionDate');
    if (currentDateInput) currentDateInput.disabled = true;

    if (tx.type === 'Draft') {
      const help = el('transactionTypeHelp');
      if (help) {
        help.textContent =
          'The execution date, drafted player and Draft Pick are locked after recording. '
          + 'You can still correct the summary and notes.';
      }

      const draftLock = el('draftTransactionEditLock');
      if (draftLock) {
        draftLock.textContent =
          'The transaction date, player and Draft Pick are locked after the Draft is recorded. '
          + 'Edit the summary or notes here; delete and recreate the Draft entry to change the selection.';
      }
    }
  });
}


function transactionItemsFor(transactionId, direction = null) {
  return state.transactionItems.filter((item) => item.transactionId === transactionId && (!direction || item.direction === direction));
}

function transactionDeadCapFor(transactionId) {
  const rows = state.adjustments.filter((item) => item.sourceTransactionId === transactionId);
  if (!rows.length) return null;
  return {
    description: rows[0].description || 'Dead Cap',
    rows,
    total: rows.reduce((sum, row) => sum + Number(row.amount || 0), 0)
  };
}

function tradeCurrentCharge(player) {
  const season = currentSeason();
  return season ? effectivePlayerCharge(player, season.id) : null;
}

function structuredTradeItemLabel(item) {
  const kind = item.kind === 'PLAYER' ? 'Player' : item.kind === 'ASSET' ? 'Asset' : 'Item';
  return `<div class="trade-choice"><span></span><span class="trade-choice-main"><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(kind)}</small></span><span class="trade-choice-value">${escapeHtml(item.direction)}</span></div>`;
}

function renderStructuredTradeSelectors() {
  const outPlayers = state.players.map((player) => {
    const charge = tradeCurrentCharge(player);
    const status = statusById(player.statusId);
    return `<label class="trade-choice"><input type="checkbox" data-trade-out-player="${player.id}" /><span class="trade-choice-main"><strong>${escapeHtml(player.name)}</strong><small>${escapeHtml(player.position)} · ${escapeHtml(player.realTeam || '—')} · ${player.rosterGroup === 'FARM' ? 'Minors' : 'Active'} · ${escapeHtml(status?.name || 'Other')}</small></span><span class="trade-choice-value">${charge === null ? '—' : formatMoney(charge)}</span></label>`;
  }).join('');
  el('tradeOutgoingPlayers').innerHTML = outPlayers || '<div class="trade-empty">No current roster or Minors players are available.</div>';

  const outgoingAssets = (state.assets || []).filter((asset) => !asset.archivedAt && ['OWNED','CONDITIONAL'].includes(asset.status));
  el('tradeOutgoingAssets').innerHTML = outgoingAssets.length ? outgoingAssets.map((asset) => `<label class="trade-choice"><input type="checkbox" data-trade-out-asset="${asset.id}" /><span class="trade-choice-main"><strong>${escapeHtml(asset.label)}</strong><small>${escapeHtml(assetTypeLabel(asset.type))} · ${escapeHtml(assetStatusLabel(asset.status))}</small></span><span class="trade-choice-value">OUT</span></label>`).join('') : '<div class="trade-empty">No owned assets are available.</div>';

  const reacquireAssets = (state.assets || []).filter((asset) => !asset.archivedAt && asset.status === 'TRADED_AWAY');
  el('tradeIncomingExistingAssets').innerHTML = reacquireAssets.length ? reacquireAssets.map((asset) => `<label class="trade-choice"><input type="checkbox" data-trade-in-existing-asset="${asset.id}" /><span class="trade-choice-main"><strong>${escapeHtml(asset.label)}</strong><small>${escapeHtml(assetTypeLabel(asset.type))} · currently Traded Away</small></span><span class="trade-choice-value">IN</span></label>`).join('') : '<div class="trade-empty">No previously traded assets to reacquire.</div>';

  document.querySelectorAll('[data-trade-out-player]').forEach((input) => {
    input.addEventListener('change', () => syncTradeRetentionControlsV3115({ recalculate:true }));
  });
  syncTradeRetentionControlsV3115({ recalculate:false });
}

function tradeSalaryInputs(index) {
  return contractHorizonSeasons().map((season) => `<label class="trade-contract-cell"><span>${seasonLabel(season.startYear)}</span><input data-trade-player-salary="${index}" data-season-id="${season.id}" type="number" min="0" step="1" placeholder="Salary" /></label>`).join('');
}

function addTradeIncomingPlayer() {
  const index = ++tradeBuilderSequence;
  const wrap = document.createElement('div');
  const teamCopy = tradeIncomingPlayerTeamCopyV3121();
  const development = tradeIncomingPlayerDevelopmentLabelV3121();
  const positions = tradeIncomingPlayerPositionsV3121();
  const defaultPosition = positions[0] || 'C';

  wrap.className = 'trade-builder-card';
  wrap.dataset.tradeIncomingPlayerCard = String(index);
  wrap.innerHTML = `
    <div class="trade-builder-head">
      <div>
        <strong>Incoming Player</strong>
        <small class="muted" style="display:block;margin-top:2px;font-size:.56rem">
          Creates a real roster player when this Trade is saved.
        </small>
      </div>
      <button class="btn btn-ghost" data-remove-trade-builder type="button">Remove</button>
    </div>

    <div class="trade-builder-grid">
      <label class="full">
        Player name
        <input
          data-trade-player-name="${index}"
          autocomplete="off"
          placeholder="Player name"
        />
      </label>

      <label>
        Position
        <select data-trade-player-position="${index}">
          ${tradeIncomingPlayerPositionOptionsV3121(defaultPosition)}
        </select>
      </label>

      <label>
        Eligible positions
        <input
          data-trade-player-eligible="${index}"
          placeholder="${escapeAttr(teamCopy.eligiblePlaceholder)}"
        />
      </label>

      <label>
        ${escapeHtml(teamCopy.label)}
        <input
          data-trade-player-team="${index}"
          maxlength="12"
          placeholder="${escapeAttr(teamCopy.placeholder)}"
        />
      </label>

      <label>
        Age
        <input
          data-trade-player-age="${index}"
          type="number"
          min="0"
          max="100"
          step="1"
        />
      </label>

      <label>
        Roster status
        <select data-trade-player-status="${index}">
          ${state.statuses.map((status) =>
            `<option value="${status.id}">${escapeHtml(status.name)}</option>`
          ).join('')}
        </select>
      </label>

      <label>
        Location
        <select data-trade-player-group="${index}">
          <option value="ACTIVE">Active roster</option>
          <option value="FARM">${escapeHtml(development)}</option>
        </select>
      </label>

      <label class="trade-builder-check">
        <input data-trade-player-prospect="${index}" type="checkbox" />
        Prospect / development player
      </label>
    </div>

    <div class="trade-builder-card" style="padding:8px;margin-top:1px">
      <div class="trade-builder-head">
        <div>
          <strong>Quick contract</strong>
          <small
            class="muted"
            data-trade-player-contract-summary-v3121="${index}"
            style="display:block;margin-top:2px;font-size:.54rem"
          >Optional — generate the salary years below.</small>
        </div>
      </div>

      <div class="trade-builder-grid">
        <label>
          Starting salary
          <input
            data-trade-player-quick-salary="${index}"
            type="number"
            inputmode="numeric"
            min="0"
            step="1"
            placeholder="e.g. 5000000"
          />
        </label>

        <label>
          Years remaining
          <input
            data-trade-player-quick-years="${index}"
            type="number"
            inputmode="numeric"
            min="1"
            max="${contractHorizonSeasons().length}"
            step="1"
            placeholder="1"
          />
        </label>

        <label>
          Annual change
          <select data-trade-player-quick-mode="${index}">
            <option value="same">Same salary</option>
            <option value="increase">Increase each year</option>
            <option value="decrease">Decrease each year</option>
          </select>
        </label>

        <label>
          Change %
          <input
            data-trade-player-quick-pct="${index}"
            type="number"
            inputmode="decimal"
            min="0"
            max="100"
            step="0.01"
            value="0"
            disabled
          />
        </label>

        <div class="full trade-add-actions">
          <button
            class="btn btn-secondary btn-small"
            data-apply-trade-player-contract-v3121="${index}"
            type="button"
          >Apply Contract</button>
        </div>
      </div>
    </div>

    <details class="full">
      <summary style="cursor:pointer;color:var(--muted);font-size:.61rem;font-weight:800">
        Advanced contract years
      </summary>
      <div class="trade-builder-grid" style="margin-top:7px">
        <label>
          Contract through
          <select data-trade-player-end="${index}">
            <option value="">Not set</option>
            ${contractHorizonSeasons().map((season) =>
              `<option value="${season.id}">${seasonLabel(season.startYear)}</option>`
            ).join('')}
          </select>
        </label>
        <div class="full">
          <span class="muted" style="font-size:.61rem">Salary by season</span>
          <div class="trade-contract-grid" style="margin-top:5px">
            ${tradeSalaryInputs(index)}
          </div>
        </div>
      </div>
    </details>
  `;

  wrap
    .querySelector('[data-remove-trade-builder]')
    .addEventListener('click', () => wrap.remove());

  const group = wrap.querySelector(`[data-trade-player-group="${index}"]`);
  const prospect = wrap.querySelector(`[data-trade-player-prospect="${index}"]`);
  const position = wrap.querySelector(`[data-trade-player-position="${index}"]`);
  const eligible = wrap.querySelector(`[data-trade-player-eligible="${index}"]`);
  const quickMode = wrap.querySelector(`[data-trade-player-quick-mode="${index}"]`);

  group.addEventListener('change', () => {
    if (group.value === 'FARM') prospect.checked = true;
  });

  position.addEventListener('change', () => {
    if (!eligible.value.trim()) eligible.value = position.value;
  });

  quickMode.addEventListener('change', () => {
    syncTradeIncomingPlayerQuickModeV3121(wrap, index);
  });

  wrap
    .querySelector(`[data-apply-trade-player-contract-v3121="${index}"]`)
    .addEventListener('click', () => {
      tradeIncomingPlayerQuickContractRowsV3121(wrap, index);
    });

  syncTradeIncomingPlayerQuickModeV3121(wrap, index);
  el('tradeIncomingPlayers').appendChild(wrap);
}
function addTradeIncomingAsset() {
  const index = ++tradeBuilderSequence;
  const wrap = document.createElement('div');
  wrap.className = 'trade-builder-card';
  wrap.dataset.tradeIncomingAssetCard = String(index);
  wrap.innerHTML = `<div class="trade-builder-head"><strong>Incoming Asset</strong><button class="btn btn-ghost" data-remove-trade-builder type="button">Remove</button></div><div class="trade-builder-grid">
    <label>Type<select data-trade-asset-type="${index}"><option value="DRAFT_PICK">Draft Pick</option><option value="PROSPECT_RIGHTS">Prospect Rights</option><option value="PLAYER_RIGHTS">Player Rights</option><option value="CONDITIONAL_ASSET">Conditional Asset</option><option value="FUTURE_CONSIDERATIONS">Future Considerations</option><option value="OTHER">Other</option></select></label>
    <label>Name<input data-trade-asset-label="${index}" placeholder="Optional for draft pick" /></label>
    <label data-trade-draft-field="${index}">Draft year<input data-trade-asset-year="${index}" type="number" min="1900" max="2200" placeholder="2028" /></label>
    <label data-trade-draft-field="${index}">Round<input data-trade-asset-round="${index}" type="number" min="1" max="99" placeholder="1" /></label>
    <label class="full" data-trade-draft-field="${index}">Original team<input data-trade-asset-team="${index}" placeholder="Original team" /></label>
    <label class="full">Notes<input data-trade-asset-notes="${index}" placeholder="Optional conditions or notes" /></label>
  </div>`;
  wrap.querySelector('[data-remove-trade-builder]').addEventListener('click', () => wrap.remove());
  const type = wrap.querySelector(`[data-trade-asset-type="${index}"]`);
  const sync = () => wrap.querySelectorAll(`[data-trade-draft-field="${index}"]`).forEach((field) => field.classList.toggle('hidden', type.value !== 'DRAFT_PICK'));
  type.addEventListener('change', sync); sync();
  el('tradeIncomingAssets').appendChild(wrap);
}

function resetStructuredTradeControls() {
  tradeBuilderSequence = 0;
  el('tradeIncomingPlayers').innerHTML = '';
  el('tradeIncomingAssets').innerHTML = '';
  el('tradeEditLock').classList.add('hidden');
  el('addTradeIncomingPlayerBtn').classList.remove('hidden');
  el('addTradeIncomingAssetBtn').classList.remove('hidden');
  resetTradeRetentionDraftV3115();
  renderStructuredTradeSelectors();
}

function renderStructuredTradeEditSummary(transactionId) {
  const items = transactionItemsFor(transactionId).filter((item) => item.kind !== 'FINANCIAL');
  const outgoing = items.filter((item) => item.direction === 'OUT');
  const incoming = items.filter((item) => item.direction === 'IN');
  const incomingPlayers = incoming.filter((item) => item.kind === 'PLAYER');

  el('tradeOutgoingPlayers').innerHTML = outgoing
    .filter((item) => item.kind === 'PLAYER')
    .map(structuredTradeItemLabel)
    .join('') || '<div class="trade-empty">No outgoing players.</div>';

  el('tradeOutgoingAssets').innerHTML = outgoing
    .filter((item) => item.kind === 'ASSET')
    .map(structuredTradeItemLabel)
    .join('') || '<div class="trade-empty">No outgoing assets.</div>';

  el('tradeIncomingExistingAssets').innerHTML = incoming
    .filter((item) => item.kind === 'ASSET')
    .map(structuredTradeItemLabel)
    .join('') || '<div class="trade-empty">No incoming assets.</div>';

  el('tradeIncomingPlayers').innerHTML = incomingPlayers.length
    ? incomingPlayers.map(structuredTradeIncomingPlayerLabelV3121).join('')
    : '<div class="trade-empty">No incoming players.</div>';

  el('tradeIncomingAssets').innerHTML = '';
  el('tradeEditLock').classList.remove('hidden');
  el('addTradeIncomingPlayerBtn').classList.add('hidden');
  el('addTradeIncomingAssetBtn').classList.add('hidden');

  bindStructuredTradeIncomingPlayerEditsV3121();
  syncTradeRetentionControlsV3115({ recalculate:false });
}

function collectStructuredTradePayload() {
  const outPlayerIds = [...document.querySelectorAll('[data-trade-out-player]:checked')].map((input) => input.dataset.tradeOutPlayer);
  const outAssetIds = [...document.querySelectorAll('[data-trade-out-asset]:checked')].map((input) => input.dataset.tradeOutAsset);
  const inExistingAssetIds = [...document.querySelectorAll('[data-trade-in-existing-asset]:checked')].map((input) => input.dataset.tradeInExistingAsset);
  const inPlayers = [...document.querySelectorAll('[data-trade-incoming-player-card]')].map((card) => {
    const index = card.dataset.tradeIncomingPlayerCard;
    const name = card.querySelector(`[data-trade-player-name="${index}"]`).value.trim();
    const position = card.querySelector(`[data-trade-player-position="${index}"]`).value;
    const eligible = normalizeEligibility(card.querySelector(`[data-trade-player-eligible="${index}"]`).value) || position;
    const group = card.querySelector(`[data-trade-player-group="${index}"]`).value;
    const prospect = card.querySelector(`[data-trade-player-prospect="${index}"]`).checked || group === 'FARM';
    const salaryRows = [...card.querySelectorAll(`[data-trade-player-salary="${index}"]`)].map((input) => ({ season_id:input.dataset.seasonId, salary:nullableNumber(input.value), cap_override:null })).filter((row) => row.salary !== null);
    return { player_name:name, position, eligible_positions:eligible, real_team:normalizeNhlTeam(card.querySelector(`[data-trade-player-team="${index}"]`).value), age_snapshot:nullableInteger(card.querySelector(`[data-trade-player-age="${index}"]`).value), roster_status_id:card.querySelector(`[data-trade-player-status="${index}"]`).value, roster_group:group, is_prospect:prospect, contract_end_season_id:card.querySelector(`[data-trade-player-end="${index}"]`).value || null, salary_rows:salaryRows };
  });
  for (const player of inPlayers) if (!player.player_name) throw new Error('Each incoming player needs a player name.');

  const inAssets = [...document.querySelectorAll('[data-trade-incoming-asset-card]')].map((card) => {
    const index = card.dataset.tradeIncomingAssetCard;
    const type = card.querySelector(`[data-trade-asset-type="${index}"]`).value;
    const year = nullableInteger(card.querySelector(`[data-trade-asset-year="${index}"]`).value);
    const round = nullableInteger(card.querySelector(`[data-trade-asset-round="${index}"]`).value);
    const team = card.querySelector(`[data-trade-asset-team="${index}"]`).value.trim();
    const label = card.querySelector(`[data-trade-asset-label="${index}"]`).value.trim();
    const notes = card.querySelector(`[data-trade-asset-notes="${index}"]`).value.trim();
    if (type === 'DRAFT_PICK' && (!year || !round || !team)) throw new Error('Each incoming draft pick needs a year, round and original team.');
    if (type !== 'DRAFT_PICK' && !label) throw new Error('Each incoming non-draft asset needs a name.');
    return { asset_type:type, asset_label:label || null, draft_year:type === 'DRAFT_PICK' ? year : null, draft_round:type === 'DRAFT_PICK' ? round : null, original_team:type === 'DRAFT_PICK' ? team : null, notes:notes || null };
  });
  if (!(outPlayerIds.length || outAssetIds.length || inExistingAssetIds.length || inPlayers.length || inAssets.length)) throw new Error('Add at least one incoming or outgoing player/asset to the trade.');
  return { outPlayerIds, outAssetIds, inExistingAssetIds, inPlayers, inAssets };
}

function renderTransactions() {
  const sortedTransactions = [...state.transactions].sort((a,b) =>
    `${b.date} ${b.createdAt}`.localeCompare(`${a.date} ${a.createdAt}`)
  );

  const availableTypes = [...new Set(
    sortedTransactions
      .map((tx) => String(tx.type || '').trim())
      .filter(Boolean)
  )];

  if (
    transactionLedgerFilterV3116 !== 'ALL'
    && !availableTypes.includes(transactionLedgerFilterV3116)
  ) {
    transactionLedgerFilterV3116 = 'ALL';
  }

  const visibleTransactions = transactionLedgerFilterV3116 === 'ALL'
    ? sortedTransactions
    : sortedTransactions.filter((tx) => String(tx.type || '').trim() === transactionLedgerFilterV3116);

  const filterButtons = [
    {
      value:'ALL',
      label:'All',
      count:sortedTransactions.length
    },
    ...availableTypes.map((type) => ({
      value:type,
      label:type,
      count:sortedTransactions.filter((tx) => tx.type === type).length
    }))
  ].map((filter) => {
    const active = filter.value === transactionLedgerFilterV3116;
    return `<button
      class="depth-position-tab ${active ? 'active' : ''}"
      data-transaction-ledger-filter="${escapeAttr(filter.value)}"
      type="button"
      aria-pressed="${active ? 'true' : 'false'}"
    >${escapeHtml(filter.label)} <span aria-hidden="true">· ${filter.count}</span></button>`;
  }).join('');

  const txRows = visibleTransactions.map((tx) => {
    const allItems = transactionItemsFor(tx.id);
    const incoming = allItems.filter((item) => item.direction === 'IN' && item.kind !== 'FINANCIAL');
    const outgoing = allItems.filter((item) => item.direction === 'OUT' && item.kind !== 'FINANCIAL');
    const playerItems = allItems.filter((item) => item.kind === 'PLAYER' && item.direction === 'NONE');
    const deadCap = transactionDeadCapFor(tx.id);

    const financialSeasonChips = deadCap
      ? [...deadCap.rows]
          .map((row) => ({ row, season:seasonById(row.seasonId) }))
          .filter((item) => item.season)
          .sort((a,b) => a.season.startYear - b.season.startYear)
          .map((item) => `<em>${escapeHtml(seasonLabel(item.season.startYear))} · ${formatMoney(item.row.amount)}</em>`)
          .join('')
      : '';

    const financialLabel = tx.type === 'Trade' ? 'RETAINED' : 'DEAD CAP';

    const inRow = incoming.length
      ? `<div class="tx-ledger-flow-v228 in"><span class="tx-ledger-direction-v228">IN</span><span>${incoming.map((item) => `<em>${escapeHtml(item.label)}</em>`).join('')}</span></div>`
      : '';
    const outRow = outgoing.length
      ? `<div class="tx-ledger-flow-v228 out"><span class="tx-ledger-direction-v228">OUT</span><span>${outgoing.map((item) => `<em>${escapeHtml(item.label)}</em>`).join('')}</span></div>`
      : '';
    const playerRow = playerItems.length
      ? `<div class="tx-ledger-flow-v228"><span class="tx-ledger-direction-v228">PLAYER</span><span>${playerItems.map((item) => `<em>${escapeHtml(item.label)}</em>`).join('')}</span></div>`
      : '';
    const deadCapRow = deadCap
      ? `<div class="tx-ledger-flow-v228 financial"><span class="tx-ledger-direction-v228">${financialLabel}</span><span><em>${escapeHtml(deadCap.description)}</em>${financialSeasonChips}<strong>Total ${formatMoney(deadCap.total)}</strong></span></div>`
      : '';

    return `<article class="transaction-card transaction-card-v228">
      <div class="tx-ledger-head-v228">
        <div class="tx-ledger-title-v228">
          <span class="transaction-type">${escapeHtml(tx.type)}</span>
          <h4>${escapeHtml(tx.summary)}</h4>
          ${tx.counterparty ? `<p>With ${escapeHtml(tx.counterparty)}</p>` : ''}
        </div>
        <time>${escapeHtml(tx.date)}</time>
      </div>
      ${(inRow || outRow || playerRow || deadCapRow) ? `<div class="tx-ledger-body-v228">${inRow}${outRow}${playerRow}${deadCapRow}</div>` : ''}
      ${tx.notes ? `<p class="tx-ledger-notes-v228">${escapeHtml(tx.notes)}</p>` : ''}
      <div class="transaction-card-actions tx-ledger-actions-v228">
        <button class="btn btn-ghost btn-small" data-edit-transaction="${tx.id}" type="button">Edit</button>
        <button class="btn btn-danger btn-small" data-delete-transaction="${tx.id}" type="button">Delete</button>
      </div>
    </article>`;
  }).join('');

  const activeLabel = transactionLedgerFilterV3116 === 'ALL'
    ? 'all transaction types'
    : transactionLedgerFilterV3116;

  el('transactionsView').innerHTML = `<div class="transactions-page transactions-page-v228">
    <div class="page-heading-row tx-page-heading-v228">
      <div>
        <p class="eyebrow">Ledger</p>
        <h3>Transactions</h3>
        <p class="page-copy">Showing ${visibleTransactions.length} of ${sortedTransactions.length} recorded moves · ${escapeHtml(activeLabel)}.</p>
      </div>
      <button id="recordTransactionBtn" class="btn btn-primary" type="button">+ Record Transaction</button>
    </div>

    <div class="depth-position-tabs" role="group" aria-label="Filter transactions by type">
      ${filterButtons}
    </div>

    ${txRows
      ? `<div class="transaction-list transaction-list-v228">${txRows}</div>`
      : `<div class="empty-state"><h4>No transactions recorded</h4><p>Record a trade, signing, waiver, buyout, call-up or other move to begin the ledger.</p></div>`
    }
  </div>`;

  el('recordTransactionBtn').addEventListener('click', () => openTransactionDialog());

  document.querySelectorAll('[data-transaction-ledger-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      transactionLedgerFilterV3116 = button.dataset.transactionLedgerFilter || 'ALL';
      renderTransactions();
    });
  });

  document.querySelectorAll('[data-edit-transaction]').forEach((button) =>
    button.addEventListener('click', () => openEditTransactionDialog(button.dataset.editTransaction))
  );
  document.querySelectorAll('[data-delete-transaction]').forEach((button) =>
    button.addEventListener('click', () => deleteTransaction(button.dataset.deleteTransaction))
  );
}

function transactionTypeConfig(type) {
  const configs = {
    'Trade': { help:'Select the actual players and assets moving in/out. Incoming players and picks become real Front Office records when the trade is saved. Salary retention can be calculated from an outgoing player below.', counterparty:true, structuredTrade:true, autoSummary:true, financial:'manual' },
    'Signing': { help:'Record a signing. Salary and contract terms should be maintained on the player record.', player:'optional', summary:true },
    'Extension': { help:'Choose the player being extended. Their current contract salary appears below for reference.', player:'required', autoSummary:true },
    'Call Up': { help:'Choose a prospect currently in Minors. The roster move is handled automatically.', player:'required', rosterStatus:true, autoSummary:true, action:'CALL_UP' },
    'Send Down': { help:'Choose an active prospect. The player will be moved to Minors automatically.', player:'required', rosterStatus:true, autoSummary:true, action:'SEND_TO_FARM' },
    'Waiver': { help:'Choose the player being waived. The saved waiver rule can calculate the cap penalty automatically.', player:'required', autoSummary:true, action:'REMOVE', financial:'waiver' },
    'Buyout': { help:'Choose the player being bought out. Remaining salary is shown and your saved buyout rule calculates the proposed dead cap.', player:'required', autoSummary:true, action:'REMOVE', financial:'buyout' },
    'Release': { help:'Choose the player being released. This removes the player from the current roster.', player:'required', autoSummary:true, action:'REMOVE' },
    'Drop': { help:'Choose the player being dropped. This removes the player from the current roster.', player:'required', autoSummary:true, action:'REMOVE' },
    'Add': { help:'Record an addition to the ledger. Use Add Player on Roster or Minors to create the player record.', summary:true },
    'Other': { help:'Use the general transaction form for a custom league event.', player:'optional', counterparty:true, flow:true, rosterAction:true, summary:true, financial:'manual' }
  };
  return configs[type] || { help:'Record this front-office move.', summary:true };
}

function transactionPlayerCandidates(type) {
  if (type === 'Call Up') return state.players.filter((player) => player.isProspect && player.rosterGroup === 'FARM');
  if (type === 'Send Down') return state.players.filter((player) => player.isProspect && player.rosterGroup !== 'FARM');
  return [...state.players];
}

function transactionRuleForType(type) {
  if (type === 'Waiver') return {
    label:'Waiver',
    mode:state.frontOffice.waiverPenaltyMode || 'NONE',
    value:state.frontOffice.waiverPenaltyValue,
    scope:state.frontOffice.waiverPenaltyScope || 'CURRENT_SEASON'
  };
  if (type === 'Buyout') return {
    label:'Buyout',
    mode:state.frontOffice.buyoutPenaltyMode || 'NONE',
    value:state.frontOffice.buyoutPenaltyValue,
    scope:state.frontOffice.buyoutPenaltyScope || 'REMAINING_CONTRACT'
  };
  return null;
}

function transactionRuleModeLabel(mode, value) {
  if (mode === 'FULL_SALARY') return 'Full salary (100%)';
  if (mode === 'HALF_SALARY') return 'Half salary (50%)';
  if (mode === 'CUSTOM_PERCENT') return `${Number(value || 0).toLocaleString(undefined,{maximumFractionDigits:2})}% of salary`;
  if (mode === 'FLAT_AMOUNT') return `${formatMoney(Number(value || 0))} per affected season`;
  return 'No automatic penalty';
}

function transactionRuleScopeLabel(scope) {
  return scope === 'REMAINING_CONTRACT' ? 'remaining contracted salary years' : 'current season only';
}

function transactionPlayerSalaryRows(player) {
  if (!player) return [];
  const endSeason = player.contractEndSeasonId ? seasonById(player.contractEndSeasonId) : null;
  return contractHorizonSeasons().map((season) => {
    const salaryRow = player.salaries?.[season.id] || {};
    return {
      season,
      salary:salaryRow.salary ?? null,
      capOverride:salaryRow.capOverride ?? null,
      insideContract:!endSeason || season.startYear <= endSeason.startYear
    };
  });
}


// ============================================================================
// RosterCap V3.11.5 — Trade salary retention calculator
//
// Retention belongs to the structured Trade flow. The selected player must be
// one of the outgoing players. The structured-trade RPC removes that player,
// while the existing transaction adjustment rows retain only the calculated
// percentage of each remaining salary season on the Front Office cap.
// ============================================================================

const ROSTERCAP_TRADE_RETENTION_VERSION_V3115 = '3.11.5';

function retentionRoundV3115(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function tradeRetentionOutgoingPlayerIdsV3115() {
  return [...document.querySelectorAll('[data-trade-out-player]:checked')]
    .map((input) => input.dataset.tradeOutPlayer)
    .filter(Boolean);
}

function tradeRetentionOutgoingPlayersV3115() {
  const ids = new Set(tradeRetentionOutgoingPlayerIdsV3115());
  return (state.players || []).filter((player) => ids.has(player.id));
}

function calculateTradeRetentionRowsV3115(player, percent) {
  const pct = Number(percent);
  if (!player || !Number.isFinite(pct) || pct <= 0 || pct > 100) return [];

  return transactionPlayerSalaryRows(player)
    .filter((row) =>
      row.insideContract
      && row.salary !== null
      && row.salary !== undefined
    )
    .map((row) => ({
      seasonId:row.season.id,
      salary:Number(row.salary || 0),
      amount:retentionRoundV3115(Number(row.salary || 0) * (pct / 100))
    }))
    .filter((row) => row.amount !== 0);
}

function clearTransactionFinancialRowsV3115() {
  document.querySelectorAll('[data-transaction-adjustment-season]').forEach((input) => {
    input.value = '';
  });
}

function ensureTradeRetentionControlsV3115() {
  const manualFields = el('transactionManualFinancialFields');
  if (!manualFields || el('transactionRetentionPlayerV3115')) return;

  const descriptionLabel = el('transactionAdjustmentDescription')?.closest('label');

  const playerLabel = document.createElement('label');
  playerLabel.id = 'transactionRetentionPlayerFieldV3115';
  playerLabel.className = 'hidden';
  playerLabel.innerHTML = `
    <span>Retained player</span>
    <select id="transactionRetentionPlayerV3115">
      <option value="">Select outgoing player…</option>
    </select>
  `;

  const percentLabel = document.createElement('label');
  percentLabel.id = 'transactionRetentionPercentFieldV3115';
  percentLabel.className = 'hidden';
  percentLabel.innerHTML = `
    <span>Retained salary %</span>
    <input
      id="transactionRetentionPercentV3115"
      inputmode="decimal"
      max="100"
      min="0"
      placeholder="e.g. 50"
      step="0.01"
      type="number"
    />
  `;

  const note = document.createElement('div');
  note.id = 'transactionRetentionNoteV3115';
  note.className = 'transaction-smart-note full-width hidden';

  if (descriptionLabel) {
    manualFields.insertBefore(playerLabel, descriptionLabel);
    manualFields.insertBefore(percentLabel, descriptionLabel);
    manualFields.insertBefore(note, descriptionLabel);
  } else {
    manualFields.prepend(note);
    manualFields.prepend(percentLabel);
    manualFields.prepend(playerLabel);
  }

  el('transactionRetentionPlayerV3115')?.addEventListener('change', () => {
    applyTradeRetentionCalculationV3115();
  });

  el('transactionRetentionPercentV3115')?.addEventListener('input', () => {
    applyTradeRetentionCalculationV3115();
  });

  document.documentElement.dataset.rostercapTradeRetention =
    ROSTERCAP_TRADE_RETENTION_VERSION_V3115;
}

function resetTradeRetentionDraftV3115() {
  ensureTradeRetentionControlsV3115();

  const playerSelect = el('transactionRetentionPlayerV3115');
  const percentInput = el('transactionRetentionPercentV3115');
  const note = el('transactionRetentionNoteV3115');

  if (playerSelect) {
    playerSelect.innerHTML = '<option value="">Select outgoing player…</option>';
    playerSelect.value = '';
  }
  if (percentInput) percentInput.value = '';
  if (note) {
    note.textContent = '';
    note.classList.add('hidden');
  }
}

function tradeRetentionMessageV3115(player, percent, rows) {
  if (!player) return 'Select an outgoing player first.';
  if (!rows.length) {
    return 'No entered salary rows are available inside this player’s remaining contract term.';
  }

  const total = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const seasonCount = rows.length;

  return `${Number(percent).toLocaleString(undefined,{maximumFractionDigits:2})}% of ${player.name} · ${seasonCount} ${seasonCount === 1 ? 'season' : 'seasons'} · ${formatMoney(total)} retained total. The outgoing player is removed by the trade; only these retained amounts remain on Cap.`;
}

function applyTradeRetentionCalculationV3115() {
  ensureTradeRetentionControlsV3115();

  if (el('transactionType')?.value !== 'Trade' || editingTransactionId) return;

  const playerId = el('transactionRetentionPlayerV3115')?.value || '';
  const percent = nullableNumber(el('transactionRetentionPercentV3115')?.value);
  const player = (state.players || []).find((item) => item.id === playerId) || null;
  const note = el('transactionRetentionNoteV3115');

  if (percent === null || percent === 0) {
    clearTransactionFinancialRowsV3115();
    if (note) {
      note.textContent = player
        ? 'Enter a retained percentage to calculate the season-by-season amount.'
        : 'Select an outgoing player, then enter the percentage your team retains.';
      note.classList.remove('hidden');
    }
    return;
  }

  if (!Number.isFinite(Number(percent)) || percent < 0 || percent > 100) {
    clearTransactionFinancialRowsV3115();
    if (note) {
      note.textContent = 'Retained salary percentage must be between 0 and 100.';
      note.classList.remove('hidden');
    }
    return;
  }

  if (!player) {
    clearTransactionFinancialRowsV3115();
    if (note) {
      note.textContent = 'Select one of the checked outgoing players to calculate retention.';
      note.classList.remove('hidden');
    }
    return;
  }

  const outgoingIds = new Set(tradeRetentionOutgoingPlayerIdsV3115());
  if (!outgoingIds.has(player.id)) {
    clearTransactionFinancialRowsV3115();
    if (note) {
      note.textContent = 'The retained player must still be selected as an outgoing player in this trade.';
      note.classList.remove('hidden');
    }
    return;
  }

  const rows = calculateTradeRetentionRowsV3115(player, percent);
  clearTransactionFinancialRowsV3115();

  rows.forEach((row) => {
    const input = document.querySelector(
      `[data-transaction-adjustment-season="${CSS.escape(row.seasonId)}"]`
    );
    if (input) input.value = String(row.amount);
  });

  const description = el('transactionAdjustmentDescription');
  if (description) {
    description.value =
      `${player.name} · ${Number(percent).toLocaleString(undefined,{maximumFractionDigits:2})}% retained salary`;
  }

  if (note) {
    note.textContent = tradeRetentionMessageV3115(player, percent, rows);
    note.classList.remove('hidden');
  }
}

function syncTradeRetentionControlsV3115(options = {}) {
  ensureTradeRetentionControlsV3115();

  const isTrade = el('transactionType')?.value === 'Trade';
  const editingTrade = Boolean(isTrade && editingTransactionId);
  const playerField = el('transactionRetentionPlayerFieldV3115');
  const percentField = el('transactionRetentionPercentFieldV3115');
  const note = el('transactionRetentionNoteV3115');
  const playerSelect = el('transactionRetentionPlayerV3115');

  const showCalculator = Boolean(isTrade && !editingTrade);
  playerField?.classList.toggle('hidden', !showCalculator);
  percentField?.classList.toggle('hidden', !showCalculator);
  note?.classList.toggle('hidden', !isTrade);

  if (!isTrade) return;

  if (editingTrade) {
    if (note) {
      note.textContent =
        'Structured trade players are already locked. Existing retained salary rows can still be edited by season below.';
      note.classList.remove('hidden');
    }
    return;
  }

  const outgoingPlayers = tradeRetentionOutgoingPlayersV3115();
  const priorValue = playerSelect?.value || '';

  if (playerSelect) {
    playerSelect.innerHTML = `<option value="">Select outgoing player…</option>${outgoingPlayers.map((player) =>
      `<option value="${escapeAttr(player.id)}">${escapeHtml(player.name)}</option>`
    ).join('')}`;

    const stillAvailable = outgoingPlayers.some((player) => player.id === priorValue);
    if (stillAvailable) playerSelect.value = priorValue;
    else if (outgoingPlayers.length === 1) playerSelect.value = outgoingPlayers[0].id;
    else playerSelect.value = '';
  }

  if (note && !outgoingPlayers.length) {
    note.textContent = 'Check an outgoing player above to enable salary retention.';
    note.classList.remove('hidden');
  } else if (note && outgoingPlayers.length && !playerSelect?.value) {
    note.textContent = 'Choose which outgoing player has salary retained.';
    note.classList.remove('hidden');
  }

  if (options.recalculate !== false) applyTradeRetentionCalculationV3115();
}

function validateTradeRetentionV3115(structuredTrade) {
  if (editingTransactionId || el('transactionType')?.value !== 'Trade') return true;

  const percent = nullableNumber(el('transactionRetentionPercentV3115')?.value);
  if (percent === null || percent === 0) return true;

  if (!Number.isFinite(Number(percent)) || percent < 0 || percent > 100) {
    alert('Retained salary percentage must be between 0 and 100.');
    return false;
  }

  const playerId = el('transactionRetentionPlayerV3115')?.value || '';
  if (!playerId) {
    alert('Choose which outgoing player has salary retained.');
    return false;
  }

  if (!structuredTrade?.outPlayerIds?.includes(playerId)) {
    alert('The retained player must be included in the outgoing side of the trade.');
    return false;
  }

  const player = (state.players || []).find((item) => item.id === playerId) || null;
  const calculatedRows = calculateTradeRetentionRowsV3115(player, percent);
  if (!calculatedRows.length) {
    alert('The retained player has no entered salary rows inside the remaining contract term.');
    return false;
  }

  const expectedBySeason = new Map(
    calculatedRows.map((row) => [row.seasonId, Number(row.amount || 0)])
  );

  const enteredRows = [...document.querySelectorAll('[data-transaction-adjustment-season]')]
    .map((input) => ({
      seasonId:input.dataset.transactionAdjustmentSeason,
      amount:nullableNumber(input.value)
    }))
    .filter((row) => row.amount !== null && row.amount !== 0);

  const enteredBySeason = new Map(
    enteredRows.map((row) => [row.seasonId, Number(row.amount || 0)])
  );

  const parityPass =
    enteredBySeason.size === expectedBySeason.size
    && [...expectedBySeason.entries()].every(([seasonId, expected]) =>
      enteredBySeason.has(seasonId)
      && Math.abs(Number(enteredBySeason.get(seasonId)) - expected) <= 0.01
    );

  if (!parityPass) {
    alert(
      'The retained salary season amounts no longer match the entered percentage. '
      + 'Re-enter the percentage to recalculate, or clear the percentage field to use manual season amounts.'
    );
    return false;
  }

  return true;
}


function renderTransactionPlayerSnapshot() {
  const player = state.players.find((item) => item.id === el('transactionPlayer').value);
  const box = el('transactionPlayerSnapshot');
  if (!player) {
    box.classList.add('hidden');
    return;
  }
  const status = statusById(player.statusId);
  el('transactionPlayerSnapshotName').textContent = player.name;
  el('transactionPlayerSnapshotMeta').textContent = [player.position, player.realTeam || 'No NHL team', status?.name || 'Other', player.rosterGroup === 'FARM' ? 'Minors' : 'Active roster'].filter(Boolean).join(' · ');
  el('transactionPlayerSnapshotEnd').textContent = player.contractEndSeasonId ? `Ends ${seasonLabel(seasonById(player.contractEndSeasonId)?.startYear)}` : 'No end set';
  const rows = transactionPlayerSalaryRows(player).filter((row) => row.salary !== null || row.capOverride !== null);
  el('transactionSalaryGrid').innerHTML = rows.length ? rows.map((row) => {
    const salaryLabel = row.salary === null ? 'Salary —' : formatMoney(row.salary);
    const override = row.capOverride !== null && row.capOverride !== row.salary ? `<small>Cap ${formatMoney(row.capOverride)}</small>` : '';
    return `<div class="transaction-salary-cell"><span>${seasonLabel(row.season.startYear)}</span><strong>${salaryLabel}</strong>${override}</div>`;
  }).join('') : '<div class="transaction-smart-note" style="grid-column:1/-1">No salary has been entered for this player yet.</div>';
  box.classList.remove('hidden');
}

function autoTransactionSummary() {
  if (editingTransactionId || transactionSummaryTouched) return;
  const type = el('transactionType').value;
  if (type === 'Trade') {
    const counterparty = el('transactionCounterparty').value.trim();
    el('transactionSummary').value = counterparty ? `Trade with ${counterparty}` : 'Trade';
    return;
  }
  const player = state.players.find((item) => item.id === el('transactionPlayer').value);
  if (!player) return;
  const summaries = {
    'Signing':`Signed ${player.name}`,
    'Extension':`Extended ${player.name}`,
    'Call Up':`Called up ${player.name}`,
    'Send Down':`Sent ${player.name} to Minors`,
    'Waiver':`Waived ${player.name}`,
    'Buyout':`Bought out ${player.name}`,
    'Release':`Released ${player.name}`,
    'Drop':`Dropped ${player.name}`
  };
  if (summaries[type]) el('transactionSummary').value = summaries[type];
}

function updateTransactionRosterStatusVisibility() {
  const config = transactionTypeConfig(el('transactionType').value);
  const action = el('transactionRosterAction').value;
  const show = Boolean(config.rosterStatus || (config.rosterAction && ['CALL_UP','SEND_TO_FARM'].includes(action)));
  el('transactionRosterStatusField').classList.toggle('hidden', !show);
}

function renderTransactionFinancialMode() {
  const type = el('transactionType').value;
  const config = transactionTypeConfig(type);
  const section = el('transactionFinancialSection');
  ensureTradeRetentionControlsV3115();

  if (!config.financial) {
    section.classList.add('hidden');
    syncTradeRetentionControlsV3115({ recalculate:false });
    return;
  }

  section.classList.remove('hidden');
  const automatic = config.financial === 'waiver' || config.financial === 'buyout';
  el('transactionRulePreview').classList.toggle('hidden', !automatic);
  el('transactionManualFinancialFields').classList.toggle('hidden', automatic);

  if (automatic) {
    const rule = transactionRuleForType(type);
    el('transactionFinancialTitle').textContent = `${type} Dead Cap`;
    el('transactionFinancialCopy').textContent = 'Calculated from the selected player salary and your Transaction Rules. The result is recorded as Dead Cap and can be overridden before saving.';
    el('transactionRulePreviewTitle').textContent = `${type} rule from Settings`;
    el('transactionRulePreviewCopy').textContent = `${transactionRuleModeLabel(rule.mode, rule.value)} · ${transactionRuleScopeLabel(rule.scope)}.`;
    const player = state.players.find((item) => item.id === el('transactionPlayer').value);
    el('transactionAdjustmentDescription').value = player ? `${player.name} ${type.toLowerCase()} penalty` : `${type} penalty`;
  } else if (type === 'Trade') {
    el('transactionFinancialTitle').textContent = 'Salary Retention';
    el('transactionFinancialCopy').textContent =
      'Optional. Select an outgoing player and enter the percentage your team keeps. Retention is calculated from each entered remaining salary season. The outgoing player is removed by the structured trade, so only the retained amount remains on Cap.';
    if (!el('transactionAdjustmentDescription').value) {
      el('transactionAdjustmentDescription').value = 'Retained salary';
    }
  } else {
    el('transactionFinancialTitle').textContent = 'Optional Dead Cap';
    el('transactionFinancialCopy').textContent = 'Enter retained salary or another transaction-generated amount that should remain on your cap.';
  }

  syncTradeRetentionControlsV3115({ recalculate:false });
}

function automaticPenaltyRows(type, player) {
  const rule = transactionRuleForType(type);
  if (!rule || !player || rule.mode === 'NONE') return [];
  let candidates = transactionPlayerSalaryRows(player);
  if (rule.scope === 'CURRENT_SEASON') candidates = candidates.filter((row) => row.season.id === currentSeason().id);
  else candidates = candidates.filter((row) => row.insideContract && row.salary !== null);
  return candidates.map((row) => {
    const salary = Number(row.salary || 0);
    let amount = 0;
    if (rule.mode === 'FULL_SALARY') amount = salary;
    else if (rule.mode === 'HALF_SALARY') amount = salary * 0.5;
    else if (rule.mode === 'CUSTOM_PERCENT') amount = salary * (Number(rule.value || 0) / 100);
    else if (rule.mode === 'FLAT_AMOUNT') amount = Number(rule.value || 0);
    return { seasonId:row.season.id, amount:Math.round(amount * 100) / 100 };
  }).filter((row) => row.amount !== 0);
}

function applyAutomaticTransactionPenalty() {
  if (editingTransactionId) return;
  const type = el('transactionType').value;
  if (!['Waiver','Buyout'].includes(type)) return;
  const player = state.players.find((item) => item.id === el('transactionPlayer').value);
  document.querySelectorAll('[data-transaction-adjustment-season]').forEach((input) => { input.value = ''; });
  const rule = transactionRuleForType(type);
  if (!player || !rule || rule.mode === 'NONE') return;
  automaticPenaltyRows(type, player).forEach((row) => {
    const input = document.querySelector(`[data-transaction-adjustment-season="${row.seasonId}"]`);
    if (input) input.value = String(row.amount);
  });
}

function handleTransactionPlayerChange() {
  renderTransactionPlayerSnapshot();
  autoTransactionSummary();
  renderTransactionFinancialMode();
  applyAutomaticTransactionPenalty();
}

function handleTransactionTypeChange() {
  const type = el('transactionType').value;
  const config = transactionTypeConfig(type);
  document.querySelectorAll('[data-transaction-adjustment-season]').forEach((input) => { input.value = ''; });
  if (config.autoSummary) transactionSummaryTouched = false;
  else if (!transactionSummaryTouched) el('transactionSummary').value = '';
  if (config.financial === 'manual') el('transactionAdjustmentDescription').value = '';
  el('transactionTypeHelp').textContent = config.help;
  el('transactionCounterpartyField').classList.toggle('hidden', !config.counterparty);
  el('transactionPlayerField').classList.toggle('hidden', !config.player);
  el('transactionRosterActionField').classList.toggle('hidden', !config.rosterAction);
  el('transactionSummaryField').classList.toggle('hidden', Boolean(config.autoSummary) && !editingTransactionId);
  el('transactionIncomingField').classList.toggle('hidden', !config.flow);
  el('transactionOutgoingField').classList.toggle('hidden', !config.flow);
  el('transactionTradeStructuredSection').classList.toggle('hidden', !config.structuredTrade);
  if (config.structuredTrade && !editingTransactionId) resetStructuredTradeControls();
  el('transactionRosterAction').value = config.action || 'NONE';

  const currentPlayerId = el('transactionPlayer').value;
  const candidates = transactionPlayerCandidates(type);
  el('transactionPlayer').innerHTML = `<option value="">${config.player === 'required' ? 'Select player…' : 'None'}</option>${candidates.map((player) => `<option value="${player.id}" ${player.id === currentPlayerId ? 'selected' : ''}>${escapeHtml(player.name)}${player.isProspect ? ' · Prospect' : ''}${player.rosterGroup === 'FARM' ? ' · Minors' : ''}</option>`).join('')}`;
  el('transactionPlayer').required = config.player === 'required';
  if (config.player === 'required' && !el('transactionPlayer').value && candidates.length === 1) el('transactionPlayer').value = candidates[0].id;
  updateTransactionRosterStatusVisibility();
  renderTransactionPlayerSnapshot();
  renderTransactionFinancialMode();
  autoTransactionSummary();
  applyAutomaticTransactionPenalty();
  syncTradeRetentionControlsV3115({ recalculate:false });
}

function resetTransactionEditState() {
  editingTransactionId = null;
  el('transactionType').disabled = false;
  el('transactionDate').disabled = false;
  el('transactionPlayer').disabled = false;
  el('transactionRosterAction').disabled = false;
  el('transactionRosterStatus').disabled = false;
  el('transactionEditNotice').classList.add('hidden');
  el('transactionEditNotice').textContent = '';
  el('transactionDialogTitle').textContent = 'Record transaction';
  el('saveTransactionBtn').textContent = 'Save Transaction';
  el('tradeEditLock').classList.add('hidden');
  resetTradeRetentionDraftV3115();
}

function openTransactionDialog(options = {}) {
  resetTransactionEditState();
  transactionSummaryTouched = Boolean(options.summary);
  el('transactionType').value = options.type || 'Trade';
  el('transactionDate').value = options.date || todayIsoDate();
  el('transactionCounterparty').value = options.counterparty || '';
  el('transactionSummary').value = options.summary || '';
  el('transactionIncoming').value = options.incoming || '';
  el('transactionOutgoing').value = options.outgoing || '';
  el('transactionNotes').value = options.notes || '';
  el('transactionRosterAction').value = options.rosterAction || 'NONE';
  el('transactionAdjustmentDescription').value = options.adjustmentDescription || '';
  el('transactionRosterStatus').innerHTML = `<option value="">Keep current status</option>${state.statuses.map((status) => `<option value="${status.id}">${escapeHtml(status.name)}</option>`).join('')}`;
  el('transactionFinancialGrid').innerHTML = contractHorizonSeasons().map((season) => `<label><span>${seasonLabel(season.startYear)}</span><input data-transaction-adjustment-season="${season.id}" type="number" min="0" step="1" placeholder="0" /></label>`).join('');
  el('addTradeIncomingPlayerBtn').onclick = addTradeIncomingPlayer;
  el('addTradeIncomingAssetBtn').onclick = addTradeIncomingAsset;
  handleTransactionTypeChange();
  if (options.playerId) {
    el('transactionPlayer').value = options.playerId;
    handleTransactionPlayerChange();
  }
  transactionDialog.showModal();
}

function openEditTransactionDialog(transactionId) {
  const tx = state.transactions.find((item) => item.id === transactionId);
  if (!tx) return;
  const items = transactionItemsFor(transactionId);
  const playerItem = items.find((item) => item.kind === 'PLAYER') || null;
  const incoming = items.filter((item) => item.kind === 'OTHER' && item.direction === 'IN').map((item) => item.label).join('\n');
  const outgoing = items.filter((item) => item.kind === 'OTHER' && item.direction === 'OUT').map((item) => item.label).join('\n');
  const deadCap = transactionDeadCapFor(transactionId);

  openTransactionDialog({
    type: tx.type,
    date: tx.date,
    counterparty: tx.counterparty,
    summary: tx.summary,
    incoming,
    outgoing,
    notes: tx.notes,
    playerId: tx.type === 'Trade' ? null : (playerItem?.playerId || null),
    adjustmentDescription: deadCap?.description || ''
  });

  editingTransactionId = transactionId;
  transactionSummaryTouched = true;
  el('transactionDialogTitle').textContent = 'Edit transaction';
  el('saveTransactionBtn').textContent = 'Save Changes';
  el('transactionType').disabled = true;
  el('transactionPlayer').disabled = true;
  el('transactionRosterAction').disabled = true;
  el('transactionRosterStatus').disabled = true;
  el('transactionSummaryField').classList.remove('hidden');
  el('transactionEditNotice').textContent = playerItem
    ? `Linked player: ${playerItem.label}. Transaction type, linked player and roster movement are locked because they may already have changed roster state. Delete and recreate the transaction if one of those is wrong.`
    : 'Transaction type is locked while editing. Delete and recreate the transaction if the transaction type itself was entered incorrectly.';
  el('transactionEditNotice').classList.remove('hidden');
  if (tx.type === 'Trade') {
    el('transactionTradeStructuredSection').classList.remove('hidden');
    renderStructuredTradeEditSummary(transactionId);
    el('transactionEditNotice').textContent = 'Trade movement is locked because roster and asset ownership already changed. Incoming players that still belong to your team can be opened with Edit Player to update their roster, identity and contract details without rewriting the Trade.';
  }

  if (deadCap) {
    el('transactionFinancialSection').classList.remove('hidden');
    el('transactionManualFinancialFields').classList.remove('hidden');
    deadCap.rows.forEach((row) => {
      const input = document.querySelector(`[data-transaction-adjustment-season="${row.seasonId}"]`);
      if (input) input.value = String(row.amount);
    });
  }

  syncTransactionExecutionDateLockV3118(transactionId);
  syncTradeRetentionControlsV3115({ recalculate:false });
}

async function deleteTransaction(transactionId) {
  const tx = state.transactions.find((item) => item.id === transactionId);
  if (!tx) return;
  const confirmed = confirm(`Delete “${tx.summary}”?\n\nIts Dead Cap will be removed. Structured player and asset movements will also be reversed when no later transaction makes that reversal unsafe.`);
  if (!confirmed) return;
  await runCloudAction(async () => {
    const { error } = await db.rpc('delete_front_office_transaction_v3', {
      p_front_office_id: state.frontOffice.id,
      p_transaction_id: transactionId
    });
    if (error) throw error;
    await loadOffice(state.frontOffice.id, false);
  });
}

async function saveTransactionFromDialog(event) {
  event.preventDefault();
  const button = el('saveTransactionBtn');
  if (button.disabled) return;
  const type = el('transactionType').value;
  const config = transactionTypeConfig(type);
  const playerId = el('transactionPlayer').value || null;
  if (!editingTransactionId && config.player === 'required' && !playerId) { alert('Choose a player for this transaction.'); return; }
  let structuredTrade = null;
  if (!editingTransactionId && type === 'Trade') {
    if (!el('transactionCounterparty').value.trim()) { alert('Enter the other team for this trade.'); return; }
    try { structuredTrade = collectStructuredTradePayload(); } catch (error) { alert(error.message); return; }
    if (!validateTradeRetentionV3115(structuredTrade)) return;
  }
  autoTransactionSummary();
  const summary = el('transactionSummary').value.trim();
  if (!summary) { alert('A transaction summary is required.'); return; }
  const financialVisible = !el('transactionFinancialSection').classList.contains('hidden');
  const rows = financialVisible ? [...document.querySelectorAll('[data-transaction-adjustment-season]')].map((input) => ({ season_id: input.dataset.transactionAdjustmentSeason, amount: nullableNumber(input.value) })).filter((row) => row.amount !== null && row.amount !== 0) : [];
  if (rows.some((row) => row.amount < 0)) { alert('Dead Cap amounts cannot be negative.'); return; }
  button.disabled = true;
  button.textContent = 'Saving…';
  try {
    const incoming = config.flow ? el('transactionIncoming').value.split(/\n+/).map((value) => value.trim()).filter(Boolean) : [];
    const outgoing = config.flow ? el('transactionOutgoing').value.split(/\n+/).map((value) => value.trim()).filter(Boolean) : [];
    const success = await runCloudAction(async () => {
      if (editingTransactionId) {
        const { error } = await db.rpc('update_front_office_transaction_v2', {
          p_front_office_id: state.frontOffice.id,
          p_transaction_id: editingTransactionId,
          p_transaction_date: el('transactionDate').value || todayIsoDate(),
          p_counterparty: config.counterparty ? (el('transactionCounterparty').value.trim() || null) : null,
          p_summary: summary,
          p_notes: el('transactionNotes').value.trim() || null,
          p_in_items: incoming,
          p_out_items: outgoing,
          p_adjustment_description: rows.length ? (el('transactionAdjustmentDescription').value.trim() || `${type} Dead Cap`) : null,
          p_adjustment_rows: rows
        });
        if (error) throw error;
      } else if (type === 'Trade') {
        const { error } = await db.rpc('record_structured_trade_v2', {
          p_front_office_id: state.frontOffice.id,
          p_transaction_date: el('transactionDate').value || todayIsoDate(),
          p_counterparty: el('transactionCounterparty').value.trim(),
          p_summary: summary,
          p_notes: el('transactionNotes').value.trim() || null,
          p_out_player_ids: structuredTrade.outPlayerIds,
          p_out_asset_ids: structuredTrade.outAssetIds,
          p_in_existing_asset_ids: structuredTrade.inExistingAssetIds,
          p_in_players: structuredTrade.inPlayers,
          p_in_assets: structuredTrade.inAssets,
          p_adjustment_description: rows.length ? (el('transactionAdjustmentDescription').value.trim() || 'Retained salary') : null,
          p_adjustment_rows: rows
        });
        if (error) throw error;
      } else {
        const rosterAction = config.action || (config.rosterAction ? el('transactionRosterAction').value : 'NONE');
        const { error } = await db.rpc('record_front_office_transaction_v2', {
          p_front_office_id: state.frontOffice.id,
          p_transaction_type: type,
          p_transaction_date: el('transactionDate').value || todayIsoDate(),
          p_counterparty: config.counterparty ? (el('transactionCounterparty').value.trim() || null) : null,
          p_summary: summary,
          p_notes: el('transactionNotes').value.trim() || null,
          p_in_items: incoming,
          p_out_items: outgoing,
          p_front_office_player_id: playerId,
          p_roster_action: rosterAction,
          p_roster_status_id: !el('transactionRosterStatusField').classList.contains('hidden') ? (el('transactionRosterStatus').value || null) : null,
          p_adjustment_description: rows.length ? (el('transactionAdjustmentDescription').value.trim() || `${type} Dead Cap`) : null,
          p_adjustment_rows: rows
        });
        if (error) throw error;
      }
      await loadOffice(state.frontOffice.id, false);
    });
    if (success) {
      transactionDialog.close();
      resetTransactionEditState();
    }
  } finally {
    button.disabled = false;
    button.textContent = editingTransactionId ? 'Save Changes' : 'Save Transaction';
  }
}


// ============================================================================
// RosterCap V3.13.2 — Trade Block integrated into Transactions
//
// Planning layer only.
// - Does NOT change roster ownership.
// - Does NOT change asset ownership.
// - Does NOT create a second Trade workflow.
// - Uses the existing structured Trade modal for execution.
//
// Persistent statuses:
//   AVAILABLE
//   LISTENING
//   UNTOUCHABLE
//
// Absence of a row = not on Trade Block.
// ============================================================================

const TRADE_BLOCK_STATUSES_V3132 = ['AVAILABLE','LISTENING','UNTOUCHABLE'];

let tradeBlockOfficeIdV3132 = null;
let tradeBlockEntriesV3132 = [];
let tradeBlockLoadedV3132 = false;
let tradeBlockLoadingV3132 = null;
let editingTradeBlockEntryIdV3132 = null;
let tradeBlockInstalledV3132 = false;


function ensureTradeBlockStylesV3132() {
  let link = document.getElementById('tradeBlockStylesV3132');

  if (!link) {
    link = document.createElement('link');
    link.id = 'tradeBlockStylesV3132';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
  }

  link.href = './css/trade-block.css?v=20260827-v3132';
}


function resetTradeBlockCacheV3132() {
  tradeBlockOfficeIdV3132 = null;
  tradeBlockEntriesV3132 = [];
  tradeBlockLoadedV3132 = false;
  tradeBlockLoadingV3132 = null;
  editingTradeBlockEntryIdV3132 = null;
}


function tradeBlockNormalizeStatusV3132(value) {
  const status = String(value || '').trim().toUpperCase();
  return TRADE_BLOCK_STATUSES_V3132.includes(status) ? status : 'AVAILABLE';
}


function tradeBlockNormalizeKindV3132(value) {
  const kind = String(value || '').trim().toUpperCase();
  return kind === 'ASSET' ? 'ASSET' : 'PLAYER';
}


function tradeBlockStatusLabelV3132(status) {
  return ({
    AVAILABLE:'Available',
    LISTENING:'Listening',
    UNTOUCHABLE:'Untouchable'
  })[tradeBlockNormalizeStatusV3132(status)] || 'Available';
}


function tradeBlockStatusHelpV3132(status) {
  return ({
    AVAILABLE:'Actively willing to move.',
    LISTENING:'Open to the right offer.',
    UNTOUCHABLE:'Internal reference — not currently shopping.'
  })[tradeBlockNormalizeStatusV3132(status)] || '';
}


function tradeBlockDevelopmentLabelV3132() {
  return window.RosterCapTerminology?.developmentLabel?.() || 'Minors';
}


function tradeBlockAssetLabelV3132(asset) {
  if (!asset) return 'Asset';

  if (typeof draftHubPickLabelV3060 === 'function' && asset.type === 'DRAFT_PICK') {
    return draftHubPickLabelV3060(asset);
  }

  return asset.label || 'Asset';
}


function tradeBlockPlayerMetaV3132(player) {
  if (!player) return '';

  const season = typeof currentSeason === 'function' ? currentSeason() : null;
  const charge = season && typeof effectivePlayerCharge === 'function'
    ? effectivePlayerCharge(player, season.id)
    : null;
  const endSeason = player.contractEndSeasonId && typeof seasonById === 'function'
    ? seasonById(player.contractEndSeasonId)
    : null;

  return [
    player.position || '—',
    player.realTeam || 'No team',
    player.rosterGroup === 'FARM'
      ? tradeBlockDevelopmentLabelV3132()
      : 'Active',
    charge === null || charge === undefined
      ? null
      : formatMoney(charge),
    endSeason
      ? `Through ${seasonLabel(endSeason.startYear)}`
      : null
  ].filter(Boolean).join(' · ');
}


function tradeBlockAssetMetaV3132(asset) {
  if (!asset) return '';

  const type = typeof assetTypeLabel === 'function'
    ? assetTypeLabel(asset.type)
    : String(asset.type || 'Asset').replace(/_/g, ' ');

  const status = typeof assetStatusLabel === 'function'
    ? assetStatusLabel(asset.status)
    : String(asset.status || '').replace(/_/g, ' ');

  const draft = asset.type === 'DRAFT_PICK'
    ? [
        asset.draftYear || null,
        asset.draftRound ? `Round ${asset.draftRound}` : null,
        asset.originalTeam || null
      ].filter(Boolean).join(' · ')
    : '';

  return [type, status, draft].filter(Boolean).join(' · ');
}


function tradeBlockPlayerEligibleV3132(player) {
  return Boolean(player?.id);
}


function tradeBlockAssetEligibleV3132(asset) {
  return Boolean(
    asset
    && !asset.archivedAt
    && ['OWNED','CONDITIONAL'].includes(asset.status)
  );
}


function tradeBlockTargetV3132(entry) {
  if (!entry) return null;

  if (entry.kind === 'PLAYER') {
    const player = (state.players || [])
      .find((candidate) => candidate.id === entry.playerId) || null;

    return tradeBlockPlayerEligibleV3132(player)
      ? { kind:'PLAYER', item:player }
      : null;
  }

  const asset = (state.assets || [])
    .find((candidate) => candidate.id === entry.assetId) || null;

  return tradeBlockAssetEligibleV3132(asset)
    ? { kind:'ASSET', item:asset }
    : null;
}


function visibleTradeBlockEntriesV3132() {
  const statusOrder = new Map([
    ['AVAILABLE', 0],
    ['LISTENING', 1],
    ['UNTOUCHABLE', 2]
  ]);

  return (tradeBlockEntriesV3132 || [])
    .map((entry) => ({
      entry,
      target:tradeBlockTargetV3132(entry)
    }))
    .filter((row) => row.target)
    .sort((a, b) => {
      const statusDifference =
        (statusOrder.get(a.entry.status) ?? 99)
        - (statusOrder.get(b.entry.status) ?? 99);

      if (statusDifference) return statusDifference;

      if (a.entry.kind !== b.entry.kind) {
        return a.entry.kind === 'PLAYER' ? -1 : 1;
      }

      const aLabel = a.entry.kind === 'PLAYER'
        ? a.target.item.name
        : tradeBlockAssetLabelV3132(a.target.item);
      const bLabel = b.entry.kind === 'PLAYER'
        ? b.target.item.name
        : tradeBlockAssetLabelV3132(b.target.item);

      return String(aLabel || '').localeCompare(String(bLabel || ''));
    });
}


function tradeBlockEntryFromRowV3132(row) {
  return {
    id:row.trade_block_entry_id,
    kind:tradeBlockNormalizeKindV3132(row.item_kind),
    playerId:row.front_office_player_id || null,
    assetId:row.front_office_asset_id || null,
    status:tradeBlockNormalizeStatusV3132(row.trade_status),
    note:row.note || '',
    createdAt:row.created_at || null,
    updatedAt:row.updated_at || null
  };
}


async function preloadTradeBlockForOfficeV3132(frontOfficeId, force = false) {
  const officeId = String(frontOfficeId || '').trim();

  if (!officeId) {
    resetTradeBlockCacheV3132();
    return [];
  }

  if (tradeBlockOfficeIdV3132 !== officeId) {
    tradeBlockOfficeIdV3132 = officeId;
    tradeBlockEntriesV3132 = [];
    tradeBlockLoadedV3132 = false;
    tradeBlockLoadingV3132 = null;
  }

  if (tradeBlockLoadedV3132 && !force) {
    return tradeBlockEntriesV3132;
  }

  if (tradeBlockLoadingV3132 && !force) {
    return tradeBlockLoadingV3132;
  }

  tradeBlockLoadingV3132 = (async () => {
    const { data, error } = await db
      .from('front_office_trade_block_entries')
      .select(
        'trade_block_entry_id,item_kind,front_office_player_id,front_office_asset_id,trade_status,note,created_at,updated_at'
      )
      .eq('front_office_id', officeId)
      .order('updated_at', { ascending:false });

    if (error) throw error;

    tradeBlockEntriesV3132 =
      (data || []).map(tradeBlockEntryFromRowV3132);
    tradeBlockLoadedV3132 = true;

    return tradeBlockEntriesV3132;
  })();

  try {
    return await tradeBlockLoadingV3132;
  } finally {
    tradeBlockLoadingV3132 = null;
  }
}


async function loadTradeBlockV3132(force = false) {
  return preloadTradeBlockForOfficeV3132(
    state.frontOffice?.id || null,
    force
  );
}


function tradeBlockSummaryV3132(entries) {
  return {
    total:entries.length,
    available:entries.filter((row) => row.entry.status === 'AVAILABLE').length,
    listening:entries.filter((row) => row.entry.status === 'LISTENING').length,
    untouchable:entries.filter((row) => row.entry.status === 'UNTOUCHABLE').length
  };
}


function tradeBlockCardMarkupV3132(row) {
  const { entry, target } = row;
  const player = target.kind === 'PLAYER' ? target.item : null;
  const asset = target.kind === 'ASSET' ? target.item : null;

  const label = player
    ? player.name
    : tradeBlockAssetLabelV3132(asset);

  const meta = player
    ? tradeBlockPlayerMetaV3132(player)
    : tradeBlockAssetMetaV3132(asset);

  const kindLabel = player ? 'Player' : 'Asset';
  const canStartTrade = entry.status !== 'UNTOUCHABLE';

  return `
    <article class="trade-block-card-v3132 status-${escapeAttr(entry.status.toLowerCase())}">
      <div class="trade-block-card-head-v3132">
        <span class="trade-block-kind-v3132">${escapeHtml(kindLabel)}</span>
        <span class="trade-block-status-v3132">${escapeHtml(tradeBlockStatusLabelV3132(entry.status))}</span>
      </div>

      <div class="trade-block-card-copy-v3132">
        <strong title="${escapeAttr(label)}">${escapeHtml(label)}</strong>
        <small>${escapeHtml(meta || kindLabel)}</small>
        ${entry.note
          ? `<p>${escapeHtml(entry.note)}</p>`
          : `<p class="trade-block-note-empty-v3132">${escapeHtml(tradeBlockStatusHelpV3132(entry.status))}</p>`
        }
      </div>

      <div class="trade-block-card-actions-v3132">
        ${canStartTrade
          ? `<button
              class="btn btn-primary btn-small"
              data-trade-block-start-v3132="${escapeAttr(entry.id)}"
              type="button"
            >Start Trade</button>`
          : ''
        }
        <button
          class="btn btn-ghost btn-small"
          data-trade-block-edit-v3132="${escapeAttr(entry.id)}"
          type="button"
        >Edit</button>
      </div>
    </article>
  `;
}


function tradeBlockPanelMarkupV3132() {
  const rows = visibleTradeBlockEntriesV3132();
  const summary = tradeBlockSummaryV3132(rows);

  return `
    <section class="trade-block-panel-v3132" id="tradeBlockPanelV3132">
      <div class="trade-block-head-v3132">
        <div>
          <p class="eyebrow">Trade planning</p>
          <h4>Trade Block</h4>
        </div>

        <button
          class="btn btn-secondary btn-small"
          id="manageTradeBlockBtnV3132"
          type="button"
        >+ Add</button>
      </div>

      ${summary.total
        ? `<div class="trade-block-summary-v3132" aria-label="Trade Block summary">
            <span><strong>${summary.available}</strong> Available</span>
            <span><strong>${summary.listening}</strong> Listening</span>
            <span><strong>${summary.untouchable}</strong> Untouchable</span>
          </div>

          <div class="trade-block-grid-v3132">
            ${rows.map(tradeBlockCardMarkupV3132).join('')}
          </div>`
        : `<div class="trade-block-empty-v3132">
            <span>
              <strong>No players or assets listed yet.</strong>
              <small>Add something you would move, listen on, or mark untouchable.</small>
            </span>
            <button
              class="btn btn-primary btn-small"
              id="emptyTradeBlockAddBtnV3132"
              type="button"
            >Add to Trade Block</button>
          </div>`
      }
    </section>
  `;
}


function bindTradeBlockPanelV3132(panel) {
  if (!panel) return;

  panel
    .querySelector('#manageTradeBlockBtnV3132')
    ?.addEventListener('click', () => openTradeBlockDialogV3132());

  panel
    .querySelector('#emptyTradeBlockAddBtnV3132')
    ?.addEventListener('click', () => openTradeBlockDialogV3132());

  panel
    .querySelectorAll('[data-trade-block-edit-v3132]')
    .forEach((button) => {
      button.addEventListener('click', () => {
        const entry = tradeBlockEntriesV3132.find(
          (candidate) => candidate.id === button.dataset.tradeBlockEditV3132
        );
        if (entry) openTradeBlockDialogV3132(entry);
      });
    });

  panel
    .querySelectorAll('[data-trade-block-start-v3132]')
    .forEach((button) => {
      button.addEventListener('click', () => {
        const entry = tradeBlockEntriesV3132.find(
          (candidate) => candidate.id === button.dataset.tradeBlockStartV3132
        );
        if (entry) startTradeFromTradeBlockV3132(entry);
      });
    });
}


function placeTradeBlockPanelV3132() {
  const page = document.querySelector(
    '#transactionsView .transactions-page-v228'
  );
  if (!page) return;

  page.querySelector('#tradeBlockPanelV3132')?.remove();

  const wrapper = document.createElement('div');
  wrapper.innerHTML = tradeBlockPanelMarkupV3132();
  const panel = wrapper.firstElementChild;
  if (!panel) return;

  const filters = page.querySelector(
    '.depth-position-tabs[aria-label="Filter transactions by type"]'
  );

  if (filters) {
    filters.insertAdjacentElement('beforebegin', panel);
  } else {
    const heading = page.querySelector('.tx-page-heading-v228');
    if (heading) heading.insertAdjacentElement('afterend', panel);
    else page.prepend(panel);
  }

  bindTradeBlockPanelV3132(panel);
}
function ensureTradeBlockDialogV3132() {
  let dialog = document.getElementById('tradeBlockDialogV3132');
  if (dialog) return dialog;

  dialog = document.createElement('dialog');
  dialog.id = 'tradeBlockDialogV3132';
  dialog.className = 'drawer-dialog trade-block-dialog-v3132';

  dialog.innerHTML = `
    <form class="drawer-card trade-block-dialog-card-v3132" id="tradeBlockFormV3132">
      <header class="drawer-header">
        <div class="drawer-header-copy">
          <p class="eyebrow">Trade planning</p>
          <h3 id="tradeBlockDialogTitleV3132">Add to Trade Block</h3>
        </div>
        <button
          aria-label="Close"
          class="icon-btn"
          id="closeTradeBlockDialogV3132"
          type="button"
        >×</button>
      </header>

      <div class="modal-body trade-block-dialog-body-v3132">
        <div class="trade-block-form-grid-v3132">
          <label>
            Item type
            <select id="tradeBlockKindV3132">
              <option value="PLAYER">Player</option>
              <option value="ASSET">Asset</option>
            </select>
          </label>

          <label class="full">
            Player / asset
            <select id="tradeBlockTargetV3132"></select>
          </label>

          <label class="full">
            Trade status
            <select id="tradeBlockStatusV3132">
              <option value="AVAILABLE">Available</option>
              <option value="LISTENING">Listening</option>
              <option value="UNTOUCHABLE">Untouchable</option>
            </select>
          </label>

          <label class="full">
            Note
            <textarea
              id="tradeBlockNoteV3132"
              maxlength="240"
              rows="3"
              placeholder="Optional — asking price, preferred return, context, etc."
            ></textarea>
          </label>
        </div>

        <div class="trade-block-dialog-hint-v3132" id="tradeBlockDialogHintV3132"></div>

        <div class="form-actions trade-block-form-actions-v3132">
          <button
            class="btn btn-danger hidden"
            id="removeTradeBlockBtnV3132"
            type="button"
          >Remove</button>

          <span></span>

          <button
            class="btn btn-ghost"
            id="cancelTradeBlockBtnV3132"
            type="button"
          >Cancel</button>

          <button
            class="btn btn-primary"
            id="saveTradeBlockBtnV3132"
            type="submit"
          >Save</button>
        </div>
      </div>
    </form>
  `;

  document.body.appendChild(dialog);

  dialog
    .querySelector('#closeTradeBlockDialogV3132')
    ?.addEventListener('click', () => dialog.close());

  dialog
    .querySelector('#cancelTradeBlockBtnV3132')
    ?.addEventListener('click', () => dialog.close());

  dialog
    .querySelector('#tradeBlockKindV3132')
    ?.addEventListener('change', syncTradeBlockTargetOptionsV3132);

  dialog
    .querySelector('#tradeBlockStatusV3132')
    ?.addEventListener('change', syncTradeBlockDialogHintV3132);

  dialog
    .querySelector('#tradeBlockFormV3132')
    ?.addEventListener('submit', saveTradeBlockFromDialogV3132);

  dialog
    .querySelector('#removeTradeBlockBtnV3132')
    ?.addEventListener('click', removeTradeBlockFromDialogV3132);

  dialog.addEventListener('close', () => {
    editingTradeBlockEntryIdV3132 = null;
  });

  return dialog;
}


function tradeBlockAvailablePlayersV3132() {
  return [...(state.players || [])]
    .filter(tradeBlockPlayerEligibleV3132)
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
}


function tradeBlockAvailableAssetsV3132() {
  return [...(state.assets || [])]
    .filter(tradeBlockAssetEligibleV3132)
    .sort((a, b) => {
      const aYear = Number(a.draftYear || 9999);
      const bYear = Number(b.draftYear || 9999);
      if (aYear !== bYear) return aYear - bYear;

      const aRound = Number(a.draftRound || 999);
      const bRound = Number(b.draftRound || 999);
      if (aRound !== bRound) return aRound - bRound;

      return tradeBlockAssetLabelV3132(a)
        .localeCompare(tradeBlockAssetLabelV3132(b));
    });
}


function syncTradeBlockTargetOptionsV3132(selectedId = null) {
  const dialog = ensureTradeBlockDialogV3132();
  const kind = tradeBlockNormalizeKindV3132(
    dialog.querySelector('#tradeBlockKindV3132')?.value
  );
  const select = dialog.querySelector('#tradeBlockTargetV3132');
  if (!select) return;

  if (kind === 'PLAYER') {
    const players = tradeBlockAvailablePlayersV3132();

    select.innerHTML = players.length
      ? players.map((player) => `
          <option value="${escapeAttr(player.id)}">
            ${escapeHtml(player.name)} · ${escapeHtml(player.position || '—')} · ${escapeHtml(player.realTeam || 'No team')}
          </option>
        `).join('')
      : '<option value="">No current roster players</option>';
  } else {
    const assets = tradeBlockAvailableAssetsV3132();

    select.innerHTML = assets.length
      ? assets.map((asset) => `
          <option value="${escapeAttr(asset.id)}">
            ${escapeHtml(tradeBlockAssetLabelV3132(asset))}
          </option>
        `).join('')
      : '<option value="">No owned assets</option>';
  }

  if (selectedId && [...select.options].some((option) => option.value === selectedId)) {
    select.value = selectedId;
  }

  syncTradeBlockDialogHintV3132();
}


function syncTradeBlockDialogHintV3132() {
  const dialog = ensureTradeBlockDialogV3132();
  const hint = dialog.querySelector('#tradeBlockDialogHintV3132');
  const status = tradeBlockNormalizeStatusV3132(
    dialog.querySelector('#tradeBlockStatusV3132')?.value
  );

  if (hint) hint.textContent = tradeBlockStatusHelpV3132(status);
}


function openTradeBlockDialogV3132(entry = null) {
  const dialog = ensureTradeBlockDialogV3132();
  const title = dialog.querySelector('#tradeBlockDialogTitleV3132');
  const kind = dialog.querySelector('#tradeBlockKindV3132');
  const target = dialog.querySelector('#tradeBlockTargetV3132');
  const status = dialog.querySelector('#tradeBlockStatusV3132');
  const note = dialog.querySelector('#tradeBlockNoteV3132');
  const remove = dialog.querySelector('#removeTradeBlockBtnV3132');

  editingTradeBlockEntryIdV3132 = entry?.id || null;

  if (entry) {
    title.textContent = 'Edit Trade Block';
    kind.value = entry.kind;
    kind.disabled = true;

    syncTradeBlockTargetOptionsV3132(
      entry.kind === 'PLAYER' ? entry.playerId : entry.assetId
    );

    target.disabled = true;
    status.value = tradeBlockNormalizeStatusV3132(entry.status);
    note.value = entry.note || '';
    remove.classList.remove('hidden');
  } else {
    title.textContent = 'Add to Trade Block';
    kind.disabled = false;
    kind.value = 'PLAYER';
    target.disabled = false;
    status.value = 'AVAILABLE';
    note.value = '';
    remove.classList.add('hidden');
    syncTradeBlockTargetOptionsV3132();
  }

  syncTradeBlockDialogHintV3132();

  if (!dialog.open) dialog.showModal();
}


function currentTradeBlockDialogEntryV3132() {
  return tradeBlockEntriesV3132.find(
    (entry) => entry.id === editingTradeBlockEntryIdV3132
  ) || null;
}


async function saveTradeBlockFromDialogV3132(event) {
  event.preventDefault();

  const dialog = ensureTradeBlockDialogV3132();
  const existing = currentTradeBlockDialogEntryV3132();
  const kind = existing?.kind || tradeBlockNormalizeKindV3132(
    dialog.querySelector('#tradeBlockKindV3132')?.value
  );
  const targetId = existing
    ? (existing.kind === 'PLAYER' ? existing.playerId : existing.assetId)
    : dialog.querySelector('#tradeBlockTargetV3132')?.value || null;
  const status = tradeBlockNormalizeStatusV3132(
    dialog.querySelector('#tradeBlockStatusV3132')?.value
  );
  const note = dialog.querySelector('#tradeBlockNoteV3132')?.value.trim() || null;
  const save = dialog.querySelector('#saveTradeBlockBtnV3132');

  if (!targetId) {
    alert(kind === 'PLAYER'
      ? 'Choose a player.'
      : 'Choose an owned asset.');
    return;
  }

  save.disabled = true;
  save.textContent = 'Saving…';

  try {
    const success = await runCloudAction(async () => {
      const { error } = await db.rpc('save_front_office_trade_block_entry_v1', {
        p_front_office_id:state.frontOffice.id,
        p_item_kind:kind,
        p_item_id:targetId,
        p_trade_status:status,
        p_note:note
      });

      if (error) throw error;

      await loadTradeBlockV3132(true);
    });

    if (!success) return;

    editingTradeBlockEntryIdV3132 = null;
    dialog.close();
    placeTradeBlockPanelV3132();
  } finally {
    save.disabled = false;
    save.textContent = 'Save';
  }
}


async function removeTradeBlockFromDialogV3132() {
  const dialog = ensureTradeBlockDialogV3132();
  const entry = currentTradeBlockDialogEntryV3132();
  if (!entry) return;

  const target = tradeBlockTargetV3132(entry);
  const label = target?.kind === 'PLAYER'
    ? target.item.name
    : target?.kind === 'ASSET'
      ? tradeBlockAssetLabelV3132(target.item)
      : 'this item';

  if (!confirm(`Remove ${label} from the Trade Block?`)) return;

  const remove = dialog.querySelector('#removeTradeBlockBtnV3132');
  remove.disabled = true;
  remove.textContent = 'Removing…';

  try {
    const success = await runCloudAction(async () => {
      const { error } = await db.rpc('remove_front_office_trade_block_entry_v1', {
        p_front_office_id:state.frontOffice.id,
        p_item_kind:entry.kind,
        p_item_id:entry.kind === 'PLAYER' ? entry.playerId : entry.assetId
      });

      if (error) throw error;

      await loadTradeBlockV3132(true);
    });

    if (!success) return;

    editingTradeBlockEntryIdV3132 = null;
    dialog.close();
    placeTradeBlockPanelV3132();
  } finally {
    remove.disabled = false;
    remove.textContent = 'Remove';
  }
}


function startTradeFromTradeBlockV3132(entry) {
  const target = tradeBlockTargetV3132(entry);

  if (!target) {
    alert('This Trade Block item is no longer available to trade.');
    return;
  }

  if (entry.status === 'UNTOUCHABLE') {
    alert('This item is marked Untouchable. Change its Trade Block status first.');
    return;
  }

  if (typeof openTransactionDialog !== 'function') {
    alert('The Trade form is not available.');
    return;
  }

  openTransactionDialog({ type:'Trade' });

  queueMicrotask(() => {
    const selector = target.kind === 'PLAYER'
      ? `[data-trade-out-player="${CSS.escape(target.item.id)}"]`
      : `[data-trade-out-asset="${CSS.escape(target.item.id)}"]`;

    const input = transactionDialog?.querySelector(selector)
      || document.querySelector(selector);

    if (!input) {
      alert('RosterCap could not preselect this item in the Trade form.');
      return;
    }

    input.checked = true;
    input.dispatchEvent(new Event('change', { bubbles:true }));
  });
}


function installTradeBlockV3132() {
  if (tradeBlockInstalledV3132) return;
  tradeBlockInstalledV3132 = true;

  // Load styles during normal application script evaluation rather than after
  // DOMContentLoaded. This gives the browser time to fetch them before a Front
  // Office can render.
  ensureTradeBlockStylesV3132();

  // data.js is already loaded before transactions.js, so capture loadOffice now
  // BEFORE app.js calls init().
  //
  // The Trade Block query is intentionally awaited first. That guarantees
  // original loadOffice() cannot reach its final render() until planning data
  // is ready. Result: Transactions renders once with Trade Block already there.
  if (typeof loadOffice === 'function') {
    const originalLoadOfficeV3132 = loadOffice;

    loadOffice = async function(frontOfficeId, showBusy = true) {
      resetTradeBlockCacheV3132();

      if (showBusy && typeof setCloudStatus === 'function') {
        setCloudStatus('Loading…', 'busy');
      }

      try {
        await preloadTradeBlockForOfficeV3132(frontOfficeId);
      } catch (error) {
        // Trade Block is useful planning metadata, but a read failure should
        // never stop the core Front Office from opening.
        console.error('Trade Block preload failed', error);
        tradeBlockOfficeIdV3132 = String(frontOfficeId || '').trim() || null;
        tradeBlockEntriesV3132 = [];
        tradeBlockLoadedV3132 = true;
        tradeBlockLoadingV3132 = null;
      }

      return originalLoadOfficeV3132(frontOfficeId, false);
    };
  }

  // Wrap the base Transactions renderer before app.js installs its later
  // presentation wrappers. The panel is inserted synchronously; app.js can then
  // add Front Office Actions above it in the same call stack.
  if (typeof renderTransactions === 'function') {
    const originalRenderTransactionsV3132 = renderTransactions;

    renderTransactions = function(...args) {
      const result = originalRenderTransactionsV3132(...args);

      if (
        state.frontOffice?.id
        && tradeBlockLoadedV3132
        && tradeBlockOfficeIdV3132 === state.frontOffice.id
      ) {
        placeTradeBlockPanelV3132();
      }

      return result;
    };
  }

  ensureTradeBlockDialogV3132();

  document.documentElement.dataset.rostercapTradeBlock =
    ROSTERCAP_TRADE_BLOCK_VERSION_V3132;
}
installTradeBlockV3132();
