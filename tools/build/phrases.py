"""Every phrase match (several words linked to one entry) in the texts whose key starts with a prefix, once each.
Read them all: a phrase can take a word in another sense (ne quitte pas, read as ne quittez pas: hold the line).

node tools/check_app.mjs --save-links links.json
python tools/build/phrases.py links.json u42-          (several prefixes: comma-separated)"""
import json
import sys

sys.stdout.reconfigure(encoding="utf-8")
links = json.load(open(sys.argv[1], encoding="utf-8"))
prefixes = sys.argv[2].split(",")
seen = {}
for k, v in links.items():
    if not any(k.startswith(p) for p in prefixes) or "prompt" in k:
        continue
    for l in v["links"]:
        surf, _, id_ = l.rpartition("=")
        words = surf.replace("-", " ").replace("'", "' ").split()
        if len(words) > 1:
            seen.setdefault((surf.lower(), id_), (k, v["text"]))
for (s, i), (k, text) in sorted(seen.items(), key=lambda kv: kv[0][1]):
    print(f"{s:26} → {i:22} {k[:40]:40} | {text[:90]}")
