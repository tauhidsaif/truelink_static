// s.js — static client: generate/gmail/whatsapp modals, client-side QR generation & download, recent list
const el = (id) => document.getElementById(id);

// message helper
function setMsg(text, isError = true) {
  const msg = el("msg");
  if (!msg) return;
  msg.textContent = text || "";
  msg.classList.toggle("text-red-600", !!isError);
  msg.classList.toggle("text-green-600", !isError);
  if (text) setTimeout(() => { if (msg.textContent === text) msg.textContent = ""; }, 2200);
}

// LZ-String encode/decode with safe fallback
function encodePayload(obj) {
  try { return LZString.compressToEncodedURIComponent(JSON.stringify(obj)); }
  catch (e) { return encodeURIComponent(btoa(JSON.stringify(obj))); }
}
function tryDecodePayload(s) {
  if (!s) return null;
  try {
    if (typeof LZString !== "undefined" && LZString.decompressFromEncodedURIComponent) {
      const dec = LZString.decompressFromEncodedURIComponent(s);
      if (dec) return JSON.parse(dec);
    }
  } catch (e) {}
  try {
    const decoded = decodeURIComponent(s);
    try { return JSON.parse(atob(decoded)); } catch(e) {}
    try { return JSON.parse(atob(s)); } catch(e) {}
  } catch (e) {}
  return null;
}

function buildStaticLink(url) {
  const payload = { u: url };
  return `${window.location.origin}/o.html#${encodePayload(payload)}`;
}

// --- client-side QR generation (qrcodejs) ---
// offscreen container for rendering temporary QR canvases
let __qrContainer = null;
function ensureQrContainer() {
  if (__qrContainer) return __qrContainer;
  __qrContainer = document.createElement("div");
  __qrContainer.style.position = "fixed";
  __qrContainer.style.left = "-9999px";
  __qrContainer.style.top = "-9999px";
  document.body.appendChild(__qrContainer);
  return __qrContainer;
}

// render visible QR (into #qrcodeVisible)
function renderVisibleQr(text, size = 160) {
  const wrap = document.getElementById("qrcodeVisible");
  if (!wrap) return;
  wrap.innerHTML = ""; // clear
  new QRCode(wrap, { text, width: size, height: size, correctLevel: QRCode.CorrectLevel.M });
}

// generate dataURL (PNG) from qrcodejs output (returns Promise)
function generateQrDataUrl(text, size = 600) {
  return new Promise((resolve, reject) => {
    try {
      const c = ensureQrContainer();
      c.innerHTML = "";
      const qdiv = document.createElement("div");
      c.appendChild(qdiv);
      new QRCode(qdiv, { text, width: size, height: size, correctLevel: QRCode.CorrectLevel.M });
      // allow a short tick for rendering
      setTimeout(() => {
        const canvas = qdiv.querySelector("canvas");
        if (canvas) {
          resolve(canvas.toDataURL("image/png"));
          return;
        }
        const img = qdiv.querySelector("img");
        if (img) {
          const canvas2 = document.createElement("canvas");
          canvas2.width = size; canvas2.height = size;
          const ctx = canvas2.getContext("2d");
          ctx.drawImage(img, 0, 0, size, size);
          resolve(canvas2.toDataURL("image/png"));
          return;
        }
        reject(new Error("QR render failed"));
      }, 50);
    } catch (err) { reject(err); }
  });
}

function downloadDataUrl(dataUrl, filename = "qrcode.png") {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// create from typed URL (Generate button)
async function createFromInput() {
  const url = el("url").value.trim();
  const slug = el("slug").value.trim();
  if (!url) { setMsg("Enter a URL."); return; }
  const isHttp = /^https?:\/\//i.test(url);
  const isMailto = /^mailto:/i.test(url);
  if (!isHttp && !isMailto) { setMsg("Enter a valid http/https or mailto: URL."); return; }
  await createLinkFromUrl(url, slug);
}

// create link, show result, render visible QR and wire download
async function createLinkFromUrl(url, slug) {
  const link = buildStaticLink(url);

  el("resultBox").classList.remove("hidden");
  el("shortLink").href = link;
  el("shortLink").textContent = link;
  el("btnOpen").href = link;

  // render visible QR
  renderVisibleQr(link, 160);

  // download button uses generateQrDataUrl
  const dl = el("downloadQR");
  dl.onclick = async (e) => {
    e.preventDefault();
    dl.disabled = true;
    const dataUrl = await generateQrDataUrl(link, 800).catch((err) => { console.error(err); setMsg("QR generation failed"); return null; });
    if (dataUrl) downloadDataUrl(dataUrl, "qrcode.png");
    dl.disabled = false;
  };

  // store recent
  let recent = JSON.parse(localStorage.getItem("recentLinks") || "[]");
  recent.unshift({ shortUrl: link, url, slug: slug || "", createdAt: Date.now() });
  if (recent.length > 50) recent.pop();
  localStorage.setItem("recentLinks", JSON.stringify(recent));

  setMsg("Link created!", false);
  await loadRecent();
}

// modals open/close
function openModal(id) { const m = el(id); if (!m) return; m.classList.remove("hidden"); m.classList.add("flex"); }
function closeModal(id) { const m = el(id); if (!m) return; m.classList.add("hidden"); m.classList.remove("flex"); }

// WhatsApp create
async function waCreateHandler() {
  const num = (el("waNumber").value || "").trim();
  const msg = (el("waMessage").value || "").trim();
  if (!num) { setMsg("Phone number required."); return; }
  const digits = num.replace(/\D/g, "");
  if (!/^\d{6,15}$/.test(digits)) { setMsg("Enter a valid phone number (6–15 digits)."); return; }
  const encoded = encodeURIComponent(msg || "Hello");
  const waUrl = `https://wa.me/${encodeURIComponent(digits)}?text=${encoded}`;
  closeModal("modalWA");
  el("waNumber").value = ""; el("waMessage").value = "";
  await createLinkFromUrl(waUrl, "");
}

// Gmail create
async function gCreateHandler() {
  const email = (el("gEmail").value || "").trim();
  const subject = (el("gSubject").value || "").trim();
  const body = (el("gBody").value || "").trim();
  if (!email) { setMsg("Email required."); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setMsg("Enter a valid email address."); return; }
  const params = new URLSearchParams();
  if (subject) params.set("subject", subject);
  if (body) params.set("body", body);
  const mailto = `mailto:${encodeURIComponent(email)}${params.toString() ? "?" + params.toString() : ""}`;
  closeModal("modalG");
  el("gEmail").value = ""; el("gSubject").value = ""; el("gBody").value = "";
  await createLinkFromUrl(mailto, "");
}

// recent list
function fmtTime(ts){ try { return new Date(ts).toLocaleString(); } catch { return ""; } }

// load recent and attach handlers (including QR download per-item)
async function loadRecent() {
  const wrap = el("recent");
  if (!wrap) return;
  wrap.innerHTML = "";

  let data = JSON.parse(localStorage.getItem("recentLinks") || "[]");
  if (!data.length) { wrap.innerHTML = '<div class="text-gray-500">No links yet.</div>'; return; }

  data.forEach((r) => {
    const row = document.createElement("div");
    row.className = "flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border border-gray-200 rounded-lg p-3";
    row.innerHTML = `
      <div class="min-w-0 w-full sm:w-auto">
        <div class="font-medium truncate">${r.shortUrl}</div>
        <div class="text-gray-500 truncate">→ ${r.url}</div>
        <div class="text-xs text-gray-400 mt-0.5">${fmtTime(r.createdAt || Date.now())}</div>
      </div>
      <div class="flex items-center gap-2 shrink-0 recent-actions">
        <a class="text-sm underline" href="${r.shortUrl}" target="_blank" rel="noreferrer">Open</a>
        <button class="text-sm underline" data-copy="${r.shortUrl}">Copy</button>
        <button class="text-sm underline" data-download-qr="${r.shortUrl}">Download QR</button>
        <button class="text-sm text-red-600 underline" data-delete-short="${r.shortUrl}">Delete</button>
      </div>
    `;
    wrap.appendChild(row);
  });

  // copy handlers
  wrap.querySelectorAll("[data-copy]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const text = btn.getAttribute("data-copy");
      try { await navigator.clipboard.writeText(text); }
      catch {
        const tmp = document.createElement("textarea"); tmp.value = text; document.body.appendChild(tmp); tmp.select(); document.execCommand("copy"); document.body.removeChild(tmp);
      }
      const old = btn.textContent; btn.textContent = "Copied"; setTimeout(() => (btn.textContent = old), 1200);
    });
  });

  // per-item QR download (uses client-side generation)
  wrap.querySelectorAll("[data-download-qr]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const shortUrl = btn.getAttribute("data-download-qr");
      btn.disabled = true; const old = btn.textContent; btn.textContent = "Preparing...";
      const dataUrl = await generateQrDataUrl(shortUrl, 800).catch((err) => { console.error(err); setMsg("QR generation failed"); return null; });
      if (dataUrl) downloadDataUrl(dataUrl, "qrcode.png");
      btn.disabled = false; btn.textContent = old;
    });
  });

  // delete handlers
  wrap.querySelectorAll("[data-delete-short]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const shortUrl = btn.getAttribute("data-delete-short");
      let recent = JSON.parse(localStorage.getItem("recentLinks") || "[]");
      recent = recent.filter(x => x.shortUrl !== shortUrl);
      localStorage.setItem("recentLinks", JSON.stringify(recent));
      await loadRecent();
      setMsg("Deleted", false);
    });
  });
}

// Event bindings
addEventListener("DOMContentLoaded", () => {
  el("btnGen")?.addEventListener("click", createFromInput);

  el("btnWhatsApp")?.addEventListener("click", () => openModal("modalWA"));
  el("waCancel")?.addEventListener("click", () => closeModal("modalWA"));
  el("waCreate")?.addEventListener("click", waCreateHandler);

  el("btnGmail")?.addEventListener("click", () => openModal("modalG"));
  el("gCancel")?.addEventListener("click", () => closeModal("modalG"));
  el("gCreate")?.addEventListener("click", gCreateHandler);

  el("btnCopy")?.addEventListener("click", async () => {
    const t = el("shortLink").textContent; if (!t) return;
    try { await navigator.clipboard.writeText(t); } catch {
      const tmp = document.createElement("textarea"); tmp.value = t; document.body.appendChild(tmp); tmp.select(); document.execCommand("copy"); document.body.removeChild(tmp);
    }
    const b = el("btnCopy"); const old = b.textContent; b.textContent = "Copied"; setTimeout(() => (b.textContent = old), 1200);
  });

  el("btnRefresh")?.addEventListener("click", loadRecent);

  loadRecent();
});
