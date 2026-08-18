'use strict';

// Fantrax/native CSV import workflow.

function openImportDialog() {
  pendingImport = [];
  pendingImportMeta = { type: 'generic', skaters: 0, goalies: 0, minors: 0 };
  el('csvFile').value = '';
  el('importSalaryToggle').checked = true;
  el('importPreview').classList.add('hidden');
  el('importPreview').innerHTML = '';
  el('applyImportBtn').disabled = true;
  importDialog.showModal();
}

async function handleCsvFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const text = await file.text();
  const rows = parseCsv(text);
  if (rows.length < 2) {
    alert('No data rows found.');
    return;
  }

  const fantrax = parseFantraxTeamRoster(rows);
  if (fantrax.detected) {
    pendingImportMeta = { type: 'fantrax', skaters: fantrax.skaters, goalies: fantrax.goalies, minors: fantrax.minors };
    pendingImport = fantrax.rows;
  } else {
    pendingImportMeta = { type: 'generic', skaters: 0, goalies: 0, minors: 0 };
    const headers = rows[0].map((h) => h.trim());
    pendingImport = rows.slice(1)
      .filter((r) => r.some((v) => String(v).trim() !== ''))
      .map((row, index) => mapImportRow(headers, row, index + 2));
  }
  renderImportPreview();
}

function parseFantraxTeamRoster(rows) {
  const output = [];
  let detected = false;
  let skaters = 0;
  let goalies = 0;
  let minors = 0;
  let section = '';
  let headers = null;

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i].map((value) => String(value ?? '').trim());
    const marker = (row[1] || '').toLowerCase();
    if (!row[0] && (marker === 'skaters' || marker === 'goalies')) {
      section = marker === 'skaters' ? 'Skaters' : 'Goalies';
      headers = null;
      detected = true;
      continue;
    }
    if (!section) continue;
    if (row[0].toLowerCase() === 'id' && row.some((value) => value.toLowerCase() === 'player')) {
      headers = row;
      continue;
    }
    if (!headers || !row.some(Boolean)) continue;

    const record = {};
    headers.forEach((header, index) => { record[header] = row[index] ?? ''; });
    const sourceId = String(record.ID || '').trim();
    const name = String(record.Player || '').trim();
    if (!sourceId && !name) continue;

    const salary = nullableNumber(String(record.Salary || '').replace(/[$,]/g, ''));
    const sourceRow = i + 1;
    const realTeam = normalizeNhlTeam(record.Team);
    const position = String(record.Pos || '').trim().toUpperCase() || 'F';
    const eligiblePositions = normalizeEligibility(record.Eligible) || position;
    const ageSnapshot = nullableInteger(record.Age);
    const existing = findExistingImportPlayer(sourceId, name, realTeam);
    const statusRaw = String(record.Status || '').trim();
    const isMinors = isFantraxMinorsStatus(statusRaw);
    const statusResult = mapFantraxStatus(statusRaw, existing?.statusId || null);

    output.push({
      sourceRow,
      sourceType: 'FANTRAX',
      sourceId,
      name,
      position,
      eligiblePositions,
      realTeam,
      ageSnapshot,
      statusId: statusResult.statusId,
      statusRaw,
      isMinors,
      salary,
      salaries: {},
      section,
      existingPlayerId: existing?.id || null,
      action: existing ? 'Update' : 'Add',
      valid: Boolean(name && sourceId && statusResult.statusId),
      warning: statusResult.warning
    });
    if (section === 'Skaters') skaters += 1;
    if (section === 'Goalies') goalies += 1;
    if (isMinors) minors += 1;
  }
  return { detected: detected && output.length > 0, rows: output, skaters, goalies, minors };
}

function isFantraxMinorsStatus(value) {
  const normalized = String(value || '').trim().toLowerCase().replace(/[^a-z]/g, '');
  return normalized === 'min' || normalized === 'minor' || normalized === 'minors' || normalized.startsWith('minor');
}

function mapFantraxStatus(value, fallbackStatusId = null) {
  const raw = String(value || '').trim();
  if (isFantraxMinorsStatus(raw)) {
    const fallback = statusById(fallbackStatusId) || state.statuses.find((s) => s.name.toLowerCase() === 'active') || state.statuses[0];
    return { statusId: fallback?.id || null, warning: fallback ? '' : 'No roster status is available for this Minors player.' };
  }
  const codeMap = { act: 'Active', res: 'Reserve' };
  const desired = codeMap[raw.toLowerCase()] || raw;
  const status = state.statuses.find((s) => s.name.toLowerCase() === desired.toLowerCase());
  return { statusId: status?.id || null, warning: status ? '' : `Unmapped Fantrax status: ${raw || 'blank'}` };
}

function findExistingImportPlayer(sourceId, name, realTeam) {
  if (sourceId) {
    const linked = state.players.find((p) => p.fantraxId === sourceId);
    if (linked) return linked;
  }
  const normalizedName = String(name || '').trim().toLowerCase();
  return state.players.find((p) => p.name.toLowerCase() === normalizedName && (!realTeam || !p.realTeam || p.realTeam === realTeam)) || null;
}

function mapImportRow(headers, row, sourceRow) {
  const record = {};
  headers.forEach((h, i) => { record[h] = row[i] ?? ''; });
  const findColumn = (...patterns) => {
    const h = headers.find((header) => patterns.some((p) => p.test(header.trim())));
    return h ? record[h] : '';
  };

  const name = findColumn(/^player$/i, /^name$/i, /player name/i).trim();
  const position = findColumn(/^pos$/i, /^position$/i).trim().toUpperCase() || 'F';
  const eligiblePositions = normalizeEligibility(findColumn(/^eligible$/i, /eligib/i)) || position;
  const realTeam = normalizeNhlTeam(findColumn(/^team$/i, /nhl team/i, /real team/i));
  const ageSnapshot = nullableInteger(findColumn(/^age$/i));
  const sourceId = findColumn(/^id$/i, /fantrax.*id/i).trim();
  const statusText = findColumn(/^status$/i, /roster status/i).trim();
  const status = state.statuses.find((s) => s.name.toLowerCase() === statusText.toLowerCase()) || state.statuses[0];
  const salaries = {};
  state.seasons.forEach((season) => {
    const label = seasonLabel(season.startYear);
    const salaryHeader = headers.find((h) => normalizeHeader(h).includes(normalizeHeader(label)) && /salary|cap|\d{4}/i.test(h));
    salaries[season.id] = salaryHeader ? nullableNumber(String(record[salaryHeader]).replace(/[$,]/g, '')) : null;
  });
  const existing = findExistingImportPlayer(sourceId, name, realTeam);
  return {
    sourceRow, sourceType: sourceId ? 'FANTRAX' : null, sourceId, name, position, eligiblePositions, realTeam,
    ageSnapshot, statusId: status?.id || null, salary: null, salaries, section: '', isMinors: false,
    existingPlayerId: existing?.id || null, action: existing ? 'Update' : 'Add', valid: Boolean(name && status?.id), warning: ''
  };
}

function renderImportPreview() {
  const valid = pendingImport.filter((r) => r.valid);
  const invalid = pendingImport.length - valid.length;
  const current = currentSeason();
  const fantrax = pendingImportMeta.type === 'fantrax';
  const rows = pendingImport.slice(0, 30).map((r) => {
    const currentSalary = fantrax ? r.salary : r.salaries[current.id];
    return `<tr>
      <td>${r.sourceRow}</td>
      <td>${escapeHtml(r.name || 'Missing name')}</td>
      <td>${escapeHtml(r.position)}</td>
      <td>${escapeHtml(r.eligiblePositions || '—')}</td>
      <td>${escapeHtml(r.realTeam || '—')}</td>
      <td>${r.ageSnapshot ?? '—'}</td>
      <td>${escapeHtml(statusById(r.statusId)?.name || r.statusRaw || 'Unmapped')}</td>
      <td>${r.isMinors ? '<span class="status-pill">Minors</span>' : 'Active roster'}</td>
      <td>${currentSalary === null ? '—' : formatMoney(currentSalary)}</td>
      <td>${escapeHtml(r.action || 'Add')}</td>
      <td>${r.valid ? '<span class="good">Ready</span>' : `<span class="danger">${escapeHtml(r.warning || 'Needs review')}</span>`}</td>
    </tr>`;
  }).join('');
  const preview = el('importPreview');
  preview.classList.remove('hidden');
  const detector = fantrax
    ? `<div class="import-detect"><span class="import-chip">Fantrax Team Roster detected</span><span class="import-chip">${pendingImportMeta.skaters} skaters</span><span class="import-chip">${pendingImportMeta.goalies} goalies</span>${pendingImportMeta.minors ? `<span class="import-chip">${pendingImportMeta.minors} minors</span>` : ''}<span class="import-chip">${valid.length} ready</span></div>`
    : `<div class="import-detect"><span class="import-chip">Generic CSV</span><span class="import-chip">${valid.length} ready</span></div>`;
  preview.innerHTML = `${detector}${invalid ? `<p class="danger">${invalid} row${invalid === 1 ? '' : 's'} require review and will not be imported.</p>` : ''}<div class="table-wrap"><table><thead><tr><th>Row</th><th>Player</th><th>Pos</th><th>Eligible</th><th>NHL Team</th><th>Age</th><th>Status</th><th>Location</th><th>${seasonLabel(current.startYear)}</th><th>Action</th><th>Check</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  el('applyImportBtn').disabled = valid.length === 0;
}

async function applyImport() {
  const rows = pendingImport.filter((r) => r.valid);
  if (!rows.length) return;
  const updateSalary = el('importSalaryToggle').checked;
  const frontOfficeId = state.frontOffice?.id;
  if (!frontOfficeId) return alert('Reopen this Front Office before importing.');

  await runCloudAction(async () => {
    for (const r of rows) {
      const existing = state.players.find((p) => p.id === r.existingPlayerId) || findExistingImportPlayer(r.sourceId, r.name, r.realTeam);
      const salaryRows = state.seasons.map((season) => {
        const currentData = existing?.salaries?.[season.id] || { salary: null, capOverride: null };
        let incoming = r.salaries?.[season.id] ?? null;
        if (pendingImportMeta.type === 'fantrax' && season.id === currentSeason()?.id && updateSalary) incoming = r.salary;
        if (pendingImportMeta.type === 'fantrax' && season.id !== currentSeason()?.id) incoming = null;
        if (pendingImportMeta.type === 'fantrax' && !updateSalary) incoming = null;
        return {
          season_id: season.id,
          salary: incoming === null ? currentData.salary : incoming,
          cap_override: currentData.capOverride ?? null
        };
      });

      const { data: savedPlayerId, error } = await db.rpc('save_front_office_player_v2', {
        p_front_office_id: frontOfficeId,
        p_front_office_player_id: existing?.id || null,
        p_player_name: r.name,
        p_position: r.position || existing?.position || 'F',
        p_eligible_positions: r.eligiblePositions || existing?.eligiblePositions || r.position || 'F',
        p_real_team: r.realTeam || existing?.realTeam || null,
        p_age_snapshot: r.ageSnapshot ?? existing?.ageSnapshot ?? null,
        p_age_as_of: (r.ageSnapshot ?? existing?.ageSnapshot) === null || (r.ageSnapshot ?? existing?.ageSnapshot) === undefined ? null : todayIsoDate(),
        p_roster_status_id: r.statusId || existing?.statusId || state.statuses[0]?.id,
        p_contract_end_season_id: existing?.contractEndSeasonId || null,
        p_notes: existing?.notes || null,
        p_salary_rows: salaryRows,
        p_source_system: r.sourceId ? 'FANTRAX' : null,
        p_source_player_id: r.sourceId || null,
        p_source_player_name: r.sourceId ? r.name : null
      });
      if (error) throw error;
      const importedPlayerId = savedPlayerId || existing?.id || null;
      if (pendingImportMeta.type === 'fantrax' && r.isMinors) {
        if (!importedPlayerId) throw new Error(`Could not resolve the saved player ID for ${r.name}.`);
        const { error: minorsError } = await db.rpc('sync_front_office_player_minors_v1', {
          p_front_office_id: frontOfficeId,
          p_front_office_player_id: importedPlayerId,
          p_to_minors: true
        });
        if (minorsError) throw minorsError;
      }
    }
    importDialog.close();
    pendingImport = [];
    pendingImportMeta = { type: 'generic', skaters: 0, goalies: 0, minors: 0 };
    await loadOffice(frontOfficeId, false);
  });
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell.length || row.length) { row.push(cell.replace(/\r$/, '')); rows.push(row); }
  return rows;
}
