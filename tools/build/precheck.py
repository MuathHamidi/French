"""Pronunciation check for a unit's new words, before making the audio. Run it with the venv's python:

.venv/bin/python tools/build/precheck.py <unit> [helper ids...]      (on Windows: .venv\\Scripts\\python)
1. Piper's phonemes against the lesson IPA for every word of the unit (harmless variants folded: e/ɛ, o/ɔ, ɥ/y, schwa).
2. Each verb's first future and conditional forms side by side: they must differ (e / ɛ)."""
import json
import re
import sys
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path.cwd() / "tools"))
sys.stdout.reconfigure(encoding="utf-8")
import make_audio as M  # noqa: E402
from piper import PiperVoice  # noqa: E402

unit = int(sys.argv[1])
extra = set(sys.argv[2:])
voice = PiperVoice.load(str(M.VOICE))


def say(t):
    return "".join("".join(p) for p in voice.phonemize(M.tts_input(t)))


def fold(s):
    s = re.sub(r"[ˈˌ.\-\s!?,ə]", "", unicodedata.normalize("NFD", s))
    return s.replace("ɛ", "e").replace("ɔ", "o").replace("ɥ", "y").replace("ɲ", "nj")


cur = json.loads(Path("data/curriculum.json").read_text(encoding="utf-8"))
lessons = next(u for u in cur["units"] if u["n"] == unit)["lessons"]
words = [w for lid in lessons for w in json.loads(Path(f"data/lessons/{lid}.json").read_text(encoding="utf-8")).get("words", [])]
words += [e for e in json.loads(Path("data/lexicon.json").read_text(encoding="utf-8"))["entries"] if e["id"] in extra]
print("== IPA differences (after folding e/ɛ, o/ɔ, ɥ/y, ɲ/nj, schwa)")
for w in words:
    if not w.get("ipa"):
        continue
    s = say(w.get("say") or w["fr"])
    if fold(s) != fold(w["ipa"]):
        print(f"  {w['fr']:22} lesson /{w['ipa']}/  Piper /{s}/")
print("== future vs conditional")
for w in words:
    if w.get("pos") != "verb":
        continue
    forms = w.get("forms", [])
    for f in [f for f in forms if f.endswith("rai")][:1]:
        c = f + "s"
        if c in forms:
            a, b = say("je " + f if " " not in f else f), say("je " + c if " " not in c else c)
            print(f"  {f:24} /{a}/   {c:26} /{b}/{'   <-- SAME' if a == b else ''}")
