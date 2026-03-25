# app.py
from flask import Flask
from routes.auth import auth_bp
from routes.playlists import playlists_bp
from routes.library import library_bp
from routes.media import media_bp
from routes.ui import ui_bp
from models import init_db
from services.downloader import start_worker
from config import load_config

def create_app():
    app = Flask(__name__)
    app.config["SECRET_KEY"] = "dev"

    init_db()
    start_worker()  # <- inicia o worker em background

    app.register_blueprint(auth_bp,     url_prefix="/auth")
    app.register_blueprint(playlists_bp, url_prefix="/playlists")
    app.register_blueprint(library_bp,  url_prefix="/library")
    app.register_blueprint(media_bp, url_prefix="/media")
    app.register_blueprint(ui_bp)

    return app

if __name__ == "__main__":
    cfg = load_config()
    app = create_app()
    app.run(host=cfg["host"], port=cfg["port"])