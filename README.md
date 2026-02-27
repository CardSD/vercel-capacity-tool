# Capacity & Stakeholder Tool — Déploiement Vercel

Outil de gestion de capacité et de parties prenantes pour Product Designers. Frontend statique avec proxy LLM serverless.

---

## Architecture

```
vercel-capacity-tool/
├── api/
│   └── llm.py          # Fonction serverless Python — proxy LLM
├── public/
│   ├── index.html      # Application principale
│   ├── app.js          # Logique client (IndexedDB)
│   ├── style.css       # Styles
│   └── ical.min.js     # Bibliothèque iCal
├── vercel.json         # Configuration Vercel
├── requirements.txt    # Dépendances Python (stdlib uniquement)
└── README.md
```

**Stockage des données :** IndexedDB côté client (aucune donnée transmise au serveur, sauf les appels LLM).

**Proxy LLM :** La fonction `api/llm.py` reçoit les requêtes du frontend, utilise la clé API stockée dans les variables d'environnement Vercel, puis interroge OpenAI / Anthropic / endpoint personnalisé. La clé API n'est jamais exposée dans le navigateur.

---

## Prérequis

- Compte [Vercel](https://vercel.com) (gratuit)
- Compte [GitHub](https://github.com) (recommandé pour le déploiement continu)
- Python 3.9+ (géré automatiquement par Vercel)

---

## Déploiement — étape par étape

### 1. Préparer le dépôt GitHub

```bash
# Initialiser un dépôt Git dans ce dossier
git init
git add .
git commit -m "Initial commit — Capacity Tool"

# Créer un dépôt sur GitHub puis pousser
git remote add origin https://github.com/VOTRE_UTILISATEUR/capacity-tool.git
git push -u origin main
```

### 2. Importer le projet dans Vercel

1. Connectez-vous sur [vercel.com](https://vercel.com)
2. Cliquez sur **"Add New Project"**
3. Sélectionnez votre dépôt GitHub `capacity-tool`
4. Vercel détecte automatiquement la configuration via `vercel.json`
5. Cliquez sur **"Deploy"**

> Le premier déploiement prend environ 1 à 2 minutes.

### 3. Configurer les variables d'environnement (optionnel mais recommandé)

Dans Vercel → votre projet → **Settings → Environment Variables** :

| Variable          | Description                                        | Exemple                                      |
|-------------------|----------------------------------------------------|----------------------------------------------|
| `LLM_PROVIDER`    | Fournisseur LLM (`openai`, `anthropic`, `custom`)  | `openai`                                     |
| `LLM_API_KEY`     | Clé API du fournisseur LLM                         | `sk-...`                                     |
| `LLM_CUSTOM_URL`  | URL endpoint (uniquement si `LLM_PROVIDER=custom`) | `https://api.example.com/v1/chat/completions`|

> **Sans variable d'environnement**, l'outil fonctionne toujours : l'utilisateur peut saisir sa clé API directement dans l'interface (stockée dans IndexedDB du navigateur). Avec les variables Vercel, aucune clé n'est jamais visible dans le navigateur.

Après avoir ajouté les variables, cliquez sur **"Redeploy"** pour les appliquer.

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

- Les données utilisateur (équipes, produits, entrées de capacité) restent **uniquement dans IndexedDB du navigateur** de l'utilisateur.
- Seules les requêtes de classification LLM transitent par le serveur (le contenu des événements de calendrier).
- Les clés API LLM configurées dans Vercel ne sont **jamais** transmises au client.
- La clé API optionnellement saisie par l'utilisateur est stockée dans IndexedDB (chiffrée par le navigateur) et transmise chiffrée en HTTPS au proxy.

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
