'use strict';

// Minors/prospect management page.

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

function renderFarm() {
  const prospects = farmSystemPlayers();
  const activeProspects = activeRosterPlayers().filter((player) => player.isProspect);
  const current = currentSeason();
  const rows = prospects.map((player) => {
    const status = statusById(player.statusId);
    const charge = effectivePlayerCharge(player, current.id);
    const end = player.contractEndSeasonId ? seasonLabel(seasonById(player.contractEndSeasonId)?.startYear) : '—';
    return `<article class="farm-player-card"><button class="farm-player-main" data-farm-edit="${player.id}" type="button"><span><strong>${escapeHtml(player.name)}</strong><small>${escapeHtml(player.position)} · ${escapeHtml(player.realTeam || 'No NHL team')} · ${escapeHtml(status?.name || 'Other')}</small></span><span class="farm-player-cap"><strong>${charge === null ? '—' : formatMoney(charge)}</strong><small>Ends ${escapeHtml(end)}</small></span></button><button class="btn btn-primary btn-small" data-call-up="${player.id}" type="button">Call Up</button></article>`;
  }).join('');
  const activeProspectRows = activeProspects.map((player) => `<button class="farm-active-prospect" data-farm-edit="${player.id}" type="button"><strong>${escapeHtml(player.name)}</strong><span>${escapeHtml(player.position)} · Active roster</span></button>`).join('');

  el('farmView').innerHTML = `<div class="farm-page"><div class="page-heading-row"><div><p class="eyebrow">Development</p><h3>Minors</h3><p class="page-copy">Prospects assigned to Minors stay separate from your active lineup. Fantrax rows marked as minors are routed here automatically on import.</p></div><div class="inline-actions"><button id="importMinorsBtn" class="btn btn-secondary" type="button">Import Fantrax</button><button id="addFarmProspectBtn" class="btn btn-primary" type="button">+ Add Player</button></div></div><div class="farm-summary"><span><strong>${prospects.length}</strong> in minors</span><span><strong>${activeProspects.length}</strong> prospects on active roster</span></div>${prospects.length ? `<div class="farm-player-list">${rows}</div>` : `<div class="empty-state"><h4>No players in Minors</h4><p>Use Add Player or Import Fantrax above. Players placed in Minors are automatically labelled Prospect.</p></div>`}${activeProspects.length ? `<div class="subpanel farm-active-section"><p class="eyebrow">Prospects currently called up</p><div class="farm-active-grid">${activeProspectRows}</div></div>` : ''}</div>`;
  el('addFarmProspectBtn').addEventListener('click', openFarmProspectDialog);
  el('importMinorsBtn').addEventListener('click', openImportDialog);
  document.querySelectorAll('[data-farm-edit]').forEach((button) => button.addEventListener('click', () => openPlayerDialog(button.dataset.farmEdit)));
  document.querySelectorAll('[data-call-up]').forEach((button) => button.addEventListener('click', () => quickCallUp(button.dataset.callUp)));
}
