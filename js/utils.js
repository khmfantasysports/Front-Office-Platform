'use strict';

// Shared formatting, validation and browser utility helpers.

function activity(label) { return { id: uid(), label, at: new Date().toISOString() }; }

function uid() { return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`; }

function seasonLabel(startYear) { if (!startYear) return '—'; return `${startYear}-${String((startYear + 1) % 100).padStart(2,'0')}`; }

function parseSeasonStart(value) { const match = /^(\d{4})-(\d{2})$/.exec(value); if (!match) return null; const start = Number(match[1]); const end = Number(match[2]); return ((start + 1) % 100) === end ? start : null; }

function nullableNumber(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const cleaned = String(value).replace(/[$,\s]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function nullableInteger(value) {
  const n = nullableNumber(value);
  return n === null || !Number.isInteger(n) ? null : n;
}

function normalizeEligibility(value) {
  return String(value || '').toUpperCase().replace(/\s+/g, '').replace(/^,+|,+$/g, '');
}

function normalizeNhlTeam(value) {
  const team = String(value || '').trim().toUpperCase();
  return !team || ['(N/A)','N/A','NA'].includes(team) ? null : team;
}

function todayIsoDate() { return new Date().toISOString().slice(0, 10); }

function formatWholeDollarValue(value) {
  const number = nullableNumber(value);
  return number === null ? '' : `$${Math.round(number).toLocaleString('en-US')}`;
}

function formatWholeDollarInput(input) {
  input.value = formatWholeDollarValue(input.value);
}

function formatMoney(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(abs % 1_000_000 === 0 ? 1 : 2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(abs % 1_000 === 0 ? 0 : 1)}K`;
  return `${sign}$${abs.toLocaleString(undefined,{maximumFractionDigits:0})}`;
}

function formatDateTime(value) { try { return new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(value)); } catch { return value; } }

function normalizeHeader(value) { return String(value).toLowerCase().replace(/[^a-z0-9]/g,''); }

function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c])); }

function escapeAttr(value) { return escapeHtml(value).replace(/`/g,'&#096;'); }

function csvEscape(value) { const s = String(value ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s; }

function safeFileName(value) { return String(value || 'front-office').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''); }

function downloadText(filename, text, type) { const blob = new Blob([text], { type }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); }
