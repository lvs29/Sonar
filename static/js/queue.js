// static/js/queue.js

const Queue = (() => {
    let playlistTracks    = [];
    let shuffledTracks    = [];
    let manualTracks      = [];
    let currentIndex      = -1;
    let shuffleOn         = false;
    let loopPlaylist      = false;
    let currentPlaylistId = null;
    let currentManualTrack = null;

    function getActive() {
        return shuffleOn ? shuffledTracks : playlistTracks;
    }

    function getCurrent() {
        if (currentManualTrack) return currentManualTrack;
        if (currentIndex < 0) return null;
        return getActive()[currentIndex] || null;
    }

    function getNext() {
        if (manualTracks.length > 0) return manualTracks[0];
        const active = getActive();
        if (currentIndex + 1 < active.length) return active[currentIndex + 1];
        if (loopPlaylist) return active[0];
        return null;
    }

    function getUpcoming(limit = 20) {
        const manual = manualTracks.slice(0, limit);
        const rest   = limit - manual.length;
        const active = getActive();
        const fromPl = active.slice(currentIndex + 1, currentIndex + 1 + rest);
        return { manual, playlist: fromPl };
    }

    function loadPlaylist(tracks, playlistId) {
        playlistTracks    = tracks;
        shuffledTracks    = _shuffle([...tracks]);
        manualTracks      = [];
        currentIndex      = -1;
        currentPlaylistId = playlistId;
        _save();
        _emit("queueChanged");
    }

    function playAt(index, fromDownloadedList = false) {
        currentManualTrack = null;
        if (shuffleOn && fromDownloadedList) {
            const track = playlistTracks[index];
            const shuffledIdx = shuffledTracks.findIndex(
                t => t.spotify_id === track.spotify_id
            );
            if (shuffledIdx >= 0) {
                currentIndex = shuffledIdx;
            } else {
                const rest = shuffledTracks.filter(
                    t => t.spotify_id !== track.spotify_id
                );
                shuffledTracks = [track, ...rest];
                currentIndex   = 0;
            }
        } else {
            currentIndex = index;
        }
        _save();
        _emit("trackChanged", getCurrent());
    }

    function advance() {
        if (manualTracks.length > 0) {
            const track = manualTracks.shift();
            currentManualTrack = track;  // <- salva a track manual
            _save();
            _emit("trackChanged", track);
            return track;
        }
        currentManualTrack = null;  // <- limpa ao voltar pra playlist
        const active = getActive();
        if (currentIndex + 1 < active.length) {
            currentIndex++;
        } else if (loopPlaylist) {
            currentIndex = 0;
        } else {
            return null;
        }
        _save();
        _emit("trackChanged", getCurrent());
        return getCurrent();
    }

    function previous() {
        if (currentIndex > 0) {
            currentIndex--;
            _save();
            _emit("trackChanged", getCurrent());
            return getCurrent();
        }
        return null;
    }

    function addToManual(track) {
        manualTracks.push(track);
        _save();
        _emit("queueChanged");
    }

    function removeFromManual(index) {
        manualTracks.splice(index, 1);
        _save();
        _emit("queueChanged");
    }

    function moveManual(fromIdx, toIdx) {
        const item = manualTracks.splice(fromIdx, 1)[0];
        manualTracks.splice(toIdx, 0, item);
        _save();
        _emit("queueChanged");
    }

    function toggleShuffle() {
        shuffleOn = !shuffleOn;
        if (shuffleOn) {
            const current = getCurrent();
            const rest = playlistTracks.filter(t =>
                !current || t.spotify_id !== current.spotify_id
            );
            for (let i = rest.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [rest[i], rest[j]] = [rest[j], rest[i]];
            }
            shuffledTracks = current ? [current, ...rest] : rest;
            currentIndex   = current ? 0 : -1;
        } else {
            const current = getCurrent();
            if (current) {
                currentIndex = playlistTracks.findIndex(
                    t => t.spotify_id === current.spotify_id
                );
            }
        }
        _save();
        _emit("shuffleChanged", shuffleOn);
        _emit("queueChanged");
        return shuffleOn;
    }

    function toggleLoop() {
        loopPlaylist = !loopPlaylist;
        _save();
        _emit("loopChanged", loopPlaylist);
        return loopPlaylist;
    }

    function _shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    function getUnifiedQueue(limit = 50) {
        const manual   = manualTracks.slice(0, limit).map(t => ({...t, _qtype: "manual"}));
        const active   = getActive();
        const playlist = active.slice(currentIndex + 1, currentIndex + 1 + (limit - manual.length))
                            .map(t => ({...t, _qtype: "playlist"}));
        return [...manual, ...playlist];
    }

    function removeFromUnified(idx) {
        const unified = getUnifiedQueue();
        const item    = unified[idx];
        if (!item) return;
        if (item._qtype === "manual") {
            // acha o índice real na fila manual
            const mi = manualTracks.findIndex(t => t.spotify_id === item.spotify_id);
            if (mi >= 0) manualTracks.splice(mi, 1);
        } else {
            // remove da playlist promovendo pra manual as anteriores e skipando essa
            // na prática só avança o índice pra pular ela
            const active = getActive();
            const pi = active.findIndex((t, i) => i > currentIndex && t.spotify_id === item.spotify_id);
            if (pi >= 0) {
                if (shuffleOn) shuffledTracks.splice(pi, 1);
                else           playlistTracks.splice(pi, 1);
            }
        }
        _save();
        _emit("queueChanged");
    }

    function moveUnified(fromIdx, toIdx) {
        const unified = getUnifiedQueue();
        const item    = unified[fromIdx];
        const target  = unified[toIdx];
        if (!item || !target) return;

        // remove da origem
        removeFromUnified(fromIdx);

        // se destino é manual ou origem era playlist indo pra antes da seção manual → vira manual
        const newUnified = getUnifiedQueue();
        if (target._qtype === "manual" || toIdx < manualTracks.length) {
            // insere na posição manual correta
            const adjustedTo = Math.min(toIdx, manualTracks.length);
            const trackClean = {...item};
            delete trackClean._qtype;
            manualTracks.splice(adjustedTo, 0, trackClean);
        } else {
            // reinsere na playlist na posição correta
            const active     = getActive();
            const playlistTo = toIdx - manualTracks.length;
            const insertAt   = currentIndex + 1 + playlistTo;
            const trackClean = {...item};
            delete trackClean._qtype;
            if (shuffleOn) shuffledTracks.splice(insertAt, 0, trackClean);
            else           playlistTracks.splice(insertAt, 0, trackClean);
        }

        _save();
        _emit("queueChanged");
    }

    function playFromUnified(idx) {
        const unified = getUnifiedQueue();
        const item    = unified[idx];
        if (!item) return;

        if (item._qtype === "manual") {
            const mi = manualTracks.findIndex(t => t.spotify_id === item.spotify_id);
            if (mi >= 0) {
                currentManualTrack = manualTracks[mi];
                manualTracks.splice(0, mi + 1); // remove tudo até ela (inclusive)
            }
        } else {
            currentManualTrack = null;
            const active = getActive();
            const pi = active.findIndex((t, i) => i > currentIndex && t.spotify_id === item.spotify_id);
            if (pi >= 0) currentIndex = pi;
        }
        _save();
        _emit("trackChanged", getCurrent());
    }

    function _save() {
        try {
            localStorage.setItem("sonar_queue", JSON.stringify({
                currentManualTrack,
                playlistTracks,
                shuffledTracks,
                manualTracks,
                currentIndex,
                shuffleOn,
                loopPlaylist,
                currentPlaylistId,
            }));
        } catch (e) {}
    }

    function restore() {
        try {
            const raw = localStorage.getItem("sonar_queue");
            if (!raw) return false;
            const data         = JSON.parse(raw);
            currentManualTrack = data.currentManualTrack || null;
            playlistTracks     = data.playlistTracks     || [];
            shuffledTracks     = data.shuffledTracks     || [];
            manualTracks       = data.manualTracks       || [];
            currentIndex       = data.currentIndex       ?? -1;
            shuffleOn          = data.shuffleOn          || false;
            loopPlaylist       = data.loopPlaylist       || false;
            currentPlaylistId  = data.currentPlaylistId  || null;
            return getCurrent() !== null;
        } catch (e) {
            return false;
        }
    }

    const _listeners = {};

    function on(event, fn) {
        if (!_listeners[event]) _listeners[event] = [];
        _listeners[event].push(fn);
    }

    function _emit(event, data) {
        (_listeners[event] || []).forEach(fn => fn(data));
    }

    return {
        loadPlaylist,
        playAt,
        advance,
        previous,
        addToManual,
        removeFromManual,
        moveManual,
        toggleShuffle,
        toggleLoop,
        getCurrent,
        getNext,
        getUpcoming,
        restore,
        on,
        getUnifiedQueue,
        removeFromUnified,
        moveUnified,
        playFromUnified,
        get currentIndex()      { return currentIndex; },
        get shuffleOn()         { return shuffleOn; },
        get loopPlaylist()      { return loopPlaylist; },
        get playlistTracks()    { return playlistTracks; },
        get currentPlaylistId() { return currentPlaylistId; },
    };
})();