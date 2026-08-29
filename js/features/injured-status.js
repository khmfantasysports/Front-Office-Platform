'use strict';

// ============================================================================
// RosterCap V3.14.3 — Roster Status Semantics / IR-IL
//
// Corrective architecture after V3.14.2:
//
// roster_group answers WHERE the player belongs:
//   ACTIVE = main roster
//   FARM   = development / Minors
//
// roster status answers whether a main-roster player is currently playable:
//   ACTIVE   = shown in active depth
//   INJURED  = shown in the IR / IL section
//
// Status name remains user-configurable. "IR", "IL", "LTIR", "Injured List",
// etc. may all carry status_role = INJURED.
//
// Cap treatment remains independent and continues to use
// front_office_roster_statuses.counts_toward_cap.
// ============================================================================

const ROSTERCAP_INJURED_STATUS_VERSION_V3143 = '3.14.3';

let injuredStatusFeatureInstalledV3143 = false;
let injuredStatusOfficeIdV3143 = null;
let injuredStatusRoleByIdV3143 = new Map();
let injuredMoveDialogV3143 = null;
let injuredMoveSavingV3143 = false;


function normalizeStatusRoleV3143(value) {
  return String(value || 'ACTIVE')
    .trim()
    .toUpperCase() === 'INJURED'
      ? 'INJURED'
      : 'ACTIVE';
}


async function preloadRosterStatusRolesV3143(frontOfficeId) {
  const officeId = String(frontOfficeId || '').trim();

  injuredStatusOfficeIdV3143 = officeId || null;
  injuredStatusRoleByIdV3143 = new Map();

  if (!officeId) return;

  const { data, error } = await db
    .from('front_office_roster_statuses')
    .select('roster_status_id,status_role')
    .eq('front_office_id', officeId)
    .eq('is_active', true);

  if (error) throw error;

  (data || []).forEach((row) => {
    injuredStatusRoleByIdV3143.set(
      row.roster_status_id,
      normalizeStatusRoleV3143(row.status_role)
    );
  });
}


function rosterStatusRoleV3143(statusOrId) {
  const statusId =
    typeof statusOrId === 'object'
      ? statusOrId?.id
      : statusOrId;

  return injuredStatusRoleByIdV3143.get(statusId)
    || 'ACTIVE';
}


function statusIsInjuredV3143(statusOrId) {
  return rosterStatusRoleV3143(statusOrId) === 'INJURED';
}


function injuredStatusesV3143() {
  return (state.statuses || []).filter(
    (status) => statusIsInjuredV3143(status.id)
  );
}


function activeAvailabilityStatusesV3143() {
  return (state.statuses || []).filter(
    (status) => !statusIsInjuredV3143(status.id)
  );
}


function preferredInjuredStatusV3143() {
  const statuses = injuredStatusesV3143();

  return statuses.find((status) =>
    /^(ir|il)$/i.test(String(status.name || '').trim())
  )
  || statuses[0]
  || null;
}


function preferredActiveStatusV3143() {
  const statuses = activeAvailabilityStatusesV3143();

  return statuses.find((status) =>
    String(status.name || '')
      .trim()
      .toLowerCase() === 'active'
  )
  || statuses[0]
  || null;
}


function injuredSectionLabelV3143() {
  const names = [
    ...new Set(
      injuredStatusesV3143()
        .map((status) => String(status.name || '').trim())
        .filter(Boolean)
    )
  ];

  if (names.length === 1) return names[0];

  return 'IR / IL';
}


function injuredMainRosterPlayersV3143() {
  return (state.players || []).filter(
    (player) =>
      (player.rosterGroup || 'ACTIVE') === 'ACTIVE'
      && statusIsInjuredV3143(player.statusId)
  );
}


function availableMainRosterPlayersV3143() {
  return (state.players || []).filter(
    (player) =>
      (player.rosterGroup || 'ACTIVE') === 'ACTIVE'
      && !statusIsInjuredV3143(player.statusId)
  );
}


function injuredRosterSummaryV3143(
  season = currentSeason()
) {
  const players = injuredMainRosterPlayersV3143();

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
    label:injuredSectionLabelV3143(),
    count:players.length,
    currentCap,
    missingSalaryCount,
    players
  };
}


// ---------------------------------------------------------------------------
// Load-order bridge.
//
// The status_role column is additive, while the established data loader keeps
// its stable state.statuses contract. Preload only role metadata before the
// established loadOffice reaches render(), so no second render/flicker is
// necessary.
// ---------------------------------------------------------------------------

function installStatusRoleLoadBridgeV3143() {
  if (typeof loadOffice !== 'function') return;

  const establishedLoadOfficeV3143 = loadOffice;

  loadOffice = async function(
    frontOfficeId,
    showBusy = true
  ) {
    try {
      await preloadRosterStatusRolesV3143(
        frontOfficeId
      );
    } catch (error) {
      console.error(
        'Roster status role preload failed',
        error
      );

      injuredStatusOfficeIdV3143 =
        String(frontOfficeId || '').trim()
        || null;
      injuredStatusRoleByIdV3143 =
        new Map();
    }

    return establishedLoadOfficeV3143(
      frontOfficeId,
      showBusy
    );
  };
}


// ---------------------------------------------------------------------------
// Active depth semantics.
//
// Preserve the established roster-group selector but exclude main-roster
// players whose saved roster status is semantically INJURED.
// ---------------------------------------------------------------------------

function installActiveRosterStatusSemanticsV3143() {
  if (typeof activeRosterPlayers !== 'function') {
    return;
  }

  const establishedActiveRosterPlayersV3143 =
    activeRosterPlayers;

  activeRosterPlayers = function() {
    return establishedActiveRosterPlayersV3143()
      .filter(
        (player) =>
          !statusIsInjuredV3143(
            player.statusId
          )
      );
  };

  if (typeof contractIntelligence === 'function') {
    const establishedContractIntelligenceV3143 =
      contractIntelligence;

    contractIntelligence = function() {
      const intel =
        establishedContractIntelligenceV3143();

      const mainRosterPlayers =
        (state.players || []).filter(
          (player) =>
            (player.rosterGroup || 'ACTIVE')
            === 'ACTIVE'
        );

      const capEligibleMainRoster =
        mainRosterPlayers.filter(
          playerCountsTowardCap
        );

      const current = intel.current;

      const largestCurrentCapCharges = current
        ? capEligibleMainRoster
            .map((player) => ({
              player,
              charge:
                effectivePlayerCharge(
                  player,
                  current.id
                )
            }))
            .filter(
              (item) =>
                item.charge !== null
            )
            .sort(
              (a,b) =>
                Number(b.charge)
                - Number(a.charge)
            )
        : [];

      const activeLongTermCommitments =
        capEligibleMainRoster
          .map((player) => {
            const future =
              knownFutureCommitment(player);

            return {
              player,
              total:future.total,
              seasons:future.seasons
            };
          })
          .filter(
            (item) =>
              item.seasons > 0
          )
          .sort(
            (a,b) =>
              b.total - a.total
              || b.seasons - a.seasons
          );

      return {
        ...intel,
        capEligibleActive:
          capEligibleMainRoster,
        largestCurrentCapCharges,
        activeLongTermCommitments,
        injured:
          injuredMainRosterPlayersV3143()
      };
    };
  }
}


// ---------------------------------------------------------------------------
// Controlled status assignment.
// ---------------------------------------------------------------------------

async function assignPlayerRosterStatusV3143(
  playerId,
  statusId
) {
  const frontOfficeId =
    state.frontOffice?.id;

  if (!frontOfficeId || !playerId || !statusId) {
    throw new Error(
      'Front Office, player and roster status are required.'
    );
  }

  const { data, error } = await db.rpc(
    'assign_front_office_player_roster_status_v1',
    {
      p_front_office_id:frontOfficeId,
      p_front_office_player_id:playerId,
      p_roster_status_id:statusId
    }
  );

  if (error) throw error;
  return data;
}


// ---------------------------------------------------------------------------
// IR / IL section below active Depth.
// ---------------------------------------------------------------------------

function injuredPlayerMetaV3143(player) {
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


function injuredPlayerContractTextV3143(player) {
  const end = player.contractEndSeasonId
    ? seasonById(
        player.contractEndSeasonId
      )
    : null;

  return end
    ? `Through ${seasonLabel(end.startYear)}`
    : 'No end set';
}


function injuredPlayerCapTextV3143(
  player,
  season
) {
  if (!playerCountsTowardCap(player)) {
    return 'Cap excluded';
  }

  const charge = season
    ? effectivePlayerCharge(
        player,
        season.id
      )
    : null;

  if (
    charge === null
    || charge === undefined
  ) {
    return 'Cap missing';
  }

  return `${formatMoney(charge)} cap`;
}


function injuredRosterSectionMarkupV3143() {
  const season = currentSeason();
  const summary =
    injuredRosterSummaryV3143(season);

  const injuryStatuses =
    injuredStatusesV3143();

  const availablePlayers =
    availableMainRosterPlayersV3143();

  const canPlace =
    injuryStatuses.length > 0
    && availablePlayers.length > 0;

  const meta = [
    `${summary.count} player${summary.count === 1 ? '' : 's'}`,
    `${formatMoney(summary.currentCap)} current cap`,
    summary.missingSalaryCount
      ? `${summary.missingSalaryCount} missing salary`
      : null
  ].filter(Boolean).join(' · ');

  return `<section
    class="injured-roster-section-v3143"
    id="injuredRosterSectionV3143"
    aria-label="${escapeAttr(summary.label)} roster"
  >
    <div class="injured-roster-head-v3143">
      <div>
        <p class="eyebrow">Unavailable</p>
        <h4>${escapeHtml(summary.label)}</h4>
        <small>${escapeHtml(meta)}</small>
      </div>

      <button
        class="btn btn-secondary btn-small"
        id="placePlayerOnInjuredBtnV3143"
        type="button"
        ${canPlace ? '' : 'disabled'}
      >+ Place on IR</button>
    </div>

    ${summary.players.length
      ? `<div class="injured-roster-list-v3143">
          ${summary.players.map((player) => {
            const status =
              statusById(player.statusId);

            return `<article class="injured-player-row-v3143">
              <button
                class="injured-player-main-v3143"
                data-injured-edit-player-v3143="${escapeAttr(player.id)}"
                type="button"
              >
                <span class="injured-player-title-v3143">
                  <strong>${escapeHtml(player.name)}</strong>
                  <em>${escapeHtml(status?.name || summary.label)}</em>
                </span>
                <span>${escapeHtml(injuredPlayerMetaV3143(player))}</span>
                <small>
                  ${escapeHtml(injuredPlayerCapTextV3143(player, season))}
                  ·
                  ${escapeHtml(injuredPlayerContractTextV3143(player))}
                </small>
              </button>

              <button
                class="btn btn-primary btn-small injured-activate-btn-v3143"
                data-injured-activate-player-v3143="${escapeAttr(player.id)}"
                type="button"
              >Activate</button>
            </article>`;
          }).join('')}
        </div>`
      : `<div class="injured-roster-empty-v3143">
          <strong>No players on ${escapeHtml(summary.label)}.</strong>
          <small>${
            injuryStatuses.length
              ? 'Set a player roster status to an injured status or use Place on IR.'
              : 'Create or classify an injured roster status in Settings first.'
          }</small>
        </div>`
    }
  </section>`;
}


function bindInjuredRosterSectionV3143(
  section
) {
  if (!section) return;

  section
    .querySelector(
      '#placePlayerOnInjuredBtnV3143'
    )
    ?.addEventListener(
      'click',
      openInjuredMoveDialogV3143
    );

  section
    .querySelectorAll(
      '[data-injured-edit-player-v3143]'
    )
    .forEach((button) => {
      button.addEventListener(
        'click',
        () => {
          openPlayerDialog(
            button.dataset
              .injuredEditPlayerV3143
          );
        }
      );
    });

  section
    .querySelectorAll(
      '[data-injured-activate-player-v3143]'
    )
    .forEach((button) => {
      button.addEventListener(
        'click',
        async () => {
          const activeStatus =
            preferredActiveStatusV3143();

          if (!activeStatus) {
            alert(
              'No Active roster status is configured. Open Settings → Roster Rules and classify at least one status as Active.'
            );
            return;
          }

          const playerId =
            button.dataset
              .injuredActivatePlayerV3143;

          button.disabled = true;

          try {
            await runCloudAction(
              async () => {
                await assignPlayerRosterStatusV3143(
                  playerId,
                  activeStatus.id
                );

                await loadOffice(
                  state.frontOffice.id,
                  false
                );
              }
            );
          } finally {
            if (button.isConnected) {
              button.disabled = false;
            }
          }
        }
      );
    });
}


function decorateInjuredRosterV3143() {
  const page = document.querySelector(
    '#rosterView .roster-page'
  );

  if (!page) return;

  page
    .querySelector(
      '#injuredRosterSectionV3143'
    )
    ?.remove();

  if (
    typeof rosterMode !== 'undefined'
    && rosterMode !== 'depth'
  ) {
    return;
  }

  const wrapper =
    document.createElement('div');

  wrapper.innerHTML =
    injuredRosterSectionMarkupV3143();

  const section =
    wrapper.firstElementChild;

  if (!section) return;

  const depthPanel =
    page.querySelector('#depthPanel');

  const gridPanel =
    page.querySelector('#capGridPanel');

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

  bindInjuredRosterSectionV3143(
    section
  );
}


function installInjuredRosterDecoratorV3143() {
  if (typeof renderRoster !== 'function') {
    return;
  }

  const establishedRenderRosterV3143 =
    renderRoster;

  renderRoster = function(...args) {
    const result =
      establishedRenderRosterV3143(...args);

    decorateInjuredRosterV3143();

    return result;
  };
}


// ---------------------------------------------------------------------------
// Place-on-IR dialog.
// ---------------------------------------------------------------------------

function ensureInjuredMoveDialogV3143() {
  if (
    injuredMoveDialogV3143?.isConnected
  ) {
    return injuredMoveDialogV3143;
  }

  const dialog =
    document.createElement('dialog');

  dialog.id =
    'injuredMoveDialogV3143';

  dialog.className =
    'drawer-dialog injured-move-dialog-v3143';

  dialog.innerHTML = `
    <form
      class="drawer-card injured-move-card-v3143"
      id="injuredMoveFormV3143"
    >
      <header class="drawer-header">
        <div class="drawer-header-copy">
          <p class="eyebrow">Roster status</p>
          <h3>Place player on IR / IL</h3>
        </div>

        <button
          aria-label="Close"
          class="icon-btn"
          id="closeInjuredMoveDialogV3143"
          type="button"
        >×</button>
      </header>

      <div class="modal-body injured-move-body-v3143">
        <label>
          Player
          <select id="injuredMovePlayerV3143"></select>
        </label>

        <label>
          Injured status
          <select id="injuredMoveStatusV3143"></select>
        </label>

        <div class="injured-move-note-v3143">
          Roster group stays Active. The roster status controls whether the
          player appears in playable depth. Cap treatment follows the selected
          status's existing Counts toward cap setting.
        </div>

        <div class="form-actions">
          <button
            class="btn btn-ghost"
            id="cancelInjuredMoveV3143"
            type="button"
          >Cancel</button>

          <button
            class="btn btn-primary"
            id="saveInjuredMoveV3143"
            type="submit"
          >Place on IR</button>
        </div>
      </div>
    </form>
  `;

  document.body.appendChild(dialog);

  dialog
    .querySelector(
      '#closeInjuredMoveDialogV3143'
    )
    ?.addEventListener(
      'click',
      () => dialog.close()
    );

  dialog
    .querySelector(
      '#cancelInjuredMoveV3143'
    )
    ?.addEventListener(
      'click',
      () => dialog.close()
    );

  dialog
    .querySelector(
      '#injuredMoveFormV3143'
    )
    ?.addEventListener(
      'submit',
      saveInjuredMoveV3143
    );

  injuredMoveDialogV3143 = dialog;

  return dialog;
}


function openInjuredMoveDialogV3143() {
  const dialog =
    ensureInjuredMoveDialogV3143();

  const playerSelect =
    dialog.querySelector(
      '#injuredMovePlayerV3143'
    );

  const statusSelect =
    dialog.querySelector(
      '#injuredMoveStatusV3143'
    );

  const players = [
    ...availableMainRosterPlayersV3143()
  ].sort(
    (a,b) =>
      String(a.name || '')
        .localeCompare(
          String(b.name || '')
        )
  );

  const statuses = [
    ...injuredStatusesV3143()
  ];

  playerSelect.innerHTML =
    players.length
      ? players.map((player) =>
          `<option value="${escapeAttr(player.id)}">${escapeHtml(player.name)}</option>`
        ).join('')
      : '<option value="">No available players</option>';

  statusSelect.innerHTML =
    statuses.length
      ? statuses.map((status) =>
          `<option value="${escapeAttr(status.id)}">${escapeHtml(status.name)}</option>`
        ).join('')
      : '<option value="">No injured status configured</option>';

  const preferred =
    preferredInjuredStatusV3143();

  if (preferred) {
    statusSelect.value =
      preferred.id;
  }

  dialog
    .querySelector(
      '#saveInjuredMoveV3143'
    )
    .disabled =
      !players.length
      || !statuses.length;

  if (!dialog.open) {
    dialog.showModal();
  }
}


async function saveInjuredMoveV3143(
  event
) {
  event.preventDefault();

  if (injuredMoveSavingV3143) return;

  const dialog =
    ensureInjuredMoveDialogV3143();

  const playerId =
    dialog.querySelector(
      '#injuredMovePlayerV3143'
    )?.value;

  const statusId =
    dialog.querySelector(
      '#injuredMoveStatusV3143'
    )?.value;

  if (!playerId || !statusId) return;

  const button =
    dialog.querySelector(
      '#saveInjuredMoveV3143'
    );

  injuredMoveSavingV3143 = true;
  button.disabled = true;
  button.textContent = 'Moving…';

  try {
    const success =
      await runCloudAction(
        async () => {
          await assignPlayerRosterStatusV3143(
            playerId,
            statusId
          );

          await loadOffice(
            state.frontOffice.id,
            false
          );
        }
      );

    if (success) dialog.close();
  } finally {
    injuredMoveSavingV3143 = false;
    button.disabled = false;
    button.textContent = 'Place on IR';
  }
}


// ---------------------------------------------------------------------------
// Settings — status role is separate from cap treatment.
// ---------------------------------------------------------------------------

function installSettingsStatusRolesV3143() {
  if (
    typeof settingsRosterAndCapSnapshot
    === 'function'
  ) {
    const establishedSnapshotV3143 =
      settingsRosterAndCapSnapshot;

    settingsRosterAndCapSnapshot =
      function() {
        const snapshot =
          establishedSnapshotV3143();

        snapshot.active =
          activeRosterPlayers();

        snapshot.injured =
          injuredMainRosterPlayersV3143();

        return snapshot;
      };
  }

  if (
    typeof settingsRosterSummaryMarkup
    === 'function'
  ) {
    settingsRosterSummaryMarkup =
      function(snapshot) {
        const rosterLimit =
          state.frontOffice.rosterLimit;

        const minorsLimit =
          state.frontOffice.minorsLimit;

        const activeOver =
          rosterLimit !== null
          && rosterLimit !== undefined
          && snapshot.active.length
            > rosterLimit;

        const minorsOver =
          minorsLimit !== null
          && minorsLimit !== undefined
          && snapshot.minors.length
            > minorsLimit;

        return `<div class="settings-summary-grid settings-summary-grid-roster">
          <div class="settings-summary-item ${activeOver ? 'warning' : ''}">
            <span>Active roster</span>
            <strong>${escapeHtml(settingsLimitDisplay(snapshot.active.length, rosterLimit))}</strong>
          </div>

          <div class="settings-summary-item ${minorsOver ? 'warning' : ''}">
            <span>Minors</span>
            <strong>${escapeHtml(settingsLimitDisplay(snapshot.minors.length, minorsLimit))}</strong>
          </div>

          <div class="settings-summary-item">
            <span>Injured</span>
            <strong>${snapshot.injured.length}</strong>
          </div>

          <div class="settings-summary-item">
            <span>Cap-counting statuses</span>
            <strong>${snapshot.capCountingStatuses.length} / ${state.statuses.length}</strong>
          </div>
        </div>`;
      };
  }

  if (typeof addStatus === 'function') {
    addStatus = async function() {
      const existing = new Set(
        state.statuses.map(
          (status) =>
            status.name.toLowerCase()
        )
      );

      let index = 1;
      let name = 'New Status';

      while (
        existing.has(name.toLowerCase())
      ) {
        name = `New Status ${++index}`;
      }

      await saveSettingsChange(
        'roster-rules',
        async () => {
          const { error } = await db
            .from(
              'front_office_roster_statuses'
            )
            .insert({
              front_office_id:
                state.frontOffice.id,
              status_name:name,
              counts_toward_cap:true,
              status_role:'ACTIVE',
              sort_order:
                (state.statuses.length + 1)
                * 10,
              is_active:true
            });

          if (error) throw error;

          await loadOffice(
            state.frontOffice.id,
            false
          );
        }
      );
    };
  }

  if (typeof removeStatus === 'function') {
    removeStatus = async function(id) {
      const status = statusById(id);

      if (!status) return;

      if (
        state.players.some(
          (player) =>
            player.statusId === id
        )
      ) {
        alert(
          'This status is currently assigned to one or more players. Reassign them before removing it.'
        );
        return;
      }

      if (
        !statusIsInjuredV3143(id)
        && activeAvailabilityStatusesV3143()
          .length <= 1
      ) {
        alert(
          'At least one Active roster status is required.'
        );
        return;
      }

      await saveSettingsChange(
        'roster-rules',
        async () => {
          const { error } = await db.rpc(
            'archive_roster_status_v1',
            {
              p_front_office_id:
                state.frontOffice.id,
              p_roster_status_id:id
            }
          );

          if (error) throw error;

          await loadOffice(
            state.frontOffice.id,
            false
          );
        }
      );
    };
  }

  if (typeof renderSettings !== 'function') {
    return;
  }

  const establishedRenderSettingsV3143 =
    renderSettings;

  renderSettings = function() {
    const result =
      establishedRenderSettingsV3143();

    const rosterRules =
      document.querySelector(
        '#settingsView [data-settings-section="roster-rules"]'
      );

    if (!rosterRules) return result;

    const summaryCopy =
      rosterRules.querySelector(
        'summary .settings-disclosure-title span'
      );

    if (summaryCopy) {
      summaryCopy.textContent =
        'Status role and cap treatment';
    }

    const cardCopy =
      rosterRules.querySelector(
        '.settings-card-head .settings-card-copy'
      );

    if (cardCopy) {
      cardCopy.textContent =
        'Roster status determines whether a main-roster player is Active or on IR / IL. Cap treatment is configured separately for each status. Minors remain a separate roster location.';
    }

    rosterRules
      .querySelectorAll(
        '[data-status-setting]'
      )
      .forEach((row) => {
        const statusId =
          row.dataset.statusSetting;

        const capSelect =
          row.querySelector(
            '[data-status-cap]'
          );

        if (
          !statusId
          || !capSelect
          || row.querySelector(
            '[data-status-role-v3143]'
          )
        ) {
          return;
        }

        const roleSelect =
          document.createElement(
            'select'
          );

        roleSelect.dataset
          .statusRoleV3143 = statusId;

        roleSelect.setAttribute(
          'aria-label',
          'Roster use'
        );

        roleSelect.innerHTML = `
          <option value="ACTIVE">Active / available</option>
          <option value="INJURED">IR / IL</option>
        `;

        roleSelect.value =
          rosterStatusRoleV3143(
            statusId
          );

        capSelect.insertAdjacentElement(
          'beforebegin',
          roleSelect
        );

        roleSelect.addEventListener(
          'change',
          async () => {
            const role =
              normalizeStatusRoleV3143(
                roleSelect.value
              );

            const success =
              await saveSettingsChange(
                'roster-rules',
                async () => {
                  const { error } =
                    await db.rpc(
                      'set_front_office_roster_status_role_v1',
                      {
                        p_front_office_id:
                          state.frontOffice.id,
                        p_roster_status_id:
                          statusId,
                        p_status_role:role
                      }
                    );

                  if (error) throw error;

                  await loadOffice(
                    state.frontOffice.id,
                    false
                  );
                }
              );

            if (success) {
              renderSettings();
            }
          }
        );
      });

    return result;
  };
}


// ---------------------------------------------------------------------------
// Fantrax IR / IL status compatibility.
// ---------------------------------------------------------------------------

function importStatusIsInjuredV3143(
  value
) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

  return [
    'ir',
    'irplus',
    'il',
    'inj',
    'injured',
    'injuredreserve',
    'injuredlist',
    'ltir'
  ].includes(normalized);
}


function installInjuredImportCompatibilityV3143() {
  if (
    typeof mapFantraxStatus
    !== 'function'
  ) {
    return;
  }

  const establishedMapFantraxStatusV3143 =
    mapFantraxStatus;

  mapFantraxStatus = function(
    value,
    fallbackStatusId = null
  ) {
    if (!importStatusIsInjuredV3143(value)) {
      return establishedMapFantraxStatusV3143(
        value,
        fallbackStatusId
      );
    }

    const injured =
      preferredInjuredStatusV3143();

    if (injured) {
      return {
        statusId:injured.id,
        warning:''
      };
    }

    return establishedMapFantraxStatusV3143(
      value,
      fallbackStatusId
    );
  };
}


// ---------------------------------------------------------------------------
// Trade Block roster-state label.
// ---------------------------------------------------------------------------

function installTradeBlockInjuredLabelV3143() {
  if (
    typeof tradeBlockPlayerContextV3138
    !== 'function'
  ) {
    return;
  }

  tradeBlockPlayerContextV3138 =
    function(player) {
      if (!player) return '';

      const status =
        statusById(player.statusId);

      const rosterLabel =
        (player.rosterGroup || 'ACTIVE')
          === 'FARM'
          ? (
              window.RosterCapTerminology
                ?.developmentLabel?.()
              || 'Minors'
            )
          : statusIsInjuredV3143(
              player.statusId
            )
            ? (
                status?.name
                || injuredSectionLabelV3143()
              )
            : 'Active';

      return [
        player.realTeam || 'No team',
        player.ageSnapshot === null
          || player.ageSnapshot === undefined
          ? null
          : String(player.ageSnapshot),
        rosterLabel
      ].filter(Boolean).join(' · ');
    };
}


// ---------------------------------------------------------------------------
// Install.
// ---------------------------------------------------------------------------

function installInjuredStatusFeatureV3143() {
  if (injuredStatusFeatureInstalledV3143) {
    return;
  }

  injuredStatusFeatureInstalledV3143 = true;

  installStatusRoleLoadBridgeV3143();
  installActiveRosterStatusSemanticsV3143();
  installSettingsStatusRolesV3143();
  installInjuredImportCompatibilityV3143();
  installTradeBlockInjuredLabelV3143();
  installInjuredRosterDecoratorV3143();
  ensureInjuredMoveDialogV3143();

  document.documentElement.dataset
    .rostercapInjuredStatus =
      ROSTERCAP_INJURED_STATUS_VERSION_V3143;
}

installInjuredStatusFeatureV3143();
