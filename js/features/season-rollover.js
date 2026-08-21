'use strict';

// RosterCap V2.67 — controlled annual Season Rollover workflow.
// Loaded after js/pages/settings.js and before js/app.js.

let seasonRolloverPreview = null;
let seasonRolloverBusy = false;
let seasonRolloverOpen = false;
let seasonRolloverLastResult = null;

function seasonRolloverCurrentSeason() {
  if (!state?.frontOffice) return null;
  return state.seasons.find((season) => season.id === state.frontOffice.currentSeasonId) || null;
}

function seasonRolloverNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function seasonRolloverCapInputValue(value) {
  if (value === null || value === undefined || value === '') return '';
  const number = Number(value);
  return Number.isFinite(number) ? String(number) : '';
}

function seasonRolloverEnsureFreshState() {
  const officeId = state?.frontOffice?.id || null;
  const currentSeasonId = state?.frontOffice?.currentSeasonId || null;

  if (seasonRolloverPreview && (
    seasonRolloverPreview.front_office_id !== officeId ||
    seasonRolloverPreview.current_season_id !== currentSeasonId
  )) {
    seasonRolloverPreview = null;
  }

  if (seasonRolloverLastResult && seasonRolloverLastResult.front_office_id !== officeId) {
    seasonRolloverLastResult = null;
  }

  if (seasonRolloverLastResult?.status === 'ADVANCED'
      && seasonRolloverLastResult.to_season_id !== currentSeasonId) {
    seasonRolloverLastResult = null;
  }

  if (seasonRolloverLastResult?.status === 'ROLLED_BACK'
      && seasonRolloverLastResult.restored_season_id !== currentSeasonId) {
    seasonRolloverLastResult = null;
  }
}

function seasonRolloverStatusMarkup() {
  const result = seasonRolloverLastResult;
  if (!result) return '';

  if (result.status === 'ROLLED_BACK') {
    return `<div class="season-rollover-notice is-neutral">
      <strong>Season advance undone</strong>
      <span>${escapeHtml(seasonLabel(seasonRolloverNumber(result.restored_start_year)))} is current again. No season, roster, transaction, asset or cap-history rows were deleted.</span>
    </div>`;
  }

  if (result.status === 'ADVANCED') {
    return `<div class="season-rollover-notice is-success">
      <strong>Season advanced</strong>
      <span>${escapeHtml(seasonLabel(seasonRolloverNumber(result.to_start_year)))} is now current. The seven-season horizon now runs through ${escapeHtml(seasonLabel(seasonRolloverNumber(result.horizon_end_start_year)))}.</span>
    </div>`;
  }

  return '';
}

function seasonRolloverRollbackCandidate() {
  const preview = seasonRolloverPreview;
  if (preview?.rollback_available && preview.rollback_id) {
    return {
      rolloverId: preview.rollback_id,
      fromYear: seasonRolloverNumber(preview.rollback_from_start_year),
      toYear: seasonRolloverNumber(preview.current_start_year)
    };
  }

  const result = seasonRolloverLastResult;
  const current = seasonRolloverCurrentSeason();
  if (result?.status === 'ADVANCED' && result.rollover_id && current?.id === result.to_season_id) {
    return {
      rolloverId: result.rollover_id,
      fromYear: seasonRolloverNumber(result.from_start_year),
      toYear: seasonRolloverNumber(result.to_start_year)
    };
  }

  return null;
}

function seasonRolloverReviewMarkup() {
  const preview = seasonRolloverPreview;
  if (!preview) return '';

  const currentYear = seasonRolloverNumber(preview.current_start_year);
  const nextYear = seasonRolloverNumber(preview.next_start_year);
  const horizonYear = seasonRolloverNumber(preview.new_horizon_end_start_year);
  const nextCapValue = seasonRolloverCapInputValue(preview.next_salary_cap);
  const nextExists = Boolean(preview.next_season_exists);
  const horizonExists = Boolean(preview.horizon_season_exists);
  const expiringContracts = seasonRolloverNumber(preview.expiring_contract_count);
  const missingNextSalary = seasonRolloverNumber(preview.missing_next_salary_count);
  const deadCapEnding = seasonRolloverNumber(preview.dead_cap_entries_ending);
  const horizonGaps = seasonRolloverNumber(preview.new_horizon_salary_gap_count);

  return `<div class="season-rollover-review" data-season-rollover-review>
    <div class="season-rollover-review-head">
      <div>
        <span>REVIEW</span>
        <strong>${escapeHtml(seasonLabel(currentYear))} → ${escapeHtml(seasonLabel(nextYear))}</strong>
      </div>
      <span class="season-rollover-readiness">Ready to advance</span>
    </div>

    <div class="season-rollover-review-grid">
      <div class="season-rollover-review-item"><span>New current</span><strong>${escapeHtml(seasonLabel(nextYear))}</strong><small>${nextExists ? 'Season already exists' : 'Season will be created'}</small></div>
      <div class="season-rollover-review-item"><span>New horizon end</span><strong>${escapeHtml(seasonLabel(horizonYear))}</strong><small>${horizonExists ? 'Season already exists' : 'Season will be created'}</small></div>
      <div class="season-rollover-review-item ${expiringContracts ? 'attention' : ''}"><span>Contracts ending now</span><strong>${expiringContracts}</strong><small>Kept for history · review after rollover</small></div>
      <div class="season-rollover-review-item ${missingNextSalary ? 'attention' : ''}"><span>Missing next salary</span><strong>${missingNextSalary}</strong><small>Active cap-counting contracts</small></div>
      <div class="season-rollover-review-item"><span>Dead Cap ending</span><strong>${deadCapEnding}</strong><small>Entries with no later-season amount</small></div>
      <div class="season-rollover-review-item ${horizonGaps ? 'attention' : ''}"><span>New horizon salary gaps</span><strong>${horizonGaps}</strong><small>Contracts reaching ${escapeHtml(seasonLabel(horizonYear))}</small></div>
    </div>

    <label class="season-rollover-cap-field">${escapeHtml(seasonLabel(nextYear))} salary cap
      <input id="seasonRolloverSalaryCap" type="number" min="0" step="1" value="${escapeAttr(nextCapValue)}" data-initial-value="${escapeAttr(nextCapValue)}" placeholder="Not set" />
      <small>Optional. The cap is only changed when this field differs from the saved value.</small>
    </label>

    <div class="season-rollover-protection">
      <strong>Preserved automatically</strong>
      <div class="season-rollover-protection-grid">
        <span>✓ Active / Minors location</span>
        <span>✓ Prospect flags</span>
        <span>✓ Salaries & cap overrides</span>
        <span>✓ Historical seasons</span>
        <span>✓ Transactions & Draft history</span>
        <span>✓ Assets & Dead Cap history</span>
      </div>
      <p>Expiring contracts are flagged, not deleted or automatically changed. The old season remains available as historical data.</p>
    </div>

    <label class="season-rollover-confirm-check">
      <input id="seasonRolloverAcknowledge" type="checkbox" />
      <span>I reviewed the season change and want to make ${escapeHtml(seasonLabel(nextYear))} current.</span>
    </label>

    <div class="season-rollover-confirm-actions">
      <button id="seasonRolloverCancelReviewBtn" class="btn btn-ghost btn-small" type="button">Cancel Review</button>
      <button id="seasonRolloverConfirmBtn" class="btn btn-primary" type="button" disabled>Confirm Season Advance</button>
    </div>
  </div>`;
}

function seasonRolloverRollbackMarkup() {
  const candidate = seasonRolloverRollbackCandidate();
  if (!candidate) return '';

  return `<div class="season-rollover-rollback">
    <div>
      <span>RECOVERY</span>
      <strong>Undo last season advance</strong>
      <p>Restore ${escapeHtml(seasonLabel(candidate.fromYear))} as current. The added future season and all history remain in place.</p>
    </div>
    <button id="seasonRolloverRollbackBtn" class="btn btn-secondary btn-small" type="button" data-rollover-id="${escapeAttr(candidate.rolloverId)}">Undo Advance</button>
  </div>`;
}

function seasonRolloverSettingsMarkup() {
  const current = seasonRolloverCurrentSeason();
  if (!current) return '';

  const nextYear = current.startYear + 1;
  const open = seasonRolloverOpen || Boolean(seasonRolloverPreview) || Boolean(seasonRolloverLastResult);

  return `<details class="settings-disclosure season-rollover-settings" data-settings-section="season-rollover" ${open ? 'open' : ''}>
    <summary>
      <span class="settings-disclosure-title"><strong>Season Management</strong><span>Review and advance the seven-season horizon</span></span>
      <span class="season-rollover-annual-badge">Annual</span>
    </summary>
    <div class="settings-disclosure-body">
      ${seasonRolloverStatusMarkup()}
      <div class="season-rollover-hero">
        <div>
          <span class="season-rollover-kicker">NEXT ROLLOVER</span>
          <strong>${escapeHtml(seasonLabel(current.startYear))} → ${escapeHtml(seasonLabel(nextYear))}</strong>
          <p>Advance one season at a time with a review first. Roster, contracts, historical seasons, transactions, Draft history, assets and Dead Cap history stay intact.</p>
        </div>
        <button id="seasonRolloverReviewBtn" class="btn btn-secondary" type="button" ${seasonRolloverBusy ? 'disabled' : ''}>${seasonRolloverPreview ? 'Refresh Review' : 'Review Season Advance'}</button>
      </div>
      ${seasonRolloverReviewMarkup()}
      ${seasonRolloverRollbackMarkup()}
    </div>
  </details>`;
}

function bindSeasonRolloverSettings() {
  const detail = document.querySelector('[data-settings-section="season-rollover"]');
  if (!detail) return;

  detail.addEventListener('toggle', () => {
    seasonRolloverOpen = detail.open;
  });

  el('seasonRolloverReviewBtn')?.addEventListener('click', reviewSeasonAdvance);
  el('seasonRolloverCancelReviewBtn')?.addEventListener('click', () => {
    seasonRolloverPreview = null;
    seasonRolloverOpen = true;
    renderSettings();
  });

  const acknowledge = el('seasonRolloverAcknowledge');
  const confirmButton = el('seasonRolloverConfirmBtn');
  acknowledge?.addEventListener('change', () => {
    if (confirmButton) confirmButton.disabled = !acknowledge.checked || seasonRolloverBusy;
  });

  confirmButton?.addEventListener('click', confirmSeasonAdvance);
  el('seasonRolloverRollbackBtn')?.addEventListener('click', rollbackSeasonAdvance);
}

function injectSeasonRolloverSettings() {
  if (!state?.frontOffice) return;
  const view = el('settingsView');
  if (!view || view.querySelector('[data-settings-section="season-rollover"]')) return;

  seasonRolloverEnsureFreshState();

  const dataExport = view.querySelector('[data-settings-section="data-export"]');
  const dangerZone = view.querySelector('[data-settings-section="danger-zone"]');
  const insertBefore = dataExport || dangerZone || null;
  const template = document.createElement('template');
  template.innerHTML = seasonRolloverSettingsMarkup().trim();
  const node = template.content.firstElementChild;
  if (!node) return;

  if (insertBefore) insertBefore.parentNode.insertBefore(node, insertBefore);
  else view.querySelector('.settings-accordion')?.appendChild(node);

  const manualSeasonControl = view.querySelector('.settings-current-season-control');
  if (manualSeasonControl) {
    manualSeasonControl.classList.add('season-rollover-manual-override');
    const label = manualSeasonControl.querySelector('label');
    if (label?.firstChild?.nodeType === Node.TEXT_NODE) label.firstChild.textContent = 'Current season override ';
    const helper = manualSeasonControl.querySelector('small');
    if (helper) helper.textContent = 'Manual correction tool. Use Season Management for the normal annual rollover so the change is reviewed and recoverable.';
  }

  bindSeasonRolloverSettings();
}

async function reviewSeasonAdvance() {
  if (seasonRolloverBusy || !state?.frontOffice?.id) return;
  seasonRolloverBusy = true;
  seasonRolloverOpen = true;

  const button = el('seasonRolloverReviewBtn');
  if (button) {
    button.disabled = true;
    button.textContent = 'Reviewing…';
  }

  try {
    const frontOfficeId = state.frontOffice.id;
    const { data, error } = await db.rpc('preview_front_office_season_advance_v1', {
      p_front_office_id: frontOfficeId
    });
    if (error) throw error;

    seasonRolloverPreview = data;
    seasonRolloverLastResult = null;
    renderSettings();
  } catch (error) {
    console.error('Season advance review failed', error);
    alert(error?.message || 'Unable to review the season advance.');
  } finally {
    seasonRolloverBusy = false;
    const currentButton = el('seasonRolloverReviewBtn');
    if (currentButton) {
      currentButton.disabled = false;
      currentButton.textContent = seasonRolloverPreview ? 'Refresh Review' : 'Review Season Advance';
    }
  }
}

async function confirmSeasonAdvance() {
  const preview = seasonRolloverPreview;
  const frontOfficeId = state?.frontOffice?.id;
  const acknowledge = el('seasonRolloverAcknowledge');
  if (seasonRolloverBusy || !preview || !frontOfficeId || !acknowledge?.checked) return;

  const current = seasonRolloverCurrentSeason();
  if (!current || current.id !== preview.current_season_id) {
    seasonRolloverPreview = null;
    alert('The current season changed after this review. Run Review Season Advance again.');
    renderSettings();
    return;
  }

  const nextLabel = seasonLabel(seasonRolloverNumber(preview.next_start_year));
  if (!confirm(`Advance this Front Office to ${nextLabel}?\n\nHistorical seasons and Front Office history will be preserved.`)) return;

  const capInput = el('seasonRolloverSalaryCap');
  const capRaw = capInput?.value.trim() || '';
  const initialRaw = capInput?.dataset.initialValue ?? '';
  const applySalaryCap = capRaw !== initialRaw;
  const capValue = capRaw === '' ? null : nullableNumber(capRaw);

  if (capRaw !== '' && (capValue === null || capValue < 0)) {
    alert('Enter a valid non-negative salary cap or leave the field blank.');
    return;
  }

  seasonRolloverBusy = true;
  const button = el('seasonRolloverConfirmBtn');
  if (button) {
    button.disabled = true;
    button.textContent = 'Advancing…';
  }

  try {
    let result = null;
    const success = await runCloudAction(async () => {
      const { data, error } = await db.rpc('advance_front_office_season_v1', {
        p_front_office_id: frontOfficeId,
        p_expected_current_season_id: preview.current_season_id,
        p_new_current_salary_cap: capValue,
        p_apply_salary_cap: applySalaryCap
      });
      if (error) throw error;
      result = data;
      seasonRolloverLastResult = { ...data, front_office_id: frontOfficeId };
      seasonRolloverPreview = null;
      seasonRolloverOpen = true;
      await loadOffice(frontOfficeId, false);
    });

    if (success && result && state.frontOffice?.currentSeasonId !== result.to_season_id) {
      alert('The rollover completed, but the Front Office did not reload the new current season correctly. Refresh Front Office before making another change.');
    }
  } finally {
    seasonRolloverBusy = false;
    const currentButton = el('seasonRolloverConfirmBtn');
    if (currentButton) {
      currentButton.disabled = !el('seasonRolloverAcknowledge')?.checked;
      currentButton.textContent = 'Confirm Season Advance';
    }
    const reviewButton = el('seasonRolloverReviewBtn');
    if (reviewButton) {
      reviewButton.disabled = false;
      reviewButton.textContent = seasonRolloverPreview ? 'Refresh Review' : 'Review Season Advance';
    }
  }
}

async function rollbackSeasonAdvance() {
  const button = el('seasonRolloverRollbackBtn');
  const rolloverId = button?.dataset.rolloverId;
  const candidate = seasonRolloverRollbackCandidate();
  const frontOfficeId = state?.frontOffice?.id;
  if (seasonRolloverBusy || !rolloverId || !candidate || !frontOfficeId) return;

  const confirmed = confirm(
    `Undo the last season advance and make ${seasonLabel(candidate.fromYear)} current again?\n\n` +
    'This only restores the previous current-season pointer. It does not delete the added future season or revert roster, contract, transaction, asset, Dead Cap, or salary-cap edits made afterward.'
  );
  if (!confirmed) return;

  seasonRolloverBusy = true;
  button.disabled = true;
  button.textContent = 'Undoing…';

  try {
    await runCloudAction(async () => {
      const { data, error } = await db.rpc('rollback_front_office_season_advance_v1', {
        p_front_office_id: frontOfficeId,
        p_rollover_id: rolloverId
      });
      if (error) throw error;

      seasonRolloverPreview = null;
      seasonRolloverLastResult = { ...data, front_office_id: frontOfficeId };
      seasonRolloverOpen = true;
      await loadOffice(frontOfficeId, false);
    });
  } finally {
    seasonRolloverBusy = false;
    const currentButton = el('seasonRolloverRollbackBtn');
    if (currentButton) {
      currentButton.disabled = false;
      currentButton.textContent = 'Undo Advance';
    }
    const reviewButton = el('seasonRolloverReviewBtn');
    if (reviewButton) {
      reviewButton.disabled = false;
      reviewButton.textContent = seasonRolloverPreview ? 'Refresh Review' : 'Review Season Advance';
    }
  }
}

function installSeasonRolloverFeature() {
  if (typeof renderSettings !== 'function') {
    console.error('RosterCap Season Rollover requires js/pages/settings.js to load first.');
    return;
  }

  const originalRenderSettings = renderSettings;
  renderSettings = function() {
    const existing = document.querySelector('[data-settings-section="season-rollover"]');
    if (existing) seasonRolloverOpen = existing.open;

    const result = originalRenderSettings.apply(this, arguments);
    injectSeasonRolloverSettings();
    return result;
  };

  window.__ROSTERCAP_SEASON_ROLLOVER_LOADED__ = true;
}

installSeasonRolloverFeature();
