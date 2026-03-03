# Capacity & Stakeholder Tool — Multi-User Edition

Outil de gestion de capacité et de parties prenantes pour Product Designers.
Frontend statique avec **Supabase PostgreSQL** + authentification multi-device + proxy LLM sécurisé.

---

## Architecture

```
vercel-capacity-tool/
├── api/
│   └── llm.py                    # Proxy LLM serverless (avec vérification JWT)
├── public/
│   ├── index.html                # Application SPA
│   ├── app.js                    # Logique client (4500+ lignes)
│   ├── supabase-client.js        # Client Supabase + auth
│   ├── env-config.js             # Configuration environnement
│   ├── style.css                 # Styles + thèmes
│   ├── ical.min.js               # Bibliothèque iCalendar
│   └── themes/                   # Thèmes disponibles
├── supabase/
│   └── migrations/
│       └── 001_init_schema.sql   # Schéma PostgreSQL + RLS
├── scripts/
│   └── build-env-config.js       # Script de build Vercel
├── vercel.json                   # Configuration Vercel
├── .env.example                  # Variables d'environnement (template)
├── requirements.txt              # Dépendances Python (stdlib only)
├── MIGRATION_GUIDE.md            # Guide complet de migration
└── README.md                     # Ce fichier
```

**Stockage des données :** PostgreSQL Supabase avec Row Level Security (RLS) — chaque utilisateur ne voit que ses propres données.

**Authentification :** Supabase Auth (bcrypt, JWT, multi-device, gestion de session).

**Proxy LLM :** La fonction `api/llm.py` vérifie le JWT Supabase, valide les entrées, puis interroge OpenAI/Anthropic/endpoint personnalisé. La clé API n'est jamais exposée au client.

---

## Prérequis

- Compte [Supabase](https://supabase.com) (gratuit)
- Compte [Vercel](https://vercel.com) (gratuit)
- Compte [GitHub](https://github.com) (recommandé pour le déploiement continu)
- Python 3.9+ (géré automatiquement par Vercel)

---

## Déploiement — étape par étape

### ⚠️ IMPORTANT : Migration de l'ancienne version

Si vous aviez une version antérieure sans Supabase, consultez **`MIGRATION_GUIDE.md`** pour migrer vos données.

### 1. Créer un projet Supabase

1. Aller à [supabase.com](https://supabase.com)
2. Créer un nouveau projet
3. Région : choisir la plus proche
4. Attendre que le projet soit prêt (~2-3 min)

### 2. Initialiser la base de données

1. Ouvrir le fichier `supabase/migrations/001_init_schema.sql`
2. Copier son intégralité
3. Aller à Supabase → SQL Editor → Create a new query
4. Coller et exécuter ✓

### 3. Copier les clés Supabase

1. Aller à Supabase → Settings → API
2. Copier :
   - `Project URL` → `SUPABASE_URL`
   - `anon public` → `SUPABASE_ANON_KEY`
   - `service_role secret` → garder pour plus tard (serveur seulement)

3. Aller à Supabase → Settings → JWT Settings
   - Copier `JWT Secret` → `SUPABASE_JWT_SECRET`

### 4. Préparer le dépôt GitHub

```bash
# Initialiser ou mettre à jour le dépôt Git
git init
git add .
git commit -m "feat: multi-user with Supabase auth + PostgreSQL"

# Créer un dépôt sur GitHub puis pousser
git remote add origin https://github.com/VOTRE_UTILISATEUR/capacity-tool.git
git push -u origin main
```

### 5. Déployer sur Vercel

1. Aller à [vercel.com](https://vercel.com)
2. Cliquer sur **"Add New Project"**
3. Sélectionner votre dépôt GitHub `capacity-tool`
4. ⚠️ **NE PAS déployer tout de suite** — configurer les variables d'abord

### 6. Configurer les variables d'environnement Vercel

Dans Vercel → votre projet → **Settings → Environment Variables**, ajouter :

| Variable | Valeur | Notes |
|---|---|---|
| `SUPABASE_URL` | votre-URL-supabase | Depuis Supabase Settings → API |
| `SUPABASE_ANON_KEY` | votre-clé-anon | Depuis Supabase Settings → API |
| `SUPABASE_JWT_SECRET` | votre-jwt-secret | ⚠️ **SENSIBLE** — jamais en local |
| `LLM_PROVIDER` | `openai` ou `anthropic` | (optionnel) |
| `LLM_API_KEY` | `sk-...` | (optionnel) — clé API OpenAI/Anthropic |
| `PRODUCTION_URL` | `https://votre-projet.vercel.app` | Pour CORS |

> **Laisser vides** `LLM_CUSTOM_URL` et `VERCEL_URL` (auto-générées).

Après avoir ajouté les variables, cliquer sur **"Deploy"** pour déployer.

> Le premier déploiement prend 2-3 minutes.

---

## Mise à jour du site

Tout push sur la branche `main` déclenche un nouveau déploiement automatique via Vercel.

```bash
# Modifier des fichiers, puis :
git add .
git commit -m "Mise à jour de l'outil"
git push
```

Vercel redéploie en moins de 60 secondes.

---

## Déploiement sans GitHub (CLI Vercel)

```bash
# Installer la CLI Vercel
npm install -g vercel

# Se connecter
vercel login

# Déployer depuis ce dossier
vercel --prod
```

---

## Fonctionnement du proxy LLM

Le fichier `api/llm.py` expose un endpoint à `/api/llm` qui accepte trois actions :

### `config` — Vérifier la configuration serveur
```json
{ "action": "config" }
```
Réponse :
```json
{ "has_env_key": true, "provider": "openai" }
```

### `test` — Tester la connexion LLM
```json
{ "action": "test", "provider": "openai", "api_key": "sk-...", "custom_url": "" }
```
Réponse en cas de succès :
```json
{ "ok": true }
```

### `proxy` — Envoyer une requête LLM
```json
{
  "action": "proxy",
  "provider": "openai",
  "api_key": "",
  "custom_url": "",
  "system_prompt": "Tu es un assistant...",
  "messages": [{ "role": "user", "content": "..." }],
  "temperature": 0.1,
  "max_tokens": 2000
}
```
Réponse :
```json
{ "content": "Texte généré par le LLM" }
```

**Priorité de la clé API :** Si `api_key` est vide dans la requête, le proxy utilise `LLM_API_KEY` depuis les variables d'environnement Vercel.

---

## Fournisseurs LLM supportés

| Fournisseur  | `LLM_PROVIDER` | Modèle utilisé          |
|--------------|----------------|-------------------------|
| OpenAI       | `openai`       | `gpt-4o-mini`           |
| Anthropic    | `anthropic`    | `claude-3-5-haiku-20241022` |
| Personnalisé | `custom`       | Selon l'endpoint fourni |

---

## Sécurité

### Authentification & Sessions
- **Supabase Auth** : authentification bcrypt + sessions JWT sécurisées
- **Multi-device** : l'utilisateur peut accéder depuis plusieurs appareils/navigateurs
- **Pas de stockage de mot de passe** : géré par Supabase (bcrypt + 2FA optionnelle)

### Données
- **Row Level Security (RLS)** : chaque utilisateur ne peut lire que ses propres données
- Données stockées dans **PostgreSQL Supabase** (chiffré en transit HTTPS, at rest)
- **Pas de données dans les logs** : aucune exposition accidentelle

### API LLM
- **JWT obligatoire** : `/api/llm` rejette toute requête sans JWT Supabase valide
- **CORS restreint** : uniquement vers l'URL de production Vercel
- **Validation stricte** : messages, max_tokens, temperature, custom_url validés côté serveur
- **Anti-SSRF** : custom_url doit être dans une whitelist de domaines
- **Clé API serveur** : jamais transmise au client, stockée dans Vercel uniquement
- **Timeout** : 25 secondes max pour les appels LLM

### Headers de Sécurité
- `X-Frame-Options: DENY` — protection contre clickjacking
- `X-Content-Type-Options: nosniff` — prévention de sniffing MIME
- `Content-Security-Policy` — contrôle strict des ressources
- `Referrer-Policy: strict-origin-when-cross-origin` — confidentialité du référent

---

## Dépannage

### Le LLM ne fonctionne pas après déploiement

1. Vérifiez que `LLM_API_KEY` est bien définie dans Vercel → Settings → Environment Variables
2. Assurez-vous d'avoir redéployé après avoir ajouté les variables
3. Ouvrez la console du navigateur (F12) pour voir les erreurs détaillées

### Erreur 500 sur `/api/llm`

- Vérifiez les logs dans Vercel → votre projet → **Functions → llm**
- Assurez-vous que `LLM_PROVIDER` est `openai`, `anthropic`, ou `custom`

### La clé API saisie dans l'interface ne fonctionne pas

- L'outil teste d'abord le proxy serveur, puis bascule sur un appel direct si le proxy n'est pas disponible
- Vérifiez que la clé API est valide chez le fournisseur LLM

---

## Développement local

```bash
# Installer la CLI Vercel
npm install -g vercel

# Lancer en local (émule les fonctions serverless)
vercel dev
```

L'application sera accessible sur `http://localhost:3000`.

Pour les variables d'environnement en local, créez un fichier `.env.local` :
```
LLM_PROVIDER=openai
LLM_API_KEY=sk-...
```

---

## Licence

Usage interne — outil personnel de capacity planning.
