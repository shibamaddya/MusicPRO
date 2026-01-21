let currentIdx = 0;
let isPlaying = false;
let isShuffle = false;
let audioCtx, analyser, sourceNode, initialized = false;
let eqFilters = [];
const eqFrequencies = [60, 170, 310, 600, 1000, 3000, 6000, 12000, 14000, 16000];

const audio = document.getElementById('audio-source');
const playBtn = document.getElementById('play-btn');
const coverArt = document.getElementById('cover-art');
const progressFill = document.getElementById('progress');
const progressContainer = document.getElementById('progress-container');
const playlistView = document.getElementById('playlist-view');
const canvas = document.getElementById('visualizer');
const ctx = canvas.getContext('2d');
const likeBtn = document.getElementById('like-btn');

// --- 1. LOCAL STORAGE MANAGERS ---
function getDownloadedSongs() {
    const stored = localStorage.getItem('downloaded_songs');
    return stored ? JSON.parse(stored) : [];
}

function saveDownloadedSong(title) {
    const songs = getDownloadedSongs();
    if (!songs.includes(title)) {
        songs.push(title);
        localStorage.setItem('downloaded_songs', JSON.stringify(songs));
    }
}

// --- 2. INITIALIZATION ---
function init() {
    renderPlaylist(playlist);
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    // Load first track visually (do not play yet)
    if (playlist.length > 0) {
        updateCoverArt(playlist[0].cover);
        document.getElementById('track-name').innerText = playlist[0].title;
        document.getElementById('artist-name').innerText = playlist[0].artist;
        audio.src = playlist[0].src;
    }
}

function updateCoverArt(src) {
    const defaultArt = 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=500';
    if (!src) { coverArt.src = defaultArt; return; }
    coverArt.src = src;
    coverArt.onerror = () => { coverArt.src = defaultArt; };
}

function initAudioContext() {
    if (initialized) return;
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContext();
        sourceNode = audioCtx.createMediaElementSource(audio);
        analyser = audioCtx.createAnalyser();

        let previousNode = sourceNode;
        eqFilters = eqFrequencies.map(freq => {
            const filter = audioCtx.createBiquadFilter();
            filter.type = 'peaking';
            filter.frequency.value = freq;
            filter.Q.value = 1;
            filter.gain.value = 0;
            previousNode.connect(filter);
            previousNode = filter;
            return filter;
        });

        previousNode.connect(analyser);
        analyser.connect(audioCtx.destination);
        analyser.fftSize = 128;
        visualize();
        initialized = true;
    } catch (e) {
        console.warn("Audio Context Failed:", e);
    }
}

// --- 3. CORE PLAYBACK (PRIORITY: DIRECT PLAY) ---
function loadTrack(index) {
    // 1. UPDATE STATE & AUDIO SOURCE
    currentIdx = index;
    const track = playlist[index];
    audio.src = track.src;
    
    // 2. PLAY IMMEDIATELY (Before updating UI or AudioContext)
    // This ensures the browser sees this as a direct response to the user's tap
    audio.play().then(() => {
        isPlaying = true;
        updatePlayButton();
        coverArt.classList.remove('paused-spin');
        coverArt.classList.add('spinning');
    }).catch(e => {
        console.warn("Auto-play interrupted:", e);
        isPlaying = false;
        updatePlayButton();
    });

    // 3. MOVE RED BOX (Update Selection)
    updateActiveTrackVisuals();

    // 4. UPDATE INFO & ART
    document.getElementById('track-name').innerText = track.title;
    document.getElementById('artist-name').innerText = track.artist;
    
    coverArt.style.opacity = 0;
    setTimeout(() => {
        updateCoverArt(track.cover);
        coverArt.style.opacity = 1;
    }, 200);

    likeBtn.classList.remove('liked');
    likeBtn.innerHTML = '<i class="far fa-heart"></i>';

    // 5. INIT AUDIO CONTEXT (Background Task)
    // We do this last so it doesn't delay the music start
    if (!initialized) initAudioContext();
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}

function updateActiveTrackVisuals() {
    // Remove red box from all tracks
    const allTracks = document.querySelectorAll('.track-item');
    allTracks.forEach(el => el.classList.remove('playing'));

    // Find the track with the matching data-index and add red box
    const activeTrack = document.querySelector(`.track-item[data-index='${currentIdx}']`);
    if (activeTrack) {
        activeTrack.classList.add('playing');
        activeTrack.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

// --- 4. ADVANCED DOWNLOAD (Spinner -> Tick -> Storage) ---
async function downloadTrack(e, index) {
    e.stopPropagation(); // Stop click from playing song
    const track = playlist[index];
    const btn = e.currentTarget; 
    const originalContent = btn.innerHTML;

    // Show Loading Spinner
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    btn.style.cursor = 'wait';

    try {
        // Fetch File
        const response = await fetch(track.src);
        if (!response.ok) throw new Error("Network error");
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        
        // Trigger Download
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `${track.title}.mp3`;
        document.body.appendChild(a);
        a.click();
        
        // Cleanup
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        // Success: Mark as done
        saveDownloadedSong(track.title);
        
        btn.innerHTML = '<i class="fas fa-check" style="color:#2ed573;"></i>';
        btn.style.cursor = 'default';
        btn.onclick = null; // Disable future clicks
        
    } catch (err) {
        console.error("Download failed:", err);
        // Fallback
        window.open(track.src, '_blank');
        btn.innerHTML = originalContent;
        btn.style.cursor = 'pointer';
    }
}

function playPause() {
    if (!initialized) initAudioContext();
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();

    // If no song loaded, load current
    if (!audio.src && playlist[currentIdx]) {
        loadTrack(currentIdx);
        return;
    }

    if (isPlaying) {
        audio.pause();
        isPlaying = false;
        coverArt.classList.add('paused-spin');
    } else {
        audio.play();
        isPlaying = true;
        coverArt.classList.remove('paused-spin');
        coverArt.classList.add('spinning');
    }
    updatePlayButton();
}

function updatePlayButton() {
    playBtn.innerHTML = isPlaying ? 
        '<i class="fas fa-circle-pause"></i>' : 
        '<i class="fas fa-circle-play"></i>';
}

function nextTrack() {
    let idx = isShuffle ? Math.floor(Math.random() * playlist.length) : (currentIdx + 1) % playlist.length;
    loadTrack(idx);
}

function prevTrack() {
    loadTrack((currentIdx - 1 + playlist.length) % playlist.length);
}

function renderPlaylist(list) {
    playlistView.innerHTML = '';
    const downloadedSongs = getDownloadedSongs();

    list.forEach((track) => {
        const masterIndex = playlist.indexOf(track);
        const div = document.createElement('div');
        
        // CRITICAL: Identify this row by its index
        div.setAttribute('data-index', masterIndex);
        
        const isActive = masterIndex === currentIdx;
        div.className = `track-item ${isActive ? 'playing' : ''}`;
        
        const imgUrl = track.cover || 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=50';
        
        // Check Download Status
        let btnHtml = '';
        if (downloadedSongs.includes(track.title)) {
            // Already downloaded: Green Tick
            btnHtml = `<button class="track-download" style="cursor:default;"><i class="fas fa-check" style="color:#2ed573;"></i></button>`;
        } else {
            // Not downloaded: Download Icon
            btnHtml = `<button class="track-download" title="Download" onclick="downloadTrack(event, ${masterIndex})"><i class="fas fa-download"></i></button>`;
        }

        div.innerHTML = `
            <img src="${imgUrl}" class="track-img" onerror="this.src='https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=50'">
            <div class="track-meta">
                <span class="track-title">${track.title}</span>
                <span class="track-artist">${track.artist}</span>
            </div>
            ${btnHtml}
        `;
        
        // Tapping the row triggers Direct Play
        div.onclick = () => loadTrack(masterIndex);
        playlistView.appendChild(div);
    });
}

function filterPlaylist() {
    const query = document.getElementById('search-input').value.toLowerCase();
    const filtered = playlist.filter(t =>
        t.title.toLowerCase().includes(query) ||
        t.artist.toLowerCase().includes(query)
    );
    renderPlaylist(filtered);
}

function toggleLike() {
    likeBtn.classList.toggle('liked');
    likeBtn.innerHTML = likeBtn.classList.contains('liked') ? 
        '<i class="fas fa-heart"></i>' : 
        '<i class="far fa-heart"></i>';
}

function visualize() {
    requestAnimationFrame(visualize);
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(dataArray);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const barWidth = (canvas.width / bufferLength) * 2.5;
    let x = 0;
    for (let i = 0; i < bufferLength; i++) {
        let barHeight = dataArray[i] / 5;
        ctx.fillStyle = `rgba(245, 59, 87, ${barHeight / 20 + 0.2})`;
        ctx.fillRect(x, (canvas.height - barHeight * 2) / 2, barWidth, barHeight * 2);
        x += barWidth + 1;
    }
}

function updateEQ(index, val) {
    if (!initialized) initAudioContext();
    if (eqFilters[index]) {
        eqFilters[index].gain.value = parseFloat(val);
    }
}

function switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active-tab'));
    if(event && event.target && event.target.classList.contains('tab-btn')) {
        event.target.classList.add('active-tab');
    }
    
    document.getElementById('playlist-view').style.display = tab === 'playlist' ? 'block' : 'none';
    document.getElementById('eq-view').style.display = tab === 'eq' ? 'flex' : 'none';
    document.getElementById('lyrics-view').style.display = tab === 'lyrics' ? 'block' : 'none';
    document.getElementById('profile-view').style.display = tab === 'profile' ? 'block' : 'none';
    
    const searchInput = document.getElementById('search-input');
    if(searchInput) searchInput.style.display = tab === 'playlist' ? 'block' : 'none';
}

audio.addEventListener('timeupdate', () => {
    if (audio.duration) {
        const percent = (audio.currentTime / audio.duration) * 100;
        progressFill.style.width = `${percent}%`;
        document.getElementById('current-time').innerText = formatTime(audio.currentTime);
        document.getElementById('total-time').innerText = formatTime(audio.duration);
    }
});

audio.addEventListener('ended', nextTrack);
progressContainer.onclick = (e) => audio.currentTime = (e.offsetX / progressContainer.clientWidth) * audio.duration;

function formatTime(s) {
    if (isNaN(s)) return "0:00";
    return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
}

function toggleShuffle() { 
    isShuffle = !isShuffle; 
    document.getElementById('shuffle-btn').classList.toggle('active-shuffle'); 
}
function setVolume(v) { audio.volume = v; }

init();