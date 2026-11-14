// Cliente de la tarjeta de fidelidad de Nonos. Todo el estado real vive en el servidor.
const $ = (id) => document.getElementById(id);
const ic = (n) => `<svg aria-hidden="true"><use href="icons.svg#i-${n}"/></svg>`;
const RM = matchMedia("(prefers-reduced-motion: reduce)").matches;
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
  del: (k) => { try { localStorage.removeItem(k); } catch {} },
};
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
let cfg, me, token = store.get("nonos-token"), view = "card", prevStamps = null;

async function api(path, body) {
  const r = await fetch("/api" + path, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.error || "Algo salió mal. Intenta de nuevo."); e.status = r.status; throw e; }
  return j;
}
function toast(msg) {
  const t = $("toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(toast.id); toast.id = setTimeout(() => t.classList.remove("show"), 3000);
}
const buzz = (ms = 14) => { try { navigator.vibrate && navigator.vibrate(ms); } catch {} };
const showErr = (id, msg) => { const e = $(id); e.textContent = msg; e.hidden = !msg; };

/* ---------- Navegación ---------- */
function show(name) {
  view = name;
  document.querySelectorAll(".view").forEach((v) => (v.hidden = v.id !== "view-" + name));
  $("loading").hidden = true;
  const inApp = ["card", "rewards", "visit"].includes(name);
  $("tabs").hidden = !inApp;
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("is-on", t.dataset.view === name));
  window.scrollTo(0, 0);
}
$("tabs").addEventListener("click", (e) => { const b = e.target.closest(".tab"); if (b) show(b.dataset.view); });
$("go-recover").onclick = () => show("recover");
$("go-join").onclick = () => show("welcome");
$("btn-logout").onclick = () => { store.del("nonos-token"); token = null; me = null; show("welcome"); };

/* ---------- Registro y recuperación ---------- */
function fillBirthdaySelects() {
  $("j-bd").insertAdjacentHTML("beforeend", Array.from({ length: 31 }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join(""));
  $("j-bm").insertAdjacentHTML("beforeend", MESES.map((m, i) => `<option value="${i + 1}">${m}</option>`).join(""));
}
async function submit(form, btn, fn, errId) {
  btn = btn || form.querySelector("[type=submit]");
  showErr(errId, ""); btn.disabled = true;
  try { await fn(); } catch (e) { showErr(errId, e.message); } finally { btn.disabled = false; }
}
$("form-join").addEventListener("submit", (e) => {
  e.preventDefault();
  submit(e.target, e.submitter, async () => {
    const r = await api("/join", { name: $("j-name").value, phone: $("j-phone").value, pin: $("j-pin").value, bd: $("j-bd").value, bm: $("j-bm").value });
    token = r.token; store.set("nonos-token", token); buzz(); enter(r.card);
    toast("Tu tarjeta está lista");
  }, "j-err");
});
$("form-recover").addEventListener("submit", (e) => {
  e.preventDefault();
  submit(e.target, e.submitter, async () => {
    const r = await api("/recover", { phone: $("r-phone").value, pin: $("r-pin").value });
    token = r.token; store.set("nonos-token", token); enter(r.card);
    toast("Qué bueno verte de nuevo");
  }, "r-err");
});

/* ---------- Tarjeta ---------- */
function enter(card) {
  me = card; renderAll(); show("card");
  const code = sessionStorage.getItem("nonos-pending");
  if (code) { sessionStorage.removeItem("nonos-pending"); handleScanned(code); }
}
function countUp(el, to) {
  const from = +el.textContent || 0;
  if (RM || from === to) return (el.textContent = to);
  const t0 = performance.now();
  (function step(t) {
    const p = Math.min(1, (t - t0) / 600);
    el.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(step);
  })(t0);
}
function nextTier(stamps) { return cfg.tiers.find((t) => t.at > stamps); }
function fmtWait(s) { const m = Math.ceil(s / 60); return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`; }

function renderAll() {
  const goal = cfg.goal, n = me.stamps, prizeAts = cfg.tiers.map((t) => t.at);
  $("holder").textContent = me.name;
  $("goal").textContent = goal;
  countUp($("count"), n);
  const first = prevStamps === null;
  $("stamps").innerHTML = Array.from({ length: goal }, (_, i) => {
    const on = i < n, prize = prizeAts.includes(i + 1), isNew = !first && i >= prevStamps && on;
    const cls = ["stamp", on ? "on" : "", prize ? "prize" : "", isNew ? "new" : first ? "enter" : ""].join(" ");
    return `<li class="${cls}" style="--i:${i}" aria-label="Sello ${i + 1}${on ? ", obtenido" : ""}${prize ? ", premio" : ""}">${prize ? ic("gift") : ic("check")}<span>${i + 1}</span></li>`;
  }).join("");
  prevStamps = n;

  const nt = nextTier(n);
  $("foot").textContent = n >= goal ? "¡Tarjeta completa! Canjea tu premio en caja."
    : nt ? `Te ${nt.at - n === 1 ? "falta 1 sello" : `faltan ${nt.at - n} sellos`} para: ${nt.label.toLowerCase()}.` : "";

  // Banners del día
  const b = [];
  if (me.promo) b.push(`<div class="banner promo">${ic("bolt")}<div><b>Hoy: ${esc(me.promo.label)}</b>Cada visita suma ×${me.promo.mult}.</div></div>`);
  if (me.rewards.some((r) => r.id === "bday")) b.push(`<div class="banner bday">${ic("cake")}<div><b>¡Feliz cumpleaños, ${esc(me.name)}!</b>${esc(cfg.birthday_label)}. Canjéalo hoy en caja.</div></div>`);
  $("banners").innerHTML = b.join("");

  // Botón principal
  const k = me.rewards.length;
  $("btn-caja").innerHTML = k ? `${ic("gift")} Canjear premio <span class="badge">${k}</span>` : `${ic("qr")} Sellar mi visita`;
  $("caja-hint").textContent = me.cooldown_sec > 0 && !k ? `Ya sellaste hoy. Podrás volver a sellar en ${fmtWait(me.cooldown_sec)}.` : "Escanea el QR del mostrador con la cámara de tu celular.";
  $("tab-dot").hidden = !k;

  renderRewards(); renderVisit();
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function renderRewards() {
  const items = cfg.tiers.map((t) => {
    const done = me.claimed.includes(t.id), ready = !done && me.stamps >= t.at;
    return { cls: done ? "done" : ready ? "ready" : "", icon: done ? "check" : "gift", t: t.label,
      s: `A los ${t.at} sellos`, tag: done ? "Canjeado" : ready ? "Disponible" : `Faltan ${t.at - me.stamps}` };
  });
  const bday = me.rewards.some((r) => r.id === "bday");
  items.push({ cls: bday ? "ready" : "", icon: "cake", t: cfg.birthday_label, s: "El día de tu cumpleaños",
    tag: bday ? "Disponible hoy" : me.has_bday ? "Te avisamos ese día" : "Sin fecha registrada" });
  $("timeline").innerHTML = items.map((x, i) => `<li class="step ${x.cls}" style="--i:${i}"><span class="step-ic">${ic(x.icon)}</span><div class="step-body"><p class="step-t">${esc(x.t)}</p><p class="step-s">${x.s}</p><span class="tag">${x.tag}</span></div></li>`).join("");
  const dt = (s) => new Date(s * 1000).toLocaleString("es-CO", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  const lbl = (h) => h.k === "stamp" ? `${h.n > 1 ? h.n + " sellos" : "1 sello"} sumado${h.note ? " · " + esc(h.note) : ""}` : `Canjeaste: ${esc(h.note || "premio")}`;
  $("history").innerHTML = me.history.length
    ? me.history.map((h, i) => `<li class="row" style="--i:${i}">${ic(h.k === "stamp" ? "check" : "gift")}<div class="grow"><p class="row-t">${lbl(h)}</p><p class="row-s">${dt(h.at)}</p></div></li>`).join("")
    : '<li class="empty">Tu primera visita aparecerá aquí.</li>';
}
function renderVisit() {
  $("hours").innerHTML = cfg.hours.map((h) => `<div class="hrow"><span>${esc(h.d)}</span><b>${esc(h.t)}</b></div>`).join("");
  const L = [
    ["pin", "Cómo llegar", cfg.address, cfg.maps],
    ["chat", "Domicilios por WhatsApp", "Pide sin moverte", `https://wa.me/${cfg.whatsapp}?text=${encodeURIComponent("Hola Nonos, quiero hacer un domicilio")}`],
    ["menu", "Ver el menú", "Lo que hay para hoy", cfg.menu],
    ["ig", "Instagram", "@nonoscoffeeshop", cfg.instagram],
    ["star", "Déjanos una reseña", "Cuéntale a otros cómo te fue", cfg.review_url],
  ];
  $("links").innerHTML = L.map(([i, t, s, h], n) => `<li style="--i:${n}"><a class="row" href="${h}" target="_blank" rel="noopener">${ic(i)}<div class="grow"><p class="row-t">${t}</p><p class="row-s">${esc(s)}</p></div></a></li>`).join("");
}

/* Inclinación suave de la tarjeta al tocarla */
const loyalty = $("loyalty");
if (!RM) {
  const tilt = (e) => { const r = loyalty.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5; loyalty.style.transform = `perspective(700px) rotateY(${x * 8}deg) rotateX(${-y * 8}deg)`; };
  loyalty.addEventListener("pointermove", tilt);
  ["pointerleave", "pointerup", "pointercancel"].forEach((ev) => loyalty.addEventListener(ev, () => (loyalty.style.transform = "")));
}

/* ---------- Confirmar en caja ---------- */
function openSheet(code = "") {
  $("code").value = code; showErr("sheet-err", "");
  const goal = cfg.goal, full = me.stamps >= goal, wait = me.cooldown_sec;
  const acts = [];
  if (!full) acts.push(`<button class="btn btn-primary" data-do="stamp" ${wait > 0 ? "disabled" : ""}>${ic("check")} Sellar mi visita${me.promo ? ` (×${me.promo.mult})` : ""}</button>`);
  if (!full && wait > 0) acts.push(`<p class="fine center">Ya sellaste hoy. Podrás volver a sellar en ${fmtWait(wait)}.</p>`);
  me.rewards.forEach((r) => acts.push(`<button class="btn ${r.id === "bday" ? "btn-primary" : "btn-ghost"}" data-do="redeem" data-id="${r.id}">${ic(r.id === "bday" ? "cake" : "gift")} Canjear: ${esc(r.label)}</button>`));
  $("sheet-actions").innerHTML = acts.join("");
  $("sheet").hidden = false;
  setTimeout(() => (code ? document.querySelector("#sheet-actions button:not([disabled])") : $("code"))?.focus(), 50);
}
const closeSheet = () => ($("sheet").hidden = true);
$("btn-caja").onclick = () => openSheet();
$("sheet-x").onclick = closeSheet;
$("sheet").addEventListener("click", (e) => { if (e.target === $("sheet")) closeSheet(); });
$("party").addEventListener("click", (e) => { if (e.target === $("party")) $("party").hidden = true; });
$("party-close").onclick = () => ($("party").hidden = true);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeSheet(); $("party").hidden = true; } });
$("code").addEventListener("input", (e) => (e.target.value = e.target.value.replace(/\D/g, "").slice(0, 6)));

$("sheet-actions").addEventListener("click", async (e) => {
  const b = e.target.closest("button[data-do]"); if (!b) return;
  const code = $("code").value;
  if (code.length !== 6) return showErr("sheet-err", "Escribe los 6 números del código de caja.");
  b.disabled = true; showErr("sheet-err", "");
  try { b.dataset.do === "stamp" ? await doStamp(code) : await doRedeem(code, b.dataset.id); }
  catch (err) { showErr("sheet-err", err.message); b.disabled = false; if (err.status === 401) logoutSoft(); }
});
function logoutSoft() { store.del("nonos-token"); token = null; show("welcome"); }

async function doStamp(code) {
  const r = await api("/stamp", { code });
  me = r.card; closeSheet(); show("card"); renderAll(); buzz(18);
  const hit = cfg.tiers.find((t) => me.stamps >= t.at && me.stamps - r.added < t.at);
  toast(hit ? `¡Premio desbloqueado: ${hit.label.toLowerCase()}!` : r.added > 1 ? `+${r.added} sellos. ¡Qué buen día para venir!` : "Sello agregado. ¡Gracias por venir!");
  if (hit) setTimeout(() => confetti(), 350);
}
async function doRedeem(code, id) {
  const r = await api("/redeem", { code, reward: id });
  me = r.card; closeSheet(); prevStamps = null; show("card"); renderAll(); buzz([20, 40, 20]);
  $("party-t").textContent = id === "bday" ? "¡Feliz cumpleaños!" : "¡Disfrútalo!";
  $("party-d").textContent = r.label;
  $("party-link").href = cfg.review_url; $("party-review").hidden = false;
  $("party").hidden = false; confetti();
}

/* QR escaneado: ?s=CODIGO */
async function handleScanned(code) {
  if (!me) return;
  if (me.rewards.length || me.stamps >= cfg.goal) return openSheet(code);
  try { await doStamp(code); }
  catch (err) { toast(err.message); openSheet(code); }
}

/* ---------- Confeti (canvas, sin librerías) ---------- */
function confetti() {
  if (RM) return;
  const c = $("confetti"), x = c.getContext("2d"), dpr = devicePixelRatio || 1;
  c.width = innerWidth * dpr; c.height = innerHeight * dpr; x.scale(dpr, dpr);
  const cols = ["#dcc29a", "#f0dfbd", "#b9976e", "#224d48", "#fffaf1"];
  const ps = Array.from({ length: 90 }, () => ({ x: innerWidth / 2, y: innerHeight * .55, vx: (Math.random() - .5) * 13, vy: -Math.random() * 15 - 4, s: 5 + Math.random() * 6, r: Math.random() * 6, vr: (Math.random() - .5) * .4, c: cols[(Math.random() * cols.length) | 0] }));
  let t0 = performance.now();
  (function frame(t) {
    const dt = Math.min(2, (t - t0) / 16); t0 = t;
    x.clearRect(0, 0, innerWidth, innerHeight);
    ps.forEach((p) => { p.vy += .35 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt; x.save(); x.translate(p.x, p.y); x.rotate(p.r); x.fillStyle = p.c; x.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); x.restore(); });
    if (ps.some((p) => p.y < innerHeight + 20)) requestAnimationFrame(frame); else x.clearRect(0, 0, innerWidth, innerHeight);
  })(t0);
}

/* ---------- Inicio ---------- */
(async function init() {
  fillBirthdaySelects();
  const u = new URL(location.href), scanned = u.searchParams.get("s");
  if (scanned) { sessionStorage.setItem("nonos-pending", scanned.replace(/\D/g, "").slice(0, 6)); history.replaceState(null, "", u.pathname); }
  try {
    cfg = await api("/config");
    if (!token) return show("welcome");
    const r = await api("/me");
    enter(r.card);
  } catch (e) {
    if (e.status === 401) logoutSoft();
    else { $("loading").hidden = true; toast("No hay conexión con Nonos. Intenta de nuevo."); show("welcome"); }
  }
})();
