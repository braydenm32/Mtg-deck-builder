"""Build the self-contained mockup page from mock.json (numbers from the app database), card images and the source files.

Usage: python3 build.py <scratchpad> <out.html>
"""
import json, sqlite3, sys, os

S, OUT = sys.argv[1], sys.argv[2]
SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "src")
mock = json.load(open(f"{S}/mock.json"))
db = sqlite3.connect(f"{S}/mock.db")

# Owned suggestions: is the copy free, which deck uses it, where it lives (same rule as N8: built/building decks claim copies).
q = """WITH used AS (
  SELECT dc.oracle_id, d.name AS deck, dc.board FROM deck_cards dc JOIN decks d ON d.id = dc.deck_id
  WHERE dc.collection_item_id IS NOT NULL AND d.archived_at IS NULL AND d.status IN ('built','building'))
SELECT (SELECT SUM(ci.quantity) FROM collection_items ci WHERE ci.oracle_id = c.oracle_id AND ci.proxy = 0) AS owned,
       (SELECT COUNT(*) FROM used u WHERE u.oracle_id = c.oracle_id) AS in_decks,
       (SELECT u.deck FROM used u WHERE u.oracle_id = c.oracle_id LIMIT 1) AS deck,
       (SELECT u.board FROM used u WHERE u.oracle_id = c.oracle_id LIMIT 1) AS board,
       (SELECT CASE ci.location WHEN '' THEN 'Needs a home' ELSE ci.location END FROM collection_items ci WHERE ci.oracle_id = c.oracle_id LIMIT 1) AS loc
FROM cards c WHERE c.name = ? LIMIT 1"""
for s in mock["sugOwned"]:
    owned, in_decks, deck, board, loc = db.execute(q, (s["name"],)).fetchone()
    s["free"] = (owned or 0) - (in_decks or 0) > 0
    s["usedIn"] = deck
    s["commanderOf"] = deck if board == "commander" else None
    s["loc"] = loc
    s.pop("inDeck", None)
mock["sugOwned"].sort(key=lambda s: (not s["free"], -s["syn"]))

app_css = open(f"{SRC}/app.css").read() + "\n" + open(f"{SRC}/directions.css").read()
page = open(f"{SRC}/page.html").read()
images = open(f"{S}/mock-images.js").read()
screens = open(f"{SRC}/screens.js").read()
out = (page.replace("__MOCK__", json.dumps(mock, separators=(",", ":")))
           .replace("__APPCSS__", json.dumps(app_css))
           .replace("__IMAGES__", images)
           .replace("__SCREENS__", screens))
os.makedirs(os.path.dirname(os.path.abspath(OUT)), exist_ok=True)
open(OUT, "w").write(out)
print("wrote", OUT, len(out) // 1024, "KB; free suggestions:", [s["name"] for s in mock["sugOwned"] if s["free"]])
