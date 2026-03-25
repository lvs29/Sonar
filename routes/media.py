import os
from config import BASE_DIR, COVERS_DIR, MUSIC_DIR
from flask import Blueprint, send_file, abort
from models import Session, Track

media_bp = Blueprint("media", __name__)

@media_bp.route("/track/<spotify_id>/audio")
def serve_audio(spotify_id):
    session = Session()
    try:
        track = session.get(Track, spotify_id)
        if not track or not track.mp3_path:
            abort(404)
        full_path = os.path.join(MUSIC_DIR, track.mp3_path)
        if not os.path.exists(full_path):
            abort(404)
        return send_file(full_path, mimetype="audio/mpeg", conditional=True)
    finally:
        session.close()

@media_bp.route("/track/<spotify_id>/cover")
def serve_cover(spotify_id):
    session = Session()
    try:
        track = session.get(Track, spotify_id)
        if not track or not track.cover_path:
            abort(404)
        full_path = os.path.join(COVERS_DIR, track.cover_path)
        if not os.path.exists(full_path):
            abort(404)
        return send_file(full_path, mimetype="image/jpeg")
    finally:
        session.close()