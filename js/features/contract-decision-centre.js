'use strict';

// ============================================================================
// RosterCap V3.10.0 — Player / Contract Decision Centre V1
//
// Read-only decision support until the user explicitly launches one of the
// established transaction flows. This module is intentionally loaded AFTER
// app.js so it can wrap the final player editor and reuse the canonical
// transaction, contract, roster-move and penalty helpers already installed.
//
// No database writes occur inside the Decision Centre itself.
// ============================================================================

const ROSTERCAP_DECISION_CENTRE_VERSION_V310 = '3.10.0';
let decisionCentreInstalledV310 = false;
let decisionCentrePlayerIdV310 = null;

function decisionCentreDevelopmentLabelV310() {
  try {
    return window.RosterCapTerminology?.developmentLabel?.() || 'Minors';
  } catch (_error) {
    return 'Minors';
  }
}

function decisionCentrePlayerV310(playerId = decisionCentrePlayerIdV310) {
  return (state.players || []).find((player) => player.id === playerId) || null;
}

function decisionCentreCurrentSeasonV310() {
  return typeof currentSeason === 'function' ? currentSeason() : null;
}

function decisionCentreSeasonsV310() {
  return typeof contractHorizonSeasons === 'function'
    ? contractHorizonSeasons().slice().sort((a, b) => Number(a.startYear) - Number(b.startYear))
    : [];
}

function decisionCentreSeasonLabelV310(season) {
  if (!season) return '—';
  return typeof seasonLabel === 'function'
    ? seasonLabel(season.startYear)
    : String(season.startYear || '—');
}

function decisionCentreMoneyV310(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  return typeof formatMoney === 'function'
    ? formatMoney(Number(value))
    : `$${Number(value).toLocaleString()}`;
}

function decisionCentreContractEndV310(player) {
  if (!player?.contractEndSeasonId) return null;
  if (typeof seasonById === 'function') return seasonById(player.contractEndSeasonId) || null;
  return decisionCentreSeasonsV310().find((season) => season.id === player.contractEndSeasonId) || null;
}

function decisionCentreContractRowsV310(player) {
  const end = decisionCentreContractEndV310(player);
  return decisionCentreSeasonsV310().map((season) => {
    const charge = typeof effectivePlayerCharge === 'function'
      ? effectivePlayerCharge(player, season.id)
      : (player?.salaries?.[season.id]?.capOverride ?? player?.salaries?.[season.id]?.salary ?? null);
    const salary = player?.salaries?.[season.id]?.salary ?? null;
    const insideContract = !end || Number(season.startYear) <= Number(end.startYear);
    return { season, charge, salary, insideContract };
  });
}

function decisionCentreKnownCommitmentV310(player) {
  const enteredRows = decisionCentreContractRowsV310(player)
    .filter((row) => row.insideContract && row.charge !== null && row.charge !== undefined);

  if (!enteredRows.length) return null;
  return enteredRows.reduce((sum, row) => sum + Number(row.charge || 0), 0);
}

function decisionCentreCountsTowardCapV310(player) {
  return typeof playerCountsTowardCap === 'function'
    ? Boolean(playerCountsTowardCap(player))
    : player?.rosterGroup !== 'FARM';
}

function decisionCentreLocationV310(player) {
  return player?.rosterGroup === 'FARM'
    ? decisionCentreDevelopmentLabelV310()
    : 'Active roster';
}

function decisionCentrePenaltyRuleV310(type) {
  return typeof transactionRuleForType === 'function'
    ? transactionRuleForType(type)
    : null;
}

function decisionCentrePenaltyRowsV310(type, player) {
  if (typeof automaticPenaltyRows === 'function') {
    try {
      return automaticPenaltyRows(type, player) || [];
    } catch (_error) {
      return [];
    }
  }
  return [];
}

function decisionCentrePenaltyPreviewV310(type, player) {
  const rule = decisionCentrePenaltyRuleV310(type);
  const rows = decisionCentrePenaltyRowsV310(type, player);
  const total = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);

  const modeLabel = rule && typeof transactionRuleModeLabel === 'function'
    ? transactionRuleModeLabel(rule.mode, rule.value)
    : (rule?.mode === 'NONE' || !rule ? 'No automatic penalty' : String(rule.mode || 'Configured rule'));

  const scopeLabel = rule && typeof transactionRuleScopeLabel === 'function'
    ? transactionRuleScopeLabel(rule.scope)
    : '';

  const seasons = rows.map((row) => {
    const season = typeof seasonById === 'function'
      ? seasonById(row.seasonId)
      : decisionCentreSeasonsV310().find((item) => item.id === row.seasonId);
    return {
      label: decisionCentreSeasonLabelV310(season),
      amount: Number(row.amount || 0)
    };
  });

  const current = decisionCentreCurrentSeasonV310();
  const currentCharge = current && typeof effectivePlayerCharge === 'function'
    ? effectivePlayerCharge(player, current.id)
    : null;
  const countsTowardCap = decisionCentreCountsTowardCapV310(player);
  const currentPenalty = current
    ? rows
        .filter((row) => row.seasonId === current.id)
        .reduce((sum, row) => sum + Number(row.amount || 0), 0)
    : 0;
  const currentRosterCost = countsTowardCap && currentCharge !== null && currentCharge !== undefined
    ? Number(currentCharge)
    : 0;
  const netCurrentRelief = currentRosterCost - currentPenalty;

  return {
    rule,
    rows,
    total,
    modeLabel,
    scopeLabel,
    seasons,
    currentPenalty,
    currentRosterCost,
    netCurrentRelief
  };
}

function decisionCentreRuleMarkupV310(type, player) {
  const preview = decisionCentrePenaltyPreviewV310(type, player);
  const configured = preview.rule && preview.rule.mode !== 'NONE';

  if (!configured) {
    return `
      <div class="decision-impact-v310 neutral">
        <strong>No automatic penalty</strong>
        <span>Settings currently have no automatic ${escapeHtml(type.toLowerCase())} penalty.</span>
      </div>
    `;
  }

  const rows = preview.seasons.length
    ? preview.seasons.map((row) => `
        <span class="decision-impact-season-v310">
          <small>${escapeHtml(row.label)}</small>
          <strong>${escapeHtml(decisionCentreMoneyV310(row.amount))}</strong>
        </span>
      `).join('')
    : `<span class="decision-impact-empty-v310">No entered salary rows produce an automatic amount.</span>`;

  return `
    <div class="decision-impact-v310">
      <div class="decision-impact-total-v310">
        <span>Estimated penalty</span>
        <strong>${escapeHtml(decisionCentreMoneyV310(preview.total))}</strong>
      </div>
      <p>${escapeHtml(preview.modeLabel)}${preview.scopeLabel ? ` · ${escapeHtml(preview.scopeLabel)}` : ''}</p>
      <div class="decision-relief-v310 ${preview.netCurrentRelief < 0 ? 'cost' : ''}">
        <span>${preview.netCurrentRelief < 0 ? 'Current cap increase' : 'Current cap relief'}</span>
        <strong>${escapeHtml(decisionCentreMoneyV310(Math.abs(preview.netCurrentRelief)))}</strong>
      </div>
      <div class="decision-impact-seasons-v310">${rows}</div>
    </div>
  `;
}

function ensureDecisionCentreDialogV310() {
  if (el('playerDecisionCentreV310')) return;

  const dialog = document.createElement('dialog');
  dialog.id = 'playerDecisionCentreV310';
  dialog.className = 'modal-dialog decision-centre-dialog-v310';
  dialog.innerHTML = `
    <div class="modal-card decision-centre-card-v310">
      <header class="drawer-header decision-centre-header-v310">
        <div>
          <p class="eyebrow">Decision support</p>
          <h3>Player Decision Centre</h3>
        </div>
        <button aria-label="Close" class="icon-btn" id="closePlayerDecisionCentreV310" type="button">×</button>
      </header>
      <div class="modal-body decision-centre-body-v310" id="playerDecisionCentreBodyV310"></div>
      <footer class="drawer-footer decision-centre-footer-v310">
        <span class="decision-centre-footer-note-v310">Preview first. Nothing changes until you record a transaction.</span>
        <button class="btn btn-ghost" id="donePlayerDecisionCentreV310" type="button">Done</button>
      </footer>
    </div>
  `;

  document.body.appendChild(dialog);

  el('closePlayerDecisionCentreV310')?.addEventListener('click', () => dialog.close());
  el('donePlayerDecisionCentreV310')?.addEventListener('click', () => dialog.close());

  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });

  dialog.addEventListener('close', () => {
    decisionCentrePlayerIdV310 = null;
  });
}

function ensureDecisionCentreLauncherV310() {
  const playerForm = el('playerForm');
  const footer = playerForm?.querySelector('.drawer-footer');
  const body = playerForm?.querySelector('.drawer-body');
  if (!playerForm || !footer || !body || el('playerDecisionLauncherV310')) return;

  const launcher = document.createElement('section');
  launcher.id = 'playerDecisionLauncherV310';
  launcher.className = 'player-decision-launcher-v310 hidden';
  launcher.innerHTML = `
    <div class="player-decision-launcher-copy-v310">
      <p class="eyebrow">Front office decision</p>
      <strong>Preview your options</strong>
      <span>Compare the saved contract, cap and roster consequences before making a move.</span>
    </div>
    <button class="btn btn-secondary player-decision-launcher-btn-v310" id="openPlayerDecisionCentreV310" type="button">
      Decision Centre
    </button>
  `;

  body.appendChild(launcher);

  el('openPlayerDecisionCentreV310')?.addEventListener('click', () => {
    const playerId = launcher.dataset.playerId || '';
    if (!playerId) return;
    openPlayerDecisionCentreV310(playerId);
  });
}

function syncDecisionCentreLauncherV310(playerId = null) {
  ensureDecisionCentreLauncherV310();
  const launcher = el('playerDecisionLauncherV310');
  if (!launcher) return;

  const player = playerId ? decisionCentrePlayerV310(playerId) : null;
  launcher.classList.toggle('hidden', !player);
  launcher.dataset.playerId = player?.id || '';
}

function decisionCentreSeasonStripV310(player) {
  const rows = decisionCentreContractRowsV310(player);
  if (!rows.length) return '';

  return `
    <div class="decision-contract-strip-v310" role="region" aria-label="Entered contract charges by season" tabindex="0">
      ${rows.map((row) => {
        const active = row.insideContract && row.charge !== null && row.charge !== undefined;
        return `
          <div class="decision-contract-season-v310 ${active ? 'entered' : ''}">
            <span>${escapeHtml(decisionCentreSeasonLabelV310(row.season))}</span>
            <strong>${escapeHtml(decisionCentreMoneyV310(row.charge))}</strong>
            <small>${active ? 'entered' : '—'}</small>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function decisionCentreActionCardV310({
  tone = '',
  eyebrow,
  title,
  copy,
  impact = '',
  action = '',
  actionLabel = '',
  disabled = false
}) {
  return `
    <article class="decision-action-card-v310 ${escapeAttr(tone)}">
      <div class="decision-action-copy-v310">
        <p class="eyebrow">${escapeHtml(eyebrow)}</p>
        <h4>${escapeHtml(title)}</h4>
        <p>${escapeHtml(copy)}</p>
      </div>
      ${impact}
      ${action ? `
        <button
          class="btn ${tone === 'danger' ? 'btn-danger' : tone === 'primary' ? 'btn-primary' : 'btn-secondary'} decision-action-btn-v310"
          data-decision-action-v310="${escapeAttr(action)}"
          type="button"
          ${disabled ? 'disabled' : ''}
        >${escapeHtml(actionLabel)}</button>
      ` : ''}
    </article>
  `;
}

function renderDecisionCentreV310(player) {
  const body = el('playerDecisionCentreBodyV310');
  if (!body || !player) return;

  const current = decisionCentreCurrentSeasonV310();
  const currentCharge = current && typeof effectivePlayerCharge === 'function'
    ? effectivePlayerCharge(player, current.id)
    : null;
  const end = decisionCentreContractEndV310(player);
  const commitment = decisionCentreKnownCommitmentV310(player);
  const capEligible = decisionCentreCountsTowardCapV310(player);
  const location = decisionCentreLocationV310(player);
  const devLabel = decisionCentreDevelopmentLabelV310();

  const meta = [
    player.position || null,
    player.realTeam || null,
    player.ageSnapshot !== null && player.ageSnapshot !== undefined ? `Age ${player.ageSnapshot}` : null
  ].filter(Boolean).join(' · ');

  const extensionCopy = end
    ? `Build the next contract after ${decisionCentreSeasonLabelV310(end)} using the existing contract transaction flow.`
    : 'Build an extension using the saved contract transaction flow. Add a contract end first if the current term needs a defined endpoint.';

  const actionCards = [
    decisionCentreActionCardV310({
      eyebrow:'Keep',
      title:'Keep current contract',
      copy:'No roster or contract change. The current saved terms remain in place.',
      impact:`<div class="decision-static-status-v310"><span>Current decision</span><strong>No transaction required</strong></div>`
    }),
    decisionCentreActionCardV310({
      tone:'primary',
      eyebrow:'Contract',
      title:'Extend / re-sign',
      copy:extensionCopy,
      impact:`<div class="decision-static-status-v310"><span>Current term</span><strong>${escapeHtml(end ? `Through ${decisionCentreSeasonLabelV310(end)}` : 'No end set')}</strong></div>`,
      action:'EXTENSION',
      actionLabel:'Build Extension'
    }),
    decisionCentreActionCardV310({
      eyebrow:'Roster move',
      title:'Waive player',
      copy:'Preview the saved waiver rule, then record the move through Transactions.',
      impact:decisionCentreRuleMarkupV310('Waiver', player),
      action:'WAIVER',
      actionLabel:'Record Waiver'
    }),
    decisionCentreActionCardV310({
      tone:'danger',
      eyebrow:'Contract exit',
      title:'Buy out contract',
      copy:'Preview the saved buyout rule and dead-cap effect before recording the transaction.',
      impact:decisionCentreRuleMarkupV310('Buyout', player),
      action:'BUYOUT',
      actionLabel:'Record Buyout'
    }),
    decisionCentreActionCardV310({
      eyebrow:'Roster exit',
      title:'Release player',
      copy:'Remove the player through the existing Release transaction. The current Release flow does not add an automatic penalty.',
      impact:`<div class="decision-static-status-v310"><span>Current roster charge</span><strong>${escapeHtml(decisionCentreMoneyV310(capEligible ? currentCharge : 0))}</strong></div>`,
      action:'RELEASE',
      actionLabel:'Record Release'
    })
  ];

  if (player.isProspect) {
    const inDevelopment = player.rosterGroup === 'FARM';
    actionCards.push(decisionCentreActionCardV310({
      eyebrow:'Roster location',
      title:inDevelopment ? 'Call up' : `Send to ${devLabel}`,
      copy:inDevelopment
        ? `Move the player from ${devLabel} to the active roster through the existing transaction flow.`
        : `Move the player from the active roster to ${devLabel} through the existing transaction flow.`,
      impact:`<div class="decision-static-status-v310"><span>Current location</span><strong>${escapeHtml(location)}</strong></div>`,
      action:inDevelopment ? 'CALL_UP' : 'SEND_DOWN',
      actionLabel:inDevelopment ? 'Record Call Up' : `Send to ${devLabel}`
    }));
  }

  actionCards.push(decisionCentreActionCardV310({
    eyebrow:'Trade',
    title:'Shop / trade player',
    copy:'Start the structured Trade transaction with this player already selected as outgoing.',
    impact:`<div class="decision-static-status-v310"><span>Current charge</span><strong>${escapeHtml(decisionCentreMoneyV310(currentCharge))}</strong></div>`,
    action:'TRADE',
    actionLabel:'Start Trade'
  }));

  body.innerHTML = `
    <section class="decision-player-hero-v310">
      <div class="decision-player-heading-v310">
        <div>
          <p class="eyebrow">Player</p>
          <h3>${escapeHtml(player.name)}</h3>
          <p>${escapeHtml(meta || 'Roster player')}</p>
        </div>
        <span class="decision-location-badge-v310">${escapeHtml(location)}</span>
      </div>

      <div class="decision-summary-grid-v310">
        <div><span>Current charge</span><strong>${escapeHtml(decisionCentreMoneyV310(currentCharge))}</strong><small>${capEligible ? 'counts toward cap' : 'excluded from cap'}</small></div>
        <div><span>Contract through</span><strong>${escapeHtml(end ? decisionCentreSeasonLabelV310(end) : 'Not set')}</strong><small>${end ? 'saved term' : 'no end entered'}</small></div>
        <div><span>Entered commitment</span><strong>${escapeHtml(decisionCentreMoneyV310(commitment))}</strong><small>known charges in entered term</small></div>
        <div><span>Roster location</span><strong>${escapeHtml(location)}</strong><small>${player.isProspect ? 'development eligible' : 'current location'}</small></div>
      </div>

      <div class="decision-strip-head-v310">
        <span>Contract horizon</span>
        <small>Swipe for future seasons</small>
      </div>
      ${decisionCentreSeasonStripV310(player)}
    </section>

    <section class="decision-options-v310">
      <div class="decision-options-heading-v310">
        <div>
          <p class="eyebrow">Options</p>
          <h3>What do you want to evaluate?</h3>
        </div>
        <span>Saved league rules are used for penalty previews.</span>
      </div>
      <div class="decision-actions-grid-v310">${actionCards.join('')}</div>
    </section>
  `;

  body.querySelectorAll('[data-decision-action-v310]').forEach((button) => {
    button.addEventListener('click', () => {
      handleDecisionCentreActionV310(button.dataset.decisionActionV310, player.id);
    });
  });
}

function closePlayerEditorForDecisionV310() {
  const dialog = el('playerDialog');
  if (dialog?.open) dialog.close();
}

function launchDecisionTransactionV310(type, playerId) {
  const decisionDialog = el('playerDecisionCentreV310');
  if (decisionDialog?.open) decisionDialog.close();
  closePlayerEditorForDecisionV310();

  if (typeof openTransactionDialog !== 'function') {
    alert('The transaction editor is not available yet. Refresh RosterCap and try again.');
    return;
  }

  openTransactionDialog({ type, playerId });
}

function launchDecisionTradeV310(playerId) {
  const decisionDialog = el('playerDecisionCentreV310');
  if (decisionDialog?.open) decisionDialog.close();
  closePlayerEditorForDecisionV310();

  if (typeof openTransactionDialog !== 'function') {
    alert('The transaction editor is not available yet. Refresh RosterCap and try again.');
    return;
  }

  openTransactionDialog({ type:'Trade' });

  window.requestAnimationFrame(() => {
    const input = document.querySelector(`[data-trade-out-player="${CSS.escape(playerId)}"]`);
    if (!input) return;
    input.checked = true;
    input.dispatchEvent(new Event('change', { bubbles:true }));
    input.closest('.trade-choice')?.scrollIntoView({ block:'nearest', behavior:'smooth' });
  });
}

function handleDecisionCentreActionV310(action, playerId) {
  const player = decisionCentrePlayerV310(playerId);
  if (!player) return;

  if (action === 'EXTENSION') return launchDecisionTransactionV310('Extension', playerId);
  if (action === 'WAIVER') return launchDecisionTransactionV310('Waiver', playerId);
  if (action === 'BUYOUT') return launchDecisionTransactionV310('Buyout', playerId);
  if (action === 'RELEASE') return launchDecisionTransactionV310('Release', playerId);
  if (action === 'CALL_UP') return launchDecisionTransactionV310('Call Up', playerId);
  if (action === 'SEND_DOWN') return launchDecisionTransactionV310('Send Down', playerId);
  if (action === 'TRADE') return launchDecisionTradeV310(playerId);
}

function openPlayerDecisionCentreV310(playerId) {
  const player = decisionCentrePlayerV310(playerId);
  if (!player) {
    alert('That player is no longer available in this Front Office.');
    return;
  }

  const dirty = typeof playerFormDirty !== 'undefined' && playerFormDirty;
  if (dirty) {
    alert('Save or discard your player changes before opening the Decision Centre so the preview uses saved roster and contract data.');
    return;
  }

  ensureDecisionCentreDialogV310();
  decisionCentrePlayerIdV310 = playerId;
  renderDecisionCentreV310(player);

  const dialog = el('playerDecisionCentreV310');
  if (!dialog) return;

  if (dialog.open) dialog.close();
  dialog.showModal();
  dialog.querySelector('.decision-centre-body-v310')?.scrollTo({ top:0 });
}

function installDecisionCentreV310() {
  if (decisionCentreInstalledV310) return;
  decisionCentreInstalledV310 = true;

  ensureDecisionCentreDialogV310();
  ensureDecisionCentreLauncherV310();

  if (typeof openPlayerDialog === 'function') {
    const originalOpenPlayerDialogV310 = openPlayerDialog;
    openPlayerDialog = function(playerId = null) {
      const result = originalOpenPlayerDialogV310(playerId);
      syncDecisionCentreLauncherV310(playerId);
      return result;
    };
  }

  syncDecisionCentreLauncherV310(null);

  document.documentElement.dataset.rostercapDecisionCentre = ROSTERCAP_DECISION_CENTRE_VERSION_V310;

  window.RosterCapDecisionCentre = Object.freeze({
    version:ROSTERCAP_DECISION_CENTRE_VERSION_V310,
    open:openPlayerDecisionCentreV310
  });
}

installDecisionCentreV310();
