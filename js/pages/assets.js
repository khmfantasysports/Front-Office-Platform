'use strict';

// Draft picks, rights and other asset inventory.

function assetTypeLabel(type) {
  return ({
    DRAFT_PICK:'Draft Pick',
    PROSPECT_RIGHTS:'Prospect Rights',
    PLAYER_RIGHTS:'Player Rights',
    CONDITIONAL_ASSET:'Conditional Asset',
    FUTURE_CONSIDERATIONS:'Future Considerations',
    OTHER:'Other'
  })[type] || 'Asset';
}

function assetStatusLabel(status) {
  return ({ OWNED:'Owned', TRADED_AWAY:'Traded Away', CONDITIONAL:'Conditional', EXPIRED:'Expired' })[status] || status || 'Owned';
}

function ordinalRound(round) {
  const n = Number(round);
  if (!Number.isFinite(n)) return '—';
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  return `${n}${({1:'st',2:'nd',3:'rd'})[n % 10] || 'th'}`;
}

function assetStatusClass(status) { return String(status || '').toLowerCase().replace(/_/g,'-'); }

function renderAssetCard(asset) {
  const status = `<span class="asset-status ${assetStatusClass(asset.status)}">${escapeHtml(assetStatusLabel(asset.status))}</span>`;
  if (asset.type === 'DRAFT_PICK') {
    const label = asset.label || `${asset.draftYear || '—'} ${asset.originalTeam || ''} ${ordinalRound(asset.draftRound)}`;
    return `<button class="asset-card" data-edit-asset="${asset.id}" type="button"><div class="asset-card-top"><span class="asset-card-type">${escapeHtml(asset.draftYear || 'Draft')}</span>${status}</div><div class="asset-pick-main"><span class="asset-round-badge">R${escapeHtml(asset.draftRound || '—')}</span><div><h5>${escapeHtml(label)}</h5><div class="asset-card-meta">Original: ${escapeHtml(asset.originalTeam || '—')} · ${escapeHtml(ordinalRound(asset.draftRound))}</div></div></div></button>`;
  }
  return `<button class="asset-card" data-edit-asset="${asset.id}" type="button"><div class="asset-card-top"><span class="asset-card-type">${escapeHtml(assetTypeLabel(asset.type))}</span>${status}</div><div><h5>${escapeHtml(asset.label)}</h5>${asset.notes ? `<div class="asset-card-meta">${escapeHtml(asset.notes)}</div>` : `<div class="asset-card-meta">No additional notes</div>`}</div></button>`;
}

function renderAssets() {
  const currentAssets = [...(state.assets || [])].filter((asset) => !asset.archivedAt);
  const draftPicks = currentAssets
    .filter((asset) => asset.type === 'DRAFT_PICK')
    .sort((a,b) => (a.draftYear-b.draftYear) || (a.draftRound-b.draftRound) || String(a.originalTeam).localeCompare(String(b.originalTeam)));
  const rights = currentAssets.filter((asset) => ['PROSPECT_RIGHTS','PLAYER_RIGHTS'].includes(asset.type));
  const other = currentAssets.filter((asset) => !['DRAFT_PICK','PROSPECT_RIGHTS','PLAYER_RIGHTS'].includes(asset.type));
  const owned = currentAssets.filter((asset) => asset.status === 'OWNED').length;
  const conditional = currentAssets.filter((asset) => asset.status === 'CONDITIONAL').length;

  const tabs = [
    ['ALL','All'],['DRAFT','Draft Picks'],['RIGHTS','Rights'],['OTHER','Other']
  ].map(([key,label]) =>
    `<button class="asset-tab ${assetFilter === key ? 'active' : ''}" data-asset-filter="${key}" type="button">${label}</button>`
  ).join('');

  const draftYears = [...new Set(draftPicks.map((asset) => asset.draftYear))];
  const draftHtml = draftYears.map((year) => {
    const yearPicks = draftPicks.filter((asset) => asset.draftYear === year);
    return `<div class="asset-year-group asset-year-group-v228">
      <div class="asset-year-label-v228"><strong>${escapeHtml(year)}</strong><span>${yearPicks.length} ${yearPicks.length === 1 ? 'pick' : 'picks'}</span></div>
      <div class="asset-grid">${yearPicks.map(renderAssetCard).join('')}</div>
    </div>`;
  }).join('');

  const sections = [];
  if ((assetFilter === 'ALL' || assetFilter === 'DRAFT') && draftPicks.length) {
    sections.push(`<section class="asset-portfolio-panel-v228"><div class="asset-section-head"><div><p class="eyebrow">Draft capital</p><h4>Draft Picks</h4></div><span>${draftPicks.length} tracked</span></div>${draftHtml}</section>`);
  }
  if ((assetFilter === 'ALL' || assetFilter === 'RIGHTS') && rights.length) {
    sections.push(`<section class="asset-portfolio-panel-v228"><div class="asset-section-head"><div><p class="eyebrow">Rights</p><h4>Player & Prospect Rights</h4></div><span>${rights.length} tracked</span></div><div class="asset-grid">${rights.map(renderAssetCard).join('')}</div></section>`);
  }
  if ((assetFilter === 'ALL' || assetFilter === 'OTHER') && other.length) {
    sections.push(`<section class="asset-portfolio-panel-v228"><div class="asset-section-head"><div><p class="eyebrow">Other</p><h4>Other Assets</h4></div><span>${other.length} tracked</span></div><div class="asset-grid">${other.map(renderAssetCard).join('')}</div></section>`);
  }

  const filteredCount = assetFilter === 'ALL'
    ? currentAssets.length
    : assetFilter === 'DRAFT'
      ? draftPicks.length
      : assetFilter === 'RIGHTS'
        ? rights.length
        : other.length;

  const emptyCopy = currentAssets.length
    ? 'No assets match this view.'
    : 'Add draft picks, rights or other future assets owned by this Front Office.';

  el('assetsView').innerHTML = `<div class="assets-page assets-page-v228">
    <div class="page-heading-row asset-page-heading-v228">
      <div><p class="eyebrow">Portfolio</p><h3>Assets</h3><p class="page-copy">Draft capital, rights and other non-roster resources owned by this Front Office.</p></div>
      <button id="addAssetBtn" class="btn btn-primary" type="button">+ Add Asset</button>
    </div>

    <div class="asset-summary-grid-v228">
      <div><span>Owned</span><strong>${owned}</strong><small>current assets</small></div>
      <div><span>Draft Picks</span><strong>${draftPicks.length}</strong><small>tracked selections</small></div>
      <div><span>Rights</span><strong>${rights.length}</strong><small>player/prospect</small></div>
      <div><span>Conditional</span><strong>${conditional}</strong><small>pending assets</small></div>
    </div>

    <div class="asset-tabs asset-tabs-v228" aria-label="Asset views">${tabs}</div>
    ${filteredCount ? sections.join('') : `<div class="empty-state"><h4>${currentAssets.length ? 'Nothing in this category' : 'No assets yet'}</h4><p>${escapeHtml(emptyCopy)}</p></div>`}
  </div>`;

  el('addAssetBtn').addEventListener('click', () => openAssetDialog());
  document.querySelectorAll('[data-asset-filter]').forEach((button) =>
    button.addEventListener('click', () => { assetFilter = button.dataset.assetFilter; renderAssets(); })
  );
  document.querySelectorAll('[data-edit-asset]').forEach((button) =>
    button.addEventListener('click', () => openAssetDialog(button.dataset.editAsset))
  );
}

function syncAssetTypeFields() {
  const isDraft = el('assetType').value === 'DRAFT_PICK';
  el('assetDraftFields').classList.toggle('hidden', !isDraft);
  el('assetFormNote').textContent = isDraft
    ? 'Draft-pick identity is based on year, round and original team. The original team should never change when the pick is traded.'
    : 'Use the name and notes fields to describe this asset. Structured trade execution will connect these records to Transactions in the next integration pass.';
  el('assetLabel').placeholder = isDraft ? 'Optional — generated from pick identity' : 'Asset name';
}

function openAssetDialog(assetId = null) {
  editingAssetId = assetId || null;
  const asset = assetId ? state.assets.find((a) => a.id === assetId) : null;
  el('assetDialogTitle').textContent = asset ? 'Edit Asset' : 'Add Asset';
  el('assetType').value = asset?.type || 'DRAFT_PICK';
  el('assetStatus').value = asset?.status || 'OWNED';
  el('assetLabel').value = asset?.label || '';
  el('assetDraftYear').value = asset?.draftYear ?? '';
  el('assetDraftRound').value = asset?.draftRound ?? '';
  el('assetOriginalTeam').value = asset?.originalTeam || '';
  el('assetNotes').value = asset?.notes || '';
  el('archiveAssetBtn').classList.toggle('hidden', !asset);
  syncAssetTypeFields();
  assetDialog.showModal();
}

async function saveAssetFromDialog(event) {
  event.preventDefault();
  const button = el('saveAssetBtn');
  if (button.disabled) return;
  const isDraft = el('assetType').value === 'DRAFT_PICK';
  if (isDraft && (!nullableInteger(el('assetDraftYear').value) || !nullableInteger(el('assetDraftRound').value) || !el('assetOriginalTeam').value.trim())) {
    alert('Draft year, round and original team are required for a draft pick.');
    return;
  }
  if (!isDraft && !el('assetLabel').value.trim()) {
    alert('Asset name is required.');
    return;
  }
  button.disabled = true;
  button.textContent = 'Saving…';
  try {
    const success = await runCloudAction(async () => {
      const { error } = await db.rpc('save_front_office_asset_v1', {
        p_front_office_id: state.frontOffice.id,
        p_asset_id: editingAssetId,
        p_asset_type: el('assetType').value,
        p_asset_label: el('assetLabel').value.trim() || null,
        p_draft_year: isDraft ? nullableInteger(el('assetDraftYear').value) : null,
        p_draft_round: isDraft ? nullableInteger(el('assetDraftRound').value) : null,
        p_original_team: isDraft ? el('assetOriginalTeam').value.trim() : null,
        p_asset_status: el('assetStatus').value,
        p_notes: el('assetNotes').value.trim() || null
      });
      if (error) throw error;
      await loadOffice(state.frontOffice.id, false);
    });
    if (success) assetDialog.close();
  } finally {
    button.disabled = false;
    button.textContent = 'Save Asset';
  }
}

async function archiveEditingAsset() {
  if (!editingAssetId) return;
  const asset = state.assets.find((a) => a.id === editingAssetId);
  if (!confirm(`Remove ${asset?.label || 'this asset'} from the current Assets inventory?`)) return;
  const success = await runCloudAction(async () => {
    const { error } = await db.rpc('archive_front_office_asset_v1', { p_front_office_id: state.frontOffice.id, p_asset_id: editingAssetId });
    if (error) throw error;
    await loadOffice(state.frontOffice.id, false);
  });
  if (success) assetDialog.close();
}
