"""Which words of a list are taught, only helpers, or missing from the course?

python tools/build/gap.py word1 word2 ...      or      python tools/build/gap.py words.txt (one per line)"""
import glob
import json
import sys
from pathlib import Path

taught, helper = {}, {}
for e in json.load(open("data/lexicon.json", encoding="utf-8"))["entries"]:
    for f in [e["fr"], *e.get("forms", [])]:
        helper.setdefault(f.lower(), e["id"])
for p in sorted(glob.glob("data/lessons/*.json")):
    for w in json.load(open(p, encoding="utf-8")).get("words", []):
        for f in [w["fr"], *w.get("forms", [])]:
            taught.setdefault(f.lower(), w["id"])
args = sys.argv[1:]
words = Path(args[0]).read_text(encoding="utf-8").split("\n") if len(args) == 1 and Path(args[0]).is_file() else args
words = [w.strip() for w in words if w.strip()]
miss = [w for w in words if w.lower() not in taught and w.lower() not in helper]
hel = [w for w in words if w.lower() not in taught and w.lower() in helper]
sys.stdout.reconfigure(encoding="utf-8")
print(f"{len(words)} words: {len(words) - len(miss) - len(hel)} taught, {len(hel)} helpers, {len(miss)} missing")
print("HELPERS:", ", ".join(hel))
print("MISSING:", ", ".join(miss))
