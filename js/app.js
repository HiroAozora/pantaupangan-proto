// app.js - Logika Aplikasi PantauPangan
// Implementasi PRD v1.0: Peta Leaflet, Chart.js, Role Switcher, CRUD localStorage, & AI Simulation

let map = null;
let markersLayer = null;
let faparChartInstance = null;
let rainfallChartInstance = null;
let currentSelectedRegionId = null;

document.addEventListener("DOMContentLoaded", () => {
  initRole();
  initStats();
  initMap();
  populateDropdowns();
  renderOperatorTable();
  renderPolicyTable();
  renderInterventionsTable();
  renderPublicTable();
  initTrendsChart();
});

// ==========================================
// 1. ROLE & NAVIGATION MANAGEMENT (PRD 2.2)
// ==========================================
function initRole() {
  const savedRole = getStoredRole();
  const selectElem = document.getElementById("role-select");
  if (selectElem) {
    selectElem.value = savedRole;
  }
  applyRolePermissions(savedRole);
}

function handleRoleChange(newRole) {
  saveRole(newRole);
  applyRolePermissions(newRole);
  showToast(`Beralih ke peran: ${getRoleName(newRole)}`, "info");
  
  // Refresh views and sidebars according to role
  if (currentSelectedRegionId) {
    displayRegionDetail(currentSelectedRegionId);
  }
  renderOperatorTable();
  renderPolicyTable();
  renderInterventionsTable();
}

function getRoleName(role) {
  switch (role) {
    case "operator": return "Operator Dinas Pertanian";
    case "bappeda": return "Kepala Bappeda / Kebijakan";
    case "public": return "Publik / Petani";
    case "admin": return "Administrator";
    default: return role;
  }
}

function applyRolePermissions(role) {
  const restrictedElems = document.querySelectorAll(".role-restricted");
  restrictedElems.forEach(elem => {
    const allowedRoles = elem.getAttribute("data-roles").split(",");
    if (allowedRoles.includes(role)) {
      elem.style.display = "";
    } else {
      elem.style.display = "none";
    }
  });

  // If currently active tab is not allowed for this role, fallback to map-view or public-view
  const activeTab = document.querySelector(".tab-view.active");
  if (role === "public" && (activeTab.id === "operator-view" || activeTab.id === "policy-view" || activeTab.id === "intervention-view")) {
    switchTab("public-view");
  }
}

function switchTab(tabId) {
  document.querySelectorAll(".tab-view").forEach(tab => tab.classList.remove("active"));
  document.querySelectorAll(".nav-btn").forEach(btn => btn.classList.remove("active"));

  const targetTab = document.getElementById(tabId);
  if (targetTab) {
    targetTab.classList.add("active");
  }

  // Update nav button state
  const navMap = {
    "map-view": "nav-map",
    "operator-view": "nav-operator",
    "policy-view": "nav-policy",
    "intervention-view": "nav-interventions",
    "trends-view": "nav-trends",
    "public-view": "nav-public"
  };

  const activeBtnId = navMap[tabId];
  if (activeBtnId) {
    const btn = document.getElementById(activeBtnId);
    if (btn) btn.classList.add("active");
  }

  // Trigger Leaflet map resize if switching to map
  if (tabId === "map-view" && map) {
    setTimeout(() => {
      map.invalidateSize();
    }, 200);
  }
}

// ==========================================
// 2. STATS & KPIS
// ==========================================
function initStats() {
  const regions = getStoredRegions();
  const interventions = getStoredInterventions();

  const high = regions.filter(r => r.risk_level === "high").length;
  const medium = regions.filter(r => r.risk_level === "medium").length;
  const low = regions.filter(r => r.risk_level === "low").length;
  const activeInterventions = interventions.filter(i => i.status === "in_progress" || i.status === "planned").length;

  document.getElementById("stat-high-count").textContent = high;
  document.getElementById("stat-medium-count").textContent = medium;
  document.getElementById("stat-low-count").textContent = low;
  document.getElementById("stat-intervention-count").textContent = activeInterventions;
}

// ==========================================
// 3. LEAFLET MAP WORKSPACE (F-01)
// ==========================================
const CARTO_API_KEY = "cb1_3wnh_1_dc4d1bd5a7f2b8f314c3cb96";

function initMap() {
  const mapElement = document.getElementById("map-container");
  if (!mapElement) return;

  // Center of Indonesia
  map = L.map("map-container", {
    zoomControl: true,
    attributionControl: true
  }).setView([-2.5489, 118.0149], 5);

  // CARTO Voyager Basemap (Apple-style crisp, clean light tiles)
  L.tileLayer(`https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=${CARTO_API_KEY}`, {
    maxZoom: 18,
    subdomains: "abcd",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions" target="_blank">CARTO</a>'
  }).addTo(map);

  markersLayer = L.layerGroup().addTo(map);
  renderMapMarkers();
}

function renderMapMarkers() {
  if (!markersLayer) return;
  markersLayer.clearLayers();

  const regions = getStoredRegions();
  const selectedProvince = document.getElementById("filter-province").value;
  const selectedRisk = document.getElementById("filter-risk").value;
  const filterWindowElem = document.getElementById("filter-window");
  const selectedWindow = filterWindowElem ? filterWindowElem.value : "all";

  regions.forEach(region => {
    // Apply filters (PRD 4.2 Step 3)
    if (selectedProvince !== "all" && region.province !== selectedProvince) return;
    if (selectedRisk !== "all" && region.risk_level !== selectedRisk) return;
    if (selectedWindow !== "all" && region.prediction_window !== selectedWindow) return;

    let color = "#34C759"; // Apple Green (low)
    if (region.risk_level === "high") color = "#FF3B30"; // Apple Red (high)
    else if (region.risk_level === "medium") color = "#FF9500"; // Apple Orange (medium)

    const circleMarker = L.circleMarker([region.lat, region.lng], {
      radius: region.risk_level === "high" ? 12 : 9,
      fillColor: color,
      color: "#FFFFFF",
      weight: 2,
      opacity: 1,
      fillOpacity: 0.9
    });

    circleMarker.bindTooltip(`<strong>${region.name}</strong><br>Skor Risiko: ${region.risk_score}/100`, {
      direction: "top",
      offset: [0, -10]
    });

    circleMarker.on("click", () => {
      displayRegionDetail(region.id);
      map.flyTo([region.lat, region.lng], 8, { duration: 1 });
    });

    markersLayer.addLayer(circleMarker);
  });
}

function applyMapFilters() {
  renderMapMarkers();
}

function displayRegionDetail(regionId) {
  currentSelectedRegionId = regionId;
  const regions = getStoredRegions();
  const region = regions.find(r => r.id === regionId);
  const panel = document.getElementById("region-detail-panel");
  if (!region || !panel) return;

  const currentRole = getStoredRole();

  let riskBadgeClass = "low";
  let riskBadgeLabel = "Risiko Rendah";
  if (region.risk_level === "high") {
    riskBadgeClass = "high";
    riskBadgeLabel = "Risiko Tinggi (Krisis)";
  } else if (region.risk_level === "medium") {
    riskBadgeClass = "medium";
    riskBadgeLabel = "Risiko Sedang (Waspada)";
  }

  // PRD 2.2 & 4.3: Peran Publik TIDAK BISA melihat detail prediksi sensitif (bobot model, confidence internal)
  if (currentRole === "public") {
    const interventions = getStoredInterventions();
    const activeInt = interventions.find(i => i.region_id === region.id && (i.status === "in_progress" || i.status === "planned"));
    const intText = activeInt 
      ? `<div style="background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: var(--radius-sm); padding: 0.75rem; margin-top: 0.75rem;">
           <span style="font-size: 0.75rem; color: var(--accent); font-weight: 700; text-transform: uppercase;">
             <i class="fa-solid fa-truck-droplet"></i> Intervensi Pemda Berjalan:
           </span>
           <div style="font-weight: 600; font-size: 0.85rem; margin-top: 0.2rem; color: var(--text-primary);">${activeInt.title}</div>
           <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.2rem;">Status: <strong>${formatStatusName(activeInt.status)}</strong> • Target: ${activeInt.target_beneficiaries}</div>
         </div>`
      : `<div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.5rem; background: var(--bg-surface); padding: 0.6rem; border-radius: var(--radius-sm);"><i class="fa-solid fa-circle-check text-primary"></i> Belum ada intervensi darurat khusus. Kondisi dalam pemantauan rutin.</div>`;

    panel.innerHTML = `
      <div class="region-header">
        <div class="region-title">
          <span>${region.name}</span>
          <span class="badge-risk ${riskBadgeClass}">
            <i class="fa-solid fa-shield-halved"></i> ${riskBadgeLabel}
          </span>
        </div>
        <div class="region-sub">
          <span>${region.province} • Komoditas Pangan: <strong>${region.crop_type}</strong></span>
        </div>
      </div>

      <div style="background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 1rem; margin-bottom: 0.75rem;">
        <span style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; font-weight: 600;">Status Situasi Pangan:</span>
        <div style="font-size: 1.15rem; font-weight: 800; color: ${region.risk_level === 'high' ? 'var(--risk-high)' : region.risk_level === 'medium' ? 'var(--risk-medium)' : 'var(--risk-low)'}; margin-top: 0.25rem;">
          ${region.risk_level === 'high' ? 'Zona Waspada Kekeringan / Gagal Panen' : region.risk_level === 'medium' ? 'Zona Waspada Fluktuasi Iklim' : 'Zona Produksi Aman & Terkendali'}
        </div>
        <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.4rem;">
          Pembaruan Terakhir: <strong>${new Date(region.last_updated).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}</strong>
        </div>
      </div>

      <div>
        <span style="font-size: 0.8rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase;">Status Program Perlindungan Pemerintah:</span>
        ${intText}
      </div>

      <div class="recommendation-box" style="margin-top: 0.75rem;">
        <div class="recommendation-label">
          <i class="fa-solid fa-seedling"></i> Panduan Petani Setempat
        </div>
        <p class="recommendation-text">${region.recommendation}</p>
      </div>

      <div style="background: var(--bg-subtle); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); padding: 0.65rem 0.75rem; margin-top: 0.75rem; font-size: 0.75rem; color: var(--text-muted);">
        <i class="fa-solid fa-lock" style="margin-right: 0.3rem;"></i> <em>Catatan: Rincian parameter matematis model AI satelit dibatasi untuk hak akses operator kedinasan (PRD Bagian 2.2).</em>
      </div>
    `;
    return;
  }

  let statusBadge = `<span class="badge-status planned"><i class="fa-solid fa-clock"></i> Belum Diverifikasi</span>`;
  if (region.status === "verified") {
    statusBadge = `<span class="badge-status completed"><i class="fa-solid fa-check"></i> Terverifikasi Operator</span>`;
  } else if (region.status === "overridden") {
    statusBadge = `<span class="badge-status in_progress"><i class="fa-solid fa-pen-ruler"></i> Penyesuaian Operator</span>`;
  }

  // Generate factors HTML
  const factorsHtml = region.factors.map(f => `
    <div class="factor-item ${f.impact}">
      <span class="factor-name">${f.name}</span>
      <span class="factor-val">${f.value}</span>
    </div>
  `).join("");

  // Determine actions based on Role (PRD 2.2)
  let actionButtonsHtml = "";
  if (currentRole === "operator" || currentRole === "admin") {
    actionButtonsHtml = `
      <div class="action-buttons" style="margin-top: 0.5rem;">
        <button class="btn btn-secondary btn-sm" onclick="openOverrideModal('${region.id}')">
          <i class="fa-solid fa-pen-to-square"></i> Override Risiko AI
        </button>
        ${region.status !== 'verified' ? `
        <button class="btn btn-secondary btn-sm" onclick="verifyRegionPrediction('${region.id}')">
          <i class="fa-solid fa-check-double"></i> Tandai Terverifikasi
        </button>` : ''}
        <button class="btn btn-primary btn-sm" onclick="openInterventionModalForRegion('${region.id}')">
          <i class="fa-solid fa-plus-circle"></i> Buat Intervensi
        </button>
      </div>
    `;
  } else if (currentRole === "bappeda") {
    actionButtonsHtml = `
      <div class="action-buttons" style="margin-top: 0.5rem;">
        <button class="btn btn-primary btn-sm" onclick="openInterventionModalForRegion('${region.id}')">
          <i class="fa-solid fa-file-signature"></i> Setujui Paket Intervensi
        </button>
      </div>
    `;
  }

  panel.innerHTML = `
    <div class="region-header">
      <div class="region-title">
        <span>${region.name}</span>
        <span class="badge-risk ${riskBadgeClass}">
          <i class="fa-solid fa-shield-virus"></i> ${riskBadgeLabel}
        </span>
      </div>
      <div class="region-sub">
        <span>${region.province} • Komoditas: <strong>${region.crop_type}</strong></span>
      </div>
    </div>

    <div class="score-box">
      <div>
        <span style="font-size: 0.75rem; color: var(--text-secondary); text-transform: uppercase;">Skor Risiko AI</span>
        <div class="score-num" style="color: ${region.risk_level === 'high' ? 'var(--risk-high)' : region.risk_level === 'medium' ? 'var(--risk-medium)' : 'var(--risk-low)'};">
          ${region.risk_score}<span style="font-size: 1rem; color: var(--text-muted); font-weight: 500;">/100</span>
        </div>
      </div>
      <div class="score-gauge-wrap">
        <div style="font-size: 0.75rem; color: var(--text-muted);">Confidence: <strong>${Math.round(region.confidence * 100)}%</strong></div>
        <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.2rem;">Jendela: <strong>${region.prediction_window}</strong></div>
        <div style="margin-top: 0.4rem;">${statusBadge}</div>
      </div>
    </div>

    <div>
      <span style="font-size: 0.8rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase;">Faktor Pemicu (Model Features):</span>
      <div class="factors-list" style="margin-top: 0.4rem;">
        ${factorsHtml}
      </div>
    </div>

    <div class="recommendation-box">
      <div class="recommendation-label">
        <i class="fa-solid fa-lightbulb"></i> Rekomendasi Tindakan AI
      </div>
      <p class="recommendation-text">${region.recommendation}</p>
    </div>

    ${actionButtonsHtml}
  `;
}

// ==========================================
// 4. OPERATOR DASHBOARD & INPUT (F-03, F-04)
// ==========================================
function populateDropdowns() {
  const regions = getStoredRegions();

  // Operator input dropdown
  const prodRegionSelect = document.getElementById("prod-region");
  if (prodRegionSelect) {
    prodRegionSelect.innerHTML = regions.map(r => `<option value="${r.id}">${r.name} (${r.province})</option>`).join("");
  }

  // Simulation dropdown
  const simRegionSelect = document.getElementById("sim-region");
  if (simRegionSelect) {
    simRegionSelect.innerHTML = regions.map(r => `<option value="${r.id}">${r.name} - Skor ${r.risk_score}</option>`).join("");
    updateSimulasiDisplay();
  }

  // Intervention modal dropdown
  const intRegionSelect = document.getElementById("int-region");
  if (intRegionSelect) {
    intRegionSelect.innerHTML = regions.map(r => `<option value="${r.id}">${r.name}</option>`).join("");
  }

  // Trends dropdown
  const trendRegionSelect = document.getElementById("trend-region-select");
  if (trendRegionSelect) {
    trendRegionSelect.innerHTML = regions.map(r => `<option value="${r.id}">${r.name}</option>`).join("");
  }
}

function handleProductionSubmit(event) {
  event.preventDefault();
  const regionId = document.getElementById("prod-region").value;
  const ton = parseFloat(document.getElementById("prod-ton").value);
  const ha = parseFloat(document.getElementById("prod-ha").value);

  const regions = getStoredRegions();
  const regionIndex = regions.findIndex(r => r.id === regionId);
  if (regionIndex === -1) return;

  const region = regions[regionIndex];

  // Simulasikan AI Prediction Update (PRD F-02 Model Prediksi Risiko)
  // Menghitung produktivitas (ton/ha) vs target normal (~5.0 ton/ha untuk padi)
  const productivity = ton / ha;
  let newScore = region.risk_score;

  if (productivity < 3.5) {
    newScore = Math.min(96, newScore + 12); // Peningkatan risiko
  } else if (productivity > 5.5) {
    newScore = Math.max(15, newScore - 15); // Penurunan risiko
  }

  let newLevel = "low";
  if (newScore >= 70) newLevel = "high";
  else if (newScore >= 50) newLevel = "medium";

  region.harvested_area = ha;
  region.risk_score = Math.round(newScore);
  region.risk_level = newLevel;
  region.last_updated = new Date().toISOString();
  region.status = "unverified"; // Perlu diverifikasi ulang

  regions[regionIndex] = region;
  saveRegions(regions);

  addLog(`Input data produksi ${region.name} (${ton} ton, ${ha} ha) - Skor AI baru: ${region.risk_score}`);

  // Update UI
  initStats();
  renderMapMarkers();
  renderOperatorTable();
  renderPolicyTable();
  renderPublicTable();

  if (currentSelectedRegionId === regionId) {
    displayRegionDetail(regionId);
  }

  showToast(`Data tersimpan! Model AI menghasilkan estimasi skor risiko: ${region.risk_score}/100`, "success");
  document.getElementById("form-production").reset();
}

function renderOperatorTable() {
  const tableBody = document.getElementById("operator-predictions-table");
  if (!tableBody) return;

  const regions = getStoredRegions();
  const currentRole = getStoredRole();

  // Update Operator Task Queue (PRD 4.1 Step 2)
  const unverifiedCount = regions.filter(r => r.status === "unverified").length;
  const unverifiedElem = document.getElementById("op-task-unverified-count");
  if (unverifiedElem) unverifiedElem.textContent = unverifiedCount;
  const inputElem = document.getElementById("op-task-input-count");
  if (inputElem) inputElem.textContent = regions.length;

  tableBody.innerHTML = regions.map(r => {
    let statusClass = "planned";
    let statusLabel = "Belum Verifikasi";
    if (r.status === "verified") {
      statusClass = "completed";
      statusLabel = "Terverifikasi";
    } else if (r.status === "overridden") {
      statusClass = "in_progress";
      statusLabel = "Override Operator";
    }

    const isOperator = (currentRole === "operator" || currentRole === "admin");
    const isAdmin = (currentRole === "admin");

    return `
      <tr>
        <td><strong>${r.name}</strong></td>
        <td>${r.province}</td>
        <td>
          <span style="font-weight: 700; color: ${r.risk_level === 'high' ? 'var(--risk-high)' : r.risk_level === 'medium' ? 'var(--risk-medium)' : 'var(--risk-low)'};">
            ${r.risk_score}
          </span>
        </td>
        <td>
          <span class="badge-risk ${r.risk_level}" style="font-size: 0.7rem; padding: 0.15rem 0.4rem;">
            ${r.risk_level.toUpperCase()}
          </span>
        </td>
        <td>
          <span class="badge-status ${statusClass}">${statusLabel}</span>
        </td>
        <td style="font-size: 0.75rem; color: var(--text-muted);">${new Date(r.last_updated).toLocaleDateString("id-ID")}</td>
        <td style="text-align: right; white-space: nowrap;">
          ${isOperator ? `
            <button class="btn btn-secondary btn-sm" title="Override Skor" onclick="openOverrideModal('${r.id}')">
              <i class="fa-solid fa-pen-ruler"></i>
            </button>
            <button class="btn btn-secondary btn-sm" title="Verifikasi" onclick="verifyRegionPrediction('${r.id}')">
              <i class="fa-solid fa-check"></i>
            </button>
          ` : `<span style="font-size: 0.75rem; color: var(--text-muted);">Read-Only</span>`}
          ${isAdmin ? `
            <button class="btn btn-secondary btn-sm" title="Arsipkan Catatan Prediksi (Admin)" onclick="archiveRegionPrediction('${r.id}')" style="color: #EF4444; margin-left: 0.25rem;">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          ` : ''}
        </td>
      </tr>
    `;
  }).join("");
}

function archiveRegionPrediction(regionId) {
  if (!confirm("Arsipkan dan setel ulang catatan verifikasi wilayah ini (Admin)?")) return;
  const regions = getStoredRegions();
  const region = regions.find(r => r.id === regionId);
  if (!region) return;

  region.status = "unverified";
  region.risk_score = 50;
  region.risk_level = "medium";
  region.last_updated = new Date().toISOString();
  saveRegions(regions);

  addLog(`Arsip & reset data prediksi ${region.name} oleh Administrator`, "Admin");
  initStats();
  renderOperatorTable();
  renderMapMarkers();
  renderPolicyTable();
  if (currentSelectedRegionId === regionId) displayRegionDetail(regionId);
  showToast(`Catatan prediksi ${region.name} berhasil diarsipkan.`, "info");
}

function verifyRegionPrediction(regionId) {
  const regions = getStoredRegions();
  const region = regions.find(r => r.id === regionId);
  if (!region) return;

  region.status = "verified";
  region.last_updated = new Date().toISOString();
  saveRegions(regions);

  addLog(`Verifikasi prediksi risiko ${region.name} oleh Operator`);
  initStats();
  renderOperatorTable();
  if (currentSelectedRegionId === regionId) displayRegionDetail(regionId);
  showToast(`Prediksi ${region.name} berhasil ditandai sebagai terverifikasi.`, "success");
}

function openOverrideModal(regionId) {
  const regions = getStoredRegions();
  const region = regions.find(r => r.id === regionId);
  if (!region) return;

  document.getElementById("override-region-id").value = region.id;
  document.getElementById("override-region-name").textContent = `${region.name} (Skor Saat Ini: ${region.risk_score})`;
  document.getElementById("override-score").value = region.risk_score;
  document.getElementById("override-reason").value = "";

  openModal("modal-override");
}

function handleOverrideSubmit(event) {
  event.preventDefault();
  const regionId = document.getElementById("override-region-id").value;
  const newScore = parseInt(document.getElementById("override-score").value);
  const reason = document.getElementById("override-reason").value;

  const regions = getStoredRegions();
  const region = regions.find(r => r.id === regionId);
  if (!region) return;

  region.risk_score = newScore;
  region.risk_level = newScore >= 70 ? "high" : newScore >= 50 ? "medium" : "low";
  region.status = "overridden";
  region.last_updated = new Date().toISOString();
  region.factors.push({
    name: "Catatan Override Operator",
    value: reason,
    impact: "high"
  });

  saveRegions(regions);
  addLog(`Override skor risiko ${region.name} menjadi ${newScore}. Alasan: ${reason}`);

  initStats();
  renderMapMarkers();
  renderOperatorTable();
  renderPolicyTable();
  renderPublicTable();
  if (currentSelectedRegionId === regionId) displayRegionDetail(regionId);

  closeModal("modal-override");
  showToast(`Skor risiko ${region.name} berhasil disesuaikan ke ${newScore}.`, "warning");
}

// ==========================================
// 5. POLICY DASHBOARD & SIMULATION (BAPPEDA)
// ==========================================
function renderPolicyTable() {
  const tableBody = document.getElementById("policy-recommendations-table");
  if (!tableBody) return;

  const regions = getStoredRegions();
  const highRisk = regions.filter(r => r.risk_level === "high" || r.risk_level === "medium");

  tableBody.innerHTML = highRisk.map(r => `
    <tr>
      <td>
        <strong>${r.name}</strong><br>
        <span style="font-size: 0.75rem; color: var(--text-muted);">${r.province}</span>
      </td>
      <td>
        <span class="badge-risk ${r.risk_level}">${r.risk_score}/100</span>
      </td>
      <td style="font-size: 0.8rem;">${r.factors[0] ? r.factors[0].value : 'FAPAR Defisit'}</td>
      <td style="font-size: 0.825rem; max-width: 320px;">${r.recommendation}</td>
      <td>
        <button class="btn btn-primary btn-sm" onclick="openInterventionModalForRegion('${r.id}')">
          <i class="fa-solid fa-file-circle-check"></i> Setujui Tindakan
        </button>
      </td>
    </tr>
  `).join("");
}

function updateSimulasiDisplay() {
  const regionId = document.getElementById("sim-region").value;
  const regions = getStoredRegions();
  const region = regions.find(r => r.id === regionId);
  if (!region) return;

  document.getElementById("sim-score-before").textContent = region.risk_score;
  const simType = document.getElementById("sim-type").value;
  
  let reductionPercent = 0.35;
  if (simType === "benih") reductionPercent = 0.25;
  else if (simType === "asuransi") reductionPercent = 0.20;
  else if (simType === "komprehensif") reductionPercent = 0.45;

  const afterScore = Math.max(10, Math.round(region.risk_score * (1 - reductionPercent)));
  document.getElementById("sim-score-after").textContent = afterScore;
}

function runSimulasiIntervensi() {
  updateSimulasiDisplay();
  const before = document.getElementById("sim-score-before").textContent;
  const after = document.getElementById("sim-score-after").textContent;
  showToast(`Simulasi AI: Intervensi diproyeksikan mereduksi risiko dari ${before} ke ${after} (-${Math.round(((before - after) / before) * 100)}%)`, "success");
}

// ==========================================
// 6. INTERVENTIONS MANAGEMENT (F-05 CRUD)
// ==========================================
function renderInterventionsTable() {
  const tableBody = document.getElementById("interventions-table-body");
  if (!tableBody) return;

  const interventions = getStoredInterventions();
  const currentRole = getStoredRole();
  // PRD Tabel 2.2: Update status intervensi hanya untuk Operator & Admin (Bappeda hanya membuat/menyetujui kebijakan)
  const canUpdateStatus = (currentRole === "operator" || currentRole === "admin");
  const isAdmin = (currentRole === "admin");

  tableBody.innerHTML = interventions.map(item => `
    <tr>
      <td><code>${item.id}</code></td>
      <td><strong>${item.region_name}</strong></td>
      <td>
        <strong>${item.title}</strong><br>
        <span style="font-size: 0.75rem; color: var(--text-muted);">${item.type}</span>
      </td>
      <td style="font-size: 0.8rem;">${item.target_beneficiaries}</td>
      <td style="font-size: 0.8rem;">${item.budget_source}</td>
      <td>
        <span class="badge-status ${item.status}">
          <i class="fa-solid fa-circle-dot"></i> ${formatStatusName(item.status)}
        </span>
      </td>
      <td style="font-size: 0.75rem;">${item.deadline}</td>
      <td style="text-align: right; white-space: nowrap;">
        ${canUpdateStatus ? `
          <select class="custom-select" style="font-size: 0.7rem; padding: 0.2rem 0.4rem;" onchange="updateInterventionStatus('${item.id}', this.value)">
            <option value="planned" ${item.status === 'planned' ? 'selected' : ''}>Rencana</option>
            <option value="in_progress" ${item.status === 'in_progress' ? 'selected' : ''}>Berjalan</option>
            <option value="completed" ${item.status === 'completed' ? 'selected' : ''}>Selesai Tuntas</option>
            <option value="cancelled" ${item.status === 'cancelled' ? 'selected' : ''}>Dibatalkan</option>
          </select>
        ` : (currentRole === 'bappeda' ? `<span style="font-size: 0.75rem; color: var(--text-muted);"><i class="fa-solid fa-lock"></i> Khusus Operator</span>` : `<span style="font-size: 0.75rem; color: var(--text-muted);">Read-Only</span>`)}
        ${isAdmin ? `
          <button class="btn btn-secondary btn-sm" title="Hapus / Batalkan Intervensi (Admin CRUD F-05)" onclick="archiveIntervention('${item.id}')" style="color: #EF4444; margin-left: 0.25rem;">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        ` : ''}
      </td>
    </tr>
  `).join("");
}

function formatStatusName(status) {
  switch (status) {
    case "planned": return "Rencana";
    case "in_progress": return "Berjalan";
    case "completed": return "Selesai";
    case "cancelled": return "Batal";
    default: return status;
  }
}

function updateInterventionStatus(interventionId, newStatus) {
  const interventions = getStoredInterventions();
  const item = interventions.find(i => i.id === interventionId);
  if (!item) return;

  item.status = newStatus;
  saveInterventions(interventions);

  addLog(`Update status intervensi ${item.id} menjadi: ${formatStatusName(newStatus)}`);
  initStats();
  renderInterventionsTable();
  renderPublicTable();
  showToast(`Status intervensi ${item.id} diperbarui ke ${formatStatusName(newStatus)}`, "success");
}

function archiveIntervention(interventionId) {
  if (!confirm(`Hapus / batalkan intervensi ${interventionId} secara permanen dari sistem (Admin)?`)) return;
  let interventions = getStoredInterventions();
  const deletedItem = interventions.find(i => i.id === interventionId);
  interventions = interventions.filter(i => i.id !== interventionId);
  saveInterventions(interventions);

  addLog(`Penghapusan / pembatalan intervensi ${interventionId} oleh Administrator`, "Admin");
  initStats();
  renderInterventionsTable();
  renderPublicTable();
  showToast(`Intervensi ${interventionId} berhasil dihapus dari daftar.`, "info");
}

function openNewInterventionModal() {
  populateDropdowns();
  openModal("modal-intervention");
}

function openInterventionModalForRegion(regionId) {
  populateDropdowns();
  const selectElem = document.getElementById("int-region");
  if (selectElem) selectElem.value = regionId;
  openModal("modal-intervention");
}

function handleCreateIntervention(event) {
  event.preventDefault();
  const regionId = document.getElementById("int-region").value;
  const title = document.getElementById("int-title").value;
  const type = document.getElementById("int-type").value;
  const target = document.getElementById("int-target").value;
  const budget = document.getElementById("int-budget").value;
  const deadline = document.getElementById("int-deadline").value;
  const notes = document.getElementById("int-notes").value;

  const regions = getStoredRegions();
  const region = regions.find(r => r.id === regionId);
  const regionName = region ? region.name : "Wilayah Khusus";

  const interventions = getStoredInterventions();
  const newId = `INT-2026-${String(interventions.length + 1).padStart(3, "0")}`;

  const newIntervention = {
    id: newId,
    region_id: regionId,
    region_name: regionName,
    title: title,
    type: type,
    target_beneficiaries: target,
    budget_source: budget,
    status: "planned",
    predicted_risk_before: region ? region.risk_score : 80,
    target_risk_after: Math.round((region ? region.risk_score : 80) * 0.6),
    created_by: getRoleName(getStoredRole()),
    created_at: new Date().toISOString(),
    deadline: deadline,
    notes: notes
  };

  interventions.unshift(newIntervention);
  saveInterventions(interventions);

  addLog(`Pembuatan program intervensi ${newId} untuk ${regionName}`);
  initStats();
  renderInterventionsTable();
  renderPublicTable();

  closeModal("modal-intervention");
  document.getElementById("form-new-intervention").reset();
  showToast(`Intervensi ${newId} berhasil didaftarkan dan dijadwalkan.`, "success");
}

// ==========================================
// 7. PUBLIC TRANSPARENCY VIEW (F-06)
// ==========================================
function renderPublicTable() {
  const tableBody = document.getElementById("public-table-body");
  if (!tableBody) return;

  const regions = getStoredRegions();
  const interventions = getStoredInterventions();

  tableBody.innerHTML = regions.map(r => {
    const activeInt = interventions.find(i => i.region_id === r.id && (i.status === "in_progress" || i.status === "planned"));
    const intLabel = activeInt 
      ? `<span class="badge-status in_progress"><i class="fa-solid fa-wrench"></i> ${activeInt.title.substring(0, 35)}...</span>`
      : `<span style="font-size: 0.75rem; color: var(--text-muted);"><i class="fa-solid fa-check"></i> Pemantauan Rutin</span>`;

    return `
      <tr>
        <td><strong>${r.name}</strong> (${r.province})</td>
        <td>${r.crop_type}</td>
        <td>
          <span class="badge-risk ${r.risk_level}">
            ${r.risk_level === 'high' ? 'Waspada Tinggi' : r.risk_level === 'medium' ? 'Waspada' : 'Aman'}
          </span>
        </td>
        <td>${intLabel}</td>
      </tr>
    `;
  }).join("");
}

// ==========================================
// 8. TRENDS CHARTS (F-09)
// ==========================================
function initTrendsChart() {
  const regions = getStoredRegions();
  if (regions.length === 0) return;
  updateTrendsChart(regions[0].id);
}

function updateTrendsChart(regionId) {
  const regions = getStoredRegions();
  const region = regions.find(r => r.id === regionId) || regions[0];

  const ctxFapar = document.getElementById("chart-fapar");
  const ctxRain = document.getElementById("chart-rainfall");
  if (!ctxFapar || !ctxRain) return;

  const months = ["Okt 25", "Nov 25", "Des 25", "Jan 26", "Feb 26", "Mar 26", "Apr 26", "Mei 26", "Jun 26", "Jul 26", "Agu 26", "Sep 26"];

  // Generate synthetic curve around region.fapar_anomaly
  const faparData = months.map((m, idx) => {
    const base = region.fapar_anomaly;
    return Number((base + Math.sin(idx) * 0.4).toFixed(2));
  });

  if (faparChartInstance) faparChartInstance.destroy();
  faparChartInstance = new Chart(ctxFapar, {
    type: "line",
    data: {
      labels: months,
      datasets: [
        {
          label: `FAPAR Anomaly (Std Dev) - ${region.name}`,
          data: faparData,
          borderColor: "#34C759",
          backgroundColor: "rgba(52, 199, 89, 0.08)",
          fill: true,
          tension: 0.35,
          pointRadius: 3
        },
        {
          label: "Ambang Kritis Krisis (-1.5)",
          data: Array(12).fill(-1.5),
          borderColor: "#FF3B30",
          borderDash: [4, 4],
          pointRadius: 0,
          fill: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          grid: { color: "rgba(0, 0, 0, 0.05)" },
          ticks: { color: "#86868B" }
        },
        x: {
          grid: { display: false },
          ticks: { color: "#86868B" }
        }
      },
      plugins: {
        legend: { labels: { color: "#1D1D1F", font: { family: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif" } } }
      }
    }
  });

  // Rainfall Chart
  if (rainfallChartInstance) rainfallChartInstance.destroy();
  const rainData = months.map(() => Math.floor(Math.random() * 80 + region.rainfall_30d * 0.8));
  rainfallChartInstance = new Chart(ctxRain, {
    type: "bar",
    data: {
      labels: months,
      datasets: [
        {
          label: `Curah Hujan Riil (mm)`,
          data: rainData,
          backgroundColor: "rgba(0, 113, 227, 0.75)",
          borderColor: "#0071E3",
          borderWidth: 1,
          borderRadius: 4
        },
        {
          label: `Rata-rata Normal (100 mm)`,
          data: Array(12).fill(100),
          type: "line",
          borderColor: "#FF9500",
          borderDash: [4, 4],
          pointRadius: 0
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          grid: { color: "rgba(0, 0, 0, 0.05)" },
          ticks: { color: "#86868B" }
        },
        x: {
          grid: { display: false },
          ticks: { color: "#86868B" }
        }
      },
      plugins: {
        legend: { labels: { color: "#1D1D1F", font: { family: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif" } } }
      }
    }
  });
}

// ==========================================
// 9. SIMULATED EXPORT (F-08)
// ==========================================
function exportReportModal() {
  openModal("modal-export");
}

function downloadSimulatedExport(format) {
  const regions = getStoredRegions();

  if (format === "csv") {
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "ID,Kabupaten,Provinsi,Skor_Risiko,Tingkat,FAPAR_Anomaly,Curah_Hujan_30d,Status,Rekomendasi\n";

    regions.forEach(r => {
      const row = `"${r.id}","${r.name}","${r.province}",${r.risk_score},"${r.risk_level}",${r.fapar_anomaly},${r.rainfall_30d},"${r.status}","${r.recommendation.replace(/"/g, '""')}"`;
      csvContent += row + "\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Laporan_EWS_PantauPangan_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    closeModal("modal-export");
    showToast("File CSV Laporan PantauPangan berhasil diunduh.", "success");
  } else if (format === "pdf") {
    closeModal("modal-export");
    window.print();
  }
}

// ==========================================
// 10. MODAL & TOAST HELPERS
// ==========================================
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add("active");
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove("active");
}

function showToast(message, type = "success") {
  const container = document.getElementById("toast-box");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  
  let icon = "fa-circle-check";
  if (type === "warning") icon = "fa-triangle-exclamation";
  else if (type === "error") icon = "fa-circle-xmark";
  else if (type === "info") icon = "fa-circle-info";

  toast.innerHTML = `
    <i class="fa-solid ${icon}"></i>
    <span>${message}</span>
  `;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}
