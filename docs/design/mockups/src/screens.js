/* Screens of the mock app. Every number comes from window.MOCK (built from the database by export_mock.py). */
(function () {
  const D = window.MOCK, IMG = window.IMG || {}, SYM = window.SYM || {};
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const usd = (v) => (v == null ? "—" : "US$" + Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const n0 = (v) => Number(v).toLocaleString("en-US");
  const slug = (n) => n.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "-").replace(/^-+|-+$/g, "").slice(0, 48);

  const ICONS = {
    home: '<path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z"/>',
    cards: '<rect x="7" y="3.5" width="12" height="15" rx="2"/><path d="M4.5 7v11.5a2 2 0 0 0 2 2H15"/>',
    box: '<path d="M3.5 8 12 4l8.5 4v8.5L12 20.5l-8.5-4z"/><path d="M3.5 8 12 12l8.5-4M12 12v8.5"/>',
    dots: '<circle cx="5.5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18.5" cy="12" r="1.3"/>',
    scan: '<path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16"/><rect x="9" y="7.5" width="6" height="9" rx="1"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>',
    back: '<path d="M14.5 5.5 8 12l6.5 6.5"/>',
    chev: '<path d="m9.5 5.5 6.5 6.5-6.5 6.5"/>',
    down: '<path d="m6 9.5 6 6 6-6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    swap: '<path d="M7 4 4 7l3 3M4 7h12M17 20l3-3-3-3M20 17H8"/>',
    file: '<path d="M14 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8z"/><path d="M14 3.5V8h4.5M9 13h6M9 16.5h4"/>',
    list: '<path d="M9 6.5h11M9 12h11M9 17.5h11"/><circle cx="4.75" cy="6.5" r="1"/><circle cx="4.75" cy="12" r="1"/><circle cx="4.75" cy="17.5" r="1"/>',
    place: '<path d="M4 9.5 12 5l8 4.5V18H4z"/><path d="M9 18v-5h6v5"/>',
    sort: '<path d="M7 5v14M4 16l3 3 3-3M17 19V5M14 8l3-3 3 3"/>',
    sliders: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
    bolt: '<path d="M13 3 5 13.5h6l-1 7.5 8-10.5h-6z"/>',
    undo: '<path d="M9 7 4.5 11.5 9 16"/><path d="M4.5 11.5H15a4.5 4.5 0 0 1 0 9h-2"/>',
    phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
    signal: '<path d="M5 18v-2M9 18v-5M13 18V9M17 18V6"/>',
  };
  const ic = (n, cls = "") => `<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ""}</svg>`;
  const im = (key, cls = "thumb", alt = "") => (IMG[key] ? `<img class="${cls}" src="${IMG[key]}" alt="${esc(alt)}">` : `<span class="${cls}"></span>`);
  const th = (name, lg) => {
    const key = `c-${slug(name)}-146`;
    return IMG[key] ? `<span class="sleeve">${im(key, "thumb" + (lg ? " lg" : ""), name)}</span>` : "";
  };
  const pips = (cost, lg) => {
    if (!cost) return "";
    const toks = cost.match(/\{[^}]+\}/g) || [];
    return `<span class="pips${lg ? " lg" : ""}" aria-label="${esc(cost)}">${toks.map((t) => { const k = t.slice(1, -1).toUpperCase(); return SYM[k] ? `<img src="${SYM[k]}" alt="">` : `<span class="tag">${esc(k)}</span>`; }).join("")}</span>`;
  };
  const chip = (t, tone = "dim") => `<span class="chip ${tone}"><span class="dot"></span>${t}</span>`;

  function mark(dir, size = 28) {
    if (dir === "b") {
      return `<svg width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true"><g fill="none" stroke="#111014" stroke-width="1.7" stroke-linejoin="round"><rect x="4.5" y="12" width="7" height="14.5" rx="1.6"/><rect x="20.5" y="12" width="7" height="14.5" rx="1.6"/></g><rect x="12.5" y="5" width="7" height="21.5" rx="1.6" fill="#111014"/><circle cx="16" cy="9.6" r="1.35" fill="#ffffff"/></svg>`;
    }
    const P = { a: ["#7c3aed", "#6d28d9", "#ffffff", "#7c3aed"], c: ["#8b5cf6", "#ec4899", "#ffffff", "#c026d3"], d: ["#9b3a74", "#d0688c", "#fff7f9", "#9b3a74"] }[dir];
    const id = "mk" + dir + Math.random().toString(36).slice(2, 7);
    return `<svg width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${P[0]}"/><stop offset="1" stop-color="${P[1]}"/></linearGradient></defs><rect width="32" height="32" rx="${dir === "d" ? 10 : dir === "c" ? 9 : 7}" fill="url(#${id})"/><g fill="${P[2]}"><rect x="5.6" y="12.6" width="6.4" height="13.2" rx="1.4"/><rect x="12.8" y="6.4" width="6.4" height="19.4" rx="1.4"/><rect x="20" y="12.6" width="6.4" height="13.2" rx="1.4"/></g><circle cx="16" cy="10.4" r="1.4" fill="${P[3]}"/></svg>`;
  }

  const NAV = [["today", "Today", "home"], ["collection", "Collection", "cards"], ["decks", "Decks", "box"], ["more", "More", "dots"]];
  function shell(o) {
    const dir = o.dir;
    return `<div class="root"><div class="app">
  <aside class="side">
    <div class="brand">${mark(dir, 30)}<span>Commandery</span></div>
    <div class="k">${ic("search", "sm")}<span>Search cards and decks</span><kbd>⌘K</kbd></div>
    ${NAV.map(([k, l, i]) => `<a class="nav${o.area === k ? " on" : ""}">${ic(i)}<span>${l}</span>${k === "collection" ? '<span class="n">367</span>' : k === "decks" ? '<span class="n">3</span>' : ""}</a>`).join("")}
    <div class="grow"></div>
    <button class="add">${ic("plus", "sm")} Add cards</button>
    <div class="foot">Card data from Scryfall, 15 Nov · Synergy from EDHREC</div>
  </aside>
  <div class="main">
    <div class="status"><span>8:42</span><span class="row" style="gap:6px">${ic("signal", "sm")}<span class="bat"></span></span></div>
    <header class="top">
      ${o.back ? `<a class="back">${ic("back", "sm")}${esc(o.back)}</a>` : ""}
      <div class="top-row"><h1>${o.title}</h1>${o.actions || ""}</div>
      ${o.sub ? `<div class="sub">${o.sub}</div>` : ""}
      ${o.tabs ? `<nav class="tabs">${o.tabs.map((t) => `<a class="${t.on ? "on" : ""}">${t.l}${t.n != null ? `<span class="n">${t.n}</span>` : ""}</a>`).join("")}</nav>` : ""}
    </header>
    <div class="scroll">${o.body}</div>
  </div>
  <nav class="tabbar">${NAV.map(([k, l, i]) => `<a class="${o.area === k ? "on" : ""}">${ic(i)}<span>${l}</span></a>`).join("")}</nav>
  ${o.fab ? `<button class="fab">${ic("scan")} Scan</button>` : ""}
  ${o.extra || ""}
  <div class="home-ind"></div>
</div></div>`;
  }

  /* ---------------- data shortcuts ---------------- */
  const CL = D.collectionLine;
  const toph = D.decks[0], omnath = D.decks[1], mondrak = D.decks[2];
  const quietLine = `${n0(CL.copies)} cards · ${n0(CL.unique_cards)} unique · ≈ ${usd(CL.value_usd).replace(/\.\d\d$/, "")} · in ${D.locations.length} places`;
  const scanned = D.scanned;
  const scanTotal = scanned.reduce((a, c) => a + c.price * c.qty, 0);
  const shared = D.shared;
  const sharedNames = shared.map((s) => s.name);
  const syn = (v) => `<span class="syn ${v > 0 ? "pos" : "neg"}">${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v)}</span>`;
  const art = (d) => im(d.art, "art", d.commander);
  const deckTile = (d, next, nextTone) => {
    const pct = d.slots ? Math.round((100 * d.placed) / 100) : 0;
    const status = d.status === "idea" ? chip("Idea", "dim") : chip("Building", "info");
    return `<div class="deck">${art(d)}
      <div class="grow stack" style="--gap:5px">
        <div class="row" style="gap:8px"><span class="t ell grow">${esc(d.name)}</span>${status}</div>
        ${d.status === "idea" ? `<div class="s ell">${esc(d.commander)} · nothing picked yet</div>` : `<div class="bar"><i class="p" style="width:${pct}%"></i><i class="h" style="width:${d.sharedOpen}%"></i></div>
        <div class="s ell"><b style="color:var(--ink)">${d.placed} of 100</b> · ${next}</div>`}
      </div>${ic("chev", "sm muted")}</div>`;
  };

  /* ================= 1 · Today ================= */
  function today(dir) {
    const home = scanned.slice().sort((a, b) => b.price - a.price);
    const needs = `
      <div class="next">${`<span class="thumbs">${home.slice(0, 3).map((c) => im(c.img, "thumb", c.name)).join("")}</span>`}
        <div class="what"><span class="t">6 scanned cards need a home</span><span class="s ell">${home.slice(0, 2).map((c) => esc(c.name)).join(", ")} and 4 more</span><span class="strip d-only">${home.map((c) => th(c.name)).join("")}</span></div>
        <button class="btn pri sm">Sort</button></div>
      <div class="next"><span class="thumbs">${["Sol Ring", "Swiftfoot Boots", "Zuran Orb"].map((n) => im(`c-${slug(n)}-146`, "thumb", n)).join("")}</span>
        <div class="what"><span class="t">7 cards two decks want</span><span class="s ell">Sol Ring, Swiftfoot Boots and 5 more · Toph and Omnath</span><span class="strip d-only">${shared.map((c) => th(c.name)).join("")}</span></div>
        <button class="btn sec sm">Decide</button></div>
      <div class="next"><span class="thumbs">${im(toph.art, "thumb", toph.commander)}</span>
        <div class="what"><span class="t">Toph is 70 of 100</span><span class="s ell">4 free cards you own fit · 24 still to find</span></div>
        <button class="btn sec sm">Open</button></div>
      <div class="next done"><span class="thumbs"><span class="thumb" style="display:grid;place-items:center;color:var(--ok)">${ic("check")}</span></span>
        <div class="what"><span class="t">Last import matched 115 of 115</span><span class="s ell">mythic_tools_bulk_export.csv · today, 1:19 pm</span></div>
        ${ic("chev", "sm muted")}</div>`;
    const decks = `
      ${deckTile(toph, "next: decide 6 shared")}
      ${deckTile(omnath, "next: find 17 cards")}
      ${deckTile(mondrak, "")}`;
    const body = `<div class="cols">
      <section class="block"><h2 class="h2">Needs you<span class="aside" style="color:var(--muted)">3</span></h2><div class="list">${needs}</div></section>
      <div class="stack">
        <section class="block"><h2 class="h2">Your decks<span class="aside">New deck</span></h2><div class="decks">${decks}</div></section>
        <p class="quiet">${quietLine}</p>
      </div></div>`;
    return shell({ dir, area: "today", title: "Today", sub: "Sunday 15 November", fab: true, body });
  }

  /* ================= 2 · Scan (phone) / Add cards (desktop) ================= */
  function scan(dir, device) {
    const latest = ["Smaug the Magnificent", "Roaming Throne", "Mithril Coat"].map((n) => scanned.find((c) => c.name === n));
    const trayRow = (c, conf) => `<div class="li">${th(c.name)}<div class="grow"><div class="t ell">${esc(c.name)}</div><div class="s ell">${c.set} #${c.num} · ${c.finish === "foil" ? "Foil" : "Non-foil"} · ${usd(c.price)}</div></div><div class="end">${conf}</div></div>`;
    if (device === "phone") {
      const feed = IMG["a-omnath--locus-of-rage"] || "";
      return `<div class="root"><div class="app">
        <div class="cam"><div class="feed" style="background-image:url('${feed}')"></div>
          <div class="status" style="background:transparent;color:#fff;position:absolute;left:0;right:0;top:0"><span>8:42</span><span class="row" style="gap:6px">${ic("signal", "sm")}<span class="bat"></span></span></div>
          <div class="camtop"><button class="pillbtn" aria-label="Close">${ic("close", "sm")}</button><span class="grow"></span><button class="pillbtn">Any set ${ic("down", "sm")}</button><button class="pillbtn">Non-foil</button><button class="pillbtn">${ic("bolt", "sm")}</button></div>
          <div class="reticle">${im("c-smaug-the-magnificent-146", "", "Smaug the Magnificent")}</div>
          <div class="found"><span class="ok">${ic("check", "sm")}</span>Smaug the Magnificent · HOB · added</div>
        </div>
        <div class="tray"><div class="grab" style="width:40px;height:5px;border-radius:3px;background:var(--line);align-self:center"></div>
          <div class="row"><span class="strong grow">This session</span><span class="muted small">6 cards · ${usd(scanTotal)}</span></div>
          ${trayRow(latest[0], chip("Sure", "ok"))}
          ${trayRow(latest[1], chip("Sure", "ok"))}
          ${trayRow(latest[2], `<button class="btn ghost sm">Check printing</button>`)}
          <div class="btnrow" style="margin-top:6px"><button class="btn sec">${ic("undo", "sm")} Undo</button><button class="btn pri grow">Done · put 6 away</button></div>
        </div>
        <div class="home-ind" style="z-index:9"></div>
      </div></div>`;
    }
    const opt = (icn, t, s, extra = "") => `<div class="panel opt"><span class="ic">${ic(icn)}</span><div class="grow stack" style="--gap:8px"><div class="strong">${t}</div><div class="muted small">${s}</div>${extra}</div></div>`;
    const body = `<div class="cols">
      <div class="stack" style="--gap:14px">
        ${opt("phone", "Scan with your phone", "Open Commandery on your phone and tap Scan. Cards appear on the right as you scan them, ready to put away.")}
        ${opt("file", "Import a file", "Mythic Tools, Moxfield, ManaBox, Archidekt, Deckbox, TCGplayer and Delver Lens exports all work. Importing the same app again updates instead of adding twice.", `<div class="drop"><span class="strong">Drop a CSV here</span><button class="btn sec sm">Choose a file</button></div>`)}
        ${opt("list", "Type or paste a list", "One card per line. A set code and number pick the exact printing.", `<div class="drop" style="border-style:solid;font-family:ui-monospace,monospace;font-size:13px;color:var(--muted)">1 Sol Ring<br>1 Swiftfoot Boots (TLE)<br>12 Forest</div>`)}
      </div>
      <section class="block"><h2 class="h2">Scanned on your phone today<span class="aside">6 · ${usd(scanTotal)}</span></h2>
        <div class="list">${scanned.map((c) => trayRow(c, c.name === "Mithril Coat" ? `<button class="btn ghost sm">Check printing</button>` : chip("Sure", "ok"))).join("")}</div>
        <button class="btn pri full">Put 6 cards away</button>
        <p class="hint">They wait in "Needs a home" until you choose a box or binder.</p>
      </section></div>`;
    return shell({ dir, area: "", title: "Add cards", body });
  }

  /* ================= 3 · Collection ================= */
  function collection(dir) {
    const rows = D.collection.slice(0, 11);
    const where = (c) => (c.loc === "Needs a home" ? chip("Needs a home", "warn") : `<span>${esc(c.loc)}</span>`);
    const li = rows.map((c, i) => `<div class="li${i === 0 ? " d-sel" : ""}">${th(c.name)}
        <div class="grow"><div class="row" style="gap:6px"><span class="t ell">${esc(c.name)}</span>${pips(c.cost)}</div>
        <div class="s row" style="gap:6px">${c.qty} · ${c.decks.length ? "in " + esc(c.decks[0]) : "free"}${c.finish === "foil" ? " · foil" : ""} · ${where(c)}</div></div>
        <div class="end"><span class="price">${usd(c.price * c.qty)}</span></div></div>`).join("");
    const locChips = `<button class="fchip on">All places <span class="n">${n0(CL.copies)}</span></button>` + D.locations.map((l) => `<button class="fchip">${esc(l.name)} <span class="n">${l.copies}</span></button>`).join("");
    const top = rows[0];
    const preview = `<div class="panel stack" style="--gap:14px;padding:18px">
        <div class="row" style="align-items:flex-start;gap:16px">${th(top.name, true)}
          <div class="grow stack" style="--gap:4px"><div class="strong" style="font-size:18px">${esc(top.name)}</div><div class="muted small">${esc(top.type)}</div>${pips(top.cost)}</div></div>
        <div class="facts"><div><span class="l">Owned</span><span class="v">1</span></div><div><span class="l">In decks</span><span class="v">0</span></div><div><span class="l">Free</span><span class="v">1</span></div><div><span class="l">Where</span><span class="v txt">${esc(top.loc)}</span></div></div>
        <div class="muted small">Foil · ${esc(top.setName)} #${top.num} · ${usd(top.price)}</div>
        <div class="callout"><div class="grow"><div class="t">Can lead a deck</div><div class="s">No deck uses Tataru Taru yet.</div></div><button class="btn pri sm">Build around it</button></div>
      </div>`;
    const body = `<div class="cols wide-right">
      <div class="stack" style="--gap:14px">
        <div class="search">${ic("search")}<span class="q">Search your cards</span><span class="tag d-only">try  t:artifact free</span></div>
        <div class="chips">${locChips}</div>
        <div class="row"><span class="quiet grow ell">${quietLine.replace(/ · in \d+ places/, "")}</span><button class="link small">${ic("sort", "sm")} Value</button><button class="iconbtn" aria-label="Filters">${ic("sliders")}</button></div>
        <div class="list">${li}</div>
      </div>
      <div class="d-only">${preview}</div></div>`;
    return shell({ dir, area: "collection", title: "Collection", fab: true, body });
  }

  /* ================= 4 · Card detail ================= */
  function card(dir) {
    const c = D.card, s = c.shared;
    const facts = `<div class="facts"><div><span class="l">Owned</span><span class="v">${s.owned}</span></div><div><span class="l">In decks</span><span class="v">0</span></div><div><span class="l">Free</span><span class="v">1</span></div><div><span class="l">Where</span><span class="v txt">${esc(s.loc)}</span></div></div>`;
    const want = `<section class="block"><h2 class="h2">Toph and Omnath both want it</h2>
      <div class="list vs">
        <div class="vsrow">${im(toph.art, "thumb", toph.commander)}<div class="grow"><div class="t">Toph Earthbending</div><div class="s">in ${s.toph.incl}% of ${n0(toph.edhrecDecks)} Toph decks</div></div><div class="end">${syn(s.toph.syn)}<span class="hint">synergy</span></div></div>
        <div class="vsrow">${im(omnath.art, "thumb", omnath.commander)}<div class="grow"><div class="t">Omnath Landfall</div><div class="s">in ${s.omnath.incl}% of ${n0(omnath.edhrecDecks)} Omnath decks</div></div><div class="end">${syn(s.omnath.syn)}<span class="hint">synergy</span></div></div>
      </div>
      <div class="btnrow"><button class="btn pri grow">Give to Toph</button><button class="btn sec grow">Give to Omnath</button></div>
      <div class="row"><span class="muted small grow">Or get a second copy, from ${usd(s.cheapest)}</span><button class="btn ghost sm">Add to buy list</button></div></section>`;
    const copy = `<section class="block"><h2 class="h2">Your copy</h2><div class="list"><div class="li"><div class="grow"><div class="t">${s.set} · Near Mint · Non-foil</div><div class="s">${ic("place", "sm")} ${esc(s.loc)} · ${usd(s.price)}</div></div><button class="btn sec sm">Move</button><button class="iconbtn" aria-label="More actions">${ic("dots")}</button></div></div></section>`;
    const prints = `<section class="block"><h2 class="h2">Other printings<span class="aside">All ${c.printings.length}</span></h2><div class="list">${c.printings.slice(0, 3).map((p) => `<div class="li" style="min-height:48px"><div class="grow"><div class="t ell" style="font-weight:500">${esc(p.set_name)}</div><div class="s">${p.set_code.toUpperCase()} #${p.collector_number}</div></div><span class="price">${usd(p.price_usd)}</span></div>`).join("")}</div></section>`;
    const text = `<section class="block"><h2 class="h2">Card text</h2><p class="oracle">${esc(c.text).replace(/\{[^}]+\}/g, (m) => pips(m))}</p></section>`;
    const headP = `<div class="row p-only" style="align-items:flex-start;gap:14px">${th(c.name, true)}<div class="grow stack" style="--gap:4px"><div class="row" style="gap:8px">${pips(c.cost, true)}</div><div class="muted small">${esc(c.type)}</div><div>${chip("2 decks want it", "acc")}</div></div></div>`;
    const big = `<div class="d-only stack" style="--gap:18px">${IMG[c.img] ? `<span class="sleeve" style="align-self:flex-start">${im(c.img, "", c.name).replace("<img ", '<img style="width:300px;border-radius:14px" ')}</span>` : ""}${text}</div>`;
    const body = `<div class="cols even">${big}<div class="stack">${headP}<div class="d-only stack" style="--gap:6px"><div class="row" style="gap:8px">${pips(c.cost, true)}<span class="muted">${esc(c.type)}</span></div><div>${chip("2 decks want it", "acc")}</div></div>${facts}${want}${copy}<div class="p-only">${text}</div>${prints}</div></div>`;
    return shell({ dir, area: "collection", back: "Collection", title: esc(c.name), actions: `<button class="iconbtn" aria-label="More">${ic("dots")}</button>`, body });
  }

  /* ================= deck header ================= */
  const deckTabs = (on) => [
    { l: "Overview", on: on === "overview" },
    { l: "Cards", on: on === "cards" },
    { l: "Suggestions", on: on === "sug" },
    { l: "Missing", n: toph.missing, on: on === "missing" },
  ];
  const deckActions = `<button class="btn ghost sm d-only">Export</button><button class="iconbtn" aria-label="More">${ic("dots")}</button>`;

  /* ================= 5 · Deck overview ================= */
  function overview(dir) {
    const r = toph.roles;
    const T = [["Lands", toph.lands, 33, 36], ["Ramp", r.ramp, 8, 10], ["Card draw", r.draw, 8, 10], ["Removal", r.removal, 6, 8], ["Board wipes", r.wipe, 2, 3]];
    const max = 40;
    const health = T.map(([l, v, min, tgt]) => `<div class="hrow"><span>${l}</span><span class="meter"><i style="width:${Math.min(100, (100 * v) / max)}%"></i><b style="left:${(100 * tgt) / max}%"></b></span><span class="v">${v}<span class="muted" style="font-weight:400"> / ${tgt}</span></span><span class="st ${v >= min ? "ok" : "lo"}">${v >= min ? "✓" : "!"}</span></div>`).join("");
    const cv = toph.curve, cmax = Math.max(...cv);
    const curve = `<div class="curve">${cv.map((n, i) => `<div><span class="v">${n}</span><span class="c" style="height:${Math.max(3, (70 * n) / cmax)}px"></span><span>${i === 7 ? "7+" : i}</span></div>`).join("")}</div>`;
    const bc = toph.bracketCounts, bTot = Object.values(bc).reduce((a, b) => a + b, 0);
    const left = `
      <div class="hero">${art(toph)}<div class="cap"><div class="row" style="gap:10px;flex-wrap:wrap"><span class="name">${esc(toph.commander)}</span>${pips("{1}{R}{G}{W}")}</div>
        <div class="row" style="gap:6px;flex-wrap:wrap">${chip("Building", "info")}${chip("Lands Matter", "dim")}${chip("Artifacts", "dim")}</div></div></div>
      <section class="block"><div class="metric"><span class="big">${toph.placed}</span><span class="muted">of 100 cards placed</span></div>
        <div class="bar lg"><i class="p" style="width:${toph.placed}%"></i><i class="h" style="width:${toph.sharedOpen}%"></i></div>
        <div class="legend"><span><i style="background:var(--bar-fill)"></i><b>${toph.placed}</b> placed</span><span><i style="background:var(--warn)"></i><b>${toph.sharedOpen}</b> shared</span><span><i style="background:var(--track)"></i><b>${toph.missing}</b> you don't own</span></div></section>
      <div class="callout"><div class="grow"><div class="t">Next: decide 6 shared cards</div><div class="s">Omnath wants Sol Ring, Arcane Signet, Swiftfoot Boots and 3 more.</div></div><button class="btn pri sm">Decide</button></div>
      <section class="block"><h2 class="h2">Health<span class="aside">Avg mana value ${toph.avgMv}</span></h2><div class="list health">${health}</div></section>`;
    const right = `
      <section class="block"><h2 class="h2">Bracket</h2><div class="panel" style="padding:14px"><div class="row" style="gap:12px;align-items:flex-start"><div class="metric"><span class="big" style="font-size:calc(var(--big-size)*.8)">3+</span></div><div class="grow small"><div class="strong">Bracket 3 or higher, estimated</div><div class="muted">1 Game Changer: ${esc(toph.gc[0])}. Most Toph decks on EDHREC are Bracket 3 (${n0(bc["3"])} of ${n0(bTot)}).</div></div></div></div></section>
      <section class="block"><h2 class="h2">Mana curve<span class="aside" style="color:var(--muted)">non-land cards</span></h2><div class="panel" style="padding:14px 14px 10px">${curve}</div></section>
      <section class="block"><h2 class="h2">To finish</h2><div class="list"><div class="li"><div class="grow"><div class="t">${toph.missing} cards you don't own</div><div class="s">${usd(toph.cost)} at the cheapest printings · prices are on</div></div><button class="btn sec sm">See list</button></div></div>
      <p class="hint">Suggestions and synergy come from ${n0(toph.edhrecDecks)} Toph decks on EDHREC.</p></section>`;
    const body = `<div class="cols"><div class="stack">${left}</div><div class="stack">${right}</div></div>`;
    return shell({ dir, area: "decks", back: "Decks", title: esc(toph.name), actions: deckActions, tabs: deckTabs("overview"), body });
  }

  /* ================= 6 · Deck cards + swap ================= */
  function deckCards(dir) {
    const order = [["Commander", "Commander"], ["Creature", "Creatures"], ["Artifact", "Artifacts"], ["Enchantment", "Enchantments"], ["Instant", "Instants"], ["Sorcery", "Sorceries"], ["Land", "Lands"]];
    const state = (c) => c.state === "placed" ? `<span class="row" style="gap:4px">${ic("place", "sm")}${esc(c.loc)}</span>` : c.state === "shared" ? chip("Shared with Omnath", "warn") : `${chip("To find", "dim")}<span>${usd(c.price)}</span>`;
    const row = (c) => `<div class="li${c.name === "Amulet of Vigor" ? " sel" : ""}" style="min-height:54px"><div class="grow"><div class="row" style="gap:6px"><span class="t ell">${esc(c.name)}</span>${c.roles.filter((x) => x !== "land").slice(0, 1).map((x) => `<span class="rolechip">${x}</span>`).join("")}</div><div class="s row" style="gap:6px">${state(c)}</div></div><div class="end">${pips(c.cost)}</div></div>`;
    const groups = order.map(([g, label]) => {
      const cs = toph.cards.filter((c) => c.group === g).sort((a, b) => (a.state === "placed") - (b.state === "placed") || a.name.localeCompare(b.name));
      if (!cs.length) return "";
      const shown = g === "Land" ? cs.slice(0, 6) : cs;
      return `<div class="group-h">${label} <span>${cs.length}</span></div><div class="list">${shown.map(row).join("")}</div>${shown.length < cs.length ? `<button class="link">Show ${cs.length - shown.length} more lands ${ic("chev", "sm")}</button>` : ""}`;
    }).join("");
    const fits = D.sugOwned.filter((s) => s.free && s.loc !== "Needs a home").slice(0, 3);
    const swap = (cls) => `<div class="sheet ${cls}"><div class="grab"></div>
        <div class="row"><div class="grow"><div class="strong" style="font-size:17px">Swap out Amulet of Vigor</div><div class="muted small">You don't own it · ${usd(47.96)} · no role in the deck</div></div><button class="iconbtn" aria-label="Close">${ic("close")}</button></div>
        <div class="h2" style="margin-top:4px">Free cards you own that fit Toph</div>
        <div class="list">${fits.map((s) => `<div class="li">${th(s.name)}<div class="grow"><div class="t ell">${esc(s.name)}</div><div class="s ell">${syn(s.syn)} synergy · ${esc(s.loc)}</div></div><button class="btn pri sm">Swap in</button></div>`).join("")}</div>
        <button class="btn ghost">Keep it, add to buy list</button></div>`;
    const body = `<div class="cols wide-right"><div class="stack" style="--gap:12px">
        <div class="chips"><button class="fchip on">All <span class="n">100</span></button><button class="fchip">Placed <span class="n">${toph.placed}</span></button><button class="fchip">Shared <span class="n">${toph.sharedOpen}</span></button><button class="fchip">To find <span class="n">${toph.missing}</span></button><button class="fchip">${ic("search", "sm")} Find</button></div>
        <div>${groups}</div></div>
        <div class="d-only">${swap("")}</div></div>`;
    return shell({ dir, area: "decks", back: "Decks", title: esc(toph.name), actions: deckActions, tabs: deckTabs("cards"), body, extra: `<div class="scrim p-only"></div>${swap("p-only")}` });
  }

  /* ================= 7 · Suggestions ================= */
  function suggestions(dir) {
    const free = D.sugOwned.filter((s) => s.free);
    const busy = D.sugOwned.filter((s) => !s.free);
    const ownRow = (s) => `<div class="li">${th(s.name)}<div class="grow"><div class="row" style="gap:6px"><span class="t ell">${esc(s.name)}</span>${s.roles.slice(0, 1).map((x) => `<span class="rolechip">${x}</span>`).join("")}</div><div class="s ell">${syn(s.syn)} · ${s.incl}% of decks · ${s.loc === "Needs a home" ? "needs a home" : esc(s.loc)}</div></div><button class="btn pri sm">${ic("plus", "sm")} Add</button></div>`;
    const busyRow = (s) => `<div class="li">${th(s.name)}<div class="grow"><div class="t ell">${esc(s.name)}</div><div class="s ell">${syn(s.syn)} · ${s.commanderOf ? "commander of " + esc(s.commanderOf) : "in " + esc(s.usedIn)}</div></div>${s.commanderOf ? "" : `<button class="btn sec sm">Move here</button>`}</div>`;
    const buyRow = (s) => `<div class="li">${th(s.name)}<div class="grow"><div class="t ell">${esc(s.name)}</div><div class="s ell">${syn(s.syn)} · ${s.incl}% of decks</div></div><div class="end"><span class="price">${usd(s.price)}</span><button class="btn ghost sm" style="min-height:28px;padding:0">Want</button></div></div>`;
    const owned = `<section class="block"><h2 class="h2">Free in your collection<span class="aside" style="color:var(--muted)">${free.length}</span></h2><div class="list">${free.map(ownRow).join("")}</div></section>
      <section class="block"><h2 class="h2">In your other decks<span class="aside" style="color:var(--muted)">${busy.length}</span></h2><div class="list">${busy.slice(0, 6).map(busyRow).join("")}</div><button class="link">Show ${busy.length - 6} more ${ic("chev", "sm")}</button></section>`;
    const buy = `<section class="block"><h2 class="h2">You'd need to get<span class="aside" style="color:var(--muted)">${D.sugBuy.length}</span></h2><div class="list">${D.sugBuy.map(buyRow).join("")}</div><p class="hint">Buying or proxying is only suggested for cards the deck needs. Prices show because they're on.</p></section>`;
    const body = `<div class="stack" style="--gap:16px">
        <p class="quiet">From ${n0(toph.edhrecDecks)} Toph decks on EDHREC, checked against your cards. Sorted by synergy.</p>
        <div class="row p-only"><div class="seg"><a class="on">Your cards <span>${D.sugOwned.length}</span></a><a>To get <span>${D.sugBuy.length}</span></a></div></div>
        <div class="chips"><button class="fchip on">All</button><button class="fchip">Ramp</button><button class="fchip">Card draw</button><button class="fchip">Removal</button><button class="fchip">Lands</button><button class="fchip">Creatures</button></div>
        <div class="cols even"><div class="stack">${owned}</div><div class="d-only">${buy}</div></div></div>`;
    return shell({ dir, area: "decks", back: "Decks", title: esc(toph.name), actions: deckActions, tabs: deckTabs("sug"), body });
  }

  /* ================= 8 · Shared cards ================= */
  function sharedScreen(dir) {
    const cheapest = shared.reduce((a, s) => a + s.cheapest, 0);
    const item = (s) => {
      const pick = s.toph.syn >= s.omnath.syn ? "toph" : "omnath";
      const side = (k, d) => `<div class="grow" style="min-width:0"><div class="row" style="gap:6px"><span class="small strong ell">${k === "toph" ? "Toph" : "Omnath"}</span>${pick === k ? chip("Better fit", "ok") : ""}</div><div class="row small" style="gap:6px">${syn(s[k].syn)}<span class="muted">· ${s[k].incl}% of decks</span></div><div class="mini"><i style="width:${s[k].incl}%"></i></div></div>`;
      return `<div class="li" style="flex-direction:column;align-items:stretch;gap:10px;padding-top:14px;padding-bottom:14px">
        <div class="row">${th(s.name)}<div class="grow"><div class="t ell">${esc(s.name)}</div><div class="s">1 owned · ${esc(s.loc)}${s.name === "Zuran Orb" ? " · now in Toph" : ""}</div></div><span class="muted small">2nd copy ${usd(s.cheapest)}</span></div>
        <div class="row" style="gap:14px;align-items:flex-start">${side("toph")}${side("omnath")}</div>
        <div class="seg" style="align-self:flex-start"><a class="${pick === "toph" ? "on" : ""}">Toph</a><a class="${pick === "omnath" ? "on" : ""}">Omnath</a><a>Get another</a></div></div>`;
    };
    const body = `<div class="cols wide-right"><div class="stack" style="--gap:14px">
        <p class="quiet">Toph and Omnath both want these 7 cards, and you own one copy of each. The better fit is picked for you. Change any of them.</p>
        <div class="list">${shared.map(item).join("")}</div>
        <button class="btn pri full p-only">Review 7 choices</button></div>
        <div class="stack d-only" style="--gap:14px"><div class="panel stack" style="--gap:10px;padding:18px"><div class="strong" style="font-size:16px">7 choices</div><div class="muted small">Toph gets 6, Omnath gets 1. Nothing moves until you confirm, and you can undo it.</div><button class="btn pri full">Review 7 choices</button></div>
        <div class="panel stack" style="--gap:8px;padding:18px"><div class="strong">Or keep both decks whole</div><div class="muted small">Second copies of all 7 cost about ${usd(cheapest)} at the cheapest printings.</div><button class="btn sec full">Add 7 to buy list</button></div></div></div>`;
    return shell({ dir, area: "decks", title: "Shared cards", tabs: [{ l: "All decks", n: 3 }, { l: "Shared cards", n: 7, on: true }, { l: "Retired" }], body });
  }

  /* ================= 9 · Import review ================= */
  function importReview(dir) {
    const I = D.imp, L = D.lastImport;
    const sample = D.collection.filter((c) => c.loc !== "Needs a home").slice(0, 5);
    const sampleList = `<div class="list">${sample.map((c) => `<div class="li">${th(c.name)}<div class="grow"><div class="t ell">${esc(c.name)}</div><div class="s">${c.set} #${c.num}${c.finish === "foil" ? " · foil" : ""}</div></div><span class="check">${ic("check", "sm")}</span></div>`).join("")}</div>`;
    const left = `
      <div class="panel row" style="padding:14px;gap:14px"><span class="opt" style="padding:0"><span class="ic">${ic("file")}</span></span><div class="grow"><div class="strong ell">${esc(I.file)}</div><div class="muted small">Mythic Tools · ${I.rows} rows · ${I.copies} copies · ${I.foils} foils</div></div></div>
      <div class="panel q"><div class="t">Do you own these ${I.copies} cards?</div><div class="muted small">This file is your Mythic Tools list "${esc(I.container[1])}". Lists can also hold cards you want but don't have.</div><div class="btnrow"><button class="btn pri">Yes, I own them</button><button class="btn sec">No, it's a want list</button></div></div>
      <section class="block"><h2 class="h2">Where they'll go</h2><div class="list"><div class="li"><span class="opt" style="padding:0"><span class="ic">${ic("place")}</span></span><div class="grow"><div class="t">Bulk list</div><div class="s">From the file's list name</div></div><button class="btn ghost sm">Change</button></div></div></section>
      <section class="block"><h2 class="h2">How they matched</h2><div class="list">
        <div class="li"><span class="check">${ic("check")}</span><div class="grow"><div class="t">${L.matched_count} of ${L.row_count} match exactly</div><div class="s">By Scryfall ID, so every set, number and finish is right</div></div></div>
        <div class="li"><span class="check">${ic("check")}</span><div class="grow"><div class="t">${I.commanders} could lead a deck</div><div class="s">Toph, Omnath, Mondrak, Tataru Taru and 14 more</div></div></div>
        <div class="li"><span class="check">${ic("check")}</span><div class="grow"><div class="t">${usd(I.sfValue)} today</div><div class="s">Mythic Tools said ${usd(I.mtValue)}. Prices move daily.</div></div></div></div></section>`;
    const body = `<div class="cols"><div class="stack">${left}<button class="btn pri full">Import ${I.copies} cards</button><p class="hint">You can undo this from Import history.</p></div>
      <section class="block"><h2 class="h2">First rows<span class="aside">Show all ${I.rows}</span></h2>${sampleList}</section></div>`;
    return shell({ dir, area: "collection", back: "Add cards", title: "Check your import", body });
  }

  window.SCREENS = [
    { k: "today", label: "Today", render: today },
    { k: "scan", label: "Scan", render: scan },
    { k: "collection", label: "Collection", render: collection },
    { k: "card", label: "Card", render: card },
    { k: "deck", label: "Deck", render: overview },
    { k: "deck-cards", label: "Deck cards", render: deckCards },
    { k: "suggestions", label: "Suggestions", render: suggestions },
    { k: "shared", label: "Shared cards", render: sharedScreen },
    { k: "import", label: "Import", render: importReview },
  ];
  window.MARK = mark;
})();
