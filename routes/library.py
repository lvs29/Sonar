# routes/library.py
from flask import Blueprint, jsonify, request, Response, stream_with_context, abort
from services.library import (
    get_orphan_tracks,
    delete_orphan_tracks,
    get_playlist_tracks_from_db,
    set_track_playlists,
    find_orphan_files,
    delete_orphan_files,
)
from services.downloader import enqueue_playlist, get_queue_status, set_youtube_url, add_youtube_track
import json
import os
import requests
import time as time_module
from datetime import datetime, timezone
from models import Session, Playlist, Track, PlaylistTrack, DownloadJob
from config import load_config, save_config

library_bp = Blueprint("library", __name__)

# ── helper interno ────────────────────────────────────────────────────────────
 
def _track_dict(t):
    return {
        "id":          t.id,
        "title":       t.title,
        "artist":      t.artist,
        "album":       t.album,
        "duration_ms": t.duration_ms,
        "downloaded":  t.downloaded,
        "play_count":  t.play_count or 0,
        "last_played": t.last_played.isoformat() if t.last_played else None,
    }
 
def _playlist_dict(p):
    return {
        "id":          p.id,
        "name":        p.name,
        "description": p.description or "",
        "last_opened": p.last_opened.isoformat() if p.last_opened else None,
    }

@library_bp.route("/playlist", methods=["POST"])
def create_playlist():
    data = request.get_json()
    name = data.get("name", "").strip()
    if not name:
        return jsonify({"error": "nome obrigatório"}), 400
    session = Session()
    try:
        playlist = Playlist(
            id          = str(__import__("uuid").uuid4()),
            name        = name,
            description = data.get("description", ""),
        )
        session.add(playlist)
        session.commit()
        return jsonify({"status": "ok", "id": playlist.id, "name": playlist.name})
    except Exception as e:
        session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()

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


@library_bp.route("/orphan-files")
def orphan_files():
    """Verifica arquivos órfãos no sistema de arquivos"""
    result = find_orphan_files()
    return jsonify(result)


@library_bp.route("/orphan-files/", methods=["DELETE"])
def delete_orphan_files_endpoint():
    """Deleta arquivos órfãos do sistema de arquivos"""
    result = delete_orphan_files()
    return jsonify(result)

@library_bp.route("/download/<playlist_id>", methods=["POST"])
def download_playlist(playlist_id):
    result = enqueue_playlist(playlist_id)
    return jsonify(result), 202

@library_bp.route("/track/<id>/set-url", methods=["POST"])
def set_track_url(id):
    data = request.get_json()
    youtube_url = data.get("youtube_url")
    if not youtube_url:
        return jsonify({"error": "youtube_url é obrigatório"}), 400
    try:
        from services.downloader import set_youtube_url
        result = set_youtube_url(id, youtube_url)
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
                    .join(Track, DownloadJob.track_id == Track.id)\
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
            "id":          p.id,
            "name":        p.name,
            "description": p.description or "",
            "last_opened": p.last_opened.isoformat() if p.last_opened else None,
        } for p in playlists])
    finally:
        session.close()

@library_bp.route("/failed")
def list_failed():
    session = Session()
    try:
        results = session.query(DownloadJob, Track)\
            .join(Track, DownloadJob.track_id == Track.id)\
            .filter(DownloadJob.status == "failed")\
            .all()
        return jsonify([{
            "id": t.id,
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
    from config import PLAYLIST_COVERS_DIR
    from models import Cover
    import os
    session = Session()
    try:
        pl = session.get(Playlist, playlist_id)
        if not pl:
            abort(404)

        # cover via hash
        if pl.cover_hash:
            cover = session.get(Cover, pl.cover_hash)
            if cover:
                full = os.path.join(PLAYLIST_COVERS_DIR, cover.path)
                if os.path.exists(full):
                    with open(full, "rb") as f:
                        return Response(f.read(), mimetype="image/jpeg")

        # placeholder SVG com iniciais
        initials = "".join(w[0].upper() for w in pl.name.split()[:2]) or "?"
        svg = f'''<svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
            <rect width="200" height="200" fill="#1a1a1a"/>
            <text x="100" y="115" font-family="system-ui" font-size="72"
                  font-weight="700" fill="#f5a623" text-anchor="middle">{initials}</text>
        </svg>'''
        return Response(svg, mimetype="image/svg+xml")
    finally:
        session.close()

@library_bp.route("/playlist/<playlist_id>/cover", methods=["POST"])
def upload_playlist_cover(playlist_id):
    from services.library import save_playlist_cover_deduplicated
    import os

    session = Session()
    try:
        pl = session.get(Playlist, playlist_id)
        if not pl:
            return jsonify({"error": "não encontrada"}), 404

        # via URL - baixa imagem localmente
        if request.is_json:
            url = request.get_json().get("cover_url", "").strip()
            if not url:
                return jsonify({"error": "url obrigatória"}), 400

            # baixa a imagem
            try:
                import requests as req
                r = req.get(url, timeout=10)
                if r.status_code != 200:
                    return jsonify({"error": "falha ao baixar imagem"}), 400

                # converte pra jpg se necessário
                try:
                    from PIL import Image
                    import io
                    img = Image.open(io.BytesIO(r.content)).convert("RGB")
                    import io as io2
                    buffer = io2.BytesIO()
                    img.save(buffer, format="JPEG", quality=90)
                    image_data = buffer.getvalue()
                except ImportError:
                    # sem PIL, usa direto
                    image_data = r.content

                pl.cover_hash = save_playlist_cover_deduplicated(image_data, ".jpg")
                session.commit()
                return jsonify({"status": "ok"})
            except Exception as e:
                return jsonify({"error": f"falha ao baixar imagem: {str(e)}"}), 400

        # via upload
        if "file" not in request.files:
            return jsonify({"error": "arquivo obrigatório"}), 400

        file = request.files["file"]
        if not file.filename.lower().endswith((".jpg", ".jpeg", ".png", ".webp")):
            return jsonify({"error": "formato não suportado"}), 400

        # converte pra jpg se necessário
        try:
            from PIL import Image
            img = Image.open(file.stream).convert("RGB")
            import io
            buffer = io.BytesIO()
            img.save(buffer, format="JPEG", quality=90)
            image_data = buffer.getvalue()
        except ImportError:
            image_data = file.read()

        pl.cover_hash = save_playlist_cover_deduplicated(image_data, ".jpg")
        session.commit()
        return jsonify({"status": "ok"})

    except Exception as e:
        session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()

@library_bp.route("/track/<id>/status")
def track_status(id):
    session = Session()
    try:
        track = session.get(Track, id)
        if not track:
            return jsonify({"error": "não encontrada"}), 404

        job = session.query(DownloadJob)\
            .filter_by(track_id=id)\
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
            "id":  pl.id,
            "name":        pl.name,
            "description": pl.description or "",
        })
    finally:
        session.close()


@library_bp.route("/playlist/<playlist_id>/meta", methods=["PUT"])
def update_playlist_meta(playlist_id):
    data = request.get_json()
    name = data.get("name")
    description = data.get("description")
    session = Session()
    try:
        pl = session.get(Playlist, playlist_id)
        if not pl:
            return jsonify({"error": "não encontrada"}), 404
        if name is not None:
            pl.name = name
        if description is not None:
            pl.description = description
        session.commit()
        return jsonify({"status": "ok"})
    except Exception as e:
        session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()


@library_bp.route("/playlist/<playlist_id>/reorder", methods=["POST"])
def reorder_playlist_tracks(playlist_id):
    data = request.get_json()
    track_ids = data.get("track_ids", [])

    if not track_ids:
        return jsonify({"error": "track_ids não pode estar vazio"}), 400

    session = Session()
    try:
        # Deleta todas as associações existentes
        session.query(PlaylistTrack).filter_by(playlist_id=playlist_id).delete()

        # Recria com as novas posições
        for idx, track_id in enumerate(track_ids):
            session.add(PlaylistTrack(
                playlist_id=playlist_id,
                track_id=track_id,
                position=idx + 1
            ))

        session.commit()
        return jsonify({"status": "ok"})
    except Exception as e:
        session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()

@library_bp.route("/playlist/<playlist_id>", methods=["DELETE"])
def delete_playlist(playlist_id):
    from models import Cover
    from config import PLAYLIST_COVERS_DIR
    session = Session()
    try:
        # remove os vínculos playlist_tracks
        session.query(PlaylistTrack).filter_by(playlist_id=playlist_id).delete()
        # remove a playlist
        playlist = session.get(Playlist, playlist_id)
        if not playlist:
            return jsonify({"error": "não encontrada"}), 404
        name = playlist.name

        # Deleta cover se não for compartilhado
        if playlist.cover_hash:
            cover = session.get(Cover, playlist.cover_hash)
            if cover:
                # Verifica se outras playlists ou tracks usam este cover
                other_playlists = session.query(Playlist).filter(
                    Playlist.cover_hash == playlist.cover_hash,
                    Playlist.id != playlist_id
                ).count()
                other_tracks = session.query(Track).filter(
                    Track.cover_hash == playlist.cover_hash
                ).count()
                if other_playlists == 0 and other_tracks == 0:
                    full = os.path.join(PLAYLIST_COVERS_DIR, cover.path)
                    if os.path.exists(full):
                        os.remove(full)
                    session.delete(cover)

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
        ).order_by(Track.title).limit(50).all()
        return jsonify([{
            "id":  t.id,
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
            .join(PlaylistTrack, Track.id == PlaylistTrack.track_id)\
            .distinct(Track.id)\
            .order_by(Track.title)\
            .all()
        return jsonify([{
            "id":  t.id,
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

@library_bp.route("/track/<id>", methods=["PATCH"])
def update_track(id):
    data    = request.get_json()
    allowed = {"title", "artist", "album", "description"}
    session = Session()
    try:
        track = session.get(Track, id)
        if not track:
            return jsonify({"error": "não encontrada"}), 404
        for key in allowed:
            if key in data:
                setattr(track, key, data[key])
        session.commit()
        return jsonify({"status": "ok"})
    except Exception as e:
        session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()

@library_bp.route("/track/<id>/cover", methods=["POST"])
def upload_track_cover(id):
    from services.library import save_cover_deduplicated
    import os
    session = Session()
    try:
        track = session.get(Track, id)
        if not track:
            return jsonify({"error": "não encontrada"}), 404

        # via URL - baixa imagem localmente
        data = request.get_json(silent=True) or {}
        if not data and request.data:
            try:
                data = json.loads(request.data.decode("utf-8"))
            except Exception:
                data = {}

        url = (data.get("cover_url") or "").strip()
        if url:
            # baixa a imagem
            try:
                import requests as req
                r = req.get(url, timeout=10)
                if r.status_code != 200:
                    return jsonify({"error": "falha ao baixar imagem"}), 400

                # converte pra jpg se necessário
                try:
                    from PIL import Image
                    import io
                    img = Image.open(io.BytesIO(r.content)).convert("RGB")
                    import io as io2
                    buffer = io2.BytesIO()
                    img.save(buffer, format="JPEG", quality=90)
                    image_data = buffer.getvalue()
                except ImportError:
                    # sem PIL, usa direto
                    image_data = r.content

                track.cover_hash = save_cover_deduplicated(image_data, ".jpg")
                session.commit()
                return jsonify({"status": "ok"})
            except Exception as e:
                return jsonify({"error": f"falha ao baixar imagem: {str(e)}"}), 400

        # via upload
        if "file" not in request.files:
            return jsonify({"error": "url obrigatória"}), 400

        file = request.files["file"]

        # converte pra jpg se necessário
        try:
            from PIL import Image
            img = Image.open(file.stream).convert("RGB")
            import io
            buffer = io.BytesIO()
            img.save(buffer, format="JPEG", quality=90)
            image_data = buffer.getvalue()
        except ImportError:
            image_data = file.read()

        track.cover_hash = save_cover_deduplicated(image_data, ".jpg")
        session.commit()
        return jsonify({"status": "ok"})

    except Exception as e:
        session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()

@library_bp.route("/track/<id>", methods=["DELETE"])
def delete_track(id):
    with_files = request.args.get("files", "false").lower() == "true"
    from models import Cover
    from config import MUSIC_DIR, COVERS_DIR
    session = Session()
    try:
        track = session.get(Track, id)
        if not track:
            return jsonify({"error": "não encontrada"}), 404

        if with_files:
            # Deleta arquivo MP3
            if track.mp3_path:
                full = os.path.join(MUSIC_DIR, track.mp3_path)
                if os.path.exists(full):
                    os.remove(full)

            # Deleta cover se não for compartilhado
            if track.cover_hash:
                cover = session.get(Cover, track.cover_hash)
                if cover:
                    # Verifica se outras tracks usam este cover
                    other_tracks = session.query(Track).filter(
                        Track.cover_hash == track.cover_hash,
                        Track.id != track.id
                    ).count()
                    # Verifica se playlists usam este cover
                    other_playlists = session.query(Playlist).filter(
                        Playlist.cover_hash == track.cover_hash
                    ).count()
                    if other_tracks == 0 and other_playlists == 0:
                        full = os.path.join(COVERS_DIR, cover.path)
                        if os.path.exists(full):
                            os.remove(full)
                        session.delete(cover)

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
    allowed = {"host", "port"}
    cfg = load_config()
    for key in allowed:
        if key in data:
            cfg[key] = data[key]
    save_config(cfg)
    return jsonify({"status": "ok"})

@library_bp.route("/track/<id>/played", methods=["POST"])
def track_played(id):
    data      = request.get_json() or {}
    completed = data.get("completed", False)
    session   = Session()
    try:
        track = session.get(Track, id)
        if not track:
            return jsonify({"error": "não encontrada"}), 404
        track.play_count  = (track.play_count or 0) + 1
        track.last_played = datetime.utcnow()          # <- atualiza
        if completed:
            track.complete_count = (track.complete_count or 0) + 1
        session.commit()
        return jsonify({"status": "ok"})
    except Exception as e:
        session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()

@library_bp.route("/youtube/search")
def youtube_search():
    from config import get as cfg_get
    q       = request.args.get("q", "").strip()
    is_url  = q.startswith("http")

    if not q:
        return jsonify([])

    try:
        import subprocess
        if is_url:
            cmd = [
                "yt-dlp",
                "--print", "%(id)s\t%(title)s\t%(uploader)s\t%(duration)s\t%(thumbnail)s",
                "--no-playlist",
                "--quiet",
                q,
            ]
        else:
            cmd = [
                "yt-dlp",
                "--print", "%(id)s\t%(title)s\t%(uploader)s\t%(duration)s\t%(thumbnail)s",
                "--playlist-end", "5",  # <- reduz de 8 pra 5
                "--no-playlist",
                "--quiet",
                "--no-warnings",
                "--extractor-args", "youtube:skip=dash,hls",  # <- pula formatos desnecessários
                f"ytsearch5:{q}",  # <- reduz de 8 pra 5
            ]

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=15)  # <- reduz timeout
        results = []
        for line in result.stdout.strip().splitlines():
            parts = line.split("\t")
            if len(parts) < 5:
                continue
            vid_id, title, uploader, duration, thumbnail = parts[:5]
            try:
                dur = int(float(duration))
            except ValueError:
                dur = 0
            results.append({
                "youtube_id":  vid_id,
                "youtube_url": f"https://www.youtube.com/watch?v={vid_id}",
                "title":       title,
                "artist":      uploader,
                "duration_ms": dur * 1000,
                "thumbnail":   thumbnail,
            })
        return jsonify(results)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@library_bp.route("/track/add-youtube", methods=["POST"])
def add_youtube_track_route():
    data         = request.get_json()
    youtube_url  = data.get("youtube_url", "").strip()
    playlist_ids = data.get("playlist_ids", [])
    meta         = {
        "title":       data.get("title"),
        "artist":      data.get("artist"),
        "duration_ms": data.get("duration_ms"),
        "album":       data.get("album", ""),
    }
    if not youtube_url:
        return jsonify({"error": "youtube_url obrigatório"}), 400
    try:
        result = add_youtube_track(youtube_url, playlist_ids, meta)
        return jsonify(result)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@library_bp.route("/spotify/search", methods=["POST"])
def search_spotify():
    """
    Etapa 1: recebe URL do Spotify e retorna preview com metadados.
    """
    from services.spotify_helper import get_spotify_metadata
    
    data = request.get_json()
    spotify_url = data.get("spotify_url", "").strip()
    
    if not spotify_url:
        return jsonify({"error": "spotify_url obrigatória"}), 400
    
    try:
        result = get_spotify_metadata(spotify_url)
        return jsonify(result)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 400

@library_bp.route("/track/add-spotify", methods=["POST"])
def add_spotify_track_route():
    """
    Etapa 2: recebe dados do Spotify, busca no YouTube, cria track real e enfileira.
    """
    from services.spotify_helper import confirm_spotify_track
    
    data = request.get_json()
    playlist_ids = data.pop("playlist_ids", [])
    
    try:
        result = confirm_spotify_track(data, playlist_ids)
        return jsonify(result)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@library_bp.route("/track/upload", methods=["POST"])
def upload_track():
    from services.downloader import add_local_track
    if "file" not in request.files:
        return jsonify({"error": "arquivo obrigatório"}), 400
    file = request.files["file"]
    if not file.filename.lower().endswith((".mp3", ".flac", ".ogg", ".m4a")):
        return jsonify({"error": "formato não suportado"}), 400
    try:
        result = add_local_track(file)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@library_bp.route("/track/confirm-upload", methods=["POST"])
def confirm_upload():
    from services.downloader import confirm_local_track
    data         = request.get_json()
    playlist_ids = data.pop("playlist_ids", [])
    try:
        result = confirm_local_track(data, playlist_ids)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@library_bp.route("/tracks/artists")
def autocomplete_artists():
    q = request.args.get("q", "").strip()
    session = Session()
    try:
        results = session.query(Track.artist)\
            .filter(Track.artist.ilike(f"%{q}%"))\
            .distinct()\
            .order_by(Track.artist)\
            .limit(8).all()
        return jsonify([r[0] for r in results if r[0]])
    finally:
        session.close()

@library_bp.route("/tracks/albums")
def autocomplete_albums():
    q = request.args.get("q", "").strip()
    session = Session()
    try:
        results = session.query(Track.album)\
            .filter(Track.album.ilike(f"%{q}%"))\
            .distinct()\
            .order_by(Track.album)\
            .limit(8).all()
        return jsonify([r[0] for r in results if r[0]])
    finally:
        session.close()

@library_bp.route("/track/<id>/playlists")
def get_track_playlists(id):
    session = Session()
    try:
        rows = session.query(PlaylistTrack.playlist_id)\
            .filter_by(track_id=id).all()
        return jsonify([r[0] for r in rows])
    finally:
        session.close()

@library_bp.route("/track/<id>/playlists", methods=["POST"])
def set_track_playlists_route(id):
    data = request.get_json()
    playlist_ids = data.get("playlist_ids", [])
    try:
        result = set_track_playlists(id, playlist_ids)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@library_bp.route("/track/<id>/replace-file", methods=["POST"])
def replace_track_file(id):
    from config import MUSIC_DIR, COVERS_DIR
    from services.downloader import _extract_cover
    import os
    session = Session()
    try:
        track = session.get(Track, id)
        if not track:
            return jsonify({"error": "não encontrada"}), 404

        file = request.files.get("file")
        if not file:
            return jsonify({"error": "arquivo obrigatório"}), 400

        ext      = os.path.splitext(file.filename)[1].lower()
        dst_name = f"{id}{ext}"
        dst_path = os.path.join(MUSIC_DIR, dst_name)

        # remove arquivo antigo se existir
        if track.mp3_path:
            old = os.path.join(MUSIC_DIR, track.mp3_path)
            if os.path.exists(old):
                os.remove(old)

        file.save(dst_path)

        # tenta extrair capa com deduplicação
        cover = _extract_cover(dst_path, id, COVERS_DIR)
        if cover:
            from services.library import save_cover_deduplicated
            full_cover_path = os.path.join(COVERS_DIR, cover)
            if os.path.exists(full_cover_path):
                with open(full_cover_path, "rb") as f:
                    track.cover_hash = save_cover_deduplicated(f.read(), ".jpg")
                os.remove(full_cover_path)

        track.mp3_path   = dst_name
        track.downloaded = True
        session.commit()
        return jsonify({"status": "ok"})
    except Exception as e:
        session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()

@library_bp.route("/spotify/cover", methods=["GET"])
def spotify_cover():
    import re
    import urllib.request

    url = request.args.get("url", "").strip()
    if not url:
        return jsonify({"error": "url obrigatória"}), 400

    match = re.search(r"spotify\.com/track/([A-Za-z0-9]+)", url)
    if not match:
        return jsonify({"error": "link inválido"}), 400

    track_id = match.group(1)

    try:
        req = urllib.request.Request(
            f"https://open.spotify.com/embed/track/{track_id}",
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
                "Accept-Language": "en-US,en;q=0.9",
            }
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            html = resp.read().decode("utf-8")

        m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.DOTALL)
        if not m:
            raise ValueError("estrutura da página não reconhecida")

        entity = json.loads(m.group(1))["props"]["pageProps"]["state"]["data"]["entity"]
        images = entity.get("visualIdentity", {}).get("image", [])
        if not images:
            return jsonify({"error": "capa não encontrada"}), 404

        cover_url = max(images, key=lambda x: x.get("maxWidth") or x.get("maxHeight") or 0).get("url", "")
        return jsonify({"cover_url": cover_url})

    except Exception as e:
        return jsonify({"error": str(e)}), 502

@library_bp.route("/tracks/recent")
def tracks_recent():
    """50 músicas tocadas mais recentemente (last_played desc)."""
    session = Session()
    try:
        tracks = session.query(Track)\
            .filter(Track.downloaded == True, Track.last_played.isnot(None))\
            .order_by(Track.last_played.desc())\
            .limit(50).all()
        return jsonify([_track_dict(t) for t in tracks])
    finally:
        session.close()
 
 
@library_bp.route("/tracks/top")
def tracks_top():
    """50 músicas com mais plays."""
    session = Session()
    try:
        tracks = session.query(Track)\
            .filter(Track.downloaded == True, Track.play_count > 0)\
            .order_by(Track.play_count.desc())\
            .limit(50).all()
        return jsonify([_track_dict(t) for t in tracks])
    finally:
        session.close()
 
 
@library_bp.route("/playlists/recent")
def playlists_recent():
    """playlists tocadas mais recentemente (last_opened desc)."""
    session = Session()
    try:
        playlists = session.query(Playlist)\
            .filter(Playlist.last_opened.isnot(None))\
            .order_by(Playlist.last_opened.desc())\
            .all()
        return jsonify([_playlist_dict(p) for p in playlists])
    finally:
        session.close()

@library_bp.route("/playlist/<playlist_id>/played", methods=["POST"])
def playlist_played(playlist_id):
    session = Session()
    try:
        pl = session.get(Playlist, playlist_id)
        if not pl:
            return jsonify({"error": "não encontrada"}), 404
        pl.last_opened = datetime.utcnow()
        session.commit()
        return jsonify({"status": "ok"})
    except Exception as e:
        session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()