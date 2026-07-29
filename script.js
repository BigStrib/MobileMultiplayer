(function () {
    'use strict';

    /* ========================
       STATE
       ======================== */
    var state = {
        videos: [],
        layout: '2',
        activeIndex: -1,
        unmutedIndex: -1,
        uiVisible: true,
        hideTimer: null
    };

    /* ========================
       DOM CACHE
       ======================== */
    var dom = {};

    function grab(id) {
        return document.getElementById(id);
    }

    function initDom() {
        dom.topBar = grab('topBar');
        dom.videoGrid = grab('videoGrid');
        dom.emptyState = grab('emptyState');
        dom.addModal = grab('addModal');
        dom.layoutModal = grab('layoutModal');
        dom.controlsBar = grab('controlsBar');
        dom.urlInput = grab('urlInput');
        dom.addBtn = grab('addBtn');
        dom.layoutBtn = grab('layoutBtn');
        dom.submitVideo = grab('submitVideo');
        dom.closeAddModal = grab('closeAddModal');
        dom.closeLayoutModal = grab('closeLayoutModal');
        dom.pasteBtn = grab('pasteBtn');
        dom.toastBox = grab('toastBox');
    }

    /* ========================
       URL PARSING
       ======================== */
    function parseURL(input) {
        input = input.trim();
        var url = input;
        if (url.indexOf('://') === -1 && url.indexOf('.') !== -1) {
            url = 'https://' + url;
        }

        var m;

        // YouTube
        m = url.match(/(?:youtube\.com\/watch\?.*v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/|youtube\.com\/live\/)([a-zA-Z0-9_-]{11})/);
        if (m) return { platform: 'youtube', id: m[1], type: 'video' };

        m = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
        if (m) return { platform: 'youtube', id: m[1], type: 'video' };

        m = url.match(/youtube\.com\/@([^\/\?]+)/);
        if (m) return { platform: 'youtube', id: m[1], type: 'channel' };

        // Twitch
        m = url.match(/clips\.twitch\.tv\/([a-zA-Z0-9_-]+)/);
        if (m) return { platform: 'twitch', id: m[1], type: 'clip' };

        m = url.match(/twitch\.tv\/\w+\/clip\/([a-zA-Z0-9_-]+)/);
        if (m) return { platform: 'twitch', id: m[1], type: 'clip' };

        m = url.match(/twitch\.tv\/videos\/(\d+)/);
        if (m) return { platform: 'twitch', id: m[1], type: 'vod' };

        m = url.match(/twitch\.tv\/([a-zA-Z0-9_]+)\/?$/);
        if (m && ['videos','clips','about','schedule'].indexOf(m[1]) === -1) {
            return { platform: 'twitch', id: m[1], type: 'channel' };
        }

        // Rumble
        m = url.match(/rumble\.com\/embed\/([a-zA-Z0-9]+)/);
        if (m) return { platform: 'rumble', id: m[1], type: 'embed' };

        if (url.indexOf('rumble.com') !== -1) {
            m = url.match(/rumble\.com\/([a-zA-Z0-9\-]+?)(?:\.html)?(?:\?|$)/);
            if (m) return { platform: 'rumble', id: m[1], type: 'video' };
        }

        // Kick
        m = url.match(/kick\.com\/[^\/]+\?clip=([a-zA-Z0-9_-]+)/);
        if (m) return { platform: 'kick', id: m[1], type: 'clip' };

        m = url.match(/kick\.com\/video\/([a-zA-Z0-9_-]+)/);
        if (m) return { platform: 'kick', id: m[1], type: 'vod' };

        m = url.match(/kick\.com\/([a-zA-Z0-9_]+)\/?$/);
        if (m) return { platform: 'kick', id: m[1], type: 'channel' };

        // Bare YT id
        if (/^[a-zA-Z0-9_-]{11}$/.test(input)) {
            return { platform: 'youtube', id: input, type: 'video' };
        }

        return null;
    }

    function buildEmbed(parsed, muted) {
        var host = window.location.hostname || 'localhost';
        var mi = muted ? 1 : 0;
        var mb = muted ? 'true' : 'false';

        switch (parsed.platform) {
            case 'youtube':
                if (parsed.type === 'channel') {
                    return 'https://www.youtube.com/embed/live_stream?channel=' + parsed.id + '&autoplay=1&mute=' + mi + '&playsinline=1';
                }
                return 'https://www.youtube.com/embed/' + parsed.id + '?autoplay=1&mute=' + mi + '&playsinline=1&rel=0';
            case 'twitch':
                if (parsed.type === 'clip') return 'https://clips.twitch.tv/embed?clip=' + parsed.id + '&parent=' + host + '&autoplay=true&muted=' + mb;
                if (parsed.type === 'vod') return 'https://player.twitch.tv/?video=v' + parsed.id + '&parent=' + host + '&autoplay=true&muted=' + mb;
                return 'https://player.twitch.tv/?channel=' + parsed.id + '&parent=' + host + '&autoplay=true&muted=' + mb;
            case 'rumble':
                return 'https://rumble.com/embed/' + parsed.id + '/?autoplay=1&mute=' + mi;
            case 'kick':
                if (parsed.type === 'clip') return 'https://player.kick.com/clip/' + parsed.id + '?autoplay=true&muted=' + mb;
                return 'https://player.kick.com/' + parsed.id + '?autoplay=true&muted=' + mb;
        }
        return null;
    }

    /* ========================
       VIDEO OPERATIONS
       ======================== */
    function addVideo(url) {
        var parsed = parseURL(url);
        if (!parsed) { toast('Cannot parse URL', true); return false; }
        var test = buildEmbed(parsed, true);
        if (!test) { toast('Unsupported', true); return false; }

        state.videos.push({
            id: Date.now() + '' + Math.random(),
            parsed: parsed,
            platform: parsed.platform
        });

        render();
        save();
        toast(parsed.platform + ' added');
        return true;
    }

    function removeVideo(i) {
        if (state.unmutedIndex === i) state.unmutedIndex = -1;
        else if (state.unmutedIndex > i) state.unmutedIndex--;
        state.videos.splice(i, 1);
        state.activeIndex = -1;
        hideUI();
        render();
        save();
    }

    function moveVideo(from, to) {
        if (to < 0 || to >= state.videos.length) return;
        if (state.unmutedIndex === from) state.unmutedIndex = to;
        else if (state.unmutedIndex === to) state.unmutedIndex = from;
        var v = state.videos.splice(from, 1)[0];
        state.videos.splice(to, 0, v);
        state.activeIndex = to;
        render();
        showUI(to);
        save();
    }

    function toggleUnmute(i) {
        if (state.unmutedIndex === i) {
            state.unmutedIndex = -1;
            reloadCell(i, true);
            toast('Muted');
        } else {
            var prev = state.unmutedIndex;
            if (prev >= 0 && prev < state.videos.length) {
                reloadCell(prev, true);
            }
            state.unmutedIndex = i;
            reloadCell(i, false);
            toast('Audio ON');
        }
        refreshUnmuteBtn();
        save();
    }

    function reloadCell(i, muted) {
        var cell = getCellAt(i);
        if (!cell) return;
        var video = state.videos[i];
        if (!video) return;
        var iframe = cell.querySelector('iframe');
        if (iframe) {
            iframe.src = buildEmbed(video.parsed, muted);
        }
        setDot(cell, muted);
    }

    function getCellAt(i) {
        var cells = dom.videoGrid.querySelectorAll('.video-cell');
        return cells[i] || null;
    }

    function setDot(cell, muted) {
        var dot = cell.querySelector('.mute-dot');
        if (!dot) return;
        dot.className = 'mute-dot ' + (muted ? 'muted' : 'unmuted');
        dot.innerHTML = muted
            ? '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>'
            : '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>';
    }

    function refreshUnmuteBtn() {
        var btn = dom.controlsBar.querySelector('[data-action="unmute"]');
        if (!btn) return;
        var isOn = (state.activeIndex >= 0 && state.unmutedIndex === state.activeIndex);
        var svg = btn.querySelector('svg');
        var span = btn.querySelector('span');
        if (isOn) {
            btn.classList.add('is-unmuted');
            svg.innerHTML = '<path fill="currentColor" d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>';
            span.textContent = 'Mute';
        } else {
            btn.classList.remove('is-unmuted');
            svg.innerHTML = '<path fill="currentColor" d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>';
            span.textContent = 'Unmute';
        }
    }

    /* ========================
       RENDER
       ======================== */
    function render() {
        var grid = dom.videoGrid;
        grid.innerHTML = '';

        var count = state.videos.length;
        var layout = state.layout;

        if (count === 0) {
            dom.emptyState.classList.remove('hidden');
            grid.removeAttribute('data-cols');
            grid.style.gridTemplateRows = '';
            return;
        }
        dom.emptyState.classList.add('hidden');

        // Determine columns
        var cols;
        switch (layout) {
            case '1': cols = 1; break;
            case '2': cols = 2; break;
            case '3': cols = 3; break;
            case '2x1': cols = 2; break;
            case 'pip': cols = 1; break;
            case 'auto':
                cols = count <= 1 ? 1 : count <= 4 ? 2 : 3;
                break;
            default: cols = 2;
        }

        grid.setAttribute('data-cols', cols);

        // Rows
        if (layout === 'pip') {
            grid.style.gridTemplateRows = '1fr';
        } else if (layout === '2x1') {
            var extra = Math.ceil(Math.max(0, count - 1) / 2);
            grid.style.gridTemplateRows = 'repeat(' + (1 + extra) + ', 1fr)';
        } else {
            var rows = Math.max(1, Math.ceil(count / cols));
            grid.style.gridTemplateRows = 'repeat(' + rows + ', 1fr)';
        }

        // Build cells
        for (var i = 0; i < count; i++) {
            var v = state.videos[i];
            var muted = (state.unmutedIndex !== i);
            var src = buildEmbed(v.parsed, muted);

            var cell = document.createElement('div');
            cell.className = 'video-cell';
            if (i === state.activeIndex) cell.className += ' selected';

            // Layout-specific classes
            if (layout === '2x1' && i === 0) cell.className += ' featured-main';
            if (layout === 'pip' && i > 0) cell.className += ' pip-child';

            cell.setAttribute('data-idx', i);

            var dotClass = muted ? 'muted' : 'unmuted';
            var dotIcon = muted
                ? '<path fill="currentColor" d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>'
                : '<path fill="currentColor" d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>';

            cell.innerHTML =
                '<iframe src="' + src + '" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen playsinline></iframe>' +
                '<div class="tap-zone" data-idx="' + i + '"></div>' +
                '<span class="badge ' + v.platform + '">' + v.platform + '</span>' +
                '<div class="mute-dot ' + dotClass + '"><svg viewBox="0 0 24 24">' + dotIcon + '</svg></div>';

            grid.appendChild(cell);
        }
    }

    /* ========================
       UI SHOW / HIDE
       ======================== */
    function showUI(index) {
        state.activeIndex = index;
        state.uiVisible = true;

        // Highlight
        var cells = dom.videoGrid.querySelectorAll('.video-cell');
        for (var i = 0; i < cells.length; i++) {
            if (i === index) cells[i].classList.add('selected');
            else cells[i].classList.remove('selected');
        }

        dom.controlsBar.classList.remove('hidden');
        dom.topBar.classList.remove('hidden');
        refreshUnmuteBtn();
        resetTimer();
    }

    function hideUI() {
        state.activeIndex = -1;
        state.uiVisible = false;

        var cells = dom.videoGrid.querySelectorAll('.video-cell');
        for (var i = 0; i < cells.length; i++) {
            cells[i].classList.remove('selected');
        }

        dom.controlsBar.classList.add('hidden');
        if (state.videos.length > 0) {
            dom.topBar.classList.add('hidden');
        }
        clearTimeout(state.hideTimer);
    }

    function toggleTopBar() {
        if (dom.topBar.classList.contains('hidden')) {
            dom.topBar.classList.remove('hidden');
            state.uiVisible = true;
            resetTimer();
        } else {
            hideUI();
        }
    }

    function resetTimer() {
        clearTimeout(state.hideTimer);
        state.hideTimer = setTimeout(function () {
            if (state.videos.length > 0) hideUI();
        }, 5000);
    }

    /* ========================
       MODALS
       ======================== */
    function openModal(id) {
        var el = grab(id);
        if (el) el.classList.remove('hidden');
    }

    function closeModal(id) {
        var el = grab(id);
        if (el) el.classList.add('hidden');
    }

    /* ========================
       TOAST
       ======================== */
    function toast(msg, err) {
        var box = dom.toastBox;
        box.innerHTML = '';
        var el = document.createElement('div');
        el.className = 'toast' + (err ? ' err' : '');
        el.textContent = msg;
        box.appendChild(el);
        setTimeout(function () {
            if (el.parentNode) el.remove();
        }, 2500);
    }

    /* ========================
       SAVE / LOAD
       ======================== */
    function save() {
        try {
            localStorage.setItem('mp_state', JSON.stringify({
                videos: state.videos,
                layout: state.layout,
                unmutedIndex: state.unmutedIndex
            }));
        } catch (e) {}
    }

    function load() {
        try {
            var raw = localStorage.getItem('mp_state');
            if (!raw) return;
            var d = JSON.parse(raw);
            if (d.videos) state.videos = d.videos;
            if (d.layout) state.layout = d.layout;
            if (typeof d.unmutedIndex === 'number') state.unmutedIndex = d.unmutedIndex;
            if (state.unmutedIndex >= state.videos.length) state.unmutedIndex = -1;
        } catch (e) {}
    }

    /* ========================
       WIRE EVENTS
       ======================== */
    function wire() {

        // ADD BUTTON
        dom.addBtn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            openModal('addModal');
            dom.urlInput.value = '';
            setTimeout(function () { dom.urlInput.focus(); }, 200);
        });

        // LAYOUT BUTTON
        dom.layoutBtn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            openModal('layoutModal');
            refreshLayOpts();
        });

        // CLOSE ADD MODAL
        dom.closeAddModal.addEventListener('click', function (e) {
            e.preventDefault();
            closeModal('addModal');
        });
        dom.addModal.querySelector('.modal-bg').addEventListener('click', function () {
            closeModal('addModal');
        });

        // CLOSE LAYOUT MODAL
        dom.closeLayoutModal.addEventListener('click', function (e) {
            e.preventDefault();
            closeModal('layoutModal');
        });
        dom.layoutModal.querySelector('.modal-bg').addEventListener('click', function () {
            closeModal('layoutModal');
        });

        // PASTE
        dom.pasteBtn.addEventListener('click', function (e) {
            e.preventDefault();
            if (navigator.clipboard && navigator.clipboard.readText) {
                navigator.clipboard.readText().then(function (t) {
                    dom.urlInput.value = t;
                }).catch(function () {
                    toast('Clipboard denied', true);
                });
            }
        });

        // SUBMIT VIDEO
        dom.submitVideo.addEventListener('click', function (e) {
            e.preventDefault();
            var url = dom.urlInput.value.trim();
            if (!url) { toast('Enter a URL', true); return; }
            if (addVideo(url)) {
                closeModal('addModal');
                setTimeout(function () {
                    if (state.videos.length > 0 && state.activeIndex === -1) {
                        dom.topBar.classList.add('hidden');
                        state.uiVisible = false;
                    }
                }, 2000);
            }
        });

        // ENTER KEY
        dom.urlInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                dom.submitVideo.click();
            }
        });

        // LAYOUT OPTIONS
        var layOpts = document.querySelectorAll('.lay-opt');
        for (var i = 0; i < layOpts.length; i++) {
            layOpts[i].addEventListener('click', function (e) {
                e.preventDefault();
                var el = this;
                state.layout = el.getAttribute('data-layout');
                refreshLayOpts();
                render();
                save();
                closeModal('layoutModal');
            });
        }

        // TAP ZONE (delegated on grid)
        dom.videoGrid.addEventListener('click', function (e) {
            var target = e.target;
            // Walk up to find tap-zone
            var zone = null;
            var el = target;
            while (el && el !== dom.videoGrid) {
                if (el.classList && el.classList.contains('tap-zone')) {
                    zone = el;
                    break;
                }
                el = el.parentElement;
            }
            if (!zone) return;

            e.preventDefault();
            e.stopPropagation();

            var idx = parseInt(zone.getAttribute('data-idx'), 10);
            if (state.activeIndex === idx) {
                hideUI();
            } else {
                showUI(idx);
            }
        });

        // CONTROL BUTTONS (delegated)
        dom.controlsBar.addEventListener('click', function (e) {
            var target = e.target;
            var btn = null;
            var el = target;
            while (el && el !== dom.controlsBar) {
                if (el.classList && el.classList.contains('ctrl-btn')) {
                    btn = el;
                    break;
                }
                el = el.parentElement;
            }
            if (!btn) return;

            e.preventDefault();
            e.stopPropagation();

            var action = btn.getAttribute('data-action');
            var idx = state.activeIndex;
            if (idx < 0) return;

            resetTimer();

            switch (action) {
                case 'unmute':
                    toggleUnmute(idx);
                    break;
                case 'move-left':
                    if (idx > 0) moveVideo(idx, idx - 1);
                    break;
                case 'move-right':
                    if (idx < state.videos.length - 1) moveVideo(idx, idx + 1);
                    break;
                case 'reload':
                    reloadCell(idx, state.unmutedIndex !== idx);
                    toast('Reloading...');
                    break;
                case 'remove':
                    removeVideo(idx);
                    toast('Removed');
                    break;
            }
        });

        // CLICK ANYWHERE ELSE
        document.addEventListener('click', function (e) {
            if (state.videos.length === 0) return;

            var el = e.target;
            while (el) {
                if (el.id === 'addModal' || el.id === 'layoutModal') return;
                if (el.id === 'topBar') return;
                if (el.id === 'controlsBar') return;
                if (el.classList && el.classList.contains('tap-zone')) return;
                el = el.parentElement;
            }

            if (state.activeIndex >= 0) {
                hideUI();
            } else {
                toggleTopBar();
            }
        });

        // KEYBOARD
        document.addEventListener('keydown', function (e) {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            if (e.key === 'Escape') {
                if (!dom.addModal.classList.contains('hidden')) { closeModal('addModal'); return; }
                if (!dom.layoutModal.classList.contains('hidden')) { closeModal('layoutModal'); return; }
                hideUI();
                return;
            }
            if (e.key === 'a' || e.key === 'A') {
                e.preventDefault();
                dom.addBtn.click();
            }
            if (e.key === 'l' || e.key === 'L') {
                e.preventDefault();
                dom.layoutBtn.click();
            }
        });

        // RESIZE
        window.addEventListener('resize', function () {
            if (state.videos.length > 0) {
                // just fix rows
                var layout = state.layout;
                var count = state.videos.length;
                var cols;
                switch (layout) {
                    case '1': cols = 1; break;
                    case '2': cols = 2; break;
                    case '3': cols = 3; break;
                    case 'pip': cols = 1; break;
                    case '2x1': cols = 2; break;
                    case 'auto': cols = count <= 1 ? 1 : count <= 4 ? 2 : 3; break;
                    default: cols = 2;
                }
                if (layout === 'pip') {
                    dom.videoGrid.style.gridTemplateRows = '1fr';
                } else if (layout === '2x1') {
                    var extra = Math.ceil(Math.max(0, count - 1) / 2);
                    dom.videoGrid.style.gridTemplateRows = 'repeat(' + (1 + extra) + ', 1fr)';
                } else {
                    var rows = Math.max(1, Math.ceil(count / cols));
                    dom.videoGrid.style.gridTemplateRows = 'repeat(' + rows + ', 1fr)';
                }
            }
        });
    }

    function refreshLayOpts() {
        var opts = document.querySelectorAll('.lay-opt');
        for (var i = 0; i < opts.length; i++) {
            var l = opts[i].getAttribute('data-layout');
            if (l === state.layout) {
                opts[i].classList.add('active');
            } else {
                opts[i].classList.remove('active');
            }
        }
    }

    /* ========================
       BOOT
       ======================== */
    function boot() {
        initDom();
        load();
        render();
        wire();

        // Initial visibility
        if (state.videos.length === 0) {
            dom.topBar.classList.remove('hidden');
        } else {
            dom.topBar.classList.add('hidden');
            state.uiVisible = false;
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }

})();