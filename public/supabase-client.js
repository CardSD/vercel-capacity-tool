/* =========================================
   Supabase Client & Data Management
   Multi-user, multi-device synchronization
   ========================================= */

let supabaseClient = null;
let currentSession = null;

async function initSupabase() {
  // Wait for env-config to finish loading
  if (window._envReady) {
    await window._envReady;
  }

  // Check Supabase library loaded
  if (!window.supabase || !window.supabase.createClient) {
    console.error('Supabase JS library not loaded');
    return false;
  }

  const SUPABASE_URL = (window.ENV?.SUPABASE_URL || '').trim();
  const SUPABASE_ANON_KEY = (window.ENV?.SUPABASE_ANON_KEY || '').trim();

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('Supabase not configured: missing SUPABASE_URL or SUPABASE_ANON_KEY');
    return false;
  }

  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return true;
}

// ─── Authentication (Supabase) ────────────────────────────────────────────

async function supabaseLogin(email, password) {
  if (!supabaseClient) {
    throw new Error('Supabase not initialized');
  }

  const { data, error } = await supabaseClient.auth.signInWithPassword({
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
  if (!supabaseClient) {
    throw new Error('Supabase not initialized');
  }

  const { data, error } = await supabaseClient.auth.signUp({
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
  if (!supabaseClient) return false;

  const { error } = await supabaseClient.auth.signOut();
  if (error) console.error('Logout error:', error);

  currentSession = null;
  return !error;
}

async function getCurrentSession() {
  if (!supabaseClient) return null;

  const { data, error } = await supabaseClient.auth.getSession();
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
// Uses a single `full_state` JSONB column to persist the entire app state.
// This mirrors the old IndexedDB approach: one blob = everything.

async function loadAppState() {
  if (!supabaseClient || !currentSession) {
    return null;
  }

  const { data, error } = await supabaseClient
    .from('app_state')
    .select('full_state')
    .eq('user_id', currentSession.user.id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // No row found — create empty row
      return await createEmptyAppState();
    }
    console.error('Load app state error:', error);
    return null;
  }

  // Return the full_state blob (or null if empty)
  return data?.full_state || null;
}

async function createEmptyAppState() {
  if (!supabaseClient || !currentSession) {
    return null;
  }

  const { data, error } = await supabaseClient
    .from('app_state')
    .insert([{ user_id: currentSession.user.id, full_state: {} }])
    .select('full_state')
    .single();

  if (error) {
    console.error('Create app state error:', error);
    return null;
  }

  return data?.full_state || null;
}

async function saveAppState(fullStateObj) {
  if (!supabaseClient || !currentSession) {
    return false;
  }

  const { error } = await supabaseClient
    .from('app_state')
    .upsert({
      user_id: currentSession.user.id,
      full_state: fullStateObj,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'user_id',
    });

  if (error) {
    console.error('Save app state error:', error);
    return false;
  }

  return true;
}

// ─── LLM with JWT Token ────────────────────────────────────────────────────

async function callLLMProxy(payload) {
  if (!supabaseClient || !currentSession) {
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
