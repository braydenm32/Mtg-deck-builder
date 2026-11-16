/** The search syntax, as examples (src/lib/collection/search-syntax.ts). Shown in the filter sheet. */
const TIPS: [string, string][] = [
  ["t:creature", "Type line has “creature”"],
  ['o:"draw a card"', "Rules text has the words"],
  ["id:golgari", "Fits a black-green deck (also id:bg)"],
  ["c:r", "Is red (c=r: only red, c:m: two or more colours)"],
  ["mv<=3", "Mana value 3 or less"],
  ["r>=rare", "Rare or mythic"],
  ["s:mh3", "From one set, by its code"],
  ["usd>10", "Worth over US$10 a copy"],
  ["loc:binder", "In a box or binder whose name has “binder”"],
  ["is:foil", "Also is:commander, is:proxy, is:gamechanger, is:nohome"],
  ["-t:land", "A minus sign leaves matches out"],
];

export function SearchTips() {
  return (
    <details className="group rounded-xl border border-line">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
        Search tips
        <span className="text-accent group-open:hidden">Show</span>
      </summary>
      <div className="space-y-2 px-3 pb-3 text-sm">
        <p className="text-muted">Type these in the search box, together if you like: every one must match.</p>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5">
          {TIPS.map(([code, meaning]) => (
            <div key={code} className="contents">
              <dt>
                <code className="rounded bg-(--panel-2) px-1.5 py-0.5 text-[13px]">{code}</code>
              </dt>
              <dd className="text-muted">{meaning}</dd>
            </div>
          ))}
        </dl>
      </div>
    </details>
  );
}
