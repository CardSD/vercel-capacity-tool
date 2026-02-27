from http.server import BaseHTTPRequestHandler
import json
import os
import urllib.request
import urllib.error


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()

    def do_POST(self):
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = json.loads(self.rfile.read(content_length).decode())

            action = body.get('action', 'proxy')  # 'proxy', 'test', 'config'

            # Get API key from environment variable OR from request (user-provided)
            # Priority: env var > request body
            env_provider = os.environ.get('LLM_PROVIDER', '')
            env_api_key = os.environ.get('LLM_API_KEY', '')
            env_custom_url = os.environ.get('LLM_CUSTOM_URL', '')

            # Allow user to override with their own key
            provider = body.get('provider', env_provider) or 'openai'
            api_key = body.get('api_key', '') or env_api_key
            custom_url = body.get('custom_url', '') or env_custom_url

            if action == 'config':
                # Return config status (never return the actual key)
                self._respond(200, {
                    'has_env_key': bool(env_api_key),
                    'provider': provider,
                    'has_custom_url': bool(env_custom_url),
                })
                return

            if not api_key:
                self._respond(400, {
                    'error': "Aucune clé API configurée. Ajoutez LLM_API_KEY dans les variables d'environnement Vercel, ou fournissez-la dans la requête."
                })
                return

            if action == 'test':
                messages = [{'role': 'user', 'content': 'Dis simplement "ok".'}]
                system_prompt = 'Tu es un assistant. Réponds en un mot.'
                max_tokens = 10
            else:
                messages = body.get('messages', [])
                system_prompt = body.get('system_prompt', '')
                max_tokens = body.get('max_tokens', 2000)

            temperature = body.get('temperature', 0.1)

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
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(body).encode())

    def log_message(self, format, *args):
        # Suppress default request logging
        pass
