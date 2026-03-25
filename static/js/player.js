// static/js/player.js

const Player = (() => {
    const audio       = document.getElementById("audio");
    const btnPlay     = document.getElementById("btn-play");
    const progressBar = document.getElementById("progress-bar");
    const progressFill= document.getElementById("progress-fill");
    const timeCurrent = document.getElementById("time-current");
    const timeTotal   = document.getElementById("time-total");
    const volumeSlider= document.getElementById("volume-slider");
    const playerCover = document.getElementById("player-cover");
    const playerTitle = document.getElementById("player-title");
    const playerArtist= document.getElementById("player-artist");

    // ========================
    // helpers
    // ========================

    function formatTime(s) {
        const m   = Math.floor(s / 60);
        const sec = Math.floor(s % 60);
        return `${m}:${sec.toString().padStart(2, "0")}`;
    }

    function _updateUI(track) {
        if (!track) return;
        playerTitle.textContent     = track.title;
        playerTitle.dataset.title   = track.title;
        playerTitle.title           = track.title;
        playerArtist.textContent    = track.artist;
        playerCover.src             = audioUrl(track.spotify_id).replace("/audio", "/cover");
        playerCover.onerror         = () => { playerCover.src = ""; };
        
        document.title = `${track.title} | Sonar`;

        // sincroniza mini player mobile
        const miniCover  = document.getElementById("player-cover-mini");
        const fullCover  = document.getElementById("player-cover-full");
        const miniTitle  = document.getElementById("player-title-mini");
        const fullTitle  = document.getElementById("player-title-full");
        const miniArtist = document.getElementById("player-artist-mini");
        const fullArtist = document.getElementById("player-artist-full");

        if (miniCover)  miniCover.src  = fullCover.src  = audioUrl(track.spotify_id).replace("/audio", "/cover");
        if (miniTitle)  miniTitle.textContent  = fullTitle.textContent  = track.title;
        if (miniArtist) miniArtist.textContent = fullArtist.textContent = track.artist;
    }

    function _setPlaying(playing) {
        document.getElementById("icon-play").style.display  = playing ? "none"  : "inline";
        document.getElementById("icon-pause").style.display = playing ? "inline" : "none";

        const iconPlayMini  = document.getElementById("icon-play-mini");
        const iconPauseMini = document.getElementById("icon-pause-mini");
        const iconPlayFull  = document.getElementById("icon-play-full");
        const iconPauseFull = document.getElementById("icon-pause-full");

        if (iconPlayMini)  iconPlayMini.style.display  = playing ? "none"   : "inline";
        if (iconPauseMini) iconPauseMini.style.display = playing ? "inline" : "none";
        if (iconPlayFull)  iconPlayFull.style.display  = playing ? "none"   : "inline";
        if (iconPauseFull) iconPauseFull.style.display = playing ? "inline" : "none";
    }

    // ========================
    // public
    // ========================

    function play(track) {
        if (!track) return;
        audio.pause();
        audio.src = `${API}/media/track/${track.spotify_id}/audio`;
        const playPromise = audio.play();
        if (playPromise) {
            playPromise.catch(e => {
                if (e.name !== "AbortError") console.error(e);
            });
        }
        _updateUI(track);
        _setPlaying(true);
        localStorage.setItem("sonar_time", "0");
        trackPlayed(track.spotify_id, false);
    }

    function togglePlay() {
        if (audio.paused) audio.play();
        else              audio.pause();
    }

    function seek(pct) {
        if (audio.duration) audio.currentTime = pct * audio.duration;
    }

    function setVolume(val) {
        audio.volume = val;
        volumeSlider.value = val * 100;
        volumeSlider.style.setProperty("--vol", `${val * 100}%`);
    }

    function getCurrentTime() { return audio.currentTime; }
    function getDuration()    { return audio.duration || 0; }

    // ========================
    // events
    // ========================

    audio.addEventListener("play",  () => _setPlaying(true));
    audio.addEventListener("pause", () => _setPlaying(false));

    audio.addEventListener("timeupdate", () => {
        if (!audio.duration) return;
        const pct = (audio.currentTime / audio.duration) * 100;
        progressFill.style.width    = `${pct}%`;
        timeCurrent.textContent     = formatTime(audio.currentTime);

        const progressFillFull = document.getElementById("progress-fill-full");
        const timeCurrentFull  = document.getElementById("time-current-full");
        const timeTotalFull    = document.getElementById("time-total-full");

        if (progressFillFull) progressFillFull.style.width = `${pct}%`;
        if (timeCurrentFull)  timeCurrentFull.textContent  = formatTime(audio.currentTime);

        if (Math.floor(audio.currentTime) % 5 === 0) {
            localStorage.setItem("sonar_time", Math.floor(audio.currentTime));
        }
    });

    audio.addEventListener("loadedmetadata", () => {
        timeTotal.textContent = formatTime(audio.duration);

        const timeTotalFull = document.getElementById("time-total-full");
        if (timeTotalFull) timeTotalFull.textContent = formatTime(audio.duration);
    });

    audio.addEventListener("ended", () => {
        const current = Queue.getCurrent();
        if (current) trackPlayed(current.spotify_id, true); // <- adiciona
        const next = Queue.advance();
        if (next) play(next);
    });

    btnPlay.addEventListener("click", togglePlay);

    document.getElementById("btn-prev").addEventListener("click", () => {
        // se passou mais de 3s, volta pro começo
        if (audio.currentTime > 3) {
            audio.currentTime = 0;
        } else {
            const prev = Queue.previous();
            if (prev) play(prev);
        }
    });

    document.getElementById("btn-next").addEventListener("click", () => {
        const next = Queue.advance();
        if (next) play(next);
    });

    progressBar.addEventListener("click", (e) => {
        const rect = progressBar.getBoundingClientRect();
        seek((e.clientX - rect.left) / rect.width);
    });

    volumeSlider.addEventListener("input", () => {
        setVolume(volumeSlider.value / 100);
    });

    // ouve o Queue
    Queue.on("trackChanged", (track) => {
        if (track) play(track);
    });

    // init volume
    setVolume(0.8);

    return { play, togglePlay, seek, setVolume, getCurrentTime, getDuration };
})();

const btnLoop = document.getElementById("btn-loop");

function _updateLoopUI(on) {
    btnLoop.style.color       = on ? "var(--accent)" : "var(--text-2)";
    btnLoop.style.textShadow  = on ? "0 0 8px rgba(245,166,35,0.5)" : "none";
}

btnLoop.addEventListener("click", () => {
    const on = Queue.toggleLoop();
    _updateLoopUI(on);
    const mobile = document.getElementById("btn-loop-mobile");
    if (mobile) {
        mobile.style.color      = on ? "var(--accent)" : "var(--text-2)";
        mobile.style.textShadow = on ? "0 0 8px rgba(245,166,35,0.5)" : "none";
    }
});

// restaura estado
_updateLoopUI(Queue.loopPlaylist);