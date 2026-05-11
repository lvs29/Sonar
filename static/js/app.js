// static/js/app.js

// ========================
// helpers
// ========================

function decodeHtml(str) {
    if (!str) return "";
    const txt = document.createElement("textarea");
    txt.innerHTML = str;
    return txt.value;
}

function showConfirm(options) {
    return new Promise((resolve) => {
        const modal = document.getElementById("confirm-modal");
        const titleEl = document.getElementById("confirm-title");
        const bodyEl = document.getElementById("confirm-body");
        const okBtn = document.getElementById("confirm-ok");
        const cancelBtn = document.getElementById("confirm-cancel");

        // suporta tanto string quanto objeto
        if (typeof options === "string") {
            titleEl.textContent = "Confirmação";
            bodyEl.textContent = options;
            okBtn.textContent = "Confirmar";
            okBtn.className = "btn btn-accent";
        } else {
            titleEl.textContent = options.title || "Confirmação";
            bodyEl.innerHTML = options.body || options.message || "";
            okBtn.textContent = options.confirmLabel || "Confirmar";
            okBtn.className = options.danger ? "btn btn-danger-solid" : "btn btn-accent";
        }

        modal.style.display = "flex";

        const cleanup = () => {
            modal.style.display = "none";
            okBtn.removeEventListener("click", onOk);
            cancelBtn.removeEventListener("click", onCancel);
        };

        const onOk = () => {
            cleanup();
            resolve(true);
        };

        const onCancel = () => {
            cleanup();
            resolve(false);
        };

        okBtn.addEventListener("click", onOk);
        cancelBtn.addEventListener("click", onCancel);
    });
}

// ========================
// navegação
// ========================

function showView(name) {
    closeAllPopups();

    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
    const el = document.getElementById(`view-${name}`);
    if (el) el.classList.add("active");

    document.querySelectorAll(".nav-item[data-view]").forEach(n => {
        n.classList.toggle("active", n.dataset.view === name);
    });

    document.querySelectorAll(".bottom-nav-item[data-view]").forEach(n => {
        n.classList.toggle("active", n.dataset.view === name);
    });

    // limpa o background do header se não for playlist
    if (name !== "playlist") {
        document.documentElement.style.removeProperty("--playlist-cover");
    }

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
        el.dataset.playlistId = pl.id;
        el.innerHTML = `
            <img class="sidebar-playlist-cover"
                 src="/library/playlist/${pl.id}/cover"
                 onerror="this.style.opacity='0'">
            <span class="sidebar-playlist-name">${pl.name}</span>
        `;
        el.addEventListener("click", () => openPlaylist(pl.id, pl.name));
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
             onclick="openPlaylist('${featured.id}', '${featured.name.replace(/'/g, "\\'")}')">
            <img src="/library/playlist/${featured.id}/cover"
                 onerror="this.style.display='none'"
                 style="width:100px;height:100px;border-radius:8px;object-fit:cover;background:var(--bg-3);flex-shrink:0;">
            <div>
                <div style="font-size:11px;color:var(--accent);text-transform:uppercase;letter-spacing:2px;margin-bottom:6px;">Playlist</div>
                <div style="font-size:24px;font-weight:700;color:var(--text);margin-bottom:6px;">${featured.name}</div>
                <button class="btn btn-accent" style="margin-top:12px;"
                        onclick="event.stopPropagation();openPlaylist('${featured.id}','${featured.name.replace(/'/g, "\\'")}')">Abrir</button>
            </div>
        </div>`;

    const homeList = document.getElementById("home-list");
    homeList.innerHTML = "";
    playlists.slice(1).forEach(pl => {
        const el = document.createElement("div");
        el.style.cssText = "display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:8px;cursor:pointer;border:1px solid var(--border);background:var(--bg-2);transition:background 0.15s;";
        el.innerHTML = `
            <img src="/library/playlist/${pl.id}/cover"
                 onerror="this.style.opacity='0'"
                 style="width:44px;height:44px;border-radius:6px;object-fit:cover;background:var(--bg-3);flex-shrink:0;">
            <div>
                <div style="font-size:13px;font-weight:500;color:var(--text);">${pl.name}</div>
            </div>`;
        el.addEventListener("mouseover", () => el.style.background = "var(--bg-hover)");
        el.addEventListener("mouseout",  () => el.style.background = "var(--bg-2)");
        el.addEventListener("click", () => openPlaylist(pl.id, pl.name));
        homeList.appendChild(el);
    });
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

    // define a capa como background do header
    document.documentElement.style.setProperty("--playlist-cover", `url('/library/playlist/${playlistId}/cover')`);
 
    document.getElementById("pl-actions").innerHTML = `
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button class="btn" id="btn-edit">
                <i class="fa-solid fa-image"></i> Editar
            </button>
            <button class="btn btn-danger-solid" id="btn-delete-playlist">
                <i class="fa-solid fa-trash"></i> Remover playlist
            </button>
        </div>`;

    document.getElementById("btn-edit").addEventListener("click", () => {
        openEditCoverModal(playlistId);
    });
 
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
            el.dataset.id = track.id;
            el.style.cssText     = `position:absolute;top:${i * getItemHeight()}px;width:100%;`;

            if (current && current.id === track.id) {
                el.classList.add("playing");
            }

            el.innerHTML = `
                <div class="track-num">${i + 1}</div>
                <img class="track-cover" src="${coverUrl(track.id)}" loading="lazy" onerror="this.style.opacity='0.2'">
                <div>
                    <div class="track-title">${decodeHtml(track.title)}</div>
                    <div class="track-artist">${decodeHtml(track.artist)}</div>
                </div>
                <div class="track-album">${decodeHtml(track.album)}</div>
                <div class="track-plays" style="font-size:12px;color:var(--text-3);">${track.play_count || 0}</div>
                <div class="track-duration">${formatDuration(track.duration_ms)}</div>
                <div class="track-actions">
                    <button class="track-dots" data-id="${track.id}" data-yt-url="${track.youtube_url || ''}">···</button>
                </div>`;

            if (track.downloaded) {
                el.addEventListener("click", () => {
                    if (Queue.currentPlaylistId !== thisPlaylistId) {
                        Queue.loadPlaylist(downloadedTracks, thisPlaylistId);
                    }
                    const qi = downloadedTracks.findIndex(t => t.id === track.id);
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
                el.classList.toggle("playing", el.dataset.id === cur.id);
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

function openEditCoverModal(playlistId) {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
        <div class="modal">
            <div class="modal-title">Editar capa</div>
            <div class="modal-body">
                <div style="margin-bottom:16px;">
                    <div style="font-size:12px;color:var(--text-3);margin-bottom:6px;text-transform:uppercase;letter-spacing:1px;">URL de imagem</div>
                    <input id="cover-url-input" class="url-input" style="width:100%;" placeholder="https://..." autocomplete="off">
                </div>
                <div style="display:flex;align-items:center;gap:12px;">
                    <div style="flex:1;height:1px;background:var(--border);"></div>
                    <span style="font-size:12px;color:var(--text-3);">ou</span>
                    <div style="flex:1;height:1px;background:var(--border);"></div>
                </div>
                <div style="margin-top:16px;">
                    <button class="btn" id="btn-upload-cover">
                        <i class="fa-solid fa-upload"></i> Enviar arquivo
                    </button>
                    <input type="file" id="cover-file-input" accept=".jpg,.jpeg,.png,.webp" style="display:none;">
                    <span id="cover-file-name" style="font-size:13px;color:var(--text-3);margin-left:12px;"></span>
                </div>
            </div>
            <div class="modal-actions">
                <button class="btn" id="modal-cancel">Cancelar</button>
                <button class="btn btn-accent" id="modal-confirm">Salvar</button>
            </div>
        </div>`;

    document.body.appendChild(overlay);

    let selectedFile = null;

    overlay.querySelector("#btn-upload-cover").addEventListener("click", () => {
        overlay.querySelector("#cover-file-input").click();
    });

    overlay.querySelector("#cover-file-input").addEventListener("change", (e) => {
        selectedFile = e.target.files[0];
        overlay.querySelector("#cover-file-name").textContent = selectedFile?.name || "";
    });

    overlay.querySelector("#modal-cancel").addEventListener("click", () => overlay.remove());

    overlay.querySelector("#modal-confirm").addEventListener("click", async () => {
        const url = overlay.querySelector("#cover-url-input").value.trim();
        overlay.remove();

        let result;
        if (selectedFile) {
            result = await uploadPlaylistCover(playlistId, selectedFile);
        } else if (url) {
            result = await setPlaylistCoverUrl(playlistId, url);
        } else {
            return;
        }

        if (result.status === "ok") {
            // força reload da capa adicionando timestamp
            const cover = document.getElementById("pl-cover");
            cover.src = `/library/playlist/${playlistId}/cover?t=${Date.now()}`;
        } else {
            alert("Erro: " + result.error);
        }
    });

    overlay.addEventListener("click", (e) => {
        if (e.target === overlay) overlay.remove();
    });
}

function highlightTrack(id) {
    document.querySelectorAll(".track-item").forEach(el => {
        el.classList.toggle("playing", el.dataset.id === id);
    });
}

function highlightCurrentTrack() {
    const current = Queue.getCurrent();
    if (current) highlightTrack(current.id);
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
    popup.style.cssText = `
        position: fixed;
        background: #1e1e1e;
        border: 1px solid var(--border);
        border-radius: 8px;
        padding: 4px 0;
        z-index: 1000;
        min-width: 220px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.5);
    `;

    const rect = btn.getBoundingClientRect();
    popup.style.top   = `${rect.bottom + 4}px`;
    popup.style.right = `${window.innerWidth - rect.right}px`;

    popup.innerHTML = `
        <div class="ctx-item" id="ctx-queue">
            <i class="fa-solid fa-list" style="width:16px;"></i> Adicionar à fila
        </div>
        <div class="ctx-item ctx-has-sub" id="ctx-playlist">
            <i class="fa-solid fa-music" style="width:16px;"></i> Adicionar à playlist
            <i class="fa-solid fa-chevron-right" style="margin-left:auto;font-size:10px;"></i>
        </div>
        <div class="ctx-item ctx-has-sub" id="ctx-edit">
            <i class="fa-solid fa-pen" style="width:16px;"></i> Editar informações
            <i class="fa-solid fa-chevron-right" style="margin-left:auto;font-size:10px;"></i>
        </div>
        <div class="ctx-item ctx-has-sub" id="ctx-source">
            <i class="fa-solid fa-file-audio" style="width:16px;"></i> Mudar arquivo da faixa
            <i class="fa-solid fa-chevron-right" style="margin-left:auto;font-size:10px;"></i>
        </div>
        <div style="border-top:1px solid var(--border);margin:4px 0;"></div>
        <div class="ctx-item" id="ctx-delete" style="color:var(--danger);">
            <i class="fa-solid fa-trash" style="width:16px;"></i> Remover do banco
        </div>
    `;

    document.body.appendChild(popup);
    window.requestAnimationFrame(() => {
        const popupRect = popup.getBoundingClientRect();
        let top = rect.bottom + 4;
        if (top + popupRect.height > window.innerHeight - 4) {
            top = Math.max(4, rect.top - popupRect.height - 4);
        }
        popup.style.top = `${top}px`;
    });

    // ========================
    // adicionar à fila
    // ========================
    popup.querySelector("#ctx-queue").addEventListener("click", () => {
        Queue.addToManual(track);
        closeAllPopups();
        QueuePanel.render();
    });

    // ========================
    // submenu: adicionar à playlist
    // ========================
    popup.querySelector("#ctx-playlist").addEventListener("mouseenter", async () => {
        closeSubmenus();
        const playlists = await fetchPlaylists();

        // quais playlists já têm essa track
        const currentPlaylists = await fetch(`${API}/library/track/${track.id}/playlists`)
            .then(r => r.json()).catch(() => []);

        const sub = createSubmenu(popup.querySelector("#ctx-playlist"));
        sub.innerHTML = playlists.map(p => `
            <label class="ctx-item" style="display:flex;align-items:center;gap:10px;cursor:pointer;">
                <input type="checkbox" value="${p.id}" 
                    ${currentPlaylists.includes(p.id) ? "checked" : ""}
                    style="accent-color:var(--accent);width:14px;height:14px;flex-shrink:0;">
                <span>${escapeHtml(p.name)}</span>
            </label>
        `).join("") + `
            <div style="border-top:1px solid var(--border);margin:4px 0;"></div>
            <div class="ctx-item" id="sub-playlist-save">
                <i class="fa-solid fa-check" style="width:16px;"></i> Confirmar
            </div>
        `;

        sub.querySelector("#sub-playlist-save").addEventListener("click", async () => {
            const checked = [...sub.querySelectorAll("input:checked")].map(el => el.value);
            await updateTrackPlaylists(track.id, checked);
            closeAllPopups();
            await loadSidebar();
        });
    });

    // ========================
    // submenu: editar informações
    // ========================
    popup.querySelector("#ctx-edit").addEventListener("mouseenter", () => {
        closeSubmenus();
        const sub = createSubmenu(popup.querySelector("#ctx-edit"));
        sub.innerHTML = `
            <div style="padding:8px 12px;display:flex;flex-direction:column;gap:6px;min-width:240px;">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                    <img id="sub-cover-preview" src="${coverUrl(track.id)}?t=${Date.now()}"
                         style="width:40px;height:40px;border-radius:4px;object-fit:cover;background:var(--bg-3);"
                         onerror="this.style.opacity='0.2'">
                    <div style="display:flex;flex-direction:column;gap:4px;flex:1;">
                        <button class="btn" id="sub-cover-upload" style="font-size:11px;padding:3px 8px;">
                            <i class="fa-solid fa-upload"></i> Capa
                        </button>
                        <input id="sub-cover-url" class="track-popup-input" placeholder="URL da capa..." style="margin:0;font-size:11px;">
                    </div>
                    <input type="file" id="sub-cover-file" accept=".jpg,.jpeg,.png,.webp" style="display:none;">
                </div>
                <input id="sub-title"  class="track-popup-input" placeholder="Título"  value="${escapeHtml(track.title  || '')}">
                <input id="sub-artist" class="track-popup-input" placeholder="Artista" value="${escapeHtml(track.artist || '')}">
                <input id="sub-album"  class="track-popup-input" placeholder="Álbum"   value="${escapeHtml(track.album  || '')}">
                <button class="btn btn-accent" id="sub-edit-save" style="margin-top:4px;">Salvar</button>
            </div>
        `;

        initAutocomplete(sub.querySelector("#sub-artist"), fetchArtists);
        initAutocomplete(sub.querySelector("#sub-album"),  fetchAlbums);

        sub.querySelector("#sub-cover-upload").addEventListener("click", () => {
            sub.querySelector("#sub-cover-file").click();
        });

        sub.querySelector("#sub-cover-file").addEventListener("change", (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (ev) => {
                    sub.querySelector("#sub-cover-preview").src = ev.target.result;
                };
                reader.readAsDataURL(file);
            }
        });

        sub.querySelector("#sub-edit-save").addEventListener("click", async () => {
            const title   = sub.querySelector("#sub-title").value.trim();
            const artist  = sub.querySelector("#sub-artist").value.trim();
            const album   = sub.querySelector("#sub-album").value.trim();
            const coverFile = sub.querySelector("#sub-cover-file").files[0];
            const coverUrl_ = sub.querySelector("#sub-cover-url").value.trim();

            await updateTrack(track.id, { title, artist, album });

            if (coverFile) await uploadTrackCover(track.id, coverFile);
            else if (coverUrl_) await setTrackCoverUrl(track.id, coverUrl_);

            // atualiza na lista
            const trackEl = document.querySelector(`[data-id="${track.id}"]`);
            if (trackEl) {
                trackEl.querySelector(".track-title")?.textContent  != null && (trackEl.querySelector(".track-title").textContent  = title  || track.title);
                trackEl.querySelector(".track-artist")?.textContent != null && (trackEl.querySelector(".track-artist").textContent = artist || track.artist);
                trackEl.querySelector(".track-album")?.textContent  != null && (trackEl.querySelector(".track-album").textContent  = album  || track.album);
                const coverImg = trackEl.querySelector(".track-cover");
                if (coverImg) coverImg.src = `${coverUrl(track.id)}?t=${Date.now()}`;
            }

            closeAllPopups();
        });
    });

    // ========================
    // submenu: mudar arquivo da faixa
    // ========================
    popup.querySelector("#ctx-source").addEventListener("mouseenter", () => {
        closeSubmenus();
        const sub = createSubmenu(popup.querySelector("#ctx-source"));
        sub.innerHTML = `
            <div style="padding:8px 12px;display:flex;flex-direction:column;gap:6px;min-width:260px;">
                <div class="track-popup-label">Link do YouTube</div>
                <div style="display:flex;gap:6px;">
                    <input id="sub-yt-input" class="track-popup-input" style="flex:1;margin:0;"
                           placeholder="youtube.com/watch?v=..." value="${track.youtube_url || ''}">
                    <button class="btn btn-accent" id="sub-yt-save" style="flex-shrink:0;">OK</button>
                </div>
                <div style="border-top:1px solid var(--border);margin:4px 0;"></div>
                <div class="track-popup-label">Arquivo local</div>
                <div style="display:flex;align-items:center;gap:8px;">
                    <button class="btn" id="sub-file-btn" style="font-size:11px;">
                        <i class="fa-solid fa-file-audio"></i> Selecionar
                    </button>
                    <span id="sub-file-name" style="font-size:11px;color:var(--text-3);">Nenhum arquivo</span>
                </div>
                <input type="file" id="sub-file-input" accept=".mp3,.flac,.ogg,.m4a" style="display:none;">
            </div>
        `;

        sub.querySelector("#sub-yt-save").addEventListener("click", async () => {
            const url = sub.querySelector("#sub-yt-input").value.trim();
            if (!url) return;
            await setTrackUrl(track.id, url);
            closeAllPopups();
        });

        sub.querySelector("#sub-file-btn").addEventListener("click", () => {
            sub.querySelector("#sub-file-input").click();
        });

        sub.querySelector("#sub-file-input").addEventListener("change", async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            sub.querySelector("#sub-file-name").textContent = file.name;
            await replaceTrackFile(track.id, file);
            closeAllPopups();
        });
    });

    // ========================
    // remover do banco
    // ========================
    popup.querySelector("#ctx-delete").addEventListener("click", async () => {
        const ok = await showConfirm({
            title: "Remover música",
            body: `Deseja remover "${decodeHtml(track.title)}" do banco de dados? (Música + arquivo)`
        });
        if (!ok) return;
 
        await deleteTrack(track.id, true);
        closeAllPopups();
 
        // recarrega a view atual
        if (currentPlaylistId) {
            await openPlaylist(currentPlaylistId, document.getElementById("pl-name")?.textContent);
        } else {
            const searchInput = document.getElementById("search-input");
            if (searchInput && searchInput.value.trim()) {
                searchInput.dispatchEvent(new Event("input"));
            }
        }
    });
 

    // fecha ao clicar fora
    setTimeout(() => {
        function outsideClick(e) {
            if (!popup.contains(e.target) && !document.querySelector(".ctx-submenu")?.contains(e.target) && e.target !== btn) {
                closeAllPopups();
                document.removeEventListener("click", outsideClick);
            }
        }
        document.addEventListener("click", outsideClick);
    }, 100);

    document.getElementById("main").addEventListener("scroll", closeAllPopups, { once: true });
}

function createSubmenu(parentItem) {
    closeSubmenus();
    const sub = document.createElement("div");
    sub.className  = "ctx-submenu track-popup";
    sub.style.cssText = `
        position: fixed;
        background: #1e1e1e;
        border: 1px solid var(--border);
        border-radius: 8px;
        padding: 4px 0;
        z-index: 1001;
        box-shadow: 0 8px 24px rgba(0,0,0,0.5);
        transform-origin: right top;
    `;

    const rect = parentItem.getBoundingClientRect();
    sub.style.top  = `${rect.top}px`;
    sub.style.left = `${rect.left}px`;
    sub.style.transform = "translateX(-100%)";

    document.body.appendChild(sub);
    window.requestAnimationFrame(() => {
        const subRect = sub.getBoundingClientRect();
        const offset = 4;
        let top = rect.top;
        let left = rect.left;

        if (left - subRect.width - offset >= 0) {
            left = rect.left;
            sub.style.transform = "translateX(-100%)";
        } else {
            left = rect.right + offset;
            sub.style.transform = "none";
        }

        if (top + subRect.height > window.innerHeight - offset) {
            top = Math.max(offset, window.innerHeight - subRect.height - offset);
        }
        if (top < offset) top = offset;

        sub.style.top = `${top}px`;
        sub.style.left = `${left}px`;
    });

    return sub;
}

function closeSubmenus() {
    document.querySelectorAll(".ctx-submenu").forEach(s => s.remove());
}

function closeAllPopups() {
    document.querySelectorAll(".track-popup").forEach(p => {
        const input = p.querySelector("input");
        if (input) { input.value = ""; input.blur(); }
        p.remove();
    });
}

function initAutocomplete(input, fetchFn) {
    let dropdown = null;
    let debounce = null;

    function closeDropdown() {
        if (dropdown) { dropdown.remove(); dropdown = null; }
    }

    function openDropdown(items) {
        closeDropdown();
        if (!items.length) return;

        dropdown = document.createElement("div");
        dropdown.style.cssText = `
            position: fixed;
            background: #1e1e1e;
            border: 1px solid var(--border);
            border-radius: 6px;
            z-index: 2000;
            min-width: ${input.offsetWidth}px;
            box-shadow: 0 4px 16px rgba(0,0,0,0.5);
            overflow: hidden;
        `;

        const rect = input.getBoundingClientRect();
        dropdown.style.top  = `${rect.bottom + 2}px`;
        dropdown.style.left = `${rect.left}px`;

        items.forEach(item => {
            const el = document.createElement("div");
            el.textContent = item;
            el.style.cssText = `
                padding: 8px 12px;
                font-size: 13px;
                color: var(--text-2);
                cursor: pointer;
                transition: background 0.1s;
            `;
            el.addEventListener("mouseenter", () => el.style.background = "var(--bg-hover)");
            el.addEventListener("mouseleave", () => el.style.background = "");
            el.addEventListener("mousedown", (e) => {
                e.preventDefault(); // impede blur antes do click
                input.value = item;
                closeDropdown();
            });
            dropdown.appendChild(el);
        });

        document.body.appendChild(dropdown);
    }

    input.addEventListener("input", () => {
        clearTimeout(debounce);
        debounce = setTimeout(async () => {
            const q = input.value.trim();
            if (!q) { closeDropdown(); return; }
            const items = await fetchFn(q);
            openDropdown(items);
        }, 200);
    });

    input.addEventListener("blur", () => setTimeout(closeDropdown, 150));
    input.addEventListener("keydown", (e) => {
        if (e.key === "Escape") closeDropdown();
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
            <div class="queue-track-row" data-unified-idx="${i}" data-qtype="${track._qtype}" data-id="${track.id}" draggable="true" style="cursor:pointer;">
                <span class="queue-drag-handle" title="Arrastar">⠿</span>
                <img src="${coverUrl(track.id)}" style="width:36px;height:36px;border-radius:4px;object-fit:cover;background:var(--bg-3);flex-shrink:0;" onerror="this.style.opacity='0.2'">
                <div style="flex:1;min-width:0;">
                    <div style="font-size:13px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${decodeHtml(track.title)}</div>
                    <div style="font-size:11px;color:var(--text-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${decodeHtml(track.artist)}</div>
                </div>
                <button class="ctrl-btn" style="font-size:12px;flex-shrink:0;" data-remove-idx="${i}">✕</button>
            </div>`;
    }

    function _currentRow(track) {
        return `
            <div class="queue-track-row" style="background:#1a1200;cursor:default;">
                <img src="${coverUrl(track.id)}" style="width:36px;height:36px;border-radius:4px;object-fit:cover;background:var(--bg-3);flex-shrink:0;" onerror="this.style.opacity='0.2'">
                <div style="flex:1;min-width:0;">
                    <div style="font-size:13px;color:var(--accent);font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${decodeHtml(track.title)}</div>
                    <div style="font-size:11px;color:var(--text-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${decodeHtml(track.artist)}</div>
                </div>
            </div>`;
    }

    function _manualRow(track, i) {
        return `
            <div class="queue-track-row" data-manual-idx="${i}" draggable="true">
                <span class="queue-drag-handle" title="Arrastar">⠿</span>
                <img src="${coverUrl(track.id)}" style="width:36px;height:36px;border-radius:4px;object-fit:cover;background:var(--bg-3);flex-shrink:0;" onerror="this.style.opacity='0.2'">
                <div style="flex:1;min-width:0;">
                    <div style="font-size:13px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${decodeHtml(track.title)}</div>
                    <div style="font-size:11px;color:var(--text-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${decodeHtml(track.artist)}</div>
                </div>
                <button class="ctrl-btn" style="font-size:12px;flex-shrink:0;" data-remove="${i}">✕</button>
            </div>`;
    }

    function _playlistRow(track) {
        return `
            <div class="queue-track-row" data-pl-id="${track.id}" style="cursor:pointer;">
                <img src="${coverUrl(track.id)}" style="width:36px;height:36px;border-radius:4px;object-fit:cover;background:var(--bg-3);flex-shrink:0;" onerror="this.style.opacity='0.2'">
                <div style="flex:1;min-width:0;">
                    <div style="font-size:13px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${decodeHtml(track.title)}</div>
                    <div style="font-size:11px;color:var(--text-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${decodeHtml(track.artist)}</div>
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

    function playFromQueue(id, manualIndex) {
        if (manualIndex !== null && manualIndex !== undefined) {
            const track = Queue.getUpcoming().manual[manualIndex];
            Queue.removeFromManual(manualIndex);
            Player.play(track);
        } else {
            const idx = Queue.playlistTracks.findIndex(t => t.id === id);
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
    const failed   = await fetchFailed();
    const failedEl = document.getElementById("failed-list");
    failedEl.innerHTML = !failed.length
        ? "<p style='color:var(--text-3);font-size:13px;'>Nenhum.</p>"
        : `<table class="manage-table">
            <thead><tr><th>Título</th><th>Artista</th><th>Erro</th><th>URL Manual</th></tr></thead>
            <tbody>${failed.map(f => `
                <tr>
                    <td>${decodeHtml(f.title)}</td>
                    <td>${decodeHtml(f.artist)}</td>
                    <td style="color:var(--danger);max-width:200px;overflow:hidden;text-overflow:ellipsis;">${f.error_msg || "—"}</td>
                    <td style="display:flex;gap:6px;">
                        <input class="url-input" placeholder="youtube.com/watch?v=..." id="url-${f.id}" style="width:200px;" autocomplete="off">
                        <button class="btn btn-accent" onclick="submitUrl('${f.id}')">Baixar</button>
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
                    <tr id="orphan-row-${t.id}">
                        <td><img src="${coverUrl(t.id)}" style="width:36px;height:36px;border-radius:4px;object-fit:cover;background:var(--bg-3);" onerror="this.style.opacity='0.2'"></td>
                        <td style="color:var(--text);">${decodeHtml(t.title)}</td>
                        <td>${decodeHtml(t.artist)}</td>
                        <td>
                            ${t.downloaded
                                ? `<span style="color:var(--success);font-size:12px;"><i class="fa-solid fa-check"></i> baixada</span>`
                                : `<span style="color:var(--text-3);font-size:12px;">não baixada</span>`}
                        </td>
                        <td style="display:flex;gap:6px;">
                            <button class="btn btn-danger-solid" onclick="deleteOrphan('${t.id}', false)">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                            ${t.downloaded ? `
                            <button class="btn btn-danger-solid" onclick="deleteOrphan('${t.id}', true)" title="Remover + arquivo">
                                <i class="fa-solid fa-hard-drive"></i>
                            </button>` : ""}
                        </td>
                    </tr>`).join("")}
            </tbody>
        </table>
        <p style="font-size:12px;color:var(--text-3);margin-top:8px;">${orphans.length} track${orphans.length !== 1 ? "s" : ""} órfã${orphans.length !== 1 ? "s" : ""}</p>`;
}

async function deleteOrphan(id, withFiles) {
    const ok = await showConfirm({
        title: withFiles ? "Remover track e arquivo" : "Remover track",
        body:  withFiles
            ? "Remove a track do banco <strong>e apaga o arquivo mp3</strong>."
            : "Remove a track do banco. O arquivo mp3 não será apagado.",
        confirmLabel: "Remover",
        danger: true,
    });
    if (!ok) return;

    const result = await deleteTrack(id, withFiles);
    if (result.status === "ok") {
        document.getElementById(`orphan-row-${id}`)?.remove();
    } else {
        alert("Erro: " + result.error);
    }
}

async function submitUrl(id) {
    const input = document.getElementById(`url-${id}`);
    const url   = input.value.trim();
    if (!url) return;
    input.disabled = true;
    const result = await setTrackUrl(id, url);
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
    const ok = await showConfirm({
        title: "Remover tracks órfãs",
        body: "Remover tracks órfãs do banco de dados?",
        confirmLabel: "Remover",
        danger: true,
    });
    if (!ok) return;
    const r = await deleteOrphansApi(false);
    alert(`Removidas: ${r.deleted_tracks}`);
    initManage();
}

async function deleteOrphansWithFiles() {
    const ok = await showConfirm({
        title: "Remover tracks órfãs",
        body: "Remover tracks órfãs do banco e os arquivos de áudio?",
        confirmLabel: "Remover",
        danger: true,
    });
    if (!ok) return;
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
        el.dataset.id = track.id;
        el.style.cssText     = `position:absolute;top:${i * getItemHeight()}px;width:100%;`;
        el.innerHTML = `
            <div class="track-num">${i + 1}</div>
            <img class="track-cover" src="${coverUrl(track.id)}" loading="lazy" onerror="this.style.opacity='0.2'">
            <div>
                <div class="track-title">${decodeHtml(track.title)}</div>
                <div class="track-artist">${decodeHtml(track.artist)}</div>
            </div>
            <div class="track-album">${decodeHtml(track.album)}</div>
            <div class="track-plays" style="font-size:12px;color:var(--text-3);">${track.play_count || 0}</div>
            <div class="track-duration">${formatDuration(track.duration_ms)}</div>
            <div class="track-actions">
                <button class="track-dots" data-id="${track.id}" data-yt-url="${track.youtube_url || ''}">···</button>
            </div>`;

        if (track.downloaded) {
            el.addEventListener("click", () => {
                Queue.loadPlaylist(downloadedTracks, "all");
                const qi = downloadedTracks.findIndex(t => t.id === track.id);
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
    audio.src   = `${API}/media/track/${track.id}/audio`;
    audio.addEventListener("loadedmetadata", () => {
        audio.currentTime = savedTime;
        document.getElementById("time-total").textContent   = formatDuration(track.duration_ms);
        document.getElementById("time-current").textContent = formatDuration(savedTime * 1000);
    }, { once: true });

    document.getElementById("player-title").textContent  = decodeHtml(track.title);
    const artistInner = document.getElementById("player-artist-inner");
    if (artistInner) {
        artistInner.textContent = decodeHtml(track.artist);
    }
    document.getElementById("player-cover").src          = coverUrl(track.id);

    // detecta se o texto do artista é maior que o container para habilitar marquee
    const artistContainer = document.getElementById("player-artist");

    if (artistContainer && artistInner) {
        artistContainer.classList.remove("marquee-enabled");

        // Força o browser a recalcular o layout antes de medir
        void artistContainer.offsetWidth;

        const isOverflow = artistInner.scrollWidth > artistContainer.clientWidth;
        if (isOverflow) {
            const distance = artistInner.scrollWidth - artistContainer.clientWidth;
            const speed = 20;
            const duration = distance / speed;
            artistContainer.style.setProperty("--marquee-duration", `${duration}s`);
            artistContainer.style.setProperty("--marquee-distance", `${distance}px`);
            artistContainer.classList.add("marquee-enabled");
        }
    }

    // Media Session API - atualiza metadados ao restaurar estado
    if ("mediaSession" in navigator) {
        const coverUrl = `${API}/media/track/${track.id}/cover`;
        navigator.mediaSession.metadata = new MediaMetadata({
            title: decodeHtml(track.title),
            artist: decodeHtml(track.artist),
            album: track.album || "",
            artwork: [{ src: coverUrl, sizes: "512x512", type: "image/jpeg" }]
        });
        navigator.mediaSession.playbackState = "paused";
    }

    const miniCover  = document.getElementById("player-cover-mini");
    const fullCover  = document.getElementById("player-cover-full");
    const miniTitle  = document.getElementById("player-title-mini");
    const fullTitle  = document.getElementById("player-title-full");
    const miniArtist = document.getElementById("player-artist-mini");
    const fullArtist = document.getElementById("player-artist-full");

    if (miniCover)  miniCover.src  = fullCover.src  = coverUrl(track.id);
    if (miniTitle)  miniTitle.textContent  = fullTitle.textContent  = decodeHtml(track.title);
    if (miniArtist) miniArtist.textContent = fullArtist.textContent = decodeHtml(track.artist);

    setTimeout(highlightCurrentTrack, 300);
}

function showPrompt({ title, fields, confirmLabel = "Confirmar" }) {
    return new Promise((resolve) => {
        const overlay = document.createElement("div");
        overlay.className = "modal-overlay";
        overlay.innerHTML = `
            <div class="modal">
                <div class="modal-title">${title}</div>
                <div class="modal-body" style="margin-bottom:16px;">
                    ${fields.map(f => `
                        <div style="margin-bottom:12px;">
                            <div style="font-size:12px;color:var(--text-3);margin-bottom:6px;text-transform:uppercase;letter-spacing:1px;">${f.label}</div>
                            <input id="${f.id}" class="url-input" style="width:100%;" placeholder="${f.placeholder}" autocomplete="off">
                        </div>
                    `).join("")}
                </div>
                <div class="modal-actions">
                    <button class="btn" id="modal-cancel">Cancelar</button>
                    <button class="btn btn-accent" id="modal-confirm">${confirmLabel}</button>
                </div>
            </div>`;

        document.body.appendChild(overlay);

        overlay.querySelector("#modal-cancel").addEventListener("click", () => {
            overlay.remove();
            resolve(false);
        });

        overlay.querySelector("#modal-confirm").addEventListener("click", () => {
            // lê os valores ANTES de remover
            fields.forEach(f => {
                const el = overlay.querySelector(`#${f.id}`);
                if (el) f.value = el.value;
            });
            overlay.remove();
            resolve(true);
        });

        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) { overlay.remove(); resolve(false); }
        });

        // foca no primeiro campo
        setTimeout(() => overlay.querySelector("input")?.focus(), 50);
    });
}

// ========================
// init
// ========================

function initSearch() {
    let searchDebounce  = null;
    let searchRequestId = 0;
    let currentSearchMode = "local";
 
    function switchSearchMode(mode) {
        currentSearchMode = mode;
        const input = document.getElementById("search-input");
        if (mode === "web") {
            input.placeholder = "Buscar músicas ou colar URL...";
        } else {
            input.placeholder = "Buscar músicas na biblioteca...";
        }

        // dispara pesquisa se houver conteúdo
        const query = input.value.trim();
        if (query) {
            // dispara o evento de input para executar a pesquisa
            input.dispatchEvent(new Event("input"));
        }
    }
 
    document.getElementById("search-mode-select").addEventListener("change", (e) => {
        switchSearchMode(e.target.value);
    });
 
    document.getElementById("search-input").addEventListener("input", (e) => {
        const query = e.target.value.trim();
 
        if (!query) {
            showView("playlists");
            return;
        }
 
        clearTimeout(searchDebounce);
        const debounceTime = currentSearchMode === "web" ? 600 : 300;
 
        searchDebounce = setTimeout(async () => {
            const thisRequestId = ++searchRequestId;
 
            document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
            document.getElementById("view-search").classList.add("active");
 
            const titleEl = document.getElementById("search-results-title");
            const list    = document.getElementById("search-results-list");
 
            if (currentSearchMode === "web") {
                titleEl.textContent  = `Buscando "${query}"...`;
                list.innerHTML       = "";
                list.style.height    = "auto";
                list.style.position  = "static";
 
                const results = await fetchYoutubeSearch(query);
 
                if (thisRequestId !== searchRequestId) return;
 
                if (!results.length || results.error) {
                    titleEl.textContent = `Nenhum resultado para "${query}"`;
                    return;
                }
 
                titleEl.textContent = `${results.length} resultado${results.length !== 1 ? "s" : ""} para "${query}"`;
 
                results.forEach(r => {
                    const el = document.createElement("div");
                    el.className     = "track-item";
                    el.style.cssText = "position:relative;top:auto;";
                    el.innerHTML = `
                        <div class="track-num"></div>
                        <img class="track-cover" src="${r.thumbnail}" loading="lazy" onerror="this.style.opacity='0.2'">
                        <div>
                            <div class="track-title">${escapeHtml(r.title)}</div>
                            <div class="track-artist">${escapeHtml(r.artist)}</div>
                        </div>
                        <div class="track-album"></div>
                        <div class="track-plays"></div>
                        <div class="track-duration">${formatDuration(r.duration_ms)}</div>
                        <div class="track-actions">
                            <button class="btn btn-accent yt-add-btn" style="font-size:11px;padding:4px 10px;">+ Adicionar</button>
                        </div>`;
 
                    el.querySelector(".yt-add-btn").addEventListener("click", (evt) => {
                        evt.stopPropagation();
                        openAddToPlaylistModal(r);
                    });
 
                    list.appendChild(el);
                });
 
            } else {
                titleEl.textContent = `Buscando "${query}"...`;
                list.innerHTML      = "";
                list.style.position = "relative";
                list.style.height   = "0px";
 
                const tracks = await fetchTrackSearch(query);
 
                if (thisRequestId !== searchRequestId) return;
 
                titleEl.textContent = tracks.length
                    ? `${tracks.length} resultado${tracks.length !== 1 ? "s" : ""} para "${query}"`
                    : `Nenhum resultado para "${query}"`;
 
                list.style.height = `${tracks.length * getItemHeight()}px`;
 
                const downloadedTracks = tracks.filter(t => t.downloaded);
 
                tracks.forEach((track, i) => {
                    const el = document.createElement("div");
                    el.className         = "track-item" + (track.downloaded ? "" : " track-not-downloaded");
                    el.dataset.id = track.id;
                    el.style.cssText     = `position:absolute;top:${i * getItemHeight()}px;width:100%;`;
                    el.innerHTML = `
                        <div class="track-num">${i + 1}</div>
                        <img class="track-cover" src="${coverUrl(track.id)}" loading="lazy" onerror="this.style.opacity='0.2'">
                        <div>
                            <div class="track-title">${decodeHtml(track.title)}</div>
                            <div class="track-artist">${decodeHtml(track.artist)}</div>
                        </div>
                        <div class="track-album">${decodeHtml(track.album)}</div>
                        <div class="track-plays" style="font-size:12px;color:var(--text-3);">${track.play_count || 0}</div>
                        <div class="track-duration">${formatDuration(track.duration_ms)}</div>
                        <div class="track-actions">
                            <button class="track-dots" data-id="${track.id}" data-yt-url="${track.youtube_url || ''}">···</button>
                        </div>`;
 
                    if (track.downloaded) {
                        el.addEventListener("click", () => {
                            Queue.loadPlaylist(downloadedTracks, "search");
                            const qi = downloadedTracks.findIndex(t => t.id === track.id);
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
        }, debounceTime);
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

async function openCreatePlaylistModal() {
    const fields = [
        { id: "pl-name",        label: "Nome",      placeholder: "Minha playlist" },
        { id: "pl-description", label: "Descrição", placeholder: "Opcional" },
    ];

    const ok = await showPrompt({ title: "Nova playlist", fields, confirmLabel: "Criar" });
    if (!ok) return;

    const name = fields[0].value?.trim();
    if (!name) return;

    const description = fields[1].value?.trim() || "";
    const result = await createPlaylist(name, description);
    if (result.status === "ok") {
        await loadSidebar();
        openPlaylist(result.id, result.name);
    }
}

async function openAddToPlaylistModal(ytTrack) {
    const playlists = await fetchPlaylists();

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
        <div class="modal">
            <div class="modal-title">Adicionar à playlist</div>
            <div class="modal-body">
                <div style="font-size:13px;color:var(--text);margin-bottom:12px;font-weight:500;">
                    ${escapeHtml(ytTrack.title)}
                </div>
                <div style="font-size:12px;color:var(--text-3);margin-bottom:8px;text-transform:uppercase;letter-spacing:1px;">
                    Playlists
                </div>
                <div id="playlist-checklist" style="display:flex;flex-direction:column;gap:6px;max-height:240px;overflow-y:auto;">
                    ${playlists.map(p => `
                        <label style="display:flex;align-items:center;gap:10px;padding:8px;border-radius:6px;cursor:pointer;background:var(--bg-2);border:1px solid var(--border);">
                            <input type="checkbox" value="${p.id}" style="accent-color:var(--accent);width:16px;height:16px;">
                            <span style="font-size:13px;color:var(--text);">${escapeHtml(p.name)}</span>
                        </label>
                    `).join("")}
                    ${!playlists.length ? `<div style="color:var(--text-3);font-size:13px;">Nenhuma playlist criada ainda.</div>` : ""}
                </div>
                <div style="font-size:11px;color:var(--text-3);margin-top:10px;">
                    Deixe tudo desmarcado para baixar sem adicionar a nenhuma playlist.
                </div>
            </div>
            <div class="modal-actions">
                <button class="btn" id="modal-cancel">Cancelar</button>
                <button class="btn btn-accent" id="modal-confirm">Baixar</button>
            </div>
        </div>`;

    document.body.appendChild(overlay);

    overlay.querySelector("#modal-cancel").addEventListener("click", () => overlay.remove());

    overlay.querySelector("#modal-confirm").addEventListener("click", async () => {
        const checked = [...overlay.querySelectorAll("#playlist-checklist input:checked")]
            .map(el => el.value);

        overlay.remove();

        const result = await addYoutubeTrack(ytTrack.youtube_url, checked, {
            title:       ytTrack.title,
            artist:      ytTrack.artist,
            duration_ms: ytTrack.duration_ms,
        });

        if (result.status === "ok") {
            await loadSidebar();
        }
    });

    overlay.addEventListener("click", (e) => {
        if (e.target === overlay) overlay.remove();
    });
}

document.getElementById("mp3-file-input").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    document.getElementById("mp3-file-name").textContent = file.name;

    const preview = await uploadTrack(file);
    if (preview.error) {
        alert("Erro: " + preview.error);
        return;
    }

    openConfirmUploadModal(preview);
    e.target.value = ""; // reseta o input
});

async function openConfirmUploadModal(preview) {
    const playlists = await fetchPlaylists();

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
        <div class="modal" style="min-width:380px;max-width:500px;">
            <div class="modal-title">Confirmar música</div>
            <div class="modal-body">
                <div style="display:flex;gap:16px;align-items:center;margin-bottom:20px;">
                    <img id="up-cover-preview"
                         src="${preview.cover_path ? `/media/track/${preview.tmp_id}/cover` : ''}"
                         style="width:64px;height:64px;border-radius:8px;object-fit:cover;background:var(--bg-3);"
                         onerror="this.style.opacity='0.2'">
                    <div style="display:flex;flex-direction:column;gap:4px;flex:1;">
                        <button class="btn" id="up-cover-upload" style="font-size:11px;padding:4px 8px;">
                            <i class="fa-solid fa-upload"></i> Capa
                        </button>
                        <input id="up-cover-url" class="url-input" placeholder="URL da capa..." style="margin:0;font-size:11px;">
                    </div>
                    <input type="file" id="up-cover-file" accept=".jpg,.jpeg,.png,.webp" style="display:none;">
                </div>

                ${[
                    { id: "up-title",  label: "Título",   value: preview.title  },
                    { id: "up-artist", label: "Artista",  value: preview.artist },
                    { id: "up-album",  label: "Álbum",    value: preview.album  },
                ].map(f => `
                    <div style="margin-bottom:12px;">
                        <div style="font-size:12px;color:var(--text-3);margin-bottom:6px;text-transform:uppercase;letter-spacing:1px;">${f.label}</div>
                        <input id="${f.id}" class="url-input" style="width:100%;" value="${escapeHtml(f.value)}" autocomplete="off">
                    </div>
                `).join("")}

                <div style="font-size:12px;color:var(--text-3);margin-bottom:8px;text-transform:uppercase;letter-spacing:1px;">Adicionar à playlist</div>
                <div style="display:flex;flex-direction:column;gap:6px;max-height:180px;overflow-y:auto;">
                    ${playlists.map(p => `
                        <label style="display:flex;align-items:center;gap:10px;padding:8px;border-radius:6px;cursor:pointer;background:var(--bg-2);border:1px solid var(--border);">
                            <input type="checkbox" value="${p.id}" style="accent-color:var(--accent);width:16px;height:16px;">
                            <span style="font-size:13px;color:var(--text);">${escapeHtml(p.name)}</span>
                        </label>
                    `).join("")}
                    ${!playlists.length ? `<div style="color:var(--text-3);font-size:13px;">Nenhuma playlist criada ainda.</div>` : ""}
                </div>
                <div style="font-size:11px;color:var(--text-3);margin-top:8px;">Deixe desmarcado para salvar sem playlist.</div>
            </div>
            <div class="modal-actions">
                <button class="btn" id="modal-cancel">Cancelar</button>
                <button class="btn btn-accent" id="modal-confirm">Adicionar</button>
            </div>
        </div>`;

    document.body.appendChild(overlay);

    // init autocomplete para artista e álbum
    initAutocomplete(overlay.querySelector("#up-artist"), fetchArtists);
    initAutocomplete(overlay.querySelector("#up-album"),  fetchAlbums);

    // upload de capa
    overlay.querySelector("#up-cover-upload").addEventListener("click", () => {
        overlay.querySelector("#up-cover-file").click();
    });

    overlay.querySelector("#up-cover-file").addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                overlay.querySelector("#up-cover-preview").src = ev.target.result;
                overlay.querySelector("#up-cover-preview").style.opacity = "1";
            };
            reader.readAsDataURL(file);
        }
    });

    overlay.querySelector("#modal-cancel").addEventListener("click", () => overlay.remove());

    overlay.querySelector("#modal-confirm").addEventListener("click", async () => {
        const data = {
            tmp_id:      preview.tmp_id,
            tmp_path:    preview.tmp_path,
            cover_path:  preview.cover_path,
            title:       overlay.querySelector("#up-title").value.trim()  || preview.title,
            artist:      overlay.querySelector("#up-artist").value.trim() || preview.artist,
            album:       overlay.querySelector("#up-album").value.trim()  || preview.album,
            duration_ms: preview.duration_ms,
        };
        const checked = [...overlay.querySelectorAll("input[type=checkbox]:checked")]
            .map(el => el.value);

        const coverFile = overlay.querySelector("#up-cover-file").files[0];
        const coverUrl_ = overlay.querySelector("#up-cover-url").value.trim();

        overlay.remove();

        const result = await confirmUpload(data, checked);
        if (result.status === "ok") {
            // upload de capa se foi selecionado
            if (coverFile) await uploadTrackCover(result.id, coverFile);
            else if (coverUrl_) await setTrackCoverUrl(result.id, coverUrl_);

            await loadSidebar();
            document.getElementById("mp3-file-name").textContent = "Nenhum arquivo selecionado";
        } else {
            alert("Erro: " + result.error);
        }
    });

    overlay.addEventListener("click", (e) => {
        if (e.target === overlay) overlay.remove();
    });
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
