// static/js/app.js

// ========================
// navegação
// ========================

function showView(name) {
    closeAllPopups();

    const main = document.getElementById("main");
    if (name === "playlists" || name === "search") {
        main.classList.add("show-search");
    } else {
        main.classList.remove("show-search");
        document.getElementById("search-input").value = "";
    }

    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
    const el = document.getElementById(`view-${name}`);
    if (el) el.classList.add("active");

    document.querySelectorAll(".nav-item[data-view]").forEach(n => {
        n.classList.toggle("active", n.dataset.view === name);
    });

    document.querySelectorAll(".bottom-nav-item[data-view]").forEach(n => {
        n.classList.toggle("active", n.dataset.view === name);
    });

    if (name === "downloads") initDownloads();
    if (name === "manage")    initManage();
}

document.querySelectorAll(".nav-item[data-view]").forEach(el => {
    el.addEventListener("click", () => showView(el.dataset.view));
});

// ========================
// sidebar
// ========================

async function loadSidebar() {
    const playlists = await fetchPlaylists();
    const list = document.getElementById("playlist-list");
    list.innerHTML = "";
    playlists.forEach(pl => {
        const el = document.createElement("div");
        el.className = "sidebar-playlist";
        el.dataset.playlistId = pl.spotify_id;
        el.innerHTML = `
            <img class="sidebar-playlist-cover"
                 src="/library/playlist/${pl.spotify_id}/cover"
                 onerror="this.style.opacity='0'">
            <span class="sidebar-playlist-name">${pl.name}</span>
        `;
        el.addEventListener("click", () => openPlaylist(pl.spotify_id, pl.name));
        list.appendChild(el);
    });
    renderHomepage(playlists);
}

// ========================
// homepage
// ========================

function renderHomepage(playlists) {
    if (!playlists.length) return;
    const featured = playlists[0];

    document.getElementById("home-featured").innerHTML = `
        <div style="display:flex;gap:20px;align-items:flex-end;background:linear-gradient(135deg,#1a1200,#0d0d0d);border-radius:12px;padding:24px;cursor:pointer;border:1px solid var(--border);"
             onclick="openPlaylist('${featured.spotify_id}', '${featured.name.replace(/'/g, "\\'")}')">
            <img src="/library/playlist/${featured.spotify_id}/cover"
                 onerror="this.style.display='none'"
                 style="width:100px;height:100px;border-radius:8px;object-fit:cover;background:var(--bg-3);flex-shrink:0;">
            <div>
                <div style="font-size:11px;color:var(--accent);text-transform:uppercase;letter-spacing:2px;margin-bottom:6px;">Playlist</div>
                <div style="font-size:24px;font-weight:700;color:var(--text);margin-bottom:6px;">${featured.name}</div>
                <div style="font-size:12px;color:var(--text-3);">Última sync: ${formatDate(featured.last_synced)}</div>
                <button class="btn btn-accent" style="margin-top:12px;"
                        onclick="event.stopPropagation();openPlaylist('${featured.spotify_id}','${featured.name.replace(/'/g, "\\'")}')">Abrir</button>
            </div>
        </div>`;

    const homeList = document.getElementById("home-list");
    homeList.innerHTML = "";
    playlists.slice(1).forEach(pl => {
        const el = document.createElement("div");
        el.style.cssText = "display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:8px;cursor:pointer;border:1px solid var(--border);background:var(--bg-2);transition:background 0.15s;";
        el.innerHTML = `
            <img src="/library/playlist/${pl.spotify_id}/cover"
                 onerror="this.style.opacity='0'"
                 style="width:44px;height:44px;border-radius:6px;object-fit:cover;background:var(--bg-3);flex-shrink:0;">
            <div>
                <div style="font-size:13px;font-weight:500;color:var(--text);">${pl.name}</div>
                <div style="font-size:11px;color:var(--text-3);">Sync: ${formatDate(pl.last_synced)}</div>
            </div>`;
        el.addEventListener("mouseover", () => el.style.background = "var(--bg-hover)");
        el.addEventListener("mouseout",  () => el.style.background = "var(--bg-2)");
        el.addEventListener("click", () => openPlaylist(pl.spotify_id, pl.name));
        homeList.appendChild(el);
    });
}

function formatDate(iso) {
    if (!iso) return "nunca";
    return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

// ========================
// playlist
// ========================

const BUFFER      = 20;
let currentPlaylistId = null;
let _scrollHandler    = null;
let searchQuery    = "";
let allTracksCache = [];

function getItemHeight() {
    return window.innerWidth <= 768 ? 52 : 58;
}

async function openPlaylist(playlistId, name) {
    closeAllPopups();
    document.getElementById("main").classList.remove("show-search");
    document.getElementById("search-input").value = "";
    currentPlaylistId = playlistId;
    localStorage.setItem("sonar_playlist_id",   playlistId);
    localStorage.setItem("sonar_playlist_name", name);
 
    document.querySelectorAll(".sidebar-playlist").forEach(n => n.classList.remove("active"));
    document.querySelector(`.sidebar-playlist[data-playlist-id="${playlistId}"]`)?.classList.add("active");
 
    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
    document.getElementById("view-playlist").classList.add("active");
 
    document.getElementById("pl-name").textContent = name;
    document.getElementById("pl-meta").textContent = "Carregando...";
    document.getElementById("track-list").innerHTML = "";
 
    const main = document.getElementById("main");
 
    if (_scrollHandler) {
        main.removeEventListener("scroll", _scrollHandler);
        _scrollHandler = null;
    }
 
    main.scrollTop = 0;
 
    // reseta busca
    searchQuery = "";
    document.getElementById("search-input").value = "";
 
    const [tracks, meta] = await Promise.all([
        fetchPlaylistTracks(playlistId),
        fetchPlaylistMeta(playlistId),
    ]);
 
    allTracksCache = tracks;
    const downloadedTracks = tracks.filter(t => t.downloaded);
 
    const descEl = document.getElementById("pl-description");
    if (descEl) {
        descEl.textContent    = meta.description || "";
        descEl.style.display  = meta.description ? "block" : "none";
    }
 
    document.getElementById("pl-meta").textContent =
        `${tracks.length} músicas · ${downloadedTracks.length} disponíveis`;
 
    document.getElementById("pl-cover").src      = `/library/playlist/${playlistId}/cover`;
    document.getElementById("pl-cover").onerror  = () => {};
 
    document.getElementById("pl-actions").innerHTML = `
        <button class="btn btn-danger-solid" id="btn-delete-playlist">
            <i class="fa-solid fa-trash"></i> Remover playlist
        </button>`;
 
    document.getElementById("btn-delete-playlist").addEventListener("click", async () => {
        const ok = await showConfirm({
            title:         "Remover playlist",
            body:          `Tem certeza que quer remover <strong>${name}</strong> da biblioteca?<br><br>Os arquivos de áudio não serão apagados.`,
            confirmLabel:  "Remover",
            danger:        true,
        });
        if (!ok) return;
        const result = await deletePlaylist(playlistId);
        if (result.status === "ok") {
            await loadSidebar();
            showView("playlists");
        } else {
            alert("Erro: " + result.error);
        }
    });
 
    renderTrackList(tracks, downloadedTracks, playlistId);
}

function renderTrackList(allTracks, downloadedTracks, playlistId) {
    const container = document.getElementById("track-list");
    const main      = document.getElementById("main");

    container.style.position = "relative";
    container.style.height   = `${allTracks.length * getItemHeight()}px`;
    container.innerHTML      = "";

    const thisPlaylistId = playlistId;

    function renderVisible() {
        // se a playlist mudou este listener é obsoleto
        if (currentPlaylistId !== thisPlaylistId) {
            main.removeEventListener("scroll", renderVisible);
            _scrollHandler = null;
            return;
        }

        const scrollTop = main.scrollTop;
        const viewH     = main.clientHeight;
        const start     = Math.max(0, Math.floor(scrollTop / getItemHeight()) - BUFFER);
        const end       = Math.min(allTracks.length, Math.ceil((scrollTop + viewH) / getItemHeight()) + BUFFER);

        container.querySelectorAll(".track-item").forEach(el => {
            const pos = parseInt(el.dataset.pos);
            if (pos < start || pos >= end) el.remove();
        });

        const rendered = new Set(
            [...container.querySelectorAll(".track-item")].map(el => parseInt(el.dataset.pos))
        );

        for (let i = start; i < end; i++) {
            if (rendered.has(i)) continue;
            const track   = allTracks[i];
            const current = Queue.getCurrent();

            const el = document.createElement("div");
            el.className         = "track-item" + (track.downloaded ? "" : " track-not-downloaded");
            el.dataset.pos       = i;
            el.dataset.spotifyId = track.spotify_id;
            el.style.cssText     = `position:absolute;top:${i * getItemHeight()}px;width:100%;`;

            if (current && current.spotify_id === track.spotify_id) {
                el.classList.add("playing");
            }

            el.innerHTML = `
                <div class="track-num">${i + 1}</div>
                <img class="track-cover" src="${coverUrl(track.spotify_id)}" loading="lazy" onerror="this.style.opacity='0.2'">
                <div>
                    <div class="track-title">${track.title}</div>
                    <div class="track-artist">${track.artist}</div>
                </div>
                <div class="track-album">${track.album}</div>
                <div class="track-plays" style="font-size:12px;color:var(--text-3);">${track.play_count || 0}</div>
                <div class="track-duration">${formatDuration(track.duration_ms)}</div>
                <div class="track-actions">
                    <button class="track-dots" data-spotify-id="${track.spotify_id}" data-yt-url="${track.youtube_url || ''}">···</button>
                </div>`;

            if (track.downloaded) {
                el.addEventListener("click", () => {
                    if (Queue.currentPlaylistId !== thisPlaylistId) {
                        Queue.loadPlaylist(downloadedTracks, thisPlaylistId);
                    }
                    const qi = downloadedTracks.findIndex(t => t.spotify_id === track.spotify_id);
                    Queue.playAt(qi, true);
                    Player.play(Queue.getCurrent());
                    highlightCurrentTrack();
                    QueuePanel.render();
                });
            }

            el.querySelector(".track-dots").addEventListener("click", (e) => {
                e.stopPropagation();
                openTrackPopup(e.currentTarget, track);
            });

            container.appendChild(el);
        }

        // reaplica highlight
        const cur = Queue.getCurrent();
        if (cur) {
            container.querySelectorAll(".track-item").forEach(el => {
                el.classList.toggle("playing", el.dataset.spotifyId === cur.spotify_id);
            });
        }
    }

    _scrollHandler = renderVisible;
    main.addEventListener("scroll", renderVisible);
    renderVisible();

    Queue.on("trackChanged", () => {
        highlightCurrentTrack();
        QueuePanel.render();
    });
}

function highlightTrack(spotifyId) {
    document.querySelectorAll(".track-item").forEach(el => {
        el.classList.toggle("playing", el.dataset.spotifyId === spotifyId);
    });
}

function highlightCurrentTrack() {
    const current = Queue.getCurrent();
    if (current) highlightTrack(current.spotify_id);
}

function formatDuration(ms) {
    const s   = Math.floor(ms / 1000);
    const m   = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
}

// ========================
// track popup (3 pontos)
// ========================

function openTrackPopup(btn, track) {
    closeAllPopups();

    const popup = document.createElement("div");
    popup.className = "track-popup";
    popup.innerHTML = `
        <div style="font-size:13px;font-weight:500;color:var(--text);margin-bottom:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${track.title}</div>
        <button class="btn" style="width:100%;margin-bottom:6px;text-align:left;" id="popup-add-queue">+ Adicionar à fila</button>
        <div style="border-top:1px solid var(--border);margin:8px 0;"></div>
        <div class="track-popup-label" style="margin-bottom:6px;">Link do YouTube</div>
        <input id="popup-yt-input" autocomplete="off" placeholder="youtube.com/watch?v=..." value="${track.youtube_url || ''}">
        <div class="track-popup-actions">
            <button class="btn btn-accent" id="popup-save">Salvar</button>
            <button class="btn" id="popup-close">✕</button>
        </div>`;

    const rect = btn.getBoundingClientRect();
    popup.style.top   = `${rect.bottom + 4}px`;
    popup.style.right = `${window.innerWidth - rect.right}px`;
    document.body.appendChild(popup);

    popup.querySelector("#popup-add-queue").addEventListener("click", () => {
        Queue.addToManual(track);
        closeAllPopups();
        QueuePanel.render();
    });

    popup.querySelector("#popup-close").addEventListener("click", closeAllPopups);

    popup.querySelector("#popup-save").addEventListener("click", async () => {
        const url     = popup.querySelector("#popup-yt-input").value.trim();
        const saveBtn = popup.querySelector("#popup-save");
        if (!url) return;
        saveBtn.textContent = "Salvando...";
        saveBtn.disabled    = true;
        const result = await setTrackUrl(track.spotify_id, url);
        if (result.status === "ok") {
            saveBtn.textContent       = "✓ Salvo — baixando...";
            saveBtn.style.borderColor = "var(--success)";
            saveBtn.style.color       = "var(--success)";
            btn.dataset.ytUrl = url;

            const pollInterval = setInterval(async () => {
                const status = await fetchTrackStatus(track.spotify_id);
                if (status.downloaded) {
                    clearInterval(pollInterval);
                    const trackItem = btn.closest(".track-item");
                    if (trackItem) {
                        const title = trackItem.querySelector(".track-title");
                        if (title) {
                            title.style.color      = "var(--success)";
                            title.style.transition = "color 0.5s";
                            setTimeout(() => { title.style.color = ""; }, 3000);
                        }
                    }
                    setTimeout(closeAllPopups, 500);
                } else if (status.failed) {
                    clearInterval(pollInterval);
                    saveBtn.textContent       = "Download falhou";
                    saveBtn.style.borderColor = "var(--danger)";
                    saveBtn.style.color       = "var(--danger)";
                    saveBtn.disabled          = false;
                }
            }, 2000);
        } else {
            saveBtn.textContent       = "Erro";
            saveBtn.style.borderColor = "var(--danger)";
            saveBtn.style.color       = "var(--danger)";
            saveBtn.disabled          = false;
        }
    });

    setTimeout(() => {
        function outsideClick(e) {
            if (!popup.contains(e.target) && e.target !== btn) {
                closeAllPopups();
                document.removeEventListener("click", outsideClick);
            }
        }
        document.addEventListener("click", outsideClick);
    }, 100);

    document.getElementById("main").addEventListener("scroll", closeAllPopups, { once: true });
}

function closeAllPopups() {
    document.querySelectorAll(".track-popup").forEach(p => {
        const input = p.querySelector("input");
        if (input) { input.value = ""; input.blur(); }
        p.remove();
    });
}

// ========================
// queue panel
// ========================

const QueuePanel = (() => {
    let open        = false;
    let dragFromIdx = null;

    function toggle() {
        open = !open;
        const panel = document.getElementById("queue-panel");
        panel.style.display = open ? "flex" : "none";
        if (open) render();
    }

    function _initDrag() {
        // inicializa drag em ambos os containers
        ["unified-queue-manual", "unified-queue-playlist"].forEach(containerId => {
            const container = document.getElementById(containerId);
            if (!container) return;

            container.addEventListener("click", (e) => {
                const removeBtn = e.target.closest("[data-remove-idx]");
                const row       = e.target.closest("[data-unified-idx]");

                if (removeBtn) {
                    e.stopPropagation();
                    Queue.removeFromUnified(parseInt(removeBtn.dataset.removeIdx));
                    render();
                    return;
                }

                if (row && !e.target.closest(".queue-drag-handle")) {
                    Queue.playFromUnified(parseInt(row.dataset.unifiedIdx));
                    Player.play(Queue.getCurrent());
                    highlightCurrentTrack();
                    render();
                }
            });

            container.querySelectorAll("[data-unified-idx]").forEach(row => {
                row.addEventListener("dragstart", (e) => {
                    dragFromIdx = parseInt(row.dataset.unifiedIdx);
                    row.classList.add("dragging");
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", String(dragFromIdx));
                });

                row.addEventListener("dragend", () => {
                    document.querySelectorAll(".dragging, .drag-over").forEach(el => {
                        el.classList.remove("dragging", "drag-over");
                    });
                    dragFromIdx = null;
                });

                row.addEventListener("dragover", (e) => {
                    e.preventDefault();
                    const toIdx = parseInt(row.dataset.unifiedIdx);
                    if (toIdx !== dragFromIdx) {
                        document.querySelectorAll(".drag-over").forEach(el => el.classList.remove("drag-over"));
                        row.classList.add("drag-over");
                    }
                });

                row.addEventListener("drop", (e) => {
                    e.preventDefault();
                    const toIdx = parseInt(row.dataset.unifiedIdx);
                    if (dragFromIdx === null || dragFromIdx === toIdx) return;
                    Queue.moveUnified(dragFromIdx, toIdx);
                    dragFromIdx = null;
                    render();
                });
            });
        });
    }

    function render() {
        if (!open) return;
        const current  = Queue.getCurrent();
        const unified  = Queue.getUnifiedQueue(50);
        const panel    = document.getElementById("queue-panel");

        const manual   = unified.filter(t => t._qtype === "manual");
        const playlist = unified.filter(t => t._qtype === "playlist");

        // índices reais na fila unificada para o drag funcionar
        let idx = 0;
        const manualRows   = manual.map(t   => _unifiedRow(t, idx++));
        const playlistRows = playlist.map(t => _unifiedRow(t, idx++));

        const playlistName = Queue.currentPlaylistId
            ? (document.querySelector(`.sidebar-playlist[data-playlist-id="${Queue.currentPlaylistId}"] .sidebar-playlist-name`)?.textContent || "Playlist")
            : "Playlist";

        panel.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:16px;border-bottom:1px solid var(--border);flex-shrink:0;">
                <div style="font-size:14px;font-weight:600;">Fila</div>
                <button class="ctrl-btn" id="panel-close">✕</button>
            </div>
            <div id="queue-scroll" style="flex:1;overflow-y:auto;padding:8px 0;">
                ${current ? `
                    <div style="padding:8px 16px 4px;font-size:11px;color:var(--accent);text-transform:uppercase;letter-spacing:1px;">Tocando agora</div>
                    ${_currentRow(current)}
                ` : ""}

                ${manual.length ? `
                    <div style="padding:8px 16px 4px;font-size:11px;color:var(--text-3);text-transform:uppercase;letter-spacing:1px;">Próxima da fila</div>
                    <div id="unified-queue-manual">
                        ${manualRows.join("")}
                    </div>
                ` : ""}

                ${playlist.length ? `
                    <div style="padding:8px 16px 4px;font-size:11px;color:var(--text-3);text-transform:uppercase;letter-spacing:1px;">Próxima de ${playlistName}</div>
                    <div id="unified-queue-playlist">
                        ${playlistRows.join("")}
                    </div>
                ` : ""}
            </div>`;

        panel.querySelector("#panel-close").addEventListener("click", toggle);
        _initDrag();
    }

    function _unifiedRow(track, i) {
        return `
            <div class="queue-track-row" data-unified-idx="${i}" data-qtype="${track._qtype}" data-spotify-id="${track.spotify_id}" draggable="true" style="cursor:pointer;">
                <span class="queue-drag-handle" title="Arrastar">⠿</span>
                <img src="${coverUrl(track.spotify_id)}" style="width:36px;height:36px;border-radius:4px;object-fit:cover;background:var(--bg-3);flex-shrink:0;" onerror="this.style.opacity='0.2'">
                <div style="flex:1;min-width:0;">
                    <div style="font-size:13px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${track.title}</div>
                    <div style="font-size:11px;color:var(--text-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${track.artist}</div>
                </div>
                <button class="ctrl-btn" style="font-size:12px;flex-shrink:0;" data-remove-idx="${i}">✕</button>
            </div>`;
    }

    function _currentRow(track) {
        return `
            <div class="queue-track-row" style="background:#1a1200;cursor:default;">
                <img src="${coverUrl(track.spotify_id)}" style="width:36px;height:36px;border-radius:4px;object-fit:cover;background:var(--bg-3);flex-shrink:0;" onerror="this.style.opacity='0.2'">
                <div style="flex:1;min-width:0;">
                    <div style="font-size:13px;color:var(--accent);font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${track.title}</div>
                    <div style="font-size:11px;color:var(--text-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${track.artist}</div>
                </div>
            </div>`;
    }

    function _manualRow(track, i) {
        return `
            <div class="queue-track-row" data-manual-idx="${i}" draggable="true">
                <span class="queue-drag-handle" title="Arrastar">⠿</span>
                <img src="${coverUrl(track.spotify_id)}" style="width:36px;height:36px;border-radius:4px;object-fit:cover;background:var(--bg-3);flex-shrink:0;" onerror="this.style.opacity='0.2'">
                <div style="flex:1;min-width:0;">
                    <div style="font-size:13px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${track.title}</div>
                    <div style="font-size:11px;color:var(--text-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${track.artist}</div>
                </div>
                <button class="ctrl-btn" style="font-size:12px;flex-shrink:0;" data-remove="${i}">✕</button>
            </div>`;
    }

    function _playlistRow(track) {
        return `
            <div class="queue-track-row" data-pl-id="${track.spotify_id}" style="cursor:pointer;">
                <img src="${coverUrl(track.spotify_id)}" style="width:36px;height:36px;border-radius:4px;object-fit:cover;background:var(--bg-3);flex-shrink:0;" onerror="this.style.opacity='0.2'">
                <div style="flex:1;min-width:0;">
                    <div style="font-size:13px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${track.title}</div>
                    <div style="font-size:11px;color:var(--text-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${track.artist}</div>
                </div>
            </div>`;
    }

    function _initClicksAndDrag() {
        document.querySelectorAll("[data-pl-id]").forEach(row => {
            row.addEventListener("click", () => playFromQueue(row.dataset.plId, null));
        });

        const container = document.getElementById("manual-queue");
        if (!container) return;

        container.addEventListener("click", (e) => {
            const removeBtn = e.target.closest("[data-remove]");
            const row       = e.target.closest("[data-manual-idx]");
            if (removeBtn) {
                e.stopPropagation();
                Queue.removeFromManual(parseInt(removeBtn.dataset.remove));
                render();
                return;
            }
            if (row && !e.target.closest(".queue-drag-handle")) {
                playFromQueue(null, parseInt(row.dataset.manualIdx));
            }
        });

        // drag and drop direto nas rows
        container.querySelectorAll("[data-manual-idx]").forEach(row => {
            row.addEventListener("dragstart", (e) => {
                dragFromIdx = parseInt(row.dataset.manualIdx);
                row.classList.add("dragging");
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", String(dragFromIdx));
            });

            row.addEventListener("dragend", () => {
                container.querySelectorAll(".dragging, .drag-over").forEach(el => {
                    el.classList.remove("dragging", "drag-over");
                });
                dragFromIdx = null;
            });

            row.addEventListener("dragover", (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                const toIdx = parseInt(row.dataset.manualIdx);
                if (toIdx !== dragFromIdx) {
                    container.querySelectorAll(".drag-over").forEach(el => el.classList.remove("drag-over"));
                    row.classList.add("drag-over");
                }
            });

            row.addEventListener("drop", (e) => {
                e.preventDefault();
                const toIdx = parseInt(row.dataset.manualIdx);
                if (dragFromIdx === null || dragFromIdx === toIdx) return;
                Queue.moveManual(dragFromIdx, toIdx);
                dragFromIdx = null;
                render();
            });
        });
    }

    function playFromQueue(spotifyId, manualIndex) {
        if (manualIndex !== null && manualIndex !== undefined) {
            const track = Queue.getUpcoming().manual[manualIndex];
            Queue.removeFromManual(manualIndex);
            Player.play(track);
        } else {
            const idx = Queue.playlistTracks.findIndex(t => t.spotify_id === spotifyId);
            if (idx >= 0) {
                Queue.playAt(idx, true);
                Player.play(Queue.getCurrent());
            }
        }
        highlightCurrentTrack();
        render();
    }

    return { toggle, render, playFromQueue };
})();

// ========================
// shuffle
// ========================

function toggleShuffle() {
    const on = Queue.toggleShuffle();
    const color = on ? "var(--accent)" : "var(--text-3)";
    document.getElementById("btn-shuffle").style.color = color;
    const mobile = document.getElementById("btn-shuffle-mobile");
    if (mobile) mobile.style.color = color;
    QueuePanel.render();
}

// ========================
// downloads
// ========================

let sseSource = null;

function initDownloads() {
    if (sseSource) sseSource.close();
    sseSource = new EventSource(queueStreamUrl());
    sseSource.onmessage = (e) => {
        const d = JSON.parse(e.data);
        const pending     = d.pending     || 0;
        const downloading = d.downloading || 0;
        const done        = d.done        || 0;
        const failed      = d.failed      || 0;

        document.getElementById("dl-pending").textContent     = pending;
        document.getElementById("dl-downloading").textContent = downloading;
        document.getElementById("dl-done").textContent        = done;
        document.getElementById("dl-failed").textContent      = failed;

        const currentEl = document.getElementById("dl-current");
        if (d.current) {
            currentEl.style.display = "block";
            document.getElementById("dl-current-track").textContent =
                `${d.current.title} — ${d.current.artist}`;
        } else {
            currentEl.style.display = "none";
        }

        // atualiza barra de progresso na sidebar
        _updateSidebarProgress(pending, downloading, done, failed, d.current);
    };
}

function _updateSidebarProgress(pending, downloading, done, failed, current) {
    const container = document.getElementById("dl-progress-bar-container");
    const total     = pending + downloading + done + failed;

    if (total === 0 || (pending === 0 && downloading === 0)) {
        container.style.display = "none";
        return;
    }

    container.style.display = "block";

    const pct  = total > 0 ? Math.round((done / total) * 100) : 0;
    const fill = document.getElementById("dl-progress-fill");
    const text = document.getElementById("dl-progress-text");
    const pctEl= document.getElementById("dl-progress-pct");

    fill.style.width = `${pct}%`;
    pctEl.textContent = `${pct}%`;

    if (current) {
        // trunca o nome se for muito longo
        const name = current.title.length > 20
            ? current.title.slice(0, 20) + "…"
            : current.title;
        text.textContent = `↓ ${name}`;
    } else if (pending > 0) {
        text.textContent = `${pending} na fila`;
    } else {
        text.textContent = "Concluído";
    }
}

// ========================
// manage
// ========================

async function initManage() {
    const cfg = await fetchConfig();
    document.getElementById("cfg-host").value          = cfg.host;
    document.getElementById("cfg-port").value          = cfg.port;
    document.getElementById("cfg-browser").value       = cfg.yt_dlp_browser;
    document.getElementById("cfg-client-id").value     = cfg.client_id;
    document.getElementById("cfg-client-secret").value = cfg.client_secret;
    const failed   = await fetchFailed();
    const failedEl = document.getElementById("failed-list");
    failedEl.innerHTML = !failed.length
        ? "<p style='color:var(--text-3);font-size:13px;'>Nenhum.</p>"
        : `<table class="manage-table">
            <thead><tr><th>Título</th><th>Artista</th><th>Erro</th><th>URL Manual</th></tr></thead>
            <tbody>${failed.map(f => `
                <tr>
                    <td>${f.title}</td>
                    <td>${f.artist}</td>
                    <td style="color:var(--danger);max-width:200px;overflow:hidden;text-overflow:ellipsis;">${f.error_msg || "—"}</td>
                    <td style="display:flex;gap:6px;">
                        <input class="url-input" placeholder="youtube.com/watch?v=..." id="url-${f.spotify_id}" style="width:200px;" autocomplete="off">
                        <button class="btn btn-accent" onclick="submitUrl('${f.spotify_id}')">Baixar</button>
                    </td>
                </tr>`).join("")}
            </tbody>
           </table>`;

    const orphans  = await fetchOrphans();
    const orphanEl = document.getElementById("orphan-list");
    orphanEl.innerHTML = !orphans.length
        ? "<p style='color:var(--text-3);font-size:13px;'>Nenhuma.</p>"
        : `<table class="manage-table">
            <thead>
                <tr>
                    <th></th>
                    <th>Título</th>
                    <th>Artista</th>
                    <th>Arquivo</th>
                    <th></th>
                </tr>
            </thead>
            <tbody>
                ${orphans.map(t => `
                    <tr id="orphan-row-${t.spotify_id}">
                        <td><img src="${coverUrl(t.spotify_id)}" style="width:36px;height:36px;border-radius:4px;object-fit:cover;background:var(--bg-3);" onerror="this.style.opacity='0.2'"></td>
                        <td style="color:var(--text);">${t.title}</td>
                        <td>${t.artist}</td>
                        <td>
                            ${t.downloaded
                                ? `<span style="color:var(--success);font-size:12px;"><i class="fa-solid fa-check"></i> baixada</span>`
                                : `<span style="color:var(--text-3);font-size:12px;">não baixada</span>`}
                        </td>
                        <td style="display:flex;gap:6px;">
                            <button class="btn btn-danger-solid" onclick="deleteOrphan('${t.spotify_id}', false)">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                            ${t.downloaded ? `
                            <button class="btn btn-danger-solid" onclick="deleteOrphan('${t.spotify_id}', true)" title="Remover + arquivo">
                                <i class="fa-solid fa-hard-drive"></i>
                            </button>` : ""}
                        </td>
                    </tr>`).join("")}
            </tbody>
        </table>
        <p style="font-size:12px;color:var(--text-3);margin-top:8px;">${orphans.length} track${orphans.length !== 1 ? "s" : ""} órfã${orphans.length !== 1 ? "s" : ""}</p>`;
}

async function deleteOrphan(spotifyId, withFiles) {
    const ok = await showConfirm({
        title: withFiles ? "Remover track e arquivo" : "Remover track",
        body:  withFiles
            ? "Remove a track do banco <strong>e apaga o arquivo mp3</strong>."
            : "Remove a track do banco. O arquivo mp3 não será apagado.",
        confirmLabel: "Remover",
        danger: true,
    });
    if (!ok) return;

    const result = await deleteOrphanTrack(spotifyId, withFiles);
    if (result.status === "ok") {
        document.getElementById(`orphan-row-${spotifyId}`)?.remove();
    } else {
        alert("Erro: " + result.error);
    }
}

async function submitUrl(spotifyId) {
    const input = document.getElementById(`url-${spotifyId}`);
    const url   = input.value.trim();
    if (!url) return;
    input.disabled = true;
    const result = await setTrackUrl(spotifyId, url);
    if (result.status === "ok") {
        input.closest("tr").style.opacity = "0.4";
    } else {
        alert("Erro: " + (result.error || "falhou"));
        input.disabled = false;
    }
}

async function retryFailed() {
    await retryFailedApi();
    showView("downloads");
}

async function deleteOrphans() {
    if (!confirm("Remover tracks órfãs do banco?")) return;
    const r = await deleteOrphansApi(false);
    alert(`Removidas: ${r.deleted_tracks}`);
    initManage();
}

async function deleteOrphansWithFiles() {
    if (!confirm("Remover tracks órfãs e os arquivos de áudio?")) return;
    const r = await deleteOrphansApi(true);
    alert(`Removidas: ${r.deleted_tracks} tracks, ${r.deleted_files} arquivos`);
    initManage();
}

// ========================
// add playlist
// ========================

function extractPlaylistId(input) {
    input = input.trim();
    const match = input.match(/playlist\/([a-zA-Z0-9]+)/);
    if (match) return match[1];
    if (/^[a-zA-Z0-9]{22}$/.test(input)) return input;
    return null;
}

document.getElementById("btn-preview-playlist").addEventListener("click", async () => {
    const input  = document.getElementById("add-playlist-input").value;
    const id     = extractPlaylistId(input);
    const status = document.getElementById("add-playlist-status");
    if (!id) {
        status.style.color = "var(--danger)";
        status.textContent = "URL ou ID inválido.";
        return;
    }
    status.style.color = "var(--text-3)";
    status.textContent = "Buscando...";
    try {
        const data = await fetchPlaylistPreview(id);
        if (data.error) throw new Error(data.error);
        document.getElementById("preview-name").textContent  = data.name;
        document.getElementById("preview-meta").textContent  = `${data.total_tracks} músicas · ${data.owner}`;
        document.getElementById("preview-cover").src         = data.cover_url || "";
        document.getElementById("add-playlist-preview").style.display = "flex";
        document.getElementById("btn-confirm-add").style.display      = "inline-block";
        document.getElementById("btn-confirm-add").dataset.id         = id;
        status.textContent = "";
    } catch (e) {
        status.style.color = "var(--danger)";
        status.textContent = `Erro: ${e.message}`;
    }
});

document.getElementById("btn-confirm-add").addEventListener("click", async () => {
    const id     = document.getElementById("btn-confirm-add").dataset.id;
    const status = document.getElementById("add-playlist-status");
    status.style.color = "var(--text-3)";
    status.textContent = "Sincronizando...";
    document.getElementById("btn-confirm-add").disabled = true;
    try {
        const result = await addPlaylist(id);
        status.style.color = "var(--success)";
        status.textContent = `✓ ${result.playlist} adicionada — ${result.added} músicas novas.`;
        await loadSidebar();
        setTimeout(() => {
            document.getElementById("add-playlist-input").value            = "";
            document.getElementById("add-playlist-preview").style.display = "none";
            document.getElementById("btn-confirm-add").style.display      = "none";
            document.getElementById("btn-confirm-add").disabled           = false;
            status.textContent = "";
            openPlaylist(id, result.playlist);
        }, 2000);
    } catch (e) {
        status.style.color = "var(--danger)";
        status.textContent = `Erro: ${e.message}`;
        document.getElementById("btn-confirm-add").disabled = false;
    }
});

async function openAllTracks() {
    document.getElementById("main").classList.remove("show-search");
    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
    document.getElementById("view-search").classList.add("active");

    const titleEl = document.getElementById("search-results-title");
    const list    = document.getElementById("search-results-list");

    titleEl.textContent = "Carregando...";
    list.innerHTML      = "";
    list.style.height   = "0px";

    const tracks = await fetchAllTracks();
    const downloadedTracks = tracks.filter(t => t.downloaded);

    titleEl.textContent = `Todas as músicas — ${tracks.length} no total`;
    list.style.position = "relative";
    list.style.height   = `${tracks.length * getItemHeight()}px`;

    tracks.forEach((track, i) => {
        const el = document.createElement("div");
        el.className         = "track-item" + (track.downloaded ? "" : " track-not-downloaded");
        el.dataset.spotifyId = track.spotify_id;
        el.style.cssText     = `position:absolute;top:${i * getItemHeight()}px;width:100%;`;
        el.innerHTML = `
            <div class="track-num">${i + 1}</div>
            <img class="track-cover" src="${coverUrl(track.spotify_id)}" loading="lazy" onerror="this.style.opacity='0.2'">
            <div>
                <div class="track-title">${track.title}</div>
                <div class="track-artist">${track.artist}</div>
            </div>
            <div class="track-album">${track.album}</div>
            <div class="track-plays" style="font-size:12px;color:var(--text-3);">${track.play_count || 0}</div>
            <div class="track-duration">${formatDuration(track.duration_ms)}</div>
            <div class="track-actions">
                <button class="track-dots" data-spotify-id="${track.spotify_id}" data-yt-url="${track.youtube_url || ''}">···</button>
            </div>`;

        if (track.downloaded) {
            el.addEventListener("click", () => {
                Queue.loadPlaylist(downloadedTracks, "all");
                const qi = downloadedTracks.findIndex(t => t.spotify_id === track.spotify_id);
                Queue.playAt(qi, true);
                Player.play(Queue.getCurrent());
                highlightCurrentTrack();
            });
        }

        el.querySelector(".track-dots").addEventListener("click", (evt) => {
            evt.stopPropagation();
            openTrackPopup(evt.currentTarget, track);
        });

        list.appendChild(el);
    });
}

// ========================
// restore state
// ========================

async function restoreState() {
    const playlistId   = localStorage.getItem("sonar_playlist_id");
    const playlistName = localStorage.getItem("sonar_playlist_name");
    const savedTime    = parseInt(localStorage.getItem("sonar_time") || "0");

    if (!playlistId) {
        document.getElementById("main").classList.add("show-search");
        return;
    }

    await openPlaylist(playlistId, playlistName);

    const restored = Queue.restore();

    const btnShuffle = document.getElementById("btn-shuffle");
    const btnLoop    = document.getElementById("btn-loop");

    if (btnShuffle) {
        const color = Queue.shuffleOn ? "var(--accent)" : "var(--text-3)";
        btnShuffle.style.color = color;
        const mobile = document.getElementById("btn-shuffle-mobile");
        if (mobile) mobile.style.color = color;
    }
    if (btnLoop) {
        _updateLoopUI(Queue.loopPlaylist);
        const mobile = document.getElementById("btn-loop-mobile");
        if (mobile) {
            mobile.style.color      = Queue.loopPlaylist ? "var(--accent)" : "var(--text-2)";
            mobile.style.textShadow = Queue.loopPlaylist ? "0 0 8px rgba(245,166,35,0.5)" : "none";
        }
    }

    if (!restored) return;

    const track = Queue.getCurrent();
    if (!track) return;

    const audio = document.getElementById("audio");
    audio.src   = `${API}/media/track/${track.spotify_id}/audio`;
    audio.addEventListener("loadedmetadata", () => {
        audio.currentTime = savedTime;
        document.getElementById("time-total").textContent   = formatDuration(track.duration_ms);
        document.getElementById("time-current").textContent = formatDuration(savedTime * 1000);
    }, { once: true });

    document.getElementById("player-title").textContent  = track.title;
    document.getElementById("player-artist").textContent = track.artist;
    document.getElementById("player-cover").src          = coverUrl(track.spotify_id);

    const miniCover  = document.getElementById("player-cover-mini");
    const fullCover  = document.getElementById("player-cover-full");
    const miniTitle  = document.getElementById("player-title-mini");
    const fullTitle  = document.getElementById("player-title-full");
    const miniArtist = document.getElementById("player-artist-mini");
    const fullArtist = document.getElementById("player-artist-full");

    if (miniCover)  miniCover.src  = fullCover.src  = coverUrl(track.spotify_id);
    if (miniTitle)  miniTitle.textContent  = fullTitle.textContent  = track.title;
    if (miniArtist) miniArtist.textContent = fullArtist.textContent = track.artist;

    setTimeout(highlightCurrentTrack, 300);
}

function showConfirm({ title, body, confirmLabel = "Confirmar", danger = false }) {
    return new Promise((resolve) => {
        const overlay = document.createElement("div");
        overlay.className = "modal-overlay";
        overlay.innerHTML = `
            <div class="modal">
                <div class="modal-title">${title}</div>
                <div class="modal-body">${body}</div>
                <div class="modal-actions">
                    <button class="btn" id="modal-cancel">Cancelar</button>
                    <button class="btn ${danger ? 'btn-danger-solid' : 'btn-accent'}" id="modal-confirm">${confirmLabel}</button>
                </div>
            </div>`;

        document.body.appendChild(overlay);

        overlay.querySelector("#modal-cancel").addEventListener("click", () => {
            overlay.remove();
            resolve(false);
        });

        overlay.querySelector("#modal-confirm").addEventListener("click", () => {
            overlay.remove();
            resolve(true);
        });

        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) {
                overlay.remove();
                resolve(false);
            }
        });
    });
}

// ========================
// init
// ========================

function initSearch() {
    let searchDebounce = null;
 
    document.getElementById("search-input").addEventListener("input", (e) => {
        const query = e.target.value.trim();
 
        if (!query) {
            showView("playlists");
            return;
        }
 
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(async () => {
            document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
            document.getElementById("view-search").classList.add("active");
 
            const titleEl = document.getElementById("search-results-title");
            const list    = document.getElementById("search-results-list");
 
            titleEl.textContent = `Buscando "${query}"...`;
            list.innerHTML      = "";
            list.style.position = "relative";
            list.style.height   = "0px";
 
            const tracks = await fetchTrackSearch(query);
 
            titleEl.textContent = tracks.length
                ? `${tracks.length} resultado${tracks.length !== 1 ? "s" : ""} para "${query}"`
                : `Nenhum resultado para "${query}"`;
 
            list.style.height = `${tracks.length * getItemHeight()}px`;
 
            const downloadedTracks = tracks.filter(t => t.downloaded);
 
            tracks.forEach((track, i) => {
                const el = document.createElement("div");
                el.className         = "track-item" + (track.downloaded ? "" : " track-not-downloaded");
                el.dataset.spotifyId = track.spotify_id;
                el.style.cssText     = `position:absolute;top:${i * getItemHeight()}px;width:100%;`;
                el.innerHTML = `
                    <div class="track-num">${i + 1}</div>
                    <img class="track-cover" src="${coverUrl(track.spotify_id)}" loading="lazy" onerror="this.style.opacity='0.2'">
                    <div>
                        <div class="track-title">${track.title}</div>
                        <div class="track-artist">${track.artist}</div>
                    </div>
                    <div class="track-album">${track.album}</div>
                    <div class="track-plays" style="font-size:12px;color:var(--text-3);">${track.play_count || 0}</div>
                    <div class="track-duration">${formatDuration(track.duration_ms)}</div>
                    <div class="track-actions">
                        <button class="track-dots" data-spotify-id="${track.spotify_id}" data-yt-url="${track.youtube_url || ''}">···</button>
                    </div>`;
 
                if (track.downloaded) {
                    el.addEventListener("click", () => {
                        Queue.loadPlaylist(downloadedTracks, "search");
                        const qi = downloadedTracks.findIndex(t => t.spotify_id === track.spotify_id);
                        Queue.playAt(qi, true);
                        Player.play(Queue.getCurrent());
                        highlightCurrentTrack();
                    });
                }
 
                el.querySelector(".track-dots").addEventListener("click", (evt) => {
                    evt.stopPropagation();
                    openTrackPopup(evt.currentTarget, track);
                });
 
                list.appendChild(el);
            });
        }, 300);
    });
 
    document.getElementById("search-input").addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            e.target.value = "";
            e.target.dispatchEvent(new Event("input"));
            e.target.blur();
        }
    });
}

async function saveSettings() {
    const status = document.getElementById("cfg-status");
    const data = {
        host:            document.getElementById("cfg-host").value.trim(),
        port:            parseInt(document.getElementById("cfg-port").value),
        yt_dlp_browser:  document.getElementById("cfg-browser").value.trim(),
        client_id:       document.getElementById("cfg-client-id").value.trim(),
        client_secret:   document.getElementById("cfg-client-secret").value.trim(),
    };
    status.textContent = "Salvando...";
    status.style.color = "var(--text-3)";
    const result = await saveConfig(data);
    if (result.status === "ok") {
        status.textContent = "✓ Salvo";
        status.style.color = "var(--success)";
        setTimeout(() => status.textContent = "", 3000);
    } else {
        status.textContent = "Erro ao salvar";
        status.style.color = "var(--danger)";
    }
}

function togglePlayerExpand() {
    const player = document.getElementById("player");
    player.classList.toggle("expanded");
}

function isMobile() {
    return window.innerWidth <= 768;
}

document.addEventListener("DOMContentLoaded", () => {
    loadSidebar().then(() => restoreState());
    initDownloads();
    initSearch();

    document.getElementById("progress-bar-full")?.addEventListener("click", (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        Player.seek((e.clientX - rect.left) / rect.width);
    });
});
