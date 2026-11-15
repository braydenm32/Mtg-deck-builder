"""Build the mockup dataset: Brayden's REAL 115-card bulk export + clearly marked EXAMPLE boxes and decks."""
import json, sqlite3, sys, datetime
S = sys.argv[1]
db = sqlite3.connect(f"{S}/mock.db"); db.row_factory = sqlite3.Row
X = db.execute
X("UPDATE collection_items SET location='Bulk list', source='csv:mythic-tools' WHERE location='bulk'")
X("DELETE FROM collection_items WHERE location!='Bulk list'")
def front(n): return n.split(' // ')[0]
def oracle(name):
    r = X("""SELECT oracle_id FROM cards WHERE (name=? OR norm_front_name=lower(?)) AND layout NOT IN ('art_series','token','double_faced_token','emblem')
             ORDER BY legal_commander='not_legal', paper DESC LIMIT 1""", (name, front(name))).fetchone()
    return r and r[0]
def regular_printing(oid):
    return X("""SELECT id FROM printings WHERE oracle_id=? AND lang='en' AND price_usd IS NOT NULL ORDER BY variant_rank, price_usd LIMIT 1""", (oid,)).fetchone() or \
           X("SELECT id FROM printings WHERE oracle_id=? ORDER BY variant_rank LIMIT 1", (oid,)).fetchone()
now = "2026-11-15T09:00:00Z"
def add(name, qty, loc, source="example"):
    oid = oracle(name); p = oid and regular_printing(oid)
    if not p: print("skip", name); return
    X("""INSERT INTO collection_items (printing_id,oracle_id,quantity,finish,condition,lang,location,altered,signed,misprint,proxy,purchase_price,source,batch_id,added_at,printing_confidence)
         VALUES (?,?,?,'nonfoil','NM','en',?,0,0,0,0,NULL,?,NULL,?,'exact')
         ON CONFLICT DO UPDATE SET quantity=quantity+excluded.quantity""", (p[0], oid, qty, loc, source, now))
avg = lambda s: {n: q for v in json.load(open(f"{S}/edhrec/avg-{s}.json"))["deck"]["cards"].values() for n, q in v}
T, O = avg("toph-the-first-metalbender"), avg("omnath-locus-of-rage")
O["Mountain"] -= 1; O["Zuran Orb"] = 1  # example user edit: Omnath also wants the real Zuran Orb
owned_names = {front(r[0]) for r in X("SELECT c.name FROM collection_items ci JOIN cards c ON c.oracle_id=ci.oracle_id")}
BASICS = {"Forest", "Mountain", "Plains", "Island", "Swamp"}
for b, q in [("Forest", 40), ("Mountain", 40), ("Plains", 40), ("Island", 20), ("Swamp", 20)]: add(b, q, "Box: Lands")
price = lambda n: (X("SELECT price_usd FROM cards WHERE oracle_id=?", (oracle(n),)).fetchone() or [None])[0]
ex_binder = [n for n in T if n not in BASICS and front(n) not in owned_names and (price(n) or 99) < 6]
for n in ex_binder: add(n, 2 if n in O else 1, "Binder: Naya staples")
owned_names |= {front(n) for n in ex_binder}
ex_box = [n for n in O if n not in BASICS and front(n) not in owned_names and (price(n) or 99) < 2.5]
for n in ex_box: add(n, 1, "Box: Red-Green")
# today's scan session (example of the scan flow): 6 of Brayden's real cards, shown as just scanned with no home yet
SCANNED = ["Roaming Throne", "Smaug the Magnificent", "Gleaming Splendor", "Mithril Coat", "Dolmen Gate", "Reflecting Pool"]
for n in SCANNED:
    X("UPDATE collection_items SET location='', source='scanner', added_at='2026-11-15T12:40:00Z' WHERE oracle_id=? AND location='Bulk list'", (oracle(n),))
# decks
X("DROP TABLE IF EXISTS deck_cards"); X("DROP TABLE IF EXISTS decks")
X("CREATE TABLE decks (id INTEGER PRIMARY KEY, name TEXT, commander TEXT, commander_oracle_id TEXT, theme TEXT, status TEXT, updated_at TEXT, archived_at TEXT)")
X("CREATE TABLE deck_cards (id INTEGER PRIMARY KEY, deck_id INT, oracle_id TEXT, name TEXT, quantity INT DEFAULT 1, board TEXT DEFAULT 'main', collection_item_id INT)")
DECKS = [(1, "Toph Earthbending", "Toph, the First Metalbender", "Lands Matter · Artifacts", "building", "2026-11-15T12:55:00Z", T),
         (2, "Omnath Landfall", "Omnath, Locus of Rage", "Landfall · Elementals", "building", "2026-11-14T20:10:00Z", O),
         (3, "Mondrak Tokens", "Mondrak, Glory Dominus", "Tokens · Counters", "idea", "2026-11-10T18:00:00Z", {})]
CONTEST = {"Doubling Season", "Swiftfoot Boots", "Sol Ring", "Arcane Signet", "Command Tower", "Cinder Glade", "Rootbound Crag"}
used = {}
def free_item(oid):
    for it in X("SELECT id, quantity FROM collection_items WHERE oracle_id=? AND proxy=0 ORDER BY location=''", (oid,)):
        if used.get(it["id"], 0) < it["quantity"]: return it["id"]
for did, name, cmdr, theme, status, upd, lst in DECKS:
    X("INSERT INTO decks VALUES (?,?,?,?,?,?,?,NULL)", (did, name, cmdr, oracle(cmdr), theme, status, upd))
    rows = [(cmdr, 1, "commander")] + [(n, q, "main") for n, q in lst.items()]
    for n, q, board in rows:
        oid = oracle(n)
        for _ in range(q):
            iid = None
            if status != "idea" and oid:
                both = front(n) in CONTEST and any(front(n) in {front(k) for k in d[6]} for d in DECKS if d[0] != did)
                if not both: iid = free_item(oid)
                if iid: used[iid] = used.get(iid, 0) + 1
            X("INSERT INTO deck_cards (deck_id,oracle_id,name,quantity,board,collection_item_id) VALUES (?,?,?,?,?,?)", (did, oid or f"missing:{n}", n, 1, board, iid))
db.commit()
print("example binder", len(ex_binder), "example box", len(ex_box))
for r in X("SELECT d.name, d.status, COUNT(*) slots, SUM(dc.collection_item_id IS NOT NULL) placed FROM decks d JOIN deck_cards dc ON dc.deck_id=d.id GROUP BY d.id"): print(dict(r))
for r in X("SELECT location, SUM(quantity) q, COUNT(*) stacks FROM collection_items GROUP BY 1"): print(dict(r))
