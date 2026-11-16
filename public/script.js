/* Frontend (tema Windows XP) - Klasifikasi Wilayah Pemadaman Karhutla Kalimantan */

// Kosongkan jika frontend & backend satu domain (Flask lokal / Vercel).
const API_BASE = "";
window.API_BASE = API_BASE;

const PRESETS = {
  palangkaraya: { latitude: -2.20, longitude: 113.91, brightness: 350.5, confidence: 100, label: "Palangkaraya (DARURAT)" },
  pontianak: { latitude: -0.02, longitude: 109.33, brightness: 310.2, confidence: 82, label: "Pontianak (AMAN)" },
  pulangpisau: { latitude: -2.75, longitude: 114.15, brightness: 348.0, confidence: 98, label: "Pulang Pisau (DARURAT)" },
  samarinda: { latitude: -0.50, longitude: 117.15, brightness: 311.5, confidence: 83, label: "Samarinda (AMAN)" },
};
const FIELDS = ["latitude", "longitude", "brightness", "confidence"];
const HISTORY_KEY = "karhutla_history_v1";
const MAX_HISTORY = 15;

/* ======================= AUTENTIKASI ADMIN ======================= */
const AUTH_KEY = "karhutla_admin_auth";
const ADMIN_USER = "admin";
const ADMIN_PASS = "admin";

// Bersihkan data login lawas di localStorage agar user selalu harus login saat baru masuk link
try {
  localStorage.removeItem(AUTH_KEY);
  localStorage.removeItem("karhutla_auth");
} catch (e) {}

const $ = (id) => document.getElementById(id);

/* ======================= PETA & TITIK PANAS ======================= */
const map = L.map("map").setView([0.2, 114], 6);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 18, attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);

L.rectangle([[-4.5, 108.5], [4.5, 119.5]], {
  color: "#c2410c", weight: 1.5, fill: false, dashArray: "6 6",
}).addTo(map);

const hotspotCanvas = L.canvas({ padding: 0.5 });
const hotspotLayer = L.layerGroup().addTo(map);
const markerLayer = L.layerGroup().addTo(map);
let pickMarker = null;
let hotspotsData = []; // [lat, lon, risk, brightness, confidence]

function findNearestHotspot(lat, lng) {
  if (!hotspotsData || !hotspotsData.length) return null;
  let best = null;
  let minDistSq = Infinity;
  for (let i = 0; i < hotspotsData.length; i++) {
    const p = hotspotsData[i];
    const dLat = p[0] - lat;
    const dLng = p[1] - lng;
    const dSq = dLat * dLat + dLng * dLng;
    if (dSq < minDistSq) {
      minDistSq = dSq;
      best = p;
    }
  }
  return { point: best, distKm: Math.sqrt(minDistSq) * 111.0 };
}

function handleMapSelection(lat, lng, explicitPoint = null) {
  $("latitude").value = lat;
  $("longitude").value = lng;

  let brightnessVal, confidenceVal, statusDesc, isEmergency;

  if (explicitPoint) {
    // Dipilih langsung dari titik hotspot satelit di peta
    brightnessVal = explicitPoint[3];
    confidenceVal = explicitPoint[4];
    isEmergency = explicitPoint[2] === 1;
    statusDesc = isEmergency
      ? `Titik Satelit DARURAT (FRP > 30 MW, Brightness ${brightnessVal} K, Conf ${confidenceVal}%)`
      : `Titik Satelit AMAN (Terkendali, Brightness ${brightnessVal} K, Conf ${confidenceVal}%)`;
  } else {
    // Diklik bebas di koordinat peta oleh kursor
    const nearest = findNearestHotspot(lat, lng);
    if (nearest && nearest.distKm <= 35) {
      // Ada klaster titik panas satelit dalam radius 35 km
      brightnessVal = nearest.point[3];
      confidenceVal = nearest.point[4];
      isEmergency = nearest.point[2] === 1;
      statusDesc = isEmergency
        ? `Klaster DARURAT terdekat (~${nearest.distKm.toFixed(1)} km) &middot; Brightness: ${brightnessVal} K, Conf: ${confidenceVal}%`
        : `Klaster AMAN terdekat (~${nearest.distKm.toFixed(1)} km) &middot; Brightness: ${brightnessVal} K, Conf: ${confidenceVal}%`;
    } else {
      // Area aman / jauh dari titik kebakaran aktif
      brightnessVal = 308.2;
      confidenceVal = 82;
      isEmergency = false;
      statusDesc = "Area Aman / Terkendali (Tidak terdeteksi titik kebakaran aktif di sekitar lokasi)";
    }
  }

  $("brightness").value = brightnessVal;
  $("confidence").value = confidenceVal;
  showError($("form-error"), "");

  if (pickMarker) map.removeLayer(pickMarker);
  const color = isEmergency ? "#dc2626" : "#d97706";
  pickMarker = L.circleMarker([lat, lng], {
    radius: 7,
    color: color,
    fillColor: color,
    fillOpacity: 0.85,
    weight: 2,
  }).addTo(map);

  pickMarker.bindPopup(`
    <div style="font-family: Tahoma, sans-serif; font-size: 11px; line-height: 1.4;">
      <strong style="color: ${color}">📍 ${isEmergency ? "ZONA DARURAT (Prioritas Pemadaman)" : "ZONA AMAN (Terkendali)"}</strong><br>
      <b>Koordinat:</b> (${lat}, ${lng})<br>
      <b>Brightness:</b> ${brightnessVal} K &middot; <b>Conf:</b> ${confidenceVal}%<br>
      <small style="color: #444">${statusDesc}</small><br>
      <button type="button" class="xp-btn" style="margin-top:6px; width: 100%; font-size: 11px; padding: 3px 6px;" onclick="document.getElementById('predict-form').requestSubmit ? document.getElementById('predict-form').requestSubmit() : document.getElementById('btn-predict').click()">⚡ Klasifikasikan Titik Ini</button>
    </div>
  `).openPopup();

  setStatus(`Koordinat dipilih: (${lat}, ${lng}) &mdash; ${statusDesc}`);
}

map.on("click", (e) => {
  const lat = +e.latlng.lat.toFixed(5);
  const lng = +e.latlng.lng.toFixed(5);
  handleMapSelection(lat, lng);
});

async function loadMapHotspots() {
  try {
    const res = await fetch((window.API_BASE || "") + "/api/eda?section=sebaran");
    if (!res.ok) return;
    const data = await res.json();
    const pts = (data.sebaran && data.sebaran.points) || [];
    hotspotsData = pts;

    hotspotLayer.clearLayers();
    pts.forEach((p) => {
      const [lat, lon, risk, br, cf] = p;
      const isDar = risk === 1;
      const marker = L.circleMarker([lat, lon], {
        renderer: hotspotCanvas,
        radius: isDar ? 3.5 : 2.5,
        color: isDar ? "#b91c1c" : "#b45309",
        fillColor: isDar ? "#ef4444" : "#f59e0b",
        fillOpacity: isDar ? 0.75 : 0.65,
        weight: isDar ? 0.6 : 0.5,
      });
      marker.on("click", (ev) => {
        L.DomEvent.stopPropagation(ev);
        handleMapSelection(lat, lon, p);
      });
      marker.addTo(hotspotLayer);
    });
  } catch (err) {
    console.warn("Peta titik panas satelit tidak dapat dimuat:", err);
  }
}

function addResultMarker(r, label) {
  const color = r.label === 1 ? "#dc2626" : "#d97706";
  const m = L.circleMarker([r.input.latitude, r.input.longitude], {
    radius: r.label === 1 ? 10 : 7, color, fillColor: color, fillOpacity: 0.85, weight: 2.5,
  });
  m.bindPopup(
    `<div style="font-family: Tahoma, sans-serif; font-size: 11.5px; line-height: 1.4;">` +
    `<strong style="color:${color}">HASIL: ${r.status}</strong>${label ? " &middot; #" + label : ""}<br>` +
    `<b>P(Darurat):</b> ${r.probabilitas.darurat}% &middot; <b>P(Aman):</b> ${r.probabilitas.aman}%<br>` +
    `<b>Koordinat:</b> (${r.input.latitude}, ${r.input.longitude})<br>` +
    `<b>Brightness:</b> ${r.input.brightness} K &middot; <b>Conf:</b> ${r.input.confidence}%<br>` +
    `<small style="color:#444">Tindakan: ${escapeHtml(r.tindakan)}</small>` +
    `</div>`
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
const winPublikasi = $("pub-window");
const taskBtnKlasifikasi = $("task-btn-klasifikasi");
const taskBtnEda = $("task-btn-eda");
const taskBtnPublikasi = $("task-btn-publikasi");

function openFeature(target) {
  if (!isLoggedIn()) return;
  const isMobile = window.innerWidth <= 900;

  if (target === "klasifikasi") {
    if (winKlasifikasi) {
      winKlasifikasi.hidden = false;
      winKlasifikasi.style.display = "";
      winKlasifikasi.classList.remove("minimized");
      winKlasifikasi.classList.add("focused");
    }
    if (winEda) {
      winEda.classList.remove("focused");
      if (isMobile) {
        winEda.hidden = true;
        winEda.style.display = "none";
      }
    }
    if (winPublikasi) {
      winPublikasi.classList.remove("focused");
      if (isMobile) {
        winPublikasi.hidden = true;
        winPublikasi.style.display = "none";
      }
    }
    if (taskBtnKlasifikasi) taskBtnKlasifikasi.classList.add("active");
    if (taskBtnEda) taskBtnEda.classList.remove("active");
    if (taskBtnPublikasi) taskBtnPublikasi.classList.remove("active");
    if (isMobile) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
    setTimeout(() => { if (typeof map !== "undefined" && map) map.invalidateSize(); }, 80);
    setTimeout(() => { if (typeof map !== "undefined" && map) map.invalidateSize(); }, 300);
  } else if (target === "eda") {
    if (winEda) {
      winEda.hidden = false;
      winEda.style.display = "";
      winEda.classList.remove("minimized");
      winEda.classList.add("focused");
    }
    if (winKlasifikasi) {
      winKlasifikasi.classList.remove("focused");
      if (isMobile) {
        winKlasifikasi.hidden = true;
        winKlasifikasi.style.display = "none";
      }
    }
    if (winPublikasi) {
      winPublikasi.classList.remove("focused");
      if (isMobile) {
        winPublikasi.hidden = true;
        winPublikasi.style.display = "none";
      }
    }
    if (taskBtnEda) taskBtnEda.classList.add("active");
    if (taskBtnKlasifikasi) taskBtnKlasifikasi.classList.remove("active");
    if (taskBtnPublikasi) taskBtnPublikasi.classList.remove("active");
    if (isMobile) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
    if (typeof window.edaInit === "function") window.edaInit();
    if (typeof window.edaInvalidateMap === "function") window.edaInvalidateMap();
  } else if (target === "publikasi") {
    if (winPublikasi) {
      winPublikasi.hidden = false;
      winPublikasi.style.display = "";
      winPublikasi.classList.remove("minimized");
      winPublikasi.classList.add("focused");
    }
    if (winKlasifikasi) {
      winKlasifikasi.classList.remove("focused");
      if (isMobile) {
        winKlasifikasi.hidden = true;
        winKlasifikasi.style.display = "none";
      }
    }
    if (winEda) {
      winEda.classList.remove("focused");
      if (isMobile) {
        winEda.hidden = true;
        winEda.style.display = "none";
      }
    }
    if (taskBtnPublikasi) taskBtnPublikasi.classList.add("active");
    if (taskBtnKlasifikasi) taskBtnKlasifikasi.classList.remove("active");
    if (taskBtnEda) taskBtnEda.classList.remove("active");
    if (isMobile) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }
}
window.openFeature = openFeature;
window.focusWindow = openFeature;

function isWindowActive(win) {
  if (!win) return false;
  if (win.hidden || win.style.display === "none") return false;
  if (win.classList.contains("minimized")) return false;
  return win.classList.contains("focused");
}

function toggleFeature(target) {
  if (!isLoggedIn()) return;
  let win, tb;
  if (target === "klasifikasi") { win = winKlasifikasi; tb = taskBtnKlasifikasi; }
  else if (target === "eda") { win = winEda; tb = taskBtnEda; }
  else if (target === "publikasi") { win = winPublikasi; tb = taskBtnPublikasi; }

  if (isWindowActive(win)) {
    // Jendela sedang terbuka dan aktif di layar -> minimalkan
    win.classList.add("minimized");
    win.classList.remove("focused");
    if (tb) tb.classList.remove("active");
  } else {
    // Jendela terminimalkan / tertutup / di latar belakang -> buka dan fokuskan
    openFeature(target);
  }
}
window.toggleFeature = toggleFeature;

if (taskBtnKlasifikasi) {
  taskBtnKlasifikasi.addEventListener("click", () => toggleFeature("klasifikasi"));
}
if (taskBtnEda) {
  taskBtnEda.addEventListener("click", () => toggleFeature("eda"));
}
if (taskBtnPublikasi) {
  taskBtnPublikasi.addEventListener("click", () => toggleFeature("publikasi"));
}

if (winKlasifikasi) {
  winKlasifikasi.addEventListener("mousedown", () => openFeature("klasifikasi"));
}
if (winEda) {
  winEda.addEventListener("mousedown", () => openFeature("eda"));
}
if (winPublikasi) {
  winPublikasi.addEventListener("mousedown", () => openFeature("publikasi"));
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

/* Kontrol Jendela Klasifikasi Karhutla */
const btnKlasMin = $("btn-min");
const btnKlasMax = $("btn-max");
const btnKlasClose = $("btn-close");

if (btnKlasMin) {
  btnKlasMin.addEventListener("mousedown", (e) => e.stopPropagation());
  btnKlasMin.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!isLoggedIn()) return;
    if (winKlasifikasi) {
      winKlasifikasi.classList.add("minimized");
      winKlasifikasi.classList.remove("focused");
    }
    if (taskBtnKlasifikasi) taskBtnKlasifikasi.classList.remove("active");
  });
}

if (btnKlasMax) {
  btnKlasMax.addEventListener("mousedown", (e) => e.stopPropagation());
  btnKlasMax.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!isLoggedIn()) return;
    if (winKlasifikasi) winKlasifikasi.classList.toggle("maximized");
    setTimeout(() => { if (typeof map !== "undefined" && map) map.invalidateSize(); }, 60);
  });
}

if (btnKlasClose) {
  btnKlasClose.addEventListener("mousedown", (e) => e.stopPropagation());
  btnKlasClose.addEventListener("click", (e) => {
    e.stopPropagation();
    if (winKlasifikasi) {
      winKlasifikasi.hidden = true;
      winKlasifikasi.style.display = "none";
      winKlasifikasi.classList.remove("focused");
      winKlasifikasi.classList.remove("minimized");
    }
    if (taskBtnKlasifikasi) taskBtnKlasifikasi.classList.remove("active");
  });
}

/* Kontrol Jendela Publikasi SINTA 4 (Minimalkan, Maksimalkan, Tutup) */
function minimizePublikasi() {
  if (!isLoggedIn()) return;
  if (winPublikasi) {
    winPublikasi.classList.add("minimized");
    winPublikasi.classList.remove("focused");
  }
  if (taskBtnPublikasi) taskBtnPublikasi.classList.remove("active");
}

function maximizePublikasi() {
  if (!isLoggedIn()) return;
  if (winPublikasi) {
    winPublikasi.classList.toggle("maximized");
  }
}

function closePublikasi() {
  if (winPublikasi) {
    winPublikasi.hidden = true;
    winPublikasi.style.display = "none";
    winPublikasi.classList.remove("focused");
    winPublikasi.classList.remove("minimized");
  }
  if (taskBtnPublikasi) taskBtnPublikasi.classList.remove("active");
}
window.minimizePublikasi = minimizePublikasi;
window.maximizePublikasi = maximizePublikasi;
window.closePublikasi = closePublikasi;

const btnPubMin = $("btn-pub-min");
const btnPubMax = $("btn-pub-max");
const btnPubClose = $("btn-pub-close");

if (btnPubMin) {
  btnPubMin.addEventListener("mousedown", (e) => e.stopPropagation());
  btnPubMin.addEventListener("click", (e) => {
    e.stopPropagation();
    minimizePublikasi();
  });
}

if (btnPubMax) {
  btnPubMax.addEventListener("mousedown", (e) => e.stopPropagation());
  btnPubMax.addEventListener("click", (e) => {
    e.stopPropagation();
    maximizePublikasi();
  });
}

if (btnPubClose) {
  btnPubClose.addEventListener("mousedown", (e) => e.stopPropagation());
  btnPubClose.addEventListener("click", (e) => {
    e.stopPropagation();
    closePublikasi();
  });
}

/* Salin Format Sitasi Naskah */
const CITATION_APA = `Saturnsz, et al. (2026). Klasifikasi Wilayah Pemadaman Kebakaran Hutan dan Lahan di Kalimantan Menggunakan Algoritma Gaussian Naive Bayes Berbasis Citra Satelit NASA FIRMS (MODIS). JUSIFOR (Jurnal Sistem Informasi dan Informatika), On Going (In Review).`;

const CITATION_BIBTEX = `@article{karhutla_jusifor_2026,
  title = {Klasifikasi Wilayah Pemadaman Kebakaran Hutan dan Lahan di Kalimantan Menggunakan Algoritma Gaussian Naive Bayes Berbasis Citra Satelit NASA FIRMS (MODIS)},
  author = {Saturnsz and Tim Peneliti},
  journal = {JUSIFOR (Jurnal Sistem Informasi dan Informatika)},
  year = {2026},
  note = {Status: On Going / In Review (Target SINTA 4)}
}`;

async function copyCitation(type) {
  const text = type === "bib" ? CITATION_BIBTEX : CITATION_APA;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    showDialog("Sitasi Disalin", `Sitasi format ${type.toUpperCase()} berhasil disalin ke clipboard!`, "info");
    setStatus(`Sitasi format ${type.toUpperCase()} disalin`);
  } catch (err) {
    showDialog("Gagal Menyalin", "Tidak dapat menyalin sitasi otomatis. Silakan salin manual dari teks naskah.", "error");
  }
}

if ($("btn-copy-apa")) {
  $("btn-copy-apa").addEventListener("click", () => copyCitation("apa"));
}
if ($("btn-copy-bib")) {
  $("btn-copy-bib").addEventListener("click", () => copyCitation("bib"));
}

function applyPreset(name) {
  const p = PRESETS[name];
  if (!p) return;
  FIELDS.forEach((f) => ($(f).value = p[f]));
  showError($("form-error"), "");
  activateTab("single");
  focusWindow("klasifikasi");

  handleMapSelection(p.latitude, p.longitude, [p.latitude, p.longitude, p.brightness >= 335 ? 1 : 0, p.brightness, p.confidence]);
  map.setView([p.latitude, p.longitude], Math.max(map.getZoom(), 7));
  setStatus(`Contoh dimuat: ${p.label || name}`);
}

function runAction(action) {
  closeMenus();
  if (!isLoggedIn() && action !== "about" && action !== "exit") {
    return;
  }
  if (action === "open-klasifikasi") return openFeature("klasifikasi");
  if (action === "open-eda") return openFeature("eda");
  if (action === "open-publikasi") return openFeature("publikasi");
  if (action === "close-klasifikasi") {
    if (winKlasifikasi) {
      winKlasifikasi.hidden = true;
      winKlasifikasi.style.display = "none";
      winKlasifikasi.classList.remove("focused");
      winKlasifikasi.classList.remove("minimized");
    }
    if (taskBtnKlasifikasi) taskBtnKlasifikasi.classList.remove("active");
    return;
  }
  if (action === "close-eda") {
    if (winEda) {
      winEda.hidden = true;
      winEda.style.display = "none";
      winEda.classList.remove("focused");
      winEda.classList.remove("minimized");
    }
    if (taskBtnEda) taskBtnEda.classList.remove("active");
    return;
  }
  if (action === "close-publikasi") return closePublikasi();
  if (action === "copy-citation-apa") return copyCitation("apa");
  if (action === "copy-citation-bib") return copyCitation("bib");
  if (action === "open-sinta-portal") {
    window.open("https://sinta.kemdikbud.go.id/", "_blank", "noopener,noreferrer");
    return;
  }
  if (action === "open-jusifor-info") {
    showDialog(
      "Informasi Jurnal JUSIFOR",
      "JUSIFOR (Jurnal Sistem Informasi dan Informatika) adalah jurnal ilmiah terakreditasi SINTA Peringkat 4 oleh Kemendikbudristek RI. Publikasi sistem ini sedang dalam proses review dan persiapan penerbitan naskah (On Going / Coming Soon).",
      "info"
    );
    return;
  }
  if (action === "about-pub") {
    return showDialog(
      "Tentang Publikasi SINTA 4",
      "Naskah ilmiah ini mendokumentasikan metodologi riset, dataset satelit NASA FIRMS MODIS (24.414 observasi Kalimantan), algoritma Gaussian Naive Bayes, serta implementasi sistem cerdas ini.\nStatus saat ini: On Going / Coming Soon.",
      "info"
    );
  }
  if (action.startsWith("tab-")) {
    openFeature("klasifikasi");
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
  try {
    return sessionStorage.getItem(AUTH_KEY) === "admin";
  } catch (e) {
    return false;
  }
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
    openFeature("klasifikasi");
    if (taskBtnKlasifikasi) taskBtnKlasifikasi.disabled = false;
    if (taskBtnEda) taskBtnEda.disabled = false;
    if (taskBtnPublikasi) taskBtnPublikasi.disabled = false;
    if (userDisplay) userDisplay.textContent = "Administrator (admin)";
    if (statusUser) statusUser.textContent = "👤 Admin: Aktif";
  } else {
    if (loginOverlay) {
      loginOverlay.hidden = false;
      loginOverlay.style.display = "grid";
    }
    if (winKlasifikasi) {
      winKlasifikasi.hidden = true;
      winKlasifikasi.style.display = "none";
      winKlasifikasi.classList.remove("focused");
      winKlasifikasi.classList.remove("minimized");
    }
    if (winEda) {
      winEda.hidden = true;
      winEda.style.display = "none";
      winEda.classList.remove("focused");
      winEda.classList.remove("minimized");
    }
    if (winPublikasi) {
      winPublikasi.hidden = true;
      winPublikasi.style.display = "none";
      winPublikasi.classList.remove("focused");
      winPublikasi.classList.remove("minimized");
    }
    if (taskBtnKlasifikasi) {
      taskBtnKlasifikasi.classList.remove("active");
      taskBtnKlasifikasi.disabled = true;
    }
    if (taskBtnEda) {
      taskBtnEda.classList.remove("active");
      taskBtnEda.disabled = true;
    }
    if (taskBtnPublikasi) {
      taskBtnPublikasi.classList.remove("active");
      taskBtnPublikasi.disabled = true;
    }
    if (userDisplay) userDisplay.textContent = "Tamu (Belum Masuk)";
    if (statusUser) statusUser.textContent = "🔒 Terkunci";
    const passInput = $("login-password");
    if (passInput) passInput.value = "admin";
    showError($("login-error"), "");
    const errEl = $("login-error");
    if (errEl) errEl.removeAttribute("style");
  }
}

function handleLogin(e) {
  if (e) e.preventDefault();
  const u = $("login-username").value.trim();
  const p = $("login-password").value;
  const errEl = $("login-error");
  showError(errEl, "");

  if (u === ADMIN_USER && p === ADMIN_PASS) {
    try {
      sessionStorage.setItem(AUTH_KEY, "admin");
      localStorage.removeItem(AUTH_KEY);
    } catch (e) {}
    updateAuthUI();
    setStatus("Selamat datang, Administrator.");
  } else {
    showError(errEl, "Nama pengguna atau kata sandi salah. Gunakan username: admin dan password: admin.");
    $("login-password").focus();
  }
}

function handleLogout() {
  try {
    sessionStorage.removeItem(AUTH_KEY);
    localStorage.removeItem(AUTH_KEY);
  } catch (e) {}
  updateAuthUI();
  setStatus("Sesi telah keluar (Log Off). Silakan masuk kembali.");
  const errEl = $("login-error");
  if (errEl) {
    errEl.textContent = "Sesi telah keluar (Log Off). Silakan klik 'Masuk (Log On)' untuk masuk kembali.";
    errEl.hidden = false;
    errEl.style.color = "#854d0e";
    errEl.style.borderColor = "#fef08a";
    errEl.style.background = "#fefce8";
  }
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
loadMapHotspots();
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
