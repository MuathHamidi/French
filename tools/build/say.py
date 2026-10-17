"""How does the voice read a text? Prints Piper's phonemes, with FIXES applied. Run it with the venv's python:

.venv/bin/python tools/build/say.py "Un texte." "Un autre."      or      ... tools/build/say.py texts.txt (one per line)
(on Windows: .venv\\Scripts\\python)"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path.cwd() / "tools"))
sys.stdout.reconfigure(encoding="utf-8")
import make_audio as M  # noqa: E402
from piper import PiperVoice  # noqa: E402

voice = PiperVoice.load(str(M.VOICE))
args = sys.argv[1:]
texts = Path(args[0]).read_text(encoding="utf-8").splitlines() if len(args) == 1 and Path(args[0]).is_file() else args
for t in texts:
    if t.strip():
        print(f"{t:44} /{''.join(''.join(p) for p in voice.phonemize(M.tts_input(t)))}/")
