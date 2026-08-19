'use strict';

// RosterCap v2.41 — shared application state, auth client, and Team Identity.
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

const APP_VERSION = '2.41';
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
        <span>Logo and one team accent colour</span>
      </span>
    </summary>
    <div class="settings-disclosure-body">
      <div class="team-identity-layout">
        <div class="team-identity-preview" style="--preview-team-accent:${accent}">
          <div class="team-identity-preview-logo ${office.teamLogoUrl ? 'has-image' : ''}" id="teamIdentityPreviewLogo">
            ${teamLogoInnerHtml({ url: office.teamLogoUrl, teamName: office.teamName, alt: `${office.teamName} logo preview` })}
          </div>
          <div class="team-identity-preview-copy">
            <strong>${escapeHtml(office.teamName)}</strong>
            <span>${escapeHtml(office.leagueName)} · ${escapeHtml(office.sport || 'NHL')}</span>
          </div>
        </div>

        <div class="team-logo-controls">
          <div>
            <strong>Team logo</strong>
            <p>PNG, JPG or WebP. Square artwork works best. Maximum 2 MB.</p>
          </div>
          <label class="team-logo-file">
            <span id="teamLogoFileLabel">${office.teamLogoPath ? 'Choose replacement' : 'Choose logo'}</span>
            <input id="teamLogoFile" type="file" accept="image/png,image/jpeg,image/webp" />
          </label>
          <div class="team-logo-actions">
            <button id="uploadTeamLogoBtn" class="btn btn-primary btn-small" type="button">Upload Logo</button>
            ${office.teamLogoPath ? '<button id="removeTeamLogoBtn" class="btn btn-ghost btn-small" type="button">Remove</button>' : ''}
          </div>
        </div>

        <div class="team-accent-controls">
          <div>
            <strong>Team accent</strong>
            <p>Used for team-specific trim and identity. Cap-health colours remain unchanged.</p>
          </div>
          <div class="team-accent-row">${swatches}</div>
          <label class="team-custom-accent">
            Custom
            <input id="customTeamAccent" type="color" value="${escapeAttr(accent)}" />
            <code>${escapeHtml(accent)}</code>
          </label>
        </div>
      </div>
    </div>
  </details>`;
}

function bindTeamIdentitySettings() {
  const input = el('teamLogoFile');
  const label = el('teamLogoFileLabel');
  if (input && label) {
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      label.textContent = file?.name || (state.frontOffice.teamLogoPath ? 'Choose replacement' : 'Choose logo');
      if (!file) return;

      const preview = el('teamIdentityPreviewLogo');
      if (!preview) return;
      const objectUrl = URL.createObjectURL(file);
      preview.innerHTML = `<img src="${escapeAttr(objectUrl)}" alt="Selected logo preview" />`;
      preview.classList.add('has-image');
    });
  }

  if (el('uploadTeamLogoBtn')) {
    el('uploadTeamLogoBtn').addEventListener('click', uploadTeamLogo);
  }
  if (el('removeTeamLogoBtn')) {
    el('removeTeamLogoBtn').addEventListener('click', removeTeamLogo);
  }

  document.querySelectorAll('[data-team-accent]').forEach((button) => {
    button.addEventListener('click', () => saveTeamAccent(button.dataset.teamAccent));
  });

  if (el('customTeamAccent')) {
    el('customTeamAccent').addEventListener('change', () => saveTeamAccent(el('customTeamAccent').value));
  }
}

async function saveTeamAccent(value) {
  const accent = normalizeTeamAccent(value);
  const success = await runCloudAction(async () => {
    const { error } = await db.from('front_offices')
      .update({ team_accent_color: accent })
      .eq('front_office_id', state.frontOffice.id);
    if (error) throw error;
    state.frontOffice.teamAccentColor = accent;
    state.activity.unshift(activity('Updated team accent'));
  });
  if (success) render();
}

async function uploadTeamLogo() {
  const input = el('teamLogoFile');
  const file = input?.files?.[0];
  if (!file) {
    alert('Choose a PNG, JPG or WebP logo first.');
    return;
  }

  const allowed = new Set(['image/png','image/jpeg','image/webp']);
  if (!allowed.has(file.type)) {
    alert('Team logos must be PNG, JPG or WebP.');
    return;
  }
  if (file.size > 2 * 1024 * 1024) {
    alert('Team logo must be 2 MB or smaller.');
    return;
  }

  const oldPath = state.frontOffice.teamLogoPath || null;
  const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${state.frontOffice.id}/${session.user.id}/team-logo-${Date.now()}.${extension}`;
  const button = el('uploadTeamLogoBtn');
  if (button) {
    button.disabled = true;
    button.textContent = 'Uploading…';
  }

  try {
    const success = await runCloudAction(async () => {
      const { error: uploadError } = await db.storage
        .from(TEAM_LOGO_BUCKET)
        .upload(path, file, {
          cacheControl: '3600',
          upsert: false,
          contentType: file.type
        });
      if (uploadError) throw uploadError;

      const { error: updateError } = await db.from('front_offices')
        .update({ team_logo_path: path })
        .eq('front_office_id', state.frontOffice.id);
      if (updateError) {
        await db.storage.from(TEAM_LOGO_BUCKET).remove([path]);
        throw updateError;
      }

      const signedUrl = await signedTeamLogoUrl(path);
      state.frontOffice.teamLogoPath = path;
      state.frontOffice.teamLogoUrl = signedUrl;
      state.activity.unshift(activity('Updated team logo'));

      if (oldPath && oldPath !== path) {
        const { error: removeError } = await db.storage.from(TEAM_LOGO_BUCKET).remove([oldPath]);
        if (removeError) console.warn('Old logo could not be removed', removeError);
      }
    });

    if (success) render();
  } finally {
    if (el('uploadTeamLogoBtn')) {
      el('uploadTeamLogoBtn').disabled = false;
      el('uploadTeamLogoBtn').textContent = 'Upload Logo';
    }
  }
}

async function removeTeamLogo() {
  const oldPath = state.frontOffice.teamLogoPath;
  if (!oldPath) return;
  if (!confirm('Remove this team logo? The initials fallback will be used instead.')) return;

  const success = await runCloudAction(async () => {
    const { error } = await db.from('front_offices')
      .update({ team_logo_path: null })
      .eq('front_office_id', state.frontOffice.id);
    if (error) throw error;

    const { error: removeError } = await db.storage.from(TEAM_LOGO_BUCKET).remove([oldPath]);
    if (removeError) console.warn('Logo object could not be removed', removeError);

    state.frontOffice.teamLogoPath = null;
    state.frontOffice.teamLogoUrl = null;
    state.activity.unshift(activity('Removed team logo'));
  });

  if (success) render();
}
