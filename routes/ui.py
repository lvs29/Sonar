from flask import Blueprint, send_from_directory
import os

ui_bp = Blueprint("ui", __name__)
STATIC_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "static")

@ui_bp.route("/")
def index():
    return send_from_directory(STATIC_DIR, "index.html")

@ui_bp.route("/<path:path>")
def static_files(path):
    return send_from_directory(STATIC_DIR, path)