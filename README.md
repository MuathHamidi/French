# Français — a French course app

A personal French course that runs in the browser on a laptop or a phone. There is nothing to install and no account.

- **Words by topic.** Each word has its gender, IPA, English meaning, a simple French definition and 3 examples.
- **Clickable stories.** Point at or tap any word in a story to see its card; clicking also reads it aloud.
- **Grammar lessons.** Every case has tables and common mistakes. The lesson's story highlights each case, and pointing at a highlight shows the rule.
- **Quizzes.** Every word and every grammar case is tested, and wrong answers come back at the end.
- **Daily review (spaced repetition).** Learned words and rules come back after growing gaps, so they stick.

Progress is saved in the browser (localStorage). To move it to another device, use *Settings › Download progress*, then *Load progress* on the other device.

## Run it on your computer

The app loads its lessons with `fetch`, so it needs a small web server. Opening `index.html` directly won't work. From the project folder:

```bash
python3 tools/serve.py        # on Windows: python tools/serve.py
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
tools/check_app.mjs         checks the app's code against the content (word links, quizzes, audio)
tools/check_logic.mjs       tests the app's review dates, streak, saving and backups
tools/test.html             tests the app in a browser: every page and every feature
tools/make_audio.py         generates the audio with Piper
tools/build/                scripts that help build a unit (see CLAUDE.md; the story bible is in STORY.md)
```

French text can carry three kinds of markup:

| Markup | Meaning |
|---|---|
| `**bonjour**` | the target word in an example (used for fill-in-the-blank questions) |
| `[est\|etre]` | force a word to link to a specific dictionary entry (for ambiguous words) |
| `{Je suis\|etre-je}` | highlight a grammar case in a grammar story or example |

Words with the same spelling (*la porte* / *elle porte*, *Claire* / *claire*) are told apart automatically. After *la, une, ma…* or a number (*deux parties*) the app expects a noun, after a person (*elle, Léa, ma mère*), an object pronoun (*je lui téléphone*) or a form of *avoir* (*j'ai été*) a verb, after *être* an adjective or a participle but never a noun (*elle est prête*, *elle est arrivée*), and a capital letter in mid-sentence means a name. *le, la, les, l', leur* count as object pronouns (not *the, their*) after a subject (*je la vois*), after a hyphen (*regarde-le*), before *lui, y, en* (*je vais le lui dire*) or before a word that can only be a verb (*pour le faire*); *en* is a pronoun after a subject, *y* or another pronoun (*j'en veux, il y en a*). Dictionary entries marked `"manual": true` (the object pronouns) are otherwise only used through markup such as `[la|la-pron] voilà`. The same rules live in `js/content.js` and `tools/validate.py`: change both together.

Grammar and pronunciation quiz items can also have `"listen": "French text"` (a listening question that plays the text) and `"say"` (what is read aloud after answering).

Nouns that name a man or a woman with the same word (*un / une journaliste*, *un / une enfant*) carry `"both": true`: the word shows as *masc. / fem.* and the quiz never asks *un or une?* about it. Nouns used without an article, like months and days, have `"art": ""`, and nouns with an aspirated h (*le haricot, la honte, le hors-jeu*) have `"hAsp": true`, so their article is not elided.

Before publishing, run:

```bash
python3 tools/validate.py     # on Windows: python tools/validate.py
node tools/check_app.mjs
node tools/check_logic.mjs
```

`validate.py` fails if any word in a story, example, definition or quiz is missing from the dictionary. It also fails if a lesson word is not used in its story, or if a grammar case has no highlight in the story or fewer than two quiz questions.

`check_app.mjs` needs [Node.js](https://nodejs.org) 22 or newer. It runs the app's own code on the whole course. It fails if:
- the app links a word to a different card than `validate.py` does;
- a quiz question the app can ask doesn't accept its right answer;
- a text the app reads aloud has no audio file;
- link markup would show as raw text.

It also warns about quiz questions where a right answer could be marked wrong (two words with the same English, or two options that sound the same). Give it lesson ids (`node tools/check_app.mjs u20-futur u20-phone`) to check only those lessons' quizzes and audio. Add `--homographs` to list every word in them that has several dictionary entries, with the entry each text links to. This is the list to review after writing a lesson. Before adding or promoting dictionary entries, run it with `--save-links links-before.json`; afterwards, `--compare-links links-before.json` lists every older text whose words now link to a different entry.

`check_logic.mjs` tests what the app computes without a browser, in Montreal time: review dates (also across the clock changes), the streak, saving and loading progress (a damaged copy is set aside, another tab's progress is kept), backups and answer checking.

`tools/test.html` tests the app itself. With the server running, open <http://localhost:8765/tools/test.html>; on the online copy, `…/tools/test.html` also works from a phone. The app runs in a frame with its own test progress, so yours is never touched. It opens every page of every lesson at phone width, and a sample at computer width, looking for errors, raw markup, *undefined*, broken links and anything wider than the screen. Then it uses each feature once: quizzes (right and wrong answers, accents, the keyboard), listening questions, two days of reviews, word cards, stories read aloud, the word list, settings and backups, and two tabs at once. Sound is recorded rather than played, and the app's clock is moved for the reviews. `?full` also completes every lesson's quiz (a few minutes); `?only=word cards,sound` runs only the tests whose names contain those words.

## Pronunciation (natural audio)

Every word and sentence has an MP3 in `audio/`, generated with [Piper](https://github.com/OHF-Voice/piper1-gpl), a neural text-to-speech engine that runs offline. `data/audio.json` maps each text to its file. Anything without a file falls back to the device's own French voice, which sounds natural on phones but robotic (eSpeak) on Linux.

After adding or changing lessons, regenerate the audio. Only new texts are synthesized, which takes about a minute for a whole unit:

```bash
.venv/bin/python tools/make_audio.py --prune      # on Windows: .venv\Scripts\python tools\make_audio.py --prune
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

On Windows, create the environment with `python -m venv .venv` and `.venv\Scripts\pip install piper-tts soundfile`, then download the same two voice files into `tools\voices\` (Windows has `curl` too).

**Credit:** audio generated with Piper TTS, voice `fr_FR-siwis-medium`, trained on the SIWIS French Speech Synthesis Database (University of Edinburgh), licensed CC BY 4.0. Keep this credit if you publish the app.

## Roadmap

**Part 1, Units 1–16 (done, about 635 words):** greetings and *être*; family, articles and possessives; numbers, age, *avoir* and silent letters; the home, *il y a*, prepositions of place and plurals; food, the café, *du / de la / des* and nasal vowels; the kitchen, cooking verbs and *-er* verbs in the present; clothes, colours and adjectives; daily routine, days of the week, reflexive verbs, telling the time and the sounds u / ou; places in town, directions, *au / à la / aux* and the imperative; sports, hobbies, *faire de / jouer à / jouer de* and negatives; the weather, seasons and months, *il fait…*, the near future and liaison; nature, outdoor activities, *-ir* and *-re* verbs and asking questions; jobs, the workplace, *pouvoir / vouloir / devoir* and *c'est* vs *il est*; transport, travel, the passé composé with *avoir*, irregular past participles and the sounds é / è / e; holidays, the hotel, the passé composé with *être* and reflexive verbs in the past; school, childhood, the imparfait, imparfait vs passé composé and the French R.

**Part 2, Units 17–40 (done, about 3,000 words in all): all the remaining grammar, up to about B2.** From Unit 17 on, each unit has about **100 new words** (four 25-word lessons: two on a topic, two on high-frequency words like *penser, croire, donc, pourtant*), so one unit is one day at 100 new words a day, plus two grammar lessons. Unit 17 (feelings, personality, thinking verbs, linking words; object pronouns *le, la, les, lui, leur*), Unit 18 (body, health, appearance, gestures; *y*, *en* and two pronouns together), Unit 19 (shopping, money, quantities, describing things; comparatives, superlatives, ordinals, fractions and percentages), Unit 20 (phone and internet, media, speech verbs, time words; the future tense with its irregular stems and *si* + present → future), Unit 21 (housework, everyday objects, everyday verbs, words of manner; the conditional, adverbs in *-ment* and the silent *e*), Unit 22 (the bank and the post office, paperwork, useful verbs, the town; the relative pronouns *qui, que, où* and *ce qui, ce que*), Unit 23 (love and friendship, holidays and traditions, the stages of life, words of the heart; pronouns in the passé composé with participle agreement, and stressed and possessive pronouns *moi, le mien*), Unit 24 (restaurants, tastes and flavours, French and world dishes, food idioms; the plus-que-parfait, and *venir de, être en train de, être sur le point de*), Unit 25 (the environment, animals, the climate, taking action; the forms of the subjunctive, *il faut que*, and the semi-vowels of *oui, huit, fille*), Unit 26 (giving opinions, agreeing and disagreeing, society, more linking words; the subjunctive after wishes and feelings, and subjunctive or indicative), Unit 27 (cinema and TV, music, books and art, reviewing and appreciating; the relative pronouns *dont* and *lequel*, and the demonstratives *celui, celle, ceux, celles*), Unit 28 (looking for a job, the office, the economy, plans and goals; *tout, chaque, aucun, quelqu'un*, and verbs followed by *à* or *de* + an infinitive), Unit 29 (finding a place to live, moving house, DIY, problems at home; *si* + imparfait → conditional, and the past conditional), Unit 30 (the news, politics, justice and the law, facts and figures; the passive and the gérondif), Unit 31 (travel problems, the police and insurance, emergencies, reacting; reported speech, in the present and in the past), Unit 32 (computing, science, space and energy, reasoning; the futur antérieur, and *depuis, il y a, pendant, en, dans, pour*), Unit 33 (French history, telling stories, the centuries, war and peace; the passé simple, to recognise, and telling a story with all the past tenses), Unit 34 (informal French, slang and verlan, everyday expressions, the little words of speech; spoken grammar, with *t'as, y a* and the missing *ne*, and rhythm and intonation), Unit 35 (appointments, complaints, contracts and subscriptions, asking politely; *faire* + infinitive, and *laisser, voir, entendre* + infinitive), Unit 36 (stress and rest, psychology, fitness, the senses; the subjunctive after *pour que, bien que, avant que…*, and the past subjunctive), Unit 37 (countries and nationalities, languages, the French-speaking world, geography; cause and consequence, opposition and concession), Unit 38 (university, learning a language, qualifications, the words of an argument; purpose, and *ne… que, ni… ni, aucun*), Unit 39 (social media, online shopping, online safety, screens; formal questions with inversion and *lequel*, and prepositions with places) and Unit 40 (formal emails, formal French, false friends, word families; the hard cases of participle agreement, and a review of all the tenses) are ready.

**Part 3, Units 41–60 (done, about 5,000 words in all): common words and grammar beyond B2.** Each unit keeps the rhythm of Part 2: two topic lessons that follow the story, two lessons of common words that the course hasn't taught yet (frequent verbs, nouns, adjectives and adverbs that were missing, and the helper words the stories use most), and two advanced (C1) grammar lessons. Unit 41 (the garden, dance, common verbs and nouns; putting words in the spotlight with *c'est… qui*, and the *ne explétif*), Unit 42 (the sea and the coast, photography, common verbs and adjectives; the hypothesis with *si jamais, au cas où, pourvu que, quand bien même*, and the place of adjectives), Unit 43 (bread and pastry, parties, common nouns and adverbs; the present participle and the verbal adjective, and *tout, même, quelque*), Unit 44 (football, architecture, common verbs and adjectives; two pronouns with the imperative, and passive reflexive verbs), Unit 45 (babies, family celebrations, common nouns and verbs; colour adjectives, and the spelling of *vingt, cent, mille*), Unit 46 (driving lessons, the grape harvest, common adjectives and adverbs; the subjunctive in relative clauses, and *plus… plus, d'autant plus que*), Unit 47 (film premieres, the autumn forest, common verbs and nouns; *n'importe qui, n'importe quoi…*, and the past infinitive, *après avoir mangé*), Unit 48 (building works, the car, common nouns and adverbs; inversion after *peut-être, sans doute, à peine… que*, and verbs like *manquer à, manquer de*), Unit 49 (university exams, Christmas, common verbs and adjectives; the conditional for unconfirmed news, *elle serait…*, and the passé antérieur, *quand il eut fini*), Unit 50 (winter sports, advertising, common nouns and verbs; *quoi que, où que, qui que, si… que*, and participle clauses, *le dîner terminé*), Unit 51 (the theatre, anatomy, common nouns and verbs; the neutral *le, en, y* for a whole idea, *je le sais, j'en doute*, and *ce à quoi, de quoi, sans quoi*), Unit 52 (teaching, virtues and vices, common nouns and adjectives; verbs with *en* and *y* such as *s'en aller, en vouloir, s'y prendre*, and pronominal verbs whose meaning changes, *s'apercevoir, se douter, s'attendre à*), Unit 53 (livestock and the Salon de l'agriculture, sewing, common nouns and verbs; cause with *étant donné, vu que, du fait que, sous prétexte que, non que*, and consequence with *au point que, à tel point que, si bien que, d'où, de sorte que*), Unit 54 (detective work and crime fiction, artistic crafts, common nouns and adjectives; impersonal constructions, *il s'agit de, il suffit de, il arrive que, il importe que*, and degrees of certainty with *devoir* and *pouvoir*, *ça doit être, il a dû, il se pourrait que, il y a fort à parier que*), Unit 55 (eye surgery at the clinic, religion and Easter, common nouns and verbs; time conjunctions, *tant que, au fur et à mesure que, maintenant que, chaque fois que, le temps que, d'ici à ce que*, and *comme si* with other comparisons, *faire comme si, comme qui dirait, de même que, autant… autant, plutôt que de*), Unit 56 (fairy tales, taking over a business, common nouns and adverbs; conceding a point with *certes… mais, tout… que, quitte à, sans pour autant, il n'empêche que, toujours est-il que, encore que*, and the hypothesis without *si*, *tu me l'aurais dit, je serais venu*, *serait-il ruiné*, *pour peu que, que… ou que, soit que… soit que, selon que*), Unit 57 (painting a portrait, citizenship and the institutions, common nouns and verbs; the indefinites of written French, *nul, tel, quiconque, autrui, quelconque, l'un l'autre*, and subject-verb agreement in the hard cases, *la plupart des gens dorment, plus d'un, un des… qui, ni… ni, ainsi que*), Unit 58 (opera and the orchestra, the river and its boats, common nouns and adjectives; nominalisation in headlines, *Chute spectaculaire dans le Rhône*, and leaving out the article, *en tant que productrice, défense de plonger, sans hésitation, avoir lieu, perdre patience*), Unit 59 (birds and birdwatching, sounds and noises, common nouns and verbs; tenses outside their time, the narrative present, *une seconde de plus, et il tombait*, and the polite imperfect, *je venais pour…*, and the infinitive on its own, *que faire ?, et Tom de chanter, ne pas avoir pensé à un mouchoir !*) and Unit 60 (jewellery and the engagement ring, haymaking at the farm, common nouns and adjectives; the negation of written French, *ne… guère, ne… point, nullement, je n'ose, je ne saurais*, and the imperfect subjunctive, *il fallait qu'il vînt, sans qu'il en sût rien, qui l'eût cru ?*) are ready. Part 3 is complete; later parts are not planned yet.

The common words are chosen with [Lexique 3.83](https://www.lexique.org) (Boris New and Christophe Pallier, CC BY-SA 4.0), a list of 140,000 French words with their frequency in films and books. It is not in git; download it once (26 MB) to use `tools/build/frequency.py`, which lists the frequent words the course doesn't teach yet:

```bash
mkdir -p tools/lexique
curl -L -o tools/lexique/Lexique383.tsv https://www.lexique.org/databases/Lexique383/Lexique383.tsv
python tools/build/frequency.py --missing 200 --pos verb
```

Words that stories need before they are taught live in `data/lexicon.json` as helpers. When a later lesson teaches one, its entry moves into the lesson (keeping the same id).
