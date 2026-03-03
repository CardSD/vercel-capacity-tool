from http.server import BaseHTTPRequestHandler
import json
import os
import urllib.request
import urllib.error
from urllib.parse import urlparse

class handler(BaseHTTPRequestHandler):
    ALLOWED_LLM_HOSTS = {'api.openai.com', 'api.anthropic.com'}

    @classmethod
    def _allowed_origins(cls):
        """Build set of allowed origins (with https:// protocol)"""
        origins = set()
        for env_var in ('VERCEL_URL', 'PRODUCTION_URL'):
            val = os.environ.get(env_var, '')
            if val:
                if not val.startswith('http'):
                    val = 'https://' + val
                origins.add(val.rstrip('/'))
        return origins

    def get_cors_origin(self):
        """Retourner origin si autorisé, sinon null"""
        origin = self.headers.get('Origin', '')
        if origin and origin in self._allowed_origins():
            return origin
        return 'null'

    def verify_jwt(self):
        """Vérifier le token Supabase via Auth API — retourner user_id ou None"""
        auth_header = self.headers.get('Authorization', '')
        if not auth_header.startswith('Bearer '):
            return None

        token = auth_header[7:]
        supabase_url = os.environ.get('SUPABASE_URL', '')
        supabase_anon_key = os.environ.get('SUPABASE_ANON_KEY', '')

        if not supabase_url or not supabase_anon_key:
            return None

        try:
            req = urllib.request.Request(
                supabase_url + '/auth/v1/user',
                headers={
                    'Authorization': 'Bearer ' + token,
                    'apikey': supabase_anon_key,
                },
            )
            with urllib.request.urlopen(req, timeout=5) as resp:
                user_data = json.loads(resp.read().decode('utf-8'))
                return user_data.get('id')  # user_id
        except Exception:
            return None

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', self.get_cors_origin())
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.send_header('Vary', 'Origin')
        self.end_headers()

    def do_POST(self):
        try:
            # Vérifier l'authentification JWT
            user_id = self.verify_jwt()
            if not user_id:
                self._respond(401, {'error': 'Non authentifié — JWT manquant ou invalide'})
                return

            content_length = int(self.headers.get('Content-Length', 0))
            if content_length > 10_000:  # Limite de taille (10KB)
                self._respond(413, {'error': 'Requête trop grande'})
                return

            try:
                body = json.loads(self.rfile.read(content_length).decode())
            except json.JSONDecodeError:
                self._respond(400, {'error': 'JSON invalide'})
                return

            action = body.get('action', 'proxy')
            if action not in ['proxy', 'test', 'config']:
                self._respond(400, {'error': 'Action invalide'})
                return

            # Get API key from environment variable (NEVER from request body in multi-user)
            env_provider = os.environ.get('LLM_PROVIDER', '')
            env_api_key = os.environ.get('LLM_API_KEY', '')
            env_custom_url = os.environ.get('LLM_CUSTOM_URL', '')

            provider = body.get('provider', env_provider) or 'openai'
            api_key = env_api_key  # ← FORCE env var only (no request override in multi-user)
            custom_url = body.get('custom_url', '') or env_custom_url

            if action == 'config':
                self._respond(200, {
                    'has_env_key': bool(env_api_key),
                    'provider': provider,
                    'has_custom_url': bool(env_custom_url),
                })
                return

            if not api_key:
                self._respond(400, {
                    'error': "Aucune clé API configurée. Ajoutez LLM_API_KEY dans les variables d'environnement Vercel."
                })
                return

            # Valider les paramètres
            if action == 'test':
                messages = [{'role': 'user', 'content': 'Dis simplement "ok".'}]
                system_prompt = 'Tu es un assistant. Réponds en un mot.'
                max_tokens = 10
            else:
                messages = body.get('messages', [])
                system_prompt = body.get('system_prompt', '')
                max_tokens = body.get('max_tokens', 2000)

                # Validation messages
                if not isinstance(messages, list) or len(messages) == 0 or len(messages) > 50:
                    self._respond(400, {'error': 'messages: doit être un tableau non-vide (max 50)'})
                    return

                for msg in messages:
                    if not isinstance(msg, dict) or 'role' not in msg or 'content' not in msg:
                        self._respond(400, {'error': 'messages: format invalide, chaque élément doit avoir role et content'})
                        return
                    if msg['role'] not in ['user', 'assistant', 'system']:
                        self._respond(400, {'error': 'messages: role invalide'})
                        return

                # Validation max_tokens
                if not isinstance(max_tokens, int) or not (1 <= max_tokens <= 4096):
                    self._respond(400, {'error': 'max_tokens: doit être entre 1 et 4096'})
                    return

                # Validation system_prompt (longueur raisonnable)
                if not isinstance(system_prompt, str) or len(system_prompt) > 2000:
                    self._respond(400, {'error': 'system_prompt: doit être une chaîne (max 2000 chars)'})
                    return

            temperature = body.get('temperature', 0.1)
            if not isinstance(temperature, (int, float)) or not (0 <= temperature <= 2):
                self._respond(400, {'error': 'temperature: doit être entre 0 et 2'})
                return

            # Valider custom_url (anti-SSRF)
            if provider == 'custom' and custom_url:
                try:
                    parsed = urlparse(custom_url)
                    if parsed.scheme != 'https':
                        self._respond(400, {'error': 'custom_url: doit utiliser HTTPS'})
                        return
                    if parsed.netloc not in self.ALLOWED_LLM_HOSTS:
                        self._respond(400, {'error': 'custom_url: domaine non autorisé'})
                        return
                except Exception:
                    self._respond(400, {'error': 'custom_url: format invalide'})
                    return

            # Build request to LLM provider
            if provider == 'anthropic':
                req_body = {
                    'model': 'claude-3-5-haiku-20241022',
                    'max_tokens': max_tokens,
                    'system': system_prompt,
                    'messages': messages,
                }
                req_headers = {
                    'Content-Type': 'application/json',
                    'x-api-key': api_key,
                    'anthropic-version': '2023-06-01',
                }
                url = 'https://api.anthropic.com/v1/messages'
            else:
                full_messages = []
                if system_prompt:
                    full_messages.append({'role': 'system', 'content': system_prompt})
                full_messages.extend(messages)
                req_body = {
                    'model': 'gpt-4o-mini',
                    'messages': full_messages,
                    'temperature': temperature,
                    'max_tokens': max_tokens,
                }
                req_headers = {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + api_key,
                }
                url = custom_url if (provider == 'custom' and custom_url) else 'https://api.openai.com/v1/chat/completions'

            req_data = json.dumps(req_body).encode('utf-8')
            req = urllib.request.Request(url, data=req_data, headers=req_headers, method='POST')

            with urllib.request.urlopen(req, timeout=25) as resp:
                resp_body = json.loads(resp.read().decode('utf-8'))

            # Extract text content
            if provider == 'anthropic':
                content = resp_body.get('content', [{}])[0].get('text', '')
            else:
                content = resp_body.get('choices', [{}])[0].get('message', {}).get('content', '')

            self._respond(200, {'content': content, 'ok': True})

        except urllib.error.HTTPError as e:
            error_body = e.read().decode('utf-8', errors='replace')[:300]
            self._respond(502, {'error': 'Erreur LLM ({0}): {1}'.format(e.code, error_body)})
        except Exception as ex:
            self._respond(500, {'error': 'Erreur proxy: {0}'.format(str(ex))})

    def _respond(self, status, body):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', self.get_cors_origin())
        self.send_header('Vary', 'Origin')
        self.end_headers()
        self.wfile.write(json.dumps(body).encode())

    def log_message(self, format, *args):
        # Suppress default request logging
        pass
