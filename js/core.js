'use strict';

// Fantasy Front Office v2.27 — shared application state and DOM handles.
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
const SITE_URL = 'https://khmfantasysports.github.io/Front-Office-Platform/';
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

const APP_VERSION = '2.27';
const DEFAULT_STATUSES = [];
let state = emptyState();
let session = null;
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
