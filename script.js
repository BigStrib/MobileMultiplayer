/* ===== STATE MANAGEMENT ===== */
const AppState = {
    streams: [],
    muted: {},
    selectedTab: 'add',
    isSheetOpen: false,
    draggedIndex: null,

    init() {
        this.loadStreams();
        this.loadMutedStates();
    },

    loadStreams() {
        const saved = localStorage.getItem('streamsync_streams');
        this.streams = saved ? JSON.parse(saved) : [];
    },

    loadMutedStates() {
        const saved = localStorage.getItem('streamsync_muted');
        this.muted = saved ? JSON.parse(saved) : {};
    },

    saveStreams() {
        localStorage.setItem('streamsync_streams', JSON.stringify(this.streams));
    },

    saveMutedStates() {
        localStorage.setItem('streamsync_muted', JSON.stringify(this.muted));
    },

    addStream(stream) {
        if (this.streams.length >= 4) {
            throw new Error('Maximum 4 streams allowed');
        }
        this.streams.push(stream);
        this.muted[this.streams.length - 1] = false;
        this.saveStreams();
        this.saveMutedStates();
    },

    removeStream(index) {
        this.streams.splice(index, 1);
        delete this.muted[index];
        
        const newMuted = {};
        Object.entries(this.muted).forEach(([key, value]) => {
            const idx = parseInt(key);
            if (idx > index) {
                newMuted[idx - 1] = value;
            } else if (idx < index) {
                newMuted[idx] = value;
            }
        });
        this.muted = newMuted;
        
        this.saveStreams();
        this.saveMutedStates();
    },

    moveStream(fromIndex, toIndex) {
        if (toIndex < 0 || toIndex >= this.streams.length) return;

        [this.streams[fromIndex], this.streams[toIndex]] = 
        [this.streams[toIndex], this.streams[fromIndex]];

        [this.muted[fromIndex], this.muted[toIndex]] = 
        [this.muted[toIndex], this.muted[fromIndex]];

        this.saveStreams();
        this.saveMutedStates();
    },

    toggleMute(index) {
        this.muted[index] = !this.muted[index];
        this.saveMutedStates();
    },

    clearAll() {
        this.streams = [];
        this.muted = {};
        this.saveStreams();
        this.saveMutedStates();
    },
};

/* ===== DOM ELEMENTS ===== */
const DOM = {
    viewport: document.getElementById('viewport'),
    gridContainer: document.getElementById('gridContainer'),
    fab: document.getElementById('fab'),
    bottomSheet: document.getElementById('bottomSheet'),
    sheetOverlay: document.getElementById('sheetOverlay'),
    sheetHandle: document.querySelector('.sheet-handle'),
    sheetTabs: document.querySelectorAll('.sheet-tab'),
    tabContents: document.querySelectorAll('.sheet-tab-content'),
    streamUrlInput: document.getElementById('streamUrlInput'),
    inputClearBtn: document.getElementById('inputClearBtn'),
    addStreamBtn: document.getElementById('addStreamBtn'),
    streamsContainer: document.getElementById('streamsContainer'),
    clearAllBtn: document.getElementById('clearAllBtn'),
    streamCount: document.getElementById('streamCount'),
    toastContainer: document.getElementById('toastContainer'),
};

/* ===== PLATFORM DETECTION ===== */
const PlatformDetector = {
    detect(url) {
        url = url.trim();

        if (this.isYoutube(url)) {
            return this.parseYoutube(url);
        }
        if (this.isTwitch(url)) {
            return this.parseTwitch(url);
        }
        if (this.isKick(url)) {
            return this.parseKick(url);
        }
        if (this.isRumble(url)) {
            return this.parseRumble(url);
        }

        throw new Error('Unsupported platform. Try YouTube, Twitch, Kick, or Rumble.');
    },

    isYoutube(url) {
        return /youtube\.com|youtu\.be/.test(url);
    },

    isTwitch(url) {
        return /twitch\.tv/.test(url);
    },

    isKick(url) {
        return /kick\.com/.test(url);
    },

    isRumble(url) {
        return /rumble\.com/.test(url);
    },

    parseYoutube(url) {
        const videoMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s?]+)/);
        if (videoMatch) {
            const videoId = videoMatch[1];
            return {
                platform: 'youtube',
                name: 'YouTube',
                videoId: videoId,
                embedUrl: `https://www.youtube.com/embed/${videoId}?autoplay=1&controls=1&modestbranding=1&playsinline=1&rel=0`,
                originalUrl: url,
            };
        }

        const channelMatch = url.match(/youtube\.com\/@([^/?]+)|youtube\.com\/channel\/([^/?]+)/);
        if (channelMatch) {
            const channelId = channelMatch[1] || channelMatch[2];
            return {
                platform: 'youtube',
                name: `YouTube - ${channelId}`,
                channelId: channelId,
                embedUrl: `https://www.youtube.com/embed/live_stream?channel=${channelId}&autoplay=1`,
                originalUrl: url,
            };
        }

        throw new Error('Invalid YouTube URL');
    },

    parseTwitch(url) {
        const channelMatch = url.match(/twitch\.tv\/([^/?]+)/);
        if (!channelMatch) {
            throw new Error('Invalid Twitch URL');
        }

        const channelName = channelMatch[1].toLowerCase();
        return {
            platform: 'twitch',
            name: `Twitch - ${channelName}`,
            channelName: channelName,
            embedUrl: `https://player.twitch.tv/?channel=${channelName}&parent=${window.location.hostname}&autoplay=true`,
            originalUrl: url,
        };
    },

    parseKick(url) {
        const channelMatch = url.match(/kick\.com\/([^/?]+)/);
        if (!channelMatch) {
            throw new Error('Invalid Kick URL');
        }

        const channelName = channelMatch[1].toLowerCase();
        return {
            platform: 'kick',
            name: `Kick - ${channelName}`,
            channelName: channelName,
            embedUrl: `https://player.kick.com/?channel=${channelName}`,
            originalUrl: url,
        };
    },

    parseRumble(url) {
        const videoMatch = url.match(/rumble\.com\/embed\/([^/?]+)|rumble\.com\/([^/?]+)/);
        if (!videoMatch) {
            throw new Error('Invalid Rumble URL');
        }

        const videoId = videoMatch[1] || videoMatch[2];
        return {
            platform: 'rumble',
            name: `Rumble - ${videoId}`,
            videoId: videoId,
            embedUrl: `https://rumble.com/embed/${videoId}/?pub=4`,
            originalUrl: url,
        };
    },
};

/* ===== UI RENDERER ===== */
const UIRenderer = {
    renderGrid() {
        DOM.gridContainer.innerHTML = '';

        for (let i = 0; i < 4; i++) {
            const tile = this.createStreamTile(i);
            DOM.gridContainer.appendChild(tile);
        }
    },

    createStreamTile(index) {
        const tile = document.createElement('div');
        tile.className = 'stream-tile';
        tile.dataset.index = index;

        if (AppState.streams[index]) {
            const stream = AppState.streams[index];
            const isMuted = AppState.muted[index];

            const iframe = document.createElement('iframe');
            iframe.className = 'stream-iframe';
            iframe.src = stream.embedUrl;
            iframe.allow = 'autoplay; encrypted-media; fullscreen';
            iframe.title = stream.name;
            iframe.loading = 'lazy';

            tile.appendChild(iframe);
            tile.classList.add('active');

            if (isMuted) {
                const overlay = document.createElement('div');
                overlay.className = 'muted-overlay';
                overlay.innerHTML = `
                    <div class="muted-badge">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                            <line x1="23" y1="9" x2="17" y2="15"/>
                            <line x1="17" y1="9" x2="23" y2="15"/>
                        </svg>
                        <span>Muted</span>
                    </div>
                `;
                tile.appendChild(overlay);
            }

            this.addTileDragListeners(tile, index);
        } else {
            const emptyState = document.createElement('div');
            emptyState.className = 'empty-state';
            emptyState.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/>
                    <line x1="7" y1="2" x2="7" y2="22"/>
                    <line x1="17" y1="2" x2="17" y2="22"/>
                    <line x1="2" y1="12" x2="22" y2="12"/>
                    <line x1="2" y1="7" x2="22" y2="7"/>
                    <line x1="2" y1="17" x2="22" y2="17"/>
                </svg>
                <div class="empty-state-text">Empty Slot</div>
            `;
            tile.appendChild(emptyState);
            tile.classList.add('empty');
        }

        return tile;
    },

    addTileDragListeners(tile, index) {
        let startX, startY, currentX, currentY;

        const handleTouchStart = (e) => {
            if (AppState.isSheetOpen) return;
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            currentX = startX;
            currentY = startY;
            AppState.draggedIndex = index;
            tile.classList.add('dragging');
        };

        const handleTouchMove = (e) => {
            if (AppState.draggedIndex === null) return;
            currentX = e.touches[0].clientX;
            currentY = e.touches[0].clientY;
        };

        const handleTouchEnd = (e) => {
            if (AppState.draggedIndex === null) return;

            const deltaX = currentX - startX;
            const deltaY = currentY - startY;
            const threshold = 40;

            if (Math.abs(deltaX) > threshold || Math.abs(deltaY) > threshold) {
                this.handleTileDragSwap(index, deltaX, deltaY);
            }

            tile.classList.remove('dragging');
            AppState.draggedIndex = null;
        };

        tile.addEventListener('touchstart', handleTouchStart, false);
        document.addEventListener('touchmove', handleTouchMove, false);
        document.addEventListener('touchend', handleTouchEnd, false);
    },

    handleTileDragSwap(index, deltaX, deltaY) {
        const absX = Math.abs(deltaX);
        const absY = Math.abs(deltaY);

        if (absX > absY) {
            if (deltaX > 0 && index % 2 === 1) {
                AppState.moveStream(index, index - 1);
            } else if (deltaX < 0 && index % 2 === 0 && index < 3) {
                AppState.moveStream(index, index + 1);
            }
        } else {
            if (deltaY > 0 && index > 1) {
                AppState.moveStream(index, index - 2);
            } else if (deltaY < 0 && index < 2) {
                AppState.moveStream(index, index + 2);
            }
        }

        this.renderGrid();
        this.renderStreamsList();
        Toast.show(`Stream moved`, 'info');
    },

    renderStreamsList() {
        DOM.streamsContainer.innerHTML = '';
        DOM.clearAllBtn.style.display = AppState.streams.length > 0 ? 'flex' : 'none';
        DOM.streamCount.textContent = `${AppState.streams.length}/4`;

        AppState.streams.forEach((stream, index) => {
            const item = this.createStreamItem(stream, index);
            DOM.streamsContainer.appendChild(item);
        });

        if (AppState.streams.length === 0) {
            const emptyMessage = document.createElement('div');
            emptyMessage.style.cssText = `
                text-align: center;
                padding: var(--spacing-3xl) var(--spacing-lg);
                color: var(--color-text-tertiary);
                font-size: 13px;
                font-weight: 500;
            `;
            emptyMessage.textContent = 'No active streams';
            DOM.streamsContainer.appendChild(emptyMessage);
        }
    },

    createStreamItem(stream, index) {
        const item = document.createElement('div');
        item.className = 'stream-item';
        item.draggable = true;

        const info = document.createElement('div');
        info.className = 'stream-item-info';
        info.innerHTML = `
            <div class="stream-item-name">${stream.name}</div>
            <div class="stream-item-platform">${stream.platform}</div>
        `;

        const controls = document.createElement('div');
        controls.className = 'stream-item-controls';

        const muteBtn = document.createElement('button');
        muteBtn.className = `control-btn mute-btn ${AppState.muted[index] ? 'muted' : ''}`;
        muteBtn.setAttribute('aria-label', AppState.muted[index] ? 'Unmute' : 'Mute');
        muteBtn.innerHTML = AppState.muted[index] 
            ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>`
            : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>`;
        muteBtn.addEventListener('click', () => {
            AppState.toggleMute(index);
            this.renderGrid();
            this.renderStreamsList();
        });

        const upBtn = document.createElement('button');
        upBtn.className = 'control-btn';
        upBtn.setAttribute('aria-label', 'Move up');
        upBtn.disabled = index === 0;
        upBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"/></svg>`;
        upBtn.addEventListener('click', () => {
            AppState.moveStream(index, index - 1);
            this.renderStreamsList();
        });

        const downBtn = document.createElement('button');
        downBtn.className = 'control-btn';
        downBtn.setAttribute('aria-label', 'Move down');
        downBtn.disabled = index === AppState.streams.length - 1;
        downBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>`;
        downBtn.addEventListener('click', () => {
            AppState.moveStream(index, index + 1);
            this.renderStreamsList();
        });

        const removeBtn = document.createElement('button');
        removeBtn.className = 'control-btn';
        removeBtn.setAttribute('aria-label', 'Remove stream');
        removeBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`;
        removeBtn.addEventListener('click', () => {
            AppState.removeStream(index);
            this.renderGrid();
            this.renderStreamsList();
            Toast.show('Stream removed', 'info');
        });

        controls.appendChild(muteBtn);
        controls.appendChild(upBtn);
        controls.appendChild(downBtn);
        controls.appendChild(removeBtn);

        item.appendChild(info);
        item.appendChild(controls);

        item.addEventListener('dragstart', () => {
            item.classList.add('dragging');
            AppState.draggedIndex = index;
        });

        item.addEventListener('dragend', () => {
            item.classList.remove('dragging');
            AppState.draggedIndex = null;
        });

        item.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (AppState.draggedIndex !== null && AppState.draggedIndex !== index) {
                AppState.moveStream(AppState.draggedIndex, index);
                AppState.draggedIndex = index;
                this.renderStreamsList();
            }
        });

        return item;
    },
};

/* ===== UI MANAGER ===== */
const UIManager = {
    openSheet(tab = 'add') {
        DOM.bottomSheet.classList.add('active');
        DOM.sheetOverlay.classList.add('active');
        AppState.isSheetOpen = true;
        document.body.style.overflow = 'hidden';

        if (tab) {
            this.switchTab(tab);
        }

        if (tab === 'add') {
            DOM.streamUrlInput.focus();
        }
    },

    closeSheet() {
        DOM.bottomSheet.classList.remove('active');
        DOM.sheetOverlay.classList.remove('active');
        AppState.isSheetOpen = false;
        document.body.style.overflow = '';
    },

    switchTab(tabName) {
        DOM.sheetTabs.forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });

        DOM.tabContents.forEach(content => {
            content.classList.toggle('active', content.dataset.tabContent === tabName);
        });

        AppState.selectedTab = tabName;
    },

    addStream() {
        const url = DOM.streamUrlInput.value.trim();

        if (!url) {
            Toast.show('Please enter a stream URL', 'error');
            return;
        }

        try {
            const stream = PlatformDetector.detect(url);
            AppState.addStream(stream);
            UIRenderer.renderGrid();
            UIRenderer.renderStreamsList();
            DOM.streamUrlInput.value = '';
            Toast.show(`Added ${stream.name}`, 'success');
        } catch (error) {
            Toast.show(error.message, 'error');
        }
    },

    clearAllStreams() {
        if (AppState.streams.length === 0) return;

        if (confirm('Remove all streams?')) {
            AppState.clearAll();
            UIRenderer.renderGrid();
            UIRenderer.renderStreamsList();
            Toast.show('All streams cleared', 'info');
        }
    },
};

/* ===== TOAST NOTIFICATIONS ===== */
const Toast = {
    show(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;

        const iconMap = {
            success: `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`,
            error: `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
            info: `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
        };

        toast.innerHTML = `${iconMap[type] || ''}<span>${message}</span>`;
        DOM.toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('removing');
            setTimeout(() => toast.remove(), 250);
        }, 2500);
    },
};

/* ===== BOTTOM SHEET DRAG HANDLING ===== */
const BottomSheetDrag = {
    startY: 0,
    currentY: 0,
    isDragging: false,

    init() {
        const sheetHandle = document.querySelector('.sheet-handle');
        sheetHandle.addEventListener('touchstart', (e) => this.handleTouchStart(e));
        document.addEventListener('touchmove', (e) => this.handleTouchMove(e));
        document.addEventListener('touchend', (e) => this.handleTouchEnd(e));
    },

    handleTouchStart(e) {
        this.startY = e.touches[0].clientY;
        this.currentY = this.startY;
        this.isDragging = true;
        DOM.bottomSheet.style.transition = 'none';
    },

    handleTouchMove(e) {
        if (!this.isDragging || !AppState.isSheetOpen) return;
        
        this.currentY = e.touches[0].clientY;
        const deltaY = this.currentY - this.startY;

        if (deltaY > 0) {
            const progress = deltaY / window.innerHeight;
            DOM.bottomSheet.style.transform = `translateY(${deltaY}px)`;
            DOM.sheetOverlay.style.opacity = Math.max(0, 1 - progress * 2);
        }
    },

    handleTouchEnd() {
        if (!this.isDragging) return;

        const deltaY = this.currentY - this.startY;
        const threshold = 100;

        DOM.bottomSheet.style.transition = `transform var(--transition-base)`;

        if (deltaY > threshold) {
            UIManager.closeSheet();
        } else {
            DOM.bottomSheet.style.transform = 'translateY(0)';
            DOM.sheetOverlay.style.opacity = '1';
        }

        this.isDragging = false;
    },
};

/* ===== EVENT LISTENERS ===== */
function initEventListeners() {
    DOM.fab.addEventListener('click', () => UIManager.openSheet('add'));

    DOM.sheetOverlay.addEventListener('click', () => UIManager.closeSheet());

    DOM.sheetTabs.forEach(tab => {
        tab.addEventListener('click', () => UIManager.switchTab(tab.dataset.tab));
    });

    DOM.streamUrlInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            UIManager.addStream();
        }
    });

    DOM.inputClearBtn.addEventListener('click', () => {
        DOM.streamUrlInput.value = '';
        DOM.streamUrlInput.focus();
    });

    DOM.addStreamBtn.addEventListener('click', () => UIManager.addStream());
    DOM.clearAllBtn.addEventListener('click', () => UIManager.clearAllStreams());

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && AppState.isSheetOpen) {
            UIManager.closeSheet();
        }
    });

    document.addEventListener('touchmove', (e) => {
        if (AppState.isSheetOpen && !e.target.closest('.sheet-content')) {
            e.preventDefault();
        }
    }, { passive: false });

    window.addEventListener('storage', (e) => {
        if (e.key === 'streamsync_streams' || e.key === 'streamsync_muted') {
            AppState.init();
            UIRenderer.renderGrid();
            UIRenderer.renderStreamsList();
        }
    });
}

/* ===== INITIALIZATION ===== */
function init() {
    AppState.init();
    UIRenderer.renderGrid();
    UIRenderer.renderStreamsList();
    BottomSheetDrag.init();
    initEventListeners();

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            AppState.init();
            UIRenderer.renderGrid();
            UIRenderer.renderStreamsList();
        }
    });
}

document.readyState === 'loading' 
    ? document.addEventListener('DOMContentLoaded', init) 
    : init();