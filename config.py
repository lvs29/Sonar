import json
import os

CONFIG_PATH = os.path.join(os.path.dirname(__file__), "config.json")

_defaults = {
    "host":            "0.0.0.0",
    "port":            8000,
    "yt_dlp_browser":  "chromium",
}

def load_config() -> dict:
    if not os.path.exists(CONFIG_PATH):
        save_config(_defaults)
        return dict(_defaults)
    with open(CONFIG_PATH, "r") as f:
        data = json.load(f)
    return {**_defaults, **data}

def save_config(cfg: dict):
    with open(CONFIG_PATH, "w") as f:
        json.dump(cfg, f, indent=4)

def get(key: str):
    return load_config().get(key, _defaults.get(key))

BASE_DIR   = os.path.dirname(__file__)
MUSIC_DIR  = os.path.join(BASE_DIR, "media", "music")
COVERS_DIR = os.path.join(BASE_DIR, "media", "covers")