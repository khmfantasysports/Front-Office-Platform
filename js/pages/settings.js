'use strict';

let settingsOpenDisclosureKeys = new Set();
const settingsSectionFeedback = new Map();

function settingsDisclosureKey(detail) {
  if (!detail) return '';
  const explicitKey = detail.dataset?.settingsSection;
  if (explicitKey) return explicitKey;
  return (detail.querySelector('summary')?.textContent || '').replace(/\s+/g, ' ').trim();
}

function rememberOpenSettingsDisclosures() {
  const view = el('settingsView');
  if (!view) return;
  const disclosures = [...view.querySelectorAll('details')];
  if (!disclosures.length) return;
  settingsOpenDisclosureKeys = new Set(
    disclosures
      .filter((detail) => detail.open)
      .map(settingsDisclosureKey)
      .filter(Boolean)
  );
}

function restoreOpenSettingsDisclosures() {
  const view = el('settingsView');
  if (!view) return;

  view.querySelectorAll('details').forEach((detail) => {
    const key = settingsDisclosureKey(detail);
    detail.open = Boolean(key && settingsOpenDisclosureKeys.has(key));

    detail.addEventListener('toggle', () => {
      const currentKey = settingsDisclosureKey(detail);
      if (!currentKey) return;
      if (detail.open) settingsOpenDisclosureKeys.add(currentKey);
      else settingsOpenDisclosureKeys.delete(currentKey);
    });
  });
}

function settingsFeedbackMarkup(sectionKey, idleLabel = 'Auto-save') {
  const feedback = settingsSectionFeedback.get(sectionKey) || { mode:'idle', label:idleLabel };
  return `<span class="settings-save-status ${escapeAttr(feedback.mode || 'idle')}" data-settings-save-status="${escapeAttr(sectionKey)}" aria-live="polite">${escapeHtml(feedback.label || idleLabel)}</span>`;
}

function setSettingsSectionFeedback(sectionKey, mode, label) {
  settingsSectionFeedback.set(sectionKey, { mode, label });
  const node = document.querySelector(`[data-settings-save-status="${sectionKey}"]`);
  if (!node) return;
  node.className = `settings-save-status ${mode || 'idle'}`;
  node.textContent = label || '';
}

async function saveSettingsChange(sectionKey, action, options = {}) {
  const savingLabel = options.savingLabel || 'Saving…';
  const successLabel = options.successLabel || 'Saved';
  const errorLabel = options.errorLabel || 'Save failed';

  setSettingsSectionFeedback(sectionKey, 'saving', savingLabel);
  const success = await runCloudAction(action);
  setSettingsSectionFeedback(sectionKey, success ? 'saved' : 'error', success ? successLabel : errorLabel);
  return success;
}

function settingsRosterAndCapSnapshot() {
  const current = currentSeason();
  const horizon = contractHorizonSeasons();
  const future = current ? horizon.filter((season) => season.startYear > current.startYear) : [];
  const active = state.players.filter((player) => (player.rosterGroup || 'ACTIVE') === 'ACTIVE');
  const minors = state.players.filter((player) => (player.rosterGroup || 'ACTIVE') === 'FARM');
  const capCountingStatuses = state.statuses.filter((status) => status.countsTowardCap);
  const currentCalc = current ? calculateSeason(current.id) : null;

  const futureCapsEntered = future.filter((season) => season.salaryCap !== null && season.salaryCap !== undefined).length;
  const missingFutureCaps = Math.max(0, future.length - futureCapsEntered);

  const futureContractGapPlayers = current ? state.players.filter((player) => {
    const endSeason = seasonById(player.contractEndSeasonId);
    if (!endSeason || endSeason.startYear <= current.startYear) return false;
    return future.some((season) =>
      season.startYear <= endSeason.startYear &&
      effectivePlayerCharge(player, season.id) === null
    );
  }) : [];

  return {
    current,
    horizon,
    future,
    active,
    minors,
    capCountingStatuses,
    currentCalc,
    futureCapsEntered,
    missingFutureCaps,
    futureContractGapPlayers
  };
}

function settingsLimitDisplay(count, limit) {
  return limit === null || limit === undefined ? `${count} · no limit` : `${count} / ${limit}`;
}

function settingsRosterSummaryMarkup(snapshot) {
  const rosterLimit = state.frontOffice.rosterLimit;
  const minorsLimit = state.frontOffice.minorsLimit;
  const activeOver = rosterLimit !== null && rosterLimit !== undefined && snapshot.active.length > rosterLimit;
  const minorsOver = minorsLimit !== null && minorsLimit !== undefined && snapshot.minors.length > minorsLimit;

  return `<div class="settings-summary-grid settings-summary-grid-roster">
    <div class="settings-summary-item ${activeOver ? 'warning' : ''}"><span>Active roster</span><strong>${escapeHtml(settingsLimitDisplay(snapshot.active.length, rosterLimit))}</strong></div>
    <div class="settings-summary-item ${minorsOver ? 'warning' : ''}"><span>Minors</span><strong>${escapeHtml(settingsLimitDisplay(snapshot.minors.length, minorsLimit))}</strong></div>
    <div class="settings-summary-item"><span>Cap-counting statuses</span><strong>${snapshot.capCountingStatuses.length} / ${state.statuses.length}</strong></div>
    <div class="settings-summary-item good"><span>Minors cap treatment</span><strong>Excluded</strong></div>
  </div>`;
}

function settingsCapSummaryMarkup(snapshot) {
  const calc = snapshot.currentCalc;
  const currentCap = calc?.salaryCap === null || calc?.salaryCap === undefined ? 'Not set' : formatMoney(calc.salaryCap);
  const currentUsed = !calc ? '—' : calc.complete ? formatMoney(calc.capUsed) : `${formatMoney(calc.knownCapUsed)} known`;
  const capTone = calc && calc.salaryCap !== null && calc.complete && calc.capSpace < 0 ? 'warning' : '';

  return `<div class="settings-summary-grid settings-summary-grid-cap">
    <div class="settings-summary-item"><span>Current cap</span><strong>${escapeHtml(currentCap)}</strong></div>
    <div class="settings-summary-item ${capTone}"><span>Current cap used</span><strong>${escapeHtml(currentUsed)}</strong></div>
    <div class="settings-summary-item"><span>Future caps entered</span><strong>${snapshot.futureCapsEntered} / ${snapshot.future.length}</strong></div>
    <div class="settings-summary-item ${snapshot.missingFutureCaps ? 'warning' : 'good'}"><span>Future caps missing</span><strong>${snapshot.missingFutureCaps}</strong></div>
  </div>`;
}

function settingsDataHealthMarkup(snapshot) {
  const currentMissing = snapshot.currentCalc?.missingPlayerIds?.length || 0;
  const futureGapCount = snapshot.futureContractGapPlayers.length;
  const healthIssueCount = currentMissing + futureGapCount + snapshot.missingFutureCaps;
  const healthLabel = healthIssueCount ? 'Review recommended' : 'Looks complete';

  return `<section class="settings-health-panel ${healthIssueCount ? 'has-warning' : 'is-good'}" aria-label="Front Office data health">
    <div class="settings-health-head">
      <div><span>Data health</span><strong>${escapeHtml(healthLabel)}</strong></div>
      <span class="settings-health-badge">${state.players.length} players</span>
    </div>
    <div class="settings-health-grid">
      <div><span>Active</span><strong>${snapshot.active.length}</strong></div>
      <div><span>Minors</span><strong>${snapshot.minors.length}</strong></div>
      <div class="${currentMissing ? 'warning' : ''}"><span>Missing current salary</span><strong>${currentMissing}</strong></div>
      <div class="${futureGapCount ? 'warning' : ''}"><span>Future contract gaps</span><strong>${futureGapCount}</strong></div>
    </div>
    <p>Current-salary gaps only include players who are eligible to count toward cap. Minors are excluded from cap health.</p>
  </section>`;
}

function currentSeasonControlMarkup(snapshot) {
  const options = [...state.seasons]
    .sort((a,b) => a.startYear - b.startYear)
    .map((season) => `<option value="${season.id}" ${season.id === state.frontOffice.currentSeasonId ? 'selected' : ''}>${escapeHtml(seasonLabel(season.startYear))}</option>`)
    .join('');

  return `<div class="settings-current-season-control">
    <label>Current season
      <select id="settingsCurrentSeasonSelect">${options}</select>
    </label>
    <button id="setCurrentSeasonBtn" class="btn btn-secondary btn-small" type="button" disabled>Set Current</button>
    <small>Changes the active season and rolling cap/contract horizon. Historical season data is kept.</small>
  </div>`;
}

// League, roster, cap and transaction-rule settings.
function renderSettings() {
  rememberOpenSettingsDisclosures();
  const snapshot = settingsRosterAndCapSnapshot();
  const horizonSeasons = snapshot.horizon;

  const seasonSettings = horizonSeasons.map((s) => {
    const stateLabel = s.id === state.frontOffice.currentSeasonId ? 'Current' : (s.salaryCap === null ? 'Unset' : 'Set');
    return `<div class="compact-cap-row" data-season-setting="${s.id}"><div class="season-name">${seasonLabel(s.startYear)}</div><label><input data-season-cap="${s.id}" type="number" step="1" value="${s.salaryCap ?? ''}" placeholder="Salary cap" /></label><div class="cap-state">${stateLabel}</div></div>`;
  }).join('');

  const statusSettings = state.statuses.map((s) => `<div class="status-setting-compact" data-status-setting="${s.id}"><input data-status-name="${s.id}" value="${escapeAttr(s.name)}" aria-label="Status name" /><select data-status-cap="${s.id}" aria-label="Cap rule for ${escapeAttr(s.name)}"><option value="true" ${s.countsTowardCap ? 'selected' : ''}>Counts toward cap</option><option value="false" ${!s.countsTowardCap ? 'selected' : ''}>Does not count</option></select><button class="btn btn-ghost btn-small" data-remove-status="${s.id}" type="button">×</button></div>`).join('');

  el('settingsView').innerHTML = `<div class="settings-accordion">
    ${renderTeamIdentitySettings()}

    <details class="settings-disclosure" data-settings-section="team-league">
      <summary><span class="settings-disclosure-title"><strong>Team & League</strong><span>Name, roster limits, season and currency</span></span>${settingsFeedbackMarkup('team-league')}</summary>
      <div class="settings-disclosure-body">
        <div class="settings-fields">
          <label>Team name<input data-office-team type="text" value="${escapeAttr(state.frontOffice.teamName)}" /></label>
          <label>League name<input data-office-league type="text" value="${escapeAttr(state.frontOffice.leagueName)}" /></label>
          <label>Active roster limit<input data-office-roster-limit type="number" min="0" step="1" value="${state.frontOffice.rosterLimit ?? ''}" /></label>
          <label>Max Minors spots<input data-office-minors-limit type="number" min="0" step="1" value="${state.frontOffice.minorsLimit ?? ''}" placeholder="No limit" /></label>
          <label>Currency<input data-office-currency type="text" maxlength="3" value="${escapeAttr(state.frontOffice.currency || 'USD')}" /></label>
        </div>
        ${currentSeasonControlMarkup(snapshot)}
        <div class="settings-context-strip">
          <div class="settings-context-item"><span>Sport</span><strong>${escapeHtml(state.frontOffice.sport || 'NHL')}</strong></div>
          <div class="settings-context-item"><span>Current season</span><strong>${escapeHtml(seasonLabel(snapshot.current?.startYear))}</strong></div>
        </div>
      </div>
    </details>

    <details class="settings-disclosure" data-settings-section="roster-rules">
      <summary><span class="settings-disclosure-title"><strong>Roster Rules</strong><span>Status names and cap treatment</span></span>${settingsFeedbackMarkup('roster-rules')}</summary>
      <div class="settings-disclosure-body">
        ${settingsRosterSummaryMarkup(snapshot)}
        <div class="settings-card-head"><p class="settings-card-copy">Status cap rules apply to Active-roster players. Players in Minors are excluded from cap regardless of roster status.</p><button id="addStatusBtn" class="btn btn-secondary btn-small" type="button">+ Add Status</button></div>
        <div class="status-settings-list">${statusSettings}</div>
      </div>
    </details>

    <details class="settings-disclosure" data-settings-section="salary-caps">
      <summary><span class="settings-disclosure-title"><strong>Salary Caps</strong><span>Current + six future seasons</span></span>${settingsFeedbackMarkup('salary-caps')}</summary>
      <div class="settings-disclosure-body">
        ${settingsCapSummaryMarkup(snapshot)}
        <p class="settings-card-copy">Leave future caps blank until your league confirms them.</p>
        <div class="cap-settings-list">${seasonSettings}</div>
      </div>
    </details>

    <details class="settings-disclosure" data-settings-section="transaction-rules">
      <summary><span class="settings-disclosure-title"><strong>Transaction Rules</strong><span>Automate waiver and buyout penalties</span></span>${settingsFeedbackMarkup('transaction-rules', 'Manual save')}</summary>
      <div class="settings-disclosure-body">
        <p class="settings-card-copy">These are league settings, not NHL rules. Choose how your league handles each penalty. Full Salary and Half Salary are included as quick options.</p>
        <div class="transaction-rule-settings">
          <div class="transaction-rule-card"><div><h4>Waiver penalty</h4><p>Applied automatically when you record a Waiver transaction.</p></div><label>Penalty method<select id="waiverPenaltyMode"><option value="NONE">No automatic penalty</option><option value="FULL_SALARY">Full salary (100%)</option><option value="HALF_SALARY">Half salary (50%)</option><option value="CUSTOM_PERCENT">Custom percentage</option><option value="FLAT_AMOUNT">Flat amount</option></select></label><label>Applies to<select id="waiverPenaltyScope"><option value="CURRENT_SEASON">Current season only</option><option value="REMAINING_CONTRACT">Remaining contract years</option></select></label><label id="waiverPenaltyValueWrap" class="transaction-rule-value-wrap">Custom value<input id="waiverPenaltyValue" type="number" min="0" step="0.01" placeholder="50 or 2000000" /></label></div>
          <div class="transaction-rule-card"><div><h4>Buyout penalty</h4><p>Applied automatically when you record a Buyout transaction.</p></div><label>Penalty method<select id="buyoutPenaltyMode"><option value="NONE">No automatic penalty</option><option value="FULL_SALARY">Full salary (100%)</option><option value="HALF_SALARY">Half salary (50%)</option><option value="CUSTOM_PERCENT">Custom percentage</option><option value="FLAT_AMOUNT">Flat amount</option></select></label><label>Applies to<select id="buyoutPenaltyScope"><option value="CURRENT_SEASON">Current season only</option><option value="REMAINING_CONTRACT">Remaining contract years</option></select></label><label id="buyoutPenaltyValueWrap" class="transaction-rule-value-wrap">Custom value<input id="buyoutPenaltyValue" type="number" min="0" step="0.01" placeholder="50 or 2000000" /></label></div>
        </div>
        <div class="transaction-rules-footer"><span>For Custom Percentage, enter 0–100. For Flat Amount, enter the dollar penalty per affected season.</span><button id="saveTransactionRulesBtn" class="btn btn-primary btn-small" type="button">Save Transaction Rules</button></div>
      </div>
    </details>

    <details class="settings-disclosure" data-settings-section="data-export">
      <summary><span class="settings-disclosure-title"><strong>Data & Export</strong><span>Health, refresh, Fantrax import and backups</span></span>${settingsFeedbackMarkup('data-export', 'Ready')}</summary>
      <div class="settings-disclosure-body">
        ${settingsDataHealthMarkup(snapshot)}
        <p class="settings-card-copy">Refresh reloads the latest saved Front Office data from the cloud. Fantrax imports can refresh roster identity and current salary without touching future contracts.</p>
        <div class="settings-data-actions"><button id="settingsRefreshBtn" class="btn btn-secondary" type="button">Refresh Front Office</button><button id="settingsImportBtn" class="btn btn-secondary" type="button">Import Fantrax / CSV</button><button id="settingsExportBtn" class="btn btn-secondary" type="button">Export CSV</button></div>
      </div>
    </details>

    <details class="settings-disclosure settings-danger-zone" data-settings-section="danger-zone">
      <summary><span class="settings-disclosure-title"><strong>Danger Zone</strong><span>Permanent Front Office actions</span></span></summary>
      <div class="settings-disclosure-body settings-danger-zone-body">
        <div class="settings-danger-copy">
          <strong>Delete this Front Office</strong>
          <p>Permanently removes this Front Office and its roster, contracts, assets, transactions and cap history. You will still have to type the team name exactly before deletion is allowed.</p>
        </div>
        <button id="settingsDeleteFrontOfficeBtn" class="btn btn-danger settings-danger-button" type="button">Delete Front Office</button>
      </div>
    </details>
  </div>`;

  restoreOpenSettingsDisclosures();
  bindTeamIdentitySettings();

  el('waiverPenaltyMode').value = state.frontOffice.waiverPenaltyMode || 'NONE';
  el('waiverPenaltyScope').value = state.frontOffice.waiverPenaltyScope || 'CURRENT_SEASON';
  el('waiverPenaltyValue').value = state.frontOffice.waiverPenaltyValue ?? '';
  el('buyoutPenaltyMode').value = state.frontOffice.buyoutPenaltyMode || 'NONE';
  el('buyoutPenaltyScope').value = state.frontOffice.buyoutPenaltyScope || 'REMAINING_CONTRACT';
  el('buyoutPenaltyValue').value = state.frontOffice.buyoutPenaltyValue ?? '';

  const updatePenaltyValueVisibility = () => {
    ['waiver','buyout'].forEach((prefix) => {
      const mode = el(`${prefix}PenaltyMode`).value;
      const wrap = el(`${prefix}PenaltyValueWrap`);
      wrap.classList.toggle('hidden', !['CUSTOM_PERCENT','FLAT_AMOUNT'].includes(mode));
      const input = el(`${prefix}PenaltyValue`);
      input.placeholder = mode === 'CUSTOM_PERCENT' ? 'e.g. 50' : 'e.g. 2000000';
    });
  };

  el('waiverPenaltyMode').addEventListener('change', updatePenaltyValueVisibility);
  el('buyoutPenaltyMode').addEventListener('change', updatePenaltyValueVisibility);
  updatePenaltyValueVisibility();

  el('saveTransactionRulesBtn').addEventListener('click', saveTransactionRuleSettings);

  document.querySelectorAll('[data-office-team]').forEach((input) => input.addEventListener('change', async () => {
    const value = input.value.trim() || state.frontOffice.teamName;
    const success = await saveSettingsChange('team-league', async () => {
      const { error } = await db.from('front_offices').update({ team_name:value }).eq('front_office_id', state.frontOffice.id);
      if (error) throw error;
      state.frontOffice.teamName = value;
    });
    if (success) render();
  }));

  document.querySelectorAll('[data-office-league]').forEach((input) => input.addEventListener('change', async () => {
    const value = input.value.trim() || state.frontOffice.leagueName;
    const success = await saveSettingsChange('team-league', async () => {
      const { error } = await db.from('front_offices').update({ league_name:value }).eq('front_office_id', state.frontOffice.id);
      if (error) throw error;
      state.frontOffice.leagueName = value;
    });
    if (success) render();
  }));

  document.querySelectorAll('[data-office-roster-limit]').forEach((input) => input.addEventListener('change', async () => {
    const value = nullableInteger(input.value);
    const success = await saveSettingsChange('team-league', async () => {
      const { error } = await db.from('front_offices').update({ roster_limit:value }).eq('front_office_id', state.frontOffice.id);
      if (error) throw error;
      state.frontOffice.rosterLimit = value;
    });
    if (success) render();
  }));

  document.querySelectorAll('[data-office-minors-limit]').forEach((input) => input.addEventListener('change', async () => {
    const value = nullableInteger(input.value);
    if (String(input.value).trim() !== '' && value === null) {
      alert('Max Minors spots must be a whole number of 0 or greater.');
      render();
      return;
    }
    const success = await saveSettingsChange('team-league', async () => {
      const { error } = await db.from('front_offices').update({ minors_limit:value }).eq('front_office_id', state.frontOffice.id);
      if (error) throw error;
      state.frontOffice.minorsLimit = value;
    });
    if (success) render();
  }));

  document.querySelectorAll('[data-office-currency]').forEach((input) => input.addEventListener('change', async () => {
    const value = input.value.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(value)) {
      alert('Currency must use a three-letter code such as USD or CAD.');
      render();
      return;
    }
    const success = await saveSettingsChange('team-league', async () => {
      const { error } = await db.from('front_offices').update({ currency_code:value }).eq('front_office_id', state.frontOffice.id);
      if (error) throw error;
      state.frontOffice.currency = value;
    });
    if (success) render();
  }));

  document.querySelectorAll('[data-season-cap]').forEach((input) => input.addEventListener('change', async () => {
    const value = nullableNumber(input.value);
    const success = await saveSettingsChange('salary-caps', async () => {
      const { error } = await db.from('front_office_seasons').update({ salary_cap:value }).eq('front_office_id', state.frontOffice.id).eq('front_office_season_id', input.dataset.seasonCap);
      if (error) throw error;
      seasonById(input.dataset.seasonCap).salaryCap = value;
    });
    if (success) render();
  }));

  document.querySelectorAll('[data-status-name]').forEach((input) => input.addEventListener('change', async () => {
    const name = input.value.trim() || 'Status';
    const success = await saveSettingsChange('roster-rules', async () => {
      const { error } = await db.from('front_office_roster_statuses').update({ status_name:name }).eq('front_office_id', state.frontOffice.id).eq('roster_status_id', input.dataset.statusName);
      if (error) throw error;
      statusById(input.dataset.statusName).name = name;
    });
    if (success) render();
  }));

  document.querySelectorAll('[data-status-cap]').forEach((select) => select.addEventListener('change', async () => {
    const counts = select.value === 'true';
    const success = await saveSettingsChange('roster-rules', async () => {
      const { error } = await db.from('front_office_roster_statuses').update({ counts_toward_cap:counts }).eq('front_office_id', state.frontOffice.id).eq('roster_status_id', select.dataset.statusCap);
      if (error) throw error;
      statusById(select.dataset.statusCap).countsTowardCap = counts;
    });
    if (success) render();
  }));

  document.querySelectorAll('[data-remove-status]').forEach((button) => button.addEventListener('click', () => removeStatus(button.dataset.removeStatus)));
  el('addStatusBtn').addEventListener('click', addStatus);

  const currentSeasonSelect = el('settingsCurrentSeasonSelect');
  const setCurrentSeasonBtn = el('setCurrentSeasonBtn');
  currentSeasonSelect.addEventListener('change', () => {
    setCurrentSeasonBtn.disabled = currentSeasonSelect.value === state.frontOffice.currentSeasonId;
  });
  setCurrentSeasonBtn.addEventListener('click', setCurrentSeasonFromSettings);

  el('settingsRefreshBtn').addEventListener('click', refreshCurrentFrontOfficeData);
  el('settingsImportBtn').addEventListener('click', openImportDialog);
  el('settingsExportBtn').addEventListener('click', exportRosterCsv);
  el('settingsDeleteFrontOfficeBtn').addEventListener('click', deleteFrontOfficeFromSettings);
}

async function setCurrentSeasonFromSettings() {
  const seasonId = el('settingsCurrentSeasonSelect')?.value;
  const season = seasonById(seasonId);
  if (!season || seasonId === state.frontOffice.currentSeasonId) return;

  const confirmed = confirm(`Set ${seasonLabel(season.startYear)} as the current season?\n\nThis changes the active cap and contract-planning horizon. Existing historical season data is kept.`);
  if (!confirmed) {
    renderSettings();
    return;
  }

  const button = el('setCurrentSeasonBtn');
  if (button) {
    button.disabled = true;
    button.textContent = 'Setting…';
  }

  const frontOfficeId = state.frontOffice.id;
  const success = await saveSettingsChange('team-league', async () => {
    const { error } = await db.rpc('set_current_front_office_season_v2', {
      p_front_office_id: frontOfficeId,
      p_front_office_season_id: seasonId
    });
    if (error) throw error;
    await loadOffice(frontOfficeId, false);
    if (state.frontOffice?.currentSeasonId !== seasonId) {
      throw new Error('The current season was saved, but the Front Office did not reload the new season correctly.');
    }
  }, { savingLabel:'Changing season…', successLabel:'Season updated' });

  if (!success && el('setCurrentSeasonBtn')) {
    el('setCurrentSeasonBtn').disabled = false;
    el('setCurrentSeasonBtn').textContent = 'Set Current';
  }
}

async function refreshCurrentFrontOfficeData() {
  const frontOfficeId = state.frontOffice?.id;
  const button = el('settingsRefreshBtn');
  if (!frontOfficeId || !button || button.disabled) return;

  button.disabled = true;
  button.textContent = 'Refreshing…';
  setCloudStatus('Refreshing…', 'busy');
  setSettingsSectionFeedback('data-export', 'saving', 'Refreshing…');

  try {
    await loadOffice(frontOfficeId, false);
    if (el('cloudStatus')?.classList.contains('error')) {
      setSettingsSectionFeedback('data-export', 'error', 'Refresh failed');
      return;
    }
    setSettingsSectionFeedback('data-export', 'saved', 'Refreshed');
  } catch (error) {
    console.error('Front Office refresh failed', error);
    setCloudStatus('Refresh error', 'error');
    setSettingsSectionFeedback('data-export', 'error', 'Refresh failed');
    alert(error?.message || 'Unable to refresh Front Office data.');
  } finally {
    const currentButton = el('settingsRefreshBtn');
    if (currentButton) {
      currentButton.disabled = false;
      currentButton.textContent = 'Refresh Front Office';
    }
  }
}

async function deleteFrontOfficeFromSettings() {
  const button = el('settingsDeleteFrontOfficeBtn');
  if (!button || button.disabled) return;
  button.disabled = true;
  try {
    await deleteCurrentFrontOffice();
  } finally {
    const currentButton = el('settingsDeleteFrontOfficeBtn');
    if (currentButton) currentButton.disabled = false;
  }
}

async function saveTransactionRuleSettings() {
  const waiverMode = el('waiverPenaltyMode').value;
  const waiverScope = el('waiverPenaltyScope').value;
  const waiverValue = ['CUSTOM_PERCENT','FLAT_AMOUNT'].includes(waiverMode) ? nullableNumber(el('waiverPenaltyValue').value) : null;
  const buyoutMode = el('buyoutPenaltyMode').value;
  const buyoutScope = el('buyoutPenaltyScope').value;
  const buyoutValue = ['CUSTOM_PERCENT','FLAT_AMOUNT'].includes(buyoutMode) ? nullableNumber(el('buyoutPenaltyValue').value) : null;

  if (waiverMode === 'CUSTOM_PERCENT' && (waiverValue === null || waiverValue < 0 || waiverValue > 100)) { alert('Waiver custom percentage must be between 0 and 100.'); return; }
  if (buyoutMode === 'CUSTOM_PERCENT' && (buyoutValue === null || buyoutValue < 0 || buyoutValue > 100)) { alert('Buyout custom percentage must be between 0 and 100.'); return; }
  if (waiverMode === 'FLAT_AMOUNT' && (waiverValue === null || waiverValue < 0)) { alert('Enter a valid waiver flat amount.'); return; }
  if (buyoutMode === 'FLAT_AMOUNT' && (buyoutValue === null || buyoutValue < 0)) { alert('Enter a valid buyout flat amount.'); return; }

  const button = el('saveTransactionRulesBtn');
  button.disabled = true;
  button.textContent = 'Saving…';

  try {
    const success = await saveSettingsChange('transaction-rules', async () => {
      const payload = {
        waiver_penalty_mode:waiverMode,
        waiver_penalty_value:waiverValue,
        waiver_penalty_scope:waiverScope,
        buyout_penalty_mode:buyoutMode,
        buyout_penalty_value:buyoutValue,
        buyout_penalty_scope:buyoutScope
      };
      const { error } = await db.from('front_offices').update(payload).eq('front_office_id', state.frontOffice.id);
      if (error) throw error;
      state.frontOffice.waiverPenaltyMode = waiverMode;
      state.frontOffice.waiverPenaltyValue = waiverValue;
      state.frontOffice.waiverPenaltyScope = waiverScope;
      state.frontOffice.buyoutPenaltyMode = buyoutMode;
      state.frontOffice.buyoutPenaltyValue = buyoutValue;
      state.frontOffice.buyoutPenaltyScope = buyoutScope;
      state.activity.unshift(activity('Updated transaction penalty rules'));
    });

    if (success) renderSettings();
  } finally {
    if (el('saveTransactionRulesBtn')) {
      el('saveTransactionRulesBtn').disabled = false;
      el('saveTransactionRulesBtn').textContent = 'Save Transaction Rules';
    }
  }
}

async function addSeason() {
  const maxYear = Math.max(...state.seasons.map((s) => s.startYear));
  await saveSettingsChange('salary-caps', async () => {
    const { error } = await db.from('front_office_seasons').insert({
      front_office_id: state.frontOffice.id,
      season_start_year: maxYear + 1,
      salary_cap: null,
      sort_order: (state.seasons.length + 1) * 10,
      is_current: false
    });
    if (error) throw error;
    await loadOffice(state.frontOffice.id, false);
  });
}

async function removeSeason(id) {
  if (contractHorizonSeasons().some((season) => season.id === id)) {
    alert('The current season and next six seasons are maintained automatically.');
    return;
  }
  const season = seasonById(id);
  if (!confirm(`Remove ${seasonLabel(season.startYear)} and its salary/adjustment values?`)) return;

  await saveSettingsChange('salary-caps', async () => {
    const { error } = await db.rpc('remove_front_office_season_v1', {
      p_front_office_id: state.frontOffice.id,
      p_front_office_season_id: id
    });
    if (error) throw error;
    await loadOffice(state.frontOffice.id, false);
  });
}

async function addStatus() {
  const existing = new Set(state.statuses.map((s) => s.name.toLowerCase()));
  let index = 1;
  let name = 'New Status';
  while (existing.has(name.toLowerCase())) name = `New Status ${++index}`;

  await saveSettingsChange('roster-rules', async () => {
    const { error } = await db.from('front_office_roster_statuses').insert({
      front_office_id: state.frontOffice.id,
      status_name: name,
      counts_toward_cap: true,
      sort_order: (state.statuses.length + 1) * 10,
      is_active: true
    });
    if (error) throw error;
    await loadOffice(state.frontOffice.id, false);
  });
}

async function removeStatus(id) {
  const status = statusById(id);
  if (!status) return;
  if (state.players.some((p) => p.statusId === id)) {
    alert('This status is currently assigned to one or more players. Reassign them before removing it.');
    return;
  }

  await saveSettingsChange('roster-rules', async () => {
    const { error } = await db.rpc('archive_roster_status_v1', {
      p_front_office_id: state.frontOffice.id,
      p_roster_status_id: id
    });
    if (error) throw error;
    await loadOffice(state.frontOffice.id, false);
  });
}
