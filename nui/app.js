'use strict';

const app      = document.getElementById('app');
const notifStack = document.getElementById('notif-stack');

(function initWindowControls() {
  const MIN_W = 700, MIN_H = 440;
  const DEFAULT_W = 1040, DEFAULT_H = 650;
  const STORAGE_KEY = 'pulsemdt:window';

  function readSavedWindow() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); }
    catch (_) { return null; }
  }

  function fitRect(rect) {
    const width = Math.min(Math.max(rect.w || DEFAULT_W, MIN_W), window.innerWidth - 16);
    const height = Math.min(Math.max(rect.h || DEFAULT_H, MIN_H), window.innerHeight - 16);
    return {
      w: width,
      h: height,
      x: Math.min(Math.max(Number.isFinite(rect.x) ? rect.x : (window.innerWidth - width) / 2, 8), window.innerWidth - width - 8),
      y: Math.min(Math.max(Number.isFinite(rect.y) ? rect.y : (window.innerHeight - height) / 2, 8), window.innerHeight - height - 8),
    };
  }

  function applyRect(rect) {
    const fitted = fitRect(rect);
    app.style.width = fitted.w + 'px';
    app.style.height = fitted.h + 'px';
    app.style.left = fitted.x + 'px';
    app.style.top = fitted.y + 'px';
  }

  function persistWindow() {
    const rect = app.getBoundingClientRect();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ w: rect.width, h: rect.height, x: rect.left, y: rect.top }));
  }

  const saved = readSavedWindow();
  applyRect(saved || { w: DEFAULT_W, h: DEFAULT_H });

  let drag = null;

  document.querySelectorAll('.resize-handle').forEach(handle => {
    handle.addEventListener('mousedown', function(e) {
      e.preventDefault();
      const rect = app.getBoundingClientRect();
      drag = {
        kind: 'resize',
        handle: handle.dataset.handle,
        startX: e.clientX,
        startY: e.clientY,
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      };
      app.classList.add('resizing');
    });
  });

  document.getElementById('drag-handle').addEventListener('mousedown', function(e) {
    if (e.button !== 0 || e.target.closest('button, input, select, textarea, a')) return;
    e.preventDefault();
    const rect = app.getBoundingClientRect();
    drag = { kind: 'move', startX: e.clientX, startY: e.clientY, left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    app.classList.add('moving');
  });

  document.addEventListener('mousemove', function(e) {
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;

    if (drag.kind === 'move') {
      const left = Math.min(Math.max(drag.left + dx, 8), window.innerWidth - drag.width - 8);
      const top = Math.min(Math.max(drag.top + dy, 8), window.innerHeight - drag.height - 8);
      app.style.left = left + 'px';
      app.style.top = top + 'px';
      return;
    }

    let { left, top, width, height } = drag;

    if (drag.handle.includes('e')) width = drag.width + dx;
    if (drag.handle.includes('s')) height = drag.height + dy;
    if (drag.handle.includes('w')) { width = drag.width - dx; left = drag.left + dx; }
    if (drag.handle.includes('n')) { height = drag.height - dy; top = drag.top + dy; }

    if (width < MIN_W) { if (drag.handle.includes('w')) left -= (MIN_W - width); width = MIN_W; }
    if (height < MIN_H) { if (drag.handle.includes('n')) top -= (MIN_H - height); height = MIN_H; }

    width = Math.min(width, window.innerWidth - 16);
    height = Math.min(height, window.innerHeight - 16);
    left = Math.min(Math.max(left, 8), window.innerWidth - width - 8);
    top = Math.min(Math.max(top, 8), window.innerHeight - height - 8);

    app.style.width = width + 'px';
    app.style.height = height + 'px';
    app.style.left = left + 'px';
    app.style.top = top + 'px';
  });

  document.addEventListener('mouseup', function() {
    if (!drag) return;
    drag = null;
    app.classList.remove('resizing', 'moving');
    persistWindow();
  });

  window.addEventListener('resize', function() {
    const rect = app.getBoundingClientRect();
    applyRect({ w: rect.width, h: rect.height, x: rect.left, y: rect.top });
    persistWindow();
  });

  document.getElementById('reset-window-btn').addEventListener('click', function() {
    localStorage.removeItem(STORAGE_KEY);
    applyRect({ w: DEFAULT_W, h: DEFAULT_H });
  });
})();

let state = {
  open: false,
  onDuty: false,
  dutyPending: false,
  dutyProfilesPending: false,
  dutyProfiles: [],
  shift: null,
  calls: [],
  activePanel: 'civilian',
  serverOnline: true,
  accessLoaded: false,
  access: null,
  characters: [],
  selectedCharacterId: null,
};

const PANEL_JOB_ACCESS = {
  civilian: ['civilian'],
  dispatch: ['dispatch', 'police', 'fire', 'ems'],
  ncic: ['police', 'law'],
  plate: ['police', 'law'],
  warrants: ['police', 'law'],
  reports: ['police', 'law', 'fire', 'ems', 'dispatch'],
  roster: ['police', 'law', 'fire', 'ems', 'dispatch', 'dmv'],
  duty: ['police', 'law', 'fire', 'ems', 'dispatch', 'dmv'],
  codes: ['police', 'law', 'fire', 'ems', 'dispatch', 'dmv'],
};

function canAccessPanel(panel) {
  const requiredJobs = PANEL_JOB_ACCESS[panel] || [];
  const jobs = state.access && state.access.jobs ? state.access.jobs : {};
  return requiredJobs.some(job => jobs[job] === true);
}

function setCadAccess(profile) {
  state.accessLoaded = true;
  state.access = profile && profile.access ? profile.access : null;
  state.characters = Array.isArray(profile && profile.characters) ? profile.characters : [];

  document.querySelectorAll('.nav-btn').forEach(button => {
    button.hidden = !canAccessPanel(button.dataset.panel);
  });

  const civilianHeading = document.querySelector('[data-nav-group="civilian"]');
  const safetyHeading = document.querySelector('[data-nav-group="public-safety"]');
  if (civilianHeading) civilianHeading.hidden = !canAccessPanel('civilian');
  if (safetyHeading) safetyHeading.hidden = !Array.from(document.querySelectorAll('.nav-btn:not([data-panel="civilian"])')).some(button => !button.hidden);

  const badge = document.getElementById('cad-access-badge');
  const allowed = !!(state.access && state.access.isGuildMember);
  badge.className = `cad-access-badge ${allowed ? 'allowed' : 'denied'}`;
  badge.innerHTML = `<span class="dot ${allowed ? 'green' : 'red'}"></span>${allowed ? 'Discord access verified' : 'Access denied'}`;

  renderCivilianCharacters();

  if (!canAccessPanel(state.activePanel)) {
    const firstVisible = document.querySelector('.nav-btn:not([hidden])');
    if (firstVisible) showPanel(firstVisible.dataset.panel);
    else showCadAccessError('Your Discord account is not a member of this community or has no configured CAD access.');
  } else {
    showPanel(state.activePanel);
  }
}

function showCadAccessError(message) {
  state.accessLoaded = true;
  state.access = null;
  document.querySelectorAll('.nav-btn').forEach(button => { button.hidden = true; });
  document.querySelectorAll('[data-nav-group]').forEach(heading => { heading.hidden = true; });
  const badge = document.getElementById('cad-access-badge');
  badge.className = 'cad-access-badge denied';
  badge.innerHTML = '<span class="dot red"></span>Access denied';
  document.getElementById('civilian-record-content').innerHTML = `<div class="empty-state"><strong>CAD access unavailable</strong><span>${escHtml(message)}</span></div>`;
  document.querySelectorAll('.panel').forEach(panel => panel.classList.toggle('active', panel.dataset.panel === 'civilian'));
}

function formatRecordDate(value) {
  if (!value) return 'Not set';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString();
}

function renderCivilianCharacters() {
  const tabs = document.getElementById('civilian-character-tabs');
  if (!canAccessPanel('civilian')) {
    tabs.innerHTML = '';
    return;
  }
  if (!state.characters.length) {
    tabs.innerHTML = '';
    document.getElementById('civilian-record-content').innerHTML = '<div class="empty-state"><strong>No civilian characters</strong><span>Create or select a character through your server character system.</span></div>';
    return;
  }

  if (!state.selectedCharacterId || !state.characters.some(character => character.id === state.selectedCharacterId)) {
    state.selectedCharacterId = state.characters[0].id;
  }

  tabs.innerHTML = state.characters.map(character => `
    <button class="civilian-character-tab ${character.id === state.selectedCharacterId ? 'active' : ''}" type="button" data-character-id="${Number(character.id)}">
      ${escHtml(character.name || `Character ${character.id}`)}
    </button>
  `).join('');
  tabs.querySelectorAll('[data-character-id]').forEach(button => {
    button.addEventListener('click', () => loadCivilianRecord(Number(button.dataset.characterId)));
  });
}

function renderRecordList(items, renderItem, emptyText) {
  if (!items || !items.length) return `<p class="civilian-record-empty">${escHtml(emptyText)}</p>`;
  return `<div class="civilian-record-list">${items.map(renderItem).join('')}</div>`;
}

async function loadCivilianRecord(characterId) {
  if (!characterId || !canAccessPanel('civilian')) return;
  state.selectedCharacterId = characterId;
  document.querySelectorAll('[data-character-id]').forEach(button => button.classList.toggle('active', Number(button.dataset.characterId) === characterId));

  const content = document.getElementById('civilian-record-content');
  content.innerHTML = '<div class="empty-state"><strong>Loading civilian record</strong><span>Retrieving the records owned by this character.</span></div>';
  const result = await post('getCivilianRecord', { charId: characterId });
  if (!result || result.error || !result.character) {
    content.innerHTML = `<div class="empty-state"><strong>Record unavailable</strong><span>${escHtml((result && result.error) || 'The record could not be loaded.')}</span></div>`;
    return;
  }

  const character = result.character;
  const vehicles = result.vehicles || [];
  const licenses = result.licenses || [];
  const firearms = result.firearms || [];
  const fines = result.fines || [];
  const records = result.records || [];

  content.innerHTML = `
    <div class="civilian-summary">
      <div class="civilian-summary-item"><span>Name</span><strong>${escHtml(character.name || 'Unknown')}</strong></div>
      <div class="civilian-summary-item"><span>Date of birth</span><strong>${escHtml(formatRecordDate(character.date_of_birth))}</strong></div>
      <div class="civilian-summary-item"><span>Occupation</span><strong>${escHtml(character.job || 'Unemployed')}</strong></div>
      <div class="civilian-summary-item"><span>License status</span><strong>${escHtml(character.license_status || 'Not set')}</strong></div>
    </div>
    <div class="civilian-record-grid">
      <section class="civilian-record-section"><h3>Registered vehicles (${vehicles.length})</h3>${renderRecordList(vehicles, vehicle => `<div class="civilian-record-row"><span>${escHtml(vehicle.model || 'Unknown vehicle')} &middot; ${escHtml(vehicle.insurance_status || 'uninsured')}</span><span>${escHtml(vehicle.plate || 'NO PLATE')}</span></div>`, 'No vehicles are registered to this character.')}</section>
      <section class="civilian-record-section"><h3>Licenses (${licenses.length})</h3>${renderRecordList(licenses, license => `<div class="civilian-record-row"><span>${escHtml(String(license.type || 'license').replace(/_/g, ' '))}</span><span>${escHtml(license.status || 'unknown')}</span></div>`, 'No licenses are on file.')}</section>
      <section class="civilian-record-section"><h3>Registered firearms (${firearms.length})</h3>${renderRecordList(firearms, firearm => `<div class="civilian-record-row"><span>${escHtml(firearm.model || 'Unknown firearm')}</span><span>${escHtml(firearm.serial || 'NO SERIAL')}</span></div>`, 'No firearms are registered.')}</section>
      <section class="civilian-record-section"><h3>Fines (${fines.length})</h3>${renderRecordList(fines, fine => `<div class="civilian-record-row"><span>${escHtml(fine.description || 'Fine')}</span><span>$${Number(fine.amount || 0).toFixed(2)} &middot; ${escHtml(fine.status || 'unknown')}</span></div>`, 'No fines are on file.')}</section>
      <section class="civilian-record-section"><h3>Record history (${records.length})</h3>${renderRecordList(records, record => `<div class="civilian-record-row"><span>${escHtml(record.details || record.type || 'Record')}</span><span>${escHtml(formatRecordDate(record.timestamp))}</span></div>`, 'No record history is on file.')}</section>
    </div>`;
}

function setServerState(online) {
  state.serverOnline = online !== false;
  let banner = document.getElementById('offline-banner');
  if (!state.serverOnline) {
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'offline-banner';
      banner.textContent = 'Connection lost - showing cached data. New actions will sync after reconnecting.';
      app.appendChild(banner);
    }
    banner.classList.add('show');
  } else if (banner) {
    banner.classList.remove('show');
  }
}

let anprSpeed = null;
let anprDisplayTime = 0;
let anprTimeout = null;
let knownBoloIds = null;

function post(name, data) {
  return fetch(`https://${GetParentResourceName()}/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data || {}),
  }).then(r => r.json()).catch(() => ({}));
}

function notify(message, type) {
  const el = document.createElement('div');
  el.className = `notif ${type || 'info'}`;
  el.textContent = message;
  notifStack.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

function renderDutyRequired(containerId, subject) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = `<div class="empty-state duty-required">
    <strong>Start a shift to access ${escHtml(subject)}</strong>
    <span>Protected CAD data is available while you are on duty.</span>
    <button class="btn btn-primary" type="button" onclick="showPanel('duty')">Open duty status</button>
  </div>`;
}

function showPanel(name) {
  if (state.accessLoaded && !canAccessPanel(name)) return;
  state.activePanel = name;
  document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.dataset.panel === name));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.panel === name));
  if (name === 'civilian') {
    if (state.selectedCharacterId) loadCivilianRecord(state.selectedCharacterId);
  } else if (name === 'dispatch') {
    if (state.onDuty) loadCalls();
    else renderDutyRequired('calls-list', 'live dispatch');
  }
  if (name === 'codes') {
    if (state.onDuty) loadCodes();
    else renderDutyRequired('codes-list', 'the code reference');
  }
  if (name === 'warrants') {
    if (state.onDuty) loadWarrants();
    else renderDutyRequired('warrants-list', 'warrants');
  }
  if (name === 'reports') {
    if (state.onDuty) loadReports();
    else renderDutyRequired('reports-list', 'reports');
  }
  if (name === 'roster') {
    if (state.onDuty) loadRoster();
    else {
      renderDutyRequired('roster-units-list', 'live units');
      renderDutyRequired('roster-shifts-list', 'shift history');
    }
  }
}

function updateDutyBadge() {
  const badge = document.getElementById('duty-badge');
  if (state.onDuty && state.shift) {
    badge.className = 'duty-badge on';
    badge.innerHTML = `<span class="dot green"></span>${escHtml(state.shift.character_name)} - ${escHtml(state.shift.department)}`;
  } else {
    badge.className = 'duty-badge off';
    badge.innerHTML = `<span class="dot grey"></span>Off Duty`;
  }
  updateDutyControls();
}

function updateDutyControls() {
  const onButton = document.getElementById('go-on-duty');
  const offButton = document.getElementById('go-off-duty');
  const department = document.getElementById('shift-dept');
  const role = document.getElementById('shift-role');
  const callsign = document.getElementById('shift-callsign');
  const profile = getSelectedDutyProfile();
  const formLocked = state.onDuty || state.dutyPending || state.dutyProfilesPending;

  onButton.disabled = state.onDuty || state.dutyPending || state.dutyProfilesPending;
  offButton.disabled = !state.onDuty || state.dutyPending;
  onButton.setAttribute('aria-disabled', String(onButton.disabled));
  offButton.setAttribute('aria-disabled', String(offButton.disabled));

  onButton.textContent = state.dutyProfilesPending
    ? 'Loading Roster...'
    : state.dutyPending && !state.onDuty
    ? 'Checking Duty Status...'
    : state.onDuty ? 'On Duty' : 'Go On Duty';
  offButton.textContent = state.dutyPending && state.onDuty
    ? 'Ending Shift...'
    : state.onDuty ? 'End Shift' : 'Already Off Duty';

  department.disabled = formLocked || (!state.onDuty && state.dutyProfiles.length === 1);
  role.disabled = formLocked;
  callsign.disabled = formLocked;
  role.readOnly = Boolean(profile && profile.role);
  callsign.readOnly = Boolean(profile && profile.callsign);
  document.querySelectorAll('.status-btn').forEach(button => {
    button.disabled = !state.onDuty || state.dutyPending;
  });
}

function getSelectedDutyProfile() {
  const department = document.getElementById('shift-dept').value;
  return state.dutyProfiles.find(profile =>
    profile.department === department || profile.department_tag === department
  ) || null;
}

function applyDutyProfile(profile) {
  const note = document.getElementById('duty-profile-note');
  if (!profile) {
    note.hidden = true;
    updateDutyControls();
    return;
  }

  const department = document.getElementById('shift-dept');
  if (![...department.options].some(option => option.value === profile.department)) {
    const option = document.createElement('option');
    option.value = profile.department;
    option.textContent = profile.department_tag
      ? `${profile.department} (${profile.department_tag})`
      : profile.department;
    option.dataset.roster = 'true';
    department.appendChild(option);
  }
  department.value = profile.department;
  document.getElementById('shift-role').value = profile.role || '';
  document.getElementById('shift-callsign').value = profile.callsign || '';

  const details = [profile.role, profile.callsign].filter(Boolean).join(' · ');
  note.textContent = details
    ? `Roster linked: ${details}`
    : 'Roster linked. No rank or callsign is assigned yet.';
  note.hidden = false;
  updateDutyControls();
}

function setDutyProfiles(profiles) {
  state.dutyProfilesPending = false;
  state.dutyProfiles = Array.isArray(profiles) ? profiles : [];

  const department = document.getElementById('shift-dept');
  department.querySelectorAll('option[data-roster="true"]').forEach(option => option.remove());
  for (const profile of state.dutyProfiles) {
    if ([...department.options].some(option => option.value === profile.department)) continue;
    const option = document.createElement('option');
    option.value = profile.department;
    option.textContent = profile.department_tag
      ? `${profile.department} (${profile.department_tag})`
      : profile.department;
    option.dataset.roster = 'true';
    department.appendChild(option);
  }

  const selected = getSelectedDutyProfile() || state.dutyProfiles[0] || null;
  applyDutyProfile(selected);
}

function renderCallsLegacy() {
  const container = document.getElementById('calls-list');
  if (!container) return;
  if (!state.calls.length) {
    container.innerHTML = '<div class="empty-state"><div class="icon">📞</div><div>No active calls</div></div>';
    return;
  }
  const prioClass = { 1: 'badge-danger', 2: 'badge-warning', 3: 'badge-info' };
  container.innerHTML = state.calls.map(c => `
    <div class="card">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px">
        <span class="badge ${prioClass[c.priority] || 'badge-info'}">P${c.priority}</span>
        <strong>${escHtml(c.call_type)}</strong>
        <span style="color:var(--muted);font-size:11px">#${c.id}</span>
      </div>
      <div class="card-sub">📍 ${escHtml(c.location)}</div>
      ${c.description ? `<div style="margin-top:4px;font-size:11px;color:var(--muted)">${escHtml(c.description)}</div>` : ''}
    </div>
  `).join('');
}

function renderCalls() {
  const container = document.getElementById('calls-list');
  if (!container) return;
  if (!state.calls.length) {
    container.innerHTML = '<div class="empty-state"><strong>No active calls</strong><span>New dispatch calls will appear here.</span></div>';
    return;
  }
  const prioClass = { 1: 'badge-danger', 2: 'badge-warning', 3: 'badge-info' };
  container.innerHTML = `<div class="table-wrap"><table class="data-table">
    <thead><tr><th>Priority</th><th>Call</th><th>Location</th><th>Details</th><th>Reference</th></tr></thead>
    <tbody>${state.calls.map(c => `<tr>
      <td><span class="badge ${prioClass[c.priority] || 'badge-info'}">P${c.priority || 3}</span></td>
      <td class="primary-cell">${escHtml(c.call_type || 'Dispatch call')}</td>
      <td>${escHtml(c.location || 'Unknown')}</td>
      <td class="muted-cell">${escHtml(c.description || 'No additional details')}</td>
      <td class="mono-cell">#${escHtml(c.id)}</td>
    </tr>`).join('')}</tbody>
  </table></div>`;
}

async function loadCodes() {
  const container = document.getElementById('codes-list');
  if (container) container.innerHTML = '<div class="loading-state">Loading code reference...</div>';
  const result = await post('getCodes');
  if (result && result.requiresDuty) {
    renderDutyRequired('codes-list', 'the code reference');
    return;
  }
  renderCodes(Array.isArray(result) ? result : []);
}

function renderCodesLegacy(codes) {
  const container = document.getElementById('codes-list');
  if (!container) return;
  if (!codes.length) {
    container.innerHTML = '<div class="empty-state"><div class="icon">&#x1F4F2;</div><div>No codes configured</div></div>';
    return;
  }
  container.innerHTML = codes.map(c => {
    const color = escHtml(c.color || '#06b6d4');
    return `<div class="card" style="display:flex;align-items:flex-start;gap:10px;margin-bottom:6px">
      <span class="badge" style="background:${color}22;color:${color};border-color:${color}55;min-width:56px;justify-content:center;flex-shrink:0">${escHtml(c.code)}</span>
      <div>
        <div style="font-size:12px;font-weight:600">${escHtml(c.title)}</div>
        ${c.description ? `<div style="font-size:11px;color:var(--muted);margin-top:2px">${escHtml(c.description)}</div>` : ''}
      </div>
    </div>`;
  }).join('');
}

function renderCodes(codes) {
  const container = document.getElementById('codes-list');
  if (!container) return;
  if (!codes.length) {
    container.innerHTML = '<div class="empty-state"><strong>No codes configured</strong><span>Codes added by your community will appear here.</span></div>';
    return;
  }
  container.innerHTML = `<div class="table-wrap"><table class="data-table code-table">
    <thead><tr><th>Code</th><th>Meaning</th><th>Notes</th></tr></thead><tbody>${codes.map(c => {
      const color = escHtml(c.color || '#2f9bd6');
      return `<tr><td><span class="badge" style="background:${color}1f;color:${color};border-color:${color}55">${escHtml(c.code)}</span></td>
        <td class="primary-cell">${escHtml(c.title)}</td><td class="muted-cell">${escHtml(c.description || '-')}</td></tr>`;
    }).join('')}</tbody></table></div>`;
}

function showShiftSummaryLegacy(stats) {
  const content = document.getElementById('stats-content');
  if (!content) return;
  content.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px">
      <div class="card" style="text-align:center;margin-bottom:0">
        <div style="font-size:22px;font-weight:700;color:var(--cyan)">${stats.activeCalls || 0}</div>
        <div class="card-sub">Active Calls</div>
      </div>
      <div class="card" style="text-align:center;margin-bottom:0">
        <div style="font-size:22px;font-weight:700;color:var(--success)">${stats.onDuty || 0}</div>
        <div class="card-sub">Officers On Duty</div>
      </div>
      <div class="card" style="text-align:center;margin-bottom:0">
        <div style="font-size:22px;font-weight:700;color:var(--warning)">${stats.activeWarrants || 0}</div>
        <div class="card-sub">Active Warrants</div>
      </div>
      <div class="card" style="text-align:center;margin-bottom:0">
        <div style="font-size:22px;font-weight:700;color:var(--danger)">${stats.activeBolos || 0}</div>
        <div class="card-sub">Active BOLOs</div>
      </div>
    </div>`;
  document.getElementById('stats-modal').style.display = 'flex';
}

function showShiftSummary(stats) {
  const content = document.getElementById('stats-content');
  if (!content) return;
  content.innerHTML = `<dl class="summary-list">
    <div><dt>Active calls</dt><dd>${stats.activeCalls || 0}</dd></div>
    <div><dt>Officers on duty</dt><dd>${stats.onDuty || 0}</dd></div>
    <div><dt>Active warrants</dt><dd>${stats.activeWarrants || 0}</dd></div>
    <div><dt>Active BOLOs</dt><dd>${stats.activeBolos || 0}</dd></div>
  </dl>`;
  document.getElementById('stats-modal').style.display = 'flex';
}

async function loadCalls() {
  const result = await post('getCalls');
  if (result && result.requiresDuty) {
    renderDutyRequired('calls-list', 'live dispatch');
    return;
  }
  if (result && result.offline && !result.cached) {
    state.calls = [];
    const container = document.getElementById('calls-list');
    if (container) container.innerHTML = '<div class="empty-state"><div class="icon">📡</div><div>CAD Offline</div></div>';
    return;
  }
  const calls = Array.isArray(result) ? result : result?.calls;
  state.calls = Array.isArray(calls) ? calls : [];
  renderCalls();
  if (result && result.offline && result.cached) {
    const container = document.getElementById('calls-list');
    if (container) {
      const notice = document.createElement('div');
      notice.className = 'empty-state';
      notice.textContent = 'CAD offline: showing cached calls. Assignments and statuses may be outdated.';
      container.prepend(notice);
    }
  }
}

function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function escJs(str) {
  return String(str || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/\n/g, ' ');
}

function anprShow() { document.getElementById('anpr-overlay').classList.add('visible'); }
function anprHide() { document.getElementById('anpr-overlay').classList.remove('visible'); }

function renderAnprResult(data) {
  document.getElementById('anpr-plate').textContent = data.plate || '';
  document.getElementById('anpr-speed').innerHTML = anprSpeed != null ? `<span>${anprSpeed}</span> MPH` : '';
  document.getElementById('anpr-status-text').textContent = 'Plate Locked';

  const badges = [];
  if (data.offline && !data.cached) {
    badges.push('<span class="badge badge-offline">CAD OFFLINE</span>');
  } else {
    if (data.vehicle && data.vehicle.status === 'stolen') badges.push('<span class="badge badge-danger">STOLEN</span>');
    if (data.warrants && data.warrants.length) badges.push(`<span class="badge badge-danger">${data.warrants.length} WARRANT${data.warrants.length > 1 ? 'S' : ''}</span>`);
    if (data.bolo) badges.push('<span class="badge badge-warning">BOLO</span>');
    if (!badges.length) badges.push('<span class="badge badge-success">CLEAR</span>');
    if (data.cached) badges.push('<span class="badge badge-offline">CACHED</span>');
  }
  document.getElementById('anpr-badges').innerHTML = badges.join('');

  const rows = [];
  if (data.vehicle) {
    rows.push(`<div class="anpr-detail-row">Vehicle: <span>${escHtml(data.vehicle.model)}</span></div>`);
    if (data.vehicle.insurance_status) {
      const insColor = data.vehicle.insurance_status === 'insured' ? 'var(--success)' : 'var(--warning)';
      rows.push(`<div class="anpr-detail-row">Insurance: <span style="color:${insColor}">${escHtml(data.vehicle.insurance_status)}</span></div>`);
    }
  } else {
    rows.push('<div class="anpr-detail-row">Vehicle: <span>No record</span></div>');
  }
  if (data.owner) {
    rows.push(`<div class="anpr-detail-row">Owner: <span>${escHtml(data.owner.name)}</span></div>`);
    const lic = data.owner.license_status || 'unknown';
    const licColor = lic === 'valid' ? 'var(--success)' : 'var(--danger)';
    rows.push(`<div class="anpr-detail-row">License: <span style="color:${licColor}">${escHtml(lic)}</span></div>`);
  }
  if (data.bolo) {
    rows.push(`<div class="anpr-bolo-row">BOLO: ${escHtml(data.bolo.description)}</div>`);
  }
  document.getElementById('anpr-details').innerHTML = rows.join('');
  anprShow();
}

async function doNCIC() {
  if (!state.onDuty) {
    renderDutyRequired('ncic-result', 'person search');
    return;
  }
  const query = document.getElementById('ncic-query').value.trim();
  if (!query) return;
  document.getElementById('ncic-result').innerHTML = '<div style="color:var(--muted);padding:20px;text-align:center">Searching...</div>';
  const result = await post('ncicLookup', { query });
  renderNCICResult(result, 'ncic-result');
}

async function doPlate() {
  if (!state.onDuty) {
    renderDutyRequired('plate-result', 'plate lookup');
    return;
  }
  const plate = document.getElementById('plate-query').value.trim().toUpperCase();
  if (!plate) return;
  document.getElementById('plate-result').innerHTML = '<div style="color:var(--muted);padding:20px;text-align:center">Running plate...</div>';
  const result = await post('plateLookup', { plate });
  renderNCICResult(result, 'plate-result');
}

function renderNCICResult(data, containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (data && data.requiresDuty) {
    renderDutyRequired(containerId, containerId === 'plate-result' ? 'plate lookup' : 'person search');
    return;
  }
  if (data && data.offline && !data.cached) {
    el.innerHTML = '<div style="color:var(--muted);padding:20px;text-align:center">CAD Offline</div>';
    return;
  }
  if (!data || data.error) {
    el.innerHTML = '<div style="color:var(--muted);padding:20px;text-align:center">No results found</div>';
    return;
  }
  let html = '';
  if (data.person) {
    const p = data.person;
    html += `<div class="card"><div class="card-title">${escHtml(p.name)}</div>
      <div class="card-sub">DOB: ${escHtml(p.date_of_birth || 'N/A')} | ${escHtml(p.gender || 'N/A')} | ${escHtml(p.job || 'Unemployed')}</div>
      <div style="margin-top:6px;display:flex;gap:5px;align-items:center">
        <span class="badge ${p.license_status === 'valid' ? 'badge-success' : 'badge-danger'}">License: ${escHtml(p.license_status || 'N/A')}</span>
        ${data.warrants && data.warrants.length ? `<span class="badge badge-danger">${data.warrants.length} Warrant(s)</span>` : ''}
        <button class="btn btn-ghost" style="font-size:11px;padding:3px 8px;margin-left:auto" onclick="openWarrantModal(${p.id}, '${escJs(p.name)}')">+ Warrant</button>
      </div></div>`;
    if (data.records && data.records.length) {
      html += `<div class="card"><div class="card-title">Criminal Records (${data.records.length})</div>` +
        data.records.map(r => `<div style="margin-top:6px;padding-top:6px;border-top:1px solid var(--border)">
          <span class="badge badge-warning">${escHtml(r.type)}</span>
          <div style="margin-top:3px;font-size:11px;color:var(--muted)">${escHtml(r.details)}</div></div>`).join('') + '</div>';
    }
    if (data.vehicles && data.vehicles.length) {
      html += `<div class="card"><div class="card-title">Registered Vehicles</div>` +
        data.vehicles.map(v => `<div style="display:flex;align-items:center;gap:6px;margin-top:5px">
          <span class="badge ${v.status === 'stolen' ? 'badge-danger' : 'badge-success'}">${escHtml(v.status)}</span>
          <span>${escHtml(v.plate)}</span><span style="color:var(--muted)">${escHtml(v.model)}</span></div>`).join('') + '</div>';
    }
  }
  if (data.vehicle) {
    const v = data.vehicle;
    html += `<div class="card"><div class="card-title">🚗 ${escHtml(v.plate)} - ${escHtml(v.model)}</div>
      <div style="display:flex;gap:5px;margin-top:5px;align-items:center">
        <span class="badge ${v.status === 'stolen' ? 'badge-danger' : 'badge-success'}">${escHtml(v.status)}</span>
        ${v.insurance_status ? `<span class="badge ${v.insurance_status === 'insured' ? 'badge-success' : 'badge-warning'}">${escHtml(v.insurance_status)}</span>` : ''}
        ${data.bolo ? `<span class="badge badge-warning">BOLO</span>` : ''}
        ${data.warrants && data.warrants.length ? `<span class="badge badge-danger">${data.warrants.length} Warrant(s)</span>` : ''}
        ${data.owner ? `<button class="btn btn-ghost" style="font-size:11px;padding:3px 8px;margin-left:auto" onclick="openWarrantModal(${data.owner.id}, '${escJs(data.owner.name)}')">+ Warrant</button>` : ''}
      </div>
      ${v.insurance_provider ? `<div class="card-sub" style="margin-top:4px">Insurance: ${escHtml(v.insurance_provider)}</div>` : ''}
      ${data.owner ? `<div class="card-sub" style="margin-top:5px">Owner: ${escHtml(data.owner.name)}</div>` : ''}</div>`;
  }
  el.innerHTML = html || '<div style="color:var(--muted);padding:20px;text-align:center">No results found</div>';
}

async function loadWarrants() {
  const container = document.getElementById('warrants-list');
  if (container) container.innerHTML = '<div style="color:var(--muted);padding:20px;text-align:center">Loading...</div>';
  const result = await post('getWarrants');
  if (result && result.requiresDuty) {
    renderDutyRequired('warrants-list', 'warrants');
    return;
  }
  renderWarrants((result && result.warrants) || []);
}

function renderWarrantsLegacy(warrants) {
  const container = document.getElementById('warrants-list');
  if (!container) return;
  if (!warrants.length) {
    container.innerHTML = '<div class="empty-state"><div class="icon">&#x2696;</div><div>No active warrants</div></div>';
    return;
  }
  container.innerHTML = warrants.map(w => `
    <div class="card">
      <div style="display:flex;align-items:center;justify-content:space-between">
        <span class="card-title">${escHtml(w.character_name)}</span>
        <span class="badge badge-danger">Active</span>
      </div>
      <div class="card-sub" style="margin-top:4px">${escHtml(w.reason)}</div>
      <div style="margin-top:6px;font-size:11px;color:var(--muted)">
        Issued by ${escHtml(w.issued_by_name || 'Unknown')}
        ${w.expires_at ? ` &middot; Expires ${escHtml(new Date(w.expires_at).toLocaleDateString())}` : ' &middot; Never expires'}
      </div>
    </div>
  `).join('');
}

function renderWarrants(warrants) {
  const container = document.getElementById('warrants-list');
  if (!container) return;
  if (!warrants.length) {
    container.innerHTML = '<div class="empty-state"><strong>No active warrants</strong><span>Issue a warrant from a person or plate result.</span></div>';
    return;
  }
  container.innerHTML = `<div class="table-wrap"><table class="data-table">
    <thead><tr><th>Subject</th><th>Reason</th><th>Issued by</th><th>Expiry</th><th>Status</th></tr></thead>
    <tbody>${warrants.map(w => `<tr>
      <td class="primary-cell">${escHtml(w.character_name)}</td>
      <td>${escHtml(w.reason)}</td>
      <td class="muted-cell">${escHtml(w.issued_by_name || 'Unknown')}</td>
      <td class="mono-cell">${w.expires_at ? escHtml(new Date(w.expires_at).toLocaleDateString()) : 'No expiry'}</td>
      <td><span class="badge badge-danger">Active</span></td>
    </tr>`).join('')}</tbody>
  </table></div>`;
}

let pendingWarrant = null;

function openWarrantModal(charId, name) {
  pendingWarrant = { charId, name };
  document.getElementById('warrant-modal-sub').textContent = `Against ${name}`;
  document.getElementById('warrant-reason').value = '';
  document.getElementById('warrant-expires-days').value = '';
  document.getElementById('warrant-modal').style.display = 'flex';
}

function closeWarrantModal() {
  pendingWarrant = null;
  document.getElementById('warrant-modal').style.display = 'none';
}

async function submitWarrant() {
  if (!state.onDuty) {
    notify('Go on duty to issue a warrant', 'warning');
    showPanel('duty');
    return;
  }
  if (!pendingWarrant) return;
  const reason = document.getElementById('warrant-reason').value.trim();
  if (!reason) return;
  const days = parseInt(document.getElementById('warrant-expires-days').value, 10);
  const expiresAt = Number.isFinite(days) && days > 0
    ? new Date(Date.now() + days * 86400000).toISOString()
    : null;

  const result = await post('issueWarrant', {
    charId: pendingWarrant.charId,
    characterName: pendingWarrant.name,
    reason,
    expiresAt,
  });

  if (result && result.ok) {
    notify(`Warrant issued for ${pendingWarrant.name}`, 'success');
    closeWarrantModal();
    if (state.activePanel === 'warrants') loadWarrants();
  } else {
    notify(result && result.offline ? 'CAD offline - could not issue warrant' : 'Failed to issue warrant', 'danger');
  }
}

async function loadReports() {
  const container = document.getElementById('reports-list');
  if (container) container.innerHTML = '<div style="color:var(--muted);padding:20px;text-align:center">Loading...</div>';
  const result = await post('getReports');
  if (result && result.requiresDuty) {
    renderDutyRequired('reports-list', 'reports');
    return;
  }
  renderReports((result && result.reports) || []);
}

function renderReportsLegacy(reports) {
  const container = document.getElementById('reports-list');
  if (!container) return;
  if (!reports.length) {
    container.innerHTML = '<div class="empty-state"><div class="icon">&#x1F4C4;</div><div>No reports filed yet</div></div>';
    return;
  }
  container.innerHTML = reports.map(r => `
    <div class="card">
      <div style="display:flex;align-items:center;justify-content:space-between">
        <span class="card-title">${escHtml(r.incident_type)}</span>
        <span class="badge badge-info">${escHtml(r.dept_name || 'Unknown')}</span>
      </div>
      <div class="card-sub" style="margin-top:4px">&#x1F4CD; ${escHtml(r.location)}${r.units ? ` &middot; Units: ${escHtml(r.units)}` : ''}</div>
      ${r.narrative ? `<div style="margin-top:6px;font-size:11px;color:var(--muted)">${escHtml(r.narrative)}</div>` : ''}
      ${r.disposition ? `<div style="margin-top:6px;font-size:11px"><span class="badge badge-success">${escHtml(r.disposition)}</span></div>` : ''}
    </div>
  `).join('');
}

function renderReports(reports) {
  const container = document.getElementById('reports-list');
  if (!container) return;
  if (!reports.length) {
    container.innerHTML = '<div class="empty-state"><strong>No reports filed</strong><span>Completed incident reports will appear here.</span></div>';
    return;
  }
  container.innerHTML = `<div class="table-wrap"><table class="data-table reports-table">
    <thead><tr><th>Incident</th><th>Location</th><th>Units</th><th>Disposition</th><th>Narrative</th></tr></thead>
    <tbody>${reports.map(r => `<tr>
      <td class="primary-cell">${escHtml(String(r.incident_type || 'Incident').replace(/_/g, ' '))}</td>
      <td>${escHtml(r.location || 'Unknown')}</td>
      <td class="mono-cell">${escHtml(r.units || '-')}</td>
      <td>${r.disposition ? `<span class="badge badge-success">${escHtml(r.disposition)}</span>` : '<span class="muted-cell">Open</span>'}</td>
      <td class="muted-cell narrative-cell">${escHtml(r.narrative || 'No narrative')}</td>
    </tr>`).join('')}</tbody>
  </table></div>`;
}

function toggleNewReportForm() {
  const form = document.getElementById('new-report-form');
  form.style.display = form.style.display === 'none' ? 'block' : 'none';
}

async function submitReport() {
  if (!state.onDuty) {
    notify('Go on duty to file a report', 'warning');
    showPanel('duty');
    return;
  }
  const location = document.getElementById('report-location').value.trim();
  const narrative = document.getElementById('report-narrative').value.trim();
  if (!location || !narrative) { notify('Location and narrative are required', 'warning'); return; }

  const result = await post('submitReport', {
    incidentType: document.getElementById('report-type').value,
    location,
    units: document.getElementById('report-units').value.trim(),
    narrative,
    disposition: document.getElementById('report-disposition').value.trim(),
  });

  if (result && result.ok) {
    notify('Report filed', 'success');
    document.getElementById('report-location').value = '';
    document.getElementById('report-units').value = '';
    document.getElementById('report-narrative').value = '';
    document.getElementById('report-disposition').value = '';
    toggleNewReportForm();
    loadReports();
  } else {
    notify((result && result.error) || (result && result.offline ? 'CAD offline - could not file report' : 'Failed to file report'), 'danger');
  }
}

async function loadRoster() {
  const unitsContainer = document.getElementById('roster-units-list');
  const shiftsContainer = document.getElementById('roster-shifts-list');
  if (unitsContainer) unitsContainer.innerHTML = '<div style="color:var(--muted);padding:20px;text-align:center">Loading...</div>';
  if (shiftsContainer) shiftsContainer.innerHTML = '<div style="color:var(--muted);padding:20px;text-align:center">Loading...</div>';

  const [unitsResult, shiftsResult] = await Promise.all([post('getOnDutyUnits'), post('getShiftHistory')]);
  if ((unitsResult && unitsResult.requiresDuty) || (shiftsResult && shiftsResult.requiresDuty)) {
    renderDutyRequired('roster-units-list', 'live units');
    renderDutyRequired('roster-shifts-list', 'shift history');
    return;
  }
  renderOnDutyUnits((unitsResult && unitsResult.units) || []);
  renderShiftHistory((shiftsResult && shiftsResult.shifts) || []);
}

function renderOnDutyUnitsLegacy(units) {
  const container = document.getElementById('roster-units-list');
  if (!container) return;
  if (!units.length) {
    container.innerHTML = '<div class="empty-state"><div class="icon">&#x1F465;</div><div>No units on duty</div></div>';
    return;
  }
  const statusClass = { available: 's-available', busy: 's-busy', on_scene: 's-busy', unavailable: 's-unavail' };
  container.innerHTML = units.map(u => `
    <div class="card" style="display:flex;align-items:center;gap:8px">
      <span class="status-dot ${statusClass[u.status] || 's-available'}"></span>
      <div style="flex:1;min-width:0">
        <div style="font-weight:600">${escHtml(u.character_name)} ${u.callsign ? `<span style="color:var(--muted);font-weight:400">(${escHtml(u.callsign)})</span>` : ''}</div>
        <div class="card-sub">${escHtml(u.department)} &middot; ${escHtml(u.role)}</div>
      </div>
    </div>
  `).join('');
}

function renderOnDutyUnits(units) {
  const container = document.getElementById('roster-units-list');
  if (!container) return;
  if (!units.length) {
    container.innerHTML = '<div class="empty-state compact"><strong>No units on duty</strong><span>Active officers will appear here.</span></div>';
    return;
  }
  const statusClass = { available: 's-available', busy: 's-busy', on_scene: 's-busy', unavailable: 's-unavail' };
  container.innerHTML = `<div class="table-wrap"><table class="data-table">
    <thead><tr><th>Unit</th><th>Callsign</th><th>Department</th><th>Role</th><th>Status</th></tr></thead>
    <tbody>${units.map(u => `<tr>
      <td class="primary-cell">${escHtml(u.character_name)}</td><td class="mono-cell">${escHtml(u.callsign || '-')}</td>
      <td>${escHtml(u.department || '-')}</td><td class="muted-cell">${escHtml(u.role || '-')}</td>
      <td><span class="status-label"><span class="status-dot ${statusClass[u.status] || 's-available'}"></span>${escHtml(String(u.status || 'available').replace(/_/g, ' '))}</span></td>
    </tr>`).join('')}</tbody></table></div>`;
}

function renderShiftHistoryLegacy(shifts) {
  const container = document.getElementById('roster-shifts-list');
  if (!container) return;
  if (!shifts.length) {
    container.innerHTML = '<div class="empty-state"><div class="icon">&#x23F1;</div><div>No shift history</div></div>';
    return;
  }
  container.innerHTML = shifts.map(s => `
    <div class="card" style="display:flex;align-items:center;justify-content:space-between">
      <div>
        <div style="font-weight:600">${escHtml(s.character_name)} ${s.callsign ? `<span style="color:var(--muted);font-weight:400">(${escHtml(s.callsign)})</span>` : ''}</div>
        <div class="card-sub">${escHtml(s.department)} &middot; ${escHtml(s.role)}</div>
      </div>
      <span class="badge ${s.ended_at ? 'badge-offline' : 'badge-success'}">${s.ended_at ? `${s.duration_minutes || 0}m` : 'Active'}</span>
    </div>
  `).join('');
}

function renderShiftHistory(shifts) {
  const container = document.getElementById('roster-shifts-list');
  if (!container) return;
  if (!shifts.length) {
    container.innerHTML = '<div class="empty-state compact"><strong>No recent shifts</strong><span>Shift history will appear after an officer clocks in.</span></div>';
    return;
  }
  container.innerHTML = `<div class="table-wrap"><table class="data-table">
    <thead><tr><th>Officer</th><th>Callsign</th><th>Assignment</th><th>State</th><th>Duration</th></tr></thead>
    <tbody>${shifts.map(s => `<tr>
      <td class="primary-cell">${escHtml(s.character_name)}</td><td class="mono-cell">${escHtml(s.callsign || '-')}</td>
      <td>${escHtml(s.department || '-')}<span class="cell-detail">${escHtml(s.role || '-')}</span></td>
      <td><span class="badge ${s.ended_at ? 'badge-offline' : 'badge-success'}">${s.ended_at ? 'Ended' : 'Active'}</span></td>
      <td class="mono-cell">${s.ended_at ? `${s.duration_minutes || 0} min` : 'In progress'}</td>
    </tr>`).join('')}</tbody></table></div>`;
}

function toggleReportForm() {
  const form = document.getElementById('report-call-form');
  form.style.display = form.style.display === 'none' ? 'block' : 'none';
}

async function submitCall() {
  if (!state.onDuty) {
    notify('Go on duty to create a dispatch call', 'warning');
    showPanel('duty');
    return;
  }
  const type     = document.getElementById('call-type').value;
  const location = document.getElementById('call-location').value.trim();
  const desc     = document.getElementById('call-description').value.trim();
  const priority = parseInt(document.getElementById('call-priority').value, 10);
  if (!location) { notify('Location is required', 'warning'); return; }
  const result = await post('createCall', { call_type: type, location, description: desc, priority });
  if (result && result.id) {
    document.getElementById('call-location').value = '';
    document.getElementById('call-description').value = '';
    document.getElementById('report-call-form').style.display = 'none';
    await loadCalls();
  } else {
    notify('Failed to submit call', 'danger');
  }
}

async function goOnDuty() {
  if (state.onDuty || state.dutyPending) return;
  const dept    = document.getElementById('shift-dept').value;
  const role    = document.getElementById('shift-role').value.trim();
  const callsign = document.getElementById('shift-callsign').value.trim();
  if (!dept) return;
  state.dutyPending = true;
  updateDutyControls();
  const result = await post('onDuty', { department: dept, role: role || 'Officer', callsign: callsign || null });
  if (result.ok === false) {
    state.dutyPending = false;
    updateDutyControls();
    notify(result.error || 'Unable to start shift', 'danger');
  }
}

async function goOffDuty() {
  if (!state.onDuty || state.dutyPending) return;
  state.dutyPending = true;
  updateDutyControls();
  const result = await post('offDuty', {});
  if (result.ok === false) {
    state.dutyPending = false;
    updateDutyControls();
    notify(result.error || 'Unable to end shift', 'danger');
  }
}

async function updateStatus(status) {
  if (!state.onDuty) return;
  await post('updateStatus', { status });
  state.shift = { ...state.shift, status };
}

async function triggerPanic() {
  if (!state.onDuty) { notify('You must be on duty', 'warning'); return; }
  if (!confirm('Trigger panic button?')) return;
  await post('panic', {});
  notify('PANIC BUTTON TRIGGERED', 'danger');
}

window.addEventListener('message', function(event) {
  const { action, data } = event.data;
  if (!action) return;
  switch (action) {
    case 'open':
      app.classList.add('open');
      state.open = true;
      state.onDuty = data.onDuty === true;
      state.shift = state.onDuty ? data.shift : null;
      state.dutyPending = data.syncingDuty === true;
      state.dutyProfilesPending = data.loadingDutyProfiles === true;
      if (state.dutyProfilesPending) {
        state.dutyProfiles = [];
        document.getElementById('duty-profile-note').hidden = true;
      }
      if (data.accessProfile) setCadAccess(data.accessProfile);
      updateDutyBadge();
      showPanel(state.accessLoaded && canAccessPanel(state.activePanel) ? state.activePanel : 'civilian');
      break;
    case 'close':
      app.classList.remove('open');
      state.open = false;
      break;
    case 'notification':
      notify(data.message, data.type);
      break;
    case 'serverState':
      setServerState(data.online);
      break;
    case 'shiftStarted':
      state.dutyPending = false;
      state.dutyProfilesPending = false;
      state.onDuty = true;
      state.shift = data;
      updateDutyBadge();
      showPanel(canAccessPanel('dispatch') ? 'dispatch' : 'duty');
      break;
    case 'shiftEnded':
      state.dutyPending = false;
      state.dutyProfilesPending = false;
      state.onDuty = false;
      state.shift = null;
      state.calls = [];
      updateDutyBadge();
      showPanel(canAccessPanel('duty') ? 'duty' : 'civilian');
      if (data && data.activeCalls != null) showShiftSummary(data);
      break;
    case 'shiftError':
      state.dutyPending = false;
      updateDutyControls();
      break;
    case 'dutyStateSynced':
      state.dutyPending = false;
      state.onDuty = data.onDuty === true;
      state.shift = state.onDuty ? data.shift : null;
      if (state.onDuty) state.dutyProfilesPending = false;
      updateDutyBadge();
      if (state.onDuty) {
        showPanel(canAccessPanel('dispatch') ? 'dispatch' : 'duty');
      } else {
        showPanel(canAccessPanel('duty') ? 'duty' : 'civilian');
      }
      break;
    case 'dutyProfiles':
      setDutyProfiles(data.profiles);
      break;
    case 'cadAccess':
      setCadAccess(data);
      break;
    case 'cadAccessError':
      showCadAccessError(data.message || 'Your Discord access could not be verified.');
      break;
    case 'newCall':
      state.calls.unshift(data);
      renderCalls();
      break;
    case 'anprScanning':
      if (anprTimeout) { clearTimeout(anprTimeout); anprTimeout = null; }
      anprSpeed = data.speed != null ? data.speed : null;
      anprDisplayTime = data.displayTime || 0;
      document.getElementById('anpr-plate').textContent = data.plate || '';
      document.getElementById('anpr-speed').innerHTML = anprSpeed != null ? `<span>${anprSpeed}</span> MPH` : '';
      document.getElementById('anpr-status-text').textContent = 'Scanning...';
      document.getElementById('anpr-badges').innerHTML = '';
      document.getElementById('anpr-details').innerHTML = '';
      anprShow();
      break;
    case 'anprResult':
      renderAnprResult(data);
      if (anprDisplayTime > 0) {
        if (anprTimeout) clearTimeout(anprTimeout);
        anprTimeout = setTimeout(() => { anprHide(); anprTimeout = null; }, anprDisplayTime * 1000);
      }
      break;
    case 'anprClear':
      if (anprTimeout) { clearTimeout(anprTimeout); anprTimeout = null; }
      anprSpeed = null;
      anprHide();
      break;
    case 'panicAlert':
      notify(`PANIC: ${data.name} at ${data.location}`, 'danger');
      break;
    case 'boloSync': {
      if (!Array.isArray(data)) break;
      const ids = new Set(data.map(b => b.id));
      if (knownBoloIds !== null && state.onDuty) {
        for (const b of data) {
          if (!knownBoloIds.has(b.id)) {
            notify(`NEW BOLO${b.plate ? ` [${b.plate}]` : ''}: ${b.description}`, 'warning');
          }
        }
      }
      knownBoloIds = ids;
      break;
    }
  }
});

document.getElementById('close-btn').addEventListener('click', function() {
  post('close', {});
});

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', function() { showPanel(this.dataset.panel); });
});

document.getElementById('civilian-refresh').addEventListener('click', function() {
  post('refreshCadAccess', {});
});

document.getElementById('go-on-duty').addEventListener('click', goOnDuty);
document.getElementById('go-off-duty').addEventListener('click', goOffDuty);
document.getElementById('shift-dept').addEventListener('change', function() {
  const profile = getSelectedDutyProfile();
  if (profile) applyDutyProfile(profile);
});
document.getElementById('ncic-search').addEventListener('click', doNCIC);
document.getElementById('plate-search').addEventListener('click', doPlate);
document.getElementById('panic-btn').addEventListener('click', triggerPanic);
document.getElementById('ncic-query').addEventListener('keydown', e => { if (e.key === 'Enter') doNCIC(); });
document.getElementById('plate-query').addEventListener('keydown', e => { if (e.key === 'Enter') doPlate(); });

document.querySelectorAll('.status-btn').forEach(btn => {
  btn.addEventListener('click', function() { updateStatus(this.dataset.status); });
});

document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape' && state.open) { post('close', {}); }
});
