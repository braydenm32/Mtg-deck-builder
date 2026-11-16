/**
 * A made-up card drawn as text in a card-shaped frame: name and cost, type line, rules text. Used on
 * the custom cards page and on the proxy sheet (where `print` makes it black on white at card size).
 */
export function CustomCardFace({
  name,
  manaCost,
  typeLine,
  oracleText,
  print = false,
}: {
  name: string;
  manaCost: string | null;
  typeLine: string;
  oracleText: string;
  print?: boolean;
}) {
  const cost = manaCost?.replace(/\{([^}]+)\}/g, (_, s: string) => `(${s.replace("/", "")})`) ?? "";
  const tone = print ? "border-black bg-white text-black" : "border-line bg-(--panel-2) text-foreground";
  const sub = print ? "border-black/60" : "border-line";
  return (
    <div className={`flex aspect-[63/88] w-full flex-col overflow-hidden rounded-[4.5%] border-2 p-[5%] ${tone}`}>
      <div className={`flex items-baseline justify-between gap-1 border-b pb-[3%] ${sub}`}>
        <span className="min-w-0 truncate text-[0.8em] font-semibold leading-tight">{name}</span>
        {cost && <span className="shrink-0 font-mono text-[0.7em]">{cost}</span>}
      </div>
      <div className={`border-b py-[3%] text-[0.65em] font-medium italic leading-tight ${sub}`}>{typeLine}</div>
      <p className="mt-[4%] min-h-0 flex-1 overflow-hidden whitespace-pre-line text-[0.6em] leading-snug">{oracleText}</p>
      <p className={`text-right text-[0.5em] ${print ? "text-black/60" : "text-muted"}`}>Playtest card</p>
    </div>
  );
}
