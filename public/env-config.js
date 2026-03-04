/* =========================================
   Environment Configuration
   Loads from window.ENV or env-config.json
   ========================================= */

window.ENV = window.ENV || {};

// Promise that resolves when env is loaded — awaitable from other scripts
window._envReady = (async function loadEnvConfig() {
  if (!window.ENV.SUPABASE_URL) {
    try {
      const envFile = await fetch('/env-config.json', { cache: 'no-store' });
      if (envFile.ok) {
        const config = await envFile.json();
        window.ENV = { ...window.ENV, ...config };
      }
    } catch (err) {
      console.warn('env-config.json not found');
    }
  }

  if (!window.ENV.SUPABASE_URL || !window.ENV.SUPABASE_ANON_KEY) {
    console.error('ERROR: Missing Supabase configuration');
    console.error('Required: SUPABASE_URL and SUPABASE_ANON_KEY');
    return false;
  }
  return true;
})();
