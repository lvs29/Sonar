# migrations/migrate_last_played.py
# Execute uma vez: python migrate_last_played.py

import os
import sqlite3

DB_PATH = "sonar.db"

def run():
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()

    # Verifica e adiciona last_played em tracks
    cur.execute("PRAGMA table_info(tracks)")
    track_cols = {row[1] for row in cur.fetchall()}
    if "last_played" not in track_cols:
        cur.execute("ALTER TABLE tracks ADD COLUMN last_played DATETIME")
        print("✓ tracks.last_played adicionado")
    else:
        print("· tracks.last_played já existe")

    # Verifica e adiciona last_opened em playlists
    cur.execute("PRAGMA table_info(playlists)")
    pl_cols = {row[1] for row in cur.fetchall()}
    if "last_opened" not in pl_cols:
        cur.execute("ALTER TABLE playlists ADD COLUMN last_opened DATETIME")
        print("✓ playlists.last_opened adicionado")
    else:
        print("· playlists.last_opened já existe")

    con.commit()
    con.close()
    print("Migration concluída.")

if __name__ == "__main__":
    run()