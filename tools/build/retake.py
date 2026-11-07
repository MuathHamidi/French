"""Record a word again, keeping the best of ten takes. The voice is a little random: said alone, a one-syllable word
sometimes comes out with a puff of air after its p, t or k (tort, thé, as in English), and je and ne came out with an
open vowel. --check measures the recordings of the taught one-syllable words that start with p, t or k, and lists
those with a puff (from the first sound to the vowel: 110 ms or more, 140 before r, l or a glide; "tu es" takes 60).

A recording never changes under its name (phones keep the copy they heard, sw.js), so before a retake give the word a
new one: an ALONE_FIXES entry in tools/make_audio.py, its own phonemes if nothing else (say.py prints them). Each take
is measured, and the best is written under the name make_audio.py gives the word, so make_audio.py keeps it. Then run
make_audio.py --prune. Run it with the venv's python:

.venv/bin/python tools/build/retake.py --check
.venv/bin/python tools/build/retake.py thé tort            the take whose consonant is nearest 55 ms
.venv/bin/python tools/build/retake.py --f1 350 ne         the take whose vowel's first formant is nearest 350 Hz (jeu)
(on Windows: .venv\\Scripts\\python)"""
import hashlib
import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path.cwd() / "tools"))
sys.stdout.reconfigure(encoding="utf-8")
import numpy as np  # noqa: E402
import soundfile as sf  # noqa: E402
import make_audio as M  # noqa: E402

V = M.V


def consonant_ms(y, sr):
    """From the first sound to the vowel, in 5 ms frames: the vowel is the first loud frame with few zero crossings."""
    n = int(0.005 * sr)
    frames = [(np.sqrt(np.mean(y[i:i + n] ** 2)), np.mean(np.abs(np.diff(np.sign(y[i:i + n]))) > 0))
              for i in range(0, len(y) - n, n)]
    peak = max(r for r, _ in frames)
    start = next(i for i, (r, _) in enumerate(frames) if r > 0.02 * peak)
    vowel = next(i for i, (r, z) in enumerate(frames) if i > start and z < 0.15 and r > 0.15 * peak)
    return (vowel - start) * 5


def formants(x, sr):
    """The formants of a frame, lowest first, by linear prediction."""
    x = np.append(x[0], x[1:] - 0.63 * x[:-1]) * np.hamming(len(x))
    order = 2 + sr // 1000
    r = np.correlate(x, x, "full")[len(x) - 1:len(x) + order]
    a = np.linalg.solve(np.array([[r[abs(i - j)] for j in range(order)] for i in range(order)]), r[1:order + 1])
    roots = [z for z in np.roots(np.concatenate(([1], -a))) if z.imag > 0]
    found = sorted((np.angle(z) * sr / (2 * np.pi), -sr / np.pi * np.log(abs(z))) for z in roots)
    return [f for f, bandwidth in found if f > 150 and bandwidth < 500]


def vowel_f1(y, sr):
    """The vowel's first formant: the median over the loud 30 ms frames, leaving out a nasal's murmur (below 280 Hz)."""
    w, hop = int(0.03 * sr), int(0.01 * sr)
    rms = [np.sqrt(np.mean(y[i:i + w] ** 2)) for i in range(0, len(y) - w, hop)]
    f1 = [f[0] for i, r in enumerate(rms) if r > 0.5 * max(rms)
          for f in [formants(y[i * hop:i * hop + w], sr)] if f and f[0] > 280]
    return float(np.median(f1)) if f1 else float("inf")


def words():
    yield from json.loads((V.DATA / "lexicon.json").read_text(encoding="utf-8"))["entries"]
    for u in json.loads((V.DATA / "curriculum.json").read_text(encoding="utf-8"))["units"]:
        for lid in u.get("lessons", []):
            yield from json.loads((V.DATA / "lessons" / f"{lid}.json").read_text(encoding="utf-8")).get("words", [])


def check():
    files = json.loads((V.DATA / "audio.json").read_text(encoding="utf-8"))["files"]
    seen = set()
    for e in words():
        text, ipa = e.get("say") or e["fr"], e.get("ipa", "").replace("ˈ", "")
        path = files.get(M.key(text))
        if " " in text or "." in ipa or not ipa or ipa[0] not in "ptk" or ipa[1:2] in "ʃs" or text in seen or not path:
            continue  # (the hiss of tʃ, in ciao, is the consonant itself)
        seen.add(text)
        ms = consonant_ms(*sf.read(path))
        if ms >= (140 if ipa[1:2] in "ʁljwɥ" else 110):
            print(f"{text:12} /{ipa}/  {ms} ms   {path}")


def retake(texts, f1=None):
    from piper import PiperVoice
    voice = PiperVoice.load(str(M.VOICE))
    for text in texts:
        name = hashlib.sha1(f"{M.VOICE_NAME}|{M.tts_input(text)}".encode()).hexdigest()[:12] + ".mp3"
        if subprocess.run(["git", "ls-files", "--error-unmatch", f"audio/{name}"], capture_output=True).returncode == 0:
            print(f"{text}: audio/{name} is published already; give the word a new name first (ALONE_FIXES)")
            continue
        takes = []
        for _ in range(10):
            audio, rate = M.synthesize(voice, text)
            value = vowel_f1(audio, rate) if f1 else consonant_ms(audio, rate)
            takes.append((abs(value - (f1 or 55)), value, audio, rate))
        _, value, audio, rate = min(takes, key=lambda t: t[0])
        sf.write(M.AUDIO_DIR / name, audio, rate, format="MP3")
        print(f"{text}: kept {value:.0f} {'Hz' if f1 else 'ms'} from {' '.join(f'{t[1]:.0f}' for t in takes)}"
              f" -> audio/{name}")


args = sys.argv[1:]
if args == ["--check"]:
    check()
elif args[:1] == ["--f1"]:
    retake(args[2:], float(args[1]))
else:
    retake(args)
