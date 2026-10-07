#!/usr/bin/env python3
"""Generates natural audio for every French word and sentence in the course, using Piper.

Setup once (see README › Natural audio), then run:
    .venv/bin/python tools/make_audio.py            # only synthesizes texts that are new
    .venv/bin/python tools/make_audio.py --prune    # also deletes audio no longer used
(On Windows the venv's Python is .venv\\Scripts\\python.)

Writes audio/<hash>.mp3 and data/audio.json, which maps each text to its file. The app
(js/audio.js) looks texts up the same way and falls back to the device voice if one is missing.
"""
import hashlib
import json
import re
import sys
import unicodedata
from pathlib import Path

import numpy as np
import soundfile as sf
from piper import PiperVoice, SynthesisConfig

sys.path.insert(0, str(Path(__file__).resolve().parent))
import validate as V  # noqa: E402  (same tokenizer as the app)

AUDIO_DIR = V.ROOT / "audio"
MANIFEST = V.DATA / "audio.json"
VOICE_NAME = "fr_FR-siwis-medium"
VOICE = V.ROOT / "tools" / "voices" / f"{VOICE_NAME}.onnx"
SETTINGS_TEST = "Bonjour ! Je m’appelle Léa. Je suis française, et toi ?"  # same text as js/views/settings.js
CREDIT = ("Audio generated with Piper TTS, voice fr_FR-siwis-medium, trained on the SIWIS French "
          "Speech Synthesis Database (University of Edinburgh), CC BY 4.0.")

# Clicking an elided word on its own (the c' of c'est) should say the full word.
ELIDED = {"l'": "le", "d'": "de", "j'": "je", "m'": "me", "t'": "te", "s'": "se", "n'": "ne",
          "c'": "ce", "qu'": "que", "jusqu'": "jusque", "lorsqu'": "lorsque", "puisqu'": "puisque"}
HAS_LETTER = re.compile(rf"[{V.L}]")

# Words the voice gets wrong, with the right phonemes (Piper reads [[ ... ]] as phonemes).
# Found by the IPA check at the end of each run; add to this list when a word sounds wrong.
FIXES = {
    "chose": "ʃˈoz", "choses": "ʃˈoz",
    "votre": "vˈɔtʁ",
    "poli": "pɔlˈi", "polie": "pɔlˈi", "polis": "pɔlˈi", "polies": "pɔlˈi",
    "professeur": "pʁɔfɛsˈœʁ", "professeurs": "pʁɔfɛsˈœʁ",
    "fils": "fˈis",  # the voice says /fil/ (threads)
    "notre": "nˈɔtʁ",
    "jeune": "ʒˈœn", "jeunes": "ʒˈœn",  # the voice says /ʒøn/ (jeûne, fasting)
    "photo": "fɔtˈo", "photos": "fɔtˈo",
    "oh": "ˈo",
    "cent ans": "sˈɑ̃t ˈɑ̃",  # the voice skips the liaison /t/
    "meuble": "mˈœbl", "meubles": "mˈœbl",  # the voice says /møbl/
    "bon anniversaire": "bɔn anivɛʁsˈɛʁ",  # "bon" loses its nasal before a vowel
    "porc": "pˈɔʁ",  # the c is silent
    "immeuble": "imˈœbl", "immeubles": "imˈœbl",
    "seulement": "sœlmˈɑ̃",
    "mmm": "ˈmːː",  # otherwise read as the letters M-M-M
    "chut": "ʃˈyt", "chips": "ʃˈips",  # final consonant is pronounced
    "pizza": "pidzˈa", "pizzas": "pidzˈa",
    "t-shirt": "tiʃˈœʁt", "t-shirts": "tiʃˈœʁt",  # otherwise read with an English accent
    "pull": "pˈyl", "pulls": "pˈyl",
    "rose": "ʁˈoz", "roses": "ʁˈoz",  # the voice says /ʁɔz/
    "vingt heures": "vˈɛ̃t ˈœʁ",  # the voice skips the liaison /t/
    "hmm": "ˈmːː",
    "vas-y": "vˈazi", "allons-y": "alˈɔ̃zi", "allez-y": "alˈezi",  # otherwise y is read "i grec"
    "football": "futbˈol", "foot": "fˈut",  # otherwise read with an English accent
    "joues": "ʒˈu", "jouent": "ʒˈu", "roues": "ʁˈu",  # the voice swallows the vowel: /ʒw/
    "comment allez-vous": "kɔmˈɑ̃t alevˈu",  # the voice skips the liaison /t/
    "halloween": "alɔwˈin",  # otherwise read in English
    "huitième": "yitjˈɛm", "huitièmes": "yitjˈɛm",  # the voice says /ɥisjɛm/
    "dos": "dˈo",  # otherwise read in English, with the s
    "camping": "kɑ̃pˈiŋ", "campings": "kɑ̃pˈiŋ",  # otherwise read in English
    "plein air": "plɛn ˈɛʁ",  # "plein" loses its nasal before a vowel
    "annecy": "ansˈi",  # otherwise stressed on the first syllable
    "mail": "mˈɛl", "mails": "mˈɛl", "e-mail": "imˈɛl", "e-mails": "imˈɛl",  # otherwise read in English
    "bruxelles": "bʁysˈɛl",  # the x is said /s/
    "bon avocat": "bɔn avɔkˈa",  # "bon" loses its nasal before a vowel
    "churros": "ʃuʁˈɔs", "nounours": "nunˈuʁs",  # the final s is pronounced
    "bronzer": "bʁɔ̃zˈe",  # the voice says /bʁɔ̃zœʁ/
    "wifi": "wifˈi",  # otherwise read in English
    "scotch": "skˈɔtʃ", "scotchs": "skˈɔtʃ",  # otherwise read with an English vowel
    "parking": "paʁkˈiŋ", "parkings": "paʁkˈiŋ", "jury": "ʒyʁˈi", "jurys": "ʒyʁˈi",  # otherwise read in English
    "champs-élysées": "ʃɑ̃zelizˈe",  # the voice skips the liaison /z/
    "louent": "lˈu", "loues": "lˈu",  # the voice swallows the vowel, like jouent
    "jouions": "ʒujˈɔ̃", "jouiez": "ʒujˈe",  # the voice says /ʒwjɔ̃/
    "habitions": "abitjˈɔ̃", "habitiez": "abitjˈe",  # the voice reads -tions as in "nation": /abisjɔ̃/
    "nous habitions": "nuzabitjˈɔ̃", "vous habitiez": "vuzabitjˈe",  # keep the liaison /z/
    "en fait": "ɑ̃ fˈɛt", "au fait": "o fˈɛt",  # the t is said in these phrases
    "laid": "lˈɛ", "laids": "lˈɛ",  # the voice says the silent d
    "cent euros": "sˈɑ̃t øʁˈo",  # liaison /t/
    "centième": "sɑ̃tjˈɛm", "trentième": "tʁɑ̃tjˈɛm", "cinquantième": "sɛ̃kɑ̃tjˈɛm",  # the voice reads -tième as /sjɛm/
    "crumble": "kʁœmbˈœl",  # an English word said the French way
    "ça y est": "sa jˈɛ", "il y en a": "il jɑ̃n ˈa", "il n'y en a": "il njɑ̃n ˈa",  # y is a glide here, not an extra syllable
    "avant-hier": "avɑ̃tjˈɛʁ",  # the voice skips the /t/
    "avouent": "avˈu", "ils avouent": "ilz avˈu", "elles avouent": "ɛlz avˈu",  # the voice swallows the vowel, like jouent
    "plaignent": "plˈɛɲ", "baignent": "bˈɛɲ", "soignent": "swˈaɲ", "éteignent": "etˈɛɲ",  # the voice says /nj/ for final -gnent
    "ils éteignent": "ilz etˈɛɲ", "elles éteignent": "ɛlz etˈɛɲ",  # keep the liaison /z/
    "jouerai": "ʒuʁˈe", "joueras": "ʒuʁˈa", "jouera": "ʒuʁˈa", "jouerons": "ʒuʁˈɔ̃", "jouerez": "ʒuʁˈe", "joueront": "ʒuʁˈɔ̃",  # future of -ouer verbs: the voice says /ʒwʁe/
    "louerai": "luʁˈe", "loueras": "luʁˈa", "louera": "luʁˈa", "louerons": "luʁˈɔ̃", "louerez": "luʁˈe", "loueront": "luʁˈɔ̃", "avouerai": "avuʁˈe", "avoueras": "avuʁˈa", "avouera": "avuʁˈa", "avouerons": "avuʁˈɔ̃", "avouerez": "avuʁˈe", "avoueront": "avuʁˈɔ̃",
    "jouerais": "ʒuʁˈɛ", "jouerait": "ʒuʁˈɛ", "jouerions": "ʒuʁjˈɔ̃", "joueriez": "ʒuʁjˈe", "joueraient": "ʒuʁˈɛ",  # conditional of -ouer verbs: the voice says /ʒwʁɛ/
    "louerais": "luʁˈɛ", "louerait": "luʁˈɛ", "louerions": "luʁjˈɔ̃", "loueriez": "luʁjˈe", "loueraient": "luʁˈɛ", "avouerais": "avuʁˈɛ", "avouerait": "avuʁˈɛ", "avouerions": "avuʁjˈɔ̃", "avoueriez": "avuʁjˈe", "avoueraient": "avuʁˈɛ",
    "vœu": "vˈø",  # the voice says /vœ/
    "veuve": "vˈœv", "veuves": "vˈœv",  # the voice says /vøv/
    "bugnes": "bˈyɲ",  # the voice says /nj/, like -gnent
    "mathis": "matˈis",  # the final s of the name is pronounced
    "amer": "amˈɛʁ", "amers": "amˈɛʁ",  # the voice says /ame/, like aimer
    "tapas": "tapˈas",  # the final s is pronounced
    "curry": "kyʁˈi", "currys": "kyʁˈi", "steak": "stˈɛk", "steaks": "stˈɛk", "beurk": "bˈœʁk",  # otherwise read in English
    "bon appétit": "bɔn apetˈi",  # "bon" loses its nasal before a vowel
    "maghreb": "maɡʁˈɛb",  # otherwise read with an English r
    "chamonix": "ʃamonˈi",  # the x is silent
    "pleuve": "plˈœv",  # the voice says /pløv/, like veuve
    "respect": "ʁɛspˈɛ",  # the c and t are silent
    "en plus": "ɑ̃ plˈys", "de plus en plus": "də plyz ɑ̃ plˈy",  # en plus (what's more, extra) keeps its s
    "yanis": "janˈis",  # the final s of the name is pronounced
    "le leur": "lə lˈœʁ", "la leur": "la lˈœʁ", "les leurs": "le lˈœʁ",  # the voice says /løʁ/ after an article
    "quiz": "kwˈiz",  # the voice says /kiz/
    "vo": "veˈo", "bd": "bedˈe",  # said letter by letter (the voice reads "BD" as "boulevard")
    "saint-exupéry": "sɛ̃tɛɡzypeʁˈi",  # otherwise read in English
    "chef-d'œuvre": "ʃɛdˈœvʁ", "chefs-d'œuvre": "ʃɛdˈœvʁ",  # the f is silent
    "cdi": "sˌedeˈi",  # alone, the voice says /sedi/
    "monopoly": "mɔnɔpɔlˈi",  # otherwise read in English
    "échouerai": "eʃuʁˈe", "échoueras": "eʃuʁˈa", "échouera": "eʃuʁˈa", "échouerons": "eʃuʁˈɔ̃", "échouerez": "eʃuʁˈe", "échoueront": "eʃuʁˈɔ̃",  # -ouer verbs: the voice says /eʃwʁe/
    "échouerais": "eʃuʁˈɛ", "échouerait": "eʃuʁˈɛ", "échouerions": "eʃuʁjˈɔ̃", "échoueriez": "eʃuʁjˈe", "échoueraient": "eʃuʁˈɛ",
    "tournevis": "tuʁnəvˈis", "une vis": "yn vˈis", "ces vis": "se vˈis", "les vis": "le vˈis", "trois vis": "tʁwa vˈis",  # vis (a screw) is /vis/; the voice reads it like je vis /vi/
    "en faut deux fois plus": "ɑ̃ fˈo dˈø fwˈa plˈys", "en demander plus": "ɑ̃ dəmɑ̃dˈe plˈys",  # plus (more) keeps its s at the end of a phrase
    "deux plus deux est égal": "dˈø plys dˈøz ɛt eɡˈal",  # plus (in sums) keeps its s
    "cheville": "ʃəvˈij", "chevilles": "ʃəvˈij",  # the voice says /ʃəvil/, like ville
    "oups": "ˈups",  # the voice drops the s
    "suspect": "syspˈɛ", "suspects": "syspˈɛ",  # the masculine keeps ct silent (suspecte /syspɛkt/)
    "cobaye": "kɔbˈaj", "cobayes": "kɔbˈaj",  # the voice says /kobɛj/
    "vécut": "vekˈy", "vécus": "vekˈy",  # the voice reads vécut in English and says the s of vécus
    "louis xiv": "lwˈi katˈɔʁz",  # the voice reads "Louis quatorze romain"
    "jésus-christ": "ʒezykʁˈi",  # the voice says the st of Christ
    "moyen âge": "mwajɛnˈaʒ",  # with the liaison; the voice says /mwajɛ̃ aʒ/
    "jadis": "ʒadˈis",  # the voice drops the s
    "mammouth": "mamˈut", "mammouths": "mamˈut",  # otherwise read in English
    "appart": "apˈaʁt", "apparts": "apˈaʁt",  # the voice drops the t
    "cimer": "simˈɛʁ",  # verlan of merci: the voice reads it like an -er verb
    "thune": "tˈyn", "thunes": "tˈyn",  # otherwise read in English
    "ben": "bˈɛ̃", "nan": "nˈɑ̃",  # spoken bien and non: the voice says /bɛn/, /nan/
    "ciao": "tʃˈao",  # the voice says /sjao/
    "enzo": "ɛnzˈo",  # the voice says /ɑ̃zo/
    "t'es où": "tɛ ˈu",  # spoken French: no liaison
    "à plus !": "a plˈys!",  # the s is said here, but not in à plus tard
    "sav": "ɛsavˈe",  # read as a word: say the letters
    "box": "bˈɔks", "planning": "planˈiŋ", "plannings": "planˈiŋ",  # English vowels otherwise
    "stress": "stʁˈɛs",  # the voice says an English r
    "ouïe": "wˈi",  # the voice says /wj/
    "à l'est": "a lˈɛst", "de l'est": "də lˈɛst",  # east: the voice reads est as the verb /ɛ/
    "danemark": "danmˈaʁk",  # otherwise read in English
    "maghrébin": "maɡʁebˈɛ̃", "maghrébins": "maɡʁebˈɛ̃", "maghrébine": "maɡʁebˈin", "maghrébines": "maɡʁebˈin",  # read in English
    "chum": "tʃˈɔm", "chums": "tʃˈɔm",  # Quebec French says the t
    "dépaysement": "depeizmˈɑ̃",  # the voice drops the z
    "mot à mot": "motamˈo",  # with the liaison
    "copenhague": "kɔpənˈaɡ", "niemeyer": "nimɛjˈɛʁ", "puerta del sol": "pwˈɛʁta dɛl sˈɔl",
    "master": "mastˈɛʁ", "masters": "mastˈɛʁ",  # the voice says /mastœʁ/
    "de plus,": "də plˈys,", "mois de plus": "mwˈa də plˈys", "faire de plus": "fˈɛʁ də plˈys",  # more: the s is said
    "liker": "lajkˈe", "liké": "lajkˈe", "likée": "lajkˈe", "likés": "lajkˈe", "likées": "lajkˈe",
    "like": "lˈajk", "likes": "lˈajk", "likent": "lˈajk",  # read in English
    "streaming": "stʁimˈiŋ", "spoiler": "spɔjlˈœʁ", "spoilers": "spɔjlˈœʁ",  # read in English, or like an -er verb
    "émoji": "emodʒˈi", "émojis": "emodʒˈi", "un émoji": "œ̃n emodʒˈi", "des émojis": "dez emodʒˈi", "les émojis": "lez emodʒˈi",
    "au cas où": "o ka ˈu",  # no liaison
}
# Case-sensitive fixes: lowercase "jean" (clothing) is /dʒin/, the name "Jean" stays /ʒɑ̃/.
CASE_FIXES = {"jean": "dʒˈin", "jeans": "dʒˈin", "CAP": "seapˈe"}  # CAP alone is read as the word cap
CASE_FIX_RE = re.compile(rf"(?<![{V.L}'’])({'|'.join(map(re.escape, CASE_FIXES))})(?![{V.L}])")
# Fixes only for a word said on its own (in sentences the voice gets these right).
ALONE_FIXES = {
    "y": "ˈi",  # alone, the voice reads the letter name "i grec"
    "vis": "vˈis",  # the noun (a screw); no text uses the verb (je vis) yet, which would need /vi/
    "à plus": "a plˈys",  # see you! (in sentences, see "à plus !" in FIXES)
    "l'est": "lˈɛst",  # east, clicked or on its word card (in sentences, see "à l'est" in FIXES)
    "de plus": "də plˈys",  # what's more (in sentences, see "de plus," in FIXES)
}
# A fixed word after an elision (l'immeuble, d'Annecy) takes the elided consonant into its
# phoneme block: alone before a block, Piper would read "l'" as the letter name.
ELIDED_PHONEMES = {"l": "l", "d": "d", "j": "ʒ", "m": "m", "t": "t", "s": "s", "n": "n", "c": "s",
                   "qu": "k", "jusqu": "ʒysk", "lorsqu": "lɔʁsk", "puisqu": "pɥisk"}
FIX_RE = re.compile(rf"(?<![{V.L}'’])(?:({'|'.join(sorted(ELIDED_PHONEMES, key=len, reverse=True))})['’])?"
                    rf"({'|'.join(map(re.escape, sorted(FIXES, key=len, reverse=True)))})(?![{V.L}])", re.I)


def clean(text):
    return re.sub(r"\s+", " ", text).strip()


def key(text):
    """Must match js/audio.js: collapse whitespace, trim, then normKey."""
    return V.norm_key(clean(text))


def exact_key(text):
    """Case-preserving key, used only when capitals change the pronunciation (Jean / jean)."""
    return re.sub(r"[’‘`]", "'", unicodedata.normalize("NFC", clean(text)))


def plain(markup):
    """Must match plain() in js/content.js."""
    def walk(nodes):
        return "".join(n["text"] if n["kind"] in ("text", "word") else walk(n["children"]) for n in nodes)
    return walk(V.parse_markup(markup))


def collect():
    """Every text the app can ask to hear, in first-seen order."""
    curriculum = json.loads((V.DATA / "curriculum.json").read_text(encoding="utf-8"))
    lexicon = json.loads((V.DATA / "lexicon.json").read_text(encoding="utf-8"))
    lessons = [json.loads((V.DATA / "lessons" / f"{lid}.json").read_text(encoding="utf-8"))
               for u in curriculum["units"] for lid in u.get("lessons", [])]
    index = V.Index()
    for e in lexicon["entries"]:
        index.add(e)
    for lesson in lessons:
        for w in lesson.get("words", []):
            index.add(w, taught=True)

    texts = {}

    def add(t):
        t = clean(t)
        if t and HAS_LETTER.search(t):
            variants = texts.setdefault(key(t), [])
            if t not in variants:
                variants.append(t)

    def add_markup(markup, sentence=True):
        if sentence:
            add(plain(markup))
        segs, _ = index.tokenize(markup)
        for s in segs:
            add(s["text"])

    for e in lexicon["entries"]:
        add(e.get("say") or e["fr"])
    for lesson in lessons:
        for w in lesson.get("words", []):
            add(w.get("say") or w["fr"])
            add_markup(w["def"], sentence=False)
            for x in w["examples"]:
                add_markup(x["fr"])
        for line in lesson["story"]["lines"]:
            add_markup(line["fr"])
        for s in lesson.get("sections", []):
            for x in s.get("examples", []):
                add_markup(x["fr"])
            table = s.get("table")
            for row in (table["rows"] if table else []):
                for col in table.get("frCols", [0]):
                    add_markup(row[col])
        for q in lesson.get("quiz", []):
            answers = q["answer"] if isinstance(q["answer"], list) else [q["answer"]]
            if q.get("say") or q.get("listen"):  # same order as grammarQuestion() in js/quizgen.js
                add(q.get("say") or q.get("listen"))
            elif q.get("lang") == "en":
                add(answers[0])
            else:
                add(plain(re.sub(r"_{3,}", lambda _: answers[0], q["q"], count=1)))
                add_markup(q["q"], sentence=False)
    add(SETTINGS_TEST)
    return texts


def tts_input(text):
    k = V.norm_key(text)
    if k in ELIDED:
        return ELIDED[k]
    if k in ALONE_FIXES:
        return f"[[ {ALONE_FIXES[k]} ]]"
    # A clicked phrase that ends with an elided word (parce qu', est-ce qu') is said with the full word.
    last = re.match(rf"^(.*[\s-])([{V.L}]+['’])$", text.strip())
    if last and V.norm_key(last.group(2)) in ELIDED:
        text = last.group(1) + ELIDED[V.norm_key(last.group(2))]
    text = FIX_RE.sub(lambda m: f"[[ {ELIDED_PHONEMES.get((m.group(1) or '').lower(), '')}"
                                f"{FIXES[m.group(2).lower()]} ]]", text)
    text = CASE_FIX_RE.sub(lambda m: f"[[ {CASE_FIXES[m.group(1)]} ]]", text)
    # Piper drops punctuation that follows a phoneme block (losing pauses and question
    # intonation); moving it inside the block keeps it.
    return re.sub(r"\[\[ (.*?) \]\]\s*([,;:.!?…]+)",
                  lambda m: f"[[ {m.group(1)}{m.group(2).replace('…', '.')} ]]", text)  # Piper has no "…" phoneme


def synthesize(voice, text):
    chunks = list(voice.synthesize(tts_input(text), SynthesisConfig(length_scale=1.0)))
    audio = np.concatenate([c.audio_float_array for c in chunks])
    rate = chunks[0].sample_rate
    # Trim long silences at both ends, keeping a short natural pause.
    loud = np.flatnonzero(np.abs(audio) > 0.01)
    if loud.size:
        pad = int(0.08 * rate)
        audio = audio[max(0, loud[0] - pad): loud[-1] + pad]
    return audio, rate


def ipa_check(voice):
    """Compare Piper's phonemes with the IPA written in the lessons, to spot mispronunciations."""
    strip = lambda s: re.sub(r"[ˈˌ.\-\s!?,]", "", unicodedata.normalize("NFD", s))
    entries = json.loads((V.DATA / "lexicon.json").read_text(encoding="utf-8"))["entries"]
    curriculum = json.loads((V.DATA / "curriculum.json").read_text(encoding="utf-8"))
    for u in curriculum["units"]:
        for lid in u.get("lessons", []):
            entries += json.loads((V.DATA / "lessons" / f"{lid}.json").read_text(encoding="utf-8")).get("words", [])
    diffs = []
    for e in entries:
        if not e.get("ipa") or V.norm_key(e["fr"]) in ELIDED:
            continue
        said = "".join("".join(p) for p in voice.phonemize(tts_input(e.get("say") or e["fr"])))
        if strip(said) != strip(e["ipa"]):
            diffs.append(f"  {e.get('say') or e['fr']:18} lesson /{e['ipa']}/   Piper /{said}/")
    return diffs


def main():
    prune = "--prune" in sys.argv
    voice = PiperVoice.load(str(VOICE))
    AUDIO_DIR.mkdir(exist_ok=True)
    texts = collect()
    files, made = {}, 0

    def file_for(text):
        nonlocal made
        # The name depends on what is actually spoken, so fixing a word regenerates its files.
        name = hashlib.sha1(f"{VOICE_NAME}|{tts_input(text)}".encode()).hexdigest()[:12] + ".mp3"
        path = AUDIO_DIR / name
        if not path.exists():
            audio, rate = synthesize(voice, text)
            sf.write(path, audio, rate, format="MP3")
            made += 1
        return f"audio/{name}"

    for k, variants in texts.items():
        variants = sorted(variants, key=lambda t: t != t.lower())  # the all-lowercase spelling is the default
        files[k] = file_for(variants[0])
        base = tts_input(variants[0]).lower()
        for t in variants[1:]:  # e.g. "Jean" (name) next to "jean" (clothing)
            if tts_input(t).lower() != base:
                files[exact_key(t)] = file_for(t)
    used = set(Path(p).name for p in files.values())
    orphans = [p for p in AUDIO_DIR.glob("*.mp3") if p.name not in used]
    if prune:
        for p in orphans:
            p.unlink()
    MANIFEST.write_text(json.dumps({
        "about": "Maps normalized French text to an audio file (made by tools/make_audio.py).",
        "voice": VOICE_NAME, "credit": CREDIT, "files": dict(sorted(files.items())),
    }, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")  # same bytes on Windows and Linux
    size = sum(p.stat().st_size for p in AUDIO_DIR.glob("*.mp3"))
    print(f"{len(files)} texts with audio ({made} new), {size / 1e6:.1f} MB in audio/")
    if orphans:
        print(f"{len(orphans)} unused file(s) {'deleted' if prune else 'left (run with --prune to delete)'}")
    diffs = ipa_check(voice)
    if diffs:
        print(f"\nPronunciation differs from the lesson IPA for {len(diffs)} word(s) — listen to these:")
        print("\n".join(diffs))


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")  # the IPA report would fail on Windows' ANSI code page
    main()
