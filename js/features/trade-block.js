'use strict';

// ============================================================================
// RosterCap V3.13.0 — Trade Block
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

const ROSTERCAP_TRADE_BLOCK_FEATURE_VERSION_V3130 = '3.13.0';
const TRADE_BLOCK_STATUSES_V3130 = ['AVAILABLE','LISTENING','UNTOUCHABLE'];

let tradeBlockOfficeIdV3130 = null;
let tradeBlockEntriesV3130 = [];
let tradeBlockLoadedV3130 = false;
let tradeBlockLoadingV3130 = null;
let editingTradeBlockEntryIdV3130 = null;
let tradeBlockInstalledV3130 = false;


function ensureTradeBlockStylesV3130() {
  let link = document.getElementById('tradeBlockStylesV3130');

  if (!link) {
    link = document.createElement('link');
    link.id = 'tradeBlockStylesV3130';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
  }

  link.href = './css/trade-block.css?v=20260827-v3130';
}


function resetTradeBlockCacheV3130() {
  tradeBlockOfficeIdV3130 = null;
  tradeBlockEntriesV3130 = [];
  tradeBlockLoadedV3130 = false;
  tradeBlockLoadingV3130 = null;
  editingTradeBlockEntryIdV3130 = null;
}


function tradeBlockNormalizeStatusV3130(value) {
  const status = String(value || '').trim().toUpperCase();
  return TRADE_BLOCK_STATUSES_V3130.includes(status) ? status : 'AVAILABLE';
}


function tradeBlockNormalizeKindV3130(value) {
  const kind = String(value || '').trim().toUpperCase();
  return kind === 'ASSET' ? 'ASSET' : 'PLAYER';
}


function tradeBlockStatusLabelV3130(status) {
  return ({
    AVAILABLE:'Available',
    LISTENING:'Listening',
    UNTOUCHABLE:'Untouchable'
  })[tradeBlockNormalizeStatusV3130(status)] || 'Available';
}


function tradeBlockStatusHelpV3130(status) {
  return ({
    AVAILABLE:'Actively willing to move.',
    LISTENING:'Open to the right offer.',
    UNTOUCHABLE:'Internal reference — not currently shopping.'
  })[tradeBlockNormalizeStatusV3130(status)] || '';
}


function tradeBlockDevelopmentLabelV3130() {
  return window.RosterCapTerminology?.developmentLabel?.() || 'Minors';
}


function tradeBlockAssetLabelV3130(asset) {
  if (!asset) return 'Asset';

  if (typeof draftHubPickLabelV3060 === 'function' && asset.type === 'DRAFT_PICK') {
    return draftHubPickLabelV3060(asset);
  }

  return asset.label || 'Asset';
}


function tradeBlockPlayerMetaV3130(player) {
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
      ? tradeBlockDevelopmentLabelV3130()
      : 'Active',
    charge === null || charge === undefined
      ? null
      : formatMoney(charge),
    endSeason
      ? `Through ${seasonLabel(endSeason.startYear)}`
      : null
  ].filter(Boolean).join(' · ');
}


function tradeBlockAssetMetaV3130(asset) {
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


function tradeBlockPlayerEligibleV3130(player) {
  return Boolean(player?.id);
}


function tradeBlockAssetEligibleV3130(asset) {
  return Boolean(
    asset
    && !asset.archivedAt
    && ['OWNED','CONDITIONAL'].includes(asset.status)
  );
}


function tradeBlockTargetV3130(entry) {
  if (!entry) return null;

  if (entry.kind === 'PLAYER') {
    const player = (state.players || [])
      .find((candidate) => candidate.id === entry.playerId) || null;

    return tradeBlockPlayerEligibleV3130(player)
      ? { kind:'PLAYER', item:player }
      : null;
  }

  const asset = (state.assets || [])
    .find((candidate) => candidate.id === entry.assetId) || null;

  return tradeBlockAssetEligibleV3130(asset)
    ? { kind:'ASSET', item:asset }
    : null;
}


function visibleTradeBlockEntriesV3130() {
  const statusOrder = new Map([
    ['AVAILABLE', 0],
    ['LISTENING', 1],
    ['UNTOUCHABLE', 2]
  ]);

  return (tradeBlockEntriesV3130 || [])
    .map((entry) => ({
      entry,
      target:tradeBlockTargetV3130(entry)
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
        : tradeBlockAssetLabelV3130(a.target.item);
      const bLabel = b.entry.kind === 'PLAYER'
        ? b.target.item.name
        : tradeBlockAssetLabelV3130(b.target.item);

      return String(aLabel || '').localeCompare(String(bLabel || ''));
    });
}


function tradeBlockEntryFromRowV3130(row) {
  return {
    id:row.trade_block_entry_id,
    kind:tradeBlockNormalizeKindV3130(row.item_kind),
    playerId:row.front_office_player_id || null,
    assetId:row.front_office_asset_id || null,
    status:tradeBlockNormalizeStatusV3130(row.trade_status),
    note:row.note || '',
    createdAt:row.created_at || null,
    updatedAt:row.updated_at || null
  };
}


async function loadTradeBlockV3130(force = false) {
  const officeId = state.frontOffice?.id || null;
  if (!officeId) {
    resetTradeBlockCacheV3130();
    return [];
  }

  if (tradeBlockOfficeIdV3130 !== officeId) {
    tradeBlockOfficeIdV3130 = officeId;
    tradeBlockEntriesV3130 = [];
    tradeBlockLoadedV3130 = false;
    tradeBlockLoadingV3130 = null;
  }

  if (tradeBlockLoadedV3130 && !force) {
    return tradeBlockEntriesV3130;
  }

  if (tradeBlockLoadingV3130 && !force) {
    return tradeBlockLoadingV3130;
  }

  tradeBlockLoadingV3130 = (async () => {
    const { data, error } = await db
      .from('front_office_trade_block_entries')
      .select(
        'trade_block_entry_id,item_kind,front_office_player_id,front_office_asset_id,trade_status,note,created_at,updated_at'
      )
      .eq('front_office_id', officeId)
      .order('updated_at', { ascending:false });

    if (error) throw error;

    tradeBlockEntriesV3130 = (data || []).map(tradeBlockEntryFromRowV3130);
    tradeBlockLoadedV3130 = true;
    return tradeBlockEntriesV3130;
  })();

  try {
    return await tradeBlockLoadingV3130;
  } finally {
    tradeBlockLoadingV3130 = null;
  }
}


function tradeBlockSummaryV3130(entries) {
  return {
    total:entries.length,
    available:entries.filter((row) => row.entry.status === 'AVAILABLE').length,
    listening:entries.filter((row) => row.entry.status === 'LISTENING').length,
    untouchable:entries.filter((row) => row.entry.status === 'UNTOUCHABLE').length
  };
}


function tradeBlockCardMarkupV3130(row) {
  const { entry, target } = row;
  const player = target.kind === 'PLAYER' ? target.item : null;
  const asset = target.kind === 'ASSET' ? target.item : null;

  const label = player
    ? player.name
    : tradeBlockAssetLabelV3130(asset);

  const meta = player
    ? tradeBlockPlayerMetaV3130(player)
    : tradeBlockAssetMetaV3130(asset);

  const kindLabel = player ? 'Player' : 'Asset';
  const canStartTrade = entry.status !== 'UNTOUCHABLE';

  return `
    <article class="trade-block-card-v3130 status-${escapeAttr(entry.status.toLowerCase())}">
      <div class="trade-block-card-head-v3130">
        <span class="trade-block-kind-v3130">${escapeHtml(kindLabel)}</span>
        <span class="trade-block-status-v3130">${escapeHtml(tradeBlockStatusLabelV3130(entry.status))}</span>
      </div>

      <div class="trade-block-card-copy-v3130">
        <strong title="${escapeAttr(label)}">${escapeHtml(label)}</strong>
        <small>${escapeHtml(meta || kindLabel)}</small>
        ${entry.note
          ? `<p>${escapeHtml(entry.note)}</p>`
          : `<p class="trade-block-note-empty-v3130">${escapeHtml(tradeBlockStatusHelpV3130(entry.status))}</p>`
        }
      </div>

      <div class="trade-block-card-actions-v3130">
        ${canStartTrade
          ? `<button
              class="btn btn-primary btn-small"
              data-trade-block-start-v3130="${escapeAttr(entry.id)}"
              type="button"
            >Start Trade</button>`
          : ''
        }
        <button
          class="btn btn-ghost btn-small"
          data-trade-block-edit-v3130="${escapeAttr(entry.id)}"
          type="button"
        >Edit</button>
      </div>
    </article>
  `;
}


function tradeBlockPanelMarkupV3130() {
  const rows = visibleTradeBlockEntriesV3130();
  const summary = tradeBlockSummaryV3130(rows);

  return `
    <section class="trade-block-panel-v3130" id="tradeBlockPanelV3130">
      <div class="trade-block-head-v3130">
        <div>
          <p class="eyebrow">Trade planning</p>
          <h4>Trade Block</h4>
          <p>Track which players and assets you are willing to discuss.</p>
        </div>

        <button
          class="btn btn-secondary btn-small"
          id="manageTradeBlockBtnV3130"
          type="button"
        >+ Add</button>
      </div>

      ${summary.total
        ? `<div class="trade-block-summary-v3130" aria-label="Trade Block summary">
            <span><strong>${summary.available}</strong> Available</span>
            <span><strong>${summary.listening}</strong> Listening</span>
            <span><strong>${summary.untouchable}</strong> Untouchable</span>
          </div>

          <div class="trade-block-grid-v3130">
            ${rows.map(tradeBlockCardMarkupV3130).join('')}
          </div>`
        : `<div class="trade-block-empty-v3130">
            <span>
              <strong>No players or assets listed yet.</strong>
              <small>Add something you would move, listen on, or mark untouchable.</small>
            </span>
            <button
              class="btn btn-primary btn-small"
              id="emptyTradeBlockAddBtnV3130"
              type="button"
            >Add to Trade Block</button>
          </div>`
      }
    </section>
  `;
}


function bindTradeBlockPanelV3130(panel) {
  if (!panel) return;

  panel
    .querySelector('#manageTradeBlockBtnV3130')
    ?.addEventListener('click', () => openTradeBlockDialogV3130());

  panel
    .querySelector('#emptyTradeBlockAddBtnV3130')
    ?.addEventListener('click', () => openTradeBlockDialogV3130());

  panel
    .querySelectorAll('[data-trade-block-edit-v3130]')
    .forEach((button) => {
      button.addEventListener('click', () => {
        const entry = tradeBlockEntriesV3130.find(
          (candidate) => candidate.id === button.dataset.tradeBlockEditV3130
        );
        if (entry) openTradeBlockDialogV3130(entry);
      });
    });

  panel
    .querySelectorAll('[data-trade-block-start-v3130]')
    .forEach((button) => {
      button.addEventListener('click', () => {
        const entry = tradeBlockEntriesV3130.find(
          (candidate) => candidate.id === button.dataset.tradeBlockStartV3130
        );
        if (entry) startTradeFromTradeBlockV3130(entry);
      });
    });
}


function placeTradeBlockPanelV3130() {
  const page = document.querySelector('#assetsView .assets-page-v230');
  if (!page) return;

  page.querySelector('#tradeBlockPanelV3130')?.remove();

  const wrapper = document.createElement('div');
  wrapper.innerHTML = tradeBlockPanelMarkupV3130();
  const panel = wrapper.firstElementChild;
  if (!panel) return;

  const draftSummary = page.querySelector('#draftCapitalSummaryV3060');
  const tabs = page.querySelector('.asset-tabs-v230');

  if (draftSummary) {
    draftSummary.insertAdjacentElement('beforebegin', panel);
  } else if (tabs) {
    tabs.insertAdjacentElement('beforebegin', panel);
  } else {
    page.appendChild(panel);
  }

  bindTradeBlockPanelV3130(panel);
}


function renderTradeBlockLoadingV3130() {
  const page = document.querySelector('#assetsView .assets-page-v230');
  if (!page) return;

  page.querySelector('#tradeBlockPanelV3130')?.remove();

  const panel = document.createElement('section');
  panel.id = 'tradeBlockPanelV3130';
  panel.className = 'trade-block-panel-v3130 trade-block-loading-v3130';
  panel.innerHTML = `
    <div class="trade-block-head-v3130">
      <div>
        <p class="eyebrow">Trade planning</p>
        <h4>Trade Block</h4>
        <p>Loading player and asset availability…</p>
      </div>
    </div>
  `;

  const draftSummary = page.querySelector('#draftCapitalSummaryV3060');
  const tabs = page.querySelector('.asset-tabs-v230');

  if (draftSummary) draftSummary.insertAdjacentElement('beforebegin', panel);
  else if (tabs) tabs.insertAdjacentElement('beforebegin', panel);
  else page.appendChild(panel);
}


async function decorateTradeBlockV3130() {
  if (!state.frontOffice || activeView !== 'assets') return;

  if (!tradeBlockLoadedV3130 || tradeBlockOfficeIdV3130 !== state.frontOffice.id) {
    renderTradeBlockLoadingV3130();

    try {
      await loadTradeBlockV3130();
    } catch (error) {
      console.error('Trade Block load failed', error);

      const panel = document.querySelector('#tradeBlockPanelV3130');
      if (panel) {
        panel.classList.add('trade-block-load-error-v3130');
        panel.innerHTML = `
          <div class="trade-block-head-v3130">
            <div>
              <p class="eyebrow">Trade planning</p>
              <h4>Trade Block unavailable</h4>
              <p>${escapeHtml(error?.message || 'Trade Block could not be loaded.')}</p>
            </div>
          </div>
        `;
      }
      return;
    }
  }

  placeTradeBlockPanelV3130();
}


function ensureTradeBlockDialogV3130() {
  let dialog = document.getElementById('tradeBlockDialogV3130');
  if (dialog) return dialog;

  dialog = document.createElement('dialog');
  dialog.id = 'tradeBlockDialogV3130';
  dialog.className = 'drawer-dialog trade-block-dialog-v3130';

  dialog.innerHTML = `
    <form class="drawer-card trade-block-dialog-card-v3130" id="tradeBlockFormV3130">
      <header class="drawer-header">
        <div class="drawer-header-copy">
          <p class="eyebrow">Trade planning</p>
          <h3 id="tradeBlockDialogTitleV3130">Add to Trade Block</h3>
        </div>
        <button
          aria-label="Close"
          class="icon-btn"
          id="closeTradeBlockDialogV3130"
          type="button"
        >×</button>
      </header>

      <div class="modal-body trade-block-dialog-body-v3130">
        <div class="trade-block-form-grid-v3130">
          <label>
            Item type
            <select id="tradeBlockKindV3130">
              <option value="PLAYER">Player</option>
              <option value="ASSET">Asset</option>
            </select>
          </label>

          <label class="full">
            Player / asset
            <select id="tradeBlockTargetV3130"></select>
          </label>

          <label class="full">
            Trade status
            <select id="tradeBlockStatusV3130">
              <option value="AVAILABLE">Available</option>
              <option value="LISTENING">Listening</option>
              <option value="UNTOUCHABLE">Untouchable</option>
            </select>
          </label>

          <label class="full">
            Note
            <textarea
              id="tradeBlockNoteV3130"
              maxlength="240"
              rows="3"
              placeholder="Optional — asking price, preferred return, context, etc."
            ></textarea>
          </label>
        </div>

        <div class="trade-block-dialog-hint-v3130" id="tradeBlockDialogHintV3130"></div>

        <div class="form-actions trade-block-form-actions-v3130">
          <button
            class="btn btn-danger hidden"
            id="removeTradeBlockBtnV3130"
            type="button"
          >Remove</button>

          <span></span>

          <button
            class="btn btn-ghost"
            id="cancelTradeBlockBtnV3130"
            type="button"
          >Cancel</button>

          <button
            class="btn btn-primary"
            id="saveTradeBlockBtnV3130"
            type="submit"
          >Save</button>
        </div>
      </div>
    </form>
  `;

  document.body.appendChild(dialog);

  dialog
    .querySelector('#closeTradeBlockDialogV3130')
    ?.addEventListener('click', () => dialog.close());

  dialog
    .querySelector('#cancelTradeBlockBtnV3130')
    ?.addEventListener('click', () => dialog.close());

  dialog
    .querySelector('#tradeBlockKindV3130')
    ?.addEventListener('change', syncTradeBlockTargetOptionsV3130);

  dialog
    .querySelector('#tradeBlockStatusV3130')
    ?.addEventListener('change', syncTradeBlockDialogHintV3130);

  dialog
    .querySelector('#tradeBlockFormV3130')
    ?.addEventListener('submit', saveTradeBlockFromDialogV3130);

  dialog
    .querySelector('#removeTradeBlockBtnV3130')
    ?.addEventListener('click', removeTradeBlockFromDialogV3130);

  dialog.addEventListener('close', () => {
    editingTradeBlockEntryIdV3130 = null;
  });

  return dialog;
}


function tradeBlockAvailablePlayersV3130() {
  return [...(state.players || [])]
    .filter(tradeBlockPlayerEligibleV3130)
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
}


function tradeBlockAvailableAssetsV3130() {
  return [...(state.assets || [])]
    .filter(tradeBlockAssetEligibleV3130)
    .sort((a, b) => {
      const aYear = Number(a.draftYear || 9999);
      const bYear = Number(b.draftYear || 9999);
      if (aYear !== bYear) return aYear - bYear;

      const aRound = Number(a.draftRound || 999);
      const bRound = Number(b.draftRound || 999);
      if (aRound !== bRound) return aRound - bRound;

      return tradeBlockAssetLabelV3130(a)
        .localeCompare(tradeBlockAssetLabelV3130(b));
    });
}


function syncTradeBlockTargetOptionsV3130(selectedId = null) {
  const dialog = ensureTradeBlockDialogV3130();
  const kind = tradeBlockNormalizeKindV3130(
    dialog.querySelector('#tradeBlockKindV3130')?.value
  );
  const select = dialog.querySelector('#tradeBlockTargetV3130');
  if (!select) return;

  if (kind === 'PLAYER') {
    const players = tradeBlockAvailablePlayersV3130();

    select.innerHTML = players.length
      ? players.map((player) => `
          <option value="${escapeAttr(player.id)}">
            ${escapeHtml(player.name)} · ${escapeHtml(player.position || '—')} · ${escapeHtml(player.realTeam || 'No team')}
          </option>
        `).join('')
      : '<option value="">No current roster players</option>';
  } else {
    const assets = tradeBlockAvailableAssetsV3130();

    select.innerHTML = assets.length
      ? assets.map((asset) => `
          <option value="${escapeAttr(asset.id)}">
            ${escapeHtml(tradeBlockAssetLabelV3130(asset))}
          </option>
        `).join('')
      : '<option value="">No owned assets</option>';
  }

  if (selectedId && [...select.options].some((option) => option.value === selectedId)) {
    select.value = selectedId;
  }

  syncTradeBlockDialogHintV3130();
}


function syncTradeBlockDialogHintV3130() {
  const dialog = ensureTradeBlockDialogV3130();
  const hint = dialog.querySelector('#tradeBlockDialogHintV3130');
  const status = tradeBlockNormalizeStatusV3130(
    dialog.querySelector('#tradeBlockStatusV3130')?.value
  );

  if (hint) hint.textContent = tradeBlockStatusHelpV3130(status);
}


function openTradeBlockDialogV3130(entry = null) {
  const dialog = ensureTradeBlockDialogV3130();
  const title = dialog.querySelector('#tradeBlockDialogTitleV3130');
  const kind = dialog.querySelector('#tradeBlockKindV3130');
  const target = dialog.querySelector('#tradeBlockTargetV3130');
  const status = dialog.querySelector('#tradeBlockStatusV3130');
  const note = dialog.querySelector('#tradeBlockNoteV3130');
  const remove = dialog.querySelector('#removeTradeBlockBtnV3130');

  editingTradeBlockEntryIdV3130 = entry?.id || null;

  if (entry) {
    title.textContent = 'Edit Trade Block';
    kind.value = entry.kind;
    kind.disabled = true;

    syncTradeBlockTargetOptionsV3130(
      entry.kind === 'PLAYER' ? entry.playerId : entry.assetId
    );

    target.disabled = true;
    status.value = tradeBlockNormalizeStatusV3130(entry.status);
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
    syncTradeBlockTargetOptionsV3130();
  }

  syncTradeBlockDialogHintV3130();

  if (!dialog.open) dialog.showModal();
}


function currentTradeBlockDialogEntryV3130() {
  return tradeBlockEntriesV3130.find(
    (entry) => entry.id === editingTradeBlockEntryIdV3130
  ) || null;
}


async function saveTradeBlockFromDialogV3130(event) {
  event.preventDefault();

  const dialog = ensureTradeBlockDialogV3130();
  const existing = currentTradeBlockDialogEntryV3130();
  const kind = existing?.kind || tradeBlockNormalizeKindV3130(
    dialog.querySelector('#tradeBlockKindV3130')?.value
  );
  const targetId = existing
    ? (existing.kind === 'PLAYER' ? existing.playerId : existing.assetId)
    : dialog.querySelector('#tradeBlockTargetV3130')?.value || null;
  const status = tradeBlockNormalizeStatusV3130(
    dialog.querySelector('#tradeBlockStatusV3130')?.value
  );
  const note = dialog.querySelector('#tradeBlockNoteV3130')?.value.trim() || null;
  const save = dialog.querySelector('#saveTradeBlockBtnV3130');

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

      await loadTradeBlockV3130(true);
    });

    if (!success) return;

    editingTradeBlockEntryIdV3130 = null;
    dialog.close();
    placeTradeBlockPanelV3130();
  } finally {
    save.disabled = false;
    save.textContent = 'Save';
  }
}


async function removeTradeBlockFromDialogV3130() {
  const dialog = ensureTradeBlockDialogV3130();
  const entry = currentTradeBlockDialogEntryV3130();
  if (!entry) return;

  const target = tradeBlockTargetV3130(entry);
  const label = target?.kind === 'PLAYER'
    ? target.item.name
    : target?.kind === 'ASSET'
      ? tradeBlockAssetLabelV3130(target.item)
      : 'this item';

  if (!confirm(`Remove ${label} from the Trade Block?`)) return;

  const remove = dialog.querySelector('#removeTradeBlockBtnV3130');
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

      await loadTradeBlockV3130(true);
    });

    if (!success) return;

    editingTradeBlockEntryIdV3130 = null;
    dialog.close();
    placeTradeBlockPanelV3130();
  } finally {
    remove.disabled = false;
    remove.textContent = 'Remove';
  }
}


function startTradeFromTradeBlockV3130(entry) {
  const target = tradeBlockTargetV3130(entry);

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


function installTradeBlockV3130() {
  if (tradeBlockInstalledV3130) return;
  tradeBlockInstalledV3130 = true;

  ensureTradeBlockStylesV3130();

  if (typeof renderAssets === 'function') {
    const originalRenderAssetsV3130 = renderAssets;

    renderAssets = function() {
      const result = originalRenderAssetsV3130();
      queueMicrotask(decorateTradeBlockV3130);
      return result;
    };
  }

  if (typeof loadOffice === 'function') {
    const originalLoadOfficeV3130 = loadOffice;

    loadOffice = async function(...args) {
      resetTradeBlockCacheV3130();
      return originalLoadOfficeV3130(...args);
    };
  }

  ensureTradeBlockDialogV3130();

  document.documentElement.dataset.rostercapTradeBlock =
    ROSTERCAP_TRADE_BLOCK_FEATURE_VERSION_V3130;

  // If the user resumed directly into Draft & Assets before this dynamic
  // feature finished loading, decorate the already-rendered page now.
  if (state.frontOffice && activeView === 'assets') {
    queueMicrotask(decorateTradeBlockV3130);
  }
}

installTradeBlockV3130();
