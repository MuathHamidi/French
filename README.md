# Français — a French course app

A personal French course that runs in the browser on a laptop or a phone. There is nothing to install and no account.

- **Words by topic.** Each word has its gender, IPA, English meaning, a simple French definition and 3 examples.
- **Clickable stories.** Point at or tap any word in a story to see its card; clicking also reads it aloud.
- **Grammar lessons.** Every case has tables and common mistakes. The lesson's story highlights each case, and pointing at a highlight shows the rule.
- **Quizzes.** Every word and every grammar case is tested, and wrong answers come back at the end.
- **Daily review (spaced repetition).** Learned words and rules come back after growing gaps, so they stick.

Progress is saved in the browser (localStorage). To move it to another device, use *Settings › Download progress*, then *Load progress* on the other device.

## Run it on your computer

The app loads its lessons with `fetch`, so it needs a small web server. Opening `index.html` directly won't work.

```bash
cd ~/Data/Courses/French
python3 tools/serve.py
```

Then open <http://localhost:8765>.

## Put it online with GitHub Pages (for your phone)

1. Create a new repository on GitHub and push this folder to it.
2. In the repository, open **Settings › Pages**, choose **Deploy from a branch**, then branch `main` and folder `/ (root)`.
3. After a minute the app is at `https://<your-user>.github.io/<repo>/`.
4. On the phone, open that address and choose **Add to Home Screen**. It then opens like an app and also works offline.

## How the course is organised

```
data/curriculum.json        units in order; each lists its lesson files (future units are "planned")
data/lessons/u01-vocab.json  a vocabulary lesson: words + story
data/lessons/u01-grammar.json a grammar lesson: sections, cases, mistakes, story, quiz
data/lexicon.json           helper words used in stories/examples but not taught yet
data/audio.json             text → audio file map (made by tools/make_audio.py)
audio/                      generated MP3s for every word and sentence
tools/validate.py           checks the content (run it after every change)
tools/make_audio.py         generates the audio with Piper
```

French text can carry three kinds of markup:

| Markup | Meaning |
|---|---|
| `**bonjour**` | the target word in an example (used for fill-in-the-blank questions) |
| `[est\|etre]` | force a word to link to a specific dictionary entry (for ambiguous words) |
| `{Je suis\|etre-je}` | highlight a grammar case in a grammar story or example |

Words with the same spelling (*la porte* / *elle porte*, *Claire* / *claire*) are told apart automatically. After *la, une, ma…* or a number (*deux parties*) the app expects a noun, after a person (*elle, Léa, ma mère*), an object pronoun (*je lui téléphone*) or a form of *avoir* (*j'ai été*) a verb, after *être* an adjective or a participle but never a noun (*elle est prête*, *elle est arrivée*), and a capital letter in mid-sentence means a name. *le, la, les, l', leur* count as object pronouns (not *the, their*) after a subject (*je la vois*), after a hyphen (*regarde-le*), before *lui, y, en* (*je vais le lui dire*) or before a word that can only be a verb (*pour le faire*); *en* is a pronoun after a subject, *y* or another pronoun (*j'en veux, il y en a*). Dictionary entries marked `"manual": true` (the object pronouns) are otherwise only used through markup such as `[la|la-pron] voilà`. The same rules live in `js/content.js` and `tools/validate.py`: change both together.

Grammar and pronunciation quiz items can also have `"listen": "French text"` (a listening question that plays the text) and `"say"` (what is read aloud after answering).

Nouns that name a man or a woman with the same word (*un / une journaliste*, *un / une enfant*) carry `"both": true`: the word shows as *masc. / fem.* and the quiz never asks *un or une?* about it. Nouns used without an article, like months and days, have `"art": ""`.

Before publishing, run:

```bash
python3 tools/validate.py
```

It fails if any word in a story, example, definition or quiz is missing from the dictionary. It also fails if a lesson word is not used in its story, or if a grammar case has no highlight in the story or fewer than two quiz questions.

## Pronunciation (natural audio)

Every word and sentence has an MP3 in `audio/`, generated with [Piper](https://github.com/OHF-Voice/piper1-gpl), a neural text-to-speech engine that runs offline. `data/audio.json` maps each text to its file. Anything without a file falls back to the device's own French voice, which sounds natural on phones but robotic (eSpeak) on Linux.

After adding or changing lessons, regenerate the audio. Only new texts are synthesized, which takes about a minute for a whole unit:

```bash
.venv/bin/python tools/make_audio.py --prune
```

At the end the script compares Piper's pronunciation of each word with the IPA written in the lessons, and lists the differences. When a word really sounds wrong, add the correct phonemes to `FIXES` in `tools/make_audio.py` and run it again.

One-time setup on a new computer. The environment and voice files are git-ignored and are not uploaded to GitHub:

```bash
python3 -m venv .venv            # Ubuntu without ensurepip: python3 -m venv --without-pip .venv, then run get-pip.py with .venv/bin/python
.venv/bin/pip install piper-tts soundfile
mkdir -p tools/voices && cd tools/voices
curl -LO https://huggingface.co/rhasspy/piper-voices/resolve/main/fr/fr_FR/siwis/medium/fr_FR-siwis-medium.onnx
curl -LO https://huggingface.co/rhasspy/piper-voices/resolve/main/fr/fr_FR/siwis/medium/fr_FR-siwis-medium.onnx.json
```

**Credit:** audio generated with Piper TTS, voice `fr_FR-siwis-medium`, trained on the SIWIS French Speech Synthesis Database (University of Edinburgh), licensed CC BY 4.0. Keep this credit if you publish the app.

## Roadmap

**Part 1, Units 1–16 (done, about 635 words):** greetings and *être*; family, articles and possessives; numbers, age, *avoir* and silent letters; the home, *il y a*, prepositions of place and plurals; food, the café, *du / de la / des* and nasal vowels; the kitchen, cooking verbs and *-er* verbs in the present; clothes, colours and adjectives; daily routine, days of the week, reflexive verbs, telling the time and the sounds u / ou; places in town, directions, *au / à la / aux* and the imperative; sports, hobbies, *faire de / jouer à / jouer de* and negatives; the weather, seasons and months, *il fait…*, the near future and liaison; nature, outdoor activities, *-ir* and *-re* verbs and asking questions; jobs, the workplace, *pouvoir / vouloir / devoir* and *c'est* vs *il est*; transport, travel, the passé composé with *avoir*, irregular past participles and the sounds é / è / e; holidays, the hotel, the passé composé with *être* and reflexive verbs in the past; school, childhood, the imparfait, imparfait vs passé composé and the French R.

**Part 2, Units 17–40 (in progress): all the remaining grammar, up to about B2.** From Unit 17 on, each unit has about **100 new words** (four 25-word lessons: two on a topic, two on high-frequency words like *penser, croire, donc, pourtant*), so one unit is one day at 100 new words a day, plus two grammar lessons. Unit 17 (feelings, personality, thinking verbs, linking words; object pronouns *le, la, les, lui, leur*), Unit 18 (body, health, appearance, gestures; *y*, *en* and two pronouns together), Unit 19 (shopping, money, quantities, describing things; comparatives, superlatives, ordinals, fractions and percentages) and Unit 20 (phone and internet, media, speech verbs, time words; the future tense with its irregular stems and *si* + present → future) are ready. Units 21–40 are listed in `data/curriculum.json` and on the *Learn* page: the conditional, relative pronouns, the subjunctive, *si* clauses, the passive, reported speech, the passé simple, spoken French and more. That brings the course to about 3,000 words.

**Part 3, Units 41 and up: vocabulary to about 10,000 words.** Topic and frequency lessons of 100 words per unit, longer readings, idioms, word families and false friends.

Words that stories need before they are taught live in `data/lexicon.json` as helpers. When a later lesson teaches one, its entry moves into the lesson (keeping the same id).
