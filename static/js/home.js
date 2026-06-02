// static/js/home.js

(function () {
    'use strict';

    // ── Helpers ───────────────────────────────────────────────────────────

    function coverUrl(id) {
        return `/media/track/${id}/cover`;
    }

    function playlistCoverUrl(id) {
        return `/library/playlist/${id}/cover`;
    }

    // Remove skeletons e insere elementos reais.
    function replaceSkeleton(container, elements) {
        if (!container || !elements.length) return;
        container.innerHTML = '';
        elements.forEach(el => container.appendChild(el));
    }

    // ── Hero: Última Playlist ─────────────────────────────────────────────

    function renderHero(playlists) {
        if (!playlists.length) return;

        const pl      = playlists[playlists.length - 1];
        const card    = document.getElementById('home-last-playlist');
        const coverEl = document.getElementById('home-last-cover');
        const nameEl  = document.getElementById('home-last-name');
        const metaEl  = document.getElementById('home-last-meta');

        if (!card || !coverEl || !nameEl || !metaEl) return;

        coverEl.src = playlistCoverUrl(pl.id);
        coverEl.onerror = () => { coverEl.style.display = 'none'; };

        nameEl.textContent = pl.name || '—';

        fetchPlaylistTracks(pl.id)
            .then(tracks => {
                metaEl.textContent = `${tracks.length} música${tracks.length !== 1 ? 's' : ''}`;
            })
            .catch(() => {});

        card.onclick = () => openPlaylist(pl.id, pl.name);
    }

    // ── Hero: Playlists Recentes (grid 2×4) ──────────────────────────────

    function renderRecentPlaylists(playlists) {
        const container = document.getElementById('home-recent-playlist-list');
        if (!container) return;
        if (!playlists.length) { container.innerHTML = ''; return; }

        const elements = playlists.map(pl => {
            const div = document.createElement('div');
            div.className = 'home-mini-playlist';

            const img = document.createElement('img');
            img.className = 'home-mini-pl-cover';
            img.src = playlistCoverUrl(pl.id);
            img.alt = '';
            img.onerror = () => { img.style.visibility = 'hidden'; };

            const info = document.createElement('div');
            info.className = 'home-mini-pl-info';

            const name = document.createElement('div');
            name.className = 'home-mini-pl-name';
            name.textContent = pl.name || '—';

            const meta = document.createElement('div');
            meta.className = 'home-mini-pl-meta';
            fetchPlaylistTracks(pl.id)
                .then(tracks => {
                    meta.textContent = `${tracks.length} música${tracks.length !== 1 ? 's' : ''}`;
                })
                .catch(() => {});

            info.appendChild(name);
            info.appendChild(meta);
            div.appendChild(img);
            div.appendChild(info);
            div.onclick = () => {
                if (typeof openPlaylist === 'function') openPlaylist(pl.id, pl.name);
            };
            return div;
        });

        replaceSkeleton(container, elements);
    }

    // ── Músicas Recentes ──────────────────────────────────────────────────
    // Ordenadas por last_played desc; fallback: id desc.

    function renderRecentTracks(tracks) {
        const container = document.getElementById('home-recent-tracks');
        if (!container) return;
        const slice = tracks.slice(0, 5);
        if (!slice.length) { container.innerHTML = ''; return; }
        replaceSkeleton(container, slice.map(t => makeTrackCard(t, slice)));
    }

    // ── Mais Tocadas ──────────────────────────────────────────────────────

    function renderTopTracks(tracks) {
        const container = document.getElementById('home-top-tracks');
        if (!container) return;
        const slice = tracks.slice(0, 5);
        if (!slice.length) { container.innerHTML = ''; return; }
        replaceSkeleton(container, slice.map(t => makeTrackCard(t, slice)));
    }

    // ── Card de música ────────────────────────────────────────────────────

    function makeTrackCard(track, context) {
        const div = document.createElement('div');
        div.className = 'home-track-card';

        const img = document.createElement('img');
        img.className = 'home-track-card-cover';
        img.src = coverUrl(track.id);
        img.alt = '';
        img.onerror = () => { img.style.display = 'none'; };

        const title = document.createElement('div');
        title.className = 'home-track-card-title';
        title.textContent = track.title || track.filename || '—';

        const sub = document.createElement('div');
        sub.className = 'home-track-card-sub';
        sub.textContent = track.artist || '';

        div.appendChild(img);
        div.appendChild(title);
        div.appendChild(sub);

        div.onclick = () => {
            const idx = context.indexOf(track);
            if (typeof playTrack === 'function') {
                playTrack(track, context, idx);
            } else if (typeof Player !== 'undefined' && Player.load) {
                Player.load(track, context, idx);
            }
        };

        return div;
    }

    function renderAllPlaylists(playlists) {
        const container = document.getElementById('home-list');
        if (!container) return;

        container.innerHTML = '';
        playlists.forEach(pl => {
            const div = document.createElement('div');
            div.className = 'playlist-item';
            div.innerHTML = `
                <img class="playlist-item-cover" src="${playlistCoverUrl(pl.id)}" alt="" onerror="this.style.visibility='hidden'">
                <div class="playlist-item-info">
                    <div class="playlist-item-name"></div>
                </div>
            `;
            div.querySelector('.playlist-item-name').textContent = pl.name || '—';
            div.onclick = () => {
                if (typeof openPlaylist === 'function') openPlaylist(pl.id, pl.name);
            };
            container.appendChild(div);
        });
    }

    function bindSeeAllButtons() {
        const btnAll    = document.getElementById('btn-see-all');
        const btnRecent = document.getElementById('btn-see-recent');
        const btnTop    = document.getElementById('btn-see-top');

        if (btnAll) {
            btnAll.onclick = async () => {
                try {
                    await openAllTracks();
                } catch (err) {
                    console.error('Erro ao abrir todas as músicas:', err);
                }
            };
        }

        if (btnRecent) {
            btnRecent.onclick = async () => {
                try {
                    await openVirtualPlaylist('Tocadas Recentemente', fetchRecentTracks);
                } catch (err) {
                    console.error('Erro ao abrir recentes:', err);
                }
            };
        }

        if (btnTop) {
            btnTop.onclick = async () => {
                try {
                    await openVirtualPlaylist('Mais Tocadas', fetchTopTracks);
                } catch (err) {
                    console.error('Erro ao abrir mais tocadas:', err);
                }
            };
        }
    }

    // ── Init ──────────────────────────────────────────────────────────────

async function init() {
        const card = document.getElementById('home-last-playlist');
        if (!card) return;

        try {
            const [playlists, recentPlaylists, recentTracks, topTracks] = await Promise.all([
                fetchPlaylists(),
                fetchRecentPlaylists(),
                fetchRecentTracks(),
                fetchTopTracks(),
            ]);

            renderHero(playlists);
            renderRecentPlaylists(recentPlaylists);
            renderRecentTracks(recentTracks);
            renderTopTracks(topTracks);
            renderAllPlaylists(playlists);
            bindSeeAllButtons();
        } catch (err) {
            console.error('[home.js] erro ao carregar home:', err);
        }
    }
    window.HomeView = { reload: init };

})();