'use strict';

// RosterCap v2.45 — shared application state, auth client, and Team Identity.
function emptyState() {
  return {
    frontOffice: null,
    seasons: [],
    statuses: [],
    players: [],
    adjustments: [],
    depthCharts: {},
    transactions: [],
    transactionItems: [],
    assets: [],
    activity: []
  };
}

const SUPABASE_URL = 'https://gmkmmocunrckiqwwhxhv.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_vU3vgT3e10spDzXPiva_Nw__TJy-HT7';
const GOOGLE_WEB_CLIENT_ID = '417912628397-5754anrl89bgjo27an5ni32lncdd3lm8.apps.googleusercontent.com';

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storageKey: 'rostercap-auth-token'
  }
});

const APP_VERSION = '2.45';
const DEFAULT_STATUSES = [];
const WORKSPACE_RESUME_KEY = 'fantasy-front-office-workspace-v1';
const WORKSPACE_VIEWS = ['overview','roster','farm','assets','cap','transactions','settings'];
let state = emptyState();
let session = null;
let activeView = 'overview';
let editingPlayerId = null;
let editingAssetId = null;
let assetFilter = 'ALL';
let playerFormDirty = false;
let pendingImport = [];
let pendingImportMeta = { type: 'generic', skaters: 0, goalies: 0, minors: 0 };
let frontOfficeList = [];
let rosterMode = 'depth';
let rosterFilters = { status: '', position: '', team: '', expiring: '', missingSalary: false, fantrax: false };
let depthPosition = 'ALL';
let depthEditMode = false;
let depthDraftOrder = [];
let depthSaving = false;
let transactionSummaryTouched = false;
let editingTransactionId = null;
let tradeBuilderSequence = 0;

const el = (id) => document.getElementById(id);
const authGate = el('authGate');
const officePicker = el('officePicker');
const onboarding = el('onboarding');
const workspace = el('workspace');
const playerDialog = el('playerDialog');
const importDialog = el('importDialog');
const transactionDialog = el('transactionDialog');
const assetDialog = el('assetDialog');


// ------------------------------------------------------------
// Team Identity — bundled into core.js to eliminate module-load failures.
// ------------------------------------------------------------
window.__ROSTERCAP_IDENTITY_LOADED__ = true;

// RosterCap V2.40 — Team Identity is bundled into core.js.
// Team accent is decorative. Platform interaction and semantic state colours stay independent.

const TEAM_LOGO_BUCKET = 'front-office-logos';
const DEFAULT_TEAM_ACCENT = '#32ADFF';
const TEAM_ACCENT_PRESETS = [
  '#32ADFF',
  '#2DD4BF',
  '#22C55E',
  '#FACC15',
  '#F97316',
  '#EF4444',
  '#8B5CF6',
  '#EC4899'
];

function normalizeTeamAccent(value) {
  const color = String(value || '').trim().toUpperCase();
  return /^#[0-9A-F]{6}$/.test(color) ? color : DEFAULT_TEAM_ACCENT;
}

function teamInitials(name) {
  const parts = String(name || 'FO').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'FO';
  return parts.slice(0, 3).map((part) => part[0]).join('').toUpperCase();
}

function setTeamAccent(value) {
  const accent = normalizeTeamAccent(value);
  document.documentElement.style.setProperty('--team-accent', accent);
  return accent;
}

function resetTeamIdentityTheme() {
  setTeamAccent(DEFAULT_TEAM_ACCENT);
  document.title = 'RosterCap — Fantasy Front Office';
}

async function signedTeamLogoUrl(path) {
  if (!path) return null;
  try {
    const { data, error } = await db.storage
      .from(TEAM_LOGO_BUCKET)
      .createSignedUrl(path, 60 * 60 * 24 * 7);
    if (error) {
      console.warn('Unable to sign team logo URL', error);
      return null;
    }
    return data?.signedUrl || null;
  } catch (error) {
    console.warn('Unable to sign team logo URL', error);
    return null;
  }
}

async function hydrateFrontOfficeBranding(records) {
  return Promise.all((records || []).map(async (office) => ({
    ...office,
    team_accent_color: normalizeTeamAccent(office.team_accent_color),
    team_logo_url: await signedTeamLogoUrl(office.team_logo_path)
  })));
}

function teamLogoInnerHtml({ url, teamName, alt = '' }) {
  if (url) {
    return `<img src="${escapeAttr(url)}" alt="${escapeAttr(alt || `${teamName || 'Team'} logo`)}" />`;
  }
  return `<span aria-hidden="true">${escapeHtml(teamInitials(teamName))}</span>`;
}

function applyTeamIdentityToShell() {
  if (!state.frontOffice) return resetTeamIdentityTheme();
  const office = state.frontOffice;
  const accent = setTeamAccent(office.teamAccentColor);
  document.title = `${office.teamName} · RosterCap`;

  const logo = el('workspaceTeamLogo');
  if (logo) {
    logo.style.setProperty('--local-team-accent', accent);
    logo.innerHTML = teamLogoInnerHtml({
      url: office.teamLogoUrl,
      teamName: office.teamName,
      alt: `${office.teamName} logo`
    });
    logo.classList.toggle('has-image', Boolean(office.teamLogoUrl));
  }
}


function syncFrontOfficeIdentityCache() {
  if (!state.frontOffice) return;
  const office = frontOfficeList.find((item) => item.front_office_id === state.frontOffice.id);
  if (!office) return;
  office.team_logo_path = state.frontOffice.teamLogoPath || null;
  office.team_logo_url = state.frontOffice.teamLogoUrl || null;
  office.team_accent_color = normalizeTeamAccent(state.frontOffice.teamAccentColor);
}

function setTeamIdentityStatus(message = '', mode = '') {
  const node = el('teamIdentityStatus');
  if (!node) return;
  node.textContent = message;
  node.classList.toggle('is-saving', mode === 'saving');
  node.classList.toggle('is-success', mode === 'success');
  node.classList.toggle('is-error', mode === 'error');
  node.classList.toggle('hidden', !message);
}

function updateTeamIdentityAccentUi(value) {
  const accent = normalizeTeamAccent(value);
  const preview = el('teamIdentityPreview');
  if (preview) preview.style.setProperty('--preview-team-accent', accent);

  document.querySelectorAll('[data-team-accent]').forEach((button) => {
    button.classList.toggle('active', normalizeTeamAccent(button.dataset.teamAccent) === accent);
  });

  const custom = el('customTeamAccent');
  if (custom && custom.value.toUpperCase() !== accent) custom.value = accent;

  const code = el('customTeamAccentCode');
  if (code) code.textContent = accent;
}

function updateTeamIdentityLogoUi(url = null) {
  if (!state.frontOffice) return;
  const preview = el('teamIdentityPreviewLogo');
  if (preview) {
    preview.innerHTML = teamLogoInnerHtml({
      url,
      teamName: state.frontOffice.teamName,
      alt: `${state.frontOffice.teamName} logo preview`
    });
    preview.classList.toggle('has-image', Boolean(url));
  }

  const remove = el('removeTeamLogoBtn');
  if (remove) {
    remove.classList.toggle('hidden', !state.frontOffice.teamLogoPath);
    remove.disabled = !state.frontOffice.teamLogoPath;
  }

  const label = el('teamLogoFileLabel');
  if (label) label.textContent = state.frontOffice.teamLogoPath ? 'Choose replacement' : 'Choose logo';
}

async function currentAuthenticatedUserId() {
  if (session?.user?.id) return session.user.id;
  const { data, error } = await db.auth.getUser();
  if (error) throw error;
  if (!data?.user?.id) throw new Error('Your RosterCap session is not available. Sign in again and retry.');
  return data.user.id;
}

function renderTeamIdentitySettings() {
  const office = state.frontOffice;
  const accent = normalizeTeamAccent(office.teamAccentColor);
  const swatches = TEAM_ACCENT_PRESETS.map((color) => `
    <button
      class="team-accent-swatch ${accent === color ? 'active' : ''}"
      data-team-accent="${color}"
      style="--swatch:${color}"
      type="button"
      aria-label="Use ${color} as team accent"
      title="${color}"
    ><span aria-hidden="true">✓</span></button>`).join('');

  return `<details class="settings-disclosure team-identity-disclosure" open>
    <summary>
      <span class="settings-disclosure-title">
        <strong>Team Identity</strong>
        <span>Logo and accent across your workspace</span>
      </span>
    </summary>
    <div class="settings-disclosure-body">
      <div class="team-identity-layout team-identity-layout-v242">
        <div class="team-identity-preview" id="teamIdentityPreview" style="--preview-team-accent:${accent}">
          <div class="team-identity-preview-logo ${office.teamLogoUrl ? 'has-image' : ''}" id="teamIdentityPreviewLogo">
            ${teamLogoInnerHtml({ url: office.teamLogoUrl, teamName: office.teamName, alt: `${office.teamName} logo preview` })}
          </div>
          <div class="team-identity-preview-copy">
            <span class="team-identity-preview-label">Workspace preview</span>
            <strong>${escapeHtml(office.teamName)}</strong>
            <span>${escapeHtml(office.leagueName)} · ${escapeHtml(office.sport || 'NHL')}</span>
          </div>
        </div>

        <div class="team-identity-control-stack">
          <section class="team-identity-control-card">
            <div class="team-identity-control-head">
              <div>
                <strong>Team logo</strong>
                <p>PNG, JPG or WebP · maximum 2 MB. Square artwork works best.</p>
              </div>
            </div>

            <label class="team-logo-file">
              <span id="teamLogoFileLabel">${office.teamLogoPath ? 'Choose replacement' : 'Choose logo'}</span>
              <input id="teamLogoFile" type="file" accept="image/png,image/jpeg,image/webp" />
            </label>

            <div class="team-logo-actions">
              <button id="uploadTeamLogoBtn" class="btn btn-primary btn-small" type="button" disabled>Save Logo</button>
              <button id="removeTeamLogoBtn" class="btn btn-ghost btn-small ${office.teamLogoPath ? '' : 'hidden'}" type="button" ${office.teamLogoPath ? '' : 'disabled'}>Remove</button>
            </div>
          </section>

          <section class="team-identity-control-card">
            <div class="team-identity-control-head">
              <div>
                <strong>Team accent</strong>
                <p>Used for team trim only. Cap-health and warning colours stay unchanged.</p>
              </div>
            </div>

            <div class="team-accent-row">${swatches}</div>

            <label class="team-custom-accent">
              <span>Custom colour</span>
              <input id="customTeamAccent" type="color" value="${escapeAttr(accent)}" />
              <code id="customTeamAccentCode">${escapeHtml(accent)}</code>
            </label>
          </section>
        </div>
      </div>

      <div id="teamIdentityStatus" class="team-identity-status hidden" role="status" aria-live="polite"></div>
    </div>
  </details>`;
}

function bindTeamIdentitySettings() {
  const input = el('teamLogoFile');
  const label = el('teamLogoFileLabel');
  const upload = el('uploadTeamLogoBtn');

  if (input && label) {
    input.addEventListener('change', () => {
      const file = input.files?.[0] || null;
      label.textContent = file?.name || (state.frontOffice.teamLogoPath ? 'Choose replacement' : 'Choose logo');
      if (upload) upload.disabled = !file;
      setTeamIdentityStatus('');

      if (window.__ROSTERCAP_TEAM_LOGO_PREVIEW_URL__) {
        URL.revokeObjectURL(window.__ROSTERCAP_TEAM_LOGO_PREVIEW_URL__);
        window.__ROSTERCAP_TEAM_LOGO_PREVIEW_URL__ = null;
      }

      if (!file) {
        updateTeamIdentityLogoUi(state.frontOffice.teamLogoUrl);
        return;
      }

      const allowed = new Set(['image/png','image/jpeg','image/webp']);
      if (!allowed.has(file.type)) {
        setTeamIdentityStatus('Choose a PNG, JPG or WebP image.', 'error');
        input.value = '';
        upload.disabled = true;
        updateTeamIdentityLogoUi(state.frontOffice.teamLogoUrl);
        return;
      }

      if (file.size > 2 * 1024 * 1024) {
        setTeamIdentityStatus('Logo must be 2 MB or smaller.', 'error');
        input.value = '';
        upload.disabled = true;
        updateTeamIdentityLogoUi(state.frontOffice.teamLogoUrl);
        return;
      }

      const objectUrl = URL.createObjectURL(file);
      window.__ROSTERCAP_TEAM_LOGO_PREVIEW_URL__ = objectUrl;
      const preview = el('teamIdentityPreviewLogo');
      if (preview) {
        preview.innerHTML = `<img src="${escapeAttr(objectUrl)}" alt="Selected logo preview" />`;
        preview.classList.add('has-image');
      }
    });
  }

  if (upload) upload.addEventListener('click', uploadTeamLogo);

  const remove = el('removeTeamLogoBtn');
  if (remove) remove.addEventListener('click', removeTeamLogo);

  document.querySelectorAll('[data-team-accent]').forEach((button) => {
    button.addEventListener('click', async () => {
      updateTeamIdentityAccentUi(button.dataset.teamAccent);
      await saveTeamAccent(button.dataset.teamAccent);
    });
  });

  const custom = el('customTeamAccent');
  if (custom) {
    custom.addEventListener('input', () => updateTeamIdentityAccentUi(custom.value));
    custom.addEventListener('change', () => saveTeamAccent(custom.value));
  }
}

async function saveTeamAccent(value) {
  const accent = normalizeTeamAccent(value);
  const previousAccent = normalizeTeamAccent(state.frontOffice.teamAccentColor);

  updateTeamIdentityAccentUi(accent);
  setTeamIdentityStatus('Saving accent…', 'saving');

  const success = await runCloudAction(async () => {
    const { error } = await db.from('front_offices')
      .update({ team_accent_color: accent })
      .eq('front_office_id', state.frontOffice.id);
    if (error) throw error;

    state.frontOffice.teamAccentColor = accent;
    syncFrontOfficeIdentityCache();
    setTeamAccent(accent);
    applyTeamIdentityToShell();
    state.activity.unshift(activity('Updated team accent'));
  });

  if (!success) {
    updateTeamIdentityAccentUi(previousAccent);
    setTeamAccent(previousAccent);
    setTeamIdentityStatus('Accent could not be saved.', 'error');
    return;
  }

  updateTeamIdentityAccentUi(accent);
  setTeamIdentityStatus('Accent saved.', 'success');
}

async function uploadTeamLogo() {
  const input = el('teamLogoFile');
  const file = input?.files?.[0];
  const button = el('uploadTeamLogoBtn');

  if (!file) {
    setTeamIdentityStatus('Choose a logo first.', 'error');
    return;
  }

  const allowed = new Set(['image/png','image/jpeg','image/webp']);
  if (!allowed.has(file.type)) {
    setTeamIdentityStatus('Team logos must be PNG, JPG or WebP.', 'error');
    return;
  }
  if (file.size > 2 * 1024 * 1024) {
    setTeamIdentityStatus('Team logo must be 2 MB or smaller.', 'error');
    return;
  }

  const oldPath = state.frontOffice.teamLogoPath || null;

  if (button) {
    button.disabled = true;
    button.textContent = 'Saving…';
  }
  setTeamIdentityStatus('Uploading logo…', 'saving');

  let newPath = null;

  try {
    const userId = await currentAuthenticatedUserId();
    const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    newPath = `${state.frontOffice.id}/${userId}/team-logo-${Date.now()}.${extension}`;

    const success = await runCloudAction(async () => {
      const { error: uploadError } = await db.storage
        .from(TEAM_LOGO_BUCKET)
        .upload(newPath, file, {
          cacheControl: '3600',
          upsert: false,
          contentType: file.type
        });
      if (uploadError) throw uploadError;

      const { error: updateError } = await db.from('front_offices')
        .update({ team_logo_path: newPath })
        .eq('front_office_id', state.frontOffice.id);
      if (updateError) {
        await db.storage.from(TEAM_LOGO_BUCKET).remove([newPath]);
        throw updateError;
      }

      const signedUrl = await signedTeamLogoUrl(newPath);

      state.frontOffice.teamLogoPath = newPath;
      state.frontOffice.teamLogoUrl = signedUrl;
      syncFrontOfficeIdentityCache();
      applyTeamIdentityToShell();
      state.activity.unshift(activity('Updated team logo'));

      if (oldPath && oldPath !== newPath) {
        const { error: removeError } = await db.storage.from(TEAM_LOGO_BUCKET).remove([oldPath]);
        if (removeError) console.warn('Old logo could not be removed', removeError);
      }
    });

    if (!success) {
      setTeamIdentityStatus('Logo could not be saved.', 'error');
      return;
    }

    if (window.__ROSTERCAP_TEAM_LOGO_PREVIEW_URL__) {
      URL.revokeObjectURL(window.__ROSTERCAP_TEAM_LOGO_PREVIEW_URL__);
      window.__ROSTERCAP_TEAM_LOGO_PREVIEW_URL__ = null;
    }

    if (input) input.value = '';
    if (button) button.disabled = true;
    updateTeamIdentityLogoUi(state.frontOffice.teamLogoUrl);
    setTeamIdentityStatus('Logo saved.', 'success');
  } catch (error) {
    console.error('Team logo save failed', error);
    setCloudStatus('Save error', 'error');
    setTeamIdentityStatus(error?.message || 'Logo could not be saved.', 'error');
  } finally {
    if (button) button.textContent = 'Save Logo';
  }
}

async function removeTeamLogo() {
  const oldPath = state.frontOffice.teamLogoPath;
  if (!oldPath) return;
  if (!confirm('Remove this team logo? Team initials will be used instead.')) return;

  const button = el('removeTeamLogoBtn');
  if (button) {
    button.disabled = true;
    button.textContent = 'Removing…';
  }
  setTeamIdentityStatus('Removing logo…', 'saving');

  const success = await runCloudAction(async () => {
    const { error } = await db.from('front_offices')
      .update({ team_logo_path: null })
      .eq('front_office_id', state.frontOffice.id);
    if (error) throw error;

    const { error: removeError } = await db.storage.from(TEAM_LOGO_BUCKET).remove([oldPath]);
    if (removeError) console.warn('Logo object could not be removed', removeError);

    state.frontOffice.teamLogoPath = null;
    state.frontOffice.teamLogoUrl = null;
    syncFrontOfficeIdentityCache();
    applyTeamIdentityToShell();
    state.activity.unshift(activity('Removed team logo'));
  });

  if (!success) {
    if (button) {
      button.disabled = false;
      button.textContent = 'Remove';
    }
    setTeamIdentityStatus('Logo could not be removed.', 'error');
    return;
  }

  const input = el('teamLogoFile');
  if (input) input.value = '';

  if (window.__ROSTERCAP_TEAM_LOGO_PREVIEW_URL__) {
    URL.revokeObjectURL(window.__ROSTERCAP_TEAM_LOGO_PREVIEW_URL__);
    window.__ROSTERCAP_TEAM_LOGO_PREVIEW_URL__ = null;
  }

  updateTeamIdentityLogoUi(null);
  setTeamIdentityStatus('Logo removed. Team initials are now being used.', 'success');
}
