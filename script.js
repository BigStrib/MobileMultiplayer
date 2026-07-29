// script.js - Advanced Mobile MultiView with Mute Control

"use strict";

const TWITCH_PARENT = "multiviewplayer.pages.dev";

const ALLOWED_HOSTS = [
  "youtube.com",
  "youtu.be",
  "twitch.tv",
  "clips.twitch.tv",
  "kick.com",
  "rumble.com"
];

// DOM Elements
const workspace = document.getElementById("workspace");
const welcome = document.getElementById("welcome");
const sidebar = document.getElementById("sidebar");
const backdrop = document.getElementById("backdrop");
const sidebarTab = document.getElementById("sidebar-tab");
const urlInput = document.getElementById("urlInput");
const embedInput = document.getElementById("embedInput");
const addBtn = document.getElementById("addBtn");
const addEmbedBtn = document.getElementById("addEmbedBtn");

// State
let zIndex = 100;
let activeWindow = null;
let activeDrag = null;
let dragOverlay = null;

// Create drag overlay
function createDragOverlay() {
  if (!dragOverlay) {
    dragOverlay = document.createElement("div");
    dragOverlay.id = "drag-overlay";
    document.body.appendChild(dragOverlay);
  }
  return dragOverlay;
}

function showDragOverlay() {
  createDragOverlay().classList.add("active");
}

function hideDragOverlay() {
  if (dragOverlay) {
    dragOverlay.classList.remove("active");
  }
}

// ========================
// Sidebar
// ========================

function openSidebar() {
  document.body.classList.add("sidebar-open");
}

function closeSidebar() {
  document.body.classList.remove("sidebar-open");
}

function toggleSidebar() {
  document.body.classList.toggle("sidebar-open");
}

sidebarTab.addEventListener("click", openSidebar);
backdrop.addEventListener("click", closeSidebar);

// Keyboard shortcuts
document.addEventListener("keydown", (e) => {
  if (e.shiftKey && !e.repeat) {
    toggleSidebar();
  }
  if (e.key.toLowerCase() === "h") {
    const wins = workspace.querySelectorAll(".video-window");
    wins.forEach(w => w.classList.toggle("hide-ui"));
  }
});

// ========================
// Utilities
// ========================

function normalizeHost(hostname) {
  return (hostname || "")
    .replace(/^(www\.|m\.|mobile\.)/i, "")
    .toLowerCase();
}

function isAllowedDomain(url) {
  try {
    const urlObj = new URL(url);
    const host = normalizeHost(urlObj.hostname);
    return ALLOWED_HOSTS.some(h => host.includes(normalizeHost(h)));
  } catch {
    return false;
  }
}

function safeParseURL(raw) {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

function getPathParts(urlObj) {
  return urlObj.pathname.split("/").filter(Boolean);
}

// ========================
// Advanced Mute Controller
// ========================

class MuteController {
  constructor(win) {
    this.win = win;
    this.provider = win.dataset.provider;
    this.isMuted = false;
    this.muteBtn = null;
  }

  setMuteButton(btn) {
    this.muteBtn = btn;
  }

  async mute() {
    const content = this.win.querySelector(".video-frame-container");
    if (!content) return;

    const iframe = content.querySelector("iframe");
    if (!iframe) return;

    if (this.provider === "youtube") {
      this.muteYouTube(iframe);
    } else if (this.provider.startsWith("twitch")) {
      this.muteOrUnmuteTwitch(iframe);
    } else if (this.provider === "kick") {
      this.muteKick(iframe);
    } else if (this.provider === "rumble") {
      this.muteRumble(iframe);
    }

    this.isMuted = !this.isMuted;
    this.updateMuteIcon();
  }

  muteYouTube(iframe) {
    try {
      const volume = this.isMuted ? 100 : 0;
      if (iframe.contentWindow && iframe.contentWindow.postMessage) {
        iframe.contentWindow.postMessage({
          event: "command",
          func: this.isMuted ? "unMute" : "mute",
          args: []
        }, "*");
      }
    } catch (e) {
      console.log("YouTube mute API not available");
      this.fallbackMute(iframe);
    }
  }

  muteOrUnmuteTwitch(iframe) {
    try {
      const div = iframe.parentElement;
      if (!div) return;

      // Try to find volume control in Twitch player
      const volumeControl = div.querySelector('[data-a-target="player-volume-slider"]');
      if (volumeControl) {
        const muteBtn = div.querySelector('[data-a-target="player-volume-button"]');
        if (muteBtn) {
          muteBtn.click();
          return;
        }
      }

      // Fallback: adjust opacity for visual indicator
      iframe.style.opacity = this.isMuted ? "1" : "0.5";
    } catch (e) {
      console.log("Twitch mute control error:", e);
      this.fallbackMute(iframe);
    }
  }

  muteKick(iframe) {
    try {
      const div = iframe.parentElement;
      if (!div) return;

      // Try to find volume control in Kick player
      const volumeBtn = div.querySelector('[aria-label*="mute"], [aria-label*="Mute"], [data-testid*="volume"]');
      if (volumeBtn) {
        volumeBtn.click();
        return;
      }

      // Fallback: opacity
      iframe.style.opacity = this.isMuted ? "1" : "0.5";
    } catch (e) {
      console.log("Kick mute control error:", e);
      this.fallbackMute(iframe);
    }
  }

  muteRumble(iframe) {
    try {
      const div = iframe.parentElement;
      if (!div) return;

      // Try to find mute button in Rumble player
      const muteBtn = div.querySelector('[data-video-mute], [aria-label*="Mute"], button[title*="Mute"]');
      if (muteBtn) {
        muteBtn.click();
        return;
      }

      // Fallback: opacity
      iframe.style.opacity = this.isMuted ? "1" : "0.5";
    } catch (e) {
      console.log("Rumble mute control error:", e);
      this.fallbackMute(iframe);
    }
  }

  fallbackMute(iframe) {
    // Visual mute by reducing opacity
    iframe.style.opacity = this.isMuted ? "1" : "0.4";
    iframe.style.transition = "opacity 0.2s ease";
  }

  updateMuteIcon() {
    if (!this.muteBtn) return;

    if (this.isMuted) {
      this.muteBtn.innerHTML = "🔇";
      this.muteBtn.title = "Unmute";
    } else {
      this.muteBtn.innerHTML = "🔊";
      this.muteBtn.title = "Mute";
    }
  }
}

// ========================
// Provider Detection
// ========================

function getProviderInfo(urlObj) {
  const host = normalizeHost(urlObj.hostname);
  const parts = getPathParts(urlObj);

  // YouTube
  if (host === "youtu.be") {
    const id = parts[0];
    return { provider: "youtube", id, title: "YouTube" };
  }

  if (host.includes("youtube.com")) {
    const v = urlObj.searchParams.get("v");
    if (v) return { provider: "youtube", id: v, title: "YouTube" };

    const first = parts[0];
    const second = parts[1];

    if (["shorts", "embed", "live"].includes(first) && second) {
      return { provider: "youtube", id: second, title: "YouTube" };
    }

    if (first && /^[A-Za-z0-9_-]{6,}$/.test(first)) {
      return { provider: "youtube", id: first, title: "YouTube" };
    }
  }

  // Twitch
  if (host.includes("twitch.tv")) {
    // Clip
    if (host === "clips.twitch.tv") {
      const slug = parts[0];
      if (slug) return { provider: "twitch-clip", slug, title: "Twitch Clip" };
    }

    if (parts[0] === "clip" && parts[1]) {
      return { provider: "twitch-clip", slug: parts[1], title: "Twitch Clip" };
    }

    const clipParam = urlObj.searchParams.get("clip");
    if (clipParam) {
      return { provider: "twitch-clip", slug: clipParam, title: "Twitch Clip" };
    }

    // VOD
    if (parts[0] === "videos" && parts[1]) {
      return { provider: "twitch-vod", videoId: parts[1], title: "Twitch VOD" };
    }

    // Live channel
    const channel = parts[0];
    if (channel) {
      return { provider: "twitch-live", channel, title: "Twitch" };
    }
  }

  // Kick
  if (host.includes("kick.com")) {
    const channel = parts[0];
    if (channel) {
      return { provider: "kick", channel, title: "Kick" };
    }
  }

  // Rumble
  if (host.includes("rumble.com")) {
    if (parts[0] && parts[0].startsWith("v")) {
      return { provider: "rumble", videoId: parts[0], title: "Rumble" };
    }

    if (parts[0] === "embed" && parts[1]) {
      return { provider: "rumble", videoId: parts[1], title: "Rumble" };
    }

    if (parts[0]) {
      return { provider: "rumble", videoId: parts[0], title: "Rumble" };
    }
  }

  return null;
}

// ========================
// Embed Builders
// ========================

function buildEmbedUrl(info) {
  if (!info) return null;

  const { provider, id, slug, videoId, channel } = info;

  switch (provider) {
    case "youtube":
      return `https://www.youtube.com/embed/${id}?rel=0&modestbranding=1&enablejsapi=1`;

    case "twitch-live":
      return `https://player.twitch.tv/?channel=${encodeURIComponent(channel)}&parent=${TWITCH_PARENT}`;

    case "twitch-vod":
      return `https://player.twitch.tv/?video=${encodeURIComponent(videoId)}&parent=${TWITCH_PARENT}`;

    case "twitch-clip":
      return `https://clips.twitch.tv/embed?clip=${encodeURIComponent(slug)}&parent=${TWITCH_PARENT}`;

    case "kick":
      return `https://player.kick.com/${encodeURIComponent(channel)}`;

    case "rumble":
      return `https://rumble.com/embed/${encodeURIComponent(videoId)}/`;

    default:
      return null;
  }
}

// ========================
// Window Creation
// ========================

function createVideoWindow(url, info) {
  if (!welcome.classList.contains("hidden")) {
    welcome.classList.add("hidden");
  }

  const win = document.createElement("div");
  win.className = "video-window";

  const initialWidth = Math.min(window.innerWidth - 20, 500);
  const initialHeight = initialWidth * (9 / 16);

  win.style.width = initialWidth + "px";
  win.style.height = initialHeight + "px";
  win.style.left = "10px";
  win.style.top = "10px";
  win.style.zIndex = zIndex++;

  win.dataset.url = url;
  win.dataset.provider = info.provider;
  win.dataset.aspectRatio = 9 / 16;

  // Toolbar
  const toolbar = document.createElement("div");
  toolbar.className = "video-toolbar";

  const toolbarLeft = document.createElement("div");
  toolbarLeft.className = "toolbar-group toolbar-left";

  const moveBtn = document.createElement("button");
  moveBtn.className = "move-handle";
  moveBtn.innerHTML = "⠿";
  moveBtn.title = "Move";

  const copyBtn = document.createElement("button");
  copyBtn.className = "toolbar-btn copy-btn";
  copyBtn.innerHTML = "⧉";
  copyBtn.title = "Copy URL";

  const muteBtn = document.createElement("button");
  muteBtn.className = "toolbar-btn mute-btn";
  muteBtn.innerHTML = "🔊";
  muteBtn.title = "Mute";

  toolbarLeft.appendChild(moveBtn);
  toolbarLeft.appendChild(copyBtn);
  toolbarLeft.appendChild(muteBtn);

  const toolbarCenter = document.createElement("div");
  toolbarCenter.className = "toolbar-group toolbar-center";

  const title = document.createElement("span");
  title.className = "window-title";
  title.textContent = info.title;

  const sizeInd = document.createElement("span");
  sizeInd.className = "size-indicator";
  sizeInd.textContent = Math.round(initialWidth) + " × " + Math.round(initialHeight);

  toolbarCenter.appendChild(title);
  toolbarCenter.appendChild(sizeInd);

  const toolbarRight = document.createElement("div");
  toolbarRight.className = "toolbar-group toolbar-right";

  const refreshBtn = document.createElement("button");
  refreshBtn.className = "toolbar-btn refresh-btn";
  refreshBtn.innerHTML = "⟳";
  refreshBtn.title = "Refresh";

  const closeBtn = document.createElement("button");
  closeBtn.className = "close-btn";
  closeBtn.innerHTML = "✕";
  closeBtn.title = "Close";

  toolbarRight.appendChild(refreshBtn);
  toolbarRight.appendChild(closeBtn);

  toolbar.appendChild(toolbarLeft);
  toolbar.appendChild(toolbarCenter);
  toolbar.appendChild(toolbarRight);

  // Resize handles
  const handles = ["nw", "ne", "sw", "se"];
  handles.forEach(corner => {
    const h = document.createElement("div");
    h.className = `resize-handle resize-${corner}`;
    h.dataset.corner = corner;
    win.appendChild(h);
  });

  // Content
  const content = document.createElement("div");
  content.className = "video-content";

  const frameContainer = document.createElement("div");
  frameContainer.className = "video-frame-container";

  const iframe = document.createElement("iframe");
  iframe.src = buildEmbedUrl(info);
  iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen";
  iframe.allowFullscreen = true;

  frameContainer.appendChild(iframe);

  const bottomControls = document.createElement("div");
  bottomControls.className = "video-controls-bottom";

  const volumeControl = document.createElement("button");
  volumeControl.className = "video-control-btn";
  volumeControl.innerHTML = "🔊";
  volumeControl.title = "Mute/Unmute";

  bottomControls.appendChild(volumeControl);
  content.appendChild(frameContainer);
  content.appendChild(bottomControls);

  // Confirm overlay
  const overlay = document.createElement("div");
  overlay.className = "confirm-overlay";

  const confirmBox = document.createElement("div");
  confirmBox.className = "confirm-box";

  const confirmText = document.createElement("p");
  confirmText.textContent = "Close this stream?";

  const confirmButtons = document.createElement("div");
  confirmButtons.className = "confirm-buttons";

  const confirmNo = document.createElement("button");
  confirmNo.className = "confirm-no";
  confirmNo.textContent = "No";

  const confirmYes = document.createElement("button");
  confirmYes.className = "confirm-yes";
  confirmYes.textContent = "Yes";

  confirmButtons.appendChild(confirmNo);
  confirmButtons.appendChild(confirmYes);

  confirmBox.appendChild(confirmText);
  confirmBox.appendChild(confirmButtons);
  overlay.appendChild(confirmBox);

  content.appendChild(overlay);

  // Assemble
  win.appendChild(toolbar);
  win.appendChild(content);
  workspace.appendChild(win);

  // Create mute controller
  const muteController = new MuteController(win);
  muteController.setMuteButton(muteBtn);

  // Events
  attachWindowEvents(win, moveBtn, copyBtn, muteBtn, refreshBtn, closeBtn, confirmNo, confirmYes, overlay, sizeInd, muteController, volumeControl);

  closeSidebar();
}

function attachWindowEvents(win, moveBtn, copyBtn, muteBtn, refreshBtn, closeBtn, confirmNo, confirmYes, overlay, sizeInd, muteController, volumeControl) {
  let isDragging = false;
  let isResizing = false;
  let startX, startY, startLeft, startTop, startWidth, startHeight, corner;

  // ===== MOVE (MOUSE & TOUCH) =====
  moveBtn.addEventListener("mousedown", startDrag);
  moveBtn.addEventListener("touchstart", startDrag);

  function startDrag(e) {
    isDragging = true;
    activeWindow = win;
    win.style.zIndex = zIndex++;
    win.classList.add("moving");

    const rect = win.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    startX = clientX - rect.left;
    startY = clientY - rect.top;
    startLeft = rect.left;
    startTop = rect.top;

    document.body.classList.add("dragging");
    showDragOverlay();

    if (e.touches) {
      e.preventDefault();
    } else {
      e.preventDefault();
    }
  }

  // ===== RESIZE (MOUSE & TOUCH) =====
  const handles = win.querySelectorAll(".resize-handle");
  handles.forEach(handle => {
    handle.addEventListener("mousedown", startResize);
    handle.addEventListener("touchstart", startResize);
  });

  function startResize(e) {
    isResizing = true;
    activeWindow = win;
    corner = e.currentTarget.dataset.corner;
    win.style.zIndex = zIndex++;
    win.classList.add("resizing");

    const rect = win.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    startX = clientX;
    startY = clientY;
    startLeft = rect.left;
    startTop = rect.top;
    startWidth = rect.width;
    startHeight = rect.height;

    document.body.classList.add("dragging");
    showDragOverlay();

    if (e.touches) {
      e.preventDefault();
    } else {
      e.preventDefault();
    }
  }

  // ===== DRAG & RESIZE MOVEMENTS =====
  document.addEventListener("mousemove", handleMove);
  document.addEventListener("touchmove", handleMove);

  function handleMove(e) {
    if (!isDragging && !isResizing) return;

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    if (isDragging && activeWindow === win) {
      let newLeft = clientX - startX;
      let newTop = clientY - startY;

      const maxLeft = window.innerWidth - win.offsetWidth;
      const maxTop = window.innerHeight - win.offsetHeight;

      newLeft = Math.max(0, Math.min(newLeft, maxLeft));
      newTop = Math.max(0, Math.min(newTop, maxTop));

      win.style.left = newLeft + "px";
      win.style.top = newTop + "px";
    }

    if (isResizing && activeWindow === win) {
      const aspect = 9 / 16;
      const dx = clientX - startX;
      const dy = clientY - startY;

      let newWidth = startWidth;
      let newHeight = startHeight;
      let newLeft = startLeft;
      let newTop = startTop;

      const minWidth = 240;

      switch (corner) {
        case "se":
          newWidth = Math.max(minWidth, startWidth + dx);
          newHeight = newWidth / aspect;
          break;
        case "sw":
          newWidth = Math.max(minWidth, startWidth - dx);
          newHeight = newWidth / aspect;
          newLeft = startLeft + startWidth - newWidth;
          break;
        case "ne":
          newWidth = Math.max(minWidth, startWidth + dx);
          newHeight = newWidth / aspect;
          newTop = startTop + startHeight - newHeight;
          break;
        case "nw":
          newWidth = Math.max(minWidth, startWidth - dx);
          newHeight = newWidth / aspect;
          newLeft = startLeft + startWidth - newWidth;
          newTop = startTop + startHeight - newHeight;
          break;
      }

      newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - newWidth));
      newTop = Math.max(0, Math.min(newTop, window.innerHeight - newHeight));

      win.style.left = newLeft + "px";
      win.style.top = newTop + "px";
      win.style.width = newWidth + "px";
      win.style.height = newHeight + "px";

      if (sizeInd) {
        sizeInd.textContent = Math.round(newWidth) + " × " + Math.round(newHeight);
      }
    }
  }

  // ===== END DRAG/RESIZE =====
  document.addEventListener("mouseup", endAction);
  document.addEventListener("touchend", endAction);

  function endAction() {
    isDragging = false;
    isResizing = false;
    activeWindow = null;
    win.classList.remove("moving", "resizing");
    document.body.classList.remove("dragging");
    hideDragOverlay();
  }

  // ===== COPY URL =====
  copyBtn.addEventListener("click", () => {
    const url = win.dataset.url;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => {
        copyBtn.innerHTML = "✓";
        setTimeout(() => {
          copyBtn.innerHTML = "⧉";
        }, 1000);
      });
    }
  });

  // ===== MUTE (Advanced Multi-Provider) =====
  muteBtn.addEventListener("click", () => {
    muteController.mute();
  });

  volumeControl.addEventListener("click", () => {
    muteController.mute();
  });

  // ===== REFRESH =====
  refreshBtn.addEventListener("click", () => {
    const frameContainer = win.querySelector(".video-frame-container");
    if (frameContainer) {
      const iframe = frameContainer.querySelector("iframe");
      if (iframe) {
        const src = iframe.src;
        iframe.src = "";
        setTimeout(() => {
          iframe.src = src;
        }, 100);
      }
    }
  });

  // ===== CLOSE =====
  closeBtn.addEventListener("click", () => {
    overlay.classList.add("show");
  });

  confirmNo.addEventListener("click", () => {
    overlay.classList.remove("show");
  });

  confirmYes.addEventListener("click", () => {
    win.remove();
    if (workspace.querySelectorAll(".video-window").length === 0) {
      welcome.classList.remove("hidden");
    }
  });

  // ===== BRING TO FRONT =====
  win.addEventListener("click", () => {
    if (activeWindow !== win && !isDragging && !isResizing) {
      win.style.zIndex = zIndex++;
    }
  });
}

// ========================
// Input Handling
// ========================

addBtn.addEventListener("click", () => {
  const raw = urlInput.value.trim();

  if (!raw) {
    alert("❌ Please enter a URL");
    return;
  }

  if (!isAllowedDomain(raw)) {
    alert("❌ Only YouTube, Twitch, Kick, and Rumble are supported");
    return;
  }

  const urlObj = safeParseURL(raw);
  if (!urlObj) {
    alert("❌ Invalid URL");
    return;
  }

  const info = getProviderInfo(urlObj);
  if (!info) {
    alert("❌ Could not parse stream URL");
    return;
  }

  createVideoWindow(raw, info);
  urlInput.value = "";
});

urlInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    addBtn.click();
  }
});

urlInput.addEventListener("paste", (e) => {
  const pasted = (e.clipboardData || window.clipboardData)?.getData("text") || "";
  const value = pasted.trim();

  if (!value || urlInput.value.trim()) return;

  e.preventDefault();

  if (!isAllowedDomain(value)) {
    alert("❌ Only YouTube, Twitch, Kick, and Rumble are supported");
    return;
  }

  const urlObj = safeParseURL(value);
  if (!urlObj) {
    alert("❌ Invalid URL");
    return;
  }

  const info = getProviderInfo(urlObj);
  if (!info) {
    alert("❌ Could not parse stream URL");
    return;
  }

  createVideoWindow(value, info);
  urlInput.value = "";
});

addEmbedBtn.addEventListener("click", () => {
  const html = embedInput.value.trim();
  if (!html) {
    alert("❌ Please paste embed code");
    return;
  }

  if (!html.includes("<iframe")) {
    alert("❌ No iframe found in embed code");
    return;
  }

  const temp = document.createElement("div");
  temp.innerHTML = html;
  const iframe = temp.querySelector("iframe");

  if (!iframe) {
    alert("❌ No iframe found");
    return;
  }

  const src = iframe.getAttribute("src") || "";
  if (!src) {
    alert("❌ iframe has no src");
    return;
  }

  createEmbedWindow(html, src);
  embedInput.value = "";
});

function createEmbedWindow(html, src) {
  if (!welcome.classList.contains("hidden")) {
    welcome.classList.add("hidden");
  }

  const win = document.createElement("div");
  win.className = "video-window";

  const initialWidth = Math.min(window.innerWidth - 20, 500);
  const initialHeight = initialWidth * (9 / 16);

  win.style.width = initialWidth + "px";
  win.style.height = initialHeight + "px";
  win.style.left = "10px";
  win.style.top = "10px";
  win.style.zIndex = zIndex++;

  win.dataset.url = src;
  win.dataset.provider = "embed";

  // Toolbar
  const toolbar = document.createElement("div");
  toolbar.className = "video-toolbar";

  const toolbarLeft = document.createElement("div");
  toolbarLeft.className = "toolbar-group toolbar-left";

  const moveBtn = document.createElement("button");
  moveBtn.className = "move-handle";
  moveBtn.innerHTML = "⠿";
  moveBtn.title = "Move";

  const copyBtn = document.createElement("button");
  copyBtn.className = "toolbar-btn copy-btn";
  copyBtn.innerHTML = "⧉";
  copyBtn.title = "Copy embed";

  toolbarLeft.appendChild(moveBtn);
  toolbarLeft.appendChild(copyBtn);

  const toolbarCenter = document.createElement("div");
  toolbarCenter.className = "toolbar-group toolbar-center";

  const title = document.createElement("span");
  title.className = "window-title";
  title.textContent = "Embed";

  const sizeInd = document.createElement("span");
  sizeInd.className = "size-indicator";
  sizeInd.textContent = Math.round(initialWidth) + " × " + Math.round(initialHeight);

  toolbarCenter.appendChild(title);
  toolbarCenter.appendChild(sizeInd);

  const toolbarRight = document.createElement("div");
  toolbarRight.className = "toolbar-group toolbar-right";

  const refreshBtn = document.createElement("button");
  refreshBtn.className = "toolbar-btn refresh-btn";
  refreshBtn.innerHTML = "⟳";
  refreshBtn.title = "Refresh";

  const closeBtn = document.createElement("button");
  closeBtn.className = "close-btn";
  closeBtn.innerHTML = "✕";
  closeBtn.title = "Close";

  toolbarRight.appendChild(refreshBtn);
  toolbarRight.appendChild(closeBtn);

  toolbar.appendChild(toolbarLeft);
  toolbar.appendChild(toolbarCenter);
  toolbar.appendChild(toolbarRight);

  // Resize handles
  const handles = ["nw", "ne", "sw", "se"];
  handles.forEach(corner => {
    const h = document.createElement("div");
    h.className = `resize-handle resize-${corner}`;
    h.dataset.corner = corner;
    win.appendChild(h);
  });

  // Content
  const content = document.createElement("div");
  content.className = "video-content";

  const frameContainer = document.createElement("div");
  frameContainer.className = "video-frame-container";
  frameContainer.innerHTML = html;

  content.appendChild(frameContainer);

  // Confirm overlay
  const overlay = document.createElement("div");
  overlay.className = "confirm-overlay";

  const confirmBox = document.createElement("div");
  confirmBox.className = "confirm-box";

  const confirmText = document.createElement("p");
  confirmText.textContent = "Close this embed?";

  const confirmButtons = document.createElement("div");
  confirmButtons.className = "confirm-buttons";

  const confirmNo = document.createElement("button");
  confirmNo.className = "confirm-no";
  confirmNo.textContent = "No";

  const confirmYes = document.createElement("button");
  confirmYes.className = "confirm-yes";
  confirmYes.textContent = "Yes";

  confirmButtons.appendChild(confirmNo);
  confirmButtons.appendChild(confirmYes);

  confirmBox.appendChild(confirmText);
  confirmBox.appendChild(confirmButtons);
  overlay.appendChild(confirmBox);

  content.appendChild(overlay);

  // Assemble
  win.appendChild(toolbar);
  win.appendChild(content);
  workspace.appendChild(win);

  // Simple mute controller for embed (limited functionality)
  const embedMuteController = new MuteController(win);

  // Events
  attachWindowEvents(win, moveBtn, copyBtn, null, refreshBtn, closeBtn, confirmNo, confirmYes, overlay, sizeInd, embedMuteController, null);

  closeSidebar();
}

embedInput.addEventListener("keydown", (e) => {
  if (e.ctrlKey && e.key === "Enter") {
    e.preventDefault();
    addEmbedBtn.click();
  }
});

// Initialize
window.addEventListener("load", () => {
  welcome.classList.remove("hidden");
});