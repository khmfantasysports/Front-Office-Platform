'use strict';

// ============================================================================
// RosterCap V3.14.2 — Injured Reserve / Generic Roster-Group Cutover
//
// IR is a real roster location backed by front_office_roster_groups.
//
// Important boundaries:
// - ACTIVE / FARM compatibility remains intact.
// - IR defaults to counts_toward_cap = true in the migration.
// - The saved roster-group row remains authoritative when available.
// - Roster status cap eligibility still applies independently.
// - Moving to a non-lineup-eligible group clears Starting Lineup assignment.
// - Positional depth rows are deliberately preserved.
// ============================================================================

const ROSTERCAP_IR_VERSION_V3142 = '3.14.2';
const ROSTERCAP_IR_GROUP_KEY_V3142 = 'IR';

let irRosterFeatureInstalledV3142 = false;
let irMoveDialogV3142 = null;
let irMoveSavingV3142 = false;


function normalizeRosterGroupKeyV3142(value) {
  return String(value || 'ACTIVE').trim().toUpperCase();
}


function rosterGroupsV3142() {
  return Array.isArray(state?.rosterGroups)
    ? state.rosterGroups
    : [];
}


function rosterGroupConfigV3142(groupKey) {
  const key = normalizeRosterGroupKeyV3142(groupKey);

  return rosterGroupsV3142().find((group) =>
    group?.isActive !== false
    && normalizeRosterGroupKeyV3142(group?.key) === key
  ) || null;
}


function rosterGroupDisplayNameV3142(groupKey) {
  const key = normalizeRosterGroupKeyV3142(groupKey);
  const configured = rosterGroupConfigV3142(key);

  if (configured?.displayName) return configured.displayName;

  if (key === 'FARM') {
    return window.RosterCapTerminology?.developmentLabel?.() || 'Minors';
  }

  if (key === 'IR') return 'IR';
  return 'Active roster';
}


function supportedRosterGroupsV3142() {
  const supported = ['ACTIVE','FARM','IR'];

  const configured = rosterGroupsV3142()
    .filter((group) =>
      group?.isActive !== false
      && supported.includes(normalizeRosterGroupKeyV3142(group.key))
    )
    .sort((a,b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0))
    .map((group) => normalizeRosterGroupKeyV3142(group.key));

  return [...new Set([
    ...configured,
    ...supported
  ])];
}


function rosterGroupCountsTowardCapV3142(groupKey) {
  const key = normalizeRosterGroupKeyV3142(groupKey);
  const configured = rosterGroupConfigV3142(key);

  if (configured) return Boolean(configured.countsTowardCap);

  // First-render compatibility before the roster-group shadow read completes.
  if (key === 'FARM') return false;
  if (key === 'IR') return true;
  return key === 'ACTIVE';
}


function rosterGroupLineupEligibleV3142(groupKey) {
  const key = normalizeRosterGroupKeyV3142(groupKey);
  const configured = rosterGroupConfigV3142(key);

  if (configured) return Boolean(configured.lineupEligible);

  return key === 'ACTIVE';
}


function injuredReservePlayersV3142() {
  return (state.players || []).filter(
    (player) =>
      normalizeRosterGroupKeyV3142(player?.rosterGroup)
      === ROSTERCAP_IR_GROUP_KEY_V3142
  );
}


function irRosterSummaryV3142(season = currentSeason()) {
  const players = injuredReservePlayersV3142();
  const group = rosterGroupConfigV3142(ROSTERCAP_IR_GROUP_KEY_V3142);
  const countsTowardCap = rosterGroupCountsTowardCapV3142(
    ROSTERCAP_IR_GROUP_KEY_V3142
  );

  let currentCap = 0;
  let missingSalaryCount = 0;

  players.forEach((player) => {
    if (!playerCountsTowardCap(player)) return;

    const charge = season
      ? effectivePlayerCharge(player, season.id)
      : null;

    if (charge === null || charge === undefined) {
      missingSalaryCount += 1;
      return;
    }

    currentCap += Number(charge || 0);
  });

  return {
    label:group?.displayName || 'IR',
    count:players.length,
    playerLimit:
      group?.playerLimit === null || group?.playerLimit === undefined
        ? null
        : Number(group.playerLimit),
    countsTowardCap,
    currentCap,
    missingSalaryCount,
    players
  };
}


// ---------------------------------------------------------------------------
// Cap eligibility cutover
// ---------------------------------------------------------------------------

function installIrCapEligibilityV3142() {
  if (typeof playerCountsTowardCap !== 'function') return;

  playerCountsTowardCap = function(player) {
    const status = statusById(player?.statusId);
    if (!status?.countsTowardCap) return false;

    return rosterGroupCountsTowardCapV3142(
      player?.rosterGroup || 'ACTIVE'
    );
  };

  if (typeof contractIntelligence === 'function') {
    const establishedContractIntelligenceV3142 = contractIntelligence;

    contractIntelligence = function() {
      const intel = establishedContractIntelligenceV3142();
      const capEligiblePlayers = (state.players || [])
        .filter(playerCountsTowardCap);

      const current = intel.current;

      const largestCurrentCapCharges = current
        ? capEligiblePlayers
            .map((player) => ({
              player,
              charge:effectivePlayerCharge(player, current.id)
            }))
            .filter((item) => item.charge !== null)
            .sort((a,b) => Number(b.charge) - Number(a.charge))
        : [];

      const capEligibleCommitments = capEligiblePlayers
        .map((player) => {
          const future = knownFutureCommitment(player);
          return {
            player,
            total:future.total,
            seasons:future.seasons
          };
        })
        .filter((item) => item.seasons > 0)
        .sort(
          (a,b) =>
            b.total - a.total
            || b.seasons - a.seasons
        );

      // Keep existing consumer keys stable while making cap-facing evidence
      // reflect every roster group that actually counts toward cap.
      return {
        ...intel,
        capEligibleActive:capEligiblePlayers,
        largestCurrentCapCharges,
        activeLongTermCommitments:capEligibleCommitments,
        irPlayers:injuredReservePlayersV3142()
      };
    };
  }
}


// ---------------------------------------------------------------------------
// V2.78B parity diagnostic bridge.
//
// V2.78B intentionally compared the generic group config to legacy
// ACTIVE-only cap behavior. Once IR becomes production cap behavior, its old
// comparison would report an expected false mismatch. Patch only that
// diagnostic comparison; the roster-group table/read contract is unchanged.
// ---------------------------------------------------------------------------

function installRosterGroupDiagnosticBridgeV3142() {
  if (
    typeof buildRosterGroupShadowDiagnosticsV278b !== 'function'
    || typeof sortedUniqueIdsV278b !== 'function'
    || typeof sameIdSetV278b !== 'function'
  ) {
    return;
  }

  const establishedBuilderV3142 =
    buildRosterGroupShadowDiagnosticsV278b;

  buildRosterGroupShadowDiagnosticsV278b = function(groups) {
    const report = establishedBuilderV3142(groups);
    const hasIr = (groups || []).some(
      (group) =>
        normalizeRosterGroupKeyV3142(group?.key)
        === ROSTERCAP_IR_GROUP_KEY_V3142
    );

    if (!hasIr) return report;

    const productionCapIds = sortedUniqueIdsV278b(
      (state.players || []).filter(playerCountsTowardCap)
    );

    const configuredCapIds =
      report?.configured?.capEligibleIds || [];

    const capParity = sameIdSetV278b(
      productionCapIds,
      configuredCapIds
    );

    report.version = 'V3.14.2';
    report.mode = 'IR_CUTOVER';

    if (report.legacy) {
      report.legacy.capEligibleCount = productionCapIds.length;
      report.legacy.capEligibleIds = productionCapIds;
    }

    if (report.parity) {
      report.parity.capEligibility = capParity;
      report.parity.all = Boolean(
        report.parity.activeRoster
        && report.parity.developmentRoster
        && report.parity.capEligibility
        && report.parity.depthEligibility
        && report.parity.primaryLimit
        && report.parity.developmentLimit
        && report.parity.groupCoverage
      );
    }

    report.status =
      report.parity?.all
        ? 'PASS'
        : 'MISMATCH';

    return report;
  };
}


// ---------------------------------------------------------------------------
// Player editor: ACTIVE / FARM / IR
// ---------------------------------------------------------------------------

function ensurePlayerRosterGroupOptionsV3142(selectedKey = null) {
  const select = document.getElementById('playerRosterGroup');
  if (!select) return;

  const selected = normalizeRosterGroupKeyV3142(
    selectedKey || select.value || 'ACTIVE'
  );

  select.innerHTML = supportedRosterGroupsV3142()
    .map((key) => {
      const label = rosterGroupDisplayNameV3142(key);
      return `<option value="${escapeAttr(key)}">${escapeHtml(label)}</option>`;
    })
    .join('');

  select.value = [...select.options].some(
    (option) => option.value === selected
  )
    ? selected
    : 'ACTIVE';
}


function syncProspectLocationControlsV3142() {
  const prospect = Boolean(
    document.getElementById('playerIsProspect')?.checked
  );

  const location = document.getElementById('playerRosterGroup');
  if (!location) return;

  const selected = location.value || 'ACTIVE';
  ensurePlayerRosterGroupOptionsV3142(selected);

  const farmOption = [...location.options].find(
    (option) => option.value === 'FARM'
  );

  if (farmOption) farmOption.disabled = !prospect;

  if (!prospect && location.value === 'FARM') {
    location.value = 'ACTIVE';
  }
}


async function assignFrontOfficePlayerRosterGroupV3142(
  playerId,
  groupKey
) {
  const frontOfficeId = state.frontOffice?.id;
  if (!frontOfficeId || !playerId) {
    throw new Error('Front Office/player is not available.');
  }

  const targetGroup = normalizeRosterGroupKeyV3142(groupKey);

  const { data, error } = await db.rpc(
    'assign_front_office_player_roster_group_v1',
    {
      p_front_office_id:frontOfficeId,
      p_front_office_player_id:playerId,
      p_roster_group:targetGroup
    }
  );

  if (error) throw error;
  return data;
}


function installPlayerEditorIrV3142() {
  if (
    typeof openPlayerDialog !== 'function'
    || typeof savePlayerFromDialog !== 'function'
  ) {
    return;
  }

  ensurePlayerRosterGroupOptionsV3142();

  // Replace the legacy prospect/location synchronizer before app.js binds
  // player-editor events.
  syncProspectLocationControls =
    syncProspectLocationControlsV3142;

  const establishedOpenPlayerDialogV3142 = openPlayerDialog;

  openPlayerDialog = function(playerId = null) {
    const player = playerId
      ? state.players.find((item) => item.id === playerId)
      : null;

    ensurePlayerRosterGroupOptionsV3142(
      player?.rosterGroup || 'ACTIVE'
    );

    const result = establishedOpenPlayerDialogV3142(playerId);

    ensurePlayerRosterGroupOptionsV3142(
      player?.rosterGroup || 'ACTIVE'
    );

    syncProspectLocationControlsV3142();

    return result;
  };

  // Complete current save workflow with one controlled change:
  // transitions involving IR use the generic roster-group RPC.
  savePlayerFromDialog = async function(event) {
    event.preventDefault();

    const saveButton = el('savePlayerBtn');
    if (saveButton?.disabled) return;

    const name = el('playerName').value.trim();
    if (!name) return;

    const existingPlayer = editingPlayerId
      ? state.players.find(
          (player) => player.id === editingPlayerId
        )
      : null;

    const salaryRows = state.seasons.map((season) => {
      const salaryInput = document.querySelector(
        `[data-contract-salary="${season.id}"]`
      );
      const overrideInput = document.querySelector(
        `[data-contract-override="${season.id}"]`
      );
      const existingSalary =
        existingPlayer?.salaries?.[season.id]
        || { salary:null, capOverride:null };

      return {
        season_id:season.id,
        salary:salaryInput
          ? nullableNumber(salaryInput.value)
          : existingSalary.salary,
        cap_override:overrideInput
          ? nullableNumber(overrideInput.value)
          : existingSalary.capOverride
      };
    });

    const frontOfficeId = state.frontOffice?.id;

    if (!frontOfficeId) {
      alert(
        'This Front Office is no longer loaded. Reopen it and try again.'
      );
      return;
    }

    if (saveButton) {
      saveButton.disabled = true;
      saveButton.dataset.originalLabel = saveButton.textContent;
      saveButton.textContent = 'Saving…';
      setPlayerSaveStatus('Saving…', 'saving');
    }

    try {
      const saved = await runCloudAction(async () => {
        const previousGroup = normalizeRosterGroupKeyV3142(
          existingPlayer?.rosterGroup || 'ACTIVE'
        );

        const desiredGroup = normalizeRosterGroupKeyV3142(
          el('playerRosterGroup').value || 'ACTIVE'
        );

        const desiredProspect =
          el('playerIsProspect').checked;

        if (
          !['ACTIVE','FARM','IR'].includes(desiredGroup)
        ) {
          throw new Error(
            `Roster location ${desiredGroup} is not supported by this release.`
          );
        }

        if (
          desiredGroup === 'FARM'
          && !desiredProspect
        ) {
          throw new Error(
            'Only players labelled Prospect can be assigned to Minors.'
          );
        }

        const { data:savedPlayerId, error } = await db.rpc(
          'save_front_office_player_v2',
          {
            p_front_office_id:frontOfficeId,
            p_front_office_player_id:editingPlayerId || null,
            p_player_name:name,
            p_position:el('playerPosition').value,
            p_eligible_positions:
              normalizeEligibility(
                el('playerEligible').value
              )
              || el('playerPosition').value,
            p_real_team:normalizeNhlTeam(
              el('realTeam').value
            ),
            p_age_snapshot:nullableInteger(
              el('playerAge').value
            ),
            p_age_as_of:
              nullableInteger(el('playerAge').value) === null
                ? null
                : todayIsoDate(),
            p_roster_status_id:el('rosterStatus').value,
            p_contract_end_season_id:
              el('contractEnd').value || null,
            p_notes:
              el('playerNotes').value.trim() || null,
            p_salary_rows:salaryRows,
            p_source_system:null,
            p_source_player_id:null,
            p_source_player_name:null
          }
        );

        if (error) throw error;

        const playerId = savedPlayerId || editingPlayerId;

        if (!playerId) {
          throw new Error(
            'Player save did not return a player ID.'
          );
        }

        // Preserve established Call Up transaction behavior.
        if (
          previousGroup === 'FARM'
          && desiredGroup === 'ACTIVE'
        ) {
          const { error:moveError } = await db.rpc(
            'record_front_office_transaction_v2',
            {
              p_front_office_id:frontOfficeId,
              p_transaction_type:'Call Up',
              p_transaction_date:todayIsoDate(),
              p_counterparty:null,
              p_summary:
                `${name} called up to the active roster`,
              p_notes:null,
              p_in_items:[],
              p_out_items:[],
              p_front_office_player_id:playerId,
              p_roster_action:'CALL_UP',
              p_roster_status_id:
                el('rosterStatus').value || null,
              p_adjustment_description:null,
              p_adjustment_rows:[]
            }
          );

          if (moveError) throw moveError;
        }

        const { error:prospectError } = await db.rpc(
          'set_front_office_player_prospect_v1',
          {
            p_front_office_id:frontOfficeId,
            p_front_office_player_id:playerId,
            p_is_prospect:desiredProspect
          }
        );

        if (prospectError) throw prospectError;

        if (
          desiredGroup === 'FARM'
          && previousGroup === 'ACTIVE'
        ) {
          const { error:moveError } = await db.rpc(
            'record_front_office_transaction_v2',
            {
              p_front_office_id:frontOfficeId,
              p_transaction_type:'Send Down',
              p_transaction_date:todayIsoDate(),
              p_counterparty:null,
              p_summary:
                `${name} assigned to Minors`,
              p_notes:null,
              p_in_items:[],
              p_out_items:[],
              p_front_office_player_id:playerId,
              p_roster_action:'SEND_TO_FARM',
              p_roster_status_id:
                el('rosterStatus').value || null,
              p_adjustment_description:null,
              p_adjustment_rows:[]
            }
          );

          if (moveError) throw moveError;
        } else if (
          previousGroup !== desiredGroup
          && !(
            previousGroup === 'FARM'
            && desiredGroup === 'ACTIVE'
          )
        ) {
          await assignFrontOfficePlayerRosterGroupV3142(
            playerId,
            desiredGroup
          );
        }

        await loadOffice(frontOfficeId, false);
      });

      if (saved) {
        playerFormDirty = false;
        setPlayerSaveStatus('Saved', 'saved');
        playerDialog.close();
      } else {
        setPlayerSaveStatus('Save failed', 'error');
      }
    } finally {
      if (saveButton) {
        saveButton.disabled = false;
        saveButton.textContent =
          saveButton.dataset.originalLabel
          || 'Save Player';
        delete saveButton.dataset.originalLabel;
      }
    }
  };
}


// ---------------------------------------------------------------------------
// IR roster panel below Depth Chart
// ---------------------------------------------------------------------------

function irPlayerCapDisplayV3142(player, season) {
  if (!season) {
    return {
      capText:'Cap —',
      missing:false
    };
  }

  if (!playerCountsTowardCap(player)) {
    return {
      capText:'$0 cap',
      missing:false
    };
  }

  const charge = effectivePlayerCharge(player, season.id);

  if (charge === null || charge === undefined) {
    return {
      capText:'Cap missing',
      missing:true
    };
  }

  return {
    capText:`${formatMoney(charge)} cap`,
    missing:false
  };
}


function irPlayerMetaV3142(player) {
  return [
    player.position || '—',
    player.realTeam || null,
    player.ageSnapshot === null
      || player.ageSnapshot === undefined
      ? null
      : player.ageSnapshot
  ].filter(
    (value) =>
      value !== null
      && value !== ''
  ).join(' · ');
}


function irPlayerContractTextV3142(player) {
  const end = player.contractEndSeasonId
    ? seasonById(player.contractEndSeasonId)
    : null;

  return end
    ? `Through ${seasonLabel(end.startYear)}`
    : 'No end set';
}


function irRosterSectionMarkupV3142() {
  const season = currentSeason();
  const summary = irRosterSummaryV3142(season);
  const activeAvailable = (state.players || []).filter(
    (player) =>
      normalizeRosterGroupKeyV3142(player.rosterGroup)
      !== ROSTERCAP_IR_GROUP_KEY_V3142
  );

  const groupLimitText =
    summary.playerLimit === null
      || summary.playerLimit === undefined
      ? `${summary.count} player${summary.count === 1 ? '' : 's'}`
      : `${summary.count} / ${summary.playerLimit} players`;

  const capText = summary.countsTowardCap
    ? `${formatMoney(summary.currentCap)} current cap${
        summary.missingSalaryCount
          ? ` · ${summary.missingSalaryCount} missing salary`
          : ''
      }`
    : 'Cap excluded by roster-group configuration';

  return `<section
    class="ir-roster-section-v3142"
    id="irRosterSectionV3142"
    aria-label="${escapeAttr(summary.label)} roster"
  >
    <div class="ir-roster-head-v3142">
      <div>
        <p class="eyebrow">Reserve</p>
        <h4>${escapeHtml(summary.label)}</h4>
        <small>${escapeHtml(groupLimitText)} · ${escapeHtml(capText)}</small>
      </div>

      <button
        class="btn btn-secondary btn-small"
        id="placePlayerOnIrBtnV3142"
        type="button"
        ${activeAvailable.length ? '' : 'disabled'}
      >+ Place on IR</button>
    </div>

    ${summary.players.length
      ? `<div class="ir-roster-grid-v3142">
          ${summary.players.map((player) => {
            const cap = irPlayerCapDisplayV3142(
              player,
              season
            );

            return `<article class="ir-player-card-v3142">
              <button
                class="ir-player-main-v3142"
                data-ir-edit-player-v3142="${escapeAttr(player.id)}"
                type="button"
              >
                <strong>${escapeHtml(player.name)}</strong>
                <span>${escapeHtml(irPlayerMetaV3142(player))}</span>
                <small class="${cap.missing ? 'warning' : ''}">
                  ${escapeHtml(cap.capText)}
                  ·
                  ${escapeHtml(irPlayerContractTextV3142(player))}
                </small>
              </button>

              <button
                class="btn btn-primary btn-small ir-activate-btn-v3142"
                data-ir-activate-player-v3142="${escapeAttr(player.id)}"
                type="button"
              >Activate</button>
            </article>`;
          }).join('')}
        </div>`
      : `<div class="ir-roster-empty-v3142">
          <span>No players on ${escapeHtml(summary.label)}.</span>
          <small>Players placed here are removed from the active depth chart while their saved depth order is preserved.</small>
        </div>`
    }
  </section>`;
}


function bindIrRosterSectionV3142(section) {
  if (!section) return;

  section
    .querySelector('#placePlayerOnIrBtnV3142')
    ?.addEventListener(
      'click',
      openIrMoveDialogV3142
    );

  section
    .querySelectorAll('[data-ir-edit-player-v3142]')
    .forEach((button) => {
      button.addEventListener('click', () => {
        openPlayerDialog(
          button.dataset.irEditPlayerV3142
        );
      });
    });

  section
    .querySelectorAll('[data-ir-activate-player-v3142]')
    .forEach((button) => {
      button.addEventListener('click', async () => {
        const playerId =
          button.dataset.irActivatePlayerV3142;

        button.disabled = true;

        try {
          await runCloudAction(async () => {
            await assignFrontOfficePlayerRosterGroupV3142(
              playerId,
              'ACTIVE'
            );
            await loadOffice(
              state.frontOffice.id,
              false
            );
          });
        } finally {
          if (button.isConnected) {
            button.disabled = false;
          }
        }
      });
    });
}


function decorateIrRosterV3142() {
  const page = document.querySelector(
    '#rosterView .roster-page-v228'
  );

  if (!page) return;

  page.querySelector('#irRosterSectionV3142')?.remove();

  if (
    typeof rosterMode !== 'undefined'
    && rosterMode !== 'depth'
  ) {
    return;
  }

  const wrapper = document.createElement('div');
  wrapper.innerHTML = irRosterSectionMarkupV3142();
  const section = wrapper.firstElementChild;

  if (!section) return;

  const depthPanel = page.querySelector('#depthPanel');
  const gridPanel = page.querySelector('#rosterGridPanel');

  if (depthPanel) {
    depthPanel.insertAdjacentElement(
      'afterend',
      section
    );
  } else if (gridPanel) {
    gridPanel.insertAdjacentElement(
      'beforebegin',
      section
    );
  } else {
    page.appendChild(section);
  }

  bindIrRosterSectionV3142(section);
}


function installIrRosterDecoratorV3142() {
  if (typeof renderRoster !== 'function') return;

  const establishedRenderRosterV3142 = renderRoster;

  renderRoster = function(...args) {
    const result = establishedRenderRosterV3142(...args);
    decorateIrRosterV3142();
    return result;
  };
}


// ---------------------------------------------------------------------------
// Place-on-IR shortcut dialog
// ---------------------------------------------------------------------------

function ensureIrMoveDialogV3142() {
  if (irMoveDialogV3142?.isConnected) {
    return irMoveDialogV3142;
  }

  const dialog = document.createElement('dialog');
  dialog.id = 'irMoveDialogV3142';
  dialog.className = 'drawer-dialog ir-move-dialog-v3142';

  dialog.innerHTML = `
    <form class="drawer-card ir-move-card-v3142" id="irMoveFormV3142">
      <header class="drawer-header">
        <div class="drawer-header-copy">
          <p class="eyebrow">Roster location</p>
          <h3>Place player on IR</h3>
        </div>
        <button
          aria-label="Close"
          class="icon-btn"
          id="closeIrMoveDialogV3142"
          type="button"
        >×</button>
      </header>

      <div class="modal-body ir-move-body-v3142">
        <label>
          Player
          <select id="irMovePlayerV3142"></select>
        </label>

        <div class="ir-move-note-v3142">
          The player leaves the active depth/Starting Lineup presentation.
          Their saved positional depth order is preserved.
        </div>

        <div class="form-actions">
          <button
            class="btn btn-ghost"
            id="cancelIrMoveV3142"
            type="button"
          >Cancel</button>
          <button
            class="btn btn-primary"
            id="saveIrMoveV3142"
            type="submit"
          >Place on IR</button>
        </div>
      </div>
    </form>
  `;

  document.body.appendChild(dialog);

  dialog
    .querySelector('#closeIrMoveDialogV3142')
    ?.addEventListener(
      'click',
      () => dialog.close()
    );

  dialog
    .querySelector('#cancelIrMoveV3142')
    ?.addEventListener(
      'click',
      () => dialog.close()
    );

  dialog
    .querySelector('#irMoveFormV3142')
    ?.addEventListener(
      'submit',
      saveIrMoveV3142
    );

  irMoveDialogV3142 = dialog;
  return dialog;
}


function openIrMoveDialogV3142() {
  const dialog = ensureIrMoveDialogV3142();

  const select = dialog.querySelector(
    '#irMovePlayerV3142'
  );

  const players = [...(state.players || [])]
    .filter(
      (player) =>
        normalizeRosterGroupKeyV3142(
          player.rosterGroup
        ) !== 'IR'
    )
    .sort(
      (a,b) =>
        String(a.name || '').localeCompare(
          String(b.name || '')
        )
    );

  select.innerHTML = players.length
    ? players.map((player) => {
        const groupLabel =
          rosterGroupDisplayNameV3142(
            player.rosterGroup
          );

        return `<option value="${escapeAttr(player.id)}">
          ${escapeHtml(player.name)}
          ·
          ${escapeHtml(groupLabel)}
        </option>`;
      }).join('')
    : '<option value="">No available players</option>';

  dialog
    .querySelector('#saveIrMoveV3142')
    .disabled = !players.length;

  if (!dialog.open) dialog.showModal();
}


async function saveIrMoveV3142(event) {
  event.preventDefault();

  if (irMoveSavingV3142) return;

  const dialog = ensureIrMoveDialogV3142();
  const playerId =
    dialog.querySelector('#irMovePlayerV3142')?.value;

  if (!playerId) return;

  const button =
    dialog.querySelector('#saveIrMoveV3142');

  irMoveSavingV3142 = true;
  button.disabled = true;
  button.textContent = 'Moving…';

  try {
    const success = await runCloudAction(async () => {
      await assignFrontOfficePlayerRosterGroupV3142(
        playerId,
        'IR'
      );

      await loadOffice(
        state.frontOffice.id,
        false
      );
    });

    if (success) dialog.close();
  } finally {
    irMoveSavingV3142 = false;
    button.disabled = false;
    button.textContent = 'Place on IR';
  }
}


// ---------------------------------------------------------------------------
// Import / backup compatibility
// ---------------------------------------------------------------------------

function importStatusIsIrV3142(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z+]/g, '');

  return [
    'ir',
    'ir+',
    'inj',
    'injured',
    'injuredreserve'
  ].includes(normalized);
}


function installIrImportCompatibilityV3142() {
  if (
    typeof backupRosterGroupV299 === 'function'
  ) {
    const establishedBackupGroupV3142 =
      backupRosterGroupV299;

    backupRosterGroupV299 = function(value) {
      const normalized = String(value ?? '')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z]/g, '');

      if (
        ['IR','INJUREDRESERVE'].includes(normalized)
      ) {
        return 'IR';
      }

      return establishedBackupGroupV3142(value);
    };
  }

  if (
    typeof rosterGroupLabelV299 === 'function'
  ) {
    const establishedGroupLabelV3142 =
      rosterGroupLabelV299;

    rosterGroupLabelV299 = function(group) {
      const key = normalizeRosterGroupKeyV3142(group);

      if (key === 'IR') {
        return rosterGroupDisplayNameV3142('IR');
      }

      return establishedGroupLabelV3142(group);
    };
  }

  if (
    typeof mapFantraxStatus === 'function'
  ) {
    const establishedMapFantraxStatusV3142 =
      mapFantraxStatus;

    mapFantraxStatus = function(
      value,
      fallbackStatusId = null
    ) {
      if (!importStatusIsIrV3142(value)) {
        return establishedMapFantraxStatusV3142(
          value,
          fallbackStatusId
        );
      }

      const explicitIr = (state.statuses || []).find(
        (status) =>
          String(status.name || '')
            .trim()
            .toLowerCase() === 'ir'
      );

      const fallback =
        explicitIr
        || statusById(fallbackStatusId)
        || (state.statuses || []).find(
          (status) =>
            String(status.name || '')
              .trim()
              .toLowerCase() === 'active'
        )
        || state.statuses?.[0];

      return {
        statusId:fallback?.id || null,
        warning:fallback
          ? ''
          : 'No roster status is available for this IR player.'
      };
    };
  }

  if (
    typeof parseFantraxTeamRoster === 'function'
  ) {
    const establishedFantraxParserV3142 =
      parseFantraxTeamRoster;

    parseFantraxTeamRoster = function(rows) {
      const parsed =
        establishedFantraxParserV3142(rows);

      (parsed.rows || []).forEach((row) => {
        if (!importStatusIsIrV3142(row.statusRaw)) {
          return;
        }

        row.rosterGroup = 'IR';
        row.isMinors = false;

        if (
          typeof refreshFantraxRowValidityV299
          === 'function'
        ) {
          refreshFantraxRowValidityV299(row);
        }
      });

      return parsed;
    };
  }

  if (
    typeof importTargetRosterGroup === 'function'
  ) {
    const establishedImportTargetV3142 =
      importTargetRosterGroup;

    importTargetRosterGroup = function(row) {
      if (
        normalizeRosterGroupKeyV3142(
          row?.rosterGroup
        ) === 'IR'
      ) {
        return 'IR';
      }

      return establishedImportTargetV3142(row);
    };
  }

  if (
    typeof renderImportPreview === 'function'
  ) {
    const establishedRenderImportPreviewV3142 =
      renderImportPreview;

    renderImportPreview = function() {
      const result =
        establishedRenderImportPreviewV3142();

      const irMoves = (pendingImport || [])
        .filter((row) => row.valid)
        .map((row) => {
          if (
            typeof importRosterMovement
            !== 'function'
          ) {
            return null;
          }
          return importRosterMovement(row);
        })
        .filter(
          (move) => move?.to === 'IR'
        ).length;

      if (irMoves) {
        const movementSmall = document.querySelector(
          '#importPreview .import-review-summary > div:nth-child(4) small'
        );

        if (movementSmall) {
          const existing = movementSmall.textContent
            .replace(/\s*·\s*0 to Active\s*$/i, '');

          movementSmall.textContent =
            `${existing} · ${irMoves} to IR`;
        }
      }

      return result;
    };
  }

  if (
    typeof applyImport === 'function'
  ) {
    const establishedApplyImportV3142 =
      applyImport;

    applyImport = async function() {
      const desiredIrRows = (pendingImport || [])
        .filter((row) => row.valid)
        .filter(
          (row) =>
            normalizeRosterGroupKeyV3142(
              typeof importTargetRosterGroup
                === 'function'
                ? importTargetRosterGroup(row)
                : row.rosterGroup
            ) === 'IR'
        )
        .map((row) => ({
          row,
          existingPlayerId:
            row.existingPlayerId || null,
          backupPlayerId:
            row.backupPlayerId || null,
          sourceId:row.sourceId || null,
          name:row.name || '',
          realTeam:row.realTeam || '',
          originalRosterGroup:
            row.rosterGroup || 'IR'
        }));

      if (!desiredIrRows.length) {
        return establishedApplyImportV3142();
      }

      // Existing V2.99 backup restore adapter accepts ACTIVE/FARM only.
      // Let it restore the complete player/contract/depth record as ACTIVE,
      // then apply IR through the V3.14.2 controlled roster-group RPC.
      desiredIrRows.forEach((item) => {
        if (
          pendingImportMeta?.type
          === 'rostercap_backup'
        ) {
          item.row.rosterGroup = 'ACTIVE';
        }
      });

      await establishedApplyImportV3142();

      // Restore preview state if the established import failed and dialog
      // remains open.
      if (importDialog?.open) {
        desiredIrRows.forEach((item) => {
          item.row.rosterGroup =
            item.originalRosterGroup;
        });

        if (
          typeof renderImportPreview
          === 'function'
        ) {
          renderImportPreview();
        }

        return;
      }

      const frontOfficeId = state.frontOffice?.id;
      if (!frontOfficeId) return;

      await runCloudAction(async () => {
        for (const item of desiredIrRows) {
          const player =
            (item.existingPlayerId
              ? state.players.find(
                  (candidate) =>
                    candidate.id
                    === item.existingPlayerId
                )
              : null)
            || (item.sourceId
              ? state.players.find(
                  (candidate) =>
                    candidate.fantraxId
                    === item.sourceId
                )
              : null)
            || state.players.find(
              (candidate) =>
                String(candidate.name || '')
                  .trim()
                  .toLowerCase()
                === String(item.name || '')
                  .trim()
                  .toLowerCase()
                && (
                  !item.realTeam
                  || !candidate.realTeam
                  || String(candidate.realTeam)
                    .toUpperCase()
                    === String(item.realTeam)
                      .toUpperCase()
                )
            );

          if (!player) {
            throw new Error(
              `Could not place ${item.name || 'imported player'} on IR because the saved player could not be resolved.`
            );
          }

          await assignFrontOfficePlayerRosterGroupV3142(
            player.id,
            'IR'
          );
        }

        await loadOffice(frontOfficeId, false);
      });
    };
  }
}


// ---------------------------------------------------------------------------
// Trade Block roster-location label compatibility
// ---------------------------------------------------------------------------

function installIrTradeBlockLabelV3142() {
  if (
    typeof tradeBlockPlayerContextV3138
    !== 'function'
  ) {
    return;
  }

  tradeBlockPlayerContextV3138 = function(player) {
    if (!player) return '';

    return [
      player.realTeam || 'No team',
      player.ageSnapshot === null
        || player.ageSnapshot === undefined
        ? null
        : String(player.ageSnapshot),
      rosterGroupDisplayNameV3142(
        player.rosterGroup
      )
    ].filter(Boolean).join(' · ');
  };
}


// ---------------------------------------------------------------------------
// Install
// ---------------------------------------------------------------------------

function installIrRosterFeatureV3142() {
  if (irRosterFeatureInstalledV3142) return;
  irRosterFeatureInstalledV3142 = true;

  installIrCapEligibilityV3142();
  installRosterGroupDiagnosticBridgeV3142();
  installPlayerEditorIrV3142();
  installIrImportCompatibilityV3142();
  installIrTradeBlockLabelV3142();
  installIrRosterDecoratorV3142();
  ensureIrMoveDialogV3142();

  document.documentElement.dataset.rostercapIr =
    ROSTERCAP_IR_VERSION_V3142;
}

installIrRosterFeatureV3142();
