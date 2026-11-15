import json, sqlite3, sys, csv, urllib.request, base64, os, time, io
from PIL import Image
S = sys.argv[1]
db = sqlite3.connect(f"{S}/mock.db"); db.row_factory = sqlite3.Row; X = db.execute
UA = {"User-Agent": "mtg-deck-builder-personal/0.1 (design mockups; low volume)", "Accept": "*/*"}
roles = json.load(open(f"{S}/roles-app.json"))  # src/lib/deck/roles.ts cardRoles(), land removed
def front(n): return n.split(" // ")[0]
def cmdr_lists(slug):
    d = json.load(open(f"{S}/edhrec/cmd-{slug}.json")); jd = d["container"]["json_dict"]; out = {}
    for l in jd["cardlists"]:
        for c in l["cardviews"]:
            out[c["name"]] = dict(syn=round(c.get("synergy", 0) * 100), incl=round(100 * c["num_decks"] / max(1, c["potential_decks"])), decks=c["num_decks"], list=l["header"])
    return jd["card"]["num_decks"], d, out
nT, dT, cvT = cmdr_lists("toph-the-first-metalbender"); nO, dO, cvO = cmdr_lists("omnath-locus-of-rage"); nM, dM, cvM = cmdr_lists("mondrak-glory-dominus")
IMG = {}
def fetch(url, key, w=None, q=72):
    if key in IMG: return key
    fn = f"{S}/img/{key}.jpg"
    if not os.path.exists(fn):
        raw = urllib.request.urlopen(urllib.request.Request(url, headers=UA)).read(); time.sleep(0.12)
        im = Image.open(io.BytesIO(raw)).convert("RGB")
        if w and im.width > w: im = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
        im.save(fn, "JPEG", quality=q, optimize=True, progressive=True)
    IMG[key] = "data:image/jpeg;base64," + base64.b64encode(open(fn, "rb").read()).decode()
    return key
def slug(n): return "".join(ch if ch.isalnum() else "-" for ch in n.lower()).strip("-")[:48]
def card_img(name, printing_id=None, w=146):
    r = None
    if printing_id: r = X("SELECT image_small, image_normal FROM printings WHERE id=?", (printing_id,)).fetchone()
    if not r or not r[0]: r = X("SELECT image_small, image_normal FROM cards WHERE name=? OR norm_front_name=lower(?) ORDER BY paper DESC LIMIT 1", (name, front(name))).fetchone()
    if not r or not r[0]: return None
    url = r[0] if w <= 146 else (r[1] or r[0])
    return fetch(url, f"c-{slug(name)}-{w}", w=w)
def art(name, w=520):
    r = X("SELECT image_normal FROM cards WHERE name=? LIMIT 1", (name,)).fetchone()
    url = r[0].replace("/normal/", "/art_crop/")
    return fetch(url, f"a-{slug(name)}", w=w, q=70)
def artist(name):
    return None
cardrow = lambda name: X("SELECT * FROM cards WHERE (name=? OR norm_front_name=lower(?)) AND layout NOT IN ('art_series','token') ORDER BY paper DESC LIMIT 1", (name, front(name))).fetchone()
def ci_of(name):
    c = cardrow(name); return c and c["color_identity"]
# ---------- collection ----------
num = json.load(open(f"{S}/numbers-mock.json"))
coll_line = num["N4 collection_value_usd (the app's STACK_PRICE rule from src/lib/collection/query.ts; proxies excluded)"]["rows"][0] | num["N1 copies_owned (real cardboard; proxies listed separately)"]["rows"][0] | num["N3 unique_cards (distinct gameplay cards, basic lands excluded)"]["rows"][0]
locs = [dict(r) for r in X("SELECT CASE location WHEN '' THEN 'Needs a home' ELSE location END AS name, SUM(quantity) copies, COUNT(*) stacks FROM collection_items GROUP BY location ORDER BY copies DESC")]
for l in locs: l["real"] = l["name"] in ("Bulk list", "Needs a home")
# deck usage per collection item
use = {}
for r in X("SELECT dc.collection_item_id iid, d.name FROM deck_cards dc JOIN decks d ON d.id=dc.deck_id WHERE dc.collection_item_id IS NOT NULL"): use.setdefault(r["iid"], []).append(r["name"])
waiting = {}
for r in X("SELECT dc.oracle_id, d.name FROM deck_cards dc JOIN decks d ON d.id=dc.deck_id WHERE dc.collection_item_id IS NULL AND d.status!='idea'"): waiting.setdefault(r["oracle_id"], []).append(r["name"])
def item_rows(where, args=(), order="price DESC", limit=40):
    out = []
    for r in X(f"""SELECT ci.id, ci.quantity, ci.finish, ci.location, ci.source, c.name, c.type_line, c.color_identity, c.mana_cost, c.cmc, c.oracle_id, p.set_code, p.collector_number, p.set_name, p.rarity, p.id pid,
                   CASE ci.finish WHEN 'foil' THEN COALESCE(p.price_usd_foil,p.price_usd) ELSE p.price_usd END price
                   FROM collection_items ci JOIN cards c ON c.oracle_id=ci.oracle_id JOIN printings p ON p.id=ci.printing_id WHERE {where} ORDER BY {order} LIMIT {limit}""", args):
        out.append(dict(name=r["name"], qty=r["quantity"], finish=r["finish"], loc=r["location"] or "Needs a home", set=r["set_code"].upper(), num=r["collector_number"], setName=r["set_name"], rarity=r["rarity"],
                        price=r["price"], type=r["type_line"], ci=r["color_identity"], cost=r["mana_cost"], mv=r["cmc"], decks=use.get(r["id"], []), wanted=sorted(set(waiting.get(r["oracle_id"], []))), real=r["location"] in ("Bulk list", "") , pid=r["pid"]))
    return out
collection = item_rows("ci.location IN ('Bulk list','')", order="price DESC", limit=16)
for c in collection[:12]: c["img"] = card_img(c["name"], c["pid"])
scanned = item_rows("ci.location=''", order="ci.id", limit=10)
for c in scanned: c["img"] = card_img(c["name"], c["pid"])
# ---------- decks ----------
def deck(did):
    d = dict(X("SELECT * FROM decks WHERE id=?", (did,)).fetchone())
    rows = [dict(r) for r in X("""SELECT dc.name, dc.board, dc.collection_item_id iid, c.type_line, c.cmc, c.mana_cost, c.price_usd, c.game_changer, c.color_identity, ci.location, ci.oracle_id own_oid
                                   FROM deck_cards dc LEFT JOIN cards c ON c.oracle_id=dc.oracle_id LEFT JOIN collection_items ci ON ci.id=dc.collection_item_id WHERE dc.deck_id=?""", (did,))]
    owned = {r["oracle_id"]: r["q"] for r in X("SELECT oracle_id, SUM(quantity) q FROM collection_items GROUP BY oracle_id")}
    shared_names = {r["name"] for r in X("""WITH want AS (SELECT dc.oracle_id, COUNT(DISTINCT dc.deck_id) decks FROM deck_cards dc JOIN decks d ON d.id=dc.deck_id WHERE d.status!='idea' GROUP BY dc.oracle_id)
          SELECT c.name FROM want JOIN cards c ON c.oracle_id=want.oracle_id JOIN (SELECT oracle_id, SUM(quantity) q FROM collection_items GROUP BY oracle_id) o ON o.oracle_id=want.oracle_id WHERE o.q < want.decks AND c.type_line NOT LIKE 'Basic Land%'""")}
    cards = []
    for r in rows:
        t = r["type_line"] or ""
        grp = "Commander" if r["board"] == "commander" else next((g for g in ["Land", "Creature", "Planeswalker", "Instant", "Sorcery", "Artifact", "Enchantment", "Battle"] if g in t), "Other")
        if r["iid"]: state = "placed"
        elif r["name"] in shared_names: state = "shared"
        else: state = "missing"
        cards.append(dict(name=r["name"], group=grp, mv=r["cmc"], cost=r["mana_cost"], state=state, loc=r["location"], price=r["price_usd"], gc=bool(r["game_changer"]), roles=roles.get(r["name"], [])))
    d["cards"] = cards
    nonland = [c for c in cards if c["group"] not in ("Land",) and c["group"] != "Commander"]
    d["placed"] = sum(c["state"] == "placed" for c in cards); d["slots"] = len(cards)
    d["sharedOpen"] = sum(c["state"] == "shared" for c in cards); d["missing"] = sum(c["state"] == "missing" for c in cards)
    d["cost"] = round(sum((c["price"] or 0) for c in cards if c["state"] == "missing"), 2)
    d["lands"] = sum(c["group"] == "Land" for c in cards)
    d["roles"] = {k: sum(k in c["roles"] for c in cards) for k in ["ramp", "draw", "removal", "wipe", "protection", "tutor", "recursion"]}
    d["gc"] = [c["name"] for c in cards if c["gc"]]
    return d
decks = [deck(1), deck(2), deck(3)]
_rc = json.load(open(f"{S}/mock-roles-app.json"))  # roleCounts() from src/lib/deck/roles.ts over main+commander
for _d in decks:
    if _d["name"] in _rc: _d["roles"] = {k: v for k, v in _rc[_d["name"]]["roleCounts"].items() if k != "land"}
H = num["N12 deck_health (lands incl. MDFC land faces? see doc; avg MV excludes lands; commander included in counts)"]["rows"]
curve = num["N15 curve (non-land main deck, MV 7+ bucketed)"]["rows"]
for d, h in zip(decks, H):
    d["avgMv"] = h["avg_mv_no_lands"]; d["curve"] = [next((x["n"] for x in curve if x["name"] == d["name"] and x["mv"] == i), 0) for i in range(8)]
decks[0]["edhrecDecks"] = nT; decks[1]["edhrecDecks"] = nO; decks[2]["edhrecDecks"] = nM
decks[0]["bracketCounts"] = dT["bracket_counts"]; decks[0]["tags"] = [t["value"] for t in dT["tag_counts"][:6]]
decks[0]["art"] = art("Toph, the First Metalbender"); decks[1]["art"] = art("Omnath, Locus of Rage"); decks[2]["art"] = art("Mondrak, Glory Dominus")
for d in decks: d["ci"] = ci_of(d["commander"])
# ---------- suggestions for Toph ----------
ownedset = {front(r[0]): r[1] for r in X("SELECT c.name, SUM(ci.quantity) FROM collection_items ci JOIN cards c ON c.oracle_id=ci.oracle_id GROUP BY c.name")}
in_deck = {c["name"]: c["state"] for c in decks[0]["cards"]}
sug_owned, sug_buy = [], []
for n, v in sorted(cvT.items(), key=lambda kv: -kv[1]["syn"]):
    c = cardrow(n)
    if not c or n == "Toph, the First Metalbender": continue
    st = in_deck.get(n)
    row = dict(name=n, syn=v["syn"], incl=v["incl"], decks=v["decks"], list=v["list"], price=c["price_usd"], cost=c["mana_cost"], type=c["type_line"], roles=roles.get(n, []), inDeck=st)
    row["real"] = bool(X("SELECT 1 FROM collection_items WHERE oracle_id=? AND location IN ('Bulk list','')", (c["oracle_id"],)).fetchone())
    if front(n) in ownedset: sug_owned.append(row)
    elif not st: sug_buy.append(row)
sug_owned.sort(key=lambda r: (r["inDeck"] is not None, -r["syn"]))
for r in sug_owned[:14] + sug_buy[:8]: r["img"] = card_img(r["name"])
# ---------- shared ----------
shared = []
for r in num["N11 contested (owned copies fewer than active decks that want them)"]["rows"]:
    n = r["name"]; c = cardrow(n)
    it = X("SELECT ci.location, ci.finish, p.set_code, p.price_usd FROM collection_items ci JOIN printings p ON p.id=ci.printing_id WHERE ci.oracle_id=?", (c["oracle_id"],)).fetchone()
    tv, ov = cvT.get(n, {}), cvO.get(n, {})
    shared.append(dict(name=n, owned=r["owned"], loc=it["location"] or "Needs a home", set=it["set_code"].upper(), price=it["price_usd"], cheapest=c["price_usd"],
                       toph=dict(syn=tv.get("syn"), incl=tv.get("incl")), omnath=dict(syn=ov.get("syn"), incl=ov.get("incl")), img=card_img(n), type=c["type_line"], roles=roles.get(n, [])))
# ---------- card detail: Swiftfoot Boots ----------
sb = next(s for s in shared if s["name"] == "Swiftfoot Boots")
sbc = cardrow("Swiftfoot Boots")
prints = [dict(r) for r in X("SELECT set_code, set_name, collector_number, price_usd, released_at FROM printings WHERE oracle_id=? AND lang='en' ORDER BY variant_rank, released_at DESC LIMIT 6", (sbc["oracle_id"],))]
card = dict(name="Swiftfoot Boots", text=sbc["oracle_text"], type=sbc["type_line"], cost=sbc["mana_cost"], rank=sbc["edhrec_rank"], img=card_img("Swiftfoot Boots", None, 488), shared=sb, printings=prints)
# ---------- import review ----------
rows = list(csv.DictReader(open(f"{S}/real/mythic_tools_bulk_export.csv", encoding="utf-8-sig")))
imp = dict(file="mythic_tools_bulk_export.csv", rows=len(rows), copies=sum(int(r["Quantity"]) for r in rows), foils=sum(r["Finish"] == "foil" for r in rows),
           container=[rows[0]["Container Type"], rows[0]["Container Name"]], mtValue=round(sum(float(r["Price (USD Foil)"] if r["Finish"] == "foil" else r["Price (USD)"]) for r in rows), 2),
           sfValue=1011.45, headers=list(rows[0].keys()), commanders=18)
# mana symbols
SYM = {}
for s in ["W", "U", "B", "R", "G", "C", "X"] + [str(i) for i in range(0, 11)]:
    fn = f"{S}/img/sym-{s}.svg"
    if not os.path.exists(fn):
        open(fn, "wb").write(urllib.request.urlopen(urllib.request.Request(f"https://svgs.scryfall.io/card-symbols/{s}.svg", headers=UA)).read()); time.sleep(0.1)
    SYM[s] = "data:image/svg+xml;base64," + base64.b64encode(open(fn, "rb").read()).decode()
mock = dict(generated="2026-11-15", collectionLine=coll_line, locations=locs, collection=collection, scanned=scanned, lastImport=num["N7 last_import"]["rows"][0],
            decks=decks, sugOwned=sug_owned[:14], sugBuy=sug_buy[:8], shared=shared, card=card, imp=imp, ownedFitToph=len(sug_owned))
json.dump(mock, open(f"{S}/mock.json", "w"), indent=0)
open(f"{S}/mock-images.js", "w").write("window.IMG=" + json.dumps(IMG) + ";window.SYM=" + json.dumps(SYM) + ";")
print("images", len(IMG), "bytes", sum(len(v) for v in IMG.values()), "sym", len(SYM))
print("decks", [(d["name"], d["placed"], d["slots"], d["sharedOpen"], d["missing"], d["cost"], d["lands"], d["avgMv"], d["roles"], d["gc"]) for d in decks])
print("owned fitting toph", len(sug_owned), sum(r["real"] for r in sug_owned), [ (s["name"], s["syn"], s["inDeck"], s["real"]) for s in sug_owned[:14]])
print("buy", [(s["name"], s["syn"], s["price"]) for s in sug_buy[:8]])
print("shared", [(s["name"], s["toph"], s["omnath"], s["price"], s["cheapest"], s["loc"]) for s in shared])
print("collection top", [(c["name"], c["finish"], c["price"], c["loc"], c["decks"], c["wanted"]) for c in collection[:8]])
print("scanned", [(c["name"], c["set"], c["finish"], c["price"]) for c in scanned])
