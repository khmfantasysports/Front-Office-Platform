'use strict';

// RosterCap V2.81 — sport-aware positional depth-chart ordering and rendering.
//
// NHL keeps the established forward-line / defense-pair / goalie presentation.
// NFL uses positional depth groups with multi-position eligibility.
// FLEX / SUPERFLEX / UTIL remain lineup-slot concepts and are intentionally not
// represented as depth-position assignments in this file.

const LEGACY_NHL_DEPTH_POSITIONS = ['LW','C','RW','D','G'];

function activeDepthSportCode() {
  const value = state?.frontOffice?.sport || 'NHL';
  return window.RosterCapSports?.normalize?.(value) || String(value).toUpperCase() || 'NHL';
}

function activeDepthSportConfig() {
  return window.RosterCapSports?.get?.(activeDepthSportCode()) || null;
}

function activeDepthConfig() {
  return activeDepthSportConfig()?.depth || null;
}

function activeDepthDefinitions() {
  const configured = activeDepthConfig()?.positions;
  if (Array.isArray(configured) && configured.length) return configured;

  return LEGACY_NHL_DEPTH_POSITIONS.map((key) => ({
    key,
    label:key,
    section:key === 'D' ? 'Defense' : key === 'G' ? 'Goalies' : 'Forwards',
    eligible:[key]
  }));
}

function activeDepthPositionKeys() {
  return activeDepthDefinitions().map((item) => item.key);
}

function activeDepthDefinition(position) {
  const key = String(position || '').trim().toUpperCase();
  return activeDepthDefinitions().find((item) => item.key === key) || null;
}

function playerDepthCodes(player) {
  const values = [
    player?.position,
    ...String(player?.eligiblePositions || '')
      .split(',')
      .map((value) => value.trim())
  ];

  return [...new Set(
    values
      .map((value) => String(value || '').trim().toUpperCase())
      .filter(Boolean)
  )];
}

function playerDepthChartPosition(player) {
  // Preserve NHL's established one-position-only behavior exactly: primary
  // position first, then the first matching eligible hockey position.
  if (activeDepthSportCode() === 'NHL') {
    const primary = String(player?.position || '').trim().toUpperCase();
    if (LEGACY_NHL_DEPTH_POSITIONS.includes(primary)) return primary;

    const eligible = String(player?.eligiblePositions || '')
      .split(',')
      .map((value) => value.trim().toUpperCase())
      .filter(Boolean);

    return LEGACY_NHL_DEPTH_POSITIONS.find((position) => eligible.includes(position)) || null;
  }

  const codes = playerDepthCodes(player);
  return activeDepthDefinitions().find((definition) =>
    (definition.eligible || [definition.key]).some((code) => codes.includes(code))
  )?.key || null;
}

function playerQualifiesForDepthPosition(player, position) {
  const key = String(position || '').trim().toUpperCase();

  if (activeDepthSportCode() === 'NHL') {
    return playerDepthChartPosition(player) === key;
  }

  const definition = activeDepthDefinition(key);
  if (!definition) return false;

  const codes = playerDepthCodes(player);
  const eligible = Array.isArray(definition.eligible) && definition.eligible.length
    ? definition.eligible
    : [definition.key];

  return eligible.some((code) => codes.includes(String(code).toUpperCase()));
}

function defaultDepthMembers(position) {
  const current = currentSeason();

  return activeRosterPlayers()
    .filter((player) => playerQualifiesForDepthPosition(player, position))
    .sort((a,b) => {
      const aCharge = effectivePlayerCharge(a, current.id) ?? -1;
      const bCharge = effectivePlayerCharge(b, current.id) ?? -1;
      if (aCharge !== bCharge) return bCharge - aCharge;
      return a.name.localeCompare(b.name);
    });
}

function resolvedDepthPlayerIds(position) {
  const members = defaultDepthMembers(position);
  const memberIds = new Set(members.map((player) => player.id));
  const saved = (state.depthCharts?.[position] || []).filter((playerId) => memberIds.has(playerId));
  const savedSet = new Set(saved);

  return [
    ...saved,
    ...members.map((player) => player.id).filter((playerId) => !savedSet.has(playerId))
  ];
}

function resolvedDepthPlayers(position) {
  return resolvedDepthPlayerIds(position)
    .map((playerId) => state.players.find((player) => player.id === playerId))
    .filter(Boolean);
}

function depthSlot(player, positionLabel, current) {
  if (!player) {
    return `<div class="depth-slot empty"><span class="depth-slot-header"><span class="depth-slot-position">${escapeHtml(positionLabel)}</span></span><span class="depth-slot-name">Open slot</span><span class="depth-slot-meta">Available</span></div>`;
  }

  const status = statusById(player.statusId);
  const charge = effectivePlayerCharge(player, current.id);
  const age = player.ageSnapshot !== null && player.ageSnapshot !== undefined
    ? `Age ${player.ageSnapshot}`
    : 'Age —';
  const end = player.contractEndSeasonId
    ? `Ends ${seasonLabel(seasonById(player.contractEndSeasonId)?.startYear)}`
    : 'No end set';

  return `<button class="depth-slot" data-depth-open="${player.id}" type="button">
    <span class="depth-slot-header"><span class="depth-slot-position">${escapeHtml(positionLabel)}</span><span class="depth-slot-status">${escapeHtml(status?.name || 'Other')}</span></span>
    <span class="depth-slot-name">${escapeHtml(player.name)}</span>
    <span class="depth-slot-meta">${escapeHtml(player.realTeam || '—')} · ${escapeHtml(age)}</span>
    <span class="depth-slot-finance"><strong>${charge === null ? '—' : formatMoney(charge)}</strong><span>${escapeHtml(end)}</span></span>
  </button>`;
}

function depthPositionRoleLabel(position, index) {
  if (activeDepthSportCode() !== 'NHL') return `Depth ${index + 1}`;
  if (position === 'D') return index < 6 ? `Pair ${Math.floor(index / 2) + 1}` : `Depth ${index + 1}`;
  if (position === 'G') return index === 0 ? 'Starter' : index === 1 ? 'Backup' : `Depth ${index + 1}`;
  return index < 4 ? `Line ${index + 1}` : `Depth ${index + 1}`;
}

function renderAllNhlDepthChart(current) {
  const byPosition = Object.fromEntries(
    LEGACY_NHL_DEPTH_POSITIONS.map((position) => [position, resolvedDepthPlayers(position)])
  );

  const maxForwardLines = Math.max(
    4,
    byPosition.LW.length,
    byPosition.C.length,
    byPosition.RW.length
  );

  const forwardRows = Array.from({ length:maxForwardLines }, (_, index) => `
    <div class="depth-line-row">
      ${depthSlot(byPosition.LW[index], `LW · Line ${index + 1}`, current)}
      ${depthSlot(byPosition.C[index], `C · Line ${index + 1}`, current)}
      ${depthSlot(byPosition.RW[index], `RW · Line ${index + 1}`, current)}
    </div>`).join('');

  const defenseCount = Math.max(6, byPosition.D.length);
  const defensePairs = Array.from({ length:Math.ceil(defenseCount / 2) }, (_, pairIndex) => {
    const leftIndex = pairIndex * 2;
    const rightIndex = leftIndex + 1;
    return `<div class="depth-pair-row">
      ${depthSlot(byPosition.D[leftIndex], `D · Pair ${pairIndex + 1}`, current)}
      ${depthSlot(byPosition.D[rightIndex], `D · Pair ${pairIndex + 1}`, current)}
    </div>`;
  }).join('');

  const goalieCount = Math.max(2, byPosition.G.length);
  const goalies = Array.from({ length:goalieCount }, (_, index) =>
    depthSlot(
      byPosition.G[index],
      `G · ${index === 0 ? 'Starter' : index === 1 ? 'Backup' : `Depth ${index + 1}`}`,
      current
    )
  ).join('');

  return `<div class="depth-lineup-all">
    <section class="depth-section depth-section-forwards">
      <div class="depth-section-head"><div><p class="eyebrow">Forwards</p><h4>Lines 1–4</h4></div></div>
      <div class="depth-lines">${forwardRows}</div>
    </section>
    <div class="depth-lower-grid">
      <section class="depth-section depth-section-card">
        <div class="depth-section-head"><div><p class="eyebrow">Defense</p><h4>Pairs</h4></div></div>
        <div class="depth-pairs">${defensePairs}</div>
      </section>
      <section class="depth-section depth-section-card">
        <div class="depth-section-head"><div><p class="eyebrow">Goalies</p><h4>Depth</h4></div></div>
        <div class="depth-goalies">${goalies}</div>
      </section>
    </div>
  </div>`;
}

function nflDepthPlayerRow(player, index, current) {
  const status = statusById(player.statusId);
  const charge = effectivePlayerCharge(player, current.id);
  const eligibility = player.eligiblePositions || player.position || '—';
  const team = player.realTeam || '—';

  return `<button class="depth-player-row" data-depth-open="${player.id}" type="button">
    <span><strong>${escapeHtml(player.name)}</strong><small>${escapeHtml(eligibility)} · ${escapeHtml(team)} · ${escapeHtml(status?.name || 'Other')}</small></span>
    <span><strong>#${index + 1}</strong><small>${charge === null ? '—' : formatMoney(charge)}</small></span>
  </button>`;
}

function renderAllNflDepthChart(current) {
  const definitions = activeDepthDefinitions();
  const sectionOrder = ['Offense', 'Defense', 'Special teams'];

  const sections = sectionOrder.map((section) => {
    const sectionDefinitions = definitions.filter((definition) => definition.section === section);
    if (!sectionDefinitions.length) return '';

    const cards = sectionDefinitions.map((definition) => {
      const players = resolvedDepthPlayers(definition.key);
      const rows = players.length
        ? players.map((player, index) => nflDepthPlayerRow(player, index, current)).join('')
        : '<div class="depth-empty">No qualifying players</div>';

      return `<article class="depth-card">
        <div class="depth-card-head"><span>${escapeHtml(definition.label || definition.key)}</span><strong>${players.length}</strong></div>
        <div class="depth-player-list">${rows}</div>
      </article>`;
    }).join('');

    return `<section class="depth-section depth-section-card">
      <div class="depth-section-head"><div><p class="eyebrow">${escapeHtml(section)}</p><h4>Position depth</h4></div></div>
      <div class="depth-grid">${cards}</div>
    </section>`;
  }).join('');

  return `<div class="depth-lineup-all depth-lineup-nfl">${sections}</div>`;
}

function renderAllDepthChart(current) {
  if (activeDepthSportCode() === 'NFL') return renderAllNflDepthChart(current);
  return renderAllNhlDepthChart(current);
}

function renderSinglePositionDepth(position, current) {
  const players = depthEditMode
    ? depthDraftOrder.map((id) => state.players.find((player) => player.id === id)).filter(Boolean)
    : resolvedDepthPlayers(position);

  if (!players.length) {
    return '<div class="depth-empty">No active-roster players qualify for this position.</div>';
  }

  if (depthEditMode) {
    return `<div class="depth-order-list">${players.map((player, index) => {
      const status = statusById(player.statusId);
      const eligibility = player.eligiblePositions || player.position || '—';
      return `<div class="depth-order-row">
        <span class="depth-order-rank">${index + 1}</span>
        <span class="depth-order-player"><strong>${escapeHtml(player.name)}</strong><small>${escapeHtml(eligibility)} · ${escapeHtml(player.realTeam || '—')} · ${escapeHtml(status?.name || 'Other')}</small></span>
        <span class="depth-order-actions">
          <button class="btn btn-ghost btn-small" data-depth-move-index="${index}" data-depth-move-direction="-1" type="button" ${index === 0 ? 'disabled' : ''}>↑</button>
          <button class="btn btn-ghost btn-small" data-depth-move-index="${index}" data-depth-move-direction="1" type="button" ${index === players.length - 1 ? 'disabled' : ''}>↓</button>
        </span>
      </div>`;
    }).join('')}</div>`;
  }

  if (activeDepthSportCode() !== 'NHL') {
    return `<div class="depth-compact-grid">${players.map((player, index) =>
      `<div class="depth-compact-card">${depthSlot(player, `${position} · Depth ${index + 1}`, current)}</div>`
    ).join('')}</div>`;
  }

  if (position === 'D') {
    return `<div class="depth-compact-grid depth-compact-defense">${players.map((player, index) => {
      const role = index < 6
        ? `D${index + 1} · Pair ${Math.floor(index / 2) + 1}`
        : `D · Depth ${index + 1}`;
      return `<div class="depth-compact-card">${depthSlot(player, role, current)}</div>`;
    }).join('')}</div>`;
  }

  if (position === 'G') {
    return `<div class="depth-compact-grid depth-compact-goalies">${players.map((player, index) =>
      `<div class="depth-compact-card">${depthSlot(player, `G · ${depthPositionRoleLabel(position, index)}`, current)}</div>`
    ).join('')}</div>`;
  }

  return `<div class="depth-compact-grid depth-compact-forwards">${players.map((player, index) =>
    `<div class="depth-compact-card">${depthSlot(player, `${position} · ${depthPositionRoleLabel(position, index)}`, current)}</div>`
  ).join('')}</div>`;
}

function renderDepthChart(current) {
  const positionKeys = activeDepthPositionKeys();

  if (depthPosition !== 'ALL' && !positionKeys.includes(depthPosition)) {
    depthPosition = 'ALL';
    depthEditMode = false;
    depthDraftOrder = [];
  }

  const tabs = ['ALL', ...positionKeys]
    .map((position) => `<button class="depth-position-tab ${depthPosition === position ? 'active' : ''}" data-depth-position="${position}" type="button">${position === 'ALL' ? 'All' : position}</button>`)
    .join('');

  const canEdit = depthPosition !== 'ALL' && resolvedDepthPlayerIds(depthPosition).length > 0;
  const sport = activeDepthSportCode();
  const title = depthPosition === 'ALL'
    ? (sport === 'NFL' ? 'Football depth chart' : 'Depth chart')
    : `${depthPosition} depth`;

  const copy = depthPosition === 'ALL'
    ? sport === 'NFL'
      ? 'All active players are grouped by the football positions they qualify for. Open a position to set its preferred order.'
      : 'Your preferred lines, defense pairs and goalie order.'
    : `Set your preferred ${depthPosition} order. Select Edit order to move players up or down.`;

  const actions = depthPosition === 'ALL'
    ? ''
    : depthEditMode
      ? `<button id="cancelDepthOrderBtn" class="btn btn-ghost btn-small" type="button" ${depthSaving ? 'disabled' : ''}>Cancel</button><button id="saveDepthOrderBtn" class="btn btn-primary btn-small" type="button" ${depthSaving ? 'disabled' : ''}>${depthSaving ? 'Saving…' : 'Save order'}</button>`
      : `<button id="editDepthOrderBtn" class="btn btn-secondary btn-small" type="button" ${canEdit ? '' : 'disabled'}>Edit order</button>`;

  return `<div class="depth-lineup-shell">
    <div class="depth-position-tabs" aria-label="Depth chart position">${tabs}</div>
    <div class="depth-chart-toolbar"><div class="depth-chart-toolbar-copy"><h4>${escapeHtml(title)}</h4><p>${escapeHtml(copy)}</p></div><div class="depth-chart-actions">${actions}</div></div>
    ${depthEditMode ? '<p class="depth-edit-note">Ordering is saved to this Front Office and will follow you across devices.</p>' : ''}
    ${depthPosition === 'ALL' ? renderAllDepthChart(current) : renderSinglePositionDepth(depthPosition, current)}
  </div>`;
}

function moveDepthDraft(index, direction) {
  const target = index + direction;
  if (index < 0 || target < 0 || index >= depthDraftOrder.length || target >= depthDraftOrder.length) return;
  const next = [...depthDraftOrder];
  [next[index], next[target]] = [next[target], next[index]];
  depthDraftOrder = next;
  renderRoster();
}

async function saveDepthOrder() {
  if (depthPosition === 'ALL' || depthSaving) return;
  depthSaving = true;
  renderRoster();

  const orderedIds = [...depthDraftOrder];
  const position = depthPosition;

  const success = await runCloudAction(async () => {
    const { error } = await db.rpc('save_depth_chart_order_v1', {
      p_front_office_id: state.frontOffice.id,
      p_position_code: position,
      p_player_ids: orderedIds
    });

    if (error) throw error;
    state.depthCharts[position] = orderedIds;
    state.activity.unshift(activity(`Updated ${position} depth chart`));
  });

  depthSaving = false;
  if (success) {
    depthEditMode = false;
    depthDraftOrder = [];
  }
  renderRoster();
}
