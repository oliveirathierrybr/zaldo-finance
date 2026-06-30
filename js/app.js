/* global Chart, firebase */
'use strict';

/* =====================================================
   ZALDO FINANCE · app.js
   ─────────────────────────────────────────
    1.  Chart plugin
    2.  Config & constantes
    3.  Estado global
    4.  Storage (Firebase Realtime Database)
    5.  Utilitários & animações
    6.  Cálculos
    7.  Auth helpers
    8.  Toast & Skeleton
    9.  Dashboard — cards, progresso, gráfico, lista
   10.  Insights & Zaldo IA
   11.  Saúde financeira & Streak
   12.  Categorias — dropdown, grid, CRUD
   13.  CRUD lançamentos
   14.  Modal — Resumo do Mês
   15.  Modal — Histórico
   16.  Init & eventos
   ===================================================== */


// ─── 1. CHART PLUGIN ──────────────────────────────
const centerLabelPlugin = {
  id: 'centerLabel',
  beforeDraw(chart) {
    if (chart.config.type !== 'doughnut') return;
    const { ctx, chartArea } = chart;
    if (!chartArea) return;
    const total = chart.data.datasets[0].data.reduce((s, v) => s + v, 0);
    if (!total) return;
    const cx = (chartArea.left + chartArea.right) / 2;
    const cy = (chartArea.top  + chartArea.bottom) / 2;
    const lt = document.body.classList.contains('light');
    ctx.save();
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.font         = '600 10px "Plus Jakarta Sans", sans-serif';
    ctx.fillStyle    = lt ? '#94a3b8' : '#64748b';
    ctx.fillText('TOTAL', cx, cy - 12);
    ctx.font         = '700 13px "Plus Jakarta Sans", sans-serif';
    ctx.fillStyle    = lt ? '#0f172a' : '#f1f5f9';
    ctx.fillText(fmtCurrency(total), cx, cy + 8);
    ctx.restore();
  },
};
Chart.register(centerLabelPlugin);


// ─── 2. CONFIG & CONSTANTES ───────────────────────
const DEFAULT_CATEGORIES = {
  moradia:      { name: 'Moradia',      icon: '🏠', color: '#2563eb' },
  alimentacao:  { name: 'Alimentação',  icon: '🍽️', color: '#f59e0b' },
  investimento: { name: 'Investimento', icon: '📈', color: '#10b981' },
  lazer:        { name: 'Lazer',        icon: '🎮', color: '#8b5cf6' },
  transporte:   { name: 'Transporte',   icon: '🚗', color: '#06b6d4' },
  saude:        { name: 'Saúde',        icon: '💊', color: '#f43f5e' },
  outros:       { name: 'Outros',       icon: '📦', color: '#94a3b8' },
};

const STREAK_TIERS = [
  { min: 0,  icon: '🌱', badge: null,        color: null,      anim: false, sub: 'Comece agora!'      },
  { min: 1,  icon: '⭐', badge: 'Iniciante',  color: '#f59e0b', anim: false, sub: 'Bom começo!'        },
  { min: 2,  icon: '💪', badge: 'Constante',  color: '#3b82f6', anim: false, sub: 'Ganhando ritmo!'    },
  { min: 3,  icon: '🔥', badge: 'Em Chamas',  color: '#f97316', anim: true,  sub: 'Sequência no azul!' },
  { min: 6,  icon: '⚡', badge: 'Imparável',  color: '#8b5cf6', anim: true,  sub: 'Você é incrível!'   },
  { min: 12, icon: '👑', badge: 'Lendário',   color: '#7c3aed', anim: true,  sub: 'Nível máximo! 🚀'   },
];


// ─── 3. ESTADO GLOBAL ─────────────────────────────
let currentDate      = new Date();
let activeFilter     = 'all';
let customCategories = [];
let chart            = null;
let monthData        = { salary: 0, expenses: [] };
const _prev          = { salary: 0, total: 0, balance: 0, invested: 0 };

// Firebase state
let _uid   = null;
let _cache = {};


// ─── 4. STORAGE (Firebase Realtime Database) ──────
function toArr(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val.filter(Boolean);
  return Object.values(val);
}

function dbRef(path) {
  return firebase.database().ref(`users/${_uid}/${path}`);
}

function loadMonth(key) {
  const d = _cache[key];
  if (!d) return { salary: 0, expenses: [] };
  return { salary: d.salary || 0, expenses: toArr(d.expenses) };
}

function saveMonth(key, data) {
  const expenses = data.expenses || [];
  const expObj   = {};
  expenses.forEach(e => { expObj[String(e.id)] = e; });

  _cache[key] = { salary: data.salary || 0, expenses: [...expenses] };

  if (!_uid) return;
  dbRef(`months/${key}`).set({
    salary: data.salary || 0,
    ...(Object.keys(expObj).length ? { expenses: expObj } : {}),
  });
}

function loadCategories() { return toArr(_cache['_cats']); }

function saveCategories(cats) {
  _cache['_cats'] = [...cats];
  if (!_uid) return;
  if (!cats.length) { dbRef('categories').remove(); return; }
  const obj = {};
  cats.forEach(c => { obj[c.id] = c; });
  dbRef('categories').set(obj);
}

function loadAllMonths() {
  return Object.fromEntries(
    Object.entries(_cache)
      .filter(([k]) => k !== '_cats')
      .map(([k])    => [k, loadMonth(k)])
      .sort(([a], [b]) => b.localeCompare(a))
  );
}

async function loadUserData(uid) {
  const snap = await firebase.database().ref(`users/${uid}`).once('value');
  const raw  = snap.val() || {};
  _cache = {};
  if (raw.months) {
    Object.entries(raw.months).forEach(([key, val]) => {
      _cache[key] = {
        salary:   val.salary || 0,
        expenses: toArr(val.expenses),
      };
    });
  }
  _cache['_cats'] = raw.categories ? toArr(raw.categories) : [];
}


// ─── 5. UTILITÁRIOS & ANIMAÇÕES ───────────────────
function getMonthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function fmtCurrency(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

function fmtDate(s) {
  if (!s) return '';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}

function fmtMonthLabel(date) {
  const month = date.toLocaleDateString('pt-BR', { month: 'long' });
  const year  = date.getFullYear();
  return `${month.charAt(0).toUpperCase()}${month.slice(1).toLowerCase()} de ${year}`;
}

function todayISO() { return new Date().toISOString().split('T')[0]; }

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function colorBg(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},0.12)`;
}

function getAllCategories() {
  const result = { ...DEFAULT_CATEGORIES };
  customCategories.forEach(c => { result[c.id] = { name: c.name, icon: c.icon, color: c.color }; });
  return result;
}

function animateCounter(el, from, to, ms = 550) {
  const t0 = performance.now();
  const tick = now => {
    const p = Math.min((now - t0) / ms, 1);
    const e = 1 - Math.pow(1 - p, 3);
    el.textContent = fmtCurrency(from + (to - from) * e);
    p < 1 ? requestAnimationFrame(tick) : (el.textContent = fmtCurrency(to));
  };
  requestAnimationFrame(tick);
}

function animateInt(el, from, to, ms = 500) {
  const t0 = performance.now();
  const tick = now => {
    const p = Math.min((now - t0) / ms, 1);
    const e = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(from + (to - from) * e);
    p < 1 ? requestAnimationFrame(tick) : (el.textContent = to);
  };
  requestAnimationFrame(tick);
}


// ─── 6. CÁLCULOS ──────────────────────────────────
function calcTotals(data) {
  const salary   = data.salary || 0;
  const expenses = data.expenses || [];
  const total    = expenses.reduce((s, e) => s + e.amount, 0);
  const invested = expenses
    .filter(e => e.category === 'investimento')
    .reduce((s, e) => s + e.amount, 0);
  return {
    salary, total, invested,
    balance: salary - total,
    percent: salary > 0 ? (total / salary) * 100 : 0,
  };
}

function calcByCategory(expenses) {
  const result = {};
  Object.keys(getAllCategories()).forEach(k => {
    result[k] = expenses.filter(e => e.category === k).reduce((s, e) => s + e.amount, 0);
  });
  return result;
}

function calcHealthScore(totals) {
  if (!totals.salary) return { score: 0, label: 'Sem dados', level: 'danger' };
  let score = 45;
  if (totals.balance >= 0) score += 25; else score -= 20;
  if (totals.percent < 70) score += 15; else if (totals.percent > 90) score -= 15;
  if (totals.invested > 0) score += Math.min((totals.invested / totals.salary) * 100, 15);
  score = Math.max(0, Math.min(100, Math.round(score)));
  let label, level;
  if      (score >= 75) { label = 'Excelente 🏆'; level = '';       }
  else if (score >= 50) { label = 'Saudável ✅';  level = '';       }
  else if (score >= 30) { label = 'Atenção ⚡';   level = 'warn';   }
  else                  { label = 'Crítico 🚨';   level = 'danger'; }
  return { score, label, level };
}

function calcDaysInGreen(data) {
  if (!data.salary || !data.expenses?.length) return 0;
  const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
  const sorted = [...data.expenses].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  let cumulative = 0;
  for (const exp of sorted) {
    cumulative += exp.amount;
    if (cumulative > data.salary) {
      return Math.max(0, parseInt(exp.date?.split('-')[2] || '0', 10) - 1);
    }
  }
  return daysInMonth;
}


// ─── 7. AUTH HELPERS ──────────────────────────────
function translateAuthError(code) {
  const map = {
    'auth/user-not-found':         'E-mail não encontrado.',
    'auth/wrong-password':         'Senha incorreta.',
    'auth/email-already-in-use':   'Este e-mail já está em uso.',
    'auth/weak-password':          'Senha muito fraca (mínimo 6 caracteres).',
    'auth/invalid-email':          'E-mail inválido.',
    'auth/invalid-credential':     'E-mail ou senha incorretos.',
    'auth/too-many-requests':      'Muitas tentativas. Tente novamente mais tarde.',
    'auth/network-request-failed': 'Sem conexão. Verifique sua internet.',
  };
  return map[code] || 'Erro ao autenticar. Tente novamente.';
}

function setLoginLoading(btnId, loading) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = loading;
  btn.querySelector('.btn-label').classList.toggle('hidden', loading);
  btn.querySelector('.btn-spinner').classList.toggle('hidden', !loading);
}

function showLoginUI() {
  document.getElementById('splashScreen').classList.add('hidden');
  document.getElementById('loginScreen').classList.remove('hidden');
  document.querySelector('.app').classList.add('hidden');
  document.getElementById('fabBtn').classList.add('hidden');
  document.getElementById('bottomNav').classList.add('hidden');
}

function showAppUI(user) {
  document.getElementById('splashScreen').classList.add('hidden');
  document.getElementById('loginScreen').classList.add('hidden');
  document.querySelector('.app').classList.remove('hidden');
  document.getElementById('fabBtn').classList.remove('hidden');
  document.getElementById('bottomNav').classList.remove('hidden');

  const name = user.displayName || user.email.split('@')[0];
  document.getElementById('userDisplayName').textContent = name;
  document.getElementById('userAvatar').textContent = name.charAt(0).toUpperCase();
}


// ─── 8. TOAST & SKELETON ──────────────────────────
let _toastTimer = null;

function showToast(msg, type = 'success') {
  const el = document.getElementById('toast');
  clearTimeout(_toastTimer);
  el.textContent = msg;
  el.className   = `toast toast--${type}`;
  el.classList.remove('hidden');
  _toastTimer = setTimeout(() => el.classList.add('hidden'), 3000);
}

function showSkeleton() {
  document.getElementById('expenseList').innerHTML = Array(4).fill('').map(() => `
    <li style="padding:10px 12px;display:flex;gap:12px;align-items:center">
      <div class="skeleton" style="width:38px;height:38px;border-radius:10px;flex-shrink:0"></div>
      <div style="flex:1;display:flex;flex-direction:column;gap:7px">
        <div class="skeleton" style="height:12px;width:55%"></div>
        <div class="skeleton" style="height:10px;width:35%"></div>
      </div>
      <div class="skeleton" style="height:12px;width:64px"></div>
    </li>`).join('');
}


// ─── 9. DASHBOARD ─────────────────────────────────
function updateCards(totals) {
  animateCounter(document.getElementById('cardSalary'),   _prev.salary,   totals.salary);
  animateCounter(document.getElementById('cardExpenses'), _prev.total,    totals.total);
  animateCounter(document.getElementById('cardSavings'),  _prev.invested, totals.invested);

  const balEl = document.getElementById('cardBalance');
  animateCounter(balEl, _prev.balance, totals.balance);
  balEl.className = 'card-value ' + (totals.balance >= 0 ? 'positive' : 'negative');

  const balCard = document.querySelector('.card--balance');
  if (balCard) {
    balCard.style.boxShadow = totals.balance >= 0
      ? '0 8px 32px rgba(0,0,0,0.35), 0 0 32px rgba(52,211,153,0.15)'
      : '0 8px 32px rgba(0,0,0,0.35), 0 0 32px rgba(248,113,113,0.15)';
  }

  _prev.salary   = totals.salary;
  _prev.total    = totals.total;
  _prev.balance  = totals.balance;
  _prev.invested = totals.invested;
}

function updateProgress(percent) {
  const fill = document.getElementById('progressFill');
  document.getElementById('progressPercent').textContent = `${percent.toFixed(1)}%`;
  fill.style.width = `${Math.min(percent, 100).toFixed(1)}%`;
  fill.className   = 'progress-fill';
  if      (percent >= 90) fill.classList.add('danger');
  else if (percent >= 70) fill.classList.add('warn');
}

function updateChart(expenses, totalExpenses) {
  const cats     = getAllCategories();
  const bycat    = calcByCategory(expenses);
  const entries  = Object.entries(bycat).filter(([, v]) => v > 0);
  const wrapEl   = document.getElementById('chartWrapper');
  const emptyEl  = document.getElementById('chartEmpty');
  const legendEl = document.getElementById('categoryLegend');

  if (!entries.length) {
    wrapEl.classList.remove('visible');
    emptyEl.classList.remove('hidden');
    legendEl.innerHTML = '';
    if (chart) { chart.destroy(); chart = null; }
    return;
  }

  wrapEl.classList.add('visible');
  emptyEl.classList.add('hidden');

  const labels = entries.map(([k]) => cats[k]?.name || k);
  const data   = entries.map(([, v]) => v);
  const colors = entries.map(([k]) => cats[k]?.color || '#94a3b8');

  if (chart) {
    chart.data.labels                      = labels;
    chart.data.datasets[0].data            = data;
    chart.data.datasets[0].backgroundColor = colors;
    chart.update();
  } else {
    chart = new Chart(document.getElementById('expenseChart').getContext('2d'), {
      type: 'doughnut',
      data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 3, borderColor: '#fff', hoverOffset: 8 }] },
      options: {
        responsive: true, maintainAspectRatio: true, cutout: '70%',
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label(ctx) {
                const pct = totalExpenses > 0 ? ((ctx.raw / totalExpenses) * 100).toFixed(1) : 0;
                return ` ${fmtCurrency(ctx.raw)} · ${pct}%`;
              },
            },
          },
        },
      },
    });
  }

  legendEl.innerHTML = [...entries]
    .sort(([, a], [, b]) => b - a)
    .map(([k, v]) => {
      const cat = cats[k] || { name: k, icon: '📦', color: '#94a3b8' };
      const pct = totalExpenses > 0 ? ((v / totalExpenses) * 100).toFixed(1) : 0;
      return `
        <div class="legend-item">
          <span class="legend-dot" style="background:${cat.color}"></span>
          <span class="legend-name">${cat.icon} ${cat.name}</span>
          <span class="legend-amount">${fmtCurrency(v)}</span>
          <span class="legend-percent">${pct}%</span>
        </div>`;
    }).join('');
}

function updateExpenseList(expenses) {
  const cats     = getAllCategories();
  const list     = document.getElementById('expenseList');
  const filtered = activeFilter === 'all'
    ? expenses
    : expenses.filter(e => e.category === activeFilter);

  if (!filtered.length) {
    const msg = activeFilter === 'all'
      ? 'Nenhum lançamento ainda'
      : `Nenhum gasto em "${cats[activeFilter]?.name || activeFilter}"`;
    list.innerHTML = `<li class="empty-state"><div class="empty-icon">📋</div><p>${msg}</p></li>`;
    return;
  }

  list.innerHTML = [...filtered]
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .map(exp => {
      const cat = cats[exp.category] || cats.outros;
      return `
        <li class="expense-item" style="--item-color:${cat.color}">
          <div class="expense-cat-icon" style="background:${colorBg(cat.color)}">${cat.icon}</div>
          <div class="expense-info">
            <div class="expense-desc">${escapeHtml(exp.description)}</div>
            <div class="expense-meta">${cat.name}${exp.date ? ' · ' + fmtDate(exp.date) : ''}</div>
          </div>
          <div class="expense-amount">${fmtCurrency(exp.amount)}</div>
          <button class="expense-delete" data-id="${exp.id}" title="Remover">✕</button>
        </li>`;
    }).join('');

  list.querySelectorAll('.expense-delete').forEach(btn => {
    btn.addEventListener('click', () => deleteExpense(btn.dataset.id));
  });
}

function rebuildFilterTabs() {
  const cats = getAllCategories();
  const el   = document.getElementById('filterTabs');
  let html   = `<button class="tab ${activeFilter === 'all' ? 'active' : ''}" data-filter="all">Todos</button>`;
  Object.entries(cats).forEach(([id, cat]) => {
    html += `<button class="tab ${activeFilter === id ? 'active' : ''}" data-filter="${id}" title="${cat.name}">${cat.icon}</button>`;
  });
  el.innerHTML = html;
}

function buildCategoryOptionsHTML() {
  const cats      = getAllCategories();
  const customIds = customCategories.map(c => c.id);
  const groups    = [
    { label: 'Gasto Fixo',        ids: ['moradia'] },
    { label: 'Gasto Variável',    ids: ['alimentacao', 'lazer', 'transporte', 'saude', 'outros'] },
    { label: 'Investimento',      ids: ['investimento'] },
    { label: 'Minhas Categorias', ids: customIds },
  ];

  let html = '<option value="">Selecione...</option>';
  groups.forEach(({ label, ids }) => {
    const valid = ids.filter(id => cats[id]);
    if (!valid.length) return;
    html += `<optgroup label="${label}">`;
    valid.forEach(id => { html += `<option value="${id}">${cats[id].icon} ${cats[id].name}</option>`; });
    html += '</optgroup>';
  });
  return html;
}

function rebuildCategoryDropdown() {
  const html = buildCategoryOptionsHTML();
  document.getElementById('expenseCategory').innerHTML = html;
  const sheetSel = document.getElementById('qCategory');
  if (sheetSel) sheetSel.innerHTML = html;
}

function render() {
  const expenses = monthData.expenses || [];
  const totals   = calcTotals(monthData);

  document.getElementById('monthLabel').textContent = fmtMonthLabel(currentDate);
  document.getElementById('salaryInput').value      = monthData.salary > 0 ? monthData.salary : '';

  updateCards(totals);
  updateProgress(totals.percent);
  updateChart(expenses, totals.total);
  rebuildFilterTabs();
  updateExpenseList(expenses);
  renderInsights(monthData);
  renderHealthScore(totals);
  buildAIInsights(monthData);
}


// ─── 10. INSIGHTS & ZALDO IA ──────────────────────
function generateInsights(data) {
  const totals   = calcTotals(data);
  const expenses = data.expenses || [];
  const insights = [];

  if (!totals.salary) {
    insights.push({ type: 'info', icon: '👋', text: 'Bem-vindo ao Zaldo!', sub: 'Insira seu salário acima para ver insights personalizados' });
    return insights;
  }

  if (totals.balance >= 0) {
    const pct = ((totals.balance / totals.salary) * 100).toFixed(0);
    insights.push({ type: 'positive', icon: '💚', text: 'Você está no azul!', sub: `Saldo de ${fmtCurrency(totals.balance)} — ${pct}% do salário disponível` });
  } else {
    insights.push({ type: 'danger', icon: '🚨', text: 'Gastos acima do salário', sub: `Excedente de ${fmtCurrency(Math.abs(totals.balance))} — revise seus gastos` });
  }

  if (totals.invested > 0) {
    const pct = ((totals.invested / totals.salary) * 100).toFixed(0);
    insights.push({ type: 'positive', icon: '📈', text: `Investindo ${pct}% do salário`, sub: `${fmtCurrency(totals.invested)} aplicados este mês — continue assim!` });
  }

  if (totals.percent >= 90 && totals.balance >= 0) {
    insights.push({ type: 'warning', icon: '⚡', text: 'Orçamento quase no limite', sub: `${totals.percent.toFixed(0)}% do salário comprometido — fique atento` });
  }

  const cats     = getAllCategories();
  const bycat    = calcByCategory(expenses);
  const topEntry = Object.entries(bycat).filter(([, v]) => v > 0).sort(([, a], [, b]) => b - a)[0];
  if (topEntry) {
    const [k, v] = topEntry;
    const cat    = cats[k];
    const pct    = totals.total > 0 ? ((v / totals.total) * 100).toFixed(0) : 0;
    insights.push({ type: 'info', icon: cat?.icon || '📦', text: `Maior gasto: ${cat?.name || k}`, sub: `${fmtCurrency(v)} — ${pct}% dos seus gastos este mês` });
  }

  return insights.slice(0, 3);
}

function renderInsights(data) {
  const el = document.getElementById('insightsSection');
  if (!el) return;
  el.innerHTML = generateInsights(data).map(i => `
    <div class="insight-card insight--${i.type}">
      <span class="insight-icon">${i.icon}</span>
      <div class="insight-text">${escapeHtml(i.text)}<span>${escapeHtml(i.sub)}</span></div>
    </div>`).join('');
}

function buildAIInsights(data) {
  const el = document.getElementById('aiSection');
  if (!el) return;

  const totals = calcTotals(data);
  if (!totals.salary || !data.expenses?.length) { el.innerHTML = ''; return; }

  const now            = new Date();
  const isCurrentMonth = currentDate.getFullYear() === now.getFullYear() && currentDate.getMonth() === now.getMonth();
  const today          = isCurrentMonth ? now.getDate() : new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
  const daysInMonth    = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
  const daysLeft       = daysInMonth - today;

  const prevDate   = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
  const prevData   = loadMonth(getMonthKey(prevDate));
  const prevTotals = calcTotals(prevData);
  const prevBycat  = prevData.expenses?.length ? calcByCategory(prevData.expenses) : null;

  const cats      = getAllCategories();
  const currBycat = calcByCategory(data.expenses || []);
  const insights  = [];

  if (isCurrentMonth && today > 0 && totals.total > 0) {
    const dailyRate = totals.total / today;
    const projected = dailyRate * daysInMonth;
    if (projected > totals.salary) {
      const daysUntilBreak = Math.max(0, Math.floor((totals.salary - totals.total) / dailyRate));
      insights.push({ type: 'danger', icon: '⏱️',
        text: `Salário acaba em ~${daysUntilBreak} dia${daysUntilBreak !== 1 ? 's' : ''}`,
        sub:  `Projeção: ${fmtCurrency(projected)} em gastos até fim do mês` });
    } else {
      insights.push({ type: 'positive', icon: '📅',
        text: `Projeção: sobra ${fmtCurrency(totals.salary - projected)} este mês`,
        sub:  `Ritmo de ${fmtCurrency(dailyRate)}/dia — ${daysLeft} dia${daysLeft !== 1 ? 's' : ''} restante${daysLeft !== 1 ? 's' : ''}` });
    }
  }

  if (prevTotals.total > 0 && totals.total > 0) {
    const diff = totals.total - prevTotals.total;
    const pct  = (diff / prevTotals.total) * 100;
    if (Math.abs(pct) >= 5) {
      insights.push({
        type: pct > 0 ? 'warning' : 'positive',
        icon: pct > 0 ? '📈' : '📉',
        text: `Gastos ${pct > 0 ? 'aumentaram' : 'caíram'} ${Math.abs(pct).toFixed(0)}% vs mês anterior`,
        sub:  `${fmtCurrency(Math.abs(diff))} ${pct > 0 ? 'a mais' : 'a menos'} que ${fmtMonthLabel(prevDate)}` });
    }
  }

  if (prevBycat) {
    const jump = Object.entries(currBycat)
      .filter(([k, v]) => v > 0 && (prevBycat[k] || 0) > 0)
      .map(([k, v]) => ({ k, curr: v, prev: prevBycat[k], pct: (v - prevBycat[k]) / prevBycat[k] * 100 }))
      .filter(r => r.pct >= 20)
      .sort((a, b) => (b.curr - b.prev) - (a.curr - a.prev))[0];
    if (jump) {
      const cat = cats[jump.k];
      insights.push({ type: 'warning', icon: cat?.icon || '📦',
        text: `${cat?.name || jump.k} subiu ${jump.pct.toFixed(0)}% vs mês anterior`,
        sub:  `${fmtCurrency(jump.prev)} → ${fmtCurrency(jump.curr)}` });
    }
  }

  if (totals.balance < 0) {
    const top = Object.entries(currBycat)
      .filter(([k, v]) => v > 0 && k !== 'investimento')
      .sort(([, a], [, b]) => b - a)[0];
    if (top) {
      const [k, v] = top;
      const cat    = cats[k];
      insights.push({ type: 'info', icon: '💡',
        text: `Cortar 20% em ${cat?.name || k} economizaria ${fmtCurrency(v * 0.2)}`,
        sub:  'Pequeno ajuste que pode equilibrar o orçamento' });
    }
  }

  if (!insights.length) { el.innerHTML = ''; return; }

  el.innerHTML = `
    <div class="ai-header"><span class="ai-badge">✨ Zaldo IA</span></div>
    ${insights.map((i, idx) => `
      <div class="ai-card ai--${i.type}" style="animation-delay:${idx * 0.07}s">
        <span class="ai-icon">${i.icon}</span>
        <div class="ai-text">${escapeHtml(i.text)}<span>${escapeHtml(i.sub)}</span></div>
      </div>`).join('')}`;
}


// ─── 11. SAÚDE FINANCEIRA & STREAK ────────────────
function renderHealthScore(totals) {
  const { score, label, level } = calcHealthScore(totals);
  const valEl  = document.getElementById('healthValue');
  const fillEl = document.getElementById('healthBarFill');
  const statEl = document.getElementById('healthStatus');
  if (!valEl) return;
  animateInt(valEl, parseInt(valEl.dataset.score || '0'), score);
  valEl.dataset.score = score;
  fillEl.style.width  = score + '%';
  fillEl.className    = 'health-bar-fill' + (level ? ' ' + level : '');
  statEl.textContent  = label;
  statEl.className    = 'health-status'   + (level ? ' ' + level : '');
}

function calcAndRenderStreak() {
  const allMonths = loadAllMonths();
  const now       = new Date();
  let streak      = 0;

  for (let i = 0; i < 36; i++) {
    const d    = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const data = allMonths[getMonthKey(d)];
    if (!data || !data.salary) break;
    if (calcTotals(data).balance < 0) break;
    streak++;
  }

  const tier    = [...STREAK_TIERS].reverse().find(t => streak >= t.min) || STREAK_TIERS[0];
  const iconEl  = document.getElementById('streakIcon');
  const valEl   = document.getElementById('streakValue');
  const subEl   = document.getElementById('streakSub');
  const badgeEl = document.getElementById('streakBadge');
  if (!valEl) return;

  iconEl.textContent = tier.icon;
  iconEl.classList.toggle('animated', tier.anim);
  valEl.textContent  = streak === 0 ? '0 meses' : `${streak} ${streak === 1 ? 'mês' : 'meses'}`;
  subEl.textContent  = tier.sub;

  if (badgeEl) {
    if (tier.badge) {
      badgeEl.textContent   = tier.badge;
      badgeEl.style.cssText = `background:${tier.color}22;color:${tier.color};border:1px solid ${tier.color}44`;
      badgeEl.classList.remove('hidden');
    } else {
      badgeEl.classList.add('hidden');
    }
  }
}


// ─── 12. CATEGORIAS ───────────────────────────────
function renderDefaultCategories() {
  document.getElementById('defaultCatGrid').innerHTML =
    Object.entries(DEFAULT_CATEGORIES).map(([, cat]) => `
      <div class="cat-card" style="--cat-color:${cat.color}">
        <div class="cat-card-icon">${cat.icon}</div>
        <div class="cat-card-name">${cat.name}</div>
        <div class="cat-card-lock">🔒</div>
      </div>`).join('');
}

function renderCustomCategories() {
  const grid    = document.getElementById('customCatGrid');
  const countEl = document.getElementById('customCatCount');
  countEl.textContent = customCategories.length;

  if (!customCategories.length) {
    grid.innerHTML = `<div class="cat-empty"><span>🏷️</span><p>Nenhuma categoria personalizada ainda</p></div>`;
    return;
  }

  grid.innerHTML = customCategories.map(cat => `
    <div class="cat-card" style="--cat-color:${cat.color}">
      <div class="cat-card-icon">${cat.icon}</div>
      <div class="cat-card-name">${cat.name}</div>
      <button class="cat-card-delete" data-id="${cat.id}" title="Remover">✕</button>
    </div>`).join('');

  grid.querySelectorAll('.cat-card-delete').forEach(btn => {
    btn.addEventListener('click', () => deleteCustomCategory(btn.dataset.id));
  });
}

function addCustomCategory(name, icon, color) {
  const id = `custom_${Date.now()}`;
  customCategories.push({ id, name, icon, color });
  try {
    saveCategories(customCategories);
    rebuildCategoryDropdown();
    rebuildFilterTabs();
    renderCustomCategories();
    showToast(`Categoria "${name}" criada!`);
  } catch {
    customCategories.pop();
    showToast('Erro ao salvar.', 'error');
  }
}

function deleteCustomCategory(id) {
  const cat = customCategories.find(c => c.id === id);
  if (!cat) return;

  if ((monthData.expenses || []).some(e => e.category === id)) {
    showToast(`"${cat.name}" está em uso. Remova os lançamentos primeiro.`, 'error');
    return;
  }

  const prev = [...customCategories];
  customCategories = customCategories.filter(c => c.id !== id);
  if (activeFilter === id) activeFilter = 'all';

  try {
    saveCategories(customCategories);
    rebuildCategoryDropdown();
    rebuildFilterTabs();
    renderCustomCategories();
    showToast('Categoria removida.');
  } catch {
    customCategories = prev;
    showToast('Erro ao remover.', 'error');
  }
}


// ─── 13. CRUD LANÇAMENTOS ─────────────────────────
function addExpense(description, amount, category, date) {
  monthData.expenses = monthData.expenses || [];
  monthData.expenses.push({
    id: Date.now(),
    description: description.trim(),
    amount: parseFloat(amount),
    category,
    date,
  });
  render();
  saveMonth(getMonthKey(currentDate), monthData);
}

function deleteExpense(id) {
  monthData.expenses = (monthData.expenses || []).filter(e => String(e.id) !== String(id));
  render();
  saveMonth(getMonthKey(currentDate), monthData);
}


// ─── 14. MODAL — RESUMO DO MÊS ────────────────────
function buildResumo() {
  const totals    = calcTotals(monthData);
  const cats      = getAllCategories();
  const bycat     = calcByCategory(monthData.expenses || []);
  const { score, label, level } = calcHealthScore(totals);
  const daysGreen = calcDaysInGreen(monthData);
  const daysInMo  = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();

  document.getElementById('resumoMonthBadge').textContent = fmtMonthLabel(currentDate);

  const topCats = Object.entries(bycat)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 4);

  let msg;
  if (!totals.salary)          msg = '👋 Insira seu salário para ver sua análise completa do mês.';
  else if (score >= 80)        msg = `🏆 Mês incrível! Você gerenciou seu dinheiro com maestria. Saúde financeira ${score}/100 — continue nesse ritmo!`;
  else if (score >= 60)        msg = `✅ Bom trabalho! Saúde financeira ${score}/100. Pequenos ajustes nos gastos variáveis podem elevar ainda mais seu score.`;
  else if (totals.balance < 0) msg = `⚠️ Os gastos ultrapassaram o salário em ${fmtCurrency(Math.abs(totals.balance))}. Revise e ajuste para o próximo mês.`;
  else                         msg = `💪 Saúde financeira ${score}/100. Foque em reduzir gastos supérfluos e aumentar investimentos.`;

  const scoreBarClass = level ? ` ${level}` : '';

  document.getElementById('resumoBody').innerHTML = `
    <div class="resumo-grid">
      <div class="resumo-stat">
        <div class="resumo-stat-label">Saldo do mês</div>
        <div class="resumo-stat-value ${totals.balance >= 0 ? 'positive' : 'negative'}">${fmtCurrency(totals.balance)}</div>
      </div>
      <div class="resumo-stat">
        <div class="resumo-stat-label">Comprometido</div>
        <div class="resumo-stat-value">${totals.percent.toFixed(1)}%</div>
      </div>
      <div class="resumo-stat">
        <div class="resumo-stat-label">Investido</div>
        <div class="resumo-stat-value positive">${fmtCurrency(totals.invested)}</div>
      </div>
      <div class="resumo-stat">
        <div class="resumo-stat-label">Dias no azul</div>
        <div class="resumo-stat-value ${daysGreen === daysInMo ? 'positive' : ''}">${daysGreen} de ${daysInMo}</div>
      </div>
    </div>

    <div class="resumo-score-row">
      <div class="resumo-score-num">${score}</div>
      <div class="resumo-score-info">
        <div class="resumo-score-label">Saúde Financeira</div>
        <div class="resumo-score-bar">
          <div class="resumo-score-fill${scoreBarClass}" style="width:${score}%"></div>
        </div>
        <div class="resumo-score-status${level ? ' ' + level : ''}">${label}</div>
      </div>
    </div>

    ${topCats.length ? `
    <div class="resumo-section-label">Maiores gastos</div>
    <div class="resumo-cats">
      ${topCats.map(([k, v]) => {
        const cat = cats[k] || { name: k, icon: '📦', color: '#94a3b8' };
        const pct = totals.total > 0 ? (v / totals.total) * 100 : 0;
        return `
          <div class="resumo-cat-item">
            <span class="resumo-cat-icon">${cat.icon}</span>
            <span class="resumo-cat-name">${escapeHtml(cat.name)}</span>
            <div class="resumo-cat-bar-wrap">
              <div class="resumo-cat-bar" style="width:${pct.toFixed(1)}%;background:${cat.color}"></div>
            </div>
            <span class="resumo-cat-amt">${fmtCurrency(v)}</span>
          </div>`;
      }).join('')}
    </div>` : ''}

    <div class="resumo-msg">${msg}</div>
    <button class="resumo-share" id="resumoShareBtn">📤 Compartilhar Resumo</button>`;

  document.getElementById('resumoShareBtn').addEventListener('click', () => {
    const text =
      `📊 Zaldo Finance — ${fmtMonthLabel(currentDate)}\n` +
      `\n💰 Salário:   ${fmtCurrency(totals.salary)}` +
      `\n💸 Gastos:    ${fmtCurrency(totals.total)}` +
      `\n${totals.balance >= 0 ? '💚' : '🔴'} Saldo:     ${fmtCurrency(totals.balance)}` +
      `\n📈 Investido: ${fmtCurrency(totals.invested)}` +
      `\n🏆 Saúde:     ${score}/100 — ${label}` +
      `\n\nZaldo Finance — seu dinheiro organizado com estilo.`;
    navigator.clipboard.writeText(text)
      .then(() => showToast('Resumo copiado! 📤'))
      .catch(() => showToast('Erro ao copiar', 'error'));
  });
}


// ─── 15. MODAL — HISTÓRICO ────────────────────────
function buildHistory() {
  const body      = document.getElementById('historyBody');
  const allMonths = loadAllMonths();
  const keys      = Object.keys(allMonths);

  if (!keys.length) {
    body.innerHTML = '<p style="color:var(--text-3);text-align:center;padding:32px">Nenhum histórico ainda.</p>';
    return;
  }

  body.innerHTML = keys.map(key => {
    const data   = allMonths[key];
    const totals = calcTotals(data);
    const [y, m] = key.split('-');
    const label  = fmtMonthLabel(new Date(parseInt(y), parseInt(m) - 1, 1));
    return `
      <div class="history-month-item">
        <div class="history-month-name">${label}</div>
        <div class="history-stats">
          <div>
            <div class="history-stat-label">Salário</div>
            <div class="history-stat-value">${fmtCurrency(totals.salary)}</div>
          </div>
          <div>
            <div class="history-stat-label">Gastos</div>
            <div class="history-stat-value">${fmtCurrency(totals.total)}</div>
          </div>
          <div>
            <div class="history-stat-label">Saldo</div>
            <div class="history-stat-value ${totals.balance >= 0 ? 'positive' : 'negative'}">${fmtCurrency(totals.balance)}</div>
          </div>
          <div>
            <div class="history-stat-label">Lançamentos</div>
            <div class="history-stat-value">${(data.expenses || []).length}</div>
          </div>
        </div>
      </div>`;
  }).join('');
}


// ─── 16. INIT & EVENTOS ───────────────────────────
document.addEventListener('DOMContentLoaded', () => {

  // ── Firebase: observa estado de autenticação ──
  firebase.auth().onAuthStateChanged(async user => {
    if (user) {
      _uid = user.uid;
      try {
        await loadUserData(user.uid);
      } catch (e) {
        console.error('Erro ao carregar dados:', e);
      }

      customCategories = loadCategories();
      monthData        = loadMonth(getMonthKey(currentDate));

      document.getElementById('expenseDate').value = todayISO();
      rebuildCategoryDropdown();
      renderDefaultCategories();
      renderCustomCategories();
      render();
      calcAndRenderStreak();
      showAppUI(user);

      // Aplica tema salvo
      const savedTheme = localStorage.getItem('zaldo_theme');
      if (savedTheme === 'light') {
        document.body.classList.add('light');
        document.getElementById('themeToggle').textContent = '🌙';
      }
    } else {
      _uid             = null;
      _cache           = {};
      customCategories = [];
      monthData        = { salary: 0, expenses: [] };
      showLoginUI();
    }
  });

  // ── Google login ──
  document.getElementById('googleBtn').addEventListener('click', async () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    try {
      await firebase.auth().signInWithPopup(provider);
    } catch (err) {
      if (err.code !== 'auth/popup-closed-by-user') {
        showToast(translateAuthError(err.code), 'error');
      }
    }
  });

  // ── Esqueci minha senha ──
  function showResetForm() {
    document.getElementById('loginForm').classList.add('hidden');
    document.getElementById('registerForm').classList.add('hidden');
    document.getElementById('resetForm').classList.remove('hidden');
    document.getElementById('loginTabBtn').classList.remove('active');
    document.getElementById('resetEmail').value = document.getElementById('loginEmail').value;
    document.getElementById('resetError').classList.add('hidden');
    document.getElementById('resetSuccess').classList.add('hidden');
  }

  function showLoginForm() {
    document.getElementById('resetForm').classList.add('hidden');
    document.getElementById('loginForm').classList.remove('hidden');
    document.getElementById('loginTabBtn').classList.add('active');
  }

  document.getElementById('forgotLink').addEventListener('click', showResetForm);
  document.getElementById('resetBack').addEventListener('click', showLoginForm);

  document.getElementById('resetSubmitBtn').addEventListener('click', async () => {
    const email = document.getElementById('resetEmail').value.trim();
    const errEl = document.getElementById('resetError');
    const sucEl = document.getElementById('resetSuccess');

    errEl.classList.add('hidden');
    sucEl.classList.add('hidden');

    if (!email) {
      errEl.textContent = 'Informe seu e-mail.';
      errEl.classList.remove('hidden');
      return;
    }

    setLoginLoading('resetSubmitBtn', true);
    try {
      await firebase.auth().sendPasswordResetEmail(email);
      sucEl.classList.remove('hidden');
    } catch (err) {
      errEl.textContent = translateAuthError(err.code);
      errEl.classList.remove('hidden');
    }
    setLoginLoading('resetSubmitBtn', false);
  });

  // ── Login form ──
  document.getElementById('loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const email    = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const errEl    = document.getElementById('loginError');

    errEl.classList.add('hidden');
    setLoginLoading('loginSubmitBtn', true);

    try {
      await firebase.auth().signInWithEmailAndPassword(email, password);
    } catch (err) {
      errEl.textContent = translateAuthError(err.code);
      errEl.classList.remove('hidden');
      setLoginLoading('loginSubmitBtn', false);
    }
  });

  // ── Register form ──
  document.getElementById('registerForm').addEventListener('submit', async e => {
    e.preventDefault();
    const name     = document.getElementById('regName').value.trim();
    const email    = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPassword').value;
    const errEl    = document.getElementById('registerError');

    errEl.classList.add('hidden');
    setLoginLoading('registerSubmitBtn', true);

    try {
      const { user } = await firebase.auth().createUserWithEmailAndPassword(email, password);
      if (name) await user.updateProfile({ displayName: name });
    } catch (err) {
      errEl.textContent = translateAuthError(err.code);
      errEl.classList.remove('hidden');
      setLoginLoading('registerSubmitBtn', false);
    }
  });

  // ── Alternância login / cadastro ──
  document.getElementById('loginTabBtn').addEventListener('click', () => {
    document.getElementById('loginTabBtn').classList.add('active');
    document.getElementById('registerTabBtn').classList.remove('active');
    document.getElementById('loginForm').classList.remove('hidden');
    document.getElementById('registerForm').classList.add('hidden');
    document.getElementById('loginError').classList.add('hidden');
  });

  document.getElementById('registerTabBtn').addEventListener('click', () => {
    document.getElementById('registerTabBtn').classList.add('active');
    document.getElementById('loginTabBtn').classList.remove('active');
    document.getElementById('registerForm').classList.remove('hidden');
    document.getElementById('loginForm').classList.add('hidden');
    document.getElementById('registerError').classList.add('hidden');
  });

  // ── Logout ──
  document.getElementById('logoutBtn').addEventListener('click', async () => {
    if (chart) { chart.destroy(); chart = null; }
    Object.assign(_prev, { salary: 0, total: 0, balance: 0, invested: 0 });
    await firebase.auth().signOut();
  });

  // ── Tema ──
  const themeBtn = document.getElementById('themeToggle');
  themeBtn.addEventListener('click', () => {
    const isLight = document.body.classList.toggle('light');
    themeBtn.textContent = isLight ? '🌙' : '☀️';
    localStorage.setItem('zaldo_theme', isLight ? 'light' : 'dark');
    if (chart) chart.update();
  });

  // ── Navegação de meses ──
  function changeMonth(delta) {
    showSkeleton();
    currentDate  = new Date(currentDate.getFullYear(), currentDate.getMonth() + delta, 1);
    activeFilter = 'all';
    monthData    = loadMonth(getMonthKey(currentDate));
    render();
    calcAndRenderStreak();
  }
  document.getElementById('prevMonth').addEventListener('click', () => changeMonth(-1));
  document.getElementById('nextMonth').addEventListener('click', () => changeMonth(+1));

  // ── Salário ──
  const salaryInput = document.getElementById('salaryInput');
  function saveSalary() {
    const val = parseFloat(salaryInput.value) || 0;
    if (monthData.salary === val) return;
    monthData.salary = val;
    render();
    saveMonth(getMonthKey(currentDate), monthData);
  }
  salaryInput.addEventListener('blur',    saveSalary);
  salaryInput.addEventListener('keydown', e => { if (e.key === 'Enter') salaryInput.blur(); });

  // ── Formulário de lançamento ──
  document.getElementById('expenseForm').addEventListener('submit', e => {
    e.preventDefault();
    const desc     = document.getElementById('expenseDesc');
    const amount   = document.getElementById('expenseAmount');
    const category = document.getElementById('expenseCategory');
    const date     = document.getElementById('expenseDate');
    const errEl    = document.getElementById('formError');
    let valid      = true;

    [desc, amount, category, date].forEach(el => el.classList.remove('invalid'));
    if (!desc.value.trim())                  { desc.classList.add('invalid');     valid = false; }
    if (!amount.value || +amount.value <= 0) { amount.classList.add('invalid');   valid = false; }
    if (!category.value)                     { category.classList.add('invalid'); valid = false; }
    if (!date.value)                         { date.classList.add('invalid');     valid = false; }

    if (!valid) { errEl.classList.remove('hidden'); return; }
    errEl.classList.add('hidden');

    addExpense(desc.value, amount.value, category.value, date.value);
    desc.value = ''; amount.value = ''; category.value = '';
    date.value = todayISO();
    desc.focus();
    showToast('Lançamento adicionado!');
  });

  ['expenseDesc', 'expenseAmount', 'expenseCategory', 'expenseDate'].forEach(id => {
    document.getElementById(id).addEventListener('input', e => e.target.classList.remove('invalid'));
  });

  // ── Filtros de categoria ──
  document.getElementById('filterTabs').addEventListener('click', e => {
    const tab = e.target.closest('.tab');
    if (!tab) return;
    activeFilter = tab.dataset.filter;
    rebuildFilterTabs();
    updateExpenseList(monthData.expenses || []);
  });

  // ── Abas principais ──
  document.querySelectorAll('.main-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.main-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const which = tab.dataset.tab;
      document.getElementById('tabLancamentos').classList.toggle('hidden', which !== 'lancamentos');
      document.getElementById('tabCategorias').classList.toggle('hidden',  which !== 'categorias');
    });
  });

  // ── Nova categoria ──
  document.getElementById('addCategoryForm').addEventListener('submit', e => {
    e.preventDefault();
    const name  = document.getElementById('catName').value.trim();
    const icon  = document.getElementById('catIcon').value.trim();
    const color = document.getElementById('catColor').value;
    const errEl = document.getElementById('catFormError');

    if (!name || !icon) { errEl.classList.remove('hidden'); return; }
    errEl.classList.add('hidden');

    addCustomCategory(name, icon, color);
    document.getElementById('catName').value  = '';
    document.getElementById('catIcon').value  = '';
    document.getElementById('catColor').value = '#6366f1';
    document.getElementById('catPreview').style.background = colorBg('#6366f1');
    document.getElementById('catPreviewIcon').textContent  = '?';
  });

  document.getElementById('catIcon').addEventListener('input', e => {
    document.getElementById('catPreviewIcon').textContent = e.target.value || '?';
  });
  document.getElementById('catColor').addEventListener('input', e => {
    document.getElementById('catPreview').style.background = colorBg(e.target.value);
  });

  // ── Modal histórico ──
  document.getElementById('historyBtn').addEventListener('click', () => {
    document.getElementById('historyModal').classList.add('open');
    buildHistory();
  });
  document.getElementById('modalClose').addEventListener('click', () => {
    document.getElementById('historyModal').classList.remove('open');
  });
  document.getElementById('historyModal').addEventListener('click', e => {
    if (e.target === e.currentTarget) e.currentTarget.classList.remove('open');
  });

  // ── Modal resumo ──
  document.getElementById('resumoBtn').addEventListener('click', () => {
    document.getElementById('resumoModal').classList.add('open');
    buildResumo();
  });
  document.getElementById('resumoClose').addEventListener('click', () => {
    document.getElementById('resumoModal').classList.remove('open');
  });
  document.getElementById('resumoModal').addEventListener('click', e => {
    if (e.target === e.currentTarget) e.currentTarget.classList.remove('open');
  });

  // ── Fechar modais com Escape ──
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    document.getElementById('historyModal').classList.remove('open');
    document.getElementById('resumoModal').classList.remove('open');
  });

  // ── Quick-Add Sheet ──
  const quickSheet = document.getElementById('quickAddSheet');

  function openSheet() {
    document.getElementById('qCategory').innerHTML = buildCategoryOptionsHTML();
    document.getElementById('qDate').value = todayISO();
    document.getElementById('sheetError').classList.add('hidden');
    quickSheet.classList.add('open');
    setTimeout(() => document.getElementById('qDesc').focus(), 350);
  }

  function closeSheet() {
    quickSheet.classList.remove('open');
    document.getElementById('quickForm').reset();
  }

  document.getElementById('fabBtn').addEventListener('click', openSheet);
  document.getElementById('sheetClose').addEventListener('click', closeSheet);
  quickSheet.addEventListener('click', e => { if (e.target === quickSheet) closeSheet(); });

  document.getElementById('quickForm').addEventListener('submit', e => {
    e.preventDefault();
    const desc     = document.getElementById('qDesc');
    const amount   = document.getElementById('qAmount');
    const category = document.getElementById('qCategory');
    const date     = document.getElementById('qDate');
    const errEl    = document.getElementById('sheetError');
    let valid = true;

    [desc, amount, category, date].forEach(el => el.classList.remove('invalid'));
    if (!desc.value.trim())                  { desc.classList.add('invalid');     valid = false; }
    if (!amount.value || +amount.value <= 0) { amount.classList.add('invalid');   valid = false; }
    if (!category.value)                     { category.classList.add('invalid'); valid = false; }
    if (!date.value)                         { date.classList.add('invalid');     valid = false; }

    if (!valid) { errEl.classList.remove('hidden'); return; }
    errEl.classList.add('hidden');

    addExpense(desc.value, amount.value, category.value, date.value);
    closeSheet();
    showToast('Lançamento adicionado! ✓');
  });

  // ── Navegação inferior (mobile) ──
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const nav = item.dataset.nav;
      if (nav === 'historico') {
        document.getElementById('historyModal').classList.add('open');
        buildHistory();
        return;
      }
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      item.classList.add('active');
      document.querySelectorAll('.main-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === nav));
      document.getElementById('tabLancamentos').classList.toggle('hidden', nav !== 'lancamentos');
      document.getElementById('tabCategorias').classList.toggle('hidden',  nav !== 'categorias');
    });
  });

  // ── Ripple em botões ──
  document.addEventListener('click', e => {
    const btn = e.target.closest('.btn-primary, .btn-ghost, .main-tab, .tab');
    if (!btn) return;
    const rect   = btn.getBoundingClientRect();
    const ripple = document.createElement('span');
    ripple.className  = 'ripple-effect';
    ripple.style.left = (e.clientX - rect.left) + 'px';
    ripple.style.top  = (e.clientY - rect.top)  + 'px';
    btn.appendChild(ripple);
    ripple.addEventListener('animationend', () => ripple.remove());
  });

});
