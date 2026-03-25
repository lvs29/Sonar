# routes/library.py
from flask import Blueprint, jsonify, request, Response, stream_with_context
from services.library import (
    sync_playlist,
    get_orphan_tracks,
    delete_orphan_tracks,
    get_playlist_tracks_from_db,
)
from services.downloader import enqueue_playlist, get_queue_status, set_youtube_url
import json
import os
import time as time_module
from models import Session, Playlist, Track, PlaylistTrack, DownloadJob
from config import load_config, save_config

library_bp = Blueprint("library", __name__)


@library_bp.route("/sync/<playlist_id>", methods=["POST"])
def sync(playlist_id):
    result = sync_playlist(playlist_id)
    return jsonify(result)


@library_bp.route("/playlist/<playlist_id>")
def playlist_tracks(playlist_id):
    tracks = get_playlist_tracks_from_db(playlist_id)
    return jsonify(tracks)


@library_bp.route("/orphans")
def orphans():
    return jsonify(get_orphan_tracks())


@library_bp.route("/orphans/delete", methods=["DELETE"])
def delete_orphans():
    delete_files = request.args.get("files", "false").lower() == "true"
    result = delete_orphan_tracks(delete_files=delete_files)
    return jsonify(result)

@library_bp.route("/download/<playlist_id>", methods=["POST"])
def download_playlist(playlist_id):
    result = enqueue_playlist(playlist_id)
    return jsonify(result), 202

@library_bp.route("/track/<spotify_id>/set-url", methods=["POST"])
def set_track_url(spotify_id):
    data = request.get_json()
    youtube_url = data.get("youtube_url")
    if not youtube_url:
        return jsonify({"error": "youtube_url é obrigatório"}), 400
    try:
        from services.downloader import set_youtube_url
        result = set_youtube_url(spotify_id, youtube_url)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@library_bp.route("/queue")
def queue_status():
    return jsonify(get_queue_status())

@library_bp.route("/queue/stream")
def queue_stream():
    """SSE endpoint — empurra status da fila em tempo real."""
    def event_stream():
        last = None
        while True:
            from services.downloader import get_queue_status
            from models import Session as S, DownloadJob, Track

            status = get_queue_status()

            # pega a track sendo baixada agora
            session = S()
            try:
                current = session.query(DownloadJob, Track)\
                    .join(Track, DownloadJob.track_id == Track.spotify_id)\
                    .filter(DownloadJob.status == "downloading")\
                    .first()
                current_track = None
                if current:
                    job, track = current
                    current_track = {"title": track.title, "artist": track.artist}
            finally:
                session.close()

            payload = {**status, "current": current_track}

            if payload != last:
                yield f"data: {json.dumps(payload)}\n\n"
                last = payload

            time_module.sleep(1)

    return Response(
        stream_with_context(event_stream()),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        }
    )

@library_bp.route("/playlists")
def list_playlists():
    session = Session()
    try:
        playlists = session.query(Playlist).all()
        return jsonify([{
            "spotify_id":   p.spotify_id,
            "name":         p.name,
            "description":  p.description or "",
            "last_synced":  p.last_synced.isoformat() if p.last_synced else None,
        } for p in playlists])
    finally:
        session.close()

@library_bp.route("/failed")
def list_failed():
    session = Session()
    try:
        results = session.query(DownloadJob, Track)\
            .join(Track, DownloadJob.track_id == Track.spotify_id)\
            .filter(DownloadJob.status == "failed")\
            .all()
        return jsonify([{
            "spotify_id": t.spotify_id,
            "title": t.title,
            "artist": t.artist,
            "error_msg": j.error_msg,
            "play_count": t.play_count or 0,
        } for j, t in results])
    finally:
        session.close()

@library_bp.route("/failed/retry", methods=["POST"])
def retry_failed():
    session = Session()
    try:
        jobs = session.query(DownloadJob).filter_by(status="failed").all()
        for job in jobs:
            job.status = "pending"
            job.error_msg = None
        session.commit()
        return jsonify({"requeued": len(jobs)})
    finally:
        session.close()

@library_bp.route("/playlist/<playlist_id>/cover")
def playlist_cover(playlist_id):
    import requests as req
    session = Session()
    try:
        pl = session.get(Playlist, playlist_id)
        if not pl or not pl.cover_url:
            abort(404)
        r = req.get(pl.cover_url, timeout=10)
        if r.status_code != 200:
            abort(404)
        from flask import Response
        return Response(r.content, mimetype="image/jpeg")
    finally:
        session.close()

@library_bp.route("/playlist/<playlist_id>/preview")
def playlist_preview(playlist_id):
    try:
        from utils.token_manager import get_token
        import requests as req
        token = get_token()
        r = req.get(
            f"https://api.spotify.com/v1/playlists/{playlist_id}",
            headers={"Authorization": f"Bearer {token}"},
            params={"fields": "id,name,images,owner.display_name,tracks.total", "market": "BR"}
        )
        r.raise_for_status()
        data = r.json()
        return jsonify({
            "id":           data["id"],
            "name":         data["name"],
            "owner":        data["owner"]["display_name"],
            "total_tracks": data.get("tracks", {}).get("total", 0),
            "cover_url":    data["images"][0]["url"] if data.get("images") else None,
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@library_bp.route("/track/<spotify_id>/status")
def track_status(spotify_id):
    session = Session()
    try:
        track = session.get(Track, spotify_id)
        if not track:
            return jsonify({"error": "não encontrada"}), 404

        job = session.query(DownloadJob)\
            .filter_by(track_id=spotify_id)\
            .order_by(DownloadJob.id.desc())\
            .first()

        return jsonify({
            "downloaded": track.downloaded,
            "failed":     job.status == "failed" if job else False,
            "status":     job.status if job else None,
        })
    finally:
        session.close()

# routes/library.py
@library_bp.route("/playlist/<playlist_id>/meta")
def playlist_meta(playlist_id):
    session = Session()
    try:
        pl = session.get(Playlist, playlist_id)
        if not pl:
            abort(404)
        return jsonify({
            "spotify_id":  pl.spotify_id,
            "name":        pl.name,
            "description": pl.description or "",
            "last_synced": pl.last_synced.isoformat() if pl.last_synced else None,
        })
    finally:
        session.close()

@library_bp.route("/playlist/<playlist_id>", methods=["DELETE"])
def delete_playlist(playlist_id):
    session = Session()
    try:
        # remove os vínculos playlist_tracks
        session.query(PlaylistTrack).filter_by(playlist_id=playlist_id).delete()
        # remove a playlist
        playlist = session.get(Playlist, playlist_id)
        if not playlist:
            return jsonify({"error": "não encontrada"}), 404
        name = playlist.name
        session.delete(playlist)
        session.commit()
        return jsonify({"status": "ok", "name": name})
    except Exception as e:
        session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()

@library_bp.route("/tracks/search")
def search_tracks():
    q = request.args.get("q", "").strip()
    if not q:
        return jsonify([])
    session = Session()
    try:
        results = session.query(Track).filter(
            (Track.title.ilike(f"%{q}%")) |
            (Track.artist.ilike(f"%{q}%")) |
            (Track.album.ilike(f"%{q}%"))
        ).limit(50).all()
        return jsonify([{
            "spotify_id":  t.spotify_id,
            "title":       t.title,
            "artist":      t.artist,
            "album":       t.album,
            "duration_ms": t.duration_ms,
            "downloaded":  t.downloaded,
            "youtube_url": t.youtube_url,
            "play_count": t.play_count or 0,
        } for t in results])
    finally:
        session.close()

@library_bp.route("/tracks/all")
def all_tracks():
    session = Session()
    try:
        results = session.query(Track)\
            .join(PlaylistTrack, Track.spotify_id == PlaylistTrack.track_id)\
            .distinct(Track.spotify_id)\
            .order_by(Track.title)\
            .all()
        return jsonify([{
            "spotify_id":  t.spotify_id,
            "title":       t.title,
            "artist":      t.artist,
            "album":       t.album,
            "duration_ms": t.duration_ms,
            "downloaded":  t.downloaded,
            "youtube_url": t.youtube_url,
            "play_count": t.play_count or 0,
        } for t in results])
    finally:
        session.close()

@library_bp.route("/track/<spotify_id>", methods=["DELETE"])
def delete_track(spotify_id):
    with_files = request.args.get("files", "false").lower() == "true"
    session = Session()
    try:
        track = session.get(Track, spotify_id)
        if not track:
            return jsonify({"error": "não encontrada"}), 404

        if with_files:
            for path in [track.mp3_path, track.cover_path]:
                if path:
                    full = os.path.join(
                        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                        "media", "music" if path.endswith(".mp3") else "covers",
                        path
                    ) if not os.path.isabs(path) else path
                    if os.path.exists(full):
                        os.remove(full)

        session.delete(track)
        session.commit()
        return jsonify({"status": "ok"})
    except Exception as e:
        session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()

@library_bp.route("/config", methods=["GET"])
def get_config():
    return jsonify(load_config())

@library_bp.route("/config", methods=["POST"])
def update_config():
    data = request.get_json()
    allowed = {"host", "port", "yt_dlp_browser", "client_id", "client_secret"}
    cfg = load_config()
    for key in allowed:
        if key in data:
            cfg[key] = data[key]
    save_config(cfg)
    return jsonify({"status": "ok"})

@library_bp.route("/track/<spotify_id>/played", methods=["POST"])
def track_played(spotify_id):
    data      = request.get_json() or {}
    completed = data.get("completed", False)
    session   = Session()
    try:
        track = session.get(Track, spotify_id)
        if not track:
            return jsonify({"error": "não encontrada"}), 404

        if completed:
            # Música chegou ao final - incrementa apenas complete_count
            track.complete_count = (track.complete_count or 0) + 1
        else:
            # Música começou a tocar - incrementa apenas play_count
            track.play_count = (track.play_count or 0) + 1

        session.commit()
        return jsonify({"play_count": track.play_count, "complete_count": track.complete_count})
    finally:
        session.close()
