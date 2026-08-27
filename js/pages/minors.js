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

// V3.12.3 — development depth presentation polish.
const ROSTERCAP_DEVELOPMENT_DEPTH_POLISH_VERSION_V3123 = '3.12.3';
const DEVELOPMENT_DEPTH_MOBILE_QUERY_V3123 = '(max-width:720px)';

let developmentDepthMobilePositionV3123 = null;
let developmentDepthResizeBoundV3123 = false;

function ensureDevelopmentDepthPolishStylesV3123() {
  if (document.getElementById('developmentDepthStylesV3123')) return;

  const link = document.createElement('link');
  link.id = 'developmentDepthStylesV3123';
  link.rel = 'stylesheet';
  link.href = './css/development-depth.css?v=20260827-v3123';
  document.head.appendChild(link);
}

function developmentDepthIsMobileV3123() {
  return window.matchMedia(DEVELOPMENT_DEPTH_MOBILE_QUERY_V3123).matches;
}

function installDevelopmentDepthResizeWatcherV3123() {
  if (developmentDepthResizeBoundV3123) return;
  developmentDepthResizeBoundV3123 = true;

  const media = window.matchMedia(DEVELOPMENT_DEPTH_MOBILE_QUERY_V3123);
  const handle = () => scheduleDevelopmentDepthDecorationV3122();

  if (typeof media.addEventListener === 'function') {
    media.addEventListener('change', handle);
  } else if (typeof media.addListener === 'function') {
    media.addListener(handle);
  }
}

ensureDevelopmentDepthPolishStylesV3123();
installDevelopmentDepthResizeWatcherV3123();

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

  if (!players.length) {
    stack.innerHTML = '<div class="farm-depth-empty-v292">No players</div>';
    return;
  }

  stack.innerHTML = `
    <div class="depth-order-list">
      ${players.map((player, index) => `
        <div class="depth-order-row">
          <span class="depth-order-rank">${index + 1}</span>
          <span class="depth-order-player">
            <strong>${escapeHtml(player.name)}</strong>
            <span>${escapeHtml(developmentDepthPlayerMetaV3122(player))}</span>
          </span>
          <span class="depth-order-controls">
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
          </span>
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

function ensureDevelopmentDepthColumnActionsV3122(column, position) {
  const head = column?.querySelector('.farm-depth-column-head-v292');
  if (!head) return;

  head.querySelector('.development-depth-actions-v3122')?.remove();

  const playerCount = resolvedDevelopmentDepthPlayerIdsV3122(position).length;
  const actions = document.createElement('div');
  actions.className = 'depth-chart-actions development-depth-actions-v3122';

  if (developmentDepthEditPositionV3122 === position) {
    actions.innerHTML = `
      <button
        class="btn btn-ghost btn-small"
        data-cancel-development-depth-v3122="${escapeAttr(position)}"
        type="button"
        ${developmentDepthSavingV3122 ? 'disabled' : ''}
      >Cancel</button>
      <button
        class="btn btn-primary btn-small"
        data-save-development-depth-v3122="${escapeAttr(position)}"
        type="button"
        ${developmentDepthSavingV3122 ? 'disabled' : ''}
      >${developmentDepthSavingV3122 ? 'Saving…' : 'Save'}</button>
    `;
  } else if (playerCount > 1) {
    actions.innerHTML = `
      <button
        class="btn btn-ghost btn-small"
        data-edit-development-depth-v3122="${escapeAttr(position)}"
        type="button"
        title="Edit ${escapeAttr(position)} development depth order"
      >Order</button>
    `;
  }

  if (!actions.children.length) return;
  head.appendChild(actions);

  actions
    .querySelector('[data-edit-development-depth-v3122]')
    ?.addEventListener('click', () => beginDevelopmentDepthEditV3122(position));

  actions
    .querySelector('[data-cancel-development-depth-v3122]')
    ?.addEventListener('click', cancelDevelopmentDepthEditV3122);

  actions
    .querySelector('[data-save-development-depth-v3122]')
    ?.addEventListener('click', saveDevelopmentDepthOrderV3122);
}

function beginDevelopmentDepthEditV3122(position) {
  if (developmentDepthSavingV3122) return;

  const normalized = normalizeDevelopmentDepthPositionV3122(position);
  if (!normalized) return;

  developmentDepthEditPositionV3122 = normalized;
  developmentDepthDraftOrderV3122 =
    resolvedDevelopmentDepthPlayerIdsV3122(normalized);
  developmentDepthMobilePositionV3123 = normalized;

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


function developmentDepthColumnPositionV3123(column) {
  return normalizeDevelopmentDepthPositionV3122(
    column?.dataset?.farmDepthPosition
  );
}

function developmentDepthVisiblePositionsV3123(board) {
  return [...board.querySelectorAll('.farm-depth-column-v292')]
    .map((column) => ({
      column,
      position:developmentDepthColumnPositionV3123(column)
    }))
    .filter((item) => item.position);
}

function resolveDevelopmentDepthMobilePositionV3123(items) {
  const positions = items.map((item) => item.position);

  if (
    developmentDepthEditPositionV3122
    && positions.includes(developmentDepthEditPositionV3122)
  ) {
    developmentDepthMobilePositionV3123 =
      developmentDepthEditPositionV3122;
    return developmentDepthMobilePositionV3123;
  }

  if (
    developmentDepthMobilePositionV3123
    && positions.includes(developmentDepthMobilePositionV3123)
  ) {
    return developmentDepthMobilePositionV3123;
  }

  const firstPopulated = items.find((item) =>
    resolvedDevelopmentDepthPlayerIdsV3122(item.position).length > 0
  );

  developmentDepthMobilePositionV3123 =
    firstPopulated?.position || positions[0] || null;

  return developmentDepthMobilePositionV3123;
}

function applyDevelopmentDepthMobilePositionV3123(board, rail) {
  if (!board) return;

  const items = developmentDepthVisiblePositionsV3123(board);
  const mobile = developmentDepthIsMobileV3123();
  const selected = resolveDevelopmentDepthMobilePositionV3123(items);
  const scroll = board.closest('.farm-depth-scroll-v292');

  board.classList.toggle('development-depth-mobile-board-v3123', mobile);
  scroll?.classList.toggle(
    'development-depth-mobile-scroll-v3123',
    mobile
  );

  items.forEach(({ column, position }) => {
    column.classList.toggle(
      'development-depth-mobile-hidden-v3123',
      mobile && position !== selected
    );
    column.classList.toggle(
      'development-depth-mobile-active-v3123',
      mobile && position === selected
    );
  });

  rail
    ?.querySelectorAll('[data-development-depth-tab-v3123]')
    .forEach((button) => {
      const active =
        button.dataset.developmentDepthTabV3123 === selected;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
}

function ensureDevelopmentDepthMobileTabsV3123(board) {
  const scroll = board?.closest('.farm-depth-scroll-v292');
  if (!scroll) return;

  const items = developmentDepthVisiblePositionsV3123(board);
  if (!items.length) return;

  let rail = scroll.previousElementSibling;

  if (!rail?.classList?.contains('development-depth-tabs-v3123')) {
    rail = document.createElement('div');
    rail.className = 'development-depth-tabs-v3123';
    rail.setAttribute(
      'aria-label',
      'Development depth positions'
    );
    scroll.insertAdjacentElement('beforebegin', rail);
  }

  const selected = resolveDevelopmentDepthMobilePositionV3123(items);

  rail.innerHTML = items.map(({ position }) => {
    const count =
      resolvedDevelopmentDepthPlayerIdsV3122(position).length;
    const active = position === selected;
    const disabled =
      Boolean(developmentDepthEditPositionV3122)
      && developmentDepthEditPositionV3122 !== position;

    return `
      <button
        class="development-depth-tab-v3123 ${active ? 'active' : ''}"
        data-development-depth-tab-v3123="${escapeAttr(position)}"
        type="button"
        aria-pressed="${active ? 'true' : 'false'}"
        ${disabled ? 'disabled' : ''}
      >
        <span>${escapeHtml(position === 'OTHER' ? 'Other' : position)}</span>
        <strong>${count}</strong>
      </button>
    `;
  }).join('');

  rail
    .querySelectorAll('[data-development-depth-tab-v3123]')
    .forEach((button) => {
      button.addEventListener('click', () => {
        if (button.disabled) return;

        developmentDepthMobilePositionV3123 =
          button.dataset.developmentDepthTabV3123 || null;

        applyDevelopmentDepthMobilePositionV3123(board, rail);
      });
    });

  applyDevelopmentDepthMobilePositionV3123(board, rail);
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

      if (developmentDepthEditPositionV3122 === position) {
        renderDevelopmentDepthEditorV3122(column, position);
      } else {
        reorderDevelopmentDepthColumnV3122(column, position);
      }

      ensureDevelopmentDepthColumnActionsV3122(column, position);
    });

  ensureDevelopmentDepthMobileTabsV3123(board);

  document.documentElement.dataset.rostercapDevelopmentDepth =
    ROSTERCAP_DEVELOPMENT_DEPTH_VERSION_V3122;
  document.documentElement.dataset.rostercapDevelopmentDepthPolish =
    ROSTERCAP_DEVELOPMENT_DEPTH_POLISH_VERSION_V3123;
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
