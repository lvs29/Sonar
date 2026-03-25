from flask import Blueprint, redirect, request
import requests
import base64
import urllib.parse

auth_bp = Blueprint("auth", __name__)

CLIENT_ID = "9d409b3ee05b4fc4943b4b6d1fedab06"
CLIENT_SECRET = "3949d122aa7940db92e1b25f1cc0a2a6"
REDIRECT_URI = "http://127.0.0.1:8000/auth/callback"


@auth_bp.route("/login")
def login():
    scope = "playlist-read-private playlist-read-collaborative"

    params = {
        "client_id": CLIENT_ID,
        "response_type": "code",
        "redirect_uri": REDIRECT_URI,
        "scope": scope
    }

    url = "https://accounts.spotify.com/authorize?" + urllib.parse.urlencode(params)
    return redirect(url)


@auth_bp.route("/callback")
def callback():
    code = request.args.get("code")

    auth_str = f"{CLIENT_ID}:{CLIENT_SECRET}"
    b64_auth = base64.b64encode(auth_str.encode()).decode()

    response = requests.post(
        "https://accounts.spotify.com/api/token",
        headers={
            "Authorization": f"Basic {b64_auth}",
            "Content-Type": "application/x-www-form-urlencoded"
        },
        data={
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": REDIRECT_URI
        }
    )

    data = response.json()

    from utils.token_manager import save_token
    save_token(data)

    return "Login OK"