(function () {
    'use strict';

    var state = {
        videos: [],
        layout: '2',
        activeIndex: -1,
        uiVisible: true,
        hideTimer: null,
        keepAliveTimers: {}
    };

    var dom = {};

    function grab(id) { return document.getElementById(id); }

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

    // ===== URL PARSING =====
    function parseURL(input) {
        input = input.trim();
        var url = input;
        if (url.indexOf('://') === -1 && url.indexOf('.') !== -1) {
            url = 'https://' + url;
        }
        var m;

        m = url.match(/(?:youtube\.com\/watch\?.*v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/|youtube\.com\/live\/)([a-zA-Z0-9_-]{11})/);
        if (m) return { platform: 'youtube', id: m[1], type: 'video' };
        m = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
        if (m) return { platform: 'youtube', id: m[1], type: 'video' };
        m = url.match(/youtube\.com\/@([^\/\?]+)/);
        if (m) return { platform: 'youtube', id: m[1], type: 'channel' };

        m = url.match(/clips\.twitch\.tv\/([a-zA-Z0-9_-]+)/);
        if (m) return { platform: 'twitch', id: m[1], type: 'clip' };
        m = url.match(/twitch\.tv\/\w+\/clip\/([a-zA-Z0-9_-]+)/);
        if (m) return { platform: 'twitch', id: m[1], type: 'clip' };
        m = url.match(/twitch\.tv\/videos\/(\d+)/);
        if (m) return { platform: 'twitch', id: m[1], type: 'vod' };
        m = url.match(/twitch\.tv\/([a-zA-Z0-9_]+)\/?$/);
        if (m && ['videos', 'clips', 'about', 'schedule'].indexOf(m[1]) === -1) {
            return { platform: 'twitch', id: m[1], type: 'channel' };
        }

        m = url.match(/rumble\.com\/embed\/([a-zA-Z0-9]+)/);
        if (m) return { platform: 'rumble', id: m[1], type: 'embed' };
        if (url.indexOf('rumble.com') !== -1) {
            m = url.match(/rumble\.com\/([a-zA-Z0-9\-]+?)(?:\.html)?(?:\?|$)/);
            if (m) return { platform: 'rumble', id: m[1], type: 'video' };
        }

        m = url.match(/kick\.com\/[^\/]+\?clip=([a-zA-Z0-9_-]+)/);
        if (m) return { platform: 'kick', id: m[1], type: 'clip' };
        m = url.match(/kick\.com\/video\/([a-zA-Z0-9_-]+)/);
        if (m) return { platform: 'kick', id: m[1], type: 'vod' };
        m = url.match(/kick\.com\/([a-zA-Z0-9_]+)\/?$/);
        if (m) return { platform: 'kick', id: m[1], type: 'channel' };

        if (/^[a-zA-Z0-9_-]{11}$/.test(input)) {
            return { platform: 'youtube', id: input, type: 'video' };
        }
        return null;
    }

    function buildEmbed(parsed) {
        var host = window.location.hostname || 'localhost';
        switch (parsed.platform) {
            case 'youtube':
                // enablejsapi=1 allows postMessage control
                // We start muted so autoplay works, user unmutes via native controls
                if (parsed.type === 'channel') {
                    return 'https://www.youtube.com/embed/live_stream?channel=' + parsed.id +
                        '&autoplay=1&mute=1&playsinline=1&enablejsapi=1&origin=' +
                        encodeURIComponent(window.location.origin) +
                        '&widget_referrer=' + encodeURIComponent(window.location.href);
                }
                return 'https://www.youtube.com/embed/' + parsed.id +
                    '?autoplay=1&mute=1&playsinline=1&rel=0&enablejsapi=1&origin=' +
                    encodeURIComponent(window.location.origin) +
                    '&widget_referrer=' + encodeURIComponent(window.location.href);
            case 'twitch':
                if (parsed.type === 'clip') return 'https://clips.twitch.tv/embed?clip=' + parsed.id + '&parent=' + host + '&autoplay=true&muted=true';
                if (parsed.type === 'vod') return 'https://player.twitch.tv/?video=v' + parsed.id + '&parent=' + host + '&autoplay=true&muted=true';
                return 'https://player.twitch.tv/?channel=' + parsed.id + '&parent=' + host + '&autoplay=true&muted=true';
            case 'rumble':
                return 'https://rumble.com/embed/' + parsed.id + '/?autoplay=1&mute=1';
            case 'kick':
                if (parsed.type === 'clip') return 'https://player.kick.com/clip/' + parsed.id + '?autoplay=true&muted=true';
                return 'https://player.kick.com/' + parsed.id + '?autoplay=true&muted=true';
        }
        return null;
    }

    // ===== YOUTUBE KEEP-ALIVE =====
    // YouTube iframes can auto-mute or pause when not focused.
    // We send periodic postMessage pings to keep them playing.
    function startYouTubeKeepAlive(videoId, iframe) {
        stopYouTubeKeepAlive(videoId);

        // Send play command every 15 seconds to prevent YT from pausing
        state.keepAliveTimers[videoId] = setInterval(function () {
            try {
                // YT iframe API postMessage to keep playing
                iframe.contentWindow.postMessage(JSON.stringify({
                    event: 'command',
                    func: 'playVideo',
                    args: []
                }), '*');
            } catch (e) {
                // cross-origin may block, that's ok
            }
        }, 15000);
    }

    function stopYouTubeKeepAlive(videoId) {
        if (state.keepAliveTimers[videoId]) {
            clearInterval(state.keepAliveTimers[videoId]);
            delete state.keepAliveTimers[videoId];
        }
    }

    function stopAllKeepAlive() {
        for (var key in state.keepAliveTimers) {
            clearInterval(state.keepAliveTimers[key]);
        }
        state.keepAliveTimers = {};
    }

    // Listen for YouTube state changes via postMessage
    function setupYouTubeListener() {
        window.addEventListener('message', function (e) {
            try {
                var data;
                if (typeof e.data === 'string') {
                    data = JSON.parse(e.data);
                } else {
                    data = e.data;
                }

                // YouTube sends info with event "infoDelivery" or "onStateChange"
                // State 2 = paused, we want to resume
                if (data && data.event === 'onStateChange' && data.info === 2) {
                    // Find the iframe that sent this
                    var iframes = dom.videoGrid.querySelectorAll('iframe');
                    for (var i = 0; i < iframes.length; i++) {
                        try {
                            if (iframes[i].contentWindow === e.source) {
                                // Send play command
                                iframes[i].contentWindow.postMessage(JSON.stringify({
                                    event: 'command',
                                    func: 'playVideo',
                                    args: []
                                }), '*');
                                break;
                            }
                        } catch (ex) {}
                    }
                }
            } catch (ex) {
                // Not JSON or not for us
            }
        });
    }

    // ===== VIDEO MANAGEMENT =====
    function addVideo(url) {
        var parsed = parseURL(url);
        if (!parsed) { toast('Cannot parse URL', true); return false; }
        var src = buildEmbed(parsed);
        if (!src) { toast('Unsupported', true); return false; }
        state.videos.push({
            id: 'v_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            parsed: parsed,
            platform: parsed.platform,
            embedSrc: src
        });
        render();
        save();
        toast(parsed.platform + ' added');
        return true;
    }

    function removeVideo(i) {
        var v = state.videos[i];
        if (v) stopYouTubeKeepAlive(v.id);
        state.videos.splice(i, 1);
        state.activeIndex = -1;
        hideUI();
        render();
        save();
    }

    function moveVideo(from, to) {
        if (to < 0 || to >= state.videos.length) return;
        var v = state.videos.splice(from, 1)[0];
        state.videos.splice(to, 0, v);
        state.activeIndex = to;
        render();
        showUI(to);
        save();
    }

    function reloadVideo(i) {
        var v = state.videos[i];
        if (!v) return;
        var cell = getCellAt(i);
        if (!cell) return;
        var iframe = cell.querySelector('iframe');
        if (!iframe) return;
        var src = iframe.src;
        iframe.src = '';
        setTimeout(function () {
            iframe.src = src;
            // Restart keep alive for YT
            if (v.platform === 'youtube') {
                setTimeout(function () {
                    startYouTubeKeepAlive(v.id, iframe);
                }, 3000);
            }
        }, 150);
        toast('Reloading...');
    }

    function getCellAt(i) {
        var cells = dom.videoGrid.querySelectorAll('.video-cell');
        return cells[i] || null;
    }

    // ===== RENDER =====
    function render() {
        stopAllKeepAlive();

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

        var cols;
        switch (layout) {
            case '1': cols = 1; break;
            case '2': cols = 2; break;
            case '3': cols = 3; break;
            case '2x1': cols = 2; break;
            case 'pip': cols = 1; break;
            case 'auto': cols = count <= 1 ? 1 : count <= 4 ? 2 : 3; break;
            default: cols = 2;
        }
        grid.setAttribute('data-cols', cols);

        if (layout === 'pip') {
            grid.style.gridTemplateRows = '1fr';
        } else if (layout === '2x1') {
            var extra = Math.ceil(Math.max(0, count - 1) / 2);
            grid.style.gridTemplateRows = 'repeat(' + (1 + extra) + ', 1fr)';
        } else {
            var rows = Math.max(1, Math.ceil(count / cols));
            grid.style.gridTemplateRows = 'repeat(' + rows + ', 1fr)';
        }

        for (var i = 0; i < count; i++) {
            var v = state.videos[i];
            var cell = document.createElement('div');
            cell.className = 'video-cell';
            if (i === state.activeIndex) cell.className += ' selected';
            if (layout === '2x1' && i === 0) cell.className += ' featured-main';
            if (layout === 'pip' && i > 0) cell.className += ' pip-child';
            cell.setAttribute('data-idx', i);

            var iframe = document.createElement('iframe');
            iframe.src = v.embedSrc;
            iframe.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture; fullscreen');
            iframe.setAttribute('allowfullscreen', '');
            iframe.setAttribute('playsinline', '');
            iframe.id = 'iframe_' + v.id;

            // Edge zones for selecting
            var eTop = document.createElement('div');
            eTop.className = 'sel-edge e-top';
            eTop.setAttribute('data-idx', i);

            var eBot = document.createElement('div');
            eBot.className = 'sel-edge e-bottom';
            eBot.setAttribute('data-idx', i);

            var eLeft = document.createElement('div');
            eLeft.className = 'sel-edge e-left';
            eLeft.setAttribute('data-idx', i);

            var eRight = document.createElement('div');
            eRight.className = 'sel-edge e-right';
            eRight.setAttribute('data-idx', i);

            var badge = document.createElement('span');
            badge.className = 'badge ' + v.platform;
            badge.textContent = v.platform;

            cell.appendChild(iframe);
            cell.appendChild(eTop);
            cell.appendChild(eBot);
            cell.appendChild(eLeft);
            cell.appendChild(eRight);
            cell.appendChild(badge);

            grid.appendChild(cell);

            // Start YouTube keep-alive after iframe loads
            if (v.platform === 'youtube') {
                (function (vid, ifr) {
                    ifr.addEventListener('load', function () {
                        // Subscribe to YT events
                        setTimeout(function () {
                            try {
                                ifr.contentWindow.postMessage(JSON.stringify({
                                    event: 'listening',
                                    id: 1
                                }), '*');
                            } catch (ex) {}
                            startYouTubeKeepAlive(vid.id, ifr);
                        }, 2000);
                    });
                })(v, iframe);
            }
        }
    }

    // ===== UI =====
    function showUI(index) {
        state.activeIndex = index;
        state.uiVisible = true;

        var cells = dom.videoGrid.querySelectorAll('.video-cell');
        for (var i = 0; i < cells.length; i++) {
            if (i === index) cells[i].classList.add('selected');
            else cells[i].classList.remove('selected');
        }

        dom.controlsBar.classList.remove('hidden');
        dom.topBar.classList.remove('hidden');
        resetTimer();
    }

    function hideUI() {
        state.activeIndex = -1;

        var cells = dom.videoGrid.querySelectorAll('.video-cell');
        for (var i = 0; i < cells.length; i++) {
            cells[i].classList.remove('selected');
        }

        dom.controlsBar.classList.add('hidden');
        if (state.videos.length > 0) {
            dom.topBar.classList.add('hidden');
            state.uiVisible = false;
        }
        clearTimeout(state.hideTimer);
    }

    function toggleTopBar() {
        if (dom.topBar.classList.contains('hidden')) {
            dom.topBar.classList.remove('hidden');
            state.uiVisible = true;
            resetTimer();
        } else if (state.activeIndex === -1) {
            hideUI();
        }
    }

    function resetTimer() {
        clearTimeout(state.hideTimer);
        state.hideTimer = setTimeout(function () {
            if (state.videos.length > 0) hideUI();
        }, 6000);
    }

    // ===== MODALS =====
    function openModal(id) {
        var el = grab(id);
        if (el) el.classList.remove('hidden');
    }
    function closeModal(id) {
        var el = grab(id);
        if (el) el.classList.add('hidden');
    }

    // ===== TOAST =====
    function toast(msg, err) {
        dom.toastBox.innerHTML = '';
        var el = document.createElement('div');
        el.className = 'toast' + (err ? ' err' : '');
        el.textContent = msg;
        dom.toastBox.appendChild(el);
        setTimeout(function () { if (el.parentNode) el.remove(); }, 2500);
    }

    // ===== SAVE / LOAD =====
    function save() {
        try {
            localStorage.setItem('mp_state', JSON.stringify({
                videos: state.videos,
                layout: state.layout
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
        } catch (e) {}
    }

    function refreshLayOpts() {
        var opts = document.querySelectorAll('.lay-opt');
        for (var i = 0; i < opts.length; i++) {
            if (opts[i].getAttribute('data-layout') === state.layout) {
                opts[i].classList.add('active');
            } else {
                opts[i].classList.remove('active');
            }
        }
    }

    // Page visibility - handle when user comes back to the page
    function setupVisibilityHandler() {
        document.addEventListener('visibilitychange', function () {
            if (document.visibilityState === 'visible') {
                // User came back, send play commands to all YT iframes
                var iframes = dom.videoGrid.querySelectorAll('iframe');
                for (var i = 0; i < state.videos.length; i++) {
                    if (state.videos[i].platform === 'youtube' && iframes[i]) {
                        try {
                            iframes[i].contentWindow.postMessage(JSON.stringify({
                                event: 'command',
                                func: 'playVideo',
                                args: []
                            }), '*');
                        } catch (ex) {}
                    }
                }
            }
        });
    }

    // ===== WIRE EVENTS =====
    function wire() {

        dom.addBtn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            openModal('addModal');
            dom.urlInput.value = '';
            setTimeout(function () { dom.urlInput.focus(); }, 200);
        });

        dom.layoutBtn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            openModal('layoutModal');
            refreshLayOpts();
        });

        dom.closeAddModal.addEventListener('click', function (e) {
            e.preventDefault();
            closeModal('addModal');
        });
        dom.addModal.querySelector('.modal-bg').addEventListener('click', function () {
            closeModal('addModal');
        });

        dom.closeLayoutModal.addEventListener('click', function (e) {
            e.preventDefault();
            closeModal('layoutModal');
        });
        dom.layoutModal.querySelector('.modal-bg').addEventListener('click', function () {
            closeModal('layoutModal');
        });

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

        dom.urlInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); dom.submitVideo.click(); }
        });

        var layOpts = document.querySelectorAll('.lay-opt');
        for (var i = 0; i < layOpts.length; i++) {
            layOpts[i].addEventListener('click', function (e) {
                e.preventDefault();
                state.layout = this.getAttribute('data-layout');
                refreshLayOpts();
                render();
                save();
                closeModal('layoutModal');
            });
        }

        // Edge taps for selection (delegated)
        dom.videoGrid.addEventListener('click', function (e) {
            var el = e.target;
            while (el && el !== dom.videoGrid) {
                if (el.classList && el.classList.contains('sel-edge')) {
                    e.preventDefault();
                    e.stopPropagation();
                    var idx = parseInt(el.getAttribute('data-idx'), 10);
                    if (state.activeIndex === idx) {
                        hideUI();
                    } else {
                        showUI(idx);
                    }
                    return;
                }
                el = el.parentElement;
            }
        });

        // Controls (delegated)
        dom.controlsBar.addEventListener('click', function (e) {
            var el = e.target;
            var btn = null;
            while (el && el !== dom.controlsBar) {
                if (el.classList && el.classList.contains('ctrl-btn')) { btn = el; break; }
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
                case 'move-left':
                    if (idx > 0) moveVideo(idx, idx - 1);
                    break;
                case 'move-right':
                    if (idx < state.videos.length - 1) moveVideo(idx, idx + 1);
                    break;
                case 'reload':
                    reloadVideo(idx);
                    break;
                case 'remove':
                    removeVideo(idx);
                    toast('Removed');
                    break;
            }
        });

        // Click on black area / outside to deselect
        document.addEventListener('click', function (e) {
            if (state.videos.length === 0) return;
            var el = e.target;
            while (el) {
                if (el.id === 'addModal' || el.id === 'layoutModal') return;
                if (el.id === 'topBar') return;
                if (el.id === 'controlsBar') return;
                if (el.classList && el.classList.contains('sel-edge')) return;
                if (el.tagName === 'IFRAME') return;
                el = el.parentElement;
            }

            // Clicked on black area or outside any video
            if (state.activeIndex >= 0) {
                hideUI();
            } else {
                toggleTopBar();
            }
        });

        // Keyboard
        document.addEventListener('keydown', function (e) {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            if (e.key === 'Escape') {
                if (!dom.addModal.classList.contains('hidden')) { closeModal('addModal'); return; }
                if (!dom.layoutModal.classList.contains('hidden')) { closeModal('layoutModal'); return; }
                hideUI();
                return;
            }
            if (e.key === 'a' || e.key === 'A') { e.preventDefault(); dom.addBtn.click(); }
            if (e.key === 'l' || e.key === 'L') { e.preventDefault(); dom.layoutBtn.click(); }
        });

        window.addEventListener('resize', function () {
            if (state.videos.length > 0) {
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

    // ===== BOOT =====
    function boot() {
        initDom();
        load();
        render();
        wire();
        setupYouTubeListener();
        setupVisibilityHandler();

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