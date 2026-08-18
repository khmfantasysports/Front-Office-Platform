'use strict';

// Hockey depth-chart ordering and rendering.
const DEPTH_POSITIONS = ['LW','C','RW','D','G'];

function playerDepthChartPosition(player) {
  const primary = String(player?.position || '').trim().toUpperCase();
  if (DEPTH_POSITIONS.includes(primary)) return primary;
  const eligible = String(player?.eligiblePositions || '').split(',').map((value) => value.trim().toUpperCase()).filter(Boolean);
  return DEPTH_POSITIONS.find((position) => eligible.includes(position)) || null;
}

function defaultDepthMembers(position) {
  const current = currentSeason();
  return activeRosterPlayers().filter((player) => playerDepthChartPosition(player) === position).sort((a,b) => {
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
  return [...saved, ...members.map((player) => player.id).filter((playerId) => !savedSet.has(playerId))];
}

function resolvedDepthPlayers(position) {
  return resolvedDepthPlayerIds(position).map((playerId) => state.players.find((player) => player.id === playerId)).filter(Boolean);
}

function depthSlot(player, positionLabel, current) {
  if (!player) return `<div class="depth-slot empty"><span class="depth-slot-header"><span class="depth-slot-position">${escapeHtml(positionLabel)}</span></span><span class="depth-slot-name">Open slot</span><span class="depth-slot-meta">Available</span></div>`;
  const status = statusById(player.statusId);
  const charge = effectivePlayerCharge(player, current.id);
  const age = player.ageSnapshot !== null && player.ageSnapshot !== undefined ? `Age ${player.ageSnapshot}` : 'Age —';
  const end = player.contractEndSeasonId ? `Ends ${seasonLabel(seasonById(player.contractEndSeasonId)?.startYear)}` : 'No end set';
  return `<button class="depth-slot" data-depth-open="${player.id}" type="button">
    <span class="depth-slot-header"><span class="depth-slot-position">${escapeHtml(positionLabel)}</span><span class="depth-slot-status">${escapeHtml(status?.name || 'Other')}</span></span>
    <span class="depth-slot-name">${escapeHtml(player.name)}</span>
    <span class="depth-slot-meta">${escapeHtml(player.realTeam || '—')} · ${escapeHtml(age)}</span>
    <span class="depth-slot-finance"><strong>${charge === null ? '—' : formatMoney(charge)}</strong><span>${escapeHtml(end)}</span></span>
  </button>`;
}

function depthPositionRoleLabel(position, index) {
  if (position === 'D') return index < 6 ? `Pair ${Math.floor(index / 2) + 1}` : `Depth ${index + 1}`;
  if (position === 'G') return index === 0 ? 'Starter' : index === 1 ? 'Backup' : `Depth ${index + 1}`;
  return index < 4 ? `Line ${index + 1}` : `Depth ${index + 1}`;
}

function renderAllDepthChart(current) {
  const lw = resolvedDepthPlayers('LW');
  const centers = resolvedDepthPlayers('C');
  const rw = resolvedDepthPlayers('RW');
  const defense = resolvedDepthPlayers('D');
  const goalies = resolvedDepthPlayers('G');

  const forwardLines = Array.from({ length: 4 }, (_, index) => `<div class="depth-forward-line"><div class="depth-line-label"><span>Line</span><strong>${index + 1}</strong></div>${depthSlot(lw[index], 'LW', current)}${depthSlot(centers[index], 'C', current)}${depthSlot(rw[index], 'RW', current)}</div>`).join('');
  const extraForwards = Math.max(lw.length, centers.length, rw.length) > 4 ? `<div class="depth-extra-list">${Array.from({ length: Math.max(lw.length, centers.length, rw.length) - 4 }, (_, offset) => { const index = offset + 4; return `<div class="depth-forward-line"><div class="depth-line-label"><span>Depth</span><strong>${index + 1}</strong></div>${depthSlot(lw[index], 'LW', current)}${depthSlot(centers[index], 'C', current)}${depthSlot(rw[index], 'RW', current)}</div>`; }).join('')}</div>` : '';

  const defenseGoalieRows = Math.max(3, Math.ceil(defense.length / 2), goalies.length);
  const defenseGoalieGrid = Array.from({ length: defenseGoalieRows }, (_, index) => {
    const leftD = defense[index * 2];
    const rightD = defense[index * 2 + 1];
    const goalie = goalies[index];
    const leftLabel = index < 3 ? `D${index * 2 + 1}` : `D · Depth ${index * 2 + 1}`;
    const rightLabel = index < 3 ? `D${index * 2 + 2}` : `D · Depth ${index * 2 + 2}`;
    const goalieLabel = index === 0 ? 'G · Starter' : index === 1 ? 'G · Backup' : `G${index + 1} · Depth`;
    const pairLabel = index < 3 ? `<div class="depth-pair-label depth-pair-label-all"><span>Pair</span><strong>${index + 1}</strong></div>` : `<div class="depth-pair-label depth-pair-label-all"><span>Depth</span><strong>${index + 1}</strong></div>`;
    return `<div class="depth-defense-goalie-row">${pairLabel}${depthSlot(leftD, leftLabel, current)}${depthSlot(rightD, rightLabel, current)}<div class="depth-goalie-card">${depthSlot(goalie, goalieLabel, current)}</div></div>`;
  }).join('');

  return `<div class="depth-lineup-shell depth-lineup-all">
    <section class="depth-section depth-section-card"><div class="depth-section-head"><h4>Forward lines</h4><span>${lw.length + centers.length + rw.length} forwards</span></div><div class="depth-rows-scroll" role="region" aria-label="Forward lines. Swipe horizontally if needed." tabindex="0"><div class="depth-forward-lines">${forwardLines}${extraForwards}</div></div></section>
    <section class="depth-section depth-section-card"><div class="depth-section-head"><h4>Defense + goalies</h4><span>${defense.length} D · ${goalies.length} G</span></div><div class="depth-rows-scroll" role="region" aria-label="Defense pairs and goalie depth. Swipe horizontally if needed." tabindex="0"><div class="depth-defense-goalie-lines">${defenseGoalieGrid}</div></div></section>
  </div>`;
}

function renderSinglePositionDepth(position, current) {
  const orderedIds = depthEditMode && depthPosition === position ? depthDraftOrder : resolvedDepthPlayerIds(position);
  const players = orderedIds.map((playerId) => state.players.find((player) => player.id === playerId)).filter(Boolean);
  if (!players.length) return `<div class="empty-state compact"><h4>No ${escapeHtml(position)} players</h4><p>Players appear here based on their primary roster position.</p></div>`;
  if (depthEditMode && depthPosition === position) {
    const rows = players.map((player, index) => {
      const status = statusById(player.statusId);
      return `<div class="depth-order-row"><span class="depth-order-rank">${index + 1}</span><span class="depth-order-player"><strong>${escapeHtml(player.name)}</strong><span>${escapeHtml(player.realTeam || '—')} · ${escapeHtml(status?.name || 'Other')} · ${escapeHtml(depthPositionRoleLabel(position, index))}</span></span><span class="depth-order-controls"><button class="depth-move-btn" data-depth-move-index="${index}" data-depth-move-direction="-1" type="button" ${index === 0 ? 'disabled' : ''} aria-label="Move ${escapeAttr(player.name)} up">↑</button><button class="depth-move-btn" data-depth-move-index="${index}" data-depth-move-direction="1" type="button" ${index === players.length - 1 ? 'disabled' : ''} aria-label="Move ${escapeAttr(player.name)} down">↓</button></span></div>`;
    }).join('');
    return `<div class="depth-order-list">${rows}</div>`;
  }
  if (position === 'D') {
    return `<div class="depth-compact-grid depth-compact-defense">${players.map((player, index) => {
      const role = index < 6 ? `D${index + 1} · Pair ${Math.floor(index / 2) + 1}` : `D · Depth ${index + 1}`;
      return `<div class="depth-compact-card">${depthSlot(player, role, current)}</div>`;
    }).join('')}</div>`;
  }
  if (position === 'G') {
    return `<div class="depth-compact-grid depth-compact-goalies">${players.map((player, index) => `<div class="depth-compact-card">${depthSlot(player, `G · ${depthPositionRoleLabel(position, index)}`, current)}</div>`).join('')}</div>`;
  }
  return `<div class="depth-compact-grid depth-compact-forwards">${players.map((player, index) => `<div class="depth-compact-card">${depthSlot(player, `${position} · ${depthPositionRoleLabel(position, index)}`, current)}</div>`).join('')}</div>`;
}

function renderDepthChart(current) {
  const tabs = ['ALL', ...DEPTH_POSITIONS].map((position) => `<button class="depth-position-tab ${depthPosition === position ? 'active' : ''}" data-depth-position="${position}" type="button">${position === 'ALL' ? 'All' : position}</button>`).join('');
  const canEdit = depthPosition !== 'ALL' && resolvedDepthPlayerIds(depthPosition).length > 0;
  const title = depthPosition === 'ALL' ? 'Depth chart' : `${depthPosition} depth`;
  const copy = depthPosition === 'ALL' ? 'Your preferred lines, defense pairs and goalie order.' : `Set your preferred ${depthPosition} order. Select Edit order to move players up or down.`;
  const actions = depthPosition === 'ALL' ? '' : depthEditMode ? `<button id="cancelDepthOrderBtn" class="btn btn-ghost btn-small" type="button" ${depthSaving ? 'disabled' : ''}>Cancel</button><button id="saveDepthOrderBtn" class="btn btn-primary btn-small" type="button" ${depthSaving ? 'disabled' : ''}>${depthSaving ? 'Saving…' : 'Save order'}</button>` : `<button id="editDepthOrderBtn" class="btn btn-secondary btn-small" type="button" ${canEdit ? '' : 'disabled'}>Edit order</button>`;
  return `<div class="depth-lineup-shell"><div class="depth-position-tabs" aria-label="Depth chart position">${tabs}</div><div class="depth-chart-toolbar"><div class="depth-chart-toolbar-copy"><h4>${escapeHtml(title)}</h4><p>${escapeHtml(copy)}</p></div><div class="depth-chart-actions">${actions}</div></div>${depthEditMode ? '<p class="depth-edit-note">Ordering is saved to this Front Office and will follow you across devices.</p>' : ''}${depthPosition === 'ALL' ? renderAllDepthChart(current) : renderSinglePositionDepth(depthPosition, current)}</div>`;
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
