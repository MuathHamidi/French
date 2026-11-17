# Review of the Français app

16 November 2026. This review covers the app's code, the course content, and the layout on a laptop and a phone. Nothing in the project was changed: this file is the only addition, and it is not committed.

Each finding is marked **Confirmed** (I reproduced it, in the app in a browser or by running the app's own code) or **From the code** (plain in the source, not reproduced).

## The short version

The project's own checks all pass, so everything below is in what they don't test. In order of how much they affect daily study:

| # | Finding | Where |
|---|---|---|
| 1 | "Write it in French" marks right answers wrong: *le serveur*, *le médecin*, *la voisine*, *chaude*, *une adulte* and hundreds like them. **Fixed** (see below) | [js/quizgen.js:8](js/quizgen.js:8) |
| 2 | Enter on an empty box counts as a wrong answer, and a held Enter runs through several questions | [js/quiz.js:120](js/quiz.js:120) |
| 3 | A quiz in progress is lost when you leave the page; a vocabulary quiz averages 62 questions | [js/quiz.js:139](js/quiz.js:139) |
| 4 | On the phone, the word card covers the word you tapped | [css/app.css:248](css/app.css:248) |
| 5 | *étés* opens the card for *année*; *yaourt* and *yoga* show as "l'yaourt" and "l'yoga" | course data, [js/content.js:50](js/content.js:50) |
| 6 | The speed and voice settings change nothing you hear | [js/audio.js:76](js/audio.js:76) |
| 7 | The Back button returns to the wrong unit of the course page | [js/app.js:32](js/app.js:32) |
| 8 | Progress can be cleared together with the audio cache, and a damaged backup file blanks the app | [js/store.js:23](js/store.js:23), [sw.js:212](sw.js:212) |

The layout proposals for the phone and the laptop are in their own sections below. Two of them were tried as temporary styles in the browser and measured.

## What was checked

| Check | Result |
|---|---|
| `python tools/validate.py` | OK: 334 lessons, 6,186 entries (1,151 helpers), no errors |
| `node tools/check_logic.mjs` | 38 of 38 tests passed |
| `node tools/check_app.mjs` | 0 problems in 43,306 texts, 29,508 questions and 41,187 spoken texts; no warnings |
| All of `js/`, `css/app.css`, `sw.js`, `index.html` | read in full |
| The app in a browser | each kind of page at 1440×900, 375×812 (phone), 667×375 (phone on its side) and 768×1024, with test progress for Units 1–29; a lesson quiz and a 60-card review played through |
| Every "Write it in French" answer | the natural answers for all 5,035 taught words run through the app's own `check()` |
| Genders | 2,902 nouns compared with Lexique 3.83: no error. The four differences (*la box*, *le doudou*, *les tapas*, *Pâques*) are right in the course |
| Pronunciation (IPA) | 4,991 single words compared with Lexique: 21 differences, all accepted variants or Lexique's own quirks (*klaxon*, *pub*, *jet*) |
| Translations | 25,361 sentence pairs compared for numbers, names, days, months and final punctuation: no slip. Two mistranslations found another way (Content, 3) |
| Text hygiene | spacing, quotes, brackets, doubled words, `**` pairs in 83,250 strings: clean |
| Dictionary forms | every form of every noun and adjective compared with its headword: one misplaced form (Content, 1) |
| Grammar quizzes | all 1,742 questions read with their answers, and all 646 "common mistakes": no missing blank, no duplicate, and two lessons that mark good French wrong (Content, 10 and 11) |

`tools/test.html` was not run. Real phones were not used: the phone results come from a browser emulating a phone's size and touch, so anything that depends on the on-screen keyboard or on Safari is marked as worth trying on the phone.

## Bugs in the app

### 1. "Write it in French" refuses right answers (Confirmed, now fixed)

**Fixed on 16 November 2026, not committed.** `acceptedFor()` in [js/quizgen.js](js/quizgen.js) now builds the answers from the forms the card shows, as proposed below. Over the whole course, 673 more answers are accepted for 366 words, every count in the table below is now zero, and nothing that was accepted before is refused. Four tests in `tools/check_logic.mjs` cover it. The last row (*oe* for *œ*) was left alone: `check_logic.mjs` already has a test saying that *coeur* for *cœur* gives "check the accents", so that is a choice, not a fault. What follows describes the app before the fix.

`acceptedFor()` in [js/quizgen.js:8](js/quizgen.js:8) accepted the word as the card displays it (the whole string), the bare word, *un/une* + the word, and the `accept` list written by hand for each entry. When an entry has its own `display`, the plain form with *le / la / l'* is never added, and the hand-written lists differ from unit to unit.

| Typed answer | Result | How many |
|---|---|---|
| The headword with its article, when the card shows two forms or *le / la*: **le serveur**, **le médecin**, **l'infirmier**, **le journaliste** | wrong | 214 of 228 such nouns, from Unit 13 on |
| The feminine form the card itself shows: **la jumelle**, **la voisine**, **la traductrice** | wrong for 89 nouns, right for the other 79 | 168 nouns |
| The feminine of an adjective: **chaude**, **fraîche**, **italienne** | wrong for 126, right for 220 | Units 11–16, 23–26, 37–44, 55 and 59 refuse it; the others accept it |
| The other gender of a noun marked `both`: **une adulte**, **la secrétaire**, **une psychologue**, **une artiste** | wrong | 27 of 65: *adulte, chef, bénévole, sans-abri, artiste, astronaute, pote, gosse, flic, secrétaire, généraliste, titulaire, psychologue, interprète, chorégraphe, ancêtre, enfant unique, môme, imbécile, commissaire, détective, ébéniste, adversaire, notaire, comptable, soprano, soliste* |
| **l'astronaute**, **l'imbécile**, **l'ébéniste**, **l'adversaire** | wrong, while *la astronaute* is accepted | 4 |
| *oe* for *œ*: **le coeur**, **l'oeuf** | "check the accents" (only *sœur* lists *soeur*) | 16 of 17 |

*serveur*, *un serveur* and *la serveuse* are all accepted while *le serveur* is not, and the app teaches every noun with *le* or *la*. I saw it live in a review: for "locksmith" the accepted answers were *le serrurier, la serrurière* (the whole string), *serrurier*, *serrurière*, *la serrurière*, *une serrurière* and *un serrurier*.

This matters most in reviews: a refused answer resets the card (interval 0, ease −0.2, back in ten minutes), and in a lesson quiz it counts against the 80%.

Fix in code, not in 300 `accept` lists: build the accepted answers from the entry itself. Take `fr`, then *un/une* and *le/la/l'* + `fr` worked out from `g` and `hAsp` whatever `display` says; split `display` on `, ` and ` / ` and accept each part with and without its article; expand `(e)` and `(ne)`; for `both`, add both genders; treat *œ* and *oe* as the same letter. `accept` then only needs true synonyms (*docteur*). `check_app.mjs` could then test that every form a card shows is accepted.

### 2. Enter on an empty answer counts as wrong (Confirmed)

[js/quiz.js:120-123](js/quiz.js:120): Enter moves on from an answered question, and on a typed question it submits the box even when it is empty. In the browser, Enter on the empty box gave "Not quite. The answer is: content, contente". Holding the key did worse: each pair of repeat events moved to the next question and marked it wrong (36/86 → 37/87 → 38/88).

A second press of Enter that lands a moment late is enough to lose a question. Fix: ignore Enter while the box is empty (there is already an "I don't know" button), and ignore `ev.repeat`.

### 3. A quiz in progress is lost when you leave the page (Confirmed)

The quiz lives only in memory ([js/quiz.js:139](js/quiz.js:139)). I left a quiz at question 38 of 88 for the Today page and came back to "Start the quiz". There is no warning.

A vocabulary quiz averages 62 questions (75 in u18-body), and each miss adds one more. On the phone the risk is a mis-tap: after each answer the page scrolls so that "Continue" sits 12 px above the menu (measured: button at 692–738, menu from 750).

Fix: keep the queue and the first answers per lesson (sessionStorage is enough) and offer "Resume"; ask before leaving a quiz; hide the menu while a quiz runs (Layout: phone, 4).

### 4. The speed and voice settings change nothing (Confirmed)

Every text has a recording, and [js/audio.js:76](js/audio.js:76) plays recordings at 1× (0.75× for 🐢) whatever the settings say; `rate` and `voice` only reach the device voice. With the slider at 0.5×, "Test the voice" played `audio/35bf179378bb.mp3` at rate 1 and never called the device voice: `tools/make_audio.py` records that same sentence (`SETTINGS_TEST`).

Fix: apply the speed to recordings (`a.playbackRate`, with `preservesPitch`) and rename the setting "Speed"; show the voice list only when a text has no recording.

### 5. The Back button returns to the wrong unit (Confirmed)

With progress up to Unit 29, I scrolled the course page back to Unit 5, opened a lesson and pressed Back: the page opened at Unit 30. The app's own "← Course" link returned to Unit 5. [js/app.js:32](js/app.js:32) scrolls on every route change, and `#/learn` without a number means "the unit in progress" ([js/views/home.js:53](js/views/home.js:53)).

The three tabs of a lesson also add three history entries, so Back from a quiz takes three presses to reach the course.

Fix: when a lesson is opened from the list, first write its unit into the address (`history.replaceState(null, '', '#/learn/5')`); switch tabs with `location.replace`.

### 6. Progress is not protected (From the code, one part Confirmed)

- **Storage.** Progress is in localStorage; recordings pile up in the `francais-audio` cache with no limit ([sw.js:212](sw.js:212)), up to 567 MB. The app never asks for persistent storage, and under pressure a browser clears a whole site at once, progress included. Call `navigator.storage.persist()`, and show the storage in use and the date of the last backup in Settings.
- **Updates.** If storage fills, saving a new course version fails quietly ([sw.js:166](sw.js:166)) and the app stays on the old version with no message.
- **Damaged backup (Confirmed).** A progress file with `"cards": {"w:bonjour": null}` is accepted by `importJSON` and saved; `isDue` ([js/srs.js:41](js/srs.js:41)) then throws on every visit, so Today and Review stay blank until progress is reset from `#/settings`. `normalize` ([js/store.js:23](js/store.js:23)) checks the containers but not each card.
- **Reset.** "Reset all progress" deletes everything after one confirm. Offer the download first.

### 7. Reviews teach less than they could (From the code, seen in a review)

These are design points rather than faults. In a 60-card review I played, the questions were 23 fill-in-the-blank, 17 writing, 9 *un or une?* and 11 grammar.

- **The blank is always the same sentence.** `clozeExample()` ([js/quizgen.js:35](js/quizgen.js:35)) takes the first example, so each word's blank question never changes and examples 2 and 3 are never asked. Pick one at random.
- ***Un or une?* counts as a full review.** For a noun it is one of three kinds picked at random ([js/views/review.js:16](js/views/review.js:16)). A coin-flip answer then pushes the card's next date out as if the word had been recalled. Ask the gender with the word (type *la maison*), or don't let that question alone lengthen the interval.
- **Wrong grammar answers get no explanation.** 89 of 1,742 grammar questions have a `why`; for the others the app shows the answer and nothing else, although every case has a `rule` ready. One line in [js/quizgen.js:109](js/quizgen.js:109): `explain: item.why || the case's rule`.
- **Below 80% means all 62 questions again.** Offer to retake only what was missed.

### 8. Smaller points

| Finding | Status |
|---|---|
| The daily goal is clamped to 5–100 when saved, but the box keeps what was typed: I typed 500, 100 was saved, the box still said 500 ([js/views/settings.js:20](js/views/settings.js:20)) | Confirmed |
| The Words page searches only the headword and its English: *suis* finds *la Suisse*, not *être*; and *être*, *avoir* and the other 1,151 helper words can't be found at all, though they have cards. *eau* lists *beau, belle, le bureau* before *l'eau*: put exact matches first ([js/views/words.js:14](js/views/words.js:14)) | Confirmed |
| The label "GRAMMAR" is wider than its box (64 px in 58 px) and touches the lesson title, on all 119 grammar lessons ([css/app.css:152](css/app.css:152)) | Confirmed |
| The page title is always "Français", so history and tabs can't tell pages apart | Confirmed |
| The theme list reads "auto, light, dark" in lower case | Confirmed |
| Number keys answer a multiple-choice question even with Ctrl or Alt held ([js/quiz.js:123](js/quiz.js:123)) | From the code |
| In a lesson quiz, a click on a prompt word runs twice: `attachWords` is bound on the lesson body ([js/views/lesson.js:39](js/views/lesson.js:39)) and on the prompt ([js/quiz.js:116](js/quiz.js:116)) | From the code |
| The toast ignores the phone's bottom inset, so on an iPhone with a home bar it sits partly over the menu ([css/app.css:257](css/app.css:257)) | From the code |
| If one lesson file fails to load, the app shows "Could not load the course" with no Retry button | From the code |
| Each sound makes a new `Audio` element ([js/audio.js:74](js/audio.js:74)). When very many follow each other quickly, Chromium refuses to make more ("too many WebMediaPlayers"); a recording that can't play falls back to the device voice. Seen only while a script answered a whole quiz in a second; at a learner's pace the browser normally frees the old players in time. Reusing one `Audio` element would rule it out | Seen in an automated run |
| Input and card borders have a contrast of 1.3:1 on white; text contrast is fine everywhere (4.3:1 or more in both themes) | Measured |

### 9. Size and start-up (Measured)

- **Start-up.** The app makes about 360 requests at every start: 334 lesson files (6.6 MB) and `data/audio.json` (2.6 MB) among them. From a local server on this laptop it took 0.95 s; parsing the JSON is only 55 ms of that, the rest is the number of requests. A phone will be slower. One generated file per unit, or one small index of words and forms, would cut it; `data/audio.json` is already a generated file of that kind.
- **Saved progress.** 2,426 cards made a 250 KB save taking 2.8 ms, so the whole course (about 6,000 cards) stays well inside localStorage's limit.
- **Deployment.** `audio/` holds 39,673 files, 567 MB, about 9.5 MB per unit; `.git` is 552 MB. Part 4's twenty units bring the site to about 760 MB. GitHub Pages allows a published site of 1 GB and gives a deploy 10 minutes, and the log already has one deploy that timed out. The recordings are 64 kbps mono MP3 at 22 kHz; speech holds up at 32–40 kbps, which would nearly halve them. Worth deciding before Part 4.

## Bugs in the content

1. **_étés_ opens the card for _année_ (Confirmed).** [data/lessons/u11-seasons.json:60](data/lessons/u11-seasons.json:60) gives *année* the forms `["années", "étés"]`. In the app, tapping *étés* in *Tous les étés, nous allions à la mer* shows "l'année: “étés” is a form of l'année". It affects u16-imparfait, u16-pc-imparfait, u25-climat and u39-lieux. Move `étés` to *été* (line 26).
2. **"l'yaourt" and "l'yoga" (Confirmed).** `article()` in [js/content.js:50](js/content.js:50) counts an initial `y` as a vowel. Both are helpers ([data/lexicon.json:274](data/lexicon.json:274), [:516](data/lexicon.json:516)) and their cards show the wrong form. Drop `y` from the pattern; *le yacht* or *le yen* would otherwise do the same.
3. **Two translations don't match their French.**
   - [data/lessons/u57-nul-tel.json:29](data/lessons/u57-nul-tel.json:29): *Ce matin, je me suis baigné dans une mer telle que…* is given as "I swim every morning, in a sea such as…". The story line has it right: "This morning I swam in a sea such as…".
   - [data/lessons/u58-adjectifs.json:70](data/lessons/u58-adjectifs.json:70): *Manon fait une liste de prénoms* is given as "is already looking for names"; it should be "is making a list of names".
4. **Two blank questions show their own answer.** The quiz uses each word's first example. *Ici, on ne **recharge** pas les téléphones : on recharge les batteries !* ([data/lessons/u39-ecran.json:25](data/lessons/u39-ecran.json:25)) and *Nina est **tantôt** sage, tantôt terrible* ([data/lessons/u46-adverbes.json:102](data/lessons/u46-adverbes.json:102)) both repeat the hidden word. Put another example first.
5. **Two `accept` lists hold forms that aren't French:** *la astronaute* ([data/lessons/u32-espace.json:24](data/lessons/u32-espace.json:24)) and *la arbitre* ([data/lessons/u44-football.json:9](data/lessons/u44-football.json:9)). The fix for bug 1 makes both lists unnecessary.
6. **_chiffre d'affaires_ is an expression with a gender** ([data/lessons/u56-entreprise.json:97](data/lessons/u56-entreprise.json:97)): its card shows "masc." but no article, and it gets no *un or une?* question. Make it a noun. The helper *rond de serviette* is the same ([data/lexicon.json:1076](data/lexicon.json:1076)).
7. **Unit 22 still has its `planned` list** next to its `lessons` ([data/curriculum.json:24](data/curriculum.json:24)). The app ignores it.
8. **The same people have two speaker names:** *Mme Dupont* in 5 lessons and *Madame Dupont* in 4; *Mme Fournier* in 9 and *Madame Fournier* in 28; *Mme Garnier* in 1 and *Madame Garnier* in 2.
9. **53 English translations keep French « » quotes**, in 7 lessons, all but one from Units 53 to 60 (23 in u58-nominalisation, 17 in u57-accord-sujet). The rest of the course uses English quotes there.
10. **Unit 10 teaches _je ne joue pas de piano_ as the rule and marks _du_ wrong.** [data/lessons/u10-faire-jouer.json:14](data/lessons/u10-faire-jouer.json:14) says "*faire du / jouer du* → *pas de*", the table at line 92 gives *Je ne joue pas de piano*, and the typed question at line 158 (*Il ne joue pas ___ piano*) accepts only *de*. That is right for *faire du sport*, where *du* is "some". With an instrument, *du* is *de* + *le*, and the Académie française keeps it in the negative: "Je joue (ne joue pas) du piano" ([Questions de langue, "Partitif et déterminant"](https://www.dictionnaire-academie.fr/article/QDL064)). *Pas de piano* is heard too, so the least change is to accept both and take *jouer* out of the rule.
11. **Unit 47 marks _sans rien avoir apporté_ wrong.** The tip at [data/lessons/u47-inf-passe.json:40](data/lessons/u47-inf-passe.json:40) says *rien* and *jamais* go between *avoir* and the participle, and the question at line 99 offers *avoir rien* (right) and *rien avoir* (wrong). Both orders are standard French: *sans avoir rien dit*, *sans rien avoir dit*. Replace the wrong option with one that really is wrong, and soften the tip to "usually". The same lesson lists *Après manger, on danse* among its common mistakes (line 59), but *après manger* is established French, one of the few verbs that follow *après* in the plain infinitive (like *après boire*). Use another verb there: *Après finir* → *Après avoir fini*.

## Layout: phone

Measured at 375×812 with touch.

| Measured | Value |
|---|---|
| Top bar (name and flag only) + bottom menu | 48 + 62 px, always on screen: 14% of the height |
| A 25-word lesson, Words tab | 13,506 px, 16.6 screens |
| The course page | 38,974 px, 48 screens (it opens at the current unit) |
| "EN" / "hide" | 25×24 px, 100 of them on a Words tab |
| 🔊 after a sentence | 30×30 px |
| 🔊 and 🐢 on a word | 36×36 px |
| "← Course" | 59×18 px |
| ✕ on the word card, "I don't know" | 30×30 px, 84×24 px |
| Accent keys | 38×38 px, in two rows |
| The word card | 446 px tall, 55% of the screen |
| A typed question | lesson title and tabs fill the top 234 px; the answer box starts at 446 px and "Check" ends at 651 px |

The usual minimum for a tap target is 44×44 px.

1. **Make the small controls tappable.** "EN" is the most-used control in the app and the smallest. As a temporary style, `.reveal { min-width: 44px; min-height: 40px; padding: 8px 10px }`, `.icon-btn.sm { width: 40px; height: 40px }` and `.accents button { min-width: 44px; height: 44px }` gave 44×40 and 40×40 targets with no sideways overflow. The Words tab grew by 13%, so do this together with point 5.
2. **Keep the tapped word in view (Confirmed).** A word tapped anywhere below the top 300 px ends up under the card: in four of five positions tried, the card covered it. Scroll the word to just above the card when it opens, as `reveal()` already does for "Continue" ([js/quiz.js:33](js/quiz.js:33)). Then make the card shorter: word, sound, meaning and the two buttons first (about 200 px), with the definition, example and note behind "More".
3. **Give the top bar a job.** On a phone it holds only the name. Let it scroll away, and on a lesson page replace it with one sticky row: back arrow, lesson title and the three tabs. Today the tabs scroll off, and the only way from word 25 to the story is the button at the very bottom. As a temporary style, a static top bar with sticky tabs worked as expected.
4. **A quiz without the menu.** During a quiz, hide the bottom menu, the lesson title and the tabs. The question then starts near the top of the screen instead of 270 px down, "Check" and "Continue" sit where the thumb is, and nothing below them can be hit by mistake (bug 3).

   ```
   ┌─────────────────────────┐
   │ ✕  ▓▓▓▓▓▓░░░░░   36/61  │   replaces top bar, title and tabs
   │ FILL IN THE BLANK       │
   │ Il y a de la _____      │
   │ dans ses yeux.          │
   │ [ answer              ] │
   │ é è ê à â ç ù û ô î ï œ │
   │                         │
   │ [        Check        ] │   where the menu was
   └─────────────────────────┘
   ```

   Also give the answer box `enterkeyhint="done"`. Worth trying on the phone itself: with the keyboard open, the accent keys and "Check" are probably hidden behind it.
5. **A shorter Words tab.** Sixteen screens for 25 words is a lot of scrolling for one page. Show each word as one row (word, sound, meaning, 🔊) that opens to the definition and examples when tapped, with a count ("12 / 25"). Or show one word per screen with Next and Previous.
6. **A story that reads like a story.** Each sentence is followed by its own 🔊 and "EN", often on a line of their own, which breaks the text up. Hide them until the sentence is tapped, and during "Read it all" highlight the sentence being read and keep it in view; a tap on a sentence could start from there. Today nothing on screen shows where the voice is ([js/views/lesson.js:131](js/views/lesson.js:131)).
7. **A course page you can scan.** Show finished units as one line each (number, title, ✓ 6/6), keep the current unit open, and put the four parts as headers with a row of jump links. The page is 48 screens now.
8. **Today.** "How each day works" takes 40% of the screen every day. After the first week, use the space for the current unit's progress and the reviews due over the coming days.
9. **On its side (Confirmed).** At 667×375 the bar and the menu take 29% of the screen, and with a word card open 40 px of text is left. For a short, wide screen, move the menu to a narrow rail on the left and open the card as a panel on the right.

## Layout: laptop

Measured at 1440×900.

| Measured | Value |
|---|---|
| The page column | 820 px wide, with 310 px empty on each side |
| The course page | 31,020 px, 34 screens |
| A 25-word lesson, Words tab | 10,982 px, 12 screens |
| The word card | 360×330 px, drawn over the text (it hid three lines of the story when I clicked *espoir*) |

1. **Dock the word card beside the text.** There is room, and the card would stop covering what is being read. This temporary style did it at 1440 px: the text kept its 738 px and the card sat to its right for every word tried, never over the text.

   ```css
   @media (min-width: 1200px) {
     .view { max-width: 1200px; padding-right: 412px; }
     .popover { left: auto !important; right: max(16px, calc(50vw - 584px)); top: 76px !important;
                width: 380px; max-height: calc(100vh - 100px); box-shadow: none; }
   }
   ```

   ```
   ┌────────────────────────────────────────────────────────────────┐
   │ Français                    Today  Learn  Review  Words  Settings │
   ├────────────────────────────────────────────────────────────────┤
   │   ← Course   Les émotions      [1 Words] [2 Story] [3 Quiz]      │
   │   ┌───────────────────────────────┐   ┌──────────────────────┐ │
   │   │ Sophie  Je m'ennuie, je       │   │ l'espoir  masc. noun │ │
   │   │         m'inquiète…           │   │ /ɛs.pwaʁ/   🔊  🐢    │ │
   │   │ Léa     Il faut garder        │   │ hope                 │ │
   │   │         l'[espoir] !          │   │ Définition …         │ │
   │   └───────────────────────────────┘   └──────────────────────┘ │
   └────────────────────────────────────────────────────────────────┘
   ```

   Only the lesson pages need the wider column; the quiz reads better narrow.
2. **Sticky tabs.** `.tabs { position: sticky; top: 61px }` kept the three tabs under the top bar while scrolling (tried in the same test).
3. **A course page in two columns.** A list of parts and units on the left that stays put, the open unit on the right, and finished units folded as on the phone.
4. **Words tab as list and detail.** The 25 words in a narrow list on the left, the chosen word's full card on the right, with ↑ ↓ to move and Space to listen. Twelve screens become one.
5. **Keys outside the quiz.** The quiz has 1–4 and Enter. Add Space to play or pause a story, ← → to move by sentence, T to show translations, and Esc already closes the card.
6. **Between 760 and 1200 px**, where the card must float, place it below or above the line being read, never over it.

## Not checked

- Whether each English meaning, definition and grammar explanation is right. The comparisons above test genders, sounds, numbers and names, not sense; of the grammar lessons, the quiz questions and the "common mistakes" were read, not the rules and tables.
- The stories against the story bible (STORY.md).
- The recordings by ear.
- A real phone: the on-screen keyboard, Safari, the installed app and offline use.
