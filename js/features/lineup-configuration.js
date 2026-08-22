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

const ROSTERCAP_LINEUP_VERSION_V287 = 'V2.87';

let lineupFeatureInstalledV287 = false;
let lineupViewActiveV287 = false;
let lineupEditModeV287 = false;
let lineupSettingsDraftV287 = null;
let lineupAssignmentSavingV287 = false;
let lineupSettingsSavingV287 = false;

function lineupSportCodeV287() {
  return String(state?.frontOffice?.sport || 'NHL').trim().toUpperCase();
}

function normalizeLineupCodeV287(value) {
  return String(value || '').trim().toUpperCase();
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

function renderLineupAssignedCardV287(slot, slotNumber, current) {
  const assignment = lineupAssignmentForV287(slot.id, slotNumber);
  const player = assignment
    ? lineupPlayerByIdV287(assignment.playerId)
    : null;

  const label = lineupSlotInstanceLabelV287(slot, slotNumber);

  if (typeof depthSlot === 'function') {
    return depthSlot(player, label, current);
  }

  if (!player) {
    return `<div class="lineup-player-fallback-v287 empty">
      <strong>${escapeHtml(label)}</strong>
      <span>Open slot</span>
    </div>`;
  }

  return `<button class="lineup-player-fallback-v287" data-edit-player="${player.id}" type="button">
    <strong>${escapeHtml(label)}</strong>
    <span>${escapeHtml(player.name)}</span>
  </button>`;
}

function renderLineupEditCardV287(slot, slotNumber) {
  const assignment = lineupAssignmentForV287(slot.id, slotNumber);
  const eligiblePlayers = eligibleLineupPlayersV287(slot, slotNumber);
  const selectedPlayer = assignment?.playerId || '';

  const options = [
    '<option value="">Open slot</option>',
    ...eligiblePlayers.map((player) => `
      <option value="${escapeAttr(player.id)}" ${selectedPlayer === player.id ? 'selected' : ''}>
        ${escapeHtml(player.name)} · ${escapeHtml(player.position || '—')}
      </option>
    `)
  ].join('');

  return `<label class="lineup-assignment-editor-v287">
    <span class="lineup-assignment-label-v287">
      <strong>${escapeHtml(lineupSlotInstanceLabelV287(slot, slotNumber))}</strong>
      <small>${escapeHtml(lineupSlotEligibilityLabelV287(slot))}</small>
    </span>
    <select
      data-lineup-assignment-slot="${escapeAttr(slot.id)}"
      data-lineup-assignment-number="${slotNumber}"
      ${lineupAssignmentSavingV287 ? 'disabled' : ''}
    >
      ${options}
    </select>
  </label>`;
}

function renderLineupGroupV287(slot, current) {
  const cards = [];

  for (let slotNumber = 1; slotNumber <= slot.slotCount; slotNumber += 1) {
    cards.push(
      lineupEditModeV287
        ? renderLineupEditCardV287(slot, slotNumber)
        : renderLineupAssignedCardV287(slot, slotNumber, current)
    );
  }

  return `<section class="lineup-group-v287">
    <div class="lineup-group-head-v287">
      <div>
        <p class="eyebrow">${escapeHtml(slot.key)}</p>
        <h4>${escapeHtml(slot.displayName)}</h4>
      </div>
      <span>${slot.slotCount} slot${slot.slotCount === 1 ? '' : 's'} · ${escapeHtml(lineupSlotEligibilityLabelV287(slot))}</span>
    </div>
    <div class="lineup-card-grid-v287">
      ${cards.join('')}
    </div>
  </section>`;
}

function renderLineupPanelV287() {
  const slots = activeLineupSlotsV287();
  const current = currentSeason();
  const total = lineupTotalSlotCountV287();
  const assigned = lineupAssignedCountV287();

  if (!slots.length) {
    return `<div class="lineup-shell-v287">
      <div class="lineup-toolbar-v287">
        <div>
          <p class="eyebrow">Starting Lineup</p>
          <h4>No lineup slots configured</h4>
          <p>Configure the starting slots this Front Office actually uses. Bench, IR and Minors/Practice Squad stay separate roster-location settings.</p>
        </div>
        <button class="btn btn-primary btn-small" data-lineup-open-settings type="button">Configure lineup</button>
      </div>
    </div>`;
  }

  return `<div class="lineup-shell-v287">
    <div class="lineup-toolbar-v287">
      <div>
        <p class="eyebrow">Starting Lineup</p>
        <h4>${assigned} / ${total} filled</h4>
        <p>Each Active-roster player can occupy only one starting slot. Eligibility uses the player's primary and eligible positions.</p>
      </div>
      <div class="lineup-toolbar-actions-v287">
        <button class="btn btn-ghost btn-small" data-lineup-open-settings type="button">Configure slots</button>
        <button class="btn btn-secondary btn-small" data-lineup-edit type="button">
          ${lineupEditModeV287 ? 'Done' : 'Edit lineup'}
        </button>
      </div>
    </div>

    ${lineupEditModeV287
      ? '<p class="lineup-edit-note-v287">Changing a player moves that player out of any other starting slot automatically.</p>'
      : ''}

    <div class="lineup-groups-v287">
      ${slots.map((slot) => renderLineupGroupV287(slot, current)).join('')}
    </div>
  </div>`;
}

function setLineupViewActiveV287(active) {
  lineupViewActiveV287 = Boolean(active);
  if (!lineupViewActiveV287) lineupEditModeV287 = false;
}

function decorateRosterWithLineupV287() {
  const root = document.getElementById('rosterView');
  if (!root) return;

  const switcher = root.querySelector('.roster-view-switch-v252');
  if (!switcher) return;

  let lineupButton = document.getElementById('rosterLineupModeBtnV287');
  if (!lineupButton) {
    lineupButton = document.createElement('button');
    lineupButton.id = 'rosterLineupModeBtnV287';
    lineupButton.type = 'button';
    lineupButton.textContent = 'Lineup';

    const gridButton = document.getElementById('rosterGridModeBtn');
    if (gridButton) switcher.insertBefore(lineupButton, gridButton);
    else switcher.appendChild(lineupButton);
  }

  lineupButton.classList.toggle('active', lineupViewActiveV287);

  const depthButton = document.getElementById('rosterDepthModeBtn');
  const gridButton = document.getElementById('rosterGridModeBtn');

  if (lineupViewActiveV287) {
    depthButton?.classList.remove('active');
    gridButton?.classList.remove('active');
  }

  depthButton?.addEventListener(
    'click',
    () => setLineupViewActiveV287(false),
    { capture:true }
  );

  gridButton?.addEventListener(
    'click',
    () => setLineupViewActiveV287(false),
    { capture:true }
  );

  lineupButton.addEventListener('click', () => {
    setLineupViewActiveV287(true);
    renderRoster();
  });

  let lineupPanel = document.getElementById('lineupPanelV287');
  if (!lineupPanel) {
    lineupPanel = document.createElement('div');
    lineupPanel.id = 'lineupPanelV287';
    lineupPanel.className = 'lineup-panel-v287';

    const capGrid = document.getElementById('capGridPanel');
    if (capGrid) capGrid.insertAdjacentElement('afterend', lineupPanel);
    else root.querySelector('.roster-page')?.appendChild(lineupPanel);
  }

  lineupPanel.innerHTML = renderLineupPanelV287();
  lineupPanel.classList.toggle('hidden', !lineupViewActiveV287);

  if (lineupViewActiveV287) {
    document.getElementById('depthPanel')?.classList.add('hidden');
    document.getElementById('capGridPanel')?.classList.add('hidden');
    root.querySelector('.empty-state')?.classList.add('hidden');
  }

  lineupPanel.querySelectorAll('[data-depth-open]').forEach((button) => {
    button.addEventListener('click', () => openPlayerDialog(button.dataset.depthOpen));
  });

  lineupPanel.querySelectorAll('[data-edit-player]').forEach((button) => {
    button.addEventListener('click', () => openPlayerDialog(button.dataset.editPlayer));
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
              <div class="lineup-settings-slot-copy-v287">
                <strong>${escapeHtml(slot.displayName)}</strong>
                <span>${escapeHtml(slot.key)} · ${escapeHtml((slot.eligible || []).join(' / '))}</span>
              </div>

              <label>
                <span>Count</span>
                <input
                  data-lineup-count-index="${index}"
                  type="number"
                  min="1"
                  max="30"
                  step="1"
                  value="${Number(slot.count || 1)}"
                >
              </label>

              <div class="lineup-settings-row-actions-v287">
                <button class="btn btn-ghost btn-small" data-lineup-move-index="${index}" data-lineup-move-direction="-1" type="button" ${index === 0 ? 'disabled' : ''}>↑</button>
                <button class="btn btn-ghost btn-small" data-lineup-move-index="${index}" data-lineup-move-direction="1" type="button" ${index === draft.length - 1 ? 'disabled' : ''}>↓</button>
                <button class="btn btn-ghost btn-small lineup-remove-v287" data-lineup-remove-index="${index}" type="button">×</button>
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

  details.querySelectorAll('[data-lineup-count-index]').forEach((input) => {
    input.addEventListener('change', () => {
      const index = Number(input.dataset.lineupCountIndex);
      const value = Math.max(1, Math.min(30, Number(input.value || 1)));
      ensureLineupSettingsDraftV287()[index].count = value;
      renderSettings();
    });
  });

  details.querySelectorAll('[data-lineup-move-index]').forEach((button) => {
    button.addEventListener('click', () => {
      moveLineupDraftV287(
        Number(button.dataset.lineupMoveIndex),
        Number(button.dataset.lineupMoveDirection)
      );
      renderSettings();
    });
  });

  details.querySelectorAll('[data-lineup-remove-index]').forEach((button) => {
    button.addEventListener('click', () => {
      ensureLineupSettingsDraftV287().splice(
        Number(button.dataset.lineupRemoveIndex),
        1
      );
      renderSettings();
    });
  });

  details.querySelector('[data-lineup-add]')?.addEventListener('click', () => {
    const select = details.querySelector('[data-lineup-add-select]');
    if (!select?.value) return;
    addLineupDraftSlotV287(select.value);
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
      lineupViewActiveV287 = false;

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
