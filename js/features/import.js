'use strict';

// ============================================================================
// RosterCap V3.17.2 — Review decisions + safer Fantrax matching + modular sync + contract parsing
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

const ROSTERCAP_IMPORT_VERSION_V299 = 'V3.17.2';
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
    hasContract: false,
    syncOptions: {
      roster: true,
      salaries: true,
      contracts: true
    },
    contractNumericMode: 'remaining',
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


function importFantraxSyncOptionsV3171() {
  const options = pendingImportMeta?.syncOptions || {};
  return {
    roster: options.roster !== false,
    salaries: options.salaries !== false,
    contracts: options.contracts !== false
  };
}

function importContractNumericModeV3171() {
  return pendingImportMeta?.contractNumericMode === 'contract_year'
    ? 'contract_year'
    : 'remaining';
}


function importEnsureRowDecisionV3172(row) {
  if (!row) return 'skip';

  if (!['include','skip'].includes(row.applyDecision)) {
    row.applyDecision = 'include';
  }

  // Possible-duplicate rows are intentionally blocked until the duplicate is
  // resolved in RosterCap. They must never become an automatic Add.
  if (row.matchConflict) row.applyDecision = 'skip';

  return row.applyDecision;
}

function importRowWillApplyV3172(row) {
  return Boolean(
    row?.valid
    && importEnsureRowDecisionV3172(row) === 'include'
  );
}

function importDecisionCellMarkupV3172(row, existing, backup = false) {
  importEnsureRowDecisionV3172(row);

  if (!row.valid) {
    const reason = row.matchConflict
      ? 'Skip — possible duplicate'
      : 'Skip — needs review';

    return `<select disabled aria-label="Decision for ${escapeAttr(row.name || 'player')}">
      <option>${escapeHtml(reason)}</option>
    </select>`;
  }

  const includeLabel = backup
    ? (existing ? 'Restore player' : 'Add from backup')
    : (existing ? 'Apply changes' : 'Add player');

  return `<select
    data-import-decision-row="${row.sourceRow}"
    aria-label="Decision for ${escapeAttr(row.name || 'player')}"
  >
    <option value="include" ${row.applyDecision === 'include' ? 'selected' : ''}>${escapeHtml(includeLabel)}</option>
    <option value="skip" ${row.applyDecision === 'skip' ? 'selected' : ''}>Skip player</option>
  </select>`;
}

function importSetDecisionV3172(row, decision) {
  if (!row) return;
  row.applyDecision = decision === 'include' && row.valid && !row.matchConflict
    ? 'include'
    : 'skip';
}

function importCanonicalPlayerNameV3171(value) {
  let raw = String(value || '').replace(/\s+/g, ' ').trim();
  if (!raw) return '';

  if (raw.includes(',')) {
    const parts = raw.split(',');
    const family = String(parts.shift() || '').trim();
    const given = parts.join(',').trim();
    if (family && given) raw = `${given} ${family}`;
  }

  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(?:jr|sr|ii|iii|iv)\.?$/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function importPositionCompatibleV3171(player, position) {
  const target = String(position || '').trim().toUpperCase();
  if (!target) return true;

  const primary = String(player?.position || '').trim().toUpperCase();
  if (primary === target) return true;

  const eligible = String(player?.eligiblePositions || '')
    .toUpperCase()
    .split(/[,/|\s]+/)
    .map((token) => token.trim())
    .filter(Boolean);

  return eligible.includes(target);
}

function resolveExistingImportPlayerV3171(
  sourceId,
  name,
  realTeam,
  position = '',
  backupPlayerId = null
) {
  if (backupPlayerId) {
    const exact = state.players.find((player) => player.id === backupPlayerId);
    if (exact) {
      return { player:exact, conflict:false, candidates:[exact], reason:'backup-id' };
    }
  }

  const normalizedSourceId = String(sourceId || '').trim();
  const sourceLinked = normalizedSourceId
    ? state.players.filter((player) =>
        String(player?.fantraxId || '').trim() === normalizedSourceId
      )
    : [];

  const canonicalName = importCanonicalPlayerNameV3171(name);
  const nameCandidates = canonicalName
    ? state.players.filter((player) =>
        importCanonicalPlayerNameV3171(player?.name) === canonicalName
      )
    : [];

  if (sourceLinked.length > 1) {
    return {
      player:null,
      conflict:true,
      candidates:sourceLinked,
      reason:'duplicate-fantrax-id'
    };
  }

  if (sourceLinked.length === 1) {
    const linked = sourceLinked[0];
    const sameNameOthers = nameCandidates.filter((player) => player.id !== linked.id);

    if (sameNameOthers.length) {
      return {
        player:null,
        conflict:true,
        candidates:[linked, ...sameNameOthers],
        reason:'possible-existing-duplicate'
      };
    }

    return { player:linked, conflict:false, candidates:[linked], reason:'fantrax-id' };
  }

  if (nameCandidates.length === 1) {
    return {
      player:nameCandidates[0],
      conflict:false,
      candidates:nameCandidates,
      reason:'unique-normalized-name'
    };
  }

  if (nameCandidates.length > 1) {
    const teamCandidates = nameCandidates.filter((player) =>
      importTeamsCompatibleV299(player?.realTeam, realTeam)
    );

    if (teamCandidates.length === 1) {
      return {
        player:teamCandidates[0],
        conflict:false,
        candidates:teamCandidates,
        reason:'name-team'
      };
    }

    const positionPool = teamCandidates.length ? teamCandidates : nameCandidates;
    const positionCandidates = positionPool.filter((player) =>
      importPositionCompatibleV3171(player, position)
    );

    if (positionCandidates.length === 1) {
      return {
        player:positionCandidates[0],
        conflict:false,
        candidates:positionCandidates,
        reason:'name-position'
      };
    }

    return {
      player:null,
      conflict:true,
      candidates:positionCandidates.length ? positionCandidates : positionPool,
      reason:'ambiguous-name'
    };
  }

  return { player:null, conflict:false, candidates:[], reason:'new-player' };
}

function importMatchConflictWarningV3171(match) {
  if (!match?.conflict) return '';

  const labels = (match.candidates || [])
    .slice(0, 4)
    .map((player) => {
      const team = String(player?.realTeam || '').trim();
      const linked = String(player?.fantraxId || '').trim();
      return `${player?.name || 'Unnamed'}${team ? ` (${team})` : ''}${linked ? ' · Fantrax linked' : ''}`;
    });

  const prefix = match.reason === 'possible-existing-duplicate'
    ? 'Possible duplicate already exists in RosterCap.'
    : 'Multiple existing RosterCap players could match this Fantrax player.';

  return `${prefix} Resolve the duplicate before syncing so RosterCap does not create or relink the wrong record.${labels.length ? ` Candidates: ${labels.join('; ')}.` : ''}`;
}

function fantraxContractSeasonByStartYearV3171(year) {
  const numeric = Number(year);
  if (!Number.isInteger(numeric)) return null;
  return state.seasons.find((season) => Number(season.startYear) === numeric) || null;
}

function fantraxContractFourDigitYearV3171(value) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric)) return null;
  if (numeric >= 2000 && numeric <= 2099) return numeric;
  if (numeric >= 20 && numeric <= 99) return 2000 + numeric;
  return null;
}

function parseFantraxContractV3171(rawValue, mode = importContractNumericModeV3171()) {
  const raw = String(rawValue ?? '').trim();
  const result = {
    raw,
    contractType:'',
    endYear:null,
    endSeasonId:null,
    yearsRemaining:null,
    contractYear:null,
    recognized:false,
    canUpdateEnd:false,
    warning:''
  };

  if (!raw) return result;

  const compact = raw.toUpperCase().replace(/\s+/g, '');
  const typed = compact.match(/^(RFA|UFA)(\d{2}|\d{4})$/);

  if (typed) {
    result.contractType = typed[1];
    result.endYear = fantraxContractFourDigitYearV3171(typed[2]);
    result.recognized = Boolean(result.endYear);
  } else if (/^(RFA|UFA)$/.test(compact)) {
    result.contractType = compact;
    result.recognized = true;
  } else if (/^\d{4}$/.test(compact)) {
    result.endYear = fantraxContractFourDigitYearV3171(compact);
    result.recognized = Boolean(result.endYear);
  } else if (/^\d{2}$/.test(compact) && Number(compact) >= 20) {
    result.endYear = fantraxContractFourDigitYearV3171(compact);
    result.recognized = Boolean(result.endYear);
  } else if (/^\d{1,2}$/.test(compact)) {
    const count = Number(compact);
    if (count >= 1 && count <= 19) {
      result.recognized = true;
      if (mode === 'contract_year') {
        result.contractYear = count;
      } else {
        result.yearsRemaining = count;
        const current = currentSeason();
        if (current?.startYear !== null && current?.startYear !== undefined) {
          result.endYear = Number(current.startYear) + count - 1;
        }
      }
    }
  }

  if (!result.recognized) {
    result.warning = `Unrecognized Fantrax Contract value: ${raw}. Existing contract end will be kept.`;
    return result;
  }

  if (result.endYear !== null) {
    const season = fantraxContractSeasonByStartYearV3171(result.endYear);
    if (season) {
      result.endSeasonId = season.id;
      result.canUpdateEnd = true;
    } else {
      result.warning = `Contract end ${result.endYear} is outside this Front Office's configured season horizon. Existing contract end will be kept.`;
    }
  }

  return result;
}

function explicitContractInputV3171(record, headers = []) {
  const find = (...names) => headers.find((header) =>
    names.some((name) => normalizeHeader(header) === normalizeHeader(name))
  ) || null;

  const contract = find('Contract');
  const end = find('Contract End', 'End Year', 'Contract End Year');
  const remaining = find('Years Remaining', 'Contract Years Remaining');
  const contractYear = find('Contract Year', 'Current Contract Year');

  if (end && String(record[end] ?? '').trim()) {
    return { raw:String(record[end]).trim(), mode:'end_year', sourceHeader:end };
  }

  if (remaining && String(record[remaining] ?? '').trim()) {
    return { raw:String(record[remaining]).trim(), mode:'remaining', sourceHeader:remaining };
  }

  if (contractYear && String(record[contractYear] ?? '').trim()) {
    return { raw:String(record[contractYear]).trim(), mode:'contract_year', sourceHeader:contractYear };
  }

  if (contract && String(record[contract] ?? '').trim()) {
    return { raw:String(record[contract]).trim(), mode:'auto', sourceHeader:contract };
  }

  return { raw:'', mode:'auto', sourceHeader:'' };
}

function parseImportContractRowV3171(row) {
  const raw = String(row?.fantraxContractRaw ?? row?.contractRaw ?? '').trim();
  const inputMode = row?.contractInputMode || 'auto';

  let mode = importContractNumericModeV3171();
  if (inputMode === 'remaining') mode = 'remaining';
  if (inputMode === 'contract_year') mode = 'contract_year';

  let parseRaw = raw;
  if (inputMode === 'end_year' && /^\d{1,2}$/.test(raw) && Number(raw) < 20) {
    const parsed = {
      raw,
      contractType:'',
      endYear:null,
      endSeasonId:null,
      yearsRemaining:null,
      contractYear:null,
      recognized:false,
      canUpdateEnd:false,
      warning:`Contract End value ${raw} is not a valid end year. Existing contract end will be kept.`
    };
    row.contractParsed = parsed;
    row.contractEndSeasonId = null;
    row.contractWarning = parsed.warning;
    return parsed;
  }

  const parsed = parseFantraxContractV3171(parseRaw, mode);
  row.contractParsed = parsed;
  row.contractEndSeasonId = parsed.canUpdateEnd ? parsed.endSeasonId : null;
  row.contractWarning = parsed.warning || '';
  return parsed;
}

function refreshImportContractRowsV3171() {
  pendingImport.forEach((row) => {
    if (row.sourceType === 'FANTRAX' || row.contractRaw || row.fantraxContractRaw) {
      parseImportContractRowV3171(row);
      if (row.sourceType === 'FANTRAX') refreshFantraxRowValidityV299(row);
    }
  });
}

function openImportDialog() {
  pendingImport = [];
  pendingImportMeta = blankImportMetaV299();
  importPreviewFileName = '';

  el('csvFile').value = '';

  const rosterToggle = el('importRosterToggle');
  const salaryToggle = el('importSalaryToggle');
  const contractToggle = el('importContractToggle');
  const contractMode = el('importContractNumericModeV3171');
  const fantraxOptions = el('importFantraxOptionsV3171');

  if (rosterToggle) {
    rosterToggle.checked = true;
    rosterToggle.disabled = false;
  }
  if (salaryToggle) {
    salaryToggle.checked = true;
    salaryToggle.disabled = false;
  }
  if (contractToggle) {
    contractToggle.checked = true;
    contractToggle.disabled = false;
  }
  if (contractMode) {
    contractMode.value = 'remaining';
    contractMode.disabled = false;
  }
  fantraxOptions?.classList.add('hidden');

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
  const optionIds = [
    'importRosterToggle',
    'importSalaryToggle',
    'importContractToggle',
    'importContractNumericModeV3171'
  ];

  optionIds.forEach((id) => {
    const control = el(id);
    if (!control || control.dataset.importPreviewBound) return;

    control.dataset.importPreviewBound = 'true';
    control.addEventListener('change', () => {
      if (!pendingImport.length) return;

      pendingImportMeta.syncOptions = {
        ...(pendingImportMeta.syncOptions || {}),
        roster: el('importRosterToggle')?.checked !== false,
        salaries: el('importSalaryToggle')?.checked !== false,
        contracts: el('importContractToggle')?.checked !== false
      };
      pendingImportMeta.contractNumericMode =
        el('importContractNumericModeV3171')?.value === 'contract_year'
          ? 'contract_year'
          : 'remaining';

      refreshImportContractRowsV3171();
      renderImportPreview();
    });
  });

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
        hasSalary: fantrax.hasSalary,
        hasContract: fantrax.hasContract,
        syncOptions: { roster:true, salaries:true, contracts:true },
        contractNumericMode: 'remaining'
      };
      pendingImport = fantrax.rows;
      refreshImportContractRowsV3171();
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
      pendingImportMeta.hasContract = pendingImport.some((row) =>
        Boolean(String(row.contractRaw || '').trim())
      );
      pendingImportMeta.syncOptions = {
        roster:true,
        salaries:true,
        contracts:true
      };
      pendingImportMeta.contractNumericMode = 'remaining';
      refreshImportContractRowsV3171();
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

  const syncOptions = importFantraxSyncOptionsV3171();
  const existing = state.players.find((player) => player.id === row.existingPlayerId) || null;
  const identityReady = Boolean(row.name && row.sourceId);
  const statusReady = Boolean(row.statusId);
  const positionReady = Boolean(row.position && row.eligiblePositions);
  const rosterRequirementsReady = !syncOptions.roster || (statusReady && positionReady);
  const newPlayerAllowed = Boolean(existing || syncOptions.roster);

  row.valid = Boolean(
    identityReady
    && rosterRequirementsReady
    && newPlayerAllowed
    && !row.matchConflict
  );

  if (row.matchConflict) {
    row.applyDecision = 'skip';
    row.warning = row.matchWarning || 'Possible duplicate player match. Resolve it before syncing.';
    return row;
  }

  if (!existing && !syncOptions.roster) {
    row.warning = 'This is a new player. Enable Roster & player info to add new players.';
    return row;
  }

  if (syncOptions.roster && row.requiresPositionResolution && !row.position) {
    const slotLabel = row.fantraxLineupSlotKey === 'SUPERFLEX'
      ? 'Superflex'
      : (row.fantraxLineupSlotKey || row.fantraxPosRaw || 'lineup slot');

    row.warning =
      `Fantrax supplied ${slotLabel} instead of the player position. `
      + 'Choose the underlying position.';
  } else {
    if (!syncOptions.roster) row.requiresPositionResolution = false;

    row.warning = [
      syncOptions.roster ? (row.positionWarning || '') : '',
      syncOptions.roster ? (row.statusWarning || '') : '',
      syncOptions.roster ? (row.settingsWarning || '') : '',
      syncOptions.contracts ? (row.contractWarning || '') : ''
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
  let hasContract = false;
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
      hasContract = hasContract || headers.some((header) =>
        ['Contract','Contract End','End Year','Contract End Year','Years Remaining','Contract Years Remaining','Contract Year','Current Contract Year']
          .some((name) => normalizeHeader(header) === normalizeHeader(name))
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
    const rawPos = String(record.Pos || '').trim().toUpperCase();
    const rawEligible = String(record.Eligible || '').trim().toUpperCase();
    const match = resolveExistingImportPlayerV3171(
      sourceId,
      name,
      realTeam,
      rawPos
    );
    const existing = match.player;

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

    const contractInput = explicitContractInputV3171(record, headers);

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
      fantraxContractRaw: contractInput.raw,
      contractInputMode: contractInput.mode,
      contractSourceHeader: contractInput.sourceHeader,
      contractParsed: null,
      contractEndSeasonId: null,
      contractWarning: '',
      matchConflict: Boolean(match.conflict),
      matchConflictReason: match.reason || '',
      matchCandidates: (match.candidates || []).map((player) => player.id),
      matchWarning: importMatchConflictWarningV3171(match),
      existingPlayerId: existing?.id || null,
      action: existing ? 'Update' : 'Add',
      valid: false,
      warning: ''
    };

    parseImportContractRowV3171(importRow);
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
    hasContract,
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

  const desiredNames = {
    act: ['Active'],
    active: ['Active'],
    res: ['Reserve'],
    reserve: ['Reserve'],
    ir: ['IR', 'Injured Reserve'],
    'ir+': ['IR', 'Injured Reserve'],
    inj: ['IR', 'Injured Reserve'],
    injured: ['IR', 'Injured Reserve'],
    injuredreserve: ['IR', 'Injured Reserve']
  }[normalizedCode] || [raw];

  const status = state.statuses.find((item) =>
    desiredNames.some((desired) =>
      item.name.toLowerCase() === String(desired).toLowerCase()
    )
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
  backupPlayerId = null,
  position = ''
) {
  return resolveExistingImportPlayerV3171(
    sourceId,
    name,
    realTeam,
    position,
    backupPlayerId
  ).player;
}

// ---------------------------------------------------------------------------
// Fantrax API sync adapter — V3.17.0
//
// Converts the verified Fantrax API contracts into the same pendingImport row
// contract used by the existing CSV review/apply workflow. The API adapter does
// not save anything itself; Apply Import remains the only persistence gate.
// ---------------------------------------------------------------------------

function fantraxApiDisplayNameV3170(value) {
  const raw = String(value || '').replace(/\s+/g, ' ').trim();
  if (!raw || !raw.includes(',')) return raw;

  const parts = raw.split(',');
  const family = String(parts.shift() || '').trim();
  const given = parts.join(',').trim();

  if (!family || !given) return raw;
  return `${given} ${family}`.replace(/\s+/g, ' ').trim();
}

function fantraxApiMatchMapV3170(matches) {
  const map = new Map();

  (Array.isArray(matches) ? matches : []).forEach((match) => {
    const playerId = String(match?.playerId || '').trim();
    if (!playerId || map.has(playerId)) return;
    map.set(playerId, match?.record && typeof match.record === 'object'
      ? match.record
      : {});
  });

  return map;
}

function fantraxApiWholeDollarV3170(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric) : null;
}

function fantraxApiImportRowsV3170(syncData, connection = null, requestedOptions = null) {
  const sport = String(
    syncData?.sport
    || connection?.sport
    || activeImportSportV299()
  ).trim().toUpperCase();

  if (sport !== activeImportSportV299()) {
    throw new Error(
      `This Fantrax sync is for ${sport || 'another sport'}, but the current Front Office is ${activeImportSportV299()}.`
    );
  }

  const rosterItems = Array.isArray(syncData?.selectedRoster?.rosterItems)
    ? syncData.selectedRoster.rosterItems
    : [];

  if (!rosterItems.length) {
    throw new Error('Fantrax did not return any players for the selected roster.');
  }

  const identityById = fantraxApiMatchMapV3170(syncData?.playerIdMatches);
  const playerInfoById = fantraxApiMatchMapV3170(syncData?.identityMatches);

  const sectionCounts = {};
  let minors = 0;

  const rows = rosterItems.map((item, index) => {
    const sourceId = String(item?.id || '').trim();
    const identity = identityById.get(sourceId) || {};
    const playerInfo = playerInfoById.get(sourceId) || {};

    const sourceName = String(identity.name || '').trim();
    const name = fantraxApiDisplayNameV3170(sourceName);
    const realTeam = normalizeSourceTeamV299(identity.team, sport);
    const sourcePosition = String(
      identity.position
      || item?.position
      || ''
    ).trim().toUpperCase();
    const match = resolveExistingImportPlayerV3171(
      sourceId,
      name,
      realTeam,
      sourcePosition
    );
    const existing = match.player;

    const rawPos = String(
      sourcePosition
      || existing?.position
      || ''
    ).trim().toUpperCase();

    const rawEligible = String(
      playerInfo.eligiblePos
      || identity.eligiblePos
      || identity.position
      || item?.position
      || existing?.eligiblePositions
      || ''
    ).trim().toUpperCase();

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

    const statusRaw = String(item?.status || '').trim().toUpperCase();
    const isMinors = isFantraxMinorsStatus(statusRaw);
    const statusResult = mapFantraxStatus(
      statusRaw,
      existing?.statusId || null
    );

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

    const section = statusRaw || 'Players';
    sectionCounts[section] = (sectionCounts[section] || 0) + 1;
    if (isMinors) minors += 1;

    const importRow = {
      sourceRow:index + 1,
      sourceType:'FANTRAX',
      sourceId,
      name,
      position,
      eligiblePositions,
      realTeam,
      ageSnapshot:null,
      statusId:statusResult.statusId,
      statusRaw,
      statusWarning:statusResult.warning || '',
      positionWarning:positionWarning || '',
      settingsWarning,
      isProspect:isMinors ? true : Boolean(existing?.isProspect),
      rosterGroup:isMinors ? 'FARM' : 'ACTIVE',
      isMinors,
      salary:fantraxApiWholeDollarV3170(item?.salary),
      salaries:{},
      capOverrides:{},
      section,
      fantraxPosRaw:rawPos,
      fantraxEligibleRaw:rawEligible,
      fantraxLineupSlotKey:lineupSlotKey,
      positionChoices,
      requiresPositionResolution,
      fantraxContractRaw:'',
      contractInputMode:'auto',
      contractSourceHeader:'',
      contractParsed:null,
      contractEndSeasonId:null,
      contractWarning:'',
      fantraxApiSourceName:sourceName,
      matchConflict:Boolean(match.conflict),
      matchConflictReason:match.reason || '',
      matchCandidates:(match.candidates || []).map((player) => player.id),
      matchWarning:importMatchConflictWarningV3171(match),
      existingPlayerId:existing?.id || null,
      action:existing ? 'Update' : 'Add',
      valid:false,
      warning:''
    };

    refreshFantraxRowValidityV299(importRow);
    return importRow;
  });

  const incomingIds = new Set(
    rows.map((row) => row.sourceId).filter(Boolean)
  );

  const linkedPlayersMissingFromFantrax = state.players
    .filter((player) =>
      player.fantraxId
      && !incomingIds.has(String(player.fantraxId).trim())
    )
    .map((player) => ({
      id:player.id,
      name:player.name,
      fantraxId:player.fantraxId
    }));

  const hasSalary = rows.some((row) =>
    row.salary !== null && row.salary !== undefined
  );

  return {
    rows,
    meta:{
      ...blankImportMetaV299(),
      type:'fantrax',
      sourceMode:'api',
      sport,
      players:rows.length,
      minors,
      sections:Object.keys(sectionCounts),
      sectionCounts,
      hasSalary,
      hasContract:false,
      syncOptions:{
        roster:requestedOptions?.roster !== false,
        salaries:requestedOptions?.salaries !== false,
        contracts:requestedOptions?.contracts !== false
      },
      contractNumericMode:requestedOptions?.contractNumericMode === 'contract_year'
        ? 'contract_year'
        : 'remaining',
      fantraxLeagueId:String(syncData?.leagueId || connection?.leagueId || '').trim(),
      fantraxTeamId:String(syncData?.teamId || connection?.teamId || '').trim(),
      fantraxLeagueName:String(connection?.leagueName || '').trim(),
      fantraxTeamName:String(
        syncData?.selectedRoster?.teamName
        || syncData?.teamName
        || connection?.teamName
        || ''
      ).trim(),
      fantraxSalaryCap:fantraxApiWholeDollarV3170(
        syncData?.selectedRoster?.salaryCap
        ?? syncData?.rosterSummary?.salaryCap
      ),
      linkedPlayersMissingFromFantrax
    }
  };
}

function openFantraxApiImportReviewV3170(syncData, connection = null, requestedOptions = null) {
  const mapped = fantraxApiImportRowsV3170(syncData, connection, requestedOptions);

  openImportDialog();

  pendingImport = mapped.rows;
  pendingImportMeta = mapped.meta;
  importPreviewFileName = 'Fantrax API Sync';

  if (el('importRosterToggle')) {
    el('importRosterToggle').checked = pendingImportMeta.syncOptions.roster;
  }
  if (el('importSalaryToggle')) {
    el('importSalaryToggle').checked = pendingImportMeta.syncOptions.salaries;
  }
  if (el('importContractToggle')) {
    el('importContractToggle').checked = pendingImportMeta.syncOptions.contracts;
  }
  if (el('importContractNumericModeV3171')) {
    el('importContractNumericModeV3171').value = pendingImportMeta.contractNumericMode;
  }

  refreshImportContractRowsV3171();
  pendingImport.forEach((row) => refreshFantraxRowValidityV299(row));

  const fileLabel = importDialog.querySelector('.file-drop > span');
  if (fileLabel) fileLabel.textContent = 'Fantrax API Sync';

  renderImportPreview();

  return {
    players:mapped.rows.length,
    ready:mapped.rows.filter((row) => row.valid).length,
    issues:mapped.rows.filter((row) => !row.valid).length,
    missingLinkedPlayers:mapped.meta.linkedPlayersMissingFromFantrax.length
  };
}

window.RosterCapFantraxApiSync = Object.freeze({
  version:'3.17.1',
  openReview:openFantraxApiImportReviewV3170,
  mapRows:fantraxApiImportRowsV3170
});

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

  const match = resolveExistingImportPlayerV3171(
    sourceId,
    name,
    realTeam,
    position
  );
  const existing = match.player;
  const contractInput = explicitContractInputV3171(record, headers);

  const importRow = {
    sourceRow,
    sourceType: sourceId ? 'FANTRAX' : 'GENERIC',
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
    contractRaw: contractInput.raw,
    contractInputMode: contractInput.mode,
    contractSourceHeader: contractInput.sourceHeader,
    contractParsed: null,
    contractEndSeasonId: null,
    contractWarning: '',
    matchConflict: Boolean(match.conflict),
    matchConflictReason: match.reason || '',
    matchCandidates: (match.candidates || []).map((player) => player.id),
    matchWarning: importMatchConflictWarningV3171(match),
    existingPlayerId: existing?.id || null,
    action: existing ? 'Update' : 'Add',
    valid: Boolean(name && position && status?.id && !match.conflict),
    warning: match.conflict ? importMatchConflictWarningV3171(match) : ''
  };

  parseImportContractRowV3171(importRow);
  if (!importRow.warning && importRow.contractWarning) {
    importRow.warning = importRow.contractWarning;
  }
  return importRow;
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
      importFantraxSyncOptionsV3171().salaries
      && pendingImportMeta.hasSalary
      && el('importSalaryToggle')?.checked
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

  if (
    pendingImportMeta.type === 'fantrax'
    && !importFantraxSyncOptionsV3171().roster
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
    pendingImportMeta.type === 'fantrax'
    && !importFantraxSyncOptionsV3171().roster
  ) {
    const kept = existing?.rosterGroup || 'ACTIVE';
    return `<span class="import-kept">${escapeHtml(rosterGroupLabelV299(kept))}<small>roster sync off</small></span>`;
  }

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
    && (!importFantraxSyncOptionsV3171().salaries || !pendingImportMeta.hasSalary || !el('importSalaryToggle')?.checked)
  ) {
    const reason = !importFantraxSyncOptionsV3171().salaries
      ? 'salary sync off'
      : (pendingImportMeta.hasSalary ? 'kept' : 'not supplied');
    return `<span class="import-kept">${saved === null ? '—' : formatMoney(saved)}<small>${reason}</small></span>`;
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


function importContractWillApplyV3171(row) {
  if (pendingImportMeta.type === 'rostercap_backup') return true;

  const contractsSelected = pendingImportMeta.type === 'fantrax'
    ? importFantraxSyncOptionsV3171().contracts
    : (el('importContractToggle')?.checked !== false);

  if (!contractsSelected) return false;

  const parsed = row.contractParsed || parseImportContractRowV3171(row);
  return Boolean(parsed?.canUpdateEnd && parsed?.endSeasonId);
}

function importContractChangesV3171(row) {
  if (!importContractWillApplyV3171(row)) return false;

  const existing = importExistingPlayer(row);

  if (pendingImportMeta.type === 'rostercap_backup') {
    const incoming = row.contractEndSeasonId || null;
    if (!existing) return Boolean(incoming);
    return String(existing.contractEndSeasonId || '') !== String(incoming || '');
  }

  const incoming = row.contractParsed?.endSeasonId || row.contractEndSeasonId || null;
  if (!incoming) return false;
  if (!existing) return true;
  return String(existing.contractEndSeasonId || '') !== String(incoming);
}

function importContractPreviewMarkupV3171(row) {
  const existing = importExistingPlayer(row);
  const existingSeason = existing?.contractEndSeasonId
    ? seasonById(existing.contractEndSeasonId)
    : null;
  const existingLabel = existingSeason
    ? seasonLabel(existingSeason.startYear)
    : '—';

  if (pendingImportMeta.type === 'rostercap_backup') {
    const targetSeason = row.contractEndSeasonId
      ? seasonById(row.contractEndSeasonId)
      : null;
    const targetLabel = targetSeason
      ? seasonLabel(targetSeason.startYear)
      : '—';

    if (!existing) {
      return `<span class="import-new-value">${escapeHtml(targetLabel)}<small>restore</small></span>`;
    }

    if (String(existing.contractEndSeasonId || '') === String(row.contractEndSeasonId || '')) {
      return `<span class="import-kept">${escapeHtml(targetLabel)}<small>no change</small></span>`;
    }

    return `<span class="import-change"><span>${escapeHtml(existingLabel)}</span><strong>→</strong><span>${escapeHtml(targetLabel)}</span><small>restore</small></span>`;
  }

  const raw = String(row.fantraxContractRaw ?? row.contractRaw ?? '').trim();
  const parsed = row.contractParsed || parseImportContractRowV3171(row);
  const contractsSelected = pendingImportMeta.type === 'fantrax'
    ? importFantraxSyncOptionsV3171().contracts
    : (el('importContractToggle')?.checked !== false);

  if (!raw) {
    return `<span class="import-kept">${escapeHtml(existingLabel)}<small>not supplied</small></span>`;
  }

  if (!contractsSelected) {
    return `<span class="import-kept">${escapeHtml(existingLabel)}<small>contracts sync off · ${escapeHtml(raw)}</small></span>`;
  }

  if (parsed?.contractYear !== null && parsed?.contractYear !== undefined) {
    return `<span class="import-kept">${escapeHtml(existingLabel)}<small>Fantrax Year ${escapeHtml(String(parsed.contractYear))} · end kept</small></span>`;
  }

  if (!parsed?.canUpdateEnd || !parsed?.endSeasonId) {
    const context = parsed?.contractType
      ? `${parsed.contractType}${parsed.endYear ? ` ${parsed.endYear}` : ''}`
      : raw;
    return `<span class="import-kept">${escapeHtml(existingLabel)}<small>${escapeHtml(context)} · end kept</small></span>`;
  }

  const targetSeason = seasonById(parsed.endSeasonId);
  const targetLabel = targetSeason
    ? seasonLabel(targetSeason.startYear)
    : String(parsed.endYear || raw);
  const prefix = parsed.contractType ? `${parsed.contractType} · ` : '';

  if (!existing) {
    return `<span class="import-new-value">${escapeHtml(targetLabel)}<small>${escapeHtml(prefix)}set</small></span>`;
  }

  if (String(existing.contractEndSeasonId || '') === String(parsed.endSeasonId)) {
    return `<span class="import-kept">${escapeHtml(targetLabel)}<small>${escapeHtml(prefix)}no change</small></span>`;
  }

  return `<span class="import-change"><span>${escapeHtml(existingLabel)}</span><strong>→</strong><span>${escapeHtml(targetLabel)}</span><small>${escapeHtml(prefix)}${escapeHtml(raw)}</small></span>`;
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

  const contractChanges = valid.filter((row) =>
    importContractChangesV3171(row)
  ).length;

  return {
    ready: valid.length,
    invalid,
    adds,
    updates,
    rosterMoves: rosterMoves.length,
    toMinors,
    toActive,
    salaryChanges,
    contractChanges
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
    const apiSync = pendingImportMeta.sourceMode === 'api';
    const syncOptions = importFantraxSyncOptionsV3171();
    const salaryText = pendingImportMeta.hasSalary
      ? (syncOptions.salaries
          ? 'Current-season salary can update when Fantrax supplies it.'
          : 'Salary sync is off, so saved salary is preserved.')
      : (apiSync
          ? 'Fantrax did not supply a usable current salary for these rows, so saved salary is preserved.'
          : 'This Fantrax file does not include Salary, so existing salary data is preserved.');

    const identityText = syncOptions.roster
      ? (apiSync
          ? `Player name, Fantrax ID, real ${sport} team, primary position, eligible positions, roster status and Active/${importDevelopmentLabelV299()} location.`
          : `Player identity, real player position/eligibility, ${sport} team, age, roster status, Fantrax link and Active/${importDevelopmentLabelV299()} location.`)
      : 'Roster & player-info sync is off, so existing roster identity and location fields are preserved.';

    const contractText = syncOptions.contracts
      ? 'Recognized Contract values can update contract end. UFA28/RFA28, 2028 and 28 map to an end year. Numeric values such as 1 or 2 follow the selected Years remaining / Current contract year interpretation.'
      : 'Contract sync is off, so existing contract end is preserved.';

    return `<div class="import-safety-panel">
      <div>
        <span class="import-safety-icon">✓</span>
        <span><strong>What this Fantrax ${escapeHtml(sport)} ${apiSync ? 'sync' : 'import'} updates</strong><small>${escapeHtml(identityText)} NFL SFX is treated as the Superflex lineup allocation; if Fantrax omits the underlying position, the import review asks the user to choose QB/RB/WR/TE. ${escapeHtml(salaryText)}</small></span>
      </div>
      <div>
        <span class="import-safety-icon protected">◆</span>
        <span><strong>Contract + protected data</strong><small>${escapeHtml(contractText)} Blank, unrecognized or out-of-horizon contract values never clear an existing contract. Each player can be included or skipped in review. Future salaries, cap overrides, notes and financial adjustments are preserved. Players missing from Fantrax are never removed automatically.</small></span>
      </div>
    </div>`;
  }

  return `<div class="import-safety-panel">
    <div>
      <span class="import-safety-icon">✓</span>
      <span><strong>What this generic CSV updates</strong><small>Matched player identity/status fields, recognized season salary columns and recognized contract data. Fantrax uses the Contract column; optional explicit Contract End / Years Remaining columns are also accepted when a custom file supplies them. New valid rows are added only when included in review.</small></span>
    </div>
    <div>
      <span class="import-safety-icon protected">◆</span>
      <span><strong>Protected data</strong><small>Blank or unrecognized contract values preserve the existing contract end. Each review row can be included or skipped. Existing roster location, notes and cap overrides are preserved. Players missing from this file are not removed.</small></span>
    </div>
  </div>`;
}

function renderImportPreview() {
  if (!pendingImport.length) return;

  pendingImport.forEach(importEnsureRowDecisionV3172);

  const valid = pendingImport.filter((row) => row.valid);
  const includedValid = valid.filter(importRowWillApplyV3172);
  const skippedValid = valid.length - includedValid.length;
  const invalid = pendingImport.length - valid.length;
  const current = currentSeason();

  const fantrax = pendingImportMeta.type === 'fantrax';
  const backup = pendingImportMeta.type === 'rostercap_backup';

  const stats = importReviewStats(includedValid, invalid, current);
  const previewRows = pendingImport.slice(0, 30);

  const fantraxOptions = el('importFantraxOptionsV3171');
  const rosterOption = el('importRosterOptionV3171');
  const salaryOption = el('importSalaryOptionV3171');
  const contractOption = el('importContractOptionV3171');
  const contractModeWrap = el('importContractNumericModeWrapV3171');
  const rosterToggle = el('importRosterToggle');
  const salaryToggle = el('importSalaryToggle');
  const contractToggle = el('importContractToggle');
  const contractMode = el('importContractNumericModeV3171');

  const showModularOptions = fantrax || (!backup && pendingImportMeta.hasContract);
  fantraxOptions?.classList.toggle('hidden', !showModularOptions);

  if (rosterOption) rosterOption.classList.toggle('hidden', !fantrax);
  if (salaryOption) salaryOption.classList.toggle('hidden', !fantrax);
  if (contractOption) contractOption.classList.toggle('hidden', !showModularOptions);
  if (contractModeWrap) contractModeWrap.classList.toggle('hidden', !showModularOptions);

  if (fantrax) {
    const syncOptions = importFantraxSyncOptionsV3171();
    if (rosterToggle) rosterToggle.checked = syncOptions.roster;
    if (salaryToggle) salaryToggle.checked = syncOptions.salaries;
    if (contractToggle) contractToggle.checked = syncOptions.contracts;
  }

  if (rosterToggle) rosterToggle.disabled = !fantrax;
  if (salaryToggle) salaryToggle.disabled = !(fantrax && pendingImportMeta.hasSalary);
  if (contractToggle) contractToggle.disabled = !showModularOptions;
  if (contractMode) {
    contractMode.disabled = !showModularOptions || !contractToggle?.checked;
    contractMode.value = importContractNumericModeV3171();
  }

  const dialogTitle = importDialog.querySelector('.drawer-header h3');
  if (dialogTitle) {
    dialogTitle.textContent = backup
      ? 'Restore Roster Backup'
      : (fantrax && pendingImportMeta.sourceMode === 'api' ? 'Review Fantrax Sync' : 'Import Roster');
  }

  const intro = importDialog.querySelector('.modal-body > p.muted');
  if (intro) {
    if (backup) {
      intro.textContent =
        'Review the listed player, roster and contract changes. Transactions, Assets and financial history will not be touched.';
    } else if (fantrax) {
      intro.textContent =
        pendingImportMeta.sourceMode === 'api'
          ? `Fantrax ${pendingImportMeta.sport} sync data loaded. Review the selected roster, salary and contract modules before applying.`
          : `Fantrax ${pendingImportMeta.sport} Team Roster detected. Review the selected roster, salary and contract modules before applying.`;
    } else {
      intro.textContent =
        'Generic CSV detected. Review every mapped row before applying.';
    }
  }

  const rows = previewRows.map((row) => {
    const existing = importExistingPlayer(row);
    const actionLabel = row.matchConflict
      ? 'Review'
      : (backup && existing
          ? 'Restore'
          : (existing ? 'Update' : 'Add'));
    const matchNote = row.matchConflict
      ? '<small class="import-row-note">Possible duplicate</small>'
      : (existing
          ? '<small class="import-row-note">Matched existing</small>'
          : '<small class="import-row-note">New player</small>');

    const included = importRowWillApplyV3172(row);

    return `<tr class="${row.valid ? '' : 'import-invalid-row'}" ${row.valid && !included ? 'style="opacity:.58"' : ''}>
      <td>${row.sourceRow}</td>
      <td><strong>${escapeHtml(row.name || 'Missing name')}</strong>${matchNote}</td>
      <td>${importPositionCellMarkupV299(row)}</td>
      <td>${escapeHtml(row.realTeam || '—')}</td>
      <td>${escapeHtml(statusById(row.statusId)?.name || row.statusRaw || 'Unmapped')}</td>
      <td>${importLocationPreviewMarkup(row)}</td>
      <td>${importSalaryPreviewMarkup(row, current)}</td>
      <td>${importContractPreviewMarkupV3171(row)}</td>
      <td><span class="import-action-badge ${existing ? 'update' : 'add'}">${actionLabel}</span></td>
      <td>${importDecisionCellMarkupV3172(row, existing, backup)}</td>
      <td>${row.valid ? `<span class="import-ready">${included ? (row.warning ? 'Ready*' : 'Ready') : 'Skipped'}</span>${row.warning ? `<small class="import-row-note">${escapeHtml(row.warning)}</small>` : ''}` : `<span class="danger">${escapeHtml(row.warning || 'Needs review')}</span>`}</td>
    </tr>`;
  }).join('');

  const sectionCount = pendingImportMeta.sections?.length || 0;

  const detector = backup
    ? `<div class="import-detect"><span class="import-chip primary">RosterCap Roster Backup</span><span class="import-chip">${escapeHtml(pendingImportMeta.backupVersion || '')}</span>${pendingImportMeta.backupSport ? `<span class="import-chip">${escapeHtml(pendingImportMeta.backupSport)}</span>` : ''}<span class="import-chip">${pendingImportMeta.players} players</span><span class="import-chip">${pendingImportMeta.minors} ${escapeHtml(importDevelopmentLabelV299().toLowerCase())}</span>${pendingImportMeta.backupTeam ? `<span class="import-chip">${escapeHtml(pendingImportMeta.backupTeam)}</span>` : ''}${importPreviewFileName ? `<span class="import-chip file">${escapeHtml(importPreviewFileName)}</span>` : ''}</div>`
    : fantrax
      ? `<div class="import-detect"><span class="import-chip primary">${pendingImportMeta.sourceMode === 'api' ? 'Fantrax API Sync' : `Fantrax ${escapeHtml(pendingImportMeta.sport)} Team Roster`}</span><span class="import-chip">${pendingImportMeta.players} players</span><span class="import-chip">${sectionCount} section${sectionCount === 1 ? '' : 's'}</span><span class="import-chip">${pendingImportMeta.minors} ${escapeHtml(importDevelopmentLabelV299().toLowerCase())}</span><span class="import-chip">${pendingImportMeta.hasSalary ? 'Salary included' : (pendingImportMeta.sourceMode === 'api' ? 'No usable salary' : 'No salary column')}</span><span class="import-chip">${pendingImportMeta.hasContract ? 'Contract data included' : (pendingImportMeta.sourceMode === 'api' ? 'No API contract data' : 'No contract column')}</span>${importPreviewFileName ? `<span class="import-chip file">${escapeHtml(importPreviewFileName)}</span>` : ''}</div>`
      : `<div class="import-detect"><span class="import-chip primary">Generic CSV</span><span class="import-chip">${pendingImportMeta.players} rows</span>${importPreviewFileName ? `<span class="import-chip file">${escapeHtml(importPreviewFileName)}</span>` : ''}</div>`;

  const movementDetail = fantrax && !importFantraxSyncOptionsV3171().roster
    ? 'sync off'
    : ((fantrax || backup)
        ? (
            stats.rosterMoves
              ? `${stats.rosterMoves} · ${stats.toMinors} to ${importDevelopmentLabelV299()} · ${stats.toActive} to ${importPrimaryRosterLabelV299()}`
              : '0 · no location changes'
          )
        : 'Not changed');

  const salarySummary = fantrax && !importFantraxSyncOptionsV3171().salaries
    ? 'sync off'
    : (fantrax && !pendingImportMeta.hasSalary
        ? 'not supplied'
        : (current ? seasonLabel(current.startYear) : 'current season'));

  const contractSummary = fantrax && !importFantraxSyncOptionsV3171().contracts
    ? 'sync off'
    : (pendingImportMeta.hasContract ? 'recognized values only' : 'not supplied');

  const reviewSummary = `<div class="import-review-summary">
    <div><span>Included</span><strong>${stats.ready}</strong><small>will apply</small></div>
    <div><span>Add</span><strong>${stats.adds}</strong><small>included new players</small></div>
    <div><span>${backup ? 'Restore' : 'Update'}</span><strong>${stats.updates}</strong><small>included matched players</small></div>
    <div class="${stats.rosterMoves ? 'attention' : ''}"><span>Roster moves</span><strong>${(fantrax || backup) ? stats.rosterMoves : '—'}</strong><small>${escapeHtml(movementDetail)}</small></div>
    <div class="${stats.salaryChanges ? 'attention' : ''}"><span>Salary changes</span><strong>${stats.salaryChanges}</strong><small>${escapeHtml(salarySummary)}</small></div>
    <div class="${stats.contractChanges ? 'attention' : ''}"><span>Contract changes</span><strong>${stats.contractChanges}</strong><small>${escapeHtml(contractSummary)}</small></div>
    <div class="${skippedValid ? 'attention' : ''}"><span>User skipped</span><strong>${skippedValid}</strong><small>valid rows excluded</small></div>
    <div class="${stats.invalid ? 'warning' : ''}"><span>Needs review</span><strong>${stats.invalid}</strong><small>blocked rows</small></div>
  </div>`;

  const rowLimitNote = pendingImport.length > previewRows.length
    ? `<div class="import-preview-limit">Showing the first ${previewRows.length} of ${pendingImport.length} rows. ${includedValid.length} included valid row${includedValid.length === 1 ? '' : 's'} will be applied; skipped and blocked rows will not be written.</div>`
    : '';

  const backupWarnings = backup && pendingImportMeta.backupWarnings?.length
    ? `<div class="import-review-warning"><strong>Backup compatibility notice</strong><span>${escapeHtml(pendingImportMeta.backupWarnings.join(' '))}</span></div>`
    : '';

  const unresolvedPositionRows = pendingImport.filter(
    (row) => row.requiresPositionResolution
  ).length;

  const missingLinkedPlayers = fantrax && pendingImportMeta.sourceMode === 'api'
    && Array.isArray(pendingImportMeta.linkedPlayersMissingFromFantrax)
      ? pendingImportMeta.linkedPlayersMissingFromFantrax
      : [];

  const missingLinkedNote = missingLinkedPlayers.length
    ? `<div class="import-review-warning"><strong>${missingLinkedPlayers.length} linked RosterCap player${missingLinkedPlayers.length === 1 ? '' : 's'} ${missingLinkedPlayers.length === 1 ? 'is' : 'are'} not on the current Fantrax roster.</strong><span>They will be kept. This sync never removes players automatically.${missingLinkedPlayers.length <= 8 ? ` ${escapeHtml(missingLinkedPlayers.map((player) => player.name).join(', '))}` : ''}</span></div>`
    : '';

  const fantraxCapNote = fantrax && pendingImportMeta.sourceMode === 'api'
    && pendingImportMeta.fantraxSalaryCap !== null
    && pendingImportMeta.fantraxSalaryCap !== undefined
      ? `<div class="import-review-warning"><strong>Fantrax salary cap: ${escapeHtml(formatMoney(pendingImportMeta.fantraxSalaryCap))}</strong><span>Shown for comparison only. This player sync does not overwrite RosterCap league settings or future caps.</span></div>`
      : '';

  const duplicateConflictRows = pendingImport.filter((row) => row.matchConflict).length;

  const invalidNote = invalid
    ? `<div class="import-review-warning"><strong>${invalid} row${invalid === 1 ? '' : 's'} need${invalid === 1 ? 's' : ''} review.</strong><span>${duplicateConflictRows
        ? `${duplicateConflictRows} row${duplicateConflictRows === 1 ? '' : 's'} ${duplicateConflictRows === 1 ? 'has' : 'have'} a possible duplicate match. Remove or resolve the duplicate in RosterCap before applying this sync. `
        : ''}${backup
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
    ${missingLinkedNote}
    ${fantraxCapNote}
    ${invalidNote}
    <div class="transaction-rules-footer" style="margin-top:10px">
      <span>Choose what happens for each player. Skipping a row means RosterCap writes nothing for that player.</span>
      <div class="settings-data-actions">
        <button class="btn btn-secondary btn-small" data-import-bulk-decision="include-safe" type="button">Include All Safe</button>
        <button class="btn btn-ghost btn-small" data-import-bulk-decision="skip-new" type="button">Skip New Players</button>
      </div>
    </div>
    <div class="import-review-table-head"><strong>Player review</strong><span>Nothing is saved until you press the apply button.</span></div>
    <div class="table-wrap import-review-table-wrap">
      <table class="import-review-table">
        <thead><tr><th>Row</th><th>Player</th><th>Pos</th><th>Team</th><th>Status</th><th>Location</th><th>${current ? escapeHtml(seasonLabel(current.startYear)) : 'Salary'}</th><th>Contract</th><th>Action</th><th>Decision</th><th>Check</th></tr></thead>
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

  preview.querySelectorAll('[data-import-decision-row]').forEach((select) => {
    select.addEventListener('change', () => {
      const sourceRow = Number(select.dataset.importDecisionRow);
      const row = pendingImport.find(
        (candidate) => Number(candidate.sourceRow) === sourceRow
      );

      if (!row) return;
      importSetDecisionV3172(row, select.value);
      renderImportPreview();
    });
  });

  preview.querySelector('[data-import-bulk-decision="include-safe"]')
    ?.addEventListener('click', () => {
      pendingImport.forEach((row) => {
        if (row.valid && !row.matchConflict) row.applyDecision = 'include';
      });
      renderImportPreview();
    });

  preview.querySelector('[data-import-bulk-decision="skip-new"]')
    ?.addEventListener('click', () => {
      pendingImport.forEach((row) => {
        if (row.valid && !importExistingPlayer(row)) row.applyDecision = 'skip';
      });
      renderImportPreview();
    });

  const applyButton = el('applyImportBtn');
  applyButton.disabled = includedValid.length === 0;
  applyButton.textContent = includedValid.length
    ? (
        backup
          ? `Restore ${includedValid.length} Player${includedValid.length === 1 ? '' : 's'}`
          : (fantrax && pendingImportMeta.sourceMode === 'api'
              ? `Apply Sync (${includedValid.length})`
              : `Apply ${includedValid.length} Row${includedValid.length === 1 ? '' : 's'}`)
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
  const rows = pendingImport.filter(importRowWillApplyV3172);
  if (!rows.length) return;

  const frontOfficeId = state.frontOffice?.id;
  if (!frontOfficeId) {
    alert('Reopen this Front Office before importing.');
    return;
  }

  const backup = pendingImportMeta.type === 'rostercap_backup';
  const fantrax = pendingImportMeta.type === 'fantrax';
  const syncOptions = importFantraxSyncOptionsV3171();

  const updateRoster = Boolean(fantrax && syncOptions.roster);
  const updateSalary = Boolean(
    fantrax
    && syncOptions.salaries
    && pendingImportMeta.hasSalary
    && el('importSalaryToggle')?.checked
  );
  const updateContracts = Boolean(
    !backup
    && (
      fantrax
        ? syncOptions.contracts
        : (pendingImportMeta.hasContract && el('importContractToggle')?.checked)
    )
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

      const preserveRosterFields = fantrax && !updateRoster && existing;

      const finalPosition = preserveRosterFields
        ? (existing.position || importDefaultPositionV299())
        : (
            row.position
            || existing?.position
            || importDefaultPositionV299()
          );

      const finalEligibility = preserveRosterFields
        ? (existing.eligiblePositions || existing.position || finalPosition)
        : (
            row.eligiblePositions
            || existing?.eligiblePositions
            || finalPosition
          );

      const finalAge = backup
        ? (row.ageSnapshot ?? null)
        : (preserveRosterFields
            ? (existing?.ageSnapshot ?? null)
            : (row.ageSnapshot ?? existing?.ageSnapshot ?? null));

      const parsedContract = row.contractParsed || parseImportContractRowV3171(row);
      const finalContractEndSeasonId = backup
        ? (row.contractEndSeasonId || null)
        : (
            updateContracts
            && parsedContract?.canUpdateEnd
            && parsedContract?.endSeasonId
              ? parsedContract.endSeasonId
              : (existing?.contractEndSeasonId || null)
          );

      const { data: savedPlayerId, error } = await db.rpc(
        'save_front_office_player_v2',
        {
          p_front_office_id: frontOfficeId,
          p_front_office_player_id: existing?.id || null,
          p_player_name: preserveRosterFields
            ? existing.name
            : row.name,
          p_position: finalPosition,
          p_eligible_positions: finalEligibility,
          p_real_team: backup
            ? (row.realTeam || null)
            : (preserveRosterFields
                ? (existing?.realTeam || null)
                : (row.realTeam || existing?.realTeam || null)),
          p_age_snapshot: finalAge,
          p_age_as_of: backup
            ? (row.ageAsOf || null)
            : (preserveRosterFields
                ? (existing?.ageAsOf || null)
                : (
                    finalAge === null || finalAge === undefined
                      ? null
                      : todayIsoDate()
                  )),
          p_roster_status_id: preserveRosterFields
            ? (existing?.statusId || state.statuses[0]?.id)
            : (
                row.statusId
                || existing?.statusId
                || state.statuses[0]?.id
              ),
          p_contract_end_season_id: finalContractEndSeasonId,
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

      if (backup || (fantrax && updateRoster)) {
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
