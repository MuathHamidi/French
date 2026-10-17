"""Register a unit's lessons and sync the helpers in data/lexicon.json.

python tools/build/lexsync.py <unit> <lesson> <lesson> ... [--helpers new_helpers.json]
- the lessons are the file names after "uNN-", in the unit's order (data/lessons/u42-mer.json → mer);
  they replace the unit's "planned" list in data/curriculum.json;
- every helper whose id is now a lesson word is removed from data/lexicon.json (it is promoted);
- the helpers in new_helpers.json (a JSON list of entries) are appended, skipping ids that already exist.
lexicon.json is written back in its one-entry-per-line format. Run it again whenever a lesson gains a word."""
import argparse
import json
from pathlib import Path

DATA = Path.cwd() / "data"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("unit", type=int)
    ap.add_argument("lessons", nargs="+")
    ap.add_argument("--helpers")
    a = ap.parse_args()
    files = [DATA / "lessons" / f"u{a.unit:02d}-{name}.json" for name in a.lessons]
    for f in files:
        assert f.exists(), f"{f} is missing"
    ids = [f.stem for f in files]

    cur_path = DATA / "curriculum.json"
    lines = cur_path.read_text(encoding="utf-8").split("\n")
    found = False
    for i, line in enumerate(lines):
        if line.strip().startswith(f'{{"n": {a.unit},'):
            u = json.loads(line.strip().rstrip(","))
            u["lessons"] = ids
            u = {k: u[k] for k in ["n", "title", "en", "lessons"] if k in u}
            comma = "," if line.rstrip().endswith(",") else ""
            lines[i] = "    " + json.dumps(u, ensure_ascii=False) + comma
            found = True
    assert found, f"unit {a.unit} is not in data/curriculum.json"
    cur_path.write_text("\n".join(lines), encoding="utf-8", newline="\n")

    taught = {w["id"] for f in files for w in json.loads(f.read_text(encoding="utf-8")).get("words", [])}
    lex_path = DATA / "lexicon.json"
    lex = json.loads(lex_path.read_text(encoding="utf-8"))
    before = len(lex["entries"])
    promoted = [e["id"] for e in lex["entries"] if e["id"] in taught]
    lex["entries"] = [e for e in lex["entries"] if e["id"] not in taught]
    added = []
    if a.helpers:
        have = {e["id"] for e in lex["entries"]} | taught
        for e in json.loads(Path(a.helpers).read_text(encoding="utf-8")):
            if e["id"] not in have:
                lex["entries"].append(e)
                have.add(e["id"])
                added.append(e["id"])
    out = ["{", f'  "about": {json.dumps(lex["about"], ensure_ascii=False)},', '  "entries": [']
    out += ["    " + json.dumps(e, ensure_ascii=False) + ("," if i < len(lex["entries"]) - 1 else "")
            for i, e in enumerate(lex["entries"])]
    out += ["  ]", "}", ""]
    lex_path.write_text("\n".join(out), encoding="utf-8", newline="\n")
    print(f"unit {a.unit} lessons: {ids}")
    print(f"lexicon: {before} -> {len(lex['entries'])} (promoted {len(promoted)}: {', '.join(promoted)}; "
          f"added {len(added)}: {', '.join(added)})")


if __name__ == "__main__":
    main()
