import requests
from utils.token_manager import get_token

def get_playlist_meta(playlist_id: str) -> dict:
    token = get_token()
    r = requests.get(
        f"https://api.spotify.com/v1/playlists/{playlist_id}",
        headers={"Authorization": f"Bearer {token}"},
        params={"market": "BR", "fields": "id,name,snapshot_id,owner,images,description"}
    )
    r.raise_for_status()
    data = r.json()
    return {
        "spotify_id":  data["id"],
        "name":        data["name"],
        "snapshot_id": data["snapshot_id"],
        "owner_id":    data["owner"]["id"],
        "cover_url":   data["images"][0]["url"] if data.get("images") else None,
        "description": data.get("description") or "",
    }

def get_all_playlist_tracks(playlist_id: str) -> list:
    token = get_token()
    headers = {"Authorization": f"Bearer {token}"}

    url = f"https://api.spotify.com/v1/playlists/{playlist_id}"
    params = {"market": "BR"}

    r = requests.get(url, headers=headers, params=params)
    r.raise_for_status()
    data = r.json()

    if "items" not in data:
        raise Exception("Sem acesso aos itens dessa playlist (não é sua ou não é colaborador)")

    page = data["items"]
    tracks = []

    while True:
        for entry in page["items"]:
            item = entry.get("item") or entry.get("track")
            if not item:
                continue

            item_type = item.get("type")

            if item_type == "track":
                tracks.append({
                    "spotify_id":  item["id"],
                    "type":        "track",
                    "title":       item["name"],
                    "artist":      ", ".join(a["name"] for a in item["artists"]),
                    "album":       item["album"]["name"],
                    "duration_ms": item["duration_ms"],
                    "cover":       item["album"]["images"][0]["url"] if item["album"]["images"] else None,
                })

            elif item_type == "episode":
                # tenta a imagem do episódio, depois a do show
                cover = None
                if item.get("images"):
                    cover = item["images"][0]["url"]
                elif item.get("show", {}).get("images"):
                    cover = item["show"]["images"][0]["url"]

                tracks.append({
                    "spotify_id":  item["id"],
                    "type":        "episode",
                    "title":       item["name"],
                    "artist":      item.get("show", {}).get("name", ""),
                    "album":       item.get("show", {}).get("publisher", ""),
                    "duration_ms": item["duration_ms"],
                    "cover":       cover,
                })

        next_url = page.get("next")
        if not next_url:
            break

        r = requests.get(next_url, headers=headers)
        r.raise_for_status()
        page = r.json()

    print(f"Total: {len(tracks)} | Tipos: {set(t['type'] for t in tracks)}")
    return tracks

# mantém o nome antigo como alias pra não quebrar o routes/playlists.py
get_playlist_tracks = get_all_playlist_tracks