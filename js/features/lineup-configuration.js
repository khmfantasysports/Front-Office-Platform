'use strict';

// ============================================================================
// RosterCap V2.87 — Configurable Starting Lineup
//
// Starting-lineup slots are intentionally distinct from:
// - player positions
// - roster locations/groups (Active, Minors/Practice Squad, etc.)
// - positional Depth ordering
//
// FLEX / SUPERFLEX / UTIL are lineup-slot concepts here, not player positions.
// ============================================================================

const ROSTERCAP_LINEUP_VERSION_V287 = 'V2.99.1';

let lineupFeatureInstalledV287 = false;
let lineupViewActiveV287 = true;
let lineupEditModeV287 = false;
let lineupSettingsDraftV287 = null;
let lineupAssignmentSavingV287 = false;
let lineupSettingsSavingV287 = false;
let lineupSettingsOpenV287 = false;

function lineupSportCodeV287() {
  return String(state?.frontOffice?.sport || 'NHL').trim().toUpperCase();
}

function normalizeLineupCodeV287(value) {
  const code = String(value || '').trim().toUpperCase();

  // Fantrax commonly abbreviates SUPERFLEX as SFX. Keep SUPERFLEX as the
  // canonical RosterCap lineup-slot key while accepting SFX as an alias.
  if (code === 'SFX') return 'SUPERFLEX';

  return code;
}

function uniqueCodesV287(values) {
  return [...new Set(
    (values || [])
      .map(normalizeLineupCodeV287)
      .filter(Boolean)
  )];
}

function playerPositionCodesV287(player) {
  return uniqueCodesV287([
    player?.position,
    ...String(player?.eligiblePositions || '')
      .split(/[,;/|]+/)
      .map((value) => value.trim())
  ]);
}

function lineupPositionEligibilityV287(sport, code) {
  const key = normalizeLineupCodeV287(code);
  const normalizedSport = normalizeLineupCodeV287(sport);

  const grouped = {
    NHL: {
      F:['F','C','LW','RW'],
      UTIL:['C','LW','RW','F','D'],
      FLEX:['C','LW','RW','F']
    },
    NFL: {
      OL:['OL','OT','OG','C'],
      DL:['DL','DE','DT','EDGE'],
      DB:['DB','CB','S'],
      IDP:['IDP','DL','DE','DT','EDGE','LB','DB','CB','S'],
      FLEX:['RB','WR','TE'],
      SUPERFLEX:['QB','RB','WR','TE']
    },
    NBA: {
      G:['G','PG','SG'],
      F:['F','SF','PF'],
      UTIL:['PG','SG','G','SF','PF','F','C']
    },
    MLB: {
      MI:['MI','2B','SS'],
      CI:['CI','1B','3B'],
      INF:['INF','1B','2B','3B','SS','MI','CI'],
      OF:['OF','LF','CF','RF'],
      P:['P','SP','RP'],
      UTIL:['C','1B','2B','3B','SS','MI','CI','INF','LF','CF','RF','OF','DH']
    }
  };

  return uniqueCodesV287(
    grouped[normalizedSport]?.[key] || [key]
  );
}

function lineupSpecialSlotCatalogV287(sport) {
  const normalizedSport = normalizeLineupCodeV287(sport);

  const catalogs = {
    NHL:[
      { key:'FLEX', displayName:'Forward Flex', eligible:['C','LW','RW','F'] },
      { key:'UTIL', displayName:'Skater Util', eligible:['C','LW','RW','F','D'] }
    ],
    NFL:[
      { key:'FLEX', displayName:'Flex', eligible:['RB','WR','TE'] },
      { key:'SUPERFLEX', displayName:'Superflex', eligible:['QB','RB','WR','TE'] }
    ],
    NBA:[
      { key:'UTIL', displayName:'Util', eligible:['PG','SG','G','SF','PF','F','C'] }
    ],
    MLB:[
      { key:'UTIL', displayName:'Util', eligible:['C','1B','2B','3B','SS','MI','CI','INF','LF','CF','RF','OF','DH'] }
    ]
  };

  return catalogs[normalizedSport] || [];
}

function lineupCatalogV287() {
  const sport = lineupSportCodeV287();
  const configured =
    window.RosterCapPositionConfig?.active?.()
    || [];

  const positionSlots = configured.map((code) => ({
    key:normalizeLineupCodeV287(code),
    displayName:normalizeLineupCodeV287(code),
    eligible:lineupPositionEligibilityV287(sport, code),
    kind:'POSITION'
  }));

  const specials = lineupSpecialSlotCatalogV287(sport).map((slot) => ({
    ...slot,
    eligible:uniqueCodesV287(slot.eligible),
    kind:'FLEX'
  }));

  return [...positionSlots, ...specials];
}

function normalizeLineupSlotRowV287(row) {
  return {
    id:row.lineup_slot_id,
    frontOfficeId:row.front_office_id,
    key:normalizeLineupCodeV287(row.slot_key),
    displayName:String(row.display_name || row.slot_key || 'Slot').trim(),
    eligiblePositionCodes:uniqueCodesV287(row.eligible_position_codes || []),
    slotCount:Number(row.slot_count || 1),
    sortOrder:Number(row.sort_order || 0),
    isActive:row.is_active !== false
  };
}

function normalizeLineupAssignmentRowV287(row) {
  return {
    id:row.lineup_assignment_id,
    frontOfficeId:row.front_office_id,
    lineupSlotId:row.lineup_slot_id,
    slotNumber:Number(row.slot_number || 1),
    playerId:row.front_office_player_id
  };
}

async function loadLineupConfigurationV287(frontOfficeId) {
  if (!frontOfficeId) {
    state.lineupSlots = [];
    state.lineupAssignments = [];
    state.lineupConfigurationMode = 'AUTO';
    return;
  }

  const [settingsResult, slotsResult, assignmentsResult] = await Promise.all([
    db.from('front_office_lineup_settings')
      .select('front_office_id,configuration_mode')
      .eq('front_office_id', frontOfficeId)
      .maybeSingle(),

    db.from('front_office_lineup_slots')
      .select('lineup_slot_id,front_office_id,slot_key,display_name,eligible_position_codes,slot_count,sort_order,is_active')
      .eq('front_office_id', frontOfficeId)
      .eq('is_active', true)
      .order('sort_order')
      .order('slot_key'),

    db.from('front_office_lineup_assignments')
      .select('lineup_assignment_id,front_office_id,lineup_slot_id,slot_number,front_office_player_id')
      .eq('front_office_id', frontOfficeId)
      .order('lineup_slot_id')
      .order('slot_number')
  ]);

  const error =
    settingsResult.error
    || slotsResult.error
    || assignmentsResult.error;

  if (error) {
    console.error(
      '[RosterCap V2.87] lineup configuration could not load.',
      error
    );
    state.lineupSlots = [];
    state.lineupAssignments = [];
    state.lineupConfigurationMode = 'AUTO';
    return;
  }

  if (state?.frontOffice?.id !== frontOfficeId) return;

  state.lineupConfigurationMode =
    settingsResult.data?.configuration_mode
    || 'AUTO';

  state.lineupSlots = (slotsResult.data || [])
    .map(normalizeLineupSlotRowV287);

  state.lineupAssignments = (assignmentsResult.data || [])
    .map(normalizeLineupAssignmentRowV287);
}

function activeLineupSlotsV287() {
  return (state?.lineupSlots || [])
    .filter((slot) => slot.isActive && slot.slotCount > 0)
    .sort((a,b) => a.sortOrder - b.sortOrder || a.key.localeCompare(b.key));
}

function lineupAssignmentsV287() {
  return state?.lineupAssignments || [];
}

function lineupAssignmentForV287(lineupSlotId, slotNumber) {
  return lineupAssignmentsV287().find(
    (assignment) =>
      assignment.lineupSlotId === lineupSlotId
      && assignment.slotNumber === slotNumber
  ) || null;
}

function lineupAssignedPlayerIdsV287(exceptSlotId = null, exceptSlotNumber = null) {
  return new Set(
    lineupAssignmentsV287()
      .filter((assignment) =>
        !(
          assignment.lineupSlotId === exceptSlotId
          && assignment.slotNumber === exceptSlotNumber
        )
      )
      .map((assignment) => assignment.playerId)
      .filter(Boolean)
  );
}

function playerQualifiesForLineupSlotV287(player, slot) {
  if (!player || !slot) return false;

  const playerCodes = playerPositionCodesV287(player);
  const eligible = new Set(slot.eligiblePositionCodes || []);
  return playerCodes.some((code) => eligible.has(code));
}

function eligibleLineupPlayersV287(slot, slotNumber) {
  const alreadyAssigned = lineupAssignedPlayerIdsV287(slot.id, slotNumber);

  return activeRosterPlayers()
    .filter((player) =>
      playerQualifiesForLineupSlotV287(player, slot)
      && !alreadyAssigned.has(player.id)
    )
    .sort((a,b) => a.name.localeCompare(b.name));
}

function lineupSlotInstanceLabelV287(slot, slotNumber) {
  if (slot.slotCount <= 1) return slot.displayName;
  return `${slot.displayName} ${slotNumber}`;
}

function lineupSlotEligibilityLabelV287(slot) {
  return (slot.eligiblePositionCodes || []).join(' / ') || 'No eligibility';
}

function lineupAssignedCountV287() {
  return lineupAssignmentsV287().filter((assignment) =>
    activeLineupSlotsV287().some(
      (slot) =>
        slot.id === assignment.lineupSlotId
        && assignment.slotNumber <= slot.slotCount
    )
  ).length;
}

function lineupTotalSlotCountV287() {
  return activeLineupSlotsV287().reduce(
    (sum, slot) => sum + Number(slot.slotCount || 0),
    0
  );
}

function lineupPlayerByIdV287(playerId) {
  return (state?.players || []).find((player) => player.id === playerId) || null;
}

function lineupPlayerChargeLabelV288(player, current) {
  if (!player || !current) return '—';
  const charge = effectivePlayerCharge(player, current.id);
  return charge === null || charge === undefined ? '—' : formatMoney(charge);
}

function lineupStarterLabelV289(slot, slotNumber) {
  const sport = lineupSportCodeV287();
  const key = normalizeLineupCodeV287(slot?.key);

  if (sport === 'NHL') {
    if (['LW','C','RW','F'].includes(key)) {
      return `Line ${slotNumber}`;
    }

    if (key === 'D') {
      return `Pair ${Math.ceil(slotNumber / 2)}`;
    }

    if (key === 'G') {
      if (slotNumber === 1) return 'Starter';
      if (slotNumber === 2) return 'Backup';
      return `Depth ${slotNumber}`;
    }

    if (key === 'FLEX' || key === 'UTIL') {
      return slot.slotCount <= 1
        ? slot.displayName
        : `${slot.displayName} ${slotNumber}`;
    }
  }

  return slot.slotCount <= 1
    ? 'Starter'
    : `Starter ${slotNumber}`;
}

function lineupDepthPlayersV289(slot) {
  const assigned = lineupAssignedPlayerIdsV287();

  const eligible = activeRosterPlayers()
    .filter((player) => playerQualifiesForLineupSlotV287(player, slot));

  const eligibleById = new Map(
    eligible.map((player) => [player.id, player])
  );

  const savedOrder = Array.isArray(state?.depthCharts?.[slot.key])
    ? state.depthCharts[slot.key]
    : [];

  const ordered = [];
  const seen = new Set();

  savedOrder.forEach((playerId) => {
    const player = eligibleById.get(playerId);
    if (!player || assigned.has(player.id) || seen.has(player.id)) return;
    ordered.push(player);
    seen.add(player.id);
  });

  const current = currentSeason();

  eligible
    .filter((player) => !assigned.has(player.id) && !seen.has(player.id))
    .sort((a,b) => {
      const aCharge = effectivePlayerCharge(a, current?.id) ?? -1;
      const bCharge = effectivePlayerCharge(b, current?.id) ?? -1;

      if (aCharge !== bCharge) return bCharge - aCharge;
      return a.name.localeCompare(b.name);
    })
    .forEach((player) => {
      ordered.push(player);
      seen.add(player.id);
    });

  return ordered;
}

function lineupPlayerChargeLabelV289(player, current) {
  if (!player || !current) return '—';
  const charge = effectivePlayerCharge(player, current.id);
  return charge === null || charge === undefined
    ? '—'
    : formatMoney(charge);
}

function lineupPlayerContractExpiryLabelV298(player) {
  if (!player?.contractEndSeasonId) return 'No end set';

  const endSeason = (state?.seasons || []).find(
    (season) => season.id === player.contractEndSeasonId
  );

  if (!endSeason?.startYear) return 'No end set';

  return `Expires ${seasonLabel(endSeason.startYear)}`;
}

function lineupPlayerAgeLabelV2981(player) {
  const rawAge = player?.ageSnapshot;

  if (
    rawAge === null
    || rawAge === undefined
    || String(rawAge).trim() === ''
  ) {
    return 'Age —';
  }

  const age = Number(rawAge);

  if (!Number.isFinite(age) || age < 0) return 'Age —';

  return `Age ${Math.round(age)}`;
}

function lineupPlayerMetaLabelV2981(player) {
  return [
    player?.realTeam || '—',
    player?.position || '—',
    lineupPlayerAgeLabelV2981(player)
  ].join(' · ');
}

function renderMatrixStarterCardV289(slot, slotNumber, current) {
  const assignment = lineupAssignmentForV287(slot.id, slotNumber);
  const player = assignment
    ? lineupPlayerByIdV287(assignment.playerId)
    : null;

  const label = lineupStarterLabelV289(slot, slotNumber);

  if (lineupEditModeV287) {
    const eligiblePlayers = eligibleLineupPlayersV287(slot, slotNumber);
    const selectedPlayer = assignment?.playerId || '';

    return `<label class="lineup-matrix-starter-editor-v289">
      <span>${escapeHtml(label)}</span>
      <select
        aria-label="${escapeAttr(slot.displayName)} ${escapeAttr(label)}"
        data-lineup-assignment-slot="${escapeAttr(slot.id)}"
        data-lineup-assignment-number="${slotNumber}"
        ${lineupAssignmentSavingV287 ? 'disabled' : ''}
      >
        <option value="">Open slot</option>
        ${eligiblePlayers.map((candidate) => `
          <option
            value="${escapeAttr(candidate.id)}"
            ${selectedPlayer === candidate.id ? 'selected' : ''}
          >
            ${escapeHtml(candidate.name)} · ${escapeHtml(candidate.position || '—')}
          </option>
        `).join('')}
      </select>
    </label>`;
  }

  if (!player) {
    return `<div class="lineup-matrix-player-v289 lineup-matrix-starter-v289 empty">
      <span class="lineup-matrix-role-v289">${escapeHtml(label)}</span>
      <strong>Open</strong>
      <small>Starter slot</small>
    </div>`;
  }

  return `<button
    class="lineup-matrix-player-v289 lineup-matrix-starter-v289"
    data-lineup-player-open="${escapeAttr(player.id)}"
    type="button"
  >
    <span class="lineup-matrix-role-v289">${escapeHtml(label)}</span>
    <strong>${escapeHtml(player.name)}</strong>
    <small>${escapeHtml(lineupPlayerMetaLabelV2981(player))}</small>
    <span class="lineup-matrix-contract-v298">${escapeHtml(lineupPlayerContractExpiryLabelV298(player))}</span>
    <span class="lineup-matrix-money-v289">${escapeHtml(lineupPlayerChargeLabelV289(player, current))}</span>
  </button>`;
}

function renderMatrixDepthCardV289(player, index, current) {
  return `<button
    class="lineup-matrix-player-v289 lineup-matrix-depth-player-v289"
    data-lineup-player-open="${escapeAttr(player.id)}"
    type="button"
  >
    <span class="lineup-matrix-role-v289">Depth ${index + 1}</span>
    <strong>${escapeHtml(player.name)}</strong>
    <small>${escapeHtml(lineupPlayerMetaLabelV2981(player))}</small>
    <span class="lineup-matrix-contract-v298">${escapeHtml(lineupPlayerContractExpiryLabelV298(player))}</span>
    <span class="lineup-matrix-money-v289">${escapeHtml(lineupPlayerChargeLabelV289(player, current))}</span>
  </button>`;
}

function renderMatrixSlotColumnV289(slot, current) {
  const starters = [];

  for (let slotNumber = 1; slotNumber <= slot.slotCount; slotNumber += 1) {
    starters.push(
      renderMatrixStarterCardV289(slot, slotNumber, current)
    );
  }

  const depthPlayers = lineupDepthPlayersV289(slot);

  return `<section
    class="lineup-matrix-column-v289"
    data-lineup-matrix-slot="${escapeAttr(slot.key)}"
  >
    <div class="lineup-matrix-column-head-v289">
      <div>
        <h4>${escapeHtml(slot.displayName)}</h4>
        ${(
          uniqueCodesV287(slot.eligiblePositionCodes).length === 1
          && uniqueCodesV287(slot.eligiblePositionCodes)[0] === normalizeLineupCodeV287(slot.key)
        )
          ? ''
          : `<span>${escapeHtml(lineupSlotEligibilityLabelV287(slot))}</span>`
        }
      </div>

      <span>${slot.slotCount}</span>
    </div>

    <div class="lineup-matrix-starters-v289">
      ${starters.join('')}
    </div>

    <div class="lineup-matrix-depth-label-v289">
      <span>Depth</span>
      <small>${depthPlayers.length}</small>
    </div>

    <div class="lineup-matrix-depth-stack-v289">
      ${depthPlayers.length
        ? depthPlayers
            .map((player, index) => renderMatrixDepthCardV289(player, index, current))
            .join('')
        : '<div class="lineup-matrix-depth-empty-v289">No additional eligible players.</div>'
      }
    </div>
  </section>`;
}

function lineupMatrixGroupsV289(slots) {
  const sport = lineupSportCodeV287();
  const slotMap = new Map(
    slots.map((slot) => [normalizeLineupCodeV287(slot.key), slot])
  );

  const groups = [];
  const used = new Set();

  const take = (label, keys) => {
    const groupSlots = keys
      .map((key) => slotMap.get(key))
      .filter(Boolean);

    groupSlots.forEach((slot) => used.add(slot.id));

    if (groupSlots.length) {
      groups.push({
        label,
        slots:groupSlots
      });
    }
  };

  if (sport === 'NHL') {
    take('Forwards', ['LW','C','RW','F']);
    take('Defense', ['D']);
    take('Goalies', ['G']);
    take('Flexible', ['FLEX','UTIL']);
  } else if (sport === 'NFL') {
    take('Offense', [
      'QB','RB','WR','TE','FB',
      'OL','OT','OG','C',
      'FLEX','SUPERFLEX'
    ]);
    take('Defense', [
      'DL','DE','DT','EDGE',
      'LB','CB','S','DB','IDP'
    ]);
    take('Special Teams', ['K','P']);
  } else if (sport === 'NBA') {
    take('Starters', ['PG','SG','G','SF','PF','F','C','UTIL']);
  } else if (sport === 'MLB') {
    take('Infield', ['C','1B','2B','3B','SS','MI','CI','INF']);
    take('Outfield / Hitting', ['LF','CF','RF','OF','DH','UTIL']);
    take('Pitching', ['SP','RP','P']);
  }

  const remaining = slots.filter((slot) => !used.has(slot.id));

  if (remaining.length) {
    groups.push({
      label:'Other',
      slots:remaining
    });
  }

  return groups;
}


function renderNhlForwardsV290(slotMap, current) {
  const forwardSlots = ['LW','C','RW']
    .map((key) => slotMap.get(key))
    .filter(Boolean);

  if (!forwardSlots.length) return '';

  return `<section class="lineup-matrix-group-v289 nhl-forwards-group-v290">
    <div class="lineup-matrix-group-head-v289">
      <div>
        <p class="eyebrow">Roster</p>
        <h3>Forwards</h3>
      </div>
      <span>${forwardSlots.length} position${forwardSlots.length === 1 ? '' : 's'}</span>
    </div>

    <div class="nhl-forward-grid-v290">
      ${forwardSlots
        .map((slot) => renderMatrixSlotColumnV289(slot, current))
        .join('')}
    </div>
  </section>`;
}

function renderNhlDefensePairRowV290(slot, leftNumber, rightNumber, current) {
  return `<div class="nhl-defense-pair-row-v290">
    ${renderMatrixStarterCardV289(slot, leftNumber, current)}
    ${rightNumber <= slot.slotCount
      ? renderMatrixStarterCardV289(slot, rightNumber, current)
      : '<div class="nhl-defense-pair-spacer-v290"></div>'
    }
  </div>`;
}

function renderNhlDefenseBlockV290(slot, current) {
  if (!slot) return '';

  const pairRows = [];

  for (let slotNumber = 1; slotNumber <= slot.slotCount; slotNumber += 2) {
    pairRows.push(
      renderNhlDefensePairRowV290(
        slot,
        slotNumber,
        slotNumber + 1,
        current
      )
    );
  }

  const depthPlayers = lineupDepthPlayersV289(slot);

  return `<section class="nhl-defense-block-v290">
    <div class="nhl-special-block-head-v290">
      <div>
        <p class="eyebrow">Defense</p>
        <h4>D Pairs</h4>
      </div>
      <span>${slot.slotCount}</span>
    </div>

    <div class="nhl-defense-pairs-v290">
      ${pairRows.join('')}
    </div>

    <div class="lineup-matrix-depth-label-v289 nhl-special-depth-label-v290">
      <span>Depth</span>
      <small>${depthPlayers.length}</small>
    </div>

    <div class="nhl-defense-depth-grid-v290">
      ${depthPlayers.length
        ? depthPlayers
            .map((player, index) =>
              renderMatrixDepthCardV289(player, index, current)
            )
            .join('')
        : '<div class="lineup-matrix-depth-empty-v289">No additional eligible defensemen.</div>'
      }
    </div>
  </section>`;
}

function renderNhlGoalieBlockV290(slot, current) {
  if (!slot) return '';

  const starters = [];

  for (let slotNumber = 1; slotNumber <= slot.slotCount; slotNumber += 1) {
    starters.push(
      renderMatrixStarterCardV289(slot, slotNumber, current)
    );
  }

  const depthPlayers = lineupDepthPlayersV289(slot);

  return `<section class="nhl-goalie-block-v290">
    <div class="nhl-special-block-head-v290">
      <div>
        <p class="eyebrow">Goalies</p>
        <h4>G</h4>
      </div>
      <span>${slot.slotCount}</span>
    </div>

    <div class="nhl-goalie-starters-v290">
      ${starters.join('')}
    </div>

    <div class="lineup-matrix-depth-label-v289 nhl-special-depth-label-v290">
      <span>Depth</span>
      <small>${depthPlayers.length}</small>
    </div>

    <div class="nhl-goalie-depth-v290">
      ${depthPlayers.length
        ? depthPlayers
            .map((player, index) =>
              renderMatrixDepthCardV289(player, index, current)
            )
            .join('')
        : '<div class="lineup-matrix-depth-empty-v289">No additional eligible goalies.</div>'
      }
    </div>
  </section>`;
}

function renderNhlDefenseGoaliesV290(slotMap, current) {
  const defense = slotMap.get('D') || null;
  const goalies = slotMap.get('G') || null;

  if (!defense && !goalies) return '';

  return `<section class="lineup-matrix-group-v289 nhl-defense-goalies-group-v290">
    <div class="lineup-matrix-group-head-v289">
      <div>
        <p class="eyebrow">Roster</p>
        <h3>Defense & Goalies</h3>
      </div>
    </div>

    <div class="nhl-defense-goalies-grid-v290">
      ${defense
        ? renderNhlDefenseBlockV290(defense, current)
        : '<div class="nhl-defense-block-v290 empty"></div>'
      }

      ${goalies
        ? renderNhlGoalieBlockV290(goalies, current)
        : '<div class="nhl-goalie-block-v290 empty"></div>'
      }
    </div>
  </section>`;
}

function renderNhlRosterBoardV290(slots, current) {
  const slotMap = new Map(
    slots.map((slot) => [normalizeLineupCodeV287(slot.key), slot])
  );

  const usedKeys = new Set(['LW','C','RW','D','G']);
  const extras = slots.filter(
    (slot) => !usedKeys.has(normalizeLineupCodeV287(slot.key))
  );

  const forwardHtml = renderNhlForwardsV290(slotMap, current);
  const lowerHtml = renderNhlDefenseGoaliesV290(slotMap, current);

  const extraGroups = extras.length
    ? lineupMatrixGroupsV289(extras)
        .map((group) => renderLineupMatrixGroupV289(group, current))
        .join('')
    : '';

  return `${forwardHtml}${lowerHtml}${extraGroups}`;
}

function renderLineupMatrixGroupV289(group, current) {
  return `<section class="lineup-matrix-group-v289">
    <div class="lineup-matrix-group-head-v289">
      <div>
        <p class="eyebrow">Roster</p>
        <h3>${escapeHtml(group.label)}</h3>
      </div>
      <span>${group.slots.length} position${group.slots.length === 1 ? '' : 's'}</span>
    </div>

    <div class="lineup-matrix-scroll-v289">
      <div
        class="lineup-matrix-grid-v289"
        style="--lineup-matrix-columns:${group.slots.length}"
      >
        ${group.slots
          .map((slot) => renderMatrixSlotColumnV289(slot, current))
          .join('')}
      </div>
    </div>
  </section>`;
}

function renderLineupPanelV287() {
  const slots = activeLineupSlotsV287();
  const current = currentSeason();
  const total = lineupTotalSlotCountV287();
  const assigned = lineupAssignedCountV287();

  if (!slots.length) {
    return `<div class="lineup-shell-v287 lineup-matrix-shell-v289">
      <div class="lineup-toolbar-v287">
        <div>
          <p class="eyebrow">Roster Lineup</p>
          <h4>No starting slots configured</h4>
          <p>Configure the starting positions this Front Office uses. Positions will run across the roster board, with eligible depth below each one.</p>
        </div>
        <button class="btn btn-primary btn-small" data-lineup-open-settings type="button">Configure lineup</button>
      </div>
    </div>`;
  }

  const groups = lineupMatrixGroupsV289(slots);

  return `<div class="lineup-shell-v287 lineup-matrix-shell-v289">
    <div class="lineup-toolbar-v287 lineup-toolbar-unified-v288">
      <div>
        <p class="eyebrow">Roster Lineup</p>
        <h4>${assigned} / ${total} starters filled</h4>
        <p>Positions run across. Starters are listed first and eligible unassigned depth continues down each position column.</p>
      </div>

      <div class="lineup-toolbar-actions-v287">
        <button class="btn btn-ghost btn-small" data-lineup-open-settings type="button">Configure</button>
        <button class="btn btn-secondary btn-small" data-lineup-edit type="button">
          ${lineupEditModeV287 ? 'Done' : 'Edit starters'}
        </button>
      </div>
    </div>

    ${lineupEditModeV287
      ? '<p class="lineup-edit-note-v287">Choose each starter from the eligible Active roster. Once selected, that player disappears from every other available depth pool.</p>'
      : ''}

    <div class="lineup-matrix-board-v289">
      ${lineupSportCodeV287() === 'NHL'
        ? renderNhlRosterBoardV290(slots, current)
        : groups
            .map((group) => renderLineupMatrixGroupV289(group, current))
            .join('')
      }
    </div>
  </div>`;
}

function setLineupViewActiveV287(active) {
  lineupViewActiveV287 = true;
  if (active === false) lineupEditModeV287 = false;
}

function decorateRosterWithLineupV287() {
  const root = document.getElementById('rosterView');
  if (!root) return;

  lineupViewActiveV287 = true;

  const switcher = root.querySelector('.roster-view-switch-v252');

  if (switcher) {
    switcher.classList.add('hidden');
    switcher.setAttribute('aria-hidden', 'true');
  }

  document.getElementById('depthPanel')?.classList.add('hidden');
  document.getElementById('capGridPanel')?.classList.add('hidden');
  root.querySelector('.empty-state')?.classList.add('hidden');

  const pageCopy = root.querySelector('.roster-page-heading-copy-v252 .page-copy');

  if (pageCopy) {
    pageCopy.textContent =
      'Manage starters and eligible positional depth together in one roster board.';
  }

  let lineupPanel = document.getElementById('lineupPanelV287');

  if (!lineupPanel) {
    lineupPanel = document.createElement('div');
    lineupPanel.id = 'lineupPanelV287';
    lineupPanel.className = 'lineup-panel-v287';

    if (switcher) {
      switcher.insertAdjacentElement('afterend', lineupPanel);
    } else {
      const summary =
        root.querySelector('.roster-summary-v252')
        || root.querySelector('.roster-summary')
        || root.querySelector('.roster-page-heading-v252');

      if (summary) summary.insertAdjacentElement('afterend', lineupPanel);
      else root.querySelector('.roster-page')?.appendChild(lineupPanel);
    }
  }

  lineupPanel.classList.remove('hidden');
  lineupPanel.innerHTML = renderLineupPanelV287();

  lineupPanel.querySelectorAll('[data-lineup-player-open]').forEach((button) => {
    button.addEventListener('click', () => {
      openPlayerDialog(button.dataset.lineupPlayerOpen);
    });
  });

  lineupPanel.querySelectorAll('[data-lineup-open-settings]').forEach((button) => {
    button.addEventListener('click', () => {
      lineupEditModeV287 = false;
      if (typeof switchView === 'function') switchView('settings');
    });
  });

  lineupPanel.querySelector('[data-lineup-edit]')?.addEventListener('click', () => {
    lineupEditModeV287 = !lineupEditModeV287;
    renderRoster();
  });

  lineupPanel.querySelectorAll('[data-lineup-assignment-slot]').forEach((select) => {
    select.addEventListener('change', () => {
      saveLineupAssignmentV287(
        select.dataset.lineupAssignmentSlot,
        Number(select.dataset.lineupAssignmentNumber),
        select.value || null
      );
    });
  });
}

async function saveLineupAssignmentV287(lineupSlotId, slotNumber, playerId) {
  if (
    lineupAssignmentSavingV287
    || !state?.frontOffice?.id
    || !lineupSlotId
    || !Number.isInteger(slotNumber)
    || slotNumber < 1
  ) return;

  lineupAssignmentSavingV287 = true;
  renderRoster();

  try {
    const success = await runCloudAction(async () => {
      const { error } = await db.rpc(
        'save_front_office_lineup_assignment_v1',
        {
          p_front_office_id:state.frontOffice.id,
          p_lineup_slot_id:lineupSlotId,
          p_slot_number:slotNumber,
          p_front_office_player_id:playerId
        }
      );

      if (error) throw error;
      await loadLineupConfigurationV287(state.frontOffice.id);
    });

    if (!success) return;
  } finally {
    lineupAssignmentSavingV287 = false;
    renderRoster();
  }
}

function lineupDraftFromStateV287() {
  return activeLineupSlotsV287().map((slot) => ({
    key:slot.key,
    displayName:slot.displayName,
    eligible:[...slot.eligiblePositionCodes],
    count:slot.slotCount
  }));
}

function ensureLineupSettingsDraftV287() {
  if (!Array.isArray(lineupSettingsDraftV287)) {
    lineupSettingsDraftV287 = lineupDraftFromStateV287();
  }
  return lineupSettingsDraftV287;
}

function lineupDraftCatalogOptionsV287() {
  const used = new Set(
    ensureLineupSettingsDraftV287().map((slot) => slot.key)
  );

  return lineupCatalogV287()
    .filter((slot) => !used.has(slot.key));
}

function moveLineupDraftV287(index, direction) {
  const draft = ensureLineupSettingsDraftV287();
  const target = index + direction;

  if (
    index < 0
    || target < 0
    || index >= draft.length
    || target >= draft.length
  ) return;

  [draft[index], draft[target]] = [draft[target], draft[index]];
}

function addLineupDraftSlotV287(key) {
  const catalogSlot = lineupCatalogV287().find(
    (slot) => slot.key === normalizeLineupCodeV287(key)
  );
  if (!catalogSlot) return;

  const draft = ensureLineupSettingsDraftV287();
  if (draft.some((slot) => slot.key === catalogSlot.key)) return;

  draft.push({
    key:catalogSlot.key,
    displayName:catalogSlot.displayName,
    eligible:[...catalogSlot.eligible],
    count:1
  });
}

function renderLineupSettingsEditorV287() {
  const page = document.querySelector('#settingsView .settings-accordion');
  if (!page || page.querySelector('[data-settings-lineup-editor]')) return;

  const draft = ensureLineupSettingsDraftV287();
  const catalogOptions = lineupDraftCatalogOptionsV287();
  const total = draft.reduce((sum, slot) => sum + Number(slot.count || 0), 0);

  const details = document.createElement('details');
  details.className = 'settings-disclosure lineup-settings-v287';
  details.dataset.settingsSection = 'lineup-slots';
  details.dataset.settingsLineupEditor = 'true';
  details.open = lineupSettingsOpenV287;

  details.innerHTML = `
    <summary>
      <span class="settings-disclosure-title">
        <strong>Starting Lineup</strong>
        <span>Configure starting slots, counts and order.</span>
      </span>
    </summary>

    <div class="settings-disclosure-body">
      <div class="lineup-settings-head-v287">
        <div>
          <strong>${escapeHtml(lineupSportCodeV287())} lineup configuration</strong>
          <p>Starting slots only. Bench, IR and ${escapeHtml(window.RosterCapTerminology?.developmentLabel?.() || 'Minors')} remain roster-location settings.</p>
        </div>
        <span class="position-setup-count-v282">${total} starter${total === 1 ? '' : 's'}</span>
      </div>

      <div class="lineup-settings-list-v287">
        ${draft.length
          ? draft.map((slot, index) => `
            <div class="lineup-settings-row-v287" data-lineup-settings-index="${index}">
              <div class="lineup-settings-card-top-v287">
                <div class="lineup-settings-slot-copy-v287">
                  <strong>${escapeHtml(slot.displayName)}</strong>
                  ${
                    uniqueCodesV287(slot.eligible).length === 1
                    && uniqueCodesV287(slot.eligible)[0] === normalizeLineupCodeV287(slot.key)
                      ? ''
                      : `<span>${escapeHtml((slot.eligible || []).join(' / '))}</span>`
                  }
                </div>

                <input
                  class="lineup-settings-count-input-v287"
                  aria-label="${escapeAttr(slot.displayName)} starter count"
                  title="Starter count"
                  data-lineup-count-index="${index}"
                  type="number"
                  inputmode="numeric"
                  min="1"
                  max="30"
                  step="1"
                  value="${Number(slot.count || 1)}"
                >
              </div>

              <div class="lineup-settings-row-actions-v287" aria-label="${escapeAttr(slot.displayName)} controls">
                <button class="btn btn-ghost btn-small" aria-label="Move ${escapeAttr(slot.displayName)} up" title="Move up" data-lineup-move-index="${index}" data-lineup-move-direction="-1" type="button" ${index === 0 ? 'disabled' : ''}>↑</button>
                <button class="btn btn-ghost btn-small" aria-label="Move ${escapeAttr(slot.displayName)} down" title="Move down" data-lineup-move-index="${index}" data-lineup-move-direction="1" type="button" ${index === draft.length - 1 ? 'disabled' : ''}>↓</button>
                <button class="btn btn-ghost btn-small lineup-remove-v287" aria-label="Remove ${escapeAttr(slot.displayName)}" title="Remove" data-lineup-remove-index="${index}" type="button">×</button>
              </div>
            </div>
          `).join('')
          : '<div class="lineup-settings-empty-v287">No starting slots configured.</div>'}
      </div>

      <div class="lineup-settings-add-v287">
        <select data-lineup-add-select ${catalogOptions.length ? '' : 'disabled'}>
          <option value="">${catalogOptions.length ? 'Choose a slot…' : 'All available slot types added'}</option>
          ${catalogOptions.map((slot) => `
            <option value="${escapeAttr(slot.key)}">
              ${escapeHtml(slot.displayName)} · ${escapeHtml(slot.eligible.join('/'))}
            </option>
          `).join('')}
        </select>
        <button class="btn btn-secondary btn-small" data-lineup-add type="button" ${catalogOptions.length ? '' : 'disabled'}>+ Add slot</button>
      </div>

      <div class="lineup-settings-note-v287">
        FLEX, SUPERFLEX and UTIL are lineup slots only. They are not added to the player-position catalog.
      </div>

      <div class="lineup-settings-footer-v287">
        <button class="btn btn-ghost btn-small" data-lineup-reset type="button">
          Reset from positions
        </button>
        <button class="btn btn-primary" data-lineup-save type="button" ${lineupSettingsSavingV287 ? 'disabled' : ''}>
          ${lineupSettingsSavingV287 ? 'Saving…' : 'Save lineup slots'}
        </button>
      </div>
    </div>
  `;

  const positionEditor = page.querySelector('[data-settings-position-editor]');
  const teamLeague = page.querySelector('details[data-settings-section="team-league"]');

  if (positionEditor) {
    positionEditor.insertAdjacentElement('afterend', details);
  } else if (teamLeague) {
    teamLeague.insertAdjacentElement('afterend', details);
  } else {
    page.prepend(details);
  }

  details.addEventListener('toggle', () => {
    lineupSettingsOpenV287 = details.open;
  });

  details.querySelectorAll('[data-lineup-count-index]').forEach((input) => {
    input.addEventListener('change', () => {
      const index = Number(input.dataset.lineupCountIndex);
      const value = Math.max(1, Math.min(30, Number(input.value || 1)));
      ensureLineupSettingsDraftV287()[index].count = value;
      lineupSettingsOpenV287 = true;
      renderSettings();
    });
  });

  details.querySelectorAll('[data-lineup-move-index]').forEach((button) => {
    button.addEventListener('click', () => {
      moveLineupDraftV287(
        Number(button.dataset.lineupMoveIndex),
        Number(button.dataset.lineupMoveDirection)
      );
      lineupSettingsOpenV287 = true;
      renderSettings();
    });
  });

  details.querySelectorAll('[data-lineup-remove-index]').forEach((button) => {
    button.addEventListener('click', () => {
      ensureLineupSettingsDraftV287().splice(
        Number(button.dataset.lineupRemoveIndex),
        1
      );
      lineupSettingsOpenV287 = true;
      renderSettings();
    });
  });

  details.querySelector('[data-lineup-add]')?.addEventListener('click', () => {
    const select = details.querySelector('[data-lineup-add-select]');
    if (!select?.value) return;
    addLineupDraftSlotV287(select.value);
    lineupSettingsOpenV287 = true;
    renderSettings();
  });

  details.querySelector('[data-lineup-save]')?.addEventListener(
    'click',
    saveLineupSettingsV287
  );

  details.querySelector('[data-lineup-reset]')?.addEventListener(
    'click',
    resetLineupSettingsV287
  );
}

async function saveLineupSettingsV287() {
  if (lineupSettingsSavingV287 || !state?.frontOffice?.id) return;

  const draft = ensureLineupSettingsDraftV287();

  const payload = draft.map((slot, index) => ({
    slot_key:slot.key,
    display_name:slot.displayName,
    eligible_position_codes:uniqueCodesV287(slot.eligible),
    slot_count:Math.max(1, Math.min(30, Number(slot.count || 1))),
    sort_order:(index + 1) * 10
  }));

  lineupSettingsSavingV287 = true;
  lineupSettingsOpenV287 = true;
  renderSettings();

  try {
    const success = await runCloudAction(async () => {
      const { error } = await db.rpc(
        'save_front_office_lineup_slots_v1',
        {
          p_front_office_id:state.frontOffice.id,
          p_slots:payload
        }
      );

      if (error) throw error;

      await loadLineupConfigurationV287(state.frontOffice.id);
      lineupSettingsDraftV287 = null;
    });

    if (!success) return;
  } finally {
    lineupSettingsSavingV287 = false;
    lineupSettingsOpenV287 = true;
    renderSettings();
    renderRoster();
  }
}

async function resetLineupSettingsV287() {
  if (!state?.frontOffice?.id) return;

  const proceed = confirm(
    'Reset starting-lineup slots from the Front Office player-position configuration?\n\n'
    + 'This will remove custom FLEX/SUPERFLEX/UTIL slots and clear assignments that no longer fit.'
  );
  if (!proceed) return;

  const success = await runCloudAction(async () => {
    const { error } = await db.rpc(
      'reset_front_office_lineup_slots_v1',
      { p_front_office_id:state.frontOffice.id }
    );
    if (error) throw error;

    await loadLineupConfigurationV287(state.frontOffice.id);
    lineupSettingsDraftV287 = null;
  });

  if (success) {
    lineupEditModeV287 = false;
    lineupSettingsOpenV287 = true;
    renderSettings();
    renderRoster();
  }
}

function installLineupConfigurationV287() {
  if (lineupFeatureInstalledV287) return;
  lineupFeatureInstalledV287 = true;

  if (typeof loadOffice === 'function') {
    const originalLoadOfficeV287 = loadOffice;

    loadOffice = async function(frontOfficeId, showBusy = true) {
      const result = await originalLoadOfficeV287(frontOfficeId, showBusy);

      if (state?.frontOffice?.id !== frontOfficeId) return result;

      await loadLineupConfigurationV287(frontOfficeId);

      lineupSettingsDraftV287 = null;
      lineupEditModeV287 = false;
      lineupViewActiveV287 = true;

      if (typeof render === 'function') render();
      return result;
    };
  }

  if (typeof renderRoster === 'function') {
    const originalRenderRosterV287 = renderRoster;

    renderRoster = function(...args) {
      const result = originalRenderRosterV287(...args);
      decorateRosterWithLineupV287();
      return result;
    };
  }

  if (typeof renderSettings === 'function') {
    const originalRenderSettingsV287 = renderSettings;

    renderSettings = function(...args) {
      const result = originalRenderSettingsV287(...args);
      renderLineupSettingsEditorV287();
      return result;
    };
  }

  window.RosterCapLineup = Object.freeze({
    version:ROSTERCAP_LINEUP_VERSION_V287,
    slots:() => activeLineupSlotsV287().map((slot) => ({ ...slot })),
    assignments:() => lineupAssignmentsV287().map((assignment) => ({ ...assignment })),
    catalog:() => lineupCatalogV287().map((slot) => ({
      ...slot,
      eligible:[...slot.eligible]
    })),
    refresh:async () => {
      if (!state?.frontOffice?.id) return [];
      await loadLineupConfigurationV287(state.frontOffice.id);
      renderRoster();
      renderSettings();
      return activeLineupSlotsV287();
    }
  });
}

installLineupConfigurationV287();
