'use strict';

// ── GLOBALS ───────────────────────────────────────────────────────────────────
let currentUser = null;
const charts = {};

// Role capability matrix
const ROLE_CAPS = {
  admin:      { canWrite: true,  canGovSubmit: true,  ownOnly: false, nav: ['dashboard','federations','governance','compliance','athletes','fitforlife','reports','settings'], reportKeys: null },
  federation: { canWrite: true,  canGovSubmit: true,  ownOnly: true,  nav: ['dashboard','federations','governance','compliance','athletes','fitforlife','reports'],            reportKeys: ['governance','fitforlife','injury-risk','performance','compliance'] },
  coach:      { canWrite: true,  canGovSubmit: false, ownOnly: true,  nav: ['dashboard','federations','athletes','fitforlife'],                                              reportKeys: [] },
  ministry:   { canWrite: false, canGovSubmit: false, ownOnly: false, nav: ['dashboard','federations','governance','compliance','athletes','fitforlife','reports'],           reportKeys: null },
  donor:      { canWrite: false, canGovSubmit: false, ownOnly: false, nav: ['dashboard','fitforlife','reports'],                                                              reportKeys: ['donor'] },
};
const ROLE_LABELS = { admin:'NOCSL Admin', federation:'Federation Officer', coach:'Head Coach', ministry:'Ministry Official', donor:'Donor / Partner' };
const ROLE_COLORS = { admin:'#1F4E79', federation:'#15803d', coach:'#7e22ce', ministry:'#b45309', donor:'#0f766e' };

function caps() { return ROLE_CAPS[currentUser?.role] || ROLE_CAPS.donor; }
function canWrite() { return caps().canWrite; }
function isOwnFed(fedId) { return !caps().ownOnly || currentUser.federation_id === Number(fedId); }

function destroyCharts() {
  Object.keys(charts).forEach(k => { charts[k].destroy(); delete charts[k]; });
}

async function api(url) {
  const r = await fetch(url);
  if (r.status === 401) { window.location.href = '/login.html'; return null; }
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

function scoreBadge(s) {
  if (s == null) return `<span class="score-badge score-grey"><i class="bi bi-clock"></i>Pending</span>`;
  const cls = s >= 4 ? 'score-green' : s >= 3 ? 'score-amber' : 'score-red';
  const icon = s >= 4 ? 'bi-check-circle-fill' : s >= 3 ? 'bi-exclamation-circle-fill' : 'bi-x-circle-fill';
  return `<span class="score-badge ${cls}"><i class="bi ${icon}"></i>${s.toFixed(1)}</span>`;
}
function scoreColor(s) { return s >= 4 ? '#15803d' : s >= 3 ? '#b45309' : '#b91c1c'; }
function scoreBarColor(s) { return s >= 4 ? '#22c55e' : s >= 3 ? '#f59e0b' : '#ef4444'; }
function initials(name) { return name.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase(); }
function fmtDate(d) { return d ? new Date(d).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}) : '—'; }
function acwrClass(v) { return v > 1.5 ? 'acwr-high' : v > 1.3 ? 'acwr-medium' : 'acwr-ok'; }
function acwrZoneHtml(v) {
  if (v > 1.5) return `<span class="acwr-zone" style="background:#fee2e2;color:#b91c1c">⚠ HIGH RISK</span>`;
  if (v > 1.3) return `<span class="acwr-zone" style="background:#fef3c7;color:#b45309">⚡ CAUTION</span>`;
  return `<span class="acwr-zone" style="background:#dcfce7;color:#15803d">✓ OPTIMAL</span>`;
}
function gradeBadge(g) {
  const map = { A:'grade-a', B:'grade-b', C:'grade-c' };
  return `<span class="grade-badge ${map[g]||'grade-c'}">${g||'C'}</span>`;
}
function compCheck(val, label = '') {
  return val
    ? `<span class="comp-pass" title="${label}"><i class="bi bi-check-circle-fill"></i></span>`
    : `<span class="comp-fail" title="${label}"><i class="bi bi-x-circle-fill"></i></span>`;
}
function fmtLKR(v) {
  if (!v) return '—';
  if (v >= 1000000) return `Rs.${(v/1000000).toFixed(1)}M`;
  if (v >= 1000)    return `Rs.${(v/1000).toFixed(0)}K`;
  return `Rs.${v}`;
}

// ── ROUTING ───────────────────────────────────────────────────────────────────
const routes = {
  '/dashboard':   renderDashboard,
  '/federations': renderFederations,
  '/governance':  renderGovernance,
  '/compliance':  renderCompliance,
  '/athletes':    renderAthletes,
  '/fitforlife':  renderFitForLife,
  '/reports':     renderReports,
  '/settings':    renderSettings,
};

function renderAccessDenied(msg = 'You do not have permission to access this page.') {
  setContent(`
    <div style="display:flex;align-items:center;justify-content:center;height:60vh">
      <div style="text-align:center;max-width:400px">
        <div style="font-size:3rem;margin-bottom:16px">🔒</div>
        <h3 style="color:#1F4E79;margin-bottom:8px">Access Restricted</h3>
        <p class="text-muted">${msg}</p>
        <a href="#/dashboard" class="btn-action" style="display:inline-block;margin-top:20px;text-decoration:none">Back to Dashboard</a>
      </div>
    </div>`);
}

function navigate() {
  destroyCharts();
  const raw = window.location.hash.replace('#','') || '/dashboard';
  const [base, ...parts] = raw.split('/').filter(Boolean);
  const key = '/' + base;
  const c = caps();

  // Access guard for top-level views
  if (base && !c.nav.includes(base) && base !== 'federation' && base !== 'athlete') {
    renderAccessDenied(`The ${base} section is not available for your account role.`);
    return;
  }

  // Federation/coach: redirect /federations list to their own federation detail
  if (base === 'federations' && c.ownOnly && currentUser.federation_id) {
    window.location.hash = `#/federation/${currentUser.federation_id}`;
    return;
  }

  // Detail routes — donors cannot access federation/athlete detail pages
  if (base === 'federation' && parts[0]) {
    if (!c.nav.includes('federations') && !c.nav.includes('federation')) {
      renderAccessDenied('Your account does not have access to federation detail pages.'); return;
    }
    renderFederationDetail(parts[0]); return;
  }
  if (base === 'athlete' && parts[0]) {
    if (!c.nav.includes('athletes')) {
      renderAccessDenied('Your account does not have access to individual athlete profiles.'); return;
    }
    renderAthleteDetail(parts[0]); return;
  }

  const fn = routes[key];
  if (fn) fn();
  else renderDashboard();

  // Highlight active nav
  document.querySelectorAll('.nav-link').forEach(a => {
    a.classList.toggle('active', a.dataset.view === base);
  });
  // Breadcrumb
  const names = { dashboard:'Dashboard', federations:'Federations', governance:'Governance Benchmark', compliance:'Compliance & Gazette', athletes:'Athletes', fitforlife:'Fit for Life', reports:'Reports', settings:'Settings' };
  document.getElementById('breadcrumb').innerHTML = `<li class="breadcrumb-item active">${names[base] || base}</li>`;
}

window.addEventListener('hashchange', navigate);

// ── INIT ──────────────────────────────────────────────────────────────────────
(async () => {
  currentUser = await api('/api/auth/me');
  if (!currentUser) return;

  const c = caps();
  const roleColor = ROLE_COLORS[currentUser.role] || '#64748b';

  document.getElementById('sidebarName').textContent = currentUser.name;
  // Role badge with color
  document.getElementById('sidebarRole').innerHTML =
    `<span style="background:${roleColor}22;color:${roleColor};padding:2px 8px;border-radius:10px;font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.4px">${ROLE_LABELS[currentUser.role] || currentUser.role}</span>`;
  document.getElementById('sidebarInitials').textContent = currentUser.initials || initials(currentUser.name);
  document.getElementById('topbarInitials').textContent = currentUser.initials || initials(currentUser.name);
  document.getElementById('topbarDate').textContent = new Date().toLocaleDateString('en-GB',{weekday:'short',day:'2-digit',month:'short',year:'numeric'});

  // Hide nav items not available for this role
  document.querySelectorAll('.nav-link[data-view]').forEach(a => {
    const li = a.closest('li');
    if (!c.nav.includes(a.dataset.view)) li.style.display = 'none';
  });

  // If federation user, show their federation name as a subtitle under the user name
  if (currentUser.federation_name) {
    const nameEl = document.getElementById('sidebarName');
    nameEl.title = currentUser.federation_name;
  }

  document.getElementById('logoutBtn').addEventListener('click', async e => {
    e.preventDefault();
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login.html';
  });

  document.getElementById('sidebarToggle')?.addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('overlay').classList.toggle('d-none');
  });
  document.getElementById('overlay')?.addEventListener('click', () => {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('overlay').classList.add('d-none');
  });

  navigate();
})();

// ── HELPERS ───────────────────────────────────────────────────────────────────
function setContent(html) { document.getElementById('content').innerHTML = html; }
function loading() { setContent(`<div class="loading-state"><div class="spinner-border text-primary"></div><span>Loading…</span></div>`); }

// ── MODAL ─────────────────────────────────────────────────────────────────────
function showModal(title, bodyHtml, onSubmit, submitLabel = 'Save') {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = bodyHtml;
  document.getElementById('modalSubmitBtn').textContent = submitLabel;
  document.getElementById('modalOverlay').classList.remove('d-none');
  document.getElementById('modalForm').onsubmit = async (e) => {
    e.preventDefault();
    const btn = document.getElementById('modalSubmitBtn');
    const orig = btn.textContent;
    btn.disabled = true; btn.textContent = 'Saving…';
    try { await onSubmit(new FormData(e.target)); }
    catch (err) { showToast(err.message || 'Error saving. Please try again.', 'error'); }
    finally { btn.disabled = false; btn.textContent = orig; }
  };
}
function closeModal() { document.getElementById('modalOverlay').classList.add('d-none'); }

function showToast(msg, type = 'success') {
  const t = document.createElement('div');
  t.className = `toast-msg toast-${type}`;
  const icon = type === 'error' ? 'bi-x-circle-fill' : type === 'info' ? 'bi-info-circle-fill' : 'bi-check-circle-fill';
  t.innerHTML = `<i class="bi ${icon}"></i>${msg}`;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3800);
}

async function postApi(url, body) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || 'Server error');
  return data;
}
async function putApi(url, body) {
  const r = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || 'Server error');
  return data;
}
function fdToObj(fd) { const o = {}; fd.forEach((v, k) => o[k] = v); return o; }
function fmtInput(label, inputHtml) {
  return `<div class="mb-3"><label class="form-label">${label}</label>${inputHtml}</div>`;
}

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
async function renderDashboard() {
  loading();
  const d = await api('/api/dashboard');
  if (!d) return;

  setContent(`
    <div class="page-header">
      <div>
        <h1 class="page-title">Dashboard</h1>
        <p class="page-subtitle">National overview — Sri Lanka Sports Intelligence Ecosystem</p>
      </div>
    </div>

    <!-- KPIs -->
    <div class="row g-3 mb-4">
      <div class="col-6 col-md-3">
        <div class="kpi-card">
          <div class="kpi-icon blue"><i class="bi bi-building"></i></div>
          <div>
            <div class="kpi-val">${d.totalFeds}</div>
            <div class="kpi-label">Member Federations</div>
          </div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="kpi-card">
          <div class="kpi-icon green"><i class="bi bi-clipboard2-check-fill"></i></div>
          <div>
            <div class="kpi-val">${d.submitted}<span style="font-size:1rem;font-weight:500;color:#64748b">/${d.totalFeds}</span></div>
            <div class="kpi-label">Governance Reports 2025</div>
            <div class="kpi-trend up"><i class="bi bi-arrow-up-short"></i>${d.pending} pending</div>
          </div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="kpi-card">
          <div class="kpi-icon amber"><i class="bi bi-star-half"></i></div>
          <div>
            <div class="kpi-val">${d.avgScore}</div>
            <div class="kpi-label">Avg Governance Score</div>
            <div class="kpi-trend up">out of 5.0</div>
          </div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="kpi-card">
          <div class="kpi-icon purple"><i class="bi bi-people-fill"></i></div>
          <div>
            <div class="kpi-val">${(d.totalAthletes/1000).toFixed(1)}k</div>
            <div class="kpi-label">Registered Athletes</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Traffic lights + trend + top feds -->
    <div class="row g-3 mb-4">
      <div class="col-md-3">
        <div class="panel h-100">
          <div class="panel-header"><span class="panel-title">Score Distribution</span></div>
          <div class="panel-body">
            <canvas id="distChart" height="200"></canvas>
            <div class="mt-3">
              <div class="d-flex justify-content-between mb-1"><span class="score-badge score-green"><i class="bi bi-check-circle-fill"></i>Green ≥4.0</span><strong>${d.dist.green}</strong></div>
              <div class="d-flex justify-content-between mb-1"><span class="score-badge score-amber"><i class="bi bi-exclamation-circle-fill"></i>Amber 3–4</span><strong>${d.dist.amber}</strong></div>
              <div class="d-flex justify-content-between mb-1"><span class="score-badge score-red"><i class="bi bi-x-circle-fill"></i>Red &lt;3.0</span><strong>${d.dist.red}</strong></div>
              <div class="d-flex justify-content-between"><span class="score-badge score-grey"><i class="bi bi-clock"></i>Pending</span><strong>${d.pending}</strong></div>
            </div>
          </div>
        </div>
      </div>
      <div class="col-md-5">
        <div class="panel h-100">
          <div class="panel-header"><span class="panel-title">Top 10 Federations by Score (2025)</span></div>
          <div class="panel-body" style="padding:12px">
            <canvas id="topFedsChart" height="260"></canvas>
          </div>
        </div>
      </div>
      <div class="col-md-4">
        <div class="panel h-100">
          <div class="panel-header"><span class="panel-title">Governance Score Trend</span></div>
          <div class="panel-body" style="padding:12px">
            <canvas id="trendChart" height="140"></canvas>
            <div class="mt-3">
              <p class="text-muted" style="font-size:.8rem">Year-on-year improvement in average governance scores across all submitted federations.</p>
            </div>
            <div class="panel-header mt-2 px-0" style="border:none;padding-bottom:8px"><span class="panel-title" style="font-size:.85rem">Athletes by Province</span></div>
            <canvas id="provinceChart" height="120"></canvas>
          </div>
        </div>
      </div>
    </div>

    <!-- Recent submissions -->
    <div class="panel">
      <div class="panel-header">
        <span class="panel-title">Recent Governance Submissions (2025)</span>
        <a href="#/governance" class="btn btn-sm" style="font-size:.8rem;color:var(--accent)">View all <i class="bi bi-arrow-right"></i></a>
      </div>
      <div style="overflow-x:auto">
        <table class="data-table">
          <thead><tr>
            <th>Federation</th><th>Sport</th><th>Score</th><th>Submitted</th>
          </tr></thead>
          <tbody>
            ${d.recent.map(r => `<tr>
              <td><strong>${r.name}</strong></td>
              <td><span class="province-pill">${r.sport}</span></td>
              <td>${scoreBadge(r.total_score)}</td>
              <td class="text-muted">${fmtDate(r.submitted_at)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `);

  // Donut chart
  charts.dist = new Chart(document.getElementById('distChart'), {
    type: 'doughnut',
    data: {
      labels: ['Green', 'Amber', 'Red', 'Pending'],
      datasets: [{ data: [d.dist.green, d.dist.amber, d.dist.red, d.pending],
        backgroundColor: ['#22c55e','#f59e0b','#ef4444','#cbd5e1'],
        borderWidth: 0, hoverOffset: 6 }]
    },
    options: { plugins: { legend: { display: false } }, cutout: '65%', responsive: true }
  });

  // Top federations horizontal bar
  charts.topFeds = new Chart(document.getElementById('topFedsChart'), {
    type: 'bar',
    data: {
      labels: d.topFeds.map(f => f.name.replace('Sri Lanka ','SL ').replace(' Federation','').replace(' Association','')),
      datasets: [{ data: d.topFeds.map(f => f.total_score),
        backgroundColor: d.topFeds.map(f => f.total_score >= 4 ? '#22c55e' : f.total_score >= 3 ? '#f59e0b' : '#ef4444'),
        borderRadius: 6, barThickness: 16 }]
    },
    options: {
      indexAxis: 'y',
      plugins: { legend: { display: false } },
      scales: {
        x: { min: 0, max: 5, ticks: { font: { size: 10 } }, grid: { color: '#f1f5f9' } },
        y: { ticks: { font: { size: 10 } } }
      },
      responsive: true
    }
  });

  // Trend line
  charts.trend = new Chart(document.getElementById('trendChart'), {
    type: 'line',
    data: {
      labels: d.trend.map(t => t.year),
      datasets: [{ label: 'Avg Score', data: d.trend.map(t => t.avg),
        borderColor: '#2E75B6', backgroundColor: 'rgba(46,117,182,.1)',
        borderWidth: 2.5, pointRadius: 5, fill: true, tension: .3 }]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        y: { min: 2.5, max: 5, ticks: { font: { size: 10 } }, grid: { color: '#f1f5f9' } },
        x: { ticks: { font: { size: 10 } } }
      },
      responsive: true
    }
  });

  // Province chart
  charts.province = new Chart(document.getElementById('provinceChart'), {
    type: 'bar',
    data: {
      labels: d.provinceStats.map(p => p.province || 'Other'),
      datasets: [{ data: d.provinceStats.map(p => p.c),
        backgroundColor: '#3b82f6', borderRadius: 4, barThickness: 14 }]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { font: { size: 9 }, maxRotation: 30 } },
        y: { ticks: { font: { size: 9 } }, grid: { color: '#f1f5f9' } }
      }, responsive: true
    }
  });
}

// ── FEDERATIONS ───────────────────────────────────────────────────────────────
async function renderFederations() {
  loading();
  const rows = await api('/api/federations');
  if (!rows) return;

  setContent(`
    <div class="page-header">
      <div>
        <h1 class="page-title">Member Federations</h1>
        <p class="page-subtitle">All 34 sports federations affiliated to NOCSL</p>
      </div>
      <div class="d-flex gap-2 flex-wrap align-items-center">
        ${caps().canGovSubmit ? `<button class="btn-action" onclick="openGovernanceForm()"><i class="bi bi-clipboard2-check"></i> Submit Scores</button>` : ''}
        ${canWrite() ? `<button class="btn-action" onclick="openAthleteForm()"><i class="bi bi-person-plus"></i> Register Athlete</button>` : ''}
        <div class="search-box"><i class="bi bi-search"></i><input id="fedSearch" placeholder="Search federations…"></div>
        <select class="filter-select" id="fedFilter">
          <option value="">All Scores</option>
          <option value="green">Green (≥4.0)</option>
          <option value="amber">Amber (3–4)</option>
          <option value="red">Red (&lt;3.0)</option>
          <option value="pending">Pending</option>
        </select>
      </div>
    </div>
    <div class="panel">
      <div style="overflow-x:auto">
        <table class="data-table" id="fedTable">
          <thead><tr>
            <th>#</th><th>Federation</th><th>Sport</th><th>Province</th>
            <th>Members</th><th>Athletes</th><th>Score 2025</th><th>Actions</th>
          </tr></thead>
          <tbody id="fedTbody">
            ${rows.map((f,i) => `
              <tr data-id="${f.id}" data-score="${f.total_score ?? ''}" onclick="window.location.hash='#/federation/${f.id}'">
                <td class="text-muted">${i+1}</td>
                <td>
                  <div class="d-flex align-items-center gap-2">
                    <div style="width:10px;height:10px;border-radius:50%;background:${f.color};flex-shrink:0"></div>
                    <strong>${f.name}</strong>
                  </div>
                </td>
                <td>${f.sport}</td>
                <td><span class="province-pill">${f.province || '—'}</span></td>
                <td>${f.total_members?.toLocaleString()}</td>
                <td>${f.athletes_count?.toLocaleString()}</td>
                <td>${scoreBadge(f.total_score)}</td>
                <td><button class="btn btn-sm" style="font-size:.78rem;color:var(--accent);border:1px solid #e2e8f0;border-radius:6px;padding:3px 10px" onclick="event.stopPropagation();window.location.hash='#/federation/${f.id}'">View <i class="bi bi-arrow-right"></i></button></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `);

  // Search / filter
  function filterTable() {
    const q = document.getElementById('fedSearch').value.toLowerCase();
    const f = document.getElementById('fedFilter').value;
    document.querySelectorAll('#fedTbody tr').forEach(tr => {
      const name = tr.querySelector('strong')?.textContent.toLowerCase() || '';
      const scoreRaw = tr.dataset.score;
      const score = scoreRaw ? parseFloat(scoreRaw) : null;
      let scoreMatch = true;
      if (f === 'green')   scoreMatch = score !== null && score >= 4;
      if (f === 'amber')   scoreMatch = score !== null && score >= 3 && score < 4;
      if (f === 'red')     scoreMatch = score !== null && score < 3;
      if (f === 'pending') scoreMatch = score === null;
      tr.style.display = name.includes(q) && scoreMatch ? '' : 'none';
    });
  }
  document.getElementById('fedSearch').addEventListener('input', filterTable);
  document.getElementById('fedFilter').addEventListener('change', filterTable);
}

// ── FEDERATION DETAIL ──────────────────────────────────────────────────────────
async function renderFederationDetail(id) {
  loading();
  const [f, ecOfficers] = await Promise.all([
    api(`/api/federations/${id}`),
    api(`/api/federations/${id}/ec-officers`),
  ]);
  if (!f) return;

  document.getElementById('breadcrumb').innerHTML = `
    <li class="breadcrumb-item"><a href="#/federations" style="color:var(--accent)">Federations</a></li>
    <li class="breadcrumb-item active">${f.name}</li>`;

  window._currentFedId = f.id;
  const score2025 = f.scores.find(s => s.year === 2025);
  const score2024 = f.scores.find(s => s.year === 2024);

  // Gazette-derived grade & compliance
  const grade = (clubs, turnover) => clubs >= 25 && turnover >= 50000000 ? 'A' : clubs >= 15 && turnover >= 10000000 ? 'B' : 'C';
  const fedGradeVal = grade(f.affiliated_clubs || 0, f.annual_turnover || 0);
  const YEAR = 2025;
  const femaleEc = (ecOfficers || []).filter(o => o.gender === 'F' && !o.is_disqualified && o.status === 'active').length;
  const agmOk    = !!(f.agm_last_date     && new Date(f.agm_last_date).getFullYear()     >= YEAR);
  const finOk    = !!(f.financial_stmt_date && new Date(f.financial_stmt_date).getFullYear() >= YEAR);
  const stratOk  = !!(f.strategic_plan_year && f.strategic_plan_year >= YEAR - 1);
  const genderOk = femaleEc >= 2;
  const champOk  = !!f.national_championship_date;
  const compPass = [agmOk, finOk, stratOk, genderOk, champOk].filter(Boolean).length;
  const dims = [
    ['Board Composition & Independence', 'board_composition'],
    ['Director Skills & Tenure',         'director_skills'],
    ['Strategic Planning',               'strategic_planning'],
    ['Financial Transparency',           'financial_transparency'],
    ['Integrity & Risk Management',      'integrity_risk'],
    ['Stakeholder Engagement',           'stakeholder_engagement'],
    ['Regulatory Compliance',            'regulatory_compliance'],
    ['Organisational Culture',           'culture_score'],
  ];

  setContent(`
    <button class="btn-back" onclick="window.location.hash='#/federations'">
      <i class="bi bi-arrow-left"></i> Back to Federations
    </button>

    ${(canWrite() || caps().canGovSubmit) && isOwnFed(f.id) ? `
    <div class="action-row">
      ${caps().canGovSubmit && isOwnFed(f.id) ? `<button class="btn-action" onclick="openGovernanceForm(window._currentFedId)"><i class="bi bi-clipboard2-check"></i> Submit Governance Scores</button>` : ''}
      ${canWrite() && isOwnFed(f.id) ? `<button class="btn-action" onclick="openAthleteForm(window._currentFedId)"><i class="bi bi-person-plus"></i> Register Athlete</button>` : ''}
      ${canWrite() && currentUser.role !== 'coach' && isOwnFed(f.id) ? `<button class="btn-action btn-sm-action" style="background:none;border:1px solid #e2e8f0;color:#374151;" onclick="openEditFedForm(window._currentFedId)"><i class="bi bi-pencil"></i> Edit Details</button>` : ''}
    </div>` : `<div class="action-row"><span class="score-badge score-grey"><i class="bi bi-eye"></i> View-only access</span></div>`}

    <div class="fed-header" style="background:linear-gradient(135deg,${f.color},${f.color}bb)">
      <div class="fed-logo"><i class="bi bi-trophy-fill"></i></div>
      <div style="flex:1">
        <div class="fed-name">${f.name}</div>
        <div class="fed-meta">${f.sport} · Est. ${f.established_year} · ${f.province}</div>
        <div class="mt-2 d-flex align-items-center gap-2 flex-wrap">
          ${gradeBadge(fedGradeVal)}
          <span style="color:rgba(255,255,255,.65);font-size:.72rem">${f.affiliated_clubs ? f.affiliated_clubs+' clubs' : ''} ${f.annual_turnover ? '· '+fmtLKR(f.annual_turnover) : ''}</span>
          <span style="color:rgba(255,255,255,.65);font-size:.72rem">· Compliance ${compPass}/5</span>
        </div>
      </div>
      <div class="text-end">
        ${score2025 ? scoreBadge(score2025.total_score) : scoreBadge(null)}
        <div style="color:rgba(255,255,255,.7);font-size:.75rem;margin-top:4px">2025 Overall Score</div>
      </div>
    </div>

    <div class="row g-3 mb-3">
      <div class="col-6 col-md-3"><div class="stat-mini"><div class="stat-mini-val">${f.total_members?.toLocaleString()}</div><div class="stat-mini-label">Total Members</div></div></div>
      <div class="col-6 col-md-3"><div class="stat-mini"><div class="stat-mini-val">${f.athletes_count}</div><div class="stat-mini-label">Registered Athletes</div></div></div>
      <div class="col-6 col-md-3"><div class="stat-mini"><div class="stat-mini-val">${f.president?.split(' ')[1] || f.president}</div><div class="stat-mini-label">President</div></div></div>
      <div class="col-6 col-md-3"><div class="stat-mini"><div class="stat-mini-val">${f.athletes.length}</div><div class="stat-mini-label">Athletes Tracked</div></div></div>
    </div>

    <div class="row g-3 mb-3">
      <div class="col-md-5">
        <div class="panel h-100">
          <div class="panel-header"><span class="panel-title">Governance Dimensions (2025)</span></div>
          <div class="panel-body">
            ${score2025 ? dims.map(([label, key]) => `
              <div class="dim-row">
                <div class="dim-label">${label}</div>
                <div class="score-bar-wrap" style="flex:1">
                  <div class="score-bar"><div class="score-bar-fill" style="width:${(score2025[key]/5)*100}%;background:${scoreBarColor(score2025[key])}"></div></div>
                </div>
                <div class="dim-score" style="color:${scoreColor(score2025[key])}">${score2025[key].toFixed(1)}</div>
              </div>`).join('') : '<div class="empty-state"><i class="bi bi-clock"></i><p>Governance data not yet submitted for 2025.</p></div>'}
          </div>
        </div>
      </div>
      <div class="col-md-4">
        <div class="panel h-100">
          <div class="panel-header"><span class="panel-title">Radar View</span></div>
          <div class="panel-body" style="padding:12px">
            <canvas id="radarChart" height="240"></canvas>
          </div>
        </div>
      </div>
      <div class="col-md-3">
        <div class="panel h-100">
          <div class="panel-header"><span class="panel-title">Year Comparison</span></div>
          <div class="panel-body">
            ${f.scores.length ? f.scores.map(s => `
              <div class="d-flex justify-content-between align-items-center mb-3">
                <div>
                  <div class="fw-bold">${s.year}</div>
                  <div class="text-muted" style="font-size:.75rem">${fmtDate(s.submitted_at)}</div>
                </div>
                ${scoreBadge(s.total_score)}
              </div>`).join('') : '<p class="text-muted">No historical data.</p>'}
            ${score2025 && score2024 ? `
              <hr>
              <div class="text-center">
                <div style="font-size:1.4rem;font-weight:800;color:${score2025.total_score > score2024.total_score ? '#15803d' : '#b91c1c'}">
                  ${score2025.total_score > score2024.total_score ? '▲' : '▼'}
                  ${Math.abs(score2025.total_score - score2024.total_score).toFixed(2)}
                </div>
                <div class="text-muted" style="font-size:.75rem">YoY Change</div>
              </div>` : ''}
          </div>
        </div>
      </div>
    </div>

    <!-- Athletes -->
    <div class="panel">
      <div class="panel-header">
        <span class="panel-title">Athletes (${f.athletes.length})</span>
        <div class="d-flex gap-2 align-items-center">
          ${canWrite() && isOwnFed(f.id) ? `<button class="btn-action btn-sm-action" onclick="openAthleteForm(window._currentFedId)"><i class="bi bi-person-plus"></i> Add</button>` : ''}
          ${currentUser.role === 'admin' || currentUser.role === 'ministry' ? `<a href="#/athletes" class="btn btn-sm" style="font-size:.78rem;color:var(--accent)">View all athletes</a>` : ''}
        </div>
      </div>
      <div style="overflow-x:auto">
        <table class="data-table">
          <thead><tr><th>Name</th><th>Gender</th><th>Age</th><th>Province</th><th>Sport</th><th>Status</th><th></th></tr></thead>
          <tbody>
            ${f.athletes.length ? f.athletes.map(a => `<tr onclick="window.location.hash='#/athlete/${a.id}'" style="cursor:pointer">
              <td><strong>${a.name}</strong></td>
              <td>${a.gender === 'M' ? '<span class="province-pill" style="background:#dbeafe;color:#1d4ed8">Male</span>' : '<span class="province-pill" style="background:#fce7f3;color:#9d174d">Female</span>'}</td>
              <td>${2025 - a.birth_year}</td>
              <td><span class="province-pill">${a.province}</span></td>
              <td>${a.sport}</td>
              <td><span class="score-badge score-green">Active</span></td>
              <td><a href="#/athlete/${a.id}" style="color:var(--accent);font-size:.8rem">Profile →</a></td>
            </tr>`).join('') : '<tr><td colspan="7" class="text-center text-muted py-4">No athletes tracked yet.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Gazette Compliance -->
    <div class="row g-3 mb-3">
      <div class="col-md-5">
        <div class="panel h-100">
          <div class="panel-header">
            <span class="panel-title">Statutory Compliance Checklist</span>
            <div class="d-flex align-items-center gap-2">
              <div class="comp-score-pill ${compPass===5?'comp-full':compPass>=3?'comp-mid':'comp-low'}" style="font-size:.75rem">${compPass}/5</div>
              ${canWrite() && isOwnFed(f.id) && currentUser.role !== 'coach' ? `<button class="btn-action btn-sm-action" style="background:none;border:1px solid #e2e8f0;color:#374151;font-size:.75rem" onclick="openComplianceForm(${f.id})"><i class="bi bi-pencil"></i> Update</button>` : ''}
            </div>
          </div>
          <div class="panel-body">
            <div class="comp-check-list">
              <div class="comp-check-item">
                <span class="${agmOk?'comp-pass':'comp-fail'}"><i class="bi bi-${agmOk?'check':'x'}-circle-fill"></i></span>
                <div>
                  <div class="fw-semibold" style="font-size:.82rem">Annual General Meeting</div>
                  <div class="text-muted" style="font-size:.76rem">${f.agm_last_date ? 'Held: '+fmtDate(f.agm_last_date) : 'Not recorded for 2025'}</div>
                </div>
              </div>
              <div class="comp-check-item">
                <span class="${finOk?'comp-pass':'comp-fail'}"><i class="bi bi-${finOk?'check':'x'}-circle-fill"></i></span>
                <div>
                  <div class="fw-semibold" style="font-size:.82rem">Audited Financial Statements</div>
                  <div class="text-muted" style="font-size:.76rem">${f.financial_stmt_date ? 'Submitted: '+fmtDate(f.financial_stmt_date) : 'Not submitted for 2025'}</div>
                </div>
              </div>
              <div class="comp-check-item">
                <span class="${stratOk?'comp-pass':'comp-fail'}"><i class="bi bi-${stratOk?'check':'x'}-circle-fill"></i></span>
                <div>
                  <div class="fw-semibold" style="font-size:.82rem">Strategic Plan</div>
                  <div class="text-muted" style="font-size:.76rem">${f.strategic_plan_year ? 'Plan '+f.strategic_plan_year+' in force' : 'No current plan on record'}</div>
                </div>
              </div>
              <div class="comp-check-item">
                <span class="${genderOk?'comp-pass':'comp-fail'}"><i class="bi bi-${genderOk?'check':'x'}-circle-fill"></i></span>
                <div>
                  <div class="fw-semibold" style="font-size:.82rem">Gender Quota (≥2 female EC members)</div>
                  <div class="text-muted" style="font-size:.76rem">${femaleEc} female EC officer${femaleEc!==1?'s':''} on register${!genderOk?' — below minimum of 2':''}</div>
                </div>
              </div>
              <div class="comp-check-item">
                <span class="${champOk?'comp-pass':'comp-fail'}"><i class="bi bi-${champOk?'check':'x'}-circle-fill"></i></span>
                <div>
                  <div class="fw-semibold" style="font-size:.82rem">National Championship</div>
                  <div class="text-muted" style="font-size:.76rem">${f.national_championship_date ? 'Held: '+fmtDate(f.national_championship_date) : 'Not recorded for 2025'}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="col-md-7">
        <div class="panel h-100">
          <div class="panel-header">
            <span class="panel-title">EC Officer Register</span>
            <div class="d-flex align-items-center gap-2">
              <span class="text-muted" style="font-size:.76rem">${(ecOfficers||[]).length} officer${(ecOfficers||[]).length!==1?'s':''} · ${femaleEc} female</span>
              ${canWrite() && isOwnFed(f.id) && currentUser.role !== 'coach' ? `<button class="btn-action btn-sm-action" style="background:none;border:1px solid #e2e8f0;color:#374151;font-size:.75rem" onclick="openEcOfficerForm(${f.id})"><i class="bi bi-person-plus"></i> Add Officer</button>` : ''}
            </div>
          </div>
          <div style="overflow-x:auto">
            <table class="data-table">
              <thead><tr><th>Name</th><th>Role</th><th>Gender</th><th>Since</th><th>Years</th><th>Term</th><th>Status</th></tr></thead>
              <tbody>
                ${(ecOfficers||[]).length ? (ecOfficers||[]).map(o => {
                  const termCls = o.termStatus === 'exceeded' ? 'score-red' : o.termStatus === 'final-year' ? 'score-amber' : 'score-green';
                  const termIcon = o.termStatus === 'exceeded' ? 'bi-x-circle-fill' : o.termStatus === 'final-year' ? 'bi-exclamation-circle-fill' : 'bi-check-circle-fill';
                  return `<tr ${o.is_disqualified ? 'style="opacity:.55"' : ''}>
                    <td><strong>${o.name}</strong>${o.is_disqualified ? ' <span class="comp-alert-pill" style="font-size:.7rem">Disqualified</span>' : ''}</td>
                    <td><span class="province-pill">${o.role}</span></td>
                    <td>${o.gender === 'F' ? '<span style="color:#9d174d">F</span>' : '<span style="color:#1d4ed8">M</span>'}</td>
                    <td class="text-muted" style="font-size:.8rem">${o.appointed_year || '—'}</td>
                    <td class="text-muted" style="font-size:.8rem">${o.yearsServed}yr</td>
                    <td><span class="score-badge ${termCls}"><i class="bi ${termIcon}"></i>${o.yearsServed}/${o.termLimit}yr</span></td>
                    <td><span class="score-badge ${o.is_disqualified ? 'score-red' : o.status==='inactive'?'score-grey':'score-green'}">${o.is_disqualified ? 'Disqualified' : o.status === 'inactive' ? 'Inactive' : 'Active'}</span></td>
                  </tr>`;
                }).join('') : '<tr><td colspan="7" class="text-center text-muted py-4">No EC officers recorded. Click Add Officer to start.</td></tr>'}
              </tbody>
            </table>
          </div>
          ${(ecOfficers||[]).some(o=>o.is_disqualified) ? `
          <div style="background:#fef2f2;border-top:1px solid #fecaca;padding:10px 16px;font-size:.78rem;color:#991b1b">
            <i class="bi bi-exclamation-triangle-fill me-1"></i>
            <strong>Disqualification Notice:</strong> ${(ecOfficers||[]).filter(o=>o.is_disqualified).map(o=>`${o.name} (${o.role}) — ${o.disqualification_notes}`).join('; ')}
          </div>` : ''}
          ${(ecOfficers||[]).some(o=>o.termStatus==='exceeded') ? `
          <div style="background:#fefce8;border-top:1px solid #fde68a;padding:10px 16px;font-size:.78rem;color:#92400e">
            <i class="bi bi-clock-history me-1"></i>
            <strong>Term Limit Alert:</strong> ${(ecOfficers||[]).filter(o=>o.termStatus==='exceeded').map(o=>`${o.name} (${o.role}) — ${o.yearsServed}yr served, limit ${o.termLimit}yr`).join('; ')}
          </div>` : ''}
        </div>
      </div>
    </div>

    ${aiInsightSkeletonHtml('fedAiInsight', 'AI Governance Analysis')}
  `);

  if (score2025) {
    const vals = dims.map(([,k]) => score2025[k]);
    charts.radar = new Chart(document.getElementById('radarChart'), {
      type: 'radar',
      data: {
        labels: ['Board', 'Skills', 'Strategy', 'Finance', 'Integrity', 'Stakeholder', 'Compliance', 'Culture'],
        datasets: [{
          label: '2025', data: vals,
          backgroundColor: `${f.color}33`, borderColor: f.color,
          borderWidth: 2, pointBackgroundColor: f.color, pointRadius: 4,
        },
        ...(score2024 ? [{
          label: '2024',
          data: dims.map(([,k]) => score2024[k]),
          backgroundColor: 'rgba(148,163,184,.15)', borderColor: '#94a3b8',
          borderWidth: 1.5, borderDash: [4,4], pointRadius: 3,
        }] : [])
        ]
      },
      options: {
        scales: { r: { min: 0, max: 5, ticks: { stepSize: 1, font: { size: 9 } }, pointLabels: { font: { size: 10 } } } },
        plugins: { legend: { position: 'bottom', labels: { font: { size: 10 }, boxWidth: 12 } } },
        responsive: true
      }
    });
  }

  // AI governance insight (async, non-blocking)
  api(`/api/ai/federation-insight/${id}`).then(d => {
    renderAiInsight('fedAiInsight', 'AI Governance Analysis', d?.insight);
  }).catch(() => renderAiInsight('fedAiInsight', 'AI Governance Analysis', null));
}

// ── GOVERNANCE BENCHMARK ───────────────────────────────────────────────────────
async function renderGovernance() {
  loading();
  const d = await api('/api/governance/benchmark');
  if (!d) return;

  const dims = ['board_composition','director_skills','strategic_planning','financial_transparency','integrity_risk','stakeholder_engagement','regulatory_compliance','culture_score'];
  const dimLabels = ['Board','Skills','Strategy','Finance','Integrity','Stakeholder','Compliance','Culture'];

  setContent(`
    <div class="page-header">
      <div>
        <h1 class="page-title">Governance Benchmarking</h1>
        <p class="page-subtitle">2025 sector-wide comparison across all 34 member federations</p>
      </div>
      ${caps().canGovSubmit ? `<button class="btn-action" onclick="openGovernanceForm()"><i class="bi bi-clipboard2-check"></i> Submit Scores</button>` : `<span class="score-badge score-grey"><i class="bi bi-eye"></i> View-only access</span>`}
    </div>

    <div class="row g-3 mb-4">
      <div class="col-md-8">
        <div class="panel">
          <div class="panel-header"><span class="panel-title">All Federations — Overall Score Ranking (2025)</span></div>
          <div class="panel-body" style="padding:12px">
            <canvas id="rankChart" height="320"></canvas>
          </div>
        </div>
      </div>
      <div class="col-md-4">
        <div class="panel">
          <div class="panel-header"><span class="panel-title">Dimension Averages</span></div>
          <div class="panel-body" style="padding:12px">
            <canvas id="avgDimChart" height="280"></canvas>
          </div>
        </div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-header">
        <span class="panel-title">Full Scorecard Table</span>
        <span class="text-muted" style="font-size:.78rem">${d.submitted.length} submitted · ${d.pending.length} pending</span>
      </div>
      <div style="overflow-x:auto">
        <table class="data-table">
          <thead><tr>
            <th>Rank</th><th>Federation</th>
            ${dimLabels.map(l=>`<th>${l}</th>`).join('')}
            <th>Total</th><th>Status</th>
          </tr></thead>
          <tbody>
            ${d.submitted.map((f,i) => `<tr onclick="window.location.hash='#/federation/${f.id}'" style="cursor:pointer">
              <td class="text-muted fw-bold">${i+1}</td>
              <td>
                <div class="d-flex align-items-center gap-2">
                  <div style="width:8px;height:8px;border-radius:50%;background:${f.color}"></div>
                  <span style="font-size:.82rem;font-weight:600">${f.name.replace('Sri Lanka ','SL ')}</span>
                </div>
              </td>
              ${dims.map(k => `<td style="color:${scoreColor(f[k])};font-weight:700;font-size:.82rem">${f[k]?.toFixed(1)??'—'}</td>`).join('')}
              <td>${scoreBadge(f.total_score)}</td>
              <td><span class="score-badge score-green"><i class="bi bi-check-circle-fill"></i>Submitted</span></td>
            </tr>`).join('')}
            ${d.pending.map(f => `<tr class="pending-row">
              <td class="text-muted">—</td>
              <td style="font-size:.82rem">${f.name.replace('Sri Lanka ','SL ')}</td>
              ${dims.map(() => `<td class="text-muted">—</td>`).join('')}
              <td>${scoreBadge(null)}</td>
              <td><span class="score-badge score-grey"><i class="bi bi-clock"></i>Pending</span></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `);

  // Ranking bar chart
  charts.rank = new Chart(document.getElementById('rankChart'), {
    type: 'bar',
    data: {
      labels: d.submitted.map(f => f.name.replace('Sri Lanka ','SL ').replace(' Federation','').replace(' Association','')),
      datasets: [{
        data: d.submitted.map(f => f.total_score),
        backgroundColor: d.submitted.map(f => f.total_score >= 4 ? '#22c55e' : f.total_score >= 3 ? '#f59e0b' : '#ef4444'),
        borderRadius: 5, barThickness: 14
      }]
    },
    options: {
      indexAxis: 'y',
      plugins: { legend: { display: false },
        annotation: { annotations: {
          line1: { type:'line', xMin:3,xMax:3, borderColor:'#f59e0b', borderWidth:1.5, borderDash:[4,4] },
          line2: { type:'line', xMin:4,xMax:4, borderColor:'#22c55e', borderWidth:1.5, borderDash:[4,4] }
        }}
      },
      scales: {
        x: { min: 0, max: 5, ticks: { font:{size:10} }, grid:{color:'#f1f5f9'} },
        y: { ticks: { font:{size:10} } }
      }, responsive: true
    }
  });

  // Dimension averages
  const avgDims = dims.map(k => {
    const vals = d.submitted.map(f=>f[k]).filter(v=>v!=null);
    return +(vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(2);
  });
  charts.avgDim = new Chart(document.getElementById('avgDimChart'), {
    type: 'bar',
    data: {
      labels: dimLabels,
      datasets: [{
        data: avgDims,
        backgroundColor: avgDims.map(v => v >= 4 ? '#22c55e' : v >= 3 ? '#f59e0b' : '#ef4444'),
        borderRadius: 5, barThickness: 18
      }]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        y: { min: 0, max: 5, ticks:{font:{size:10}}, grid:{color:'#f1f5f9'} },
        x: { ticks:{font:{size:10}} }
      }, responsive: true
    }
  });
}

// ── COMPLIANCE & GAZETTE ─────────────────────────────────────────────────────
async function renderCompliance() {
  loading();
  const data = await api('/api/compliance/overview');
  if (!data) return;

  const gradeA = data.filter(f => f.grade === 'A').length;
  const gradeB = data.filter(f => f.grade === 'B').length;
  const gradeC = data.filter(f => f.grade === 'C').length;
  const full   = data.filter(f => f.complianceScore === '5/5').length;
  const issues = data.filter(f => !f.agmCompliant || !f.finCompliant || !f.stratCompliant || !f.genderCompliant || !f.champCompliant);

  setContent(`
    <div class="page-header">
      <div>
        <h1 class="page-title">Compliance &amp; Gazette</h1>
        <p class="page-subtitle">Federation grading &amp; statutory compliance — Nat. Sports Assoc. Regulations No. 01 of 2025 (Gazette 2437/24)</p>
      </div>
    </div>

    <div class="row g-3 mb-4">
      <div class="col-6 col-md-3">
        <div class="kpi-card">
          <div class="kpi-icon" style="background:#dbeafe;color:#1d4ed8"><i class="bi bi-award-fill"></i></div>
          <div><div class="kpi-val">${gradeA}</div><div class="kpi-label">Grade A &nbsp;<small style="font-weight:400;color:#64748b">≥25 clubs &amp; Rs.50M+</small></div></div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="kpi-card">
          <div class="kpi-icon amber"><i class="bi bi-award"></i></div>
          <div><div class="kpi-val">${gradeB}</div><div class="kpi-label">Grade B &nbsp;<small style="font-weight:400;color:#64748b">≥15 clubs &amp; Rs.10M+</small></div></div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="kpi-card">
          <div class="kpi-icon" style="background:#f1f5f9;color:#64748b"><i class="bi bi-building"></i></div>
          <div><div class="kpi-val">${gradeC}</div><div class="kpi-label">Grade C &nbsp;<small style="font-weight:400;color:#64748b">All others</small></div></div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="kpi-card">
          <div class="kpi-icon green"><i class="bi bi-shield-check"></i></div>
          <div><div class="kpi-val">${full}</div><div class="kpi-label">Fully Compliant (5/5)</div></div>
        </div>
      </div>
    </div>

    ${issues.length ? `
    <div class="panel mb-3" style="border-left:4px solid #ef4444">
      <div class="panel-header"><span class="panel-title" style="color:#b91c1c"><i class="bi bi-exclamation-triangle-fill me-1"></i>Compliance Alerts (${issues.length} federations)</span></div>
      <div class="panel-body" style="padding:10px 16px">
        ${issues.slice(0,5).map(f => `
          <div class="d-flex align-items-center gap-3 py-2 border-bottom">
            <span class="fw-semibold" style="min-width:220px">${f.name.replace('Sri Lanka ','SL ')}</span>
            ${!f.agmCompliant     ? `<span class="comp-alert-pill">No 2025 AGM</span>` : ''}
            ${!f.finCompliant     ? `<span class="comp-alert-pill">Financial stmt missing</span>` : ''}
            ${!f.stratCompliant   ? `<span class="comp-alert-pill">Outdated strategic plan</span>` : ''}
            ${!f.genderCompliant  ? `<span class="comp-alert-pill">Gender quota (${f.femaleEcCount}F)</span>` : ''}
            ${!f.champCompliant   ? `<span class="comp-alert-pill">No nat. championship</span>` : ''}
          </div>`).join('')}
        ${issues.length > 5 ? `<div class="text-muted py-2" style="font-size:.8rem">…and ${issues.length - 5} more — see full table below.</div>` : ''}
      </div>
    </div>` : ''}

    <div class="panel">
      <div class="panel-header">
        <span class="panel-title">Full Compliance Matrix — All 34 Federations</span>
        <span class="text-muted" style="font-size:.78rem">Click a row to open federation detail</span>
      </div>
      <div style="overflow-x:auto">
        <table class="data-table">
          <thead>
            <tr>
              <th>Federation</th>
              <th>Grade</th>
              <th>Clubs</th>
              <th>Turnover</th>
              <th title="Annual General Meeting held in 2025">AGM 2025</th>
              <th title="Audited financial statements submitted in 2025">Fin. Stmt</th>
              <th title="Strategic plan covering 2024 or 2025">Strat. Plan</th>
              <th title="Minimum 2 female EC members (where female athletes participate)">Gender ≥2F</th>
              <th title="National championship conducted in 2025">Nat. Champ.</th>
              <th>Score</th>
            </tr>
          </thead>
          <tbody>
            ${data.map(f => `<tr onclick="window.location.hash='#/federation/${f.id}'" style="cursor:pointer">
              <td>
                <div class="d-flex align-items-center gap-2">
                  <div style="width:8px;height:8px;border-radius:50%;background:${f.color};flex-shrink:0"></div>
                  <span class="fw-semibold" style="font-size:.82rem">${f.name.replace('Sri Lanka ','SL ')}</span>
                </div>
              </td>
              <td>${gradeBadge(f.grade)}</td>
              <td class="text-muted" style="font-size:.82rem">${f.affiliated_clubs || '—'}</td>
              <td class="text-muted" style="font-size:.82rem">${fmtLKR(f.annual_turnover)}</td>
              <td class="text-center">${compCheck(f.agmCompliant, f.agm_last_date || 'Not recorded')}</td>
              <td class="text-center">${compCheck(f.finCompliant, f.financial_stmt_date || 'Not submitted')}</td>
              <td class="text-center">${compCheck(f.stratCompliant, f.strategic_plan_year ? 'Plan '+f.strategic_plan_year : 'Not recorded')}</td>
              <td class="text-center">${compCheck(f.genderCompliant, f.femaleEcCount + ' female EC officers')}</td>
              <td class="text-center">${compCheck(f.champCompliant, f.national_championship_date || 'Not held')}</td>
              <td>
                <div class="comp-score-pill ${f.complianceScore==='5/5'?'comp-full':parseInt(f.complianceScore)>=3?'comp-mid':'comp-low'}">${f.complianceScore}</div>
              </td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `);
}

// ── ATHLETES ─────────────────────────────────────────────────────────────────
async function renderAthletes() {
  loading();
  const rows = await api('/api/athletes');
  if (!rows) return;

  const feds = [...new Set(rows.map(r => r.federation_name))].sort();
  const sports = [...new Set(rows.map(r => r.sport))].sort();

  setContent(`
    <div class="page-header">
      <div>
        <h1 class="page-title">Athletes</h1>
        <p class="page-subtitle">${rows.length} athlete${rows.length!==1?'s':''} tracked${caps().ownOnly ? ` in ${currentUser.federation_name || 'your federation'}` : ' across all federations'}</p>
      </div>
      <div class="d-flex gap-2 flex-wrap align-items-center">
        ${canWrite() ? `<button class="btn-action" onclick="openAthleteForm(${caps().ownOnly ? currentUser.federation_id : ''})"><i class="bi bi-person-plus"></i> Register Athlete</button>` : `<span class="score-badge score-grey"><i class="bi bi-eye"></i> View-only access</span>`}
        <div class="search-box"><i class="bi bi-search"></i><input id="athSearch" placeholder="Search athletes…"></div>
        <select class="filter-select" id="athFed">
          <option value="">All Federations</option>
          ${feds.map(f=>`<option>${f}</option>`).join('')}
        </select>
        <select class="filter-select" id="athSport">
          <option value="">All Sports</option>
          ${sports.map(s=>`<option>${s}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="panel">
      <div style="overflow-x:auto">
        <table class="data-table">
          <thead><tr>
            <th>Athlete</th><th>Sport</th><th>Federation</th><th>Gender</th>
            <th>Age</th><th>Province</th><th>BMI</th><th>Injury Risk</th>
          </tr></thead>
          <tbody id="athTbody">
            ${rows.map(a => {
              const acwr = a.latest_acwr;
              const riskHtml = acwr == null ? '<span class="text-muted">—</span>'
                : `<span class="risk-dot ${acwr>1.5?'risk-high':acwr>1.3?'risk-medium':'risk-low'}"></span>${acwr.toFixed(2)}`;
              return `<tr data-fed="${a.federation_name}" data-sport="${a.sport}" onclick="window.location.hash='#/athlete/${a.id}'">
                <td>
                  <div class="d-flex align-items-center gap-2">
                    <div style="width:32px;height:32px;border-radius:50%;background:${a.color||'#2E75B6'};color:#fff;font-size:.65rem;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">${initials(a.name)}</div>
                    <div><div class="fw-semibold">${a.name}</div><div class="text-muted" style="font-size:.75rem">${a.school||''}</div></div>
                  </div>
                </td>
                <td>${a.sport}</td>
                <td style="font-size:.8rem">${a.federation_name?.replace('Sri Lanka ','SL ')}</td>
                <td>${a.gender==='M'?'<span style="color:#1d4ed8">♂ Male</span>':'<span style="color:#9d174d">♀ Female</span>'}</td>
                <td>${Math.round(a.age)||'—'}</td>
                <td><span class="province-pill">${a.province}</span></td>
                <td>${a.latest_bmi?.toFixed(1)||'—'}</td>
                <td>${riskHtml}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `);

  function filterAth() {
    const q = document.getElementById('athSearch').value.toLowerCase();
    const fed = document.getElementById('athFed').value;
    const sport = document.getElementById('athSport').value;
    document.querySelectorAll('#athTbody tr').forEach(tr => {
      const name = tr.querySelector('.fw-semibold')?.textContent.toLowerCase()||'';
      const trFed = tr.dataset.fed; const trSport = tr.dataset.sport;
      tr.style.display = name.includes(q) && (!fed||trFed===fed) && (!sport||trSport===sport) ? '' : 'none';
    });
  }
  document.getElementById('athSearch').addEventListener('input', filterAth);
  document.getElementById('athFed').addEventListener('change', filterAth);
  document.getElementById('athSport').addEventListener('change', filterAth);
}

// ── ATHLETE DETAIL ────────────────────────────────────────────────────────────
async function renderAthleteDetail(id) {
  loading();
  const [ath, bio, training, perf] = await Promise.all([
    api(`/api/athletes/${id}`),
    api(`/api/athletes/${id}/biometrics`),
    api(`/api/athletes/${id}/training`),
    api(`/api/athletes/${id}/performance`),
  ]);
  if (!ath) return;

  window._currentAthlete = ath;
  document.getElementById('breadcrumb').innerHTML = `
    <li class="breadcrumb-item"><a href="#/athletes" style="color:var(--accent)">Athletes</a></li>
    <li class="breadcrumb-item active">${ath.name}</li>`;

  const lb = ath.latestBio;
  const ll = ath.latestLoad;
  const acwr = ll?.acwr;

  setContent(`
    <button class="btn-back" onclick="window.location.hash='#/athletes'">
      <i class="bi bi-arrow-left"></i> Back to Athletes
    </button>

    ${canWrite() ? `
    <div class="action-row">
      <button class="btn-action" onclick="openBiometricForm(window._currentAthlete.id,window._currentAthlete.name)"><i class="bi bi-heart-pulse"></i> Add Biometric</button>
      <button class="btn-action" onclick="openTrainingForm(window._currentAthlete.id,window._currentAthlete.name)"><i class="bi bi-lightning-charge"></i> Log Training</button>
      <button class="btn-action" onclick="openPerformanceForm(window._currentAthlete.id,window._currentAthlete.name)"><i class="bi bi-trophy"></i> Record Test</button>
      <button class="btn-action" onclick="openActivityForm(window._currentAthlete.id,window._currentAthlete.name)"><i class="bi bi-calendar2-check"></i> Log Activity</button>
      ${currentUser.role !== 'coach' ? `<button class="btn-action btn-sm-action" style="background:none;border:1px solid #e2e8f0;color:#374151;" onclick="openAthleteEditForm(window._currentAthlete)"><i class="bi bi-pencil"></i> Edit Profile</button>` : ''}
    </div>` : `<div class="action-row"><span class="score-badge score-grey"><i class="bi bi-eye"></i> Read-only access — ${ROLE_LABELS[currentUser.role]}</span></div>`}

    <div class="athlete-header">
      <div class="athlete-avatar">${initials(ath.name)}</div>
      <div style="flex:1">
        <div class="athlete-name">${ath.name}</div>
        <div class="athlete-meta">
          ${ath.sport} · ${ath.federation_name} · Age ${ath.age} · ${ath.gender==='M'?'Male':'Female'} · ${ath.province}
        </div>
        <div class="athlete-meta mt-1">${ath.school}</div>
      </div>
      <div class="text-end d-none d-md-block">
        <div class="acwr-gauge">
          <div class="acwr-value ${acwrClass(acwr)}">${acwr?.toFixed(2)||'—'}</div>
          <div class="acwr-label">ACWR</div>
          ${acwr ? acwrZoneHtml(acwr) : ''}
        </div>
      </div>
    </div>

    <!-- Biometric KPIs -->
    <div class="row g-2 mb-3">
      ${[
        ['Height',  lb?.height_cm ? lb.height_cm+'cm' : '—', 'bi-arrows-vertical', 'blue'],
        ['Weight',  lb?.weight_kg ? lb.weight_kg+'kg' : '—', 'bi-speedometer',   'green'],
        ['BMI',     lb?.bmi?.toFixed(1)||'—',                'bi-activity',       'amber'],
        ['Heart Rate', lb?.heart_rate ? lb.heart_rate+' bpm' : '—', 'bi-heart-pulse','red'],
        ['Sleep',   lb?.sleep_quality ? lb.sleep_quality+'/10':'—', 'bi-moon-stars','purple'],
        ['Mental WB', lb?.mental_wellbeing ? lb.mental_wellbeing+'/10':'—','bi-emoji-smile','teal'],
      ].map(([label,val,icon,cls])=>`
        <div class="col-4 col-md-2">
          <div class="kpi-card" style="padding:14px;gap:10px">
            <div class="kpi-icon ${cls}" style="width:38px;height:38px;font-size:1.1rem"><i class="bi ${icon}"></i></div>
            <div><div class="kpi-val" style="font-size:1.2rem">${val}</div><div class="kpi-label">${label}</div></div>
          </div>
        </div>`).join('')}
    </div>

    <div class="row g-3 mb-3">
      <!-- Weight & BMI trend -->
      <div class="col-md-6">
        <div class="panel">
          <div class="panel-header"><span class="panel-title">Weight & BMI Trend (6 Months)</span></div>
          <div class="panel-body" style="padding:12px"><canvas id="bioChart" height="200"></canvas></div>
        </div>
      </div>
      <!-- Training Load -->
      <div class="col-md-6">
        <div class="panel">
          <div class="panel-header">
            <span class="panel-title">Training Load — ATL / CTL / ACWR</span>
            ${acwr > 1.4 ? '<span class="score-badge score-red"><i class="bi bi-exclamation-triangle-fill"></i>AI Alert: Injury Risk</span>' : '<span class="score-badge score-green"><i class="bi bi-check-circle-fill"></i>Load Optimal</span>'}
          </div>
          <div class="panel-body" style="padding:12px"><canvas id="loadChart" height="200"></canvas></div>
        </div>
      </div>
    </div>

    <div class="row g-3">
      <!-- Performance tests -->
      <div class="col-md-6">
        <div class="panel">
          <div class="panel-header"><span class="panel-title">Performance Test Results</span></div>
          <div class="panel-body" style="padding:12px">
            <canvas id="perfChart" height="200"></canvas>
            <table class="data-table mt-3" style="font-size:.8rem">
              <thead><tr><th>Date</th><th>Test</th><th>Result</th><th>Conditions</th></tr></thead>
              <tbody>
                ${perf.slice().reverse().map(p=>`<tr>
                  <td>${fmtDate(p.test_date)}</td>
                  <td>${p.test_type}</td>
                  <td><strong>${p.result} ${p.unit}</strong></td>
                  <td class="text-muted">${p.conditions||'—'}</td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <!-- Recent activity -->
      <div class="col-md-6">
        <div class="panel">
          <div class="panel-header"><span class="panel-title">Recent Activity Log</span></div>
          <div style="overflow-x:auto">
            <table class="data-table">
              <thead><tr><th>Date</th><th>Activity</th><th>Duration</th><th>Distance</th><th>Calories</th></tr></thead>
              <tbody>
                ${ath.recentActivity.map(a=>`<tr>
                  <td>${fmtDate(a.log_date)}</td>
                  <td>${a.activity_type}</td>
                  <td>${a.duration_mins} min</td>
                  <td>${a.distance_km} km</td>
                  <td>${a.calories} kcal</td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    ${aiInsightSkeletonHtml('athAiInsight', 'AI Coaching Insight')}
  `);

  // Biometric chart
  if (bio.length) {
    charts.bio = new Chart(document.getElementById('bioChart'), {
      type: 'line',
      data: {
        labels: bio.map(b => b.record_date.slice(0,7)),
        datasets: [
          { label: 'Weight (kg)', data: bio.map(b=>b.weight_kg), borderColor:'#2E75B6', backgroundColor:'rgba(46,117,182,.08)', yAxisID:'y', borderWidth:2.5, pointRadius:5, fill:true, tension:.3 },
          { label: 'BMI', data: bio.map(b=>b.bmi), borderColor:'#f59e0b', borderDash:[4,4], yAxisID:'y2', borderWidth:2, pointRadius:4, tension:.3 },
        ]
      },
      options: {
        scales: {
          y:  { position:'left',  ticks:{font:{size:10}}, grid:{color:'#f1f5f9'} },
          y2: { position:'right', ticks:{font:{size:10}}, grid:{display:false} }
        },
        plugins: { legend: { labels:{ font:{size:10}, boxWidth:14 } } },
        responsive: true
      }
    });
  }

  // Training load chart
  if (training.length) {
    const loadLabels = training.map(t => t.load_date.slice(5));
    charts.load = new Chart(document.getElementById('loadChart'), {
      type: 'line',
      data: {
        labels: loadLabels,
        datasets: [
          { label: 'ATL (Acute)', data: training.map(t=>t.acute_load), borderColor:'#ef4444', backgroundColor:'rgba(239,68,68,.08)', borderWidth:2.5, pointRadius:4, fill:true, tension:.3, yAxisID:'y' },
          { label: 'CTL (Chronic)', data: training.map(t=>t.chronic_load), borderColor:'#2E75B6', borderWidth:2, pointRadius:3, tension:.3, yAxisID:'y' },
          { label: 'ACWR', data: training.map(t=>t.acwr), borderColor:'#7c3aed', borderDash:[4,4], borderWidth:2, pointRadius:4, yAxisID:'y2', tension:.3 },
        ]
      },
      options: {
        scales: {
          y:  { position:'left',  ticks:{font:{size:10}}, grid:{color:'#f1f5f9'} },
          y2: { position:'right', min:0, max:2.5, ticks:{font:{size:10}}, grid:{display:false},
            afterDataLimits(scale){ scale.max = Math.max(scale.max, 2); } }
        },
        plugins: {
          legend: { labels:{ font:{size:10}, boxWidth:14 } },
          annotation: {
            annotations: {
              safe:   { type:'box', yScaleID:'y2', yMin:0.8, yMax:1.3, backgroundColor:'rgba(34,197,94,.05)', borderWidth:0 },
              danger: { type:'box', yScaleID:'y2', yMin:1.5, yMax:2.5, backgroundColor:'rgba(239,68,68,.07)', borderWidth:0 },
            }
          }
        },
        responsive: true
      }
    });
  }

  // Performance trend chart
  if (perf.length) {
    const perfTypes = [...new Set(perf.map(p=>p.test_type))];
    const perfColors = ['#2E75B6','#22c55e','#f59e0b','#ef4444'];
    charts.perf = new Chart(document.getElementById('perfChart'), {
      type: 'line',
      data: {
        labels: [...new Set(perf.map(p=>p.test_date))].sort(),
        datasets: perfTypes.map((type,i) => {
          const pts = perf.filter(p=>p.test_type===type);
          return {
            label: `${type} (${pts[0]?.unit||''})`,
            data: pts.map(p=>p.result),
            borderColor: perfColors[i%perfColors.length],
            backgroundColor: 'transparent',
            borderWidth: 2.5, pointRadius: 6, tension: .2
          };
        })
      },
      options: {
        plugins: { legend: { labels:{ font:{size:10}, boxWidth:14 } } },
        scales: {
          y: { ticks:{font:{size:10}}, grid:{color:'#f1f5f9'} },
          x: { ticks:{font:{size:10}} }
        }, responsive: true
      }
    });
  }

  // AI coaching insight (async, non-blocking)
  api(`/api/ai/athlete-insight/${id}`).then(d => {
    renderAiInsight('athAiInsight', 'AI Coaching Insight', d?.insight);
  }).catch(() => renderAiInsight('athAiInsight', 'AI Coaching Insight', null));
}

// ── FIT FOR LIFE ───────────────────────────────────────────────────────────────
async function renderFitForLife() {
  loading();
  const d = await api('/api/fitforlife');
  if (!d) return;

  setContent(`
    <div class="page-header">
      <div>
        <h1 class="page-title">Fit for Life Programme</h1>
        <p class="page-subtitle">National health & activity monitoring — IOC Fit for Life 2025–2035</p>
      </div>
    </div>

    <!-- Health KPIs -->
    <div class="row g-3 mb-4">
      <div class="col-6 col-md-3">
        <div class="health-metric"><div class="health-metric-val" style="color:var(--brand)">${d.totalParticipants}</div><div class="health-metric-label">Total Participants Tracked</div></div>
      </div>
      <div class="col-6 col-md-3">
        <div class="health-metric"><div class="health-metric-val" style="color:#15803d">${d.avgBmi}</div><div class="health-metric-label">Average BMI</div></div>
      </div>
      <div class="col-6 col-md-3">
        <div class="health-metric"><div class="health-metric-val" style="color:#2E75B6">${d.avgSleep}</div><div class="health-metric-label">Avg Sleep Quality (/ 10)</div></div>
      </div>
      <div class="col-6 col-md-3">
        <div class="health-metric"><div class="health-metric-val" style="color:#7e22ce">${d.avgMental}</div><div class="health-metric-label">Avg Mental Wellbeing (/ 10)</div></div>
      </div>
    </div>

    <div class="row g-3 mb-4">
      <div class="col-md-5">
        <div class="panel">
          <div class="panel-header"><span class="panel-title">Participation by Province</span></div>
          <div class="panel-body" style="padding:12px"><canvas id="provChart" height="220"></canvas></div>
        </div>
      </div>
      <div class="col-md-3">
        <div class="panel">
          <div class="panel-header"><span class="panel-title">Gender Split</span></div>
          <div class="panel-body" style="padding:12px">
            <canvas id="genderChart" height="200"></canvas>
            <div class="mt-3">
              ${d.byGender.map(g=>`
                <div class="d-flex justify-content-between align-items-center mb-2">
                  <span class="province-pill" style="${g.gender==='M'?'background:#dbeafe;color:#1d4ed8':'background:#fce7f3;color:#9d174d'}">${g.gender==='M'?'Male':'Female'}</span>
                  <strong>${g.c}</strong>
                </div>`).join('')}
            </div>
          </div>
        </div>
      </div>
      <div class="col-md-4">
        <div class="panel">
          <div class="panel-header"><span class="panel-title">Top Sports by Participation</span></div>
          <div class="panel-body" style="padding:12px"><canvas id="sportChart" height="220"></canvas></div>
        </div>
      </div>
    </div>

    <!-- AI Injury Risk Alerts -->
    ${d.highRisk.length ? `
    <div class="panel mb-3">
      <div class="panel-header" style="background:#fff7f7">
        <span class="panel-title" style="color:#b91c1c"><i class="bi bi-exclamation-triangle-fill me-2"></i>AI Injury Risk Alerts — High ACWR Athletes</span>
        <span class="score-badge score-red">${d.highRisk.length} Athletes at Risk</span>
      </div>
      <div style="overflow-x:auto">
        <table class="data-table">
          <thead><tr><th>Athlete</th><th>Sport</th><th>Federation</th><th>ACWR</th><th>Risk Level</th><th>Action</th></tr></thead>
          <tbody>
            ${d.highRisk.map(r=>`<tr>
              <td><strong>${r.name}</strong></td>
              <td>${r.sport}</td>
              <td>${r.fed}</td>
              <td><strong style="color:#b91c1c;font-size:1.1rem">${r.acwr.toFixed(2)}</strong></td>
              <td>${acwrZoneHtml(r.acwr)}</td>
              <td><span style="font-size:.78rem;color:#b45309">Reduce training load immediately</span></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>` : ''}

    <!-- Activity summary -->
    <div class="panel">
      <div class="panel-header"><span class="panel-title">Activity Log Summary</span></div>
      <div style="overflow-x:auto">
        <table class="data-table">
          <thead><tr><th>Activity Type</th><th>Sessions</th><th>Total Calories Burnt</th></tr></thead>
          <tbody>
            ${d.activityTotals.map(a=>`<tr>
              <td><strong>${a.activity_type}</strong></td>
              <td>${a.c}</td>
              <td>${a.cal?.toLocaleString()} kcal</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `);

  charts.prov = new Chart(document.getElementById('provChart'), {
    type: 'bar',
    data: {
      labels: d.byProvince.map(p=>p.province||'Other'),
      datasets: [{ data: d.byProvince.map(p=>p.c),
        backgroundColor: ['#1F4E79','#2E75B6','#3b82f6','#60a5fa','#93c5fd','#bfdbfe','#dbeafe','#eff6ff'],
        borderRadius: 6, barThickness: 28 }]
    },
    options: {
      plugins:{legend:{display:false}},
      scales:{
        y:{ticks:{font:{size:10}},grid:{color:'#f1f5f9'}},
        x:{ticks:{font:{size:10},maxRotation:30}}
      }, responsive:true
    }
  });

  charts.gender = new Chart(document.getElementById('genderChart'), {
    type: 'doughnut',
    data: {
      labels: d.byGender.map(g=>g.gender==='M'?'Male':'Female'),
      datasets: [{ data: d.byGender.map(g=>g.c),
        backgroundColor: d.byGender.map(g => g.gender === 'M' ? '#3b82f6' : '#ec4899'),
        borderWidth:0, hoverOffset:6 }]
    },
    options:{ plugins:{legend:{display:false}}, cutout:'60%', responsive:true }
  });

  charts.sport = new Chart(document.getElementById('sportChart'), {
    type: 'bar',
    data: {
      labels: d.bySport.map(s=>s.sport),
      datasets: [{ data: d.bySport.map(s=>s.c),
        backgroundColor: '#2E75B6', borderRadius:5, barThickness:16 }]
    },
    options: {
      indexAxis:'y',
      plugins:{legend:{display:false}},
      scales:{
        x:{ticks:{font:{size:10}},grid:{color:'#f1f5f9'}},
        y:{ticks:{font:{size:10}}}
      }, responsive:true
    }
  });
}

// ── REPORTS ───────────────────────────────────────────────────────────────────
function renderReports() {
  const allReports = [
    { key:'governance',   icon:'bi-file-earmark-bar-graph-fill', bg:'#dbeafe', color:'#1d4ed8', title:'Governance Benchmarking Report 2025', desc:'Sector-wide governance scores for all 34 federations. Includes rankings, dimension breakdown, and year-on-year trend analysis.' },
    { key:'fitforlife',   icon:'bi-heart-pulse-fill', bg:'#dcfce7', color:'#15803d', title:'Fit for Life Programme Report — May 2025', desc:'National health metrics, activity participation by province, and athlete wellness indicators.' },
    { key:'injury-risk',  icon:'bi-exclamation-triangle-fill', bg:'#fee2e2', color:'#b91c1c', title:'AI Injury Risk Alert Report', desc:'AI-generated training load analysis identifying athletes at elevated injury risk based on ACWR monitoring.' },
    { key:'performance',  icon:'bi-graph-up-arrow', bg:'#f3e8ff', color:'#7e22ce', title:'Performance Trend Analysis — Athletics', desc:'Longitudinal performance trends for Athletics Sri Lanka athletes including 100m, 400m and field events.' },
    { key:'compliance',   icon:'bi-building-fill', bg:'#fef3c7', color:'#b45309', title:'Federation Compliance Report', desc:'Regulatory compliance status of all 34 federations against the National Sports Associations Regulations No. 01 of 2025.' },
    { key:'donor',        icon:'bi-people-fill', bg:'#ccfbf1', color:'#0f766e', title:'Donor Impact Report — Q1 2025', desc:'Programme KPIs, participant statistics, and health outcome summaries formatted for UNDP / World Bank reporting.' },
  ];
  const allowedKeys = caps().reportKeys; // null = all
  const reports = allowedKeys === null ? allReports : allReports.filter(r => allowedKeys.includes(r.key));

  setContent(`
    <div class="page-header">
      <div>
        <h1 class="page-title">Reports</h1>
        <p class="page-subtitle">${reports.length} report${reports.length!==1?'s':''} available for your role — generated from real-time data</p>
      </div>
    </div>
    <div class="row g-3">
      ${reports.map(r=>`
        <div class="col-md-4">
          <div class="report-card">
            <div class="report-icon" style="background:${r.bg};color:${r.color}"><i class="bi ${r.icon}"></i></div>
            <div class="fw-bold mb-1">${r.title}</div>
            <div class="text-muted" style="font-size:.82rem;line-height:1.5">${r.desc}</div>
            <div class="mt-3 d-flex gap-2 align-items-center">
              <button class="btn btn-sm btn-outline-danger" style="font-size:.78rem;padding:3px 10px" onclick="window.open('/reports/html/${r.key}','_blank')">
                <i class="bi bi-filetype-pdf me-1"></i>PDF
              </button>
              <button class="btn btn-sm btn-outline-primary" style="font-size:.78rem;padding:3px 10px" onclick="window.location.href='/reports/word/${r.key}'">
                <i class="bi bi-filetype-docx me-1"></i>Word
              </button>
              <span class="ms-auto" style="font-size:.78rem;color:var(--accent)"><i class="bi bi-circle-fill text-success me-1" style="font-size:.45rem"></i>Live</span>
            </div>
          </div>
        </div>`).join('')}
    </div>

    <div class="panel mt-4">
      <div class="panel-header"><span class="panel-title"><i class="bi bi-robot me-2"></i>AI Report Generation — How It Works</span></div>
      <div class="panel-body">
        <div class="row g-3">
          ${[
            ['1','Data Collection','Platform aggregates governance scores, health metrics, and performance data across all federations and athletes.'],
            ['2','AI Analysis','The LLM engine (Anthropic Claude API) analyses patterns, identifies outliers, and generates narrative insights.'],
            ['3','Report Compilation','Structured reports are assembled with charts, tables, and AI-written commentary tailored to the audience (NOCSL, Ministry, Donor).'],
            ['4','Export & Delivery','Reports are exported as PDF or Word documents and can be auto-distributed to stakeholders on a scheduled basis.'],
          ].map(([n,title,desc])=>`
            <div class="col-md-3">
              <div style="text-align:center;padding:16px">
                <div style="width:40px;height:40px;border-radius:50%;background:var(--brand);color:#fff;font-weight:800;font-size:1.1rem;display:flex;align-items:center;justify-content:center;margin:0 auto 10px">${n}</div>
                <div class="fw-bold mb-1" style="font-size:.9rem">${title}</div>
                <div class="text-muted" style="font-size:.8rem">${desc}</div>
              </div>
            </div>`).join('')}
        </div>
      </div>
    </div>
  `);
}

// ── DATA ENTRY FORMS ──────────────────────────────────────────────────────────

const PROVINCES = ['Western','Southern','Central','North Western','Sabaragamuwa','Uva','Eastern','Northern','North Central'];
const SESSION_TYPES = ['Endurance Run','Interval Training','Strength & Conditioning','Skills Drill','Recovery Run','Match Simulation','Speed Work','Technical Practice','Cross Training'];
const ACTIVITY_TYPES = ['Training Session','Match Play','Recovery Run','Gym Strength','Cross Training','Physiotherapy','Skills Practice','Conditioning'];

function dimSlider(label, name, val) {
  const id = 'sv_' + name;
  const color = val >= 4 ? '#15803d' : val >= 3 ? '#b45309' : '#b91c1c';
  return `<div class="score-slider-wrap">
    <span class="score-slider-label">${label}</span>
    <input type="range" name="${name}" class="form-range" min="1" max="5" step="0.1" value="${val}"
      oninput="const el=document.getElementById('${id}');el.textContent=parseFloat(this.value).toFixed(1);el.style.color=this.value>=4?'#15803d':this.value>=3?'#b45309':'#b91c1c'">
    <span class="score-slider-val" id="${id}" style="color:${color}">${(+val).toFixed(1)}</span>
  </div>`;
}
function ratingSlider(label, name, val) {
  return `<div class="score-slider-wrap">
    <span class="rating-label">${label}</span>
    <input type="range" name="${name}" class="form-range" min="1" max="10" step="1" value="${val}"
      oninput="document.getElementById('rv_${name}').textContent=this.value">
    <span class="rating-val" id="rv_${name}">${val}</span>
  </div>`;
}

// ── GOVERNANCE SCORE FORM ─────────────────────────────────────────────────────
async function openGovernanceForm(fedId = null) {
  const feds = await api('/api/federations-list');
  if (!feds) return;
  const dims = [
    ['Board Composition & Independence', 'board_composition'],
    ['Director Skills & Tenure',         'director_skills'],
    ['Strategic Planning',               'strategic_planning'],
    ['Financial Transparency',           'financial_transparency'],
    ['Integrity & Risk Management',      'integrity_risk'],
    ['Stakeholder Engagement',           'stakeholder_engagement'],
    ['Regulatory Compliance',            'regulatory_compliance'],
    ['Organisational Culture',           'culture_score'],
  ];
  const fedOptions = feds.map(f => `<option value="${f.id}" ${f.id == fedId ? 'selected' : ''}>${f.name}</option>`).join('');
  const fedLocked = currentUser.role === 'federation';
  const html = `
    <div class="row g-3 mb-2">
      <div class="col-8">${fmtInput('Federation *', fedLocked
        ? `<input class="form-control" value="${currentUser.federation_name || feds.find(f=>f.id===currentUser.federation_id)?.name || ''}" disabled><input type="hidden" name="federation_id" value="${currentUser.federation_id}">`
        : `<select name="federation_id" class="form-select" required>${fedOptions}</select>`)}</div>
      <div class="col-4">${fmtInput('Year *', `<input type="number" name="year" class="form-control" value="${new Date().getFullYear()}" min="2020" max="2035" required>`)}</div>
    </div>
    <p class="form-section-title">Dimension Scores &nbsp;<span style="font-weight:400;text-transform:none;letter-spacing:0">Drag each slider — 1.0 (Poor) to 5.0 (Excellent)</span></p>
    ${dims.map(([label, key]) => dimSlider(label, key, 3.0)).join('')}`;
  showModal('Submit Governance Scores', html, async fd => {
    const body = fdToObj(fd);
    const result = await postApi('/api/governance', body);
    closeModal();
    showToast(`Scores saved — Overall: ${result.total}`);
    navigate();
  }, 'Submit Scores');
}

// ── EDIT FEDERATION FORM ──────────────────────────────────────────────────────
async function openEditFedForm(fedId) {
  const f = await api(`/api/federations/${fedId}`);
  if (!f) return;
  const provOpts = PROVINCES.map(p => `<option ${p === f.province ? 'selected' : ''}>${p}</option>`).join('');
  const html = `
    <div class="row g-3">
      <div class="col-6">${fmtInput('President', `<input name="president" class="form-control" value="${f.president || ''}">`)}</div>
      <div class="col-6">${fmtInput('Secretary', `<input name="secretary" class="form-control" value="${f.secretary || ''}">`)}</div>
      <div class="col-6">${fmtInput('Total Members', `<input type="number" name="total_members" class="form-control" value="${f.total_members || 0}">`)}</div>
      <div class="col-6">${fmtInput('Athletes Count', `<input type="number" name="athletes_count" class="form-control" value="${f.athletes_count || 0}">`)}</div>
      <div class="col-6">${fmtInput('Province', `<select name="province" class="form-select">${provOpts}</select>`)}</div>
      <div class="col-6">${fmtInput('Established Year', `<input type="number" name="established_year" class="form-control" value="${f.established_year || ''}">`)}</div>
    </div>`;
  showModal(`Edit — ${f.name}`, html, async fd => {
    await putApi(`/api/federations/${fedId}`, fdToObj(fd));
    closeModal();
    showToast('Federation details updated');
    renderFederationDetail(fedId);
  }, 'Save Changes');
}

// ── ATHLETE REGISTRATION FORM ─────────────────────────────────────────────────
async function openAthleteForm(fedId = null) {
  const feds = await api('/api/federations-list');
  if (!feds) return;
  const fedOpts = feds.map(f => `<option value="${f.id}" ${f.id == fedId ? 'selected' : ''}>${f.name}</option>`).join('');
  const provOpts = PROVINCES.map(p => `<option>${p}</option>`).join('');
  const fedLocked2 = caps().ownOnly && currentUser.federation_id;
  const html = `
    <div class="row g-3">
      <div class="col-12">${fmtInput('Full Name *', `<input name="name" class="form-control" placeholder="Athlete's full name" required>`)}</div>
      <div class="col-6">${fmtInput('Gender *', `<select name="gender" class="form-select" required><option value="M">Male</option><option value="F">Female</option></select>`)}</div>
      <div class="col-6">${fmtInput('Birth Year *', `<input type="number" name="birth_year" class="form-control" value="2000" min="1975" max="2012" required>`)}</div>
      <div class="col-12">${fmtInput('Federation *', fedLocked2
        ? `<input class="form-control" value="${currentUser.federation_name || ''}" disabled><input type="hidden" name="federation_id" value="${currentUser.federation_id}">`
        : `<select name="federation_id" class="form-select" required>${fedOpts}</select>`)}</div>
      <div class="col-6">${fmtInput('Sport *', `<input name="sport" class="form-control" placeholder="e.g. Athletics" required>`)}</div>
      <div class="col-6">${fmtInput('Province', `<select name="province" class="form-select">${provOpts}</select>`)}</div>
      <div class="col-12">${fmtInput('School / Club', `<input name="school" class="form-control" placeholder="School or sports club">`)}</div>
    </div>`;
  showModal('Register New Athlete', html, async fd => {
    const result = await postApi('/api/athletes', fdToObj(fd));
    closeModal();
    showToast('Athlete registered successfully');
    navigate();
  }, 'Register Athlete');
}

// ── EDIT ATHLETE FORM ─────────────────────────────────────────────────────────
async function openAthleteEditForm(ath) {
  const feds = await api('/api/federations-list');
  if (!feds) return;
  const fedOpts = feds.map(f => `<option value="${f.id}" ${f.id == ath.federation_id ? 'selected' : ''}>${f.name}</option>`).join('');
  const provOpts = PROVINCES.map(p => `<option ${p === ath.province ? 'selected' : ''}>${p}</option>`).join('');
  const html = `
    <div class="row g-3">
      <div class="col-12">${fmtInput('Full Name *', `<input name="name" class="form-control" value="${ath.name}" required>`)}</div>
      <div class="col-6">${fmtInput('Gender *', `<select name="gender" class="form-select" required><option value="M" ${ath.gender==='M'?'selected':''}>Male</option><option value="F" ${ath.gender==='F'?'selected':''}>Female</option></select>`)}</div>
      <div class="col-6">${fmtInput('Birth Year *', `<input type="number" name="birth_year" class="form-control" value="${ath.birth_year}" min="1975" max="2012" required>`)}</div>
      <div class="col-12">${fmtInput('Federation', `<select name="federation_id" class="form-select">${fedOpts}</select>`)}</div>
      <div class="col-6">${fmtInput('Sport *', `<input name="sport" class="form-control" value="${ath.sport}" required>`)}</div>
      <div class="col-6">${fmtInput('Province', `<select name="province" class="form-select">${provOpts}</select>`)}</div>
      <div class="col-12">${fmtInput('School / Club', `<input name="school" class="form-control" value="${ath.school || ''}">`)}</div>
    </div>`;
  showModal('Edit Athlete Profile', html, async fd => {
    await putApi(`/api/athletes/${ath.id}`, fdToObj(fd));
    closeModal();
    showToast('Profile updated');
    renderAthleteDetail(ath.id);
  }, 'Save Changes');
}

// ── BIOMETRIC RECORD FORM ─────────────────────────────────────────────────────
function openBiometricForm(athleteId, athleteName) {
  const today = new Date().toISOString().slice(0, 10);
  const html = `
    <p class="text-muted mb-3" style="font-size:.84rem">Recording for <strong>${athleteName}</strong></p>
    <div class="row g-3">
      <div class="col-6">${fmtInput('Date *', `<input type="date" name="record_date" class="form-control" value="${today}" required>`)}</div>
      <div class="col-3">${fmtInput('Height (cm)', `<input type="number" name="height_cm" class="form-control" step="0.5" placeholder="175">`)}</div>
      <div class="col-3">${fmtInput('Weight (kg)', `<input type="number" name="weight_kg" class="form-control" step="0.1" placeholder="70.0">`)}</div>
      <div class="col-4">${fmtInput('Heart Rate (bpm)', `<input type="number" name="heart_rate" class="form-control" placeholder="62">`)}</div>
      <div class="col-4">${fmtInput('BP Systolic', `<input type="number" name="bp_systolic" class="form-control" placeholder="118">`)}</div>
      <div class="col-4">${fmtInput('BP Diastolic', `<input type="number" name="bp_diastolic" class="form-control" placeholder="76">`)}</div>
      <div class="col-4">${fmtInput('Body Fat (%)', `<input type="number" name="body_fat_pct" class="form-control" step="0.1" placeholder="12.5">`)}</div>
    </div>
    <p class="form-section-title">Wellness Ratings &nbsp;<span style="font-weight:400;text-transform:none;letter-spacing:0">1 (Low) → 10 (High)</span></p>
    ${ratingSlider('Sleep Quality', 'sleep_quality', 7)}
    ${ratingSlider('Stress Level', 'stress_level', 3)}
    ${ratingSlider('Mental Wellbeing', 'mental_wellbeing', 8)}
    ${ratingSlider('Muscle Soreness', 'soreness', 2)}`;
  showModal('Add Biometric Record', html, async fd => {
    const result = await postApi(`/api/athletes/${athleteId}/biometrics`, fdToObj(fd));
    closeModal();
    showToast(`Biometrics saved${result.bmi ? ` — BMI: ${result.bmi}` : ''}`);
    renderAthleteDetail(athleteId);
  }, 'Save Record');
}

// ── TRAINING LOAD FORM ────────────────────────────────────────────────────────
function openTrainingForm(athleteId, athleteName) {
  const today = new Date().toISOString().slice(0, 10);
  const stOpts = SESSION_TYPES.map(s => `<option>${s}</option>`).join('');
  const html = `
    <p class="text-muted mb-3" style="font-size:.84rem">Logging session for <strong>${athleteName}</strong></p>
    <div class="row g-3">
      <div class="col-6">${fmtInput('Date *', `<input type="date" name="load_date" class="form-control" value="${today}" required>`)}</div>
      <div class="col-6">${fmtInput('Session Type *', `<select name="session_type" class="form-select" required>${stOpts}</select>`)}</div>
      <div class="col-4">${fmtInput('Distance (km)', `<input type="number" name="distance_km" class="form-control" step="0.1" placeholder="8.5">`)}</div>
      <div class="col-4">${fmtInput('Duration (min)', `<input type="number" name="duration_mins" class="form-control" placeholder="60">`)}</div>
      <div class="col-4">${fmtInput('Avg Heart Rate', `<input type="number" name="heart_rate" class="form-control" placeholder="148">`)}</div>
    </div>
    <p class="form-section-title">Training Load &nbsp;<span style="font-weight:400;text-transform:none;letter-spacing:0">ACWR = ATL ÷ CTL — auto-calculated on save</span></p>
    <div class="row g-3">
      <div class="col-6">${fmtInput('ATL — Acute Load (7-day avg) *', `<input type="number" name="acute_load" class="form-control" placeholder="480" required>`)}</div>
      <div class="col-6">${fmtInput('CTL — Chronic Load (28-day avg) *', `<input type="number" name="chronic_load" class="form-control" placeholder="420" required>`)}</div>
    </div>
    <div class="mt-2 p-2 rounded" style="background:#f0f6ff;font-size:.8rem;color:#1d4ed8">
      <i class="bi bi-info-circle me-1"></i>
      Risk zones: <strong>&lt;1.3</strong> Optimal &nbsp;·&nbsp; <strong>1.3–1.5</strong> Caution &nbsp;·&nbsp; <strong>&gt;1.5</strong> High Risk
    </div>`;
  showModal('Log Training Session', html, async fd => {
    const result = await postApi(`/api/athletes/${athleteId}/training`, fdToObj(fd));
    closeModal();
    const acwr = result.acwr;
    const zone = acwr > 1.5 ? '⚠ HIGH RISK' : acwr > 1.3 ? '⚡ CAUTION' : '✓ OPTIMAL';
    showToast(`Session logged — ACWR: ${acwr} ${zone}`, acwr > 1.5 ? 'error' : 'success');
    renderAthleteDetail(athleteId);
  }, 'Log Session');
}

// ── PERFORMANCE TEST FORM ─────────────────────────────────────────────────────
function openPerformanceForm(athleteId, athleteName) {
  const today = new Date().toISOString().slice(0, 10);
  const html = `
    <p class="text-muted mb-3" style="font-size:.84rem">Recording test result for <strong>${athleteName}</strong></p>
    <div class="row g-3">
      <div class="col-6">${fmtInput('Test Date *', `<input type="date" name="test_date" class="form-control" value="${today}" required>`)}</div>
      <div class="col-6">${fmtInput('Test Type *', `<input name="test_type" class="form-control" list="ttList" placeholder="e.g. 100m Sprint" required>
        <datalist id="ttList"><option>100m Sprint</option><option>400m Run</option><option>Long Jump</option><option>High Jump</option><option>Shot Put</option><option>50m Freestyle</option><option>50m Backstroke</option><option>Vertical Jump</option><option>Bench Press 1RM</option><option>Batting Average</option><option>Punch Power</option><option>VO2 Max</option></datalist>`)}</div>
      <div class="col-4">${fmtInput('Result *', `<input type="number" name="result" class="form-control" step="0.001" placeholder="12.350" required>`)}</div>
      <div class="col-4">${fmtInput('Unit', `<input name="unit" class="form-control" list="unitList" placeholder="s, m, kg…">
        <datalist id="unitList"><option>s</option><option>m</option><option>kg</option><option>cm</option><option>N</option><option>runs</option><option>ml/kg/min</option></datalist>`)}</div>
      <div class="col-4">${fmtInput('Conditions', `<input name="conditions" class="form-control" placeholder="Track, Indoor…">`)}</div>
    </div>`;
  showModal('Record Performance Test', html, async fd => {
    await postApi(`/api/athletes/${athleteId}/performance`, fdToObj(fd));
    closeModal();
    showToast('Performance result recorded');
    renderAthleteDetail(athleteId);
  }, 'Record Test');
}

// ── ACTIVITY LOG FORM ─────────────────────────────────────────────────────────
function openActivityForm(athleteId, athleteName) {
  const today = new Date().toISOString().slice(0, 10);
  const actOpts = ACTIVITY_TYPES.map(t => `<option>${t}</option>`).join('');
  const html = `
    <p class="text-muted mb-3" style="font-size:.84rem">Logging activity for <strong>${athleteName}</strong></p>
    <div class="row g-3">
      <div class="col-6">${fmtInput('Date *', `<input type="date" name="log_date" class="form-control" value="${today}" required>`)}</div>
      <div class="col-6">${fmtInput('Activity Type *', `<select name="activity_type" class="form-select" required>${actOpts}</select>`)}</div>
      <div class="col-4">${fmtInput('Duration (min) *', `<input type="number" name="duration_mins" class="form-control" placeholder="60" required>`)}</div>
      <div class="col-4">${fmtInput('Distance (km)', `<input type="number" name="distance_km" class="form-control" step="0.1" placeholder="8.5">`)}</div>
      <div class="col-4">${fmtInput('Calories (kcal)', `<input type="number" name="calories" class="form-control" placeholder="450">`)}</div>
    </div>`;
  showModal('Log Activity', html, async fd => {
    await postApi(`/api/athletes/${athleteId}/activity`, fdToObj(fd));
    closeModal();
    showToast('Activity logged');
    renderAthleteDetail(athleteId);
  }, 'Log Activity');
}

// ── EC OFFICER FORM ───────────────────────────────────────────────────────────
function openEcOfficerForm(fedId) {
  const thisYear = new Date().getFullYear();
  const roleOpts = ['President','Secretary','Treasurer','Vice President','EC Member','Deputy Secretary'].map(r=>`<option>${r}</option>`).join('');
  const html = `
    <div class="row g-3">
      <div class="col-8">${fmtInput('Full Name *', `<input name="name" class="form-control" placeholder="e.g. Kamani Jayaratne" required>`)}</div>
      <div class="col-4">${fmtInput('Gender *', `<select name="gender" class="form-select" required><option value="M">Male</option><option value="F">Female</option></select>`)}</div>
      <div class="col-8">${fmtInput('Role / Position *', `<select name="role" class="form-select" required>${roleOpts}</select>`)}</div>
      <div class="col-4">${fmtInput('Year Appointed *', `<input type="number" name="appointed_year" class="form-control" value="${thisYear}" min="1990" max="${thisYear}" required>`)}</div>
    </div>`;
  showModal('Add EC Officer', html, async fd => {
    await postApi(`/api/federations/${fedId}/ec-officers`, fdToObj(fd));
    closeModal();
    showToast('EC Officer added to register');
    renderFederationDetail(fedId);
  }, 'Add Officer');
}

// ── COMPLIANCE UPDATE FORM ────────────────────────────────────────────────────
async function openComplianceForm(fedId) {
  const f = await api(`/api/federations/${fedId}`);
  if (!f) return;
  const thisYear = new Date().getFullYear();
  const html = `
    <p class="text-muted mb-3" style="font-size:.82rem">Updating statutory compliance data for <strong>${f.name}</strong></p>
    <p class="form-section-title">Gazette Compliance Dates</p>
    <div class="row g-3">
      <div class="col-6">${fmtInput('AGM Date', `<input type="date" name="agm_last_date" class="form-control" value="${f.agm_last_date||''}">`)}</div>
      <div class="col-6">${fmtInput('Financial Stmt Submitted', `<input type="date" name="financial_stmt_date" class="form-control" value="${f.financial_stmt_date||''}">`)}</div>
      <div class="col-6">${fmtInput('Strategic Plan Year', `<input type="number" name="strategic_plan_year" class="form-control" value="${f.strategic_plan_year||''}" min="2020" max="${thisYear+2}" placeholder="${thisYear}">`)}</div>
      <div class="col-6">${fmtInput('National Championship Date', `<input type="date" name="national_championship_date" class="form-control" value="${f.national_championship_date||''}">`)}</div>
    </div>
    <p class="form-section-title mt-3">Federation Grading Inputs</p>
    <div class="row g-3">
      <div class="col-6">${fmtInput('Affiliated Clubs / District Assoc.', `<input type="number" name="affiliated_clubs" class="form-control" value="${f.affiliated_clubs||0}" min="0" placeholder="No. of affiliated clubs">`)}</div>
      <div class="col-6">${fmtInput('Annual Turnover (LKR)', `<input type="number" name="annual_turnover" class="form-control" value="${f.annual_turnover||0}" min="0" placeholder="e.g. 5000000">`)}</div>
    </div>`;
  showModal('Update Compliance Data', html, async fd => {
    await putApi(`/api/federations/${fedId}/compliance`, fdToObj(fd));
    closeModal();
    showToast('Compliance data updated');
    renderFederationDetail(fedId);
  }, 'Save');
}

// ── SETTINGS ───────────────────────────────────────────────────────────────────
function renderSettings() {
  setContent(`
    <div class="page-header">
      <div><h1 class="page-title">Settings</h1><p class="page-subtitle">Platform configuration and user management</p></div>
    </div>
    <div class="row g-3">
      <div class="col-md-6">
        <div class="panel">
          <div class="panel-header"><span class="panel-title">Current User</span></div>
          <div class="panel-body">
            <div class="d-flex align-items-center gap-3 mb-3">
              <div class="user-avatar" style="width:52px;height:52px;font-size:1rem;background:var(--brand)">${currentUser?.initials||'NA'}</div>
              <div><div class="fw-bold">${currentUser?.name||'—'}</div><div class="text-muted">${currentUser?.role||'—'}</div></div>
            </div>
            <button class="btn btn-sm btn-outline-danger" onclick="document.getElementById('logoutBtn').click()"><i class="bi bi-box-arrow-right me-1"></i>Sign Out</button>
          </div>
        </div>
      </div>
      <div class="col-md-6">
        <div class="panel">
          <div class="panel-header"><span class="panel-title">Platform Info</span></div>
          <div class="panel-body">
            ${[['Version','SLSIE v1.0 (Demo)'],['Database','SQLite (node:sqlite)'],['AI Engine','Anthropic Claude API (configured)'],['Last Seeded','On startup'],['Federations','34 loaded'],['Athletes','47 tracked']].map(([k,v])=>`
              <div class="d-flex justify-content-between py-2 border-bottom">
                <span class="text-muted">${k}</span><span class="fw-semibold">${v}</span>
              </div>`).join('')}
          </div>
        </div>
      </div>
    </div>
  `);
}

// ── CHATBOT ───────────────────────────────────────────────────────────────────
let chatHistory = [];

function toggleChatbot() {
  const panel = document.getElementById('chatbotPanel');
  const icon  = document.getElementById('chatbotIcon');
  const isHidden = panel.classList.contains('d-none');
  panel.classList.toggle('d-none', !isHidden);
  if (!isHidden) panel.classList.remove('maximized');
  icon.className = isHidden ? 'bi bi-x-lg' : 'bi bi-stars';
  if (isHidden) setTimeout(() => document.getElementById('chatbotInput')?.focus(), 50);
}

function toggleMaximize() {
  const panel  = document.getElementById('chatbotPanel');
  const btn    = document.getElementById('chatbotMaxBtn');
  const isMax  = panel.classList.toggle('maximized');
  btn.innerHTML = isMax
    ? '<i class="bi bi-fullscreen-exit"></i>'
    : '<i class="bi bi-arrows-fullscreen"></i>';
  btn.title = isMax ? 'Restore' : 'Expand';
  setTimeout(() => document.getElementById('chatbotMessages').scrollTop = 99999, 280);
}

async function sendChat() {
  const input = document.getElementById('chatbotInput');
  const msg   = input.value.trim();
  if (!msg) return;
  input.value = '';
  const btn = document.getElementById('chatbotSendBtn');
  btn.disabled = true;

  appendChatMsg(msg, 'user');
  const typingEl = appendChatMsg('Thinking…', 'ai', true);

  try {
    const r = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: msg, history: chatHistory }),
    });
    const d = await r.json();
    typingEl.remove();
    const reply = d.reply || 'Sorry, I couldn\'t generate a response right now.';
    appendChatMsg(reply, 'ai', false, msg);
    chatHistory.push({ role: 'user', content: msg });
    chatHistory.push({ role: 'assistant', content: reply });
    if (chatHistory.length > 12) chatHistory = chatHistory.slice(-12);
  } catch {
    typingEl.remove();
    appendChatMsg('Connection error — please try again.', 'ai');
  }
  btn.disabled = false;
  input.focus();
}

let _chatTableIdx = 0;

function chatMarkdown(text, question = '') {
  const lines = text.split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim().startsWith('|')) {
      const tableLines = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i]);
        i++;
      }
      const rows = tableLines.filter(l => !/^\s*\|[\s\-:|]+\|\s*$/.test(l));
      const tid = `cht-${++_chatTableIdx}`;
      let tableHtml = `<table class="chat-table" id="${tid}"><thead>`;
      rows.forEach((row, ri) => {
        const cells = row.split('|').slice(1, -1).map(c => c.trim());
        if (ri === 0) {
          tableHtml += '<tr>' + cells.map(c => `<th>${inlineMarkdown(c)}</th>`).join('') + '</tr></thead><tbody>';
        } else {
          tableHtml += '<tr>' + cells.map(c => `<td>${inlineMarkdown(c)}</td>`).join('') + '</tr>';
        }
      });
      tableHtml += '</tbody></table>';
      const safeQ = question.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
      out.push(`
        <div class="chat-table-wrap" data-question="${safeQ}">
          <div class="chat-table-export">
            <span class="chat-export-label">Export:</span>
            <button class="chat-export-btn excel" onclick="exportChatTable('${tid}','excel')" title="Download Excel (.xlsx)"><i class="bi bi-file-earmark-excel-fill"></i> Excel</button>
            <button class="chat-export-btn pdf"   onclick="exportChatTable('${tid}','pdf')"   title="Download PDF"><i class="bi bi-file-earmark-pdf-fill"></i> PDF</button>
            <button class="chat-export-btn word"  onclick="exportChatTable('${tid}','word')"  title="Download Word (.doc)"><i class="bi bi-file-earmark-word-fill"></i> Word</button>
          </div>
          ${tableHtml}
        </div>`);
    } else {
      const trimmed = line.trim();
      if (trimmed === '') {
        out.push('<br>');
      } else {
        out.push(`<p>${inlineMarkdown(trimmed)}</p>`);
      }
      i++;
    }
  }
  return out.join('');
}

function inlineMarkdown(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>');
}

function appendChatMsg(text, who, isTyping = false, question = '') {
  const msgs = document.getElementById('chatbotMessages');
  const div  = document.createElement('div');
  div.className = `chat-msg chat-${who}${isTyping ? ' chat-typing' : ''}`;
  const inner = isTyping ? text : chatMarkdown(text, question);
  div.innerHTML = `<div class="chat-bubble">${inner}</div>`;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
  return div;
}

// ── CHATBOT TABLE EXPORT ─────────────────────────────────────────────────────
function exportChatTable(tableId, format) {
  const table    = document.getElementById(tableId);
  if (!table) return;
  const wrap     = table.closest('.chat-table-wrap');
  const question = wrap?.dataset.question || '';
  const headers  = [...table.querySelectorAll('thead th')].map(th => th.innerText.trim());
  const rows     = [...table.querySelectorAll('tbody tr')].map(tr =>
    [...tr.querySelectorAll('td')].map(td => td.innerText.trim())
  );
  const filename = 'SLSIE_' + new Date().toISOString().slice(0, 10);
  if (format === 'excel') _exportXlsx(headers, rows, filename, question);
  if (format === 'pdf')   _exportPdf(headers, rows, filename, question);
  if (format === 'word')  _exportWord(headers, rows, filename, question);
}

function _exportXlsx(headers, rows, filename, question) {
  const dateStr  = new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'long', year:'numeric' });
  const titleRow = ['SLSIE — Sri Lanka Sports Intelligence Ecosystem'];
  const queryRow = question ? [`Query: ${question}`] : [];
  const dateRow  = [`Generated: ${dateStr} | Source: AI Assistant Chat`];
  const aoa = [titleRow, ...queryRow, dateRow, [], headers, ...rows];
  const ws  = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = headers.map(() => ({ wch: 24 }));
  // Bold the title row
  ws['A1'] = { v: titleRow[0], t: 's', s: { font: { bold: true, sz: 14 } } };
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'SLSIE Data');
  XLSX.writeFile(wb, filename + '.xlsx');
}

function _exportPdf(headers, rows, filename, question) {
  const dateStr  = new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'long', year:'numeric' });
  const queryBlock = question
    ? `<div class="query"><strong>Query:</strong> ${question}</div>`
    : '';
  const rowsHtml = rows.map(r =>
    '<tr>' + r.map(c => `<td>${c}</td>`).join('') + '</tr>'
  ).join('');
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${filename}</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:'Segoe UI',Arial,sans-serif;padding:32px 40px;color:#1e293b;font-size:10pt}
      .org{font-size:7.5pt;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px}
      h2{font-size:15pt;font-weight:800;color:#1F4E79;margin-bottom:4px}
      .meta{font-size:8pt;color:#94a3b8;margin-bottom:10px}
      .query{background:#eff6ff;border-left:3px solid #3b82f6;padding:8px 12px;font-size:9pt;color:#1e3a5f;margin-bottom:18px;border-radius:0 6px 6px 0}
      table{width:100%;border-collapse:collapse;font-size:9.5pt;margin-top:4px}
      thead th{background:#1F4E79;color:#fff;padding:8px 10px;text-align:left;font-size:8.5pt;font-weight:600}
      tbody td{border:1px solid #e2e8f0;padding:7px 10px;color:#1e293b}
      tbody tr:nth-child(even) td{background:#f8faff}
      .footer{margin-top:24px;border-top:1px solid #e2e8f0;padding-top:8px;font-size:7.5pt;color:#94a3b8;display:flex;justify-content:space-between}
      @media print{@page{margin:1.2cm 1.5cm}body{padding:0}}
    </style>
    <script>window.onload=()=>setTimeout(()=>window.print(),400);<\/script>
    </head><body>
    <div class="org">National Olympic Committee of Sri Lanka · SLSIE v1.0</div>
    <h2>AI Assistant Query Report</h2>
    <div class="meta">Generated: ${dateStr} &nbsp;|&nbsp; Source: AI Chat Assistant</div>
    ${queryBlock}
    <table>
      <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>
    <div class="footer">
      <span>SLSIE — Sri Lanka Sports Intelligence Ecosystem</span>
      <span>Classification: Internal Use</span>
    </div>
    </body></html>`;
  const win = window.open('', '_blank', 'width=900,height=680');
  win.document.write(html);
  win.document.close();
}

function _exportWord(headers, rows, filename, question) {
  const dateStr  = new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'long', year:'numeric' });
  const queryBlock = question
    ? `<div class="query"><strong>Query:</strong> ${question}</div>`
    : '';
  const rowsHtml = rows.map(r =>
    '<tr>' + r.map(c => `<td>${c}</td>`).join('') + '</tr>'
  ).join('');
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
    xmlns:w="urn:schemas-microsoft-com:office:word"
    xmlns="http://www.w3.org/TR/REC-html40">
    <head><meta charset="utf-8">
    <style>
      body{font-family:Arial,sans-serif;font-size:10pt;color:#1e293b;margin:2cm}
      .org{font-size:7pt;color:#94a3b8;text-transform:uppercase;letter-spacing:.5pt;margin-bottom:4pt}
      h2{font-size:15pt;font-weight:bold;color:#1F4E79;margin:0 0 4pt}
      .meta{font-size:8pt;color:#94a3b8;margin-bottom:8pt}
      .query{background:#eff6ff;border-left:3pt solid #3b82f6;padding:6pt 10pt;font-size:9pt;color:#1e3a5f;margin-bottom:14pt}
      table{width:100%;border-collapse:collapse}
      thead th{background:#1F4E79;color:#fff;padding:6pt 8pt;text-align:left;font-size:9pt;font-weight:bold}
      tbody td{border:1pt solid #cbd5e1;padding:5pt 8pt;font-size:9.5pt;color:#1e293b}
    </style></head><body>
    <div class="org">National Olympic Committee of Sri Lanka · SLSIE v1.0</div>
    <h2>AI Assistant Query Report</h2>
    <div class="meta">Generated: ${dateStr} | Source: AI Chat Assistant</div>
    ${queryBlock}
    <table>
      <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>
    </body></html>`;
  const blob = new Blob(['﻿' + html], { type: 'application/msword' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename + '.doc';
  a.click();
  URL.revokeObjectURL(a.href);
}

// ── AI INSIGHT HELPERS ────────────────────────────────────────────────────────
function aiInsightSkeletonHtml(containerId, label) {
  return `<div id="${containerId}">
    <div class="panel mt-3">
      <div class="panel-header"><span class="panel-title"><i class="bi bi-stars me-1" style="color:#7c3aed"></i>${label}</span></div>
      <div class="panel-body">
        <div class="ai-insight-panel">
          <div class="ai-insight-header">
            <div class="ai-insight-icon"><i class="bi bi-stars"></i></div>
            <div class="ai-insight-label">AI Analysis · Loading</div>
          </div>
          <div class="ai-insight-skeleton">
            <div class="ai-skel-line" style="width:95%"></div>
            <div class="ai-skel-line" style="width:82%"></div>
            <div class="ai-skel-line" style="width:88%"></div>
          </div>
        </div>
      </div>
    </div>
  </div>`;
}

function renderAiInsight(containerId, label, text) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (!text) { el.innerHTML = ''; return; }
  el.innerHTML = `
    <div class="panel mt-3">
      <div class="panel-header"><span class="panel-title"><i class="bi bi-stars me-1" style="color:#7c3aed"></i>${label}</span></div>
      <div class="panel-body">
        <div class="ai-insight-panel">
          <div class="ai-insight-header">
            <div class="ai-insight-icon"><i class="bi bi-stars"></i></div>
            <div class="ai-insight-label">AI Analysis · SLSIE Intelligence Engine</div>
          </div>
          <div class="ai-insight-text">${insightMarkdown(text)}</div>
        </div>
      </div>
    </div>`;
}

function insightMarkdown(raw) {
  // Safety net: if AI puts labelled sections inline on one line, split them onto their own lines
  // e.g. "**Key Finding:** ... **Recommendation:** ..." → each on its own paragraph
  const text = raw
    .replace(/\s+\*\*([^*]+:)\*\*/g, '\n\n**$1**')  // break before **Label:** mid-sentence
    .trim();

  return text.split('\n').map(line => {
    const t = line.trim();
    if (!t) return '';
    if (t.startsWith('### ')) return `<h4 class="ai-h4">${inlineMarkdown(t.slice(4))}</h4>`;
    if (t.startsWith('## '))  return `<h3 class="ai-h3">${inlineMarkdown(t.slice(3))}</h3>`;
    if (t.startsWith('# '))   return `<h3 class="ai-h3">${inlineMarkdown(t.slice(2))}</h3>`;
    if (t.startsWith('- ') || t.startsWith('* ')) return `<li>${inlineMarkdown(t.slice(2))}</li>`;
    return `<p class="ai-p">${inlineMarkdown(t)}</p>`;
  }).join('').replace(/(<li>.*?<\/li>)+/gs, m => `<ul class="ai-ul">${m}</ul>`);
}
