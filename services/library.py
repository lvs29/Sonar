# services/library.py
import os
from datetime import datetime, timezone
from models import Session, Track, Playlist, PlaylistTrack, Cover
from config import PLAYLIST_COVERS_DIR
from .utils import calculate_file_hash, calculate_bytes_hash

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MUSIC_DIR = os.path.join(BASE_DIR, "media", "music")
COVERS_DIR = os.path.join(BASE_DIR, "media", "covers")

os.makedirs(MUSIC_DIR, exist_ok=True)
os.makedirs(COVERS_DIR, exist_ok=True)
os.makedirs(PLAYLIST_COVERS_DIR, exist_ok=True)

def save_cover_deduplicated(file_data, original_ext=".jpg"):
    """
    Salva uma cover com deduplicação por hash.
    Retorna o hash da cover.
    """
    hash_value = calculate_bytes_hash(file_data)

    session = Session()
    try:
        existing = session.get(Cover, hash_value)
        if existing:
            return hash_value  # Já existe, retorna o hash

        # Salva novo arquivo com nome = hash
        cover_filename = f"{hash_value}{original_ext}"
        cover_path = os.path.join(COVERS_DIR, cover_filename)

        with open(cover_path, "wb") as f:
            f.write(file_data)

        cover = Cover(
            hash=hash_value,
            path=cover_filename,
            size=len(file_data)
        )
        session.add(cover)
        session.commit()
        return hash_value
    finally:
        session.close()

def save_playlist_cover_deduplicated(file_data, original_ext=".jpg"):
    """
    Salva uma cover de playlist com deduplicação por hash.
    Retorna o hash da cover.
    """
    hash_value = calculate_bytes_hash(file_data)

    session = Session()
    try:
        existing = session.get(Cover, hash_value)
        if existing:
            return hash_value  # Já existe, retorna o hash

        # Salva novo arquivo com nome = hash
        cover_filename = f"{hash_value}{original_ext}"
        cover_path = os.path.join(PLAYLIST_COVERS_DIR, cover_filename)

        with open(cover_path, "wb") as f:
            f.write(file_data)

        cover = Cover(
            hash=hash_value,
            path=cover_filename,
            size=len(file_data)
        )
        session.add(cover)
        session.commit()
        return hash_value
    finally:
        session.close()

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


def find_orphan_files() -> dict:
    """Encontra arquivos órfãos no sistema de arquivos (sem referência no banco)"""
    session = Session()
    try:
        result = {
            "covers": [],
            "playlist_covers": [],
            "music": []
        }

        # Verifica covers órfãos em COVERS_DIR
        if os.path.exists(COVERS_DIR):
            cover_files = set(os.listdir(COVERS_DIR))
            db_covers = {c.path for c in session.query(Cover).all()}
            orphan_covers = cover_files - db_covers
            result["covers"] = list(orphan_covers)

        # Verifica covers órfãos em PLAYLIST_COVERS_DIR
        if os.path.exists(PLAYLIST_COVERS_DIR):
            playlist_cover_files = set(os.listdir(PLAYLIST_COVERS_DIR))
            db_covers = {c.path for c in session.query(Cover).all()}
            orphan_playlist_covers = playlist_cover_files - db_covers
            result["playlist_covers"] = list(orphan_playlist_covers)

        # Verifica músicas órfãs em MUSIC_DIR
        if os.path.exists(MUSIC_DIR):
            music_files = set(os.listdir(MUSIC_DIR))
            db_music = {t.mp3_path for t in session.query(Track).all() if t.mp3_path}
            orphan_music = music_files - db_music
            result["music"] = list(orphan_music)

        return result
    finally:
        session.close()

def delete_orphan_files() -> dict:
    """Deleta arquivos órfãos do sistema de arquivos"""
    session = Session()
    try:
        result = {
            "deleted": {
                "covers": 0,
                "playlist_covers": 0,
                "music": 0
            }
        }

        # Deleta covers órfãos em COVERS_DIR
        if os.path.exists(COVERS_DIR):
            cover_files = set(os.listdir(COVERS_DIR))
            db_covers = {c.path for c in session.query(Cover).all()}
            orphan_covers = cover_files - db_covers
            for filename in orphan_covers:
                full_path = os.path.join(COVERS_DIR, filename)
                try:
                    os.remove(full_path)
                    result["deleted"]["covers"] += 1
                except Exception as e:
                    print(f"Erro ao deletar {full_path}: {e}")

        # Deleta covers órfãos em PLAYLIST_COVERS_DIR
        if os.path.exists(PLAYLIST_COVERS_DIR):
            playlist_cover_files = set(os.listdir(PLAYLIST_COVERS_DIR))
            db_covers = {c.path for c in session.query(Cover).all()}
            orphan_playlist_covers = playlist_cover_files - db_covers
            for filename in orphan_playlist_covers:
                full_path = os.path.join(PLAYLIST_COVERS_DIR, filename)
                try:
                    os.remove(full_path)
                    result["deleted"]["playlist_covers"] += 1
                except Exception as e:
                    print(f"Erro ao deletar {full_path}: {e}")

        # Deleta músicas órfãs em MUSIC_DIR
        if os.path.exists(MUSIC_DIR):
            music_files = set(os.listdir(MUSIC_DIR))
            db_music = {t.mp3_path for t in session.query(Track).all() if t.mp3_path}
            orphan_music = music_files - db_music
            for filename in orphan_music:
                full_path = os.path.join(MUSIC_DIR, filename)
                try:
                    os.remove(full_path)
                    result["deleted"]["music"] += 1
                except Exception as e:
                    print(f"Erro ao deletar {full_path}: {e}")

        return result
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
                # Deleta arquivo MP3
                if track.mp3_path:
                    full_path = os.path.join(MUSIC_DIR, track.mp3_path)
                    if os.path.exists(full_path):
                        os.remove(full_path)
                        files_deleted += 1

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
                            full_path = os.path.join(COVERS_DIR, cover.path)
                            if os.path.exists(full_path):
                                os.remove(full_path)
                                files_deleted += 1
                            session.delete(cover)

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
                "cover_hash":  t.cover_hash,
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
