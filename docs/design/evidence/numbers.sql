-- @name N1 copies_owned (real cardboard; proxies listed separately)
SELECT COALESCE(SUM(quantity),0) AS copies FROM collection_items WHERE proxy = 0;
-- @name N2 proxies
SELECT COALESCE(SUM(quantity),0) AS proxies FROM collection_items WHERE proxy = 1;
-- @name N3 unique_cards (distinct gameplay cards, basic lands excluded)
SELECT COUNT(DISTINCT ci.oracle_id) AS unique_cards FROM collection_items ci JOIN cards c ON c.oracle_id = ci.oracle_id WHERE ci.proxy = 0 AND c.type_line NOT LIKE 'Basic Land%';
-- @name N4 collection_value_usd (the app's STACK_PRICE rule from src/lib/collection/query.ts; proxies excluded)
WITH s AS (
  SELECT ci.quantity AS q,
    CASE WHEN ci.printing_confidence = 'guessed' THEN c.price_usd
         WHEN ci.finish = 'foil' THEN COALESCE(p.price_usd_foil, p.price_usd)
         WHEN ci.finish = 'etched' THEN COALESCE(p.price_usd_etched, p.price_usd_foil, p.price_usd)
         ELSE COALESCE(p.price_usd, p.price_usd_foil) END AS each_usd,
    CASE WHEN ci.printing_confidence = 'guessed' THEN 1
         WHEN ci.finish = 'foil' AND p.price_usd_foil IS NULL THEN 1
         WHEN ci.finish = 'etched' AND p.price_usd_etched IS NULL THEN 1
         WHEN ci.finish = 'nonfoil' AND p.price_usd IS NULL THEN 1 ELSE 0 END AS estimated
  FROM collection_items ci JOIN printings p ON p.id = ci.printing_id JOIN cards c ON c.oracle_id = ci.oracle_id
  WHERE ci.proxy = 0)
SELECT ROUND(SUM(q * each_usd), 2) AS value_usd,
       SUM(CASE WHEN each_usd IS NULL THEN q ELSE 0 END) AS unpriced_copies,
       SUM(CASE WHEN each_usd IS NOT NULL AND estimated = 1 THEN q ELSE 0 END) AS estimated_copies
FROM s;
-- @name N5 orphan_items (collection rows with no card data behind them)
SELECT COUNT(*) AS orphan_stacks FROM collection_items ci LEFT JOIN cards c ON c.oracle_id = ci.oracle_id WHERE c.oracle_id IS NULL;
-- @name N6 needs_a_home (scanned or added with no box/binder)
SELECT COUNT(*) AS stacks, COALESCE(SUM(quantity),0) AS copies FROM collection_items WHERE location = '';
-- @name N7 last_import
SELECT b.filename, b.created_at, b.row_count, b.matched_count, (SELECT COUNT(*) FROM unmatched_rows u WHERE u.batch_id = b.id) AS still_unmatched FROM import_batches b ORDER BY b.created_at DESC LIMIT 1;
-- @name N8 per_card_owned_in_decks_free (example: a few cards)
WITH own AS (SELECT oracle_id, SUM(quantity) AS owned FROM collection_items WHERE proxy = 0 GROUP BY oracle_id),
     used AS (SELECT ci.oracle_id, COUNT(*) AS in_decks FROM deck_cards dc JOIN collection_items ci ON ci.id = dc.collection_item_id JOIN decks d ON d.id = dc.deck_id WHERE d.archived_at IS NULL AND d.status IN ('built','building') GROUP BY ci.oracle_id),
     want AS (SELECT dc.oracle_id, COUNT(*) AS waiting FROM deck_cards dc JOIN decks d ON d.id = dc.deck_id WHERE dc.collection_item_id IS NULL AND d.archived_at IS NULL GROUP BY dc.oracle_id)
SELECT c.name, COALESCE(own.owned,0) AS owned, COALESCE(used.in_decks,0) AS in_decks, COALESCE(own.owned,0) - COALESCE(used.in_decks,0) AS free, COALESCE(want.waiting,0) AS decks_waiting
FROM cards c LEFT JOIN own ON own.oracle_id = c.oracle_id LEFT JOIN used ON used.oracle_id = c.oracle_id LEFT JOIN want ON want.oracle_id = c.oracle_id
WHERE c.name IN ('Sol Ring','Doubling Season','Zuran Orb','Swiftfoot Boots','Arcane Signet','Bumi, Unleashed','The Great Henge') ORDER BY c.name;
-- @name N9 deck_progress (100 = commander + 99; maybeboard excluded)
SELECT d.name, d.status, SUM(dc.quantity) AS slots, SUM(CASE WHEN dc.collection_item_id IS NOT NULL THEN dc.quantity ELSE 0 END) AS placed FROM decks d JOIN deck_cards dc ON dc.deck_id = d.id WHERE dc.board IN ('main','commander') GROUP BY d.id ORDER BY d.id;
-- @name N10 open_slots_by_reason
WITH own AS (SELECT oracle_id, SUM(quantity) AS owned FROM collection_items WHERE proxy = 0 GROUP BY oracle_id),
     used AS (SELECT ci.oracle_id, COUNT(*) AS in_decks FROM deck_cards dc JOIN collection_items ci ON ci.id = dc.collection_item_id GROUP BY ci.oracle_id)
SELECT d.name AS deck, COALESCE(c.name, REPLACE(dc.oracle_id,'missing:','')) AS card,
  CASE WHEN c.oracle_id IS NULL THEN 'no-card-data'
       WHEN COALESCE(own.owned,0) = 0 THEN 'not-owned'
       WHEN COALESCE(own.owned,0) - COALESCE(used.in_decks,0) > 0 THEN 'free-copy'
       ELSE 'in-another-deck' END AS reason
FROM deck_cards dc JOIN decks d ON d.id = dc.deck_id LEFT JOIN cards c ON c.oracle_id = dc.oracle_id
LEFT JOIN own ON own.oracle_id = dc.oracle_id LEFT JOIN used ON used.oracle_id = dc.oracle_id
WHERE dc.collection_item_id IS NULL ORDER BY d.id, reason, card;
-- @name N11 contested (owned copies fewer than active decks that want them)
WITH want AS (SELECT dc.oracle_id, COUNT(DISTINCT dc.deck_id) AS decks, COUNT(*) AS wanted FROM deck_cards dc JOIN decks d ON d.id = dc.deck_id WHERE d.archived_at IS NULL AND d.status IN ('built','building') AND dc.board IN ('main','commander') GROUP BY dc.oracle_id),
     own AS (SELECT oracle_id, SUM(quantity) AS owned FROM collection_items WHERE proxy = 0 GROUP BY oracle_id)
SELECT c.name, want.decks, want.wanted, COALESCE(own.owned,0) AS owned FROM want JOIN cards c ON c.oracle_id = want.oracle_id LEFT JOIN own ON own.oracle_id = want.oracle_id
WHERE c.type_line NOT LIKE 'Basic Land%' AND COALESCE(own.owned,0) > 0 AND COALESCE(own.owned,0) < want.wanted ORDER BY want.decks DESC, c.name;
-- @name N12 deck_health (lands = front face is a land, as src/lib/deck/text.ts isLand; MDFC spell//land counted separately; avg MV = the 99's nonland cards, commander excluded, as src/lib/deck/stats.ts)
SELECT d.name,
  SUM(CASE WHEN (CASE WHEN instr(c.type_line,' // ') > 0 THEN substr(c.type_line,1,instr(c.type_line,' // ')-1) ELSE c.type_line END) LIKE '%Land%' THEN dc.quantity ELSE 0 END) AS lands,
  SUM(CASE WHEN (CASE WHEN instr(c.type_line,' // ') > 0 THEN substr(c.type_line,1,instr(c.type_line,' // ')-1) ELSE c.type_line END) NOT LIKE '%Land%' AND c.layout = 'modal_dfc' AND c.type_line LIKE '% // %Land%' THEN dc.quantity ELSE 0 END) AS mdfc_lands,
  ROUND(SUM(CASE WHEN dc.board = 'main' AND (CASE WHEN instr(c.type_line,' // ') > 0 THEN substr(c.type_line,1,instr(c.type_line,' // ')-1) ELSE c.type_line END) NOT LIKE '%Land%' THEN c.cmc * dc.quantity END) / SUM(CASE WHEN dc.board = 'main' AND (CASE WHEN instr(c.type_line,' // ') > 0 THEN substr(c.type_line,1,instr(c.type_line,' // ')-1) ELSE c.type_line END) NOT LIKE '%Land%' THEN dc.quantity END), 2) AS avg_mv_no_lands,
  ROUND(SUM(CASE WHEN dc.board = 'main' THEN c.cmc * dc.quantity END) / SUM(CASE WHEN dc.board = 'main' THEN dc.quantity END), 2) AS avg_mv_with_lands,
  SUM(CASE WHEN c.game_changer THEN dc.quantity ELSE 0 END) AS game_changers
FROM decks d JOIN deck_cards dc ON dc.deck_id = d.id JOIN cards c ON c.oracle_id = dc.oracle_id WHERE dc.board IN ('main','commander') GROUP BY d.id ORDER BY d.id;
-- @name N13 game_changer_names
SELECT d.name AS deck, c.name AS card FROM decks d JOIN deck_cards dc ON dc.deck_id = d.id JOIN cards c ON c.oracle_id = dc.oracle_id WHERE c.game_changer = 1 ORDER BY d.id, c.name;
-- @name N14 cost_to_finish (cards no copy of which is owned; cheapest regular printing)
SELECT d.name, COUNT(*) AS cards_to_get, ROUND(SUM(c.price_usd),2) AS cheapest_usd, SUM(c.price_usd IS NULL) AS unpriced
FROM deck_cards dc JOIN decks d ON d.id = dc.deck_id JOIN cards c ON c.oracle_id = dc.oracle_id
WHERE dc.collection_item_id IS NULL AND NOT EXISTS (SELECT 1 FROM collection_items ci WHERE ci.oracle_id = dc.oracle_id AND ci.proxy = 0) GROUP BY d.id;
-- @name N15 curve (non-land main deck by the front-face rule, MV 7+ bucketed)
SELECT d.name, MIN(CAST(c.cmc AS INT), 7) AS mv, SUM(dc.quantity) AS n FROM decks d JOIN deck_cards dc ON dc.deck_id = d.id JOIN cards c ON c.oracle_id = dc.oracle_id WHERE (CASE WHEN instr(c.type_line,' // ') > 0 THEN substr(c.type_line,1,instr(c.type_line,' // ')-1) ELSE c.type_line END) NOT LIKE '%Land%' AND dc.board = 'main' GROUP BY d.id, MIN(CAST(c.cmc AS INT), 7) ORDER BY d.id, mv;
