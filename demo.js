// MODO DEMO: reemplaza el servidor por datos simulados guardados en el navegador (localStorage).
// Nada sale del teléfono. Cualquier código de 6 números sirve como "código de caja".
(() => {
  const KEY = "nonos-demo-db", TIERS = [{ id: "t5", at: 5, label: "Un adicional gratis en tu pedido" }, { id: "t10", at: 10, label: "Una bebida de la casa, por nuestra cuenta" }];
  const CFG = { name: "Nonos Coffee Shop", goal: 10, tiers: TIERS, birthday_label: "Una bebida de cumpleaños, va por la casa",
    whatsapp: "573222119291", instagram: "https://www.instagram.com/nonoscoffeeshop", menu: "https://linktr.ee/nonoscoffeeshop",
    maps: "https://www.google.com/maps/search/?api=1&query=4.1392399,-73.6432494", address: "Cra. 44 #21A-17, Villavicencio",
    review_url: "https://www.google.com/maps/search/?api=1&query=4.1392399,-73.6432494",
    hours: [{ d: "Lunes a sábado", t: "8:00 am – 8:00 pm" }, { d: "Domingo", t: "2:00 pm – 8:00 pm" }] };
  const PROMOS = { 1: { mult: 2, label: "Martes de sellos dobles" } };
  const nowS = () => Math.floor(Date.now() / 1000), DAY = 86400;
  const promoToday = () => { const w = (new Date(Date.now() - 5 * 3600e3).getUTCDay() + 6) % 7; return PROMOS[w] || null; };
  const seed = () => ({ "3001234567": { name: "Laura", pin: "1234", stamps: 4, claimed: [], visits: 4, redeemed: 0, hasBd: false,
    history: [3, 9, 16, 24].map((d) => ({ k: "stamp", n: 1, note: null, at: nowS() - d * DAY })) } });
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || seed(); } catch { return seed(); } };
  const save = (db) => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch {} };
  const phoneOf = (p) => String(p || "").replace(/\D/g, "").replace(/^57(?=\d{10}$)/, "");
  const card = (c) => ({ name: c.name, stamps: c.stamps, claimed: c.claimed, visits: c.visits, redeemed: c.redeemed,
    birthday_today: false, has_bday: c.hasBd, cooldown_sec: 0, promo: promoToday(), history: c.history.slice(0, 15),
    rewards: TIERS.filter((t) => c.stamps >= t.at && !c.claimed.includes(t.id)).map((t) => ({ id: t.id, label: t.label, at: t.at })) });
  class E extends Error { constructor(m, s = 400) { super(m); this.s = s; } }
  function route(path, body, tok) {
    const db = load(), c = db[tok];
    if (path === "/api/config") return { ...CFG, promo: promoToday(), promos: PROMOS };
    if (path === "/api/join") {
      const p = phoneOf(body.phone);
      if (!body.name?.trim()) throw new E("Escribe tu nombre.");
      if (!/^\d{10}$/.test(p)) throw new E("Escribe un número de celular colombiano de 10 dígitos.");
      if (!/^\d{4}$/.test(body.pin || "")) throw new E("La clave debe tener 4 números.");
      if (db[p]) throw new E("Ese número ya tiene tarjeta. Usa «Ya tengo tarjeta» para ingresar.", 409);
      db[p] = { name: body.name.trim().slice(0, 30), pin: body.pin, stamps: 0, claimed: [], visits: 0, redeemed: 0, hasBd: !!(body.bd && body.bm), history: [] };
      save(db); return { token: p, card: card(db[p]) };
    }
    if (path === "/api/recover") {
      const p = phoneOf(body.phone);
      if (!db[p] || db[p].pin !== String(body.pin)) throw new E("Celular o clave incorrectos.", 401);
      return { token: p, card: card(db[p]) };
    }
    if (!c) throw new E("Sesión no válida.", 401);
    if (path === "/api/me") return { card: card(c) };
    if (!/^\d{6}$/.test(body.code || "")) throw new E("El código son 6 números. En la demo sirve cualquiera, por ejemplo 123456.");
    if (path === "/api/stamp") {
      if (c.stamps >= CFG.goal) throw new E("Tu tarjeta está completa. Canjea tu premio para empezar otra.");
      const p = promoToday(), add = Math.min(p ? p.mult : 1, CFG.goal - c.stamps);
      c.stamps += add; c.visits++; c.history.unshift({ k: "stamp", n: add, note: p ? p.label : null, at: nowS() });
      save(db); return { added: add, card: card(c) };
    }
    if (path === "/api/redeem") {
      const t = TIERS.find((x) => x.id === body.reward);
      if (!t || c.stamps < t.at || c.claimed.includes(t.id)) throw new E("Este premio no está disponible.");
      if (t.at >= CFG.goal) { c.stamps = 0; c.claimed = []; } else c.claimed.push(t.id);
      c.redeemed++; c.history.unshift({ k: "redeem", n: 0, note: t.label, at: nowS() });
      save(db); return { label: t.label, card: card(c) };
    }
    throw new E("No disponible en la demo.", 404);
  }
  const realFetch = window.fetch.bind(window);
  window.fetch = (url, o = {}) => {
    const path = String(url);
    if (!path.startsWith("/api/")) return realFetch(url, o);
    const tok = (o.headers?.Authorization || "").replace("Bearer ", "");
    let status = 200, out;
    try { out = route(path, o.body ? JSON.parse(o.body) : {}, tok); } catch (e) { status = e.s || 500; out = { error: e.message }; }
    return new Promise((r) => setTimeout(() => r(new Response(JSON.stringify(out), { status, headers: { "Content-Type": "application/json" } })), 250));
  };
  // Cinta de demo con datos de acceso y reinicio
  document.addEventListener("DOMContentLoaded", () => {
    const b = document.createElement("div");
    b.id = "demo-bar";
    b.innerHTML = `<b>DEMO</b> · Entra con <b>300 123 4567</b> y clave <b>1234</b>, o crea una tarjeta. Código de caja: cualquiera de 6 números (ej. <b>123456</b>). <button type="button">Reiniciar</button>`;
    b.querySelector("button").onclick = () => { try { localStorage.clear(); sessionStorage.clear(); } catch {} location.reload(); };
    document.body.prepend(b);
  });
})();
