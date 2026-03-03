# Guide de Migration — IndexedDB → Supabase + Auth Maison → Supabase Auth

## Contexte

Le code `app.js` (4500 lignes) utilise actuellement :
- ✅ IndexedDB pour le stockage de `state` (products, categories, etc.)
- ✅ Auth locale avec SHA-256 (maison)

Après migration :
- ✅ **Supabase PostgreSQL** pour le stockage (synchronisé multi-device)
- ✅ **Supabase Auth** pour l'authentification (JWT, bcrypt, multi-device)

---

## Étapes de Migration

### Phase 1 — Préparation (1-2 heures)

1. **Créer le projet Supabase**
   - [https://supabase.com](https://supabase.com) → Créer un projet
   - Region: Choisir le plus proche
   - Copier `SUPABASE_URL` et `SUPABASE_ANON_KEY` depuis Settings → API
   - Copier `SUPABASE_JWT_SECRET` depuis Settings → API

2. **Exécuter le schéma SQL**
   - Ouvrir `supabase/migrations/001_init_schema.sql`
   - Copier le contenu complet
   - Aller à Supabase → SQL Editor → New Query
   - Coller et exécuter

3. **Ajouter les variables dans Vercel**
   - Aller à vercel.com → Votre projet → Settings → Environment Variables
   - Ajouter :
     ```
     SUPABASE_URL=<copié>
     SUPABASE_ANON_KEY=<copié>
     SUPABASE_JWT_SECRET=<copié>
     PRODUCTION_URL=https://votre-projet.vercel.app
     LLM_API_KEY=sk-... (si vous en avez une)
     LLM_PROVIDER=openai
     ```
   - Cliquer "Redeploy" pour appliquer

---

### Phase 2 — Code Frontend (2-3 heures)

#### 2.1 Charger les dépendances Supabase dans `index.html`

Ajouter après `<head>` :

```html
<!-- Env Config (charger en premier) -->
<script src="./env-config.js"></script>

<!-- Supabase JS SDK -->
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.39.0/+esm"></script>

<!-- Supabase Client Wrapper -->
<script src="./supabase-client.js"></script>
```

#### 2.2 Remplacer l'authentification dans `app.js`

**À SUPPRIMER** (lignes ~64-200) :
- Fonction `sha256()` — remplacée par Supabase bcrypt
- Fonction `initDB()` — remplacée par Supabase RLS
- Fonction `dbGet()` / `dbPut()` — remplacées par Supabase API
- Fonction `doLogin()` — remplacée par `doLogin()` de supabase-client.js
- Fonction `doRegister()` — remplacée par `doRegister()` de supabase-client.js
- Toutes les références à IndexedDB pour les users

**À AJOUTER** au début de `app.js` (après les initializations) :

```javascript
// Initialisation Supabase
async function initApp() {
  // Charger Supabase
  const ok = await initSupabase();
  if (!ok) {
    showAuthError('loginError', 'Configuration Supabase manquante');
    return false;
  }

  // Essayer de restaurer la session depuis le navigateur
  const hasSession = await restoreSession();
  if (hasSession) {
    // Utilisateur déjà connecté
    await loadAppStateFromSupabase();
    enterApp();
  }
  // Sinon : afficher l'écran auth (authentification manuelle)

  return true;
}

// Charger l'état applicatif depuis Supabase
async function loadAppStateFromSupabase() {
  const dbState = await loadAppState();
  if (dbState) {
    // Mapper les données Supabase vers state global
    state.products = dbState.products || [];
    state.categories = dbState.categories || [];
    state.stakeholders = dbState.stakeholders || [];
    state.week_templates = dbState.week_templates || [];
    state.keyword_rules = dbState.keyword_rules || [];
    state.icsAutoEvents = dbState.ics_auto_events || [];
    state.icsManualEvents = dbState.ics_manual_events || [];
    state.icsIgnoredEvents = dbState.ics_ignored_events || [];
    state.llmProvider = dbState.llm_provider || 'openai';
  }
}

// Sauvegarder l'état applicatif dans Supabase
async function saveAppStateToSupabase() {
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

  if (!success) {
    console.error('Erreur lors de la sauvegarde');
  }
}

// Appeler initApp() au chargement
window.addEventListener('DOMContentLoaded', initApp);
```

#### 2.3 Remplacer les appels `dbGet()` / `dbPut()` par Supabase

**Chercher et remplacer** tous les appels `dbGet('state', sessionToken)` et `dbPut('state', sessionToken, ...)` :

**Avant** :
```javascript
const savedData = await dbGet('state', sessionToken);
if (savedData) restoreState(savedData);

// Sauvegarder
await dbPut('state', sessionToken, state);
```

**Après** :
```javascript
const dbState = await loadAppState();
if (dbState) {
  // Mapper vers state global
  state.products = dbState.products || [];
  // ... etc
}

// Sauvegarder
await saveAppStateToSupabase();
```

#### 2.4 Remplacer l'écran d'auth

Dans `index.html`, remplacer la fonction `doLogin()` et `doRegister()` :

```javascript
// REMPLACER ces deux fonctions (dans index.html ou app.js)
async function doLogin() {
  const email = (document.getElementById('loginEmail').value || '').trim();
  const password = document.getElementById('loginPassword').value || '';
  if (!email || !password) {
    showAuthError('loginError', 'Email et mot de passe requis');
    return;
  }

  const btn = document.getElementById('loginBtn');
  btn.textContent = 'Connexion...';
  btn.disabled = true;

  try {
    await doLogin(email, password);  // Appel Supabase
    await loadAppStateFromSupabase();
    enterApp();
  } catch (error) {
    showAuthError('loginError', error.message);
  }

  btn.textContent = 'Se connecter';
  btn.disabled = false;
}

async function doRegister() {
  const display_name = (document.getElementById('regName').value || '').trim();
  const role = (document.getElementById('regRole').value || '').trim();
  const email = (document.getElementById('regEmail').value || '').trim();
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
    await doRegister(email, password, display_name, role);  // Appel Supabase
    await loadAppStateFromSupabase();
    enterApp();
  } catch (error) {
    showAuthError('registerError', error.message);
  }

  btn.textContent = 'Créer mon compte';
  btn.disabled = false;
}
```

---

### Phase 3 — Code Backend Python (30 minutes)

Le fichier `api/llm.py` a déjà été mis à jour. Aucune action requise.

Vérifier dans `api/llm.py` :
- ✅ Vérification JWT (`verify_jwt()`)
- ✅ Validation des entrées
- ✅ CORS restreint
- ✅ Anti-SSRF sur custom_url

---

### Phase 4 — Tester Localement (1 heure)

#### 4.1 Configuration locale

```bash
cp .env.example .env.local
```

Éditer `.env.local` :
```
SUPABASE_URL=votre-url-supabase
SUPABASE_ANON_KEY=votre-clé-anon
```

#### 4.2 Lancer le serveur de dev

```bash
npm run dev
# ou
vercel dev
```

#### 4.3 Tester le flux

1. Aller à http://localhost:3000
2. Créer un compte (Register)
3. Vérifier que les données sont sauvegardées dans Supabase (aller à Supabase → app_state table)
4. Se déconnecter
5. Se reconnecter avec le même compte
6. Vérifier que les données sont restaurées

#### 4.4 Tester le LLM proxy

1. Aller à Settings → LLM
2. Si `LLM_API_KEY` n'est pas définie en env, une input devrait apparaître
3. Tester avec une clé API valide

---

### Phase 5 — Déployer (30 minutes)

```bash
# Vérifier que .env n'est PAS dans git
git check-ignore .env

# Ajouter et committer les changements
git add .
git commit -m "feat: migrate to Supabase (auth + db) + JWT security for LLM proxy"

# Pousser
git push

# Vercel redéploiera automatiquement
```

Vérifier sur https://vercel.com que :
- ✅ Le déploiement a réussi
- ✅ Les variables d'environnement sont présentes (Settings → Environment Variables)
- ✅ La fonction Python `/api/llm` démarre correctement

---

## Checklist de Vérification Post-Migration

- [ ] Auth fonctionne (register + login)
- [ ] Données sauvegardées dans Supabase (vérifier table `app_state`)
- [ ] Multi-device : créer un compte sur 2 navigateurs différents
- [ ] LLM proxy répond (avec JWT valide)
- [ ] Aucune clé API n'est exposée dans les logs
- [ ] CORS fonctionne (pas d'erreurs réseau)
- [ ] Fichiers `.bak` et `.tmp` supprimés

---

## Rollback (au cas où)

Si migration échoue :

```bash
git log --oneline  # Trouver le commit avant migration
git revert <commit-hash>
git push
```

Les données restent dans Supabase (non supprimées), vous pouvez réessayer plus tard.

---

## FAQ

**Q : Les données IndexedDB vont-elles être perdues ?**
R : Oui. Vous pouvez exporter les données manuellement avant migration si critiques.

**Q : Comment les utilisateurs existants vont-ils migrer ?**
R : Demander à chacun de se ré-enregistrer sur la nouvelle version. Leurs anciennes données IndexedDB seront inaccessibles.

**Q : Est-ce que Supabase est gratuit ?**
R : Oui, plan gratuit = 500 MB storage + 2 GB bandwidth/mois.

**Q : Combien de temps ça prend ?**
R : 3-4 heures pour un développeur expérimenté, 6-8 heures pour un junior.
