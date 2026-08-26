'use strict';

// ============================================================================
// RosterCap V3.11.0 — Transactions Action Centre
//
// Transactions now owns front-office actions:
//   Plan a Move
//     - Player Decision -> read-only Decision Centre / canonical transaction flow
//     - Trade Builder   -> established structured Trade transaction form
//     - Record          -> established generic transaction form
//
// History remains the canonical chronological transaction ledger.
//
// This module does not write to Supabase and does not replace any transaction
// RPC. It only provides entry points into established workflows.
// ============================================================================

const ROSTERCAP_TRANSACTION_ACTION_CENTRE_VERSION_V311 = '3.11.0';
let transactionActionCentreInstalledV311 = false;

function transactionActionCentrePageV311() {
  return document.querySelector(
    '#transactionsView .transactions-page-v294, #transactionsView .transactions-page-v228'
  );
}

function transactionActionCentreOpenPlayerDecisionV311() {
  const api = window.RosterCapDecisionCentre;
  if (!api?.openPicker) {
    alert('Player Decisions are still loading. Refresh once and try again.');
    return;
  }
  api.openPicker();
}

function transactionActionCentreOpenTradeV311() {
  if (typeof openTransactionDialog !== 'function') {
    alert('The Trade workflow is unavailable. Refresh once and try again.');
    return;
  }
  openTransactionDialog({ type:'Trade' });
}

function transactionActionCentreOpenRecordV311() {
  if (typeof openTransactionDialog !== 'function') {
    alert('The transaction recorder is unavailable. Refresh once and try again.');
    return;
  }
  openTransactionDialog();
}

function transactionActionCentreMarkupV311() {
  return `
    <section class="transaction-action-centre-v311" id="transactionActionCentreV311">
      <div class="transaction-action-centre-head-v311">
        <div>
          <p class="eyebrow">Plan a move</p>
          <h4>Front Office Actions</h4>
          <p>Preview a player decision, build a structured trade, or record a completed move.</p>
        </div>
        <span class="transaction-action-centre-note-v311">Nothing is recorded until you save a transaction.</span>
      </div>

      <div class="transaction-action-grid-v311">
        <button
          class="transaction-action-card-v311 player"
          id="transactionPlayerDecisionBtnV311"
          type="button"
        >
          <span class="transaction-action-kicker-v311">Player</span>
          <strong>Player Decision</strong>
          <small>Contract & roster options</small>
        </button>

        <button
          class="transaction-action-card-v311 trade"
          id="transactionTradeBuilderBtnV311"
          type="button"
        >
          <span class="transaction-action-kicker-v311">Trade</span>
          <strong>Trade Builder</strong>
          <small>Players, picks & assets</small>
        </button>

        <button
          class="transaction-action-card-v311 record"
          id="transactionRecordMoveBtnV311"
          type="button"
        >
          <span class="transaction-action-kicker-v311">Record</span>
          <strong>Transaction</strong>
          <small>Enter a completed move</small>
        </button>
      </div>
    </section>
  `;
}

function transactionHistoryHeaderMarkupV311() {
  const count = (state.transactions || []).length;
  return `
    <div class="transaction-history-section-head-v311" id="transactionHistorySectionHeadV311">
      <div>
        <p class="eyebrow">History</p>
        <h4>Transaction History</h4>
      </div>
      <span>${count} ${count === 1 ? 'move' : 'moves'}</span>
    </div>
  `;
}

function syncTransactionActionCentreV311() {
  const page = transactionActionCentrePageV311();
  if (!page) return;

  page.classList.add('transactions-action-centre-page-v311');

  const heading = page.querySelector('.tx-page-heading-v294, .tx-page-heading-v228');
  if (!heading) return;

  const pageCopy = heading.querySelector('.page-copy');
  if (pageCopy) {
    pageCopy.textContent =
      'Plan roster, contract and trade moves here, then keep the final record below.';
  }

  // The old header Record button is replaced by the explicit action card.
  const legacyRecordButton = page.querySelector('#recordTransactionBtn');
  if (legacyRecordButton) {
    legacyRecordButton.hidden = true;
    legacyRecordButton.setAttribute('aria-hidden', 'true');
    legacyRecordButton.tabIndex = -1;
  }

  let actionCentre = page.querySelector('#transactionActionCentreV311');
  if (!actionCentre) {
    heading.insertAdjacentHTML('afterend', transactionActionCentreMarkupV311());
    actionCentre = page.querySelector('#transactionActionCentreV311');

    el('transactionPlayerDecisionBtnV311')?.addEventListener(
      'click',
      transactionActionCentreOpenPlayerDecisionV311
    );
    el('transactionTradeBuilderBtnV311')?.addEventListener(
      'click',
      transactionActionCentreOpenTradeV311
    );
    el('transactionRecordMoveBtnV311')?.addEventListener(
      'click',
      transactionActionCentreOpenRecordV311
    );
  }

  page.querySelector('#transactionHistorySectionHeadV311')?.remove();

  const historyHeaderHtml = transactionHistoryHeaderMarkupV311();
  const toolbar = page.querySelector('.tx-history-toolbar-v294');
  const list = page.querySelector('.transaction-list-v228');
  const empty = page.querySelector('.tx-empty-state-v294, .empty-state');

  const historyAnchor = toolbar || list || empty;
  if (historyAnchor) {
    historyAnchor.insertAdjacentHTML('beforebegin', historyHeaderHtml);
  } else {
    actionCentre?.insertAdjacentHTML('afterend', historyHeaderHtml);
  }

  const emptyTitle = page.querySelector('.tx-empty-state-v294 h4');
  if (emptyTitle) emptyTitle.textContent = 'No transaction history yet';

  const emptyCopy = page.querySelector('.tx-empty-state-v294 p');
  if (emptyCopy) {
    emptyCopy.textContent =
      'Completed trades, contracts and roster moves will appear here after you record them.';
  }
}

function installTransactionActionCentreV311() {
  if (transactionActionCentreInstalledV311) return;
  transactionActionCentreInstalledV311 = true;

  if (typeof renderTransactions === 'function') {
    const originalRenderTransactionsV311 = renderTransactions;
    renderTransactions = function(...args) {
      const result = originalRenderTransactionsV311(...args);
      syncTransactionActionCentreV311();
      return result;
    };
  }

  // Handles a page that rendered before this late-loaded feature installed.
  syncTransactionActionCentreV311();

  document.documentElement.dataset.rostercapTransactionActionCentre =
    ROSTERCAP_TRANSACTION_ACTION_CENTRE_VERSION_V311;

  window.RosterCapTransactionActionCentre = Object.freeze({
    version:ROSTERCAP_TRANSACTION_ACTION_CENTRE_VERSION_V311,
    refresh:syncTransactionActionCentreV311
  });
}

installTransactionActionCentreV311();
