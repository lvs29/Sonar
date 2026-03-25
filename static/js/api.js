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

async function setTrackUrl(spotifyId, youtubeUrl) {
    const r = await fetch(`${API}/library/track/${spotifyId}/set-url`, {
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

function audioUrl(spotifyId) { return `${API}/media/track/${spotifyId}/audio`; }
function coverUrl(spotifyId) { return `${API}/media/track/${spotifyId}/cover`; }
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

async function fetchTrackStatus(spotifyId) {
    const r = await fetch(`${API}/library/track/${spotifyId}/status`);
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

async function deleteOrphanTrack(spotifyId, withFiles = false) {
    const r = await fetch(`${API}/library/track/${spotifyId}?files=${withFiles}`, { method: "DELETE" });
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

async function trackPlayed(spotifyId, completed = false) {
    await fetch(`${API}/library/track/${spotifyId}/played`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed }),
    });
}