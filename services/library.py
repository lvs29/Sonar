# services/library.py
import os
from datetime import datetime, timezone
from models import Session, Track, Playlist, PlaylistTrack
from services.spotify import get_all_playlist_tracks, get_playlist_meta

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MUSIC_DIR = os.path.join(BASE_DIR, "media", "music")
COVERS_DIR = os.path.join(BASE_DIR, "media", "covers")

os.makedirs(MUSIC_DIR, exist_ok=True)
os.makedirs(COVERS_DIR, exist_ok=True)


def sync_playlist(playlist_id: str) -> dict:
    session = Session()
    try:
        meta = get_playlist_meta(playlist_id)
        playlist = session.get(Playlist, playlist_id)

        if playlist and playlist.snapshot_id == meta["snapshot_id"]:
            return {"status": "up_to_date", "playlist": playlist.name}

        if not playlist:
            playlist = Playlist(spotify_id=playlist_id)
            session.add(playlist)

        playlist.name        = meta["name"]
        playlist.description = meta.get("description", "")
        playlist.cover_url   = meta.get("cover_url")
        playlist.snapshot_id = meta["snapshot_id"]
        playlist.last_synced = datetime.now(timezone.utc)

        spotify_tracks = get_all_playlist_tracks(playlist_id)
        spotify_ids    = {t["spotify_id"] for t in spotify_tracks}

        existing = session.query(PlaylistTrack).filter_by(playlist_id=playlist_id).all()
        removed = 0
        for pt in existing:
            if pt.track_id not in spotify_ids:
                session.delete(pt)
                removed += 1

        added = 0
        for position, t in enumerate(spotify_tracks):
            track = session.get(Track, t["spotify_id"])
            if not track:
                track = Track(
                    spotify_id  = t["spotify_id"],
                    type        = t.get("type", "track"),
                    title       = t["title"],
                    artist      = t["artist"],
                    album       = t["album"],
                    duration_ms = t["duration_ms"],
                    cover_url   = t["cover"],
                )
                session.add(track)
                added += 1

            pt = session.get(PlaylistTrack, (playlist_id, t["spotify_id"]))
            if not pt:
                pt = PlaylistTrack(
                    playlist_id = playlist_id,
                    track_id    = t["spotify_id"],
                    added_at    = datetime.now(timezone.utc),
                )
                session.add(pt)
            pt.position = position

        session.commit()

        # enfileira automaticamente as novas tracks
        from services.downloader import enqueue_playlist
        enqueue_playlist(playlist_id)

        return {
            "status":   "synced",
            "playlist": playlist.name,
            "added":    added,
            "removed":  removed,
            "total":    len(spotify_tracks),
        }

    except Exception as e:
        session.rollback()
        raise e
    finally:
        session.close()


def get_orphan_tracks() -> list:
    session = Session()
    try:
        linked_ids = session.query(PlaylistTrack.track_id).distinct()
        orphans = session.query(Track).filter(
            ~Track.spotify_id.in_(linked_ids)
        ).all()
        return [
            {
                "spotify_id": t.spotify_id,
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
            ~Track.spotify_id.in_(linked_ids)
        ).all()

        deleted = 0
        files_deleted = 0
        for track in orphans:
            if delete_files:
                for path in [track.mp3_path, track.cover_path]:
                    if path and os.path.exists(path):
                        os.remove(path)
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
            .join(PlaylistTrack, Track.spotify_id == PlaylistTrack.track_id)
            .filter(PlaylistTrack.playlist_id == playlist_id)
            .order_by(PlaylistTrack.position)
            .all()
        )
        return [
            {
                "position":    pos,
                "spotify_id":  t.spotify_id,
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

def sync_all_playlists() -> list:
    """Sincroniza todas as playlists cadastradas no banco."""
    session = Session()
    try:
        playlists = session.query(Playlist).all()
        ids = [p.spotify_id for p in playlists]
    finally:
        session.close()

    results = []
    for playlist_id in ids:
        try:
            result = sync_playlist(playlist_id)
            results.append(result)
            print(f"[sync] {result}", flush=True)
        except Exception as e:
            print(f"[sync] erro em {playlist_id}: {e}", flush=True)
            results.append({"status": "error", "playlist_id": playlist_id, "error": str(e)})

    return results