'use strict';

// ============================================================================
// RosterCap V3.15.0 — Import / Export Sync Review
//
// Frontend-only refinement around the established V2.99 import engine and
// RosterCap Roster Backup V2 export.
//
// Goals:
// - render EVERY imported player in the review (no 30-row preview cap);
// - make actual changes easy to identify before Apply Import;
// - preserve every established parser / persistence rule;
// - keep the full Roster Backup CSV as the canonical round-trip export;
// - add a concise Current Roster Snapshot CSV for review/sharing.
//
// No Supabase writes are introduced here.
// applyImport(), exportRosterCsv() and the existing RPC contracts remain
// authoritative.
// ============================================================================

const ROSTERCAP_IMPORT_SYNC_VERSION_V3150 = '3.15.0';

let importReviewFilterV3150 = 'ALL';
let importReviewQueryV3150 = '';


function importSyncBlankV3150(value) {
  return value === null
    || value === undefined
    || String(value).trim() === '';
}


function importSyncTextV3150(value) {
  if (importSyncBlankV3150(value)) return '—';
  return String(value).trim();
}


function importSyncMoneyV3150(value) {
  if (value === null || value === undefined || value === '') {
    return '—';
  }

  const number = Number(value);
  if (!Number.isFinite(number)) return importSyncTextV3150(value);

  return typeof formatMoney === 'function'
    ? formatMoney(number)
    : `$${number.toLocaleString()}`;
}


function importSyncSameTextV3150(left, right) {
  const a = importSyncBlankV3150(left)
    ? ''
    : String(left).trim();

  const b = importSyncBlankV3150(right)
    ? ''
    : String(right).trim();

  return a === b;
}


function importSyncSameNumberV3150(left, right) {
  const leftBlank = importSyncBlankV3150(left);
  const rightBlank = importSyncBlankV3150(right);

  if (leftBlank || rightBlank) {
    return leftBlank && rightBlank;
  }

  const a = Number(left);
  const b = Number(right);

  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return importSyncSameTextV3150(left, right);
  }

  return a === b;
}


function importSyncStatusLabelV3150(statusId, fallback = '') {
  return statusById(statusId)?.name
    || fallback
    || 'Unmapped';
}


function importSyncRosterGroupLabelV3150(group) {
  if (typeof rosterGroupLabelV299 === 'function') {
    return rosterGroupLabelV299(group);
  }

  return String(group || 'ACTIVE').toUpperCase() === 'FARM'
    ? (
        window.RosterCapTerminology?.developmentLabel?.()
        || 'Minors'
      )
    : 'Active roster';
}


function importSyncDepthAssignmentsForPlayerV3150(playerId) {
  const rows = [];

  Object.entries(state.depthCharts || {})
    .forEach(([position, playerIds]) => {
      (playerIds || []).forEach((id, index) => {
        if (id === playerId) {
          rows.push({
            position:String(position || '').trim().toUpperCase(),
            order:index + 1
          });
        }
      });
    });

  return rows
    .filter((item) => item.position)
    .sort(
      (a,b) =>
        a.position.localeCompare(b.position)
        || a.order - b.order
    );
}


function importSyncDepthKeyV3150(assignments) {
  return (assignments || [])
    .map((item) => ({
      position:String(item?.position || '')
        .trim()
        .toUpperCase(),
      order:Number(item?.order || 0)
    }))
    .filter(
      (item) =>
        item.position
        && Number.isInteger(item.order)
        && item.order > 0
    )
    .sort(
      (a,b) =>
        a.position.localeCompare(b.position)
        || a.order - b.order
    )
    .map((item) => `${item.position}:${item.order}`)
    .join('|');
}


function importSyncChangeV3150(
  changes,
  key,
  label,
  before,
  after,
  options = {}
) {
  const same = options.number
    ? importSyncSameNumberV3150(before, after)
    : importSyncSameTextV3150(before, after);

  if (same) return;

  const formatter = options.money
    ? importSyncMoneyV3150
    : importSyncTextV3150;

  changes.push({
    key,
    label,
    before,
    after,
    beforeText:formatter(before),
    afterText:formatter(after),
    category:options.category || 'identity'
  });
}


function importSyncTargetValuesV3150(row, current) {
  const existing = importExistingPlayer(row);
  const backup =
    pendingImportMeta.type === 'rostercap_backup';

  const fantrax =
    pendingImportMeta.type === 'fantrax';

  const finalPosition =
    row.position
    || existing?.position
    || importDefaultPositionV299();

  const finalEligibility =
    row.eligiblePositions
    || existing?.eligiblePositions
    || finalPosition;

  const finalTeam = backup
    ? (row.realTeam || '')
    : (
        row.realTeam
        || existing?.realTeam
        || ''
      );

  const finalAge = backup
    ? (row.ageSnapshot ?? null)
    : (
        row.ageSnapshot
        ?? existing?.ageSnapshot
        ?? null
      );

  const finalStatusId =
    row.statusId
    || existing?.statusId
    || state.statuses[0]?.id
    || null;

  const finalRosterGroup =
    fantrax || backup
      ? importTargetRosterGroup(row)
      : (
          existing?.rosterGroup
          || row.rosterGroup
          || 'ACTIVE'
        );

  const currentSalary = current
    ? (
        existing?.salaries?.[current.id]?.salary
        ?? null
      )
    : null;

  let finalCurrentSalary = currentSalary;
  let currentSalaryApplies = false;

  if (current) {
    if (backup) {
      finalCurrentSalary =
        row.salaries?.[current.id] ?? null;
      currentSalaryApplies = true;
    } else if (fantrax) {
      const enabled = Boolean(
        pendingImportMeta.hasSalary
        && el('importSalaryToggle')?.checked
        && row.salary !== null
        && row.salary !== undefined
      );

      if (enabled) {
        finalCurrentSalary = row.salary;
        currentSalaryApplies = true;
      }
    } else {
      const incoming =
        row.salaries?.[current.id] ?? null;

      if (
        incoming !== null
        && incoming !== undefined
      ) {
        finalCurrentSalary = incoming;
        currentSalaryApplies = true;
      }
    }
  }

  return {
    existing,
    backup,
    fantrax,
    finalPosition,
    finalEligibility,
    finalTeam,
    finalAge,
    finalStatusId,
    finalRosterGroup,
    currentSalary,
    finalCurrentSalary,
    currentSalaryApplies
  };
}


function importSyncChangesV3150(row, current) {
  const target = importSyncTargetValuesV3150(
    row,
    current
  );

  const existing = target.existing;
  if (!existing) return [];

  const changes = [];

  importSyncChangeV3150(
    changes,
    'name',
    'Player name',
    existing.name,
    row.name
  );

  importSyncChangeV3150(
    changes,
    'position',
    'Position',
    existing.position,
    target.finalPosition
  );

  importSyncChangeV3150(
    changes,
    'eligibility',
    'Eligibility',
    existing.eligiblePositions || existing.position,
    target.finalEligibility
  );

  importSyncChangeV3150(
    changes,
    'team',
    'Team',
    existing.realTeam,
    target.finalTeam
  );

  importSyncChangeV3150(
    changes,
    'age',
    'Age',
    existing.ageSnapshot,
    target.finalAge,
    { number:true }
  );

  importSyncChangeV3150(
    changes,
    'status',
    'Status',
    existing.statusId,
    target.finalStatusId,
    {
      formatter:'status'
    }
  );

  const statusChange = changes.find(
    (item) => item.key === 'status'
  );

  if (statusChange) {
    statusChange.beforeText =
      importSyncStatusLabelV3150(
        existing.statusId
      );

    statusChange.afterText =
      importSyncStatusLabelV3150(
        target.finalStatusId,
        row.statusRaw
      );
  }

  importSyncChangeV3150(
    changes,
    'location',
    'Roster location',
    existing.rosterGroup || 'ACTIVE',
    target.finalRosterGroup
  );

  const locationChange = changes.find(
    (item) => item.key === 'location'
  );

  if (locationChange) {
    locationChange.beforeText =
      importSyncRosterGroupLabelV3150(
        existing.rosterGroup || 'ACTIVE'
      );

    locationChange.afterText =
      importSyncRosterGroupLabelV3150(
        target.finalRosterGroup
      );
  }

  if (
    target.currentSalaryApplies
    && current
  ) {
    importSyncChangeV3150(
      changes,
      `salary:${current.id}`,
      `${seasonLabel(current.startYear)} salary`,
      target.currentSalary,
      target.finalCurrentSalary,
      {
        number:true,
        money:true,
        category:'salary'
      }
    );
  }

  if (
    row.sourceId
    && row.sourceId !== existing.fantraxId
  ) {
    importSyncChangeV3150(
      changes,
      'fantrax',
      'Fantrax ID',
      existing.fantraxId,
      row.sourceId,
      { category:'source' }
    );
  }

  if (target.backup) {
    importSyncChangeV3150(
      changes,
      'age-as-of',
      'Age as of',
      existing.ageAsOf,
      row.ageAsOf
    );

    importSyncChangeV3150(
      changes,
      'prospect',
      'Prospect',
      existing.isProspect ? 'Yes' : 'No',
      row.isProspect ? 'Yes' : 'No'
    );

    importSyncChangeV3150(
      changes,
      'contract-end',
      'Contract end',
      existing.contractEndSeasonId
        ? seasonLabel(
            seasonById(
              existing.contractEndSeasonId
            )?.startYear
          )
        : '',
      row.contractEndSeasonId
        ? seasonLabel(
            seasonById(
              row.contractEndSeasonId
            )?.startYear
          )
        : ''
    );

    importSyncChangeV3150(
      changes,
      'notes',
      'Notes',
      existing.notes || '',
      row.notes || ''
    );

    state.seasons.forEach((season) => {
      const existingSalary =
        existing.salaries?.[season.id]?.salary
        ?? null;

      const incomingSalary =
        row.salaries?.[season.id] ?? null;

      if (
        !current
        || season.id !== current.id
      ) {
        importSyncChangeV3150(
          changes,
          `salary:${season.id}`,
          `${seasonLabel(season.startYear)} salary`,
          existingSalary,
          incomingSalary,
          {
            number:true,
            money:true,
            category:'salary'
          }
        );
      }

      const existingOverride =
        existing.salaries?.[season.id]
          ?.capOverride
        ?? null;

      const incomingOverride =
        row.capOverrides?.[season.id]
        ?? null;

      importSyncChangeV3150(
        changes,
        `override:${season.id}`,
        `${seasonLabel(season.startYear)} cap override`,
        existingOverride,
        incomingOverride,
        {
          number:true,
          money:true,
          category:'cap'
        }
      );
    });

    const currentDepth =
      importSyncDepthKeyV3150(
        importSyncDepthAssignmentsForPlayerV3150(
          existing.id
        )
      );

    const incomingDepth =
      importSyncDepthKeyV3150(
        row.depthAssignments || []
      );

    importSyncChangeV3150(
      changes,
      'depth',
      'Depth order',
      currentDepth,
      incomingDepth
    );
  } else if (!target.fantrax) {
    // Generic CSV can update any supplied season salary.
    state.seasons.forEach((season) => {
      if (
        current
        && season.id === current.id
      ) {
        return;
      }

      const incoming =
        row.salaries?.[season.id]
        ?? null;

      if (
        incoming === null
        || incoming === undefined
      ) {
        return;
      }

      importSyncChangeV3150(
        changes,
        `salary:${season.id}`,
        `${seasonLabel(season.startYear)} salary`,
        existing.salaries?.[season.id]?.salary
          ?? null,
        incoming,
        {
          number:true,
          money:true,
          category:'salary'
        }
      );
    });
  }

  return changes;
}


function importSyncModelV3150(row, current) {
  const target =
    importSyncTargetValuesV3150(
      row,
      current
    );

  const changes =
    row.valid && target.existing
      ? importSyncChangesV3150(
          row,
          current
        )
      : [];

  const kind = !row.valid
    ? 'ISSUE'
    : !target.existing
      ? 'NEW'
      : changes.length
        ? 'CHANGE'
        : 'SAME';

  const search = [
    row.sourceRow,
    row.name,
    target.existing?.name,
    row.position,
    target.existing?.position,
    row.eligiblePositions,
    target.existing?.eligiblePositions,
    row.realTeam,
    target.existing?.realTeam,
    row.statusRaw,
    importSyncStatusLabelV3150(
      target.finalStatusId,
      row.statusRaw
    ),
    importSyncRosterGroupLabelV3150(
      target.finalRosterGroup
    ),
    row.section,
    row.warning,
    ...changes.flatMap((item) => [
      item.label,
      item.beforeText,
      item.afterText
    ])
  ]
    .filter(
      (value) =>
        value !== null
        && value !== undefined
        && String(value).trim()
    )
    .join(' ')
    .toLowerCase();

  return {
    row,
    ...target,
    changes,
    kind,
    search
  };
}


function importSyncChangeForKeyV3150(
  model,
  key
) {
  return model.changes.find(
    (item) => item.key === key
  ) || null;
}


function importSyncFieldMarkupV3150(
  change,
  fallback,
  options = {}
) {
  if (!change) {
    const value = options.money
      ? importSyncMoneyV3150(fallback)
      : importSyncTextV3150(fallback);

    return `<span class="import-sync-static-v3150">${escapeHtml(value)}</span>`;
  }

  return `<span class="import-change import-sync-field-change-v3150">
    <span>${escapeHtml(change.beforeText)}</span>
    <strong>→</strong>
    <span>${escapeHtml(change.afterText)}</span>
  </span>`;
}


function importSyncPositionMarkupV3150(model) {
  const row = model.row;

  if (row.requiresPositionResolution) {
    return importPositionCellMarkupV299(row);
  }

  const position =
    importSyncFieldMarkupV3150(
      importSyncChangeForKeyV3150(
        model,
        'position'
      ),
      model.finalPosition
    );

  const eligibilityChange =
    importSyncChangeForKeyV3150(
      model,
      'eligibility'
    );

  const eligibility = eligibilityChange
    ? `<small class="import-sync-subchange-v3150">Eligible ${escapeHtml(eligibilityChange.beforeText)} → ${escapeHtml(eligibilityChange.afterText)}</small>`
    : (
        model.finalEligibility
        && model.finalEligibility
          !== model.finalPosition
          ? `<small class="import-row-note">Eligible ${escapeHtml(model.finalEligibility)}</small>`
          : ''
      );

  return `${position}${eligibility}`;
}


function importSyncPlayerMarkupV3150(model) {
  const nameChange =
    importSyncChangeForKeyV3150(
      model,
      'name'
    );

  const primary = nameChange
    ? `<span class="import-change import-sync-name-change-v3150">
        <span>${escapeHtml(nameChange.beforeText)}</span>
        <strong>→</strong>
        <span>${escapeHtml(nameChange.afterText)}</span>
      </span>`
    : `<strong>${escapeHtml(model.row.name || 'Missing name')}</strong>`;

  const note = !model.existing
    ? 'New player'
    : model.kind === 'SAME'
      ? 'Matched · no changes'
      : 'Matched existing';

  return `${primary}<small class="import-row-note">${escapeHtml(note)}</small>`;
}


function importSyncSummaryCellV3150(model) {
  if (model.kind === 'ISSUE') {
    return `<span class="import-sync-state-v3150 issue">Needs review</span>`;
  }

  if (model.kind === 'NEW') {
    return `<span class="import-sync-state-v3150 new">New player</span>
      <small class="import-sync-change-list-v3150">Full player row will be added</small>`;
  }

  if (model.kind === 'SAME') {
    return `<span class="import-sync-state-v3150 same">No change</span>
      <small class="import-sync-change-list-v3150">Values already match</small>`;
  }

  const labels = model.changes.map(
    (item) => item.label
  );

  const visible = labels.slice(0, 4);
  const remaining =
    Math.max(0, labels.length - visible.length);

  const detailText = [
    ...visible,
    remaining
      ? `+${remaining} more`
      : null
  ].filter(Boolean).join(' · ');

  return `<span class="import-sync-state-v3150 changed">${model.changes.length} change${model.changes.length === 1 ? '' : 's'}</span>
    <small
      class="import-sync-change-list-v3150"
      title="${escapeAttr(labels.join(' · '))}"
    >${escapeHtml(detailText)}</small>`;
}


function importSyncCheckMarkupV3150(model) {
  const row = model.row;

  if (!row.valid) {
    return `<span class="danger">Needs review</span>
      <small class="import-row-note">${escapeHtml(row.warning || 'Unsupported or incomplete source row.')}</small>`;
  }

  if (row.warning) {
    return `<span class="import-ready">Ready*</span>
      <small class="import-row-note">${escapeHtml(row.warning)}</small>`;
  }

  return '<span class="import-ready">Ready</span>';
}


function importSyncReviewStatsV3150(
  models,
  current
) {
  const valid = models.filter(
    (model) => model.row.valid
  );

  const rosterMoves = valid
    .map((model) =>
      importRosterMovement(model.row)
    )
    .filter(Boolean);

  const salaryChanges = valid.filter(
    (model) =>
      model.changes.some(
        (item) =>
          item.category === 'salary'
      )
  ).length;

  return {
    total:models.length,
    ready:valid.length,
    changed:models.filter(
      (model) => model.kind === 'CHANGE'
    ).length,
    newPlayers:models.filter(
      (model) => model.kind === 'NEW'
    ).length,
    same:models.filter(
      (model) => model.kind === 'SAME'
    ).length,
    issues:models.filter(
      (model) => model.kind === 'ISSUE'
    ).length,
    rosterMoves:rosterMoves.length,
    toMinors:rosterMoves.filter(
      (move) => move.to === 'FARM'
    ).length,
    toActive:rosterMoves.filter(
      (move) => move.to === 'ACTIVE'
    ).length,
    salaryChanges
  };
}


function importSyncFilterButtonV3150(
  key,
  label,
  count
) {
  const active =
    importReviewFilterV3150 === key;

  return `<button
    class="import-sync-filter-v3150 ${active ? 'active' : ''}"
    data-import-sync-filter-v3150="${escapeAttr(key)}"
    type="button"
    aria-pressed="${active ? 'true' : 'false'}"
  ><span>${escapeHtml(label)}</span><strong>${count}</strong></button>`;
}


function applyImportReviewFilterV3150() {
  const preview = el('importPreview');
  if (!preview) return;

  const query =
    String(importReviewQueryV3150 || '')
      .trim()
      .toLowerCase();

  const rows = [
    ...preview.querySelectorAll(
      '[data-import-review-row-v3150]'
    )
  ];

  let shown = 0;

  rows.forEach((row) => {
    const kind =
      row.dataset.importReviewKindV3150
      || '';

    const search =
      row.dataset.importReviewSearchV3150
      || '';

    const filterMatch =
      importReviewFilterV3150 === 'ALL'
      || kind === importReviewFilterV3150;

    const queryMatch =
      !query
      || search.includes(query);

    const visible =
      filterMatch && queryMatch;

    row.hidden = !visible;

    if (visible) shown += 1;
  });

  preview
    .querySelectorAll(
      '[data-import-sync-filter-v3150]'
    )
    .forEach((button) => {
      const active =
        button.dataset.importSyncFilterV3150
        === importReviewFilterV3150;

      button.classList.toggle(
        'active',
        active
      );

      button.setAttribute(
        'aria-pressed',
        active ? 'true' : 'false'
      );
    });

  const count =
    preview.querySelector(
      '[data-import-sync-visible-count-v3150]'
    );

  if (count) {
    count.textContent =
      `${shown} of ${rows.length} shown`;
  }

  const empty =
    preview.querySelector(
      '#importSyncEmptyV3150'
    );

  if (empty) {
    empty.classList.toggle(
      'hidden',
      shown !== 0
    );
  }
}


function bindImportSyncReviewControlsV3150() {
  const preview = el('importPreview');
  if (!preview) return;

  preview
    .querySelectorAll(
      '[data-import-sync-filter-v3150]'
    )
    .forEach((button) => {
      button.addEventListener(
        'click',
        () => {
          importReviewFilterV3150 =
            button.dataset
              .importSyncFilterV3150
            || 'ALL';

          applyImportReviewFilterV3150();
        }
      );
    });

  const search =
    preview.querySelector(
      '#importSyncSearchV3150'
    );

  if (search) {
    search.value =
      importReviewQueryV3150;

    search.addEventListener(
      'input',
      () => {
        importReviewQueryV3150 =
          search.value;

        applyImportReviewFilterV3150();
      }
    );
  }

  applyImportReviewFilterV3150();
}


function renderImportPreviewV3150() {
  if (!pendingImport.length) return;

  const current = currentSeason();

  const fantrax =
    pendingImportMeta.type === 'fantrax';

  const backup =
    pendingImportMeta.type === 'rostercap_backup';

  const models = pendingImport.map(
    (row) =>
      importSyncModelV3150(
        row,
        current
      )
  );

  const stats =
    importSyncReviewStatsV3150(
      models,
      current
    );

  const salaryOption =
    el('importSalaryToggle')
      ?.closest('.import-options');

  if (salaryOption) {
    salaryOption.classList.toggle(
      'hidden',
      !(
        fantrax
        && pendingImportMeta.hasSalary
      )
    );
  }

  if (el('importSalaryToggle')) {
    el('importSalaryToggle').disabled =
      !(
        fantrax
        && pendingImportMeta.hasSalary
      );
  }

  const dialogTitle =
    importDialog.querySelector(
      '.drawer-header h3'
    );

  if (dialogTitle) {
    dialogTitle.textContent = backup
      ? 'Restore Roster Backup'
      : 'Import & Sync Roster';
  }

  const intro =
    importDialog.querySelector(
      '.modal-body > p.muted'
    );

  if (intro) {
    if (backup) {
      intro.textContent =
        'Review every player in this backup before restoring. Changed values are highlighted; transactions, assets and financial history remain protected.';
    } else if (fantrax) {
      intro.textContent =
        `Fantrax ${pendingImportMeta.sport} roster detected. Every player is shown below with the saved RosterCap value compared against the incoming value.`;
    } else {
      intro.textContent =
        'Generic CSV detected. Every mapped row is shown below so you can review additions, changes and issues before applying.';
    }
  }

  const rows = models.map((model) => {
    const row = model.row;

    const teamMarkup =
      importSyncFieldMarkupV3150(
        importSyncChangeForKeyV3150(
          model,
          'team'
        ),
        model.finalTeam
      );

    const ageMarkup =
      importSyncFieldMarkupV3150(
        importSyncChangeForKeyV3150(
          model,
          'age'
        ),
        model.finalAge
      );

    const statusMarkup =
      importSyncFieldMarkupV3150(
        importSyncChangeForKeyV3150(
          model,
          'status'
        ),
        importSyncStatusLabelV3150(
          model.finalStatusId,
          row.statusRaw
        )
      );

    const locationMarkup =
      importSyncFieldMarkupV3150(
        importSyncChangeForKeyV3150(
          model,
          'location'
        ),
        importSyncRosterGroupLabelV3150(
          model.finalRosterGroup
        )
      );

    const salaryChange =
      current
        ? importSyncChangeForKeyV3150(
            model,
            `salary:${current.id}`
          )
        : null;

    const salaryFallback =
      model.currentSalaryApplies
        ? model.finalCurrentSalary
        : model.currentSalary;

    const salaryMarkup =
      importSyncFieldMarkupV3150(
        salaryChange,
        salaryFallback,
        { money:true }
      );

    return `<tr
      class="import-sync-row-v3150 import-sync-${model.kind.toLowerCase()}-v3150 ${row.valid ? '' : 'import-invalid-row'}"
      data-import-review-row-v3150="${escapeAttr(String(row.sourceRow))}"
      data-import-review-kind-v3150="${escapeAttr(model.kind)}"
      data-import-review-search-v3150="${escapeAttr(model.search)}"
    >
      <td class="import-sync-row-number-v3150">${row.sourceRow}</td>
      <td class="import-sync-player-v3150">${importSyncPlayerMarkupV3150(model)}</td>
      <td>${importSyncPositionMarkupV3150(model)}</td>
      <td>${teamMarkup}</td>
      <td>${ageMarkup}</td>
      <td>${statusMarkup}</td>
      <td>${locationMarkup}</td>
      <td>${salaryMarkup}</td>
      <td class="import-sync-summary-v3150">${importSyncSummaryCellV3150(model)}</td>
      <td class="import-sync-check-v3150">${importSyncCheckMarkupV3150(model)}</td>
    </tr>`;
  }).join('');

  const sectionCount =
    pendingImportMeta.sections?.length
    || 0;

  const detector = backup
    ? `<div class="import-detect">
        <span class="import-chip primary">RosterCap Roster Backup</span>
        <span class="import-chip">${escapeHtml(pendingImportMeta.backupVersion || '')}</span>
        ${pendingImportMeta.backupSport ? `<span class="import-chip">${escapeHtml(pendingImportMeta.backupSport)}</span>` : ''}
        <span class="import-chip">${pendingImportMeta.players} players</span>
        <span class="import-chip">${pendingImportMeta.minors} ${escapeHtml(importDevelopmentLabelV299().toLowerCase())}</span>
        ${pendingImportMeta.backupTeam ? `<span class="import-chip">${escapeHtml(pendingImportMeta.backupTeam)}</span>` : ''}
        ${importPreviewFileName ? `<span class="import-chip file">${escapeHtml(importPreviewFileName)}</span>` : ''}
      </div>`
    : fantrax
      ? `<div class="import-detect">
          <span class="import-chip primary">Fantrax ${escapeHtml(pendingImportMeta.sport)} Team Roster</span>
          <span class="import-chip">${pendingImportMeta.players} players</span>
          <span class="import-chip">${sectionCount} section${sectionCount === 1 ? '' : 's'}</span>
          <span class="import-chip">${pendingImportMeta.minors} ${escapeHtml(importDevelopmentLabelV299().toLowerCase())}</span>
          <span class="import-chip">${pendingImportMeta.hasSalary ? 'Salary included' : 'No salary column'}</span>
          ${importPreviewFileName ? `<span class="import-chip file">${escapeHtml(importPreviewFileName)}</span>` : ''}
        </div>`
      : `<div class="import-detect">
          <span class="import-chip primary">Generic CSV</span>
          <span class="import-chip">${pendingImportMeta.players} rows</span>
          ${importPreviewFileName ? `<span class="import-chip file">${escapeHtml(importPreviewFileName)}</span>` : ''}
        </div>`;

  const changeSmall = [
    `${stats.changed} matched changed`,
    stats.salaryChanges
      ? `${stats.salaryChanges} salary`
      : null
  ].filter(Boolean).join(' · ');

  const movementSmall =
    fantrax || backup
      ? (
          stats.rosterMoves
            ? `${stats.toMinors} to ${importDevelopmentLabelV299()} · ${stats.toActive} to ${importPrimaryRosterLabelV299()}`
            : 'no location changes'
        )
      : 'location preserved';

  const reviewSummary = `
    <div class="import-review-summary import-sync-review-summary-v3150">
      <div>
        <span>Players</span>
        <strong>${stats.total}</strong>
        <small>all rows shown</small>
      </div>

      <div class="${stats.changed ? 'attention' : ''}">
        <span>Changed</span>
        <strong>${stats.changed}</strong>
        <small>${escapeHtml(changeSmall || 'matched changes')}</small>
      </div>

      <div class="${stats.newPlayers ? 'attention' : ''}">
        <span>New</span>
        <strong>${stats.newPlayers}</strong>
        <small>players to add</small>
      </div>

      <div>
        <span>No change</span>
        <strong>${stats.same}</strong>
        <small>already matched</small>
      </div>

      <div class="${stats.rosterMoves ? 'attention' : ''}">
        <span>Roster moves</span>
        <strong>${fantrax || backup ? stats.rosterMoves : '—'}</strong>
        <small>${escapeHtml(movementSmall)}</small>
      </div>

      <div class="${stats.issues ? 'warning' : ''}">
        <span>Issues</span>
        <strong>${stats.issues}</strong>
        <small>${stats.issues ? 'needs review' : 'none'}</small>
      </div>
    </div>`;

  const backupWarnings =
    backup
    && pendingImportMeta
      .backupWarnings?.length
      ? `<div class="import-review-warning">
          <strong>Backup compatibility notice</strong>
          <span>${escapeHtml(pendingImportMeta.backupWarnings.join(' '))}</span>
        </div>`
      : '';

  const unresolvedPositionRows =
    pendingImport.filter(
      (row) =>
        row.requiresPositionResolution
    ).length;

  const invalidNote = stats.issues
    ? `<div class="import-review-warning">
        <strong>${stats.issues} row${stats.issues === 1 ? '' : 's'} need${stats.issues === 1 ? 's' : ''} review.</strong>
        <span>${
          backup
            ? 'Restore requires matching sport, configured seasons, roster groups and roster-status names.'
            : unresolvedPositionRows
              ? `${unresolvedPositionRows} Fantrax lineup-slot row${unresolvedPositionRows === 1 ? '' : 's'} can be resolved below by choosing the underlying player position.`
              : 'RosterCap will not guess unsupported player positions or roster statuses. Review the flagged source rows.'
        }</span>
      </div>`
    : '';

  const toolbar = `
    <div class="import-sync-toolbar-v3150">
      <div
        class="import-sync-filters-v3150"
        role="group"
        aria-label="Filter import review"
      >
        ${importSyncFilterButtonV3150('ALL', 'All', stats.total)}
        ${importSyncFilterButtonV3150('CHANGE', 'Changed', stats.changed)}
        ${importSyncFilterButtonV3150('NEW', 'New', stats.newPlayers)}
        ${importSyncFilterButtonV3150('SAME', 'No change', stats.same)}
        ${importSyncFilterButtonV3150('ISSUE', 'Issues', stats.issues)}
      </div>

      <label class="import-sync-search-v3150">
        <span class="sr-only">Search import review</span>
        <input
          id="importSyncSearchV3150"
          type="search"
          value="${escapeAttr(importReviewQueryV3150)}"
          placeholder="Search player, team, status or change"
          autocomplete="off"
        />
      </label>
    </div>

    <div class="import-sync-toolbar-status-v3150">
      <strong>Player review</strong>
      <span data-import-sync-visible-count-v3150>${stats.total} of ${stats.total} shown</span>
      <small>Every imported player is rendered. Filters only change what you are viewing, not what Apply Import will save.</small>
    </div>`;

  const preview = el('importPreview');
  preview.classList.remove('hidden');

  preview.innerHTML = `
    ${detector}
    ${reviewSummary}
    ${importSafetyMarkupV299(fantrax, backup)}
    ${backupWarnings}
    ${invalidNote}
    ${toolbar}

    <div class="table-wrap import-review-table-wrap import-review-table-wrap-v3150">
      <table class="import-review-table import-review-table-v3150">
        <thead>
          <tr>
            <th>Row</th>
            <th>Player</th>
            <th>Pos / Eligible</th>
            <th>Team</th>
            <th>Age</th>
            <th>Status</th>
            <th>Location</th>
            <th>${current ? escapeHtml(seasonLabel(current.startYear)) : 'Salary'}</th>
            <th>Sync</th>
            <th>Check</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>

    <div
      class="import-sync-empty-v3150 hidden"
      id="importSyncEmptyV3150"
    >
      No players match this review filter.
    </div>

    <div class="import-sync-all-rows-note-v3150">
      ${stats.total} source row${stats.total === 1 ? '' : 's'} loaded · ${stats.ready} valid row${stats.ready === 1 ? '' : 's'} will be processed if you continue.
    </div>
  `;

  preview
    .querySelectorAll(
      '[data-import-position-row]'
    )
    .forEach((select) => {
      select.addEventListener(
        'change',
        () => {
          const sourceRow =
            Number(
              select.dataset.importPositionRow
            );

          const row = pendingImport.find(
            (candidate) =>
              Number(candidate.sourceRow)
              === sourceRow
          );

          if (!row) return;

          resolveFantraxPlayerPositionV299(
            row,
            select.value
          );

          renderImportPreview();
        }
      );
    });

  bindImportSyncReviewControlsV3150();

  const applyButton =
    el('applyImportBtn');

  applyButton.disabled =
    stats.ready === 0;

  applyButton.textContent =
    stats.ready
      ? (
          backup
            ? `Restore ${stats.ready} Player${stats.ready === 1 ? '' : 's'}`
            : `Sync ${stats.ready} Valid Row${stats.ready === 1 ? '' : 's'}`
        )
      : 'Apply Import';
}


function installImportReviewV3150() {
  if (
    typeof renderImportPreview
    === 'function'
  ) {
    renderImportPreview =
      renderImportPreviewV3150;
  }

  if (
    typeof openImportDialog
    === 'function'
  ) {
    const establishedOpenImportDialogV3150 =
      openImportDialog;

    openImportDialog = function(...args) {
      importReviewFilterV3150 = 'ALL';
      importReviewQueryV3150 = '';

      return establishedOpenImportDialogV3150(
        ...args
      );
    };
  }
}


// ---------------------------------------------------------------------------
// Current Roster Snapshot CSV
// ---------------------------------------------------------------------------

function rosterSnapshotStatusUseV3150(player) {
  if (
    String(player?.rosterGroup || 'ACTIVE')
      .toUpperCase() === 'FARM'
  ) {
    return (
      window.RosterCapTerminology
        ?.developmentLabel?.()
      || 'Minors'
    );
  }

  if (
    typeof statusIsInjuredV3143 === 'function'
    && statusIsInjuredV3143(
      player?.statusId
    )
  ) {
    return (
      statusById(player?.statusId)?.name
      || 'IR / IL'
    );
  }

  return 'Active / available';
}


function rosterSnapshotLocationV3150(player) {
  return importSyncRosterGroupLabelV3150(
    player?.rosterGroup || 'ACTIVE'
  );
}


function rosterSnapshotDepthV3150(player) {
  const assignments =
    importSyncDepthAssignmentsForPlayerV3150(
      player?.id
    );

  return assignments
    .map(
      (item) =>
        `${item.position}:${item.order}`
    )
    .join('|');
}


function rosterSnapshotSortV3150(left, right) {
  const groupRank = (player) =>
    String(
      player?.rosterGroup || 'ACTIVE'
    ).toUpperCase() === 'FARM'
      ? 2
      : (
          typeof statusIsInjuredV3143
            === 'function'
          && statusIsInjuredV3143(
            player?.statusId
          )
            ? 1
            : 0
        );

  return (
    groupRank(left)
    - groupRank(right)
    || String(left?.position || '')
      .localeCompare(
        String(right?.position || '')
      )
    || String(left?.name || '')
      .localeCompare(
        String(right?.name || '')
      )
  );
}


function exportCurrentRosterSnapshotV3150() {
  if (!state.frontOffice) return;

  const current = currentSeason();

  const sport =
    String(
      state.frontOffice.sport || 'NHL'
    )
      .trim()
      .toUpperCase();

  const headers = [
    'Player',
    'Pos',
    'Eligible',
    'Team',
    'Age',
    'Status',
    'Roster Use',
    'Roster Location',
    'Prospect',
    'Current Season',
    'Current Salary',
    'Current Cap Charge',
    'Counts Toward Cap',
    'Contract End',
    'Depth',
    'Fantrax ID'
  ];

  const rows = [
    ...(state.players || [])
  ]
    .sort(rosterSnapshotSortV3150)
    .map((player) => {
      const salary = current
        ? (
            player.salaries?.[current.id]
              ?.salary
            ?? null
          )
        : null;

      const charge = current
        ? effectivePlayerCharge(
            player,
            current.id
          )
        : null;

      const end =
        player.contractEndSeasonId
          ? seasonById(
              player.contractEndSeasonId
            )
          : null;

      return [
        player.name || '',
        player.position || '',
        player.eligiblePositions
          || player.position
          || '',
        player.realTeam || '',
        player.ageSnapshot ?? '',
        statusById(player.statusId)
          ?.name
          || '',
        rosterSnapshotStatusUseV3150(
          player
        ),
        rosterSnapshotLocationV3150(
          player
        ),
        player.isProspect
          ? 'Yes'
          : 'No',
        current
          ? seasonLabel(
              current.startYear
            )
          : '',
        salary ?? '',
        charge ?? '',
        playerCountsTowardCap(player)
          ? 'Yes'
          : 'No',
        end
          ? seasonLabel(end.startYear)
          : '',
        rosterSnapshotDepthV3150(
          player
        ),
        player.fantraxId || ''
      ];
    });

  const csv = [
    headers,
    ...rows
  ]
    .map(
      (row) =>
        row.map(csvEscape).join(',')
    )
    .join('\n');

  downloadText(
    `${safeFileName(state.frontOffice.teamName)}-${sport.toLowerCase()}-roster-snapshot-${todayIsoDate()}.csv`,
    csv,
    'text/csv'
  );
}


function ensureTopbarSnapshotExportV3150() {
  const backupButton = el('exportBtn');
  if (!backupButton) return;

  if (el('exportSnapshotBtnV3150')) {
    return;
  }

  const button =
    document.createElement('button');

  button.id =
    'exportSnapshotBtnV3150';

  button.className =
    'btn btn-secondary';

  button.type = 'button';
  button.textContent =
    'Current Snapshot CSV';

  button.title =
    'Export a concise current-roster snapshot for spreadsheet review or sharing.';

  button.addEventListener(
    'click',
    exportCurrentRosterSnapshotV3150
  );

  backupButton.insertAdjacentElement(
    'afterend',
    button
  );
}


function decorateRosterExportsV3150() {
  const backup =
    el('rosterExportBtn');

  if (backup) {
    backup.title =
      'Full re-importable RosterCap roster backup.';
  }

  const menu =
    backup?.closest('.tools-popover');

  if (
    menu
    && !menu.querySelector(
      '#rosterSnapshotExportBtnV3150'
    )
  ) {
    const button =
      document.createElement('button');

    button.id =
      'rosterSnapshotExportBtnV3150';

    button.className =
      'btn btn-ghost';

    button.type = 'button';
    button.textContent =
      'Current Snapshot CSV';

    button.title =
      'Current player, status, cap and contract snapshot.';

    button.addEventListener(
      'click',
      () => {
        if (
          typeof closeRosterMenus
          === 'function'
        ) {
          closeRosterMenus();
        }

        exportCurrentRosterSnapshotV3150();
      }
    );

    menu.appendChild(button);
  }
}


function decorateSettingsExportsV3150() {
  const backup =
    el('settingsExportBtn');

  if (!backup) return;

  backup.textContent =
    'Full Backup CSV';

  backup.title =
    'Full re-importable RosterCap roster backup.';

  const actions =
    backup.closest(
      '.settings-data-actions'
    );

  if (
    actions
    && !actions.querySelector(
      '#settingsSnapshotExportBtnV3150'
    )
  ) {
    const button =
      document.createElement('button');

    button.id =
      'settingsSnapshotExportBtnV3150';

    button.className =
      'btn btn-secondary';

    button.type = 'button';
    button.textContent =
      'Current Snapshot CSV';

    button.title =
      'Export every current player with roster status, current salary/cap charge and contract end.';

    button.addEventListener(
      'click',
      exportCurrentRosterSnapshotV3150
    );

    actions.appendChild(button);
  }

  const copy =
    document.querySelector(
      '#settingsView [data-settings-section="data-export"] .settings-card-copy'
    );

  if (copy) {
    copy.textContent =
      'Import / Sync compares incoming roster data before saving. Full Backup is re-importable; Current Snapshot is a concise spreadsheet view of every current player.';
  }
}


function installExportSyncV3150() {
  ensureTopbarSnapshotExportV3150();

  if (
    typeof renderRoster
    === 'function'
  ) {
    const establishedRenderRosterV3150 =
      renderRoster;

    renderRoster = function(...args) {
      const result =
        establishedRenderRosterV3150(
          ...args
        );

      decorateRosterExportsV3150();

      return result;
    };
  }

  if (
    typeof renderSettings
    === 'function'
  ) {
    const establishedRenderSettingsV3150 =
      renderSettings;

    renderSettings = function(...args) {
      const result =
        establishedRenderSettingsV3150(
          ...args
        );

      decorateSettingsExportsV3150();

      return result;
    };
  }
}


function installImportExportSyncV3150() {
  installImportReviewV3150();
  installExportSyncV3150();

  document.documentElement.dataset
    .rostercapImportSync =
      ROSTERCAP_IMPORT_SYNC_VERSION_V3150;

  window.RosterCapImportSync =
    Object.freeze({
      version:
        ROSTERCAP_IMPORT_SYNC_VERSION_V3150,
      exportSnapshot:
        exportCurrentRosterSnapshotV3150,
      applyReviewFilter:
        applyImportReviewFilterV3150
    });
}


installImportExportSyncV3150();
