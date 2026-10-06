#!/usr/bin/env python3
"""Checks the course data before publishing.

Run:  python3 tools/validate.py
- every French word in definitions, examples, stories and quizzes must be in the dictionary
  (a lesson word or data/lexicon.json), so pointing at any word always shows a card;
- every lesson word must appear in its story;
- every grammar case must appear in the story and have at least two quiz questions.
The tokenizer mirrors js/content.js; keep them in sync.
"""
import json
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"

L = "A-Za-zÀ-ÖØ-öø-ÿŒœÆæ"
TOKEN_RE = re.compile(rf"[{L}]+(?:[-'’][{L}]+)*['’]?|\s+|[^{L}\s]")
ELISION_RE = re.compile(rf"^((?:l|d|j|m|t|s|n|c|qu|jusqu|lorsqu|puisqu)['’])([{L}].*)$", re.I)
WORD_RE = re.compile(rf"^[{L}]")

errors, warnings = [], []


def norm_key(s):
    s = unicodedata.normalize("NFC", s)
    return re.sub(r"[’‘`]", "'", s).lower().strip()


def split_word(w):
    m = ELISION_RE.match(w)
    if m:
        return [m.group(1)] + split_word(m.group(2))
    if "-" in w:
        out = []
        for i, part in enumerate(w.split("-")):
            if i:
                out.append("-")
            if part:
                out.extend(split_word(part))
        return out
    return [w]


def is_word(t):
    return bool(WORD_RE.match(t))


def raw_tokens(text):
    out = []
    for t in TOKEN_RE.findall(text):
        out.extend(split_word(t) if is_word(t) else [t])
    return out


def key_of(text):
    return " ".join(norm_key(t) for t in raw_tokens(text) if is_word(t))


def parse_markup(s):
    nodes, buf, i = [], "", 0

    def flush():
        nonlocal buf
        if buf:
            nodes.append({"kind": "text", "text": buf})
        buf = ""

    while i < len(s):
        if s.startswith("**", i):
            end = s.find("**", i + 2)
            if end > 0:
                flush()
                nodes.append({"kind": "target", "children": parse_markup(s[i + 2:end])})
                i = end + 2
                continue
        ch = s[i]
        if ch in "[{":
            close = "]" if ch == "[" else "}"
            depth, j = 0, i
            while j < len(s):
                if s[j] == ch:
                    depth += 1
                elif s[j] == close:
                    depth -= 1
                    if depth == 0:
                        break
                j += 1
            inner = s[i + 1:j]
            bar = inner.rfind("|")
            if j < len(s) and bar > 0:
                flush()
                text, ref = inner[:bar], inner[bar + 1:].strip()
                if ch == "[":
                    nodes.append({"kind": "word", "text": text, "id": ref})
                else:
                    nodes.append({"kind": "gram", "case": ref, "children": parse_markup(text)})
                i = j + 1
                continue
        buf += ch
        i += 1
    flush()
    return nodes


BEFORE_NOUN = {"le", "la", "l'", "les", "un", "une", "des", "du", "de", "d'", "au", "aux", "à", "ma", "ta", "sa",
               "mon", "ton", "son", "mes", "tes", "ses", "notre", "votre", "nos", "vos", "leur", "leurs", "ce", "cet",
               "cette", "ces", "quel", "quelle", "quels", "quelles",
               "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix", "onze", "douze", "quinze", "vingt",
               "trente", "quarante", "cinquante", "soixante", "cent", "mille", "plusieurs", "quelques", "chaque"}  # deux parties (not partir)
BEFORE_VERB = {"je", "j'", "tu", "il", "elle", "on", "nous", "vous", "ils", "elles", "qui", "ça", "ne", "n'",
               "me", "m'", "te", "t'", "se", "s'", "lui", "y",  # je lui parle, j'y vais
               "ai", "as", "a", "avons", "avez", "ont"}  # avoir + past participle: j'ai été (been, not summer)
AFTER_ETRE = {"suis", "es", "est", "sommes", "êtes", "sont"}  # être + participle or adjective, never a noun: elle est arrivée, elle est prête
# Object pronouns spelled like articles (je la vois, pour le faire, regarde-le): not "the".
OBJ_PRON = {"le": "le-pron", "la": "la-pron", "les": "les-pron", "l'": "l-pron", "leur": "leur-pron", "en": "en-pron"}
BEFORE_OBJ = {"je", "tu", "il", "elle", "on", "nous", "vous", "ils", "elles", "ne", "me", "te", "se", "qui", "ça"}
BEFORE_EN = BEFORE_OBJ | {"j'", "n'", "m'", "t'", "s'", "y", "lui", "leur"}  # j'en veux, il n'y en a pas
CAPITAL = re.compile(r"^[A-ZÀ-ÖØ-Þ]")


class Index:
    def __init__(self):
        self.map = defaultdict(list)
        self.max_phrase = 1
        self.pos = {}
        self.taught = set()  # ids of words taught in a lesson (vs lexicon helpers)

    def choose(self, ids, prefer, text, prev_key, prev_pos, prev_last=None):
        """Mirror of choose() in js/content.js. Returns (id, still_ambiguous)."""
        if len(ids) == 1:
            return ids[0], False
        c = list(ids)
        if any(self.pos.get(i) == "name" for i in c):
            cap = bool(CAPITAL.match(text))
            k = [i for i in c if (self.pos.get(i) == "name") == cap]
            c = k or c
        if prev_pos == "pron" and prev_key in OBJ_PRON:  # je la porte: a verb
            want = "verb"
        else:
            # after a phrase, its last word decides "noun" (à côté du lit); the whole phrase decides the rest
            last = prev_last or prev_key
            want = "noun" if last in BEFORE_NOUN else "verb" if prev_key in BEFORE_VERB or prev_pos in ("noun", "name") else None
        if want and len(c) > 1:
            k = [i for i in c if self.pos.get(i) == want]
            c = k or c
        elif prev_key in AFTER_ETRE and len(c) > 1:  # an adjective first, then a participle, never a noun
            k = [i for i in c if self.pos.get(i) == "adj"] or [i for i in c if self.pos.get(i) != "noun"]
            c = k or c
        preferred = [i for i in c if i in prefer]
        if preferred:
            return preferred[0], False
        taught = [i for i in c if i in self.taught]  # a lesson word beats a helper word
        if taught:
            return taught[0], len(taught) > 1
        return c[0], len(c) > 1

    def add(self, e, taught=False):
        self.pos[e["id"]] = e.get("pos")
        if taught:
            self.taught.add(e["id"])
        if e.get("manual"):  # only reachable through [word|id] markup
            return
        for form in [e["fr"], *e.get("forms", [])]:
            k = key_of(form)
            if k and e["id"] not in self.map[k]:
                self.map[k].append(e["id"])
                self.max_phrase = max(self.max_phrase, len(k.split(" ")))

    def tokenize(self, markup, prefer=frozenset()):
        """Returns (word segments, cases_used). Segment: dict(text, ids, id, amb, fixed, case)."""
        flat, cases = [], []

        def walk(nodes, ctx):
            for n in nodes:
                if n["kind"] == "text":
                    for t in raw_tokens(n["text"]):
                        flat.append({"w": is_word(t), "text": t, "key": norm_key(t), **ctx})
                elif n["kind"] == "word":
                    flat.append({"w": True, "text": n["text"], "key": key_of(n["text"]), "fixed": n["id"], **ctx})
                elif n["kind"] == "gram":
                    cases.append(n["case"])
                    walk(n["children"], {**ctx, "case": n["case"]})
                else:
                    walk(n["children"], {**ctx, "target": True})

        walk(parse_markup(markup), {})
        out, i = [], 0
        while i < len(flat):
            t = flat[i]
            if not t["w"] or t.get("fixed"):
                out.append(t)
                i += 1
                continue
            matched = False
            for length in range(self.max_phrase, 1, -1):
                span = self._phrase_at(flat, i, length)
                if span and " ".join(x["key"] for x in span[0]) in self.map:
                    key = " ".join(x["key"] for x in span[0])
                    out.append({**t, "text": "".join(x["text"] for x in flat[i:span[1] + 1]), "key": key, "last": span[0][-1]["key"], "ids": self.map[key]})
                    i = span[1] + 1
                    matched = True
                    break
            if not matched:
                out.append({**t, "ids": self.map.get(t["key"], [])})
                i += 1
        prev = None  # previous word segment, if only spaces separate it from the current one
        for k, s in enumerate(out):
            if not s["w"]:
                if not re.fullmatch(r"\s+", s["text"]):
                    prev = None
                continue
            if s.get("fixed"):
                s["id"], s["amb"] = s["fixed"], False
            elif s["ids"] and self.object_pronoun(out, k, prev):
                s["id"], s["amb"] = OBJ_PRON[s["key"]], False
            elif s["ids"]:
                s["id"], s["amb"] = self.choose(s["ids"], prefer, s["text"],
                                                prev["key"] if prev else None,
                                                self.pos.get(prev["id"]) if prev and prev.get("id") else None,
                                                prev.get("last") if prev else None)
            else:
                s["id"], s["amb"] = None, False
            prev = s
        return [s for s in out if s["w"]], cases

    def object_pronoun(self, out, k, prev):
        """le/la/les/l'/leur/en as an object pronoun: after a subject (je la vois, j'en veux), after a
        hyphen (regarde-le), before lui/y/en (je vais le lui dire) or before a word that can only be a
        verb (pour le faire). Mirror of js/content.js."""
        s = out[k]
        if s["key"] not in OBJ_PRON:
            return False
        if prev is not None and prev["key"] in (BEFORE_EN if s["key"] == "en" else BEFORE_OBJ):
            return True
        if k > 0 and out[k - 1]["text"] == "-":
            return True
        for nxt in out[k + 1:]:
            if not nxt["w"]:
                if re.fullmatch(r"\s+", nxt["text"]):
                    continue
                return False
            if s["key"] != "en" and nxt["key"] in ("lui", "y", "en"):  # je vais le lui dire
                return True
            if s["key"] == "en" and nxt["key"].endswith("ant"):  # en partant: a preposition
                return False
            ids = [nxt["fixed"]] if nxt.get("fixed") else nxt["ids"]
            return bool(ids) and all(self.pos.get(i) == "verb" for i in ids)
        return False

    @staticmethod
    def _phrase_at(flat, i, length):
        words, j = [], i
        while j < len(flat):
            t = flat[j]
            if t.get("case") != flat[i].get("case") or t.get("target") != flat[i].get("target") or t.get("fixed"):
                return None
            if t["w"]:
                words.append(t)
                if len(words) == length:
                    return words, j
            elif not re.fullmatch(r"\s+|-", t["text"]):
                return None
            j += 1
        return None


def main():
    curriculum = json.loads((DATA / "curriculum.json").read_text())
    lexicon = json.loads((DATA / "lexicon.json").read_text())
    lessons = []
    for u in curriculum["units"]:
        for lid in u.get("lessons", []):
            p = DATA / "lessons" / f"{lid}.json"
            if not p.exists():
                errors.append(f"curriculum lists {lid} but {p} is missing")
                continue
            lessons.append(json.loads(p.read_text()))

    index, ids = Index(), {}
    for e in lexicon["entries"]:
        if e["id"] in ids:
            errors.append(f"duplicate id {e['id']}")
        ids[e["id"]] = "lexicon"
        index.add(e)
    for lesson in lessons:
        for w in lesson.get("words", []):
            if w["id"] in ids:
                errors.append(f"duplicate id {w['id']} ({lesson['id']} and {ids[w['id']]})")
            ids[w["id"]] = lesson["id"]
            index.add(w, taught=True)

    unknown = Counter()
    unknown_where = {}
    ambiguous = Counter()

    def scan(markup, where, prefer=frozenset()):
        segs, cases = index.tokenize(markup, prefer)
        for s in segs:
            if s.get("fixed"):
                if s["fixed"] not in ids:
                    errors.append(f"{where}: [{s['text']}|{s['fixed']}] points to an unknown id")
                continue
            if not s["ids"]:
                k = norm_key(s["text"])
                unknown[k] += 1
                unknown_where.setdefault(k, where)
            elif s["amb"]:  # context, capitals and the lesson's own words couldn't decide
                ambiguous[f"{s['text']} → {', '.join(s['ids'])}"] += 1
        return segs, cases

    for lesson in lessons:
        lid = lesson["id"]
        own = frozenset(w["id"] for w in lesson.get("words", []))
        if lesson["type"] == "vocab":
            for w in lesson["words"]:
                where = f"{lid}/{w['id']}"
                for field in ("fr", "pos", "en", "def", "ipa"):
                    if not w.get(field):
                        errors.append(f"{where}: missing {field}")
                if w.get("pos") == "noun" and w.get("g") not in ("m", "f"):
                    errors.append(f"{where}: noun without gender (g: m/f)")
                if len(w.get("examples", [])) != 3:
                    errors.append(f"{where}: needs exactly 3 examples")
                scan(w.get("def", ""), where + " definition", own)
                for n, x in enumerate(w.get("examples", []), 1):
                    if "**" not in x["fr"]:
                        warnings.append(f"{where}: example {n} has no **target** (used for fill-in-the-blank)")
                    scan(x["fr"], f"{where} example {n}", own)
        story_ids, story_cases = set(), []
        for n, line in enumerate(lesson["story"]["lines"], 1):
            segs, cases = scan(line["fr"], f"{lid} story line {n}", own)
            story_cases += cases
            for s in segs:
                story_ids.update(s["ids"] if not s.get("fixed") else [s["fixed"]])
        if lesson["type"] == "vocab":
            for w in lesson["words"]:
                if w["id"] not in story_ids:
                    errors.append(f"{lid}: word “{w['fr']}” is not used in the story")
        else:
            case_ids = {c["id"] for c in lesson["cases"]}
            used = Counter(q["case"] for q in lesson["quiz"])
            for c in case_ids:
                if c not in story_cases:
                    errors.append(f"{lid}: case {c} is not highlighted in the story")
                if used[c] < 2:
                    errors.append(f"{lid}: case {c} has {used[c]} quiz question(s); needs at least 2")
            for n, q in enumerate(lesson["quiz"], 1):
                where = f"{lid} quiz {n}"
                if q["case"] not in case_ids:
                    errors.append(f"{where}: unknown case {q['case']}")
                answers = q["answer"] if isinstance(q["answer"], list) else [q["answer"]]
                if q["type"] == "mc" and not set(answers) <= set(q["options"]):
                    errors.append(f"{where}: answer is not among the options")
                for v in answers + q.get("options", []) + [q.get("say", ""), q.get("listen", "")]:
                    if re.search(r"\[[^\]]*\|[^\]]*\]|\{[^}]*\|[^}]*\}", v or ""):  # shown or compared as plain text
                        errors.append(f"{where}: markup in an answer, option or spoken text: {v}")
                if q.get("lang") != "en":
                    scan(q["q"].replace("___", " "), where)
            for s in lesson["sections"]:
                for x in s.get("examples", []):
                    _, cases = scan(x["fr"], f"{lid} {s['title']}")
                    for c in cases:
                        if c not in case_ids:
                            errors.append(f"{lid} {s['title']}: unknown case {c}")
                table = s.get("table")
                if table:
                    for row in table["rows"]:
                        for col in table.get("frCols", [0]):
                            scan(row[col], f"{lid} {s['title']} table")
            for c in story_cases:
                if c not in case_ids:
                    errors.append(f"{lid} story: unknown case {c}")

    # Letters from other alphabets that look Latin (e.g. Cyrillic а) break lookups and audio.
    foreign = re.compile(r"[\u0370-\u03ff\u0400-\u04ff]")
    for path in [DATA / "lexicon.json", *sorted((DATA / "lessons").glob("*.json"))]:
        for n, line in enumerate(path.read_text().splitlines(), 1):
            if foreign.search(line):
                errors.append(f"{path.name}:{n}: non-Latin letter {foreign.search(line).group()!r} (Greek/Cyrillic look-alike?)")

    print(f"{len(lessons)} lessons, {len(ids)} dictionary entries ({len(lexicon['entries'])} helpers)")
    if unknown:
        errors.append(f"{len(unknown)} words are not in the dictionary")
        print("\nNot in the dictionary (add to data/lexicon.json or a lesson):")
        for k, n in unknown.most_common():
            print(f"  {k:20} ×{n:<3} e.g. {unknown_where[k]}")
    if ambiguous:
        print("\nAmbiguous (first id is used unless marked up as [word|id]):")
        for k, n in ambiguous.most_common():
            print(f"  {k} ×{n}")
    for w in warnings:
        print("warning:", w)
    for e in errors:
        print("ERROR:", e)
    print("\nOK" if not errors else f"\n{len(errors)} error(s)")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
