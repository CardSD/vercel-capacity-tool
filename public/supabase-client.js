/* =========================================
   Supabase Client & Data Management
   Multi-user, multi-device synchronization
   ========================================= */

let supabase = null;
let currentSession = null;

async function initSupabase() {
  const { createClient } = window.supabase;

  const SUPABASE_URL = window.ENV?.SUPABASE_URL || '';
  const SUPABASE_ANON_KEY = window.ENV?.SUPABASE_ANON_KEY || '';

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('Supabase not configured: missing SUPABASE_URL or SUPABASE_ANON_KEY');
    return false;
  }

  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return true;
}

// ─── Authentication (Supabase) ────────────────────────────────────────────

async function supabaseLogin(email, password) {
  if (!supabase) {
    throw new Error('Supabase not initialized');
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });

  if (error) {
    throw new Error('Email ou mot de passe incorrect');
  }

  currentSession = data.session;
  return data.user;
}

async function supabaseRegister(email, password, displayName, role) {
  if (!supabase) {
    throw new Error('Supabase not initialized');
  }

  const { data, error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: {
      data: {
        display_name: displayName,
        role: role || 'designer',
      },
    },
  });

  if (error) {
    if (error.message.includes('already registered')) {
      throw new Error('Un compte avec cet email existe déjà');
    }
    throw new Error(error.message || 'Erreur lors de la création du compte');
  }

  currentSession = data.session;
  return data.user;
}

async function supabaseLogout() {
  if (!supabase) return false;

  const { error } = await supabase.auth.signOut();
  if (error) console.error('Logout error:', error);

  currentSession = null;
  return !error;
}

async function getCurrentSession() {
  if (!supabase) return null;

  const { data, error } = await supabase.auth.getSession();
  if (!error && data.session) {
    currentSession = data.session;
    return data.session;
  }
  return null;
}

async function restoreSession() {
  const session = await getCurrentSession();
  if (session) {
    currentUser = {
      email: session.user.email,
      display_name: session.user.user_metadata?.display_name || '',
      role: session.user.user_metadata?.role || 'designer',
    };
    return true;
  }
  return false;
}

// ─── App State Management (Supabase) ───────────────────────────────────────

async function loadAppState() {
  if (!supabase || !currentSession) {
    return null;
  }

  const { data, error } = await supabase
    .from('app_state')
    .select('*')
    .eq('user_id', currentSession.user.id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // No row found — create empty state
      return await createEmptyAppState();
    }
    console.error('Load app state error:', error);
    return null;
  }

  return data;
}

async function createEmptyAppState() {
  if (!supabase || !currentSession) {
    return null;
  }

  const emptyState = {
    user_id: currentSession.user.id,
    products: [],
    categories: [],
    stakeholders: [],
    week_templates: [],
    keyword_rules: [],
    ics_auto_events: [],
    ics_manual_events: [],
    ics_ignored_events: [],
    llm_provider: 'openai',
  };

  const { data, error } = await supabase
    .from('app_state')
    .insert([emptyState])
    .select()
    .single();

  if (error) {
    console.error('Create app state error:', error);
    return null;
  }

  return data;
}

async function saveAppState(stateData) {
  if (!supabase || !currentSession) {
    return false;
  }

  const { products, categories, stakeholders, week_templates, keyword_rules, ics_auto_events, ics_manual_events, ics_ignored_events, llmProvider } = stateData;

  const { error } = await supabase
    .from('app_state')
    .update({
      products,
      categories,
      stakeholders,
      week_templates,
      keyword_rules,
      ics_auto_events,
      ics_manual_events,
      ics_ignored_events,
      llm_provider: llmProvider,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', currentSession.user.id);

  if (error) {
    console.error('Save app state error:', error);
    return false;
  }

  return true;
}

// ─── Week Entries (Capacity Data) ──────────────────────────────────────────

async function loadWeekEntries(weekKey) {
  if (!supabase || !currentSession) {
    return [];
  }

  const { data, error } = await supabase
    .from('week_entries')
    .select('*')
    .eq('user_id', currentSession.user.id)
    .eq('week_key', weekKey);

  if (error) {
    console.error('Load week entries error:', error);
    return [];
  }

  return data || [];
}

async function saveWeekEntries(weekKey, productId, categoryId, entries) {
  if (!supabase || !currentSession) {
    return false;
  }

  const { error } = await supabase
    .from('week_entries')
    .upsert({
      user_id: currentSession.user.id,
      week_key: weekKey,
      product_id: productId,
      category_id: categoryId,
      entries,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'user_id,week_key,product_id,category_id'
    });

  if (error) {
    console.error('Save week entries error:', error);
    return false;
  }

  return true;
}

// ─── LLM with JWT Token ────────────────────────────────────────────────────

async function callLLMProxy(payload) {
  if (!supabase || !currentSession) {
    throw new Error('Not authenticated');
  }

  const token = currentSession.access_token;

  const response = await fetch('/api/llm', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'LLM proxy error');
  }

  const data = await response.json();
  return data;
}

async function testLLMProxy(provider, customUrl = '') {
  return callLLMProxy({
    action: 'test',
    provider,
    custom_url: customUrl,
  });
}

async function getLLMConfig() {
  return callLLMProxy({ action: 'config' });
}

async function callLLM(messages, systemPrompt = '', provider = 'openai', customUrl = '', temperature = 0.1, maxTokens = 2000) {
  return callLLMProxy({
    action: 'proxy',
    provider,
    custom_url: customUrl,
    messages,
    system_prompt: systemPrompt,
    temperature,
    max_tokens: maxTokens,
  });
}

// ─── Helper: Get JWT for API calls ────────────────────────────────────────

function getAuthHeader() {
  if (!currentSession) {
    return {};
  }
  return {
    'Authorization': `Bearer ${currentSession.access_token}`,
  };
}
