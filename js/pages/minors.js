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
  const totalProspects = prospects.length + activeProspects.length;
  const capCountingMinors = prospects.reduce((sum, player) => {
    const status = statusById(player.statusId);
    const charge = effectivePlayerCharge(player, current.id);
    return sum + (status?.countsTowardCap && charge !== null ? Number(charge) : 0);
  }, 0);

  const rows = prospects.map((player) => {
    const status = statusById(player.statusId);
    const charge = effectivePlayerCharge(player, current.id);
    const end = player.contractEndSeasonId ? seasonLabel(seasonById(player.contractEndSeasonId)?.startYear) : 'No end set';
    return `<article class="farm-player-card farm-player-card-v228">
      <button class="farm-player-main" data-farm-edit="${player.id}" type="button">
        <span class="farm-player-copy-v228">
          <strong>${escapeHtml(player.name)}</strong>
          <small>${escapeHtml(player.position)} · ${escapeHtml(player.realTeam || 'No NHL team')} · ${escapeHtml(status?.name || 'Other')}</small>
          <em>Contract ${escapeHtml(end)}</em>
        </span>
        <span class="farm-player-cap">
          <strong>${charge === null ? '—' : formatMoney(charge)}</strong>
          <small>${status?.countsTowardCap ? 'cap charge' : 'salary reference'}</small>
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
      <div><span>In Minors</span><strong>${prospects.length}</strong><small>assigned prospects</small></div>
      <div><span>Called Up</span><strong>${activeProspects.length}</strong><small>prospects active</small></div>
      <div><span>Total Prospects</span><strong>${totalProspects}</strong><small>tracked players</small></div>
      <div><span>Cap Counting</span><strong>${formatMoney(capCountingMinors)}</strong><small>Minors statuses</small></div>
    </div>

    <section class="farm-panel-v228">
      <div class="farm-section-head-v228"><div><p class="eyebrow">Minors roster</p><h3>Assigned prospects</h3></div><span>${prospects.length} players</span></div>
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
}
