'use strict';

// Minors/prospect management page.
//
// V3.12.2 — persisted development depth order.
// Uses the existing front_office_depth_chart_entries table under DEV:<POSITION>
// storage keys. Active-roster depth continues using its established plain
// position keys, so the two order systems do not overwrite one another.

const ROSTERCAP_DEVELOPMENT_DEPTH_VERSION_V3122 = '3.12.2';
const DEVELOPMENT_DEPTH_PREFIX_V3122 = 'DEV:';

let developmentDepthEditPositionV3122 = null;
let developmentDepthDraftOrderV3122 = [];
let developmentDepthSavingV3122 = false;
let developmentDepthFrameV3122 = 0;

// V3.12.4 — compact across-screen development depth + header editor.
const ROSTERCAP_DEVELOPMENT_DEPTH_UI_VERSION_V3124 = '3.12.4';

function ensureDevelopmentDepthStylesV3124() {
  let link = document.getElementById('developmentDepthStylesV3124');

  if (!link) {
    link = document.createElement('link');
    link.id = 'developmentDepthStylesV3124';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
  }

  link.href = './css/development-depth.css?v=20260827-v3124';
}

ensureDevelopmentDepthStylesV3124();

function openFarmProspectDialog() {
  openPlayerDialog();
  el('playerIsProspect').checked = true;
  el('playerRosterGroup').value = 'FARM';
  syncProspectLocationControls();
  markPlayerDirty();
}

async function quickCallUp(playerId) {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return;
  const success = await runCloudAction(async () => {
    const { error } = await db.rpc('record_front_office_transaction_v2', {
      p_front_office_id: state.frontOffice.id,
      p_transaction_type: 'Call Up',
      p_transaction_date: todayIsoDate(),
      p_counterparty: null,
      p_summary: `${player.name} called up to the active roster`,
      p_notes: null,
      p_in_items: [], p_out_items: [],
      p_front_office_player_id: player.id,
      p_roster_action: 'CALL_UP',
      p_roster_status_id: defaultActiveStatusId(),
      p_adjustment_description: null,
      p_adjustment_rows: []
    });
    if (error) throw error;
    await loadOffice(state.frontOffice.id, false);
  });
  if (success) switchView('roster');
}

function minorContractSignalMarkup(player) {
  const signals = playerContractSignals(player);
  const items = [];

  // V3.01.7:
  // Minors cards already show the saved contract end as a normal metadata line.
  // Keep only immediate expiry/future-gap warnings here; do not duplicate next
  // season expiry with an additional "Expires next" badge.
  if (signals.expiresCurrent) {
    items.push('<span class="contract-signal-badge expiry">Expires this season</span>');
  }

  if (signals.hasFutureGap) {
    items.push(
      `<span class="contract-signal-badge warning">${signals.missingFuture.length} future gap${signals.missingFuture.length === 1 ? '' : 's'}</span>`
    );
  }

  return items.join('');
}


// -----------------------------------------------------------------------------
// V3.12.2 — Development depth ordering
// -----------------------------------------------------------------------------

function normalizeDevelopmentDepthPositionV3122(value) {
  return String(value || '').trim().toUpperCase();
}

function developmentDepthStorageKeyV3122(position) {
  const normalized = normalizeDevelopmentDepthPositionV3122(position);
  return normalized ? `${DEVELOPMENT_DEPTH_PREFIX_V3122}${normalized}` : '';
}

function developmentDepthPositionsV3122() {
  if (typeof farmPositionOrderV292 === 'function') {
    const positions = farmPositionOrderV292();
    if (Array.isArray(positions) && positions.length) {
      return positions.map(normalizeDevelopmentDepthPositionV3122).filter(Boolean);
    }
  }

  const configured = window.RosterCapPositionConfig?.active?.() || [];
  if (configured.length) {
    return configured.map(normalizeDevelopmentDepthPositionV3122).filter(Boolean);
  }

  return [...new Set(
    (state.players || [])
      .filter((player) => player.rosterGroup === 'FARM')
      .map((player) => normalizeDevelopmentDepthPositionV3122(player.position))
      .filter(Boolean)
  )];
}

function developmentDepthPlayerColumnV3122(player) {
  const positions = developmentDepthPositionsV3122();

  if (typeof farmPlayerColumnV292 === 'function') {
    return normalizeDevelopmentDepthPositionV3122(
      farmPlayerColumnV292(player, positions)
    ) || 'OTHER';
  }

  const primary = normalizeDevelopmentDepthPositionV3122(player?.position);
  return positions.includes(primary) ? primary : 'OTHER';
}

function developmentDepthFallbackMembersV3122(position) {
  const normalized = normalizeDevelopmentDepthPositionV3122(position);

  return (state.players || [])
    .filter((player) =>
      player.rosterGroup === 'FARM'
      && developmentDepthPlayerColumnV3122(player) === normalized
    )
    .sort((a, b) => {
      const aCreated = Date.parse(a.createdAt || '') || 0;
      const bCreated = Date.parse(b.createdAt || '') || 0;
      if (aCreated !== bCreated) return aCreated - bCreated;
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
}

function resolvedDevelopmentDepthPlayerIdsV3122(position) {
  const normalized = normalizeDevelopmentDepthPositionV3122(position);
  const members = developmentDepthFallbackMembersV3122(normalized);
  const memberIds = new Set(members.map((player) => player.id));
  const storageKey = developmentDepthStorageKeyV3122(normalized);

  const saved = (state.depthCharts?.[storageKey] || [])
    .filter((playerId) => memberIds.has(playerId));
  const savedSet = new Set(saved);

  return [
    ...saved,
    ...members
      .map((player) => player.id)
      .filter((playerId) => !savedSet.has(playerId))
  ];
}

function developmentDepthPlayerForCardV3122(card) {
  const playerId = card
    ?.querySelector('[data-farm-edit]')
    ?.dataset
    ?.farmEdit;

  if (!playerId) return null;

  return (state.players || []).find((player) => player.id === playerId) || null;
}

function updateDevelopmentDepthCardRanksV3122(stack) {
  if (!stack) return;

  [...stack.querySelectorAll('.farm-player-card-v228')].forEach((card, index) => {
    card.querySelector('.farm-depth-rank-v292')?.remove();

    const rank = document.createElement('span');
    rank.className = 'farm-depth-rank-v292';
    rank.textContent = `Depth ${index + 1}`;
    card.prepend(rank);
  });
}

function reorderDevelopmentDepthColumnV3122(column, position) {
  const stack = column?.querySelector('.farm-depth-stack-v292');
  if (!stack) return;

  const cards = [...stack.querySelectorAll('.farm-player-card-v228')];
  if (!cards.length) return;

  const byPlayerId = new Map();

  cards.forEach((card) => {
    const player = developmentDepthPlayerForCardV3122(card);
    if (player) byPlayerId.set(player.id, card);
  });

  const orderedIds = resolvedDevelopmentDepthPlayerIdsV3122(position);
  const appended = new Set();

  orderedIds.forEach((playerId) => {
    const card = byPlayerId.get(playerId);
    if (!card) return;
    stack.appendChild(card);
    appended.add(playerId);
  });

  // Preserve any unexpected current card instead of silently dropping it.
  cards.forEach((card) => {
    const player = developmentDepthPlayerForCardV3122(card);
    if (!player || appended.has(player.id)) return;
    stack.appendChild(card);
  });

  updateDevelopmentDepthCardRanksV3122(stack);
}

function developmentDepthPlayerMetaV3122(player) {
  if (!player) return '';

  const end = player.contractEndSeasonId
    ? seasonLabel(seasonById(player.contractEndSeasonId)?.startYear)
    : 'No end set';

  return [
    player.eligiblePositions || player.position || '—',
    player.realTeam || '—',
    player.ageSnapshot === null || player.ageSnapshot === undefined
      ? 'Age —'
      : `Age ${player.ageSnapshot}`,
    end
  ].filter(Boolean).join(' · ');
}

function renderDevelopmentDepthEditorV3122(column, position) {
  const stack = column?.querySelector('.farm-depth-stack-v292');
  if (!stack) return;

  const players = developmentDepthDraftOrderV3122
    .map((playerId) =>
      (state.players || []).find((player) => player.id === playerId)
    )
    .filter((player) =>
      player
      && player.rosterGroup === 'FARM'
      && developmentDepthPlayerColumnV3122(player) === position
    );

  column.classList.add('development-depth-edit-column-v3124');

  if (!players.length) {
    stack.innerHTML = '<div class="farm-depth-empty-v292">No players</div>';
    return;
  }

  stack.innerHTML = `
    <div class="development-depth-edit-list-v3124">
      ${players.map((player, index) => `
        <div class="development-depth-edit-card-v3124">
          <span class="development-depth-edit-rank-v3124">Depth ${index + 1}</span>
          <strong title="${escapeAttr(player.name)}">${escapeHtml(player.name)}</strong>
          <small>${escapeHtml([
            player.realTeam || '—',
            player.ageSnapshot === null || player.ageSnapshot === undefined
              ? null
              : player.ageSnapshot
          ].filter((value) => value !== null).join(' · '))}</small>
          <div class="development-depth-edit-controls-v3124">
            <button
              class="depth-move-btn"
              data-development-depth-move-v3122="${index}"
              data-development-depth-direction-v3122="-1"
              type="button"
              aria-label="Move ${escapeAttr(player.name)} up"
              ${index === 0 || developmentDepthSavingV3122 ? 'disabled' : ''}
            >↑</button>
            <button
              class="depth-move-btn"
              data-development-depth-move-v3122="${index}"
              data-development-depth-direction-v3122="1"
              type="button"
              aria-label="Move ${escapeAttr(player.name)} down"
              ${index === players.length - 1 || developmentDepthSavingV3122 ? 'disabled' : ''}
            >↓</button>
          </div>
        </div>
      `).join('')}
    </div>
  `;

  stack.querySelectorAll('[data-development-depth-move-v3122]').forEach((button) => {
    button.addEventListener('click', () => {
      moveDevelopmentDepthDraftV3122(
        Number(button.dataset.developmentDepthMoveV3122),
        Number(button.dataset.developmentDepthDirectionV3122)
      );
    });
  });
}
function ensureDevelopmentDepthColumnActionsV3122(column) {
  // V3.12.4:
  // Ordering controls now live beside "Depth by position" instead of inside
  // every position column. Remove any stale V3.12.2 action wrapper.
  column
    ?.querySelector('.development-depth-actions-v3122')
    ?.remove();
}

function developmentDepthEditablePositionsV3124() {
  return developmentDepthPositionsV3122()
    .map((position) => ({
      position,
      count:resolvedDevelopmentDepthPlayerIdsV3122(position).length
    }))
    .filter((item) => item.count > 1);
}

function ensureDevelopmentDepthHeaderControlsV3124(board) {
  const panel = board?.closest('.farm-depth-panel-v292');
  const head = panel?.querySelector('.farm-section-head-v228');
  const copy = head?.querySelector(':scope > div');
  const title = copy?.querySelector('h3');

  if (!panel || !head || !copy || !title) return;

  copy
    .querySelector('.development-depth-heading-row-v3124')
    ?.remove();

  const row = document.createElement('div');
  row.className = 'development-depth-heading-row-v3124';

  title.insertAdjacentElement('beforebegin', row);
  row.appendChild(title);

  if (developmentDepthEditPositionV3122) {
    const position = developmentDepthEditPositionV3122;

    const stateLabel = document.createElement('span');
    stateLabel.className = 'development-depth-editing-label-v3124';
    stateLabel.textContent = `${position} order`;
    row.appendChild(stateLabel);

    const controls = document.createElement('div');
    controls.className = 'development-depth-header-actions-v3124';
    controls.innerHTML = `
      <button
        class="btn btn-ghost btn-small"
        id="cancelDevelopmentDepthV3124"
        type="button"
        ${developmentDepthSavingV3122 ? 'disabled' : ''}
      >Cancel</button>
      <button
        class="btn btn-primary btn-small"
        id="saveDevelopmentDepthV3124"
        type="button"
        ${developmentDepthSavingV3122 ? 'disabled' : ''}
      >${developmentDepthSavingV3122 ? 'Saving…' : 'Save'}</button>
    `;

    row.appendChild(controls);

    controls
      .querySelector('#cancelDevelopmentDepthV3124')
      ?.addEventListener('click', cancelDevelopmentDepthEditV3122);

    controls
      .querySelector('#saveDevelopmentDepthV3124')
      ?.addEventListener('click', saveDevelopmentDepthOrderV3122);

    return;
  }

  const editable = developmentDepthEditablePositionsV3124();

  if (!editable.length) return;

  const menu = document.createElement('details');
  menu.className = 'development-depth-edit-menu-v3124';

  menu.innerHTML = `
    <summary class="btn btn-secondary btn-small">Edit order</summary>
    <div class="development-depth-edit-popover-v3124">
      <span>Choose position</span>
      <div>
        ${editable.map(({ position, count }) => `
          <button
            type="button"
            data-edit-development-depth-v3124="${escapeAttr(position)}"
          >
            <strong>${escapeHtml(position)}</strong>
            <small>${count}</small>
          </button>
        `).join('')}
      </div>
    </div>
  `;

  row.appendChild(menu);

  menu
    .querySelectorAll('[data-edit-development-depth-v3124]')
    .forEach((button) => {
      button.addEventListener('click', () => {
        menu.open = false;
        beginDevelopmentDepthEditV3122(
          button.dataset.editDevelopmentDepthV3124
        );
      });
    });
}
function beginDevelopmentDepthEditV3122(position) {
  if (developmentDepthSavingV3122) return;

  const normalized = normalizeDevelopmentDepthPositionV3122(position);
  if (!normalized) return;

  developmentDepthEditPositionV3122 = normalized;
  developmentDepthDraftOrderV3122 =
    resolvedDevelopmentDepthPlayerIdsV3122(normalized);

  renderFarm();
}

function cancelDevelopmentDepthEditV3122() {
  if (developmentDepthSavingV3122) return;

  developmentDepthEditPositionV3122 = null;
  developmentDepthDraftOrderV3122 = [];
  renderFarm();
}

function moveDevelopmentDepthDraftV3122(index, direction) {
  if (developmentDepthSavingV3122) return;

  const target = index + direction;

  if (
    index < 0
    || target < 0
    || index >= developmentDepthDraftOrderV3122.length
    || target >= developmentDepthDraftOrderV3122.length
  ) {
    return;
  }

  const next = [...developmentDepthDraftOrderV3122];
  [next[index], next[target]] = [next[target], next[index]];
  developmentDepthDraftOrderV3122 = next;

  renderFarm();
}

async function saveDevelopmentDepthOrderV3122() {
  if (
    !developmentDepthEditPositionV3122
    || developmentDepthSavingV3122
  ) {
    return;
  }

  const position = developmentDepthEditPositionV3122;
  const orderedIds = [...developmentDepthDraftOrderV3122];

  developmentDepthSavingV3122 = true;
  renderFarm();

  const success = await runCloudAction(async () => {
    const { error } = await db.rpc('save_development_depth_order_v1', {
      p_front_office_id: state.frontOffice.id,
      p_position_code: position,
      p_player_ids: orderedIds
    });

    if (error) throw error;

    await loadOffice(state.frontOffice.id, false);
  });

  developmentDepthSavingV3122 = false;

  if (success) {
    developmentDepthEditPositionV3122 = null;
    developmentDepthDraftOrderV3122 = [];
  }

  renderFarm();
}

function decorateDevelopmentDepthOrderV3122() {
  developmentDepthFrameV3122 = 0;

  const board = document.querySelector(
    '#farmView .farm-depth-board-v292'
  );

  if (!board) return;

  board
    .querySelectorAll('.farm-depth-column-v292')
    .forEach((column) => {
      const position = normalizeDevelopmentDepthPositionV3122(
        column.dataset.farmDepthPosition
      );

      if (!position) return;

      column.classList.remove('development-depth-edit-column-v3124');

      if (developmentDepthEditPositionV3122 === position) {
        renderDevelopmentDepthEditorV3122(column, position);
      } else {
        reorderDevelopmentDepthColumnV3122(column, position);
      }

      ensureDevelopmentDepthColumnActionsV3122(column);
    });

  ensureDevelopmentDepthHeaderControlsV3124(board);

  document.documentElement.dataset.rostercapDevelopmentDepth =
    ROSTERCAP_DEVELOPMENT_DEPTH_VERSION_V3122;
  document.documentElement.dataset.rostercapDevelopmentDepthUi =
    ROSTERCAP_DEVELOPMENT_DEPTH_UI_VERSION_V3124;
}

function scheduleDevelopmentDepthDecorationV3122() {
  if (developmentDepthFrameV3122) {
    cancelAnimationFrame(developmentDepthFrameV3122);
  }

  developmentDepthFrameV3122 = requestAnimationFrame(
    decorateDevelopmentDepthOrderV3122
  );
}


// -----------------------------------------------------------------------------
// Existing Minors page
// -----------------------------------------------------------------------------

function renderFarm() {
  const prospects = farmSystemPlayers();
  const activeProspects = activeRosterPlayers().filter((player) => player.isProspect);
  const current = currentSeason();
  const totalProspects = prospects.length + activeProspects.length;
  const minorsLimit = state.frontOffice.minorsLimit;
  const minorsOver = minorsLimit !== null && minorsLimit !== undefined && prospects.length > minorsLimit;
  const minorsOpen = minorsLimit === null || minorsLimit === undefined ? null : minorsLimit - prospects.length;
  const minorsDisplay = minorsLimit === null || minorsLimit === undefined ? String(prospects.length) : `${prospects.length} / ${minorsLimit}`;
  const minorsStatus = minorsLimit === null || minorsLimit === undefined
    ? 'no limit set'
    : minorsOver
      ? `${Math.abs(minorsOpen)} over limit`
      : `${minorsOpen} open`;

  const rows = prospects.map((player) => {
    const status = statusById(player.statusId);
    const charge = effectivePlayerCharge(player, current.id);
    const end = player.contractEndSeasonId ? seasonLabel(seasonById(player.contractEndSeasonId)?.startYear) : 'No end set';
    return `<article class="farm-player-card farm-player-card-v228">
      <button class="farm-player-main" data-farm-edit="${player.id}" type="button">
        <span class="farm-player-copy-v228">
          <span class="farm-player-name-signals"><strong>${escapeHtml(player.name)}</strong>${minorContractSignalMarkup(player)}</span>
          <small>${escapeHtml(player.position)} · ${escapeHtml(player.realTeam || 'No NHL team')} · ${escapeHtml(status?.name || 'Other')}</small>
          <em>Contract ${escapeHtml(end)}</em>
        </span>
        <span class="farm-player-cap">
          <strong>${charge === null ? '—' : formatMoney(charge)}</strong>
          <small>salary reference · cap excluded</small>
        </span>
      </button>
      <button class="btn btn-primary btn-small" data-call-up="${player.id}" type="button">Call Up</button>
    </article>`;
  }).join('');

  const activeProspectRows = activeProspects.map((player) => {
    const charge = effectivePlayerCharge(player, current.id);
    return `<button class="farm-active-prospect farm-active-prospect-v228" data-farm-edit="${player.id}" type="button">
      <span><strong>${escapeHtml(player.name)}</strong><small>${escapeHtml(player.position)} · ${escapeHtml(player.realTeam || 'No NHL team')}</small></span>
      <span><strong>${charge === null ? '—' : formatMoney(charge)}</strong><small>active roster</small></span>
    </button>`;
  }).join('');

  el('farmView').innerHTML = `<div class="farm-page farm-page-v228">
    <div class="page-heading-row farm-page-heading-v228">
      <div><p class="eyebrow">Development</p><h3>Minors</h3><p class="page-copy">Prospect inventory and roster movement between Minors and the active team.</p></div>
      <div class="inline-actions"><button id="importMinorsBtn" class="btn btn-secondary" type="button">Import Fantrax</button><button id="addFarmProspectBtn" class="btn btn-primary" type="button">+ Add Player</button></div>
    </div>
    <div class="farm-summary-grid-v228">
      <div class="${minorsOver ? 'limit-warning' : ''}"><span>In Minors</span><strong>${escapeHtml(minorsDisplay)}</strong><small>${escapeHtml(minorsStatus)}</small></div>
      <div><span>Called Up</span><strong>${activeProspects.length}</strong><small>prospects active</small></div>
      <div><span>Total Prospects</span><strong>${totalProspects}</strong><small>tracked players</small></div>
      <div class="farm-cap-excluded"><span>Cap Impact</span><strong>${formatMoney(0)}</strong><small>Minors excluded from cap</small></div>
    </div>
    ${minorsOver ? `<div class="farm-limit-warning-v229"><span>!</span><div><strong>Minors limit exceeded</strong><small>${prospects.length} players are assigned to Minors against a ${minorsLimit}-player maximum. The app tracks the overage but does not block roster moves.</small></div></div>` : ''}
    <section class="farm-panel-v228">
      <div class="farm-section-head-v228"><div><p class="eyebrow">Minors roster</p><h3>Assigned prospects</h3></div><span>${minorsLimit === null || minorsLimit === undefined ? `${prospects.length} players` : `${prospects.length} / ${minorsLimit} spots`}</span></div>
      ${prospects.length ? `<div class="farm-player-list farm-player-list-v228">${rows}</div>` : `<div class="empty-state"><h4>No players in Minors</h4><p>Use Add Player or Import Fantrax above. Players placed in Minors are automatically labelled Prospect.</p></div>`}
    </section>
    ${activeProspects.length ? `<section class="farm-panel-v228"><div class="farm-section-head-v228"><div><p class="eyebrow">Active roster</p><h3>Prospects currently called up</h3></div><span>${activeProspects.length} active</span></div><div class="farm-active-grid farm-active-grid-v228">${activeProspectRows}</div></section>` : ''}
  </div>`;

  el('addFarmProspectBtn').addEventListener('click', openFarmProspectDialog);
  el('importMinorsBtn').addEventListener('click', openImportDialog);

  document.querySelectorAll('[data-farm-edit]').forEach((button) =>
    button.addEventListener('click', () => openPlayerDialog(button.dataset.farmEdit))
  );

  document.querySelectorAll('[data-call-up]').forEach((button) =>
    button.addEventListener('click', () => quickCallUp(button.dataset.callUp))
  );

  // app.js applies the current compact, position-column Minors presentation
  // synchronously after this base render returns. Running on the next animation
  // frame ensures V3.12.2 decorates that final board rather than the raw list.
  scheduleDevelopmentDepthDecorationV3122();
}
