(function(){
'use strict';

var LAYOUTS = [
    {id:'1x1',name:'Single',cols:1,rows:1,cells:[[0,0,1,1]]},
    {id:'1x2',name:'Stack 2',cols:1,rows:2,cells:[[0,0,1,1],[0,1,1,1]]},
    {id:'2x1',name:'Side by Side',cols:2,rows:1,cells:[[0,0,1,1],[1,0,1,1]]},
    {id:'2x2',name:'2x2 Grid',cols:2,rows:2,cells:[[0,0,1,1],[1,0,1,1],[0,1,1,1],[1,1,1,1]]},
    {id:'1t2b',name:'1 Top + 2',cols:2,rows:2,cells:[[0,0,2,1],[0,1,1,1],[1,1,1,1]]},
    {id:'2t1b',name:'2 Top + 1',cols:2,rows:2,cells:[[0,0,1,1],[1,0,1,1],[0,1,2,1]]},
    {id:'3x1',name:'3 Row',cols:3,rows:1,cells:[[0,0,1,1],[1,0,1,1],[2,0,1,1]]},
    {id:'1x3',name:'3 Stack',cols:1,rows:3,cells:[[0,0,1,1],[0,1,1,1],[0,2,1,1]]},
    {id:'2x3',name:'2x3 Grid',cols:2,rows:3,cells:[[0,0,1,1],[1,0,1,1],[0,1,1,1],[1,1,1,1],[0,2,1,1],[1,2,1,1]]},
    {id:'3x2',name:'3x2 Grid',cols:3,rows:2,cells:[[0,0,1,1],[1,0,1,1],[2,0,1,1],[0,1,1,1],[1,1,1,1],[2,1,1,1]]},
    {id:'1L2R',name:'1 Left + 2',cols:2,rows:2,cells:[[0,0,1,2],[1,0,1,1],[1,1,1,1]]},
    {id:'2L1R',name:'2 Left + 1',cols:2,rows:2,cells:[[0,0,1,1],[0,1,1,1],[1,0,1,2]]}
];

var state = {
    videos: [],
    layoutId: '2x2',
    activeIndex: -1,
    selectMode: false,
    menuOpen: false,
    unmutedIndex: -1,
    keepAlive: {},
    confirmCb: null,
    fabTimer: null
};

var dom = {};

function grab(id) {
    return document.getElementById(id);
}

function initDom() {
    dom.fab = grab('fab');
    dom.menuPanel = grab('menuPanel');
    dom.menuOverlay = grab('menuOverlay');
    dom.videoGrid = grab('videoGrid');
    dom.emptyState = grab('emptyState');
    dom.addModal = grab('addModal');
    dom.layoutModal = grab('layoutModal');
    dom.confirmModal = grab('confirmModal');
    dom.confirmText = grab('confirmText');
    dom.confirmYes = grab('confirmYes');
    dom.confirmNo = grab('confirmNo');
    dom.selectBar = grab('selectBar');
    dom.selectLabel = grab('selectLabel');
    dom.exitSelect = grab('exitSelect');
    dom.actionBar = grab('actionBar');
    dom.urlInput = grab('urlInput');
    dom.submitVideo = grab('submitVideo');
    dom.closeAddModal = grab('closeAddModal');
    dom.closeLayoutModal = grab('closeLayoutModal');
    dom.pasteBtn = grab('pasteBtn');
    dom.toastBox = grab('toastBox');
    dom.layoutGrid = grab('layoutGrid');
}

function getLayout() {
    for (var i = 0; i < LAYOUTS.length; i++) {
        if (LAYOUTS[i].id === state.layoutId) return LAYOUTS[i];
    }
    return LAYOUTS[3];
}

// ===== FAB =====
function flashFab() {
    dom.fab.classList.add('show');
    clearTimeout(state.fabTimer);
    state.fabTimer = setTimeout(function() {
        if (!state.menuOpen) dom.fab.classList.remove('show');
    }, 3000);
}

// ===== IFRAME SIZING =====
function sizeIframes() {
    var cells = dom.videoGrid.querySelectorAll('.video-cell');
    for (var i = 0; i < cells.length; i++) {
        var cell = cells[i];
        var iframe = cell.querySelector('iframe');
        if (!iframe) continue;
        var cw = cell.offsetWidth;
        var ch = cell.offsetHeight;
        if (!cw || !ch) continue;
        var cellAR = cw / ch;
        var vidAR = 16 / 9;
        if (cellAR > vidAR) {
            iframe.style.width = '100%';
            iframe.style.height = (cw / vidAR) + 'px';
        } else {
            iframe.style.height = '100%';
            iframe.style.width = (ch * vidAR) + 'px';
        }
    }
}

// ===== APPLY GRID =====
function applyGrid() {
    var layout = getLayout();
    var count = state.videos.length;
    if (count === 0) return;

    var grid = dom.videoGrid;
    grid.style.gridTemplateColumns = 'repeat(' + layout.cols + ',1fr)';
    grid.style.gridTemplateRows = 'repeat(' + layout.rows + ',1fr)';

    var cells = grid.querySelectorAll('.video-cell');
    for (var i = 0; i < cells.length; i++) {
        if (i < layout.cells.length) {
            var c = layout.cells[i];
            cells[i].style.gridColumn = (c[0] + 1) + ' / span ' + c[2];
            cells[i].style.gridRow = (c[1] + 1) + ' / span ' + c[3];
            cells[i].style.display = '';
        } else {
            cells[i].style.gridColumn = '';
            cells[i].style.gridRow = '';
            cells[i].style.display = '';
        }
    }

    requestAnimationFrame(sizeIframes);
}

// ===== URL PARSING =====
function parseURL(input) {
    input = input.trim();
    var url = input;
    if (url.indexOf('://') === -1 && url.indexOf('.') !== -1) url = 'https://' + url;
    var m;

    m = url.match(/(?:youtube\.com\/watch\?.*v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/|youtube\.com\/live\/)([a-zA-Z0-9_-]{11})/);
    if (m) return {platform: 'youtube', id: m[1], type: 'video', isLive: url.indexOf('/live/') !== -1};

    m = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
    if (m) return {platform: 'youtube', id: m[1], type: 'video', isLive: false};

    m = url.match(/youtube\.com\/@([^\/\?]+)/);
    if (m) return {platform: 'youtube', id: m[1], type: 'channel', isLive: true};

    m = url.match(/clips\.twitch\.tv\/([a-zA-Z0-9_-]+)/);
    if (m) return {platform: 'twitch', id: m[1], type: 'clip'};

    m = url.match(/twitch\.tv\/\w+\/clip\/([a-zA-Z0-9_-]+)/);
    if (m) return {platform: 'twitch', id: m[1], type: 'clip'};

    m = url.match(/twitch\.tv\/videos\/(\d+)/);
    if (m) return {platform: 'twitch', id: m[1], type: 'vod'};

    m = url.match(/twitch\.tv\/([a-zA-Z0-9_]+)\/?$/);
    if (m && ['videos', 'clips', 'about', 'schedule'].indexOf(m[1]) === -1)
        return {platform: 'twitch', id: m[1], type: 'channel'};

    m = url.match(/rumble\.com\/embed\/([a-zA-Z0-9]+)/);
    if (m) return {platform: 'rumble', id: m[1], type: 'embed'};

    if (url.indexOf('rumble.com') !== -1) {
        m = url.match(/rumble\.com\/([a-zA-Z0-9\-]+?)(?:\.html)?(?:\?|$)/);
        if (m) return {platform: 'rumble', id: m[1], type: 'video'};
    }

    m = url.match(/kick\.com\/[^\/]+\?clip=([a-zA-Z0-9_-]+)/);
    if (m) return {platform: 'kick', id: m[1], type: 'clip'};

    m = url.match(/kick\.com\/video\/([a-zA-Z0-9_-]+)/);
    if (m) return {platform: 'kick', id: m[1], type: 'vod'};

    m = url.match(/kick\.com\/([a-zA-Z0-9_]+)\/?$/);
    if (m) return {platform: 'kick', id: m[1], type: 'channel'};

    if (/^[a-zA-Z0-9_-]{11}$/.test(input))
        return {platform: 'youtube', id: input, type: 'video', isLive: false};

    return null;
}

function buildEmbed(parsed, muted) {
    var host = window.location.hostname || 'localhost';
    var origin = window.location.origin || ('https://' + host);
    var mi = muted ? 1 : 0;
    var mb = muted ? 'true' : 'false';

    switch (parsed.platform) {
        case 'youtube':
            var b = parsed.type === 'channel'
                ? 'https://www.youtube.com/embed/live_stream?channel=' + parsed.id
                : 'https://www.youtube.com/embed/' + parsed.id;
            return b + '?autoplay=1&mute=' + mi + '&playsinline=1&rel=0&enablejsapi=1&origin=' + encodeURIComponent(origin) + '&widgetid=1';
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

// ===== YT COMMANDS =====
function ytCmd(iframe, fn, args) {
    try {
        iframe.contentWindow.postMessage(JSON.stringify({event: 'command', func: fn, args: args || []}), '*');
    } catch (e) {}
}

function ytListen(iframe) {
    try {
        iframe.contentWindow.postMessage(JSON.stringify({event: 'listening', id: 1}), '*');
    } catch (e) {}
}

function vidIndex(vid) {
    for (var i = 0; i < state.videos.length; i++) {
        if (state.videos[i].id === vid) return i;
    }
    return -1;
}

function startKeepAlive(vid, iframe) {
    stopKeepAlive(vid);
    ytCmd(iframe, 'playVideo');
    state.keepAlive[vid] = setInterval(function() {
        ytCmd(iframe, 'playVideo');
        var idx = vidIndex(vid);
        if (idx >= 0 && state.unmutedIndex === idx) {
            ytCmd(iframe, 'unMute');
            ytCmd(iframe, 'setVolume', [100]);
        }
    }, 8000);
}

function stopKeepAlive(vid) {
    if (state.keepAlive[vid]) {
        clearInterval(state.keepAlive[vid]);
        delete state.keepAlive[vid];
    }
}

function stopAllKeepAlive() {
    for (var k in state.keepAlive) {
        if (state.keepAlive.hasOwnProperty(k)) {
            clearInterval(state.keepAlive[k]);
        }
    }
    state.keepAlive = {};
}

function setupYTListener() {
    window.addEventListener('message', function(e) {
        var data;
        try {
            data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
        } catch (x) { return; }
        if (!data || data.event !== 'onStateChange') return;

        var info = data.info;
        if (typeof info === 'object') info = info.playerState;

        if (info === 2 || info === -1) {
            var iframes = dom.videoGrid.querySelectorAll('iframe');
            for (var i = 0; i < iframes.length; i++) {
                try {
                    if (iframes[i].contentWindow === e.source) {
                        ytCmd(iframes[i], 'playVideo');
                        if (state.unmutedIndex === i) {
                            ytCmd(iframes[i], 'unMute');
                            ytCmd(iframes[i], 'setVolume', [100]);
                        }
                        break;
                    }
                } catch (x) {}
            }
        }
    });
}

function setupVisibility() {
    var resume = function() {
        var iframes = dom.videoGrid.querySelectorAll('iframe');
        for (var i = 0; i < state.videos.length; i++) {
            if (state.videos[i].platform === 'youtube' && iframes[i]) {
                ytCmd(iframes[i], 'playVideo');
                if (state.unmutedIndex === i) {
                    ytCmd(iframes[i], 'unMute');
                    ytCmd(iframes[i], 'setVolume', [100]);
                }
            }
        }
    };
    document.addEventListener('visibilitychange', function() {
        if (document.visibilityState === 'visible') resume();
    });
    window.addEventListener('focus', resume);
    window.addEventListener('pageshow', resume);
}

// ===== CREATE CELL =====
function createCell(v, i) {
    var cell = document.createElement('div');
    cell.className = 'video-cell';
    if (i === state.activeIndex) cell.className += ' selected';
    cell.setAttribute('data-idx', i);

    var iframe = document.createElement('iframe');
    iframe.src = v.embedSrc;
    iframe.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture; fullscreen');
    iframe.setAttribute('allowfullscreen', '');
    iframe.setAttribute('playsinline', '');
    iframe.id = 'ifr_' + v.id;

    var selOv = document.createElement('div');
    selOv.className = 'sel-overlay';
    selOv.setAttribute('data-idx', i);

    var selNum = document.createElement('div');
    selNum.className = 'sel-num';
    selNum.textContent = '' + (i + 1);

    var badge = document.createElement('span');
    badge.className = 'badge ' + v.platform;
    badge.textContent = v.platform;

    cell.appendChild(iframe);
    cell.appendChild(selOv);
    cell.appendChild(selNum);
    cell.appendChild(badge);

    if (v.platform === 'youtube') {
        (function(vid, ifr) {
            ifr.addEventListener('load', function() {
                setTimeout(function() {
                    ytListen(ifr);
                    startKeepAlive(vid.id, ifr);
                    var idx = vidIndex(vid.id);
                    if (idx >= 0 && state.unmutedIndex === idx) {
                        ytCmd(ifr, 'unMute');
                        ytCmd(ifr, 'setVolume', [100]);
                        ytCmd(ifr, 'playVideo');
                    }
                }, 2000);
            });
        })(v, iframe);
    }

    return cell;
}

// ===== RENDER =====
function fullRender() {
    stopAllKeepAlive();
    dom.videoGrid.innerHTML = '';

    var count = state.videos.length;
    if (count === 0) {
        dom.emptyState.classList.remove('hidden');
        dom.videoGrid.style.gridTemplateColumns = '';
        dom.videoGrid.style.gridTemplateRows = '';
        return;
    }

    dom.emptyState.classList.add('hidden');

    if (state.selectMode) {
        dom.videoGrid.classList.add('select-mode');
    } else {
        dom.videoGrid.classList.remove('select-mode');
    }

    for (var i = 0; i < count; i++) {
        var cell = createCell(state.videos[i], i);
        dom.videoGrid.appendChild(cell);
    }

    applyGrid();
}

function addVideo(url) {
    var parsed = parseURL(url);
    if (!parsed) { toast('Cannot parse URL', true); return false; }
    var src = buildEmbed(parsed, true);
    if (!src) { toast('Unsupported', true); return false; }

    state.videos.push({
        id: 'v' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
        parsed: parsed,
        platform: parsed.platform,
        embedSrc: src,
        isLive: !!parsed.isLive
    });

    // Append only the new cell
    var cell = createCell(state.videos[state.videos.length - 1], state.videos.length - 1);
    dom.videoGrid.appendChild(cell);

    dom.emptyState.classList.add('hidden');

    if (state.selectMode) {
        dom.videoGrid.classList.add('select-mode');
    }

    applyGrid();
    save();
    toast(parsed.platform + ' added');
    return true;
}

function removeVideo(i) {
    var v = state.videos[i];
    if (v) stopKeepAlive(v.id);
    if (state.unmutedIndex === i) state.unmutedIndex = -1;
    else if (state.unmutedIndex > i) state.unmutedIndex--;
    state.videos.splice(i, 1);
    deselect();
    fullRender();
    save();
}

function moveVideo(from, to) {
    if (to < 0 || to >= state.videos.length) return;
    if (state.unmutedIndex === from) state.unmutedIndex = to;
    else if (state.unmutedIndex === to) state.unmutedIndex = from;
    var v = state.videos.splice(from, 1)[0];
    state.videos.splice(to, 0, v);
    state.activeIndex = to;
    fullRender();
    highlightSelected(to);
    save();
}

function reloadVideo(i) {
    var iframe = getIframeAt(i);
    if (!iframe) return;
    var v = state.videos[i];
    var muted = (state.unmutedIndex !== i);
    var src = buildEmbed(v.parsed, muted);
    iframe.src = '';
    setTimeout(function() {
        iframe.src = src;
        v.embedSrc = src;
        if (v.platform === 'youtube') {
            setTimeout(function() {
                ytListen(iframe);
                startKeepAlive(v.id, iframe);
                if (!muted) {
                    ytCmd(iframe, 'unMute');
                    ytCmd(iframe, 'setVolume', [100]);
                }
            }, 2500);
        }
    }, 200);
    toast('Reloading...');
}

function toggleVolume(i) {
    var v = state.videos[i];
    if (!v) return;
    if (state.unmutedIndex === i) {
        muteVideo(i);
        state.unmutedIndex = -1;
        toast('Muted');
    } else {
        if (state.unmutedIndex >= 0) muteVideo(state.unmutedIndex);
        state.unmutedIndex = i;
        unmuteVideo(i);
        toast('Unmuted: ' + v.platform);
    }
    updateVolBtn();
    save();
}

function muteVideo(i) {
    var v = state.videos[i];
    var iframe = getIframeAt(i);
    if (!iframe || !v) return;
    if (v.platform === 'youtube') {
        ytCmd(iframe, 'mute');
    } else {
        var src = buildEmbed(v.parsed, true);
        v.embedSrc = src;
        iframe.src = src;
    }
}

function unmuteVideo(i) {
    var v = state.videos[i];
    var iframe = getIframeAt(i);
    if (!iframe || !v) return;
    if (v.platform === 'youtube') {
        ytCmd(iframe, 'unMute');
        ytCmd(iframe, 'setVolume', [100]);
        ytCmd(iframe, 'playVideo');
    } else {
        var src = buildEmbed(v.parsed, false);
        v.embedSrc = src;
        iframe.src = src;
    }
}

function getIframeAt(i) {
    var cells = dom.videoGrid.querySelectorAll('.video-cell');
    if (cells[i]) return cells[i].querySelector('iframe');
    return null;
}

function updateVolBtn() {
    var btn = dom.actionBar.querySelector('[data-action="volume"]');
    if (!btn) return;
    var idx = state.activeIndex;
    var isOn = (idx >= 0 && state.unmutedIndex === idx);
    var svg = btn.querySelector('svg');
    var span = btn.querySelector('span');
    if (isOn) {
        btn.classList.add('vol-on');
        svg.innerHTML = '<path fill="currentColor" d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>';
        span.textContent = 'Mute';
    } else {
        btn.classList.remove('vol-on');
        svg.innerHTML = '<path fill="currentColor" d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>';
        span.textContent = 'Unmute';
    }
}

// ===== SELECT =====
function enterSelectMode() {
    state.selectMode = true;
    state.activeIndex = -1;
    dom.selectBar.classList.remove('hidden');
    dom.videoGrid.classList.add('select-mode');
    dom.selectLabel.textContent = 'Tap a video to select';
    dom.fab.style.display = 'none';
}

function exitSelectMode() {
    state.selectMode = false;
    state.activeIndex = -1;
    dom.selectBar.classList.add('hidden');
    dom.actionBar.classList.add('hidden');
    dom.videoGrid.classList.remove('select-mode');
    dom.fab.style.display = '';
    var c = dom.videoGrid.querySelectorAll('.video-cell');
    for (var i = 0; i < c.length; i++) c[i].classList.remove('selected');
}

function selectVideo(idx) {
    state.activeIndex = idx;
    highlightSelected(idx);
    dom.selectLabel.textContent = state.videos[idx].platform + ' #' + (idx + 1) + ' selected';
    dom.actionBar.classList.remove('hidden');
    updateVolBtn();
}

function deselect() {
    state.activeIndex = -1;
    dom.actionBar.classList.add('hidden');
    var c = dom.videoGrid.querySelectorAll('.video-cell');
    for (var i = 0; i < c.length; i++) c[i].classList.remove('selected');
    if (state.selectMode) dom.selectLabel.textContent = 'Tap a video to select';
}

function highlightSelected(idx) {
    var c = dom.videoGrid.querySelectorAll('.video-cell');
    for (var i = 0; i < c.length; i++) {
        if (i === idx) c[i].classList.add('selected');
        else c[i].classList.remove('selected');
    }
}

// ===== MENU =====
function openMenu() {
    state.menuOpen = true;
    dom.menuPanel.classList.remove('hidden');
    dom.menuOverlay.classList.remove('hidden');
    dom.fab.classList.add('open');
    dom.fab.classList.add('show');
}

function closeMenu() {
    state.menuOpen = false;
    dom.menuPanel.classList.add('hidden');
    dom.menuOverlay.classList.add('hidden');
    dom.fab.classList.remove('open');
    dom.fab.classList.remove('show');
}

function openModal(id) {
    var el = grab(id);
    if (el) el.classList.remove('hidden');
}

function closeModal(id) {
    var el = grab(id);
    if (el) el.classList.add('hidden');
}

function confirmAction(text, cb) {
    dom.confirmText.textContent = text;
    state.confirmCb = cb;
    openModal('confirmModal');
}

function toast(msg, err) {
    dom.toastBox.innerHTML = '';
    var el = document.createElement('div');
    el.className = 'toast' + (err ? ' err' : '');
    el.textContent = msg;
    dom.toastBox.appendChild(el);
    setTimeout(function() {
        if (el.parentNode) el.remove();
    }, 2500);
}

function save() {
    try {
        localStorage.setItem('mp9', JSON.stringify({
            videos: state.videos,
            layoutId: state.layoutId,
            unmutedIndex: state.unmutedIndex
        }));
    } catch (e) {}
}

function load() {
    try {
        var d = JSON.parse(localStorage.getItem('mp9'));
        if (d) {
            if (d.videos) state.videos = d.videos;
            if (d.layoutId) state.layoutId = d.layoutId;
            if (typeof d.unmutedIndex === 'number') state.unmutedIndex = d.unmutedIndex;
            if (state.unmutedIndex >= state.videos.length) state.unmutedIndex = -1;
        }
    } catch (e) {}
}

// ===== LAYOUT PICKER =====
function buildLayoutPicker() {
    dom.layoutGrid.innerHTML = '';
    for (var i = 0; i < LAYOUTS.length; i++) {
        var L = LAYOUTS[i];
        var btn = document.createElement('button');
        btn.className = 'lay-opt';
        if (L.id === state.layoutId) btn.className += ' active';
        btn.setAttribute('data-layout', L.id);
        btn.type = 'button';

        var preview = document.createElement('div');
        preview.className = 'lay-preview';
        preview.style.gridTemplateColumns = 'repeat(' + L.cols + ',1fr)';
        preview.style.gridTemplateRows = 'repeat(' + L.rows + ',1fr)';

        for (var j = 0; j < L.cells.length; j++) {
            var c = L.cells[j];
            var d = document.createElement('div');
            d.style.gridColumn = (c[0] + 1) + ' / span ' + c[2];
            d.style.gridRow = (c[1] + 1) + ' / span ' + c[3];
            preview.appendChild(d);
        }

        var span = document.createElement('span');
        span.textContent = L.name;

        btn.appendChild(preview);
        btn.appendChild(span);
        dom.layoutGrid.appendChild(btn);
    }
}

// ===== WIRE =====
function wire() {
    // FAB touch/mouse reveal
    document.addEventListener('touchstart', function() {
        if (state.videos.length > 0 && !state.selectMode) flashFab();
    }, {passive: true});

    document.addEventListener('mousemove', function() {
        if (state.videos.length > 0 && !state.selectMode) flashFab();
    });

    // FAB click
    dom.fab.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        if (state.menuOpen) {
            closeMenu();
        } else {
            openMenu();
        }
    });

    // Menu overlay
    dom.menuOverlay.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        closeMenu();
    });

    // Menu items
    dom.menuPanel.addEventListener('click', function(e) {
        var item = e.target;
        while (item && item !== dom.menuPanel) {
            if (item.classList && item.classList.contains('menu-item')) break;
            item = item.parentElement;
        }
        if (!item || !item.classList || !item.classList.contains('menu-item')) return;

        e.preventDefault();
        e.stopPropagation();

        var action = item.getAttribute('data-action');
        closeMenu();

        switch (action) {
            case 'add':
                openModal('addModal');
                dom.urlInput.value = '';
                setTimeout(function() { dom.urlInput.focus(); }, 250);
                break;
            case 'layout':
                buildLayoutPicker();
                openModal('layoutModal');
                break;
            case 'select':
                if (state.videos.length === 0) { toast('No videos', true); return; }
                enterSelectMode();
                break;
            case 'clearall':
                if (state.videos.length === 0) { toast('Nothing to clear', true); return; }
                confirmAction('Remove all ' + state.videos.length + ' videos?', function() {
                    stopAllKeepAlive();
                    state.videos = [];
                    state.activeIndex = -1;
                    state.unmutedIndex = -1;
                    exitSelectMode();
                    fullRender();
                    save();
                    toast('All cleared');
                });
                break;
        }
    });

    // Add modal
    dom.closeAddModal.addEventListener('click', function(e) {
        e.preventDefault();
        closeModal('addModal');
    });
    dom.addModal.querySelector('.modal-bg').addEventListener('click', function() {
        closeModal('addModal');
    });

    // Paste
    dom.pasteBtn.addEventListener('click', function(e) {
        e.preventDefault();
        if (navigator.clipboard && navigator.clipboard.readText) {
            navigator.clipboard.readText().then(function(t) {
                dom.urlInput.value = t;
            }).catch(function() {
                toast('Clipboard denied', true);
            });
        }
    });

    // Submit video
    dom.submitVideo.addEventListener('click', function(e) {
        e.preventDefault();
        var url = dom.urlInput.value.trim();
        if (!url) { toast('Enter a URL', true); return; }
        if (addVideo(url)) closeModal('addModal');
    });

    dom.urlInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') { e.preventDefault(); dom.submitVideo.click(); }
    });

    // Layout modal
    dom.closeLayoutModal.addEventListener('click', function(e) {
        e.preventDefault();
        closeModal('layoutModal');
    });
    dom.layoutModal.querySelector('.modal-bg').addEventListener('click', function() {
        closeModal('layoutModal');
    });

    // Layout selection
    dom.layoutGrid.addEventListener('click', function(e) {
        var opt = e.target;
        while (opt && opt !== dom.layoutGrid) {
            if (opt.classList && opt.classList.contains('lay-opt')) break;
            opt = opt.parentElement;
        }
        if (!opt || !opt.classList || !opt.classList.contains('lay-opt')) return;

        e.preventDefault();
        e.stopPropagation();

        state.layoutId = opt.getAttribute('data-layout');

        // Update active state
        var opts = dom.layoutGrid.querySelectorAll('.lay-opt');
        for (var i = 0; i < opts.length; i++) {
            if (opts[i].getAttribute('data-layout') === state.layoutId) {
                opts[i].classList.add('active');
            } else {
                opts[i].classList.remove('active');
            }
        }

        applyGrid();
        save();
        closeModal('layoutModal');
    });

    // Confirm modal
    dom.confirmNo.addEventListener('click', function(e) {
        e.preventDefault();
        closeModal('confirmModal');
        state.confirmCb = null;
    });
    dom.confirmModal.querySelector('.modal-bg').addEventListener('click', function() {
        closeModal('confirmModal');
        state.confirmCb = null;
    });
    dom.confirmYes.addEventListener('click', function(e) {
        e.preventDefault();
        closeModal('confirmModal');
        if (state.confirmCb) {
            var cb = state.confirmCb;
            state.confirmCb = null;
            cb();
        }
    });

    // Exit select
    dom.exitSelect.addEventListener('click', function(e) {
        e.preventDefault();
        exitSelectMode();
    });

    // Grid tap (select mode)
    dom.videoGrid.addEventListener('click', function(e) {
        if (!state.selectMode) return;
        var el = e.target;
        while (el && el !== dom.videoGrid) {
            if (el.classList && el.classList.contains('sel-overlay')) {
                e.preventDefault();
                e.stopPropagation();
                var idx = parseInt(el.getAttribute('data-idx'), 10);
                if (state.activeIndex === idx) deselect();
                else selectVideo(idx);
                return;
            }
            el = el.parentElement;
        }
    });

    // Action bar
    dom.actionBar.addEventListener('click', function(e) {
        var el = e.target;
        var btn = null;
        while (el && el !== dom.actionBar) {
            if (el.classList && el.classList.contains('act-btn')) { btn = el; break; }
            el = el.parentElement;
        }
        if (!btn) return;
        e.preventDefault();
        e.stopPropagation();

        var action = btn.getAttribute('data-action');
        var idx = state.activeIndex;

        switch (action) {
            case 'volume':
                if (idx >= 0) toggleVolume(idx);
                break;
            case 'move-left':
                if (idx > 0) moveVideo(idx, idx - 1);
                break;
            case 'move-right':
                if (idx < state.videos.length - 1) moveVideo(idx, idx + 1);
                break;
            case 'reload':
                if (idx >= 0) reloadVideo(idx);
                break;
            case 'remove':
                if (idx >= 0) {
                    var name = state.videos[idx].platform + ' #' + (idx + 1);
                    confirmAction('Remove ' + name + '?', function() {
                        removeVideo(idx);
                        toast('Removed');
                    });
                }
                break;
            case 'deselect':
                deselect();
                break;
        }
    });

    // Keyboard
    document.addEventListener('keydown', function(e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        if (e.key === 'Escape') {
            if (!dom.addModal.classList.contains('hidden')) { closeModal('addModal'); return; }
            if (!dom.layoutModal.classList.contains('hidden')) { closeModal('layoutModal'); return; }
            if (!dom.confirmModal.classList.contains('hidden')) { closeModal('confirmModal'); return; }
            if (state.selectMode) { exitSelectMode(); return; }
            if (state.menuOpen) { closeMenu(); return; }
        }
    });

    // Resize
    var resizeTimer;
    window.addEventListener('resize', function() {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function() {
            if (state.videos.length > 0) sizeIframes();
        }, 150);
    });

    window.addEventListener('orientationchange', function() {
        setTimeout(function() {
            if (state.videos.length > 0) sizeIframes();
        }, 350);
    });
}

// ===== BOOT =====
function boot() {
    initDom();
    load();
    fullRender();
    wire();
    setupYTListener();
    setupVisibility();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
} else {
    boot();
}

})();