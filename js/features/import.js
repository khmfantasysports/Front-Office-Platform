'use strict';

// Fantrax/native CSV import workflow.
let importPreviewFileName = '';

function openImportDialog() {
  pendingImport = [];
  pendingImportMeta = { type: 'generic', skaters: 0, goalies: 0, minors: 0, backupVersion: '', backupTeam: '', backupLeague: '', backupWarnings: [] };
  importPreviewFileName = '';

  el('csvFile').value = '';
  el('importSalaryToggle').checked = true;
  el('importSalaryToggle').disabled = false;
  el('importSalaryToggle').closest('.import-options')?.classList.remove('hidden');

  const fileLabel = importDialog.querySelector('.file-drop > span');
  if (fileLabel) fileLabel.textContent = 'Choose RosterCap, Fantrax or CSV file';

  const title = importDialog.querySelector('.drawer-header h3');
  if (title) title.textContent = 'Import Roster';

  const intro = importDialog.querySelector('.modal-body > p.muted');
  if (intro) intro.textContent = 'Choose a RosterCap roster backup, Fantrax Team Roster export, or generic CSV. You will review exactly what will change before anything is saved.';

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

    const backup = parseRosterCapRosterBackup(rows);
    const fantrax = backup.detected
      ? { detected:false, rows:[], skaters:0, goalies:0, minors:0 }
      : parseFantraxTeamRoster(rows);

    if (backup.detected) {
      pendingImportMeta = {
        type: 'rostercap_backup',
        skaters: 0,
        goalies: 0,
        minors: backup.rows.filter((row) => row.rosterGroup === 'FARM').length,
        backupVersion: backup.version,
        backupTeam: backup.team,
        backupLeague: backup.league,
        backupWarnings: backup.warnings
      };
      pendingImport = backup.rows;
    } else if (fantrax.detected) {
      pendingImportMeta = {
        type: 'fantrax',
        skaters: fantrax.skaters,
        goalies: fantrax.goalies,
        minors: fantrax.minors,
        backupVersion: '',
        backupTeam: '',
        backupLeague: '',
        backupWarnings: []
      };
      pendingImport = fantrax.rows;
    } else {
      pendingImportMeta = {
        type: 'generic',
        skaters: 0,
        goalies: 0,
        minors: 0,
        backupVersion: '',
        backupTeam: '',
        backupLeague: '',
        backupWarnings: []
      };
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


function backupBoolean(value, fallback = false) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (['yes','true','1','y'].includes(normalized)) return true;
  if (['no','false','0','n'].includes(normalized)) return false;
  return fallback;
}

function backupRosterGroup(value) {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z]/g, '');

  if (normalized === 'farm' || normalized === 'minor' || normalized === 'minors') return 'FARM';
  if (normalized === 'active' || normalized === 'activeroster') return 'ACTIVE';
  return null;
}

function backupSeasonIdFromLabel(value) {
  const normalized = normalizeHeader(value);
  if (!normalized) return null;

  return state.seasons.find((season) =>
    normalizeHeader(seasonLabel(season.startYear)) === normalized
  )?.id || null;
}

function parseBackupDepthAssignments(value) {
  const raw = String(value || '').trim();
  if (!raw) return { assignments:[], warning:'' };

  const assignments = [];
  const invalid = [];

  raw.split('|').map((item) => item.trim()).filter(Boolean).forEach((item) => {
    const match = item.match(/^([A-Za-z]+)\s*:\s*(\d+)$/);
    if (!match) {
      invalid.push(item);
      return;
    }

    const position = match[1].toUpperCase();
    const order = Number(match[2]);

    if (!['LW','C','RW','D','G'].includes(position) || !Number.isInteger(order) || order < 1) {
      invalid.push(item);
      return;
    }

    assignments.push({ position, order });
  });

  return {
    assignments,
    warning: invalid.length ? `Invalid depth assignment: ${invalid.join(', ')}` : ''
  };
}

function parseRosterCapRosterBackup(rows) {
  const headers = (rows[0] || []).map((header) => String(header || '').trim());
  const versionHeader = headers.find((header) =>
    normalizeHeader(header) === normalizeHeader('RosterCap Backup Version')
  );

  if (!versionHeader) {
    return { detected:false, rows:[], version:'', team:'', league:'', warnings:[] };
  }

  const recordFor = (row) => {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = row[index] ?? '';
    });
    return record;
  };

  const findHeader = (...names) => headers.find((header) =>
    names.some((name) => normalizeHeader(header) === normalizeHeader(name))
  ) || null;

  const requiredHeaders = [
    'RosterCap Backup Version',
    'Player',
    'Pos',
    'Eligible',
    'Status',
    'Prospect',
    'Roster Location',
    'Contract End',
    'Notes'
  ];

  const missingRequired = requiredHeaders.filter((name) => !findHeader(name));

  const seasonHeaderPairs = state.seasons.map((season) => {
    const label = seasonLabel(season.startYear);
    return {
      season,
      salary: findHeader(`${label} Salary`),
      capOverride: findHeader(`${label} Cap Override`)
    };
  });

  const missingSeasonColumns = seasonHeaderPairs.flatMap(({ season, salary, capOverride }) => {
    const label = seasonLabel(season.startYear);
    return [
      ...(salary ? [] : [`${label} Salary`]),
      ...(capOverride ? [] : [`${label} Cap Override`])
    ];
  });

  const firstDataRecord = rows.slice(1)
    .filter((row) => row.some((value) => String(value).trim() !== ''))
    .map(recordFor)[0] || {};

  const version = String(firstDataRecord[versionHeader] || '').trim();
  const teamHeader = findHeader('Backup Team');
  const leagueHeader = findHeader('Backup League');
  const team = teamHeader ? String(firstDataRecord[teamHeader] || '').trim() : '';
  const league = leagueHeader ? String(firstDataRecord[leagueHeader] || '').trim() : '';

  const warnings = [];
  if (version !== 'ROSTERCAP_ROSTER_BACKUP_V1') {
    warnings.push(`Unsupported backup version: ${version || 'blank'}`);
  }
  if (missingRequired.length) {
    warnings.push(`Missing required columns: ${missingRequired.join(', ')}`);
  }
  if (missingSeasonColumns.length) {
    warnings.push(`Backup season horizon does not match this Front Office: ${missingSeasonColumns.join(', ')}`);
  }
  if (team && state.frontOffice?.teamName && team !== state.frontOffice.teamName) {
    warnings.push(`Backup team is ${team}; current Front Office is ${state.frontOffice.teamName}.`);
  }
  if (league && state.frontOffice?.leagueName && league !== state.frontOffice.leagueName) {
    warnings.push(`Backup league is ${league}; current Front Office is ${state.frontOffice.leagueName}.`);
  }

  const schemaValid =
    version === 'ROSTERCAP_ROSTER_BACKUP_V1'
    && missingRequired.length === 0
    && missingSeasonColumns.length === 0;

  const playerIdHeader = findHeader('RosterCap Player ID');
  const sourceIdHeader = findHeader('Fantrax ID');
  const nameHeader = findHeader('Player');
  const positionHeader = findHeader('Pos');
  const eligibleHeader = findHeader('Eligible');
  const teamValueHeader = findHeader('NHL Team');
  const ageHeader = findHeader('Age');
  const ageAsOfHeader = findHeader('Age As Of');
  const statusHeader = findHeader('Status');
  const prospectHeader = findHeader('Prospect');
  const rosterHeader = findHeader('Roster Location');
  const contractEndHeader = findHeader('Contract End');
  const depthHeader = findHeader('Depth Assignments');
  const notesHeader = findHeader('Notes');

  const parsedRows = rows.slice(1)
    .filter((row) => row.some((value) => String(value).trim() !== ''))
    .map((row, index) => {
      const record = recordFor(row);
      const sourceRow = index + 2;

      const backupPlayerId = playerIdHeader
        ? String(record[playerIdHeader] || '').trim()
        : '';
      const sourceId = sourceIdHeader
        ? String(record[sourceIdHeader] || '').trim()
        : '';
      const name = String(record[nameHeader] || '').trim();
      const position = String(record[positionHeader] || '').trim().toUpperCase() || 'F';
      const eligiblePositions = normalizeEligibility(record[eligibleHeader]) || position;
      const realTeam = normalizeNhlTeam(teamValueHeader ? record[teamValueHeader] : '');
      const ageSnapshot = nullableInteger(ageHeader ? record[ageHeader] : '');
      const ageAsOf = ageAsOfHeader ? String(record[ageAsOfHeader] || '').trim() : '';

      const statusText = String(record[statusHeader] || '').trim();
      const status = state.statuses.find((item) =>
        item.name.toLowerCase() === statusText.toLowerCase()
      ) || null;

      const isProspect = backupBoolean(record[prospectHeader], false);
      const rosterGroup = backupRosterGroup(record[rosterHeader]);

      const contractEndRaw = String(record[contractEndHeader] || '').trim();
      const contractEndSeasonId = contractEndRaw
        ? backupSeasonIdFromLabel(contractEndRaw)
        : null;

      const depth = parseBackupDepthAssignments(depthHeader ? record[depthHeader] : '');

      const salaries = {};
      const capOverrides = {};
      seasonHeaderPairs.forEach(({ season, salary, capOverride }) => {
        salaries[season.id] = salary
          ? nullableNumber(String(record[salary] ?? '').replace(/[$,]/g, ''))
          : null;
        capOverrides[season.id] = capOverride
          ? nullableNumber(String(record[capOverride] ?? '').replace(/[$,]/g, ''))
          : null;
      });

      const rowWarnings = [];
      if (!schemaValid) rowWarnings.push('Backup schema is not compatible with this Front Office.');
      if (!name) rowWarnings.push('Missing player name.');
      if (!status) rowWarnings.push(`Roster status not found: ${statusText || 'blank'}.`);
      if (!rosterGroup) rowWarnings.push(`Invalid roster location: ${String(record[rosterHeader] || '').trim() || 'blank'}.`);
      if (rosterGroup === 'FARM' && !isProspect) rowWarnings.push('A Minors player must be marked Prospect.');
      if (contractEndRaw && !contractEndSeasonId) rowWarnings.push(`Contract End season is not in this Front Office: ${contractEndRaw}.`);
      if (depth.warning) rowWarnings.push(depth.warning);

      const existing = findExistingImportPlayer(sourceId, name, realTeam, backupPlayerId);

      return {
        sourceRow,
        sourceType: 'ROSTERCAP_BACKUP',
        backupPlayerId,
        sourceId,
        name,
        position,
        eligiblePositions,
        realTeam,
        ageSnapshot,
        ageAsOf: ageAsOf || null,
        statusId: status?.id || null,
        statusRaw: statusText,
        isProspect,
        rosterGroup,
        isMinors: rosterGroup === 'FARM',
        salary: null,
        salaries,
        capOverrides,
        contractEndSeasonId,
        notes: notesHeader ? String(record[notesHeader] ?? '') : '',
        depthAssignments: depth.assignments,
        section: '',
        existingPlayerId: existing?.id || null,
        action: existing ? 'Restore' : 'Add',
        valid: rowWarnings.length === 0,
        warning: rowWarnings.join(' ')
      };
    });

  return {
    detected: true,
    rows: parsedRows,
    version,
    team,
    league,
    warnings
  };
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

function findExistingImportPlayer(sourceId, name, realTeam, backupPlayerId = null) {
  if (backupPlayerId) {
    const exact = state.players.find((player) => player.id === backupPlayerId);
    if (exact) return exact;
  }

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
    || findExistingImportPlayer(
      row.sourceId,
      row.name,
      row.realTeam,
      row.backupPlayerId || null
    );
}

function importTargetRosterGroup(row) {
  if (pendingImportMeta.type === 'rostercap_backup') {
    return row.rosterGroup || 'ACTIVE';
  }

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
  if (pendingImportMeta.type === 'rostercap_backup') return true;

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

  if (saved === null || saved === undefined || incoming === null || incoming === undefined) {
    return (saved ?? null) !== (incoming ?? null);
  }

  return Number(saved) !== Number(incoming);
}

function importRosterMovement(row) {
  if (!['fantrax','rostercap_backup'].includes(pendingImportMeta.type)) return null;

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

  if (pendingImportMeta.type === 'generic' && row.existingPlayerId) {
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
    if (pendingImportMeta.type === 'rostercap_backup') {
      if (!existing || saved === null || saved === undefined) {
        return `<span class="import-kept">—<small>not set</small></span>`;
      }
      return `<span class="import-change money-change"><span>${formatMoney(saved)}</span><strong>→</strong><span>—</span></span>`;
    }

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

function importSafetyMarkup(fantrax, backup = false) {
  if (backup) {
    return `<div class="import-safety-panel">
      <div>
        <span class="import-safety-icon">✓</span>
        <span><strong>Roster + contract restore</strong><small>Restores listed players' identity, roster status, Prospect flag, Active/Minors location, age/as-of date, Fantrax ID, all seven salaries, all seven cap overrides, contract end, notes and depth-chart placement.</small></span>
      </div>
      <div>
        <span class="import-safety-icon protected">◆</span>
        <span><strong>Protected history</strong><small>Transactions, Draft history, Dead Cap, financial adjustments and Assets are not imported or duplicated. Players missing from this backup are not removed.</small></span>
      </div>
    </div>`;
  }

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
  const backup = pendingImportMeta.type === 'rostercap_backup';
  const stats = importReviewStats(valid, invalid, current);
  const previewRows = pendingImport.slice(0, 30);

  const salaryOption = el('importSalaryToggle').closest('.import-options');
  if (salaryOption) salaryOption.classList.toggle('hidden', !fantrax);

  const dialogTitle = importDialog.querySelector('.drawer-header h3');
  if (dialogTitle) dialogTitle.textContent = backup ? 'Restore Roster Backup' : 'Import Roster';

  const intro = importDialog.querySelector('.modal-body > p.muted');
  if (intro && backup) {
    intro.textContent = 'Review the listed player, roster and contract changes. Transactions, Assets and financial history will not be touched.';
  }

  const rows = previewRows.map((row) => {
    const existing = importExistingPlayer(row);
    const actionLabel = backup && existing ? 'Restore' : (existing ? 'Update' : 'Add');
    return `<tr class="${row.valid ? '' : 'import-invalid-row'}">
      <td>${row.sourceRow}</td>
      <td><strong>${escapeHtml(row.name || 'Missing name')}</strong>${existing ? '<small class="import-row-note">Matched existing</small>' : '<small class="import-row-note">New player</small>'}</td>
      <td>${escapeHtml(row.position)}</td>
      <td>${escapeHtml(row.realTeam || '—')}</td>
      <td>${escapeHtml(statusById(row.statusId)?.name || row.statusRaw || 'Unmapped')}</td>
      <td>${importLocationPreviewMarkup(row)}</td>
      <td>${importSalaryPreviewMarkup(row, current)}</td>
      <td><span class="import-action-badge ${existing ? 'update' : 'add'}">${actionLabel}</span></td>
      <td>${row.valid ? '<span class="import-ready">Ready</span>' : `<span class="danger">${escapeHtml(row.warning || 'Needs review')}</span>`}</td>
    </tr>`;
  }).join('');

  const detector = backup
    ? `<div class="import-detect"><span class="import-chip primary">RosterCap Roster Backup</span><span class="import-chip">${escapeHtml(pendingImportMeta.backupVersion || 'V1')}</span><span class="import-chip">${pendingImportMeta.minors} minors</span>${pendingImportMeta.backupTeam ? `<span class="import-chip">${escapeHtml(pendingImportMeta.backupTeam)}</span>` : ''}${importPreviewFileName ? `<span class="import-chip file">${escapeHtml(importPreviewFileName)}</span>` : ''}</div>`
    : fantrax
      ? `<div class="import-detect"><span class="import-chip primary">Fantrax Team Roster</span><span class="import-chip">${pendingImportMeta.skaters} skaters</span><span class="import-chip">${pendingImportMeta.goalies} goalies</span><span class="import-chip">${pendingImportMeta.minors} minors</span>${importPreviewFileName ? `<span class="import-chip file">${escapeHtml(importPreviewFileName)}</span>` : ''}</div>`
      : `<div class="import-detect"><span class="import-chip primary">Generic CSV</span>${importPreviewFileName ? `<span class="import-chip file">${escapeHtml(importPreviewFileName)}</span>` : ''}</div>`;

  const movementDetail = (fantrax || backup)
    ? `${stats.rosterMoves}${stats.rosterMoves ? ` · ${stats.toMinors} to Minors · ${stats.toActive} to Active` : ' · no location changes'}`
    : 'Not changed';

  const reviewSummary = `<div class="import-review-summary">
    <div><span>Ready</span><strong>${stats.ready}</strong><small>valid rows</small></div>
    <div><span>Add</span><strong>${stats.adds}</strong><small>new players</small></div>
    <div><span>${backup ? 'Restore' : 'Update'}</span><strong>${stats.updates}</strong><small>matched players</small></div>
    <div class="${stats.rosterMoves ? 'attention' : ''}"><span>Roster moves</span><strong>${(fantrax || backup) ? stats.rosterMoves : '—'}</strong><small>${escapeHtml(movementDetail)}</small></div>
    <div class="${stats.salaryChanges ? 'attention' : ''}"><span>Salary changes</span><strong>${stats.salaryChanges}</strong><small>${seasonLabel(current.startYear)}</small></div>
    <div class="${stats.invalid ? 'warning' : ''}"><span>Skipped</span><strong>${stats.invalid}</strong><small>needs review</small></div>
  </div>`;

  const rowLimitNote = pendingImport.length > previewRows.length
    ? `<div class="import-preview-limit">Showing the first ${previewRows.length} of ${pendingImport.length} rows. All ${stats.ready} valid rows will be applied.</div>`
    : '';

  const backupWarnings = backup && pendingImportMeta.backupWarnings?.length
    ? `<div class="import-review-warning"><strong>Backup compatibility notice</strong><span>${escapeHtml(pendingImportMeta.backupWarnings.join(' '))}</span></div>`
    : '';

  const invalidNote = invalid
    ? `<div class="import-review-warning"><strong>${invalid} row${invalid === 1 ? '' : 's'} will be skipped.</strong><span>${backup ? 'Restore requires matching season columns and roster-status names.' : 'Fix the source CSV or roster-status mapping if you want those rows included.'}</span></div>`
    : '';

  const preview = el('importPreview');
  preview.classList.remove('hidden');
  preview.innerHTML = `
    ${detector}
    ${reviewSummary}
    ${importSafetyMarkup(fantrax, backup)}
    ${backupWarnings}
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
  applyButton.textContent = valid.length
    ? (backup
        ? `Restore ${valid.length} Player${valid.length === 1 ? '' : 's'}`
        : `Apply ${valid.length} Row${valid.length === 1 ? '' : 's'}`)
    : 'Apply Import';
}

async function restoreBackupDepthCharts(savedRows) {
  const restoredIds = new Set(
    savedRows.map((item) => item.playerId).filter(Boolean)
  );

  const desiredByPosition = new Map();
  savedRows.forEach(({ row, playerId }) => {
    (row.depthAssignments || []).forEach((assignment) => {
      if (!desiredByPosition.has(assignment.position)) {
        desiredByPosition.set(assignment.position, []);
      }
      desiredByPosition.get(assignment.position).push({
        playerId,
        order: assignment.order
      });
    });
  });

  const positions = new Set([
    ...Object.keys(state.depthCharts || {}),
    ...desiredByPosition.keys()
  ]);

  for (const position of positions) {
    const desired = (desiredByPosition.get(position) || [])
      .sort((a,b) => a.order - b.order)
      .map((item) => item.playerId);

    const untouched = (state.depthCharts?.[position] || [])
      .filter((playerId) => !restoredIds.has(playerId));

    const finalOrder = [...desired, ...untouched];

    const { error } = await db.rpc('save_depth_chart_order_v1', {
      p_front_office_id: state.frontOffice.id,
      p_position_code: position,
      p_player_ids: finalOrder
    });

    if (error) throw error;
  }
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

  const backup = pendingImportMeta.type === 'rostercap_backup';
  const button = el('applyImportBtn');
  if (button.disabled) return;

  button.disabled = true;
  button.textContent = backup ? 'Restoring…' : 'Importing…';

  const success = await runCloudAction(async () => {
    const restoredRows = [];

    for (const row of rows) {
      const existing = state.players.find((player) => player.id === row.existingPlayerId)
        || findExistingImportPlayer(
          row.sourceId,
          row.name,
          row.realTeam,
          row.backupPlayerId || null
        );

      const salaryRows = state.seasons.map((season) => {
        const currentData = existing?.salaries?.[season.id] || {
          salary: null,
          capOverride: null
        };

        if (backup) {
          return {
            season_id: season.id,
            salary: row.salaries?.[season.id] ?? null,
            cap_override: row.capOverrides?.[season.id] ?? null
          };
        }

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
        p_real_team: backup
          ? (row.realTeam || null)
          : (row.realTeam || existing?.realTeam || null),
        p_age_snapshot: backup
          ? (row.ageSnapshot ?? null)
          : (row.ageSnapshot ?? existing?.ageSnapshot ?? null),
        p_age_as_of: backup
          ? (row.ageAsOf || null)
          : ((row.ageSnapshot ?? existing?.ageSnapshot) === null
              || (row.ageSnapshot ?? existing?.ageSnapshot) === undefined
            ? null
            : todayIsoDate()),
        p_roster_status_id: row.statusId || existing?.statusId || state.statuses[0]?.id,
        p_contract_end_season_id: backup
          ? (row.contractEndSeasonId || null)
          : (existing?.contractEndSeasonId || null),
        p_notes: backup
          ? (row.notes || null)
          : (existing?.notes || null),
        p_salary_rows: salaryRows,
        p_source_system: row.sourceId ? 'FANTRAX' : null,
        p_source_player_id: row.sourceId || null,
        p_source_player_name: row.sourceId ? row.name : null
      });

      if (error) throw error;

      const importedPlayerId = savedPlayerId || existing?.id || null;
      if (!importedPlayerId) {
        throw new Error(`Could not resolve the saved player ID for ${row.name}.`);
      }

      if (pendingImportMeta.type === 'fantrax' || backup) {
        const { error: rosterSyncError } = await db.rpc('sync_front_office_player_minors_v1', {
          p_front_office_id: frontOfficeId,
          p_front_office_player_id: importedPlayerId,
          p_to_minors: backup
            ? row.rosterGroup === 'FARM'
            : Boolean(row.isMinors)
        });

        if (rosterSyncError) throw rosterSyncError;
      }

      if (backup) {
        const { error: prospectError } = await db.rpc('set_front_office_player_prospect_v1', {
          p_front_office_id: frontOfficeId,
          p_front_office_player_id: importedPlayerId,
          p_is_prospect: Boolean(row.isProspect)
        });

        if (prospectError) throw prospectError;

        restoredRows.push({ row, playerId: importedPlayerId });
      }
    }

    if (backup && restoredRows.length) {
      await restoreBackupDepthCharts(restoredRows);
    }

    await loadOffice(frontOfficeId, false);

    importDialog.close();
    pendingImport = [];
    pendingImportMeta = {
      type: 'generic',
      skaters: 0,
      goalies: 0,
      minors: 0,
      backupVersion: '',
      backupTeam: '',
      backupLeague: '',
      backupWarnings: []
    };
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
