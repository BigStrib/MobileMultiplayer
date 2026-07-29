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
            throw new Error('Maximum 4 streams');
        }
        this.streams.push(stream);
        this.muted[this.streams.length - 1] = false;
        this.saveStreams();
        this.saveMutedStates();
    },

    removeStream(index) {
        this.streams.splice(index, 1);
        
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

        throw new Error('Unsupported platform. Use YouTube, Twitch, Kick, or Rumble.');
    },

    isYoutube(url) {
        return /youtube\.com|youtu\.be|youtube-nocookie\.com/.test(url);
    },

    isTwitch(url) {
        return /twitch\.tv|clips\.twitch\.tv/.test(url);
    },

    isKick(url) {
        return /kick\.com/.test(url);
    },

    isRumble(url) {
        return /rumble\.com/.test(url);
    },

    parseYoutube(url) {
        // Parse video ID from various YouTube URL formats
        const patterns = [
            /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s?]+)/,
            /youtube\.com\/embed\/([^/?]+)/,
            /youtube-nocookie\.com\/embed\/([^/?]+)/,
            /youtube\.com\/v\/([^/?]+)/,
            /youtube\.com\/watch\?.*v=([^&]+)/,
        ];

        let videoId = null;
        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match) {
                videoId = match[1];
                break;
            }
        }

        if (videoId) {
            return {
                platform: 'YouTube',
                name: 'YouTube',
                videoId: videoId,
                embedUrl: `https://www.youtube.com/embed/${videoId}?autoplay=1&controls=1&modestbranding=1&playsinline=1&rel=0&iv_load_policy=3`,
                originalUrl: url,
            };
        }

        // Try parsing as channel
        const channelPatterns = [
            /youtube\.com\/@([^/?]+)/,
            /youtube\.com\/channel\/([^/?]+)/,
            /youtube\.com\/c\/([^/?]+)/,
            /youtube\.com\/user\/([^/?]+)/,
        ];

        for (const pattern of channelPatterns) {
            const match = url.match(pattern);
            if (match) {
                const channelId = match[1];
                return {
                    platform: 'YouTube',
                    name: `YouTube - ${channelId}`,
                    channelId: channelId,
                    embedUrl: `https://www.youtube.com/embed/live_stream?channel=${channelId}&autoplay=1`,
                    originalUrl: url,
                };
            }
        }

        throw new Error('Invalid YouTube URL format');
    },

    parseTwitch(url) {
        // Parse channel name from various Twitch URL formats
        const patterns = [
            /twitch\.tv\/([^/?]+)(?:\?|\#|\/|$)/,
            /twitch\.tv\/([^/?]+)/,
            /clips\.twitch\.tv\/([^/?]+)/,
        ];

        let channelName = null;
        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match) {
                channelName = match[1].toLowerCase();
                break;
            }
        }

        if (!channelName) {
            throw new Error('Invalid Twitch URL format');
        }

        // Filter out query parameters
        channelName = channelName.split('?')[0].split('#')[0].split('/')[0];

        return {
            platform: 'Twitch',
            name: `Twitch - ${channelName}`,
            channelName: channelName,
            embedUrl: `https://player.twitch.tv/?channel=${channelName}&parent=${window.location.hostname}&autoplay=true&muted=false`,
            originalUrl: url,
        };
    },

    parseKick(url) {
        // Parse channel name from various Kick URL formats
        const patterns = [
            /kick\.com\/([a-zA-Z0-9_-]+)(?:\?|\#|\/|$)/,
            /kick\.com\/([a-zA-Z0-9_-]+)/,
            /kick\.com\/watch\/([a-zA-Z0-9_-]+)/,
            /kick\.com\/video\/([a-zA-Z0-9_-]+)/,
            /player\.kick\.com\/\?channel=([a-zA-Z0-9_-]+)/,
        ];

        let channelName = null;
        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match) {
                channelName = match[1].toLowerCase();
                break;
            }
        }

        if (!channelName) {
            throw new Error('Invalid Kick URL format');
        }

        // Additional safety: extract only alphanumeric and common characters
        channelName = channelName.replace(/[^a-z0-9_-]/gi, '');

        if (!channelName) {
            throw new Error('Could not extract Kick channel name');
        }

        return {
            platform: 'Kick',
            name: `Kick - ${channelName}`,
            channelName: channelName,
            embedUrl: `https://player.kick.com/?channel=${channelName}&autoplay=true`,
            originalUrl: url,
        };
    },

    parseRumble(url) {
        // Parse video ID from various Rumble URL formats
        const patterns = [
            /rumble\.com\/embed\/([a-zA-Z0-9]+)(?:\?|\#|\/|$)/,
            /rumble\.com\/embed\/([a-zA-Z0-9]+)/,
            /rumble\.com\/v([a-zA-Z0-9]+)(?:\?|\#|\/|$)/,
            /rumble\.com\/v([a-zA-Z0-9]+)/,
            /rumble\.com\/([a-zA-Z0-9]+)(?:\?|\#|\/|$)/,
            /rumble\.com\/([a-zA-Z0-9]+)/,
            /rumble\.com\/watch\/\?v=([a-zA-Z0-9]+)/,
        ];

        let videoId = null;
        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match) {
                videoId = match[1];
                break;
            }
        }

        if (!videoId) {
            throw new Error('Invalid Rumble URL format');
        }

        // Safety check
        if (videoId.length < 3) {
            throw new Error('Invalid video ID');
        }

        return {
            platform: 'Rumble',
            name: 'Rumble',
            videoId: videoId,
            embedUrl: `https://rumble.com/embed/${videoId}/?pub=4`,
            originalUrl: url,
        };
    },
};

/* ===== GRID LAYOUT MANAGER ===== */
const GridManager = {
    getGridClass() {
        const count = AppState.streams.length;
        
        if (count === 0) return 'grid-1';
        if (count === 1) return 'grid-1';
        if (count === 2) {
            return window.innerWidth > window.innerHeight ? 'grid-2-horizontal' : 'grid-2-vertical';
        }
        if (count === 3) return 'grid-3';
        return 'grid-4';
    },

    updateGridClass() {
        const gridClass = this.getGridClass();
        DOM.gridContainer.className = `grid-container ${gridClass}`;
    }
};

/* ===== UI RENDERER ===== */
const UIRenderer = {
    renderGrid() {
        DOM.gridContainer.innerHTML = '';
        GridManager.updateGridClass();

        for (let i = 0; i < AppState.streams.length; i++) {
            const tile = this.createStreamTile(i);
            DOM.gridContainer.appendChild(tile);
        }
    },

    createStreamTile(index) {
        const tile = document.createElement('div');
        tile.className = 'stream-tile active';
        tile.dataset.index = index;
        tile.style.margin = '0';
        tile.style.padding = '0';

        const stream = AppState.streams[index];
        const isMuted = AppState.muted[index];

        const iframe = document.createElement('iframe');
        iframe.className = 'stream-iframe';
        iframe.src = stream.embedUrl;
        iframe.allow = 'autoplay; encrypted-media; fullscreen; clipboard-write';
        iframe.title = stream.name;
        iframe.loading = 'lazy';
        iframe.style.margin = '0';
        iframe.style.padding = '0';
        iframe.style.display = 'block';

        tile.appendChild(iframe);

        if (isMuted) {
            const overlay = document.createElement('div');
            overlay.className = 'muted-overlay';
            overlay.style.margin = '0';
            overlay.style.padding = '0';
            overlay.innerHTML = `
                <div class="muted-badge">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                        <line x1="23" y1="9" x2="17" y2="15"/>
                        <line x1="17" y1="9" x2="23" y2="15"/>
                    </svg>
                </div>
            `;
            tile.appendChild(overlay);
        }

        this.addTileDragListeners(tile, index);
        return tile;
    },

    addTileDragListeners(tile, index) {
        let startX, startY, currentX, currentY;

        const handleTouchStart = (e) => {
            if (AppState.isSheetOpen || AppState.streams.length <= 1) return;
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            currentX = startX;
            currentY = startY;
        };

        const handleTouchMove = (e) => {
            if (AppState.isSheetOpen || AppState.streams.length <= 1) return;
            currentX = e.touches[0].clientX;
            currentY = e.touches[0].clientY;
        };

        const handleTouchEnd = (e) => {
            if (AppState.isSheetOpen || AppState.streams.length <= 1) return;

            const deltaX = currentX - startX;
            const deltaY = currentY - startY;
            const threshold = 50;

            if (Math.abs(deltaX) > threshold || Math.abs(deltaY) > threshold) {
                this.determineSwap(index, deltaX, deltaY);
            }
        };

        tile.addEventListener('touchstart', handleTouchStart, false);
        tile.addEventListener('touchmove', handleTouchMove, false);
        tile.addEventListener('touchend', handleTouchEnd, false);
    },

    determineSwap(index, deltaX, deltaY) {
        const absX = Math.abs(deltaX);
        const absY = Math.abs(deltaY);
        const count = AppState.streams.length;

        if (count === 1) return;

        if (count === 2) {
            if (absX > absY) {
                AppState.moveStream(index, index === 0 ? 1 : 0);
            }
        } else if (count === 3) {
            if (absX > absY) {
                if (deltaX > 0 && index % 2 === 1) {
                    AppState.moveStream(index, index - 1);
                } else if (deltaX < 0 && index % 2 === 0 && index < 2) {
                    AppState.moveStream(index, index + 1);
                }
            } else {
                if (deltaY > 0 && index > 1) {
                    AppState.moveStream(index, index - 2);
                } else if (deltaY < 0 && index < 2) {
                    AppState.moveStream(index, index + 2);
                }
            }
        } else if (count === 4) {
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
        }

        this.renderGrid();
        this.renderStreamsList();
    },

    renderStreamsList() {
        DOM.streamsContainer.innerHTML = '';
        DOM.clearAllBtn.style.display = AppState.streams.length > 0 ? 'flex' : 'none';
        DOM.streamCount.textContent = `${AppState.streams.length}/4`;

        AppState.streams.forEach((stream, index) => {
            const item = this.createStreamItem(stream, index);
            DOM.streamsContainer.appendChild(item);
        });
    },

    createStreamItem(stream, index) {
        const item = document.createElement('div');
        item.className = 'stream-item';
        item.draggable = true;
        item.style.margin = '0';

        const info = document.createElement('div');
        info.className = 'stream-item-info';
        info.innerHTML = `
            <div class="stream-item-name">${this.escapeHtml(stream.name)}</div>
            <div class="stream-item-platform">${this.escapeHtml(stream.platform)}</div>
        `;

        const controls = document.createElement('div');
        controls.className = 'stream-item-controls';
        controls.style.margin = '0';

        // Mute button
        const muteBtn = document.createElement('button');
        muteBtn.className = `control-btn mute-btn ${AppState.muted[index] ? 'muted' : ''}`;
        muteBtn.setAttribute('aria-label', AppState.muted[index] ? 'Unmute' : 'Mute');
        muteBtn.innerHTML = AppState.muted[index] 
            ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>`
            : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>`;
        muteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            AppState.toggleMute(index);
            this.renderGrid();
            this.renderStreamsList();
        });

        // Move up button
        const upBtn = document.createElement('button');
        upBtn.className = 'control-btn';
        upBtn.setAttribute('aria-label', 'Move up');
        upBtn.disabled = index === 0;
        upBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"/></svg>`;
        upBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            AppState.moveStream(index, index - 1);
            this.renderGrid();
            this.renderStreamsList();
        });

        // Move down button
        const downBtn = document.createElement('button');
        downBtn.className = 'control-btn';
        downBtn.setAttribute('aria-label', 'Move down');
        downBtn.disabled = index === AppState.streams.length - 1;
        downBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>`;
        downBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            AppState.moveStream(index, index + 1);
            this.renderGrid();
            this.renderStreamsList();
        });

        // Remove button
        const removeBtn = document.createElement('button');
        removeBtn.className = 'control-btn';
        removeBtn.setAttribute('aria-label', 'Remove stream');
        removeBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`;
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
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

        // Drag handlers for list reordering
        item.addEventListener('dragstart', (e) => {
            AppState.draggedIndex = index;
            item.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        });

        item.addEventListener('dragend', (e) => {
            AppState.draggedIndex = null;
            item.classList.remove('dragging');
        });

        item.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            if (AppState.draggedIndex !== null && AppState.draggedIndex !== index) {
                AppState.moveStream(AppState.draggedIndex, index);
                AppState.draggedIndex = index;
                this.renderStreamsList();
            }
        });

        item.addEventListener('drop', (e) => {
            e.preventDefault();
        });

        return item;
    },

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },
};

/* ===== UI MANAGER ===== */
const UIManager = {
    openSheet(tab = 'add') {
        DOM.bottomSheet.classList.add('active');
        DOM.sheetOverlay.classList.add('active');
        AppState.isSheetOpen = true;
        
        if (tab) {
            this.switchTab(tab);
        }

        if (tab === 'add') {
            setTimeout(() => DOM.streamUrlInput.focus(), 100);
        }
    },

    closeSheet() {
        DOM.bottomSheet.classList.remove('active');
        DOM.sheetOverlay.classList.remove('active');
        AppState.isSheetOpen = false;
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
            Toast.show('Enter a stream URL', 'error');
            DOM.streamUrlInput.focus();
            return;
        }

        try {
            const stream = PlatformDetector.detect(url);
            AppState.addStream(stream);
            UIRenderer.renderGrid();
            UIRenderer.renderStreamsList();
            DOM.streamUrlInput.value = '';
            Toast.show(`Added ${stream.name}`, 'success');
            DOM.streamUrlInput.focus();
        } catch (error) {
            Toast.show(error.message, 'error');
            DOM.streamUrlInput.focus();
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
        toast.style.margin = '0';

        const icons = {
            success: `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`,
            error: `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
            info: `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
        };

        const span = document.createElement('span');
        span.textContent = message;

        toast.innerHTML = icons[type] || '';
        toast.appendChild(span);
        DOM.toastContainer.appendChild(toast);

        setTimeout(() => toast.remove(), 3000);
    },
};

/* ===== BOTTOM SHEET DRAG HANDLING ===== */
const BottomSheetDrag = {
    startY: 0,
    isDragging: false,

    init() {
        const handle = document.querySelector('.sheet-handle');
        if (!handle) return;

        handle.addEventListener('touchstart', (e) => this.handleStart(e), false);
        document.addEventListener('touchmove', (e) => this.handleMove(e), false);
        document.addEventListener('touchend', () => this.handleEnd(), false);
    },

    handleStart(e) {
        this.startY = e.touches[0].clientY;
        this.isDragging = true;
        DOM.bottomSheet.style.transition = 'none';
    },

    handleMove(e) {
        if (!this.isDragging || !AppState.isSheetOpen) return;
        
        const currentY = e.touches[0].clientY;
        const deltaY = currentY - this.startY;

        if (deltaY > 0) {
            DOM.bottomSheet.style.transform = `translateY(${deltaY}px)`;
            DOM.sheetOverlay.style.opacity = Math.max(0, 1 - deltaY / 300);
        }
    },

    handleEnd() {
        if (!this.isDragging) return;
        
        DOM.bottomSheet.style.transition = `transform var(--transition-base)`;
        
        const rect = DOM.bottomSheet.getBoundingClientRect();
        if (rect.top > window.innerHeight * 0.5) {
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
    // FAB
    DOM.fab.addEventListener('click', () => {
        UIManager.openSheet('add');
    });

    // Sheet overlay
    DOM.sheetOverlay.addEventListener('click', () => {
        UIManager.closeSheet();
    });

    // Tabs
    DOM.sheetTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            UIManager.switchTab(tab.dataset.tab);
        });
    });

    // Input field
    DOM.streamUrlInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            UIManager.addStream();
        }
    });

    // Clear button
    DOM.inputClearBtn.addEventListener('click', () => {
        DOM.streamUrlInput.value = '';
        DOM.streamUrlInput.focus();
    });

    // Add button
    DOM.addStreamBtn.addEventListener('click', () => {
        UIManager.addStream();
    });

    // Clear all button
    DOM.clearAllBtn.addEventListener('click', () => {
        UIManager.clearAllStreams();
    });

    // Keyboard
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && AppState.isSheetOpen) {
            UIManager.closeSheet();
        }
    });

    // Window resize
    window.addEventListener('resize', () => {
        if (AppState.streams.length > 0) {
            GridManager.updateGridClass();
        }
    }, false);

    // Prevent scroll when sheet is open
    document.addEventListener('touchmove', (e) => {
        if (AppState.isSheetOpen && !e.target.closest('.sheet-content')) {
            e.preventDefault();
        }
    }, { passive: false });

    // Storage sync
    window.addEventListener('storage', (e) => {
        if (e.key === 'streamsync_streams' || e.key === 'streamsync_muted') {
            AppState.init();
            UIRenderer.renderGrid();
            UIRenderer.renderStreamsList();
        }
    });

    // Visibility change
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
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
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}