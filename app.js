const STORE_KEY = "whatnot_price_lookup_v2";
const $ = (id) => document.getElementById(id);

let rows = [];
let corrections = {};
let sourceFileName = "";
let activePage = "dashboard";

const hardFlagPatterns = [
  { re: /\bbu+y+ing\s+choice\b|\bbuying\s+choice\b/i, reason: "Buying choice / pick-your-item listing" },
  { re: /^\s*choice\s*!?\s*#?\d*\s*$/i, reason: "Choice listing" },
  { re: /\bitem\s+in\s+hand\b/i, reason: "Item-in-hand sale format, not a product title" },
  { re: /\$\s*1\s*starts?/i, reason: "$1-start sale format, not a product title" },
  { re: /\b(as seen on screen|shown on screen|item shown on screen)\b/i, reason: "Screen-only listing" },
  { re: /\b(no cancellations?|no cancel)\b/i, reason: "No-cancel / screen listing" },
  { re: /\b(confirmed\s*\/?\s*open blind box|open blind box|blind box)\b/i, reason: "Blind-box listing" },
  { re: /^\s*smoking accessories\s*(\/|\-|$)/i, reason: "Generic smoking-accessories sale listing" },
  { re: /^\s*knives?!?\s*(🔥|\$|\/|\-|#|$)/i, reason: "Generic knife sale listing" },
  { re: /^\s*random\b/i, reason: "Random/generic listing" },
  { re: /\bmisc(ellaneous)?\b/i, reason: "Miscellaneous listing" },
  { re: /^\s*(auction|lot|product|item)\s*#?\d*\s*$/i, reason: "Generic auction title" }
];

const genericOnlyPatterns = [
  /^knives?!?$/i,
  /^smoking accessories$/i,
  /^jerky$/i,
  /^patch(es)?$/i,
  /^wallet(s)?$/i,
  /^bags?$/i,
  /^product$/i,
  /^item$/i,
  /^accessories$/i
];

const autoPassPatterns = [
  /\bpatch\b/i,
  /\b(removable patch)\b/i,
  /\b(pocket knife|folding knife|knife,|blade|flipper|glyde lock|kizer|kiser|qsp|kershaw|civivi|case|buck|benchmade|spyderco|crkt|cold steel|14c28n|d2|s35vn|s30v)\b/i,
  /\b(zippo|matches|holster|shoulder holster|key|wallet|duffle|tube bag|drawstring tube)\b/i,
  /\b(sz:|size:)\s*\d+/i,
  /\b[A-Z]{2,}[- ][A-Z0-9]{2,}\b/i,
  /\b[A-Z]{2,}\d{2,}[A-Z-]*\b/i
];

const descriptiveWords = [
  "bag", "tube", "duffle", "drawstring", "wallet", "patch", "flipper", "tripper",
  "bear", "hotbox", "laptop", "kizer", "kiser", "task", "maverick", "naturals", "vincent",
  "gordon", "sirron", "norris", "wolf", "timber", "tan", "charcoal", "concrete",
  "black", "forest", "sand", "earth", "midnight", "red", "removable", "yzy", "shoe",
  "sneaker", "penguin", "glyde", "lock", "pocket", "knife", "stainless", "steel", "blade",
  "zippo", "typhoon", "matches", "shoulder", "holster", "williams", "key", "cupcake"
];

const categoryRules = [
  { name: "Knives", re: /\b(knife|knives|blade|flipper|glyde lock|kizer|kiser|qsp|kershaw|civivi|benchmade|spyderco|crkt|cold steel|14c28n|d2|s35vn|s30v)\b/i },
  { name: "Clothes", re: /\b(sz:|size:|shoe|sneaker|shirt|tee|hoodie|jacket|pants|shorts|hat|cap|wallet|duffle|bag|tube|drawstring|yzy|yeezy)\b/i },
  { name: "Fragrances", re: /\b(fragrance|perfume|cologne|edp|edt|extrait|parfum|spray|decant|ml|100ml|50ml|35ml|10ml)\b/i },
  { name: "Accessories", re: /\b(patch|zippo|matches|holster|key|lighter|glass|chillum|smoking accessories|case|stand|display|sticker|pin)\b/i }
];

function parseCSV(text) {
  const result = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], n = text[i + 1];
    if (c === '"' && inQuotes && n === '"') { field += '"'; i++; }
    else if (c === '"') inQuotes = !inQuotes;
    else if (c === "," && !inQuotes) { row.push(field); field = ""; }
    else if ((c === "\n" || c === "\r") && !inQuotes) {
      if (c === "\r" && n === "\n") i++;
      row.push(field); field = "";
      if (row.some(v => v.trim() !== "")) result.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some(v => v.trim() !== "")) result.push(row);
  const headers = result.shift().map(h => h.trim());
  return result.map(r => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""])));
}

function csvEscape(value) {
  const s = String(value ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

function moneyToNumber(v) {
  const n = Number(String(v ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function stripAuctionNumber(title) {
  return String(title || "")
    .replace(/\s+#\d+\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeForFlagging(title) {
  return String(title || "")
    .replace(/[🔥🚀✅⭐️✨!]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasHardFlag(title, description) {
  const raw = `${title || ""} ${description || ""}`.trim();
  const normalized = normalizeForFlagging(raw);
  for (const p of hardFlagPatterns) {
    if (p.re.test(raw) || p.re.test(normalized)) return { uncertain: true, reason: p.reason };
  }
  return null;
}

function hasDescriptiveSignal(cleanTitle) {
  const c = cleanTitle.toLowerCase();
  const words = c.split(/\s+/).filter(Boolean);
  let score = 0;

  if (autoPassPatterns.some(re => re.test(cleanTitle))) return true;
  if (cleanTitle.length >= 12) score++;
  if (words.length >= 3) score++;
  if (/[A-Za-z]\s[-–—/]\s[A-Za-z0-9]/.test(cleanTitle) || /\b\d{1,2}"\b/.test(cleanTitle)) score += 2;
  if (descriptiveWords.some(w => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(cleanTitle))) score++;
  if (/\b[A-Z]{2,}\b/.test(cleanTitle)) score++;
  if (/\b[A-Z]{2,}[A-Z0-9-]*\d+[A-Z0-9-]*\b/.test(cleanTitle)) score += 2;
  if (/\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/.test(cleanTitle) && words.length >= 2) score++;
  return score >= 2;
}

function uncertainty(title, description) {
  const t = String(title || "").trim();
  const d = String(description || "").trim();
  if (!t) return { uncertain: true, reason: "Missing title" };

  const hard = hasHardFlag(t, d);
  if (hard) return hard;

  const clean = stripAuctionNumber(t);
  if (hasDescriptiveSignal(clean)) return { uncertain: false, reason: "Looks specific" };

  if (genericOnlyPatterns.some(re => re.test(clean))) {
    return { uncertain: true, reason: "Generic category title" };
  }
  if (clean.length < 8) return { uncertain: true, reason: "Title too short after cleanup" };
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length <= 2 && /#\d+$/i.test(t)) {
    return { uncertain: true, reason: "Short numbered title needs review" };
  }
  return { uncertain: false, reason: "Looks specific" };
}

function inferCategory(title, description, existingCategory = "") {
  const text = `${title || ""} ${description || ""} ${existingCategory || ""}`.trim();
  for (const rule of categoryRules) if (rule.re.test(text)) return rule.name;
  return existingCategory && existingCategory.trim() ? existingCategory.trim() : "Other";
}

function rowId(row, idx) {
  return [row["order id"], row["order numeric id"], row["product name"], row["processed date"], idx].join("|");
}

function normalizeRows(imported) {
  return imported.map((r, idx) => {
    const id = rowId(r, idx);
    const title = r["product name"] || r["Product Name"] || "";
    const desc = r["product description"] || r["Product Description"] || "";
    const u = uncertainty(title, desc);
    const saved = corrections[id] || {};
    const rawCategory = r["product category"] || r["Product Category"] || "";
    return {
      id,
      raw: r,
      originalTitle: title,
      description: desc,
      cleanTitle: saved.correctedTitle || (u.uncertain ? "" : stripAuctionNumber(title)),
      notes: saved.notes || "",
      uncertain: u.uncertain && !saved.correctedTitle,
      reason: saved.correctedTitle ? "Corrected by user" : u.reason,
      corrected: Boolean(saved.correctedTitle),
      seller: r["seller"] || r["Seller"] || "",
      sold: r["sold price"] || r["Sold Price"] || "",
      total: r["total"] || r["Total"] || "",
      qty: r["quantity"] || r["Quantity"] || "",
      date: r["processed date"] || r["Processed Date"] || "",
      category: saved.category || inferCategory(saved.correctedTitle || title, desc, rawCategory)
    };
  });
}

function saveState() {
  localStorage.setItem(STORE_KEY, JSON.stringify({ corrections, sourceFileName, savedAt: new Date().toISOString() }));
}

function loadState() {
  try {
    const data = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
    corrections = data.corrections || {};
    sourceFileName = data.sourceFileName || "";
  } catch { corrections = {}; }
}

function money(n) { return n.toLocaleString(undefined, { style: "currency", currency: "USD" }); }

function categorySummary() {
  const summary = {};
  for (const r of rows) {
    const cat = r.category || "Other";
    if (!summary[cat]) summary[cat] = { count: 0, spend: 0, review: 0 };
    summary[cat].count++;
    summary[cat].spend += moneyToNumber(r.total || r.sold);
    if (r.uncertain) summary[cat].review++;
  }
  return summary;
}

function updateStats() {
  $("statRows").textContent = rows.length;
  $("statUncertain").textContent = rows.filter(r => r.uncertain).length;
  $("statCorrected").textContent = rows.filter(r => r.corrected).length;
  $("statTotal").textContent = money(rows.reduce((sum, r) => sum + moneyToNumber(r.total || r.sold), 0));
  const hasRows = rows.length > 0;
  ["exportCsvBtn","exportJsonBtn","clearDataBtn","saveAllBtn"].forEach(id => $(id).disabled = !hasRows);
  renderCategoryCards();
}

function renderCategoryCards() {
  const box = $("categoryCards");
  if (!box) return;
  const summary = categorySummary();
  const cats = ["Knives", "Clothes", "Fragrances", "Accessories", "Other"];
  box.innerHTML = cats.map(cat => {
    const s = summary[cat] || { count: 0, spend: 0, review: 0 };
    return `<button class="cat-card" data-cat="${escapeHtml(cat)}">
      <strong>${escapeHtml(cat)}</strong>
      <span>${s.count} items</span>
      <small>${money(s.spend)} • ${s.review} review</small>
    </button>`;
  }).join("");
  box.querySelectorAll(".cat-card").forEach(btn => btn.addEventListener("click", () => {
    activePage = "lookup";
    $("categorySelect").value = btn.dataset.cat;
    setPage("lookup");
    renderTable();
  }));
}

function filteredRows() {
  const q = $("searchInput").value.trim().toLowerCase();
  const f = $("filterSelect").value;
  const cat = $("categorySelect").value;
  const sort = $("sortSelect").value;
  let out = rows.filter(r => {
    if (f === "uncertain" && !r.uncertain) return false;
    if (f === "corrected" && !r.corrected) return false;
    if (f === "confident" && (r.uncertain || r.corrected)) return false;
    if (cat !== "all" && (r.category || "Other") !== cat) return false;
    if (!q) return true;
    return [r.cleanTitle, r.originalTitle, r.seller, r.category, r.description].join(" ").toLowerCase().includes(q);
  });
  out.sort((a,b) => {
    if (sort === "price_desc") return moneyToNumber(b.sold) - moneyToNumber(a.sold);
    if (sort === "price_asc") return moneyToNumber(a.sold) - moneyToNumber(b.sold);
    if (sort === "title_asc") return (a.cleanTitle || a.originalTitle).localeCompare(b.cleanTitle || b.originalTitle);
    if (sort === "category_asc") return (a.category || "Other").localeCompare(b.category || "Other") || (a.cleanTitle || a.originalTitle).localeCompare(b.cleanTitle || b.originalTitle);
    const da = Date.parse(a.date) || 0, db = Date.parse(b.date) || 0;
    return sort === "date_asc" ? da - db : db - da;
  });
  return out;
}

function renderReview() {
  const list = $("reviewList");
  const need = rows.filter(r => r.uncertain).slice(0, 300);
  list.innerHTML = "";
  list.classList.toggle("empty", need.length === 0);
  if (need.length === 0) {
    list.textContent = rows.length ? "No uncertain items currently need review." : "Import a CSV to begin.";
    return;
  }
  const tpl = $("reviewCardTpl");
  for (const r of need) {
    const node = tpl.content.cloneNode(true);
    node.querySelector(".reason").textContent = r.reason;
    node.querySelector(".original").textContent = r.originalTitle || "(missing title)";
    node.querySelector(".desc").textContent = r.description || "No description provided.";
    node.querySelector(".seller").textContent = `Seller: ${r.seller || "Unknown"}`;
    node.querySelector(".price").textContent = `Sold: ${r.sold || "$0.00"}`;
    node.querySelector(".date").textContent = r.date || "";
    const ci = node.querySelector(".correctedInput");
    const ni = node.querySelector(".notesInput");
    const cs = node.querySelector(".categoryInput");
    ci.value = r.cleanTitle || "";
    ni.value = r.notes || "";
    cs.value = r.category || "Other";
    ci.addEventListener("input", () => stageCorrection(r.id, ci.value, ni.value, cs.value));
    ni.addEventListener("input", () => stageCorrection(r.id, ci.value, ni.value, cs.value));
    cs.addEventListener("input", () => stageCorrection(r.id, ci.value, ni.value, cs.value));
    list.appendChild(node);
  }
}

function stageCorrection(id, title, notes, category) {
  const clean = title.trim();
  if (clean) corrections[id] = { correctedTitle: clean, notes: notes.trim(), category: category || "Other", updatedAt: new Date().toISOString() };
  else delete corrections[id];
}

function applyCorrectionsAndRender() {
  rows = rows.map((r) => {
    const saved = corrections[r.id];
    if (!saved) {
      const u = uncertainty(r.originalTitle, r.description);
      return { ...r, cleanTitle: u.uncertain ? "" : stripAuctionNumber(r.originalTitle), corrected: false, uncertain: u.uncertain, reason: u.reason, notes: "", category: inferCategory(r.originalTitle, r.description, r.raw["product category"] || r.raw["Product Category"] || "") };
    }
    return { ...r, cleanTitle: saved.correctedTitle, notes: saved.notes || "", corrected: true, uncertain: false, reason: "Corrected by user", category: saved.category || inferCategory(saved.correctedTitle, r.description, r.category) };
  });
  saveState();
  renderAll();
}

function renderTable() {
  const body = $("tableBody");
  const data = filteredRows();
  body.innerHTML = "";
  if (!data.length) {
    body.innerHTML = `<tr><td colspan="9" class="empty-cell">No matching rows.</td></tr>`;
    return;
  }
  for (const r of data) {
    const tr = document.createElement("tr");
    const status = r.uncertain ? `<span class="status review">Review</span>` : `<span class="status ok">${r.corrected ? "Corrected" : "OK"}</span>`;
    tr.innerHTML = `
      <td>${status}</td>
      <td><span class="category-pill">${escapeHtml(r.category || "Other")}</span></td>
      <td><strong>${escapeHtml(r.cleanTitle || "Needs correction")}</strong>${r.notes ? `<br><small class="muted">${escapeHtml(r.notes)}</small>` : ""}</td>
      <td class="original-small">${escapeHtml(r.originalTitle)}</td>
      <td>${escapeHtml(r.seller)}</td>
      <td>${escapeHtml(r.sold)}</td>
      <td>${escapeHtml(r.total)}</td>
      <td>${escapeHtml(r.qty)}</td>
      <td>${escapeHtml(r.date)}</td>`;
    body.appendChild(tr);
  }
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
}

function exportCleanCsv() {
  const extraHeaders = ["clean_title","lookup_category","needs_review","review_reason","correction_notes"];
  const rawHeaders = Object.keys(rows[0]?.raw || {});
  const allHeaders = [...extraHeaders, ...rawHeaders];
  const lines = [allHeaders.map(csvEscape).join(",")];
  for (const r of rows) {
    const vals = [r.cleanTitle, r.category, r.uncertain ? "YES" : "NO", r.reason, r.notes, ...rawHeaders.map(h => r.raw[h])];
    lines.push(vals.map(csvEscape).join(","));
  }
  download(`whatnot-cleaned-purchases-${dateStamp()}.csv`, lines.join("\n"), "text/csv");
}

function exportJson() {
  download(`whatnot-title-corrections-${dateStamp()}.json`, JSON.stringify({ corrections, sourceFileName, exportedAt: new Date().toISOString() }, null, 2), "application/json");
}

function download(name, text, type) {
  const blob = new Blob([text], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

function dateStamp() { return new Date().toISOString().slice(0,10); }

function setPage(page) {
  activePage = page;
  document.querySelectorAll(".page").forEach(el => el.classList.toggle("hidden", el.dataset.page !== page));
  document.querySelectorAll(".nav-btn").forEach(btn => btn.classList.toggle("active", btn.dataset.page === page));
}

function renderAll() {
  updateStats();
  renderReview();
  renderTable();
}

$("csvFile").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  sourceFileName = file.name;
  const text = await file.text();
  const imported = parseCSV(text);
  rows = normalizeRows(imported);
  saveState();
  renderAll();
});

$("jsonFile").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const data = JSON.parse(await file.text());
  corrections = data.corrections || {};
  applyCorrectionsAndRender();
});

$("saveAllBtn").addEventListener("click", applyCorrectionsAndRender);
$("exportCsvBtn").addEventListener("click", exportCleanCsv);
$("exportJsonBtn").addEventListener("click", exportJson);
$("clearDataBtn").addEventListener("click", () => {
  if (!confirm("Clear saved corrections and the current imported data from this browser?")) return;
  rows = []; corrections = {}; sourceFileName = "";
  localStorage.removeItem(STORE_KEY);
  renderAll();
});
["searchInput","filterSelect","sortSelect","categorySelect"].forEach(id => $(id).addEventListener("input", renderTable));
document.querySelectorAll(".nav-btn").forEach(btn => btn.addEventListener("click", () => setPage(btn.dataset.page)));

loadState();
setPage(activePage);
renderAll();
