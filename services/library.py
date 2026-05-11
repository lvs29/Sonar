# services/library.py
import os
from datetime import datetime, timezone
from models import Session, Track, Playlist, PlaylistTrack
from config import PLAYLIST_COVERS_DIR

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MUSIC_DIR = os.path.join(BASE_DIR, "media", "music")
COVERS_DIR = os.path.join(BASE_DIR, "media", "covers")

os.makedirs(MUSIC_DIR, exist_ok=True)
os.makedirs(COVERS_DIR, exist_ok=True)
os.makedirs(PLAYLIST_COVERS_DIR, exist_ok=True)

def get_orphan_tracks() -> list:
    session = Session()
    try:
        linked_ids = session.query(PlaylistTrack.track_id).distinct()
        orphans = session.query(Track).filter(
            ~Track.id.in_(linked_ids)
        ).all()
        return [
            {
                "id":         t.id,
                "title":      t.title,
                "artist":     t.artist,
                "mp3_path":   t.mp3_path,
                "downloaded": t.downloaded,
                "play_count": t.play_count or 0,
            }
            for t in orphans
        ]
    finally:
        session.close()


def delete_orphan_tracks(delete_files: bool = False) -> dict:
    session = Session()
    try:
        linked_ids = session.query(PlaylistTrack.track_id).distinct()
        orphans = session.query(Track).filter(
            ~Track.id.in_(linked_ids)
        ).all()

        deleted = 0
        files_deleted = 0
        for track in orphans:
            if delete_files:
                for path in [track.mp3_path, track.cover_path]:
                    if path:
                        full_path = os.path.join(
                            MUSIC_DIR if path.endswith((".mp3", ".flac", ".ogg", ".m4a")) else COVERS_DIR,
                            path
                        ) if not os.path.isabs(path) else path
                        if os.path.exists(full_path):
                            os.remove(full_path)
                            files_deleted += 1
            session.delete(track)
            deleted += 1

        session.commit()
        return {"deleted_tracks": deleted, "deleted_files": files_deleted}
    except Exception as e:
        session.rollback()
        raise e
    finally:
        session.close()


def get_playlist_tracks_from_db(playlist_id: str) -> list:
    session = Session()
    
    try:
        results = (
            session.query(Track, PlaylistTrack.position)
            .join(PlaylistTrack, Track.id == PlaylistTrack.track_id)
            .filter(PlaylistTrack.playlist_id == playlist_id)
            .order_by(PlaylistTrack.position)
            .all()
        )
        return [
            {
                "position":    pos,
                "id":          t.id,
                "type":        t.type,
                "title":       t.title,
                "artist":      t.artist,
                "album":       t.album,
                "duration_ms": t.duration_ms,
                "cover_path":  t.cover_path,
                "mp3_path":    t.mp3_path,
                "downloaded":  t.downloaded,
                "play_count":  t.play_count or 0,
            }
            for t, pos in results
        ]
    finally:
        session.close()


def set_track_playlists(track_id: str, playlist_ids: list) -> dict:
    from sqlalchemy import func
    session = Session()
    try:
        session.query(PlaylistTrack).filter_by(track_id=track_id).delete()

        for pl_id in playlist_ids:
            pl = session.get(Playlist, pl_id)
            if not pl:
                continue
            max_pos = session.query(func.max(PlaylistTrack.position))\
                .filter_by(playlist_id=pl_id).scalar() or 0
            session.add(PlaylistTrack(
                playlist_id=pl_id,
                track_id=track_id,
                position=max_pos + 1,
            ))

        session.commit()
        return {"status": "ok"}
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
