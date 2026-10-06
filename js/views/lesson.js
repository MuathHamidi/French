// Lesson pages: word list, grammar explanation and the clickable story.
import { h, inline } from '../util.js';
import { lessons, entries, displayForm, POS } from '../content.js';
import { renderText, sentenceBlock } from '../text.js';
import { attachWords, setCaseInfo } from '../wordcard.js';
import { speak, stop, speechGen } from '../audio.js';
import { plain } from '../content.js';
import { settings } from '../store.js';
import { renderQuiz } from '../quiz.js';

const TABS = {
  vocab: [['words', '1 · Words'], ['story', '2 · Story'], ['quiz', '3 · Quiz']],
  grammar: [['lesson', '1 · Lesson'], ['story', '2 · Story'], ['quiz', '3 · Quiz']],
};
TABS.sounds = TABS.grammar; // pronunciation lessons have the same three parts

export function renderLesson(view, id, tab) {
  const lesson = lessons.get(id);
  if (!lesson) { view.append(h('p', {}, 'Lesson not found. '), h('a', { href: '#/learn' }, 'Back to the course')); return; }
  const tabs = TABS[lesson.type];
  if (!tabs.some(([t]) => t === tab)) tab = tabs[0][0];
  const ids = new Set((lesson.words || []).map((w) => w.id));
  const opts = { prefer: ids, newIds: lesson.type === 'vocab' ? ids : new Set() };
  setCaseInfo(new Map((lesson.cases || []).map((c) => [c.id, c])));

  view.append(
    h('a', { href: '#/learn', class: 'small' }, '← Course'),
    h('h1', { style: 'margin-top:6px' }, lesson.title),
    h('p', { class: 'muted', style: 'margin:0' }, `Unit ${lesson.unit} · ${lesson.en}`),
    h('nav', { class: 'tabs' }, tabs.map(([t, label]) => h('a', { href: `#/lesson/${id}/${t}`, class: t === tab ? 'active' : '' }, label))),
  );

  const body = h('div', {});
  view.append(body);
  if (tab === 'words') renderWords(body, lesson, opts);
  else if (tab === 'lesson') renderGrammar(body, lesson, opts);
  else if (tab === 'story') renderStory(body, lesson, opts);
  else renderQuiz(body, lesson);
  attachWords(body);

  const i = tabs.findIndex(([t]) => t === tab);
  if (tabs[i + 1]) {
    view.append(h('a', { class: 'btn primary block', style: 'margin-top:16px', href: `#/lesson/${id}/${tabs[i + 1][0]}` }, `Next: ${tabs[i + 1][1].split('· ')[1]} →`));
  }
}

function speakBtn(text, slow = false) {
  return h('button', { class: 'icon-btn', title: slow ? 'Slowly' : 'Listen', 'aria-label': slow ? 'Listen slowly' : 'Listen', onclick: () => speak(text, { slow }) }, slow ? '🐢' : '🔊');
}

function renderWords(body, lesson, opts) {
  if (lesson.intro) body.append(h('p', {}, inline(lesson.intro)));
  body.append(h('p', { class: 'small muted' }, 'Tip: tap 🔊 and repeat each word out loud. Tap EN to check a translation only after you try to understand it.'));
  lesson.words.forEach((e, n) => {
    const defEn = e.def_en ? h('div', { class: 'small muted', hidden: true }, e.def_en) : null;
    body.append(h('article', { class: 'card', id: `w-${e.id}` },
      h('div', { class: 'entry-head' },
        h('span', { class: 'muted small' }, n + 1),
        h('span', { class: `entry-word ${e.g && !e.both ? 'g-' + e.g : ''}` }, displayForm(e)),
        e.g ? h('span', { class: `pill ${e.both ? '' : e.g}` }, e.both ? 'masc. / fem.' : e.g === 'm' ? 'masc.' : 'fem.') : null,
        h('span', { class: 'pill' }, POS[e.pos] || e.pos),
        h('span', { class: 'spacer' }),
        speakBtn(e.say || e.fr), speakBtn(e.say || e.fr, true)),
      e.ipa && settings().showIpa ? h('div', { class: 'ipa' }, `/${e.ipa}/`) : null,
      h('div', { class: 'entry-en' }, e.en),
      e.extra ? h('p', { class: 'small' }, inline(e.extra)) : null,
      h('div', { class: 'def' },
        h('div', { class: 'lbl' }, 'Définition'),
        h('div', { class: 'fr-text', style: 'font-size:1.05rem;line-height:1.7' }, renderText(e.def, opts)),
        defEn ? h('button', { class: 'reveal', onclick: () => { defEn.hidden = !defEn.hidden; } }, 'EN') : null, defEn),
      h('div', { class: 'lbl', style: 'font-size:.72rem;font-weight:700;color:var(--muted);text-transform:uppercase' }, 'Exemples'),
      h('ul', { class: 'ex-list' }, e.examples.map((x) => h('li', { class: 'ex' },
        h('div', { class: 'fr' }, sentenceBlock(x.fr, x.en, () => speak(plain(x.fr)), opts))))),
      e.note ? h('div', { class: 'note' }, inline(e.note)) : null,
    ));
  });
}

function renderGrammar(body, lesson, opts) {
  if (lesson.intro) body.append(h('div', { class: 'card' }, inline(lesson.intro)));
  for (const s of lesson.sections) {
    const card = h('section', { class: 'card' }, h('h2', {}, s.title));
    for (const p of s.text || []) card.append(h('p', {}, inline(p)));
    if (s.table) {
      const fr = new Set(s.table.frCols || [0]);
      card.append(h('div', { class: 'table-wrap' }, h('table', { class: 'gtable' },
        h('thead', {}, h('tr', {}, s.table.head.map((c) => h('th', {}, c)))),
        h('tbody', {}, s.table.rows.map((r) => h('tr', {}, r.map((c, i) => (fr.has(i)
          ? h('td', { class: 'fr' }, renderText(c, opts), ' ', h('button', { class: 'icon-btn sm', 'aria-label': 'Listen', onclick: () => speak(plain(c)) }, '🔊'))
          : h('td', {}, inline(c))))))))));
    }
    if (s.examples?.length) {
      card.append(h('ul', { class: 'ex-list' }, s.examples.map((x) => h('li', { class: 'ex' },
        h('div', { class: 'fr' }, sentenceBlock(x.fr, x.en, () => speak(plain(x.fr)), opts))))));
    }
    if (s.tip) card.append(h('div', { class: 'note' }, inline(s.tip)));
    body.append(card);
  }
  if (lesson.mistakes?.length) {
    body.append(h('section', { class: 'card' }, h('h2', {}, 'Common mistakes'),
      lesson.mistakes.map((m) => h('div', { class: 'mistake' },
        h('div', {}, h('span', { class: 'wrong' }, m.wrong), '  →  ', h('span', { class: 'right' }, m.right)),
        h('div', { class: 'small muted' }, inline(m.why))))));
  }
  body.append(h('section', { class: 'card' }, h('h2', {}, 'Everything this lesson covers'),
    h('p', { class: 'small muted' }, 'The story and the quiz use every one of these.'),
    h('div', { class: 'case-list' }, lesson.cases.map((c) => h('span', { class: 'pill' }, c.label)))));
}

function renderStory(body, lesson, opts) {
  const s = lesson.story;
  let showEn = false;
  const text = h('div', { class: `fr-text ${s.dialogue ? 'dialogue' : ''}` });
  const draw = () => {
    text.replaceChildren();
    let para = null;
    for (const line of s.lines) {
      const block = sentenceBlock(line.fr, line.en, () => speak(plain(line.fr)), { ...opts, showEn });
      if (s.dialogue) {
        text.append(h('p', { class: 'story-p' }, h('span', { class: 'speaker' }, line.sp || ''), h('span', {}, block)));
      } else {
        if (!para) { para = h('p', { class: 'story-p' }); text.append(para); }
        para.append(block, ' ');
        if (line.br) para = null;
      }
    }
  };
  draw();
  let reading = false;
  const readBtn = h('button', { class: 'btn' }, '▶ Read it all');
  readBtn.onclick = async () => {
    if (reading) { reading = false; stop(); readBtn.textContent = '▶ Read it all'; return; }
    reading = true;
    readBtn.textContent = '■ Stop';
    for (const line of s.lines) {
      if (!reading) break;
      const done = speak(plain(line.fr));
      const mine = speechGen();
      await done;
      if (speechGen() !== mine) break; // the learner clicked something else
    }
    reading = false;
    readBtn.textContent = '▶ Read it all';
  };
  const enBtn = h('button', { class: 'btn', onclick: () => { showEn = !showEn; enBtn.textContent = showEn ? 'Hide translations' : 'Show translations'; draw(); } }, 'Show translations');

  body.append(h('div', { class: 'card' },
    h('h2', { style: 'font-family:var(--serif)' }, s.title),
    h('p', { class: 'muted small' }, s.en),
    h('div', { class: 'row', style: 'margin-bottom:12px' }, readBtn, enBtn),
    lesson.type === 'grammar'
      ? h('p', { class: 'small muted' }, 'Highlighted parts use this lesson\'s grammar — point at or tap them to see the rule.')
      : h('p', { class: 'small muted' }, 'Underlined words are from this lesson. Point at or tap any word to see it; clicking reads it aloud.'),
    text));
}
