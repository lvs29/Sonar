import time
import json
import os
import base64
import requests
from config import load_config

cfg = load_config()

TOKEN_FILE = "models/spotify_token.json"
CLIENT_ID = cfg["client_id"]
CLIENT_SECRET = cfg["client_secret"]

# =========================
# storage
# =========================

def load_tokens():
    if not os.path.exists(TOKEN_FILE):
        return {}

    with open(TOKEN_FILE, "r") as f:
        return json.load(f)


def save_tokens(data):
    with open(TOKEN_FILE, "w") as f:
        json.dump(data, f, indent=2)


# =========================
# salvar novo login
# =========================

def save_token(token_data):
    now = int(time.time())
    existing = load_tokens()  # carrega o token atual

    data = {
        "access_token":  token_data["access_token"],
        "refresh_token": token_data.get("refresh_token") or existing.get("refresh_token"),  # mantém o antigo se não vier novo
        "expires_at":    now + token_data["expires_in"] - 60
    }

    with open(TOKEN_FILE, "w") as f:
        json.dump(data, f, indent=2)

# =========================
# refresh
# =========================

def refresh_token(refresh_token):
    auth_str = f"{CLIENT_ID}:{CLIENT_SECRET}"
    b64_auth = base64.b64encode(auth_str.encode()).decode()

    response = requests.post(
        "https://accounts.spotify.com/api/token",
        headers={
            "Authorization": f"Basic {b64_auth}",
            "Content-Type": "application/x-www-form-urlencoded"
        },
        data={
            "grant_type": "refresh_token",
            "refresh_token": refresh_token
        }
    )

    response.raise_for_status()
    new_data = response.json()

    save_token(new_data)

    return new_data["access_token"]


# =========================
# get token (principal)
# =========================

def get_token():
    if not os.path.exists(TOKEN_FILE):
        raise Exception("Not authenticated")

    with open(TOKEN_FILE) as f:
        data = json.load(f)

    now = int(time.time())

    if now >= data["expires_at"]:
        return refresh_token(data["refresh_token"])


    return data["access_token"]