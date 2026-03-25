import os
import json
import subprocess
import threading
import time
from datetime import datetime, timezone, timedelta
from config import get as cfg_get
from models import Session, Track, DownloadJob
from config import MUSIC_DIR, COVERS_DIR

_worker_started = False
_lock = threading.Lock()


# =========================
# público
# =========================

def start_worker():
    global _worker_started
    with _lock:
        if _worker_started:
            return
        _reset_stuck_jobs()

        def startup_sync():
            from services.library import sync_all_playlists
            print("[startup] sincronizando playlists...", flush=True)
            sync_all_playlists()
            print("[startup] sync concluído", flush=True)

        threading.Thread(target=startup_sync, daemon=True).start()

        t = threading.Thread(target=_worker_loop, daemon=True)
        t.start()
        _worker_started = True
        print("[worker] iniciado", flush=True)



def enqueue_playlist(playlist_id: str) -> dict:
    """Enfileira tracks não baixadas de uma playlist. Reaproveita jobs failed."""
    from models import PlaylistTrack
    session = Session()
    try:
        tracks = (
            session.query(Track)
            .join(PlaylistTrack, Track.spotify_id == PlaylistTrack.track_id)
            .filter(PlaylistTrack.playlist_id == playlist_id)
            .filter(Track.downloaded == False)
            .all()
        )

        enqueued = 0
        requeued = 0

        for track in tracks:
            # se já tem failed, reseta
            failed = session.query(DownloadJob).filter_by(
                track_id=track.spotify_id, status="failed"
            ).first()
            if failed:
                failed.status    = "pending"
                failed.error_msg = None
                requeued += 1
                continue

            # se já tem pending, ignora
            already = session.query(DownloadJob).filter_by(
                track_id=track.spotify_id, status="pending"
            ).first()
            if not already:
                session.add(DownloadJob(track_id=track.spotify_id))
                enqueued += 1

        session.commit()
        return {"enqueued": enqueued, "requeued": requeued, "total": len(tracks)}
    finally:
        session.close()


def get_queue_status() -> dict:
    from sqlalchemy import func
    session = Session()
    try:
        rows = session.query(DownloadJob.status, func.count()).group_by(DownloadJob.status).all()
        return {status: count for status, count in rows}
    finally:
        session.close()


def set_youtube_url(spotify_id: str, youtube_url: str) -> dict:
    """
    Salva a URL do YouTube na track e cria um job pending.
    O worker vai baixar usando essa URL diretamente.
    """
    import re
    match = re.search(r"(?:v=|youtu\.be/)([a-zA-Z0-9_-]{11})", youtube_url)
    video_id = match.group(1) if match else None

    session = Session()
    try:
        track = session.get(Track, spotify_id)
        if not track:
            raise Exception(f"track {spotify_id} não encontrada")

        track.youtube_id  = video_id
        track.youtube_url = youtube_url
        track.downloaded  = False

        # cancela jobs anteriores
        session.query(DownloadJob).filter(
            DownloadJob.track_id == spotify_id,
            DownloadJob.status.in_(["pending", "failed"])
        ).delete()

        session.add(DownloadJob(track_id=spotify_id, status="pending"))
        session.commit()

        return {"status": "ok", "title": track.title}
    except Exception as e:
        session.rollback()
        raise e
    finally:
        session.close()


# =========================
# privado
# =========================

def _reset_stuck_jobs():
    session = Session()
    try:
        stuck = session.query(DownloadJob).filter_by(status="downloading").all()
        for job in stuck:
            job.status = "pending"
        session.commit()
        if stuck:
            print(f"[worker] {len(stuck)} jobs resetados", flush=True)
    finally:
        session.close()


def _worker_loop():
    while True:
        try:
            session = Session()
            job = session.query(DownloadJob).filter_by(status="pending").first()

            if not job:
                # checa failed elegíveis pra retry (máx 3, intervalo 10min)
                cutoff = datetime.utcnow() - timedelta(minutes=10)
                job = session.query(DownloadJob).filter(
                    DownloadJob.status == "failed",
                    DownloadJob.retry_count < 3,
                    DownloadJob.finished_at <= cutoff
                ).first()
                if job:
                    job.status = "pending"
                    session.commit()

            if job:
                job_id = job.id
                session.close()
                _download_track(job_id)
            else:
                session.close()
                time.sleep(5)

        except Exception as e:
            print(f"[worker] erro no loop: {e}", flush=True)
            try:
                session.close()
            except Exception:
                pass
            time.sleep(5)


def _find_best_match(track: Track) -> dict:
    """Busca os 5 melhores resultados no YouTube e retorna o mais próximo pela duração."""
    if track.type == "episode":
        query = f"ytsearch5:{track.title} {track.artist} podcast"
    else:
        query = f"ytsearch5:{track.title} {track.artist}"

    browser = cfg_get("yt_dlp_browser")
    cmd = [
        "yt-dlp",
        "--cookies-from-browser", browser,
        "--print", "%(id)s\t%(title)s\t%(duration)s",
        "--playlist-end", "5",
        "--no-playlist",
        "--quiet",
        query,
    ]

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    if result.returncode != 0:
        raise Exception(f"busca falhou: {result.stderr.strip()}")

    candidates = []
    for line in result.stdout.strip().splitlines():
        if not line:
            continue
        parts = line.split("\t")
        if len(parts) < 3:
            continue
        vid_id = parts[0].strip()
        dur_str = parts[-1].strip()
        try:
            duration = float(dur_str)
        except ValueError:
            duration = 0
        candidates.append({
            "id":       vid_id,
            "url":      f"https://www.youtube.com/watch?v={vid_id}",
            "duration": duration,
        })

    if not candidates:
        raise Exception("nenhum resultado encontrado no YouTube")

    spotify_s = (track.duration_ms or 0) / 1000
    return min(candidates, key=lambda c: abs(c["duration"] - spotify_s))


def _download_track(job_id: int):
    # abre sessão nova sempre — garante dados frescos do banco
    session = Session()
    try:
        job = session.query(DownloadJob).filter_by(id=job_id).one()
        # expira todos os objetos pra forçar reload do banco
        session.expire_all()
        track = session.query(Track).filter_by(spotify_id=job.track_id).one()

        print(f"[worker] baixando: {track.title} — {track.artist}", flush=True)
        print(f"[worker] youtube_url salvo: {track.youtube_url}", flush=True)

        # limpa .part se existir
        part = os.path.join(MUSIC_DIR, f"{track.spotify_id}.part")
        if os.path.exists(part):
            os.remove(part)

        job.status = "downloading"
        session.commit()
        # expira novamente pra garantir que o track está atualizado
        session.expire(track)
        track = session.query(Track).filter_by(spotify_id=job.track_id).one()

        mp3_path   = f"{track.spotify_id}.mp3"
        cover_path = f"{track.spotify_id}.jpg"
        mp3_full   = os.path.join(MUSIC_DIR,  mp3_path)
        cover_full = os.path.join(COVERS_DIR, cover_path)

        # usa url salva se existir, senão busca
        if track.youtube_url:
            print(f"[worker] usando url salva: {track.youtube_url}", flush=True)
            match = {"id": track.youtube_id, "url": track.youtube_url}
        else:
            print(f"[worker] buscando no youtube...", flush=True)
            match = _find_best_match(track)

        print(f"[worker] url final: {match['url']}", flush=True)

        # deleta mp3 antigo
        if os.path.exists(mp3_full):
            os.remove(mp3_full)

        browser = cfg_get("yt_dlp_browser")
        cmd = [
            "yt-dlp",
            "--cookies-from-browser", browser,
            "--extract-audio",
            "--audio-format", "mp3",
            "--audio-quality", "0",
            "--force-overwrites",
            "--output", os.path.join(MUSIC_DIR, f"{track.spotify_id}.%(ext)s"),
            "--no-playlist",
            "--quiet",
            match["url"],
        ]

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)

        if result.returncode != 0:
            raise Exception(result.stderr.strip() or "yt-dlp falhou")

        if not os.path.exists(mp3_full):
            raise Exception("mp3 não foi criado")

        # baixa capa do spotify
        if track.cover_url:
            try:
                import requests as req
                img = req.get(track.cover_url, timeout=10)
                if img.status_code == 200:
                    with open(cover_full, "wb") as f:
                        f.write(img.content)
            except Exception:
                pass

        track.mp3_path    = mp3_path
        track.cover_path  = cover_path if os.path.exists(cover_full) else None
        track.downloaded  = True
        track.youtube_id  = match["id"]
        track.youtube_url = match["url"]

        job.status      = "done"
        job.finished_at = datetime.now(timezone.utc)

        print(f"[worker] concluído: {track.title}", flush=True)

    except subprocess.TimeoutExpired:
        job.status      = "failed"
        job.error_msg   = "timeout após 120s"
        job.retry_count += 1
        print(f"[worker] timeout: {job.track_id}", flush=True)
    except Exception as e:
        job.status      = "failed"
        job.error_msg   = str(e)
        job.retry_count += 1
        print(f"[worker] erro: {e}", flush=True)
    finally:
        session.commit()
        session.close()