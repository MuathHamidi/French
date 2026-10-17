"""Where is a word in the course? Lists every entry (lesson word or helper) that has it as a form.

python tools/build/where.py word1 word2 ...      or      python tools/build/where.py words.txt (one per line)"""
import glob
import json
import os
import sys
from pathlib import Path

hits = {}


def scan(src, e):
    for f in [e["fr"], *e.get("forms", [])]:
        hits.setdefault(f.lower(), []).append(f"{src}:{e['id']}{' (manual)' if e.get('manual') else ''} = {e.get('en', '')[:60]}")


for e in json.load(open("data/lexicon.json", encoding="utf-8"))["entries"]:
    scan("LEX", e)
for p in sorted(glob.glob("data/lessons/*.json")):
    for w in json.load(open(p, encoding="utf-8")).get("words", []):
        scan(os.path.basename(p)[:-5], w)
args = sys.argv[1:]
words = Path(args[0]).read_text(encoding="utf-8").split("\n") if len(args) == 1 and Path(args[0]).is_file() else args
sys.stdout.reconfigure(encoding="utf-8")
for w in words:
    w = w.strip()
    if w:
        print(f"{w:24} {hits.get(w.lower(), '-')}")
