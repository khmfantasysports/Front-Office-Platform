'use strict';

// ============================================================================
// RosterCap V3.13.1 — Trade Block on Transactions
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

const ROSTERCAP_TRADE_BLOCK_FEATURE_VERSION_V3131 = '3.13.1';
const TRADE_BLOCK_STATUSES_V3131 = ['AVAILABLE','LISTENING','UNTOUCHABLE'];

let tradeBlockOfficeIdV3131 = null;
let tradeBlockEntriesV3131 = [];
let tradeBlockLoadedV3131 = false;
let tradeBlockLoadingV3131 = null;
let editingTradeBlockEntryIdV3131 = null;
let tradeBlockInstalledV3131 = false;


function ensureTradeBlockStylesV3131() {
  let link = document.getElementById('tradeBlockStylesV3131');

  if (!link) {
    link = document.createElement('link');
    link.id = 'tradeBlockStylesV3131';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
  }

  link.href = './css/trade-block.css?v=20260827-v3131';
}


function resetTradeBlockCacheV3131() {
  tradeBlockOfficeIdV3131 = null;
  tradeBlockEntriesV3131 = [];
  tradeBlockLoadedV3131 = false;
  tradeBlockLoadingV3131 = null;
  editingTradeBlockEntryIdV3131 = null;
}


function tradeBlockNormalizeStatusV3131(value) {
  const status = String(value || '').trim().toUpperCase();
  return TRADE_BLOCK_STATUSES_V3131.includes(status) ? status : 'AVAILABLE';
}


function tradeBlockNormalizeKindV3131(value) {
  const kind = String(value || '').trim().toUpperCase();
  return kind === 'ASSET' ? 'ASSET' : 'PLAYER';
}


function tradeBlockStatusLabelV3131(status) {
  return ({
    AVAILABLE:'Available',
    LISTENING:'Listening',
    UNTOUCHABLE:'Untouchable'
  })[tradeBlockNormalizeStatusV3131(status)] || 'Available';
}


function tradeBlockStatusHelpV3131(status) {
  return ({
    AVAILABLE:'Actively willing to move.',
    LISTENING:'Open to the right offer.',
    UNTOUCHABLE:'Internal reference — not currently shopping.'
  })[tradeBlockNormalizeStatusV3131(status)] || '';
}


function tradeBlockDevelopmentLabelV3131() {
  return window.RosterCapTerminology?.developmentLabel?.() || 'Minors';
}


function tradeBlockAssetLabelV3131(asset) {
  if (!asset) return 'Asset';

  if (typeof draftHubPickLabelV3060 === 'function' && asset.type === 'DRAFT_PICK') {
    return draftHubPickLabelV3060(asset);
  }

  return asset.label || 'Asset';
}


function tradeBlockPlayerMetaV3131(player) {
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
      ? tradeBlockDevelopmentLabelV3131()
      : 'Active',
    charge === null || charge === undefined
      ? null
      : formatMoney(charge),
    endSeason
      ? `Through ${seasonLabel(endSeason.startYear)}`
      : null
  ].filter(Boolean).join(' · ');
}


function tradeBlockAssetMetaV3131(asset) {
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


function tradeBlockPlayerEligibleV3131(player) {
  return Boolean(player?.id);
}


function tradeBlockAssetEligibleV3131(asset) {
  return Boolean(
    asset
    && !asset.archivedAt
    && ['OWNED','CONDITIONAL'].includes(asset.status)
  );
}


function tradeBlockTargetV3131(entry) {
  if (!entry) return null;

  if (entry.kind === 'PLAYER') {
    const player = (state.players || [])
      .find((candidate) => candidate.id === entry.playerId) || null;

    return tradeBlockPlayerEligibleV3131(player)
      ? { kind:'PLAYER', item:player }
      : null;
  }

  const asset = (state.assets || [])
    .find((candidate) => candidate.id === entry.assetId) || null;

  return tradeBlockAssetEligibleV3131(asset)
    ? { kind:'ASSET', item:asset }
    : null;
}


function visibleTradeBlockEntriesV3131() {
  const statusOrder = new Map([
    ['AVAILABLE', 0],
    ['LISTENING', 1],
    ['UNTOUCHABLE', 2]
  ]);

  return (tradeBlockEntriesV3131 || [])
    .map((entry) => ({
      entry,
      target:tradeBlockTargetV3131(entry)
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
        : tradeBlockAssetLabelV3131(a.target.item);
      const bLabel = b.entry.kind === 'PLAYER'
        ? b.target.item.name
        : tradeBlockAssetLabelV3131(b.target.item);

      return String(aLabel || '').localeCompare(String(bLabel || ''));
    });
}


function tradeBlockEntryFromRowV3131(row) {
  return {
    id:row.trade_block_entry_id,
    kind:tradeBlockNormalizeKindV3131(row.item_kind),
    playerId:row.front_office_player_id || null,
    assetId:row.front_office_asset_id || null,
    status:tradeBlockNormalizeStatusV3131(row.trade_status),
    note:row.note || '',
    createdAt:row.created_at || null,
    updatedAt:row.updated_at || null
  };
}


async function loadTradeBlockV3131(force = false) {
  const officeId = state.frontOffice?.id || null;
  if (!officeId) {
    resetTradeBlockCacheV3131();
    return [];
  }

  if (tradeBlockOfficeIdV3131 !== officeId) {
    tradeBlockOfficeIdV3131 = officeId;
    tradeBlockEntriesV3131 = [];
    tradeBlockLoadedV3131 = false;
    tradeBlockLoadingV3131 = null;
  }

  if (tradeBlockLoadedV3131 && !force) {
    return tradeBlockEntriesV3131;
  }

  if (tradeBlockLoadingV3131 && !force) {
    return tradeBlockLoadingV3131;
  }

  tradeBlockLoadingV3131 = (async () => {
    const { data, error } = await db
      .from('front_office_trade_block_entries')
      .select(
        'trade_block_entry_id,item_kind,front_office_player_id,front_office_asset_id,trade_status,note,created_at,updated_at'
      )
      .eq('front_office_id', officeId)
      .order('updated_at', { ascending:false });

    if (error) throw error;

    tradeBlockEntriesV3131 = (data || []).map(tradeBlockEntryFromRowV3131);
    tradeBlockLoadedV3131 = true;
    return tradeBlockEntriesV3131;
  })();

  try {
    return await tradeBlockLoadingV3131;
  } finally {
    tradeBlockLoadingV3131 = null;
  }
}


function tradeBlockSummaryV3131(entries) {
  return {
    total:entries.length,
    available:entries.filter((row) => row.entry.status === 'AVAILABLE').length,
    listening:entries.filter((row) => row.entry.status === 'LISTENING').length,
    untouchable:entries.filter((row) => row.entry.status === 'UNTOUCHABLE').length
  };
}


function tradeBlockCardMarkupV3131(row) {
  const { entry, target } = row;
  const player = target.kind === 'PLAYER' ? target.item : null;
  const asset = target.kind === 'ASSET' ? target.item : null;

  const label = player
    ? player.name
    : tradeBlockAssetLabelV3131(asset);

  const meta = player
    ? tradeBlockPlayerMetaV3131(player)
    : tradeBlockAssetMetaV3131(asset);

  const kindLabel = player ? 'Player' : 'Asset';
  const canStartTrade = entry.status !== 'UNTOUCHABLE';

  return `
    <article class="trade-block-card-v3131 status-${escapeAttr(entry.status.toLowerCase())}">
      <div class="trade-block-card-head-v3131">
        <span class="trade-block-kind-v3131">${escapeHtml(kindLabel)}</span>
        <span class="trade-block-status-v3131">${escapeHtml(tradeBlockStatusLabelV3131(entry.status))}</span>
      </div>

      <div class="trade-block-card-copy-v3131">
        <strong title="${escapeAttr(label)}">${escapeHtml(label)}</strong>
        <small>${escapeHtml(meta || kindLabel)}</small>
        ${entry.note
          ? `<p>${escapeHtml(entry.note)}</p>`
          : `<p class="trade-block-note-empty-v3131">${escapeHtml(tradeBlockStatusHelpV3131(entry.status))}</p>`
        }
      </div>

      <div class="trade-block-card-actions-v3131">
        ${canStartTrade
          ? `<button
              class="btn btn-primary btn-small"
              data-trade-block-start-v3131="${escapeAttr(entry.id)}"
              type="button"
            >Start Trade</button>`
          : ''
        }
        <button
          class="btn btn-ghost btn-small"
          data-trade-block-edit-v3131="${escapeAttr(entry.id)}"
          type="button"
        >Edit</button>
      </div>
    </article>
  `;
}


function tradeBlockPanelMarkupV3131() {
  const rows = visibleTradeBlockEntriesV3131();
  const summary = tradeBlockSummaryV3131(rows);

  return `
    <section class="trade-block-panel-v3131" id="tradeBlockPanelV3131">
      <div class="trade-block-head-v3131">
        <div>
          <p class="eyebrow">Trade planning</p>
          <h4>Trade Block</h4>
          <p>Plan trade availability, then launch the existing structured Trade flow.</p>
        </div>

        <button
          class="btn btn-secondary btn-small"
          id="manageTradeBlockBtnV3131"
          type="button"
        >+ Add</button>
      </div>

      ${summary.total
        ? `<div class="trade-block-summary-v3131" aria-label="Trade Block summary">
            <span><strong>${summary.available}</strong> Available</span>
            <span><strong>${summary.listening}</strong> Listening</span>
            <span><strong>${summary.untouchable}</strong> Untouchable</span>
          </div>

          <div class="trade-block-grid-v3131">
            ${rows.map(tradeBlockCardMarkupV3131).join('')}
          </div>`
        : `<div class="trade-block-empty-v3131">
            <span>
              <strong>No players or assets listed yet.</strong>
              <small>Add something you would move, listen on, or mark untouchable.</small>
            </span>
            <button
              class="btn btn-primary btn-small"
              id="emptyTradeBlockAddBtnV3131"
              type="button"
            >Add to Trade Block</button>
          </div>`
      }
    </section>
  `;
}


function bindTradeBlockPanelV3131(panel) {
  if (!panel) return;

  panel
    .querySelector('#manageTradeBlockBtnV3131')
    ?.addEventListener('click', () => openTradeBlockDialogV3131());

  panel
    .querySelector('#emptyTradeBlockAddBtnV3131')
    ?.addEventListener('click', () => openTradeBlockDialogV3131());

  panel
    .querySelectorAll('[data-trade-block-edit-v3131]')
    .forEach((button) => {
      button.addEventListener('click', () => {
        const entry = tradeBlockEntriesV3131.find(
          (candidate) => candidate.id === button.dataset.tradeBlockEditV3131
        );
        if (entry) openTradeBlockDialogV3131(entry);
      });
    });

  panel
    .querySelectorAll('[data-trade-block-start-v3131]')
    .forEach((button) => {
      button.addEventListener('click', () => {
        const entry = tradeBlockEntriesV3131.find(
          (candidate) => candidate.id === button.dataset.tradeBlockStartV3131
        );
        if (entry) startTradeFromTradeBlockV3131(entry);
      });
    });
}


function placeTradeBlockPanelV3131() {
  const page = document.querySelector(
    '#transactionsView .transactions-page-v228'
  );
  if (!page) return;

  page.querySelector('#tradeBlockPanelV3131')?.remove();

  const wrapper = document.createElement('div');
  wrapper.innerHTML = tradeBlockPanelMarkupV3131();
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

  bindTradeBlockPanelV3131(panel);
}
async function decorateTradeBlockV3131() {
  if (!state.frontOffice || activeView !== 'transactions') return;

  if (
    tradeBlockLoadedV3131
    && tradeBlockOfficeIdV3131 === state.frontOffice.id
  ) {
    placeTradeBlockPanelV3131();
    return;
  }

  // Quiet preload:
  // keep the normal Transactions page fully stable while the planning metadata
  // loads. Insert the finished Trade Block once; never replace the page with a
  // temporary loading state.
  try {
    await loadTradeBlockV3131();
  } catch (error) {
    console.error('Trade Block load failed', error);
    return;
  }

  if (
    state.frontOffice
    && activeView === 'transactions'
    && tradeBlockOfficeIdV3131 === state.frontOffice.id
  ) {
    placeTradeBlockPanelV3131();
  }
}
function ensureTradeBlockDialogV3131() {
  let dialog = document.getElementById('tradeBlockDialogV3131');
  if (dialog) return dialog;

  dialog = document.createElement('dialog');
  dialog.id = 'tradeBlockDialogV3131';
  dialog.className = 'drawer-dialog trade-block-dialog-v3131';

  dialog.innerHTML = `
    <form class="drawer-card trade-block-dialog-card-v3131" id="tradeBlockFormV3131">
      <header class="drawer-header">
        <div class="drawer-header-copy">
          <p class="eyebrow">Trade planning</p>
          <h3 id="tradeBlockDialogTitleV3131">Add to Trade Block</h3>
        </div>
        <button
          aria-label="Close"
          class="icon-btn"
          id="closeTradeBlockDialogV3131"
          type="button"
        >×</button>
      </header>

      <div class="modal-body trade-block-dialog-body-v3131">
        <div class="trade-block-form-grid-v3131">
          <label>
            Item type
            <select id="tradeBlockKindV3131">
              <option value="PLAYER">Player</option>
              <option value="ASSET">Asset</option>
            </select>
          </label>

          <label class="full">
            Player / asset
            <select id="tradeBlockTargetV3131"></select>
          </label>

          <label class="full">
            Trade status
            <select id="tradeBlockStatusV3131">
              <option value="AVAILABLE">Available</option>
              <option value="LISTENING">Listening</option>
              <option value="UNTOUCHABLE">Untouchable</option>
            </select>
          </label>

          <label class="full">
            Note
            <textarea
              id="tradeBlockNoteV3131"
              maxlength="240"
              rows="3"
              placeholder="Optional — asking price, preferred return, context, etc."
            ></textarea>
          </label>
        </div>

        <div class="trade-block-dialog-hint-v3131" id="tradeBlockDialogHintV3131"></div>

        <div class="form-actions trade-block-form-actions-v3131">
          <button
            class="btn btn-danger hidden"
            id="removeTradeBlockBtnV3131"
            type="button"
          >Remove</button>

          <span></span>

          <button
            class="btn btn-ghost"
            id="cancelTradeBlockBtnV3131"
            type="button"
          >Cancel</button>

          <button
            class="btn btn-primary"
            id="saveTradeBlockBtnV3131"
            type="submit"
          >Save</button>
        </div>
      </div>
    </form>
  `;

  document.body.appendChild(dialog);

  dialog
    .querySelector('#closeTradeBlockDialogV3131')
    ?.addEventListener('click', () => dialog.close());

  dialog
    .querySelector('#cancelTradeBlockBtnV3131')
    ?.addEventListener('click', () => dialog.close());

  dialog
    .querySelector('#tradeBlockKindV3131')
    ?.addEventListener('change', syncTradeBlockTargetOptionsV3131);

  dialog
    .querySelector('#tradeBlockStatusV3131')
    ?.addEventListener('change', syncTradeBlockDialogHintV3131);

  dialog
    .querySelector('#tradeBlockFormV3131')
    ?.addEventListener('submit', saveTradeBlockFromDialogV3131);

  dialog
    .querySelector('#removeTradeBlockBtnV3131')
    ?.addEventListener('click', removeTradeBlockFromDialogV3131);

  dialog.addEventListener('close', () => {
    editingTradeBlockEntryIdV3131 = null;
  });

  return dialog;
}


function tradeBlockAvailablePlayersV3131() {
  return [...(state.players || [])]
    .filter(tradeBlockPlayerEligibleV3131)
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
}


function tradeBlockAvailableAssetsV3131() {
  return [...(state.assets || [])]
    .filter(tradeBlockAssetEligibleV3131)
    .sort((a, b) => {
      const aYear = Number(a.draftYear || 9999);
      const bYear = Number(b.draftYear || 9999);
      if (aYear !== bYear) return aYear - bYear;

      const aRound = Number(a.draftRound || 999);
      const bRound = Number(b.draftRound || 999);
      if (aRound !== bRound) return aRound - bRound;

      return tradeBlockAssetLabelV3131(a)
        .localeCompare(tradeBlockAssetLabelV3131(b));
    });
}


function syncTradeBlockTargetOptionsV3131(selectedId = null) {
  const dialog = ensureTradeBlockDialogV3131();
  const kind = tradeBlockNormalizeKindV3131(
    dialog.querySelector('#tradeBlockKindV3131')?.value
  );
  const select = dialog.querySelector('#tradeBlockTargetV3131');
  if (!select) return;

  if (kind === 'PLAYER') {
    const players = tradeBlockAvailablePlayersV3131();

    select.innerHTML = players.length
      ? players.map((player) => `
          <option value="${escapeAttr(player.id)}">
            ${escapeHtml(player.name)} · ${escapeHtml(player.position || '—')} · ${escapeHtml(player.realTeam || 'No team')}
          </option>
        `).join('')
      : '<option value="">No current roster players</option>';
  } else {
    const assets = tradeBlockAvailableAssetsV3131();

    select.innerHTML = assets.length
      ? assets.map((asset) => `
          <option value="${escapeAttr(asset.id)}">
            ${escapeHtml(tradeBlockAssetLabelV3131(asset))}
          </option>
        `).join('')
      : '<option value="">No owned assets</option>';
  }

  if (selectedId && [...select.options].some((option) => option.value === selectedId)) {
    select.value = selectedId;
  }

  syncTradeBlockDialogHintV3131();
}


function syncTradeBlockDialogHintV3131() {
  const dialog = ensureTradeBlockDialogV3131();
  const hint = dialog.querySelector('#tradeBlockDialogHintV3131');
  const status = tradeBlockNormalizeStatusV3131(
    dialog.querySelector('#tradeBlockStatusV3131')?.value
  );

  if (hint) hint.textContent = tradeBlockStatusHelpV3131(status);
}


function openTradeBlockDialogV3131(entry = null) {
  const dialog = ensureTradeBlockDialogV3131();
  const title = dialog.querySelector('#tradeBlockDialogTitleV3131');
  const kind = dialog.querySelector('#tradeBlockKindV3131');
  const target = dialog.querySelector('#tradeBlockTargetV3131');
  const status = dialog.querySelector('#tradeBlockStatusV3131');
  const note = dialog.querySelector('#tradeBlockNoteV3131');
  const remove = dialog.querySelector('#removeTradeBlockBtnV3131');

  editingTradeBlockEntryIdV3131 = entry?.id || null;

  if (entry) {
    title.textContent = 'Edit Trade Block';
    kind.value = entry.kind;
    kind.disabled = true;

    syncTradeBlockTargetOptionsV3131(
      entry.kind === 'PLAYER' ? entry.playerId : entry.assetId
    );

    target.disabled = true;
    status.value = tradeBlockNormalizeStatusV3131(entry.status);
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
    syncTradeBlockTargetOptionsV3131();
  }

  syncTradeBlockDialogHintV3131();

  if (!dialog.open) dialog.showModal();
}


function currentTradeBlockDialogEntryV3131() {
  return tradeBlockEntriesV3131.find(
    (entry) => entry.id === editingTradeBlockEntryIdV3131
  ) || null;
}


async function saveTradeBlockFromDialogV3131(event) {
  event.preventDefault();

  const dialog = ensureTradeBlockDialogV3131();
  const existing = currentTradeBlockDialogEntryV3131();
  const kind = existing?.kind || tradeBlockNormalizeKindV3131(
    dialog.querySelector('#tradeBlockKindV3131')?.value
  );
  const targetId = existing
    ? (existing.kind === 'PLAYER' ? existing.playerId : existing.assetId)
    : dialog.querySelector('#tradeBlockTargetV3131')?.value || null;
  const status = tradeBlockNormalizeStatusV3131(
    dialog.querySelector('#tradeBlockStatusV3131')?.value
  );
  const note = dialog.querySelector('#tradeBlockNoteV3131')?.value.trim() || null;
  const save = dialog.querySelector('#saveTradeBlockBtnV3131');

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

      await loadTradeBlockV3131(true);
    });

    if (!success) return;

    editingTradeBlockEntryIdV3131 = null;
    dialog.close();
    placeTradeBlockPanelV3131();
  } finally {
    save.disabled = false;
    save.textContent = 'Save';
  }
}


async function removeTradeBlockFromDialogV3131() {
  const dialog = ensureTradeBlockDialogV3131();
  const entry = currentTradeBlockDialogEntryV3131();
  if (!entry) return;

  const target = tradeBlockTargetV3131(entry);
  const label = target?.kind === 'PLAYER'
    ? target.item.name
    : target?.kind === 'ASSET'
      ? tradeBlockAssetLabelV3131(target.item)
      : 'this item';

  if (!confirm(`Remove ${label} from the Trade Block?`)) return;

  const remove = dialog.querySelector('#removeTradeBlockBtnV3131');
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

      await loadTradeBlockV3131(true);
    });

    if (!success) return;

    editingTradeBlockEntryIdV3131 = null;
    dialog.close();
    placeTradeBlockPanelV3131();
  } finally {
    remove.disabled = false;
    remove.textContent = 'Remove';
  }
}


function startTradeFromTradeBlockV3131(entry) {
  const target = tradeBlockTargetV3131(entry);

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


function installTradeBlockV3131() {
  if (tradeBlockInstalledV3131) return;
  tradeBlockInstalledV3131 = true;

  ensureTradeBlockStylesV3131();

  // The dynamic feature script loads after DOMContentLoaded, so app.js has
  // already installed its transaction presentation wrappers. Wrap the final
  // renderer and keep the Trade Block attached to Transactions only.
  if (typeof renderTransactions === 'function') {
    const originalRenderTransactionsV3131 = renderTransactions;

    renderTransactions = function() {
      const result = originalRenderTransactionsV3131();
      queueMicrotask(decorateTradeBlockV3131);
      return result;
    };
  }

  // Office data and Trade Block planning data are separate contracts.
  // Preload planning metadata after each office load without forcing another
  // full workspace render.
  if (typeof loadOffice === 'function') {
    const originalLoadOfficeV3131 = loadOffice;

    loadOffice = async function(...args) {
      resetTradeBlockCacheV3131();

      const result = await originalLoadOfficeV3131(...args);

      if (state.frontOffice?.id) {
        loadTradeBlockV3131()
          .then(() => {
            if (activeView === 'transactions') {
              placeTradeBlockPanelV3131();
            }
          })
          .catch((error) => {
            console.error('Trade Block preload failed', error);
          });
      }

      return result;
    };
  }

  ensureTradeBlockDialogV3131();

  document.documentElement.dataset.rostercapTradeBlock =
    ROSTERCAP_TRADE_BLOCK_FEATURE_VERSION_V3131;

  // Handle a resumed office if the feature finished loading after the current
  // office had already been hydrated.
  if (state.frontOffice?.id) {
    loadTradeBlockV3131()
      .then(() => {
        if (activeView === 'transactions') {
          placeTradeBlockPanelV3131();
        }
      })
      .catch((error) => {
        console.error('Trade Block initial preload failed', error);
      });
  }
}
installTradeBlockV3131();
