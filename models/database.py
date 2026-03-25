# models/database.py
from sqlalchemy import create_engine, Column, Text, Integer, DateTime, Boolean, ForeignKey, func
from sqlalchemy.orm import DeclarativeBase, relationship, sessionmaker
import os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE_DIR, "sonar.db")

engine = create_engine(f"sqlite:///{DB_PATH}", echo=False)
Session = sessionmaker(bind=engine)


class Base(DeclarativeBase):
    pass


class Track(Base):
    __tablename__ = "tracks"

    spotify_id  = Column(Text, primary_key=True)
    type        = Column(Text, default="track")
    title       = Column(Text, nullable=False)
    artist      = Column(Text, nullable=False)
    album       = Column(Text, nullable=False)
    duration_ms = Column(Integer)
    mp3_path    = Column(Text)
    cover_path  = Column(Text)
    cover_url   = Column(Text)
    downloaded  = Column(Boolean, default=False)
    added_at    = Column(DateTime, server_default=func.now())
    youtube_id  = Column(Text)
    youtube_url = Column(Text)
    play_count     = Column(Integer, default=0)
    complete_count = Column(Integer, default=0)

    playlists = relationship("PlaylistTrack", back_populates="track")


class Playlist(Base):
    __tablename__ = "playlists"

    spotify_id  = Column(Text, primary_key=True)
    name        = Column(Text, nullable=False)
    snapshot_id = Column(Text)
    last_synced = Column(DateTime)
    cover_url = Column(Text)
    description = Column(Text)

    tracks = relationship("PlaylistTrack", back_populates="playlist")


class PlaylistTrack(Base):
    __tablename__ = "playlist_tracks"

    playlist_id = Column(Text, ForeignKey("playlists.spotify_id"), primary_key=True)
    track_id    = Column(Text, ForeignKey("tracks.spotify_id"), primary_key=True)
    position    = Column(Integer)
    added_at    = Column(DateTime)

    playlist = relationship("Playlist", back_populates="tracks")
    track    = relationship("Track", back_populates="playlists")

class DownloadJob(Base):
    __tablename__ = "download_queue"

    id          = Column(Integer, primary_key=True, autoincrement=True)
    track_id    = Column(Text, ForeignKey("tracks.spotify_id"), nullable=False)
    status      = Column(Text, default="pending")  # pending, downloading, done, failed
    error_msg   = Column(Text)
    retry_count = Column(Integer, default=0)
    created_at  = Column(DateTime, server_default=func.now())
    finished_at = Column(DateTime)

    track = relationship("Track")


def init_db():
    Base.metadata.create_all(engine)