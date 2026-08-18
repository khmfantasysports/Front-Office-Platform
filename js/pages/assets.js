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
  const conditional = currentAssets.filter((asset) => asset.status === 'CONDITIONAL').length;

  const tabs = [
    ['ALL','All'],
    ['DRAFT','Picks'],
    ['RIGHTS','Rights'],
    ['OTHER','Other']
  ].map(([key,label]) =>
    `<button class="asset-tab ${assetFilter === key ? 'active' : ''}" data-asset-filter="${key}" type="button">${label}</button>`
  ).join('');

  const draftYears = [...new Set(draftPicks.map((asset) => asset.draftYear))];
  const draftHtml = draftYears.map((year) => {
    const yearPicks = draftPicks.filter((asset) => asset.draftYear === year);
    return `<div class="asset-year-group asset-year-group-v230">
      <div class="asset-year-label-v230">
        <strong>${escapeHtml(year)}</strong>
        <span>${yearPicks.length} ${yearPicks.length === 1 ? 'pick' : 'picks'}</span>
      </div>
      <div class="asset-grid">${yearPicks.map(renderAssetCard).join('')}</div>
    </div>`;
  }).join('');

  const sections = [];
  if ((assetFilter === 'ALL' || assetFilter === 'DRAFT') && draftPicks.length) {
    sections.push(`<section class="asset-portfolio-panel-v230">
      <div class="asset-section-head asset-section-head-v230">
        <h4>Draft Picks</h4><span>${draftPicks.length}</span>
      </div>
      ${draftHtml}
    </section>`);
  }

  if ((assetFilter === 'ALL' || assetFilter === 'RIGHTS') && rights.length) {
    sections.push(`<section class="asset-portfolio-panel-v230">
      <div class="asset-section-head asset-section-head-v230">
        <h4>Rights</h4><span>${rights.length}</span>
      </div>
      <div class="asset-grid">${rights.map(renderAssetCard).join('')}</div>
    </section>`);
  }

  if ((assetFilter === 'ALL' || assetFilter === 'OTHER') && other.length) {
    sections.push(`<section class="asset-portfolio-panel-v230">
      <div class="asset-section-head asset-section-head-v230">
        <h4>Other Assets</h4><span>${other.length}</span>
      </div>
      <div class="asset-grid">${other.map(renderAssetCard).join('')}</div>
    </section>`);
  }

  const filteredCount = assetFilter === 'ALL'
    ? currentAssets.length
    : assetFilter === 'DRAFT'
      ? draftPicks.length
      : assetFilter === 'RIGHTS'
        ? rights.length
        : other.length;

  let emptyTitle = 'No assets tracked';
  let emptyCopy = 'Draft picks, rights and other future assets will appear here.';
  if (currentAssets.length) {
    emptyTitle = 'Nothing in this category';
    emptyCopy = 'Choose another category or add a new asset.';
  }

  el('assetsView').innerHTML = `<div class="assets-page assets-page-v230">
    <header class="asset-hero-v230">
      <div class="asset-hero-copy-v230">
        <p class="eyebrow">Assets</p>
        <h3>Future resources</h3>
        <p>Draft picks, rights and conditional assets.</p>
      </div>
      <button id="addAssetBtn" class="btn btn-primary asset-add-btn-v230" type="button">+ Add Asset</button>
    </header>

    <div class="asset-summary-grid-v230" aria-label="Asset summary">
      <div><span>Total</span><strong>${currentAssets.length}</strong></div>
      <div><span>Picks</span><strong>${draftPicks.length}</strong></div>
      <div><span>Rights</span><strong>${rights.length}</strong></div>
      <div><span>Conditional</span><strong>${conditional}</strong></div>
    </div>

    <div class="asset-tabs asset-tabs-v230" aria-label="Asset views">${tabs}</div>

    ${filteredCount
      ? `<div class="asset-sections-v230">${sections.join('')}</div>`
      : `<div class="asset-empty-v230"><strong>${escapeHtml(emptyTitle)}</strong><span>${escapeHtml(emptyCopy)}</span></div>`
    }
  </div>`;

  el('addAssetBtn').addEventListener('click', () => openAssetDialog());
  document.querySelectorAll('[data-asset-filter]').forEach((button) =>
    button.addEventListener('click', () => {
      assetFilter = button.dataset.assetFilter;
      renderAssets();
    })
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
