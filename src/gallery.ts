import * as THREE from "three";

export function init2DGallery(renderer: THREE.WebGLRenderer) {
  // 1. Create stylesheet dynamically
  const style = document.createElement("style");
  style.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700&family=Share+Tech+Mono&display=swap');

    :root {
      --bg-glass: rgba(10, 15, 30, 0.82);
      --border-cyan: rgba(0, 255, 240, 0.35);
      --neon-cyan: #00fff0;
      --neon-magenta: #ff007f;
      --text-glow: 0 0 8px rgba(0, 255, 240, 0.4);
    }

    #jugnu-gallery-toggle {
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: var(--bg-glass);
      border: 1px solid var(--border-cyan);
      border-radius: 50px;
      padding: 12px 24px;
      color: #ffffff;
      font-family: 'Outfit', sans-serif;
      font-weight: 600;
      font-size: 15px;
      cursor: pointer;
      z-index: 9999;
      display: flex;
      align-items: center;
      gap: 10px;
      backdrop-filter: blur(12px);
      box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.5), inset 0 0 10px rgba(0, 255, 240, 0.1);
      transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
    }

    #jugnu-gallery-toggle:hover {
      border-color: var(--neon-cyan);
      box-shadow: 0 0 20px rgba(0, 255, 240, 0.4), inset 0 0 15px rgba(0, 255, 240, 0.2);
      transform: translateY(-2px);
    }

    #jugnu-gallery-toggle .badge {
      background: var(--neon-cyan);
      color: #0f172a;
      border-radius: 12px;
      padding: 2px 8px;
      font-size: 12px;
      font-family: 'Share Tech Mono', monospace;
      font-weight: 700;
      box-shadow: 0 0 8px var(--neon-cyan);
    }

    #jugnu-gallery-sidebar {
      position: fixed;
      top: 0;
      right: -420px;
      width: 380px;
      height: 100vh;
      background: var(--bg-glass);
      border-left: 1px solid var(--border-cyan);
      backdrop-filter: blur(20px);
      box-shadow: -10px 0 30px rgba(0, 0, 0, 0.6);
      z-index: 9998;
      font-family: 'Outfit', sans-serif;
      color: #ffffff;
      display: flex;
      flex-direction: column;
      transition: right 0.4s cubic-bezier(0.25, 0.8, 0.25, 1);
    }

    #jugnu-gallery-sidebar.open {
      right: 0;
    }

    .sidebar-header {
      padding: 24px;
      border-bottom: 1px solid rgba(0, 255, 240, 0.15);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .sidebar-header h2 {
      margin: 0;
      font-size: 20px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      color: var(--neon-cyan);
      text-shadow: var(--text-glow);
    }

    .sidebar-header .close-btn {
      background: transparent;
      border: none;
      color: #94a3b8;
      font-size: 22px;
      cursor: pointer;
      transition: color 0.2s;
    }

    .sidebar-header .close-btn:hover {
      color: var(--neon-magenta);
    }

    .sidebar-actions {
      padding: 12px 24px;
      display: flex;
      gap: 12px;
      border-bottom: 1px solid rgba(0, 255, 240, 0.1);
    }

    .gallery-btn {
      flex: 1;
      background: rgba(15, 23, 42, 0.6);
      border: 1px solid rgba(0, 255, 240, 0.25);
      color: #ffffff;
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      transition: all 0.2s;
    }

    .gallery-btn:hover:not(:disabled) {
      border-color: var(--neon-cyan);
      box-shadow: inset 0 0 8px rgba(0, 255, 240, 0.1);
      color: var(--neon-cyan);
    }

    .gallery-btn.danger:hover:not(:disabled) {
      border-color: var(--neon-magenta);
      box-shadow: inset 0 0 8px rgba(255, 0, 127, 0.1);
      color: var(--neon-magenta);
    }

    .gallery-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .gallery-list {
      flex: 1;
      overflow-y: auto;
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    /* Scrollbar Styling */
    .gallery-list::-webkit-scrollbar {
      width: 6px;
    }
    .gallery-list::-webkit-scrollbar-track {
      background: transparent;
    }
    .gallery-list::-webkit-scrollbar-thumb {
      background: rgba(0, 255, 240, 0.25);
      border-radius: 10px;
    }
    .gallery-list::-webkit-scrollbar-thumb:hover {
      background: var(--neon-cyan);
    }

    .moment-card {
      background: rgba(15, 23, 42, 0.4);
      border: 1px solid rgba(0, 255, 240, 0.15);
      border-radius: 10px;
      padding: 10px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      transition: all 0.3s ease;
    }

    .moment-card:hover {
      border-color: var(--neon-cyan);
      box-shadow: 0 4px 20px rgba(0, 255, 240, 0.15);
      transform: translateY(-2px);
    }

    .moment-preview-wrapper {
      position: relative;
      width: 100%;
      padding-top: 75%; /* 4:3 Aspect Ratio */
      border-radius: 6px;
      overflow: hidden;
      cursor: pointer;
    }

    .moment-preview-img {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      transition: transform 0.5s ease;
    }

    .moment-card:hover .moment-preview-img {
      transform: scale(1.08);
    }

    .moment-card-meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 4px;
    }

    .moment-time {
      font-size: 11px;
      color: #94a3b8;
      font-family: 'Share Tech Mono', monospace;
    }

    .moment-card-actions {
      display: flex;
      gap: 8px;
    }

    .action-icon-btn {
      background: transparent;
      border: 1px solid rgba(255, 255, 255, 0.15);
      color: #94a3b8;
      width: 28px;
      height: 28px;
      border-radius: 6px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
    }

    .action-icon-btn:hover {
      color: var(--neon-cyan);
      border-color: var(--neon-cyan);
      box-shadow: 0 0 8px rgba(0, 255, 240, 0.2);
    }

    .action-icon-btn.danger:hover {
      color: var(--neon-magenta);
      border-color: var(--neon-magenta);
      box-shadow: 0 0 8px rgba(255, 0, 127, 0.2);
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      height: 60%;
      color: #64748b;
      gap: 16px;
    }

    .empty-state svg {
      color: rgba(0, 255, 240, 0.25);
      animation: pulse 2s infinite alternate;
    }

    @keyframes pulse {
      0% { transform: scale(1); opacity: 0.7; }
      100% { transform: scale(1.08); opacity: 0.9; }
    }

    .empty-state p {
      margin: 0;
      font-size: 14px;
      line-height: 1.6;
      max-width: 240px;
    }

    /* Fullscreen Lightbox */
    #jugnu-gallery-lightbox {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(5, 5, 12, 0.95);
      z-index: 100000;
      display: none;
      align-items: center;
      justify-content: center;
      backdrop-filter: blur(10px);
    }

    #jugnu-gallery-lightbox.open {
      display: flex;
    }

    .lightbox-content {
      position: relative;
      max-width: 90%;
      max-height: 80%;
      border: 1px solid var(--border-cyan);
      border-radius: 12px;
      box-shadow: 0 0 50px rgba(0, 255, 240, 0.25);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      background: #090d16;
    }

    .lightbox-img {
      max-width: 100%;
      max-height: 70vh;
      object-fit: contain;
    }

    .lightbox-footer {
      padding: 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: rgba(10, 15, 30, 0.8);
      border-top: 1px solid rgba(0, 255, 240, 0.15);
    }

    .lightbox-close {
      position: absolute;
      top: 16px;
      right: 16px;
      background: rgba(15, 23, 42, 0.6);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: #ffffff;
      width: 36px;
      height: 36px;
      border-radius: 50%;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      transition: all 0.2s;
    }

    .lightbox-close:hover {
      border-color: var(--neon-magenta);
      color: var(--neon-magenta);
    }
  `;
  document.head.appendChild(style);

  // 2. Create DOM Elements
  const container = document.createElement("div");
  container.id = "jugnu-gallery-root";
  container.innerHTML = `
    <button id="jugnu-gallery-toggle">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
        <circle cx="12" cy="13" r="4"></circle>
      </svg>
      Gallery <span class="badge">0</span>
    </button>

    <div id="jugnu-gallery-sidebar">
      <div class="sidebar-header">
        <h2>Captured Moments</h2>
        <button class="close-btn">&times;</button>
      </div>
      <div class="sidebar-actions">
        <button class="gallery-btn download-all-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          Save All
        </button>
        <button class="gallery-btn danger clear-all-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
          Clear All
        </button>
      </div>
      <div class="gallery-list"></div>
    </div>

    <div id="jugnu-gallery-lightbox">
      <div class="lightbox-content">
        <button class="lightbox-close">&times;</button>
        <img class="lightbox-img" src="" alt="Moment Fullscreen">
        <div class="lightbox-footer">
          <span class="moment-time lightbox-time"></span>
          <button class="gallery-btn lightbox-download-btn">Save Image</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(container);

  // 3. Cache DOM References
  const toggleBtn = document.getElementById("jugnu-gallery-toggle")!;
  const badge = toggleBtn.querySelector(".badge")!;
  const sidebar = document.getElementById("jugnu-gallery-sidebar")!;
  const closeBtn = sidebar.querySelector(".close-btn")!;
  const galleryList = sidebar.querySelector(".gallery-list")!;
  const clearAllBtn = sidebar.querySelector(".clear-all-btn") as HTMLButtonElement;
  const downloadAllBtn = sidebar.querySelector(".download-all-btn") as HTMLButtonElement;
  
  const lightbox = document.getElementById("jugnu-gallery-lightbox")!;
  const lightboxClose = lightbox.querySelector(".lightbox-close")!;
  const lightboxImg = lightbox.querySelector(".lightbox-img") as HTMLImageElement;
  const lightboxTime = lightbox.querySelector(".lightbox-time")!;
  const lightboxDownloadBtn = lightbox.querySelector(".lightbox-download-btn") as HTMLButtonElement;

  let currentActiveMoment: any = null;

  // 4. Load & Render Gallery List
  function updateGalleryList() {
    const moments = JSON.parse(localStorage.getItem("jugnu_moments") || "[]");
    badge.textContent = moments.length.toString();

    if (moments.length === 0) {
      galleryList.innerHTML = `
        <div class="empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
            <circle cx="12" cy="13" r="4"></circle>
          </svg>
          <p>No moments captured yet.<br>Double peace sign or voice command in WebXR to take photos!</p>
        </div>
      `;
      clearAllBtn.disabled = true;
      downloadAllBtn.disabled = true;
    } else {
      clearAllBtn.disabled = false;
      downloadAllBtn.disabled = false;
      galleryList.innerHTML = "";
      
      // Show newest first
      const sortedMoments = [...moments].reverse();
      sortedMoments.forEach((moment: any) => {
        const card = document.createElement("div");
        card.className = "moment-card";
        card.innerHTML = `
          <div class="moment-preview-wrapper">
            <img class="moment-preview-img" src="${moment.dataUrl}" alt="Moment Preview">
          </div>
          <div class="moment-card-meta">
            <span class="moment-time">${moment.timestamp}</span>
            <div class="moment-card-actions">
              <button class="action-icon-btn download-btn" title="Download">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
              </button>
              <button class="action-icon-btn danger delete-btn" title="Delete">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            </div>
          </div>
        `;

        // Card events
        const preview = card.querySelector(".moment-preview-wrapper")!;
        preview.addEventListener("click", () => {
          openLightbox(moment);
        });

        const downloadBtn = card.querySelector(".download-btn")!;
        downloadBtn.addEventListener("click", () => {
          downloadImage(moment.dataUrl, `JugnuMoment_${moment.id}.png`);
        });

        const deleteBtn = card.querySelector(".delete-btn")!;
        deleteBtn.addEventListener("click", () => {
          deleteMoment(moment.id);
        });

        galleryList.appendChild(card);
      });
    }
  }

  // 5. Image Download Helper
  function downloadImage(dataUrl: string, filename: string) {
    const link = document.createElement("a");
    link.download = filename;
    link.href = dataUrl;
    link.click();
  }

  // 6. Delete Moment Helper
  function deleteMoment(id: number) {
    const moments = JSON.parse(localStorage.getItem("jugnu_moments") || "[]");
    const filtered = moments.filter((m: any) => m.id !== id);
    localStorage.setItem("jugnu_moments", JSON.stringify(filtered));
    updateGalleryList();
    if (currentActiveMoment && currentActiveMoment.id === id) {
      closeLightbox();
    }
  }

  // 7. Lightbox Helpers
  function openLightbox(moment: any) {
    currentActiveMoment = moment;
    lightboxImg.src = moment.dataUrl;
    lightboxTime.textContent = moment.timestamp;
    lightbox.classList.add("open");
  }

  function closeLightbox() {
    lightbox.classList.remove("open");
    currentActiveMoment = null;
  }

  // 8. Event Listeners
  toggleBtn.addEventListener("click", () => {
    sidebar.classList.add("open");
  });

  closeBtn.addEventListener("click", () => {
    sidebar.classList.remove("open");
  });

  lightboxClose.addEventListener("click", () => {
    closeLightbox();
  });

  lightboxDownloadBtn.addEventListener("click", () => {
    if (currentActiveMoment) {
      downloadImage(currentActiveMoment.dataUrl, `JugnuMoment_${currentActiveMoment.id}.png`);
    }
  });

  clearAllBtn.addEventListener("click", () => {
    if (confirm("Are you sure you want to delete all captured moments?")) {
      localStorage.removeItem("jugnu_moments");
      updateGalleryList();
      closeLightbox();
    }
  });

  downloadAllBtn.addEventListener("click", () => {
    const moments = JSON.parse(localStorage.getItem("jugnu_moments") || "[]");
    moments.forEach((m: any, idx: number) => {
      // Small timeout to prevent browser blocking multiple rapid downloads
      setTimeout(() => {
        downloadImage(m.dataUrl, `JugnuMoment_${m.id}.png`);
      }, idx * 200);
    });
  });

  // Listen for custom saved event dispatched from WebXR thread
  window.addEventListener("jugnu-moment-saved", () => {
    updateGalleryList();
  });

  // 9. WebXR Visibility Handling
  renderer.xr.addEventListener("sessionstart", () => {
    sidebar.classList.remove("open");
    toggleBtn.style.display = "none";
    closeLightbox();
  });

  renderer.xr.addEventListener("sessionend", () => {
    toggleBtn.style.display = "flex";
    updateGalleryList();

    // Auto-download any screenshots captured during the VR session
    const moments = JSON.parse(localStorage.getItem("jugnu_moments") || "[]");
    let updated = false;
    let downloadCount = 0;
    
    moments.forEach((m: any) => {
      if (!m.downloaded) {
        setTimeout(() => {
          downloadImage(m.dataUrl, `JugnuMoment_${m.id}.png`);
        }, downloadCount * 300); // Space out downloads to bypass browser blocking/popup limits
        m.downloaded = true;
        downloadCount++;
        updated = true;
      }
    });

    if (updated) {
      localStorage.setItem("jugnu_moments", JSON.stringify(moments));
      setTimeout(() => {
        updateGalleryList();
      }, downloadCount * 300 + 100);
    }
  });

  // 10. Initial Render
  updateGalleryList();
}
