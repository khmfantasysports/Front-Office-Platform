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

// -----------------------------------------------------------------------------
// RosterCap V3.16.2 — Fantrax roster + league-info sync preview
//
// User-triggered only:
// - getLeagues runs only when the user presses Test Connection.
// - getTeamRosters + getLeagueInfo run only when the user presses Preview Sync Data.
// - no polling, scheduler, background refresh or automatic roster writes.
// - the User Secret ID is never persisted by this frontend.
// - this phase validates player identity, roster, status, salary and league metadata
//   before the established import/apply path is allowed to write anything.
// -----------------------------------------------------------------------------

const ROSTERCAP_FANTRAX_PREVIEW_VERSION_V3162 = '3.16.2';

let fantraxConnectionPreviewV3162 = {
  status:'idle',
  data:null,
  error:'',
  selectedKey:'',
  rosterStatus:'idle',
  rosterData:null,
  rosterError:''
};

function fantraxPreviewTechnicalJsonV3162(value, limit = 120000) {
  let text = '';

  try {
    text = JSON.stringify(value ?? null, null, 2);
  } catch {
    text = String(value ?? '');
  }

  return text.length > limit
    ? `${text.slice(0, limit)}\n… response truncated in the browser preview …`
    : text;
}

function fantraxCleanDisplayTextV3162(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function fantraxConnectionKeyV3162(connection) {
  return `${String(connection?.leagueId || '')}::${String(connection?.teamId || '')}`;
}

function fantraxNormalizeConnectionV3162(row) {
  if (!row || typeof row !== 'object') return null;

  const leagueId = String(row.leagueId || '').trim();
  const teamId = String(row.teamId || '').trim();
  const leagueName = fantraxCleanDisplayTextV3162(row.leagueName);
  const teamName = fantraxCleanDisplayTextV3162(row.teamName);
  const sport = String(row.sport || '').trim().toUpperCase();

  if (!leagueId || !teamId) return null;

  return {
    leagueId,
    teamId,
    leagueName:leagueName || 'Fantrax league',
    teamName:teamName || 'Owned team',
    sport
  };
}

function fantraxConnectionRowsV3162(data) {
  const normalized = [];

  if (Array.isArray(data?.connections)) {
    data.connections.forEach((row) => {
      const connection = fantraxNormalizeConnectionV3162(row);
      if (connection) normalized.push(connection);
    });
  }

  if (!normalized.length && Array.isArray(data?.payload?.leagues)) {
    data.payload.leagues.forEach((row) => {
      const connection = fantraxNormalizeConnectionV3162(row);
      if (connection) normalized.push(connection);
    });
  }

  const unique = new Map();
  normalized.forEach((connection) => {
    unique.set(fantraxConnectionKeyV3162(connection), connection);
  });

  return [...unique.values()];
}

function fantraxCurrentSportV3162() {
  return String(state?.frontOffice?.sport || 'NHL').trim().toUpperCase();
}

function fantraxSportConnectionsV3162(data = fantraxConnectionPreviewV3162.data) {
  const sport = fantraxCurrentSportV3162();
  return fantraxConnectionRowsV3162(data)
    .filter((connection) => !connection.sport || connection.sport === sport)
    .sort((a,b) =>
      a.leagueName.localeCompare(b.leagueName)
      || a.teamName.localeCompare(b.teamName)
      || a.leagueId.localeCompare(b.leagueId)
      || a.teamId.localeCompare(b.teamId)
    );
}

function fantraxComparableNameV3162(value) {
  return fantraxCleanDisplayTextV3162(value).toLowerCase();
}

function fantraxSuggestedConnectionKeyV3162(connections) {
  const league = fantraxComparableNameV3162(state?.frontOffice?.leagueName);
  const team = fantraxComparableNameV3162(state?.frontOffice?.teamName);

  const exact = (connections || []).find((connection) =>
    fantraxComparableNameV3162(connection.leagueName) === league
    && fantraxComparableNameV3162(connection.teamName) === team
  );

  return exact ? fantraxConnectionKeyV3162(exact) : '';
}

function fantraxSelectedConnectionV3162() {
  const connections = fantraxSportConnectionsV3162();
  const selectedKey = fantraxConnectionPreviewV3162.selectedKey;
  return connections.find((connection) =>
    fantraxConnectionKeyV3162(connection) === selectedKey
  ) || null;
}

function fantraxEnsureSelectionV3162() {
  const connections = fantraxSportConnectionsV3162();

  if (!connections.length) {
    fantraxConnectionPreviewV3162.selectedKey = '';
    return;
  }

  const current = connections.find((connection) =>
    fantraxConnectionKeyV3162(connection)
      === fantraxConnectionPreviewV3162.selectedKey
  );

  if (current) return;

  fantraxConnectionPreviewV3162.selectedKey =
    fantraxSuggestedConnectionKeyV3162(connections)
    || (connections.length === 1
      ? fantraxConnectionKeyV3162(connections[0])
      : '');
}

function fantraxConnectionSelectorMarkupV3162() {
  const connections = fantraxSportConnectionsV3162();
  const sport = fantraxCurrentSportV3162();

  if (!connections.length) {
    return `<div class="settings-health-panel has-warning">
      <div class="settings-health-head"><div><span>${escapeHtml(sport)} leagues</span><strong>No selectable owned team found</strong></div><span class="settings-health-badge">Review</span></div>
      <p>Fantrax responded, but no owned ${escapeHtml(sport)} league/team pair was returned for this Front Office sport.</p>
    </div>`;
  }

  fantraxEnsureSelectionV3162();

  const suggestedKey = fantraxSuggestedConnectionKeyV3162(connections);
  const options = connections.map((connection) => {
    const key = fantraxConnectionKeyV3162(connection);
    const suggested = key === suggestedKey ? ' · Suggested match' : '';
    return `<option value="${escapeAttr(key)}" ${key === fantraxConnectionPreviewV3162.selectedKey ? 'selected' : ''}>${escapeHtml(`${connection.leagueName} — ${connection.teamName}${suggested}`)}</option>`;
  }).join('');

  const selected = fantraxSelectedConnectionV3162();

  return `<div class="settings-health-panel is-good">
    <div class="settings-health-head">
      <div><span>${escapeHtml(sport)} leagues</span><strong>${connections.length} owned team${connections.length === 1 ? '' : 's'} available</strong></div>
      <span class="settings-health-badge">Manual</span>
    </div>
    <p>Only leagues matching this Front Office sport are shown. A league can legitimately appear more than once when you own more than one team.</p>
  </div>
  <div class="settings-fields">
    <label>League / owned team
      <select id="fantraxConnectionSelectV3162">
        <option value="">Choose a Fantrax league/team…</option>
        ${options}
      </select>
    </label>
  </div>
  ${selected ? `<div class="settings-context-strip">
    <div class="settings-context-item"><span>League</span><strong>${escapeHtml(selected.leagueName)}</strong></div>
    <div class="settings-context-item"><span>Owned team</span><strong>${escapeHtml(selected.teamName)}</strong></div>
    <div class="settings-context-item"><span>League ID</span><strong>${escapeHtml(selected.leagueId)}</strong></div>
    <div class="settings-context-item"><span>Team ID</span><strong>${escapeHtml(selected.teamId)}</strong></div>
  </div>` : ''}
  <div class="transaction-rules-footer">
    <span>Preview Sync Data makes two read-only Fantrax calls: getTeamRosters for roster/salary/status and getLeagueInfo for player identity/settings context. Nothing is saved to RosterCap.</span>
    <button id="fantraxPreviewRosterBtnV3162" class="btn btn-primary btn-small" type="button" ${selected ? '' : 'disabled'}>Preview Sync Data</button>
  </div>`;
}

function fantraxRosterResultMarkupV3162() {
  const preview = fantraxConnectionPreviewV3162;

  if (preview.rosterStatus === 'testing') {
    return `<div class="settings-health-panel">
      <div class="settings-health-head"><div><span>Sync preview</span><strong>Contacting Fantrax…</strong></div><span class="settings-health-badge">Manual</span></div>
      <p>RosterCap is making one user-triggered preview consisting of getTeamRosters + getLeagueInfo.</p>
    </div>`;
  }

  if (preview.rosterStatus === 'error') {
    return `<div class="settings-health-panel has-warning" role="alert">
      <div class="settings-health-head"><div><span>Sync preview</span><strong>Could not load Fantrax sync data</strong></div><span class="settings-health-badge">Review</span></div>
      <p>${escapeHtml(preview.rosterError || 'Fantrax did not return usable sync data.')}</p>
    </div>`;
  }

  if (preview.rosterStatus !== 'success' || !preview.rosterData) return '';

  const data = preview.rosterData;
  const selected = fantraxSelectedConnectionV3162();
  const receivedAt = data.receivedAt
    ? new Date(data.receivedAt).toLocaleString()
    : 'Just now';

  const roster = data.rosterSummary || {};
  const identity = data.identitySummary || {};
  const statusCounts = roster.statusCounts || {};
  const missingIds = Array.isArray(identity.missingPlayerIds)
    ? identity.missingPlayerIds
    : [];

  const statusText = Object.entries(statusCounts)
    .sort((a,b) => String(a[0]).localeCompare(String(b[0])))
    .map(([key, count]) => `${key} ${count}`)
    .join(' · ')
    || 'No roster statuses returned';

  const normalizedRosterJson = fantraxPreviewTechnicalJsonV3162(
    data.selectedRoster?.rosterItems || [],
    90000
  );
  const identityJson = fantraxPreviewTechnicalJsonV3162(
    data.identityMatches || [],
    120000
  );
  const playerInfoSampleJson = fantraxPreviewTechnicalJsonV3162(
    data.playerInfoSample || null,
    80000
  );
  const leagueMetaJson = fantraxPreviewTechnicalJsonV3162(
    data.leagueInfoMeta || null,
    60000
  );

  const salaryCapText = roster.salaryCap === null || roster.salaryCap === undefined
    ? 'Not supplied'
    : (typeof formatMoney === 'function' ? formatMoney(roster.salaryCap) : String(roster.salaryCap));

  const identityTone = identity.missingCount ? 'has-warning' : 'is-good';

  return `<div class="settings-health-panel is-good">
    <div class="settings-health-head">
      <div><span>Sync preview</span><strong>Fantrax roster + league info received</strong></div>
      <span class="settings-health-badge">Read only</span>
    </div>
    <p>Response received ${escapeHtml(receivedAt)} for ${escapeHtml(selected?.teamName || data.teamName || 'the selected team')}. No RosterCap roster, contract, cap or asset data was changed.</p>
  </div>
  <div class="settings-summary-grid settings-summary-grid-roster">
    <div class="settings-summary-item"><span>Roster players</span><strong>${escapeHtml(String(roster.playerCount ?? 0))}</strong></div>
    <div class="settings-summary-item ${identityTone}"><span>Player IDs resolved</span><strong>${escapeHtml(`${identity.matchedCount ?? 0} / ${identity.rosterPlayerCount ?? roster.playerCount ?? 0}`)}</strong></div>
    <div class="settings-summary-item ${identity.missingCount ? 'warning' : 'good'}"><span>Missing identities</span><strong>${escapeHtml(String(identity.missingCount ?? 0))}</strong></div>
    <div class="settings-summary-item"><span>Fantrax salary cap</span><strong>${escapeHtml(salaryCapText)}</strong></div>
  </div>
  <div class="settings-context-strip">
    <div class="settings-context-item"><span>Roster statuses</span><strong>${escapeHtml(statusText)}</strong></div>
    <div class="settings-context-item"><span>Roster API</span><strong>${escapeHtml(String(data.rosterUpstreamStatus || 200))}</strong></div>
    <div class="settings-context-item"><span>League Info API</span><strong>${escapeHtml(String(data.leagueInfoUpstreamStatus || 200))}</strong></div>
  </div>
  ${missingIds.length ? `<div class="settings-health-panel has-warning"><div class="settings-health-head"><div><span>Identity coverage</span><strong>${missingIds.length} roster player ID${missingIds.length === 1 ? '' : 's'} not located in getLeagueInfo</strong></div><span class="settings-health-badge">Review</span></div><p>${escapeHtml(missingIds.join(', '))}</p></div>` : ''}
  <details class="advanced-contract" open>
    <summary>Resolved player identity records</summary>
    <p class="settings-card-copy">Diagnostic matches between selected-roster Fantrax player IDs and getLeagueInfo. This lets us map the real playerInfo contract before enabling writes.</p>
    <pre style="max-height:420px;overflow:auto;white-space:pre-wrap;word-break:break-word;margin:0">${escapeHtml(identityJson)}</pre>
  </details>
  <details class="advanced-contract">
    <summary>Normalized selected roster</summary>
    <p class="settings-card-copy">Known roster contract. Salaries are normalized to whole dollars for comparison; zero remains a supplied salary value.</p>
    <pre style="max-height:360px;overflow:auto;white-space:pre-wrap;word-break:break-word;margin:0">${escapeHtml(normalizedRosterJson)}</pre>
  </details>
  <details class="advanced-contract">
    <summary>playerInfo sample</summary>
    <p class="settings-card-copy">Small diagnostic sample of Fantrax playerInfo so we can confirm names, real teams and eligibility fields without returning the entire league player pool.</p>
    <pre style="max-height:360px;overflow:auto;white-space:pre-wrap;word-break:break-word;margin:0">${escapeHtml(playerInfoSampleJson)}</pre>
  </details>
  <details class="advanced-contract">
    <summary>League Info metadata</summary>
    <p class="settings-card-copy">Top-level getLeagueInfo metadata with large nested player data omitted from this browser preview.</p>
    <pre style="max-height:300px;overflow:auto;white-space:pre-wrap;word-break:break-word;margin:0">${escapeHtml(leagueMetaJson)}</pre>
  </details>`;
}

function fantraxPreviewResultMarkupV3162() {
  const preview = fantraxConnectionPreviewV3162;

  if (preview.status === 'testing') {
    return `<div class="settings-health-panel">
      <div class="settings-health-head"><div><span>Connection test</span><strong>Contacting Fantrax…</strong></div><span class="settings-health-badge">Manual</span></div>
      <p>RosterCap is making one authenticated, user-triggered getLeagues request to Fantrax.</p>
    </div>`;
  }

  if (preview.status === 'error') {
    return `<div class="settings-health-panel has-warning" role="alert">
      <div class="settings-health-head"><div><span>Connection test</span><strong>Could not connect</strong></div><span class="settings-health-badge">Review</span></div>
      <p>${escapeHtml(preview.error || 'Fantrax did not return a usable response.')}</p>
    </div>`;
  }

  if (preview.status !== 'success' || !preview.data) {
    return `<p class="settings-card-copy">Nothing is saved during this preview. Your User Secret ID is cleared from this page after each connection test.</p>`;
  }

  const receivedAt = preview.data.receivedAt
    ? new Date(preview.data.receivedAt).toLocaleString()
    : 'Just now';
  const leagueJson = fantraxPreviewTechnicalJsonV3162(preview.data.payload, 80000);

  return `<div class="settings-health-panel is-good">
    <div class="settings-health-head">
      <div><span>Connection test</span><strong>Fantrax responded</strong></div>
      <span class="settings-health-badge">${escapeHtml(String(preview.data.upstreamStatus || 200))}</span>
    </div>
    <p>Response received ${escapeHtml(receivedAt)}. No RosterCap roster data was changed.</p>
  </div>
  ${fantraxConnectionSelectorMarkupV3162()}
  <div id="fantraxRosterResultV3162">${fantraxRosterResultMarkupV3162()}</div>
  <details class="advanced-contract">
    <summary>Technical league response</summary>
    <p class="settings-card-copy">Raw redacted getLeagues response. The User Secret ID is not included.</p>
    <pre style="max-height:240px;overflow:auto;white-space:pre-wrap;word-break:break-word;margin:0">${escapeHtml(leagueJson)}</pre>
  </details>`;
}

function fantraxConnectionMarkupV3162() {
  return `<details class="settings-disclosure" data-settings-section="fantrax-connection">
    <summary><span class="settings-disclosure-title"><strong>Fantrax Connection</strong><span>Preview roster, salaries and player identity</span></span>${settingsFeedbackMarkup('fantrax-connection', 'Not connected')}</summary>
    <div class="settings-disclosure-body">
      <p class="settings-card-copy">Fantrax remains user-triggered only. Test Connection loads your owned leagues. Preview Sync Data then reads the selected league roster and player information so RosterCap can validate the exact API mapping before sync writes are enabled.</p>
      <div class="settings-fields">
        <label>Fantrax User Secret ID
          <input id="fantraxUserSecretIdV3162" type="password" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="256" placeholder="Enter your Fantrax User Secret ID" />
        </label>
      </div>
      <div class="transaction-rules-footer">
        <span>The secret is used only for the manual getLeagues connection test and is not written to the RosterCap database in this phase.</span>
        <button id="fantraxTestConnectionBtnV3162" class="btn btn-primary btn-small" type="button">Test Connection</button>
      </div>
      <div id="fantraxConnectionResultV3162">${fantraxPreviewResultMarkupV3162()}</div>
    </div>
  </details>`;
}

async function fantraxPreviewErrorMessageV3162(error) {
  if (!error) return 'Fantrax request failed.';

  try {
    const context = error.context;
    if (context && typeof context.clone === 'function') {
      const response = context.clone();
      const body = await response.json();
      if (body?.message) return String(body.message);
      if (body?.error) return String(body.error);
    }
  } catch {
    // Fall through to the public Supabase error message.
  }

  return error.message || 'Fantrax request failed.';
}

function fantraxRenderConnectionResultV3162() {
  const result = el('fantraxConnectionResultV3162');
  if (!result) return;
  result.innerHTML = fantraxPreviewResultMarkupV3162();
  bindFantraxConnectionResultV3162();
}

async function testFantraxConnectionV3162() {
  const input = el('fantraxUserSecretIdV3162');
  const button = el('fantraxTestConnectionBtnV3162');
  const secret = String(input?.value || '').trim();

  if (!secret) {
    alert('Enter your Fantrax User Secret ID first.');
    input?.focus();
    return;
  }

  if (!session?.user) {
    alert('Sign in to RosterCap before testing the Fantrax connection.');
    return;
  }

  fantraxConnectionPreviewV3162 = {
    status:'testing',
    data:null,
    error:'',
    selectedKey:'',
    rosterStatus:'idle',
    rosterData:null,
    rosterError:''
  };

  if (button) {
    button.disabled = true;
    button.textContent = 'Testing…';
  }

  setSettingsSectionFeedback('fantrax-connection', 'saving', 'Testing…');
  fantraxRenderConnectionResultV3162();

  try {
    const { data, error } = await db.functions.invoke(
      'fantrax-connect-preview',
      {
        body:{
          action:'getLeagues',
          userSecretId:secret
        }
      }
    );

    if (error) throw error;
    if (!data?.ok) {
      throw new Error(data?.message || 'Fantrax did not return a successful response.');
    }

    fantraxConnectionPreviewV3162.status = 'success';
    fantraxConnectionPreviewV3162.data = data;
    fantraxConnectionPreviewV3162.error = '';
    fantraxEnsureSelectionV3162();

    setSettingsSectionFeedback('fantrax-connection', 'saved', 'Connection works');
  } catch (error) {
    const message = await fantraxPreviewErrorMessageV3162(error);

    fantraxConnectionPreviewV3162.status = 'error';
    fantraxConnectionPreviewV3162.data = null;
    fantraxConnectionPreviewV3162.error = message;

    setSettingsSectionFeedback('fantrax-connection', 'error', 'Test failed');
    console.error('Fantrax connection preview failed', error);
  } finally {
    if (input) input.value = '';
    fantraxRenderConnectionResultV3162();

    const currentButton = el('fantraxTestConnectionBtnV3162');
    if (currentButton) {
      currentButton.disabled = false;
      currentButton.textContent = 'Test Connection';
    }
  }
}

async function previewFantraxRosterV3162() {
  const selected = fantraxSelectedConnectionV3162();
  const button = el('fantraxPreviewRosterBtnV3162');

  if (!selected) {
    alert('Choose a Fantrax league/team first.');
    return;
  }

  if (!session?.user) {
    alert('Sign in to RosterCap before previewing Fantrax sync data.');
    return;
  }

  fantraxConnectionPreviewV3162.rosterStatus = 'testing';
  fantraxConnectionPreviewV3162.rosterData = null;
  fantraxConnectionPreviewV3162.rosterError = '';

  if (button) {
    button.disabled = true;
    button.textContent = 'Loading Sync Data…';
  }

  setSettingsSectionFeedback('fantrax-connection', 'saving', 'Loading sync data…');
  const rosterResult = el('fantraxRosterResultV3162');
  if (rosterResult) rosterResult.innerHTML = fantraxRosterResultMarkupV3162();

  try {
    const { data, error } = await db.functions.invoke(
      'fantrax-connect-preview',
      {
        body:{
          action:'getSyncPreview',
          leagueId:selected.leagueId,
          teamId:selected.teamId,
          teamName:selected.teamName
        }
      }
    );

    if (error) throw error;
    if (!data?.ok) {
      throw new Error(data?.message || 'Fantrax did not return successful sync-preview data.');
    }

    fantraxConnectionPreviewV3162.rosterStatus = 'success';
    fantraxConnectionPreviewV3162.rosterData = data;
    fantraxConnectionPreviewV3162.rosterError = '';
    setSettingsSectionFeedback('fantrax-connection', 'saved', 'Sync preview works');
  } catch (error) {
    const message = await fantraxPreviewErrorMessageV3162(error);
    fantraxConnectionPreviewV3162.rosterStatus = 'error';
    fantraxConnectionPreviewV3162.rosterData = null;
    fantraxConnectionPreviewV3162.rosterError = message;
    setSettingsSectionFeedback('fantrax-connection', 'error', 'Sync preview failed');
    console.error('Fantrax sync preview failed', error);
  } finally {
    const currentRosterResult = el('fantraxRosterResultV3162');
    if (currentRosterResult) {
      currentRosterResult.innerHTML = fantraxRosterResultMarkupV3162();
    }

    const currentButton = el('fantraxPreviewRosterBtnV3162');
    if (currentButton) {
      currentButton.disabled = false;
      currentButton.textContent = 'Preview Sync Data';
    }
  }
}

function bindFantraxConnectionResultV3162() {
  const select = el('fantraxConnectionSelectV3162');
  select?.addEventListener('change', () => {
    fantraxConnectionPreviewV3162.selectedKey = select.value || '';
    fantraxConnectionPreviewV3162.rosterStatus = 'idle';
    fantraxConnectionPreviewV3162.rosterData = null;
    fantraxConnectionPreviewV3162.rosterError = '';
    fantraxRenderConnectionResultV3162();
  });

  el('fantraxPreviewRosterBtnV3162')?.addEventListener(
    'click',
    previewFantraxRosterV3162
  );
}

function bindFantraxConnectionV3162() {
  const button = el('fantraxTestConnectionBtnV3162');
  const input = el('fantraxUserSecretIdV3162');

  button?.addEventListener('click', testFantraxConnectionV3162);

  input?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    testFantraxConnectionV3162();
  });

  bindFantraxConnectionResultV3162();
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

    ${fantraxConnectionMarkupV3162()}

    <details class="settings-disclosure" data-settings-section="data-export">
      <summary><span class="settings-disclosure-title"><strong>Data & Export</strong><span>Health, refresh, CSV import and backups</span></span>${settingsFeedbackMarkup('data-export', 'Ready')}</summary>
      <div class="settings-disclosure-body">
        ${settingsDataHealthMarkup(snapshot)}
        <p class="settings-card-copy">Refresh reloads the latest saved Front Office data from the cloud. Existing Fantrax / CSV import remains available while the API roster, salary and player-identity contracts are validated separately above.</p>
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
  bindFantraxConnectionV3162();

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
