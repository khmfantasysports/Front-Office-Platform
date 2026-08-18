'use strict';

// Transaction ledger, smart penalties and structured trades.

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
}

function tradeSalaryInputs(index) {
  return contractHorizonSeasons().map((season) => `<label class="trade-contract-cell"><span>${seasonLabel(season.startYear)}</span><input data-trade-player-salary="${index}" data-season-id="${season.id}" type="number" min="0" step="1" placeholder="Salary" /></label>`).join('');
}

function addTradeIncomingPlayer() {
  const index = ++tradeBuilderSequence;
  const wrap = document.createElement('div');
  wrap.className = 'trade-builder-card';
  wrap.dataset.tradeIncomingPlayerCard = String(index);
  wrap.innerHTML = `<div class="trade-builder-head"><strong>Incoming Player</strong><button class="btn btn-ghost" data-remove-trade-builder type="button">Remove</button></div><div class="trade-builder-grid">
    <label class="full">Player name<input data-trade-player-name="${index}" autocomplete="off" placeholder="Player name" /></label>
    <label>Position<select data-trade-player-position="${index}"><option>C</option><option>LW</option><option>RW</option><option>F</option><option>D</option><option>G</option></select></label>
    <label>Eligible<input data-trade-player-eligible="${index}" placeholder="C,LW" /></label>
    <label>NHL team<input data-trade-player-team="${index}" maxlength="8" placeholder="EDM" /></label>
    <label>Age<input data-trade-player-age="${index}" type="number" min="0" max="100" step="1" /></label>
    <label>Roster status<select data-trade-player-status="${index}">${state.statuses.map((status) => `<option value="${status.id}">${escapeHtml(status.name)}</option>`).join('')}</select></label>
    <label>Location<select data-trade-player-group="${index}"><option value="ACTIVE">Active roster</option><option value="FARM">Minors</option></select></label>
    <label class="trade-builder-check"><input data-trade-player-prospect="${index}" type="checkbox" /> Prospect</label>
    <label>Contract through<select data-trade-player-end="${index}"><option value="">Not set</option>${contractHorizonSeasons().map((season) => `<option value="${season.id}">${seasonLabel(season.startYear)}</option>`).join('')}</select></label>
    <div class="full"><span class="muted" style="font-size:.61rem">Salary by season</span><div class="trade-contract-grid" style="margin-top:5px">${tradeSalaryInputs(index)}</div></div>
  </div>`;
  wrap.querySelector('[data-remove-trade-builder]').addEventListener('click', () => wrap.remove());
  const group = wrap.querySelector(`[data-trade-player-group="${index}"]`);
  const prospect = wrap.querySelector(`[data-trade-player-prospect="${index}"]`);
  group.addEventListener('change', () => { if (group.value === 'FARM') prospect.checked = true; });
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
  renderStructuredTradeSelectors();
}

function renderStructuredTradeEditSummary(transactionId) {
  const items = transactionItemsFor(transactionId).filter((item) => item.kind !== 'FINANCIAL');
  const outgoing = items.filter((item) => item.direction === 'OUT');
  const incoming = items.filter((item) => item.direction === 'IN');
  el('tradeOutgoingPlayers').innerHTML = outgoing.filter((item) => item.kind === 'PLAYER').map(structuredTradeItemLabel).join('') || '<div class="trade-empty">No outgoing players.</div>';
  el('tradeOutgoingAssets').innerHTML = outgoing.filter((item) => item.kind === 'ASSET').map(structuredTradeItemLabel).join('') || '<div class="trade-empty">No outgoing assets.</div>';
  el('tradeIncomingExistingAssets').innerHTML = incoming.filter((item) => item.kind === 'ASSET').map(structuredTradeItemLabel).join('') || '<div class="trade-empty">No incoming assets.</div>';
  el('tradeIncomingPlayers').innerHTML = incoming.filter((item) => item.kind === 'PLAYER').map(structuredTradeItemLabel).join('');
  el('tradeIncomingAssets').innerHTML = '';
  el('tradeEditLock').classList.remove('hidden');
  el('addTradeIncomingPlayerBtn').classList.add('hidden');
  el('addTradeIncomingAssetBtn').classList.add('hidden');
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

  const tradeCount = sortedTransactions.filter((tx) => tx.type === 'Trade').length;
  const deadCapTransactions = sortedTransactions.filter((tx) => Boolean(transactionDeadCapFor(tx.id)));
  const totalDeadCap = deadCapTransactions.reduce((sum, tx) => sum + Number(transactionDeadCapFor(tx.id)?.total || 0), 0);

  const txRows = sortedTransactions.map((tx) => {
    const allItems = transactionItemsFor(tx.id);
    const incoming = allItems.filter((item) => item.direction === 'IN' && item.kind !== 'FINANCIAL');
    const outgoing = allItems.filter((item) => item.direction === 'OUT' && item.kind !== 'FINANCIAL');
    const playerItems = allItems.filter((item) => item.kind === 'PLAYER' && item.direction === 'NONE');
    const deadCap = transactionDeadCapFor(tx.id);

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
      ? `<div class="tx-ledger-flow-v228 financial"><span class="tx-ledger-direction-v228">DEAD CAP</span><span><em>${escapeHtml(deadCap.description)}</em><strong>${formatMoney(deadCap.total)}</strong></span></div>`
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

  el('transactionsView').innerHTML = `<div class="transactions-page transactions-page-v228">
    <div class="page-heading-row tx-page-heading-v228">
      <div><p class="eyebrow">Ledger</p><h3>Transactions</h3><p class="page-copy">Every roster move, structured trade and Dead Cap event in one chronological ledger.</p></div>
      <button id="recordTransactionBtn" class="btn btn-primary" type="button">+ Record Transaction</button>
    </div>

    <div class="tx-summary-grid-v228">
      <div><span>Transactions</span><strong>${sortedTransactions.length}</strong><small>all recorded moves</small></div>
      <div><span>Trades</span><strong>${tradeCount}</strong><small>structured exchanges</small></div>
      <div><span>Dead Cap Events</span><strong>${deadCapTransactions.length}</strong><small>with cap cost</small></div>
      <div><span>Dead Cap Total</span><strong>${formatMoney(totalDeadCap)}</strong><small>all recorded seasons</small></div>
    </div>

    ${txRows ? `<div class="transaction-list transaction-list-v228">${txRows}</div>` : `<div class="empty-state"><h4>No transactions recorded</h4><p>Record a trade, signing, waiver, buyout, call-up or other move to begin the ledger.</p></div>`}
  </div>`;

  el('recordTransactionBtn').addEventListener('click', () => openTransactionDialog());
  document.querySelectorAll('[data-edit-transaction]').forEach((button) =>
    button.addEventListener('click', () => openEditTransactionDialog(button.dataset.editTransaction))
  );
  document.querySelectorAll('[data-delete-transaction]').forEach((button) =>
    button.addEventListener('click', () => deleteTransaction(button.dataset.deleteTransaction))
  );
}

function transactionTypeConfig(type) {
  const configs = {
    'Trade': { help:'Select the actual players and assets moving in/out. Incoming players and picks become real Front Office records when the trade is saved.', counterparty:true, structuredTrade:true, autoSummary:true, financial:'manual' },
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
  if (!config.financial) {
    section.classList.add('hidden');
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
  } else {
    el('transactionFinancialTitle').textContent = 'Optional Dead Cap';
    el('transactionFinancialCopy').textContent = 'Enter retained salary or another transaction-generated amount that should remain on your cap.';
    if (type === 'Trade' && !el('transactionAdjustmentDescription').value) el('transactionAdjustmentDescription').value = 'Retained salary';
  }
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
}

function resetTransactionEditState() {
  editingTransactionId = null;
  el('transactionType').disabled = false;
  el('transactionPlayer').disabled = false;
  el('transactionRosterAction').disabled = false;
  el('transactionRosterStatus').disabled = false;
  el('transactionEditNotice').classList.add('hidden');
  el('transactionEditNotice').textContent = '';
  el('transactionDialogTitle').textContent = 'Record transaction';
  el('saveTransactionBtn').textContent = 'Save Transaction';
  el('tradeEditLock').classList.add('hidden');
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
    el('transactionEditNotice').textContent = 'Players and assets in this structured trade are locked while editing because ownership/roster state has already changed. Delete and recreate the trade if a structured item is wrong.';
  }

  if (deadCap) {
    el('transactionFinancialSection').classList.remove('hidden');
    el('transactionManualFinancialFields').classList.remove('hidden');
    deadCap.rows.forEach((row) => {
      const input = document.querySelector(`[data-transaction-adjustment-season="${row.seasonId}"]`);
      if (input) input.value = String(row.amount);
    });
  }
}

async function deleteTransaction(transactionId) {
  const tx = state.transactions.find((item) => item.id === transactionId);
  if (!tx) return;
  const confirmed = confirm(`Delete “${tx.summary}”?\n\nIts Dead Cap will be removed. Structured player and asset movements will also be reversed when no later transaction makes that reversal unsafe.`);
  if (!confirmed) return;
  await runCloudAction(async () => {
    const { error } = await db.rpc('delete_front_office_transaction_v2', {
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
  }
  autoTransactionSummary();
  const summary = el('transactionSummary').value.trim();
  if (!summary) { alert('A transaction summary is required.'); return; }
  const financialVisible = !el('transactionFinancialSection').classList.contains('hidden');
  const rows = financialVisible ? [...document.querySelectorAll('[data-transaction-adjustment-season]')].map((input) => ({ season_id: input.dataset.transactionAdjustmentSeason, amount: nullableNumber(input.value) })).filter((row) => row.amount !== null && row.amount !== 0) : [];
  if (rows.some((row) => row.amount < 0)) { alert('Dead Cap amounts cannot be negative.'); return; }
  button.disabled = true;
  button.textContent = editingTransactionId ? 'Saving…' : 'Saving…';
  try {
    const incoming = config.flow ? el('transactionIncoming').value.split(/\n+/).map((value) => value.trim()).filter(Boolean) : [];
    const outgoing = config.flow ? el('transactionOutgoing').value.split(/\n+/).map((value) => value.trim()).filter(Boolean) : [];
    const success = await runCloudAction(async () => {
      if (editingTransactionId) {
        const { error } = await db.rpc('update_front_office_transaction_v1', {
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
        const { error } = await db.rpc('record_structured_trade_v1', {
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
