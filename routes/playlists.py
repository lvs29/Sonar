from flask import Blueprint, jsonify
from services.spotify import get_playlist_tracks

playlists_bp = Blueprint("playlists", __name__)

@playlists_bp.route("/<playlist_id>")
def get_playlist(playlist_id):
    tracks = get_playlist_tracks(playlist_id)
    return jsonify(tracks)