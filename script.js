(function () {
    'use strict';

    // ============================================================
    //  HELPERS
    // ============================================================

    const P = {
        YT: 'youtube', TW: 'twitch', KI: 'kick',
        RU: 'rumble', MP4: 'direct', UNK: 'unknown'
    };

    function detect(u) {
        if (!u) return P.UNK;
        if (/youtu(\.be|be\.com)/i.test(u)) return P.YT;
        if (/twitch\.tv/i.test(u)) return P.TW;
        if (/kick\.com/i.test(u)) return P.KI;
        if (/rumble\.com/i.test(u)) return P.RU;
        if (/\.(mp4|webm|m3u8|ogg|mov)(\?|$)/i.test(u)) return P.MP4;
        return P.UNK;
    }

    function ytId(u) {
        const m = u.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
        return m ? m[1] : null;
    }
    function twCh(u) { return (u.match(/twitch\.tv\/([a-zA-Z0-9_]+)/) || [])[1]; }
    function kiCh(u) { return (u.match(/kick\.com\/([a-zA-Z0-9_-]+)/) || [])[1]; }
    function ruEmb(u) {
        let m = u.match(/rumble\.com\/embed\/([a-zA-Z0-9]+)/);
        if (m) return 'https://rumble.com/embed/' + m[1] + '/';
        m = u.match(/rumble\.com\/([a-zA-Z0-9-]+)\.html/);
        if (m) return 'https://rumble.com/embed/' + m[1] + '/';
        return u;
    }

    function fmt(s) {
        if (!s || !isFinite(s)) return '0:00';
        const h = ~~(s / 3600), m = ~~((s % 3600) / 60), sc = ~~(s % 60);
        return h ? h + ':' + String(m).padStart(2, '0') + ':' + String(sc).padStart(2, '0')
            : m + ':' + String(sc).padStart(2, '0');
    }

    function toast(msg, ms) {
        const t = document.getElementById('toast');
        t.textContent = msg;
        t.classList.remove('hidden');
        clearTimeout(t._t);
        t._t = setTimeout(() => t.classList.add('hidden'), ms || 2400);
    }

    // ============================================================
    //  YOUTUBE API READY
    // ============================================================

    let ytReady = new Promise(r => {
        if (window.YT && window.YT.Player) return r();
        window.onYouTubeIframeAPIReady = r;
    });

    // ============================================================
    //  SLOT
    // ============================================================

    class Slot {
        constructor(i) {
            this.i = i;
            this.url = '';
            this.plat = P.UNK;
            this.vid = null;      // <video>
            this.ytp = null;      // YT.Player
            this.ifr = null;      // <iframe> (twitch/kick/rumble)
            this.vol = 0;
            this.muted = true;
            this._overlayTimer = null;
            this._build();
        }

        _build() {
            const el = document.createElement('div');
            el.className = 'cell empty';
            el.dataset.i = this.i;
            el.innerHTML = `
                <span class="cell-num">${this.i + 1}</span>
                <span class="cell-mute"><svg viewBox="0 0 24 24"><path d="M4.34 2.93L2.93 4.34 7.29 8.7 7 9H3v6h4l5 5v-6.59l4.18 4.18c-.65.49-1.38.88-2.18 1.11v2.06a8.94 8.94 0 0 0 3.61-1.75l2.05 2.05 1.41-1.41L4.34 2.93zM12 4l-2.68 2.68L12 9.31V4zm7 8c0 .94-.2 1.82-.54 2.64l1.5 1.5A8.94 8.94 0 0 0 21 12c0-4.28-3-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71z"/></svg></span>
            `;
            this.el = el;
        }

        // ---- Show / hide the number + mute overlays for 3 seconds ----
        flashOverlay() {
            this.el.classList.add('show-overlay');
            clearTimeout(this._overlayTimer);
            this._overlayTimer = setTimeout(() => {
                this.el.classList.remove('show-overlay');
            }, 3000);
        }

        // ---- Sync the unmuted class on cell ----
        _syncCellMute() {
            this.el.classList.toggle('unmuted', !this.muted);
        }

        // ---- Load ----
        async load(url) {
            this.clear();
            this.url = url.trim();
            this.plat = detect(this.url);
            this.el.classList.remove('empty');
            this.muted = true;
            this.vol = 0;
            this._syncCellMute();

            switch (this.plat) {
                case P.YT:  await this._loadYT(); break;
                case P.TW:  this._loadTW(); break;
                case P.KI:  this._loadKI(); break;
                case P.RU:  this._loadRU(); break;
                case P.MP4: this._loadMP4(); break;
                default:    this._loadIFR(); break;
            }
        }

        async _loadYT() {
            const id = ytId(this.url);
            if (!id) { this._loadIFR(); return; }
            await ytReady;
            const div = document.createElement('div');
            div.id = 'yt' + this.i + '_' + Date.now();
            this.el.appendChild(div);
            this.ytp = new YT.Player(div.id, {
                videoId: id,
                playerVars: {
                    autoplay: 1, mute: 1, controls: 0, playsinline: 1,
                    modestbranding: 1, rel: 0, showinfo: 0, fs: 0,
                    iv_load_policy: 3, disablekb: 1, origin: location.origin
                },
                events: {
                    onReady: e => { e.target.mute(); e.target.setVolume(0); }
                }
            });
        }

        _loadTW() {
            const ch = twCh(this.url);
            if (!ch) { this._loadIFR(); return; }
            const par = location.hostname || 'localhost';
            this._mkIframe('https://player.twitch.tv/?channel=' + ch + '&parent=' + par + '&muted=true&autoplay=true');
        }

        _loadKI() {
            const ch = kiCh(this.url);
            if (!ch) { this._loadIFR(); return; }
            this._mkIframe('https://player.kick.com/' + ch + '?autoplay=true&muted=true');
        }

        _loadRU() {
            const src = ruEmb(this.url);
            this._mkIframe(src + (src.includes('?') ? '&' : '?') + 'autoplay=1&mute=1');
        }

        _loadMP4() {
            const v = document.createElement('video');
            v.src = this.url; v.muted = true; v.playsInline = true;
            v.setAttribute('playsinline', '');
            v.setAttribute('webkit-playsinline', '');
            v.autoplay = true; v.preload = 'auto';
            v.play().catch(() => {});
            this.vid = v;
            this.el.appendChild(v);
        }

        _loadIFR() { this._mkIframe(this.url); }

        _mkIframe(src) {
            const f = document.createElement('iframe');
            f.src = src;
            f.allow = 'autoplay; encrypted-media; fullscreen';
            f.setAttribute('allowfullscreen', '');
            f.setAttribute('playsinline', '');
            this.ifr = f;
            this.el.appendChild(f);
        }

        // ---- Clear ----
        clear() {
            if (this.ytp) { try { this.ytp.destroy(); } catch (e) {} this.ytp = null; }
            if (this.vid) { this.vid.pause(); this.vid.removeAttribute('src'); this.vid.load(); this.vid.remove(); this.vid = null; }
            if (this.ifr) { this.ifr.src = ''; this.ifr.remove(); this.ifr = null; }
            // Clean leftover children
            Array.from(this.el.children).forEach(c => {
                if (!c.classList.contains('cell-num') && !c.classList.contains('cell-mute')) c.remove();
            });
            this.url = ''; this.plat = P.UNK; this.muted = true; this.vol = 0;
            this.el.classList.add('empty');
            this.el.classList.remove('show-overlay', 'unmuted');
        }

        get empty() { return !this.url; }
        get isYT() { return this.plat === P.YT && !!this.ytp; }
        get isMP4() { return this.plat === P.MP4 && !!this.vid; }
        get canCtrl() { return this.isYT || this.isMP4; }

        // ---- Play / Pause ----
        play() {
            if (this.isYT) try { this.ytp.playVideo(); } catch (e) {}
            if (this.isMP4) this.vid.play().catch(() => {});
        }
        pause() {
            if (this.isYT) try { this.ytp.pauseVideo(); } catch (e) {}
            if (this.isMP4) this.vid.pause();
        }
        togglePlay() {
            if (this.isYT) {
                try {
                    const s = this.ytp.getPlayerState();
                    s === 1 ? this.ytp.pauseVideo() : this.ytp.playVideo();
                    return s !== 1;
                } catch (e) { return false; }
            }
            if (this.isMP4) {
                if (this.vid.paused) { this.vid.play().catch(() => {}); return true; }
                this.vid.pause(); return false;
            }
            return false;
        }
        playing() {
            if (this.isYT) try { return this.ytp.getPlayerState() === 1; } catch (e) { return false; }
            if (this.isMP4) return !this.vid.paused;
            return false;
        }

        // ---- VOLUME ----
        setVol(v) {
            v = Math.max(0, Math.min(100, Math.round(v)));
            this.vol = v;
            this.muted = v === 0;

            // YouTube
            if (this.isYT) {
                try {
                    if (v === 0) { this.ytp.mute(); }
                    else { this.ytp.unMute(); this.ytp.setVolume(v); }
                } catch (e) {}
            }

            // Direct video
            if (this.isMP4) {
                this.vid.muted = v === 0;
                this.vid.volume = v / 100;
            }

            // Twitch — postMessage
            if (this.plat === P.TW && this.ifr && this.ifr.contentWindow) {
                try {
                    const w = this.ifr.contentWindow;
                    if (v === 0) {
                        w.postMessage({ eventName: 'setMuted', params: { muted: true } }, '*');
                    } else {
                        w.postMessage({ eventName: 'setMuted', params: { muted: false } }, '*');
                        w.postMessage({ eventName: 'setVolume', params: { volume: v / 100 } }, '*');
                    }
                } catch (e) {}
            }

            // Kick / Rumble — reload with muted param
            if ((this.plat === P.KI || this.plat === P.RU) && this.ifr) {
                this._reloadMute(v === 0);
            }

            this._syncCellMute();
        }

        _reloadMute(mute) {
            if (!this.ifr) return;
            let s = this.ifr.src;
            s = s.replace(/[?&]muted=(true|false)/gi, '').replace(/[?&]mute=[01]/gi, '');
            const sep = s.includes('?') ? '&' : '?';
            if (this.plat === P.KI) s += sep + 'muted=' + mute;
            else s += sep + 'mute=' + (mute ? 1 : 0);
            this.ifr.src = s;
        }

        getVol() {
            if (this.isYT) try { return this.ytp.isMuted() ? 0 : this.ytp.getVolume(); } catch (e) {}
            if (this.isMP4) return this.vid.muted ? 0 : Math.round(this.vid.volume * 100);
            return this.vol;
        }

        // ---- Seek ----
        seekTo(t) {
            if (this.isYT) try { this.ytp.seekTo(t, true); } catch (e) {}
            if (this.isMP4 && isFinite(t)) this.vid.currentTime = t;
        }
        seekRel(d) {
            this.seekTo(Math.max(0, Math.min(this.dur() || Infinity, this.cur() + d)));
        }
        cur() {
            if (this.isYT) try { return this.ytp.getCurrentTime() || 0; } catch (e) {}
            if (this.isMP4) return this.vid.currentTime || 0;
            return 0;
        }
        dur() {
            if (this.isYT) try { return this.ytp.getDuration() || 0; } catch (e) {}
            if (this.isMP4) return this.vid.duration || 0;
            return 0;
        }
        prog() { const d = this.dur(); return d > 0 ? this.cur() / d : 0; }
        bufd() {
            if (this.isYT) try { return this.ytp.getVideoLoadedFraction() || 0; } catch (e) {}
            if (this.isMP4 && this.vid.buffered.length > 0 && this.vid.duration)
                return this.vid.buffered.end(this.vid.buffered.length - 1) / this.vid.duration;
            return 0;
        }

        destroy() { this.clear(); this.el.remove(); }
    }

    // ============================================================
    //  SLIDER HELPER
    // ============================================================

    function slider(track, knob, fill, cb) {
        let on = false;
        function pct(e) {
            const r = track.getBoundingClientRect();
            return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
        }
        function set(p) { fill.style.width = (p * 100) + '%'; knob.style.left = (p * 100) + '%'; }

        track.addEventListener('touchstart', e => {
            e.preventDefault(); on = true;
            const p = pct(e.touches[0]); set(p); cb(p, 'start');
        }, { passive: false });
        document.addEventListener('touchmove', e => {
            if (!on) return; e.preventDefault();
            const p = pct(e.touches[0]); set(p); cb(p, 'move');
        }, { passive: false });
        document.addEventListener('touchend', () => {
            if (!on) return; on = false; cb(null, 'end');
        });

        return { set };
    }

    // ============================================================
    //  APP STATE
    // ============================================================

    const $ = id => document.getElementById(id);
    const grid = $('grid');
    let slots = [];
    let layout = 2;
    let active = null;       // currently controlled slot
    let swapFrom = null;
    let seeking = false;
    let raf = null;

    // ============================================================
    //  BUILD GRID
    // ============================================================

    function buildGrid(n, urls) {
        layout = n;
        grid.dataset.count = n;

        const old = urls || slots.map(s => s.url);
        slots.forEach(s => s.destroy());
        slots = [];
        grid.innerHTML = '';

        for (let i = 0; i < n; i++) {
            const s = new Slot(i);
            slots.push(s);
            grid.appendChild(s.el);
            bindCell(s);
        }

        old.forEach((u, i) => { if (u && i < n) slots[i].load(u); });
    }

    // ============================================================
    //  CELL TAP — triggers overlay flash + opens panel
    // ============================================================

    function bindCell(s) {
        s.el.addEventListener('click', () => {
            if (swapFrom !== null) { doSwap(s); return; }
            if (s.empty) { openModal(); return; }

            // Flash the overlay badges for 3s
            s.flashOverlay();
            // Open control panel
            openPanel(s);
        });
    }

    // ============================================================
    //  PANEL
    // ============================================================

    const panel = $('panel');
    const panelSlot = $('panelSlot');
    const panelPlat = $('panelPlat');
    const rowPlay = $('rowPlay');
    const rowSeek = $('rowSeek');
    const bPlay = $('bPlay');
    const ppPlay = bPlay.querySelector('.pp-play');
    const ppPause = bPlay.querySelector('.pp-pause');
    const bMute = $('bMute');
    const volOn = bMute.querySelector('.vol-on');
    const volOff = bMute.querySelector('.vol-off');
    const vNum = $('vNum');
    const tNow = $('tNow');
    const tEnd = $('tEnd');
    const sFill = $('sFill');
    const sBuf = $('sBuf');
    const sKnob = $('sKnob');
    const vFill = $('vFill');
    const vKnob = $('vKnob');

    // Init sliders once
    const seekSl = slider($('sSeek'), sKnob, sFill, (p, ph) => {
        if (!active) return;
        if (ph === 'start' || ph === 'move') {
            seeking = true;
            const d = active.dur();
            if (d > 0 && p !== null) { active.seekTo(p * d); tNow.textContent = fmt(p * d); }
        }
        if (ph === 'end') seeking = false;
    });

    const volSl = slider($('sVol'), vKnob, vFill, (p, ph) => {
        if (!active || p === null) return;
        const v = Math.round(p * 100);
        active.setVol(v);
        vNum.textContent = v + '%';
        syncMuteUI();
        if (v > 0) muteOthers(active);
    });

    function openPanel(s) {
        active = s;
        panelSlot.textContent = 'Slot ' + (s.i + 1);

        // Platform badge
        const names = { youtube:'YouTube', twitch:'Twitch', kick:'Kick', rumble:'Rumble', direct:'Video', unknown:'Embed' };
        panelPlat.textContent = names[s.plat] || 'Embed';
        panelPlat.className = 'panel-plat pt-' + s.plat;

        // Show/hide playback + seek rows
        rowPlay.style.display = s.canCtrl ? 'flex' : 'none';
        rowSeek.style.display = s.canCtrl ? 'flex' : 'none';

        syncPlayUI();
        syncMuteUI();
        syncVolUI();

        panel.classList.remove('hidden');
        startLoop();
    }

    function closePanel() {
        panel.classList.add('hidden');
        stopLoop();
        active = null;
    }

    function syncPlayUI() {
        if (!active) return;
        const p = active.playing();
        ppPlay.classList.toggle('hide', p);
        ppPause.classList.toggle('hide', !p);
    }

    function syncMuteUI() {
        if (!active) return;
        volOn.classList.toggle('hide', active.muted);
        volOff.classList.toggle('hide', !active.muted);
    }

    function syncVolUI() {
        if (!active) return;
        const v = active.getVol();
        vFill.style.width = v + '%';
        vKnob.style.left = v + '%';
        vNum.textContent = v + '%';
    }

    function startLoop() {
        stopLoop();
        (function tick() {
            if (!active || panel.classList.contains('hidden')) return;
            if (!seeking && active.canCtrl) {
                const p = active.prog(), b = active.bufd();
                sFill.style.width = (p * 100) + '%';
                sBuf.style.width = (b * 100) + '%';
                sKnob.style.left = (p * 100) + '%';
                tNow.textContent = fmt(active.cur());
                tEnd.textContent = fmt(active.dur());
            }
            syncPlayUI();
            raf = requestAnimationFrame(tick);
        })();
    }

    function stopLoop() { cancelAnimationFrame(raf); }

    // Panel buttons
    $('panelX').onclick = closePanel;
    $('panelDrag').onclick = closePanel;

    $('bPlay').onclick = () => { if (active) { active.togglePlay(); syncPlayUI(); } };
    $('bRew').onclick = () => { if (active) active.seekRel(-10); };
    $('bFwd').onclick = () => { if (active) active.seekRel(10); };

    $('bMute').onclick = () => {
        if (!active) return;
        if (active.muted) {
            // Unmute to 50% or previous volume
            const target = active.vol > 0 ? active.vol : 50;
            active.setVol(target);
            muteOthers(active);
            toast('Slot ' + (active.i + 1) + ' unmuted');
        } else {
            active.setVol(0);
        }
        syncMuteUI();
        syncVolUI();
    };

    $('bRemove').onclick = () => {
        if (!active) return;
        active.clear();
        save();
        toast('Removed');
        closePanel();
    };

    $('bSwap').onclick = () => {
        if (!active) return;
        swapFrom = active;
        closePanel();
        $('swapOv').classList.remove('hidden');
        // Highlight other cells
        slots.forEach(s => { if (s !== swapFrom && !s.empty) s.el.classList.add('swap-pick'); });
    };

    // ============================================================
    //  MUTE ALL OTHERS
    // ============================================================

    function muteOthers(keep) {
        slots.forEach(s => {
            if (s !== keep && !s.empty) s.setVol(0);
        });
    }

    // ============================================================
    //  SWAP
    // ============================================================

    $('swapNo').onclick = cancelSwap;

    function cancelSwap() {
        $('swapOv').classList.add('hidden');
        slots.forEach(s => s.el.classList.remove('swap-pick'));
        swapFrom = null;
    }

    function doSwap(target) {
        if (!swapFrom || target === swapFrom) { cancelSwap(); return; }

        // Swap DOM elements
        const aEl = swapFrom.el;
        const bEl = target.el;
        const aNext = aEl.nextSibling;
        const bNext = bEl.nextSibling;
        const parent = grid;

        if (aNext === bEl) {
            parent.insertBefore(bEl, aEl);
        } else if (bNext === aEl) {
            parent.insertBefore(aEl, bEl);
        } else {
            const placeholder = document.createElement('div');
            parent.insertBefore(placeholder, aEl);
            parent.insertBefore(aEl, bNext);
            parent.insertBefore(bEl, placeholder);
            parent.removeChild(placeholder);
        }

        // Update indices
        reindex();
        toast('Swapped ' + (swapFrom.i + 1) + ' ↔ ' + (target.i + 1));
        cancelSwap();
        save();
    }

    function reindex() {
        Array.from(grid.children).forEach((el, i) => {
            const s = slots.find(sl => sl.el === el);
            if (s) {
                s.i = i;
                el.dataset.i = i;
                el.querySelector('.cell-num').textContent = i + 1;
            }
        });
        slots.sort((a, b) => a.i - b.i);
    }

    // ============================================================
    //  SECRET TRIGGER — triple tap top-right
    // ============================================================

    let staps = 0, stimer = null;
    $('secretZone').addEventListener('touchend', e => {
        e.preventDefault();
        staps++;
        clearTimeout(stimer);
        stimer = setTimeout(() => staps = 0, 450);
        if (staps >= 3) { staps = 0; openModal(); }
    });

    // ============================================================
    //  MODAL
    // ============================================================

    const modal = $('modal');
    const urlList = $('urlList');
    const gridOpts = $('gridOpts');
    let inputs = [];

    function openModal() {
        urlList.innerHTML = '';
        inputs = [];

        const n = Math.max(layout, slots.length);
        for (let i = 0; i < n; i++) addInput(slots[i] ? slots[i].url : '');

        gridOpts.querySelectorAll('.g-btn').forEach(b =>
            b.classList.toggle('active', +b.dataset.n === layout)
        );

        modal.classList.remove('hidden');
        requestAnimationFrame(() => {
            const emp = inputs.find(inp => !inp.value);
            if (emp) emp.focus();
        });
    }

    function closeModal() { modal.classList.add('hidden'); }

    function addInput(val) {
        const idx = inputs.length;
        const row = document.createElement('div');
        row.className = 'u-row';
        row.innerHTML = `
            <div class="u-num">${idx + 1}</div>
            <input type="url" placeholder="Paste video URL" autocapitalize="none" autocomplete="off" spellcheck="false">
            <button class="u-x" aria-label="Clear"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        `;
        const inp = row.querySelector('input');
        inp.value = val || '';
        row.querySelector('.u-x').onclick = () => { inp.value = ''; inp.focus(); };
        urlList.appendChild(row);
        inputs.push(inp);
    }

    $('addRow').onclick = () => addInput();
    $('modalBg').onclick = closeModal;
    $('modalX').onclick = closeModal;

    gridOpts.addEventListener('click', e => {
        const b = e.target.closest('.g-btn');
        if (!b) return;
        gridOpts.querySelectorAll('.g-btn').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        // Ensure enough input rows
        const n = +b.dataset.n;
        while (inputs.length < n) addInput();
    });

    $('loadBtn').onclick = () => {
        const n = +gridOpts.querySelector('.g-btn.active').dataset.n;
        const urls = inputs.map(inp => inp.value.trim());

        buildGrid(n, urls);
        save();
        closeModal();

        const ct = urls.filter(u => u).length;
        if (ct > 0) toast(ct + ' video' + (ct > 1 ? 's' : '') + ' loaded');
    };

    // ============================================================
    //  PERSISTENCE
    // ============================================================

    function save() {
        try {
            localStorage.setItem('mv', JSON.stringify({ layout, urls: slots.map(s => s.url) }));
        } catch (e) {}
    }

    function restore() {
        try {
            const d = JSON.parse(localStorage.getItem('mv'));
            if (d && d.urls) { buildGrid(d.layout || 2, d.urls); return; }
        } catch (e) {}
        buildGrid(2);
    }

    // ============================================================
    //  VISIBILITY
    // ============================================================

    document.addEventListener('visibilitychange', () => {
        slots.forEach(s => {
            if (!s.isMP4) return;
            if (document.hidden) {
                if (!s.vid.paused) { s._wp = true; s.pause(); }
            } else {
                if (s._wp) { s.play(); s._wp = false; }
            }
        });
    });

    // Prevent iOS rubber-band bounce
    document.addEventListener('touchmove', e => {
        if (!e.target.closest('.modal-body')) e.preventDefault();
    }, { passive: false });

    // ============================================================
    //  INIT
    // ============================================================

    restore();

})();