"""Every link of some words in the texts whose key starts with a prefix (several prefixes: comma-separated):

node tools/check_app.mjs --save-links links.json
python tools/build/homolist.py links.json u42- partie place compte"""
import json
import sys

sys.stdout.reconfigure(encoding="utf-8")
links = json.load(open(sys.argv[1], encoding="utf-8"))
prefixes = sys.argv[2].split(",")
words = {w.lower() for w in sys.argv[3:]}
for k, v in links.items():
    if not any(k.startswith(p) for p in prefixes):
        continue
    for l in v["links"]:
        surf, _, id_ = l.rpartition("=")
        if surf.lower() in words:
            print(f"{surf:10} → {id_:12} | {k}: {v['text'][:110]}")
