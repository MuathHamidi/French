// Builds quiz questions from lesson data.
// Vocabulary questions are generated from each word; grammar questions come from the lesson's "quiz" list.
import { displayForm, article, plain, lessonList } from './content.js';
import { shuffle } from './util.js';

const BLANK = '_____';

// The forms a card shows, one by one: « le serveur, la serveuse » → le serveur · la serveuse,
// « le / la médecin » → le médecin · la médecin, « chaud(e) » → chaud · chaude.
function shownForms(e) {
  if (!e.display) return [displayForm(e)];
  return e.display.split(', ').flatMap((part) => {
    const two = part.match(/^(\S+) \/ (\S+) (.+)$/);
    return two ? [`${two[1]} ${two[3]}`, `${two[2]} ${two[3]}`] : [part];
  }).flatMap((form) => {
    const ending = form.match(/^(.+)\((.+)\)$/);
    return ending ? [ending[1], ending[1] + ending[2]] : [form];
  });
}

const ARTICLE = /^(l'|(?:le|la|les|un|une|des) )?(.+)$/;
const withArticle = (art, word) => (art.endsWith("'") ? art + word : `${art} ${word}`);

// A noun is right alone, with un / une and with le / la / l', in each form its card shows. A second form is
// the other gender (l'infirmier, l'infirmière) unless its article says which; a noun used for a man or a
// woman (`both`) takes both. `accept` is then only needed for other words (docteur for médecin).
function nounAnswers(e, shown) {
  const out = [`${e.pl ? 'des' : e.g === 'f' ? 'une' : 'un'} ${e.fr}`];
  if (e.art === '') return out; // used without an article (lundi, janvier)
  const forms = shown.map((s) => s.match(ARTICLE)).map(([, art = '', word]) => ({ art: art.trim(), word }));
  const paired = forms.some((f) => f.word === e.fr);
  if (!paired) forms.unshift({ art: article(e), word: e.fr }); // the card shows a phrase: avoir envie de
  for (const { art, word } of forms) {
    const head = word === e.fr;
    if (!art && !head && !paired) continue; // the phrase itself takes no article
    out.push(word);
    if (art === 'les' || art === 'des') { out.push(`les ${word}`, `des ${word}`); continue; }
    const genders = head && e.both ? ['m', 'f']
      : art === 'le' || art === 'un' ? ['m'] : art === 'la' || art === 'une' ? ['f'] : [head ? e.g : e.g === 'f' ? 'm' : 'f'];
    for (const g of genders) {
      const the = art === "l'" ? art : art === 'le' || art === 'la' ? (g === 'f' ? 'la' : 'le')
        : article({ pos: 'noun', g, fr: word, hAsp: head && e.hAsp });
      out.push(`${g === 'f' ? 'une' : 'un'} ${word}`, withArticle(the, word));
    }
  }
  return out;
}

// Everything « Write it in French » takes for a word; the first one is shown as the answer.
export function acceptedFor(e) {
  const shown = shownForms(e);
  const list = [displayForm(e), e.fr, ...(e.accept || []), ...shown];
  if (e.pos === 'noun' && e.g) list.push(...nounAnswers(e, shown));
  return [...new Set(list)];
}

// Up to n distinct distractor values, preferring words of the same part of speech.
function distractors(e, pool, n, key) {
  const cands = shuffle(pool.filter((x) => x.id !== e.id && key(x)));
  cands.sort((a, b) => (b.pos === e.pos) - (a.pos === e.pos));
  const seen = new Set([key(e)]);
  const out = [];
  for (const x of cands) {
    const k = key(x);
    if (!seen.has(k)) { seen.add(k); out.push(k); }
    if (out.length === n) break;
  }
  return out;
}

// Words to draw wrong options from: this lesson first, then every other lesson.
export function poolFor(lesson) {
  const own = lesson?.words || [];
  const rest = lessonList().filter((l) => l !== lesson).flatMap((l) => l.words || []);
  return own.length >= 6 ? own : own.concat(rest);
}

function clozeExample(e) {
  return (e.examples || []).find((x) => /\*\*.+?\*\*/.test(x.fr));
}

// A definition that contains the word, or one of its forms, gives the answer away (« Comment ça va ? » in the
// definition of comment): such a word gets no definition question.
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function givesAway(e) {
  const lower = (s) => s.toLowerCase().replace(/’/g, "'");
  const words = [e.fr, ...(e.forms || [])].map((f) => escape(lower(f))).join('|');
  return new RegExp(`(^|[^\\p{L}\\p{N}-])(${words})(?![\\p{L}\\p{N}-])`, 'u').test(lower(plain(e.def)));
}

export function kindsFor(e) {
  const k = ['fr2en', 'listen', 'en2fr'];
  if (e.def && !givesAway(e)) k.push('def2fr');
  if (clozeExample(e)) k.push('cloze');
  // No un/une question for plural-only nouns, or for nouns used for a man or a woman (un / une journaliste).
  if (e.pos === 'noun' && e.g && e.art !== '' && !e.pl && !e.both) k.push('gender');
  return k;
}

export function wordQuestion(e, kind, pool) {
  const base = { cardId: `w:${e.id}`, wordId: e.id, say: e.say || e.fr, explain: `${displayForm(e)} — ${e.en}` };
  const mc = (label, prompt, answer, key, extra = {}) => ({
    ...base, kind, label, prompt, answers: [answer],
    options: shuffle([answer, ...distractors(e, pool, 3, key)]), ...extra,
  });
  switch (kind) {
    case 'fr2en': return mc('What does it mean?', displayForm(e), e.en, (x) => x.en, { promptFr: true, audio: true });
    case 'listen': return mc('Listen — which word is it?', '🔊', displayForm(e), displayForm, { audio: true, autoplay: true });
    case 'def2fr': return mc('Which word matches this definition?', e.def, displayForm(e), displayForm, { promptFr: true, rich: true });
    case 'gender': return {
      ...base, kind, label: 'Masculine or feminine?', prompt: `${BLANK} ${e.fr}`, promptFr: true,
      options: ['un', 'une'], answers: [e.g === 'f' ? 'une' : 'un'], hint: e.en,
    };
    case 'cloze': {
      const ex = clozeExample(e);
      const target = ex.fr.match(/\*\*(.+?)\*\*/)[1];
      // Every bold copy is hidden (tantôt… tantôt, brique par brique): one left in sight would give the answer.
      return {
        ...base, kind, label: 'Fill in the blank', prompt: ex.fr.replace(/\*\*.+?\*\*/g, BLANK), promptFr: true, rich: true,
        hint: ex.en, answers: [plain(target)], say: plain(ex.fr.replace(/\*\*/g, '')),
      };
    }
    default: return {
      ...base, kind: 'en2fr', label: 'Write it in French', prompt: e.en,
      hint: e.pos === 'noun' && e.g ? `noun, ${e.both ? 'masculine or feminine' : e.g === 'm' ? 'masculine' : 'feminine'}` : e.pos === 'expr' ? 'expression' : '',
      answers: acceptedFor(e),
    };
  }
}

// Every word gets one recognition question and one production question; nouns also get a gender question.
export function vocabQuiz(lesson) {
  const pool = poolFor(lesson);
  const recog = [], gender = [], prod = [];
  lesson.words.forEach((e, i) => {
    const kinds = kindsFor(e);
    const r = ['fr2en', 'listen', 'def2fr'][i % 3];
    recog.push(wordQuestion(e, kinds.includes(r) ? r : 'fr2en', pool));
    if (kinds.includes('gender')) gender.push(wordQuestion(e, 'gender', pool));
    prod.push(wordQuestion(e, i % 2 === 0 && kinds.includes('cloze') ? 'cloze' : 'en2fr', pool));
  });
  return [...shuffle(recog), ...shuffle(gender), ...shuffle(prod)];
}

export function grammarQuestion(lesson, item) {
  const answers = [].concat(item.answer);
  const fr = item.lang !== 'en'; // some prompts are English instructions, e.g. "Which sentence is correct?"
  return {
    cardId: `g:${lesson.id}:${item.case}`, kind: item.type === 'mc' ? 'mc' : 'type',
    label: item.label || (item.type === 'mc' ? 'Choose the right answer' : 'Type the missing word(s)'),
    prompt: item.q, promptFr: fr, rich: fr, hint: item.en,
    options: item.options ? shuffle(item.options) : null, answers,
    explain: item.why, audio: !!(item.listen || item.say), autoplay: !!item.listen,
    say: item.say || item.listen || (fr ? plain(item.q.replace(/_{3,}/, answers[0])) : answers[0]),
  };
}

export function grammarQuiz(lesson) {
  return shuffle(lesson.quiz.map((item) => grammarQuestion(lesson, item)));
}
