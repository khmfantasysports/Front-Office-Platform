'use strict';

// Fantrax/native CSV import workflow.
let importPreviewFileName = '';

function openImportDialog() {
  pendingImport = [];
  pendingImportMeta = { type: 'generic', skaters: 0, goalies: 0, minors: 0 };
  importPreviewFileName = '';

  el('csvFile').value = '';
  el('importSalaryToggle').checked = true;
  el('importSalaryToggle').disabled = false;
  el('importSalaryToggle').closest('.import-options')?.classList.remove('hidden');

  const fileLabel = importDialog.querySelector('.file-drop > span');
  if (fileLabel) fileLabel.textContent = 'Choose Fantrax or CSV file';

  const title = importDialog.querySelector('.drawer-header h3');
  if (title) title.textContent = 'Import Roster';

  const intro = importDialog.querySelector('.modal-body > p.muted');
  if (intro) intro.textContent = 'Choose a Fantrax Team Roster export or generic CSV. You will review exactly what will change before anything is saved.';

  el('importPreview').classList.add('hidden');
  el('importPreview').innerHTML = '';
  el('applyImportBtn').disabled = true;
  el('applyImportBtn').textContent = 'Apply Import';

  bindImportReviewEvents();
  importDialog.showModal();
}

function bindImportReviewEvents() {
  const salaryToggle = el('importSalaryToggle');
  if (!salaryToggle.dataset.importPreviewBound) {
    salaryToggle.dataset.importPreviewBound = 'true';
    salaryToggle.addEventListener('change', () => {
      if (pendingImport.length) renderImportPreview();
    });
  }

  const dropZone = importDialog.querySelector('.file-drop');
  if (dropZone && !dropZone.dataset.importDropBound) {
    dropZone.dataset.importDropBound = 'true';

    dropZone.addEventListener('dragover', (event) => {
      event.preventDefault();
      dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
      dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', async (event) => {
      event.preventDefault();
      dropZone.classList.remove('dragover');
      const file = event.dataTransfer?.files?.[0];
      if (file) await loadImportFile(file);
    });
  }
}

async function handleCsvFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  await loadImportFile(file);
}

async function loadImportFile(file) {
  if (!file) return;

  importPreviewFileName = file.name || 'CSV file';
  const fileLabel = importDialog.querySelector('.file-drop > span');
  if (fileLabel) fileLabel.textContent = importPreviewFileName;

  const preview = el('importPreview');
  preview.classList.remove('hidden');
  preview.innerHTML = '<div class="import-loading">Reading CSV…</div>';
  el('applyImportBtn').disabled = true;
  el('applyImportBtn').textContent = 'Apply Import';

  try {
    const text = await file.text();
    const rows = parseCsv(text);

    if (rows.length < 2) {
      pendingImport = [];
      preview.innerHTML = '<div class="import-review-error"><strong>No data rows found.</strong><span>Choose a CSV containing at least one player row.</span></div>';
      return;
    }

    const fantrax = parseFantraxTeamRoster(rows);
    if (fantrax.detected) {
      pendingImportMeta = {
        type: 'fantrax',
        skaters: fantrax.skaters,
        goalies: fantrax.goalies,
        minors: fantrax.minors
      };
      pendingImport = fantrax.rows;
    } else {
      pendingImportMeta = { type: 'generic', skaters: 0, goalies: 0, minors: 0 };
      const headers = rows[0].map((header) => header.trim());
      pendingImport = rows.slice(1)
        .filter((row) => row.some((value) => String(value).trim() !== ''))
        .map((row, index) => mapImportRow(headers, row, index + 2));
    }

    renderImportPreview();
  } catch (error) {
    console.error('CSV import read failed', error);
    pendingImport = [];
    preview.innerHTML = `<div class="import-review-error"><strong>Could not read this CSV.</strong><span>${escapeHtml(error?.message || 'Choose another file and try again.')}</span></div>`;
  }
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
    headers.forEach((header, index) => {
      record[header] = row[index] ?? '';
    });

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

  return {
    detected: detected && output.length > 0,
    rows: output,
    skaters,
    goalies,
    minors
  };
}

function isFantraxMinorsStatus(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z]/g, '');

  return normalized === 'min'
    || normalized === 'minor'
    || normalized === 'minors'
    || normalized.startsWith('minor');
}

function mapFantraxStatus(value, fallbackStatusId = null) {
  const raw = String(value || '').trim();

  if (isFantraxMinorsStatus(raw)) {
    const fallback = statusById(fallbackStatusId)
      || state.statuses.find((status) => status.name.toLowerCase() === 'active')
      || state.statuses[0];

    return {
      statusId: fallback?.id || null,
      warning: fallback ? '' : 'No roster status is available for this Minors player.'
    };
  }

  const codeMap = {
    act: 'Active',
    res: 'Reserve'
  };

  const desired = codeMap[raw.toLowerCase()] || raw;
  const status = state.statuses.find((item) =>
    item.name.toLowerCase() === desired.toLowerCase()
  );

  return {
    statusId: status?.id || null,
    warning: status ? '' : `Unmapped Fantrax status: ${raw || 'blank'}`
  };
}

function findExistingImportPlayer(sourceId, name, realTeam) {
  if (sourceId) {
    const linked = state.players.find((player) => player.fantraxId === sourceId);
    if (linked) return linked;
  }

  const normalizedName = String(name || '').trim().toLowerCase();

  return state.players.find((player) =>
    player.name.toLowerCase() === normalizedName
    && (!realTeam || !player.realTeam || player.realTeam === realTeam)
  ) || null;
}

function mapImportRow(headers, row, sourceRow) {
  const record = {};
  headers.forEach((header, index) => {
    record[header] = row[index] ?? '';
  });

  const findColumn = (...patterns) => {
    const header = headers.find((candidate) =>
      patterns.some((pattern) => pattern.test(candidate.trim()))
    );
    return header ? record[header] : '';
  };

  const name = findColumn(/^player$/i, /^name$/i, /player name/i).trim();
  const position = findColumn(/^pos$/i, /^position$/i).trim().toUpperCase() || 'F';
  const eligiblePositions = normalizeEligibility(findColumn(/^eligible$/i, /eligib/i)) || position;
  const realTeam = normalizeNhlTeam(findColumn(/^team$/i, /nhl team/i, /real team/i));
  const ageSnapshot = nullableInteger(findColumn(/^age$/i));
  const sourceId = findColumn(/^id$/i, /fantrax.*id/i).trim();
  const statusText = findColumn(/^status$/i, /roster status/i).trim();
  const status = state.statuses.find((item) =>
    item.name.toLowerCase() === statusText.toLowerCase()
  ) || state.statuses[0];

  const salaries = {};
  state.seasons.forEach((season) => {
    const label = seasonLabel(season.startYear);
    const salaryHeader = headers.find((header) =>
      normalizeHeader(header).includes(normalizeHeader(label))
      && /salary|cap|\d{4}/i.test(header)
    );

    salaries[season.id] = salaryHeader
      ? nullableNumber(String(record[salaryHeader]).replace(/[$,]/g, ''))
      : null;
  });

  const existing = findExistingImportPlayer(sourceId, name, realTeam);

  return {
    sourceRow,
    sourceType: sourceId ? 'FANTRAX' : null,
    sourceId,
    name,
    position,
    eligiblePositions,
    realTeam,
    ageSnapshot,
    statusId: status?.id || null,
    salary: null,
    salaries,
    section: '',
    isMinors: false,
    existingPlayerId: existing?.id || null,
    action: existing ? 'Update' : 'Add',
    valid: Boolean(name && status?.id),
    warning: ''
  };
}

function importExistingPlayer(row) {
  return state.players.find((player) => player.id === row.existingPlayerId)
    || findExistingImportPlayer(row.sourceId, row.name, row.realTeam);
}

function importTargetRosterGroup(row) {
  if (pendingImportMeta.type !== 'fantrax') {
    return importExistingPlayer(row)?.rosterGroup || 'ACTIVE';
  }
  return row.isMinors ? 'FARM' : 'ACTIVE';
}

function rosterGroupLabel(group) {
  return group === 'FARM' ? 'Minors' : 'Active roster';
}

function currentImportSalary(row, current) {
  if (pendingImportMeta.type === 'fantrax') return row.salary;
  return row.salaries?.[current.id] ?? null;
}

function importSalaryWillApply(row, current) {
  const incoming = currentImportSalary(row, current);
  if (incoming === null || incoming === undefined) return false;
  if (pendingImportMeta.type === 'fantrax' && !el('importSalaryToggle').checked) return false;
  return true;
}

function importSalaryChanges(row, current) {
  if (!importSalaryWillApply(row, current)) return false;

  const existing = importExistingPlayer(row);
  const saved = existing?.salaries?.[current.id]?.salary ?? null;
  const incoming = currentImportSalary(row, current);

  if (!existing) return incoming !== null;
  return Number(saved) !== Number(incoming);
}

function importRosterMovement(row) {
  if (pendingImportMeta.type !== 'fantrax') return null;

  const existing = importExistingPlayer(row);
  if (!existing) return null;

  const from = existing.rosterGroup || 'ACTIVE';
  const to = importTargetRosterGroup(row);
  if (from === to) return null;

  return { from, to };
}

function importLocationPreviewMarkup(row) {
  const target = importTargetRosterGroup(row);
  const movement = importRosterMovement(row);

  if (movement) {
    return `<span class="import-change"><span>${escapeHtml(rosterGroupLabel(movement.from))}</span><strong>→</strong><span>${escapeHtml(rosterGroupLabel(movement.to))}</span></span>`;
  }

  if (pendingImportMeta.type !== 'fantrax' && row.existingPlayerId) {
    return `<span class="import-kept">${escapeHtml(rosterGroupLabel(target))}<small>kept</small></span>`;
  }

  return escapeHtml(rosterGroupLabel(target));
}

function importSalaryPreviewMarkup(row, current) {
  const existing = importExistingPlayer(row);
  const incoming = currentImportSalary(row, current);
  const saved = existing?.salaries?.[current.id]?.salary ?? null;
  const fantrax = pendingImportMeta.type === 'fantrax';

  if (fantrax && !el('importSalaryToggle').checked) {
    return `<span class="import-kept">${saved === null ? '—' : formatMoney(saved)}<small>kept</small></span>`;
  }

  if (incoming === null || incoming === undefined) {
    return `<span class="import-kept">${saved === null ? '—' : formatMoney(saved)}<small>${existing ? 'no file value' : 'not set'}</small></span>`;
  }

  if (!existing) {
    return `<span class="import-new-value">${formatMoney(incoming)}<small>set</small></span>`;
  }

  if (Number(saved) === Number(incoming)) {
    return `<span class="import-kept">${formatMoney(incoming)}<small>no change</small></span>`;
  }

  return `<span class="import-change money-change"><span>${saved === null ? '—' : formatMoney(saved)}</span><strong>→</strong><span>${formatMoney(incoming)}</span></span>`;
}

function importReviewStats(valid, invalid, current) {
  const adds = valid.filter((row) => !importExistingPlayer(row)).length;
  const updates = valid.length - adds;
  const rosterMoves = valid.map(importRosterMovement).filter(Boolean);
  const toMinors = rosterMoves.filter((move) => move.to === 'FARM').length;
  const toActive = rosterMoves.filter((move) => move.to === 'ACTIVE').length;
  const salaryChanges = valid.filter((row) => importSalaryChanges(row, current)).length;

  return {
    ready: valid.length,
    invalid,
    adds,
    updates,
    rosterMoves: rosterMoves.length,
    toMinors,
    toActive,
    salaryChanges
  };
}

function importSafetyMarkup(fantrax) {
  if (fantrax) {
    return `<div class="import-safety-panel">
      <div>
        <span class="import-safety-icon">✓</span>
        <span><strong>What this Fantrax import updates</strong><small>Player identity, position/eligibility, NHL team, age, roster status, Fantrax link, roster location, and current salary when enabled.</small></span>
      </div>
      <div>
        <span class="import-safety-icon protected">◆</span>
        <span><strong>Protected data</strong><small>Future salaries, cap overrides, contract end, notes and financial adjustments are preserved. Players missing from this file are not removed.</small></span>
      </div>
    </div>`;
  }

  return `<div class="import-safety-panel">
    <div>
      <span class="import-safety-icon">✓</span>
      <span><strong>What this generic CSV updates</strong><small>Matched player identity/status fields and any recognized season salary columns. New valid rows are added.</small></span>
    </div>
    <div>
      <span class="import-safety-icon protected">◆</span>
      <span><strong>Protected data</strong><small>Existing roster location, contract end, notes and cap overrides are preserved. Players missing from this file are not removed.</small></span>
    </div>
  </div>`;
}

function renderImportPreview() {
  if (!pendingImport.length) return;

  const valid = pendingImport.filter((row) => row.valid);
  const invalid = pendingImport.length - valid.length;
  const current = currentSeason();
  const fantrax = pendingImportMeta.type === 'fantrax';
  const stats = importReviewStats(valid, invalid, current);
  const previewRows = pendingImport.slice(0, 30);

  const salaryOption = el('importSalaryToggle').closest('.import-options');
  if (salaryOption) salaryOption.classList.toggle('hidden', !fantrax);

  const rows = previewRows.map((row) => {
    const existing = importExistingPlayer(row);
    return `<tr class="${row.valid ? '' : 'import-invalid-row'}">
      <td>${row.sourceRow}</td>
      <td><strong>${escapeHtml(row.name || 'Missing name')}</strong>${existing ? '<small class="import-row-note">Matched existing</small>' : '<small class="import-row-note">New player</small>'}</td>
      <td>${escapeHtml(row.position)}</td>
      <td>${escapeHtml(row.realTeam || '—')}</td>
      <td>${escapeHtml(statusById(row.statusId)?.name || row.statusRaw || 'Unmapped')}</td>
      <td>${importLocationPreviewMarkup(row)}</td>
      <td>${importSalaryPreviewMarkup(row, current)}</td>
      <td><span class="import-action-badge ${existing ? 'update' : 'add'}">${existing ? 'Update' : 'Add'}</span></td>
      <td>${row.valid ? '<span class="import-ready">Ready</span>' : `<span class="danger">${escapeHtml(row.warning || 'Needs review')}</span>`}</td>
    </tr>`;
  }).join('');

  const detector = fantrax
    ? `<div class="import-detect"><span class="import-chip primary">Fantrax Team Roster</span><span class="import-chip">${pendingImportMeta.skaters} skaters</span><span class="import-chip">${pendingImportMeta.goalies} goalies</span><span class="import-chip">${pendingImportMeta.minors} minors</span>${importPreviewFileName ? `<span class="import-chip file">${escapeHtml(importPreviewFileName)}</span>` : ''}</div>`
    : `<div class="import-detect"><span class="import-chip primary">Generic CSV</span>${importPreviewFileName ? `<span class="import-chip file">${escapeHtml(importPreviewFileName)}</span>` : ''}</div>`;

  const movementDetail = fantrax
    ? `${stats.rosterMoves}${stats.rosterMoves ? ` · ${stats.toMinors} to Minors · ${stats.toActive} to Active` : ' · no location changes'}`
    : 'Not changed';

  const reviewSummary = `<div class="import-review-summary">
    <div><span>Ready</span><strong>${stats.ready}</strong><small>valid rows</small></div>
    <div><span>Add</span><strong>${stats.adds}</strong><small>new players</small></div>
    <div><span>Update</span><strong>${stats.updates}</strong><small>matched players</small></div>
    <div class="${stats.rosterMoves ? 'attention' : ''}"><span>Roster moves</span><strong>${fantrax ? stats.rosterMoves : '—'}</strong><small>${escapeHtml(movementDetail)}</small></div>
    <div class="${stats.salaryChanges ? 'attention' : ''}"><span>Salary changes</span><strong>${stats.salaryChanges}</strong><small>${seasonLabel(current.startYear)}</small></div>
    <div class="${stats.invalid ? 'warning' : ''}"><span>Skipped</span><strong>${stats.invalid}</strong><small>needs review</small></div>
  </div>`;

  const rowLimitNote = pendingImport.length > previewRows.length
    ? `<div class="import-preview-limit">Showing the first ${previewRows.length} of ${pendingImport.length} rows. All ${stats.ready} valid rows will be applied.</div>`
    : '';

  const invalidNote = invalid
    ? `<div class="import-review-warning"><strong>${invalid} row${invalid === 1 ? '' : 's'} will be skipped.</strong><span>Fix the source CSV or roster-status mapping if you want those rows included.</span></div>`
    : '';

  const preview = el('importPreview');
  preview.classList.remove('hidden');
  preview.innerHTML = `
    ${detector}
    ${reviewSummary}
    ${importSafetyMarkup(fantrax)}
    ${invalidNote}
    <div class="import-review-table-head"><strong>Player review</strong><span>Nothing is saved until you press Apply Import.</span></div>
    <div class="table-wrap import-review-table-wrap">
      <table class="import-review-table">
        <thead><tr><th>Row</th><th>Player</th><th>Pos</th><th>NHL</th><th>Status</th><th>Location</th><th>${seasonLabel(current.startYear)}</th><th>Action</th><th>Check</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    ${rowLimitNote}
  `;

  const applyButton = el('applyImportBtn');
  applyButton.disabled = valid.length === 0;
  applyButton.textContent = valid.length ? `Apply ${valid.length} Row${valid.length === 1 ? '' : 's'}` : 'Apply Import';
}

async function applyImport() {
  const rows = pendingImport.filter((row) => row.valid);
  if (!rows.length) return;

  const updateSalary = el('importSalaryToggle').checked;
  const frontOfficeId = state.frontOffice?.id;
  if (!frontOfficeId) {
    alert('Reopen this Front Office before importing.');
    return;
  }

  const button = el('applyImportBtn');
  if (button.disabled) return;

  button.disabled = true;
  button.textContent = 'Importing…';

  const success = await runCloudAction(async () => {
    for (const row of rows) {
      const existing = state.players.find((player) => player.id === row.existingPlayerId)
        || findExistingImportPlayer(row.sourceId, row.name, row.realTeam);

      const salaryRows = state.seasons.map((season) => {
        const currentData = existing?.salaries?.[season.id] || {
          salary: null,
          capOverride: null
        };

        let incoming = row.salaries?.[season.id] ?? null;

        if (
          pendingImportMeta.type === 'fantrax'
          && season.id === currentSeason()?.id
          && updateSalary
        ) {
          incoming = row.salary;
        }

        if (
          pendingImportMeta.type === 'fantrax'
          && season.id !== currentSeason()?.id
        ) {
          incoming = null;
        }

        if (
          pendingImportMeta.type === 'fantrax'
          && !updateSalary
        ) {
          incoming = null;
        }

        return {
          season_id: season.id,
          salary: incoming === null ? currentData.salary : incoming,
          cap_override: currentData.capOverride ?? null
        };
      });

      const { data: savedPlayerId, error } = await db.rpc('save_front_office_player_v2', {
        p_front_office_id: frontOfficeId,
        p_front_office_player_id: existing?.id || null,
        p_player_name: row.name,
        p_position: row.position || existing?.position || 'F',
        p_eligible_positions: row.eligiblePositions || existing?.eligiblePositions || row.position || 'F',
        p_real_team: row.realTeam || existing?.realTeam || null,
        p_age_snapshot: row.ageSnapshot ?? existing?.ageSnapshot ?? null,
        p_age_as_of: (row.ageSnapshot ?? existing?.ageSnapshot) === null
          || (row.ageSnapshot ?? existing?.ageSnapshot) === undefined
          ? null
          : todayIsoDate(),
        p_roster_status_id: row.statusId || existing?.statusId || state.statuses[0]?.id,
        p_contract_end_season_id: existing?.contractEndSeasonId || null,
        p_notes: existing?.notes || null,
        p_salary_rows: salaryRows,
        p_source_system: row.sourceId ? 'FANTRAX' : null,
        p_source_player_id: row.sourceId || null,
        p_source_player_name: row.sourceId ? row.name : null
      });

      if (error) throw error;

      const importedPlayerId = savedPlayerId || existing?.id || null;

      // Fantrax roster location is authoritative for this source sync.
      // The existing RPC supports both FARM (true) and ACTIVE (false) without
      // creating a fantasy transaction ledger entry.
      if (pendingImportMeta.type === 'fantrax') {
        if (!importedPlayerId) {
          throw new Error(`Could not resolve the saved player ID for ${row.name}.`);
        }

        const { error: rosterSyncError } = await db.rpc('sync_front_office_player_minors_v1', {
          p_front_office_id: frontOfficeId,
          p_front_office_player_id: importedPlayerId,
          p_to_minors: Boolean(row.isMinors)
        });

        if (rosterSyncError) throw rosterSyncError;
      }
    }

    await loadOffice(frontOfficeId, false);

    importDialog.close();
    pendingImport = [];
    pendingImportMeta = { type: 'generic', skaters: 0, goalies: 0, minors: 0 };
    importPreviewFileName = '';
  });

  if (!success && importDialog.open) {
    button.disabled = false;
    renderImportPreview();
  }
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }

  if (cell.length || row.length) {
    row.push(cell.replace(/\r$/, ''));
    rows.push(row);
  }

  return rows;
}
