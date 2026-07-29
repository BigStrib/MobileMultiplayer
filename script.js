/**
 * Fixes:
 * - Menu "broken": removed duplicate FAB listeners + hardened sheet open/close + swipe.
 * - No preloaded videos: NO starter streams are added at boot.
 *
 * Providers:
 * - YouTube: URL parsing supports watch/shorts/live/youtu.be; mute control via API.
 * - Twitch: supports channel, VOD, clip, player URLs. Requires running on http(s) host for parent=.
 * - Kick: basic channel embed.
 * - Rumble: supports embed URLs; page URLs resolved via oEmbed (requires network fetch).
 */

const state = {
  cols: 2,
  streams: [],
  selectedKey: null,

  editMode: false,
  reorderMode: false,
  audioKey: null,

  // drag
  draggingKey: null,
  dragPointerId: null,
  dragStartX: 0,
  dragStartY: 0,
  isDragging: false,

  ytApiPromise: null,
};

const gridEl = document.getElementById('grid');
const fabEl = document.getElementById('fab');

const sheetEl = document.getElementById('sheet');
const sheetHandleEl = document.getElementById('sheetHandle');
const closeSheetBtn = document.getElementById('closeSheetBtn');
const enterEditBtn = document.getElementById('enterEditBtn');

const urlInput = document.getElementById('urlInput');
const addBtn = document.getElementById('addBtn');
const segmentedBtns = Array.from(document.querySelectorAll('.segmented__btn'));

const volumeBtn = document.getElementById('volumeBtn');
const volumeIcon = document.getElementById('volumeIcon');
const moveBtn = document.getElementById('moveBtn');
const trashBtn = document.getElementById('trashBtn');
const doneBtn = document.getElementById('doneBtn');

// --------------------- utils ---------------------
function uuid() {
  return (crypto?.randomUUID?.() || `k_${Math.random().toString(16).slice(2)}`);
}

function tryParseUrl(input) {
  try {
    const s = input.trim();
    if (!/^https?:\/\//i.test(s)) return new URL(`https://${s}`);
    return new URL(s);
  } catch { return null; }
}

function hostNoWww(u) {
  return u.hostname.replace(/^www\./i, '').toLowerCase();
}

function parentHost() {
  return window.location.hostname || 'localhost';
}

function findStream(key) {
  return state.streams.find(s => s.key === key) || null;
}

function findTileEl(key) {
  return gridEl.querySelector(`.tile[data-key="${CSS.escape(key)}"]`);
}

// --------------------- parsing ---------------------
function parseYouTubeId(u) {
  const host = hostNoWww(u);
  if (host === 'youtu.be') return u.pathname.split('/').filter(Boolean)[0] || null;

  if (host.endsWith('youtube.com')) {
    const v = u.searchParams.get('v');
    if (v) return v;
    const parts = u.pathname.split('/').filter(Boolean);
    const idx = parts.findIndex(p => ['shorts','live','embed'].includes(p));
    if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
  }
  return null;
}

function parseKickChannel(u) {
  const host = hostNoWww(u);
  if (!host.endsWith('kick.com')) return null;
  return u.pathname.split('/').filter(Boolean)[0] || null;
}

function parseTwitch(u) {
  const host = hostNoWww(u);

  if (host === 'player.twitch.tv') {
    const channel = u.searchParams.get('channel');
    const video = u.searchParams.get('video');
    if (channel) return { kind: 'channel', channel };
    if (video) return { kind: 'video', video: video.startsWith('v') ? video : `v${video}` };
  }

  if (host === 'clips.twitch.tv') {
    const slug = u.pathname.split('/').filter(Boolean)[0];
    if (slug) return { kind: 'clip', slug };
  }

  if (host.endsWith('twitch.tv')) {
    const parts = u.pathname.split('/').filter(Boolean);

    if (parts[0] === 'videos' && parts[1]) {
      return { kind: 'video', video: `v${parts[1].replace(/^v/i,'')}` };
    }

    if (parts[1] === 'clip' && parts[2]) {
      return { kind: 'clip', slug: parts[2] };
    }

    const ch = parts[0];
    if (ch && !['videos','directory','downloads','settings'].includes(ch)) {
      return { kind: 'channel', channel: ch };
    }
  }

  return null;
}

function parseRumbleEmbedId(u) {
  const host = hostNoWww(u);
  if (!host.endsWith('rumble.com')) return null;

  const parts = u.pathname.split('/').filter(Boolean);
  const embedIdx = parts.indexOf('embed');
  if (embedIdx >= 0 && parts[embedIdx + 1]) return parts[embedIdx + 1];
  return null;
}

async function resolveRumbleEmbedSrc(pageUrl) {
  const oembed = `https://rumble.com/api/Media/oembed.json?url=${encodeURIComponent(pageUrl)}`;
  const res = await fetch(oembed);
  if (!res.ok) throw new Error('Rumble oEmbed failed');
  const data = await res.json();
  const html = String(data.html || '');
  const m = html.match(/src="([^"]+)"/i);
  if (!m) throw new Error('Rumble embed src not found');
  return m[1];
}

async function normalizeStreamAsync(inputUrl) {
  const u = tryParseUrl(inputUrl);
  if (!u) return null;

  const yt = parseYouTubeId(u);
  if (yt) {
    return { key: uuid(), provider: 'youtube', originalUrl: inputUrl, youtubeId: yt, muted: true, ytPlayer: null };
  }

  const tw = parseTwitch(u);
  if (tw) {
    return { key: uuid(), provider: 'twitch', originalUrl: inputUrl, twitch: tw, muted: true };
  }

  const kk = parseKickChannel(u);
  if (kk) {
    return { key: uuid(), provider: 'kick', originalUrl: inputUrl, kickChannel: kk, muted: true };
  }

  const rumbleEmbedId = parseRumbleEmbedId(u);
  if (rumbleEmbedId) {
    return { key: uuid(), provider: 'rumble', originalUrl: inputUrl, embedUrl: `https://rumble.com/embed/${encodeURIComponent(rumbleEmbedId)}/?rel=0`, muted: true };
  }

  if (hostNoWww(u).endsWith('rumble.com')) {
    try {
      const src = await resolveRumbleEmbedSrc(u.toString());
      return { key: uuid(), provider: 'rumble', originalUrl: inputUrl, embedUrl: src, muted: true };
    } catch {
      // fall through
    }
  }

  if (u.protocol === 'https:' || u.protocol === 'http:') {
    return { key: uuid(), provider: 'custom', originalUrl: inputUrl, embedUrl: u.toString(), muted: true };
  }

  return null;
}

function buildEmbedUrl(stream) {
  const parent = parentHost();
  const muted = stream.muted ? 'true' : 'false';

  if (stream.provider === 'twitch') {
    // Twitch embed reliably supports autoplay=false
    const autoplay = 'false';

    if (stream.twitch?.kind === 'channel') {
      return `https://player.twitch.tv/?channel=${encodeURIComponent(stream.twitch.channel)}&parent=${encodeURIComponent(parent)}&muted=${muted}&autoplay=${autoplay}&playsinline=true&controls=false`;
    }
    if (stream.twitch?.kind === 'video') {
      return `https://player.twitch.tv/?video=${encodeURIComponent(stream.twitch.video)}&parent=${encodeURIComponent(parent)}&muted=${muted}&autoplay=${autoplay}&playsinline=true&controls=false`;
    }
    if (stream.twitch?.kind === 'clip') {
      return `https://clips.twitch.tv/embed?clip=${encodeURIComponent(stream.twitch.slug)}&parent=${encodeURIComponent(parent)}&muted=${muted}&autoplay=${autoplay}`;
    }
  }

  if (stream.provider === 'kick') {
    // best-effort params; Kick may ignore autoplay in some cases
    return `https://player.kick.com/${encodeURIComponent(stream.kickChannel)}?autoplay=false&muted=${muted}`;
  }

  if (stream.provider === 'rumble') return stream.embedUrl;
  if (stream.provider === 'custom') return stream.embedUrl;

  return '';
}

// --------------------- layout (strict 16:9) ---------------------
function computeTileHeight(cols) {
  const vw = window.visualViewport?.width || window.innerWidth;
  return Math.max(1, Math.floor((vw / cols) * (9 / 16)));
}

function applyGridLayout() {
  const tileH = computeTileHeight(state.cols);
  gridEl.style.gridTemplateColumns = `repeat(${state.cols}, minmax(0, 1fr))`;
  gridEl.style.gridAutoRows = `${tileH}px`;
}

function setCols(cols) {
  state.cols = cols;
  applyGridLayout();
  segmentedBtns.forEach(b => b.classList.toggle('active', Number(b.dataset.cols) === cols));
}

segmentedBtns.forEach(btn => btn.addEventListener('click', () => setCols(Number(btn.dataset.cols))));

// --------------------- sheet open/close (fixed) ---------------------
function openSheet() {
  // clear any swipe inline transform
  sheetEl.style.transform = '';
  document.body.classList.add('sheet-open');
}
function closeSheet() {
  sheetEl.style.transform = '';
  document.body.classList.remove('sheet-open');
}

fabEl.addEventListener('click', () => {
  if (document.body.classList.contains('sheet-open')) closeSheet();
  else openSheet();
});

closeSheetBtn.addEventListener('click', closeSheet);

// swipe down to close (only affects open sheet)
(function bindSheetSwipeToClose(){
  let startY = 0;
  let active = false;

  sheetHandleEl.addEventListener('pointerdown', (e) => {
    if (!document.body.classList.contains('sheet-open')) return;
    active = true;
    startY = e.clientY;
    sheetHandleEl.setPointerCapture(e.pointerId);
  });

  sheetHandleEl.addEventListener('pointermove', (e) => {
    if (!active) return;
    const dy = e.clientY - startY;
    if (dy <= 0) return;
    sheetEl.style.transform = `translateY(${Math.min(dy, 160)}px)`;
  });

  const end = (e) => {
    if (!active) return;
    active = false;
    const dy = e.clientY - startY;
    sheetEl.style.transform = '';
    if (dy > 70) closeSheet();
  };

  sheetHandleEl.addEventListener('pointerup', end);
  sheetHandleEl.addEventListener('pointercancel', end);
})();

// --------------------- YouTube API ---------------------
function loadYouTubeApi() {
  if (state.ytApiPromise) return state.ytApiPromise;

  state.ytApiPromise = new Promise((resolve, reject) => {
    if (window.YT?.Player) return resolve(window.YT);

    const existing = document.querySelector('script[data-yt-api="1"]');
    if (existing) {
      const wait = () => (window.YT?.Player ? resolve(window.YT) : setTimeout(wait, 50));
      wait();
      return;
    }

    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    tag.async = true;
    tag.dataset.ytApi = '1';
    tag.onerror = () => reject(new Error('Failed to load YouTube API'));
    document.head.appendChild(tag);

    window.onYouTubeIframeAPIReady = () => resolve(window.YT);
  });

  return state.ytApiPromise;
}

async function mountYouTubePlayer(stream, mountEl) {
  const YT = await loadYouTubeApi();
  return new Promise((resolve) => {
    const player = new YT.Player(mountEl, {
      videoId: stream.youtubeId,
      playerVars: {
        playsinline: 1,
        controls: 0,
        rel: 0,
        modestbranding: 1,
        autoplay: 0,              // IMPORTANT: avoid autoplay
        origin: window.location.origin,
      },
      events: {
        onReady: () => {
          try { stream.muted ? player.mute() : player.unMute(); } catch {}
          resolve(player);
        },
      },
    });
  });
}

// --------------------- render tiles ---------------------
function createTile(stream) {
  const tile = document.createElement('div');
  tile.className = 'tile';
  tile.dataset.key = stream.key;

  const host = document.createElement('div');
  host.className = 'player-host';
  tile.appendChild(host);

  if (stream.provider === 'youtube') {
    const mount = document.createElement('div');
    mount.style.width = '100%';
    mount.style.height = '100%';
    host.appendChild(mount);

    mountYouTubePlayer(stream, mount).then((player) => {
      stream.ytPlayer = player;
      try { stream.muted ? player.mute() : player.unMute(); } catch {}
    }).catch(() => {});
  } else {
    const iframe = document.createElement('iframe');
    iframe.src = buildEmbedUrl(stream);
    iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    iframe.allowFullscreen = true;
    iframe.referrerPolicy = 'origin-when-cross-origin';
    host.appendChild(iframe);
  }

  const hit = document.createElement('div');
  hit.className = 'tile-hit';
  tile.appendChild(hit);
  bindEditInteractions(hit, tile);

  return tile;
}

function renderGrid() {
  gridEl.innerHTML = '';
  for (const s of state.streams) gridEl.appendChild(createTile(s));
  updateSelectionUi();
}

function updateTileAudio(stream) {
  if (stream.provider === 'youtube') {
    const p = stream.ytPlayer;
    if (p) { try { stream.muted ? p.mute() : p.unMute(); } catch {} }
    return;
  }
  const tile = findTileEl(stream.key);
  const iframe = tile?.querySelector('iframe');
  if (iframe) iframe.src = buildEmbedUrl(stream); // reload best-effort
}

// --------------------- edit mode + dock ---------------------
function setEditMode(on) {
  state.editMode = on;
  document.body.classList.toggle('edit-mode', on);

  if (!on) {
    state.selectedKey = null;
    state.reorderMode = false;
  }

  updateSelectionUi();
  updateDockState();
}

function updateSelectionUi() {
  gridEl.querySelectorAll('.tile.selected').forEach(el => el.classList.remove('selected'));
  if (state.selectedKey) findTileEl(state.selectedKey)?.classList.add('selected');
}

function setSelected(key) {
  state.selectedKey = key;
  updateSelectionUi();
  updateDockState();
}

function volumeSvg(muted) {
  return muted
    ? `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
         <path fill="currentColor" d="M3 10v4a1 1 0 0 0 1 1h3l4 3a1 1 0 0 0 1.6-.8V6.8A1 1 0 0 0 11 6l-4 3H4a1 1 0 0 0-1 1zm18.3.3a1 1 0 0 0-1.4 0L18 12.2l-1.9-1.9a1 1 0 1 0-1.4 1.4l1.9 1.9-1.9 1.9a1 1 0 1 0 1.4 1.4l1.9-1.9 1.9 1.9a1 1 0 1 0 1.4-1.4L19.4 13.6l1.9-1.9a1 1 0 0 0 0-1.4z"/>
       </svg>`
    : `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
         <path fill="currentColor" d="M3 10v4a1 1 0 0 0 1 1h3l4 3a1 1 0 0 0 1.6-.8V6.8A1 1 0 0 0 11 6l-4 3H4a1 1 0 0 0-1 1zm14.5 2a3.5 3.5 0 0 0-2-3.15v6.3A3.5 3.5 0 0 0 17.5 12z"/>
       </svg>`;
}

function updateDockState() {
  const hasSel = !!state.selectedKey;
  volumeBtn.disabled = !hasSel;
  moveBtn.disabled = !hasSel;
  trashBtn.disabled = !hasSel;

  moveBtn.classList.toggle('active', !!state.reorderMode);

  const s = hasSel ? findStream(state.selectedKey) : null;
  volumeIcon.innerHTML = volumeSvg(s ? !!s.muted : true);
}

function toggleSelectedVolume() {
  if (!state.selectedKey) return;
  const sel = findStream(state.selectedKey);
  if (!sel) return;

  // Solo-audio toggle:
  // If selected muted -> make it the only unmuted
  // If selected unmuted -> mute it (result: all muted)
  if (sel.muted) {
    state.audioKey = sel.key;
    for (const s of state.streams) {
      s.muted = (s.key !== state.audioKey);
      updateTileAudio(s);
    }
  } else {
    state.audioKey = null;
    sel.muted = true;
    updateTileAudio(sel);
  }

  updateDockState();
}

function toggleReorderMode() {
  if (!state.selectedKey) return;
  state.reorderMode = !state.reorderMode;
  updateDockState();
}

function removeSelected() {
  const key = state.selectedKey;
  if (!key) return;

  const idx = state.streams.findIndex(s => s.key === key);
  if (idx === -1) return;

  const [removed] = state.streams.splice(idx, 1);
  if (removed.provider === 'youtube' && removed.ytPlayer) {
    try { removed.ytPlayer.destroy(); } catch {}
    removed.ytPlayer = null;
  }

  findTileEl(key)?.remove();
  if (state.audioKey === key) state.audioKey = null;

  state.selectedKey = null;
  state.reorderMode = false;

  updateSelectionUi();
  updateDockState();
}

volumeBtn.addEventListener('click', toggleSelectedVolume);
moveBtn.addEventListener('click', toggleReorderMode);
trashBtn.addEventListener('click', removeSelected);

doneBtn.addEventListener('click', () => {
  setEditMode(false);
});

// Enter edit mode from sheet (sheet closes, dock appears)
enterEditBtn.addEventListener('click', () => {
  closeSheet();
  setEditMode(true);
});

// --------------------- drag reorder (only in reorderMode) ---------------------
function swapStreamsByKey(aKey, bKey) {
  const aIdx = state.streams.findIndex(s => s.key === aKey);
  const bIdx = state.streams.findIndex(s => s.key === bKey);
  if (aIdx === -1 || bIdx === -1 || aIdx === bIdx) return;
  const tmp = state.streams[aIdx];
  state.streams[aIdx] = state.streams[bIdx];
  state.streams[bIdx] = tmp;
}

function swapDomTiles(aKey, bKey) {
  const aNode = findTileEl(aKey);
  const bNode = findTileEl(bKey);
  if (!aNode || !bNode) return;

  const aNext = aNode.nextSibling;
  const bNext = bNode.nextSibling;

  if (bNext === aNode) gridEl.insertBefore(aNode, bNode);
  else if (aNext === bNode) gridEl.insertBefore(bNode, aNode);
  else {
    gridEl.insertBefore(aNode, bNext);
    gridEl.insertBefore(bNode, aNext);
  }
}

function bindEditInteractions(hitEl, tileEl) {
  hitEl.addEventListener('pointerdown', (e) => {
    if (!state.editMode) return;

    e.preventDefault();
    const key = tileEl.dataset.key;
    setSelected(key);

    if (!state.reorderMode) return;

    state.draggingKey = key;
    state.dragPointerId = e.pointerId;
    state.dragStartX = e.clientX;
    state.dragStartY = e.clientY;
    state.isDragging = false;
    hitEl.setPointerCapture(e.pointerId);
  });

  hitEl.addEventListener('pointermove', (e) => {
    if (!state.editMode || !state.reorderMode) return;
    if (!state.draggingKey || e.pointerId !== state.dragPointerId) return;

    const dx = e.clientX - state.dragStartX;
    const dy = e.clientY - state.dragStartY;

    const tile = findTileEl(state.draggingKey);
    if (!tile) return;

    if (!state.isDragging && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
      state.isDragging = true;
      tile.classList.add('dragging');
      tile.style.pointerEvents = 'none';
    }

    if (!state.isDragging) return;

    tile.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(1.02)`;

    const el = document.elementFromPoint(e.clientX, e.clientY);
    const overTile = el?.closest?.('.tile');
    if (!overTile) return;

    const overKey = overTile.dataset.key;
    const activeKey = state.draggingKey;
    if (!overKey || overKey === activeKey) return;

    swapStreamsByKey(activeKey, overKey);
    swapDomTiles(activeKey, overKey);
    updateSelectionUi();
  });

  const end = (e) => {
    if (!state.draggingKey || e.pointerId !== state.dragPointerId) return;

    const tile = findTileEl(state.draggingKey);
    if (tile) {
      tile.classList.remove('dragging');
      tile.style.transform = '';
      tile.style.pointerEvents = '';
    }

    state.draggingKey = null;
    state.dragPointerId = null;
    state.isDragging = false;
  };

  hitEl.addEventListener('pointerup', end);
  hitEl.addEventListener('pointercancel', end);
}

// --------------------- add stream (no startup preload) ---------------------
async function addStreamFromInput() {
  const raw = urlInput.value.trim();
  if (!raw) return;

  const s = await normalizeStreamAsync(raw);
  if (!s) return;

  state.streams.unshift(s);
  urlInput.value = '';
  gridEl.insertBefore(createTile(s), gridEl.firstChild);
}

addBtn.addEventListener('click', addStreamFromInput);
urlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addStreamFromInput();
});

// --------------------- boot ---------------------
function boot() {
  applyGridLayout();
  window.addEventListener('resize', applyGridLayout);
  window.visualViewport?.addEventListener('resize', applyGridLayout);

  setCols(2);

  // IMPORTANT: do not preload any streams
  state.streams = [];
  renderGrid();
  updateDockState();

  closeSheet();
  setEditMode(false);
}

boot();