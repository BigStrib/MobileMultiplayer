(function() {
    'use strict';

    // ===== STATE =====
    const state = {
        videos: [],
        layout: '2',
        fillMode: true,
        activeVideoIndex: -1,
        uiVisible: true,
        hideTimer: null,
        dragSource: null
    };

    // ===== DOM REFS =====
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    const dom = {
        topBar: $('#topBar'),
        videoGrid: $('#videoGrid'),
        emptyState: $('#emptyState'),
        addModal: $('#addModal'),
        layoutModal: $('#layoutModal'),
        controlsOverlay: $('#controlsOverlay'),
        urlInput: $('#urlInput'),
        addBtn: $('#addBtn'),
        addVideoBtn: $('#addVideoBtn'),
        layoutBtn: $('#layoutBtn'),
        closeModal: $('#closeModal'),
        closeLayoutModal: $('#closeLayoutModal'),
        pasteBtn: $('#pasteBtn'),
        fillToggle: $('#fillToggle'),
        tapHint: $('#tapHint')
    };

    // ===== URL PARSERS =====
    const parsers = {
        youtube(url) {
            const patterns = [
                /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
                /youtube\.com\/live\/([a-zA-Z0-9_-]{11})/,
                /^([a-zA-Z0-9_-]{11})$/
            ];
            for (const p of patterns) {
                const m = url.match(p);
                if (m) return { platform: 'youtube', id: m[1] };
            }
            // YouTube playlist
            const plMatch = url.match(/[?&]list=([a-zA-Z0-9_-]+)/);
            const vidMatch = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
            if (vidMatch) return { platform: 'youtube', id: vidMatch[1] };

            // YouTube channel live
            const channelMatch = url.match(/youtube\.com\/@([^\/\?]+)/);
            if (channelMatch) return { platform: 'youtube', id: channelMatch[1], type: 'channel' };

            return null;
        },

        twitch(url) {
            // Twitch clips
            const clipMatch = url.match(/clips\.twitch\.tv\/([a-zA-Z0-9_-]+)/);
            if (clipMatch) return { platform: 'twitch', id: clipMatch[1], type: 'clip' };

            const clipMatch2 = url.match(/twitch\.tv\/\w+\/clip\/([a-zA-Z0-9_-]+)/);
            if (clipMatch2) return { platform: 'twitch', id: clipMatch2[1], type: 'clip' };

            // Twitch VOD
            const vodMatch = url.match(/twitch\.tv\/videos\/(\d+)/);
            if (vodMatch) return { platform: 'twitch', id: vodMatch[1], type: 'vod' };

            // Twitch channel
            const channelMatch = url.match(/twitch\.tv\/([a-zA-Z0-9_]+)\/?$/);
            if (channelMatch && channelMatch[1] !== 'videos') {
                return { platform: 'twitch', id: channelMatch[1], type: 'channel' };
            }

            // Plain channel name check
            if (/^[a-zA-Z0-9_]{3,25}$/.test(url) && !url.includes('.')) {
                return null; // Could be any platform
            }

            return null;
        },

        rumble(url) {
            // Rumble embed
            const embedMatch = url.match(/rumble\.com\/embed\/([a-zA-Z0-9]+)/);
            if (embedMatch) return { platform: 'rumble', id: embedMatch[1], type: 'embed' };

            // Rumble video page
            const videoMatch = url.match(/rumble\.com\/([a-zA-Z0-9\-]+)\.html/);
            if (videoMatch) return { platform: 'rumble', id: videoMatch[1], type: 'video' };

            // Rumble general URL
            const generalMatch = url.match(/rumble\.com\/([a-zA-Z0-9\-]+)/);
            if (generalMatch) return { platform: 'rumble', id: generalMatch[1], type: 'video' };

            return null;
        },

        kick(url) {
            // Kick clip
            const clipMatch = url.match(/kick\.com\/[^\/]+\?clip=([a-zA-Z0-9_-]+)/);
            if (clipMatch) return { platform: 'kick', id: clipMatch[1], type: 'clip' };

            // Kick video/VOD
            const vodMatch = url.match(/kick\.com\/video\/([a-zA-Z0-9_-]+)/);
            if (vodMatch) return { platform: 'kick', id: vodMatch[1], type: 'vod' };

            // Kick channel
            const channelMatch = url.match(/kick\.com\/([a-zA-Z0-9_]+)\/?$/);
            if (channelMatch) return { platform: 'kick', id: channelMatch[1], type: 'channel' };

            return null;
        }
    };

    function parseURL(input) {
        input = input.trim();

        // Add protocol if missing
        let url = input;
        if (!url.includes('://') && url.includes('.')) {
            url = 'https://' + url;
        }

        // Try each parser
        const yt = parsers.youtube(url);
        if (yt) return yt;

        const tw = parsers.twitch(url);
        if (tw) return tw;

        const ru = parsers.rumble(url);
        if (ru) return ru;

        const ki = parsers.kick(url);
        if (ki) return ki;

        // Check if it looks like an embed URL already
        if (url.includes('iframe') || url.includes('embed')) {
            return { platform: 'custom', embedUrl: url };
        }

        return null;
    }

    function getEmbedURL(parsed) {
        const parent = window.location.hostname || 'localhost';

        switch (parsed.platform) {
            case 'youtube':
                if (parsed.type === 'channel') {
                    return `https://www.youtube.com/embed/live_stream?channel=${parsed.id}&autoplay=1&mute=1&playsinline=1`;
                }
                return `https://www.youtube.com/embed/${parsed.id}?autoplay=1&mute=1&playsinline=1&rel=0&modestbranding=1&controls=0`;

            case 'twitch':
                if (parsed.type === 'clip') {
                    return `https://clips.twitch.tv/embed?clip=${parsed.id}&parent=${parent}&autoplay=true&muted=true`;
                }
                if (parsed.type === 'vod') {
                    return `https://player.twitch.tv/?video=v${parsed.id}&parent=${parent}&autoplay=true&muted=true`;
                }
                return `https://player.twitch.tv/?channel=${parsed.id}&parent=${parent}&autoplay=true&muted=true`;

            case 'rumble':
                if (parsed.type === 'embed') {
                    return `https://rumble.com/embed/${parsed.id}/?autoplay=1&mute=1`;
                }
                return `https://rumble.com/embed/${parsed.id}/?autoplay=1&mute=1`;

            case 'kick':
                if (parsed.type === 'clip') {
                    return `https://player.kick.com/clip/${parsed.id}?autoplay=true&muted=true`;
                }
                if (parsed.type === 'vod') {
                    return `https://player.kick.com/${parsed.id}?autoplay=true&muted=true`;
                }
                return `https://player.kick.com/${parsed.id}?autoplay=true&muted=true`;

            case 'custom':
                return parsed.embedUrl;

            default:
                return null;
        }
    }

    // ===== VIDEO MANAGEMENT =====
    function addVideo(url) {
        const parsed = parseURL(url);
        if (!parsed) {
            showToast('Could not parse URL', true);
            return false;
        }

        const embedUrl = getEmbedURL(parsed);
        if (!embedUrl) {
            showToast('Unsupported URL format', true);
            return false;
        }

        const video = {
            id: Date.now() + Math.random(),
            url: url,
            embedUrl: embedUrl,
            platform: parsed.platform,
            muted: true
        };

        state.videos.push(video);
        renderVideos();
        saveState();
        showToast(`${parsed.platform} video added`);
        return true;
    }

    function removeVideo(index) {
        state.videos.splice(index, 1);
        state.activeVideoIndex = -1;
        hideControls();
        renderVideos();
        saveState();
    }

    function moveVideo(fromIndex, toIndex) {
        if (toIndex < 0 || toIndex >= state.videos.length) return;
        const [video] = state.videos.splice(fromIndex, 1);
        state.videos.splice(toIndex, 0, video);
        state.activeVideoIndex = toIndex;
        renderVideos();
        saveState();
    }

    function reloadVideo(index) {
        const cells = $$('.video-cell');
        if (cells[index]) {
            const iframe = cells[index].querySelector('iframe');
            if (iframe) {
                const src = iframe.src;
                iframe.src = '';
                setTimeout(() => { iframe.src = src; }, 100);
            }
        }
    }

    function toggleMute(index) {
        const video = state.videos[index];
        if (!video) return;

        video.muted = !video.muted;

        // For YouTube, we can try postMessage
        const cells = $$('.video-cell');
        const iframe = cells[index]?.querySelector('iframe');

        if (iframe) {
            let newSrc = video.embedUrl;
            if (video.platform === 'youtube') {
                newSrc = newSrc.replace(/mute=[01]/, `mute=${video.muted ? 1 : 0}`);
            } else if (video.platform === 'twitch') {
                newSrc = newSrc.replace(/muted=(true|false)/, `muted=${video.muted}`);
            } else if (video.platform === 'kick') {
                newSrc = newSrc.replace(/muted=(true|false)/, `muted=${video.muted}`);
            } else if (video.platform === 'rumble') {
                newSrc = newSrc.replace(/mute=[01]/, `mute=${video.muted ? 1 : 0}`);
            }
            video.embedUrl = newSrc;
            iframe.src = newSrc;
        }

        updateMuteButton(index);
        saveState();
    }

    function updateMuteButton(index) {
        const muteBtn = $(`.ctrl-btn[data-action="mute"]`);
        if (!muteBtn) return;
        const video = state.videos[index];
        if (!video) return;

        if (video.muted) {
            muteBtn.classList.remove('muted');
            muteBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>`;
        } else {
            muteBtn.classList.add('muted');
            muteBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>`;
        }
    }

    // ===== RENDER =====
    function renderVideos() {
        const grid = dom.videoGrid;
        grid.innerHTML = '';
        grid.dataset.layout = state.layout;

        if (state.videos.length === 0) {
            dom.emptyState.classList.remove('hidden');
            return;
        }

        dom.emptyState.classList.add('hidden');

        state.videos.forEach((video, index) => {
            const cell = document.createElement('div');
            cell.className = `video-cell${state.fillMode ? ' fill-mode' : ''}`;
            cell.dataset.index = index;
            cell.draggable = true;

            if (index === state.activeVideoIndex) {
                cell.classList.add('active');
            }

            cell.innerHTML = `
                <iframe
                    src="${video.embedUrl}"
                    allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                    allowfullscreen
                    loading="lazy"
                    sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-presentation"
                ></iframe>
                <div class="video-tap-zone" data-index="${index}"></div>
                <span class="platform-badge ${video.platform}">${video.platform}</span>
                <div class="drag-handle" data-index="${index}">
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M11 18c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zm-2-8c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0-6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm6 4c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>
                </div>
            `;

            // Drag and drop
            cell.addEventListener('dragstart', handleDragStart);
            cell.addEventListener('dragend', handleDragEnd);
            cell.addEventListener('dragover', handleDragOver);
            cell.addEventListener('dragenter', handleDragEnter);
            cell.addEventListener('dragleave', handleDragLeave);
            cell.addEventListener('drop', handleDrop);

            // Touch drag
            cell.addEventListener('touchstart', handleTouchStart, { passive: false });
            cell.addEventListener('touchmove', handleTouchMove, { passive: false });
            cell.addEventListener('touchend', handleTouchEnd);

            grid.appendChild(cell);
        });

        // Apply layout-specific row calculations
        adjustGridRows();
    }

    function adjustGridRows() {
        const grid = dom.videoGrid;
        const count = state.videos.length;
        const layout = state.layout;

        if (layout === 'pip' || layout === '2x1') {
            // PiP and Featured layouts handled by CSS
            return;
        }

        let cols;
        switch (layout) {
            case '1': cols = 1; break;
            case '2': cols = 2; break;
            case '3': cols = 3; break;
            case 'auto': cols = count <= 1 ? 1 : count <= 4 ? 2 : 3; break;
            default: cols = 2;
        }

        if (layout === 'auto') {
            grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
        }

        const rows = Math.ceil(count / cols);
        grid.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
    }

    // ===== DRAG & DROP (Desktop) =====
    function handleDragStart(e) {
        state.dragSource = parseInt(e.currentTarget.dataset.index);
        e.currentTarget.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
    }

    function handleDragEnd(e) {
        e.currentTarget.classList.remove('dragging');
        $$('.video-cell').forEach(c => c.classList.remove('drag-over'));
        state.dragSource = null;
    }

    function handleDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    }

    function handleDragEnter(e) {
        e.currentTarget.classList.add('drag-over');
    }

    function handleDragLeave(e) {
        e.currentTarget.classList.remove('drag-over');
    }

    function handleDrop(e) {
        e.preventDefault();
        const target = parseInt(e.currentTarget.dataset.index);
        if (state.dragSource !== null && state.dragSource !== target) {
            swapVideos(state.dragSource, target);
        }
        e.currentTarget.classList.remove('drag-over');
    }

    // ===== TOUCH DRAG =====
    let touchDragData = { active: false, startX: 0, startY: 0, index: -1, longPress: null };

    function handleTouchStart(e) {
        const index = parseInt(e.currentTarget.dataset.index);
        const touch = e.touches[0];
        touchDragData.startX = touch.clientX;
        touchDragData.startY = touch.clientY;
        touchDragData.index = index;

        // Long press to start drag
        touchDragData.longPress = setTimeout(() => {
            touchDragData.active = true;
            e.currentTarget.classList.add('dragging');
            navigator.vibrate && navigator.vibrate(50);
        }, 500);
    }

    function handleTouchMove(e) {
        if (!touchDragData.active) {
            const touch = e.touches[0];
            const dx = Math.abs(touch.clientX - touchDragData.startX);
            const dy = Math.abs(touch.clientY - touchDragData.startY);
            if (dx > 10 || dy > 10) {
                clearTimeout(touchDragData.longPress);
            }
            return;
        }
        e.preventDefault();

        const touch = e.touches[0];
        const target = document.elementFromPoint(touch.clientX, touch.clientY);
        const cell = target?.closest('.video-cell');

        $$('.video-cell').forEach(c => c.classList.remove('drag-over'));
        if (cell && parseInt(cell.dataset.index) !== touchDragData.index) {
            cell.classList.add('drag-over');
        }
    }

    function handleTouchEnd(e) {
        clearTimeout(touchDragData.longPress);

        if (touchDragData.active) {
            const touch = e.changedTouches[0];
            const target = document.elementFromPoint(touch.clientX, touch.clientY);
            const cell = target?.closest('.video-cell');

            if (cell) {
                const targetIndex = parseInt(cell.dataset.index);
                if (targetIndex !== touchDragData.index) {
                    swapVideos(touchDragData.index, targetIndex);
                }
            }

            $$('.video-cell').forEach(c => {
                c.classList.remove('dragging');
                c.classList.remove('drag-over');
            });
        }

        touchDragData.active = false;
        touchDragData.index = -1;
    }

    function swapVideos(a, b) {
        const temp = state.videos[a];
        state.videos[a] = state.videos[b];
        state.videos[b] = temp;
        renderVideos();
        saveState();
    }

    // ===== UI CONTROLS =====
    function showControls(index) {
        state.activeVideoIndex = index;

        // Highlight active cell
        $$('.video-cell').forEach((c, i) => {
            c.classList.toggle('active', i === index);
        });

        // Show controls
        dom.controlsOverlay.classList.remove('hidden');
        dom.topBar.classList.remove('hidden');
        state.uiVisible = true;

        updateMuteButton(index);

        // Auto-hide
        resetHideTimer();
    }

    function hideControls() {
        state.activeVideoIndex = -1;
        $$('.video-cell').forEach(c => c.classList.remove('active'));
        dom.controlsOverlay.classList.add('hidden');

        if (state.videos.length > 0) {
            dom.topBar.classList.add('hidden');
        }

        state.uiVisible = false;
        clearTimeout(state.hideTimer);
    }

    function toggleUI() {
        if (state.uiVisible && state.activeVideoIndex === -1) {
            dom.topBar.classList.add('hidden');
            state.uiVisible = false;
        } else if (!state.uiVisible) {
            dom.topBar.classList.remove('hidden');
            state.uiVisible = true;
            resetHideTimer();
        }
    }

    function resetHideTimer() {
        clearTimeout(state.hideTimer);
        state.hideTimer = setTimeout(() => {
            if (state.videos.length > 0) {
                hideControls();
            }
        }, 5000);
    }

    // ===== MODALS =====
    function openAddModal() {
        dom.addModal.classList.remove('hidden');
        dom.urlInput.value = '';
        setTimeout(() => dom.urlInput.focus(), 300);
    }

    function closeAddModal() {
        dom.addModal.classList.add('hidden');
        dom.urlInput.blur();
    }

    function openLayoutModal() {
        dom.layoutModal.classList.remove('hidden');
        updateLayoutSelection();
    }

    function closeLayoutModal() {
        dom.layoutModal.classList.add('hidden');
    }

    function updateLayoutSelection() {
        $$('.layout-option').forEach(opt => {
            opt.classList.toggle('active', opt.dataset.layout === state.layout);
        });
    }

    // ===== TOAST =====
    function showToast(msg, isError = false) {
        const existing = $('.toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = `toast${isError ? ' error' : ''}`;
        toast.textContent = msg;
        document.body.appendChild(toast);

        setTimeout(() => toast.remove(), 2500);
    }

    // ===== PERSISTENCE =====
    function saveState() {
        try {
            const data = {
                videos: state.videos,
                layout: state.layout,
                fillMode: state.fillMode
            };
            localStorage.setItem('multiplayerState', JSON.stringify(data));
        } catch (e) { /* ignore */ }
    }

    function loadState() {
        try {
            const data = JSON.parse(localStorage.getItem('multiplayerState'));
            if (data) {
                state.videos = data.videos || [];
                state.layout = data.layout || '2';
                state.fillMode = data.fillMode !== undefined ? data.fillMode : true;
                dom.fillToggle.checked = state.fillMode;
            }
        } catch (e) { /* ignore */ }
    }

    // ===== EVENT LISTENERS =====
    function init() {
        loadState();
        renderVideos();

        // Add button
        dom.addBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openAddModal();
        });

        // Layout button
        dom.layoutBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openLayoutModal();
        });

        // Close modals
        dom.closeModal.addEventListener('click', closeAddModal);
        dom.closeLayoutModal.addEventListener('click', closeLayoutModal);

        // Modal overlays
        dom.addModal.querySelector('.modal-overlay').addEventListener('click', closeAddModal);
        dom.layoutModal.querySelector('.modal-overlay').addEventListener('click', closeLayoutModal);

        // Paste button
        dom.pasteBtn.addEventListener('click', async () => {
            try {
                const text = await navigator.clipboard.readText();
                dom.urlInput.value = text;
            } catch {
                showToast('Could not access clipboard', true);
            }
        });

        // Add video
        dom.addVideoBtn.addEventListener('click', () => {
            const url = dom.urlInput.value.trim();
            if (!url) {
                showToast('Please enter a URL', true);
                return;
            }
            if (addVideo(url)) {
                closeAddModal();
                // Show first-time tap hint
                if (state.videos.length === 1) {
                    dom.tapHint.classList.remove('hidden');
                    setTimeout(() => dom.tapHint.classList.add('hidden'), 3500);
                }
                // Auto-hide top bar after adding
                setTimeout(() => {
                    if (state.videos.length > 0 && state.activeVideoIndex === -1) {
                        dom.topBar.classList.add('hidden');
                        state.uiVisible = false;
                    }
                }, 2000);
            }
        });

        // Enter key on input
        dom.urlInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                dom.addVideoBtn.click();
            }
        });

        // Layout options
        $$('.layout-option').forEach(opt => {
            opt.addEventListener('click', () => {
                state.layout = opt.dataset.layout;
                updateLayoutSelection();
                renderVideos();
                saveState();
                closeLayoutModal();
            });
        });

        // Fill mode toggle
        dom.fillToggle.addEventListener('change', () => {
            state.fillMode = dom.fillToggle.checked;
            renderVideos();
            saveState();
        });

        // Video tap zones (delegated)
        dom.videoGrid.addEventListener('click', (e) => {
            const tapZone = e.target.closest('.video-tap-zone');
            if (tapZone) {
                e.stopPropagation();
                const index = parseInt(tapZone.dataset.index);

                if (state.activeVideoIndex === index) {
                    hideControls();
                } else {
                    showControls(index);
                }
                return;
            }
        });

        // Control actions
        dom.controlsOverlay.addEventListener('click', (e) => {
            const btn = e.target.closest('.ctrl-btn');
            if (!btn) return;

            e.stopPropagation();
            const action = btn.dataset.action;
            const idx = state.activeVideoIndex;

            if (idx < 0) return;

            resetHideTimer();

            switch (action) {
                case 'mute':
                    toggleMute(idx);
                    break;
                case 'move-up':
                    if (idx > 0) moveVideo(idx, idx - 1);
                    break;
                case 'move-down':
                    if (idx < state.videos.length - 1) moveVideo(idx, idx + 1);
                    break;
                case 'reload':
                    reloadVideo(idx);
                    showToast('Reloading...');
                    break;
                case 'remove':
                    removeVideo(idx);
                    showToast('Video removed');
                    break;
            }
        });

        // Tap outside to hide UI
        document.addEventListener('click', (e) => {
            if (state.videos.length === 0) return;

            if (!e.target.closest('.modal') &&
                !e.target.closest('.top-bar') &&
                !e.target.closest('.controls-overlay') &&
                !e.target.closest('.video-tap-zone') &&
                !e.target.closest('.drag-handle')) {
                if (state.activeVideoIndex >= 0) {
                    hideControls();
                } else {
                    toggleUI();
                }
            }
        });

        // Prevent iOS bounce
        document.body.addEventListener('touchmove', (e) => {
            if (e.target.closest('.modal-content')) return;
            if (!touchDragData.active) return;
            e.preventDefault();
        }, { passive: false });

        // Handle orientation change
        window.addEventListener('orientationchange', () => {
            setTimeout(() => {
                renderVideos();
            }, 300);
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT') return;

            switch (e.key) {
                case 'a':
                case 'A':
                    openAddModal();
                    break;
                case 'Escape':
                    if (!dom.addModal.classList.contains('hidden')) closeAddModal();
                    else if (!dom.layoutModal.classList.contains('hidden')) closeLayoutModal();
                    else hideControls();
                    break;
                case 'l':
                case 'L':
                    openLayoutModal();
                    break;
            }
        });

        // Show UI initially if no videos
        if (state.videos.length === 0) {
            dom.topBar.classList.remove('hidden');
            state.uiVisible = true;
        } else {
            dom.topBar.classList.add('hidden');
            state.uiVisible = false;
        }
    }

    // Start
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();