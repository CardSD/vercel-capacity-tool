/* =========================================
   Capacity & Stakeholder Tool — App Logic
   Multi-Product Edition + ICS Import
   Multi-User Edition: Supabase Auth + PostgreSQL
   Vercel Edition: LLM proxy via serverless function
   ========================================= */

// LLM proxy — uses Vercel serverless function with JWT authentication
const LLM_PROXY_URL = '/api/llm';

// ========== SUPABASE INITIALIZATION ==========

let currentUser = null;
let saveTimeout = null;
let isSaving = false;

// Initialize Supabase on page load
async function initSupabaseAndApp() {
  // Load Supabase
  const ok = await initSupabase();
  if (!ok) {
    showAuthError('loginError', 'Configuration Supabase manquante. Vérifiez les variables d\'environnement.');
    console.error('Supabase initialization failed');
    return false;
  }

  // Try to restore existing session
  const hasSession = await restoreSession();
  if (hasSession && currentSession) {
    // User already logged in
    console.log('✓ Session restored for:', currentUser.email);
    await loadAppStateFromSupabase();
    enterApp();
    return true;
  }

  // Otherwise show auth screen
  document.getElementById('authScreen').style.display = 'flex';
  return false;
}

// Load application state from Supabase
async function loadAppStateFromSupabase() {
  try {
    const dbState = await loadAppState();
    if (dbState) {
      // Map Supabase data to global state
      state.products = dbState.products || [];
      state.categories = dbState.categories || [];
      state.stakeholders = dbState.stakeholders || [];
      state.week_templates = dbState.week_templates || [];
      state.keyword_rules = dbState.keyword_rules || [];
      state.icsAutoEvents = dbState.ics_auto_events || [];
      state.icsManualEvents = dbState.ics_manual_events || [];
      state.icsIgnoredEvents = dbState.ics_ignored_events || [];
      state.llmProvider = dbState.llm_provider || 'openai';
      serverDataLoaded = true;
      console.log('✓ App state loaded from Supabase');
    } else {
      console.log('ℹ No existing app state, creating new one');
      // State will be created on first save
    }
  } catch (error) {
    console.error('Error loading app state:', error);
  }
}

// Save application state to Supabase
async function saveAppStateToSupabase() {
  if (!currentSession) {
    console.warn('⚠ Cannot save: not authenticated');
    return false;
  }

  try {
    const success = await saveAppState({
      products: state.products,
      categories: state.categories,
      stakeholders: state.stakeholders,
      week_templates: state.week_templates,
      keyword_rules: state.keyword_rules,
      ics_auto_events: state.icsAutoEvents,
      ics_manual_events: state.icsManualEvents,
      ics_ignored_events: state.icsIgnoredEvents,
      llmProvider: state.llmProvider,
    });

    if (success) {
      isSaving = false;
      return true;
    } else {
      console.error('✗ Failed to save app state');
      return false;
    }
  } catch (error) {
    console.error('Error saving app state:', error);
    return false;
  }
}

// ─── Auth tab switch ──────────────────────────────────────────────────────────
function switchAuthTab(tab) {
  document.getElementById('tabLogin').classList.toggle('active', tab === 'login');
  document.getElementById('tabRegister').classList.toggle('active', tab === 'register');
  document.getElementById('loginForm').style.display = tab === 'login' ? 'flex' : 'none';
  document.getElementById('registerForm').style.display = tab === 'register' ? 'flex' : 'none';
  // Clear errors
  ['loginError', 'registerError'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.style.display = 'none'; el.textContent = ''; }
  });
}

function showAuthError(formId, msg) {
  const el = document.getElementById(formId);
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
}

// ─── Login (Supabase) ─────────────────────────────────────────────────────────
async function doLogin() {
  const email = (document.getElementById('loginEmail').value || '').trim().toLowerCase();
  const password = document.getElementById('loginPassword').value || '';
  if (!email || !password) {
    showAuthError('loginError', 'Email et mot de passe requis');
    return;
  }

  const btn = document.getElementById('loginBtn');
  btn.textContent = 'Connexion...';
  btn.disabled = true;

  try {
    await supabaseLogin(email, password);  // Call Supabase login
    await loadAppStateFromSupabase();
    await loadLLMConfig();
    enterApp();
  } catch (error) {
    showAuthError('loginError', error.message || 'Erreur de connexion');
  }

  btn.textContent = 'Se connecter';
  btn.disabled = false;
}

// ─── Register (Supabase) ──────────────────────────────────────────────────────
async function doRegister() {
  const display_name = (document.getElementById('regName').value || '').trim();
  const role = (document.getElementById('regRole').value || '').trim();
  const email = (document.getElementById('regEmail').value || '').trim().toLowerCase();
  const password = document.getElementById('regPassword').value || '';
  const confirm = document.getElementById('regPasswordConfirm').value || '';

  if (!display_name || !email || !password) {
    showAuthError('registerError', 'Tous les champs obligatoires doivent être remplis');
    return;
  }
  if (password.length < 6) {
    showAuthError('registerError', 'Le mot de passe doit contenir au moins 6 caractères');
    return;
  }
  if (password !== confirm) {
    showAuthError('registerError', 'Les mots de passe ne correspondent pas');
    return;
  }

  const btn = document.getElementById('registerBtn');
  btn.textContent = 'Création...';
  btn.disabled = true;

  try {
    await supabaseRegister(email, password, display_name, role);  // Call Supabase register
    await loadAppStateFromSupabase();
    await loadLLMConfig();
    enterApp();
  } catch (error) {
    showAuthError('registerError', error.message || 'Erreur lors de l\'enregistrement');
  }

  btn.textContent = 'Créer mon compte';
  btn.disabled = false;
}

// ─── Enter app after auth ─────────────────────────────────────────────────────
function enterApp() {
  document.getElementById('authScreen').style.display = 'none';
  document.getElementById('appContainer').style.display = 'flex';

  if (currentUser) {
    const initials = (currentUser.display_name || 'U').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    const avatarEl = document.getElementById('sidebarAvatar');
    if (avatarEl) avatarEl.textContent = initials;
    const nameEl = document.getElementById('sidebarFooterName');
    if (nameEl) nameEl.textContent = currentUser.display_name || '';
    const roleEl = document.getElementById('sidebarFooterRole');
    if (roleEl) roleEl.textContent = currentUser.role || '';
  }

  bootApp();
  loadTeamMembers();

  if (!supabaseClient) {
    showToast('Connexion au serveur indisponible — pensez à exporter régulièrement', 'warning');
  } else if (serverDataLoaded) {
    showToast('Données restaurées', 'success');
  }
}

// ─── Logout ───────────────────────────────────────────────────────────────────
async function doLogout() {
  // Logout from Supabase
  await supabaseLogout();

  currentUser = null;
  currentSession = null;
  serverDataLoaded = false;

  // Reset state
  Object.assign(state, {
    weeklyCapacity: 40,
    cycleLength: 4,
    cycleStartDate: null,
    weekTemplates: [],
    displayName: 'David Cardoso',
    displayRole: 'Senior Product Designer',
    timelineOffset: 0,
    categories: JSON.parse(JSON.stringify(DEFAULT_CATEGORIES)),
    products: JSON.parse(JSON.stringify(DEFAULT_PRODUCTS)),
    weeks: {},
    stakeholders: JSON.parse(JSON.stringify(DEFAULT_STAKEHOLDERS)),
    projectName: 'SWD — Site Corporate',
    keywordRules: JSON.parse(JSON.stringify(DEFAULT_KEYWORD_RULES)),
    productAliases: JSON.parse(JSON.stringify(DEFAULT_PRODUCT_ALIASES)),
    categoryAliases: JSON.parse(JSON.stringify(DEFAULT_CATEGORY_ALIASES)),
    timesheetEntries: [],
    nextTimesheetId: 1,
    activeTimer: null,
    llmEnabled: false,
    llmProvider: 'openai',
    llmApiKey: '',
    llmCustomUrl: '',
    llmConnected: false,
    llmUseProxy: false,
    icsEvents: [],
    icsAutoEvents: [],
    icsManualEvents: [],
    icsIgnoredEvents: [],
    teamMembers: [],
  });

  document.getElementById('appContainer').style.display = 'none';
  document.getElementById('authScreen').style.display = 'flex';
  switchAuthTab('login');
}

// ─── Save to Supabase ─────────────────────────────────────────────────────────
async function saveToStorage() {
  if (!currentSession || isSaving) return;
  isSaving = true;
  showSaveIndicator('saving');
  try {
    const ok = await saveAppStateToSupabase();
    showSaveIndicator(ok ? 'saved' : 'error');
  } catch (err) {
    console.error('Save error:', err);
    showSaveIndicator('error');
  }
  isSaving = false;
}

function scheduleSave() {
  if (!currentSession) return;
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => saveToStorage(), 1500);
}

// ─── Workspace selector (no-op for client-side) ───────────────────────────────
function updateWorkspaceSelector() {
  const selector = document.getElementById('workspaceSelector');
  if (selector) selector.style.display = 'none';
}

function showSaveIndicator(status) {
  const el = document.getElementById('saveIndicator');
  if (!el) return;
  el.className = 'save-indicator visible ' + status;
  if (status === 'saving') {
    el.textContent = 'Sauvegarde...';
  } else if (status === 'saved') {
    el.textContent = 'Sauvegardé ✓';
    setTimeout(() => { el.classList.remove('visible'); }, 2000);
  } else {
    el.textContent = 'Erreur de sauvegarde';
    setTimeout(() => { el.classList.remove('visible'); }, 3000);
  }
}

// ─── Listen for Enter on auth inputs ─────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // Initialize Supabase and restore session if available
  await initSupabaseAndApp();

  // Setup auth form keyboard shortcuts
  const loginPwd = document.getElementById('loginPassword');
  if (loginPwd) loginPwd.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  const loginEmail = document.getElementById('loginEmail');
  if (loginEmail) loginEmail.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  const regConfirm = document.getElementById('regPasswordConfirm');
  if (regConfirm) regConfirm.addEventListener('keydown', e => { if (e.key === 'Enter') doRegister(); });
});

// ========== THEME SYSTEM ==========
const THEMES = {
  current:    { name: 'Current (Dark Pro)',  file: './themes/theme-current.css' },
  untitledui: { name: 'UntitledUI',          file: './themes/theme-untitledui.css' },
  swiss:      { name: 'Swiss Minimal',       file: './themes/theme-swiss.css' },
  brutalist:  { name: 'Pop Brutalist',       file: './themes/theme-brutalist.css' },
  glass:      { name: 'Glassmorphism',       file: './themes/theme-glass.css' },
};

function applyTheme(themeName) {
  const theme = THEMES[themeName];
  if (!theme) return;
  const link = document.getElementById('theme-css');
  if (link) link.href = theme.file;
  document.documentElement.setAttribute('data-theme', themeName);
  // Update selector UI
  document.querySelectorAll('.theme-option').forEach(el => {
    el.classList.toggle('active', el.getAttribute('data-theme') === themeName);
  });
}

function setTheme(themeName) {
  if (!THEMES[themeName]) return;
  // Add smooth transition class
  document.documentElement.classList.add('theme-transitioning');
  applyTheme(themeName);
  state.theme = themeName;
  scheduleSave();
  // Remove transition class after animation
  setTimeout(() => {
    document.documentElement.classList.remove('theme-transitioning');
  }, 400);
}


function getSerializableState() {
  return {
    version: 4,
    weeklyCapacity: state.weeklyCapacity,
    cycleLength: state.cycleLength,
    cycleStartDate: state.cycleStartDate || null,
    weekTemplates: state.weekTemplates || [],
    displayName: state.displayName || '',
    displayRole: state.displayRole || '',
    categories: state.categories,
    products: state.products,
    weeks: state.weeks,
    stakeholders: state.stakeholders,
    projectName: state.projectName,
    keywordRules: state.keywordRules,
    productAliases: state.productAliases,
    categoryAliases: state.categoryAliases,
    timesheetEntries: state.timesheetEntries,
    activeTimer: state.activeTimer,
    teamMembers: state.teamMembers || [],
    theme: state.theme || 'current',
  };
}

function restoreState(data) {
  if (!data) return;
  if (data.weeklyCapacity) state.weeklyCapacity = data.weeklyCapacity;
  if (data.cycleLength) state.cycleLength = data.cycleLength;
  state.cycleStartDate = data.cycleStartDate || null;
  state.weekTemplates = data.weekTemplates || [];
  state.displayName = data.displayName || 'David Cardoso';
  state.displayRole = data.displayRole || 'Senior Product Designer';
  if (data.categories) state.categories = data.categories;
  if (data.products) state.products = data.products;
  if (data.weeks) {
    if (data.version === 1 || data.version === undefined) {
      const migratedWeeks = {};
      Object.keys(data.weeks).forEach(k => {
        migratedWeeks[k] = {};
        const firstProd = state.products[0] ? state.products[0].id : 'swd';
        migratedWeeks[k][firstProd] = data.weeks[k];
      });
      state.weeks = migratedWeeks;
    } else {
      state.weeks = data.weeks;
    }
  }
  if (data.stakeholders) state.stakeholders = data.stakeholders;
  if (data.projectName) state.projectName = data.projectName;
  if (data.keywordRules) state.keywordRules = data.keywordRules;
  if (data.productAliases) state.productAliases = data.productAliases;
  if (data.categoryAliases) state.categoryAliases = data.categoryAliases;
  // Timesheet (v4+, fallback to empty)
  state.timesheetEntries = data.timesheetEntries || [];
  state.nextTimesheetId = state.timesheetEntries.length > 0
    ? Math.max(...state.timesheetEntries.map(e => e.id), 0) + 1
    : 1;
  // Restore activeTimer only if its entry still exists
  if (data.activeTimer) {
    const entry = state.timesheetEntries.find(e => e.id === data.activeTimer.entryId);
    state.activeTimer = entry ? data.activeTimer : null;
  } else {
    state.activeTimer = null;
  }
  state.nextStakeholderId = Math.max(...state.stakeholders.map(s => s.id), 0) + 1;
  state.nextRuleId = Math.max(...state.keywordRules.map(r => r.id), 0) + 1;
  // Team members
  state.teamMembers = data.teamMembers || [];
  if (data.theme) { state.theme = data.theme; applyTheme(data.theme); }

  // Update UI inputs
  const capInput = document.getElementById('settingsCapacity');
  if (capInput) capInput.value = state.weeklyCapacity;
  const cycleInput = document.getElementById('settingsCycleLength');
  if (cycleInput) cycleInput.value = state.cycleLength;
  const projInput = document.getElementById('projectNameInput');
  if (projInput) projInput.value = state.projectName;
  // Update sidebar footer with display name/role
  const footerName = document.getElementById('sidebarFooterName') || document.querySelector('.sidebar-footer-name');
  if (footerName) footerName.textContent = state.displayName;
  const footerRole = document.getElementById('sidebarFooterRole') || document.querySelector('.sidebar-footer-role');
  if (footerRole) footerRole.textContent = state.displayRole;
  // Populate profile settings inputs
  const nameInput = document.getElementById('settingsDisplayName');
  if (nameInput) nameInput.value = state.displayName;
  const roleInput = document.getElementById('settingsDisplayRole');
  if (roleInput) roleInput.value = state.displayRole;
  // Cycle start date
  const cycleStartEl = document.getElementById('settingsCycleStartDate');
  if (cycleStartEl && state.cycleStartDate) cycleStartEl.value = state.cycleStartDate;
}

// ========== UNDO SYSTEM (R10.1) ==========
const undoStack = [];
const MAX_UNDO = 10;

function pushUndo(description, undoFn) {
  undoStack.push({ description, undoFn, ts: Date.now() });
  if (undoStack.length > MAX_UNDO) undoStack.shift();
}

function performUndo() {
  const action = undoStack.pop();
  if (!action) return;
  try {
    action.undoFn();
    showToast('Action annulée : ' + action.description, 'info');
  } catch (e) {
    showToast('Impossible d\'annuler', 'error');
  }
}

// ========== STATE ==========
const DEFAULT_CATEGORIES = [
  { id: 'design', name: 'Design (UX/UI)', emoji: '🎨', color: '#6C5CE7' },
  { id: 'discovery', name: 'Recherche & Discovery', emoji: '🔍', color: '#00D2A0' },
  { id: 'pm', name: 'Gestion de projet', emoji: '📋', color: '#FBBF24' },
  { id: 'meetings', name: 'Réunions / Syncs', emoji: '🤝', color: '#FF6B6B' },
  { id: 'docs', name: 'Documentation', emoji: '📝', color: '#4ECDC4' },
  { id: 'designops', name: 'Design Ops / Système', emoji: '⚙️', color: '#A78BFA' },
  { id: 'other', name: 'Autre', emoji: '🎯', color: '#8B8FA3' },
];

const DEFAULT_PRODUCTS = [
  { id: 'swd', name: 'SWD — Site Corporate', emoji: '🌐', color: '#6C5CE7' },
  { id: 'espace-client', name: 'Espace Client', emoji: '👤', color: '#00D2A0' },
  { id: 'app-mobile', name: 'App Mobile', emoji: '📱', color: '#FF6B6B' },
  { id: 'design-system', name: 'Design System', emoji: '🎨', color: '#FBBF24' },
  { id: 'transversal', name: 'Transversal', emoji: '🔄', color: '#A78BFA' },
];

const DEFAULT_STAKEHOLDERS = [
  { id: 1, name: 'Jerome Dayer', role: 'Product Lead & Team Manager', power: 9, interest: 9, influence: 'decision', frequency: 'weekly', notes: 'Responsable direct. Valide les priorités Discovery.', defaultProductId: 'swd' },
  { id: 2, name: 'David Evequoz', role: 'Content Integrator', power: 5, interest: 8, influence: 'contributor', frequency: 'daily', notes: 'Intègre le contenu sur le site. Contact quotidien.', defaultProductId: 'swd' },
  { id: 3, name: 'Alain Favre', role: 'IT / Figma License Manager', power: 3, interest: 3, influence: 'informed', frequency: 'monthly', notes: 'Gestion des licences Figma.', defaultProductId: null },
  { id: 4, name: 'Dev Team', role: 'Développement', power: 6, interest: 6, influence: 'contributor', frequency: 'weekly', notes: 'Équipe de développement front/back.', defaultProductId: null },
  { id: 5, name: 'QA Team', role: 'Assurance Qualité', power: 4, interest: 5, influence: 'contributor', frequency: 'biweekly', notes: 'Tests et validation.', defaultProductId: null },
  { id: 6, name: 'Business Analysts', role: 'BA Team', power: 7, interest: 8, influence: 'influencer', frequency: 'weekly', notes: 'Analystes métier, requirements.', defaultProductId: null },
  { id: 7, name: 'UX Writers', role: 'Contenu', power: 5, interest: 7, influence: 'contributor', frequency: 'weekly', notes: 'Rédaction UX.', defaultProductId: null },
  { id: 8, name: 'Marketing', role: 'Marketing Team', power: 6, interest: 4, influence: 'informed', frequency: 'monthly', notes: 'Équipe marketing corporate.', defaultProductId: null },
];

// Default keyword rules for Layer 2
const DEFAULT_KEYWORD_RULES = [
  { id: 1, keywords: ['design review', 'design critique', 'maquette', 'figma', 'wireframe', 'prototype', 'ui ', 'ux '], productId: null, categoryId: 'design', label: 'Activités Design' },
  { id: 2, keywords: ['discovery', 'recherche', 'user research', 'interview', 'test utilisateur', 'usability'], productId: null, categoryId: 'discovery', label: 'Recherche & Discovery' },
  { id: 3, keywords: ['sprint planning', 'sprint review', 'backlog', 'refinement', 'retro', 'rétrospective', 'daily stand', 'standup'], productId: null, categoryId: 'pm', label: 'Gestion de projet' },
  { id: 4, keywords: ['sync', 'point', 'réunion', 'meeting', 'call', 'catch-up', 'alignment', 'weekly', '1:1', 'one-on-one'], productId: null, categoryId: 'meetings', label: 'Réunions' },
  { id: 5, keywords: ['documentation', 'confluence', 'notion', 'wiki', 'specs', 'spécification', 'rédaction'], productId: null, categoryId: 'docs', label: 'Documentation' },
  { id: 6, keywords: ['design system', 'tokens', 'composant', 'component', 'librairie', 'library', 'storybook'], productId: null, categoryId: 'designops', label: 'Design Ops' },
  { id: 7, keywords: ['formation', 'onboarding', 'workshop', 'atelier'], productId: null, categoryId: 'other', label: 'Autre' },
];

// Product aliases for Layer 1 matching
const DEFAULT_PRODUCT_ALIASES = {
  'swd': ['swd', 'site web', 'site corporate', 'corporate'],
  'espace-client': ['ec', 'espace client', 'espace-client', 'portail client'],
  'app-mobile': ['app', 'mobile', 'app mobile', 'app-mobile'],
  'design-system': ['ds', 'design system', 'design-system', 'système de design'],
  'transversal': ['transversal', 'transverse', 'cross', 'général'],
};

// Category aliases for Layer 1 matching
const DEFAULT_CATEGORY_ALIASES = {
  'design': ['design', 'ux', 'ui', 'maquette', 'wireframe', 'prototype'],
  'discovery': ['discovery', 'recherche', 'research', 'test', 'interview'],
  'pm': ['pm', 'gestion', 'projet', 'planning', 'sprint', 'backlog'],
  'meetings': ['réunion', 'reunion', 'meeting', 'sync', 'call', 'point'],
  'docs': ['doc', 'documentation', 'rédaction', 'specs'],
  'designops': ['designops', 'design ops', 'ops', 'système', 'tokens'],
  'other': ['autre', 'other', 'divers'],
};

let state = {
  weeklyCapacity: 40,
  cycleLength: 4,
  cycleStartDate: null,     // R2.1: anchor date (ISO string or null)
  weekTemplates: [],         // R1.2: [{id, name, data: {prodId: {catId: h}}}]
  displayName: 'David Cardoso', // R9.3
  displayRole: 'Senior Product Designer', // R9.3
  timelineOffset: 0,         // R2.3: scroll offset for past/future weeks
  categories: JSON.parse(JSON.stringify(DEFAULT_CATEGORIES)),
  products: JSON.parse(JSON.stringify(DEFAULT_PRODUCTS)),
  weeks: {},
  stakeholders: JSON.parse(JSON.stringify(DEFAULT_STAKEHOLDERS)),
  projectName: 'SWD — Site Corporate',
  donutScope: 'week',
  donutMode: 'product',
  donutHighlight: null,      // R3.4: highlighted product in legend
  selectedWeekKey: null,
  capacityView: 'chart',     // R1.4: 'chart' or 'table'
  nextStakeholderId: 9,
  editingStakeholderId: null,
  sortField: null,
  sortDir: 1,
  expandedProducts: {},
  // ICS Import state
  keywordRules: JSON.parse(JSON.stringify(DEFAULT_KEYWORD_RULES)),
  productAliases: JSON.parse(JSON.stringify(DEFAULT_PRODUCT_ALIASES)),
  categoryAliases: JSON.parse(JSON.stringify(DEFAULT_CATEGORY_ALIASES)),
  nextRuleId: 8,
  // LLM state
  llmEnabled: false,
  llmProvider: 'openai',
  llmApiKey: '',
  llmCustomUrl: '',
  llmConnected: false,
  llmUseProxy: false,  // true = use serverless proxy, false = direct browser call
  // ICS parsed events
  icsEvents: [],      // all parsed events
  icsAutoEvents: [],   // layer 1+2 matched
  icsManualEvents: [], // layer 3 unmatched
  icsIgnoredEvents: [], // all-day, cancelled, etc.
  // Timesheet
  timesheetEntries: [],
  nextTimesheetId: 1,
  activeTimer: null, // { entryId, startedAt } or null
  timesheetView: 'today', // 'today' or 'week'
  // Team members (local reference list)
  teamMembers: [],
  // Theme
  theme: 'current',
};

// ========== UTILITY ==========
function getMonday(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function formatDate(d) {
  return d.toLocaleDateString('fr-CH', { day: 'numeric', month: 'short' });
}

// R2.2: ISO 8601 week number (Thursday-based)
function getWeekKey(monday) {
  // ISO 8601: week containing Thursday
  const d = new Date(monday);
  d.setHours(0, 0, 0, 0);
  // Find Thursday of this week
  const thursday = new Date(d);
  thursday.setDate(d.getDate() + 3);
  const year = thursday.getFullYear();
  // Jan 4 is always in week 1
  const jan4 = new Date(year, 0, 4);
  const weekMonday = new Date(jan4);
  weekMonday.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
  const weekNum = Math.round((d - weekMonday) / 604800000) + 1;
  return `${year}-W${String(weekNum).padStart(2, '0')}`;
}

function getWeekNumber(monday) {
  const d = new Date(monday);
  d.setHours(0, 0, 0, 0);
  const thursday = new Date(d);
  thursday.setDate(d.getDate() + 3);
  const year = thursday.getFullYear();
  const jan4 = new Date(year, 0, 4);
  const weekMonday = new Date(jan4);
  weekMonday.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
  return Math.round((d - weekMonday) / 604800000) + 1;
}

// R2.3: Show 4 past + 8 future weeks (12 total), with offset support
function getWeeks(count, offset) {
  offset = offset || 0;
  const today = new Date();
  let startMonday;
  if (state && state.cycleStartDate) {
    // R2.1: start from anchor date
    startMonday = getMonday(new Date(state.cycleStartDate));
  } else {
    startMonday = getMonday(today);
  }
  // Shift startMonday by (offset - 4) weeks so default is -4 past
  const baseOffset = offset - 4;
  const baseMonday = new Date(startMonday);
  baseMonday.setDate(baseMonday.getDate() + baseOffset * 7);

  const todayMonday = getMonday(today);
  const weeks = [];
  for (let i = 0; i < count; i++) {
    const monday = new Date(baseMonday);
    monday.setDate(monday.getDate() + i * 7);
    const friday = new Date(monday);
    friday.setDate(friday.getDate() + 4);
    const key = getWeekKey(monday);
    const isCurrent = monday.getTime() === todayMonday.getTime();
    const isPast = monday < todayMonday;
    weeks.push({ monday, friday, key, weekNum: getWeekNumber(monday), isCurrent, isPast });
  }
  return weeks;
}

function getWeekData(key) {
  // Ensure raw data structure exists in state.weeks
  if (!state.weeks[key]) {
    state.weeks[key] = {};
    state.products.forEach(p => {
      state.weeks[key][p.id] = {};
      state.categories.forEach(c => { state.weeks[key][p.id][c.id] = 0; });
    });
  }
  state.products.forEach(p => {
    if (!state.weeks[key][p.id]) state.weeks[key][p.id] = {};
    state.categories.forEach(c => {
      if (state.weeks[key][p.id][c.id] === undefined) state.weeks[key][p.id][c.id] = 0;
    });
  });
  return state.weeks[key];
}

function getWeekTotal(key) {
  const data = getMergedWeekData ? getMergedWeekData(key) : getWeekData(key);
  let total = 0;
  state.products.forEach(p => {
    state.categories.forEach(c => {
      total += (data[p.id] && data[p.id][c.id]) || 0;
    });
  });
  return total;
}

function getProductWeekTotal(weekKey, productId) {
  const data = getMergedWeekData ? getMergedWeekData(weekKey) : getWeekData(weekKey);
  if (!data[productId]) return 0;
  return state.categories.reduce((sum, c) => sum + ((data[productId][c.id]) || 0), 0);
}

function getProductTotals(keys) {
  const totals = {};
  state.products.forEach(p => { totals[p.id] = 0; });
  keys.forEach(k => {
    const data = getMergedWeekData ? getMergedWeekData(k) : getWeekData(k);
    state.products.forEach(p => {
      state.categories.forEach(c => {
        totals[p.id] += (data[p.id] && data[p.id][c.id]) || 0;
      });
    });
  });
  return totals;
}

function getActivityTotals(keys) {
  const totals = {};
  state.categories.forEach(c => { totals[c.id] = 0; });
  keys.forEach(k => {
    const data = getMergedWeekData ? getMergedWeekData(k) : getWeekData(k);
    state.products.forEach(p => {
      state.categories.forEach(c => {
        totals[c.id] += (data[p.id] && data[p.id][c.id]) || 0;
      });
    });
  });
  return totals;
}

function showToast(message, type = 'info', undoCb = null) {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.setAttribute('role', 'alert');
  toast.setAttribute('aria-live', 'polite');

  // Icon mapping for toast types
  const toastIcons = {
    success: typeof getIcon === 'function' ? getIcon('checkCircle', 18) : '',
    error: typeof getIcon === 'function' ? getIcon('ban', 18) : '',
    warning: typeof getIcon === 'function' ? getIcon('alertTriangle', 18) : '',
    info: ''
  };
  const iconHtml = toastIcons[type] || '';

  let html = '';
  if (iconHtml) html += `<span class="toast-icon" aria-hidden="true">${iconHtml}</span>`;
  html += `<span class="toast-content">${escapeHtml(message)}</span>`;
  if (undoCb) {
    html += `<button class="toast-undo" onclick="this.closest('.toast').__undoCb && this.closest('.toast').__undoCb()">Annuler</button>`;
    toast.__undoCb = undoCb;
  }
  html += `<button class="toast-close" aria-label="Fermer" onclick="this.closest('.toast').remove()">×</button>`;
  toast.innerHTML = html;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 5000);
}

// ========== CONFIRM DIALOG ==========
let _confirmCallback = null;

function showConfirm({ title, message, type = 'danger', confirmLabel = 'Confirmer', onConfirm }) {
  const overlay = document.getElementById('confirmOverlay');
  const iconEl = document.getElementById('confirmIcon');
  const titleEl = document.getElementById('confirmTitle');
  const msgEl = document.getElementById('confirmMessage');
  const okBtn = document.getElementById('confirmOkBtn');

  titleEl.textContent = title || 'Êtes-vous sûr ?';
  msgEl.textContent = message || '';
  iconEl.className = `confirm-icon ${type}`;

  // Set icon based on type
  if (typeof getIcon === 'function') {
    iconEl.innerHTML = type === 'warning' ? getIcon('alertTriangle', 24) : getIcon('trash', 24);
  }

  okBtn.textContent = confirmLabel;
  if (type === 'danger') {
    okBtn.className = 'btn btn-primary';
    okBtn.style.background = 'var(--danger)';
    okBtn.style.borderColor = 'var(--danger)';
  } else {
    okBtn.className = 'btn btn-primary';
    okBtn.style.background = '';
    okBtn.style.borderColor = '';
  }

  _confirmCallback = onConfirm;
  overlay.classList.add('open');
  okBtn.focus();
}

function executeConfirm() {
  closeConfirm();
  if (typeof _confirmCallback === 'function') _confirmCallback();
  _confirmCallback = null;
}

function closeConfirm() {
  const overlay = document.getElementById('confirmOverlay');
  if (overlay) overlay.classList.remove('open');
  _confirmCallback = null;
}

function getInitials(name) {
  return name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
}

// ========== NAVIGATION ==========
function switchSection(section) {
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  const navItem = document.querySelector(`.nav-item[data-section="${section}"]`);
  if (navItem) navItem.classList.add('active');
  document.querySelectorAll('.section').forEach(el => el.classList.remove('active'));
  document.getElementById(`section-${section}`).classList.add('active');
  if (section === 'stakeholders') {
    renderMatrixNodes();
    renderStakeholderTable();
  }
  if (section === 'settings') {
    renderCategorySettings();
    renderProductSettings();
  }
  if (section === 'mapping-rules') {
    renderMappingRules();
  }
  if (section === 'timesheet') {
    renderTimesheetFormDropdowns();
    renderTimesheet();
  }
  history.replaceState(null, '', '#' + section);
}

// ========== CAPACITY PLANNING ==========
let donutChart = null;
let allWeeks = [];

function refreshAllWeeks() {
  allWeeks = getWeeks(12, state.timelineOffset || 0);
}

function shiftTimeline(delta) {
  state.timelineOffset = (state.timelineOffset || 0) + delta;
  refreshAllWeeks();
  renderTimeline();
  updateDonut();
  renderCycles();
}

function renderTimeline() {
  const grid = document.getElementById('timelineGrid');
  grid.innerHTML = '';
  const rangeEl = document.getElementById('timelineRange');
  if (allWeeks.length > 0) {
    rangeEl.textContent = `${formatDate(allWeeks[0].monday)} — ${formatDate(allWeeks[allWeeks.length - 1].friday)}`;
  }

  if (!state.selectedWeekKey) {
    const currentW = allWeeks.find(w => w.isCurrent);
    state.selectedWeekKey = currentW ? currentW.key : (allWeeks[0] ? allWeeks[0].key : null);
  }

  allWeeks.forEach((w, idx) => {
    const total = getWeekTotal(w.key);
    const pct = Math.round((total / state.weeklyCapacity) * 100);
    const isOver = total > state.weeklyCapacity;
    const isSelected = state.selectedWeekKey === w.key;

    const col = document.createElement('div');
    col.className = `week-col ${w.isCurrent ? 'current' : ''} ${isSelected ? 'selected' : ''} ${isOver ? 'over-capacity' : ''} ${w.isPast ? 'past-week' : ''}`;
    col.setAttribute('tabindex', '0');
    col.setAttribute('role', 'button');
    col.title = `Semaine ${w.weekNum} — Cliquer pour editer (${total}h/${state.weeklyCapacity}h)`;
    col.onclick = () => selectWeek(w.key, w);
    col.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectWeek(w.key, w); } };

    let sprintHtml = '';
    if (idx % 2 === 0) {
      const sprintNum = Math.floor(idx / 2) + 1;
      sprintHtml = `<div class="sprint-marker"><span class="sprint-marker-label">Sprint ${sprintNum}</span><span class="sprint-marker-line"></span></div>`;
    }

    let segmentsHtml = '';
    const maxRef = Math.max(total, state.weeklyCapacity);
    state.products.forEach(prod => {
      const prodHours = getProductWeekTotal(w.key, prod.id);
      if (prodHours > 0) {
        const segHeight = (prodHours / maxRef) * 100;
        segmentsHtml += `<div class="week-bar-segment" style="height:${segHeight}%;background:${prod.color}" title="${prod.emoji} ${prod.name}: ${prodHours}h"></div>`;
      }
    });

    col.innerHTML = `
      ${sprintHtml}
      <div class="week-label">${w.isCurrent ? '● ' : ''}S${w.weekNum}</div>
      <div class="week-dates">${formatDate(w.monday)}</div>
      <div class="week-bar-container">${segmentsHtml}</div>
      <div class="week-stats">
        <div class="week-hours">${total}h</div>
        <div class="week-pct">${pct}%</div>
      </div>
    `;
    grid.appendChild(col);
  });
}

function selectWeek(key, weekInfo) {
  state.selectedWeekKey = key;
  renderTimeline();
  updateDonut();
  openWeekPanel(key, weekInfo);
}

// ========== WEEK EDITOR PANEL ==========
function openWeekPanel(key, weekInfo) {
  const overlay = document.getElementById('weekPanelOverlay');
  const panel = document.getElementById('weekPanel');
  const title = document.getElementById('weekPanelTitle');
  const body = document.getElementById('weekPanelBody');

  const w = weekInfo || allWeeks.find(w => w.key === key);
  title.textContent = `Semaine ${w ? w.weekNum : ''} — ${w ? formatDate(w.monday) + ' au ' + formatDate(w.friday) : key}`;

  const data = getWeekData(key); // raw manual/ICS data for inputs
  const rawData = state.weeks[key] || {}; // use raw data for input values
  const total = getWeekTotal(key);
  const remaining = state.weeklyCapacity - total;
  const isOver = remaining < 0;

  if (Object.keys(state.expandedProducts).length === 0) {
    state.products.forEach((p, i) => {
      state.expandedProducts[p.id] = i === 0;
    });
  }

  let html = '<div class="product-sections">';
  state.products.forEach(prod => {
    const prodTotal = getProductWeekTotal(key, prod.id);
    const isExpanded = state.expandedProducts[prod.id] || false;

    html += `
      <div class="product-section ${isExpanded ? 'expanded' : ''}" data-product="${prod.id}">
        <div class="product-header" onclick="toggleProductSection('${prod.id}')">
          <div class="product-header-left">
            <span class="product-chevron">${isExpanded ? '▾' : '▸'}</span>
            <div class="product-color-dot" style="background:${prod.color}"></div>
            <span class="product-header-name">${prod.emoji} ${prod.name}</span>
          </div>
          <div class="product-header-total">
            <span class="product-total-value" id="prodTotal_${prod.id}">${prodTotal}</span><span class="product-total-unit">h</span>
          </div>
        </div>
        <div class="product-activities" id="prodActivities_${prod.id}" style="display:${isExpanded ? 'block' : 'none'}">
    `;

    state.categories.forEach(cat => {
      const val = (rawData[prod.id] && rawData[prod.id][cat.id]) || 0;
      const tasks = getWeekTasksForProductCategory(key, prod.id, cat.id);
      const tsOnly = tasks.filter(t => t.type !== 'manual');
      const totalCatHours = val + tsOnly.reduce((s, t) => s + t.durationHours, 0);
      const hasTasks = tasks.length > 0;
      const taskToggleId = `taskToggle_${prod.id}_${cat.id}`;
      const taskListId = `taskList_${prod.id}_${cat.id}`;
      html += `
        <div class="category-row activity-sub-row">
          <div class="category-color" style="background:${cat.color}"></div>
          <span class="category-name">${cat.emoji} ${cat.name}</span>
          <input type="number" class="category-input" id="weekInput_${prod.id}_${cat.id}" value="${val}" min="0" max="80" step="0.5" data-prod="${prod.id}" data-cat="${cat.id}" oninput="updateWeekPreview()">
          <span class="category-unit">h</span>
          <button class="wp-task-toggle ${hasTasks ? 'has-tasks' : ''}" id="${taskToggleId}" onclick="toggleWeekTasks('${prod.id}','${cat.id}')" title="Voir les tâches">
            <span class="wp-task-count">${tsOnly.length}</span>
            <span class="wp-task-chevron">▸</span>
          </button>
        </div>
        <div class="wp-task-list" id="${taskListId}" style="display:none">
          ${renderWeekPanelTasks(tasks, key, prod.id, cat.id)}
        </div>
      `;
    });

    html += `
        </div>
      </div>
    `;
  });
  html += '</div>';

  // Source breakdown info
  const manualHours = (() => {
    let total = 0;
    const raw = state.weeks[key] || {};
    state.products.forEach(p => {
      state.categories.forEach(c => { total += (raw[p.id] && raw[p.id][c.id]) || 0; });
    });
    return total;
  })();
  // Split timesheet entries by source
  const tsBreakdown = (() => {
    let icsH = 0, manualTsH = 0;
    state.timesheetEntries
      .filter(e => e.weekKey === key && e.productId && e.categoryId)
      .forEach(e => {
        const h = minutesToDecimalHours(e.durationMinutes);
        if (e.source === 'ics') icsH += h;
        else manualTsH += h;
      });
    return { ics: Math.round(icsH * 4) / 4, ts: Math.round(manualTsH * 4) / 4 };
  })();
  if (manualHours > 0 || tsBreakdown.ics > 0 || tsBreakdown.ts > 0) {
    html += `
      <div class="ts-source-breakdown">
        ${manualHours > 0 ? '<span class="ts-source-item"><span class="ts-source-dot" style="background:var(--primary)"></span>Manuel : ' + manualHours + 'h</span>' : ''}
        ${tsBreakdown.ics > 0 ? '<span class="ts-source-item"><span class="ts-source-dot" style="background:#f59e0b"></span>ICS : ' + tsBreakdown.ics + 'h</span>' : ''}
        ${tsBreakdown.ts > 0 ? '<span class="ts-source-item"><span class="ts-source-dot" style="background:var(--success)"></span>Timesheet : ' + tsBreakdown.ts + 'h</span>' : ''}
        <span class="ts-source-item" style="margin-left:auto;font-weight:600;color:var(--text-secondary)">Total : ${total}h</span>
      </div>
    `;
  }

  html += `
    <div class="remaining-bar">
      <div class="remaining-label">
        <span class="remaining-label-text">Capacité restante</span>
        <span class="remaining-label-value ${isOver ? 'over' : ''}" id="remainingValue">${remaining >= 0 ? remaining + 'h disponibles' : Math.abs(remaining) + 'h en excès'}</span>
      </div>
      <div class="remaining-track">
        <div class="remaining-fill" id="remainingFill" style="width:${Math.min((total / state.weeklyCapacity) * 100, 100)}%;background:${isOver ? 'var(--danger)' : 'var(--primary)'}"></div>
      </div>
    </div>
  `;

  body.innerHTML = html;
  panel.dataset.weekKey = key;
  overlay.classList.add('open');
  panel.classList.add('open');
}

function toggleProductSection(productId) {
  state.expandedProducts[productId] = !state.expandedProducts[productId];
  const section = document.querySelector(`.product-section[data-product="${productId}"]`);
  const activities = document.getElementById(`prodActivities_${productId}`);
  const chevron = section.querySelector('.product-chevron');

  if (state.expandedProducts[productId]) {
    section.classList.add('expanded');
    activities.style.display = 'block';
    chevron.textContent = '▾';
  } else {
    section.classList.remove('expanded');
    activities.style.display = 'none';
    chevron.textContent = '▸';
  }
}

function updateWeekPreview() {
  const weekKey = document.getElementById('weekPanel')?.dataset?.weekKey;
  let grandTotal = 0;
  const tsHours = weekKey ? getTimesheetHoursForWeek(weekKey) : {};

  state.products.forEach(prod => {
    let prodTotal = 0;
    state.categories.forEach(cat => {
      const input = document.getElementById(`weekInput_${prod.id}_${cat.id}`);
      if (input) prodTotal += parseFloat(input.value) || 0;
      // Add timesheet hours for this product/category
      if (tsHours[prod.id] && tsHours[prod.id][cat.id]) {
        prodTotal += tsHours[prod.id][cat.id];
      }
    });
    grandTotal += prodTotal;
    const totalEl = document.getElementById(`prodTotal_${prod.id}`);
    if (totalEl) totalEl.textContent = Math.round(prodTotal * 4) / 4;
  });

  const remaining = state.weeklyCapacity - grandTotal;
  const isOver = remaining < 0;
  const el = document.getElementById('remainingValue');
  if (el) {
    el.textContent = isOver ? Math.abs(remaining) + 'h en excès' : remaining + 'h disponibles';
    el.className = `remaining-label-value ${isOver ? 'over' : ''}`;
  }
  const fill = document.getElementById('remainingFill');
  if (fill) {
    fill.style.width = Math.min((grandTotal / state.weeklyCapacity) * 100, 100) + '%';
    fill.style.background = isOver ? 'var(--danger)' : 'var(--primary)';
  }
}

function saveWeekData() {
  const key = document.getElementById('weekPanel').dataset.weekKey;
  if (!state.weeks[key]) state.weeks[key] = {};

  state.products.forEach(prod => {
    if (!state.weeks[key][prod.id]) state.weeks[key][prod.id] = {};
    state.categories.forEach(cat => {
      const input = document.getElementById(`weekInput_${prod.id}_${cat.id}`);
      if (input) state.weeks[key][prod.id][cat.id] = parseFloat(input.value) || 0;
    });
  });

  closeWeekPanel(true);
  renderTimeline();
  updateDonut();
  renderCycles();
  renderKPIBar();
  showToast('Semaine enregistrée', 'success');
  scheduleSave();
}

// R3.1: KPI Bar — shows aggregate stats for visible weeks
function renderKPIBar() {
  const bar = document.getElementById('kpiBar');
  if (!bar) return;
  const keys = allWeeks.map(w => w.key);
  let totalHours = 0, totalCapacity = 0, overWeeks = 0, filledWeeks = 0;
  allWeeks.forEach(w => {
    const h = getWeekTotal(w.key);
    totalHours += h;
    totalCapacity += state.weeklyCapacity;
    if (h > state.weeklyCapacity) overWeeks++;
    if (h > 0) filledWeeks++;
  });
  const avgHours = filledWeeks > 0 ? Math.round(totalHours / filledWeeks) : 0;
  const utilPct = totalCapacity > 0 ? Math.round((totalHours / totalCapacity) * 100) : 0;
  bar.innerHTML = `
    <div class="kpi-card">
      <div class="kpi-value">${totalHours}h</div>
      <div class="kpi-label">Heures totales</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-value" style="color:${utilPct > 100 ? 'var(--danger)' : utilPct > 85 ? 'var(--warning)' : 'var(--success)'};">${utilPct}%</div>
      <div class="kpi-label">Utilisation</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-value">${avgHours}h</div>
      <div class="kpi-label">Moy. par semaine</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-value" style="color:${overWeeks > 0 ? 'var(--danger)' : 'var(--text-muted)'}">${overWeeks}</div>
      <div class="kpi-label">Semaines surchargées</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-value">${filledWeeks}</div>
      <div class="kpi-label">Semaines planifiées</div>
    </div>
  `;
}

// R1.3: Save & go to next week
function saveAndNextWeek() {
  const panel = document.getElementById('weekPanel');
  const key = panel.dataset.weekKey;
  if (!state.weeks[key]) state.weeks[key] = {};
  state.products.forEach(prod => {
    if (!state.weeks[key][prod.id]) state.weeks[key][prod.id] = {};
    state.categories.forEach(cat => {
      const input = document.getElementById(`weekInput_${prod.id}_${cat.id}`);
      if (input) state.weeks[key][prod.id][cat.id] = parseFloat(input.value) || 0;
    });
  });
  scheduleSave();
  // Find next week
  const idx = allWeeks.findIndex(w => w.key === key);
  if (idx >= 0 && idx < allWeeks.length - 1) {
    const nextWeek = allWeeks[idx + 1];
    state.selectedWeekKey = nextWeek.key;
    panel.dataset.weekKey = nextWeek.key;
    const w = nextWeek;
    document.getElementById('weekPanelTitle').textContent = `Semaine ${w.weekNum} — ${formatDate(w.monday)} au ${formatDate(w.friday)}`;
    openWeekPanel(nextWeek.key, nextWeek);
    showToast('Semaine suivante', 'info');
  } else {
    closeWeekPanel(true);
    showToast('Semaine enregistrée', 'success');
  }
  renderTimeline(); updateDonut(); renderCycles();
}

// R1.1: Copy week modal
function openCopyWeekModal() {
  const key = document.getElementById('weekPanel').dataset.weekKey;
  const w = allWeeks.find(w => w.key === key);
  const title = w ? `S${w.weekNum}` : key;
  let weeksHtml = allWeeks
    .filter(wk => wk.key !== key)
    .map(wk => `<label style="display:flex;align-items:center;gap:8px;padding:6px 0;cursor:pointer;"><input type="checkbox" value="${wk.key}" style="accent-color:var(--primary)"> S${wk.weekNum} — ${formatDate(wk.monday)}</label>`)
    .join('');
  const modal = document.getElementById('genericModal');
  const modalTitle = document.getElementById('genericModalTitle');
  const modalBody = document.getElementById('genericModalBody');
  const modalOk = document.getElementById('genericModalOk');
  modalTitle.textContent = `Copier ${title} vers...`;
  modalBody.innerHTML = `<p style="font-size:12px;color:var(--text-muted);margin-bottom:12px;">Sélectionnez les semaines cibles :</p><div style="max-height:300px;overflow-y:auto;">${weeksHtml}</div>`;
  modalOk.textContent = 'Copier';
  modalOk.onclick = () => {
    const checked = modalBody.querySelectorAll('input:checked');
    const srcData = JSON.parse(JSON.stringify(state.weeks[key] || {}));
    checked.forEach(cb => {
      state.weeks[cb.value] = JSON.parse(JSON.stringify(srcData));
    });
    renderTimeline(); updateDonut(); renderCycles();
    scheduleSave();
    closeGenericModal();
    showToast(`Copié vers ${checked.length} semaine(s)`, 'success');
  };
  modal.classList.add('open');
}

// R1.2: Save as template
function openSaveTemplateModal() {
  const key = document.getElementById('weekPanel').dataset.weekKey;
  const modal = document.getElementById('genericModal');
  const modalTitle = document.getElementById('genericModalTitle');
  const modalBody = document.getElementById('genericModalBody');
  const modalOk = document.getElementById('genericModalOk');
  modalTitle.textContent = 'Sauver comme modèle';
  modalBody.innerHTML = `<div class="form-group"><label class="form-label">Nom du modèle</label><input type="text" class="form-input" id="templateNameInput" placeholder="Ex: Semaine type design" autofocus></div>`;
  modalOk.textContent = 'Sauver';
  modalOk.onclick = () => {
    const name = document.getElementById('templateNameInput').value.trim();
    if (!name) { showToast('Veuillez saisir un nom', 'error'); return; }
    // Read current input values
    const data = {};
    state.products.forEach(prod => {
      data[prod.id] = {};
      state.categories.forEach(cat => {
        const input = document.getElementById(`weekInput_${prod.id}_${cat.id}`);
        data[prod.id][cat.id] = parseFloat(input ? input.value : 0) || 0;
      });
    });
    state.weekTemplates.push({ id: Date.now(), name, data });
    scheduleSave();
    closeGenericModal();
    showToast('Modèle sauvegardé', 'success');
  };
  modal.classList.add('open');
  setTimeout(() => document.getElementById('templateNameInput')?.focus(), 100);
}

// R1.2: Apply template
function openApplyTemplateModal() {
  if (state.weekTemplates.length === 0) {
    showToast('Aucun modèle disponible. Créez d\'abord un modèle.', 'info');
    return;
  }
  const modal = document.getElementById('genericModal');
  const modalTitle = document.getElementById('genericModalTitle');
  const modalBody = document.getElementById('genericModalBody');
  const modalOk = document.getElementById('genericModalOk');
  modalTitle.textContent = 'Appliquer un modèle';
  let html = state.weekTemplates.map(t => `<label style="display:flex;align-items:center;gap:8px;padding:6px 0;cursor:pointer;"><input type="radio" name="templateChoice" value="${t.id}" style="accent-color:var(--primary)"> ${escapeHtml(t.name)}</label>`).join('');
  modalBody.innerHTML = `<div style="max-height:260px;overflow-y:auto;">${html}</div>`;
  modalOk.textContent = 'Appliquer';
  modalOk.onclick = () => {
    const sel = modalBody.querySelector('input[name="templateChoice"]:checked');
    if (!sel) { showToast('Sélectionnez un modèle', 'error'); return; }
    const tpl = state.weekTemplates.find(t => t.id === parseInt(sel.value));
    if (!tpl) return;
    // Apply to current inputs
    state.products.forEach(prod => {
      state.categories.forEach(cat => {
        const input = document.getElementById(`weekInput_${prod.id}_${cat.id}`);
        if (input && tpl.data[prod.id] !== undefined) {
          input.value = tpl.data[prod.id][cat.id] || 0;
        }
      });
    });
    updateWeekPreview();
    closeGenericModal();
    showToast('Modèle appliqué', 'success');
  };
  modal.classList.add('open');
}

function closeGenericModal() {
  document.getElementById('genericModal')?.classList.remove('open');
}

// R1.4: Table view toggle
function setCapacityView(view) {
  state.capacityView = view;
  // Update toggle buttons active state
  const gBtn = document.getElementById('viewToggleGraphique');
  const tBtn = document.getElementById('viewToggleTableau');
  if (gBtn) gBtn.classList.toggle('active', view === 'graphique');
  if (tBtn) tBtn.classList.toggle('active', view === 'tableau');
  // Show/hide views
  const graphView = document.getElementById('capacityGraphiqueView');
  const tableView = document.getElementById('capacityTableView');
  if (graphView) graphView.style.display = view === 'graphique' ? '' : 'none';
  if (tableView) tableView.style.display = view === 'tableau' ? '' : 'none';
  if (view === 'tableau') renderCapacityTable();
}

function renderCapacityTable() {
  const container = document.getElementById('capacityTable');
  if (!container) return;
  let html = '<thead><tr><th>Semaine</th>';
  state.products.forEach(p => {
    html += `<th>${p.emoji} ${p.name}</th>`;
  });
  html += '<th>Total</th></tr></thead><tbody>';
  allWeeks.forEach(w => {
    const isCurrentW = w.isCurrent;
    const isPast = w.isPast;
    html += `<tr style="${isCurrentW ? 'background:var(--primary-dim);' : isPast ? 'opacity:0.6;' : ''}">`;
    html += `<td style="font-weight:600;color:${isCurrentW ? 'var(--primary-light)' : 'var(--text)'};">S${w.weekNum} — ${formatDate(w.monday)}</td>`;
    let rowTotal = 0;
    state.products.forEach(p => {
      const val = getProductWeekTotal(w.key, p.id);
      rowTotal += val;
      html += `<td><input type="number" value="${val}" min="0" step="0.5" onblur="updateCapacityTableCell('${w.key}','${p.id}',this.value)" onkeydown="if(event.key==='Enter')this.blur()"></td>`;
    });
    html += `<td class="ct-total ${rowTotal > state.weeklyCapacity ? 'ct-over' : ''}">${rowTotal}h</td>`;
    html += '</tr>';
  });
  html += '</tbody>';
  container.innerHTML = html;
}

function updateCapacityTableCell(weekKey, productId, value) {
  if (!state.weeks[weekKey]) state.weeks[weekKey] = {};
  if (!state.weeks[weekKey][productId]) state.weeks[weekKey][productId] = {};
  // Distribute value across categories proportionally or just put in first active
  const currentTotal = state.categories.reduce((s, c) => s + ((state.weeks[weekKey][productId][c.id]) || 0), 0);
  const newVal = parseFloat(value) || 0;
  if (currentTotal === 0 && newVal > 0) {
    state.weeks[weekKey][productId][state.categories[0].id] = newVal;
  } else if (currentTotal > 0) {
    const ratio = newVal / currentTotal;
    state.categories.forEach(c => {
      state.weeks[weekKey][productId][c.id] = Math.round(((state.weeks[weekKey][productId][c.id] || 0) * ratio) * 4) / 4;
    });
  }
  renderTimeline(); updateDonut(); renderCycles(); renderKPIBar();
  scheduleSave();
}

function closeWeekPanel(force) {
  // R10.2: Unsaved changes warning
  if (!force) {
    const panel = document.getElementById('weekPanel');
    if (panel && panel.classList.contains('open')) {
      const key = panel.dataset.weekKey;
      // Check if any inputs differ from saved state
      let hasChanges = false;
      if (key) {
        state.products.forEach(prod => {
          state.categories.forEach(cat => {
            const input = document.getElementById(`weekInput_${prod.id}_${cat.id}`);
            if (input) {
              const savedVal = (state.weeks[key] && state.weeks[key][prod.id] && state.weeks[key][prod.id][cat.id]) || 0;
              if (Math.abs((parseFloat(input.value) || 0) - savedVal) > 0.001) hasChanges = true;
            }
          });
        });
      }
      if (hasChanges) {
        if (!confirm('Des modifications non enregistrées seront perdues. Fermer quand même ?')) return;
      }
    }
  }
  document.getElementById('weekPanelOverlay').classList.remove('open');
  document.getElementById('weekPanel').classList.remove('open');
}

// ========== WEEK PANEL TASK DETAIL ==========
function renderWeekPanelTasks(tasks, weekKey, productId, categoryId) {
  if (tasks.length === 0) {
    return `<div class="wp-task-empty">Aucune tâche enregistrée</div>
            <div class="wp-task-add-row">
              <button class="wp-task-add-btn" onclick="showWeekTaskForm('${productId}','${categoryId}')">
                + Ajouter une tâche
              </button>
            </div>`;
  }
  let html = '<div class="wp-task-items">';
  tasks.forEach(t => {
    if (t.type === 'manual') {
      // Purely manual/bulk hours
      html += `
        <div class="wp-task-item wp-task-manual">
          <div class="wp-task-icon" title="Heures manuelles">${typeof getIcon === 'function' ? getIcon('clipboard', 14) : '📋'}</div>
          <div class="wp-task-info">
            <span class="wp-task-name">${escapeHtml(t.name)}</span>
          </div>
          <span class="wp-task-dur">${t.durationHours}h</span>
        </div>`;
    } else {
      // Both ICS and timesheet entries are editable
      const stakeholder = t.stakeholderId ? state.stakeholders.find(s => s.id === t.stakeholderId) : null;
      const isActive = state.activeTimer && state.activeTimer.entryId === t.id;
      const isICS = t.type === 'ics';
      const icon = typeof getIcon === 'function'
        ? (isICS ? getIcon('calendar', 14) : (t.fromTimer ? getIcon('clock', 14) : getIcon('edit', 14)))
        : (isICS ? '📅' : (t.fromTimer ? '⏱️' : '✏️'));
      const sourceLabel = isICS ? 'ICS' : (t.fromTimer ? 'timer' : 'saisie');
      html += `
        <div class="wp-task-item ${isActive ? 'wp-task-timer-active' : ''} ${isICS ? 'wp-task-ics' : ''}" data-ts-id="${t.id}">
          <div class="wp-task-icon" title="${isICS ? 'Importé depuis ICS' : 'Timesheet'}">${icon}</div>
          <div class="wp-task-info">
            <span class="wp-task-name">${escapeHtml(t.name)}</span>
            <span class="wp-task-meta">
              ${t.date ? '<span class="wp-task-date">' + t.date.slice(5) + '</span>' : ''}
              ${stakeholder ? '<span class="wp-task-stakeholder">' + (typeof getIcon === 'function' ? getIcon('user', 12) : '') + ' ' + escapeHtml(stakeholder.name) + '</span>' : ''}
              <span class="wp-task-source-tag wp-task-source-${isICS ? 'ics' : 'ts'}">${sourceLabel}</span>
              ${t.notes ? '<span class="wp-task-notes" title="' + escapeHtml(t.notes) + '">' + (typeof getIcon === 'function' ? getIcon('fileText', 12) : '') + '</span>' : ''}
            </span>
          </div>
          <span class="wp-task-dur ${isActive ? 'timer-pulse' : ''}">${formatMinutes(t.durationMinutes)}</span>
          <div class="wp-task-actions">
            <button class="wp-task-action-btn" onclick="editWeekTask(${t.id})" title="Modifier">${typeof getIcon === 'function' ? getIcon('edit', 14) : '✏️'}</button>
            <button class="wp-task-action-btn wp-task-delete" onclick="deleteWeekTask(${t.id},'${weekKey}')" title="Supprimer">${typeof getIcon === 'function' ? getIcon('trash', 14) : '🗑️'}</button>
          </div>
        </div>`;
    }
  });
  html += '</div>';
  html += `<div class="wp-task-add-row">
    <button class="wp-task-add-btn" onclick="showWeekTaskForm('${productId}','${categoryId}')">
      + Ajouter une tâche
    </button>
  </div>`;
  return html;
}

function toggleWeekTasks(productId, categoryId) {
  const listEl = document.getElementById(`taskList_${productId}_${categoryId}`);
  const btnEl = document.getElementById(`taskToggle_${productId}_${categoryId}`);
  if (!listEl || !btnEl) return;
  const isOpen = listEl.style.display !== 'none';
  listEl.style.display = isOpen ? 'none' : 'block';
  const chevron = btnEl.querySelector('.wp-task-chevron');
  if (chevron) chevron.textContent = isOpen ? '▸' : '▾';
  btnEl.classList.toggle('open', !isOpen);
}

function showWeekTaskForm(productId, categoryId) {
  const weekKey = document.getElementById('weekPanel').dataset.weekKey;
  const listEl = document.getElementById(`taskList_${productId}_${categoryId}`);
  if (!listEl) return;
  // Check if form already open
  if (listEl.querySelector('.wp-task-inline-form')) return;

  const stakeholderOpts = '<option value="">(Aucune)</option>' +
    state.stakeholders.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');

  const formHtml = `
    <div class="wp-task-inline-form">
      <input type="text" class="wp-task-form-input" id="wpTaskName_${productId}_${categoryId}" placeholder="Nom de la tâche" autocomplete="off">
      <input type="text" class="wp-task-form-dur" id="wpTaskDur_${productId}_${categoryId}" placeholder="1:30 ou 90min" autocomplete="off">
      <input type="date" class="wp-task-form-date" id="wpTaskDate_${productId}_${categoryId}" value="${getTodayISO()}">
      <select class="wp-task-form-stakeholder" id="wpTaskSH_${productId}_${categoryId}" title="Partie prenante (facultatif)">
        ${stakeholderOpts}
      </select>
      <div class="wp-task-form-actions">
        <button class="wp-task-form-save" onclick="saveWeekTask('${productId}','${categoryId}')">Ajouter</button>
        <button class="wp-task-form-cancel" onclick="cancelWeekTaskForm('${productId}','${categoryId}')">Annuler</button>
      </div>
    </div>
  `;
  // Insert before the add button
  const addRow = listEl.querySelector('.wp-task-add-row');
  if (addRow) addRow.insertAdjacentHTML('beforebegin', formHtml);
  else listEl.insertAdjacentHTML('beforeend', formHtml);
  document.getElementById(`wpTaskName_${productId}_${categoryId}`).focus();
}

function cancelWeekTaskForm(productId, categoryId) {
  const listEl = document.getElementById(`taskList_${productId}_${categoryId}`);
  if (!listEl) return;
  const form = listEl.querySelector('.wp-task-inline-form');
  if (form) form.remove();
}

function saveWeekTask(productId, categoryId) {
  const weekKey = document.getElementById('weekPanel').dataset.weekKey;
  const name = document.getElementById(`wpTaskName_${productId}_${categoryId}`).value.trim();
  const durRaw = document.getElementById(`wpTaskDur_${productId}_${categoryId}`).value.trim();
  const dateVal = document.getElementById(`wpTaskDate_${productId}_${categoryId}`).value || getTodayISO();
  const shRaw = document.getElementById(`wpTaskSH_${productId}_${categoryId}`);
  const stakeholderId = shRaw && shRaw.value ? parseInt(shRaw.value) : null;

  if (!name) { showToast('Le nom de la tâche est requis', 'error'); return; }
  const durationMinutes = parseDuration(durRaw);
  if (durationMinutes <= 0) { showToast('Durée invalide (ex: 1:30 ou 90)', 'error'); return; }

  const entry = {
    id: state.nextTimesheetId++,
    name,
    productId,
    categoryId,
    stakeholderId,
    date: dateVal,
    durationMinutes,
    weekKey,
    notes: '',
    fromTimer: false,
  };

  state.timesheetEntries.push(entry);
  scheduleSave();
  showToast('Tâche ajoutée', 'success');
  // Refresh week panel
  refreshWeekPanelTasks(weekKey);
  renderTimeline();
  updateDonut();
  renderTimesheet();
  renderStakeholderTable(); // refresh contact scores
}

function deleteWeekTask(entryId, weekKey) {
  const deleted = state.timesheetEntries.find(e => e.id === entryId);
  const idx = state.timesheetEntries.findIndex(e => e.id === entryId);
  state.timesheetEntries = state.timesheetEntries.filter(e => e.id !== entryId);
  if (state.activeTimer && state.activeTimer.entryId === entryId) {
    state.activeTimer = null;
  }
  scheduleSave();
  refreshWeekPanelTasks(weekKey);
  renderTimeline();
  updateDonut();
  renderTimesheet();
  renderStakeholderTable();
  showToast('Tâche supprimée', 'info', () => {
    if (deleted) {
      state.timesheetEntries.splice(idx, 0, deleted);
      refreshWeekPanelTasks(weekKey);
      renderTimeline(); updateDonut(); renderTimesheet();
      scheduleSave();
    }
  });
}

function editWeekTask(entryId) {
  const entry = state.timesheetEntries.find(e => e.id === entryId);
  if (!entry) return;
  const weekKey = document.getElementById('weekPanel').dataset.weekKey;
  const listEl = document.getElementById(`taskList_${entry.productId}_${entry.categoryId}`);
  if (!listEl) return;

  // Replace the task item with an edit form
  const taskEl = listEl.querySelector(`[data-ts-id="${entryId}"]`);
  if (!taskEl) return;

  const durFormatted = entry.durationMinutes >= 60
    ? `${Math.floor(entry.durationMinutes / 60)}:${String(entry.durationMinutes % 60).padStart(2, '0')}`
    : `${entry.durationMinutes}`;

  const stakeholderOpts = '<option value="">(Aucune)</option>' +
    state.stakeholders.map(s => `<option value="${s.id}" ${entry.stakeholderId === s.id ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('');

  taskEl.outerHTML = `
    <div class="wp-task-inline-form wp-task-edit-form" data-edit-id="${entryId}">
      <input type="text" class="wp-task-form-input" id="wpEditName_${entryId}" value="${escapeHtml(entry.name)}" autocomplete="off">
      <input type="text" class="wp-task-form-dur" id="wpEditDur_${entryId}" value="${durFormatted}" placeholder="Durée" autocomplete="off">
      <input type="date" class="wp-task-form-date" id="wpEditDate_${entryId}" value="${entry.date || getTodayISO()}">
      <select class="wp-task-form-stakeholder" id="wpEditSH_${entryId}" title="Partie prenante (facultatif)">
        ${stakeholderOpts}
      </select>
      <div class="wp-task-form-actions">
        <button class="wp-task-form-save" onclick="saveEditWeekTask(${entryId})">Enregistrer</button>
        <button class="wp-task-form-cancel" onclick="cancelEditWeekTask(${entryId})">Annuler</button>
      </div>
    </div>
  `;
  document.getElementById(`wpEditName_${entryId}`).focus();
}

function saveEditWeekTask(entryId) {
  const entry = state.timesheetEntries.find(e => e.id === entryId);
  if (!entry) return;
  const name = document.getElementById(`wpEditName_${entryId}`).value.trim();
  const durRaw = document.getElementById(`wpEditDur_${entryId}`).value.trim();
  const dateVal = document.getElementById(`wpEditDate_${entryId}`).value;
  const shEl = document.getElementById(`wpEditSH_${entryId}`);
  const stakeholderId = shEl && shEl.value ? parseInt(shEl.value) : null;

  if (!name) { showToast('Le nom est requis', 'error'); return; }
  const durationMinutes = parseDuration(durRaw);
  if (durationMinutes <= 0) { showToast('Durée invalide', 'error'); return; }

  entry.name = name;
  entry.durationMinutes = durationMinutes;
  entry.stakeholderId = stakeholderId;
  if (dateVal) {
    entry.date = dateVal;
    entry.weekKey = getWeekKey(getMonday(new Date(dateVal)));
  }

  scheduleSave();
  showToast('Tâche modifiée', 'success');
  const weekKey = document.getElementById('weekPanel').dataset.weekKey;
  refreshWeekPanelTasks(weekKey);
  renderTimeline();
  updateDonut();
  renderTimesheet();
  renderStakeholderTable(); // refresh contact scores
}

function cancelEditWeekTask(entryId) {
  const weekKey = document.getElementById('weekPanel').dataset.weekKey;
  refreshWeekPanelTasks(weekKey);
}

function refreshWeekPanelTasks(weekKey) {
  // Re-render all task lists currently open in the week panel
  const rawData = state.weeks[weekKey] || {};
  state.products.forEach(prod => {
    state.categories.forEach(cat => {
      const listEl = document.getElementById(`taskList_${prod.id}_${cat.id}`);
      if (!listEl) return;
      const wasOpen = listEl.style.display !== 'none';
      const tasks = getWeekTasksForProductCategory(weekKey, prod.id, cat.id);
      listEl.innerHTML = renderWeekPanelTasks(tasks, weekKey, prod.id, cat.id);
      listEl.style.display = wasOpen ? 'block' : 'none';
      // Update task count badge
      const tsOnly = tasks.filter(t => t.type !== 'manual');
      const btnEl = document.getElementById(`taskToggle_${prod.id}_${cat.id}`);
      if (btnEl) {
        const countEl = btnEl.querySelector('.wp-task-count');
        if (countEl) countEl.textContent = tsOnly.length;
        btnEl.classList.toggle('has-tasks', tasks.length > 0);
      }
    });
  });
  // Also update product totals and remaining capacity
  updateWeekPreview();
}

// ========== DONUT CHART ==========
function setDonutScope(scope) {
  state.donutScope = scope;
  document.querySelectorAll('#donutScopeToggleSmall .tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.scope === scope);
  });
  updateDonut();
}

function setDonutMode(mode) {
  state.donutMode = mode;
  document.querySelectorAll('#donutModeToggle .donut-toggle-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });
  updateDonut();
}

function getDonutKeys() {
  let keys = [];
  if (state.donutScope === 'week') {
    keys = [state.selectedWeekKey || allWeeks[0].key];
  } else if (state.donutScope === 'cycle') {
    const selectedIdx = allWeeks.findIndex(w => w.key === state.selectedWeekKey);
    const cycleIdx = Math.floor((selectedIdx >= 0 ? selectedIdx : 0) / state.cycleLength);
    const start = cycleIdx * state.cycleLength;
    const end = Math.min(start + state.cycleLength, allWeeks.length);
    keys = allWeeks.slice(start, end).map(w => w.key);
  } else {
    keys = allWeeks.map(w => w.key);
  }
  return keys;
}

function updateDonut() {
  const keys = getDonutKeys();
  const isProductMode = state.donutMode === 'product';

  let labels, data, colors, items;

  if (isProductMode) {
    const totals = getProductTotals(keys);
    items = state.products;
    labels = items.map(p => p.name);
    data = items.map(p => totals[p.id]);
    colors = items.map(p => p.color);
  } else {
    const totals = getActivityTotals(keys);
    items = state.categories;
    labels = items.map(c => c.name);
    data = items.map(c => totals[c.id]);
    colors = items.map(c => c.color);
  }

  const grandTotal = data.reduce((a, b) => a + b, 0);

  if (donutChart) {
    donutChart.data.labels = labels;
    donutChart.data.datasets[0].data = data;
    donutChart.data.datasets[0].backgroundColor = colors;
    donutChart.update();
  } else {
    const ctx = document.getElementById('donutChart').getContext('2d');
    donutChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: colors,
          borderWidth: 0,
          hoverBorderWidth: 2,
          hoverBorderColor: '#fff',
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        cutout: '68%',
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#222538',
            borderColor: '#2A2D3A',
            borderWidth: 1,
            titleFont: { family: 'DM Sans', size: 12 },
            bodyFont: { family: 'DM Sans', size: 12 },
            callbacks: {
              label: (ctx) => {
                const val = ctx.parsed;
                const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                const pct = total > 0 ? Math.round(val / total * 100) : 0;
                return ` ${val}h (${pct}%)`;
              }
            }
          }
        },
        animation: { animateRotate: true, duration: 600 },
      }
    });
  }

  document.getElementById('donutCenterHours').textContent = grandTotal + 'h';
  const scopeLabels = { week: 'cette semaine', cycle: 'ce cycle', all: 'toutes semaines' };
  document.getElementById('donutCenterText').textContent = grandTotal === 0 ? 'aucune donnee' : scopeLabels[state.donutScope];

  // Show empty state styling when no data
  const donutWrapper = document.querySelector('.donut-wrapper');
  if (donutWrapper) {
    donutWrapper.classList.toggle('donut-empty', grandTotal === 0);
  }

  const legend = document.getElementById('donutLegend');
  legend.innerHTML = items.map((item, i) => {
    const h = data[i];
    const pct = grandTotal > 0 ? Math.round(h / grandTotal * 100) : 0;
    const isHighlighted = state.donutHighlight === null || state.donutHighlight === i;
    return `
      <div class="legend-item ${!isHighlighted ? 'legend-dimmed' : ''}" onclick="toggleDonutHighlight(${i})" style="cursor:pointer;">
        <div class="legend-dot" style="background:${item.color}"></div>
        <span class="legend-label">${item.emoji} ${item.name}</span>
        <span class="legend-value">${h}h</span>
        <span class="legend-pct">${pct}%</span>
      </div>
    `;
  }).join('');
}

// R3.4: Toggle donut highlight
function toggleDonutHighlight(idx) {
  if (state.donutHighlight === idx) {
    state.donutHighlight = null; // clear
  } else {
    state.donutHighlight = idx;
  }
  // Update chart transparency
  if (donutChart) {
    const colors = donutChart.data.datasets[0].backgroundColor;
    if (state.donutHighlight === null) {
      donutChart.data.datasets[0].backgroundColor = colors.map(c => c.replace(/,\s*[\d.]+\)$/, ', 1)').replace(/^#/, 'rgba(') );
      // Reset: just keep original
      updateDonut();
    } else {
      // Dim all except selected
      const origColors = donutChart.data.datasets[0].backgroundColor;
      donutChart.data.datasets[0].backgroundColor = origColors.map((c, i) => {
        if (i === state.donutHighlight) return c;
        return c + (c.startsWith('rgba') ? '' : '99'); // add transparency
      });
      donutChart.update();
    }
  }
  // Re-render legend with highlight state
  const legendEl = document.getElementById('donutLegend');
  if (legendEl) {
    const items = donutChart ? donutChart.data.labels.map((l, i) => i) : [];
    const legendItems = legendEl.querySelectorAll('.legend-item');
    legendItems.forEach((el, i) => {
      el.classList.toggle('legend-dimmed', state.donutHighlight !== null && state.donutHighlight !== i);
    });
  }
}

// ========== CYCLES ==========
function renderCycles() {
  const grid = document.getElementById('cyclesGrid');
  grid.innerHTML = '';
  const numCycles = Math.ceil(allWeeks.length / state.cycleLength);
  // R3.5: Use isCurrent flag instead of allWeeks[0]
  const currentWeek = allWeeks.find(w => w.isCurrent);
  const currentWeekKey = currentWeek ? currentWeek.key : (allWeeks[0] ? allWeeks[0].key : null);

  for (let i = 0; i < numCycles; i++) {
    const start = i * state.cycleLength;
    const end = Math.min(start + state.cycleLength, allWeeks.length);
    const cycleWeeks = allWeeks.slice(start, end);
    const isCurrent = cycleWeeks.some(w => w.key === currentWeekKey);

    let totalHours = 0;
    const prodTotals = {};
    state.products.forEach(p => { prodTotals[p.id] = 0; });

    cycleWeeks.forEach(w => {
      state.products.forEach(p => {
        const ph = getProductWeekTotal(w.key, p.id);
        prodTotals[p.id] += ph;
        totalHours += ph;
      });
    });

    const maxCapacity = state.weeklyCapacity * cycleWeeks.length;
    const utilPct = maxCapacity > 0 ? Math.round((totalHours / maxCapacity) * 100) : 0;

    let miniBars = '';
    if (totalHours > 0) {
      state.products.forEach(p => {
        const pct = (prodTotals[p.id] / totalHours) * 100;
        if (pct > 0) {
          miniBars += `<div class="cycle-mini-segment" style="width:${pct}%;background:${p.color}"></div>`;
        }
      });
    }

    const card = document.createElement('div');
    card.className = `cycle-card ${isCurrent ? 'current-cycle' : ''}`;
    card.innerHTML = `
      <div class="cycle-name">${isCurrent ? '● ' : ''}Cycle ${i + 1}</div>
      <div class="cycle-dates">${formatDate(cycleWeeks[0].monday)} — ${formatDate(cycleWeeks[cycleWeeks.length - 1].friday)}</div>
      <div class="cycle-stats">
        <div class="cycle-stat">
          <div class="cycle-stat-value">${totalHours}h</div>
          <div class="cycle-stat-label">Total</div>
        </div>
        <div class="cycle-stat">
          <div class="cycle-stat-value">${maxCapacity}h</div>
          <div class="cycle-stat-label">Capacité</div>
        </div>
        <div class="cycle-stat">
          <div class="cycle-stat-value" style="color:${utilPct > 100 ? 'var(--danger)' : utilPct > 80 ? 'var(--warning)' : 'var(--success)'}">${utilPct}%</div>
          <div class="cycle-stat-label">Utilisation</div>
        </div>
        <div class="cycle-stat">
          <div class="cycle-stat-value">${cycleWeeks.length}</div>
          <div class="cycle-stat-label">Semaines</div>
        </div>
      </div>
      <div class="cycle-mini-bars">${miniBars || '<div style="flex:1;background:var(--border);border-radius:2px;"></div>'}</div>
    `;
    grid.appendChild(card);
  }
}

// ========== SETTINGS ==========
function renderCategorySettings() {
  const container = document.getElementById('categorySettings');
  if (!container) return;
  container.innerHTML = state.categories.map((c, idx) => `
    <div class="cat-setting-row">
      <input type="color" class="cat-color-picker" value="${c.color}" onchange="updateCategoryColor(${idx}, this.value)">
      <input type="text" class="cat-name-input" value="${c.name}" onchange="updateCategoryName(${idx}, this.value)">
      <button class="cat-remove-btn" onclick="removeCategory(${idx})" title="Supprimer">✕</button>
    </div>
  `).join('');
}

function renderProductSettings() {
  const container = document.getElementById('productSettings');
  if (!container) return;
  container.innerHTML = state.products.map((p, idx) => `
    <div class="cat-setting-row">
      <input type="color" class="cat-color-picker" value="${p.color}" onchange="updateProductColor(${idx}, this.value)">
      <span class="product-emoji-display">${p.emoji}</span>
      <input type="text" class="cat-name-input" value="${p.name}" onchange="updateProductName(${idx}, this.value)">
      <button class="cat-remove-btn" onclick="removeProduct(${idx})" title="Supprimer">✕</button>
    </div>
  `).join('');
}

function updateCategoryColor(idx, color) {
  state.categories[idx].color = color;
  renderTimeline(); updateDonut(); renderCycles(); scheduleSave();
}

function updateCategoryName(idx, name) {
  state.categories[idx].name = name;
  renderTimeline(); updateDonut(); renderCycles(); scheduleSave();
}

function removeCategory(idx) {
  const cat = state.categories[idx];
  Object.keys(state.weeks).forEach(k => {
    state.products.forEach(p => {
      if (state.weeks[k][p.id]) delete state.weeks[k][p.id][cat.id];
    });
  });
  state.categories.splice(idx, 1);
  renderCategorySettings(); renderTimeline(); updateDonut(); renderCycles();
  showToast('Catégorie supprimée', 'info');
  scheduleSave();
}

function addCategory() {
  const id = 'cat_' + Date.now();
  state.categories.push({ id, name: 'Nouvelle catégorie', emoji: '📌', color: '#64748B' });
  renderCategorySettings();
  showToast('Catégorie ajoutée', 'success');
  scheduleSave();
}

function updateProductColor(idx, color) {
  state.products[idx].color = color;
  renderTimeline(); updateDonut(); renderCycles(); scheduleSave();
}

function updateProductName(idx, name) {
  state.products[idx].name = name;
  renderTimeline(); updateDonut(); renderCycles(); scheduleSave();
}

function removeProduct(idx) {
  const prod = state.products[idx];
  Object.keys(state.weeks).forEach(k => { delete state.weeks[k][prod.id]; });
  state.products.splice(idx, 1);
  renderProductSettings(); renderTimeline(); updateDonut(); renderCycles();
  showToast('Produit supprimé', 'info');
  scheduleSave();
}

function addProduct() {
  const id = 'prod_' + Date.now();
  state.products.push({ id, name: 'Nouveau produit', emoji: '📦', color: '#64748B' });
  renderProductSettings();
  showToast('Produit ajouté', 'success');
  scheduleSave();
}

function updateCapacity(val) {
  state.weeklyCapacity = parseInt(val) || 40;
  renderTimeline(); updateDonut(); renderCycles(); scheduleSave();
}

function updateCycleLength(val) {
  state.cycleLength = parseInt(val) || 4;
  renderCycles(); scheduleSave();
}

// R2.1: Cycle anchor date
function updateCycleStartDate(val) {
  state.cycleStartDate = val || null;
  refreshAllWeeks();
  renderTimeline();
  renderCycles();
  scheduleSave();
}

// R9.3: Profile settings
function saveProfileSettings() {
  const nameEl = document.getElementById('settingsDisplayName');
  const roleEl = document.getElementById('settingsDisplayRole');
  if (nameEl) state.displayName = nameEl.value.trim();
  if (roleEl) state.displayRole = roleEl.value.trim();
  // Update sidebar footer
  const nameDisp = document.getElementById('sidebarFooterName');
  const roleDisp = document.getElementById('sidebarFooterRole');
  if (nameDisp && state.displayName) nameDisp.textContent = state.displayName;
  if (roleDisp && state.displayRole) roleDisp.textContent = state.displayRole;
  showToast('Profil mis à jour', 'success');
  scheduleSave();
}

// ========== STAKEHOLDER MAP ==========
const INFLUENCE_COLORS = {
  decision: { cls: 'influence-decision', color: '#6C5CE7', label: 'Décideur' },
  influencer: { cls: 'influence-influencer', color: '#FBBF24', label: 'Influenceur' },
  contributor: { cls: 'influence-contributor', color: '#00D2A0', label: 'Contributeur' },
  informed: { cls: 'influence-informed', color: '#8B8FA3', label: 'Informé' },
};

const FREQUENCY_LABELS = {
  daily: 'Quotidien',
  weekly: 'Hebdomadaire',
  biweekly: 'Bi-mensuel',
  monthly: 'Mensuel',
};

function switchStakeholderView(view) {
  document.querySelectorAll('.stakeholder-views .tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });
  document.querySelectorAll('.stakeholder-view').forEach(el => el.style.display = 'none');
  const target = document.getElementById(`view-${view}`);
  if (target) target.style.display = 'block';
  if (view === 'matrix') renderMatrixNodes();
  if (view === 'table') renderStakeholderTable();
  if (view === 'network') renderNetwork();
}

function renderMatrixNodes() {
  const area = document.getElementById('matrixArea');
  if (!area) return;
  area.innerHTML = '';

  state.stakeholders.forEach(sh => {
    const node = document.createElement('div');
    const inf = INFLUENCE_COLORS[sh.influence] || INFLUENCE_COLORS.informed;
    node.className = `stakeholder-node ${inf.cls}`;
    const xPct = ((sh.interest - 0.5) / 10) * 100;
    const yPct = ((10.5 - sh.power) / 10) * 100;
    node.style.left = xPct + '%';
    node.style.top = yPct + '%';
    node.style.background = inf.color;
    node.textContent = getInitials(sh.name);
    node.dataset.id = sh.id;

    const tooltip = document.createElement('div');
    tooltip.className = 'stakeholder-node-tooltip';
    tooltip.textContent = `${sh.name} — ${sh.role}`;
    node.appendChild(tooltip);

    node.addEventListener('pointerdown', (e) => startDrag(e, sh, node));
    node.addEventListener('dblclick', () => openStakeholderModal(sh.id));

    area.appendChild(node);
  });
}

let dragState = null;

function startDrag(e, sh, node) {
  e.preventDefault();
  node.classList.add('dragging');
  node.setPointerCapture(e.pointerId);
  const area = document.getElementById('matrixArea');
  const rect = area.getBoundingClientRect();

  dragState = { sh, node, rect };

  const onMove = (ev) => {
    if (!dragState) return;
    let xPct = ((ev.clientX - rect.left) / rect.width) * 100;
    let yPct = ((ev.clientY - rect.top) / rect.height) * 100;
    xPct = Math.max(2, Math.min(98, xPct));
    yPct = Math.max(2, Math.min(98, yPct));
    node.style.left = xPct + '%';
    node.style.top = yPct + '%';

    sh.interest = Math.round((xPct / 100) * 10 * 2) / 2;
    sh.interest = Math.max(1, Math.min(10, Math.round(sh.interest)));
    sh.power = Math.round(((100 - yPct) / 100) * 10 * 2) / 2;
    sh.power = Math.max(1, Math.min(10, Math.round(sh.power)));

    const tooltip = node.querySelector('.stakeholder-node-tooltip');
    if (tooltip) tooltip.textContent = `${sh.name} — P:${sh.power} I:${sh.interest}`;
  };

  const onUp = () => {
    node.classList.remove('dragging');
    node.removeEventListener('pointermove', onMove);
    node.removeEventListener('pointerup', onUp);
    dragState = null;
    renderStakeholderTable();
    scheduleSave();
  };

  node.addEventListener('pointermove', onMove);
  node.addEventListener('pointerup', onUp);
}

// ========== CONTACT SCORE CALCULATION ==========
function getStakeholderContactScores() {
  // Returns Map<stakeholderId, { totalHours, taskCount, byProduct: Map<productId, hours> }>
  const scores = new Map();
  state.timesheetEntries.forEach(e => {
    if (!e.stakeholderId) return;
    if (!scores.has(e.stakeholderId)) {
      scores.set(e.stakeholderId, { totalHours: 0, taskCount: 0, byProduct: {} });
    }
    const sc = scores.get(e.stakeholderId);
    const hours = minutesToDecimalHours(e.durationMinutes);
    sc.totalHours += hours;
    sc.taskCount++;
    if (e.productId) {
      if (!sc.byProduct[e.productId]) sc.byProduct[e.productId] = 0;
      sc.byProduct[e.productId] += hours;
    }
  });
  return scores;
}

function renderStakeholderTable() {
  const tbody = document.getElementById('stakeholderTableBody');
  if (!tbody) return;

  const contactScores = getStakeholderContactScores();

  let sorted = [...state.stakeholders];
  if (state.sortField) {
    sorted.sort((a, b) => {
      let av, bv;
      if (state.sortField === 'contactHours') {
        av = (contactScores.get(a.id) || { totalHours: 0 }).totalHours;
        bv = (contactScores.get(b.id) || { totalHours: 0 }).totalHours;
      } else {
        av = a[state.sortField]; bv = b[state.sortField];
      }
      if (typeof av === 'string') av = av.toLowerCase();
      if (typeof bv === 'string') bv = bv.toLowerCase();
      if (av < bv) return -state.sortDir;
      if (av > bv) return state.sortDir;
      return 0;
    });
  }

  tbody.innerHTML = sorted.map(sh => {
    const inf = INFLUENCE_COLORS[sh.influence] || INFLUENCE_COLORS.informed;
    const sc = contactScores.get(sh.id);
    const contactHours = sc ? Math.round(sc.totalHours * 4) / 4 : 0;
    const contactTasks = sc ? sc.taskCount : 0;
    // Build small product breakdown for tooltip
    let contactTooltip = '';
    if (sc && Object.keys(sc.byProduct).length > 0) {
      contactTooltip = Object.entries(sc.byProduct)
        .map(([pid, h]) => {
          const p = state.products.find(pr => pr.id === pid);
          return p ? `${p.emoji} ${p.name}: ${Math.round(h * 4) / 4}h` : `${pid}: ${h}h`;
        }).join('\n');
    }
    // Contact intensity badge
    let contactBadgeClass = 'contact-none';
    if (contactHours > 8) contactBadgeClass = 'contact-high';
    else if (contactHours > 3) contactBadgeClass = 'contact-medium';
    else if (contactHours > 0) contactBadgeClass = 'contact-low';

    return `
      <tr>
        <td class="name-cell" onclick="openStakeholderDetailModal(${sh.id})" style="cursor:pointer;color:var(--primary-light);">${sh.name}</td>
        <td>${sh.role}</td>
        <td>${sh.power}</td>
        <td>${sh.interest}</td>
        <td><span class="influence-badge ${sh.influence}">${inf.label}</span></td>
        <td>${FREQUENCY_LABELS[sh.frequency] || sh.frequency}</td>
        <td>
          <span class="contact-badge ${contactBadgeClass}" title="${escapeHtml(contactTooltip)}">
            ${contactHours > 0 ? contactHours + 'h / ' + contactTasks + ' tâche' + (contactTasks > 1 ? 's' : '') : '<span style="opacity:0.4;font-size:11px;">Aucun contact</span>'}
          </span>
        </td>
        <td>
          <div class="action-btns">
            <button class="action-btn" onclick="openStakeholderDetailModal(${sh.id})" title="Détail">${typeof getIcon === 'function' ? getIcon('eye', 16) : '👁️'}</button>
            <button class="action-btn" onclick="openStakeholderModal(${sh.id})" title="Modifier">${typeof getIcon === 'function' ? getIcon('edit', 16) : '✏️'}</button>
            <button class="action-btn delete" onclick="deleteStakeholder(${sh.id})" title="Supprimer">${typeof getIcon === 'function' ? getIcon('trash', 16) : '🗑️'}</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function sortStakeholders(field) {
  if (state.sortField === field) {
    state.sortDir *= -1;
  } else {
    state.sortField = field;
    state.sortDir = 1;
  }
  renderStakeholderTable();
}

function openStakeholderModal(editId = null) {
  const modal = document.getElementById('stakeholderModal');
  const title = document.getElementById('stakeholderModalTitle');
  const saveBtn = document.getElementById('stakeholderSaveBtn');

  // Populate defaultProductId dropdown
  const shDefaultProd = document.getElementById('shDefaultProduct');
  if (shDefaultProd) {
    shDefaultProd.innerHTML = '<option value="">(Aucun)</option>' +
      state.products.map(p => `<option value="${p.id}">${p.emoji} ${p.name}</option>`).join('');
  }

  if (editId) {
    const sh = state.stakeholders.find(s => s.id === editId);
    if (!sh) return;
    state.editingStakeholderId = editId;
    title.textContent = 'Modifier la partie prenante';
    saveBtn.textContent = 'Mettre à jour';
    document.getElementById('shName').value = sh.name;
    document.getElementById('shRole').value = sh.role;
    document.getElementById('shPower').value = sh.power;
    document.getElementById('shInterest').value = sh.interest;
    document.getElementById('shInfluence').value = sh.influence;
    document.getElementById('shFrequency').value = sh.frequency;
    document.getElementById('shNotes').value = sh.notes || '';
    if (shDefaultProd) shDefaultProd.value = sh.defaultProductId || '';
  } else {
    state.editingStakeholderId = null;
    title.textContent = 'Ajouter une partie prenante';
    saveBtn.textContent = 'Ajouter';
    document.getElementById('shName').value = '';
    document.getElementById('shRole').value = '';
    document.getElementById('shPower').value = 5;
    document.getElementById('shInterest').value = 5;
    document.getElementById('shInfluence').value = 'contributor';
    document.getElementById('shFrequency').value = 'weekly';
    document.getElementById('shNotes').value = '';
    if (shDefaultProd) shDefaultProd.value = '';
  }

  modal.classList.add('open');
}

function closeStakeholderModal() {
  document.getElementById('stakeholderModal').classList.remove('open');
  state.editingStakeholderId = null;
}

function saveStakeholder() {
  const name = document.getElementById('shName').value.trim();
  if (!name) { showToast('Le nom est requis', 'error'); return; }

  const data = {
    name,
    role: document.getElementById('shRole').value.trim(),
    power: Math.max(1, Math.min(10, parseInt(document.getElementById('shPower').value) || 5)),
    interest: Math.max(1, Math.min(10, parseInt(document.getElementById('shInterest').value) || 5)),
    influence: document.getElementById('shInfluence').value,
    frequency: document.getElementById('shFrequency').value,
    notes: document.getElementById('shNotes').value.trim(),
    defaultProductId: document.getElementById('shDefaultProduct')?.value || null,
  };

  if (state.editingStakeholderId) {
    const idx = state.stakeholders.findIndex(s => s.id === state.editingStakeholderId);
    if (idx >= 0) Object.assign(state.stakeholders[idx], data);
    showToast('Partie prenante mise à jour', 'success');
  } else {
    data.id = state.nextStakeholderId++;
    state.stakeholders.push(data);
    showToast('Partie prenante ajoutée', 'success');
  }

  closeStakeholderModal();
  renderMatrixNodes();
  renderStakeholderTable();
  renderNetwork();
  scheduleSave();
}

function deleteStakeholder(id) {
  const deleted = state.stakeholders.find(s => s.id === id);
  const idx = state.stakeholders.findIndex(s => s.id === id);
  if (!deleted) return;
  // R9.2: Count how many timesheet entries reference this stakeholder
  const usageCount = state.timesheetEntries.filter(e => e.stakeholderId === id).length;
  const usageMsg = usageCount > 0 ? `\n(${usageCount} entrée${usageCount > 1 ? 's' : ''} timesheet liées)` : '';
  if (!confirm(`Supprimer « ${deleted.name} » ?${usageMsg}`)) return;
  state.stakeholders = state.stakeholders.filter(s => s.id !== id);
  renderMatrixNodes();
  renderStakeholderTable();
  renderNetwork();
  scheduleSave();
  showToast('Partie prenante supprimée', 'info', () => {
    state.stakeholders.splice(idx, 0, deleted);
    renderMatrixNodes(); renderStakeholderTable(); renderNetwork();
    scheduleSave();
  });
}

// R6.6: Stakeholder detail modal
function openStakeholderDetailModal(id) {
  const sh = state.stakeholders.find(s => s.id === id);
  if (!sh) return;
  const modal = document.getElementById('stakeholderDetailModal');
  if (!modal) { openStakeholderModal(id); return; }
  const inf = INFLUENCE_COLORS[sh.influence] || INFLUENCE_COLORS.informed;
  const contactScores = getStakeholderContactScores();
  const sc = contactScores.get(sh.id);
  const contactHours = sc ? Math.round(sc.totalHours * 4) / 4 : 0;
  const contactTasks = sc ? sc.taskCount : 0;
  const prodBreakdown = sc && Object.keys(sc.byProduct).length > 0
    ? Object.entries(sc.byProduct).map(([pid, h]) => {
        const p = state.products.find(pr => pr.id === pid);
        return p ? `<div style="display:flex;justify-content:space-between;"><span>${p.emoji} ${escapeHtml(p.name)}</span><strong>${Math.round(h*4)/4}h</strong></div>` : '';
      }).join('')
    : '<div style="color:var(--text-muted);font-size:12px;">Aucun contact enregistré</div>';
  const defaultProd = sh.defaultProductId ? state.products.find(p => p.id === sh.defaultProductId) : null;
  modal.querySelector('#sdName').textContent = sh.name;
  modal.querySelector('#sdRole').textContent = sh.role;
  modal.querySelector('#sdInfluence').innerHTML = `<span class="influence-badge ${sh.influence}">${inf.label}</span>`;
  modal.querySelector('#sdFreq').textContent = FREQUENCY_LABELS[sh.frequency] || sh.frequency;
  modal.querySelector('#sdPower').textContent = sh.power + '/10';
  modal.querySelector('#sdInterest').textContent = sh.interest + '/10';
  modal.querySelector('#sdContact').textContent = contactHours > 0 ? `${contactHours}h / ${contactTasks} tâche${contactTasks > 1 ? 's' : ''}` : '—';
  modal.querySelector('#sdProduct').textContent = defaultProd ? `${defaultProd.emoji} ${defaultProd.name}` : '—';
  modal.querySelector('#sdNotes').textContent = sh.notes || '—';
  modal.querySelector('#sdBreakdown').innerHTML = prodBreakdown;
  modal.querySelector('#sdEditBtn').onclick = () => { closeStakeholderDetailModal(); openStakeholderModal(id); };
  modal.classList.add('open');
}

function closeStakeholderDetailModal() {
  const modal = document.getElementById('stakeholderDetailModal');
  if (modal) modal.classList.remove('open');
}

function renderNetwork() {
  const container = document.getElementById('networkContainer');
  if (!container) return;

  if (state.stakeholders.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">${typeof getIcon === 'function' ? getIcon('users', 32) : '🔗'}</div><div class="empty-state-text">Aucune partie prenante</div></div>`;
    return;
  }

  const W = container.clientWidth || 700;
  const H = container.clientHeight || 400;

  const cx = W / 2, cy = H / 2;
  const radius = Math.min(W, H) * 0.35;
  const count = state.stakeholders.length;

  let svgLines = '';
  const nodePositions = state.stakeholders.map((sh, i) => {
    const angle = (2 * Math.PI * i / count) - Math.PI / 2;
    return {
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
      sh,
    };
  });

  for (let i = 0; i < nodePositions.length; i++) {
    for (let j = i + 1; j < nodePositions.length; j++) {
      const a = nodePositions[i], b = nodePositions[j];
      const sameFreq = a.sh.frequency === b.sh.frequency && a.sh.frequency !== 'monthly';
      const closePower = Math.abs(a.sh.power - b.sh.power) <= 2 && Math.abs(a.sh.interest - b.sh.interest) <= 2;
      if (sameFreq || closePower) {
        const opacity = sameFreq ? 0.3 : 0.12;
        svgLines += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="var(--border-light)" stroke-width="1" opacity="${opacity}" />`;
      }
    }
  }

  let html = `<svg style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none">${svgLines}</svg>`;

  nodePositions.forEach(({ x, y, sh }) => {
    const inf = INFLUENCE_COLORS[sh.influence] || INFLUENCE_COLORS.informed;
    html += `
      <div class="rel-node" style="left:${x}px;top:${y}px;transform:translate(-50%,-50%)">
        <div class="rel-node-circle" style="background:${inf.color}">${getInitials(sh.name)}</div>
        <div class="rel-node-label">${sh.name}</div>
      </div>
    `;
  });

  container.innerHTML = html;
}

function loadSWDTemplate() {
  state.stakeholders = JSON.parse(JSON.stringify(DEFAULT_STAKEHOLDERS));
  state.nextStakeholderId = 9;
  state.projectName = 'SWD — Site Corporate';
  document.getElementById('projectNameInput').value = state.projectName;
  renderMatrixNodes(); renderStakeholderTable(); renderNetwork();
  showToast('Template SWD chargé', 'success');
  scheduleSave();
}

function newProject() {
  state.stakeholders = [];
  state.nextStakeholderId = 1;
  state.projectName = 'Nouveau projet';
  document.getElementById('projectNameInput').value = state.projectName;
  renderMatrixNodes(); renderStakeholderTable(); renderNetwork();
  showToast('Nouveau projet créé', 'info');
  scheduleSave();
}

function exportAllData() {
  const exportData = {
    version: 4,
    exportedAt: new Date().toISOString(),
    weeklyCapacity: state.weeklyCapacity,
    cycleLength: state.cycleLength,
    categories: state.categories,
    products: state.products,
    weeks: state.weeks,
    stakeholders: state.stakeholders,
    projectName: state.projectName,
    keywordRules: state.keywordRules,
    productAliases: state.productAliases,
    categoryAliases: state.categoryAliases,
    timesheetEntries: state.timesheetEntries,
  };
  const json = JSON.stringify(exportData, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `capacity-tool-export-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  showToast('Données exportées', 'success');
}

function importAllData(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (data.weeklyCapacity) state.weeklyCapacity = data.weeklyCapacity;
      if (data.cycleLength) state.cycleLength = data.cycleLength;
      if (data.categories) state.categories = data.categories;
      if (data.products) state.products = data.products;

      if (data.weeks) {
        if (data.version === 1 || data.version === undefined) {
          const migratedWeeks = {};
          Object.keys(data.weeks).forEach(k => {
            migratedWeeks[k] = {};
            const firstProd = state.products[0] ? state.products[0].id : 'swd';
            migratedWeeks[k][firstProd] = data.weeks[k];
          });
          state.weeks = migratedWeeks;
        } else {
          state.weeks = data.weeks;
        }
      }

      if (data.stakeholders) state.stakeholders = data.stakeholders;
      if (data.projectName) {
        state.projectName = data.projectName;
        document.getElementById('projectNameInput').value = data.projectName;
      }
      if (data.keywordRules) state.keywordRules = data.keywordRules;
      if (data.productAliases) state.productAliases = data.productAliases;
      if (data.categoryAliases) state.categoryAliases = data.categoryAliases;
      // v4: timesheet
      state.timesheetEntries = data.timesheetEntries || [];
      state.nextTimesheetId = state.timesheetEntries.length > 0
        ? Math.max(...state.timesheetEntries.map(e => e.id), 0) + 1
        : 1;

      state.nextStakeholderId = Math.max(...state.stakeholders.map(s => s.id), 0) + 1;
      state.nextRuleId = Math.max(...state.keywordRules.map(r => r.id), 0) + 1;

      document.getElementById('settingsCapacity').value = state.weeklyCapacity;
      document.getElementById('settingsCycleLength').value = state.cycleLength;

      renderAll();
      showToast('Données importées', 'success');
      scheduleSave();
    } catch (err) {
      showToast('Erreur d\'import: fichier invalide', 'error');
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}


// =====================================================
//  ICS IMPORT — 3-LAYER MAPPING SYSTEM
// =====================================================

// ========== LAYER 1: Naming Convention ==========
// Format: [PRODUIT] Type — Description
function classifyLayer1(summary) {
  if (!summary) return null;

  // Try to match [PREFIX] pattern
  const prefixMatch = summary.match(/^\[([^\]]+)\]\s*/i);
  if (!prefixMatch) return null;

  const prefix = prefixMatch[1].trim().toLowerCase();
  const remainder = summary.slice(prefixMatch[0].length).trim();

  // Find product by alias
  let matchedProduct = null;
  for (const [productId, aliases] of Object.entries(state.productAliases)) {
    if (aliases.some(a => a.toLowerCase() === prefix)) {
      // Verify product still exists
      if (state.products.find(p => p.id === productId)) {
        matchedProduct = productId;
        break;
      }
    }
  }

  if (!matchedProduct) return null;

  // Try to match activity type from remainder
  // Expected: "Type — Description" or "Type - Description" or just "Type"
  const typePart = remainder.split(/\s*[—–-]\s*/)[0].trim().toLowerCase();
  let matchedCategory = null;

  for (const [categoryId, aliases] of Object.entries(state.categoryAliases)) {
    if (aliases.some(a => typePart.includes(a.toLowerCase()))) {
      if (state.categories.find(c => c.id === categoryId)) {
        matchedCategory = categoryId;
        break;
      }
    }
  }

  if (matchedProduct && matchedCategory) {
    return { productId: matchedProduct, categoryId: matchedCategory, layer: 1, confidence: 'high' };
  }

  // If only product matched, return with null category (partial match)
  if (matchedProduct) {
    return { productId: matchedProduct, categoryId: null, layer: 1, confidence: 'medium' };
  }

  return null;
}

// ========== LAYER 2: Keyword Rules ==========
function classifyLayer2(summary) {
  if (!summary) return null;
  const lower = summary.toLowerCase();

  for (const rule of state.keywordRules) {
    const match = rule.keywords.some(kw => lower.includes(kw.toLowerCase()));
    if (match) {
      // Verify category exists
      const catExists = state.categories.find(c => c.id === rule.categoryId);
      if (!catExists) continue;

      // Product may be null (maps to any/transversal)
      let productId = rule.productId;
      if (productId && !state.products.find(p => p.id === productId)) {
        productId = null;
      }

      return {
        productId: productId || 'transversal',
        categoryId: rule.categoryId,
        layer: 2,
        confidence: 'medium',
        matchedRule: rule.label,
      };
    }
  }

  return null;
}

// ========== ICS PARSER ==========
function parseICSFile(icsText) {
  try {
    const jcalData = ICAL.parse(icsText);
    const comp = new ICAL.Component(jcalData);
    const events = comp.getAllSubcomponents('vevent');

    const parsedEvents = [];

    events.forEach((vevent, idx) => {
      const event = new ICAL.Event(vevent);

      // Skip cancelled events
      const status = vevent.getFirstPropertyValue('status');
      if (status && status.toUpperCase() === 'CANCELLED') return;

      // Get dates
      const dtstart = event.startDate;
      const dtend = event.endDate;

      if (!dtstart) return;

      const startDate = dtstart.toJSDate();
      const endDate = dtend ? dtend.toJSDate() : new Date(startDate.getTime() + 3600000);

      // Check if all-day event
      const isAllDay = dtstart.isDate;

      // Calculate duration in hours
      const durationMs = endDate - startDate;
      const durationHours = Math.round((durationMs / 3600000) * 4) / 4; // Round to nearest 0.25h

      // Skip events longer than 10h (probably all-day or multi-day)
      if (durationHours > 10) return;

      const summary = event.summary || '(Sans titre)';
      const description = event.description || '';
      const location = event.location || '';
      const organizer = vevent.getFirstPropertyValue('organizer') || '';
      const categories = vevent.getFirstPropertyValue('categories') || '';
      const transp = vevent.getFirstPropertyValue('transp') || '';

      // Skip transparent (free) events
      if (transp && transp.toUpperCase() === 'TRANSPARENT') return;

      // Compute week key
      const monday = getMonday(startDate);
      const weekKey = getWeekKey(monday);

      parsedEvents.push({
        id: idx,
        summary,
        description,
        location,
        organizer: typeof organizer === 'string' ? organizer.replace('mailto:', '') : '',
        categories: typeof categories === 'string' ? categories : '',
        startDate,
        endDate,
        isAllDay,
        durationHours,
        weekKey,
        // Classification (to be filled)
        productId: null,
        categoryId: null,
        layer: null,
        confidence: null,
        matchedRule: null,
        manuallyAssigned: false,
      });
    });

    return parsedEvents;
  } catch (err) {
    console.error('ICS Parse Error:', err);
    showToast('Erreur de parsing ICS: ' + err.message, 'error');
    return [];
  }
}

// ========== CLASSIFY ALL EVENTS ==========
function classifyEvents(events) {
  const autoEvents = [];
  const manualEvents = [];
  const ignoredEvents = [];

  events.forEach(evt => {
    // Skip all-day events
    if (evt.isAllDay) {
      evt.ignoreReason = 'Événement sur toute la journée';
      ignoredEvents.push(evt);
      return;
    }

    // Skip very short events (< 15 min)
    if (evt.durationHours < 0.25) {
      evt.ignoreReason = 'Durée trop courte (< 15 min)';
      ignoredEvents.push(evt);
      return;
    }

    // Layer 1: Naming convention
    const l1 = classifyLayer1(evt.summary);
    if (l1 && l1.categoryId) {
      evt.productId = l1.productId;
      evt.categoryId = l1.categoryId;
      evt.layer = 1;
      evt.confidence = l1.confidence;
      autoEvents.push(evt);
      return;
    }

    // Layer 2: Keyword rules
    const l2 = classifyLayer2(evt.summary);
    if (l2) {
      evt.productId = l2.productId;
      evt.categoryId = l2.categoryId;
      evt.layer = 2;
      evt.confidence = l2.confidence;
      evt.matchedRule = l2.matchedRule;
      autoEvents.push(evt);
      return;
    }

    // If Layer 1 matched product but not category, partially classified
    if (l1 && l1.productId) {
      evt.productId = l1.productId;
      evt.layer = 1;
      evt.confidence = 'low';
    }

    // Layer 3: Manual / LLM
    manualEvents.push(evt);
  });

  state.icsAutoEvents = autoEvents;
  state.icsManualEvents = manualEvents;
  state.icsIgnoredEvents = ignoredEvents;
}

// ========== ICS DROP ZONE ==========
function setupICSDropZone() {
  const dropZone = document.getElementById('icsDropZone');
  const fileInput = document.getElementById('icsFileInput');
  if (!dropZone || !fileInput) return;

  // Label's for="icsFileInput" handles click->file dialog natively

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.ics') || file.type === 'text/calendar')) {
      processICSFile(file);
    } else {
      showToast('Veuillez déposer un fichier .ics valide', 'error');
    }
  });

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) processICSFile(file);
    e.target.value = '';
  });
}

function processICSFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const icsText = e.target.result;
    const events = parseICSFile(icsText);

    if (events.length === 0) {
      showToast('Aucun événement trouvé dans le fichier', 'error');
      return;
    }

    state.icsEvents = events;
    classifyEvents(events);
    renderICSResults();
    showToast(`${events.length} événements importés`, 'success');
  };
  reader.readAsText(file);
}

function processICSPaste() {
  const textarea = document.getElementById('icsPasteArea');
  const icsText = (textarea.value || '').trim();
  if (!icsText) {
    showToast('Veuillez coller le contenu du fichier ICS', 'error');
    return;
  }
  if (!icsText.includes('BEGIN:VCALENDAR')) {
    showToast('Le contenu ne semble pas être un fichier ICS valide (BEGIN:VCALENDAR manquant)', 'error');
    return;
  }
  const events = parseICSFile(icsText);
  if (events.length === 0) {
    showToast('Aucun événement trouvé dans le contenu collé', 'error');
    return;
  }
  state.icsEvents = events;
  classifyEvents(events);
  renderICSResults();
  showToast(`${events.length} événements importés`, 'success');
  // Close paste panel
  document.getElementById('icsPasteWrap').style.display = 'none';
}

// ========== RENDER ICS RESULTS ==========
function renderICSResults() {
  const resultsDiv = document.getElementById('icsResults');
  resultsDiv.style.display = 'block';

  // Summary
  const totalEvents = state.icsEvents.length;
  const autoCount = state.icsAutoEvents.length;
  const manualCount = state.icsManualEvents.length;
  const ignoredCount = state.icsIgnoredEvents.length;

  const totalHoursAuto = state.icsAutoEvents.reduce((sum, e) => sum + e.durationHours, 0);
  const totalHoursManual = state.icsManualEvents.reduce((sum, e) => sum + e.durationHours, 0);

  // Unique weeks
  const uniqueWeeks = new Set(state.icsEvents.map(e => e.weekKey));

  document.getElementById('icsSummary').innerHTML = `
    <div class="ics-summary-cards">
      <div class="ics-stat-card">
        <div class="ics-stat-value">${totalEvents}</div>
        <div class="ics-stat-label">Événements</div>
      </div>
      <div class="ics-stat-card accent-green">
        <div class="ics-stat-value">${autoCount}</div>
        <div class="ics-stat-label">Auto-classés</div>
      </div>
      <div class="ics-stat-card accent-amber">
        <div class="ics-stat-value">${manualCount}</div>
        <div class="ics-stat-label">À trier</div>
      </div>
      <div class="ics-stat-card">
        <div class="ics-stat-value">${uniqueWeeks.size}</div>
        <div class="ics-stat-label">Semaines</div>
      </div>
      <div class="ics-stat-card">
        <div class="ics-stat-value">${totalHoursAuto + totalHoursManual}h</div>
        <div class="ics-stat-label">Total heures</div>
      </div>
    </div>
  `;

  // Tab counts
  document.getElementById('autoCount').textContent = autoCount;
  document.getElementById('manualCount').textContent = manualCount;
  document.getElementById('ignoredCount').textContent = ignoredCount;

  // Show/hide LLM classify button
  const llmBtn = document.getElementById('llmClassifyBtn');
  if (llmBtn) {
    llmBtn.style.display = (state.llmEnabled && state.llmConnected && manualCount > 0) ? 'inline-flex' : 'none';
  }

  // Render event lists
  renderAutoEventList();
  renderManualEventList();
  renderIgnoredEventList();
}

function renderAutoEventList() {
  const container = document.getElementById('icsAutoList');
  if (!container) return;

  if (state.icsAutoEvents.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">${typeof getIcon === 'function' ? getIcon('calendar', 32) : '📭'}</div><div class="empty-state-text">Aucun événement auto-classé</div></div>`;
    return;
  }

  container.innerHTML = state.icsAutoEvents.map(evt => {
    const product = state.products.find(p => p.id === evt.productId);
    const category = state.categories.find(c => c.id === evt.categoryId);
    const layerLabel = evt.layer === 1 ? 'Convention' : 'Mot-clé';
    const dateStr = evt.startDate.toLocaleDateString('fr-CH', { weekday: 'short', day: 'numeric', month: 'short' });
    const timeStr = evt.startDate.toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' });

    return `
      <div class="ics-event-row">
        <div class="ics-event-main">
          <div class="ics-event-title">${escapeHtml(evt.summary)}</div>
          <div class="ics-event-meta">
            <span class="ics-event-date">${dateStr} ${timeStr}</span>
            <span class="ics-event-duration">${evt.durationHours}h</span>
            <span class="ics-event-week">${evt.weekKey}</span>
          </div>
        </div>
        <div class="ics-event-classification">
          <span class="ics-product-tag" style="border-color:${product ? product.color : 'var(--border)'}">${product ? product.emoji + ' ' + product.name : '?'}</span>
          <span class="ics-category-tag" style="border-color:${category ? category.color : 'var(--border)'}">${category ? category.emoji + ' ' + category.name : '?'}</span>
          <span class="ics-layer-badge layer-${evt.layer}">C${evt.layer}: ${layerLabel}</span>
        </div>
      </div>
    `;
  }).join('');
}

function renderManualEventList() {
  const container = document.getElementById('icsManualList');
  if (!container) return;

  if (state.icsManualEvents.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">${typeof getIcon === 'function' ? getIcon('checkCircle', 32) : '✅'}</div><div class="empty-state-text">Tous les événements ont été classés automatiquement</div></div>`;
    return;
  }

  container.innerHTML = state.icsManualEvents.map((evt, idx) => {
    const dateStr = evt.startDate.toLocaleDateString('fr-CH', { weekday: 'short', day: 'numeric', month: 'short' });
    const timeStr = evt.startDate.toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' });

    const productOptions = state.products.map(p =>
      `<option value="${p.id}" ${evt.productId === p.id ? 'selected' : ''}>${p.emoji} ${p.name}</option>`
    ).join('');

    const categoryOptions = state.categories.map(c =>
      `<option value="${c.id}" ${evt.categoryId === c.id ? 'selected' : ''}>${c.emoji} ${c.name}</option>`
    ).join('');

    return `
      <div class="ics-event-row manual-event">
        <div class="ics-event-main">
          <div class="ics-event-title">${escapeHtml(evt.summary)}</div>
          <div class="ics-event-meta">
            <span class="ics-event-date">${dateStr} ${timeStr}</span>
            <span class="ics-event-duration">${evt.durationHours}h</span>
            <span class="ics-event-week">${evt.weekKey}</span>
          </div>
        </div>
        <div class="ics-event-manual-controls">
          <select class="form-input ics-select" onchange="assignManualProduct(${idx}, this.value)">
            <option value="">— Produit —</option>
            ${productOptions}
          </select>
          <select class="form-input ics-select" onchange="assignManualCategory(${idx}, this.value)">
            <option value="">— Activité —</option>
            ${categoryOptions}
          </select>
        </div>
      </div>
    `;
  }).join('');
}

function renderIgnoredEventList() {
  const container = document.getElementById('icsIgnoredList');
  if (!container) return;

  if (state.icsIgnoredEvents.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">${typeof getIcon === 'function' ? getIcon('partyPopper', 32) : '🎉'}</div><div class="empty-state-text">Aucun événement ignoré</div></div>`;
    return;
  }

  container.innerHTML = state.icsIgnoredEvents.map(evt => {
    const dateStr = evt.startDate.toLocaleDateString('fr-CH', { weekday: 'short', day: 'numeric', month: 'short' });
    return `
      <div class="ics-event-row ignored-event">
        <div class="ics-event-main">
          <div class="ics-event-title">${escapeHtml(evt.summary)}</div>
          <div class="ics-event-meta">
            <span class="ics-event-date">${dateStr}</span>
            <span class="ics-event-duration">${evt.durationHours}h</span>
            <span class="ics-event-reason">${evt.ignoreReason || 'Ignoré'}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ========== MANUAL ASSIGNMENT ==========
function assignManualProduct(idx, productId) {
  if (state.icsManualEvents[idx]) {
    state.icsManualEvents[idx].productId = productId || null;
    state.icsManualEvents[idx].manuallyAssigned = !!(productId && state.icsManualEvents[idx].categoryId);
  }
}

function assignManualCategory(idx, categoryId) {
  if (state.icsManualEvents[idx]) {
    state.icsManualEvents[idx].categoryId = categoryId || null;
    state.icsManualEvents[idx].manuallyAssigned = !!(state.icsManualEvents[idx].productId && categoryId);
  }
}

// ========== ICS TABS ==========
function switchICSTab(tab) {
  document.querySelectorAll('.ics-tabs .tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.icstab === tab);
  });
  document.getElementById('icsAutoList').style.display = tab === 'auto' ? 'block' : 'none';
  document.getElementById('icsManualList').style.display = tab === 'manual' ? 'block' : 'none';
  document.getElementById('icsIgnoredList').style.display = tab === 'ignored' ? 'block' : 'none';
}

// ========== APPLY ICS TO CAPACITY ==========
function applyICSImport() {
  // Combine auto + manually assigned events
  const allClassified = [
    ...state.icsAutoEvents,
    ...state.icsManualEvents.filter(e => e.productId && e.categoryId),
  ];

  if (allClassified.length === 0) {
    showToast('Aucun événement classifié à appliquer', 'error');
    return;
  }

  // Remove previously imported ICS entries for the same weeks to avoid duplicates
  const affectedWeeks = new Set(allClassified.map(e => e.weekKey));
  state.timesheetEntries = state.timesheetEntries.filter(e => !(e.source === 'ics' && affectedWeeks.has(e.weekKey)));

  let appliedCount = 0;
  let totalHours = 0;

  allClassified.forEach(evt => {
    // Store each ICS event as an individual timesheet entry
    const durationMinutes = Math.round(evt.durationHours * 60);
    const entry = {
      id: state.nextTimesheetId++,
      name: evt.summary || '(Sans titre)',
      productId: evt.productId,
      categoryId: evt.categoryId,
      stakeholderId: null,
      date: evt.startDate ? evt.startDate.toISOString().slice(0, 10) : null,
      durationMinutes,
      weekKey: evt.weekKey,
      notes: [evt.description, evt.location].filter(Boolean).join(' | ').slice(0, 200),
      fromTimer: false,
      source: 'ics',
      icsSummary: evt.summary || '',
      icsOrganizer: evt.organizer || '',
    };
    state.timesheetEntries.push(entry);
    appliedCount++;
    totalHours += evt.durationHours;
  });

  const unclassified = state.icsManualEvents.filter(e => !e.productId || !e.categoryId).length;

  renderTimeline();
  updateDonut();
  renderCycles();
  renderTimesheet();

  showToast(`${appliedCount} événements appliqués (${totalHours}h)${unclassified > 0 ? ` — ${unclassified} non classés restants` : ''}`, 'success');
  scheduleSave();
}


// =====================================================
//  LLM INTEGRATION (TOGGLEABLE) — via server proxy
// =====================================================

function toggleLLM() {
  state.llmEnabled = !state.llmEnabled;
  const toggle = document.getElementById('llmToggle');
  const configPanel = document.getElementById('llmConfigPanel');

  toggle.setAttribute('aria-checked', state.llmEnabled);
  toggle.classList.toggle('active', state.llmEnabled);
  configPanel.style.display = state.llmEnabled ? 'block' : 'none';

  const llmBtn = document.getElementById('llmClassifyBtn');
  if (llmBtn) {
    llmBtn.style.display = (state.llmEnabled && state.llmConnected && state.icsManualEvents.length > 0) ? 'inline-flex' : 'none';
  }
}

function updateLLMProvider() {
  const provider = document.getElementById('llmProvider').value;
  state.llmProvider = provider;
  const customGroup = document.getElementById('llmCustomUrlGroup');
  customGroup.style.display = provider === 'custom' ? 'block' : 'none';
  state.llmConnected = false;
  updateLLMStatus();
}

function updateLLMStatus() {
  const badge = document.getElementById('llmStatusBadge');
  if (!badge) return;
  if (state.llmConnected) {
    badge.textContent = 'Connecté';
    badge.className = 'llm-status-badge connected';
  } else {
    badge.textContent = 'Déconnecté';
    badge.className = 'llm-status-badge';
  }
}

// ─── LLM: build request config for direct browser calls ──────────────────────
function getLLMRequestConfig(userMessage, systemPrompt) {
  const provider = state.llmProvider;
  if (provider === 'openai' || provider === 'custom') {
    const url = provider === 'custom' ? state.llmCustomUrl : 'https://api.openai.com/v1/chat/completions';
    return {
      url,
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + state.llmApiKey },
      body: {
        model: 'gpt-4o-mini',
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }],
        temperature: 0.1, max_tokens: 2000,
      },
    };
  }
  if (provider === 'anthropic') {
    return {
      url: 'https://api.anthropic.com/v1/messages',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': state.llmApiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: {
        model: 'claude-3-5-haiku-20241022', max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      },
    };
  }
  return null;
}

function extractLLMResponse(data) {
  if (state.llmProvider === 'anthropic') return data.content?.[0]?.text || '';
  return data.choices?.[0]?.message?.content || '';
}

// ─── Save / Load LLM config (Supabase) ──────────────────────────────────────
async function saveLLMConfig() {
  // LLM config is now server-side env vars — nothing to save per-user
  return;
}

async function loadLLMConfig() {
  if (!currentSession) return;
  try {
    const cfg = await getLLMConfig();
    if (cfg && cfg.has_env_key) {
      state.llmEnabled = true;
      state.llmConnected = true;
      state.llmProvider = cfg.provider || 'openai';
      state.llmUseProxy = true;
      updateLLMStatus();
      const toggle = document.getElementById('llmToggle');
      if (toggle) { toggle.setAttribute('aria-checked', 'true'); toggle.classList.add('active'); }
      const configPanel = document.getElementById('llmConfigPanel');
      if (configPanel) configPanel.style.display = 'block';
      const keyInput = document.getElementById('llmApiKey');
      if (keyInput) keyInput.placeholder = '(clé configurée sur le serveur)';
    }
  } catch (e) { /* proxy not available, ignore */ }
}

async function testLLMConnection() {
  const apiKey = document.getElementById('llmApiKey').value.trim();
  const provider = document.getElementById('llmProvider').value;
  const customUrlEl = document.getElementById('llmCustomUrl');
  const customUrl = customUrlEl ? customUrlEl.value.trim() : '';
  const testBtn = document.getElementById('llmTestBtn');
  testBtn.textContent = 'Test...';
  testBtn.disabled = true;
  try {
    const proxyData = await testLLMProxy(provider, customUrl);  // From supabase-client.js (includes JWT)
    if (proxyData && proxyData.ok) {
      state.llmEnabled = true;
      state.llmConnected = true;
      state.llmProvider = provider;
      state.llmUseProxy = true;
      state.llmApiKey = apiKey;
      state.llmCustomUrl = customUrl;
      updateLLMStatus();
      if (apiKey) { await saveLLMConfig(); }
      showToast('Connexion LLM réussie' + (apiKey ? '' : ' (clé serveur)'), 'success');
      document.getElementById('llmApiKey').placeholder = apiKey ? '••••••••  (clé sauvegardée)' : '(clé configurée sur le serveur)';
      if (apiKey) document.getElementById('llmApiKey').value = '';
      const llmBtn = document.getElementById('llmClassifyBtn');
      if (llmBtn && state.icsManualEvents && state.icsManualEvents.length > 0) { llmBtn.style.display = 'inline-flex'; }
      testBtn.textContent = 'Tester';
      testBtn.disabled = false;
      return;
    }
  } catch (proxyErr) {
    console.log('LLM proxy error:', proxyErr.message);
  }
  if (!apiKey) {
    showToast('Veuillez entrer une clé API (le proxy serveur n\'est pas disponible)', 'error');
    testBtn.textContent = 'Tester';
    testBtn.disabled = false;
    return;
  }
  state.llmApiKey = apiKey;
  state.llmProvider = provider;
  state.llmCustomUrl = customUrl;
  state.llmUseProxy = false;
  try {
    const { url, headers, body } = getLLMRequestConfig('Dis simplement "ok".', 'Tu es un assistant. Réponds en un mot.');
    const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    if (response.ok) {
      state.llmEnabled = true;
      state.llmConnected = true;
      updateLLMStatus();
      await saveLLMConfig();
      showToast('Connexion LLM réussie (appel direct)', 'success');
      document.getElementById('llmApiKey').value = '';
      document.getElementById('llmApiKey').placeholder = '••••••••  (clé sauvegardée)';
      const llmBtn = document.getElementById('llmClassifyBtn');
      if (llmBtn && state.icsManualEvents && state.icsManualEvents.length > 0) llmBtn.style.display = 'inline-flex';
    } else {
      const errText = await response.text();
      state.llmConnected = false;
      updateLLMStatus();
      showToast('Erreur LLM: ' + response.status + ' — ' + errText.substring(0, 100), 'error');
    }
  } catch (err) {
    state.llmConnected = false;
    updateLLMStatus();
    showToast('Erreur de connexion: ' + err.message, 'error');
  }
  testBtn.textContent = 'Tester';
  testBtn.disabled = false;
}

async function classifyWithLLM() {
  if (!state.llmEnabled || !state.llmConnected) {
    showToast('LLM non connecté', 'error');
    return;
  }

  const unclassified = state.icsManualEvents.filter(e => !e.productId || !e.categoryId);
  if (unclassified.length === 0) {
    showToast('Aucun événement à classifier', 'info');
    return;
  }

  const llmBtn = document.getElementById('llmClassifyBtn');
  llmBtn.textContent = '🤖 Classification...';
  llmBtn.disabled = true;

  const productList = state.products.map(p => '"' + p.id + '" (' + p.name + ')').join(', ');
  const categoryList = state.categories.map(c => '"' + c.id + '" (' + c.name + ')').join(', ');
  const eventDescriptions = unclassified.map((e, i) => i + ': "' + e.summary + '" (' + e.durationHours + 'h, ' + e.weekKey + ')').join('\n');

  const systemPrompt = "Tu es un assistant de classification pour un outil de capacity planning d'un Product Designer.\nProduits disponibles: " + productList + "\nCatégories d'activité: " + categoryList + "\n\nClassifie chaque événement de calendrier en retournant UNIQUEMENT un tableau JSON avec les champs: index, productId, categoryId.\nSi un événement n'est pas classifiable, utilise productId: \"transversal\" et categoryId: \"other\".";
  const userMessage = 'Classifie ces événements de calendrier:\n' + eventDescriptions + '\n\nRéponds UNIQUEMENT avec le tableau JSON, sans autre texte.';

  try {
    let content;
    if (state.llmUseProxy) {
      // Use Supabase-authenticated LLM call
      const proxyData = await callLLM(
        [{ role: 'user', content: userMessage }],
        systemPrompt,
        state.llmProvider,
        state.llmCustomUrl || '',
        0.1,
        2000
      );
      if (!proxyData || !proxyData.content) throw new Error('Erreur LLM');
      content = proxyData.content;
    } else {
      const cfg = getLLMRequestConfig(userMessage, systemPrompt);
      if (!cfg) throw new Error('LLM non configuré');
      const res = await fetch(cfg.url, { method: 'POST', headers: cfg.headers, body: JSON.stringify(cfg.body) });
      if (!res.ok) { const errData = await res.json().catch(() => ({})); throw new Error(errData.error?.message || 'Erreur HTTP ' + res.status); }
      const data = await res.json();
      content = extractLLMResponse(data);
    }

    const jsonMatch = content.match(/\[[\s\S]*?\]/);
    if (!jsonMatch) {
      throw new Error('Réponse LLM invalide');
    }

    const classifications = JSON.parse(jsonMatch[0]);
    let classified = 0;

    classifications.forEach(cls => {
      const evt = unclassified[cls.index];
      if (!evt) return;
      const prodValid = state.products.find(p => p.id === cls.productId);
      const catValid = state.categories.find(c => c.id === cls.categoryId);
      if (prodValid && catValid) {
        evt.productId = cls.productId;
        evt.categoryId = cls.categoryId;
        evt.layer = 3;
        evt.confidence = 'llm';
        evt.manuallyAssigned = true;
        classified++;
      }
    });

    const nowClassified = state.icsManualEvents.filter(e => e.productId && e.categoryId);
    const stillManual = state.icsManualEvents.filter(e => !e.productId || !e.categoryId);
    nowClassified.forEach(e => { e.layer = 3; e.confidence = 'llm'; });
    state.icsAutoEvents = [...state.icsAutoEvents, ...nowClassified];
    state.icsManualEvents = stillManual;

    renderICSResults();
    showToast(classified + ' événements classifiés par LLM', 'success');

  } catch (err) {
    showToast('Erreur LLM: ' + err.message, 'error');
  }

  llmBtn.textContent = '🤖 Classer avec LLM';
  llmBtn.disabled = false;
}


// =====================================================
//  MAPPING RULES UI
// =====================================================

function renderMappingRules() {
  renderNamingProductTags();
  renderNamingActivityTags();
  renderKeywordRulesList();
  // Update summaries
  const nProd = Object.keys(state.productAliases).length;
  const nCat = Object.keys(state.categoryAliases).length;
  const s1 = document.getElementById('mappingLayerSummary1');
  if (s1) s1.innerHTML = `${nProd} pr\u00e9fixes produit, ${nCat} cat\u00e9gories &mdash; <code class="code-inline">[PRODUIT] Type &mdash; Description</code>`;
  const s2 = document.getElementById('mappingLayerSummary2');
  if (s2) s2.textContent = `${state.keywordRules.length} r\u00e8gles de mots-cl\u00e9s configur\u00e9es`;
}

function toggleMappingLayer(n) {
  const body = document.getElementById('mappingBody' + n);
  const chevron = document.getElementById('mappingChevron' + n);
  if (!body) return;
  const isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : 'block';
  if (chevron) chevron.textContent = isOpen ? '\u25b8' : '\u25be';
}

function liveTestMapping() {
  const input = document.getElementById('mappingTestInput');
  const resultEl = document.getElementById('mappingTestResult');
  if (!input || !resultEl) return;
  const title = input.value.trim();
  if (!title) { resultEl.style.display = 'none'; return; }
  resultEl.style.display = 'block';
  // Try Layer 1
  const l1 = classifyLayer1(title);
  if (l1 && l1.productId && l1.categoryId) {
    const prod = state.products.find(p => p.id === l1.productId);
    const cat = state.categories.find(c => c.id === l1.categoryId);
    resultEl.innerHTML = `<span style="color:var(--success);font-weight:600;">\u2713 Couche 1</span> &mdash; <span style="color:${prod?prod.color:'#fff'}">${prod?prod.emoji+' '+prod.name:'?'}</span> / <span style="color:${cat?cat.color:'#fff'}">${cat?cat.emoji+' '+cat.name:'?'}</span>`;
    return;
  }
  // Try Layer 2
  const l2 = classifyLayer2(title);
  if (l2 && l2.categoryId) {
    const prod = l2.productId ? state.products.find(p => p.id === l2.productId) : null;
    const cat = state.categories.find(c => c.id === l2.categoryId);
    resultEl.innerHTML = `<span style="color:var(--warning);font-weight:600;">\u2713 Couche 2</span> &mdash; ${prod ? '<span style="color:'+prod.color+'">'+prod.emoji+' '+prod.name+'</span> / ' : '(Tous produits) / '}<span style="color:${cat?cat.color:'#fff'}">${cat?cat.emoji+' '+cat.name:'?'}</span>`;
    return;
  }
  // Fallback Layer 3
  resultEl.innerHTML = `<span style="color:var(--danger);font-weight:600;">\u2717 Non class\u00e9</span> &mdash; Aucune r\u00e8gle ne correspond. Sera dirig\u00e9 vers le triage manuel (Couche 3).`;
}

function renderNamingProductTags() {
  const container = document.getElementById('namingProductTags');
  if (!container) return;

  let html = '';
  for (const [productId, aliases] of Object.entries(state.productAliases)) {
    const product = state.products.find(p => p.id === productId);
    if (!product) continue;
    const aliasStr = aliases.map(a => `[${a.toUpperCase()}]`).join(' ');
    html += `
      <div class="naming-tag" style="border-color:${product.color}">
        <span class="naming-tag-product">${product.emoji} ${product.name}</span>
        <span class="naming-tag-aliases">${aliasStr}</span>
      </div>
    `;
  }
  container.innerHTML = html;
}

function renderNamingActivityTags() {
  const container = document.getElementById('namingActivityTags');
  if (!container) return;

  let html = '';
  for (const [categoryId, aliases] of Object.entries(state.categoryAliases)) {
    const category = state.categories.find(c => c.id === categoryId);
    if (!category) continue;
    html += `
      <div class="naming-tag" style="border-color:${category.color}">
        <span class="naming-tag-product">${category.emoji} ${category.name}</span>
        <span class="naming-tag-aliases">${aliases.join(', ')}</span>
      </div>
    `;
  }
  container.innerHTML = html;
}

function renderKeywordRulesList() {
  const container = document.getElementById('keywordRulesList');
  if (!container) return;

  container.innerHTML = state.keywordRules.map((rule, idx) => {
    const category = state.categories.find(c => c.id === rule.categoryId);
    const product = rule.productId ? state.products.find(p => p.id === rule.productId) : null;

    const categoryOptions = state.categories.map(c =>
      `<option value="${c.id}" ${c.id === rule.categoryId ? 'selected' : ''}>${c.emoji} ${c.name}</option>`
    ).join('');

    const productOptions = '<option value="">(Tous)</option>' + state.products.map(p =>
      `<option value="${p.id}" ${p.id === rule.productId ? 'selected' : ''}>${p.emoji} ${p.name}</option>`
    ).join('');

    return `
      <div class="keyword-rule-row">
        <div class="keyword-rule-header">
          <input type="text" class="form-input keyword-rule-label" value="${escapeHtml(rule.label)}" onchange="updateRuleLabel(${idx}, this.value)" placeholder="Nom de la règle">
          <button class="cat-remove-btn" onclick="removeKeywordRule(${idx})" title="Supprimer">✕</button>
        </div>
        <div class="keyword-rule-body">
          <div class="keyword-rule-field">
            <span class="keyword-rule-field-label">Mots-clés</span>
            <input type="text" class="form-input" value="${rule.keywords.join(', ')}" onchange="updateRuleKeywords(${idx}, this.value)" placeholder="mot1, mot2, mot3">
          </div>
          <div class="keyword-rule-field">
            <span class="keyword-rule-field-label">→ Activité</span>
            <select class="form-input ics-select" onchange="updateRuleCategory(${idx}, this.value)">${categoryOptions}</select>
          </div>
          <div class="keyword-rule-field">
            <span class="keyword-rule-field-label">→ Produit</span>
            <select class="form-input ics-select" onchange="updateRuleProduct(${idx}, this.value)">${productOptions}</select>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function updateRuleLabel(idx, value) { state.keywordRules[idx].label = value; scheduleSave(); }
function updateRuleKeywords(idx, value) {
  state.keywordRules[idx].keywords = value.split(',').map(k => k.trim()).filter(k => k);
  scheduleSave();
}
function updateRuleCategory(idx, value) { state.keywordRules[idx].categoryId = value; scheduleSave(); }
function updateRuleProduct(idx, value) { state.keywordRules[idx].productId = value || null; scheduleSave(); }

function addKeywordRule() {
  state.keywordRules.push({
    id: state.nextRuleId++,
    keywords: ['nouveau mot-clé'],
    productId: null,
    categoryId: 'other',
    label: 'Nouvelle règle',
  });
  renderKeywordRulesList();
  showToast('Règle ajoutée', 'success');
  scheduleSave();
}

function removeKeywordRule(idx) {
  state.keywordRules.splice(idx, 1);
  renderKeywordRulesList();
  showToast('Règle supprimée', 'info');
  scheduleSave();
}


// =====================================================
//  TIMESHEET FEATURE
// =====================================================

let timerInterval = null;

// --------- Timer Logic ---------
function startTimer(entryId) {
  // Stop any existing timer first
  if (state.activeTimer) {
    _accumulateTimer();
  }
  state.activeTimer = { entryId, startedAt: Date.now() };
  scheduleSave();
  _startTimerInterval();
  updateTimerBar();
}

function _accumulateTimer() {
  if (!state.activeTimer) return;
  const elapsed = Date.now() - state.activeTimer.startedAt;
  const elapsedMinutes = elapsed / 60000;
  const entry = state.timesheetEntries.find(e => e.id === state.activeTimer.entryId);
  if (entry) {
    entry.durationMinutes = (entry.durationMinutes || 0) + elapsedMinutes;
  }
}

function pauseTimer() {
  if (!state.activeTimer) return;
  _accumulateTimer();
  state.activeTimer = null;
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  updateTimerBar();
  renderTimesheet();
  scheduleSave();
  showToast('Timer mis en pause', 'info');
}

function stopTimer() {
  if (!state.activeTimer) return;
  _accumulateTimer();
  const entry = state.timesheetEntries.find(e => e.id === state.activeTimer.entryId);
  state.activeTimer = null;
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  updateTimerBar();
  renderTimesheet();
  renderTimeline();
  updateDonut();
  renderCycles();
  scheduleSave();
  if (entry) showToast(`Entrée terminée : ${formatMinutes(entry.durationMinutes)}`, 'success');
}

function getTimerElapsed() {
  if (!state.activeTimer) return 0;
  return Date.now() - state.activeTimer.startedAt;
}

function _startTimerInterval() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    updateTimerBarElapsed();
  }, 1000);
}

function formatElapsed(ms) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function formatMinutes(minutes) {
  const m = Math.round(minutes || 0);
  const h = Math.floor(m / 60);
  const min = m % 60;
  if (h === 0) return `${min}min`;
  if (min === 0) return `${h}h`;
  return `${h}h${String(min).padStart(2,'0')}`;
}

function minutesToDecimalHours(minutes) {
  return Math.round((minutes || 0) / 60 * 4) / 4; // nearest 0.25h
}

function updateTimerBarElapsed() {
  const el = document.getElementById('timerBarElapsed');
  if (el && state.activeTimer) {
    const accumulated = (() => {
      const entry = state.timesheetEntries.find(e => e.id === state.activeTimer.entryId);
      return (entry ? (entry.durationMinutes || 0) : 0) * 60000;
    })();
    el.textContent = formatElapsed(accumulated + getTimerElapsed());
  }
}

function updateTimerBar() {
  const bar = document.getElementById('timerBar');
  if (!bar) return;

  if (!state.activeTimer) {
    bar.style.display = 'none';
    return;
  }

  const entry = state.timesheetEntries.find(e => e.id === state.activeTimer.entryId);
  if (!entry) {
    bar.style.display = 'none';
    return;
  }

  bar.style.display = 'flex';
  document.getElementById('timerBarName').textContent = entry.name || '(Sans titre)';

  // Badges
  const product = state.products.find(p => p.id === entry.productId);
  const category = state.categories.find(c => c.id === entry.categoryId);
  const badgesEl = document.getElementById('timerBarBadges');
  if (badgesEl) {
    badgesEl.innerHTML = [
      product ? `<span class="ts-badge" style="border-color:${product.color}">${product.emoji} ${product.name}</span>` : '',
      category ? `<span class="ts-badge" style="border-color:${category.color}">${category.emoji} ${category.name}</span>` : '',
    ].join('');
  }

  updateTimerBarElapsed();
}

// --------- Start timer for a new (not-yet-saved) entry ---------
function startTimerForNew() {
  const name = document.getElementById('tsName').value.trim();
  if (!name) { showToast('Veuillez saisir un nom de tâche', 'error'); return; }

  // Create an entry first (duration = 0, fromTimer = true)
  const productId = document.getElementById('tsProduct').value;
  const categoryId = document.getElementById('tsCategory').value;
  const stakeholderIdRaw = document.getElementById('tsStakeholder').value;
  const stakeholderId = stakeholderIdRaw ? parseInt(stakeholderIdRaw) : null;
  const dateVal = document.getElementById('tsDate').value || getTodayISO();
  const notes = document.getElementById('tsNotes').value.trim();
  const weekKey = getWeekKey(getMonday(new Date(dateVal)));

  const entry = {
    id: state.nextTimesheetId++,
    name,
    productId,
    categoryId,
    stakeholderId,
    date: dateVal,
    durationMinutes: 0,
    weekKey,
    notes,
    fromTimer: true,
  };

  state.timesheetEntries.push(entry);
  // Reset form name/notes
  document.getElementById('tsName').value = '';
  document.getElementById('tsNotes').value = '';
  document.getElementById('tsDuration').value = '';

  startTimer(entry.id);
  renderTimesheet();
  scheduleSave();
  showToast('Timer démarré', 'success');
}

// --------- CRUD ---------
function getTodayISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function parseDuration(str) {
  // Accepts HH:MM or H:MM or just minutes like "90"
  if (!str) return 0;
  str = str.trim();
  if (str.includes(':')) {
    const [h, m] = str.split(':').map(Number);
    return ((h || 0) * 60) + (m || 0);
  }
  return parseFloat(str) || 0;
}

function addTimesheetEntry() {
  const name = document.getElementById('tsName').value.trim();
  if (!name) { showToast('Le nom de la tâche est requis', 'error'); return; }

  const durationRaw = document.getElementById('tsDuration').value.trim();
  const durationMinutes = parseDuration(durationRaw);
  if (durationMinutes <= 0) { showToast('Veuillez saisir une durée valide (ex : 01:30)', 'error'); return; }

  const productId = document.getElementById('tsProduct').value;
  const categoryId = document.getElementById('tsCategory').value;
  const stakeholderIdRaw = document.getElementById('tsStakeholder').value;
  const stakeholderId = stakeholderIdRaw ? parseInt(stakeholderIdRaw) : null;
  const dateVal = document.getElementById('tsDate').value || getTodayISO();
  const notes = document.getElementById('tsNotes').value.trim();
  const weekKey = getWeekKey(getMonday(new Date(dateVal)));

  const entry = {
    id: state.nextTimesheetId++,
    name,
    productId,
    categoryId,
    stakeholderId,
    date: dateVal,
    durationMinutes,
    weekKey,
    notes,
    fromTimer: false,
  };

  state.timesheetEntries.push(entry);

  // Reset form
  document.getElementById('tsName').value = '';
  document.getElementById('tsDuration').value = '';
  document.getElementById('tsNotes').value = '';

  renderTimesheet();
  renderTimeline();
  updateDonut();
  renderCycles();
  renderRecentTasks();
  scheduleSave();
  showToast('Entrée ajoutée', 'success');
}

// R7.3: Repeat last entry
function repeatLastEntry() {
  if (state.timesheetEntries.length === 0) {
    showToast('Aucune entrée précédente', 'info');
    return;
  }
  const last = state.timesheetEntries[state.timesheetEntries.length - 1];
  document.getElementById('tsName').value = last.name;
  const prodSel = document.getElementById('tsProduct');
  if (prodSel) prodSel.value = last.productId || '';
  const catSel = document.getElementById('tsCategory');
  if (catSel) catSel.value = last.categoryId || '';
  const stakeSel = document.getElementById('tsStakeholder');
  if (stakeSel) stakeSel.value = last.stakeholderId || '';
  document.getElementById('tsDuration').value = last.durationMinutes ? `${String(Math.floor(last.durationMinutes/60)).padStart(2,'0')}:${String(last.durationMinutes%60).padStart(2,'0')}` : '';
  document.getElementById('tsNotes').value = last.notes || '';
  showToast('Dernière entrée copiée', 'info');
}

// R7.4: Recent tasks autocomplete / quick-fill
function renderRecentTasks() {
  const container = document.getElementById('recentTasksList');
  if (!container) return;
  // Get unique task names from last 10 entries (most recent first)
  const seen = new Set();
  const recents = [];
  for (let i = state.timesheetEntries.length - 1; i >= 0 && recents.length < 5; i--) {
    const e = state.timesheetEntries[i];
    if (!seen.has(e.name)) {
      seen.add(e.name);
      recents.push(e);
    }
  }
  if (recents.length === 0) {
    container.innerHTML = '';
    return;
  }
  container.innerHTML = recents.map(e => {
    const prod = state.products.find(p => p.id === e.productId);
    const cat = state.categories.find(c => c.id === e.categoryId);
    return `<button class="recent-task-chip" onclick="fillFromRecent(${e.id})" title="Cliquer pour réutiliser">
      ${prod ? `<span style="color:${prod.color};">${prod.emoji}</span>` : ''}
      <span>${escapeHtml(e.name)}</span>
      ${cat ? `<span style="opacity:0.6;font-size:10px;">${cat.name}</span>` : ''}
    </button>`;
  }).join('');
}

function fillFromRecent(entryId) {
  const e = state.timesheetEntries.find(x => x.id === entryId);
  if (!e) return;
  document.getElementById('tsName').value = e.name;
  const prodSel = document.getElementById('tsProduct');
  if (prodSel) prodSel.value = e.productId || '';
  const catSel = document.getElementById('tsCategory');
  if (catSel) catSel.value = e.categoryId || '';
  const stakeSel = document.getElementById('tsStakeholder');
  if (stakeSel) stakeSel.value = e.stakeholderId || '';
  document.getElementById('tsNotes').value = e.notes || '';
  showToast('Entrée réutilisée', 'info');
}

function deleteTimesheetEntry(id) {
  // Stop timer if it belongs to this entry
  if (state.activeTimer && state.activeTimer.entryId === id) {
    state.activeTimer = null;
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    updateTimerBar();
  }
  state.timesheetEntries = state.timesheetEntries.filter(e => e.id !== id);
  renderTimesheet();
  renderTimeline();
  updateDonut();
  renderCycles();
  scheduleSave();
  showToast('Entrée supprimée', 'info');
}

function editTimesheetEntry(id) {
  const entry = state.timesheetEntries.find(e => e.id === id);
  if (!entry) return;

  // Fill the form with entry data for re-add style editing
  document.getElementById('tsName').value = entry.name;
  document.getElementById('tsProduct').value = entry.productId || '';
  document.getElementById('tsCategory').value = entry.categoryId || '';
  document.getElementById('tsStakeholder').value = entry.stakeholderId || '';
  document.getElementById('tsDate').value = entry.date;
  const h = Math.floor((entry.durationMinutes || 0) / 60);
  const m = Math.round((entry.durationMinutes || 0) % 60);
  document.getElementById('tsDuration').value = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
  document.getElementById('tsNotes').value = entry.notes || '';

  // Remove old entry
  deleteTimesheetEntry(id);
  document.getElementById('tsName').focus();
}

// --------- Task-level data for Week Panel ---------
function getWeekTasksForProductCategory(weekKey, productId, categoryId) {
  // Returns array of { type, id?, name, duration (hours), source, entry? }
  const tasks = [];
  // Timesheet entries (both manual and ICS-imported) for this week/product/category
  state.timesheetEntries
    .filter(e => e.weekKey === weekKey && e.productId === productId && e.categoryId === categoryId)
    .forEach(e => {
      tasks.push({
        type: e.source === 'ics' ? 'ics' : 'timesheet',
        id: e.id,
        name: e.name,
        durationHours: minutesToDecimalHours(e.durationMinutes),
        durationMinutes: e.durationMinutes,
        date: e.date,
        notes: e.notes || '',
        fromTimer: e.fromTimer,
        stakeholderId: e.stakeholderId,
        source: e.source || 'manual',
        entry: e,
      });
    });
  // Manual aggregate: raw state.weeks value (only truly manual/bulk hours)
  const rawVal = (state.weeks[weekKey] && state.weeks[weekKey][productId] && state.weeks[weekKey][productId][categoryId]) || 0;
  if (rawVal > 0) {
    tasks.unshift({
      type: 'manual',
      id: null,
      name: 'Heures manuelles',
      durationHours: rawVal,
      durationMinutes: Math.round(rawVal * 60),
      date: null,
      notes: '',
      fromTimer: false,
      stakeholderId: null,
      source: 'manual',
      entry: null,
    });
  }
  return tasks;
}

// --------- Timesheet Aggregation for Capacity ---------
function getTimesheetHoursForWeek(weekKey) {
  const result = {};
  state.timesheetEntries
    .filter(e => e.weekKey === weekKey && e.productId && e.categoryId)
    .forEach(e => {
      if (!result[e.productId]) result[e.productId] = {};
      if (!result[e.productId][e.categoryId]) result[e.productId][e.categoryId] = 0;
      result[e.productId][e.categoryId] += minutesToDecimalHours(e.durationMinutes);
    });
  return result;
}

// Merge timesheetHours into a copy of weekData (non-destructive)
function getMergedWeekData(key) {
  // Deep clone of manual/ICS data
  const base = {};
  const raw = state.weeks[key] || {};
  state.products.forEach(p => {
    base[p.id] = {};
    state.categories.forEach(c => {
      base[p.id][c.id] = (raw[p.id] && raw[p.id][c.id] !== undefined) ? raw[p.id][c.id] : 0;
    });
  });
  // Merge timesheet on top
  const tsHours = getTimesheetHoursForWeek(key);
  Object.entries(tsHours).forEach(([prodId, cats]) => {
    if (!base[prodId]) base[prodId] = {};
    Object.entries(cats).forEach(([catId, h]) => {
      if (base[prodId][catId] === undefined) base[prodId][catId] = 0;
      base[prodId][catId] += h;
    });
  });
  return base;
}

// --------- Form Dropdowns ---------
function renderTimesheetFormDropdowns() {
  const productSel = document.getElementById('tsProduct');
  const categorySel = document.getElementById('tsCategory');
  const stakeholderSel = document.getElementById('tsStakeholder');
  const dateInput = document.getElementById('tsDate');

  if (!productSel) return;

  // Set default date to today
  if (dateInput && !dateInput.value) dateInput.value = getTodayISO();

  productSel.innerHTML = state.products.map(p =>
    `<option value="${p.id}">${p.emoji} ${p.name}</option>`
  ).join('');

  categorySel.innerHTML = state.categories.map(c =>
    `<option value="${c.id}">${c.emoji} ${c.name}</option>`
  ).join('');

  stakeholderSel.innerHTML = '<option value="">(Aucune)</option>' +
    state.stakeholders.map(s =>
      `<option value="${s.id}">${s.name}</option>`
    ).join('');
}

function onTimesheetStakeholderChange() {
  const stakeholderIdRaw = document.getElementById('tsStakeholder').value;
  if (!stakeholderIdRaw) return;
  const sh = state.stakeholders.find(s => s.id === parseInt(stakeholderIdRaw));
  if (sh && sh.defaultProductId) {
    const productSel = document.getElementById('tsProduct');
    if (productSel) productSel.value = sh.defaultProductId;
  }
}

function onTimesheetProductChange() {
  // No auto action needed here
}

// --------- Rendering ---------
function switchTimesheetView(view) {
  state.timesheetView = view;
  document.querySelectorAll('#timesheetViewToggle .tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tsview === view);
  });
  document.getElementById('timesheetTodayView').style.display = view === 'today' ? 'block' : 'none';
  document.getElementById('timesheetWeekView').style.display = view === 'week' ? 'block' : 'none';
  renderTimesheet();
}

function renderTimesheet() {
  // Update timer bar if active
  if (state.activeTimer) {
    updateTimerBar();
    if (!timerInterval) _startTimerInterval();
  } else {
    const bar = document.getElementById('timerBar');
    if (bar) bar.style.display = 'none';
  }

  if (state.timesheetView === 'week') {
    renderTimesheetWeekView();
  } else {
    renderTimesheetTodayView();
  }
}

function renderTimesheetTodayView() {
  const today = getTodayISO();
  const todayEntries = state.timesheetEntries.filter(e => e.date === today);
  const totalMinutes = todayEntries.reduce((sum, e) => sum + (e.durationMinutes || 0), 0);

  const titleEl = document.getElementById('timesheetDayTitle');
  if (titleEl) {
    const d = new Date();
    titleEl.textContent = d.toLocaleDateString('fr-CH', { weekday: 'long', day: 'numeric', month: 'long' });
  }

  const totalEl = document.getElementById('timesheetDayTotal');
  if (totalEl) totalEl.textContent = formatMinutes(totalMinutes);

  const listEl = document.getElementById('timesheetTodayList');
  if (!listEl) return;

  if (todayEntries.length === 0) {
    const clockIcon = typeof getIcon === 'function' ? getIcon('clock', 32) : '';
    listEl.innerHTML = '<div class="empty-state"><div class="empty-state-icon">' + clockIcon + '</div><div class="empty-state-text">Aucune entr\u00E9e pour aujourd\'hui</div></div>';
    return;
  }

  listEl.innerHTML = `<div class="ts-entry-list">${todayEntries.map(e => renderTimesheetEntryRow(e)).join('')}</div>`;
}

function renderTimesheetWeekView() {
  const listEl = document.getElementById('timesheetWeekList');
  if (!listEl) return;

  const currentMonday = getMonday(new Date());
  const weekKey = getWeekKey(currentMonday);

  // Group by day within this week
  const weekStart = new Date(currentMonday);
  const weekEnd = new Date(currentMonday);
  weekEnd.setDate(weekEnd.getDate() + 6);

  const weekEntries = state.timesheetEntries.filter(e => e.weekKey === weekKey);
  const totalWeekMinutes = weekEntries.reduce((sum, e) => sum + (e.durationMinutes || 0), 0);

  // Group by date
  const byDay = {};
  weekEntries.forEach(e => {
    if (!byDay[e.date]) byDay[e.date] = [];
    byDay[e.date].push(e);
  });

  // Show days Mon-Sun
  let html = `<div class="card">`;
  html += `<div class="card-header"><span class="card-title">Cette semaine</span><span class="ts-total-badge">${formatMinutes(totalWeekMinutes)}</span></div>`;

  if (weekEntries.length === 0) {
    html += `<div class="empty-state"><div class="empty-state-icon">${typeof getIcon === 'function' ? getIcon('calendar', 32) : '📅'}</div><div class="empty-state-text">Aucune entrée pour cette semaine</div></div>`;
  } else {
    // Sort dates
    const sortedDates = Object.keys(byDay).sort();
    html += `<div style="padding:0 4px 8px;">`;
    sortedDates.forEach(date => {
      const entries = byDay[date];
      const dayMinutes = entries.reduce((sum, e) => sum + (e.durationMinutes || 0), 0);
      const dayLabel = new Date(date + 'T12:00:00').toLocaleDateString('fr-CH', { weekday: 'long', day: 'numeric', month: 'short' });
      html += `<div class="ts-day-group">`;
      html += `<div class="ts-day-header"><span class="ts-day-label">${dayLabel}</span><span class="ts-day-total">${formatMinutes(dayMinutes)}</span></div>`;
      html += `<div class="ts-entry-list">${entries.map(e => renderTimesheetEntryRow(e)).join('')}</div>`;
      html += `</div>`;
    });
    html += `</div>`;
  }

  html += `</div>`;
  listEl.innerHTML = html;
}

function renderTimesheetEntryRow(entry) {
  const product = state.products.find(p => p.id === entry.productId);
  const category = state.categories.find(c => c.id === entry.categoryId);
  const stakeholder = entry.stakeholderId ? state.stakeholders.find(s => s.id === entry.stakeholderId) : null;
  const isTimerActive = state.activeTimer && state.activeTimer.entryId === entry.id;

  const productBadge = product
    ? `<span class="ts-badge" style="border-color:${product.color}">${product.emoji} ${product.name}</span>`
    : '';
  const categoryBadge = category
    ? `<span class="ts-badge" style="border-color:${category.color}">${category.emoji} ${category.name}</span>`
    : '';
  const stakeholderBadge = stakeholder
    ? `<span class="ts-badge ts-badge-stakeholder">👤 ${stakeholder.name}</span>`
    : '';
  const timerBadge = entry.fromTimer
    ? '<span class="ts-badge ts-badge-from-timer">' + (typeof getIcon === 'function' ? getIcon('clock', 12) : '') + ' timer</span>'
    : '';

  // Duration display: if timer is running on this entry, show live
  const durationDisplay = isTimerActive
    ? `<span class="ts-entry-duration" style="color:var(--success)" id="liveTimer_${entry.id}">${formatMinutes(entry.durationMinutes)}</span>`
    : `<span class="ts-entry-duration">${formatMinutes(entry.durationMinutes)}</span>`;

  return `
    <div class="ts-entry-row ${isTimerActive ? 'timer-active' : ''}" data-id="${entry.id}">
      <span class="ts-entry-name" title="${escapeHtml(entry.notes || '')}">${escapeHtml(entry.name)}</span>
      <div class="ts-entry-meta">
        ${productBadge}
        ${categoryBadge}
        ${stakeholderBadge}
        ${timerBadge}
      </div>
      ${durationDisplay}
      <div class="ts-entry-actions">
        <button class="action-btn" onclick="editTimesheetEntry(${entry.id})" title="Modifier">${typeof getIcon === 'function' ? getIcon('edit', 16) : '✏️'}</button>
        <button class="action-btn delete" onclick="deleteTimesheetEntry(${entry.id})" title="Supprimer">${typeof getIcon === 'function' ? getIcon('trash', 16) : '🗑️'}</button>
      </div>
    </div>
  `;
}

// =====================================================
//  OVERRIDE getWeekData to merge timesheet hours
// =====================================================
// getMergedWeekData already handles this — we patch getWeekData in place below.
// (No redeclaration needed; getWeekData is overridden via assignment after its declaration.)

// ========== GLOBAL SEARCH (R10.4) ==========
function openSearchModal() {
  const modal = document.getElementById('searchModal');
  if (!modal) return;
  modal.classList.add('open');
  const input = document.getElementById('searchInput');
  if (input) { input.value = ''; input.focus(); }
  renderSearchResults('');
}

function closeSearchModal() {
  const modal = document.getElementById('searchModal');
  if (modal) modal.classList.remove('open');
}

function onSearchInput(val) {
  renderSearchResults(val);
}

function renderSearchResults(query) {
  const container = document.getElementById('searchResults');
  if (!container) return;
  const q = (query || '').toLowerCase().trim();
  if (!q) {
    container.innerHTML = '<div style="color:var(--text-muted);font-size:13px;text-align:center;padding:20px;">Tapez pour rechercher…</div>';
    return;
  }
  const results = [];
  // Search stakeholders
  state.stakeholders.forEach(sh => {
    if (sh.name.toLowerCase().includes(q) || (sh.role && sh.role.toLowerCase().includes(q)) || (sh.notes && sh.notes.toLowerCase().includes(q))) {
      results.push({ type: 'stakeholder', icon: '👥', label: sh.name, sub: sh.role, action: () => { closeSearchModal(); switchSection('stakeholders'); setTimeout(() => openStakeholderDetailModal(sh.id), 200); } });
    }
  });
  // Search products
  state.products.forEach(p => {
    if (p.name.toLowerCase().includes(q)) {
      results.push({ type: 'product', icon: p.emoji, label: p.name, sub: 'Produit', action: () => { closeSearchModal(); switchSection('capacity'); } });
    }
  });
  // Search timesheet entries
  state.timesheetEntries.filter(e => e.name && e.name.toLowerCase().includes(q)).slice(-5).forEach(e => {
    const prod = state.products.find(p => p.id === e.productId);
    results.push({ type: 'timesheet', icon: '⏱️', label: e.name, sub: `${e.date} • ${prod ? prod.name : ''}`, action: () => { closeSearchModal(); switchSection('timesheet'); } });
  });
  // Search weeks
  allWeeks.forEach(w => {
    const label = `Semaine ${w.weekNum} — ${formatDate(w.monday)}`;
    if (label.toLowerCase().includes(q)) {
      results.push({ type: 'week', icon: '📅', label, sub: 'Planification', action: () => { closeSearchModal(); switchSection('capacity'); selectWeek(w.key, w); } });
    }
  });
  if (results.length === 0) {
    container.innerHTML = `<div style="color:var(--text-muted);font-size:13px;text-align:center;padding:20px;">Aucun résultat pour « ${escapeHtml(q)} »</div>`;
    return;
  }
  container.innerHTML = results.map((r, i) => `
    <div class="search-result-item" onclick="searchResultClick(${i})" id="sr-${i}">
      <span class="search-result-icon">${r.icon}</span>
      <div class="search-result-info">
        <div class="search-result-label">${escapeHtml(r.label)}</div>
        <div class="search-result-sub">${escapeHtml(r.sub || '')}</div>
      </div>
      <span class="search-result-type">${r.type}</span>
    </div>
  `).join('');
  // Store results for keyboard nav
  window._searchResults = results;
}

function searchResultClick(idx) {
  if (window._searchResults && window._searchResults[idx]) {
    window._searchResults[idx].action();
  }
}

// ========== KEYBOARD SHORTCUTS (R10.3) ==========
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Ctrl+S: Save current week if panel open
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      const panel = document.getElementById('weekPanel');
      if (panel && panel.classList.contains('open')) {
        saveWeekData();
      } else {
        scheduleSave();
        showToast('Sauvegardé', 'success');
      }
      return;
    }
    // Ctrl+K: Open search
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      openSearchModal();
      return;
    }
    // Escape: Close search or week panel
    if (e.key === 'Escape') {
      const searchModal = document.getElementById('searchModal');
      if (searchModal && searchModal.classList.contains('open')) {
        closeSearchModal();
        return;
      }
      const detailModal = document.getElementById('stakeholderDetailModal');
      if (detailModal && detailModal.classList.contains('open')) {
        closeStakeholderDetailModal();
        return;
      }
      const genericModal = document.getElementById('genericModal');
      if (genericModal && genericModal.classList.contains('open')) {
        closeGenericModal();
        return;
      }
      const shModal = document.getElementById('stakeholderModal');
      if (shModal && shModal.classList.contains('open')) {
        closeStakeholderModal();
        return;
      }
      const panel = document.getElementById('weekPanel');
      if (panel && panel.classList.contains('open')) {
        closeWeekPanel();
        return;
      }
    }
    // Arrow keys: Navigate weeks when panel is open
    if (!e.ctrlKey && !e.metaKey && !e.altKey) {
      const panel = document.getElementById('weekPanel');
      if (panel && panel.classList.contains('open')) {
        const activeEl = document.activeElement;
        const isInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT');
        if (!isInput) {
          if (e.key === 'ArrowLeft') {
            e.preventDefault();
            navigateWeekPanel(-1);
          } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            navigateWeekPanel(1);
          }
        }
      }
    }
  });
}

function navigateWeekPanel(dir) {
  const panel = document.getElementById('weekPanel');
  if (!panel) return;
  const key = panel.dataset.weekKey;
  const idx = allWeeks.findIndex(w => w.key === key);
  const newIdx = idx + dir;
  if (newIdx >= 0 && newIdx < allWeeks.length) {
    const w = allWeeks[newIdx];
    state.selectedWeekKey = w.key;
    renderTimeline();
    openWeekPanel(w.key, w);
  }
}

// =====================================================
//  TEAM MANAGEMENT (local state — contact reference)
// =====================================================

function loadTeamMembers() {
  renderTeamMembers(state.teamMembers || []);
}

function renderTeamMembers(members) {
  const list = document.getElementById('teamMembersList');
  if (!list) return;
  if (!members || members.length === 0) {
    list.innerHTML = '<p style="font-size:12px;color:var(--text-muted);padding:8px 0;">Aucun membre ajouté.</p>';
    return;
  }
  list.innerHTML = members.map((m, i) => {
    const initials = (m.name || '?').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    return '<div class="team-member-row">' +
      '<div class="avatar" style="font-size:11px;">' + escapeHtml(initials) + '</div>' +
      '<div class="team-member-info"><div class="team-member-name">' + escapeHtml(m.name) + '</div>' +
      '<div class="team-member-email">' + escapeHtml(m.email || '') + '</div></div>' +
      '<span class="badge badge-' + (m.role || 'viewer') + '">' + (m.role === 'editor' ? 'Éditeur' : 'Lecteur') + '</span>' +
      '<button class="btn btn-ghost btn-sm" onclick="removeTeamMember(' + i + ')" style="padding:4px 6px;font-size:11px;">&#x2715;</button>' +
      '</div>';
  }).join('');
}

function inviteTeamMember() {
  const emailEl = document.getElementById('inviteEmail');
  const roleEl = document.getElementById('inviteRole');
  if (!emailEl) return;
  const email = emailEl.value.trim();
  if (!email) { showToast('Veuillez entrer un email', 'error'); return; }
  if (!state.teamMembers) state.teamMembers = [];
  state.teamMembers.push({ name: email.split('@')[0], email, role: roleEl ? roleEl.value : 'viewer' });
  emailEl.value = '';
  renderTeamMembers(state.teamMembers);
  scheduleSave();
  showToast('Membre ajouté', 'success');
}

function removeTeamMember(index) {
  if (!state.teamMembers) return;
  state.teamMembers.splice(index, 1);
  renderTeamMembers(state.teamMembers);
  scheduleSave();
  showToast('Membre retiré', 'info');
}


// ========== INITIALIZATION ==========
function renderAll() {
  renderTimeline();
  updateDonut();
  renderCycles();
  renderKPIBar();
  renderCategorySettings();
  renderProductSettings();
  renderMatrixNodes();
  renderStakeholderTable();
  renderTimesheet();
  renderRecentTasks();
}

// Pre-fill sample data
function seedSampleData() {
  const w1Key = allWeeks[0].key;
  state.weeks[w1Key] = {
    'swd':            { design: 8, discovery: 4, pm: 2, meetings: 2, docs: 0, designops: 0, other: 0 },
    'espace-client':  { design: 6, discovery: 4, pm: 0, meetings: 0, docs: 0, designops: 0, other: 0 },
    'app-mobile':     { design: 4, discovery: 0, pm: 0, meetings: 2, docs: 0, designops: 0, other: 0 },
    'design-system':  { design: 0, discovery: 0, pm: 0, meetings: 0, docs: 0, designops: 4, other: 0 },
    'transversal':    { design: 0, discovery: 0, pm: 0, meetings: 2, docs: 2, designops: 0, other: 0 },
  };

  const w2Key = allWeeks[1].key;
  state.weeks[w2Key] = {
    'swd':            { design: 10, discovery: 2, pm: 3, meetings: 2, docs: 0, designops: 0, other: 0 },
    'espace-client':  { design: 4, discovery: 2, pm: 0, meetings: 1, docs: 0, designops: 0, other: 0 },
    'app-mobile':     { design: 6, discovery: 2, pm: 0, meetings: 1, docs: 0, designops: 0, other: 0 },
    'design-system':  { design: 2, discovery: 0, pm: 0, meetings: 0, docs: 0, designops: 2, other: 0 },
    'transversal':    { design: 0, discovery: 0, pm: 0, meetings: 2, docs: 1, designops: 0, other: 1 },
  };

  const w3Key = allWeeks[2].key;
  state.weeks[w3Key] = {
    'swd':            { design: 6, discovery: 6, pm: 2, meetings: 2, docs: 0, designops: 0, other: 0 },
    'espace-client':  { design: 8, discovery: 2, pm: 1, meetings: 1, docs: 0, designops: 0, other: 0 },
    'app-mobile':     { design: 2, discovery: 0, pm: 0, meetings: 1, docs: 0, designops: 0, other: 0 },
    'design-system':  { design: 0, discovery: 0, pm: 0, meetings: 0, docs: 2, designops: 4, other: 0 },
    'transversal':    { design: 0, discovery: 0, pm: 0, meetings: 2, docs: 2, designops: 0, other: 0 },
  };

  const w4Key = allWeeks[3].key;
  state.weeks[w4Key] = {
    'swd':            { design: 4, discovery: 8, pm: 2, meetings: 2, docs: 1, designops: 0, other: 0 },
    'espace-client':  { design: 2, discovery: 4, pm: 1, meetings: 1, docs: 0, designops: 0, other: 0 },
    'app-mobile':     { design: 6, discovery: 0, pm: 1, meetings: 2, docs: 0, designops: 0, other: 0 },
    'design-system':  { design: 0, discovery: 0, pm: 0, meetings: 0, docs: 0, designops: 2, other: 0 },
    'transversal':    { design: 0, discovery: 0, pm: 0, meetings: 3, docs: 2, designops: 0, other: 0 },
  };
}

let serverDataLoaded = false;

function bootApp() {
  refreshAllWeeks(); // R2.1: ensure allWeeks is populated with correct offset
  if (!serverDataLoaded) {
    seedSampleData();
  }
  // R2.1: select current week by default
  const currentWeek = allWeeks.find(w => w.isCurrent);
  state.selectedWeekKey = currentWeek ? currentWeek.key : allWeeks[0].key;
  // Apply saved theme
  applyTheme(state.theme || 'current');
  renderAll();
  renderKPIBar();
  setupICSDropZone();
  setupKeyboardShortcuts(); // R10.3
  injectSVGIcons(); // Phase 1: replace emoji with SVG icons
  setupNavKeyboard(); // Phase 1: keyboard nav for sidebar
}

// Handle window resize for network view
window.addEventListener('resize', () => {
  const networkView = document.getElementById('view-network');
  if (networkView && networkView.style.display !== 'none') {
    renderNetwork();
  }
});

// Hash-based routing (updated)
function handleHashRoute() {
  const hash = window.location.hash.replace('#', '');
  if (['stakeholders', 'capacity', 'settings', 'ics-import', 'mapping-rules', 'timesheet'].includes(hash)) {
    switchSection(hash);
  }
}
window.addEventListener('hashchange', handleHashRoute);
handleHashRoute();

// ========== PHASE 1: SVG ICON INJECTION ==========
function injectSVGIcons() {
  if (typeof getIcon !== 'function') return;

  // === Generic: inject by data-inject-icon attribute ===
  document.querySelectorAll('[data-inject-icon]').forEach(el => {
    const iconName = el.getAttribute('data-inject-icon');
    const sizeAttr = el.getAttribute('data-inject-size');
    const size = sizeAttr ? parseInt(sizeAttr, 10) : (el.classList.contains('btn-sm') ? 16 : 18);
    el.innerHTML = getIcon(iconName, size);
  });

  // === Nav items (sidebar navigation) ===
  const navIconMap = {
    'capacity': 'barChart',
    'ics-import': 'calendar',
    'stakeholders': 'users',
    'timesheet': 'clock',
    'mapping-rules': 'wrench',
    'settings': 'settings',
  };
  document.querySelectorAll('.nav-item[data-section]').forEach(item => {
    const section = item.getAttribute('data-section');
    const iconSpan = item.querySelector('.nav-item-icon');
    if (iconSpan && navIconMap[section]) {
      iconSpan.innerHTML = getIcon(navIconMap[section], 20);
    }
  });

  // Export nav item
  const exportItem = document.querySelector('.nav-item[onclick*="exportAllData"]');
  if (exportItem) {
    const iconSpan = exportItem.querySelector('.nav-item-icon');
    if (iconSpan) iconSpan.innerHTML = getIcon('download', 20);
  }

  // Import nav item
  const importItem = document.querySelector('label.nav-item[for="importFile"]');
  if (importItem) {
    const iconSpan = importItem.querySelector('.nav-item-icon');
    if (iconSpan) iconSpan.innerHTML = getIcon('upload', 20);
  }

  // Search button icon
  const searchBtn = document.querySelector('[onclick*="openSearchModal"]');
  if (searchBtn) {
    const iconSpan = searchBtn.querySelector('span[aria-hidden]');
    if (iconSpan) iconSpan.innerHTML = getIcon('search', 16);
  }

  // Logout button icon
  const logoutBtn = document.querySelector('[onclick*="doLogout"]');
  if (logoutBtn) {
    logoutBtn.innerHTML = getIcon('logOut', 16);
  }

  // Sidebar logo icon
  document.querySelectorAll('.sidebar-logo-icon').forEach(el => {
    el.innerHTML = getIcon('zap', 20);
  });

  // Timeline navigation arrows
  const prevBtn = document.querySelector('[onclick*="shiftTimeline(-1)"]');
  if (prevBtn) prevBtn.innerHTML = getIcon('chevronLeft', 16);
  const nextBtn = document.querySelector('[onclick*="shiftTimeline(1)"]');
  if (nextBtn) nextBtn.innerHTML = getIcon('chevronRight', 16);
}

// ========== PHASE 1: KEYBOARD NAV FOR SIDEBAR ==========
function setupNavKeyboard() {
  document.querySelectorAll('.nav-item[tabindex="0"]').forEach(item => {
    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        item.click();
      }
    });
  });
}

// ========== FOCUS TRAP FOR MODALS ==========
function trapFocus(e) {
  // Also handle confirm modal
  const confirmOverlay = document.getElementById('confirmOverlay');
  if (confirmOverlay && confirmOverlay.classList.contains('open')) {
    if (e.key === 'Escape') { closeConfirm(); return; }
    if (e.key !== 'Tab') return;
    const card = confirmOverlay.querySelector('.confirm-card');
    const focusable = card.querySelectorAll('button');
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    return;
  }

  const openModal = document.querySelector('.modal-overlay.open .modal, .slide-panel.open, .search-modal.open .search-modal-inner');
  if (!openModal) return;
  if (e.key !== 'Tab') return;
  const focusable = openModal.querySelectorAll('button, [href], input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])');
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (e.shiftKey) {
    if (document.activeElement === first) { e.preventDefault(); last.focus(); }
  } else {
    if (document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
}
document.addEventListener('keydown', trapFocus);
