'use strict';

// ============================================================================
// RosterCap V2.96 — Contract-aware Signing + Extension transactions
//
// This module is intentionally additive. It loads after pages/transactions.js
// and before app.js, then wraps the established transaction functions.
//
// Signing / Extension now:
// - require a selected current Front Office player
// - collect contract start/end + salary by season
// - save through record_front_office_contract_transaction_v1()
// - update the real contracts / contract_seasons records atomically with ledger
// - reload the Front Office so Roster / Overview / Cap use the new contract
//
// Contract terms are locked while editing an existing transaction. Deleting a
// V2.96 contract-aware transaction uses the dedicated reversal RPC, which only
// restores the prior contract if the current contract still matches the
// transaction's saved "after" snapshot.
// ============================================================================

const ROSTERCAP_CONTRACT_TRANSACTION_VERSION_V296 = 'V2.96.1';

let contractTransactionInstalledV296 = false;
let contractDraftDirtyV296 = false;
let contractAutoSummaryV296 = '';

function isContractTransactionTypeV296(type = el('transactionType')?.value) {
  return type === 'Signing' || type === 'Extension';
}

function contractTransactionSeasonsV296() {
  return typeof contractHorizonSeasons === 'function'
    ? contractHorizonSeasons()
        .slice()
        .sort((a,b) => Number(a.startYear) - Number(b.startYear))
    : [];
}

function contractTransactionPlayerV296() {
  const playerId = el('transactionPlayer')?.value || '';
  return (state.players || []).find((player) => player.id === playerId) || null;
}

function contractSeasonOptionV296(season, selectedId) {
  return `<option value="${escapeAttr(season.id)}" ${season.id === selectedId ? 'selected' : ''}>${escapeHtml(seasonLabel(season.startYear))}</option>`;
}

function ensureContractTransactionUiV296() {
  if (el('transactionContractSectionV296')) return;

  const financialSection = el('transactionFinancialSection');
  const body = financialSection?.parentElement;
  if (!body || !financialSection) return;

  const section = document.createElement('section');
  section.id = 'transactionContractSectionV296';
  section.className = 'transaction-contract-section-v296 hidden';
  section.innerHTML = `
    <div class="transaction-contract-head-v296">
      <div>
        <p class="eyebrow">Contract</p>
        <h4 id="transactionContractTitleV296">New contract</h4>
        <p class="muted" id="transactionContractCopyV296">
          Set the term, starting salary and optional annual percentage change.
        </p>
      </div>
      <span class="transaction-contract-badge-v296" id="transactionContractBadgeV296">Updates Cap</span>
    </div>

    <div class="transaction-contract-lock-v296 hidden" id="transactionContractLockV296">
      This transaction already changed the player's contract. Contract terms are locked while editing the ledger entry.
      Edit the player to change the current contract, or delete this transaction to restore the prior contract when safe.
    </div>

    <div class="transaction-contract-fields-v296" id="transactionContractFieldsV296">
      <div class="transaction-contract-top-grid-v296 transaction-contract-top-grid-v2961">
        <label>
          <span>Starts</span>
          <select id="transactionContractStartV296"></select>
        </label>

        <label>
          <span>Through</span>
          <select id="transactionContractEndV296"></select>
        </label>

        <label>
          <span>Starting salary</span>
          <input
            id="transactionContractAnnualV296"
            inputmode="numeric"
            min="0"
            placeholder="e.g. 6000000"
            step="1"
            type="number"
          />
        </label>

        <label>
          <span>Annual salary change</span>
          <select id="transactionContractChangeModeV296">
            <option value="same">Same salary</option>
            <option value="increase">Increase each year</option>
            <option value="decrease">Decrease each year</option>
          </select>
        </label>

        <label id="transactionContractChangePctLabelV296">
          <span>Change %</span>
          <input
            id="transactionContractChangePctV296"
            inputmode="decimal"
            max="100"
            min="0"
            step="0.01"
            type="number"
            value="0"
          />
        </label>
      </div>

      <div class="transaction-contract-apply-row-v296">
        <button class="btn btn-secondary btn-small" id="transactionContractApplyAnnualV296" type="button">
          Generate contract years
        </button>
        <small id="transactionContractTermSummaryV296"></small>
      </div>

      <div class="transaction-contract-season-grid-v296" id="transactionContractSeasonGridV296"></div>

      <p class="transaction-contract-footnote-v296" id="transactionContractFootnoteV296">
        Salary becomes the cap charge unless a separate cap override is later entered on the player.
      </p>
    </div>
  `;

  body.insertBefore(section, financialSection);

  el('transactionContractStartV296')?.addEventListener('change', () => {
    contractDraftDirtyV296 = true;
    syncContractTermRangeV296({ preserveValues:true });
    updateContractAutoSummaryV296();
  });

  el('transactionContractEndV296')?.addEventListener('change', () => {
    contractDraftDirtyV296 = true;
    syncContractTermRangeV296({ preserveValues:true });
    updateContractAutoSummaryV296();
  });

  el('transactionContractAnnualV296')?.addEventListener('input', () => {
    contractDraftDirtyV296 = true;
    updateContractAutoSummaryV296();
  });

  el('transactionContractChangeModeV296')?.addEventListener('change', () => {
    contractDraftDirtyV296 = true;
    syncContractSalaryChangeControlsV296();
    updateContractAutoSummaryV296();
  });

  el('transactionContractChangePctV296')?.addEventListener('input', () => {
    contractDraftDirtyV296 = true;
    updateContractAutoSummaryV296();
  });

  el('transactionContractApplyAnnualV296')?.addEventListener('click', () => {
    generateContractSalaryScheduleV296();
    updateContractAutoSummaryV296();
  });

  syncContractSalaryChangeControlsV296();
}

function defaultContractStartSeasonV296(type, player, seasons) {
  const current = typeof currentSeason === 'function' ? currentSeason() : null;

  if (type === 'Extension' && player?.contractEndSeasonId) {
    const currentEnd = seasons.find(
      (season) => season.id === player.contractEndSeasonId
    );

    if (currentEnd) {
      const next = seasons.find(
        (season) => Number(season.startYear) > Number(currentEnd.startYear)
      );
      if (next) return next;
    }
  }

  return current && seasons.some((season) => season.id === current.id)
    ? current
    : seasons[0] || null;
}

function renderContractSeasonGridV296(options = {}) {
  const grid = el('transactionContractSeasonGridV296');
  const startSelect = el('transactionContractStartV296');
  const endSelect = el('transactionContractEndV296');
  if (!grid || !startSelect || !endSelect) return;

  const seasons = contractTransactionSeasonsV296();
  const start = seasons.find((season) => season.id === startSelect.value);
  const end = seasons.find((season) => season.id === endSelect.value);
  const priorValues = new Map();

  if (options.preserveValues !== false) {
    grid.querySelectorAll('[data-contract-salary-season-v296]').forEach((input) => {
      priorValues.set(input.dataset.contractSalarySeasonV296, input.value);
    });
  }

  if (!start || !end) {
    grid.innerHTML = '';
    return;
  }

  const range = seasons.filter((season) =>
    Number(season.startYear) >= Number(start.startYear)
    && Number(season.startYear) <= Number(end.startYear)
  );

  grid.innerHTML = range.map((season) => `
    <label class="transaction-contract-season-v296">
      <span>${escapeHtml(seasonLabel(season.startYear))}</span>
      <input
        data-contract-salary-season-v296="${escapeAttr(season.id)}"
        inputmode="numeric"
        min="0"
        placeholder="Salary"
        step="1"
        type="number"
        value="${escapeAttr(priorValues.get(season.id) || '')}"
      />
    </label>
  `).join('');

  grid.querySelectorAll('[data-contract-salary-season-v296]').forEach((input) => {
    input.addEventListener('input', () => {
      contractDraftDirtyV296 = true;
      updateContractAutoSummaryV296();
    });
  });

  const summary = el('transactionContractTermSummaryV296');
  if (summary) {
    summary.textContent = range.length
      ? `${range.length} season${range.length === 1 ? '' : 's'} · ${seasonLabel(start.startYear)} to ${seasonLabel(end.startYear)} · ${contractSalaryChangeDescriptionV296()}`
      : '';
  }
}

function syncContractTermRangeV296(options = {}) {
  const seasons = contractTransactionSeasonsV296();
  const startSelect = el('transactionContractStartV296');
  const endSelect = el('transactionContractEndV296');
  if (!startSelect || !endSelect || !seasons.length) return;

  let start = seasons.find((season) => season.id === startSelect.value) || seasons[0];
  let end = seasons.find((season) => season.id === endSelect.value) || start;

  if (Number(end.startYear) < Number(start.startYear)) {
    end = start;
  }

  const currentEndId = end.id;
  endSelect.innerHTML = seasons
    .filter((season) => Number(season.startYear) >= Number(start.startYear))
    .map((season) => contractSeasonOptionV296(season, currentEndId))
    .join('');

  if (!endSelect.value) endSelect.value = start.id;

  renderContractSeasonGridV296(options);
}

function initializeContractDraftV296(force = false) {
  const type = el('transactionType')?.value;
  if (!isContractTransactionTypeV296(type)) return;

  ensureContractTransactionUiV296();

  const seasons = contractTransactionSeasonsV296();
  const startSelect = el('transactionContractStartV296');
  const endSelect = el('transactionContractEndV296');

  if (!startSelect || !endSelect || !seasons.length) return;
  if (contractDraftDirtyV296 && !force) return;

  const player = contractTransactionPlayerV296();
  const defaultStart = defaultContractStartSeasonV296(type, player, seasons);
  const defaultEnd = defaultStart || seasons[0];

  startSelect.innerHTML = seasons
    .map((season) => contractSeasonOptionV296(season, defaultStart?.id))
    .join('');

  endSelect.innerHTML = seasons
    .filter((season) => !defaultStart || Number(season.startYear) >= Number(defaultStart.startYear))
    .map((season) => contractSeasonOptionV296(season, defaultEnd?.id))
    .join('');

  if (defaultStart) startSelect.value = defaultStart.id;
  if (defaultEnd) endSelect.value = defaultEnd.id;

  const annual = el('transactionContractAnnualV296');
  if (annual) annual.value = '';

  const changeMode = el('transactionContractChangeModeV296');
  if (changeMode) changeMode.value = 'same';

  const changePct = el('transactionContractChangePctV296');
  if (changePct) changePct.value = '0';

  syncContractSalaryChangeControlsV296();
  renderContractSeasonGridV296({ preserveValues:false });
  contractDraftDirtyV296 = false;
  contractAutoSummaryV296 = '';

  updateContractAutoSummaryV296();
}

function syncContractSalaryChangeControlsV296() {
  const mode = el('transactionContractChangeModeV296')?.value || 'same';
  const pctInput = el('transactionContractChangePctV296');
  const pctLabel = el('transactionContractChangePctLabelV296');

  if (pctInput) {
    pctInput.disabled = mode === 'same';
    if (mode === 'same') pctInput.value = '0';
  }

  pctLabel?.classList.toggle('is-disabled-v2961', mode === 'same');
}

function contractSalaryChangeDescriptionV296() {
  const mode = el('transactionContractChangeModeV296')?.value || 'same';
  const pct = Number(el('transactionContractChangePctV296')?.value || 0);

  if (mode === 'same') return 'flat salary';

  const direction = mode === 'increase' ? 'increase' : 'decrease';
  return pct > 0
    ? `${pct}% ${direction} / year`
    : `${direction} / year`;
}

function generateContractSalaryScheduleV296() {
  const annualInput = el('transactionContractAnnualV296');
  const mode = el('transactionContractChangeModeV296')?.value || 'same';
  const pctInput = el('transactionContractChangePctV296');

  if (!annualInput) return;

  const startingSalary = nullableNumber(annualInput.value);

  if (startingSalary === null) {
    alert('Enter a starting salary first.');
    annualInput.focus();
    return;
  }

  if (startingSalary < 0) {
    alert('Salary cannot be negative.');
    annualInput.focus();
    return;
  }

  let pct = 0;

  if (mode !== 'same') {
    pct = Number(pctInput?.value || 0);

    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      alert('Enter an annual salary change between 0% and 100%.');
      pctInput?.focus();
      return;
    }
  }

  const multiplier =
    mode === 'increase'
      ? 1 + (pct / 100)
      : mode === 'decrease'
        ? 1 - (pct / 100)
        : 1;

  document
    .querySelectorAll('#transactionContractSeasonGridV296 [data-contract-salary-season-v296]')
    .forEach((input, index) => {
      const calculated =
        mode === 'same'
          ? startingSalary
          : startingSalary * Math.pow(multiplier, index);

      input.value = String(Math.max(0, Math.round(calculated)));
    });

  contractDraftDirtyV296 = true;
}

function contractSalaryRowsV296() {
  return [...document.querySelectorAll(
    '#transactionContractSeasonGridV296 [data-contract-salary-season-v296]'
  )].map((input) => ({
    season_id:input.dataset.contractSalarySeasonV296,
    salary:nullableNumber(input.value),
    cap_override:null
  }));
}

function validateContractTransactionPayloadV296() {
  const type = el('transactionType')?.value;
  const player = contractTransactionPlayerV296();
  const startId = el('transactionContractStartV296')?.value || '';
  const endId = el('transactionContractEndV296')?.value || '';
  const seasons = contractTransactionSeasonsV296();
  const start = seasons.find((season) => season.id === startId);
  const end = seasons.find((season) => season.id === endId);
  const rows = contractSalaryRowsV296();

  if (!player) {
    throw new Error('Choose the player for this contract transaction.');
  }
  if (!start || !end) {
    throw new Error('Choose the contract start and end seasons.');
  }
  if (Number(end.startYear) < Number(start.startYear)) {
    throw new Error('Contract end season cannot be before the start season.');
  }
  if (!rows.length) {
    throw new Error('Enter at least one contract salary.');
  }
  if (rows.some((row) => row.salary === null)) {
    throw new Error('Enter a salary for every season in the contract term.');
  }
  if (rows.some((row) => Number(row.salary) < 0)) {
    throw new Error('Contract salaries cannot be negative.');
  }

  return {
    type,
    player,
    startId,
    endId,
    start,
    end,
    rows
  };
}

function contractSummarySalaryV296(rows) {
  const values = rows
    .map((row) => row.salary)
    .filter((value) => value !== null && value !== undefined)
    .map(Number);

  if (!values.length) return null;

  const first = values[0];
  return values.every((value) => value === first) ? first : null;
}

function updateContractAutoSummaryV296() {
  if (!isContractTransactionTypeV296()) return;
  if (typeof editingTransactionId !== 'undefined' && editingTransactionId) return;
  if (typeof transactionSummaryTouched !== 'undefined' && transactionSummaryTouched) return;

  const player = contractTransactionPlayerV296();
  const endId = el('transactionContractEndV296')?.value || '';
  const end = contractTransactionSeasonsV296()
    .find((season) => season.id === endId);
  const rows = contractSalaryRowsV296();
  const uniformSalary = contractSummarySalaryV296(rows);
  const startingSalary = nullableNumber(el('transactionContractAnnualV296')?.value);
  const mode = el('transactionContractChangeModeV296')?.value || 'same';
  const pct = Number(el('transactionContractChangePctV296')?.value || 0);
  const type = el('transactionType')?.value;

  if (!player) return;

  const verb = type === 'Extension' ? 'Extended' : 'Signed';

  let salaryText = '';
  if (uniformSalary !== null) {
    salaryText = ` · ${formatMoney(uniformSalary)}`;
  } else if (startingSalary !== null) {
    salaryText = ` · starts at ${formatMoney(startingSalary)}`;
    if (mode !== 'same' && pct > 0) {
      salaryText += ` · ${pct}% ${mode} / year`;
    }
  }

  const endText = end
    ? ` through ${seasonLabel(end.startYear)}`
    : '';

  contractAutoSummaryV296 = `${verb} ${player.name}${salaryText}${endText}`;
  el('transactionSummary').value = contractAutoSummaryV296;
}

function contractTransactionMetadataItemV296(transactionId) {
  return (state.transactionItems || []).find((item) =>
    item.transactionId === transactionId
    && item.kind === 'PLAYER'
    && item.metadata?.contract_transaction_v296 === true
  ) || null;
}

function syncContractTransactionUiV296(options = {}) {
  ensureContractTransactionUiV296();

  const section = el('transactionContractSectionV296');
  if (!section) return;

  const type = el('transactionType')?.value;
  const isContract = isContractTransactionTypeV296(type);
  section.classList.toggle('hidden', !isContract);

  if (!isContract) {
    contractDraftDirtyV296 = false;
    return;
  }

  const editing =
    options.editing === true
    || (typeof editingTransactionId !== 'undefined' && Boolean(editingTransactionId));

  el('transactionContractTitleV296').textContent =
    type === 'Extension' ? 'Extension / re-sign' : 'Signing';

  el('transactionContractCopyV296').textContent =
    type === 'Extension'
      ? 'Set the new term, starting salary and optional annual percentage change. Existing salary seasons before the selected start remain unchanged.'
      : 'Set the contract term, starting salary and optional annual percentage change.';

  el('transactionContractFieldsV296')?.classList.toggle('hidden', editing);
  el('transactionContractLockV296')?.classList.toggle('hidden', !editing);

  if (editing) {
    const notice = el('transactionEditNotice');
    if (notice) {
      notice.textContent =
        'This Signing/Extension already changed the linked player contract. The contract terms are locked while editing. You can edit the ledger notes/summary, edit the player’s current contract separately, or delete this transaction to restore its prior contract only when no later contract change makes that unsafe.';
      notice.classList.remove('hidden');
    }
    return;
  }

  initializeContractDraftV296(options.forceDraft === true);
}

function installContractTransactionFeatureV296() {
  if (contractTransactionInstalledV296) return;
  contractTransactionInstalledV296 = true;

  ensureContractTransactionUiV296();

  if (typeof transactionTypeConfig === 'function') {
    const originalTransactionTypeConfigV296 = transactionTypeConfig;

    transactionTypeConfig = function(type) {
      const config = originalTransactionTypeConfigV296(type);

      if (type === 'Signing') {
        return {
          ...config,
          help:'Choose the player and enter the deal below. Saving this transaction updates the player contract and Cap automatically.',
          player:'required',
          autoSummary:true,
          contract:true
        };
      }

      if (type === 'Extension') {
        return {
          ...config,
          help:'Choose the player and enter the extension/re-sign terms below. Saving updates the future player contract and Cap automatically.',
          player:'required',
          autoSummary:true,
          contract:true
        };
      }

      return config;
    };
  }

  if (typeof autoTransactionSummary === 'function') {
    const originalAutoTransactionSummaryV296 = autoTransactionSummary;

    autoTransactionSummary = function() {
      const result = originalAutoTransactionSummaryV296();
      if (isContractTransactionTypeV296()) updateContractAutoSummaryV296();
      return result;
    };
  }

  if (typeof handleTransactionTypeChange === 'function') {
    const originalHandleTransactionTypeChangeV296 = handleTransactionTypeChange;

    handleTransactionTypeChange = function() {
      contractDraftDirtyV296 = false;
      const result = originalHandleTransactionTypeChangeV296();
      syncContractTransactionUiV296({ forceDraft:true });
      return result;
    };
  }

  if (typeof handleTransactionPlayerChange === 'function') {
    const originalHandleTransactionPlayerChangeV296 = handleTransactionPlayerChange;

    handleTransactionPlayerChange = function() {
      contractDraftDirtyV296 = false;
      const result = originalHandleTransactionPlayerChangeV296();
      if (isContractTransactionTypeV296()) {
        initializeContractDraftV296(true);
        updateContractAutoSummaryV296();
      }
      return result;
    };
  }

  if (typeof resetTransactionEditState === 'function') {
    const originalResetTransactionEditStateV296 = resetTransactionEditState;

    resetTransactionEditState = function() {
      const result = originalResetTransactionEditStateV296();
      contractDraftDirtyV296 = false;
      contractAutoSummaryV296 = '';
      el('transactionContractSectionV296')?.classList.add('hidden');
      el('transactionContractFieldsV296')?.classList.remove('hidden');
      el('transactionContractLockV296')?.classList.add('hidden');
      return result;
    };
  }

  if (typeof openTransactionDialog === 'function') {
    const originalOpenTransactionDialogV296 = openTransactionDialog;

    openTransactionDialog = function(options = {}) {
      contractDraftDirtyV296 = false;
      const result = originalOpenTransactionDialogV296(options);
      syncContractTransactionUiV296({ forceDraft:true });
      return result;
    };
  }

  if (typeof openEditTransactionDialog === 'function') {
    const originalOpenEditTransactionDialogV296 = openEditTransactionDialog;

    openEditTransactionDialog = function(transactionId) {
      const result = originalOpenEditTransactionDialogV296(transactionId);
      const tx = (state.transactions || []).find((item) => item.id === transactionId);

      if (isContractTransactionTypeV296(tx?.type)) {
        syncContractTransactionUiV296({ editing:true });
      }

      return result;
    };
  }

  if (typeof saveTransactionFromDialog === 'function') {
    const originalSaveTransactionFromDialogV296 = saveTransactionFromDialog;

    saveTransactionFromDialog = async function(event) {
      const type = el('transactionType')?.value;
      const txId =
        typeof editingTransactionId !== 'undefined'
          ? editingTransactionId
          : null;

      // Existing ledger edits remain on the established edit RPC. Contract
      // terms are intentionally locked once the transaction has executed.
      if (!isContractTransactionTypeV296(type) || txId) {
        return originalSaveTransactionFromDialogV296(event);
      }

      event.preventDefault();

      let payload;
      try {
        payload = validateContractTransactionPayloadV296();
      } catch (error) {
        alert(error.message);
        return;
      }

      updateContractAutoSummaryV296();

      const summary = el('transactionSummary')?.value.trim() || '';
      if (!summary) {
        alert('A transaction summary is required.');
        return;
      }

      const button = el('saveTransactionBtn');
      if (button?.disabled) return;

      if (button) {
        button.disabled = true;
        button.textContent =
          type === 'Extension'
            ? 'Saving Extension…'
            : 'Saving Signing…';
      }

      try {
        const success = await runCloudAction(async () => {
          const { error } = await db.rpc(
            'record_front_office_contract_transaction_v1',
            {
              p_front_office_id:state.frontOffice.id,
              p_transaction_type:type,
              p_transaction_date:el('transactionDate')?.value || todayIsoDate(),
              p_front_office_player_id:payload.player.id,
              p_contract_start_season_id:payload.startId,
              p_contract_end_season_id:payload.endId,
              p_salary_rows:payload.rows,
              p_summary:summary,
              p_notes:el('transactionNotes')?.value.trim() || null
            }
          );

          if (error) throw error;

          await loadOffice(state.frontOffice.id, false);
        });

        if (success) {
          transactionDialog.close();
          if (typeof resetTransactionEditState === 'function') {
            resetTransactionEditState();
          }
        }
      } finally {
        const currentButton = el('saveTransactionBtn');
        if (currentButton) {
          currentButton.disabled = false;
          currentButton.textContent = 'Save Transaction';
        }
      }
    };
  }

  if (typeof deleteTransaction === 'function') {
    const originalDeleteTransactionV296 = deleteTransaction;

    deleteTransaction = async function(transactionId) {
      const tx = (state.transactions || []).find((item) => item.id === transactionId);
      const contractItem = contractTransactionMetadataItemV296(transactionId);

      if (!tx || !contractItem || !isContractTransactionTypeV296(tx.type)) {
        return originalDeleteTransactionV296(transactionId);
      }

      const confirmed = confirm(
        `Delete “${tx.summary}”?`
        + '\n\nThis contract-aware transaction will also restore the player’s contract to its prior state.'
        + '\n\nThe reversal is blocked automatically if the contract has changed since this transaction.'
      );

      if (!confirmed) return;

      await runCloudAction(async () => {
        const { error } = await db.rpc(
          'delete_front_office_contract_transaction_v1',
          {
            p_front_office_id:state.frontOffice.id,
            p_transaction_id:transactionId
          }
        );

        if (error) throw error;

        await loadOffice(state.frontOffice.id, false);
      });
    };
  }
}

installContractTransactionFeatureV296();

window.RosterCapContractTransactions = Object.freeze({
  version:ROSTERCAP_CONTRACT_TRANSACTION_VERSION_V296,
  sync:syncContractTransactionUiV296
});
