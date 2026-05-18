# models/database.py
from sqlalchemy import create_engine, Column, Text, Integer, DateTime, Boolean, ForeignKey, String
from sqlalchemy.orm import DeclarativeBase, relationship, sessionmaker
from datetime import datetime
import uuid
import os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE_DIR, "sonar.db")

engine = create_engine(f"sqlite:///{DB_PATH}", echo=False)
Session = sessionmaker(bind=engine)


class Base(DeclarativeBase):
    pass


class Cover(Base):
    __tablename__ = "covers"
    hash     = Column(String, primary_key=True)
    path     = Column(String, nullable=False)
    size     = Column(Integer)
    added_at = Column(DateTime, default=datetime.utcnow)


class Track(Base):
    __tablename__ = "tracks"
    id             = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    type           = Column(String, default="track")
    title          = Column(String)
    artist         = Column(String)
    album          = Column(String)
    duration_ms    = Column(Integer)
    mp3_path       = Column(String)
    cover_hash     = Column(String, ForeignKey("covers.hash"))
    downloaded     = Column(Boolean, default=False)
    added_at       = Column(DateTime, default=datetime.utcnow)
    youtube_id     = Column(String)
    youtube_url    = Column(String)
    description    = Column(String)
    play_count     = Column(Integer, default=0)
    complete_count = Column(Integer, default=0)
    last_played    = Column(DateTime, nullable=True)

    cover = relationship("Cover", backref="tracks")


class Playlist(Base):
    __tablename__ = "playlists"
    id          = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name        = Column(String)
    cover_hash  = Column(String, ForeignKey("covers.hash"))
    description = Column(String)
    last_opened = Column(DateTime, nullable=True)

    cover = relationship("Cover", backref="playlists")


class PlaylistTrack(Base):
    __tablename__ = "playlist_tracks"
    playlist_id = Column(String, ForeignKey("playlists.id"), primary_key=True)
    track_id    = Column(String, ForeignKey("tracks.id"),    primary_key=True)
    position    = Column(Integer)
    added_at    = Column(DateTime, default=datetime.utcnow)

class DownloadJob(Base):
    __tablename__ = "download_queue"
    id          = Column(Integer, primary_key=True, autoincrement=True)
    track_id    = Column(String, ForeignKey("tracks.id"))
    status      = Column(String, default="pending")
    error_msg   = Column(String)
    retry_count = Column(Integer, default=0)
    created_at  = Column(DateTime, default=datetime.utcnow)
    finished_at = Column(DateTime)

    track = relationship("Track")


def init_db():
    Base.metadata.create_all(engine)