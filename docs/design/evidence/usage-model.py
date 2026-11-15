# Simulated usage model: task frequency (persona estimates) x screen share -> visits, minutes, phone share
import json
T = {
 # id: (label, times/month, phone share, minutes per occurrence, {screen: share})
 "A1": ("Scan new cards", 4, .95, 5, {"Scan":.65,"Scan review":.25,"Collection":.05,"Settings":.05}),
 "A2": ("Fix a mis-scan", 10, .85, .75, {"Scan review":.6,"Card detail":.35,"Collection":.05}),
 "A3": ("Import a CSV and fix unmatched rows", .6, .10, 10, {"Import":.35,"Import review":.5,"Collection":.15}),
 "A4": ("Do I own X, and where is it?", 14, .95, .4, {"Collection":.4,"Card detail":.6}),
 "A5": ("First run", .1, .6, 10, {"Onboarding":.5,"Import":.3,"Scan":.2}),
 "B1": ("Build a new deck", .75, .15, 30, {"Commander picker":.05,"Theme picker":.05,"Deck builder":.6,"Deck editor":.25,"Deck overview":.05}),
 "B2": ("What am I missing, and what does it cost?", 2, .4, 4, {"Missing cards":.6,"Shared cards":.15,"Deck overview":.2,"Export":.05}),
 "B3": ("Check deck health", 4.5, .4, 3, {"Deck overview":.8,"Deck editor":.2}),
 "B4": ("Swap 3 cards at the store", 3, .95, 3, {"Deck editor":.75,"Shared cards":.15,"Collection":.1}),
 "B5": ("Compare suggestions with what I own", 1.5, .3, 20, {"Deck builder":.6,"Card detail":.15,"Collection":.25}),
 "C1": ("Which decks use this card, and is a copy free?", 10, .4, 1, {"Collection":.25,"Card detail":.65,"Decks list":.1}),
 "C2": ("Two decks want one copy", 3, .5, 1.5, {"Shared cards":.5,"Deck editor":.3,"Missing cards":.1,"Deck overview":.1}),
 "C3": ("Export or share a deck", 2.5, .6, .5, {"Export":.85,"Deck overview":.15}),
 "C4": ("Retire a deck or bulk-edit cards", 2.3, .2, 3, {"Decks list":.2,"Deck editor":.4,"Collection":.4}),
 "C6": ("Pull cards for a deck and keep the collection in sync", 4, .7, 4, {"Deck editor":.3,"Missing cards":.3,"Collection":.2,"Shared cards":.2}),
}
screens = {}
for tid,(label,f,ph,mins,sh) in T.items():
    for s,share in list(sh.items())+[("Home",None)]:
        d = screens.setdefault(s, {"visits":0,"minutes":0,"phone_min":0,"tasks":[]})
        if share is None:  # every task starts from Home (or the phone's last screen); count a visit, 6 s
            d["visits"] += f; d["minutes"] += f*0.1; d["phone_min"] += f*0.1*ph; continue
        d["visits"] += f; d["minutes"] += f*mins*share; d["phone_min"] += f*mins*share*ph; d["tasks"].append(tid)
tot_min = sum(d["minutes"] for d in screens.values())
rows = sorted(screens.items(), key=lambda kv: -(kv[1]["minutes"]/tot_min + kv[1]["visits"]/sum(d['visits'] for d in screens.values())))
tv = sum(d['visits'] for d in screens.values())
print(f"total tasks/month {sum(t[1] for t in T.values()):.1f}, minutes/month {tot_min:.0f}")
out=[]
for i,(s,d) in enumerate(rows,1):
    r = dict(rank=i, screen=s, visits=round(d["visits"],1), minutes=round(d["minutes"],1), time_share=round(100*d["minutes"]/tot_min), visit_share=round(100*d['visits']/tv), phone=round(100*d["phone_min"]/d["minutes"]) if d["minutes"] else 0, tasks=",".join(d["tasks"]))
    out.append(r); print(r)
phone_total = sum(d["phone_min"] for d in screens.values())/tot_min
print("phone share of all minutes", round(100*phone_total))
json.dump({"tasks":{k:list(v) for k,v in T.items()},"screens":out,"phone_total":round(100*phone_total),"minutes_total":round(tot_min)}, open(f"{__import__('sys').argv[1]}/usage_model.json","w"), indent=1)
