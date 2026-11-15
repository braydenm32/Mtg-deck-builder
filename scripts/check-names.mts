/** Dev check: which printing does a name-only match pick? npx tsx scripts/check-names.mts "Mana Vault" "Sol Ring" */
import { openDb } from "@/db/client";
import { matchIdentities } from "@/lib/cards/match";

const names = process.argv.slice(2);
const db = await openDb();
const results = await matchIdentities(
  db,
  names.map((name) => ({ name })),
  { online: false, finishes: names.map(() => "nonfoil") },
);
results.forEach((m, i) =>
  console.log(
    names[i],
    "->",
    m.ok
      ? `${m.printing.setName} (${m.printing.setCode}) #${m.printing.collectorNumber} rank=${m.printing.variantRank} $${m.printing.priceUsd}`
      : m.reason,
  ),
);
db.$client.close();
