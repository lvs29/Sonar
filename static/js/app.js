// static/js/app.js

// ========================
// helpers
// ========================

function setTextNodes(el, map) {
    Object.entries(map).forEach(([selector, value]) => {
        const node = el.querySelector(selector);
        if (node) node.textContent = safeText(value);
    });
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

    localStorage.setItem("sonar_view", name);

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
    if (name === "playlists" && typeof HomeView !== 'undefined') HomeView.reload();
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
            <span class="sidebar-playlist-name"></span>
        `;
        setTextNodes(el, { ".sidebar-playlist-name": pl.name });
        el.addEventListener("click", () => openPlaylist(pl.id, pl.name));
        list.appendChild(el);
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
    localStorage.setItem("sonar_view", "playlist");
 
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
 
    const totalMs = tracks.reduce((sum, t) => sum + (t.duration_ms || 0), 0);
    const totalSeconds = Math.floor(totalMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const durationStr = `${hours}h${minutes.toString().padStart(2, '0')}min`;
    document.getElementById("pl-meta").textContent =
        `${tracks.length} músicas · ${downloadedTracks.length} disponíveis · ${durationStr}`;
 
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
        openPlaylistEditMode(playlistId, meta, tracks);
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

function renderTrackList(allTracks, downloadedTracks, playlistId=null) {
    const container = document.getElementById("track-list");
    const main      = document.getElementById("main");

    container.style.position = "relative";
    container.style.height   = `${allTracks.length * getItemHeight()}px`;
    container.innerHTML      = "";

    const thisPlaylistId = playlistId;

    function renderVisible() {
        // se a playlist mudou este listener é obsoleto
        if (currentPlaylistId !== thisPlaylistId || playlistEditMode.active) {
            main.removeEventListener("scroll", _scrollHandler);
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
                    <div class="track-title"></div>
                    <div class="track-artist"></div>
                </div>
                <div class="track-album"></div>
                <div class="track-plays" style="font-size:12px;color:var(--text-3);">${track.play_count || 0}</div>
                <div class="track-duration">${formatDuration(track.duration_ms)}</div>
                <div class="track-actions">
                    <button class="track-dots" data-id="${track.id}" data-yt-url="${track.youtube_url || ''}">···</button>
                </div>`;

            el.querySelector(".track-title").textContent  = track.title  || "";
            el.querySelector(".track-artist").textContent = track.artist || "";
            el.querySelector(".track-album").textContent  = track.album  || "";

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

let playlistEditMode = {
    active: false,
    playlistId: null,
    originalMeta: null,
    originalTracks: [],
    mainTracks: [],
    basketTracks: [],
    selectedCoverFile: null,
    basketExpanded: false
};

function openPlaylistEditMode(playlistId, meta, tracks) {
    playlistEditMode.active = true;
    playlistEditMode.playlistId = playlistId;
    playlistEditMode.originalMeta = {...meta};
    playlistEditMode.originalTracks = [...tracks];
    playlistEditMode.mainTracks = [...tracks];
    playlistEditMode.basketTracks = [];
    playlistEditMode.selectedCoverFile = null;
    playlistEditMode.basketExpanded = false;

    // Transforma header em modo de edição
    const header = document.querySelector(".playlist-header");
    header.innerHTML = `
        <img id="pl-cover-edit" class="playlist-cover" src="/library/playlist/${playlistId}/cover" alt="" style="cursor:pointer;">
        <div style="flex:1;">
            <div class="playlist-info-label">Playlist</div>
            <input id="pl-name-edit" class="edit-input" value="" style="font-size:24px;font-weight:700;background:transparent;border:none;color:var(--text-1);width:100%;margin-bottom:8px;">
            <input id="pl-desc-edit" class="edit-input" value="" placeholder="Descrição" style="font-size:14px;background:transparent;border:1px solid var(--border);color:var(--text-2);width:100%;padding:8px;border-radius:4px;">
            <div id="pl-actions-edit" style="margin-top:12px;"></div>
        </div>`;

    // Preenche os inputs de forma segura
    header.querySelector("#pl-name-edit").value = meta.name || "";
    header.querySelector("#pl-desc-edit").value = meta.description || "";

    // Upload de capa no modo de edição
    header.querySelector("#pl-cover-edit").addEventListener("click", () => {
        openEditCoverModal(playlistId, (newCoverUrl) => {
            if (newCoverUrl) {
                header.querySelector("#pl-cover-edit").src = newCoverUrl;
            }
        });
    });

    // Botões de ação
    document.getElementById("pl-actions-edit").innerHTML = `
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
            <button class="btn btn-accent" id="btn-save-playlist">
                <i class="fa-solid fa-check"></i> Salvar
            </button>
            <button class="btn" id="btn-cancel-edit">
                <i class="fa-solid fa-xmark"></i> Cancelar
            </button>
            <button class="btn btn-danger-solid" id="btn-delete-playlist-edit">
                <i class="fa-solid fa-trash"></i> Remover playlist
            </button>
            <div style="width:1px;height:24px;background:var(--border);margin:0 8px;"></div>
            <button class="btn" id="btn-toggle-basket" style="padding:4px 8px;font-size:12px;">
                <i class="fa-solid fa-chevron-left"></i> Cesta
            </button>
        </div>`;

    // Substitui track list por duas listas
    const trackListContainer = document.getElementById("track-list");
    const trackListHeader = document.querySelector(".track-list-header");
    if (trackListHeader) {
        trackListHeader.style.display = "none";
    }
    trackListContainer.innerHTML = `
        <div style="display:flex;gap:16px;padding:8px;">
            <div id="edit-main-container" style="flex:1;display:flex;flex-direction:column;width:100%;overflow:hidden;transition:width 0.2s ease;">
                <div style="padding:12px;background:var(--bg-2);border-radius:8px;margin-bottom:8px;font-size:13px;font-weight:600;flex-shrink:0;">
                    <i class="fa-solid fa-list"></i> Principal
                </div>
                <div id="edit-main-list" class="edit-track-list" style="flex:1;overflow-y:auto;background:var(--bg-1);border-radius:8px;padding:8px;"></div>
            </div>
            <div id="edit-basket-container" style="flex:0;display:flex;flex-direction:column;width:0;overflow:hidden;transition:width 0.2s ease,opacity 0.2s ease,transform 0.2s ease;opacity:0;transform:translateX(100%);">
                <div style="padding:12px;background:var(--bg-2);border-radius:8px;margin-bottom:8px;font-size:13px;font-weight:600;flex-shrink:0;">
                    <i class="fa-solid fa-basket-shopping"></i> Cesta
                </div>
                <div id="edit-basket-list" class="edit-track-list" style="flex:1;overflow-y:auto;background:var(--bg-1);border-radius:8px;padding:8px;"></div>
            </div>
        </div>`;
    trackListContainer.style.height = "auto";

    // Renderiza tracks nas listas
    renderEditTrackLists();

    // Toggle da cesta
    document.getElementById("btn-toggle-basket").addEventListener("click", toggleBasket);

    // Event listeners
    document.getElementById("btn-cancel-edit").addEventListener("click", () => {
        const id   = playlistEditMode.playlistId;
        const name = playlistEditMode.originalMeta.name;

        restorePlaylistUI()

        // limpa estado
        playlistEditMode.active          = false;
        playlistEditMode.playlistId      = null;
        playlistEditMode.originalMeta    = null;
        playlistEditMode.originalTracks  = [];
        playlistEditMode.mainTracks      = [];
        playlistEditMode.basketTracks    = [];
        playlistEditMode.selectedCoverFile = null;
        playlistEditMode.basketExpanded  = false;

        openPlaylist(id, name);
    });
    document.getElementById("btn-delete-playlist-edit").addEventListener("click", () => {
        document.querySelector("#pl-actions button:nth-child(2)").click();
    });
    document.getElementById("btn-save-playlist").addEventListener("click", savePlaylistEdit);
}

function restorePlaylistUI() {
    if (!playlistEditMode.active || !playlistEditMode.originalMeta || !playlistEditMode.playlistId) {
        // Se não está no modo de edição ou estado inválido, recarrega a playlist
        openPlaylist(playlistEditMode.playlistId, playlistEditMode.originalMeta.name);
        console.log("Playlist restaurada");
        return;
    }

    const meta = playlistEditMode.originalMeta;
    const playlistId = playlistEditMode.playlistId;

    // Restaura o header
    const header = document.querySelector(".playlist-header");
    header.innerHTML = `
        <img id="pl-cover" class="playlist-cover" src="/library/playlist/${playlistId}/cover" alt="">
        <div style="flex:1;">
            <div class="playlist-info-label">Playlist</div>
            <div class="playlist-info-name" id="pl-name"></div>
            <div id="pl-description" class="playlist-description"></div>
            <div class="playlist-info-meta" id="pl-meta"></div>
            <div id="pl-actions" style="margin-top:12px;"></div>
        </div>`;
    
    // Preenche os campos de forma segura
    setTextNodes(header, {
        "#pl-name": meta.name,
        "#pl-description": meta.description || ""
    });

    // Configura a descrição
    const descEl = document.getElementById("pl-description");
    if (descEl) {
        descEl.textContent = meta.description || "";
        descEl.style.display = meta.description ? "block" : "none";
    }

    // Configura o meta
    const metaEl = document.getElementById("pl-meta");
    if (metaEl) {
        const tracks = playlistEditMode.originalTracks;
        const downloadedTracks = tracks.filter(t => t.downloaded);
        metaEl.textContent = `${tracks.length} músicas · ${downloadedTracks.length} disponíveis`;
    }

    // Configura a capa como background do header
    document.documentElement.style.setProperty("--playlist-cover", `url('/library/playlist/${playlistId}/cover')`);

    // Restaura os botões de ação
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
        const sidebarItem = document.querySelector(`.sidebar-playlist[data-playlist-id="${playlistId}"]`);
        const playlistName = sidebarItem?.querySelector(".sidebar-playlist-name").textContent || meta.name;
        openPlaylist(playlistId, playlistName);
    });

    document.getElementById("btn-delete-playlist").addEventListener("click", async () => {
        const ok = await showConfirm({
            title:         "Remover playlist",
            body:          `Tem certeza que quer remover <strong id="confirm-playlist-name"></strong> da biblioteca?<br><br>Os arquivos de áudio não serão apagados.`,
            confirmLabel:  "Remover",
            danger:        true,
        });
        
        // Preenche o nome da playlist de forma segura
        setTimeout(() => {
            const nameEl = document.getElementById("confirm-playlist-name");
            if (nameEl) {
                nameEl.textContent = meta.name;
            }
        }, 0);
        if (!ok) return;
        const result = await deletePlaylist(playlistId);
        if (result.status === "ok") {
            await loadSidebar();
            showView("playlists");
        } else {
            alert("Erro: " + result.error);
        }
    });

    // Restaura a track list
    const trackListContainer = document.getElementById("track-list");
    trackListContainer.innerHTML = "";
    trackListContainer.style.position = "";
    trackListContainer.style.height = "";

    // Restaura o header da track list
    const trackListHeader = document.querySelector(".track-list-header");
    if (trackListHeader) {
        trackListHeader.style.display = "";
    }

    // Renderiza a track list original
    renderTrackList(playlistEditMode.originalTracks, playlistEditMode.originalTracks.filter(t => t.downloaded), playlistId);
}

function toggleBasket() {
    playlistEditMode.basketExpanded = !playlistEditMode.basketExpanded;

    const basketContainer = document.getElementById("edit-basket-container");
    const mainContainer = document.getElementById("edit-main-container");
    const toggleBtn = document.getElementById("btn-toggle-basket");

    if (playlistEditMode.basketExpanded) {
        // Expande a cesta
        basketContainer.style.flex = "1";
        basketContainer.style.width = "50%";
        basketContainer.style.opacity = "1";
        basketContainer.style.transform = "translateX(0)";
        basketContainer.style.overflow = "hidden";
        mainContainer.style.flex = "1";
        mainContainer.style.width = "50%";
        toggleBtn.innerHTML = '<i class="fa-solid fa-chevron-down"></i> Cesta';
    } else {
        // Oculta a cesta
        basketContainer.style.flex = "0";
        basketContainer.style.width = "0";
        basketContainer.style.opacity = "0";
        basketContainer.style.transform = "translateX(100%)";
        basketContainer.style.overflow = "hidden";
        mainContainer.style.flex = "1";
        mainContainer.style.width = "100%";
        toggleBtn.innerHTML = '<i class="fa-solid fa-chevron-left"></i> Cesta';
    }

    // Força re-render das listas após a transição
    setTimeout(() => {
        const mainList = document.getElementById("edit-main-list");
        const basketList = document.getElementById("edit-basket-list");
        if (mainList && mainList._renderVisible) mainList._renderVisible();
        if (basketList && basketList._renderVisible) basketList._renderVisible();
    }, 200);
}

// ========================
// edit mode - virtual drag and drop
// ========================

const EditDrag = (() => {
    const ITEM_H = 48; // altura de cada item em px
    const PADDING = 8; // padding do container

    let ghost       = null;
    let originList  = null; // "main" | "basket"
    let originIndex = null;
    let currentList = null; // lista onde o cursor está agora
    let insertIndex = null;
    let offsetY     = 0;    // onde no item o clique aconteceu

    // ── scroll automático durante drag ──
    let _scrollRAF   = null;
    let _scrollSpeed = 0;
    let _scrollEl    = null;

    function _autoScroll() {
        if (_scrollEl && _scrollSpeed !== 0) {
            _scrollEl.scrollTop += _scrollSpeed;
        }
        _scrollRAF = requestAnimationFrame(_autoScroll);
    }

    function _startAutoScroll(el) {
        _scrollEl = el;
        if (!_scrollRAF) _scrollRAF = requestAnimationFrame(_autoScroll);
    }

    function _stopAutoScroll() {
        if (_scrollRAF) { cancelAnimationFrame(_scrollRAF); _scrollRAF = null; }
        _scrollEl    = null;
        _scrollSpeed = 0;
    }

    // ── placeholder ──
    function _getPlaceholder() {
        let ph = document.getElementById("edit-drag-placeholder");
        if (!ph) {
            ph = document.createElement("div");
            ph.id = "edit-drag-placeholder";
            ph.style.cssText = `
                height: 2px;
                background: var(--accent);
                opacity: 0.75;
                margin: 4px 0;
                pointer-events: none;
                box-shadow: 0 0 8px var(--accent);
            `;
        }
        return ph;
    }

    function _removePlaceholder() {
        document.getElementById("edit-drag-placeholder")?.remove();
    }

    // ── calcula índice de inserção pelo clientY ──
    function _calcInsertIndex(listEl, clientY) {
        const rect      = listEl.getBoundingClientRect();
        const relY      = clientY - rect.top + listEl.scrollTop - PADDING;
        const rawIndex  = Math.round(relY / ITEM_H);
        const listName  = listEl.id === "edit-main-list" ? "main" : "basket";
        const listLen   = listName === "main"
            ? playlistEditMode.mainTracks.length
            : playlistEditMode.basketTracks.length;
        return Math.max(0, Math.min(rawIndex, listLen));
    }

    // ── atualiza placeholder na lista alvo ──
    function _updatePlaceholder(listEl, clientY) {
        const idx = _calcInsertIndex(listEl, clientY);
        insertIndex = idx;

        const ph = _getPlaceholder();

        // Calcula a posição baseada no índice e altura dos itens
        const topPos = PADDING + idx * ITEM_H;
        ph.style.position = "absolute";
        ph.style.top = `${topPos}px`;
        ph.style.left = `${PADDING}px`;
        ph.style.right = `${PADDING}px`;

        listEl.appendChild(ph);
    }

    // ── cria o ghost que segue o cursor ──
    function _createGhost(sourceEl, clientX, clientY) {
        const rect = sourceEl.getBoundingClientRect();
        offsetY    = clientY - rect.top;

        ghost = sourceEl.cloneNode(true);
        ghost.style.cssText = `
            position: fixed;
            top: ${clientY - offsetY}px;
            left: ${rect.left}px;
            width: ${rect.width}px;
            height: ${ITEM_H}px;
            opacity: 0.85;
            pointer-events: none;
            z-index: 9999;
            border-radius: 4px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.5);
            background: var(--bg-3);
        `;
        document.body.appendChild(ghost);
    }

    function _moveGhost(clientX, clientY) {
        if (!ghost) return;
        ghost.style.top = `${clientY - offsetY}px`;
    }

    function _destroyGhost() {
        ghost?.remove();
        ghost = null;
    }

    // ── início do drag (mousedown) ──
    function _onMouseDown(e, listName, index) {
        if (e.button !== 0) return;
        e.preventDefault();

        originList  = listName;
        originIndex = index;
        currentList = listName;
        insertIndex = index;

        const sourceEl = e.currentTarget;
        sourceEl.style.opacity = "0.3";

        _createGhost(sourceEl, e.clientX, e.clientY);

        const listEl = document.getElementById(
            listName === "main" ? "edit-main-list" : "edit-basket-list"
        );
        _updatePlaceholder(listEl, e.clientY);

        function onMouseMove(ev) {
            _moveGhost(ev.clientX, ev.clientY);

            // detecta em qual lista o cursor está
            const mainEl   = document.getElementById("edit-main-list");
            const basketEl = document.getElementById("edit-basket-list");
            const mainRect   = mainEl.getBoundingClientRect();
            const basketRect = basketEl.getBoundingClientRect();

            let hoveredList = null;
            let hoveredEl   = null;

            if (ev.clientX >= mainRect.left && ev.clientX <= mainRect.right &&
                ev.clientY >= mainRect.top  && ev.clientY <= mainRect.bottom) {
                hoveredList = "main";
                hoveredEl   = mainEl;
            } else if (playlistEditMode.basketExpanded &&
                       ev.clientX >= basketRect.left && ev.clientX <= basketRect.right &&
                       ev.clientY >= basketRect.top  && ev.clientY <= basketRect.bottom) {
                // Só permite drop na cesta se estiver expandida
                hoveredList = "basket";
                hoveredEl   = basketEl;
            }

            if (hoveredEl) {
                currentList = hoveredList;
                _updatePlaceholder(hoveredEl, ev.clientY);

                // scroll automático nas bordas
                const ZONE  = 60;
                const rect  = hoveredEl.getBoundingClientRect();
                const relY  = ev.clientY - rect.top;
                const distB = rect.bottom - ev.clientY;

                if (relY < ZONE)       _scrollSpeed = -Math.ceil((ZONE - relY) / 10);
                else if (distB < ZONE) _scrollSpeed =  Math.ceil((ZONE - distB) / 10);
                else                   _scrollSpeed = 0;

                _startAutoScroll(hoveredEl);
            } else {
                _stopAutoScroll();
            }
        }

        function onMouseUp() {
            sourceEl.style.opacity = "";
            _destroyGhost();
            _removePlaceholder();
            _stopAutoScroll();

            document.removeEventListener("mousemove", onMouseMove);
            document.removeEventListener("mouseup",   onMouseUp);

            // aplica a mudança nos arrays
            _commitDrop();
        }

        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup",   onMouseUp);
    }

    // ── aplica o drop nos arrays e re-renderiza ──
    function _commitDrop() {
        if (originList === null || insertIndex === null) return;

        // remove da lista de origem
        const srcArray  = originList === "main"
            ? playlistEditMode.mainTracks
            : playlistEditMode.basketTracks;
        const [track]   = srcArray.splice(originIndex, 1);

        // ajusta o índice se for na mesma lista e abaixo da origem
        let targetIdx = insertIndex;
        if (originList === currentList && insertIndex > originIndex) {
            targetIdx--;
        }

        // insere na lista de destino
        const dstArray = currentList === "main"
            ? playlistEditMode.mainTracks
            : playlistEditMode.basketTracks;
        dstArray.splice(targetIdx, 0, track);

        originList  = null;
        originIndex = null;
        currentList = null;
        insertIndex = null;

        renderEditTrackLists();
    }

    // ── expõe só o necessário ──
    return { bindItem: _onMouseDown };
})();

function renderEditTrackLists() {
    const ITEM_H   = 48;
    const PADDING  = 8;

    function setupVirtualList(listEl, tracks) {
        const totalH = tracks.length * ITEM_H + PADDING * 2;
        listEl.style.position = "relative";
        listEl.style.height   = `${totalH}px`;

        // atualiza o container pai (só para a lista principal)
        if (listEl.id === "edit-main-list") {
            const container = document.getElementById("edit-main-container");
            if (container) container.style.height = `${totalH + 52}px`; // +52 pelo header "Principal"
        }

        listEl.innerHTML = "";

        const listName = listEl.id === "edit-main-list" ? "main" : "basket";

        function renderVisible() {
            if (!playlistEditMode.active) return;

            const scrollTop = listEl.scrollTop;
            const viewH     = listEl.clientHeight;
            const BUFFER    = 10;
            const start     = Math.max(0, Math.floor(scrollTop / ITEM_H) - BUFFER);
            const end       = Math.min(tracks.length, Math.ceil((scrollTop + viewH) / ITEM_H) + BUFFER);

            // remove os que saíram da janela
            listEl.querySelectorAll(".edit-track-item").forEach(el => {
                const pos = parseInt(el.dataset.pos);
                if (pos < start || pos >= end) el.remove();
            });

            const rendered = new Set(
                [...listEl.querySelectorAll(".edit-track-item")].map(el => parseInt(el.dataset.pos))
            );

            for (let i = start; i < end; i++) {
                if (rendered.has(i)) continue;

                const track = tracks[i];
                const el    = document.createElement("div");
                el.className        = "edit-track-item";
                el.dataset.pos      = i;
                el.dataset.trackId  = track.id;
                el.style.cssText    = `
                    position: absolute;
                    top: ${PADDING + i * ITEM_H}px;
                    left: ${PADDING}px;
                    right: ${PADDING}px;
                    height: ${ITEM_H - 4}px;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 0 8px;
                    background: var(--bg-2);
                    border-radius: 4px;
                    cursor: grab;
                    user-select: none;
                `;
                el.innerHTML = `
                    <span style="font-size:12px;color:var(--text-3);width:28px;text-align:right;flex-shrink:0;">${i + 1}</span>
                    <img data-src="/media/track/${track.id}/cover"
                        style="width:32px;height:32px;border-radius:4px;object-fit:cover;flex-shrink:0;background:var(--bg-3);"
                        onerror="this.style.opacity='0.2'">
                    <span class="edit-track-title" style="font-size:13px;color:var(--text-1);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"></span>
                    <i class="fa-solid fa-grip-vertical" style="color:var(--text-3);flex-shrink:0;"></i>
                `;
                setTextNodes(el, { ".edit-track-title": track.title });
                const img = el.querySelector("img");
                requestAnimationFrame(() => { img.src = img.dataset.src; });

                el.addEventListener("mousedown", (e) => {
                    EditDrag.bindItem(e, listName, i);
                });

                listEl.appendChild(el);
            }
        }

        listEl.addEventListener("scroll", renderVisible);
        renderVisible();

        // guarda referência para forçar re-render quando necessário
        listEl._renderVisible = renderVisible;
    }

    const mainEl   = document.getElementById("edit-main-list");
    const basketEl = document.getElementById("edit-basket-list");

    setupVirtualList(mainEl,   playlistEditMode.mainTracks);
    setupVirtualList(basketEl, playlistEditMode.basketTracks);
}

function setupDragDrop() {
    // substituído pelo EditDrag — não faz nada
}

function createEditTrackItem() {
    // substituído pelo renderEditTrackLists virtual — não faz nada
}

function savePlaylistEdit() {
    const name = document.getElementById("pl-name-edit").value.trim();
    const description = document.getElementById("pl-desc-edit").value.trim();

    const finalTrackIds = [
        ...playlistEditMode.mainTracks.map(t => t.id),
        ...playlistEditMode.basketTracks.map(t => t.id)
    ];

    const coverPromise = playlistEditMode.selectedCoverFile
        ? uploadPlaylistCover(playlistEditMode.playlistId, playlistEditMode.selectedCoverFile)
        : Promise.resolve({ status: "ok" });

    coverPromise
        .then(() => updatePlaylistMeta(playlistEditMode.playlistId, name, description))
        .then(() => reorderPlaylistTracks(playlistEditMode.playlistId, finalTrackIds))
        .then(() => {
            const playlistId = playlistEditMode.playlistId;

            // 1. Restaura o DOM primeiro (com estado ainda válido)
            restorePlaylistUI();

            // 2. Só depois limpa o estado
            playlistEditMode.active = false;
            playlistEditMode.playlistId = null;
            playlistEditMode.originalMeta = null;
            playlistEditMode.originalTracks = [];
            playlistEditMode.mainTracks = [];
            playlistEditMode.basketTracks = [];
            playlistEditMode.selectedCoverFile = null;
            playlistEditMode.basketExpanded = false;

            // 3. Agora recarrega com o DOM já pronto
            const sidebarItem = document.querySelector(`.sidebar-playlist[data-playlist-id="${playlistId}"]`);
            const playlistName = sidebarItem?.querySelector(".sidebar-playlist-name").textContent;
            if (playlistName) openPlaylist(playlistId, playlistName);
        })
        .catch(err => {
            alert("Erro ao salvar: " + err.message);
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
    if (playlistEditMode.active) return;
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
                <span class="playlist-name"></span>
            </label>
        `).join("") + `
            <div style="border-top:1px solid var(--border);margin:4px 0;"></div>
            <div class="ctx-item" id="sub-playlist-save">
                <i class="fa-solid fa-check" style="width:16px;"></i> Confirmar
            </div>
        `;

        // Preenche os nomes das playlists de forma segura
        playlists.forEach((p, i) => {
            const label = sub.querySelectorAll(".ctx-item")[i];
            if (label) {
                setTextNodes(label, {
                    ".playlist-name": p.name
                });
            }
        });

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
                        <div style="display:flex;gap:4px;">
                            <input id="sub-cover-url" class="track-popup-input" placeholder="URL..." style="margin:0;font-size:11px;flex:1;">
                            <button class="btn" id="sub-spotify-fetch" style="font-size:11px;padding:3px 6px;flex-shrink:0;">
                                <i class="fa-solid fa-magnifying-glass"></i>
                            </button>
                        </div>
                    </div>
                    <input type="file" id="sub-cover-file" accept=".jpg,.jpeg,.png,.webp" style="display:none;">
                </div>
                <input id="sub-title"  class="track-popup-input" placeholder="Título"  value="">
                <input id="sub-artist" class="track-popup-input" placeholder="Artista" value="">
                <input id="sub-album"  class="track-popup-input" placeholder="Álbum"   value="">
                <button class="btn btn-accent" id="sub-edit-save" style="margin-top:4px;">Salvar</button>
            </div>
        `;

        // Preenche os inputs de forma segura
        sub.querySelector("#sub-title").value = track.title || "";
        sub.querySelector("#sub-artist").value = track.artist || "";
        sub.querySelector("#sub-album").value = track.album || "";

        sub.querySelector("#sub-spotify-fetch").addEventListener("click", async () => {
            const url = sub.querySelector("#sub-cover-url").value.trim();
            if (!url || !url.includes("spotify.com")) return;

            const btn = sub.querySelector("#sub-spotify-fetch");
            btn.disabled = true;
            btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i>`;

            try {
                const result = await fetchSpotifyCover(url);
                if (result.error) throw new Error(result.error);
                sub.querySelector("#sub-cover-preview").src = result.cover_url;
                sub.querySelector("#sub-cover-url").value   = result.cover_url;
            } catch (err) {
                alert("Erro ao buscar capa: " + err.message);
            } finally {
                btn.disabled = false;
                btn.innerHTML = `<i class="fa-solid fa-magnifying-glass"></i>`;
            }
        });

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

            try {
                await updateTrack(track.id, { title, artist, album });

                if (coverFile) await uploadTrackCover(track.id, coverFile);
                else if (coverUrl_) await setTrackCoverUrl(track.id, coverUrl_);

                // atualiza na lista
                const trackEl = document.querySelector(`[data-id="${track.id}"]`);
                if (trackEl) {
                    setTextNodes(trackEl, {
                        ".track-title":  title  || track.title,
                        ".track-artist": artist || track.artist,
                        ".track-album":  album  || track.album,
                    });
                    const coverImg = trackEl.querySelector(".track-cover");
                    if (coverImg) coverImg.src = `${coverUrl(track.id)}?t=${Date.now()}`;
                }

                closeAllPopups();
            } catch (err) {
                alert(`Erro ao salvar capa da track: ${err.message}`);
            }
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
            body: `Deseja remover "<span id="confirm-track-title"></span>" do banco de dados? (Música + arquivo)`
        });
        
        // Preenche o título da música de forma segura
        setTimeout(() => {
            const titleEl = document.getElementById("confirm-track-title");
            if (titleEl) {
                titleEl.textContent = track.title;
            }
        }, 0);
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
            if (
                popup.contains(e.target) ||
                e.target === btn ||
                e.target.closest(".ctx-submenu") ||
                e.target.closest(".track-popup")
            ) return;
            closeAllPopups();
            document.removeEventListener("click", outsideClick);
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

        // Preenche os campos de texto de forma segura
        if (current) {
            const currentEl = panel.querySelector(".queue-track-row");
            if (currentEl) {
                setTextNodes(currentEl, {
                    ".queue-track-title": current.title,
                    ".queue-track-artist": current.artist
                });
            }
        }

        manual.forEach((track, i) => {
            const el = panel.querySelector(`[data-unified-idx="${i}"]`);
            if (el) {
                setTextNodes(el, {
                    ".queue-track-title": track.title,
                    ".queue-track-artist": track.artist
                });
            }
        });

        playlist.forEach((track, i) => {
            const el = panel.querySelector(`[data-unified-idx="${manual.length + i}"]`);
            if (el) {
                setTextNodes(el, {
                    ".queue-track-title": track.title,
                    ".queue-track-artist": track.artist
                });
            }
        });

        panel.querySelector("#panel-close").addEventListener("click", toggle);
        _initDrag();
    }

    function _unifiedRow(track, i) {
        return `
            <div class="queue-track-row" data-unified-idx="${i}" data-qtype="${track._qtype}" data-id="${track.id}" draggable="true" style="cursor:pointer;">
                <span class="queue-drag-handle" title="Arrastar">⠿</span>
                <img src="${coverUrl(track.id)}" style="width:36px;height:36px;border-radius:4px;object-fit:cover;background:var(--bg-3);flex-shrink:0;" onerror="this.style.opacity='0.2'">
                <div style="flex:1;min-width:0;">
                    <div class="queue-track-title"></div>
                    <div class="queue-track-artist"></div>
                </div>
                <button class="ctrl-btn" style="font-size:12px;flex-shrink:0;" data-remove-idx="${i}">✕</button>
            </div>`;
    }

    function _currentRow(track) {
        return `
            <div class="queue-track-row" style="background:#1a1200;cursor:default;">
                <img src="${coverUrl(track.id)}" style="width:36px;height:36px;border-radius:4px;object-fit:cover;background:var(--bg-3);flex-shrink:0;" onerror="this.style.opacity='0.2'">
                <div style="flex:1;min-width:0;">
                    <div class="queue-track-title" style="color:var(--accent);font-weight:500;"></div>
                    <div class="queue-track-artist"></div>
                </div>
            </div>`;
    }

    function _manualRow(track, i) {
        return `
            <div class="queue-track-row" data-manual-idx="${i}" draggable="true">
                <span class="queue-drag-handle" title="Arrastar">⠿</span>
                <img src="${coverUrl(track.id)}" style="width:36px;height:36px;border-radius:4px;object-fit:cover;background:var(--bg-3);flex-shrink:0;" onerror="this.style.opacity='0.2'">
                <div style="flex:1;min-width:0;">
                    <div class="queue-track-title"></div>
                    <div class="queue-track-artist"></div>
                </div>
                <button class="ctrl-btn" style="font-size:12px;flex-shrink:0;" data-remove="${i}">✕</button>
            </div>`;
    }

    function _playlistRow(track) {
        return `
            <div class="queue-track-row" data-pl-id="${track.id}" style="cursor:pointer;">
                <img src="${coverUrl(track.id)}" style="width:36px;height:36px;border-radius:4px;object-fit:cover;background:var(--bg-3);flex-shrink:0;" onerror="this.style.opacity='0.2'">
                <div style="flex:1;min-width:0;">
                    <div class="queue-track-title"></div>
                    <div class="queue-track-artist"></div>
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
                    <td class="failed-title"></td>
                    <td class="failed-artist"></td>
                    <td class="failed-error" style="color:var(--danger);max-width:200px;overflow:hidden;text-overflow:ellipsis;"></td>
                    <td style="display:flex;gap:6px;">
                        <input class="url-input" placeholder="youtube.com/watch?v=..." id="url-${f.id}" style="width:200px;" autocomplete="off">
                        <button class="btn btn-accent" onclick="submitUrl('${f.id}')">Baixar</button>
                    </td>
                </tr>`).join("")}
            </tbody>
        </table>`;

    // Preenche os campos de forma segura
    failed.forEach((f, i) => {
        const row = failedEl.querySelectorAll("tbody tr")[i];
        if (row) {
            setTextNodes(row, {
                ".failed-title":  f.title,
                ".failed-artist": f.artist,
                ".failed-error":  f.error_msg || "—",
            });
        }
    });

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
                        <td class="orphan-title" style="color:var(--text);"></td>
                        <td class="orphan-artist"></td>
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
    
    // Preenche os campos de forma segura
    orphans.forEach((t, i) => {
        const row = document.getElementById(`orphan-row-${t.id}`);
        if (row) {
            setTextNodes(row, {
                ".orphan-title": t.title,
                ".orphan-artist": t.artist
            });
        }
    });
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
                <div class="track-title"></div>
                <div class="track-artist"></div>
            </div>
            <div class="track-album"></div>
            <div class="track-plays" style="font-size:12px;color:var(--text-3);">${track.play_count || 0}</div>
            <div class="track-duration">${formatDuration(track.duration_ms)}</div>
            <div class="track-actions">
                <button class="track-dots" data-id="${track.id}" data-yt-url="${track.youtube_url || ''}">···</button>
            </div>`;
        setTextNodes(el, {
            ".track-title":  track.title,
            ".track-artist": track.artist,
            ".track-album":  track.album,
        });

        if (track.downloaded) {
            el.addEventListener("click", () => {
                Queue.loadPlaylist(downloadedTracks, "all", "virtual");
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
    const savedView    = localStorage.getItem("sonar_view") || "playlists";
    const savedTime    = parseInt(localStorage.getItem("sonar_time") || "0");

    if (savedView === "playlist" && playlistId && playlistName) {
        await openPlaylist(playlistId, playlistName);
    } else {
        showView(savedView);
    }

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

    document.getElementById("player-title").textContent  = safeText(track.title);
    const artistInner = document.getElementById("player-artist-inner");
    if (artistInner) {
        artistInner.textContent = safeText(track.artist);
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
            title: safeText(track.title),
            artist: safeText(track.artist),
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
    if (miniTitle)  miniTitle.textContent  = fullTitle.textContent  = safeText(track.title);
    if (miniArtist) miniArtist.textContent = fullArtist.textContent = safeText(track.artist);

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

                let results = [];

                // Detecta se é URL do Spotify
                const isSpotifyUrl = /spotify\.com\/track\//.test(query);

                if (isSpotifyUrl) {
                    const spotifyResult = await addSpotifyTrack(query);

                    if (thisRequestId !== searchRequestId) return;

                    if (spotifyResult.error) {
                        titleEl.textContent = `Erro: ${spotifyResult.error}`;
                        return;
                    }

                    results = [{
                        title:       spotifyResult.title,
                        artist:      spotifyResult.artist,
                        album:       spotifyResult.album,
                        duration_ms: spotifyResult.duration_ms,
                        cover_url:   spotifyResult.cover_url,
                        thumbnail:   spotifyResult.cover_url,
                        isSpotify:   true,
                        spotifyData: spotifyResult
                    }];

                    titleEl.textContent = `Spotify: ${spotifyResult.title}`;
                } else {
                    results = await fetchYoutubeSearch(query);

                    if (thisRequestId !== searchRequestId) return;

                    if (!results.length || results.error) {
                        titleEl.textContent = `Nenhum resultado para "${query}"`;
                        return;
                    }

                    titleEl.textContent = `${results.length} resultado${results.length !== 1 ? "s" : ""} para "${query}"`;
                }

                results.forEach(r => {
                    const el = document.createElement("div");
                    el.className     = "track-item";
                    el.style.cssText = "position:relative;top:auto;";
                    el.innerHTML = `
                        <div class="track-num"></div>
                        <img class="track-cover" src="${r.thumbnail}" loading="lazy" onerror="this.style.opacity='0.2'">
                        <div>
                            <div class="track-title"></div>
                            <div class="track-artist"></div>
                        </div>
                        <div class="track-album"></div>
                        <div class="track-plays"></div>
                        <div class="track-duration">${formatDuration(r.duration_ms)}</div>
                        <div class="track-actions">
                            <button class="btn btn-accent yt-add-btn" style="font-size:11px;padding:4px 10px;">+ Adicionar</button>
                        </div>`;
                    setTextNodes(el, {
                        ".track-title": r.title,
                        ".track-artist": r.artist
                    });
 
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
                            <div class="track-title"></div>
                            <div class="track-artist"></div>
                        </div>
                        <div class="track-album"></div>
                        <div class="track-plays" style="font-size:12px;color:var(--text-3);">${track.play_count || 0}</div>
                        <div class="track-duration">${formatDuration(track.duration_ms)}</div>
                        <div class="track-actions">
                            <button class="track-dots" data-id="${track.id}" data-yt-url="${track.youtube_url || ''}">···</button>
                        </div>`;
                    setTextNodes(el, {
                        ".track-title":  track.title,
                        ".track-artist": track.artist,
                        ".track-album":  track.album,
                    });
 
                    if (track.downloaded) {
                        el.addEventListener("click", () => {
                            Queue.loadPlaylist(downloadedTracks, "search", "virtual");
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

async function openAddToPlaylistModal(trackData) {
    const playlists = await fetchPlaylists();

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
        <div class="modal">
            <div class="modal-title">Adicionar à playlist</div>
            <div class="modal-body">
                <div id="track-title" style="font-size:13px;color:var(--text);margin-bottom:12px;font-weight:500;"></div>
                <div style="font-size:12px;color:var(--text-3);margin-bottom:8px;text-transform:uppercase;letter-spacing:1px;">
                    Playlists
                </div>
                <div id="playlist-checklist" style="display:flex;flex-direction:column;gap:6px;max-height:240px;overflow-y:auto;">
                    ${playlists.map(p => `
                        <label style="display:flex;align-items:center;gap:10px;padding:8px;border-radius:6px;cursor:pointer;background:var(--bg-2);border:1px solid var(--border);">
                            <input type="checkbox" value="${p.id}" style="accent-color:var(--accent);width:16px;height:16px;">
                            <span class="playlist-name" style="font-size:13px;color:var(--text);"></span>
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

    // Preenche os campos de texto de forma segura
    setTextNodes(overlay, {
        "#track-title": trackData.title
    });

    // Preenche os nomes das playlists
    playlists.forEach((p, i) => {
        const label = overlay.querySelectorAll("#playlist-checklist label")[i];
        if (label) {
            setTextNodes(label, {
                ".playlist-name": p.name
            });
        }
    });

    overlay.querySelector("#modal-cancel").addEventListener("click", () => overlay.remove());

    overlay.querySelector("#modal-confirm").addEventListener("click", async () => {
        const checked = [...overlay.querySelectorAll("#playlist-checklist input:checked")]
            .map(el => el.value);

        overlay.remove();

        let result;
        
        if (trackData.isSpotify) {
            // Fluxo Spotify
            result = await confirmSpotifyTrack(trackData.spotifyData, checked);
        } else {
            // Fluxo YouTube
            result = await addYoutubeTrack(trackData.youtube_url, checked, {
                title:       trackData.title,
                artist:      trackData.artist,
                duration_ms: trackData.duration_ms,
            });
        }

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
                        <input id="${f.id}" class="url-input" style="width:100%;" value="" autocomplete="off">
                    </div>
                `).join("")}

                <div style="font-size:12px;color:var(--text-3);margin-bottom:8px;text-transform:uppercase;letter-spacing:1px;">Adicionar à playlist</div>
                <div style="display:flex;flex-direction:column;gap:6px;max-height:180px;overflow-y:auto;">
                    ${playlists.map(p => `
                        <label style="display:flex;align-items:center;gap:10px;padding:8px;border-radius:6px;cursor:pointer;background:var(--bg-2);border:1px solid var(--border);">
                            <input type="checkbox" value="${p.id}" style="accent-color:var(--accent);width:16px;height:16px;">
                            <span class="playlist-name" style="font-size:13px;color:var(--text);"></span>
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

    // Preenche os inputs de forma segura
    overlay.querySelector("#up-title").value = preview.title || "";
    overlay.querySelector("#up-artist").value = preview.artist || "";
    overlay.querySelector("#up-album").value = preview.album || "";

    // Preenche os nomes das playlists de forma segura
    playlists.forEach((p, i) => {
        const label = overlay.querySelectorAll("#modal-body label")[i];
        if (label) {
            setTextNodes(label, {
                ".playlist-name": p.name
            });
        }
    });

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
    loadSidebar().then(() => {
        restoreState();
        if (typeof HomeView !== 'undefined') HomeView.reload();
    });
    initDownloads();
    initSearch();

    document.getElementById("progress-bar-full")?.addEventListener("click", (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        Player.seek((e.clientX - rect.left) / rect.width);
    });
});

async function openVirtualPlaylist(name, fetchFnOrTracks) {
    const main    = document.getElementById('main');
    const titleEl = document.getElementById('search-results-title');
    const list    = document.getElementById('search-results-list');

    main.classList.remove('show-search');
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-search').classList.add('active');

    titleEl.textContent = 'Carregando...';
    list.innerHTML      = '';
    list.style.height   = '0px';

    const tracks = typeof fetchFnOrTracks === 'function'
        ? await fetchFnOrTracks()
        : fetchFnOrTracks || [];
    const downloadedTracks = Array.isArray(tracks)
        ? tracks.filter(t => t.downloaded)
        : [];

    if (!Array.isArray(tracks)) {
        titleEl.textContent = `${name} — 0 músicas`;
        return;
    }

    titleEl.textContent = `${name} — ${tracks.length} músicas`;
    list.style.position = 'relative';
    list.style.height   = `${tracks.length * getItemHeight()}px`;

    tracks.forEach((track, i) => {
        const el = document.createElement('div');
        el.className   = 'track-item' + (track.downloaded ? '' : ' track-not-downloaded');
        el.dataset.id  = track.id;
        el.style.cssText = `position:absolute;top:${i * getItemHeight()}px;width:100%;`;
        el.innerHTML = `
            <div class="track-num">${i + 1}</div>
            <img class="track-cover" src="/media/track/${track.id}/cover" loading="lazy" onerror="this.style.opacity='0.2'">
            <div>
                <div class="track-title"></div>
                <div class="track-artist"></div>
            </div>
            <div class="track-album"></div>
            <div class="track-plays" style="font-size:12px;color:var(--text-3);">${track.play_count || 0}</div>
            <div class="track-duration">${formatDuration(track.duration_ms)}</div>
            <div class="track-actions">
                <button class="track-dots" data-id="${track.id}" data-yt-url="${track.youtube_url || ''}">···</button>
            </div>`;

        setTextNodes(el, {
            '.track-title':  track.title,
            '.track-artist': track.artist,
            '.track-album':  track.album,
        });

        if (track.downloaded) {
            el.addEventListener('click', () => {
                Queue.loadPlaylist(downloadedTracks, name, "virtual");
                const qi = downloadedTracks.findIndex(t => t.id === track.id);
                Queue.playAt(qi, true);
                Player.play(Queue.getCurrent());
                highlightCurrentTrack();
            });
        }

        el.querySelector('.track-dots').addEventListener('click', (e) => {
            e.stopPropagation();
            openTrackPopup(e.currentTarget, track);
        });

        list.appendChild(el);
    });
}

window.openVirtualPlaylist = openVirtualPlaylist;