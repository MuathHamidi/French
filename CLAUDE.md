# CLAUDE.md

A personal French course that the user studies every day. It is a static web app with no build step (`index.html`, `js/`, `css/`). The course lives in `data/` and the generated audio in `audio/`. README.md explains the data files, the markup in French texts, the tools and the roadmap, so read it first. This file adds how a unit is built and checked, and the story bible.

## Machines and commands

The course was built on Linux (`~/Data/Courses/French`) and moved to Windows in October 2026 (`C:\Users\muath\Documents\GitHub\French`, remote github.com/MuathHamidi/French). Run these from the project folder:

| | Linux | Windows |
|---|---|---|
| Run the app | `python3 tools/serve.py` | `python tools/serve.py` |
| Check the content | `python3 tools/validate.py` | `python tools/validate.py` |
| Check the app | `node tools/check_app.mjs [--homographs] [lesson ids]` | same |
| Make audio | `.venv/bin/python tools/make_audio.py [--prune]` | `.venv\Scripts\python tools\make_audio.py [--prune]` |

`.venv/` and `tools/voices/` are not in git, so each machine sets them up once (README › Pronunciation). On Windows, a throwaway script piped into `python -` reads and prints in the ANSI code page: set `PYTHONUTF8=1` for those (the tools themselves don't need it).

## Building a unit

From Unit 17 on, a unit has four 25-word vocabulary lessons (two on its topic, two on high-frequency words) and two or three grammar or sound lessons, about 100 new words in all. Its plan is the `planned` list in `data/curriculum.json`.

1. Write the lessons, then replace the unit's `planned` list with its `lessons` ids.
2. Reuse what exists: look in `data/lexicon.json` and earlier lessons first. When a lesson teaches a helper word, move its entry into the lesson with the same id. Add helpers for any other new word the texts need.
3. When a unit introduces a tense, add its forms to the `forms` of every verb (done so far for the imparfait and the future, 309 verbs). Make sure no new form collides with another entry.
4. `validate.py` must print OK.
5. Review homographs with `node tools/check_app.mjs --homographs <new lesson ids>`, and fix wrong picks with `[word|id]`.
6. Generate the audio with `make_audio.py --prune` and read its IPA report for the new words. The report always lists some harmless variants (o/ɔ, ɥ/y, a schwa kept or dropped). When a word really sounds wrong, add it to `FIXES` and run again; only the changed texts are regenerated.
7. `node tools/check_app.mjs <new lesson ids>` must print OK, then the full `node tools/check_app.mjs`. Also run it for any older lesson you edited.
8. Open the new pages in the preview (words, lesson, story and quiz tabs; no console errors). Check the stories against the bible below. Update the README roadmap and the bible.

## Writing rules learned so far

- The French columns of a grammar table (`frCols`) are linked word by word and read aloud, so they must contain only French, never English notes.
- A `mistakes` entry must be a real learner error ("je mangera"), never correct French.
- Tips, rules, mistakes and translations are not linked, so they must not contain `[word|id]` or `{text|case}` markup (`check_app.mjs` flags it).
- Each vocabulary example has one `**target**`, used for fill-in-the-blank questions.
- The stories share one recurring cast (below). Keep ages, places and past events consistent from unit to unit.

## Story bible

Lesson ids in brackets show where a fact is stated. "Implied" means the stories suggest it without saying it. The grammar lessons' texts about sounds (u03-sounds, u05-nasals, u08-u-ou, u16-r) are standalone and don't use the cast.

### Cast

- **Léa**: from Paris (u01-grammar). She studies French in Lyon in Marc's class and shares a flat with Sophie (u04-furniture). Younger than Hugo (implied, u17-cod); her age is never given. Brown hair; reads, swims, cycles. June intern at Hugo's firm (u13-cest-ilest). Hugo owes her €150 (u19-money).
- **Hugo**: Léa's brother (u02-vocab), 20 in Unit 3 (u03-numbers1). He was in Marc's class and has worked in IT at a small Lyon firm since Unit 8 (u13-work). His own place is far from Léa's (u04-places). Always late, forgetful and broke; loves chocolate, pizza, TV series and video games; snores; can't keep a secret; wears glasses.
- **Sophie**: Léa's friend from Paris, where her parents and a sister live, and her flatmate (u02-possessives). Surname Lambert (u15-hotel); birthday 30 December (u20-speech). Doesn't eat meat; draws, takes photos, dances. Saturday waitress at the café downstairs (u13-jobs); starts architecture school in January (u17-emotions). Her male cat **Minou** sleeps on computers and the TV and plays with keys.
- **Tom**: English, from London. 19 in Unit 3 (u03-avoir); birthday 1 June (u11-il-fait). Has a brother (u02-articles) and two sisters aged 12 and 15 (u03-avoir), a dog, and parents in England. Became an uncle on 15 August (u15-pc-etre). Sells and plays guitars; shy, afraid of the dark. With Camille since October (u17-character). His flat is bigger than Léa's (u20-speech).
- **Inès**: from Madrid, where her parents live; 22 (u03-avoir). Classmate, Sophie's close friend, works as a model (u07-agreement, u17-emotions). Her sister **Carla** (20) is also in the class and prefers dancing to football.
- **Marc**: the French teacher. His age is a secret.
- **Lou**: Léa and Hugo's little sister, 2 in Unit 3 (u03-numbers2) and 3 since early September (u16-school). Lives with her parents (implied). Teddy bear, drawings, sweets. Her nursery teacher is **Claire**. Her friend and rival **Emma** is a month younger but taller (u19-comparatives).
- **Paul**: Léa's father, 50 (u03-numbers2). Very tall; teacher; Jacques and Louise's son (u17-coi). Lived in Montmartre as a student (u18-y); loses his papers.
- **Anne**: Léa's mother, 47. Canadian, from Montréal, where her sister lives (u14-travel). Doctor; blond. She met Paul at a rainy Paris bus stop when they were 20 (u16-pc-imparfait).
- **Jacques** (80) and **Louise** (78) (u03-numbers2): Paul's parents. They have a seaside house with a garden in Marseille (u15-holidays), were childhood neighbours and honeymooned in Paris 50 years ago (u18-y). Louise has her birthday in late October (u17-coi), the family's crêpe and chocolate-cake recipes and 300 books. She got her first mobile at Christmas (u20-phone).
- **Pierre**: Léa's uncle, 60, a farmer (u03-numbers2, u13-jobs). Father of **Jules** and **Chloé** (u02-articles). Chloé is a lawyer married to **Karim** (30), a restaurant cook who makes desserts (u02-possessives, u06-er). Sophie once liked Jules (u02-possessives).
- **Antoine**: Léa's cousin in Montréal (u09-places), probably Anne's sister's son (implied). Taxi driver who sings in a band at weekends (u13-jobs); drives fast.
- **Hugo's firm**: **Mme Dupont**, his demanding boss (u13-cest-ilest); **Julien**, a funny colleague (u13-work); **Bernard**, the accountant who retires (u13-cest-ilest); interns **Sarah** and **Malik**.
- **Camille**: Tom's girlfriend since October (implied); has a cat (u17-character, u19-describing).
- **One-offs**: Mme Martin, who showed the flat (u04-rooms); Oscar, Tom's English friend (u11-liaison); an actor nicknamed "the croissant thief" (u18-appearance).

### Places

- **Lyon**:
  - Léa and Sophie's third-floor flat (u04-rooms, u04-ilya): living room with a balcony, big kitchen, two bedrooms, a shower but no bathtub.
  - It is above **le café d'en bas**, the friends' hangout where Sophie works, near place Bellecour (u09-places).
  - Also the Part-Dieu and Croix-Rousse districts.
- **Paris**: the parents' home with its attic (u16-childhood), Sophie's parents, and Paul's old Montmartre flat.
- **Marseille**: the grandparents' seaside house, with a beach and harbour nearby.
- **Near Annecy**: Pierre's home in the countryside (u12-nature).
- **Abroad**:
  - Montréal: Anne's sister (the family stayed with her) and Antoine.
  - Madrid: Inès and Carla's family.
  - England: Tom's family.

### Timeline

- **U1–U6 (no dates)**:
  - Marc's first class, on a Monday in Lyon; Hugo meets Sophie.
  - Léa's family; Chloé marries Karim.
  - Jacques's 80th birthday; Hugo has no phone.
  - Léa and Sophie move into the flat with Minou.
  - Market, the café downstairs, a picnic.
  - Crêpes, Tom's first soup, Sunday lunch at the grandparents', Sophie's party.
- **U7**: January sales; Inès on TV; Léa buys Hugo a €300 suit for his interview.
- **U8**: Hugo starts his office job.
- **U9**: Antoine visits Lyon, gets lost, flies home.
- **U10**: Hugo's failed sporty phase.
- **U11**: winter call with Antoine; Tom's weather report (12 April); summer plans; dinner with Oscar.
- **U12**: a day at Pierre's; camping and a mountain hut in June.
- **U13**: careers fair; Léa's internship at Hugo's firm from 1 June.
- **U14**: on 1 July Léa, her parents and Lou fly to Montréal; Hugo joins them on 5 August.
- **U15**: in July, Sophie and Inès in Madrid, then Barcelona; in late August, Léa, Hugo and Lou's week in Marseille; catching up in early September.
- **U16**: in early September Lou starts nursery school; the Paris attic; Louise's and Anne's memories.
- **U17**: October. Sophie gets into architecture school; Tom meets Camille; Louise's birthday.
- **U18** (no month): Hugo's flu; the grandparents' weekend in Paris.
- **U19**: late November to 15 December. Hugo's budget, Christmas shopping, his first 10 km race, a dessert contest.
- **U20**:
  - Christmas in Marseille.
  - 29 December: Hugo falls into a bin on live TV.
  - 30 December: Sophie's surprise party at Tom's.
  - New Year's Eve at Léa and Sophie's.

**Where the story stands:** the evening of 1 January (u20-futur-irr). Lou is spending the holidays with Léa, and Sophie starts architecture school this month. Open threads:
- the €150 Hugo owes Léa;
- the race on 1 May (u19-numbers);
- Antoine's visit planned for late May (u11-seasons);
- Hugo's fame from the bin video.

### Continuity facts

- **Family tree**:
  - Jacques and Louise are the parents of Paul (and of Pierre, implied).
  - Paul and Anne, married and living in Paris, are the parents of Hugo, Léa and Lou.
  - Pierre and an unnamed aunt are the parents of Jules and Chloé (Chloé is married to Karim).
- **Ages** were given in Unit 3, at least a year before Unit 20, so everyone is now about a year older (implied). Birthdays shown since: Tom (1 June), Lou (now 3), Louise (October), Sophie (30 December).
- **Hugo's things**:
  - He has a phone, a €200 console (u19-money) and Lou's passport holder (u14-participes). His bike is at Tom's.
  - He quit the sports club (u10-negation) and skipped his flu jab (u18-health).
  - He now likes camembert (u17-thinking) but still dislikes cooked carrots.
- **Loose ends**:
  - Hugo says "ma sœur joue du piano" (u10-faire-jouer) without saying which sister.
  - Anne's Christmas shoes (size 39) were left at the till (u19-shop).

### Known inconsistencies (not fixed yet)

- **Hugo**: Léa's brother from Unit 2 on, but he answers "Oui !" to "Tu es un ami de Léa ?" (u01-vocab) and says "Je suis canadien, de Montréal !" (u01-grammar).
- **Pierre's home**: Léa's uncle and aunt, Jules and Chloé's parents, "habitent à Marseille" (u02-vocab), but uncle Pierre lives "près d'Annecy" (u12-nature).
- **The bathtub**: the flat has none (u04-ilya), yet Sophie looks for Minou "dans la baignoire" (u04-furniture).
- **Léa's punctuality**: she is "souvent en retard" (u08-routine) but "jamais en retard" (u13-modaux).
- **Tom's age**: 19 in Unit 3, and still "dix-neuf ans" in October (u17-character), after his 1 June birthday.
- **Tom's family**:
  - His sisters are 12 and 15 (u03-avoir), yet "ma sœur a eu un bébé" (u15-pc-etre).
  - His brother (u02-articles) is missing from u03-avoir.
- **Hugo's boss**: "la patronne de Hugo, madame Dupont" (u13-modaux), but "mon patron" (u17-connectors).
- **The flight** (u14-transport): it "part à treize heures", then "À midi, l'avion décolle".
- **The Montréal stay**: it "dure trois semaines" from 1 July (u14-travel), yet Léa is there when Hugo arrives on 5 August (u14-participes).
- **Minor**:
  - Sunday lunch at the grandparents' every week (u02-vocab, u06-er), though they live in Marseille.
  - Antoine wants to "visiter Lyon l'année prochaine" (u11-seasons) after already visiting it (u09-places).
  - Hugo has no phone in u03-numbers1 but answers Léa's call in u08-reflexive.
  - Hugo "ne sait pas jouer" tennis (u10-sports), then plays "un peu" (u10-faire-jouer).
  - Bernard retires "vendredi" both before Léa's interview (u13-work) and around 1 June (u13-cest-ilest).
