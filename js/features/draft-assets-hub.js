'use strict';

// -----------------------------------------------------------------------------
// RosterCap V3.06.2 — Draft & Assets Hub final polish
//
// Additive presentation/navigation layer over the established Assets,
// structured Trade and Draft-selection contracts.
//
// No persistence contract is replaced.
// -----------------------------------------------------------------------------

let draftAssetsHubDefaultedV3060 = false;
let draftAssetsHubInstalledV3060 = false;

function draftHubActiveAssetsV3060() {
  return (state.assets || []).filter((asset) => !asset.archivedAt);
}

function draftHubDraftAssetsV3060() {
  return (state.assets || []).filter((asset) => asset.type === 'DRAFT_PICK');
}

function draftHubCurrentCapitalV3060() {
  return draftHubActiveAssetsV3060()
    .filter((asset) =>
      asset.type === 'DRAFT_PICK'
      && ['OWNED', 'CONDITIONAL'].includes(asset.status)
    )
    .sort((a, b) =>
      Number(a.draftYear || 9999) - Number(b.draftYear || 9999)
      || Number(a.draftRound || 999) - Number(b.draftRound || 999)
      || String(a.originalTeam || '').localeCompare(String(b.originalTeam || ''))
    );
}

function draftHubPickLabelV3060(asset) {
  if (!asset) return 'Draft Pick';
  return asset.label
    || `${asset.draftYear || 'Draft'} ${asset.originalTeam || ''} Round ${asset.draftRound || '—'}`.trim();
}

function draftHubDateV3060(value) {
  if (!value) return '';
  const raw = String(value).slice(0, 10);
  const parsed = new Date(`${raw}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleDateString(undefined, {
    year:'numeric',
    month:'short',
    day:'numeric'
  });
}

function draftHubTimestampV3060(transaction) {
  return Date.parse(transaction?.date || transaction?.createdAt || '') || 0;
}

function draftHubTransactionItemsV3060(transactionId) {
  return (state.transactionItems || [])
    .filter((item) => item.transactionId === transactionId);
}

function draftHubAssetForItemV3060(item) {
  if (!item?.assetId) return null;
  return (state.assets || []).find((asset) => asset.id === item.assetId) || null;
}

function draftHubDraftAssetItemV3060(transactionId) {
  return draftHubTransactionItemsV3060(transactionId)
    .find((item) => draftHubAssetForItemV3060(item)?.type === 'DRAFT_PICK') || null;
}

function draftHubPlayerLabelV3060(transactionId) {
  const item = draftHubTransactionItemsV3060(transactionId)
    .find((candidate) => candidate.playerId || candidate.kind === 'PLAYER');

  if (!item) return 'Drafted player';

  const player = item.playerId
    ? (state.players || []).find((candidate) => candidate.id === item.playerId)
    : null;

  return player?.name || item.label || 'Drafted player';
}

function draftHubDraftTransactionsV3060() {
  return [...(state.transactions || [])]
    .filter((transaction) => transaction.type === 'Draft')
    .sort((a, b) => draftHubTimestampV3060(b) - draftHubTimestampV3060(a));
}

function draftHubRecentActivityV3060() {
  const assetMap = new Map(
    draftHubDraftAssetsV3060().map((asset) => [asset.id, asset])
  );
  const transactionMap = new Map(
    (state.transactions || []).map((transaction) => [transaction.id, transaction])
  );

  const rows = [];
  const seen = new Set();

  (state.transactionItems || []).forEach((item) => {
    const asset = item.assetId ? assetMap.get(item.assetId) : null;
    const transaction = transactionMap.get(item.transactionId);
    if (!asset || !transaction || !['Draft', 'Trade'].includes(transaction.type)) return;

    const key = `${transaction.id}:${asset.id}:${item.direction || 'NONE'}`;
    if (seen.has(key)) return;
    seen.add(key);

    const pick = draftHubPickLabelV3060(asset);
    const date = draftHubDateV3060(transaction.date || transaction.createdAt);

    let title = transaction.summary || `${transaction.type} activity`;
    let meta = date;
    let tone = 'neutral';

    if (transaction.type === 'Draft') {
      title = `Drafted ${draftHubPlayerLabelV3060(transaction.id)}`;
      meta = `${pick}${date ? ` · ${date}` : ''}`;
      tone = 'used';
    } else if (item.direction === 'IN') {
      title = `Acquired ${pick}`;
      meta = `${transaction.counterparty ? `from ${transaction.counterparty}` : 'via trade'}${date ? ` · ${date}` : ''}`;
      tone = 'in';
    } else if (item.direction === 'OUT') {
      title = `Traded ${pick}`;
      meta = `${transaction.counterparty ? `to ${transaction.counterparty}` : 'via trade'}${date ? ` · ${date}` : ''}`;
      tone = 'out';
    }

    rows.push({
      transaction,
      asset,
      title,
      meta,
      tone,
      timestamp:draftHubTimestampV3060(transaction)
    });
  });

  return rows
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 5);
}

function draftHubHistoryGroupsV3060() {
  const groups = new Map();

  draftHubDraftTransactionsV3060().forEach((transaction) => {
    const pickItem = draftHubDraftAssetItemV3060(transaction.id);
    const asset = draftHubAssetForItemV3060(pickItem);
    const year = Number(asset?.draftYear)
      || Number(String(transaction.date || '').slice(0, 4))
      || 'Other';

    if (!groups.has(year)) groups.set(year, []);

    groups.get(year).push({
      transaction,
      asset,
      playerLabel:draftHubPlayerLabelV3060(transaction.id),
      round:Number(asset?.draftRound) || null,
      date:draftHubDateV3060(transaction.date || transaction.createdAt)
    });
  });

  return [...groups.entries()]
    .sort((a, b) => {
      const aNum = Number(a[0]);
      const bNum = Number(b[0]);
      if (Number.isFinite(aNum) && Number.isFinite(bNum)) return bNum - aNum;
      return String(b[0]).localeCompare(String(a[0]));
    })
    .map(([year, rows]) => [
      year,
      rows.sort((a, b) =>
        (a.round || 999) - (b.round || 999)
        || draftHubTimestampV3060(a.transaction) - draftHubTimestampV3060(b.transaction)
      )
    ]);
}

function draftHubYearSummaryMarkupV3060() {
  const picks = draftHubCurrentCapitalV3060();
  const grouped = new Map();

  picks.forEach((asset) => {
    const year = asset.draftYear || 'TBD';
    if (!grouped.has(year)) grouped.set(year, []);
    grouped.get(year).push(asset);
  });

  if (!grouped.size) {
    return `<div class="draft-capital-empty-v3060">
      <strong>No current draft picks</strong>
      <span>Add a pick or acquire one through a Trade.</span>
    </div>`;
  }

  return `<div class="draft-capital-years-v3060" aria-label="Current draft capital by year">
    ${[...grouped.entries()]
      .sort((a, b) => Number(a[0] || 9999) - Number(b[0] || 9999))
      .map(([year, rows]) => {
        const conditional = rows.filter((asset) => asset.status === 'CONDITIONAL').length;
        return `<div class="draft-capital-year-v3060">
          <span>${escapeHtml(year)}</span>
          <strong>${rows.length} ${rows.length === 1 ? 'pick' : 'picks'}</strong>
          ${conditional ? `<small>${conditional} conditional</small>` : ''}
        </div>`;
      }).join('')}
  </div>`;
}

function draftHubRecentMarkupV3060() {
  const rows = draftHubRecentActivityV3060();

  if (!rows.length) {
    return `<section class="draft-hub-panel-v3060 draft-activity-panel-v3060 draft-hub-panel-empty-v3062">
      <div class="draft-hub-section-head-v3060">
        <div><p class="eyebrow">Draft activity</p><h4>Recent movement</h4></div>
        <button class="draft-hub-text-action-v3060" data-draft-hub-transactions type="button">Transactions →</button>
      </div>
      <p class="draft-hub-empty-line-v3062"><strong>No draft activity yet.</strong> Draft selections and pick trades will appear here.</p>
    </section>`;
  }

  return `<section class="draft-hub-panel-v3060 draft-activity-panel-v3060">
    <div class="draft-hub-section-head-v3060">
      <div><p class="eyebrow">Draft activity</p><h4>Recent movement</h4></div>
      <button class="draft-hub-text-action-v3060" data-draft-hub-transactions type="button">Transactions →</button>
    </div>
    <div class="draft-activity-list-v3060">
      ${rows.map((row) => `
        <button class="draft-activity-row-v3060 ${row.tone}" data-draft-hub-transaction="${row.transaction.id}" type="button">
          <span class="draft-activity-mark-v3060"></span>
          <span><strong>${escapeHtml(row.title)}</strong><small>${escapeHtml(row.meta)}</small></span>
        </button>`).join('')}
    </div>
  </section>`;
}

function draftHubHistoryMarkupV3060() {
  const groups = draftHubHistoryGroupsV3060();

  if (!groups.length) {
    return `<section class="draft-hub-panel-v3060 draft-history-panel-v3060 draft-hub-panel-empty-v3062" id="draftHistoryV3060">
      <div class="draft-hub-section-head-v3060">
        <div><p class="eyebrow">Draft history</p><h4>Past drafts</h4></div>
      </div>
      <p class="draft-hub-empty-line-v3062"><strong>No past drafts recorded yet.</strong> Draft selections will build this history automatically.</p>
    </section>`;
  }

  return `<section class="draft-hub-panel-v3060 draft-history-panel-v3060" id="draftHistoryV3060">
    <div class="draft-hub-section-head-v3060">
      <div><p class="eyebrow">Draft history</p><h4>Past drafts</h4></div>
      <span class="draft-history-count-v3060">${draftHubDraftTransactionsV3060().length} selections</span>
    </div>
    <div class="draft-history-groups-v3060">
      ${groups.map(([year, rows], index) => `
        <details class="draft-history-year-v3060" ${index === 0 ? 'open' : ''}>
          <summary><span>${escapeHtml(year)}</span><strong>${rows.length} ${rows.length === 1 ? 'selection' : 'selections'}</strong></summary>
          <div class="draft-history-list-v3060">
            ${rows.map((row) => `
              <button class="draft-history-row-v3060" data-draft-hub-transaction="${row.transaction.id}" type="button">
                <span class="draft-history-round-v3060">${row.round ? `Round ${escapeHtml(row.round)}` : 'Draft'}</span>
                <span class="draft-history-copy-v3060">
                  <strong>${escapeHtml(row.playerLabel)}</strong>
                  <small>${escapeHtml(row.asset ? draftHubPickLabelV3060(row.asset) : row.transaction.summary || 'Draft selection')}${row.date ? ` · ${escapeHtml(row.date)}` : ''}</small>
                </span>
              </button>`).join('')}
          </div>
        </details>`).join('')}
    </div>
  </section>`;
}

function draftHubActionsMarkupV3060() {
  return `<div class="draft-hub-actions-v3060">
    <button id="addAssetBtnV3060" class="btn btn-primary" type="button">+ Add Asset</button>
    <details class="draft-actions-menu-v3060">
      <summary class="btn btn-secondary">Draft Actions ▾</summary>
      <div class="draft-actions-popover-v3060">
        <button type="button" data-draft-action="draft">Record Draft Selection</button>
        <button type="button" data-draft-action="trade">Trade Picks</button>
        <button type="button" data-draft-action="history">View Draft History</button>
      </div>
    </details>
  </div>`;
}

function draftHubNormalizeTabsV3060(page) {
  const tabs = page.querySelector('.asset-tabs-v230');
  if (!tabs) return;

  tabs.querySelector('[data-asset-filter="ALL"]')?.remove();

  const definitions = [
    ['DRAFT', 'Draft Picks', draftHubActiveAssetsV3060().filter((asset) => asset.type === 'DRAFT_PICK').length],
    ['RIGHTS', 'Rights', draftHubActiveAssetsV3060().filter((asset) => ['PROSPECT_RIGHTS', 'PLAYER_RIGHTS'].includes(asset.type)).length],
    ['OTHER', 'Other', draftHubActiveAssetsV3060().filter((asset) => !['DRAFT_PICK', 'PROSPECT_RIGHTS', 'PLAYER_RIGHTS'].includes(asset.type)).length]
  ];

  definitions.forEach(([key, label, count]) => {
    const button = tabs.querySelector(`[data-asset-filter="${key}"]`);
    if (!button) return;
    button.innerHTML = `<span>${escapeHtml(label)}</span><strong class="asset-tab-count-v260">${count}</strong>`;
  });

  tabs.classList.add('draft-hub-tabs-v3060');
}

function draftHubBindActionsV3060(page) {
  page.querySelector('#addAssetBtnV3060')?.addEventListener('click', () => {
    if (typeof openAssetDialog === 'function') openAssetDialog();
  });

  page.querySelectorAll('[data-draft-action]').forEach((button) => {
    button.addEventListener('click', () => {
      button.closest('details')?.removeAttribute('open');
      const action = button.dataset.draftAction;

      if (action === 'draft') {
        if (typeof openTransactionDialog === 'function') openTransactionDialog({ type:'Draft' });
        return;
      }

      if (action === 'trade') {
        if (typeof openTransactionDialog === 'function') openTransactionDialog({ type:'Trade' });
        return;
      }

      if (action === 'history') {
        page.querySelector('#draftHistoryV3060')?.scrollIntoView({ behavior:'smooth', block:'start' });
      }
    });
  });

  page.querySelectorAll('[data-draft-hub-transaction]').forEach((button) => {
    button.addEventListener('click', () => {
      const transactionId = button.dataset.draftHubTransaction;
      if (transactionId && typeof openEditTransactionDialog === 'function') {
        openEditTransactionDialog(transactionId);
      } else if (typeof switchView === 'function') {
        switchView('transactions');
      }
    });
  });

  page.querySelectorAll('[data-draft-hub-transactions]').forEach((button) => {
    button.addEventListener('click', () => {
      if (typeof switchView === 'function') switchView('transactions');
    });
  });
}

function decorateDraftAssetsHubV3060() {
  const page = document.querySelector('#assetsView .assets-page-v230');
  if (!page) return;

  // Draft-first default. Do this only once per application session so user
  // category choices are respected afterward.
  if (!draftAssetsHubDefaultedV3060 && typeof assetFilter !== 'undefined') {
    draftAssetsHubDefaultedV3060 = true;
    if (assetFilter === 'ALL') {
      assetFilter = 'DRAFT';
      renderAssets();
      return;
    }
  }

  page.classList.add('draft-assets-hub-v3060');

  const hero = page.querySelector('.asset-hero-v230');
  const copy = hero?.querySelector('.asset-hero-copy-v230');
  const oldAdd = hero?.querySelector('#addAssetBtn');

  if (copy) {
    const eyebrow = copy.querySelector('.eyebrow');
    const title = copy.querySelector('h3');
    const description = copy.querySelector('p:last-child');
    if (eyebrow) eyebrow.textContent = 'Draft & Assets';
    if (title) title.textContent = 'Draft capital';
    if (description) description.textContent = 'Manage picks, draft activity, rights and future assets.';
  }

  if (hero && !hero.querySelector('.draft-hub-actions-v3060')) {
    oldAdd?.remove();
    hero.insertAdjacentHTML('beforeend', draftHubActionsMarkupV3060());
  }

  draftHubNormalizeTabsV3060(page);

  const isDraftView = typeof assetFilter === 'undefined' || assetFilter === 'DRAFT';

  page.querySelector('#draftCapitalSummaryV3060')?.remove();
  page.querySelector('#draftHubBelowInventoryV3060')?.remove();

  if (isDraftView) {
    const tabs = page.querySelector('.asset-tabs-v230');
    if (tabs) {
      const summary = document.createElement('section');
      summary.id = 'draftCapitalSummaryV3060';
      summary.className = 'draft-capital-summary-v3060';
      summary.innerHTML = `
        <div class="draft-capital-summary-head-v3060">
          <p class="eyebrow">Current draft capital</p>
        </div>
        ${draftHubYearSummaryMarkupV3060()}
      `;
      tabs.insertAdjacentElement('beforebegin', summary);
    }

    const draftPanel = [...page.querySelectorAll('.asset-portfolio-panel-v230')]
      .find((panel) => panel.querySelector('.asset-section-head-v230 h4')?.textContent.trim() === 'Draft Picks');
    const panelTitle = draftPanel?.querySelector('.asset-section-head-v230 h4');
    if (panelTitle) panelTitle.textContent = 'Draft Pick Inventory';

    // V3.06.2: the year row already supplies the useful pick count.
    // Remove the duplicate total-count bubble from the inventory heading.
    draftPanel?.querySelector('.asset-section-head-v230 > span')?.remove();

    const anchor = page.querySelector('.asset-sections-v230') || page.querySelector('.asset-empty-v230') || page.querySelector('#assetStatusEmptyV270');
    if (anchor) {
      const below = document.createElement('div');
      below.id = 'draftHubBelowInventoryV3060';
      below.className = 'draft-hub-below-v3060';
      below.innerHTML = `${draftHubRecentMarkupV3060()}${draftHubHistoryMarkupV3060()}`;
      anchor.insertAdjacentElement('afterend', below);
    }
  }

  draftHubBindActionsV3060(page);
}

function installDraftAssetsHubV3060() {
  if (draftAssetsHubInstalledV3060) return;
  draftAssetsHubInstalledV3060 = true;

  if (typeof renderAssets !== 'function') return;

  const originalRenderAssetsV3060 = renderAssets;
  renderAssets = function() {
    const result = originalRenderAssetsV3060();
    window.requestAnimationFrame(decorateDraftAssetsHubV3060);
    return result;
  };
}

installDraftAssetsHubV3060();
