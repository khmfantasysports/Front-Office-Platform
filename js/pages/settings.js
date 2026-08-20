'use strict';

let settingsOpenDisclosureKeys = new Set();

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

// League, roster, cap and transaction-rule settings.
function renderSettings() {
  rememberOpenSettingsDisclosures();
  const horizonSeasons = contractHorizonSeasons();
  const seasonSettings = horizonSeasons.map((s) => {
    const stateLabel = s.id === state.frontOffice.currentSeasonId ? 'Current' : (s.salaryCap === null ? 'Unset' : 'Set');
    return `<div class="compact-cap-row" data-season-setting="${s.id}"><div class="season-name">${seasonLabel(s.startYear)}</div><label><input data-season-cap="${s.id}" type="number" step="1" value="${s.salaryCap ?? ''}" placeholder="Salary cap" /></label><div class="cap-state">${stateLabel}</div></div>`;
  }).join('');
  const statusSettings = state.statuses.map((s) => `<div class="status-setting-compact" data-status-setting="${s.id}"><input data-status-name="${s.id}" value="${escapeAttr(s.name)}" aria-label="Status name" /><select data-status-cap="${s.id}" aria-label="Cap rule for ${escapeAttr(s.name)}"><option value="true" ${s.countsTowardCap ? 'selected' : ''}>Counts toward cap</option><option value="false" ${!s.countsTowardCap ? 'selected' : ''}>Does not count</option></select><button class="btn btn-ghost btn-small" data-remove-status="${s.id}" type="button">×</button></div>`).join('');
  el('settingsView').innerHTML = `<div class="settings-accordion">
    ${renderTeamIdentitySettings()}
    <details class="settings-disclosure" data-settings-section="team-league"><summary><span class="settings-disclosure-title"><strong>Team & League</strong><span>Name, roster limits and currency</span></span></summary><div class="settings-disclosure-body"><div class="settings-fields"><label>Team name<input data-office-team type="text" value="${escapeAttr(state.frontOffice.teamName)}" /></label><label>League name<input data-office-league type="text" value="${escapeAttr(state.frontOffice.leagueName)}" /></label><label>Active roster limit<input data-office-roster-limit type="number" min="0" step="1" value="${state.frontOffice.rosterLimit ?? ''}" /></label><label>Max Minors spots<input data-office-minors-limit type="number" min="0" step="1" value="${state.frontOffice.minorsLimit ?? ''}" placeholder="No limit" /></label><label>Currency<input data-office-currency type="text" maxlength="3" value="${escapeAttr(state.frontOffice.currency || 'USD')}" /></label></div><div class="settings-context-strip"><div class="settings-context-item"><span>Sport</span><strong>${escapeHtml(state.frontOffice.sport || 'NHL')}</strong></div><div class="settings-context-item"><span>Current season</span><strong>${escapeHtml(seasonLabel(currentSeason()?.startYear))}</strong></div></div></div></details>
    <details class="settings-disclosure" data-settings-section="roster-rules"><summary><span class="settings-disclosure-title"><strong>Roster Rules</strong><span>Status names and cap treatment</span></span></summary><div class="settings-disclosure-body"><div class="settings-card-head"><p class="settings-card-copy">Status cap rules apply to Active-roster players. Players in Minors are excluded from cap regardless of roster status.</p><button id="addStatusBtn" class="btn btn-secondary btn-small" type="button">+ Add Status</button></div><div class="status-settings-list">${statusSettings}</div></div></details>
    <details class="settings-disclosure" data-settings-section="salary-caps"><summary><span class="settings-disclosure-title"><strong>Salary Caps</strong><span>Current + six future seasons</span></span></summary><div class="settings-disclosure-body"><p class="settings-card-copy">Leave future caps blank until your league confirms them.</p><div class="cap-settings-list">${seasonSettings}</div></div></details>
    <details class="settings-disclosure" data-settings-section="transaction-rules"><summary><span class="settings-disclosure-title"><strong>Transaction Rules</strong><span>Automate waiver and buyout penalties</span></span></summary><div class="settings-disclosure-body"><p class="settings-card-copy">These are league settings, not NHL rules. Choose how your league handles each penalty. Full Salary and Half Salary are included as quick options.</p><div class="transaction-rule-settings">
      <div class="transaction-rule-card"><div><h4>Waiver penalty</h4><p>Applied automatically when you record a Waiver transaction.</p></div><label>Penalty method<select id="waiverPenaltyMode"><option value="NONE">No automatic penalty</option><option value="FULL_SALARY">Full salary (100%)</option><option value="HALF_SALARY">Half salary (50%)</option><option value="CUSTOM_PERCENT">Custom percentage</option><option value="FLAT_AMOUNT">Flat amount</option></select></label><label>Applies to<select id="waiverPenaltyScope"><option value="CURRENT_SEASON">Current season only</option><option value="REMAINING_CONTRACT">Remaining contract years</option></select></label><label id="waiverPenaltyValueWrap" class="transaction-rule-value-wrap">Custom value<input id="waiverPenaltyValue" type="number" min="0" step="0.01" placeholder="50 or 2000000" /></label></div>
      <div class="transaction-rule-card"><div><h4>Buyout penalty</h4><p>Applied automatically when you record a Buyout transaction.</p></div><label>Penalty method<select id="buyoutPenaltyMode"><option value="NONE">No automatic penalty</option><option value="FULL_SALARY">Full salary (100%)</option><option value="HALF_SALARY">Half salary (50%)</option><option value="CUSTOM_PERCENT">Custom percentage</option><option value="FLAT_AMOUNT">Flat amount</option></select></label><label>Applies to<select id="buyoutPenaltyScope"><option value="CURRENT_SEASON">Current season only</option><option value="REMAINING_CONTRACT">Remaining contract years</option></select></label><label id="buyoutPenaltyValueWrap" class="transaction-rule-value-wrap">Custom value<input id="buyoutPenaltyValue" type="number" min="0" step="0.01" placeholder="50 or 2000000" /></label></div>
    </div><div class="transaction-rules-footer"><span>For Custom Percentage, enter 0–100. For Flat Amount, enter the dollar penalty per affected season.</span><button id="saveTransactionRulesBtn" class="btn btn-primary btn-small" type="button">Save Transaction Rules</button></div></div></details>
    <details class="settings-disclosure" data-settings-section="data-export"><summary><span class="settings-disclosure-title"><strong>Data & Export</strong><span>Refresh, Fantrax import and portable backups</span></span></summary><div class="settings-disclosure-body"><p class="settings-card-copy">Refresh reloads the latest saved Front Office data from the cloud. Fantrax imports can refresh roster identity and current salary without touching future contracts.</p><div class="settings-data-actions"><button id="settingsRefreshBtn" class="btn btn-secondary" type="button">Refresh Front Office</button><button id="settingsImportBtn" class="btn btn-secondary" type="button">Import Fantrax / CSV</button><button id="settingsExportBtn" class="btn btn-secondary" type="button">Export CSV</button></div></div></details>
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
  document.querySelectorAll('[data-office-team]').forEach((input) => input.addEventListener('change', async () => { const value = input.value.trim() || state.frontOffice.teamName; await runCloudAction(async () => { const { error } = await db.from('front_offices').update({ team_name:value }).eq('front_office_id', state.frontOffice.id); if (error) throw error; state.frontOffice.teamName = value; }); render(); }));
  document.querySelectorAll('[data-office-league]').forEach((input) => input.addEventListener('change', async () => { const value = input.value.trim() || state.frontOffice.leagueName; await runCloudAction(async () => { const { error } = await db.from('front_offices').update({ league_name:value }).eq('front_office_id', state.frontOffice.id); if (error) throw error; state.frontOffice.leagueName = value; }); render(); }));
  document.querySelectorAll('[data-office-roster-limit]').forEach((input) => input.addEventListener('change', async () => { const value = nullableInteger(input.value); await runCloudAction(async () => { const { error } = await db.from('front_offices').update({ roster_limit:value }).eq('front_office_id', state.frontOffice.id); if (error) throw error; state.frontOffice.rosterLimit = value; }); render(); }));
  document.querySelectorAll('[data-office-minors-limit]').forEach((input) => input.addEventListener('change', async () => { const value = nullableInteger(input.value); if (String(input.value).trim() !== '' && value === null) { alert('Max Minors spots must be a whole number of 0 or greater.'); render(); return; } await runCloudAction(async () => { const { error } = await db.from('front_offices').update({ minors_limit:value }).eq('front_office_id', state.frontOffice.id); if (error) throw error; state.frontOffice.minorsLimit = value; }); render(); }));
  document.querySelectorAll('[data-office-currency]').forEach((input) => input.addEventListener('change', async () => { const value = input.value.trim().toUpperCase(); if (!/^[A-Z]{3}$/.test(value)) { alert('Currency must use a three-letter code such as USD or CAD.'); render(); return; } await runCloudAction(async () => { const { error } = await db.from('front_offices').update({ currency_code:value }).eq('front_office_id', state.frontOffice.id); if (error) throw error; state.frontOffice.currency = value; }); render(); }));
  document.querySelectorAll('[data-season-cap]').forEach((input) => input.addEventListener('change', async () => { const value = nullableNumber(input.value); await runCloudAction(async () => { const { error } = await db.from('front_office_seasons').update({ salary_cap:value }).eq('front_office_id', state.frontOffice.id).eq('front_office_season_id', input.dataset.seasonCap); if (error) throw error; seasonById(input.dataset.seasonCap).salaryCap = value; }); render(); }));
  document.querySelectorAll('[data-status-name]').forEach((input) => input.addEventListener('change', async () => { const name = input.value.trim() || 'Status'; await runCloudAction(async () => { const { error } = await db.from('front_office_roster_statuses').update({ status_name:name }).eq('front_office_id', state.frontOffice.id).eq('roster_status_id', input.dataset.statusName); if (error) throw error; statusById(input.dataset.statusName).name = name; }); render(); }));
  document.querySelectorAll('[data-status-cap]').forEach((select) => select.addEventListener('change', async () => { const counts = select.value === 'true'; await runCloudAction(async () => { const { error } = await db.from('front_office_roster_statuses').update({ counts_toward_cap:counts }).eq('front_office_id', state.frontOffice.id).eq('roster_status_id', select.dataset.statusCap); if (error) throw error; statusById(select.dataset.statusCap).countsTowardCap = counts; }); render(); }));
  document.querySelectorAll('[data-remove-status]').forEach((button) => button.addEventListener('click', () => removeStatus(button.dataset.removeStatus)));
  el('addStatusBtn').addEventListener('click', addStatus);
  el('settingsRefreshBtn').addEventListener('click', refreshCurrentFrontOfficeData);
  el('settingsImportBtn').addEventListener('click', openImportDialog);
  el('settingsExportBtn').addEventListener('click', exportRosterCsv);
}

async function refreshCurrentFrontOfficeData() {
  const frontOfficeId = state.frontOffice?.id;
  const button = el('settingsRefreshBtn');
  if (!frontOfficeId || !button || button.disabled) return;

  button.disabled = true;
  button.textContent = 'Refreshing…';
  setCloudStatus('Refreshing…', 'busy');

  try {
    await loadOffice(frontOfficeId, false);
  } catch (error) {
    console.error('Front Office refresh failed', error);
    setCloudStatus('Refresh error', 'error');
    alert(error?.message || 'Unable to refresh Front Office data.');
  } finally {
    const currentButton = el('settingsRefreshBtn');
    if (currentButton) {
      currentButton.disabled = false;
      currentButton.textContent = 'Refresh Front Office';
    }
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
    const success = await runCloudAction(async () => {
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
  await runCloudAction(async () => {
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
  await runCloudAction(async () => {
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
  await runCloudAction(async () => {
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
  await runCloudAction(async () => {
    const { error } = await db.rpc('archive_roster_status_v1', {
      p_front_office_id: state.frontOffice.id,
      p_roster_status_id: id
    });
    if (error) throw error;
    await loadOffice(state.frontOffice.id, false);
  });
}
