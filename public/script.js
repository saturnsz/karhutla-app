/* Frontend (tema Windows XP) - Klasifikasi Wilayah Pemadaman Karhutla Kalimantan */

// Kosongkan jika frontend & backend satu domain (Flask lokal / Vercel).
const API_BASE = "";
window.API_BASE = API_BASE;

const PRESETS = {
  palangkaraya: { latitude: -2.20, longitude: 113.91, brightness: 350.5, confidence: 100 },
  pontianak:    { latitude: -0.02, longitude: 109.33, brightness: 310.2, confidence: 82 },
};
const FIELDS = ["latitude", "longitude", "brightness", "confidence"];
const HISTORY_KEY = "karhutla_history_v1";
const MAX_HISTORY = 15;

/* ======================= AUTENTIKASI ADMIN ======================= */
const AUTH_KEY = "karhutla_admin_auth";
const ADMIN_USER = "admin";
const ADMIN_PASS = "admin";

const $ = (id) => document.getElementById(id);

/* ======================= PETA ======================= */
const map = L.map("map").setView([0.2, 114], 6);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 18, attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);

L.rectangle([[-4.5, 108.5], [4.5, 119.5]], {
  color: "#c2410c", weight: 1.5, fill: false, dashArray: "6 6",
}).addTo(map);

const markerLayer = L.layerGroup().addTo(map);
let pickMarker = null;

map.on("click", (e) => {
  const lat = +e.latlng.lat.toFixed(5);
  const lng = +e.latlng.lng.toFixed(5);
  $("latitude").value = lat;
  $("longitude").value = lng;
  if (pickMarker) map.removeLayer(pickMarker);
  pickMarker = L.circleMarker([lat, lng], { radius: 6, color: "#475569", fillOpacity: 0.4 }).addTo(map);
  setStatus(`Koordinat dipilih: ${lat}, ${lng}`);
});

function addResultMarker(r, label) {
  const color = r.label === 1 ? "#dc2626" : "#16a34a";
  const m = L.circleMarker([r.input.latitude, r.input.longitude], {
    radius: r.label === 1 ? 9 : 6, color, fillColor: color, fillOpacity: 0.7, weight: 2,
  });
  m.bindPopup(
    `<strong>${r.status}</strong>${label ? " &middot; #" + label : ""}<br>` +
    `P(Darurat): ${r.probabilitas.darurat}%<br>` +
    `Lat ${r.input.latitude}, Lon ${r.input.longitude}`
  );
  m.addTo(markerLayer);
  return m;
}

/* ======================= HELPER UI ======================= */
function setStatus(text) { $("status-text").textContent = text; }

function setBusy(busy, text) {
  $("progress").hidden = !busy;
  if (text) setStatus(text);
}

function showError(el, msg) { el.textContent = msg; el.hidden = !msg; }

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

async function callApi(path, body) {
  const res = await fetch(API_BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = Array.isArray(data.detail) ? " " + data.detail.join(" ") : "";
    throw new Error((data.error || "Terjadi kesalahan pada server.") + detail);
  }
  return data;
}

/* ======================= DIALOG XP ======================= */
function showDialog(title, text, type = "info") {
  $("dlg-title").textContent = title;
  $("dlg-text").textContent = text;
  const icon = $("dlg-icon");
  icon.className = `msg-icon ${type}`;
  icon.textContent = type === "error" ? "X" : type === "ok" ? "✓" : "i";
  $("overlay").hidden = false;
  $("dlg-ok").focus();
}
window.showDialog = showDialog;
const closeDialog = () => { $("overlay").hidden = true; };
$("dlg-ok").addEventListener("click", closeDialog);
$("dlg-x").addEventListener("click", closeDialog);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeDialog(); closeMenus(); } });

/* ======================= TAB ======================= */
function activateTab(name) {
  document.querySelectorAll(".tab").forEach((t) => {
    const on = t.dataset.tab === name;
    t.classList.toggle("active", on);
    t.setAttribute("aria-selected", on);
  });
  document.querySelectorAll(".panel").forEach((p) => { p.hidden = p.id !== `tab-${name}`; });
  if (name === "history") renderHistory();
}
document.querySelectorAll(".tab").forEach((t) =>
  t.addEventListener("click", () => activateTab(t.dataset.tab))
);

/* ======================= MANAJEMEN JENDELA & MENU XP ======================= */
const winKlasifikasi = $("main-window");
const winEda = $("eda-window");
const taskBtnKlasifikasi = $("task-btn-klasifikasi");
const taskBtnEda = $("task-btn-eda");
const desktopIcons = $("desktop-icons");

function focusWindow(target) {
  if (!isLoggedIn()) return;
  if (target === "klasifikasi") {
    if (winKlasifikasi) {
      winKlasifikasi.hidden = false;
      winKlasifikasi.style.display = "";
      winKlasifikasi.classList.remove("minimized");
      winKlasifikasi.classList.add("focused");
    }
    if (winEda) {
      winEda.classList.remove("focused");
    }
    if (taskBtnKlasifikasi) taskBtnKlasifikasi.classList.add("active");
    setTimeout(() => { if (typeof map !== "undefined") map.invalidateSize(); }, 60);
  } else if (target === "eda") {
    if (winEda) {
      winEda.hidden = false;
      winEda.style.display = "";
      winEda.classList.remove("minimized");
      winEda.classList.add("focused");
    }
    if (winKlasifikasi) {
      winKlasifikasi.classList.remove("focused");
    }
    if (taskBtnEda) taskBtnEda.classList.add("active");
    if (typeof window.edaInit === "function") window.edaInit();
    if (typeof window.edaInvalidateMap === "function") window.edaInvalidateMap();
  }
}
window.focusWindow = focusWindow;

function toggleWindow(target) {
  if (!isLoggedIn()) return;
  const w = target === "klasifikasi" ? winKlasifikasi : winEda;
  const tb = target === "klasifikasi" ? taskBtnKlasifikasi : taskBtnEda;
  if (!w) return;
  if (w.hidden || w.style.display === "none") {
    focusWindow(target);
  } else if (w.classList.contains("minimized")) {
    focusWindow(target);
  } else if (w.classList.contains("focused")) {
    w.classList.add("minimized");
    w.classList.remove("focused");
    if (tb) tb.classList.remove("active");
  } else {
    focusWindow(target);
  }
}

if (taskBtnKlasifikasi) {
  taskBtnKlasifikasi.addEventListener("click", () => toggleWindow("klasifikasi"));
}
if (taskBtnEda) {
  taskBtnEda.addEventListener("click", () => toggleWindow("eda"));
}

if (winKlasifikasi) {
  winKlasifikasi.addEventListener("mousedown", () => focusWindow("klasifikasi"));
}

if ($("dicon-klasifikasi")) {
  $("dicon-klasifikasi").addEventListener("click", () => focusWindow("klasifikasi"));
}
if ($("dicon-eda")) {
  $("dicon-eda").addEventListener("click", () => focusWindow("eda"));
}

function closeMenus() {
  document.querySelectorAll(".dropdown").forEach((d) => (d.hidden = true));
  document.querySelectorAll(".menu > button").forEach((b) => b.classList.remove("open"));
  $("start-menu").hidden = true;
}

document.querySelectorAll("[data-menu]").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const dd = $(btn.dataset.menu);
    const willOpen = dd.hidden;
    closeMenus();
    dd.hidden = !willOpen;
    btn.classList.toggle("open", willOpen);
  });
});

$("start-btn").addEventListener("click", (e) => {
  e.stopPropagation();
  const willOpen = $("start-menu").hidden;
  closeMenus();
  $("start-menu").hidden = !willOpen;
});
document.addEventListener("click", closeMenus);

$("btn-min").addEventListener("click", () => {
  if (!isLoggedIn()) return;
  winKlasifikasi.classList.add("minimized");
  winKlasifikasi.classList.remove("focused");
  if (taskBtnKlasifikasi) taskBtnKlasifikasi.classList.remove("active");
});
$("btn-max").addEventListener("click", () => {
  if (!isLoggedIn()) return;
  winKlasifikasi.classList.toggle("maximized");
  setTimeout(() => map.invalidateSize(), 60);
});
$("btn-close").addEventListener("click", () => {
  winKlasifikasi.hidden = true;
  winKlasifikasi.style.display = "none";
  winKlasifikasi.classList.remove("focused");
  if (taskBtnKlasifikasi) taskBtnKlasifikasi.classList.remove("active");
});

function applyPreset(name) {
  const p = PRESETS[name];
  FIELDS.forEach((f) => ($(f).value = p[f]));
  showError($("form-error"), "");
  activateTab("single");
  focusWindow("klasifikasi");
  setStatus(`Contoh dimuat: ${name}`);
}

function runAction(action) {
  closeMenus();
  if (action === "open-klasifikasi") return focusWindow("klasifikasi");
  if (action === "open-eda") return focusWindow("eda");
  if (action.startsWith("tab-")) {
    focusWindow("klasifikasi");
    return activateTab(action.slice(4));
  }
  if (action.startsWith("preset-")) return applyPreset(action.slice(7));
  switch (action) {
    case "logout": return handleLogout();
    case "sample-csv": return downloadSample();
    case "clear-history": return clearHistory();
    case "about":
      return showDialog(
        "Tentang Aplikasi",
        "Klasifikasi Wilayah Pemadaman Karhutla di Kalimantan menggunakan Naive Bayes. " +
        "Data: NASA FIRMS (MODIS C6.1 NRT). Label DARURAT jika FRP > 30 MW.", "info");
    case "exit":
      return showDialog("Tutup Aplikasi",
        "Aplikasi ini berjalan di browser. Tutup tab browser untuk keluar.", "info");
  }
}
document.querySelectorAll("[data-action]").forEach((el) =>
  el.addEventListener("click", () => runAction(el.dataset.action))
);
document.querySelectorAll("[data-preset]").forEach((el) =>
  el.addEventListener("click", () => applyPreset(el.dataset.preset))
);

/* Jam di taskbar */
function tickClock() {
  $("clock").textContent = new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}
tickClock();
setInterval(tickClock, 15000);

/* ======================= KLASIFIKASI TUNGGAL ======================= */
function readForm() {
  const point = {};
  for (const f of FIELDS) {
    const raw = $(f).value.trim();
    if (raw === "" || Number.isNaN(Number(raw))) throw new Error(`Kolom ${f} wajib diisi dengan angka.`);
    point[f] = Number(raw);
  }
  return point;
}

function renderResult(r) {
  const cls = r.label === 1 ? "darurat" : "aman";
  const box = $("result");
  box.innerHTML = `
    <div class="msgbox ${cls}">
      <div class="titlebar"><h1>Hasil Klasifikasi</h1></div>
      <div class="msgbox-body">
        <span class="msg-icon ${r.label === 1 ? "error" : "ok"}" aria-hidden="true">${r.label === 1 ? "!" : "✓"}</span>
        <div>
          <h2>${r.label === 1 ? "DARURAT (Prioritas Pemadaman)" : "AMAN (Terkendali)"}</h2>
          <p><strong>Tindakan:</strong> ${escapeHtml(r.tindakan)}</p>
          <p><strong>Potensi:</strong> ${escapeHtml(r.potensi)}</p>
          <p><strong>Keyakinan model:</strong> ${r.keyakinan_persen}%</p>
          <div class="meter ${r.label === 1 ? "red" : ""}" role="img" aria-label="Probabilitas darurat ${r.probabilitas.darurat} persen">
            <span style="width:${r.probabilitas.darurat}%"></span>
          </div>
          <div class="meter-label">P(Darurat) ${r.probabilitas.darurat}% &middot; P(Aman) ${r.probabilitas.aman}%</div>
        </div>
      </div>
    </div>`;
  box.hidden = false;
}

$("predict-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errEl = $("form-error");
  const btn = $("btn-predict");
  showError(errEl, "");

  let point;
  try { point = readForm(); } catch (err) { return showError(errEl, err.message); }

  btn.disabled = true;
  setBusy(true, "Memproses klasifikasi...");
  try {
    const result = await callApi("/api/predict", point);
    renderResult(result);
    markerLayer.clearLayers();
    addResultMarker(result).openPopup();
    map.setView([point.latitude, point.longitude], Math.max(map.getZoom(), 8));
    saveHistory(result);
    setStatus(`Selesai: ${result.status} (P darurat ${result.probabilitas.darurat}%)`);
  } catch (err) {
    showError(errEl, err.message);
    setStatus("Gagal memproses");
  } finally {
    btn.disabled = false;
    setBusy(false);
  }
});

/* ======================= RIWAYAT ======================= */
function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; } catch { return []; }
}
function saveHistory(r) {
  const list = loadHistory();
  list.unshift({
    waktu: new Date().toLocaleString("id-ID"),
    status: r.status, label: r.label, pDarurat: r.probabilitas.darurat, input: r.input,
  });
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, MAX_HISTORY))); } catch { /* abaikan */ }
}
function renderHistory() {
  const list = loadHistory();
  $("history").innerHTML = list.map((h) => `
    <li>
      <span class="tag ${h.label === 1 ? "darurat" : "aman"}">${h.status}</span>
      (${h.input.latitude}, ${h.input.longitude}) &middot; ${h.input.brightness} K &middot; conf ${h.input.confidence}%
      &middot; P(Darurat) ${h.pDarurat}%
      <span class="when">${escapeHtml(h.waktu)}</span>
    </li>`).join("");
  $("history-empty").hidden = list.length > 0;
}
function clearHistory() {
  try { localStorage.removeItem(HISTORY_KEY); } catch { /* abaikan */ }
  renderHistory();
  setStatus("Riwayat dihapus");
}
$("btn-clear").addEventListener("click", clearHistory);

/* ======================= BATCH CSV ======================= */
function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) throw new Error("CSV kosong atau tidak memiliki baris data.");
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const idx = {};
  for (const f of FIELDS) {
    idx[f] = header.indexOf(f);
    if (idx[f] === -1) throw new Error(`Kolom '${f}' tidak ditemukan di header CSV.`);
  }
  return lines.slice(1).map((line) => {
    const cols = line.split(",");
    const row = {};
    for (const f of FIELDS) row[f] = cols[idx[f]] !== undefined ? cols[idx[f]].trim() : "";
    return row;
  });
}

$("btn-batch").addEventListener("click", async () => {
  const errEl = $("batch-error");
  const btn = $("btn-batch");
  showError(errEl, "");

  const file = $("csv-file").files[0];
  if (!file) return showError(errEl, "Pilih file CSV terlebih dahulu.");

  btn.disabled = true;
  setBusy(true, "Memproses berkas CSV...");
  try {
    const points = parseCsv(await file.text());
    if (points.length > 500) throw new Error("Maksimal 500 baris per unggahan.");
    const data = await callApi("/api/predict-batch", { points });
    renderBatch(data);
    setStatus(`CSV selesai: ${data.total_diproses} titik diproses`);
  } catch (err) {
    showError(errEl, err.message);
    setStatus("Gagal memproses CSV");
  } finally {
    btn.disabled = false;
    setBusy(false);
  }
});

function renderBatch(data) {
  const summary = $("batch-summary");
  summary.innerHTML = `
    <span class="pill">Diproses: <strong>${data.total_diproses}</strong> / ${data.total_dikirim}</span>
    <span class="pill">Darurat: <strong>${data.total_darurat}</strong></span>
    <span class="pill">Aman: <strong>${data.total_aman}</strong></span>
    ${data.dilewati.length ? `<span class="pill">Dilewati: <strong>${data.dilewati.length}</strong></span>` : ""}`;
  summary.hidden = false;

  $("batch-table").querySelector("tbody").innerHTML = data.hasil.map((r, i) => `
    <tr>
      <td>${i + 1}</td><td>${r.input.latitude}</td><td>${r.input.longitude}</td>
      <td>${r.input.brightness}</td><td>${r.input.confidence}</td>
      <td><span class="tag ${r.label === 1 ? "darurat" : "aman"}">${r.status}</span></td>
      <td>${r.probabilitas.darurat}%</td>
    </tr>`).join("");
  $("batch-table").hidden = data.hasil.length === 0;

  markerLayer.clearLayers();
  const bounds = [];
  data.hasil.forEach((r, i) => {
    addResultMarker(r, i + 1);
    bounds.push([r.input.latitude, r.input.longitude]);
  });
  if (bounds.length) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 9 });
}

function downloadSample() {
  const csv = [
    "latitude,longitude,brightness,confidence",
    "-2.20,113.91,350.5,100",
    "-0.02,109.33,310.2,82",
    "-2.80,110.70,380.0,100",
    "-3.22,113.76,345.0,95",
  ].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: "contoh_titik_panas.csv" });
  a.click();
  URL.revokeObjectURL(url);
}
$("btn-sample").addEventListener("click", downloadSample);

/* ======================= INFO MODEL & STATUS API ======================= */
async function checkHealth() {
  try {
    const res = await fetch(API_BASE + "/api/health");
    const j = await res.json();
    $("status-api").textContent = j.model_loaded ? "API: online" : "API: model belum dimuat";
  } catch {
    $("status-api").textContent = "API: offline";
  }
}

async function loadModelInfo() {
  const box = $("model-info");
  try {
    const res = await fetch(API_BASE + "/api/model-info");
    if (!res.ok) throw new Error();
    const info = await res.json();
    box.innerHTML = `
      <p><strong>Model aktif:</strong> ${escapeHtml(info.model_name || "Naive Bayes")}<br>
      <strong>Fitur:</strong> ${info.features.join(", ")}<br>
      <strong>Aturan label:</strong> FRP &gt; ${info.frp_threshold_mw ?? 30} MW = DARURAT</p>`;
    if (info.comparison) {
      $("compare-table").querySelector("tbody").innerHTML = info.comparison.map((m) => `
        <tr><td>${escapeHtml(m.model)}</td><td>${m.accuracy}</td><td>${m.sensitivity}</td>
        <td>${m.specificity}</td><td>${m.kappa}</td><td>${m.rmse}</td><td>${m.auc}</td></tr>`).join("");
      $("compare-table").hidden = false;
    }
  } catch {
    box.textContent = "Informasi model tidak dapat dimuat. Pastikan backend berjalan.";
  }
}

/* ======================= LOGIKA LOGIN / LOGOUT ADMIN ======================= */
function isLoggedIn() {
  return localStorage.getItem(AUTH_KEY) === "admin";
}

function updateAuthUI() {
  const authed = isLoggedIn();
  const loginOverlay = $("login-overlay");
  const userDisplay = $("user-display");
  const statusUser = $("status-user");

  if (authed) {
    if (loginOverlay) {
      loginOverlay.hidden = true;
      loginOverlay.style.display = "none";
    }
    if (desktopIcons) {
      desktopIcons.hidden = false;
      desktopIcons.style.display = "flex";
    }
    focusWindow("klasifikasi");
    if (taskBtnKlasifikasi) taskBtnKlasifikasi.disabled = false;
    if (taskBtnEda) taskBtnEda.disabled = false;
    if (userDisplay) userDisplay.textContent = "Administrator (admin)";
    if (statusUser) statusUser.textContent = "👤 Admin: Aktif";
  } else {
    if (loginOverlay) {
      loginOverlay.hidden = false;
      loginOverlay.style.display = "grid";
    }
    if (desktopIcons) {
      desktopIcons.hidden = true;
      desktopIcons.style.display = "none";
    }
    if (winKlasifikasi) {
      winKlasifikasi.hidden = true;
      winKlasifikasi.style.display = "none";
      winKlasifikasi.classList.remove("focused");
    }
    if (winEda) {
      winEda.hidden = true;
      winEda.style.display = "none";
      winEda.classList.remove("focused");
    }
    if (taskBtnKlasifikasi) {
      taskBtnKlasifikasi.classList.remove("active");
      taskBtnKlasifikasi.disabled = true;
    }
    if (taskBtnEda) {
      taskBtnEda.classList.remove("active");
      taskBtnEda.disabled = true;
    }
    if (userDisplay) userDisplay.textContent = "Tamu (Belum Masuk)";
    if (statusUser) statusUser.textContent = "🔒 Terkunci";
    const passInput = $("login-password");
    if (passInput) passInput.value = "admin";
    showError($("login-error"), "");
  }
}

function handleLogin(e) {
  if (e) e.preventDefault();
  const u = $("login-username").value.trim();
  const p = $("login-password").value;
  const errEl = $("login-error");
  showError(errEl, "");

  if (u === ADMIN_USER && p === ADMIN_PASS) {
    localStorage.setItem(AUTH_KEY, "admin");
    updateAuthUI();
    setStatus("Selamat datang, Administrator.");
  } else {
    showError(errEl, "Nama pengguna atau kata sandi salah. Gunakan username: admin dan password: admin.");
    $("login-password").focus();
  }
}

function handleLogout() {
  localStorage.removeItem(AUTH_KEY);
  updateAuthUI();
  setStatus("Sesi telah keluar (Log Off).");
  showDialog("Log Off", "Anda telah keluar dari sesi Admin.", "info");
}

if ($("login-form")) {
  $("login-form").addEventListener("submit", handleLogin);
}
if ($("btn-fill-admin")) {
  $("btn-fill-admin").addEventListener("click", () => {
    $("login-username").value = "admin";
    $("login-password").value = "admin";
    showError($("login-error"), "");
  });
}

/* ======================= INIT ======================= */
renderHistory();
checkHealth();
loadModelInfo();
updateAuthUI();
setStatus("Siap");

/* ======================= RESPONSIF & ORIENTASI ======================= */
let resizeTimer = null;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (typeof map !== "undefined" && map) map.invalidateSize();
    if (typeof window.edaInvalidateMap === "function") window.edaInvalidateMap();
  }, 100);
});
window.addEventListener("orientationchange", () => {
  setTimeout(() => {
    if (typeof map !== "undefined" && map) map.invalidateSize();
    if (typeof window.edaInvalidateMap === "function") window.edaInvalidateMap();
  }, 200);
});
