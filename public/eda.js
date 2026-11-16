/* Fitur 2: Eksplorasi Data Satelit Karhutla Kalimantan (EDA)
   Mengikuti sel-sel EDA pada notebook Karhutla2.ipynb.
   Fitur terpisah dari Klasifikasi Karhutla dengan jendela & peta mandiri. */
(() => {
  const $ = (id) => document.getElementById(id);
  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));

  let edaMap = null;
  let edaLayer = null;
  let edaCanvas = null;
  let EDA = null;

  const fmt = (n) => Number(n).toLocaleString("id-ID");
  const fmt2 = (n) => Number(n).toLocaleString("id-ID", { maximumFractionDigits: 2 });
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  const shortDate = (iso) => `${+iso.slice(8, 10)} ${MONTHS[+iso.slice(5, 7) - 1]}`;

  /* ---------------- Inisialisasi Peta Mandiri EDA ---------------- */
  function initEdaMap() {
    if (edaMap) return;
    const container = $("eda-map");
    if (!container) return;

    edaMap = L.map("eda-map").setView([0.2, 114], 6);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(edaMap);

    L.rectangle([[-4.5, 108.5], [4.5, 119.5]], {
      color: "#c2410c",
      weight: 1.5,
      fill: false,
      dashArray: "6 6",
    }).addTo(edaMap);

    edaLayer = L.layerGroup().addTo(edaMap);
    edaCanvas = L.canvas({ padding: 0.5 });
  }

  window.edaInvalidateMap = function() {
    if (edaMap) {
      setTimeout(() => edaMap.invalidateSize(), 60);
      setTimeout(() => edaMap.invalidateSize(), 260);
    }
  };

  /* ---------------- Data Loader ---------------- */
  async function loadEda() {
    if (EDA) return EDA;
    const res = await fetch((window.API_BASE || "") + "/api/eda");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Data EDA tidak dapat dimuat.");
    EDA = data;
    return EDA;
  }

  function setEdaStatus(text) {
    const el = $("eda-status-text");
    if (el) el.textContent = text;
  }

  function setEdaBusy(busy, text) {
    const p = $("eda-progress");
    if (p) p.hidden = !busy;
    if (text) setEdaStatus(text);
  }

  function showEdaError(msg) {
    const el = $("eda-error");
    if (!el) return;
    el.textContent = msg;
    el.hidden = !msg;
  }

  /* ---------------- Helper SVG Charts (Tanpa Library Tambahan) ---------------- */
  const W = 520, H = 270, M = { l: 52, r: 14, t: 18, b: 44 };
  const iw = W - M.l - M.r, ih = H - M.t - M.b;

  function niceMax(v) {
    const p = Math.pow(10, Math.floor(Math.log10(v || 1)));
    const f = v / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
  }

  function axes(yMax, xLabel, yLabel) {
    let g = "";
    for (let i = 0; i <= 5; i++) {
      const v = (yMax / 5) * i;
      const y = M.t + ih - (v / yMax) * ih;
      g += `<line x1="${M.l}" x2="${W - M.r}" y1="${y}" y2="${y}" class="grid"/>`;
      g += `<text x="${M.l - 6}" y="${y + 4}" text-anchor="end">${fmt(Math.round(v))}</text>`;
    }
    g += `<line x1="${M.l}" x2="${M.l}" y1="${M.t}" y2="${M.t + ih}" class="axis"/>`;
    g += `<line x1="${M.l}" x2="${W - M.r}" y1="${M.t + ih}" y2="${M.t + ih}" class="axis"/>`;
    g += `<text x="${M.l + iw / 2}" y="${H - 6}" text-anchor="middle" class="lbl">${xLabel}</text>`;
    g += `<text transform="translate(12 ${M.t + ih / 2}) rotate(-90)" text-anchor="middle" class="lbl">${yLabel}</text>`;
    return g;
  }

  const svgWrap = (inner, label) =>
    `<svg class="eda-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeHtml(label)}">${inner}</svg>`;

  function lineChart(t) {
    const n = t.jumlah.length;
    const yMax = niceMax(Math.max(...t.jumlah));
    const x = (i) => M.l + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
    const y = (v) => M.t + ih - (v / yMax) * ih;

    let g = axes(yMax, "Tanggal kejadian", "Jumlah titik panas");
    const step = Math.max(1, Math.round(n / 8));
    for (let i = 0; i < n; i += step) {
      g += `<text x="${x(i)}" y="${M.t + ih + 15}" text-anchor="middle" class="tick">${shortDate(t.tanggal[i])}</text>`;
    }
    g += `<polyline fill="none" stroke="#e91e63" stroke-width="2" points="${t.jumlah.map((v, i) => `${x(i)},${y(v)}`).join(" ")}"/>`;
    t.jumlah.forEach((v, i) => {
      g += `<circle cx="${x(i)}" cy="${y(v)}" r="2.6" fill="#e91e63"><title>${shortDate(t.tanggal[i])}: ${fmt(v)} titik</title></circle>`;
    });
    const pi = t.tanggal.indexOf(t.puncak.tanggal);
    if (pi >= 0) {
      const px = x(pi), py = y(t.puncak.jumlah);
      const tx = Math.min(Math.max(px, M.l + 70), W - M.r - 70);
      g += `<circle cx="${px}" cy="${py}" r="5" fill="none" stroke="#000" stroke-width="1.5"/>`;
      g += `<text x="${tx}" y="${py - 8}" text-anchor="middle" class="peak">Puncak: ${fmt(t.puncak.jumlah)} titik (${shortDate(t.puncak.tanggal)})</text>`;
    }
    return svgWrap(g, "Tren jumlah titik panas harian");
  }

  function histChart(h) {
    const n = h.counts.length;
    const yMax = niceMax(Math.max(...h.counts));
    const bw = iw / n;
    const maxEdge = h.edges[h.edges.length - 1] || 200;
    const xv = (v) => M.l + (v / maxEdge) * iw;

    let g = axes(yMax, "FRP (Megawatts)", "Jumlah titik panas");
    h.counts.forEach((c, i) => {
      const bh = (c / yMax) * ih;
      g += `<rect x="${M.l + i * bw + 0.5}" y="${M.t + ih - bh}" width="${bw - 1}" height="${bh}" fill="#d98c8c" stroke="#8a2b2b" stroke-width=".6">` +
           `<title>${h.edges[i]}-${h.edges[i + 1]} MW: ${fmt(c)} titik</title></rect>`;
    });
    for (let v = 0; v <= maxEdge; v += 25) {
      g += `<text x="${xv(v)}" y="${M.t + ih + 15}" text-anchor="middle" class="tick">${v}</text>`;
    }
    const tx = xv(h.threshold);
    g += `<line x1="${tx}" x2="${tx}" y1="${M.t}" y2="${M.t + ih}" stroke="#cc2200" stroke-width="1.6" stroke-dasharray="5 4"/>`;
    g += `<text x="${tx + 5}" y="${M.t + 11}" class="peak" fill="#cc2200">Ambang darurat ${h.threshold} MW</text>`;
    return svgWrap(g, "Distribusi FRP di bawah 200 MW");
  }

  function barChart(rows) {
    const yMax = niceMax(Math.max(...rows.map((r) => r.total)));
    const colors = { D: "#66c2a5", N: "#fc8d62" };
    const names = { D: "Siang (D)", N: "Malam (N)" };
    const slot = iw / rows.length, bw = Math.min(110, slot * 0.6);

    let g = axes(yMax, "Waktu (Day / Night)", "Total titik panas");
    rows.forEach((r, i) => {
      const bh = (r.total / yMax) * ih;
      const bx = M.l + slot * i + (slot - bw) / 2;
      g += `<rect x="${bx}" y="${M.t + ih - bh}" width="${bw}" height="${bh}" fill="${colors[r.kode] || "#8da0cb"}" stroke="#444" stroke-width=".7"/>`;
      g += `<text x="${bx + bw / 2}" y="${M.t + ih - bh - 5}" text-anchor="middle" class="peak">${fmt(r.total)}</text>`;
      g += `<text x="${bx + bw / 2}" y="${M.t + ih + 15}" text-anchor="middle" class="tick">${names[r.kode] || r.kode}</text>`;
    });
    return svgWrap(g, "Perbandingan titik panas siang dan malam");
  }

  /* ---------------- Helper Tabel & Peta ---------------- */
  function table(headers, rows) {
    return `<div class="listview"><table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead>` +
           `<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  }
  const note = (t) => `<p class="eda-note">${t}</p>`;

  function clearEdaMap() {
    if (edaLayer) edaLayer.clearLayers();
  }

  function heatColor(r) {
    const t = Math.sqrt(r);
    const a = [254, 229, 217], b = [153, 0, 13];
    return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(",")})`;
  }

  function starIcon(n, cls) {
    return L.divIcon({ className: "", html: `<div class="eda-star ${cls}">${n}</div>`, iconSize: [24, 24], iconAnchor: [12, 12] });
  }

  function drawPins(rows, cls) {
    initEdaMap();
    clearEdaMap();
    const b = [];
    rows.forEach((r, i) => {
      L.marker([r.latitude, r.longitude], { icon: starIcon(i + 1, cls) })
        .bindPopup(`<strong>#${i + 1}</strong> ${r.acq_date}<br>FRP ${fmt2(r.frp)} MW<br>${r.lokasi ? escapeHtml(r.lokasi) + "<br>" : ""}Lat ${r.latitude}, Lon ${r.longitude}`)
        .addTo(edaLayer);
      b.push([r.latitude, r.longitude]);
    });
    if (b.length && edaMap) edaMap.fitBounds(b, { padding: [40, 40], maxZoom: 8 });
  }

  function updateLegend(mode) {
    const el = $("eda-map-legend");
    if (!el) return;
    if (mode === "heatmap") {
      el.innerHTML = `<div class="heat-legend"><span>Kepadatan Rendah</span><i></i><span>Kepadatan Sangat Tinggi</span></div>`;
    } else if (mode === "sebaran") {
      el.innerHTML = `<span><i class="dot red"></i> Risiko Tinggi (Darurat)</span> ` +
                     `<span><i class="dot" style="background:orange"></i> Risiko Rendah (Aman)</span> ` +
                     `<span><i class="dot dash"></i> Batas Kalimantan</span>`;
    } else if (mode === "top10") {
      el.innerHTML = `<span><i class="dot red"></i> Peringkat Top 10 Titik Terbesar (DARURAT)</span> ` +
                     `<span><i class="dot dash"></i> Batas Kalimantan</span>`;
    } else if (mode === "aman10") {
      el.innerHTML = `<span><i class="dot yellow"></i> Sampel 10 Lokasi Terkendali (AMAN)</span> ` +
                     `<span><i class="dot dash"></i> Batas Kalimantan</span>`;
    } else {
      el.innerHTML = `<span><i class="dot dash"></i> Batas Kalimantan</span> ` +
                     `<span style="color:#666">(Analisis ini berfokus pada grafik/tabel)</span>`;
    }
  }

  /* ---------------- 8 Analisis EDA ---------------- */
  const R = {
    ringkasan(d) {
      initEdaMap();
      clearEdaMap();
      updateLegend("none");
      if (edaMap) edaMap.setView([0.2, 114], 6);

      const s = d.ringkasan;
      const rows = [
        ["Total titik panas (data mentah FIRMS)", fmt(s.total_mentah)],
        ["Setelah filter batas Kalimantan & confidence ≥ 80%", fmt(s.total_kalimantan)],
        [`DARURAT (FRP > ${s.frp_threshold} MW)`, `${fmt(s.darurat)} (${fmt2(s.persen_darurat)}%)`],
        [`AMAN (FRP ≤ ${s.frp_threshold} MW)`, `${fmt(s.aman)} (${fmt2(100 - s.persen_darurat)}%)`],
        ["Rentang tanggal observasi", `${s.tanggal_awal} s.d. ${s.tanggal_akhir}`],
        ["FRP (MW): rata-rata / median / maksimum", `${fmt2(s.frp.mean)} / ${fmt2(s.frp.median)} / ${fmt2(s.frp.max)}`],
        ["Brightness (K): rata-rata / minimum / maksimum", `${fmt2(s.brightness.mean)} / ${fmt2(s.brightness.min)} / ${fmt2(s.brightness.max)}`],
        ["Confidence (%): rata-rata", `${fmt2(s.confidence.mean)}%`],
      ];
      const head = d.head5.map((r) => [r.latitude, r.longitude, r.brightness, r.acq_date, r.acq_time, r.confidence, r.frp, r.daynight]);
      return `<h3>1. Ringkasan Dataset MODIS Kalimantan</h3>${table(["Keterangan", "Nilai Statistik"], rows)}` +
             `<h3>5 Baris Pertama Data Mentah</h3>${table(["Lat", "Lon", "Brightness", "Tanggal", "Waktu", "Conf.", "FRP", "D/N"], head)}` +
             note("Label DARURAT ditetapkan berdasarkan ambang batas FRP &gt; 30 MW (selaras dengan metodologi pelatihan Naive Bayes). 5 baris pertama mentah menunjukkan data mencakup seluruh Indonesia sebelum difilter ke koordinat Kalimantan.");
    },

    sebaran(d) {
      initEdaMap();
      clearEdaMap();
      updateLegend("sebaran");
      d.sebaran.points.forEach(([lat, lon, risk]) => {
        L.circleMarker([lat, lon], risk
          ? { renderer: edaCanvas, radius: 4, color: "#b00000", fillColor: "#ff0000", fillOpacity: 0.85, weight: 0.5 }
          : { renderer: edaCanvas, radius: 2.5, color: "#ff9800", fillColor: "#ffa500", fillOpacity: 0.35, weight: 0 }
        ).addTo(edaLayer);
      });
      if (edaMap) edaMap.fitBounds([[-4.5, 108.5], [4.5, 119.5]]);
      const s = d.sebaran;
      return `<h3>2. Peta Sebaran Titik Panas Spasial</h3>` +
             `<p><span class="dot red"></span> <strong>Risiko Tinggi / Darurat</strong> &nbsp;&nbsp; ` +
             `<span class="dot" style="background:orange"></span> <strong>Risiko Rendah / Aman</strong></p>` +
             note(`Peta di sebelah kanan menampilkan ${fmt(s.dikirim)} titik sampel acak berbobot (maks. 1.500 per kelas) dari total ${fmt(s.total)} titik Kalimantan. ` +
                  `Terlihat konsentrasi titik darurat padat di sepanjang pesisir selatan Kalimantan Barat dan Kalimantan Tengah.`);
    },

    heatmap(d) {
      initEdaMap();
      clearEdaMap();
      updateLegend("heatmap");
      const h = d.heatmap, g = h.grid / 2;
      h.cells.forEach(([lat, lon, c]) => {
        L.rectangle([[lat - g, lon - g], [lat + g, lon + g]], {
          renderer: edaCanvas, stroke: false, fillColor: heatColor(c / h.max), fillOpacity: 0.8,
        }).bindTooltip(`${fmt(c)} titik panas`).addTo(edaLayer);
      });
      if (edaMap) edaMap.fitBounds([[-4.5, 108.5], [4.5, 119.5]]);
      const top = h.cells.slice(0, 3).map((c) => `(${c[0]}, ${c[1]} : ${fmt(c[2])} titik)`).join("; ");
      return `<h3>3. Heatmap Kepadatan Wilayah Rawan Karhutla</h3>` +
             `<div class="heat-legend"><span>Kepadatan Rendah</span><i></i><span>Kepadatan Sangat Tinggi</span></div>` +
             note(`Area sel terpadat (lat, lon): ${top}. ` +
                  `Peta menggunakan estimasi densitas sel grid 0,25&deg;. Klaster utama terkonsentrasi di Ketapang, Kotawaringin Barat, Kapuas, dan Pulang Pisau.`);
    },

    frp(d) {
      initEdaMap();
      clearEdaMap();
      updateLegend("none");
      const h = d.frp, total = h.counts.reduce((a, b) => a + b, 0);
      const mode = h.counts.indexOf(Math.max(...h.counts));
      return `<h3>4. Distribusi Fire Radiative Power (&lt; 200 MW)</h3>${histChart(h)}` +
             note(`Distribusi sangat condong ke kanan (right-skewed): puncak modus kejadian kebakaran berada pada rentang ${h.edges[mode]} &ndash; ${h.edges[mode + 1]} MW. ` +
                  `Ambang batas darurat 30 MW memisahkan api kecil rutin dengan kebakaran besar bertenaga masif. Sebanyak ${fmt(h.di_atas_200)} titik ekstrem memiliki FRP &ge; 200 MW.`);
    },

    siangmalam(d) {
      initEdaMap();
      clearEdaMap();
      updateLegend("none");
      const rows = d.siangmalam;
      const sum = rows.reduce((a, r) => a + r.total, 0);
      const lines = rows.map((r) => `<strong>${r.kode === "D" ? "Siang (D)" : "Malam (N)"}</strong>: ${fmt(r.total)} titik (${fmt2((r.total / sum) * 100)}%), darurat: ${fmt(r.darurat)} titik`);
      return `<h3>5. Perbandingan Kejadian Siang vs Malam</h3>${barChart(rows)}` +
             note(lines.join("<br>") + "<br><small>*Catatan: Deteksi satelit malam lebih banyak dipengaruhi orbit lintasan MODIS dan kontras termal sensor di malam hari.</small>");
    },

    tren(d) {
      initEdaMap();
      clearEdaMap();
      updateLegend("none");
      const t = d.tren;
      return `<h3>6. Tren Titik Panas Harian & Puncak Kebakaran</h3>${lineChart(t)}` +
             note(`Puncak karhutla tertinggi terjadi pada <strong>${shortDate(t.puncak.tanggal)}</strong> dengan <strong>${fmt(t.puncak.jumlah)} titik panas</strong> dalam sehari. ` +
                  `Grafik menunjukkan lonjakan tajam berkala di akhir Agustus dan pertengahan September 2026.`);
    },

    top10(d) {
      drawPins(d.top10, "red");
      updateLegend("top10");
      const rows = d.top10.map((r, i) => [i + 1, r.acq_date, r.lokasi ? escapeHtml(r.lokasi) : "Area Hutan / Lahan", r.latitude, r.longitude, fmt2(r.frp), r.brightness]);
      return `<h3>7. Top 10 Lokasi Prioritas Pemadaman (DARURAT)</h3>${table(["#", "Tanggal", "Wilayah / Lokasi", "Lat", "Lon", "FRP (MW)", "Brightness (K)"], rows)}` +
             note("Diurutkan dari Fire Radiative Power (FRP) tertinggi. Titik-titik ini membutuhkan respon pemadaman darurat segera oleh Manggala Agni / Satgas Karhutla.");
    },

    aman10(d) {
      drawPins(d.aman10, "yellow");
      updateLegend("aman10");
      const rows = d.aman10.map((r, i) => [i + 1, r.acq_date, r.lokasi ? escapeHtml(r.lokasi) : "Area Lahan Terpantau", r.latitude, r.longitude, fmt2(r.frp), r.brightness]);
      return `<h3>8. Sampel 10 Lokasi Terkendali (AMAN)</h3>${table(["#", "Tanggal", "Wilayah / Lokasi", "Lat", "Lon", "FRP (MW)", "Brightness (K)"], rows)}` +
             note("Sampel titik dengan FRP terendah (&le; 30 MW) sebagai pembanding kondisi lahan aman / terkendali.");
    },
  };

  /* ---------------- Handler Tampilan ---------------- */
  async function show() {
    const err = $("eda-error"), out = $("eda-output");
    showEdaError("");
    setEdaBusy(true, "Memuat analisis EDA...");
    try {
      const data = await loadEda();
      initEdaMap();
      const sel = $("eda-select");
      const key = sel ? sel.value : "ringkasan";
      if (out && R[key]) {
        out.innerHTML = R[key](data);
      }
      const labelText = sel && sel.selectedOptions[0] ? sel.selectedOptions[0].textContent.replace(/^\d+\.\s*/, "") : key;
      setEdaStatus(`Analisis: ${labelText}`);
    } catch (e) {
      if (out) out.innerHTML = "";
      showEdaError(e.message);
      setEdaStatus("Gagal memuat EDA");
    } finally {
      setEdaBusy(false);
      window.edaInvalidateMap();
    }
  }

  window.edaInit = function() {
    initEdaMap();
    if (!EDA) {
      show();
    } else {
      window.edaInvalidateMap();
    }
  };

  /* ---------------- Event Listeners ---------------- */
  if ($("eda-select")) {
    $("eda-select").addEventListener("change", show);
  }

  // Pilih analisis dari menu bar dropdown
  document.querySelectorAll("[data-eda-select]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.edaSelect;
      const sel = $("eda-select");
      if (sel) sel.value = key;
      show();
    });
  });

  // Tombol kontrol jendela EDA (Min, Max, Close)
  const edaWin = $("eda-window");
  if ($("btn-eda-min")) {
    $("btn-eda-min").addEventListener("mousedown", (e) => e.stopPropagation());
    $("btn-eda-min").addEventListener("click", (e) => {
      e.stopPropagation();
      if (edaWin) {
        edaWin.classList.add("minimized");
        edaWin.classList.remove("focused");
      }
      const tb = $("task-btn-eda");
      if (tb) tb.classList.remove("active");
    });
  }

  if ($("btn-eda-max")) {
    $("btn-eda-max").addEventListener("mousedown", (e) => e.stopPropagation());
    $("btn-eda-max").addEventListener("click", (e) => {
      e.stopPropagation();
      if (edaWin) edaWin.classList.toggle("maximized");
      window.edaInvalidateMap();
    });
  }

  if ($("btn-eda-close")) {
    $("btn-eda-close").addEventListener("mousedown", (e) => e.stopPropagation());
    $("btn-eda-close").addEventListener("click", (e) => {
      e.stopPropagation();
      if (edaWin) {
        edaWin.hidden = true;
        edaWin.style.display = "none";
        edaWin.classList.remove("focused");
        edaWin.classList.remove("minimized");
      }
      const tb = $("task-btn-eda");
      if (tb) tb.classList.remove("active");
    });
  }

  // Klik jendela EDA untuk memfokuskan
  if (edaWin) {
    edaWin.addEventListener("mousedown", () => {
      if (typeof window.focusWindow === "function") window.focusWindow("eda");
    });
  }

  // Handler menu tambahan EDA
  document.addEventListener("click", (e) => {
    const act = e.target.closest("[data-action]")?.dataset.action;
    if (act === "refresh-eda") {
      EDA = null;
      show();
    } else if (act === "download-eda-json") {
      window.open((window.API_BASE || "") + "/api/eda", "_blank");
    } else if (act === "about-eda") {
      if (typeof window.showDialog === "function") {
        window.showDialog(
          "Tentang Eksplorasi Data (EDA)",
          "Fitur Exploratory Data Analysis (EDA) menyajikan ringkasan 24.414 titik panas satelit NASA FIRMS (MODIS C6.1 NRT) Kalimantan periode Agustus-Oktober 2026. " +
          "Fitur mencakup analisis sebaran spasial, heatmap kepadatan 2D, distribusi FRP, siang vs malam, tren harian puncak karhutla, dan 10 lokasi prioritas.",
          "info"
        );
      }
    }
  });

})();
