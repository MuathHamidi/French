"""Expand verb-form placeholders in lesson or helper files:

python tools/build/expand_forms.py data/lessons/u42-*.json [new_helpers.json]
A "forms" list that is exactly ["@KIND:STEM"] is replaced by all the verb's forms: present, participles,
imparfait, future, conditional, the subjunctive forms that differ, the present participle and the passé simple.
  @er:STEM            regular -er verb, agreeing participle (-ger and -cer spellings handled): @er:arros
  @er-i:STEM          regular -er verb whose participle doesn't agree (intransitive): saigné only
  @er-refl:STEM       reflexive -er verb (se débrouiller): the pronoun forms, then the bare forms
  @ir2:STEM           -ir verb like finir, participle invariable (réagi)
  @ir2-a:STEM         -ir verb like finir, agreeing participle (choisi, choisie…)
  @ir2-refl:STEM      reflexive -ir verb like finir (s'évanouir)
  @re:STEM            -re verb like rendre, agreeing participle: @re:tond
  @re-i:STEM          -re verb like rendre, invariable participle
Irregular verbs (and -eler, -eter, -yer, e/é + consonant + er verbs) need their forms written by hand.
Afterwards, remove any form spelled like another word (see CLAUDE.md)."""
import json
import re
import sys
from pathlib import Path

VOWEL = "aeiouhéèêàâîïôûœ"


def soft(stem, ending):
    """mange + ons -> mangeons, commen(c) + ons -> commençons, commen(c) + âmes -> commençâmes."""
    if ending[:1] in ("a", "â", "o"):
        if stem.endswith("g"):
            return stem + "e" + ending
        if stem.endswith("c"):
            return stem[:-1] + "ç" + ending
    return stem + ending


def er(s, agree=True):
    f = [soft(s, e) for e in ("e", "es", "ons", "ez", "ent")]
    f += [s + "é"] + ([s + "ée", s + "és", s + "ées"] if agree else [])
    f += [soft(s, e) for e in ("ais", "ait", "ions", "iez", "aient")]
    f += [s + e for e in ("erai", "eras", "era", "erons", "erez", "eront", "erais", "erait", "erions", "eriez", "eraient")]
    f += [soft(s, "ant")]
    f += [soft(s, e) for e in ("ai", "as", "a", "âmes", "âtes")] + [s + "èrent"]  # passé simple
    return f


def elide(p, w):
    return (p[0] + "'" + w) if w[0] in VOWEL else (p + " " + w)


def refl(bare_present, inf, fut, cond):
    """The pronoun forms of a reflexive verb: present, infinitive, future and conditional with their pronoun."""
    pr = [("me", 0), ("te", 1), ("se", 2), ("nous nous", 3), ("vous vous", 4), ("se", 5)]
    out = []
    for p, i in pr:
        if p in ("nous nous", "vous vous"):
            out.append(p + " " + bare_present[i])
        else:
            out.append(elide(p, bare_present[i]))
    out += [elide("me", inf), elide("te", inf), "nous " + inf, "vous " + inf, inf]
    for tense in (fut, cond):
        for (p, _), w in zip(pr, tense):
            out.append(p + " " + w if p in ("nous nous", "vous vous") else elide(p, w))
    return out


def er_refl(s):
    bare = er(s)
    present = [soft(s, e) for e in ("e", "es", "e", "ons", "ez", "ent")]
    fut = [s + e for e in ("erai", "eras", "era", "erons", "erez", "eront")]
    cond = [s + e for e in ("erais", "erais", "erait", "erions", "eriez", "eraient")]
    return refl(present, s + "er", fut, cond) + bare


def ir2(s, agree=False):
    f = [s + e for e in ("is", "it", "issons", "issez", "issent", "i")]
    f += [s + "ie", s + "is", s + "ies"] if agree else []
    f += [s + e for e in ("issais", "issait", "issions", "issiez", "issaient",
                          "irai", "iras", "ira", "irons", "irez", "iront",
                          "irais", "irait", "irions", "iriez", "iraient", "isse", "isses", "issant")]
    f += [s + e for e in ("îmes", "îtes", "irent")]  # passé simple (je finis, il finit are present forms)
    return f


def ir2_refl(s):
    bare = ir2(s, agree=True)
    present = [s + e for e in ("is", "is", "it", "issons", "issez", "issent")]
    fut = [s + e for e in ("irai", "iras", "ira", "irons", "irez", "iront")]
    cond = [s + e for e in ("irais", "irais", "irait", "irions", "iriez", "iraient")]
    return refl(present, s + "ir", fut, cond) + bare


def re_(s, agree=True):
    f = [s + "s", s, s + "ons", s + "ez", s + "ent", s + "u"]
    f += [s + "ue", s + "us", s + "ues"] if agree else []
    f += [s + e for e in ("ais", "ait", "ions", "iez", "aient", "rai", "ras", "ra", "rons", "rez", "ront",
                          "rais", "rait", "rions", "riez", "raient", "ant", "is", "it", "îmes", "îtes", "irent", "e", "es")]
    return f


KINDS = {"er": er, "er-i": lambda s: er(s, agree=False), "er-refl": er_refl,
         "ir2": ir2, "ir2-a": lambda s: ir2(s, agree=True), "ir2-refl": ir2_refl,
         "re": re_, "re-i": lambda s: re_(s, agree=False)}


def dedupe(xs):
    seen, out = set(), []
    for x in xs:
        if x not in seen:
            seen.add(x)
            out.append(x)
    return out


def main():
    for path in sys.argv[1:]:
        p = Path(path)
        t = p.read_text(encoding="utf-8")
        n = 0

        def rep(m):
            nonlocal n
            kind, stem = m.group(1), m.group(2)
            n += 1
            return '"forms": ' + json.dumps(dedupe(KINDS[kind](stem)), ensure_ascii=False)
        t = re.sub(r'"forms": \["@([a-z0-9-]+):([^"]+)"\]', rep, t)
        json.loads(t)
        p.write_text(t, encoding="utf-8", newline="\n")
        print(f"{p.name}: expanded {n} verb(s)")


if __name__ == "__main__":
    main()
