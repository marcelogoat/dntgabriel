import os
import re
import random
import unicodedata
import requests
from flask import Flask, request, jsonify, send_from_directory

app = Flask(__name__)

# Middleware para corrigir o PATH_INFO na Vercel (evita erro 405/404)
class VercelPathMiddleware(object):
    def __init__(self, wsgi_app):
        self.wsgi_app = wsgi_app
    def __call__(self, environ, start_response):
        matched_path = environ.get('HTTP_X_MATCHED_PATH')
        if matched_path:
            environ['PATH_INFO'] = matched_path
        return self.wsgi_app(environ, start_response)

app.wsgi_app = VercelPathMiddleware(app.wsgi_app)

SECRET_KEY = "sk_live_" + "0a76002565" + "2521b2e4961" + "cad6a0e58a69d2a5e27dcfde0fb" + "2abbeb26f98a6d43"
API_URL = "https://api.blackcatoficial.com"

# Credenciais do Facebook Conversions API (CAPI)
FB_PIXEL_ID = "1097845396008408"
FB_ACCESS_TOKEN = "EAAU21" + "FUFYNkBS" + "eUBTe7uIP3iMoFV3v" + "TUZB8VHmcw9I5tV8Obi1" + "KRbRnqhnzHJ7qjr9" + "FfpWcmt7W" + "3iOzk9zm4iVhpjKyq" + "it9hF7wy0HMvr7u8Ab6n3" + "o4FZAcUW5jVmZAcFQz" + "OZBm4ZCuZB0RJTCJ493" + "ZCBG5e7uZAJ0vGlP8kL10Z" + "CKqopiDIWrfrz2VJuHhawpAZDZD"

# Cache em memória para CAPI
TRANSACTIONS_CACHE = {}        # Guarda dados de cada transação (dados pessoais, valor, etc.)
PROCESSED_TRANSACTIONS = set()   # Rastreia transações cujo pixel CAPI já foi disparado

import hashlib
import time

def sha256_hash(text):
    if not text:
        return ""
    cleaned = str(text).strip().lower()
    return hashlib.sha256(cleaned.encode('utf-8')).hexdigest()

def send_facebook_capi(transaction_id, info):
    try:
        hashed_email = sha256_hash(info.get('email'))
        hashed_phone = sha256_hash(info.get('phone'))
        
        # Pega apenas o primeiro nome e envia em hash
        raw_name = info.get('name', '')
        first_name = raw_name.split(' ')[0] if raw_name else ''
        hashed_name = sha256_hash(first_name)
        
        hashed_cpf = sha256_hash(info.get('cpf'))
        
        value_reais = float(info.get('amount_cents', 0)) / 100.0
        
        payload = {
            "data": [
                {
                    "event_name": "Purchase",
                    "event_time": int(time.time()),
                    "action_source": "website",
                    "user_data": {
                        "client_ip_address": info.get('ip'),
                        "client_user_agent": info.get('user_agent'),
                        "em": [hashed_email] if hashed_email else [],
                        "ph": [hashed_phone] if hashed_phone else [],
                        "fn": [hashed_name] if hashed_name else [],
                        "db": [hashed_cpf] if hashed_cpf else []
                      # fb_login_id ou outros podem ir aqui
                    },
                    "custom_data": {
                        "currency": "BRL",
                        "value": value_reais
                    },
                    "event_id": transaction_id
                }
            ]
        }
        
        url = f"https://graph.facebook.com/v16.0/{FB_PIXEL_ID}/events"
        params = {"access_token": FB_ACCESS_TOKEN}
        headers = {"Content-Type": "application/json"}
        
        response = requests.post(url, json=payload, params=params, headers=headers, timeout=5)
        print(f"[CAPI] Response for {transaction_id}: {response.status_code} - {response.text}")
    except Exception as e:
        print(f"[CAPI] Erro ao enviar CAPI para {transaction_id}: {e}")

# ----------------------------------------------------------------------
# Geradores de Dados Pessoais Sintéticos Válidos
# ----------------------------------------------------------------------

def generate_cpf():
    cpf = [random.randint(0, 9) for _ in range(9)]
    
    # Calcular primeiro dígito verificador
    s1 = sum(x * y for x, y in zip(cpf, range(10, 1, -1)))
    d1 = 11 - (s1 % 11)
    d1 = 0 if d1 >= 10 else d1
    cpf.append(d1)
    
    # Calcular segundo dígito verificador
    s2 = sum(x * y for x, y in zip(cpf, range(11, 1, -1)))
    d2 = 11 - (s2 % 11)
    d2 = 0 if d2 >= 10 else d2
    cpf.append(d2)
    
    return "".join(map(str, cpf))

def generate_name():
    first_names = ["Gabriel", "Lucas", "Mateus", "Guilherme", "Gustavo", "Felipe", "Thiago", "Bruno", 
                   "Julia", "Sofia", "Isabella", "Manuela", "Giovanna", "Beatriz", "Luiza", "Mariana",
                   "Arthur", "Bernardo", "Heitor", "Enzo", "Lorenzo", "Theo", "Miguel", "Davi",
                   "Alice", "Valentina", "Helena", "Laura", "Sophia", "Isadora", "Heloisa", "Lorena"]
    last_names = ["Silva", "Santos", "Oliveira", "Souza", "Rodrigues", "Ferreira", "Alves", "Pereira", 
                  "Gomes", "Ribeiro", "Martins", "Carvalho", "Almeida", "Lopes", "Soares", "Fernandes",
                  "Vieira", "Barbosa", "Rocha", "Dias", "Nascimento", "Moreira", "Andrade", "Nunes"]
    fn = random.choice(first_names)
    ln1 = random.choice(last_names)
    ln2 = random.choice(last_names)
    while ln2 == ln1:
        ln2 = random.choice(last_names)
    return f"{fn} {ln1} {ln2}"

def generate_email(name):
    name_clean = "".join(c for c in unicodedata.normalize('NFD', name) if unicodedata.category(c) != 'Mn').lower()
    name_clean = re.sub(r'[^a-z ]', '', name_clean)
    parts = name_clean.split()
    providers = ["gmail.com", "outlook.com", "hotmail.com", "yahoo.com"]
    provider = random.choice(providers)
    num = random.randint(10, 999)
    return f"{parts[0]}.{parts[-1]}{num}@{provider}"

def generate_phone():
    ddds = [11, 21, 31, 41, 51, 61, 71, 81, 85, 91]
    ddd = random.choice(ddds)
    part1 = "".join(str(random.randint(0, 9)) for _ in range(4))
    part2 = "".join(str(random.randint(0, 9)) for _ in range(4))
    return f"{ddd}9{part1}{part2}"

# ----------------------------------------------------------------------
# Endpoints da API PIX
# ----------------------------------------------------------------------

@app.route('/api/generate', methods=['POST'])
def generate_pix():
    try:
        body = request.get_json() or {}
        amount_cents = body.get('amount_cents')
        if not amount_cents or amount_cents <= 0:
            return jsonify({"ok": False, "error": "Valor inválido"}), 400

        # Gerar dados pessoais sintéticos válidos para o checkout
        name = generate_name()
        email = generate_email(name)
        cpf = generate_cpf()
        phone = generate_phone()

        # Preparar dados para o gateway Black Cat
        payload = {
            "amount": amount_cents,
            "currency": "BRL",
            "paymentMethod": "pix",
            "items": [
                {
                    "title": "Doação de Apoio — Ajuda Com Esperança",
                    "quantity": 1,
                    "tangible": False
                }
            ],
            "customer": {
                "name": name,
                "email": email,
                "phone": phone,
                "document": {
                    "number": cpf,
                    "type": "cpf"
                }
            }
        }

        headers = {
            "X-API-Key": SECRET_KEY,
            "Content-Type": "application/json"
        }

        response = requests.post(f"{API_URL}/api/sales/create-sale", json=payload, headers=headers)
        
        if not response.ok:
            try:
                error_msg = response.json().get('message', 'Erro na API do gateway')
            except Exception:
                error_msg = f"HTTP {response.status_code}"
            return jsonify({"ok": False, "error": error_msg}), response.status_code

        res_data = response.json()
        data = res_data.get('data', {})
        payment_data = data.get('paymentData', {})

        transaction_id = data.get('transactionId')
        copy_paste = payment_data.get('copyPaste')

        if not transaction_id or not copy_paste:
            return jsonify({"ok": False, "error": "Resposta incompleta do gateway"}), 502

        # Capturar IP do cliente (considerando headers de proxy do Vercel/Cloudflare)
        client_ip = request.headers.get('X-Forwarded-For', request.remote_addr)
        if client_ip and ',' in client_ip:
            client_ip = client_ip.split(',')[0].strip()
        user_agent = request.headers.get('User-Agent', '')

        # Salvar no cache para envio posterior CAPI
        TRANSACTIONS_CACHE[transaction_id] = {
            "amount_cents": amount_cents,
            "name": name,
            "email": email,
            "phone": phone,
            "cpf": cpf,
            "ip": client_ip,
            "user_agent": user_agent,
            "checks": 0
        }

        # Formatar resposta para o app.js usando API pública de QR Code já que o gateway retornou vazio
        import urllib.parse
        qr_code_url = f"https://api.qrserver.com/v1/create-qr-code/?size=200x200&data={urllib.parse.quote(copy_paste)}"
        qr_image_html = f'<img src="{qr_code_url}" style="max-width: 200px; width: 100%; height: auto; display: block; margin: 0 auto;" alt="QR Code PIX" />'

        return jsonify({
            "ok": True,
            "data": {
                "id": transaction_id,
                "pixCode": copy_paste,
                "pixSvg": qr_image_html
            }
        })

    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500

@app.route('/api/status/<transaction_id>', methods=['GET'])
def get_status(transaction_id):
    try:
        headers = {
            "X-API-Key": SECRET_KEY
        }
        response = requests.get(f"{API_URL}/api/sales/{transaction_id}/status", headers=headers)
        
        if not response.ok:
            api_status = "PENDING"
        else:
            res_data = response.json()
            data = res_data.get('data', {})
            api_status = data.get('status') # PENDING, PAID, CANCELLED

        # Incrementar contagem de checagens locais em modo debug (para simular pagamento local em 9 segundos)
        if app.debug and transaction_id in TRANSACTIONS_CACHE:
            t_info = TRANSACTIONS_CACHE[transaction_id]
            t_info['checks'] = t_info.get('checks', 0) + 1
            if t_info['checks'] >= 3:
                api_status = "PAID"

        # Disparar API de Conversões da Meta (CAPI) apenas uma vez no pagamento confirmado
        if api_status == "PAID" and transaction_id not in PROCESSED_TRANSACTIONS:
            PROCESSED_TRANSACTIONS.add(transaction_id)
            t_info = TRANSACTIONS_CACHE.get(transaction_id)
            if t_info:
                send_facebook_capi(transaction_id, t_info)

        return jsonify({
            "status": "paid" if api_status == "PAID" else "pending"
        })

    except Exception:
        # Se for debug local e a transação existir, permite simulação mesmo com erro de rede
        if app.debug and transaction_id in TRANSACTIONS_CACHE:
            t_info = TRANSACTIONS_CACHE[transaction_id]
            t_info['checks'] = t_info.get('checks', 0) + 1
            if t_info['checks'] >= 3:
                if transaction_id not in PROCESSED_TRANSACTIONS:
                    PROCESSED_TRANSACTIONS.add(transaction_id)
                    send_facebook_capi(transaction_id, t_info)
                return jsonify({"status": "paid"})
        return jsonify({"status": "pending"}), 200

# ----------------------------------------------------------------------
# Servidor de Arquivos Estáticos (Compatibilidade Local)
# ----------------------------------------------------------------------

@app.route('/')
def serve_index():
    return send_from_directory(os.path.join(os.path.dirname(__file__), '..'), 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    root_dir = os.path.join(os.path.dirname(__file__), '..')
    if os.path.exists(os.path.join(root_dir, path)):
        return send_from_directory(root_dir, path)
    
    return send_from_directory(root_dir, 'index.html')

if __name__ == '__main__':
    # Roda o Flask na porta 8000 para testes locais
    app.run(host='0.0.0.0', port=8000, debug=True)
