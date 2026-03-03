/* =========================================
   Environment Configuration
   Loads from window.ENV or .env file
   ========================================= */

window.ENV = window.ENV || {};

// Load environment variables from Vercel or .env.local
async function loadEnvConfig() {
  // Si les variables ne sont pas déjà définies (injectées par Vercel),
  // essayer de charger depuis /env-config.json (généré lors du build)
  if (!window.ENV.SUPABASE_URL) {
    try {
      const envFile = await fetch('/env-config.json', { cache: 'no-store' });
      if (envFile.ok) {
        const config = await envFile.json();
        window.ENV = { ...window.ENV, ...config };
      }
    } catch (err) {
      console.warn('env-config.json not found, relying on Vercel environment variables');
    }
  }

  // Vérifier que les variables essentielles sont présentes
  if (!window.ENV.SUPABASE_URL || !window.ENV.SUPABASE_ANON_KEY) {
    console.error('ERROR: Missing Supabase configuration');
    console.error('Required: SUPABASE_URL and SUPABASE_ANON_KEY');
    return false;
  }

  return true;
}

// Initialiser au chargement de la page
loadEnvConfig().catch(console.error);
