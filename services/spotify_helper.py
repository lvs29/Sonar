"""Helpers para integração com Spotify."""
import re
import json
import urllib.request
from urllib.error import URLError


def get_spotify_metadata(spotify_url: str) -> dict:
    """
    Extrai metadados de uma URL do Spotify (sem salvar nada).
    Retorna: {status: "preview", title, artist, album, duration_ms, cover_url}
    """
    # Extrai track_id da URL
    match = re.search(r"spotify\.com/track/([A-Za-z0-9]+)", spotify_url)
    if not match:
        raise ValueError("URL do Spotify inválida")
    
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
        
        # Extrai JSON com metadados
        m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.DOTALL)
        if not m:
            raise ValueError("Estrutura da página do Spotify não reconhecida")
        
        data = json.loads(m.group(1))
        entity = data["props"]["pageProps"]["state"]["data"]["entity"]
        
        # Extrai informações básicas
        title = entity.get("name", "Sem título")
        duration_raw = entity.get("duration", 0)
        if isinstance(duration_raw, dict):
            duration_ms = duration_raw.get("totalMilliseconds", 0)
        else:
            duration_ms = duration_raw or 0
        
        # Artista(s)
        artists = entity.get("artists", [])
        artist = ", ".join([a.get("name", "") for a in artists]) if artists else "Desconhecido"
        
        # Album
        album = entity.get("album", {}).get("name", "") if entity.get("album") else ""
        
        # Capa (melhor resolução)
        images = entity.get("visualIdentity", {}).get("image", [])
        cover_url = ""
        if images:
            best_image = max(images, key=lambda x: (x.get("maxWidth") or 0) * (x.get("maxHeight") or 0))
            cover_url = best_image.get("url", "")
        
        return {
            "status": "preview",
            "title": title,
            "artist": artist,
            "album": album,
            "duration_ms": duration_ms,
            "cover_url": cover_url,
        }
    
    except URLError as e:
        raise Exception(f"Erro ao acessar Spotify: {str(e)}")
    except json.JSONDecodeError:
        raise ValueError("Resposta do Spotify não é JSON válido")
    except KeyError as e:
        raise ValueError(f"Campo esperado não encontrado na resposta do Spotify: {str(e)}")


def confirm_spotify_track(data: dict, playlist_ids: list) -> dict:
    """
    Confirma track do Spotify: busca no YouTube, cria track real, enfileira download.
    Não cria track temporária - apenas usa Track em memória para buscar no YouTube.
    """
    import uuid
    import urllib.request
    from models import Session, Track, Playlist, PlaylistTrack, DownloadJob
    from sqlalchemy import func
    from .downloader import _find_best_match
    from .library import save_cover_deduplicated
    
    session = Session()
    try:
        # Track em MEMÓRIA apenas para buscar no YouTube (não será salva)
        search_track = Track(
            id=str(uuid.uuid4()),
            title=data["title"],
            artist=data["artist"],
            album=data.get("album", ""),
            duration_ms=data.get("duration_ms", 0),
            downloaded=False,
        )
        
        # Busca melhor match no YouTube
        match_result = _find_best_match(search_track)
        
        # Baixa cover do Spotify
        cover_hash = None
        cover_url = data.get("cover_url")
        if cover_url:
            try:
                with urllib.request.urlopen(cover_url, timeout=10) as resp:
                    cover_data = resp.read()
                cover_hash = save_cover_deduplicated(cover_data, ".jpg")
            except Exception:
                pass  # Continua sem capa se falhar
        
        # Cria TRACK REAL com dados do YouTube (esse sim será salvo no banco)
        track = Track(
            id=str(uuid.uuid4()),
            title=data["title"],
            artist=data["artist"],
            album=data.get("album", ""),
            duration_ms=data.get("duration_ms", 0),
            youtube_url=match_result["url"],
            youtube_id=match_result["id"],
            cover_hash=cover_hash,
            downloaded=False,
        )
        
        session.add(track)
        session.flush()
        
        # Adiciona nas playlists
        for pl_id in playlist_ids:
            pl = session.get(Playlist, pl_id)
            if not pl:
                continue
            max_pos = session.query(func.max(PlaylistTrack.position))\
                .filter_by(playlist_id=pl_id).scalar() or 0
            session.add(PlaylistTrack(
                playlist_id=pl_id,
                track_id=track.id,
                position=max_pos + 1,
            ))
        
        # Enfileira download
        session.add(DownloadJob(track_id=track.id, status="pending"))
        session.commit()
        
        return {
            "status": "ok",
            "id": track.id,
        }
    except Exception as e:
        session.rollback()
        raise e
    finally:
        session.close()