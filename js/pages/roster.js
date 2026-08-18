'use strict';

// Roster list, cap grid and roster controls.

function activeRosterFilterCount() {
  return [rosterFilters.status, rosterFilters.position, rosterFilters.team, rosterFilters.expiring].filter(Boolean).length
    + (rosterFilters.missingSalary ? 1 : 0) + (rosterFilters.fantrax ? 1 : 0);
}

function filteredRosterPlayers(query = '') {
  const q = String(query || '').trim().toLowerCase();
  const season = currentSeason();
  return activeRosterPlayers().filter((player) => {
    const status = statusById(player.statusId);
    const haystack = `${player.name} ${player.position} ${player.eligiblePositions || ''} ${player.realTeam || ''} ${player.ageSnapshot ?? ''} ${status?.name || ''}`.toLowerCase();
    if (q && !haystack.includes(q)) return false;
    if (rosterFilters.status && player.statusId !== rosterFilters.status) return false;
    if (rosterFilters.position && player.position !== rosterFilters.position) return false;
    if (rosterFilters.team && player.realTeam !== rosterFilters.team) return false;
    if (rosterFilters.expiring === 'current' && player.contractEndSeasonId !== season.id) return false;
    if (rosterFilters.expiring === 'next') {
      const next = contractHorizonSeasons().find((s) => s.startYear === season.startYear + 1);
      if (!next || player.contractEndSeasonId !== next.id) return false;
    }
    if (rosterFilters.missingSalary && effectivePlayerCharge(player, season.id) !== null) return false;
    if (rosterFilters.fantrax && !player.fantraxId) return false;
    return true;
  });
}

function closeRosterMenus() {
  document.querySelectorAll('#rosterView details[open]').forEach((details) => details.removeAttribute('open'));
}

function renderRoster() {
  const seasons = contractHorizonSeasons();
  const current = currentSeason();
  const activePlayers = activeRosterPlayers();
  const positions = [...new Set(activePlayers.map((p) => p.position).filter(Boolean))].sort();
  const teams = [...new Set(activePlayers.map((p) => p.realTeam).filter(Boolean))].sort();
  const query = '';
  const players = filteredRosterPlayers(query);
  const filterCount = activeRosterFilterCount();

  const listRows = activePlayers.map((player) => {
    const status = statusById(player.statusId);
    const charge = effectivePlayerCharge(player, current.id);
    const salary = player.salaries?.[current.id]?.salary ?? null;
    const capOverride = player.salaries?.[current.id]?.capOverride ?? null;
    const end = player.contractEndSeasonId ? seasonLabel(seasonById(player.contractEndSeasonId)?.startYear) : 'No end set';
    const eligibility = player.eligiblePositions || player.position || '—';
    const teamAge = [player.position, player.realTeam || 'No NHL team', player.ageSnapshot !== null && player.ageSnapshot !== undefined ? `Age ${player.ageSnapshot}` : null].filter(Boolean).join(' · ');
    const capLabel = capOverride !== null && capOverride !== undefined && capOverride !== salary ? `Cap ${formatMoney(capOverride)}` : null;
    const futureEntered = seasons.slice(1).filter((season) => player.salaries?.[season.id]?.salary !== null && player.salaries?.[season.id]?.salary !== undefined).length;
    const futureLabel = futureEntered ? `${futureEntered} future ${futureEntered === 1 ? 'year' : 'years'} entered` : 'No future salary entered';
    return `<button class="roster-list-row" data-roster-list-player="${player.id}" data-player-id="${player.id}" type="button">
      <span class="roster-list-main"><span class="roster-list-name"><strong>${escapeHtml(player.name)}</strong>${player.fantraxId ? '<span class="source-badge">FX</span>' : ''}</span><span class="roster-list-meta"><span class="status-dot"></span>${escapeHtml(teamAge)} · ${escapeHtml(status?.name || 'Other')}</span><span class="roster-list-submeta">${escapeHtml(eligibility)} eligible · Ends ${escapeHtml(end)} · ${escapeHtml(futureLabel)}</span></span>
      <span class="roster-list-finance"><strong>${charge === null ? '—' : formatMoney(charge)}</strong><span>${capLabel ? escapeHtml(capLabel) : seasonLabel(current.startYear)}</span></span>
    </button>`;
  }).join('');

  const gridRows = activePlayers.map((player) => {
    const status = statusById(player.statusId);
    const seasonCells = seasons.map((season) => {
      const value = player.salaries?.[season.id]?.salary ?? null;
      return `<td class="money col-salary ${value === null ? 'empty-cell' : ''}">${value === null ? '—' : formatMoney(value)}</td>`;
    }).join('');
    return `<tr data-player-grid-row="${player.id}" data-player-id="${player.id}"><td class="col-player"><button class="player-button" data-edit-player="${player.id}" type="button"><span class="roster-player-name">${escapeHtml(player.name)}</span>${player.fantraxId ? '<span class="source-badge">FX</span>' : ''}</button></td><td class="col-pos">${escapeHtml(player.position)}</td><td class="eligible-cell col-eligible">${escapeHtml(player.eligiblePositions || player.position || '—')}</td><td class="col-team">${escapeHtml(player.realTeam || '—')}</td><td class="age-cell col-age">${player.ageSnapshot ?? '—'}</td><td class="col-status"><span class="status-pill">${escapeHtml(status?.name || 'Other')}</span></td>${seasonCells}<td class="col-end">${player.contractEndSeasonId ? seasonLabel(seasonById(player.contractEndSeasonId)?.startYear) : '—'}</td></tr>`;
  }).join('');
  const totalCells = seasons.map((s) => { const total = activePlayers.reduce((sum, player) => { const charge = effectivePlayerCharge(player, s.id); const status = statusById(player.statusId); return sum + (status?.countsTowardCap && charge !== null ? charge : 0); }, 0); return `<td class="money col-salary">${formatMoney(total)}</td>`; }).join('');

  const depthChartHtml = renderDepthChart(current);

  el('rosterView').innerHTML = `
    <div class="roster-page">
      <div class="page-heading-row">
        <div><p class="eyebrow">Roster</p><h3>${activePlayers.length} / ${state.frontOffice.rosterLimit ?? '—'} active · ${farmSystemPlayers().length} minors</h3></div>
        <div class="view-switch v25 v29" aria-label="Roster view"><button id="rosterDepthModeBtn" class="${rosterMode === 'depth' ? 'active' : ''}" type="button">Depth</button><button id="rosterListModeBtn" class="${rosterMode === 'list' ? 'active' : ''}" type="button">Roster</button><button id="rosterGridModeBtn" class="${rosterMode === 'grid' ? 'active' : ''}" type="button">Cap Grid</button></div>
      </div>
      <div class="roster-commandbar">
        <input id="rosterSearch" class="search-input" placeholder="Search players..." />
        <details class="filter-menu"><summary>Filters ${filterCount ? `<span class="filter-count">${filterCount}</span>` : ''}</summary><div class="filter-popover">
          <label>Status<select id="rosterStatusFilter"><option value="">All</option>${state.statuses.map((s) => `<option value="${s.id}" ${rosterFilters.status === s.id ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('')}</select></label>
          <label>Position<select id="rosterPositionFilter"><option value="">All</option>${positions.map((p) => `<option value="${escapeAttr(p)}" ${rosterFilters.position === p ? 'selected' : ''}>${escapeHtml(p)}</option>`).join('')}</select></label>
          <label>NHL team<select id="rosterTeamFilter"><option value="">All</option>${teams.map((t) => `<option value="${escapeAttr(t)}" ${rosterFilters.team === t ? 'selected' : ''}>${escapeHtml(t)}</option>`).join('')}</select></label>
          <label>Contract<select id="rosterExpiringFilter"><option value="">Any length</option><option value="current" ${rosterFilters.expiring === 'current' ? 'selected' : ''}>Expires this season</option><option value="next" ${rosterFilters.expiring === 'next' ? 'selected' : ''}>Expires next season</option></select></label>
          <label class="filter-check"><input id="rosterMissingFilter" type="checkbox" ${rosterFilters.missingSalary ? 'checked' : ''} /> Missing current salary</label>
          <label class="filter-check"><input id="rosterFantraxFilter" type="checkbox" ${rosterFilters.fantrax ? 'checked' : ''} /> Fantrax linked</label>
          <div class="filter-actions"><button id="clearRosterFiltersBtn" class="btn btn-ghost btn-small" type="button">Clear filters</button></div>
        </div></details>
        <button id="addPlayerBtn" class="btn btn-primary" type="button">+ Add Player</button>
      </div>
      <div class="page-heading-row"><span class="muted" id="rosterResultCount">${players.length} shown</span><details class="tools-menu"><summary>Import / Tools ▾</summary><div class="tools-popover"><button id="importRosterBtn" class="btn btn-secondary" type="button">Import Fantrax / CSV</button><button id="rosterExportBtn" class="btn btn-ghost" type="button">Export CSV</button></div></details></div>

      ${activePlayers.length ? `<div id="rosterListShell" class="roster-list-shell ${rosterMode === 'list' ? '' : 'hidden'}"><div class="roster-list-head"><strong>Current roster</strong><span class="muted">Tap a player to edit</span></div><div id="rosterList" class="roster-list">${listRows}</div><div id="rosterNoMatches" class="roster-list-empty-filter hidden">No players match these filters.</div></div>` : `<div class="empty-state"><h4>No players yet</h4><p>Use Add Player above or import a Fantrax roster from Import / Tools.</p></div>`}

      ${activePlayers.length ? `<div id="depthPanel" class="depth-panel ${rosterMode === 'depth' ? '' : 'hidden'}">${depthChartHtml}</div>` : ''}

      ${activePlayers.length ? `<div id="capGridPanel" class="cap-grid-panel ${rosterMode === 'grid' ? '' : 'hidden'}"><div class="roster-horizon-note"><span><strong>Seven-season contract horizon</strong> · current season + six future years</span><span>${seasonLabel(seasons[0]?.startYear)} → ${seasonLabel(seasons[seasons.length - 1]?.startYear)}</span></div><div class="roster-scroll-hint" aria-hidden="true">Swipe for contract years <span class="scroll-arrow">→</span></div><div class="roster-table-scroll-shell"><div class="table-wrap roster-horizontal-scroll" role="region" aria-label="Cap grid. Swipe horizontally to view all seven contract years." tabindex="0"><table id="rosterTable" class="roster-table-v18 roster-table-compact roster-table-seven"><thead><tr><th class="col-player">Player</th><th class="col-pos">Pos</th><th class="col-eligible">Eligible</th><th class="col-team">NHL</th><th class="col-age">Age</th><th class="col-status">Status</th>${seasons.map((s) => `<th class="col-salary">${seasonLabel(s.startYear)}</th>`).join('')}<th class="col-end">Ends</th></tr></thead><tbody>${gridRows}</tbody><tfoot><tr class="total-row"><td colspan="6">Roster Total</td>${totalCells}<td></td></tr></tfoot></table></div></div><div id="gridNoMatches" class="roster-list-empty-filter hidden">No players match these filters.</div></div>` : ''}
    </div>`;

  const rerenderMode = (mode) => { if (mode !== 'depth') { depthEditMode = false; depthDraftOrder = []; } rosterMode = mode; renderRoster(); };
  el('rosterListModeBtn').addEventListener('click', () => rerenderMode('list'));
  el('rosterDepthModeBtn').addEventListener('click', () => rerenderMode('depth'));
  el('rosterGridModeBtn').addEventListener('click', () => rerenderMode('grid'));
  el('addPlayerBtn').addEventListener('click', () => openPlayerDialog());
  el('importRosterBtn').addEventListener('click', () => { closeRosterMenus(); openImportDialog(); });
  el('rosterExportBtn').addEventListener('click', () => { closeRosterMenus(); exportRosterCsv(); });
  document.querySelectorAll('[data-roster-list-player]').forEach((button) => button.addEventListener('click', () => openPlayerDialog(button.dataset.rosterListPlayer)));
  document.querySelectorAll('[data-edit-player]').forEach((button) => button.addEventListener('click', () => openPlayerDialog(button.dataset.editPlayer)));
  document.querySelectorAll('[data-depth-open]').forEach((button) => button.addEventListener('click', () => openPlayerDialog(button.dataset.depthOpen)));
  document.querySelectorAll('[data-depth-position]').forEach((button) => button.addEventListener('click', () => { depthPosition = button.dataset.depthPosition; depthEditMode = false; depthDraftOrder = []; renderRoster(); }));
  if (el('editDepthOrderBtn')) el('editDepthOrderBtn').addEventListener('click', () => { depthDraftOrder = resolvedDepthPlayerIds(depthPosition); depthEditMode = true; renderRoster(); });
  if (el('cancelDepthOrderBtn')) el('cancelDepthOrderBtn').addEventListener('click', () => { depthEditMode = false; depthDraftOrder = []; renderRoster(); });
  if (el('saveDepthOrderBtn')) el('saveDepthOrderBtn').addEventListener('click', saveDepthOrder);
  document.querySelectorAll('[data-depth-move-index]').forEach((button) => button.addEventListener('click', () => moveDepthDraft(Number(button.dataset.depthMoveIndex), Number(button.dataset.depthMoveDirection))));

  const refreshFilters = () => applyRosterFilters();
  el('rosterSearch').addEventListener('input', refreshFilters);
  el('rosterStatusFilter').addEventListener('change', (e) => { rosterFilters.status = e.target.value; renderRoster(); });
  el('rosterPositionFilter').addEventListener('change', (e) => { rosterFilters.position = e.target.value; renderRoster(); });
  el('rosterTeamFilter').addEventListener('change', (e) => { rosterFilters.team = e.target.value; renderRoster(); });
  el('rosterExpiringFilter').addEventListener('change', (e) => { rosterFilters.expiring = e.target.value; renderRoster(); });
  el('rosterMissingFilter').addEventListener('change', (e) => { rosterFilters.missingSalary = e.target.checked; renderRoster(); });
  el('rosterFantraxFilter').addEventListener('change', (e) => { rosterFilters.fantrax = e.target.checked; renderRoster(); });
  el('clearRosterFiltersBtn').addEventListener('click', () => { rosterFilters = { status:'', position:'', team:'', expiring:'', missingSalary:false, fantrax:false }; renderRoster(); });
  applyRosterFilters();
}

function applyRosterFilters() {
  const search = el('rosterSearch')?.value || '';
  const allowed = new Set(filteredRosterPlayers(search).map((p) => p.id));
  document.querySelectorAll('[data-roster-list-player]').forEach((row) => { row.hidden = !allowed.has(row.dataset.rosterListPlayer); });
  document.querySelectorAll('[data-player-grid-row]').forEach((row) => { row.hidden = !allowed.has(row.dataset.playerGridRow); });
  if (!depthEditMode) {
    document.querySelectorAll('[data-depth-open]').forEach((row) => { row.hidden = !allowed.has(row.dataset.depthOpen); });
  }
  const shown = allowed.size;
  if (el('rosterResultCount')) el('rosterResultCount').textContent = `${shown} shown`;
  if (el('rosterNoMatches')) el('rosterNoMatches').classList.toggle('hidden', shown !== 0);
  if (el('gridNoMatches')) el('gridNoMatches').classList.toggle('hidden', shown !== 0);

}
