# Quick Start — Setup Multi-User Capacity Tool

**Temps estimé** : 15-20 minutes pour la configuration, 4-6 heures pour l'implémentation

---

## 🎯 Objectif

Transformer l'outil single-user (IndexedDB) en application multi-user sécurisée avec :
- ✅ Authentification multi-device (Supabase Auth)
- ✅ Données synchronisées (PostgreSQL Supabase)
- ✅ API LLM sécurisée (JWT + validation)
- ✅ Row Level Security (RLS) — isolation par utilisateur

---

## 📋 Checklist — Ce qui est fait / Ce qui reste

### ✅ FAIT (prêt à utiliser)

```
✅ Backend
  ├─ api/llm.py — JWT + validation + CORS
  ├─ supabase/migrations/001_init_schema.sql — Schéma BD + RLS
  └─ scripts/build-env-config.js — Build script Vercel

✅ Frontend (nouveaux fichiers)
  ├─ public/supabase-client.js — Client Supabase
  ├─ public/env-config.js — Configuration env
  └─ vercel.json — Headers + security

✅ Configuration
  ├─ .env.example — Template variables
  ├─ .gitignore — Secrets protégés
  ├─ README.md — Docs mises à jour
  ├─ MIGRATION_GUIDE.md — Guide détaillé
  └─ CHANGES_SUMMARY.md — Ce qui a changé

✅ Documentation
  └─ Tous les guides et FAQs
```

### ❌ À FAIRE (action utilisateur)

```
❌ 1. Supabase Setup (30 min)
  ├─ Créer projet Supabase
  ├─ Exécuter le SQL schema
  └─ Récupérer les clés

❌ 2. Modifier app.js (4-6h)
  ├─ Remplacer auth maison par Supabase Auth
  ├─ Remplacer IndexedDB par Supabase DB calls
  └─ Ajouter JWT aux appels LLM

❌ 3. Tester localement (1h)
  ├─ Créer compte
  ├─ Vérifier Supabase
  └─ Tester LLM proxy

❌ 4. Déployer (5 min)
  ├─ Configurer Vercel variables
  ├─ Push code
  └─ Vérifier en production
```

---

## 🚀 Start Here — Workflow en 4 étapes

### Étape 1️⃣ : Préparer Supabase (30 minutes)

```bash
# 1. Créer projet Supabase
# → https://supabase.com → New Project

# 2. Récupérer les clés
# Supabase Dashboard → Settings → API
# - Copier PROJECT_URL → SUPABASE_URL
# - Copier ANON_KEY → SUPABASE_ANON_KEY
# - Copier JWT_SECRET → SUPABASE_JWT_SECRET

# 3. Exécuter le SQL
# - Ouvrir supabase/migrations/001_init_schema.sql
# - Copier tout le contenu
# - Aller à Supabase → SQL Editor → New Query
# - Coller et exécuter ✓
```

**Résultat attendu** : Tables `app_state`, `week_entries`, `llm_settings` créées avec RLS.

---

### Étape 2️⃣ : Intégrer Supabase dans app.js (4-6 heures)

**Voir le guide détaillé :** `MIGRATION_GUIDE.md` → Phase 2

En résumé :

```javascript
// 1. Charger les scripts dans index.html
<script src="./env-config.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="./supabase-client.js"></script>

// 2. Supprimer de app.js (~200 lignes)
// - Fonction sha256()
// - Fonction initDB() / dbGet() / dbPut()
// - Fonction doLogin() / doRegister() (anciennes)

// 3. Ajouter dans app.js (~100 lignes)
// - Appel initSupabase() au démarrage
// - Remplacer tous les dbGet('state') par loadAppState()
// - Remplacer tous les dbPut('state') par saveAppStateToSupabase()
// - Ajouter JWT aux appels fetch('/api/llm')

// 4. Ajouter les nouveaux doLogin() / doRegister()
// - Utiliser supabase-client.js functions
```

**Ressource** : `MIGRATION_GUIDE.md` section 2.2-2.4 a le code exact.

---

### Étape 3️⃣ : Tester localement (1 heure)

```bash
# 1. Préparer .env.local
cp .env.example .env.local
# Éditer .env.local avec vos clés Supabase
nano .env.local

# 2. Lancer en local
vercel dev
# Ou: npm run dev

# 3. Tester le flux
# - http://localhost:3000
# - Créer un compte (Register)
# - Vérifier Supabase → app_state table (nouvelles données)
# - Se déconnecter et reconnecter
# - Vérifier que les données reviennent
# - Tester Settings → LLM
```

**Troubleshoot** : `MIGRATION_GUIDE.md` section 4

---

### Étape 4️⃣ : Déployer (5 minutes)

```bash
# 1. Ajouter les variables dans Vercel
# vercel.com → votre projet → Settings → Environment Variables

# Ajouter :
# SUPABASE_URL=
# SUPABASE_ANON_KEY=
# SUPABASE_JWT_SECRET=
# PRODUCTION_URL=https://votre-projet.vercel.app
# LLM_PROVIDER=openai
# LLM_API_KEY=sk-...

# 2. Committer et pousser
git add .
git commit -m "feat: migrate to Supabase + JWT security"
git push

# 3. Vercel redéploiera automatiquement
# → Attendre ~2 min
# → Vérifier: https://votre-projet.vercel.app

# 4. Tester en production
# - Créer compte
# - Vérifier Supabase table
# - Tester LLM
```

---

## 📚 Documentation Complète

| Document | Durée | Contenu |
|----------|-------|---------|
| **README.md** | 10 min | Vue d'ensemble + déploiement |
| **MIGRATION_GUIDE.md** | 30 min | Guide détaillé, code exact, troubleshoot |
| **CHANGES_SUMMARY.md** | 15 min | Ce qui a changé, checklist |
| **supabase-client.js** | 5 min | Fonctions disponibles (liste) |
| **vercel.json** | 5 min | Configuration Vercel |

---

## 🔍 Fichiers Clés Modifiés

| Fichier | Type | Changement |
|---------|------|-----------|
| `api/llm.py` | ✏️ Modifié | +JWT, +validation, +CORS |
| `.gitignore` | ✏️ Modifié | +env vars, +temp files |
| `vercel.json` | ✏️ Modifié | +headers, +build script |
| `README.md` | ✏️ Modifié | Multi-user instructions |
| `supabase/migrations/001_init_schema.sql` | ➕ Nouveau | Schéma BD + RLS |
| `public/supabase-client.js` | ➕ Nouveau | Client Supabase |
| `public/env-config.js` | ➕ Nouveau | Config environnement |
| `scripts/build-env-config.js` | ➕ Nouveau | Build script |
| `.env.example` | ➕ Nouveau | Template variables |
| `MIGRATION_GUIDE.md` | ➕ Nouveau | Guide complet |
| `CHANGES_SUMMARY.md` | ➕ Nouveau | Résumé changements |

**À MODIFIER** (par vous) :
| Fichier | Type | Changement |
|---------|------|-----------|
| `public/app.js` | ✏️ Manuel | Remplacer auth + IndexedDB |
| `public/index.html` | ✏️ Manuel | Ajouter 3 scripts Supabase |

---

## 🎓 Coût/Bénéfice

### Coûts
- **Temps** : 6-8h (une seule fois)
- **Argent** : Gratuit (plan Supabase gratuit suffisant)
- **Complexité** : Modérée (mais guide détaillé fourni)

### Bénéfices
- ✅ Multi-user sans limite
- ✅ Multi-device (laptop, phone, etc.)
- ✅ Synchronisation automatique
- ✅ Backup de données
- ✅ Authentification professionnelle (bcrypt, JWT)
- ✅ Sécurité (RLS, validation, JWT)
- ✅ Scaling automatique (Supabase)

---

## ❓ Questions Fréquentes

**Q: Est-ce que je dois refaire l'UI ?**
R: Non, l'UI reste identique. Seulement la couche de données change (IndexedDB → Supabase).

**Q: Et mes données actuelles IndexedDB ?**
R: Elles seront perdues. Vous pouvez les exporter manuellement avant migration si critiques. Les utilisateurs se ré-enregistreront.

**Q: Combo Supabase gratuit est suffisant ?**
R: Oui pour :
- 5 utilisateurs concurrent max
- 500 MB storage
- 2 GB bandwidth/mois
Pour plus, upgrade à $25/mois.

**Q: Combien de temps ça prend vraiment ?**
R: Pour un dev expérimenté : 4-6h
Pour un junior : 8-12h
Avec ce guide : -2h car tout est préparé

**Q: Et si je veux rollback ?**
R: `git revert <commit>` et vos données restent dans Supabase (non supprimées).

---

## ⚡ Next Steps

1. **Lire** `MIGRATION_GUIDE.md` (phase 1 + 2)
2. **Créer** un projet Supabase
3. **Modifier** `app.js` (utiliser le guide comme template)
4. **Tester** localement
5. **Déployer** sur Vercel

**Total estimé** : 6-8 heures d'une seule traite, ou 2-3 jours par sessions de 2-3h.

**Bon courage !** 🚀
