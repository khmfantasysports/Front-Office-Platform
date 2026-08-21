'use strict';

// -----------------------------------------------------------------------------
// RosterCap V2.70 — Asset Manager
//
// Frontend-only enhancement around the established asset + transaction model:
// - asset status filters
// - Draft Pick lifecycle context
// - progressive-disclosure Asset editor
// - existing transaction activity inside Edit Asset
// - unsaved-change protection
//
// No asset persistence or transaction persistence logic is replaced.
// -----------------------------------------------------------------------------

let assetManagerInstalledV270 = false;
let assetStatusFilterV270 = 'ALL';
let assetFormDirtyV270 = false;

function currentEditingAssetV270() {
  if (typeof editingAssetId === 'undefined' || !editingAssetId) return null;
  return (state.assets || []).find((asset) => asset.id === editingAssetId) || null;
}

function activeAssetsV270() {
  return (state.assets || []).filter((asset) => !asset.archivedAt);
}

function assetsForCurrentCategoryV270() {
  const assets = activeAssetsV270();
  const filter = typeof assetFilter === 'undefined' ? 'ALL' : assetFilter;

  if (filter === 'DRAFT') {
    return assets.filter((asset) => asset.type === 'DRAFT_PICK');
  }

  if (filter === 'RIGHTS') {
    return assets.filter((asset) =>
      asset.type === 'PROSPECT_RIGHTS' || asset.type === 'PLAYER_RIGHTS'
    );
  }

  if (filter === 'OTHER') {
    return assets.filter((asset) =>
      !['DRAFT_PICK', 'PROSPECT_RIGHTS', 'PLAYER_RIGHTS'].includes(asset.type)
    );
  }

  return assets;
}

function assetActivityV270(assetId) {
  const txById = new Map(
    (state.transactions || []).map((transaction) => [transaction.id, transaction])
  );

  return (state.transactionItems || [])
    .filter((item) => item.assetId === assetId)
    .map((item) => ({
      item,
      transaction: txById.get(item.transactionId) || null
    }))
    .filter((row) => row.transaction)
    .sort((a, b) => {
      const aTime = Date.parse(a.transaction.date || a.transaction.createdAt || '') || 0;
      const bTime = Date.parse(b.transaction.date || b.transaction.createdAt || '') || 0;
      return bTime - aTime;
    });
}

function assetActivityDateV270(value) {
  if (!value) return '';
  const parsed = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleDateString(undefined, {
    year:'numeric',
    month:'short',
    day:'numeric'
  });
}

function assetActivityDirectionV270(row) {
  const type = row.transaction?.type || '';
  const direction = row.item?.direction || 'NONE';

  if (type === 'Draft') return 'Used';
  if (direction === 'IN') return 'Acquired';
  if (direction === 'OUT') return 'Moved out';
  return 'Referenced';
}

function latestAssetLifecycleCopyV270(asset) {
  const activity = assetActivityV270(asset.id);
  if (!activity.length) return '';

  const latest = activity[0];
  const tx = latest.transaction;
  const date = assetActivityDateV270(tx.date);
  const direction = assetActivityDirectionV270(latest);

  if (tx.type === 'Draft') {
    const playerItem = (state.transactionItems || []).find((item) =>
      item.transactionId === tx.id && item.playerId
    );
    const player = playerItem?.playerId
      ? (state.players || []).find((candidate) => candidate.id === playerItem.playerId)
      : null;

    return player?.name
      ? `Used · ${player.name}${date ? ` · ${date}` : ''}`
      : `Used in Draft${date ? ` · ${date}` : ''}`;
  }

  if (tx.type === 'Trade') {
    const counterparty = String(tx.counterparty || '').trim();

    if (latest.item.direction === 'IN') {
      return `Acquired${counterparty ? ` from ${counterparty}` : ''}${date ? ` · ${date}` : ''}`;
    }

    if (latest.item.direction === 'OUT') {
      return `Traded${counterparty ? ` to ${counterparty}` : ''}${date ? ` · ${date}` : ''}`;
    }
  }

  return `${direction} · ${tx.type}${date ? ` · ${date}` : ''}`;
}

function decorateAssetCardsV270() {
  document.querySelectorAll('#assetsView [data-edit-asset]').forEach((card) => {
    const asset = (state.assets || []).find((item) => item.id === card.dataset.editAsset);
    if (!asset) return;

    card.classList.toggle('asset-card-used-v270', asset.status === 'USED');
    card.classList.toggle('asset-card-traded-v270', asset.status === 'TRADED_AWAY');
    card.classList.toggle('asset-card-conditional-v270', asset.status === 'CONDITIONAL');

    const existing = card.querySelector('.asset-lifecycle-v270');
    existing?.remove();

    const lifecycle = latestAssetLifecycleCopyV270(asset);
    if (!lifecycle) return;

    const line = document.createElement('span');
    line.className = 'asset-lifecycle-v270';
    line.textContent = lifecycle;

    const meta = card.querySelector('.asset-card-meta');
    if (meta) meta.insertAdjacentElement('afterend', line);
    else card.appendChild(line);
  });
}

function assetStatusFilterChoicesV270() {
  const assets = assetsForCurrentCategoryV270();
  const choices = [
    ['ALL', 'All', assets.length],
    ['OWNED', 'Owned', assets.filter((asset) => asset.status === 'OWNED').length],
    ['USED', 'Used', assets.filter((asset) => asset.status === 'USED').length],
    ['CONDITIONAL', 'Conditional', assets.filter((asset) => asset.status === 'CONDITIONAL').length],
    ['TRADED_AWAY', 'Traded', assets.filter((asset) => asset.status === 'TRADED_AWAY').length],
    ['EXPIRED', 'Expired', assets.filter((asset) => asset.status === 'EXPIRED').length]
  ];

  return choices.filter(([key, , count]) => key === 'ALL' || count > 0);
}

function applyAssetStatusFilterV270() {
  const choices = assetStatusFilterChoicesV270();
  const allowed = new Set(choices.map(([key]) => key));

  if (!allowed.has(assetStatusFilterV270)) {
    assetStatusFilterV270 = 'ALL';
  }

  document.querySelectorAll('#assetsView [data-asset-status-v270]').forEach((button) => {
    const active = button.dataset.assetStatusV270 === assetStatusFilterV270;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });

  let visibleCards = 0;

  document.querySelectorAll('#assetsView [data-edit-asset]').forEach((card) => {
    const asset = (state.assets || []).find((item) => item.id === card.dataset.editAsset);
    const visible = Boolean(
      asset &&
      (
        assetStatusFilterV270 === 'ALL'
        || asset.status === assetStatusFilterV270
      )
    );

    card.classList.toggle('asset-filter-hidden-v270', !visible);
    if (visible) visibleCards += 1;
  });

  document.querySelectorAll('#assetsView .asset-year-group-v230').forEach((group) => {
    const visible = [...group.querySelectorAll('[data-edit-asset]')]
      .some((card) => !card.classList.contains('asset-filter-hidden-v270'));
    group.classList.toggle('asset-filter-hidden-v270', !visible);
  });

  document.querySelectorAll('#assetsView .asset-portfolio-panel-v230').forEach((panel) => {
    const visible = [...panel.querySelectorAll('[data-edit-asset]')]
      .some((card) => !card.classList.contains('asset-filter-hidden-v270'));
    panel.classList.toggle('asset-filter-hidden-v270', !visible);
  });

  const empty = el('assetStatusEmptyV270');
  if (empty) {
    empty.classList.toggle('hidden', visibleCards > 0);
    if (visibleCards === 0) {
      empty.querySelector('strong').textContent =
        `No ${assetStatusFilterV270 === 'ALL' ? '' : assetStatusFilterV270.toLowerCase().replace(/_/g, ' ')} assets here`.trim();
    }
  }
}

function ensureAssetStatusRailV270() {
  const page = document.querySelector('#assetsView .assets-page-v230');
  const tabs = page?.querySelector('.asset-tabs-v230');
  if (!page || !tabs) return;

  page.querySelector('#assetStatusRailV270')?.remove();
  page.querySelector('#assetStatusEmptyV270')?.remove();

  const choices = assetStatusFilterChoicesV270();

  if (choices.length <= 1) {
    assetStatusFilterV270 = 'ALL';
    return;
  }

  const rail = document.createElement('div');
  rail.id = 'assetStatusRailV270';
  rail.className = 'asset-status-rail-v270';
  rail.setAttribute('aria-label', 'Asset status filters');

  rail.innerHTML = choices.map(([key, label, count]) => `
    <button
      type="button"
      data-asset-status-v270="${key}"
      aria-pressed="${assetStatusFilterV270 === key ? 'true' : 'false'}"
      class="${assetStatusFilterV270 === key ? 'active' : ''}"
    >
      <span>${escapeHtml(label)}</span><strong>${count}</strong>
    </button>
  `).join('');

  tabs.insertAdjacentElement('afterend', rail);

  const empty = document.createElement('div');
  empty.id = 'assetStatusEmptyV270';
  empty.className = 'asset-status-empty-v270 hidden';
  empty.innerHTML = '<strong>No assets here</strong><span>Choose another status or category.</span>';
  rail.insertAdjacentElement('afterend', empty);

  rail.querySelectorAll('[data-asset-status-v270]').forEach((button) => {
    button.addEventListener('click', () => {
      assetStatusFilterV270 = button.dataset.assetStatusV270 || 'ALL';
      applyAssetStatusFilterV270();
    });
  });
}

function decorateAssetsPageV270() {
  const page = document.querySelector('#assetsView .assets-page-v230');
  if (!page) return;

  page.classList.add('assets-page-v270');
  decorateAssetCardsV270();
  ensureAssetStatusRailV270();
  applyAssetStatusFilterV270();
}

function assetFieldLabelV270(inputId) {
  return el(inputId)?.closest('label') || null;
}

function setAssetFieldTextV270(inputId, text) {
  const label = assetFieldLabelV270(inputId);
  if (!label) return;

  const textNode = [...label.childNodes].find((node) =>
    node.nodeType === Node.TEXT_NODE && node.textContent.trim()
  );

  if (textNode) {
    textNode.textContent = `${text}\n`;
  }
}

function ensureAssetEditorStructureV270() {
  const dialog = el('assetDialog');
  const form = el('assetForm');
  const body = dialog?.querySelector('.modal-body');
  const primary = body?.querySelector('.form-grid.compact');
  const draftFields = el('assetDraftFields');
  const note = el('assetFormNote');
  const notesLabel = assetFieldLabelV270('assetNotes');

  if (!dialog || !form || !body || !primary || !draftFields || !note || !notesLabel) return;

  dialog.classList.add('asset-dialog-v270');
  body.classList.add('asset-editor-body-v270');
  primary.classList.add('asset-primary-grid-v270');
  draftFields.classList.add('asset-draft-fields-v270');
  note.classList.add('asset-form-note-v270');

  notesLabel.removeAttribute('style');
  notesLabel.classList.add('asset-notes-field-v270');

  if (!el('assetPickPreviewV270')) {
    const preview = document.createElement('div');
    preview.id = 'assetPickPreviewV270';
    preview.className = 'asset-pick-preview-v270';
    preview.innerHTML = `
      <span>Draft Pick identity</span>
      <strong id="assetPickPreviewLabelV270">Enter year, round and original team</strong>
    `;
    draftFields.insertAdjacentElement('afterend', preview);
  }

  if (!el('assetOptionalDetailsV270')) {
    const details = document.createElement('details');
    details.id = 'assetOptionalDetailsV270';
    details.className = 'asset-details-v270';

    const summary = document.createElement('summary');
    summary.innerHTML = `
      <span>Optional details</span>
      <small id="assetOptionalSummaryV270">None added</small>
    `;

    const inner = document.createElement('div');
    inner.id = 'assetOptionalBodyV270';
    inner.className = 'asset-details-body-v270';

    details.append(summary, inner);
    note.insertAdjacentElement('afterend', details);
    inner.appendChild(notesLabel);
  }

  if (!el('assetActivityDetailsV270')) {
    const activity = document.createElement('details');
    activity.id = 'assetActivityDetailsV270';
    activity.className = 'asset-details-v270 asset-activity-details-v270 hidden';

    const summary = document.createElement('summary');
    summary.innerHTML = `
      <span>Asset activity</span>
      <small id="assetActivityCountV270">0 entries</small>
    `;

    const content = document.createElement('div');
    content.id = 'assetActivityBodyV270';
    content.className = 'asset-activity-body-v270';

    activity.append(summary, content);
    body.appendChild(activity);
  }
}

function syncAssetUsedOptionV270() {
  const select = el('assetStatus');
  const used = select?.querySelector('option[value="USED"]');
  if (!used) return;

  const asset = currentEditingAssetV270();
  const isUsedPick = asset?.type === 'DRAFT_PICK' && asset?.status === 'USED';

  used.hidden = !isUsedPick;
  used.disabled = !isUsedPick;

  if (isUsedPick) select.value = 'USED';
  else if (select.value === 'USED') select.value = 'OWNED';
}

function syncAssetPickPreviewV270() {
  const preview = el('assetPickPreviewV270');
  const label = el('assetPickPreviewLabelV270');
  if (!preview || !label) return;

  const isDraft = el('assetType')?.value === 'DRAFT_PICK';
  preview.classList.toggle('hidden', !isDraft);
  if (!isDraft) return;

  const year = nullableInteger(el('assetDraftYear')?.value);
  const round = nullableInteger(el('assetDraftRound')?.value);
  const originalTeam = el('assetOriginalTeam')?.value.trim() || '';

  if (!year || !round || !originalTeam) {
    label.textContent = 'Enter year, round and original team';
    preview.classList.remove('complete');
    return;
  }

  label.textContent = `${year} · ${ordinalRound(round)} · ${originalTeam}`;
  preview.classList.add('complete');
}

function assetTypeHelpV270(type) {
  return ({
    DRAFT_PICK:
      'Year, round and original team define the pick. The original team stays fixed even when ownership changes.',
    PROSPECT_RIGHTS:
      'Track prospect rights that belong to this Front Office but are not represented as a roster player.',
    PLAYER_RIGHTS:
      'Track retained or contractual player rights outside the active roster record.',
    CONDITIONAL_ASSET:
      'Use the name and notes to record the condition that determines what this asset becomes.',
    FUTURE_CONSIDERATIONS:
      'Use notes for any agreement details or trigger dates tied to the future consideration.',
    OTHER:
      'Use a clear name and notes so this asset remains understandable in trades and history.'
  })[type] || 'Track this asset as part of the Front Office inventory.';
}

function syncAssetOptionalDetailsV270() {
  ensureAssetEditorStructureV270();

  const isDraft = el('assetType')?.value === 'DRAFT_PICK';
  const primary = el('assetDialog')?.querySelector('.asset-primary-grid-v270');
  const labelField = assetFieldLabelV270('assetLabel');
  const statusField = assetFieldLabelV270('assetStatus');
  const details = el('assetOptionalDetailsV270');
  const body = el('assetOptionalBodyV270');
  const summary = el('assetOptionalSummaryV270');

  if (!primary || !labelField || !details || !body || !summary) return;

  if (isDraft) {
    if (labelField.parentElement !== body) {
      body.insertBefore(labelField, body.firstChild);
    }
    setAssetFieldTextV270('assetLabel', 'Custom label');
    el('assetLabel').placeholder = 'Optional custom label';
  } else {
    if (labelField.parentElement !== primary) {
      if (statusField?.parentElement === primary) statusField.insertAdjacentElement('afterend', labelField);
      else primary.appendChild(labelField);
    }
    setAssetFieldTextV270('assetLabel', 'Asset name');
    el('assetLabel').placeholder = 'Asset name';
  }

  const customLabel = el('assetLabel')?.value.trim() || '';
  const notes = el('assetNotes')?.value.trim() || '';
  const parts = [];

  if (isDraft && customLabel) parts.push('Custom label');
  if (notes) parts.push('Notes added');

  summary.textContent = parts.length ? parts.join(' · ') : 'None added';

  if (parts.length) details.open = true;
}

function renderAssetActivityV270(assetId) {
  const details = el('assetActivityDetailsV270');
  const body = el('assetActivityBodyV270');
  const count = el('assetActivityCountV270');
  if (!details || !body || !count) return;

  if (!assetId) {
    details.classList.add('hidden');
    body.innerHTML = '';
    count.textContent = '0 entries';
    return;
  }

  const rows = assetActivityV270(assetId);
  details.classList.toggle('hidden', rows.length === 0);
  count.textContent = `${rows.length} ${rows.length === 1 ? 'entry' : 'entries'}`;

  if (!rows.length) {
    body.innerHTML = '';
    return;
  }

  body.innerHTML = rows.slice(0, 10).map((row) => {
    const tx = row.transaction;
    const direction = assetActivityDirectionV270(row);
    const date = assetActivityDateV270(tx.date);

    return `
      <div class="asset-activity-row-v270">
        <span class="asset-activity-direction-v270">${escapeHtml(direction)}</span>
        <span class="asset-activity-copy-v270">
          <strong>${escapeHtml(tx.type || 'Transaction')}</strong>
          <small>${escapeHtml(tx.summary || 'Asset activity')}</small>
        </span>
        <time>${escapeHtml(date)}</time>
      </div>
    `;
  }).join('') + `
    <button class="btn btn-secondary btn-small asset-open-ledger-v270" type="button" id="assetOpenLedgerV270">
      View Transactions
    </button>
  `;

  el('assetOpenLedgerV270')?.addEventListener('click', () => {
    assetFormDirtyV270 = false;
    assetDialog.close();

    if (typeof transactionHistoryFilterV259 !== 'undefined') {
      transactionHistoryFilterV259 = 'All';
    }

    if (typeof switchView === 'function') switchView('transactions');
  });
}

function syncAssetEditorV270(assetId = null) {
  ensureAssetEditorStructureV270();

  const type = el('assetType')?.value || 'DRAFT_PICK';
  const isDraft = type === 'DRAFT_PICK';
  const dialog = el('assetDialog');
  const note = el('assetFormNote');
  const draftFields = el('assetDraftFields');

  dialog?.classList.toggle('asset-is-draft-v270', isDraft);
  dialog?.classList.toggle('asset-is-other-v270', !isDraft);

  if (draftFields) draftFields.classList.toggle('hidden', !isDraft);

  if (note) note.textContent = assetTypeHelpV270(type);

  syncAssetUsedOptionV270();
  syncAssetOptionalDetailsV270();
  syncAssetPickPreviewV270();
  renderAssetActivityV270(assetId || (typeof editingAssetId !== 'undefined' ? editingAssetId : null));
}

function guardAssetCloseV270(event) {
  if (!assetDialog?.open || !assetFormDirtyV270) return;

  const discard = confirm('Discard unsaved asset changes?');
  if (discard) {
    assetFormDirtyV270 = false;
    return;
  }

  event.preventDefault();
  event.stopImmediatePropagation();
}

function installAssetManagerV270() {
  if (assetManagerInstalledV270) return;
  assetManagerInstalledV270 = true;

  ensureAssetEditorStructureV270();

  if (typeof renderAssets === 'function') {
    const originalRenderAssetsV270 = renderAssets;
    renderAssets = function() {
      const result = originalRenderAssetsV270();
      decorateAssetsPageV270();
      return result;
    };
  }

  if (typeof syncAssetTypeFields === 'function') {
    const originalSyncAssetTypeFieldsV270 = syncAssetTypeFields;
    syncAssetTypeFields = function() {
      const result = originalSyncAssetTypeFieldsV270();
      syncAssetEditorV270(
        typeof editingAssetId !== 'undefined' ? editingAssetId : null
      );
      return result;
    };
  }

  if (typeof openAssetDialog === 'function') {
    const originalOpenAssetDialogV270 = openAssetDialog;
    openAssetDialog = function(assetId = null) {
      assetFormDirtyV270 = false;
      const result = originalOpenAssetDialogV270(assetId);
      syncAssetEditorV270(assetId);
      return result;
    };
  }

  el('assetForm')?.addEventListener('input', () => {
    if (assetDialog?.open) assetFormDirtyV270 = true;
    syncAssetPickPreviewV270();
    syncAssetOptionalDetailsV270();
  });

  el('assetForm')?.addEventListener('change', () => {
    if (assetDialog?.open) assetFormDirtyV270 = true;
    syncAssetPickPreviewV270();
    syncAssetOptionalDetailsV270();
  });

  el('closeAssetDialog')?.addEventListener('click', guardAssetCloseV270, true);
  el('cancelAssetBtn')?.addEventListener('click', guardAssetCloseV270, true);

  assetDialog?.addEventListener('cancel', (event) => {
    if (!assetFormDirtyV270) return;

    const discard = confirm('Discard unsaved asset changes?');
    if (discard) {
      assetFormDirtyV270 = false;
      return;
    }

    event.preventDefault();
  });
}

installAssetManagerV270();
