// static/js/api.js
const API = "";

function escapeHtml(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function sanitizeTrack(t) {
    return {
        ...t,
        title:   escapeHtml(t.title),
        artist:  escapeHtml(t.artist),
        album:   escapeHtml(t.album),
    };
}

function sanitizePlaylist(p) {
    return {
        ...p,
        name:        escapeHtml(p.name),
        description: escapeHtml(p.description),
    };
}

async function fetchPlaylists() {
    const r = await fetch(`${API}/library/playlists`);
    return (await r.json()).map(sanitizePlaylist);
}

async function fetchPlaylistTracks(playlistId) {
    const r = await fetch(`${API}/library/playlist/${playlistId}`);
    return (await r.json()).map(sanitizeTrack);
}

async function fetchQueueStatus() {
    const r = await fetch(`${API}/library/queue`);
    return r.json();
}

async function fetchFailed() {
    const r = await fetch(`${API}/library/failed`);
    return (await r.json()).map(sanitizeTrack);
}

async function fetchOrphans() {
    const r = await fetch(`${API}/library/orphans`);
    return (await r.json()).map(sanitizeTrack);
}

async function setTrackUrl(id, youtubeUrl) {
    const r = await fetch(`${API}/library/track/${id}/set-url`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({youtube_url: youtubeUrl})
    });
    return r.json();
}

async function deleteOrphansApi(withFiles = false) {
    const r = await fetch(`${API}/library/orphans/delete?files=${withFiles}`, {method: "DELETE"});
    return r.json();
}

async function retryFailedApi() {
    const r = await fetch(`${API}/library/failed/retry`, {method: "POST"});
    return r.json();
}

function audioUrl(id) { return `${API}/media/track/${id}/audio`; }
function coverUrl(id) { return `${API}/media/track/${id}/cover`; }
function queueStreamUrl() { return `${API}/library/queue/stream`; }

async function fetchPlaylistPreview(playlistId) {
    const r = await fetch(`${API}/library/playlist/${playlistId}/preview`);
    const p = await r.json();
    return { ...p, name: escapeHtml(p.name) };
}

async function addPlaylist(playlistId) {
    const r = await fetch(`${API}/library/sync/${playlistId}`, { method: "POST" });
    return r.json();
}

async function fetchTrackSearch(query) {
    const r = await fetch(`${API}/library/tracks/search?q=${encodeURIComponent(query)}`);
    return (await r.json()).map(sanitizeTrack);
}

async function fetchTrackStatus(id) {
    const r = await fetch(`${API}/library/track/${id}/status`);
    return r.json();
}

async function fetchPlaylistMeta(playlistId) {
    const r = await fetch(`${API}/library/playlist/${playlistId}/meta`);
    const p = await r.json();
    return sanitizePlaylist(p);
}

async function deletePlaylist(playlistId) {
    const r = await fetch(`${API}/library/playlist/${playlistId}`, { method: "DELETE" });
    return r.json();
}

async function fetchAllTracks() {
    const r = await fetch(`${API}/library/tracks/all`);
    return (await r.json()).map(sanitizeTrack);
}

async function deleteTrack(id, withFiles = false) {
    const r = await fetch(`${API}/library/track/${id}?files=${withFiles}`, { method: "DELETE" });
    return r.json();
}

async function fetchConfig() {
    const r = await fetch(`${API}/library/config`);
    return r.json();
}

async function saveConfig(data) {
    const r = await fetch(`${API}/library/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    });
    return r.json();
}

async function trackPlayed(id, completed = false) {
    await fetch(`${API}/library/track/${id}/played`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed }),
    });
}

async function createPlaylist(name, description = "") {
    const r = await fetch(`${API}/library/playlist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description }),
    });
    return r.json();
}

async function fetchYoutubeSearch(query) {
    const r = await fetch(`${API}/library/youtube/search?q=${encodeURIComponent(query)}`);
    return r.json();
}

async function addYoutubeTrack(youtubeUrl, playlistIds = [], meta = {}) {
    const r = await fetch(`${API}/library/track/add-youtube`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            youtube_url:  youtubeUrl,
            playlist_ids: playlistIds,
            title:        meta.title,
            artist:       meta.artist,
            duration_ms:  meta.duration_ms,
        }),
    });
    return r.json();
}

async function uploadTrack(file) {
    const form = new FormData();
    form.append("file", file);
    const r = await fetch(`${API}/library/track/upload`, {
        method: "POST",
        body: form,
    });
    return r.json();
}

async function confirmUpload(data, playlistIds = []) {
    const r = await fetch(`${API}/library/track/confirm-upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, playlist_ids: playlistIds }),
    });
    return r.json();
}

async function uploadPlaylistCover(playlistId, file) {
    const form = new FormData();
    form.append("file", file);
    const r = await fetch(`${API}/library/playlist/${playlistId}/cover`, {
        method: "POST",
        body: form,
    });
    return r.json();
}

async function setPlaylistCoverUrl(playlistId, url) {
    const r = await fetch(`${API}/library/playlist/${playlistId}/cover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cover_url: url }),
    });
    return r.json();
}

async function updateTrack(id, data) {
    const r = await fetch(`${API}/library/track/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    });
    return r.json();
}

async function uploadTrackCover(id, file) {
    const form = new FormData();
    form.append("file", file);
    const r = await fetch(`${API}/library/track/${id}/cover`, {
        method: "POST",
        body: form,
    });
    return r.json();
}

async function setTrackCoverUrl(id, url) {
    const r = await fetch(`${API}/library/track/${id}/cover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cover_url: url }),
    });
    return r.json();
}

async function fetchArtists(q) {
    const r = await fetch(`${API}/library/tracks/artists?q=${encodeURIComponent(q)}`);
    return r.json();
}

async function fetchAlbums(q) {
    const r = await fetch(`${API}/library/tracks/albums?q=${encodeURIComponent(q)}`);
    return r.json();
}

async function updateTrackPlaylists(trackId, playlistIds) {
    const r = await fetch(`${API}/library/track/${trackId}/playlists`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playlist_ids: playlistIds }),
    });
    return r.json();
}

async function replaceTrackFile(trackId, file) {
    const form = new FormData();
    form.append("file", file);
    const r = await fetch(`${API}/library/track/${trackId}/replace-file`, {
        method: "POST",
        body: form,
    });
    return r.json();
}

async function updatePlaylistMeta(playlistId, name, description) {
    const r = await fetch(`${API}/library/playlist/${playlistId}/meta`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description }),
    });
    return r.json();
}

async function reorderPlaylistTracks(playlistId, trackIds) {
    const r = await fetch(`${API}/library/playlist/${playlistId}/reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ track_ids: trackIds }),
    });
    return r.json();
}