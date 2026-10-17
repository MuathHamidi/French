"""Coverage of the course against the Lexique 3.83 frequency list.

The list is not in git: download it once into tools/lexique/ (see README > Roadmap). Then, from the project folder:
  python tools/build/frequency.py                  coverage of the 1000…10000 most frequent nouns, verbs, adjectives, adverbs
  python tools/build/frequency.py --missing 200    the 200 most frequent lemmas the course doesn't have at all
  python tools/build/frequency.py --helpers 200    the 200 most frequent lemmas that are only helpers (linked, never taught)
  python tools/build/frequency.py --pos verb ...   only one part of speech (noun, verb, adj, adv)
A lemma's frequency is the mean of its film-subtitle and book frequencies (per million words)."""
import argparse
import csv
import json
import sys
from pathlib import Path

ROOT = Path.cwd()
sys.stdout.reconfigure(encoding="utf-8")
LEXIQUE = ROOT / "tools" / "lexique" / "Lexique383.tsv"
POS = {"NOM": "noun", "VER": "verb", "ADJ": "adj", "ADV": "adv"}
# Not for a lesson: grammar words the grammar lessons cover, vulgar film words, abbreviations and letters.
SKIP = {"être", "avoir", "faire", "aller", "pouvoir", "vouloir", "devoir", "falloir", "ne", "pas", "plus", "là", "ici",
        "foutre", "putain", "merde", "cul", "con", "pute", "salaud", "connerie", "bordel", "baiser", "crever", "chier",
        "enculer", "bite", "couille", "conne", "salope", "emmerder", "chiotte", "mme", "mlle", "m", "i", "c", "d", "o"}


def norm(s):
    """Lexique writes oe and ae where the course writes œ and æ."""
    return s.lower().replace("œ", "oe").replace("æ", "ae").replace("’", "'")


def course_index():
    """form -> set of (status, pos) for every taught word and helper; reflexive verbs also count without se."""
    index = {}

    def add(e, status):
        forms = [e["fr"], *e.get("forms", [])]
        for f in forms:
            f = norm(f)
            keys = {f}
            for p in ("se ", "s'", "s’"):
                if f.startswith(p):
                    keys.add(f[len(p):])
            for k in keys:
                index.setdefault(k, set()).add((status, e.get("pos")))
    for e in json.loads((ROOT / "data" / "lexicon.json").read_text(encoding="utf-8"))["entries"]:
        add(e, "helper")
    cur = json.loads((ROOT / "data" / "curriculum.json").read_text(encoding="utf-8"))
    for u in cur["units"]:
        for lid in u.get("lessons", []):
            for w in json.loads((ROOT / "data" / "lessons" / f"{lid}.json").read_text(encoding="utf-8")).get("words", []):
                add(w, "taught")
    return index


def lemmas():
    """(lemma, pos) -> frequency, for nouns, verbs, adjectives and adverbs."""
    if not LEXIQUE.exists():
        sys.exit(f"{LEXIQUE} is missing: download Lexique383.tsv from lexique.org first")
    out = {}
    with LEXIQUE.open(encoding="utf-8") as f:
        for row in csv.DictReader(f, delimiter="\t"):
            pos = POS.get(row["cgram"])
            if not pos:
                continue
            freq = (float(row["freqlemfilms2"] or 0) + float(row["freqlemlivres"] or 0)) / 2
            key = (row["lemme"], pos)
            out[key] = max(out.get(key, 0), freq)
    return sorted(out.items(), key=lambda kv: -kv[1])


def status(index, lemma, pos):
    hits = index.get(norm(lemma), set()) | (index.get(norm(lemma) + "s", set()) if pos == "noun" else set())
    if ("taught", pos) in hits:
        return "taught"
    if any(s == "taught" for s, _ in hits):
        return "taught (other pos)"
    if ("helper", pos) in hits:
        return "helper"
    if hits:
        return "helper (other pos)"
    return "missing"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--missing", type=int, default=0)
    ap.add_argument("--helpers", type=int, default=0)
    ap.add_argument("--pos", choices=sorted(set(POS.values())))
    ap.add_argument("--skip", type=int, default=0, help="ignore the N most frequent lemmas in the lists")
    a = ap.parse_args()
    index = course_index()
    ranked = [(k, f) for k, f in lemmas() if not a.pos or k[1] == a.pos]
    print(f"{'top':>6} {'taught':>8} {'helper':>8} {'missing':>8}")
    for n in (500, 1000, 2000, 3000, 5000, 8000, 10000):
        st = [status(index, *k) for k, _ in ranked[:n]]
        t = sum(s.startswith("taught") for s in st)
        h = sum(s.startswith("helper") for s in st)
        print(f"{n:>6} {t:>8} {h:>8} {n - t - h:>8}   ({100 * t / n:.0f}% taught)")
    for want, n in (("missing", a.missing), ("helper", a.helpers)):
        if not n:
            continue
        print(f"\n== {want}: the {n} most frequent")
        shown = 0
        for rank, ((lemma, pos), f) in enumerate(ranked, 1):
            if rank <= a.skip:
                continue
            s = status(index, lemma, pos)
            if s == want and lemma not in SKIP:
                print(f"{rank:>6} {pos:5} {lemma:20} {f:8.1f}")
                shown += 1
                if shown >= n:
                    break


if __name__ == "__main__":
    main()
