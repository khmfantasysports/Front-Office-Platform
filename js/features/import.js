'use strict';

// ============================================================================
// RosterCap V2.99 — Multi-sport CSV adapters + Roster Backup V2
//
// Supported external Fantrax Team Roster adapters:
// - NHL
// - NFL
// - NBA
// - MLB
//
// Design rules:
// - Target Front Office sport/configuration is authoritative.
// - Fantrax lineup-slot labels are not silently converted into player positions.
// - Existing RosterCap Roster Backup V1 remains readable with its NHL semantics.
// - New exports use ROSTERCAP_ROSTER_BACKUP_V2 with generic Team / Sport / Group
//   fields.
// - Fantrax current salary is optional. A file with no Salary column (for
//   example the supplied NBA sample) imports normally and preserves salary.
// - Future salaries, cap overrides, contract end, notes and financial history
//   remain protected from Fantrax imports.
// ============================================================================

const ROSTERCAP_IMPORT_VERSION_V299 = 'V2.99.1';
const ROSTERCAP_BACKUP_V1 = 'ROSTERCAP_ROSTER_BACKUP_V1';
const ROSTERCAP_BACKUP_V2 = 'ROSTERCAP_ROSTER_BACKUP_V2';

let importPreviewFileName = '';

function blankImportMetaV299() {
  return {
    type: 'generic',
    sport: activeImportSportV299(),
    players: 0,
    minors: 0,
    sections: [],
    sectionCounts: {},
    hasSalary: false,
    backupVersion: '',
    backupSport: '',
    backupTeam: '',
    backupLeague: '',
    backupWarnings: []
  };
}

function activeImportSportV299() {
  const raw = String(state?.frontOffice?.sport || 'NHL').trim().toUpperCase();
  return ['NHL','NFL','NBA','MLB'].includes(raw) ? raw : 'NHL';
}

function importSportConfigV299(sport = activeImportSportV299()) {
  return window.RosterCapSports?.get?.(sport) || null;
}

function importAvailablePositionCodesV299(sport = activeImportSportV299()) {
  const configured = window.RosterCapPositionConfig?.available?.(sport);
  const fallback = importSportConfigV299(sport)?.player?.positions || [];
  return [...new Set((configured || fallback || [])
    .map((value) => String(value || '').trim().toUpperCase())
    .filter(Boolean))];
}

function importActivePositionCodesV299() {
  const active = window.RosterCapPositionConfig?.active?.();
  return [...new Set((active || [])
    .map((value) => String(value || '').trim().toUpperCase())
    .filter(Boolean))];
}

function importDefaultPositionV299(sport = activeImportSportV299()) {
  const active = importActivePositionCodesV299();
  if (active.length) return active[0];

  const defaults = importSportConfigV299(sport)?.player?.defaultPositions || [];
  return String(defaults[0] || importAvailablePositionCodesV299(sport)[0] || '').toUpperCase();
}

function importDevelopmentLabelV299() {
  return window.RosterCapTerminology?.developmentLabel?.()
    || 'Minors';
}

function importPrimaryRosterLabelV299() {
  return importSportConfigV299()?.terminology?.primaryRoster
    || 'Active roster';
}

function openImportDialog() {
  pendingImport = [];
  pendingImportMeta = blankImportMetaV299();
  importPreviewFileName = '';

  el('csvFile').value = '';

  const salaryToggle = el('importSalaryToggle');
  salaryToggle.checked = true;
  salaryToggle.disabled = false;
  salaryToggle.closest('.import-options')?.classList.add('hidden');

  const fileLabel = importDialog.querySelector('.file-drop > span');
  if (fileLabel) fileLabel.textContent = 'Choose RosterCap, Fantrax or CSV file';

  const sport = activeImportSportV299();

  const title = importDialog.querySelector('.drawer-header h3');
  if (title) title.textContent = 'Import Roster';

  const intro = importDialog.querySelector('.modal-body > p.muted');
  if (intro) {
    intro.textContent =
      `Choose a RosterCap roster backup, Fantrax ${sport} Team Roster export, or generic CSV. `
      + 'You will review exactly what will change before anything is saved.';
  }

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
      preview.innerHTML =
        '<div class="import-review-error"><strong>No data rows found.</strong>'
        + '<span>Choose a CSV containing at least one player row.</span></div>';
      return;
    }

    const backup = parseRosterCapRosterBackup(rows);
    const fantrax = backup.detected
      ? { detected:false, rows:[] }
      : parseFantraxTeamRoster(rows);

    if (backup.detected) {
      pendingImportMeta = {
        ...blankImportMetaV299(),
        type: 'rostercap_backup',
        sport: activeImportSportV299(),
        players: backup.rows.length,
        minors: backup.rows.filter((row) => row.rosterGroup === 'FARM').length,
        backupVersion: backup.version,
        backupSport: backup.sport,
        backupTeam: backup.team,
        backupLeague: backup.league,
        backupWarnings: backup.warnings
      };
      pendingImport = backup.rows;
    } else if (fantrax.detected) {
      pendingImportMeta = {
        ...blankImportMetaV299(),
        type: 'fantrax',
        sport: fantrax.sport,
        players: fantrax.rows.length,
        minors: fantrax.minors,
        sections: fantrax.sections,
        sectionCounts: fantrax.sectionCounts,
        hasSalary: fantrax.hasSalary
      };
      pendingImport = fantrax.rows;
    } else {
      pendingImportMeta = {
        ...blankImportMetaV299(),
        type: 'generic'
      };

      const headers = rows[0].map((header) => String(header || '').trim());
      pendingImport = rows.slice(1)
        .filter((row) => row.some((value) => String(value).trim() !== ''))
        .map((row, index) => mapImportRow(headers, row, index + 2));

      pendingImportMeta.players = pendingImport.length;
    }

    renderImportPreview();
  } catch (error) {
    console.error('CSV import read failed', error);
    pendingImport = [];
    preview.innerHTML =
      `<div class="import-review-error"><strong>Could not read this CSV.</strong>`
      + `<span>${escapeHtml(error?.message || 'Choose another file and try again.')}</span></div>`;
  }
}

// ---------------------------------------------------------------------------
// RosterCap backup V1 + V2
// ---------------------------------------------------------------------------

function backupBooleanV299(value, fallback = false) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (['yes','true','1','y'].includes(normalized)) return true;
  if (['no','false','0','n'].includes(normalized)) return false;
  return fallback;
}

function backupRosterGroupV299(value) {
  const normalized = String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, '');

  if (['FARM','MINOR','MINORS','DEVELOPMENT'].includes(normalized)) return 'FARM';
  if (['ACTIVE','ACTIVEROSTER','PRIMARYROSTER'].includes(normalized)) return 'ACTIVE';
  return null;
}

function backupSeasonIdFromLabelV299(value) {
  const normalized = normalizeHeader(value);
  if (!normalized) return null;

  return state.seasons.find((season) =>
    normalizeHeader(seasonLabel(season.startYear)) === normalized
  )?.id || null;
}

function parseBackupDepthAssignmentsV1(value) {
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

    if (
      !['LW','C','RW','D','G'].includes(position)
      || !Number.isInteger(order)
      || order < 1
    ) {
      invalid.push(item);
      return;
    }

    assignments.push({ position, order });
  });

  return {
    assignments,
    warning: invalid.length
      ? `Invalid V1 depth assignment: ${invalid.join(', ')}`
      : ''
  };
}

function parseBackupDepthAssignmentsV2(value) {
  const raw = String(value || '').trim();
  if (!raw) return { assignments:[], warning:'' };

  const assignments = [];
  const invalid = [];

  raw.split('|').map((item) => item.trim()).filter(Boolean).forEach((item) => {
    const match = item.match(/^([A-Za-z0-9_+\-]+)\s*:\s*(\d+)$/);
    if (!match) {
      invalid.push(item);
      return;
    }

    const position = match[1].toUpperCase();
    const order = Number(match[2]);

    if (!position || position.length > 32 || !Number.isInteger(order) || order < 1) {
      invalid.push(item);
      return;
    }

    assignments.push({ position, order });
  });

  return {
    assignments,
    warning: invalid.length
      ? `Invalid depth assignment: ${invalid.join(', ')}`
      : ''
  };
}

function parseRosterCapRosterBackup(rows) {
  const headers = (rows[0] || []).map((header) => String(header || '').trim());

  const findHeader = (...names) => headers.find((header) =>
    names.some((name) => normalizeHeader(header) === normalizeHeader(name))
  ) || null;

  const versionHeader = findHeader('RosterCap Backup Version');

  if (!versionHeader) {
    return {
      detected:false,
      rows:[],
      version:'',
      sport:'',
      team:'',
      league:'',
      warnings:[]
    };
  }

  const recordFor = (row) => {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = row[index] ?? '';
    });
    return record;
  };

  const dataRecords = rows.slice(1)
    .filter((row) => row.some((value) => String(value).trim() !== ''))
    .map(recordFor);

  const first = dataRecords[0] || {};
  const version = String(first[versionHeader] || '').trim();

  const isV1 = version === ROSTERCAP_BACKUP_V1;
  const isV2 = version === ROSTERCAP_BACKUP_V2;

  const teamHeader = findHeader('Backup Team');
  const leagueHeader = findHeader('Backup League');
  const sportHeader = findHeader('Backup Sport');

  const team = teamHeader ? String(first[teamHeader] || '').trim() : '';
  const league = leagueHeader ? String(first[leagueHeader] || '').trim() : '';
  const sport = sportHeader ? String(first[sportHeader] || '').trim().toUpperCase() : '';

  const requiredV1 = [
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

  const requiredV2 = [
    'RosterCap Backup Version',
    'Backup Sport',
    'Player',
    'Pos',
    'Eligible',
    'Team',
    'Status',
    'Prospect',
    'Roster Group Key',
    'Contract End',
    'Notes'
  ];

  const requiredHeaders = isV1 ? requiredV1 : requiredV2;
  const missingRequired = requiredHeaders.filter((name) => !findHeader(name));

  const seasonHeaderPairs = state.seasons.map((season) => {
    const label = seasonLabel(season.startYear);
    return {
      season,
      salary: findHeader(`${label} Salary`),
      capOverride: findHeader(`${label} Cap Override`)
    };
  });

  const missingSeasonColumns = seasonHeaderPairs.flatMap(
    ({ season, salary, capOverride }) => {
      const label = seasonLabel(season.startYear);
      return [
        ...(salary ? [] : [`${label} Salary`]),
        ...(capOverride ? [] : [`${label} Cap Override`])
      ];
    }
  );

  const warnings = [];
  const targetSport = activeImportSportV299();

  if (!isV1 && !isV2) {
    warnings.push(`Unsupported backup version: ${version || 'blank'}.`);
  }

  if (isV1 && targetSport !== 'NHL') {
    warnings.push(
      `Backup V1 uses NHL-specific Team / Active / Minors / depth semantics and can only be restored into an NHL Front Office.`
    );
  }

  if (isV2 && sport !== targetSport) {
    warnings.push(
      `Backup sport is ${sport || 'blank'}; current Front Office sport is ${targetSport}.`
    );
  }

  if (missingRequired.length) {
    warnings.push(`Missing required columns: ${missingRequired.join(', ')}.`);
  }

  if (missingSeasonColumns.length) {
    warnings.push(
      `Backup season horizon does not match this Front Office: ${missingSeasonColumns.join(', ')}.`
    );
  }

  if (team && state.frontOffice?.teamName && team !== state.frontOffice.teamName) {
    warnings.push(`Backup team is ${team}; current Front Office is ${state.frontOffice.teamName}.`);
  }

  if (league && state.frontOffice?.leagueName && league !== state.frontOffice.leagueName) {
    warnings.push(`Backup league is ${league}; current Front Office is ${state.frontOffice.leagueName}.`);
  }

  const schemaValid =
    (isV1 || isV2)
    && missingRequired.length === 0
    && missingSeasonColumns.length === 0
    && (!isV1 || targetSport === 'NHL')
    && (!isV2 || sport === targetSport);

  const playerIdHeader = findHeader('RosterCap Player ID');
  const sourceIdHeader = findHeader('Fantrax ID');
  const nameHeader = findHeader('Player');
  const positionHeader = findHeader('Pos');
  const eligibleHeader = findHeader('Eligible');
  const teamValueHeader = isV1 ? findHeader('NHL Team') : findHeader('Team');
  const ageHeader = findHeader('Age');
  const ageAsOfHeader = findHeader('Age As Of');
  const statusHeader = findHeader('Status');
  const prospectHeader = findHeader('Prospect');
  const rosterHeader = isV1
    ? findHeader('Roster Location')
    : findHeader('Roster Group Key');
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
      const position = String(record[positionHeader] || '').trim().toUpperCase();
      const eligiblePositions =
        normalizeStoredEligibilityV299(record[eligibleHeader])
        || position;

      const realTeam = isV1
        ? normalizeNhlTeam(record[teamValueHeader] || '')
        : normalizeSourceTeamV299(record[teamValueHeader] || '', targetSport);

      const ageSnapshot = nullableInteger(ageHeader ? record[ageHeader] : '');
      const ageAsOf = ageAsOfHeader
        ? String(record[ageAsOfHeader] || '').trim()
        : '';

      const statusText = String(record[statusHeader] || '').trim();
      const status = state.statuses.find((item) =>
        item.name.toLowerCase() === statusText.toLowerCase()
      ) || null;

      const isProspect = backupBooleanV299(record[prospectHeader], false);
      const rosterGroup = backupRosterGroupV299(record[rosterHeader]);

      const contractEndRaw = String(record[contractEndHeader] || '').trim();
      const contractEndSeasonId = contractEndRaw
        ? backupSeasonIdFromLabelV299(contractEndRaw)
        : null;

      const depth = isV1
        ? parseBackupDepthAssignmentsV1(depthHeader ? record[depthHeader] : '')
        : parseBackupDepthAssignmentsV2(depthHeader ? record[depthHeader] : '');

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

      if (!schemaValid) {
        rowWarnings.push('Backup schema is not compatible with this Front Office.');
      }

      if (!name) rowWarnings.push('Missing player name.');
      if (!position) rowWarnings.push('Missing player position.');

      if (!status) {
        rowWarnings.push(`Roster status not found: ${statusText || 'blank'}.`);
      }

      if (!rosterGroup) {
        rowWarnings.push(
          `Invalid roster group: ${String(record[rosterHeader] || '').trim() || 'blank'}.`
        );
      }

      if (rosterGroup === 'FARM' && !isProspect) {
        rowWarnings.push(
          `A ${importDevelopmentLabelV299()} player must be marked Prospect.`
        );
      }

      if (contractEndRaw && !contractEndSeasonId) {
        rowWarnings.push(
          `Contract End season is not in this Front Office: ${contractEndRaw}.`
        );
      }

      if (depth.warning) rowWarnings.push(depth.warning);

      const existing = findExistingImportPlayer(
        sourceId,
        name,
        realTeam,
        backupPlayerId
      );

      return {
        sourceRow,
        sourceType: 'ROSTERCAP_BACKUP',
        backupVersion: version,
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
    sport: isV1 ? 'NHL' : sport,
    team,
    league,
    warnings
  };
}

// ---------------------------------------------------------------------------
// Fantrax sport-aware parsing
// ---------------------------------------------------------------------------

function normalizeSourceTeamV299(value, sport = activeImportSportV299()) {
  const raw = String(value || '').trim();

  if (!raw || /^(?:\(N\/A\)|N\/A|NA|-)$/.test(raw.toUpperCase())) return '';

  if (sport === 'NHL' && typeof normalizeNhlTeam === 'function') {
    return normalizeNhlTeam(raw);
  }

  return raw
    .toUpperCase()
    .replace(/\s*\/\s*/g, '/');
}

function normalizeStoredEligibilityV299(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const tokens = raw
    .split(/[,|;]/)
    .map((token) => token.trim().toUpperCase())
    .filter(Boolean);

  return [...new Set(tokens)].join(',');
}

function fantraxTokenMapV299(token, sport) {
  const value = String(token || '').trim().toUpperCase();
  if (!value) return '';

  if (sport === 'NFL' && value === 'ER') return 'EDGE';
  if (sport === 'MLB' && /^RP[2-9]$/.test(value)) return 'RP';

  return value;
}

function fantraxPositionTokensV299(value, sport) {
  const raw = String(value || '').trim().toUpperCase();
  if (!raw) return [];

  const splitPattern =
    sport === 'NBA'
      ? /[,|;/]/
      : /[,|;]/;

  return [...new Set(
    raw.split(splitPattern)
      .map((token) => fantraxTokenMapV299(token, sport))
      .filter(Boolean)
  )];
}

function isFantraxSlotOnlyTokenV299(token, sport) {
  const value = String(token || '').toUpperCase();

  if (sport === 'NFL') {
    return [
      'RWT',
      'FLEX',
      'FLX',
      'SFX',
      'SUPERFLEX',
      'SUPER FLEX',
      'ID'
    ].includes(value);
  }

  if (sport === 'MLB') return /^RP[2-9]$/.test(value);
  if (sport === 'NBA') return value === 'F/C';

  return false;
}

function fantraxLineupSlotKeyV299(rawPos, sport) {
  const value = String(rawPos || '').trim().toUpperCase();

  if (sport === 'NFL') {
    if (['SFX','SUPERFLEX','SUPER FLEX'].includes(value)) return 'SUPERFLEX';
    if (['RWT','FLEX','FLX'].includes(value)) return 'FLEX';
    if (value === 'ID') return 'IDP';
  }

  return '';
}

function fantraxSlotPositionChoicesV299(slotKey, sport) {
  const key = String(slotKey || '').trim().toUpperCase();

  if (sport === 'NFL' && key === 'SUPERFLEX') {
    return ['QB','RB','WR','TE'];
  }

  if (sport === 'NFL' && key === 'FLEX') {
    return ['RB','WR','TE'];
  }

  return [];
}

function refreshFantraxRowValidityV299(row) {
  if (!row || row.sourceType !== 'FANTRAX') return row;

  const identityReady = Boolean(row.name && row.sourceId);
  const statusReady = Boolean(row.statusId);
  const positionReady = Boolean(row.position && row.eligiblePositions);

  row.valid = identityReady && statusReady && positionReady;

  if (row.requiresPositionResolution && !row.position) {
    const slotLabel = row.fantraxLineupSlotKey === 'SUPERFLEX'
      ? 'Superflex'
      : (row.fantraxLineupSlotKey || row.fantraxPosRaw || 'lineup slot');

    row.warning =
      `Fantrax supplied ${slotLabel} instead of the player position. `
      + 'Choose the underlying position.';
  } else {
    row.requiresPositionResolution = false;
    row.warning = [
      row.positionWarning || '',
      row.statusWarning || '',
      row.settingsWarning || ''
    ].filter(Boolean).join(' ');
  }

  return row;
}

function resolveFantraxPlayerPositionV299(row, position) {
  if (!row || row.sourceType !== 'FANTRAX') return;

  const sport = pendingImportMeta?.sport || activeImportSportV299();
  const catalog = new Set(importAvailablePositionCodesV299(sport));
  const normalized = String(position || '').trim().toUpperCase();

  if (!normalized || !catalog.has(normalized)) {
    row.position = '';
    row.eligiblePositions = '';
    row.requiresPositionResolution = true;
    refreshFantraxRowValidityV299(row);
    return;
  }

  row.position = normalized;

  const sourceEligible = fantraxPositionTokensV299(
    row.fantraxEligibleRaw,
    sport
  ).filter((token) => catalog.has(token));

  row.eligiblePositions = [...new Set([
    normalized,
    ...sourceEligible
  ])].join(',');

  row.positionWarning = '';
  row.requiresPositionResolution = false;
  refreshFantraxRowValidityV299(row);
}

function importPositionCellMarkupV299(row) {
  if (!row.requiresPositionResolution) {
    return escapeHtml(row.position || '—');
  }

  const choices = Array.isArray(row.positionChoices)
    ? row.positionChoices
    : [];

  return `<label class="import-position-resolver-v2991">
    <span class="sr-only">Choose ${escapeHtml(row.name || 'player')} position</span>
    <select
      data-import-position-row="${row.sourceRow}"
      aria-label="Choose ${escapeAttr(row.name || 'player')} position"
    >
      <option value="">Choose position…</option>
      ${choices.map((position) => `
        <option value="${escapeAttr(position)}">${escapeHtml(position)}</option>
      `).join('')}
    </select>
    <small>${escapeHtml(
      row.fantraxLineupSlotKey === 'SUPERFLEX'
        ? 'SFX → Superflex slot'
        : (row.fantraxLineupSlotKey || 'Fantrax slot')
    )}</small>
  </label>`;
}

function chooseFantraxPrimaryPositionV299(
  sport,
  rawPos,
  rawEligible,
  existing = null
) {
  const catalog = new Set(importAvailablePositionCodesV299(sport));

  const posTokens = fantraxPositionTokensV299(rawPos, sport);
  const eligibleTokens = fantraxPositionTokensV299(rawEligible, sport)
    .filter((token) => catalog.has(token));

  const normalizedRawPos = String(rawPos || '').trim().toUpperCase();

  if (sport === 'NFL') {
    if (!isFantraxSlotOnlyTokenV299(normalizedRawPos, sport)) {
      const direct = posTokens.find((token) => catalog.has(token));
      if (direct) return direct;
    }

    if (eligibleTokens.length) return eligibleTokens[0];

    const existingPosition = String(existing?.position || '').trim().toUpperCase();
    if (existingPosition && catalog.has(existingPosition)) return existingPosition;

    return '';
  }

  if (sport === 'MLB') {
    if (/^RP[2-9]$/.test(normalizedRawPos)) {
      return eligibleTokens.find((token) => token === 'RP')
        || (catalog.has('RP') ? 'RP' : '');
    }

    const direct = posTokens.find((token) => catalog.has(token));
    if (direct) return direct;
    if (eligibleTokens.length) return eligibleTokens[0];

    const existingPosition = String(existing?.position || '').trim().toUpperCase();
    return catalog.has(existingPosition) ? existingPosition : '';
  }

  if (sport === 'NBA') {
    if (normalizedRawPos === 'F/C') {
      const concretePreference = ['PG','SG','SF','PF','C','G','F'];
      const derived = concretePreference.find((token) => eligibleTokens.includes(token));
      if (derived) return derived;
    }

    const direct = posTokens.find((token) => catalog.has(token));
    if (direct) return direct;
    if (eligibleTokens.length) return eligibleTokens[0];

    const existingPosition = String(existing?.position || '').trim().toUpperCase();
    return catalog.has(existingPosition) ? existingPosition : '';
  }

  // NHL and future compatible sources: preserve a valid direct position first.
  const direct = posTokens.find((token) => catalog.has(token));
  if (direct) return direct;
  if (eligibleTokens.length) return eligibleTokens[0];

  const existingPosition = String(existing?.position || '').trim().toUpperCase();
  return catalog.has(existingPosition) ? existingPosition : '';
}

function chooseFantraxEligibilityV299(
  sport,
  rawEligible,
  primaryPosition,
  existing = null
) {
  const catalog = new Set(importAvailablePositionCodesV299(sport));

  const eligible = fantraxPositionTokensV299(rawEligible, sport)
    .filter((token) => catalog.has(token));

  if (!eligible.length && existing?.eligiblePositions) {
    const existingTokens = normalizeStoredEligibilityV299(existing.eligiblePositions)
      .split(',')
      .filter((token) => catalog.has(token));
    eligible.push(...existingTokens);
  }

  if (primaryPosition && !eligible.includes(primaryPosition)) {
    eligible.unshift(primaryPosition);
  }

  return [...new Set(eligible)].join(',');
}

function fantraxPositionWarningV299(
  sport,
  rawPos,
  rawEligible,
  primaryPosition,
  eligiblePositions
) {
  if (!primaryPosition) {
    const pos = String(rawPos || '').trim() || 'blank';
    const eligible = String(rawEligible || '').trim() || 'blank';

    if (sport === 'NFL' && /^(?:SFX|SUPERFLEX|SUPER FLEX)$/i.test(pos)) {
      return '';
    }

    return (
      `No supported ${sport} player position could be derived from `
      + `Pos ${pos} / Eligible ${eligible}.`
    );
  }

  if (!eligiblePositions) {
    return `No supported ${sport} eligibility could be derived.`;
  }

  return '';
}

function isFantraxHeaderV299(row) {
  const normalized = row.map((value) => String(value || '').trim().toLowerCase());

  const required = ['id','pos','player','team','eligible','status','age'];
  return normalized[0] === 'id'
    && required.every((name) => normalized.includes(name));
}

function fantraxSectionMarkerV299(row) {
  const cells = row.map((value) => String(value || '').trim());
  const nonBlank = cells.filter(Boolean);

  if (cells[0] || !cells[1] || nonBlank.length > 2) return '';
  if (cells[1].toLowerCase() === 'totals') return '';

  return cells[1] === 'Player' ? 'Players' : cells[1];
}

function parseFantraxTeamRoster(rows) {
  const sport = activeImportSportV299();
  const output = [];
  const sectionCounts = {};

  let detectedHeaders = 0;
  let currentSection = '';
  let headers = null;
  let hasSalary = false;
  let minors = 0;

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i].map((value) => String(value ?? '').trim());

    const marker = fantraxSectionMarkerV299(row);
    if (marker) {
      currentSection = marker;
      headers = null;
      continue;
    }

    if (isFantraxHeaderV299(row)) {
      headers = row;
      detectedHeaders += 1;
      hasSalary = hasSalary || headers.some(
        (header) => header.toLowerCase() === 'salary'
      );

      if (!currentSection) currentSection = 'Players';
      continue;
    }

    if (!headers || !row.some(Boolean) || !row[0]) continue;

    const record = {};
    headers.forEach((header, index) => {
      record[header] = row[index] ?? '';
    });

    const sourceId = String(record.ID || '').trim();
    const name = String(record.Player || '').trim();

    if ((!sourceId && !name) || /^totals?$/i.test(sourceId)) continue;

    const realTeam = normalizeSourceTeamV299(record.Team, sport);
    const existing = findExistingImportPlayer(sourceId, name, realTeam);

    const rawPos = String(record.Pos || '').trim().toUpperCase();
    const rawEligible = String(record.Eligible || '').trim().toUpperCase();

    const position = chooseFantraxPrimaryPositionV299(
      sport,
      rawPos,
      rawEligible,
      existing
    );

    const eligiblePositions = chooseFantraxEligibilityV299(
      sport,
      rawEligible,
      position,
      existing
    );

    const positionWarning = fantraxPositionWarningV299(
      sport,
      rawPos,
      rawEligible,
      position,
      eligiblePositions
    );

    const ageSnapshot = nullableInteger(record.Age);

    const statusRaw = String(record.Status || '').trim();
    const isMinors = isFantraxMinorsStatus(statusRaw);
    const statusResult = mapFantraxStatus(
      statusRaw,
      existing?.statusId || null
    );

    const salary = Object.prototype.hasOwnProperty.call(record, 'Salary')
      ? nullableNumber(String(record.Salary || '').replace(/[$,]/g, ''))
      : null;

    const lineupSlotKey = fantraxLineupSlotKeyV299(rawPos, sport);
    const positionChoices = fantraxSlotPositionChoicesV299(
      lineupSlotKey,
      sport
    );

    const requiresPositionResolution = Boolean(
      sport === 'NFL'
      && lineupSlotKey === 'SUPERFLEX'
      && !position
      && positionChoices.length
    );

    let settingsWarning = '';

    const activePositions = new Set(importActivePositionCodesV299());
    if (
      position
      && activePositions.size
      && !activePositions.has(position)
    ) {
      settingsWarning =
        `${position} is not currently enabled in this Front Office's Position Settings.`;
    }

    const importRow = {
      sourceRow: i + 1,
      sourceType: 'FANTRAX',
      sourceId,
      name,
      position,
      eligiblePositions,
      realTeam,
      ageSnapshot,
      statusId: statusResult.statusId,
      statusRaw,
      statusWarning: statusResult.warning || '',
      positionWarning: positionWarning || '',
      settingsWarning,
      isProspect: isMinors ? true : Boolean(existing?.isProspect),
      rosterGroup: isMinors ? 'FARM' : 'ACTIVE',
      isMinors,
      salary,
      salaries: {},
      capOverrides: {},
      section: currentSection || 'Players',
      fantraxPosRaw: rawPos,
      fantraxEligibleRaw: rawEligible,
      fantraxLineupSlotKey: lineupSlotKey,
      positionChoices,
      requiresPositionResolution,
      fantraxContractRaw: String(record.Contract || '').trim(),
      existingPlayerId: existing?.id || null,
      action: existing ? 'Update' : 'Add',
      valid: false,
      warning: ''
    };

    refreshFantraxRowValidityV299(importRow);
    output.push(importRow);

    const sectionName = currentSection || 'Players';
    sectionCounts[sectionName] = (sectionCounts[sectionName] || 0) + 1;
    if (isMinors) minors += 1;
  }

  return {
    detected: detectedHeaders > 0 && output.length > 0,
    sport,
    rows: output,
    players: output.length,
    minors,
    hasSalary,
    sections: Object.keys(sectionCounts),
    sectionCounts
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
    const fallback =
      statusById(fallbackStatusId)
      || state.statuses.find((status) => status.name.toLowerCase() === 'active')
      || state.statuses[0];

    return {
      statusId: fallback?.id || null,
      warning: fallback
        ? ''
        : `No roster status is available for this ${importDevelopmentLabelV299()} player.`
    };
  }

  const normalizedCode = raw
    .toLowerCase()
    .replace(/[^a-z+]/g, '');

  const codeMap = {
    act: 'Active',
    active: 'Active',
    res: 'Reserve',
    reserve: 'Reserve',
    ir: 'IR',
    'ir+': 'IR',
    inj: 'IR',
    injured: 'IR'
  };

  const desired = codeMap[normalizedCode] || raw;

  const status = state.statuses.find((item) =>
    item.name.toLowerCase() === String(desired).toLowerCase()
  );

  return {
    statusId: status?.id || null,
    warning: status
      ? ''
      : `Unmapped Fantrax status: ${raw || 'blank'}`
  };
}

function importTeamTokensV299(value) {
  return String(value || '')
    .toUpperCase()
    .split('/')
    .map((token) => token.trim())
    .filter(Boolean);
}

function importTeamsCompatibleV299(left, right) {
  const a = importTeamTokensV299(left);
  const b = importTeamTokensV299(right);

  if (!a.length || !b.length) return true;
  return a.some((team) => b.includes(team));
}

function findExistingImportPlayer(
  sourceId,
  name,
  realTeam,
  backupPlayerId = null
) {
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
    String(player.name || '').trim().toLowerCase() === normalizedName
    && importTeamsCompatibleV299(player.realTeam, realTeam)
  ) || null;
}

// ---------------------------------------------------------------------------
// Generic CSV compatibility
// ---------------------------------------------------------------------------

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

  const sport = activeImportSportV299();
  const name = String(
    findColumn(/^player$/i, /^name$/i, /player name/i)
  ).trim();

  const rawPosition = String(
    findColumn(/^pos$/i, /^position$/i)
  ).trim().toUpperCase();

  const position = rawPosition || importDefaultPositionV299(sport);
  const eligiblePositions =
    normalizeStoredEligibilityV299(
      findColumn(/^eligible$/i, /eligib/i)
    )
    || position;

  const realTeam = normalizeSourceTeamV299(
    findColumn(
      /^team$/i,
      new RegExp(`^${sport}\\s+team$`, 'i'),
      /nhl team/i,
      /real team/i
    ),
    sport
  );

  const ageSnapshot = nullableInteger(findColumn(/^age$/i));
  const sourceId = String(
    findColumn(/^id$/i, /fantrax.*id/i)
  ).trim();

  const statusText = String(
    findColumn(/^status$/i, /roster status/i)
  ).trim();

  const status =
    state.statuses.find((item) =>
      item.name.toLowerCase() === statusText.toLowerCase()
    )
    || state.statuses[0];

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
    statusRaw: statusText,
    salary: null,
    salaries,
    capOverrides: {},
    section: '',
    rosterGroup: existing?.rosterGroup || 'ACTIVE',
    isMinors: false,
    existingPlayerId: existing?.id || null,
    action: existing ? 'Update' : 'Add',
    valid: Boolean(name && position && status?.id),
    warning: ''
  };
}

// ---------------------------------------------------------------------------
// Review UI
// ---------------------------------------------------------------------------

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

  if (pendingImportMeta.type === 'fantrax') {
    return row.isMinors ? 'FARM' : 'ACTIVE';
  }

  return importExistingPlayer(row)?.rosterGroup || 'ACTIVE';
}

function rosterGroupLabelV299(group) {
  const key = String(group || '').trim().toUpperCase();

  const configured = (state.rosterGroups || []).find((item) =>
    String(item?.key || '').trim().toUpperCase() === key
  );

  if (configured?.displayName) return configured.displayName;

  if (key === 'FARM') return importDevelopmentLabelV299();
  return importPrimaryRosterLabelV299();
}

function currentImportSalary(row, current) {
  if (!current) return null;

  if (pendingImportMeta.type === 'fantrax') {
    return pendingImportMeta.hasSalary ? row.salary : null;
  }

  return row.salaries?.[current.id] ?? null;
}

function importSalaryWillApply(row, current) {
  if (!current) return false;

  if (pendingImportMeta.type === 'fantrax') {
    return Boolean(
      pendingImportMeta.hasSalary
      && el('importSalaryToggle').checked
      && row.salary !== null
      && row.salary !== undefined
    );
  }

  return row.salaries?.[current.id] !== null
    && row.salaries?.[current.id] !== undefined;
}

function importRosterMovement(row) {
  if (
    pendingImportMeta.type !== 'fantrax'
    && pendingImportMeta.type !== 'rostercap_backup'
  ) {
    return null;
  }

  const existing = importExistingPlayer(row);
  if (!existing) return null;

  const from = String(existing.rosterGroup || 'ACTIVE').toUpperCase();
  const to = importTargetRosterGroup(row);

  return from === to ? null : { from, to };
}

function importSalaryChanges(row, current) {
  if (!current || !importSalaryWillApply(row, current)) return false;

  const existing = importExistingPlayer(row);
  const saved = existing?.salaries?.[current.id]?.salary ?? null;
  const incoming = currentImportSalary(row, current);

  if (!existing) return incoming !== null && incoming !== undefined;

  return Number(saved) !== Number(incoming);
}

function importLocationPreviewMarkup(row) {
  const existing = importExistingPlayer(row);
  const target = importTargetRosterGroup(row);
  const targetLabel = rosterGroupLabelV299(target);

  if (
    pendingImportMeta.type !== 'fantrax'
    && pendingImportMeta.type !== 'rostercap_backup'
  ) {
    const kept = existing?.rosterGroup || 'ACTIVE';
    return `<span class="import-kept">${escapeHtml(rosterGroupLabelV299(kept))}<small>kept</small></span>`;
  }

  if (!existing) {
    return `<span class="import-new-value">${escapeHtml(targetLabel)}<small>set</small></span>`;
  }

  const current = String(existing.rosterGroup || 'ACTIVE').toUpperCase();

  if (current === target) {
    return `<span class="import-kept">${escapeHtml(targetLabel)}<small>no change</small></span>`;
  }

  return `<span class="import-change"><span>${escapeHtml(rosterGroupLabelV299(current))}</span><strong>→</strong><span>${escapeHtml(targetLabel)}</span></span>`;
}

function importSalaryPreviewMarkup(row, current) {
  if (!current) return '—';

  const existing = importExistingPlayer(row);
  const saved = existing?.salaries?.[current.id]?.salary ?? null;
  const incoming = currentImportSalary(row, current);

  if (
    pendingImportMeta.type === 'fantrax'
    && (!pendingImportMeta.hasSalary || !el('importSalaryToggle').checked)
  ) {
    return `<span class="import-kept">${saved === null ? '—' : formatMoney(saved)}<small>${pendingImportMeta.hasSalary ? 'kept' : 'not supplied'}</small></span>`;
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

  const rosterMoves = valid
    .map(importRosterMovement)
    .filter(Boolean);

  const toMinors = rosterMoves.filter((move) => move.to === 'FARM').length;
  const toActive = rosterMoves.filter((move) => move.to === 'ACTIVE').length;

  const salaryChanges = valid.filter((row) =>
    importSalaryChanges(row, current)
  ).length;

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

function importSafetyMarkupV299(fantrax, backup = false) {
  const sport = pendingImportMeta.sport || activeImportSportV299();

  if (backup) {
    return `<div class="import-safety-panel">
      <div>
        <span class="import-safety-icon">✓</span>
        <span><strong>Roster + contract restore</strong><small>Restores listed players' identity, status, Prospect flag, roster group, age/as-of date, Fantrax ID, season salaries, cap overrides, contract end, notes and depth-chart placement.</small></span>
      </div>
      <div>
        <span class="import-safety-icon protected">◆</span>
        <span><strong>Protected history</strong><small>Transactions, Draft history, Dead Cap, financial adjustments, Assets, lineup configuration and players missing from this backup are not removed or duplicated.</small></span>
      </div>
    </div>`;
  }

  if (fantrax) {
    const salaryText = pendingImportMeta.hasSalary
      ? 'Current-season salary can also update when the option above is enabled.'
      : 'This Fantrax file does not include Salary, so existing salary data is preserved.';

    return `<div class="import-safety-panel">
      <div>
        <span class="import-safety-icon">✓</span>
        <span><strong>What this Fantrax ${escapeHtml(sport)} import updates</strong><small>Player identity, real player position/eligibility, ${escapeHtml(sport)} team, age, roster status, Fantrax link and Active/${escapeHtml(importDevelopmentLabelV299())} location. NFL SFX is treated as the Superflex lineup allocation; if Fantrax omits the underlying position, the import review asks the user to choose QB/RB/WR/TE. ${escapeHtml(salaryText)}</small></span>
      </div>
      <div>
        <span class="import-safety-icon protected">◆</span>
        <span><strong>Protected data</strong><small>Future salaries, cap overrides, contract end, notes and financial adjustments are preserved. Fantrax Contract text is not guessed into RosterCap contract years. Players missing from this file are not removed.</small></span>
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

  if (salaryOption) {
    salaryOption.classList.toggle(
      'hidden',
      !(fantrax && pendingImportMeta.hasSalary)
    );
  }

  el('importSalaryToggle').disabled = !(fantrax && pendingImportMeta.hasSalary);

  const dialogTitle = importDialog.querySelector('.drawer-header h3');
  if (dialogTitle) {
    dialogTitle.textContent = backup
      ? 'Restore Roster Backup'
      : 'Import Roster';
  }

  const intro = importDialog.querySelector('.modal-body > p.muted');
  if (intro) {
    if (backup) {
      intro.textContent =
        'Review the listed player, roster and contract changes. Transactions, Assets and financial history will not be touched.';
    } else if (fantrax) {
      intro.textContent =
        `Fantrax ${pendingImportMeta.sport} Team Roster detected. Review the mapped positions, statuses, locations and salary behavior before applying.`;
    } else {
      intro.textContent =
        'Generic CSV detected. Review every mapped row before applying.';
    }
  }

  const rows = previewRows.map((row) => {
    const existing = importExistingPlayer(row);
    const actionLabel = backup && existing
      ? 'Restore'
      : (existing ? 'Update' : 'Add');

    return `<tr class="${row.valid ? '' : 'import-invalid-row'}">
      <td>${row.sourceRow}</td>
      <td><strong>${escapeHtml(row.name || 'Missing name')}</strong>${existing ? '<small class="import-row-note">Matched existing</small>' : '<small class="import-row-note">New player</small>'}</td>
      <td>${importPositionCellMarkupV299(row)}</td>
      <td>${escapeHtml(row.realTeam || '—')}</td>
      <td>${escapeHtml(statusById(row.statusId)?.name || row.statusRaw || 'Unmapped')}</td>
      <td>${importLocationPreviewMarkup(row)}</td>
      <td>${importSalaryPreviewMarkup(row, current)}</td>
      <td><span class="import-action-badge ${existing ? 'update' : 'add'}">${actionLabel}</span></td>
      <td>${row.valid ? `<span class="import-ready">${row.warning ? 'Ready*' : 'Ready'}</span>${row.warning ? `<small class="import-row-note">${escapeHtml(row.warning)}</small>` : ''}` : `<span class="danger">${escapeHtml(row.warning || 'Needs review')}</span>`}</td>
    </tr>`;
  }).join('');

  const sectionCount = pendingImportMeta.sections?.length || 0;

  const detector = backup
    ? `<div class="import-detect"><span class="import-chip primary">RosterCap Roster Backup</span><span class="import-chip">${escapeHtml(pendingImportMeta.backupVersion || '')}</span>${pendingImportMeta.backupSport ? `<span class="import-chip">${escapeHtml(pendingImportMeta.backupSport)}</span>` : ''}<span class="import-chip">${pendingImportMeta.players} players</span><span class="import-chip">${pendingImportMeta.minors} ${escapeHtml(importDevelopmentLabelV299().toLowerCase())}</span>${pendingImportMeta.backupTeam ? `<span class="import-chip">${escapeHtml(pendingImportMeta.backupTeam)}</span>` : ''}${importPreviewFileName ? `<span class="import-chip file">${escapeHtml(importPreviewFileName)}</span>` : ''}</div>`
    : fantrax
      ? `<div class="import-detect"><span class="import-chip primary">Fantrax ${escapeHtml(pendingImportMeta.sport)} Team Roster</span><span class="import-chip">${pendingImportMeta.players} players</span><span class="import-chip">${sectionCount} section${sectionCount === 1 ? '' : 's'}</span><span class="import-chip">${pendingImportMeta.minors} ${escapeHtml(importDevelopmentLabelV299().toLowerCase())}</span><span class="import-chip">${pendingImportMeta.hasSalary ? 'Salary included' : 'No salary column'}</span>${importPreviewFileName ? `<span class="import-chip file">${escapeHtml(importPreviewFileName)}</span>` : ''}</div>`
      : `<div class="import-detect"><span class="import-chip primary">Generic CSV</span><span class="import-chip">${pendingImportMeta.players} rows</span>${importPreviewFileName ? `<span class="import-chip file">${escapeHtml(importPreviewFileName)}</span>` : ''}</div>`;

  const movementDetail = (fantrax || backup)
    ? (
        stats.rosterMoves
          ? `${stats.rosterMoves} · ${stats.toMinors} to ${importDevelopmentLabelV299()} · ${stats.toActive} to ${importPrimaryRosterLabelV299()}`
          : '0 · no location changes'
      )
    : 'Not changed';

  const salarySummary = fantrax && !pendingImportMeta.hasSalary
    ? 'not supplied'
    : (current ? seasonLabel(current.startYear) : 'current season');

  const reviewSummary = `<div class="import-review-summary">
    <div><span>Ready</span><strong>${stats.ready}</strong><small>valid rows</small></div>
    <div><span>Add</span><strong>${stats.adds}</strong><small>new players</small></div>
    <div><span>${backup ? 'Restore' : 'Update'}</span><strong>${stats.updates}</strong><small>matched players</small></div>
    <div class="${stats.rosterMoves ? 'attention' : ''}"><span>Roster moves</span><strong>${(fantrax || backup) ? stats.rosterMoves : '—'}</strong><small>${escapeHtml(movementDetail)}</small></div>
    <div class="${stats.salaryChanges ? 'attention' : ''}"><span>Salary changes</span><strong>${stats.salaryChanges}</strong><small>${escapeHtml(salarySummary)}</small></div>
    <div class="${stats.invalid ? 'warning' : ''}"><span>Skipped</span><strong>${stats.invalid}</strong><small>needs review</small></div>
  </div>`;

  const rowLimitNote = pendingImport.length > previewRows.length
    ? `<div class="import-preview-limit">Showing the first ${previewRows.length} of ${pendingImport.length} rows. All ${stats.ready} valid rows will be applied.</div>`
    : '';

  const backupWarnings = backup && pendingImportMeta.backupWarnings?.length
    ? `<div class="import-review-warning"><strong>Backup compatibility notice</strong><span>${escapeHtml(pendingImportMeta.backupWarnings.join(' '))}</span></div>`
    : '';

  const unresolvedPositionRows = pendingImport.filter(
    (row) => row.requiresPositionResolution
  ).length;

  const invalidNote = invalid
    ? `<div class="import-review-warning"><strong>${invalid} row${invalid === 1 ? '' : 's'} need${invalid === 1 ? 's' : ''} review.</strong><span>${backup
        ? 'Restore requires matching sport, season columns, group keys and roster-status names.'
        : (
            unresolvedPositionRows
              ? `${unresolvedPositionRows} Fantrax lineup-slot row${unresolvedPositionRows === 1 ? '' : 's'} can be resolved above by choosing the underlying player position. Unsupported rows remain skipped until corrected.`
              : 'RosterCap will not guess an unsupported player position or roster status. Review the flagged source rows.'
          )
      }</span></div>`
    : '';

  const preview = el('importPreview');
  preview.classList.remove('hidden');
  preview.innerHTML = `
    ${detector}
    ${reviewSummary}
    ${importSafetyMarkupV299(fantrax, backup)}
    ${backupWarnings}
    ${invalidNote}
    <div class="import-review-table-head"><strong>Player review</strong><span>Nothing is saved until you press Apply Import.</span></div>
    <div class="table-wrap import-review-table-wrap">
      <table class="import-review-table">
        <thead><tr><th>Row</th><th>Player</th><th>Pos</th><th>Team</th><th>Status</th><th>Location</th><th>${current ? escapeHtml(seasonLabel(current.startYear)) : 'Salary'}</th><th>Action</th><th>Check</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    ${rowLimitNote}
  `;

  preview.querySelectorAll('[data-import-position-row]').forEach((select) => {
    select.addEventListener('change', () => {
      const sourceRow = Number(select.dataset.importPositionRow);
      const row = pendingImport.find(
        (candidate) => Number(candidate.sourceRow) === sourceRow
      );

      if (!row) return;

      resolveFantraxPlayerPositionV299(row, select.value);
      renderImportPreview();
    });
  });

  const applyButton = el('applyImportBtn');
  applyButton.disabled = valid.length === 0;
  applyButton.textContent = valid.length
    ? (
        backup
          ? `Restore ${valid.length} Player${valid.length === 1 ? '' : 's'}`
          : `Apply ${valid.length} Row${valid.length === 1 ? '' : 's'}`
      )
    : 'Apply Import';
}

// ---------------------------------------------------------------------------
// Controlled persistence
// ---------------------------------------------------------------------------

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

  const frontOfficeId = state.frontOffice?.id;
  if (!frontOfficeId) {
    alert('Reopen this Front Office before importing.');
    return;
  }

  const backup = pendingImportMeta.type === 'rostercap_backup';
  const fantrax = pendingImportMeta.type === 'fantrax';

  const updateSalary = Boolean(
    fantrax
    && pendingImportMeta.hasSalary
    && el('importSalaryToggle').checked
  );

  const button = el('applyImportBtn');
  if (button.disabled) return;

  button.disabled = true;
  button.textContent = backup ? 'Restoring…' : 'Importing…';

  const success = await runCloudAction(async () => {
    const restoredRows = [];

    for (const row of rows) {
      const existing =
        state.players.find((player) => player.id === row.existingPlayerId)
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
          fantrax
          && season.id === currentSeason()?.id
          && updateSalary
        ) {
          incoming = row.salary;
        }

        if (
          fantrax
          && (
            season.id !== currentSeason()?.id
            || !updateSalary
          )
        ) {
          incoming = null;
        }

        return {
          season_id: season.id,
          salary: incoming === null
            ? currentData.salary
            : incoming,
          cap_override: currentData.capOverride ?? null
        };
      });

      const finalPosition =
        row.position
        || existing?.position
        || importDefaultPositionV299();

      const finalEligibility =
        row.eligiblePositions
        || existing?.eligiblePositions
        || finalPosition;

      const finalAge =
        backup
          ? (row.ageSnapshot ?? null)
          : (row.ageSnapshot ?? existing?.ageSnapshot ?? null);

      const { data: savedPlayerId, error } = await db.rpc(
        'save_front_office_player_v2',
        {
          p_front_office_id: frontOfficeId,
          p_front_office_player_id: existing?.id || null,
          p_player_name: row.name,
          p_position: finalPosition,
          p_eligible_positions: finalEligibility,
          p_real_team: backup
            ? (row.realTeam || null)
            : (row.realTeam || existing?.realTeam || null),
          p_age_snapshot: finalAge,
          p_age_as_of: backup
            ? (row.ageAsOf || null)
            : (
                finalAge === null || finalAge === undefined
                  ? null
                  : todayIsoDate()
              ),
          p_roster_status_id:
            row.statusId
            || existing?.statusId
            || state.statuses[0]?.id,
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
        }
      );

      if (error) throw error;

      const importedPlayerId = savedPlayerId || existing?.id || null;

      if (!importedPlayerId) {
        throw new Error(`Could not resolve the saved player ID for ${row.name}.`);
      }

      if (fantrax || backup) {
        const targetGroup = backup
          ? row.rosterGroup
          : (row.isMinors ? 'FARM' : 'ACTIVE');

        if (!['ACTIVE','FARM'].includes(targetGroup)) {
          throw new Error(
            `Roster group ${targetGroup} cannot be restored by the current compatibility adapter.`
          );
        }

        const { error: rosterSyncError } = await db.rpc(
          'sync_front_office_player_minors_v1',
          {
            p_front_office_id: frontOfficeId,
            p_front_office_player_id: importedPlayerId,
            p_to_minors: targetGroup === 'FARM'
          }
        );

        if (rosterSyncError) throw rosterSyncError;
      }

      if (backup) {
        const { error: prospectError } = await db.rpc(
          'set_front_office_player_prospect_v1',
          {
            p_front_office_id: frontOfficeId,
            p_front_office_player_id: importedPlayerId,
            p_is_prospect: Boolean(row.isProspect)
          }
        );

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
    pendingImportMeta = blankImportMetaV299();
    importPreviewFileName = '';
  });

  if (!success && importDialog.open) {
    button.disabled = false;
    renderImportPreview();
  }
}

// ---------------------------------------------------------------------------
// CSV parser
// ---------------------------------------------------------------------------

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
