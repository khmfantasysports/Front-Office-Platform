'use strict';

// RosterCap v2.37 — shared application state and DOM handles.
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
const GITHUB_PAGES_URL = 'https://khmfantasysports.github.io/Front-Office-Platform/';

// Keep auth redirect ownership in one place.
// Today production is GitHub Pages. Once RosterCap moves to its own domain,
// the browser's current HTTPS origin/path can become the redirect automatically.
const AUTH_REDIRECT_URL = (() => {
  if (window.location.hostname === 'khmfantasysports.github.io') {
    return GITHUB_PAGES_URL;
  }
  if (window.location.protocol === 'https:' || window.location.hostname === 'localhost') {
    return `${window.location.origin}${window.location.pathname}`;
  }
  return GITHUB_PAGES_URL;
})();

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'rostercap-auth-token'
  }
});

const APP_VERSION = '2.37';
const DEFAULT_STATUSES = [];
const WORKSPACE_RESUME_KEY = 'fantasy-front-office-workspace-v1';
const WORKSPACE_VIEWS = ['overview','roster','farm','assets','cap','transactions','settings'];
let state = emptyState();
let session = null;
let authBootstrapResolved = false;
let lastVerifiedAuthUser = null;
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
