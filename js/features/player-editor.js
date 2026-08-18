'use strict';

// Player, contract and roster-location editor workflow.

function setPlayerSaveStatus(label = '', mode = '') {
  const status = el('playerSaveStatus');
  if (!status) return;
  status.textContent = label;
  status.className = `save-status${mode ? ` ${mode}` : ''}`;
}

function markPlayerDirty() {
  if (!playerDialog.open) return;
  playerFormDirty = true;
  setPlayerSaveStatus('Unsaved changes', 'unsaved');
}

function openPlayerDialog(playerId = null) {
  editingPlayerId = playerId;
  const player = playerId ? state.players.find((p) => p.id === playerId) : null;
  el('playerDialogTitle').textContent = player ? player.name : 'Add Player';
  el('playerDialogIntro').textContent = player
    ? 'Update roster details or contract information. Advanced yearly fields are only needed for exceptions.'
    : 'Add the player first, then use the quick contract fields for the common salary setup. Advanced year-by-year overrides are optional.';
  el('playerName').value = player?.name || '';
  el('playerPosition').value = player?.position || 'C';
  el('playerEligible').value = player?.eligiblePositions || player?.position || '';
  el('realTeam').value = player?.realTeam || '';
  el('playerAge').value = player?.ageSnapshot ?? '';
  el('playerIsProspect').checked = Boolean(player?.isProspect);
  el('playerRosterGroup').value = player?.rosterGroup || 'ACTIVE';
  syncProspectLocationControls();
  el('quickSalary').value = '';
  el('contractYearsRemaining').value = '';
  el('salaryChangeMode').value = 'same';
  el('salaryChangePct').value = '0';
  el('advancedContract').open = false;
  renderStatusOptions(player?.statusId);
  renderContractEditor(player);
  prefillQuickContract(player);
  updateQuickContractControls();
  el('playerNotes').value = player?.notes || '';
  el('deletePlayerBtn').classList.toggle('hidden', !player);
  validatePlayerDialog();
  playerFormDirty = false;
  setPlayerSaveStatus(player ? 'Saved' : 'New player', player ? 'saved' : '');
  playerDialog.showModal();
}

function syncProspectLocationControls() {
  const prospect = Boolean(el('playerIsProspect')?.checked);
  const location = el('playerRosterGroup');
  if (!location) return;
  const farmOption = [...location.options].find((option) => option.value === 'FARM');
  if (farmOption) farmOption.disabled = !prospect;
  if (!prospect && location.value === 'FARM') location.value = 'ACTIVE';
}

function renderStatusOptions(selectedId) {
  el('rosterStatus').innerHTML = state.statuses.map((s) => `<option value="${s.id}" ${s.id === selectedId ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('');
}

function renderContractEditor(player) {
  const sorted = contractHorizonSeasons();
  el('contractGrid').innerHTML = sorted.map((season) => {
    const data = player?.salaries?.[season.id] || { salary: null, capOverride: null };
    return `<div class="contract-row">
      <div class="season-label">${seasonLabel(season.startYear)}</div>
      <label>Salary<input data-contract-salary="${season.id}" type="text" inputmode="numeric" value="${data.salary === null ? '' : escapeAttr(formatWholeDollarValue(data.salary))}" placeholder="Not entered" /></label>
      <label>Cap override<input data-contract-override="${season.id}" type="text" inputmode="numeric" value="${data.capOverride === null ? '' : escapeAttr(formatWholeDollarValue(data.capOverride))}" placeholder="Same as salary" /></label>
    </div>`;
  }).join('');
  el('contractEnd').innerHTML = `<option value="">Not set</option>${sorted.map((s) => `<option value="${s.id}" ${player?.contractEndSeasonId === s.id ? 'selected' : ''}>${seasonLabel(s.startYear)}</option>`).join('')}`;
  document.querySelectorAll('[data-contract-salary], [data-contract-override]').forEach((input) => {
    input.addEventListener('input', validatePlayerDialog);
    input.addEventListener('blur', (event) => formatWholeDollarInput(event.target));
  });
  el('contractEnd').addEventListener('change', validatePlayerDialog);
}

function prefillQuickContract(player) {
  if (!player) return;
  const current = currentSeason();
  const currentSalary = player.salaries?.[current?.id]?.salary ?? null;
  if (currentSalary !== null) el('quickSalary').value = formatWholeDollarValue(currentSalary);
  const end = seasonById(player.contractEndSeasonId);
  if (current && end && end.startYear >= current.startYear) {
    el('contractYearsRemaining').value = Math.min(end.startYear - current.startYear + 1, contractHorizonSeasons().length);
  }
}

function updateQuickContractControls() {
  const same = el('salaryChangeMode').value === 'same';
  el('salaryChangePct').disabled = same;
  el('salaryChangePctLabel').classList.toggle('muted-control', same);
  if (same) el('salaryChangePct').value = '0';
}

function syncContractEndFromYears() {
  const seasons = contractHorizonSeasons();
  const years = nullableInteger(el('contractYearsRemaining').value);
  if (!years || years < 1 || !seasons.length) return;
  const boundedYears = Math.min(years, seasons.length);
  el('contractYearsRemaining').value = String(boundedYears);
  el('contractEnd').value = seasons[boundedYears - 1].id;
}

function applyQuickContract() {
  const amount = nullableNumber(el('quickSalary').value);
  if (amount === null || amount < 0) {
    alert('Enter a valid starting salary first.');
    return;
  }
  const seasons = contractHorizonSeasons();
  if (!seasons.length) {
    alert('No contract seasons are available.');
    return;
  }
  const requestedYears = nullableInteger(el('contractYearsRemaining').value);
  let years = requestedYears;
  if (!years) {
    const selectedEnd = seasonById(el('contractEnd').value);
    years = selectedEnd ? selectedEnd.startYear - seasons[0].startYear + 1 : 1;
  }
  if (years < 1) {
    alert('Years remaining must be at least 1.');
    return;
  }
  years = Math.min(years, seasons.length);
  el('contractYearsRemaining').value = String(years);

  const mode = el('salaryChangeMode').value;
  const pct = mode === 'same' ? 0 : (nullableNumber(el('salaryChangePct').value) ?? 0);
  if (pct < 0 || pct > 100) {
    alert('Annual salary change must be between 0% and 100%.');
    return;
  }
  const direction = mode === 'decrease' ? -1 : mode === 'increase' ? 1 : 0;
  const factor = 1 + (direction * pct / 100);
  const endSeason = seasons[years - 1];
  el('contractEnd').value = endSeason.id;

  document.querySelectorAll('[data-contract-salary]').forEach((input) => {
    const season = seasonById(input.dataset.contractSalary);
    const index = seasons.findIndex((item) => item.id === season?.id);
    if (index >= 0 && index < years) {
      const generated = Math.round(amount * Math.pow(factor, index));
      input.value = formatWholeDollarValue(Math.max(0, generated));
    } else if (index >= years) {
      input.value = '';
    }
  });
  el('quickSalary').value = formatWholeDollarValue(amount);
  validatePlayerDialog();
  markPlayerDirty();
}

async function savePlayerFromDialog(event) {
  event.preventDefault();
  const saveButton = el('savePlayerBtn');
  if (saveButton?.disabled) return;

  const name = el('playerName').value.trim();
  if (!name) return;
  const existingPlayer = editingPlayerId ? state.players.find((player) => player.id === editingPlayerId) : null;
  const salaryRows = state.seasons.map((season) => {
    const salaryInput = document.querySelector(`[data-contract-salary="${season.id}"]`);
    const overrideInput = document.querySelector(`[data-contract-override="${season.id}"]`);
    const existingSalary = existingPlayer?.salaries?.[season.id] || { salary: null, capOverride: null };
    return {
      season_id: season.id,
      salary: salaryInput ? nullableNumber(salaryInput.value) : existingSalary.salary,
      cap_override: overrideInput ? nullableNumber(overrideInput.value) : existingSalary.capOverride
    };
  });

  const frontOfficeId = state.frontOffice?.id;
  if (!frontOfficeId) {
    alert('This Front Office is no longer loaded. Reopen it and try again.');
    return;
  }

  if (saveButton) {
    saveButton.disabled = true;
    saveButton.dataset.originalLabel = saveButton.textContent;
    saveButton.textContent = 'Saving…';
    setPlayerSaveStatus('Saving…', 'saving');
  }

  try {
    const saved = await runCloudAction(async () => {
      const previousGroup = existingPlayer?.rosterGroup || 'ACTIVE';
      const desiredGroup = el('playerRosterGroup').value || 'ACTIVE';
      const desiredProspect = el('playerIsProspect').checked;
      if (desiredGroup === 'FARM' && !desiredProspect) throw new Error('Only players labelled Prospect can be assigned to Minors.');
      const { data: savedPlayerId, error } = await db.rpc('save_front_office_player_v2', {
        p_front_office_id: frontOfficeId,
        p_front_office_player_id: editingPlayerId || null,
        p_player_name: name,
        p_position: el('playerPosition').value,
        p_eligible_positions: normalizeEligibility(el('playerEligible').value) || el('playerPosition').value,
        p_real_team: normalizeNhlTeam(el('realTeam').value),
        p_age_snapshot: nullableInteger(el('playerAge').value),
        p_age_as_of: nullableInteger(el('playerAge').value) === null ? null : todayIsoDate(),
        p_roster_status_id: el('rosterStatus').value,
        p_contract_end_season_id: el('contractEnd').value || null,
        p_notes: el('playerNotes').value.trim() || null,
        p_salary_rows: salaryRows,
        p_source_system: null,
        p_source_player_id: null,
        p_source_player_name: null
      });
      if (error) throw error;
      const playerId = savedPlayerId || editingPlayerId;
      if (!playerId) throw new Error('Player save did not return a player ID.');

      if (previousGroup === 'FARM' && desiredGroup === 'ACTIVE') {
        const { error: moveError } = await db.rpc('record_front_office_transaction_v2', {
          p_front_office_id: frontOfficeId,
          p_transaction_type: 'Call Up',
          p_transaction_date: todayIsoDate(),
          p_counterparty: null,
          p_summary: `${name} called up to the active roster`,
          p_notes: null,
          p_in_items: [], p_out_items: [],
          p_front_office_player_id: playerId,
          p_roster_action: 'CALL_UP',
          p_roster_status_id: el('rosterStatus').value || null,
              p_adjustment_description: null,
          p_adjustment_rows: []
        });
        if (moveError) throw moveError;
      }

      const { error: prospectError } = await db.rpc('set_front_office_player_prospect_v1', {
        p_front_office_id: frontOfficeId,
        p_front_office_player_id: playerId,
        p_is_prospect: desiredProspect
      });
      if (prospectError) throw prospectError;

      if (desiredGroup === 'FARM' && previousGroup !== 'FARM') {
        const { error: moveError } = await db.rpc('record_front_office_transaction_v2', {
          p_front_office_id: frontOfficeId,
          p_transaction_type: 'Send Down',
          p_transaction_date: todayIsoDate(),
          p_counterparty: null,
          p_summary: `${name} assigned to Minors`,
          p_notes: null,
          p_in_items: [], p_out_items: [],
          p_front_office_player_id: playerId,
          p_roster_action: 'SEND_TO_FARM',
          p_roster_status_id: el('rosterStatus').value || null,
              p_adjustment_description: null,
          p_adjustment_rows: []
        });
        if (moveError) throw moveError;
      }

      await loadOffice(frontOfficeId, false);
    });
    if (saved) {
      playerFormDirty = false;
      setPlayerSaveStatus('Saved', 'saved');
      playerDialog.close();
    } else {
      setPlayerSaveStatus('Save failed', 'error');
    }
  } finally {
    if (saveButton) {
      saveButton.disabled = false;
      saveButton.textContent = saveButton.dataset.originalLabel || 'Save Player';
      delete saveButton.dataset.originalLabel;
    }
  }
}

function validatePlayerDialog() {
  const endId = el('contractEnd').value;
  const warnings = [];
  if (endId) {
    const end = seasonById(endId);
    document.querySelectorAll('[data-contract-salary]').forEach((input) => {
      const s = seasonById(input.dataset.contractSalary);
      if (s.startYear <= end.startYear && nullableNumber(input.value) === null) warnings.push(`Missing salary for ${seasonLabel(s.startYear)}.`);
      if (s.startYear > end.startYear && nullableNumber(input.value) !== null) warnings.push(`Salary exists after contract end in ${seasonLabel(s.startYear)}.`);
    });
  }
  const box = el('playerWarnings');
  box.classList.toggle('hidden', warnings.length === 0);
  box.innerHTML = warnings.length ? `<strong>Review:</strong><br>${warnings.map(escapeHtml).join('<br>')}` : '';
}

async function removeEditingPlayer() {
  const player = state.players.find((p) => p.id === editingPlayerId);
  if (!player) return;
  if (!confirm(`Remove ${player.name} from this Front Office? Their historical database record will be archived.`)) return;
  await runCloudAction(async () => {
    const { error } = await db.rpc('remove_front_office_player_v1', {
      p_front_office_id: state.frontOffice.id,
      p_front_office_player_id: editingPlayerId
    });
    if (error) throw error;
    playerDialog.close();
    await loadOffice(state.frontOffice.id, false);
  });
}
