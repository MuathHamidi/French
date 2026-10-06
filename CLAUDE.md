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

1. Before changing anything, save a snapshot of every word link: `node tools/check_app.mjs --save-links links-before.json`.
2. Write the lessons, then replace the unit's `planned` list with its `lessons` ids.
3. Reuse what exists: look in `data/lexicon.json` and earlier lessons first. When a lesson teaches a helper word, move its entry into the lesson with the same id. Ids drop accents, so check that a shared id is really the same word: *presse* (the press) is not the helper *pressé* (in a hurry), so the new word gets its own id (*presse-n*). Add helpers for any other new word the texts need.
4. When a unit introduces a tense, add its forms to the `forms` of every verb (done so far for the imparfait, the future, the conditional and the present subjunctive, about 330 verbs; the subjunctive only needed the forms that differ from the present and the imparfait: *finisse, prenne, soit, fasse…*). Past participles and their agreements were completed in Unit 29 for the past conditional; a participle spelled like an existing word (*perdu, ouvert, assis*, or *levé* for *se lever* next to *lever*) was left to that word. Present participles followed in Unit 30 for the gérondif, on the same rule: *étudiant, suivant, courant, vivant, devant, pendant* belong to their other word, so a gérondif of those verbs needs markup: *en [étudiant|etudier]*. Make sure no new form collides with another entry. Derive new tenses from forms that exist (the conditional came from each verb's future forms) and listen-check one form per verb against the old one: the voice swallows the vowel of **-ouer** verbs (*jouerais*), which needs `FIXES`.
5. `validate.py` must print OK. When two taught words share a spelling, read the "Ambiguous" list it prints: the tie goes to the older lesson.
6. Review homographs with `node tools/check_app.mjs --homographs <new lesson ids>`, and fix wrong picks with `[word|id]`.
7. Generate the audio with `make_audio.py --prune` and read its IPA report for the new words. The report always lists some harmless variants (e/ɛ, o/ɔ, ɥ/y, a schwa kept or dropped). When a word really sounds wrong (often English loanwords like *scotch*, foreign names like *Saint-Exupéry*, abbreviations (the voice reads *BD* as *boulevard*), or *plus* meaning *more*, whose s the voice drops: *il en faut deux fois plus*), add it to `FIXES` and run again; only the changed texts are regenerated.
8. `node tools/check_app.mjs --compare-links links-before.json` must print OK. Read its warnings: every older text that now links a word to a different entry is listed, and each change must be intended. Also run it for any older lesson you edited.
9. Open the new pages in the preview (words, lesson, story and quiz tabs; no console errors). Check the stories against the bible below. Update the README roadmap and the bible.

## Writing rules learned so far

- The French columns of a grammar table (`frCols`) are linked word by word and read aloud, so they must contain only French, never English notes.
- A `mistakes` entry must be a real learner error ("je mangera"), never correct French.
- Write *Madame Dupont* in French texts: the abbreviation *Mme* is not in the dictionary (it's fine in speaker names, which aren't linked).
- Tips, rules, mistakes and translations are not linked, so they must not contain `[word|id]` or `{text|case}` markup (`check_app.mjs` flags it).
- Each vocabulary example has one `**target**`, used for fill-in-the-blank questions.
- Quiz items with `"lang": "en"` need a French `say` (or `listen`); otherwise the French voice reads the English answer aloud.
- A word card shows the word's own meaning, so use each word in the sense it has in the dictionary: for a machine that works, write *fonctionner*, not *marcher* (= to walk); don't use *personne* for *nobody* (its card says *person*).
- Context doesn't settle a noun/verb homograph after an adjective (*la première partie*: *partie* or *partir*?), or after a noun (*un objet vide*): mark it up, as in *la première [partie|partie]*.
- A newly taught word wins every tie against a helper with the same spelling, even in older lessons. When the new word is the rarer sense (*un prêt*, a loan, against the helper *prêt*, ready), make it `"manual": true` and mark its uses: *un [prêt|pret-n]*. `--compare-links` shows these cases.
- Hyphens and spaces match alike: a taught *petit-enfant* (grandchild) would also link *un petit enfant* (a small child), so it is manual.
- After a noun or a name, an object pronoun is only recognised when the next word can only be a verb (*Inès la rassure*). When that word is also a noun, mark both: *Tom [la|la-pron] [console|consoler]*.
- Keep the word itself out of its definition: the definition quiz shows the definition, so it would give the answer away (about 200 older definitions still do). Put expressions built on the word in a `note` (*en baisse*, *d'occasion*).
- Every verb now has its past participles (Unit 29) and its present participle (Unit 30). Give a new verb all its forms, *-é, -ée, -és, -ées* and *-ant* included.
- Every word of a vocabulary lesson must appear in its story (`validate.py` checks). A new phrase entry can swallow an older lesson's word (*à mon avis*, *ça dépend*): `validate.py` then names that lesson, and you mark the word back, as in *à mon [avis|avis]*.
- Idioms are phrase entries with their conjugated forms (*a la pêche*, *posé un lapin*). A word in the middle (*il a toujours la pêche*, *ne fais pas tout un fromage*) breaks the match, so keep the idiom in one piece, or add the form (*ce n'est pas du gâteau*).
- The tokenizer reads *avait, était* (and the other imparfait, future and conditional forms of *avoir* and *être*) like *a, est*: the next word is a verb or a participle (*il avait vu, elle était partie, il aurait été, elle serait partie*).
- *été* is read as the participle only right after *avoir* (*elle a été vue*). With a word in between, mark it up: *elle a déjà [été|etre] vue*.
- A taught phrase can swallow the first word of the next one: in *il le tient à l'envers*, *tient à* is read as *tenir à* (to care about), and *à côté du mien* loses *du* to *à côté du*. Reword, or mark the words up.
- The stories share one recurring cast (below). Keep ages, places and past events consistent from unit to unit.

## Story bible

Lesson ids in brackets show where a fact is stated. "Implied" means the stories suggest it without saying it. The grammar lessons' texts about sounds (u03-sounds, u05-nasals, u08-u-ou, u16-r) are standalone and don't use the cast.

### Cast

- **Léa**: from Paris (u01-grammar). She studies French in Lyon in Marc's class and shares a flat with Sophie (u04-furniture). Younger than Hugo (implied, u17-cod); her age is never given. Brown hair; reads, swims, cycles. June intern at Hugo's firm (u13-cest-ilest). Hugo owed her €150 (u19-money) and paid it back, "with ten cents of interest", on 16 January (u22-bank-post).
- **Hugo**: Léa's brother (u01-vocab, u02-vocab), 20 in Unit 3 (u03-numbers1). He was in Marc's class and has worked in IT at a small Lyon firm since Unit 8 (u13-work). His old place was far from Léa's (u04-places). Always late, forgetful and broke; loves chocolate, pizza, TV series and video games; snores; can't keep a secret; wears glasses (often on his head). Going out with **Carla** since Valentine's Day (implied, u23-love, u23-life); he took her to a bouchon and couldn't pay the whole bill (u24-restaurant), then burnt a chicken cooking for her (u24-aspect). Orders his steak well done. Afraid of bees (u25-animaux). Ran the 1 May race with Carla and finished in an hour and a half (u25-il-faut-que, u26-subj-volonte); Carla wants them to run a marathon next year. A recycling advert at the cinema now uses his bin video; he turned down a reality show and a quiz show (u27-cinema). Sings out of tune (u27-musique); fell asleep, snoring, at *Cyrano de Bergerac* (u27-critiquer). On a permanent contract (CDI) for a year and a half; since 22 June, project manager for a bakery chain's ordering app, due on 3 July. He emailed the client Mamie's crêpe recipe by mistake, and the client loved it (u28-emploi, u28-bureau). He went bankrupt at Monopoly (u28-economie). His landlord sold his flat (Hugo had left the notice, sent in February, unopened in a drawer), so on 25 July he moved into the flat across the landing from Tom's, above the bakery; Paul is his guarantor. He's clumsy with tools: on his first day he drilled through a water pipe and flooded the bakery (u29-logement, u29-demenager, u29-bricolage, u29-problemes). His housewarming was on 1 August (u30-nouvelles). He took the advertising company to court and won €3,000 in damages on 20 August, and the advert stopped (u30-justice). He learnt to change nappies from a video (u30-gerondif).
- **Sophie**: Léa's friend from Paris, where her parents and a sister live, and her flatmate (u02-possessives). Surname Lambert (u15-hotel); birthday 30 December (u20-speech). Doesn't eat meat; draws, takes photos, dances. Saturday waitress at the café downstairs (u13-jobs); starts architecture school in January (u17-emotions). Likes **Mathis**, a student at her school; their first coffee was early March (u24-expressions), and he came to Tom's world dinner (u24-monde). She volunteers on Sundays at a bike workshop in the Guillotière (u25-agir, u26-societe). At the town council on 13 August, her idea of putting the cycle lane on the other side of the street saved the café's terrace (u30-politique); she was the witness at Hugo's trial (u30-justice). Her male cat **Minou** sleeps on computers and the TV and plays with keys.
- **Tom**: English, from London. 19 in Unit 3 (u03-avoir), 20 on his birthday, 1 June (u11-il-fait, u17-character), and 21 a year later (u27-celui). Has a big brother and two sisters aged 12 and 15 (u02-articles, u03-avoir), a dog, and parents in England. His brother had a baby on 15 August, making Tom an uncle (u15-pc-etre). Sells and plays guitars; shy, afraid of the dark. With Camille since October (u17-character); he told her he loves her on Valentine's Day (u23-love). His flat is bigger than Léa's (u20-speech). He has given up flying and takes the train to England (u25-agir). He learns French with songs (he loves Édith Piaf) and reads *Le Petit Prince*, a chapter a night (u27-celui, u27-livres-art). At the Fête de la musique, he played guitar on stage with Antoine's band (u27-musique). He loves DIY, and since 25 July Hugo has been his neighbour across the landing (u29-bricolage, u29-demenager). He follows the news in English (a London daily, €12 a month) and, being British, can't vote in France (u30-nouvelles, u30-politique).
- **Inès**: from Madrid, where her parents live; 22 (u03-avoir). Classmate, Sophie's close friend, works as a model (u07-agreement, u17-emotions). Her sister **Carla** (20) is also in the class and prefers dancing to football. Carla sent Hugo an unsigned Valentine's card (u23-love). Carla is allergic to nuts (u24-restaurant), speaks Spanish, French and English, and has been dancing since she was five; in August she teaches dance to children at a dance centre run by **Mme Garnier**, from 1 August (u28-emploi, u28-infinitif, u30-nouvelles). As a European citizen, Inès can vote in local elections (u30-politique).
- **Marc**: the French teacher. His age is a secret. His school year ended on 19 June with a quiz at the café downstairs (u27-dont-lequel).
- **Lou**: Léa and Hugo's little sister, 2 in Unit 3 (u03-numbers2) and 3 since early September (u16-school); the youngest of the family until the twins (u23-life). Lives with her parents (implied). Teddy bear, drawings, sweets. Her nursery teacher is **Claire**. Her friend and rival **Emma** is a month younger but taller (u19-comparatives). Counts to eight, is scared of snakes and spiders, and loves giraffes (u25-semi-voyelles, u25-animaux). The biggest fan of Antoine's band; she has its album (u27-musique).
- **Paul**: Léa's father, 50 (u03-numbers2). Very tall; teacher; Jacques and Louise's son (u17-coi). Lived in Montmartre as a student, where he played the drums, badly, in a rock band (u18-y, u27-musique); loses his papers.
- **Anne**: Léa's mother, 47. Canadian, from Montréal, where her sister lives (u01-grammar, u14-travel). Doctor; blond. She met Paul at a rainy Paris bus stop when they were 20 (u16-pc-imparfait).
- **Jacques** (80) and **Louise** (78) (u03-numbers2): Paul's parents. They have a seaside house with a garden in Marseille (u15-holidays), were childhood neighbours and honeymooned in Paris 50 years ago (u18-y). Louise has her birthday in late October (u17-coi), the family's crêpe and chocolate-cake recipes and 300 books (she reads all the time, with glasses). She got her first mobile at Christmas (u20-phone). As a teenager, Jacques wrote her bad love letters (u23-life). Both are retired: Jacques worked for forty years for a Marseille soap company that exported all over the world, and Louise worked for thirty-five years in a bank. She wins at Monopoly (u28-economie).
- **Pierre**: Léa's uncle, 60, a farmer living in the countryside near Annecy (u03-numbers2, u13-jobs, u02-vocab, u12-nature). He retired on 27 June after forty-five years of work; his dream is to see the North Sea (u28-projets). A great DIY man: he brought the farm van for Hugo's move and taught everyone DIY the next day (u29-demenager, u29-bricolage). His farm has twenty cows, goats, a pig, hens, ducks, rabbits, a horse, a cat and a dog called **Max**; he sells organic milk (u25-animaux, u25-environnement). Father of **Jules** and **Chloé** (u02-articles). Chloé is a lawyer married to **Karim** (30), a restaurant cook who makes desserts (u02-possessives, u06-er); their twins, **Adam** (2.6 kg) and **Nina** (2.4 kg), were born in Lyon on 2 August, sixteen minutes apart (u23-life, u30-chiffres). They live in the Croix-Rousse (u30-gerondif). Chloé's colleague **Mme Leroy** pleaded Hugo's case (u30-justice). Karim's grandmother is a widow of 90 who still dances. Jules got engaged to **Manon** on Valentine's Day; their wedding is in September (u23-life). Both work in Annecy, but they are taking over the farm, to make organic cheese and sell it in a little shop there (u28-projets). Karim dreams of opening his own restaurant one day (u28-projets). Sophie once liked Jules (u02-possessives).
- **Antoine**: Léa's cousin in Montréal (u09-places), the son of Anne's sister (implied: he has her voice, u27-musique). Taxi driver who sings in a band at weekends (u13-jobs); drives fast. Arrived in Lyon in late May with his guitar (u26-subj-ind). He has a one-word part, as a taxi driver, in a Québec comedy that will be shown at the Festival Lumière in Lyon in October (u27-cinema). He writes the band's lyrics; their first album came out last year, and their song (an old Montréal tune with his new words) is a hit in Quebec. He plays several instruments, but not the drums (u27-musique, u27-dont-lequel).
- **Hugo's firm**: **Mme Dupont**, his demanding boss, who runs every Sunday (u13-cest-ilest, u17-connectors, u26-petits-mots); **Julien**, a funny colleague (u13-work); **Bernard**, the accountant who retired on the Friday after Léa started, in June (u13-work, u13-cest-ilest); interns **Sarah** (efficient) and **Malik** (u28-bureau). Its big new client is a chain of bakeries (u28-bureau).
- **Camille**: Tom's girlfriend since October (implied); has a cat (u17-character, u19-describing); loves Japanese food (u24-monde); her cat is black (u25-animaux). She gave Tom a book of English recipes in French for his birthday (u27-celui).
- **One-offs**: Mme Martin, who showed the flat (u04-rooms); Oscar, Tom's English friend (u11-liaison); an actor nicknamed "the croissant thief" (u18-appearance); Mathis, Sophie's schoolmate, whose grandmother is Moroccan (u23-heart, u24-monde); the unnamed owner of the café downstairs (u24-gouts); at the bike workshop, M. Fabre (a retired mechanic), Yanis (unemployed, learning the trade) and Amadou (from Senegal) (u26-societe); a woman at the cinema who asks Hugo for a photo (u27-cinema); the seller at a record shop (u27-celui); the seller at a bookshop in Vieux-Lyon, and a cartoonist who draws Hugo in a bin (u27-livres-art); a tomato seller at the market in Marseille (u28-economie); **Mme Fournier**, the baker who owns Tom's and Hugo's building and makes pizzas on Saturdays, an estate agent in a hurry, three students in a flatshare (u29-logement, u29-cond-passe); a plumber, a locksmith and an electrician (u29-problemes); the mayor, an opposition councillor and an MP who lives near the café (u30-politique); a judge and the advertising company's lawyer (u30-justice).

### Places

- **Lyon**:
  - Léa and Sophie's third-floor flat (u04-rooms, u04-ilya): living room with a balcony, big kitchen, two bedrooms, a shower but no bathtub.
  - It is above **le café d'en bas**, the friends' hangout where Sophie works, near place Bellecour (u09-places).
  - Also the Part-Dieu and Croix-Rousse districts.
  - Chloé and Karim's flat in the Croix-Rousse (u30-gerondif); the town hall, where the council saved the café's terrace (u30-politique); the Lyon court (u30-justice). The new cycle lane runs on the other side of the café's street, and the work ends before Christmas (u30-passif).
  - Tom's building, above Mme Fournier's bakery: Tom's flat and, across the third-floor landing, Hugo's since 25 July (45 m², bright, fitted kitchen, a cellar, no lift; €650 a month) (u29-logement, u29-demenager).
  - Culture: the Fresque des Lyonnais by the Saône, the Musée des Beaux-Arts on place des Terreaux, a little bookshop in Vieux-Lyon (u27-livres-art), and the Roman theatre of Fourvière, home of the summer festival *les Nuits de Fourvière* (u27-critiquer).
- **Paris**: the parents' home with its attic (u16-childhood), Sophie's parents, and Paul's old Montmartre flat. Antoine's band played in Montmartre at the Fête de la musique (u27-musique).
- **Marseille**: the grandparents' seaside house, with a beach and harbour nearby. The family gathers there in the holidays (u02-vocab).
- **Near Annecy**: Pierre's home in the countryside (u02-vocab, u12-nature).
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
  - Crêpes, Tom's first soup, a Sunday lunch at the grandparents' in Marseille, Sophie's party.
- **U7**: January sales; Inès on TV; Léa buys Hugo a €300 suit for his interview.
- **U8**: Hugo starts his office job; he finally has a mobile phone.
- **U9**: Antoine visits Lyon, gets lost, flies home.
- **U10**: Hugo's failed sporty phase.
- **U11**: winter call with Antoine; Tom's weather report (12 April); summer plans; dinner with Oscar.
- **U12**: a day at Pierre's; camping and a mountain hut in June.
- **U13**: careers fair; Léa's internship at Hugo's firm from 1 June.
- **U14**: on 1 July Léa, her parents and Lou fly to Montréal (1 p.m. flight from Paris) for six weeks; Hugo joins them on 5 August.
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
- **U21**:
  - 2 January: the big clean-up after the party (u21-chores). Hugo takes the bins out without falling in.
  - 3 January: a power cut at Léa and Sophie's (u21-objects). Hugo plugged the kettle, the toaster and the hair dryer into one socket; Tom, afraid of the dark, screams when he touches a coat hanger.
  - 4 January: Paul comes to Lyon and takes Lou home to Paris by train (u21-verbs). Hugo breaks her suitcase and fixes it with tape; Lou gives Léa a drawing of Minou with a broom.
  - 5 January: Mamie teaches Hugo her crêpes by video call on her new mobile (u21-manner).
  - 8 January: Sophie's first project at architecture school is an ideal house; the friends give their ideas at the café downstairs (u21-conditionnel).
  - 11 January: galette des rois at Léa and Sophie's. Hugo is suspected of swallowing the charm, but Minou finds it and wears the crown (u21-ment).
  - A Saturday in January: Tom buys bread at the bakery downstairs from his flat and notices the silent e's (u21-e-muet).
- **U22**:
  - 16 January: at the post office, Tom sends a baby jumper to his nephew in England by registered post; Hugo, overdrawn since Christmas, takes his savings out and pays Léa back (u22-bank-post).
  - 20–23 January: Hugo loses his wallet on the bus and applies for a new ID card at the town hall; Tom renews his residence permit at the prefecture; the wallet turns up three days later (u22-papers).
  - Late January: Carla enters a dance competition with Hugo as her partner (Tom refused, too shy); they come third, and everyone dances at Sophie's party, even Tom (u22-verbs).
  - 27 January: Sophie draws the place des Terreaux for school, and her drawing helps the police find a car parked on a pedestrian crossing (u22-city).
  - A rainy evening: the friends play a guessing game at Léa and Sophie's; Tom wins, so he does the washing-up (u22-qui-que).
  - 1 February: Sophie shows Inès and Carla the traboules of Vieux-Lyon, then they eat in a bouchon (u22-ou-ce-que).
- **U23**:
  - 2 February: Hugo makes crêpes for everyone for Candlemas, with Mamie's recipe (u23-traditions).
  - 14 February: at a romantic dinner at his flat, Tom tells Camille he loves her, in English and French. Léa, Sophie and Inès, all single, celebrate friendship at the café. Hugo gets an unsigned card with two dancers, guesses it's from Carla and asks her for a coffee; she says yes (u23-love). Jules and Manon get engaged the same day (u23-life).
  - Mardi gras, a few days later: costumes at Léa and Sophie's (Léa as a queen with Minou's crown, Camille as a cat, Tom in a black mask), Hugo's bugnes, the carnival parade; Tom learns the French holidays and Hugo dodges the 1 May race again (u23-traditions).
  - End of February, Saturday: Léa checks Hugo's things before the train to Marseille; he forgot the flowers for Mamie and ate half the bugnes (u23-pc-pronoms). On the train, Léa tells him Sophie's secret (u23-heart).
  - Sunday: family lunch at Jacques and Louise's. Chloé and Karim are expecting twins; Jules and Manon will marry in September; Pierre retires in June (u23-life). Packing in the evening: Paul's old teddy bear goes to the twins, and Hugo leaves with Paul's blue jumper (u23-toniques).
  - Monday and Tuesday: Hugo has told the café that Sophie likes Mathis; Léa and Sophie have their first real argument. Hugo carries Sophie's model to school without falling, Mathis asks her out, and Léa and Sophie make up (u23-heart).
- **U24** (March):
  - Early March: Sophie's first coffee with Mathis at the café downstairs. He is forty minutes late (his tram broke down) and brings macarons; Tom takes the food idioms literally (u24-expressions).
  - Early March, a Saturday: Hugo takes Carla out but hasn't booked, so they go to a bouchon in Vieux-Lyon. He is five euros short, and Carla pays for dessert (u24-restaurant).
  - The Monday after: in Marc's class, Tom reads his text about his first meal in Lyon, an andouillette; Carla tells the story of Saturday's dinner; Léa's text was under Minou (u24-pqp).
  - A Wednesday in March: blind tasting of the new menu at the café downstairs (u24-gouts).
  - The following Saturday: Hugo cooks for Carla, burns the chicken, and they make an omelette; Mamie stays on the video call (u24-aspect).
  - 21 March, the first day of spring: world dinner at Tom's, where everyone brings a dish (u24-monde).
- **U25** (April):
  - Early April, a Saturday: Sophie's school cleans up the banks of the Rhône; Hugo doesn't fall into a bin (u25-environnement).
  - The Easter holidays: Lou spends a week with Léa in Lyon, with Anne's long list of instructions (u25-subj-formes). Tom visits, and Lou teaches him to say *huit* (u25-semi-voyelles). Léa and Hugo take Lou to Pierre's farm for the animal game; Lou wants to keep a tortoise and call it Minou (u25-animaux).
  - A Monday in April: climate presentations in Marc's class by Inès, Carla, Tom and Léa (u25-climat).
  - Late April: the friends' green resolutions at the café, then the Saturday climate march; Hugo says yes to the race (u25-agir).
  - The next day, Sunday: Carla's training plan for Hugo; at six on Monday morning, she is waiting downstairs (u25-il-faut-que).
- **U26** (May):
  - 1 May: Hugo and Carla run the ten kilometres together and finish in an hour and a half; Léa, Sophie and Tom cheer (u26-subj-volonte).
  - Monday 4 May: Hugo is an hour late for work and explains everything to Mme Dupont (u26-petits-mots).
  - Early May: a class debate on banning cars from central Lyon; Carla convinces Inès (u26-avis).
  - A Sunday in May: Tom helps Sophie at the bike workshop in the Guillotière (u26-societe).
  - Late May: the friends plan July together, a week at the grandparents' in Marseille then a few days at Pierre's in the Alps; Hugo gets the sofa (u26-accord).
  - Late May, a Saturday: Antoine lands at Lyon airport with his guitar and wants to drive at once (u26-subj-ind).
- **U27** (June):
  - 31 May: in a record shop, the friends choose an Édith Piaf record for Tom's twenty-first birthday. On 1 June, at Tom's, Camille gives him a book of English recipes in French, Antoine gives him and Camille train tickets to Paris for the Fête de la musique, and Hugo's cake is burnt: "well done" (u27-celui).
  - Early June, a Wednesday: the Québec comedy in which Antoine plays a taxi driver comes out in France. Before the film, a recycling advert shows Hugo falling into the bin; a woman asks him for a photo (u27-cinema).
  - A Saturday in June: Sophie shows Antoine the artists' Lyon: the Fresque des Lyonnais (Saint-Exupéry, the Lumière brothers), a portrait exhibition at the Musée des Beaux-Arts, a bookshop in Vieux-Lyon. Léa buys Québécois poems for Mamie, Tom buys *Le Petit Prince*, and a cartoonist draws Hugo in a bin (u27-livres-art).
  - Mid-June: *Cyrano de Bergerac* at the Nuits de Fourvière. Tom and Carla cry, Inès is disappointed, Hugo sleeps and snores, and everyone agrees it was worth it (u27-critiquer).
  - 19 June, the last class of the year: Marc's culture quiz at the café downstairs. Both teams get three points, then both answer the last question: Hugo (u27-dont-lequel).
  - 21 June, the Fête de la musique: in Montmartre, Tom replaces the band's sick guitarist; Paul, Anne and Lou come; Hugo sings the chorus out of tune; Antoine gives Lou the band's album (u27-musique).
- **U28** (late June to early July):
  - Monday 22 June: Hugo arrives at work on time. Mme Dupont makes him project manager for a bakery chain's app, due on 3 July. He emails the director the wrong attachment, Mamie's crêpe recipe; the director makes the crêpes with his children and loves them (u28-bureau).
  - Tuesday 23 June, in the evening at the café downstairs: Carla looks for a summer job; the friends help with her CV and cover letter, and Hugo gives bad interview advice (u28-emploi).
  - Friday 26 June: Carla's interview with Mme Garnier at the dance centre. Hugo phones in the middle; she still gets the job, from 1 August (u28-infinitif).
  - Saturday 27 June: Pierre's retirement party at the farm. Jules and Manon announce they're taking it over; Chloé hopes to reach August with the twins (u28-projets).
  - Saturday 4 July: the six friends take the train to Marseille from Part-Dieu. Hugo arrives at the last minute without his ticket (Carla has it) and eats all the sandwiches (u28-tout-chaque).
  - Early July, in Marseille: Louise takes the friends to the market; Jacques reads the economy pages; in the evening, Hugo goes bankrupt at Monopoly and Louise wins (u28-economie).
- **U29** (July):
  - Monday 13 July, back in Lyon after a few days at the farm: Hugo finds his landlord's letter; he must leave by 1 August. Viewings with Léa: a dark studio, a flatshare that turns him down because he snores, and the flat next to Tom's above the bakery (u29-logement).
  - Wednesday 15 July, in the evening at the café downstairs: the friends argue *si tu prenais…*; Hugo signs the lease with Mme Fournier that night (u29-si-imparfait).
  - Saturday 25 July: moving day with Pierre and the farm van. The sofa gets stuck on the landing and scratches the floor; four trips (u29-demenager). In the evening: regrets among the boxes (Tom tripped on the console box and broke a mirror), then Mme Fournier's pizzas (u29-cond-passe).
  - Sunday 26 July: Pierre's DIY day; Sophie chooses light blue for the bedroom; Hugo drills through a pipe (u29-bricolage).
  - Sunday 26 to Saturday 1 August: the leak floods the bakery, then a broken water heater, a blocked basin, Hugo locked out (a €150 lock), a power cut (his old coffee machine), a cockroach, and the bakery oven every night at four. By Saturday, everything works (u29-problemes).
- **U30** (August):
  - Saturday 1 August: Hugo's housewarming. Carla started at the dance centre that morning; Tom reads a London daily; the TV news shows a train strike and a motorway accident. The Lyon paper's front page says the town hall wants to replace the café's terrace with a cycle lane; the owner confirms, and there's a row online. Paul phones: Chloé is at the maternity ward (u30-nouvelles).
  - Sunday 2 August: Adam (2:10 a.m., 2.6 kg) and Nina (2:26 a.m., 2.4 kg) are born. In the evening the whole family comes to the maternity ward: Hugo's figures, Léa's family poll, Jacques a great-grandfather, and Lou no longer the youngest (u30-chiffres).
  - Thursday 13 August: the town council votes on the cycle lane. Protesters outside; the friends bring a petition with 2,000 signatures; Sophie suggests the other side of the street, and the councillors agree, 30 votes to 2 (u30-politique).
  - Thursday 20 August: Hugo's trial against the advertising company. Chloé advised him in July; Mme Leroy pleads and Sophie is the witness. The company must pay €3,000 in damages and stop the advert; Hugo promises Chloé a year of nappies (u30-justice).
  - Monday 24 August: the paper at the café downstairs reports the saved terrace (the lane will be finished before Christmas), the trial (without Hugo's name) and Hugo's photo of the twins, "Deux nouveaux Lyonnais"; the owner offers the coffee (u30-passif).
  - Saturday 29 August: dinner at Chloé and Karim's in the Croix-Rousse with Hugo, Léa and Carla. Hugo changes Adam, who wees on his T-shirt, eats the last slice of Karim's strawberry tart, falls asleep on the tram and goes home with the twins' bag (u30-gerondif).

**Where the story stands:** Sunday 30 August (u30-gerondif). Chloé and Karim's twins, Adam and Nina, are four weeks old; the café's terrace is saved, and Hugo has won his case. Hugo lives next to Tom, above the bakery. Lou is with her parents in Paris, Sophie is at architecture school, Hugo is learning to cook and has paid Léa back. Open threads:
- Hugo and Carla are going out; Sophie and Mathis are seeing each other;
- Jules's wedding is in September; Jules and Manon are taking over the farm;
- the work on the cycle lane, to end before Christmas (u30-passif); Hugo promised Chloé and Karim a year of nappies, and went home with the twins' bag (u30-justice, u30-gerondif);
- Carla's dance job in August (u28-infinitif); Hugo's bakery app, due on 3 July (u28-bureau);
- Antoine's film at the Festival Lumière in Lyon in October (u27-cinema);
- Hugo's fame from the bin video (the cinema advert has stopped, u30-justice); Hugo still has Paul's blue jumper.

### Continuity facts

- **Family tree**:
  - Jacques and Louise are the parents of Paul (and of Pierre, implied). Chloé's twins, Adam and Nina, are their great-grandchildren (u23-life, u30-chiffres). Never state that Pierre is their son: at 60 in Unit 3, he would be older than their marriage.
  - Paul and Anne, married and living in Paris, are the parents of Hugo, Léa and Lou.
  - Pierre and an unnamed aunt are the parents of Jules and Chloé (Chloé is married to Karim).
- **Ages** were given in Unit 3, at least a year before Unit 20, so everyone is now about a year older (implied). Birthdays shown since: Tom (1 June; 21 in u27-celui), Lou (September, now 3), Louise (October), Sophie (30 December), Adam and Nina (2 August).
- **Jacques and Louise's wedding**: Louise says "fifty years ago" in u18-y, but Paul is now about 51, so the wedding was more than fifty years ago. Don't give its date or celebrate a golden wedding.
- **Hugo's things**:
  - He has a phone, a €200 console (u19-money) and Lou's passport holder (u14-participes). His bike is at Tom's.
  - He plays a little tennis, badly (u10-sports, u10-faire-jouer). He quit the sports club (u10-negation) and skipped his flu jab (u18-health).
  - He now likes camembert (u17-thinking) but still dislikes cooked carrots.
- **Léa** used to be often late (u08-routine) but isn't any more (u13-modaux).
- **Léa and Sophie's flat**: no dishwasher, so they wash up by hand (u21-chores, u21-conditionnel); the washing dries on the balcony; a kitchen drawer holds scissors, glue, tape and a torch with no batteries (u21-objects).
- **Hugo** carries a lighter (u21-objects) and is learning to cook: he can make Mamie's crêpes (u21-manner).
- **Tom** lives above a bakery; his neighbours want to practise their English with him (u21-e-muet). He drinks tea from an English kettle (u21-objects) and finds French tea weak (u24-expressions). His first meal in Lyon was an andouillette in a bouchon (u24-pqp). As a British citizen, he has a French residence permit (u22-papers). His nephew, his brother's baby, lives in England (u22-bank-post).
- **Hugo** was born in Paris; his passport expired two years ago (u22-papers). He now pays everything in cash, with no chequebook (u22-bank-post), and can dance a little (u22-verbs).
- **Inès** got lost in Vieux-Lyon on the rainy day she arrived in Lyon (u22-ou-ce-que). **Carla** loves dancing and came third in a Lyon dance competition (u22-verbs).
- **Loose ends**:
  - Hugo says "ma sœur joue du piano" (u10-faire-jouer) without saying which sister.
  - Anne's Christmas shoes (size 39) were left at the till (u19-shop).
