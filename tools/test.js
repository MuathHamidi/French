// Browser tests for the app (tools/test.html). Open http://localhost:8765/tools/test.html while
// `python tools/serve.py` runs, or tools/test.html on the online copy (also from a phone).
// The app runs in a frame as index.html?test, which keeps its own progress: the learner's is never touched.
//
// 1. Every page (Today, Course, Review, Words, Settings and each tab of each lesson) at phone width, and a
//    sample at computer width: no error, no raw markup, no "undefined" or "NaN", no broken link, nothing
//    wider than the screen.
// 2. Each feature once: quizzes (right, wrong, accents, "I don't know", keyboard), listening questions,
//    reviews over two days, word cards, stories read aloud, sound, the word list, settings and backups,
//    two tabs at once.
// 3. With ?full, every lesson's quiz is also completed.
// ?only=word cards,sound runs only the tests whose names contain one of those words.
// Sound is recorded instead of played, and the app's clock can be moved. Results show on the page and in
// window.testResults ({done, passed, failed, failures}).

const TEST_KEY = 'francais-app-test';
const params = new URLSearchParams(location.search);
const FULL = params.has('full');
const ONLY = (params.get('only') || '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);
const TABS = { vocab: ['words', 'story', 'quiz'], grammar: ['lesson', 'story', 'quiz'], sounds: ['lesson', 'story', 'quiz'] };
const PAGES = ['today', 'learn', 'review', 'words', 'settings'];
const DAY0 = new Date(2026, 10, 9, 10, 0).getTime(); // Monday 9 November 2026, 10:00
const at = (days, h, m = 0) => { const d = new Date(DAY0); d.setDate(d.getDate() + days); d.setHours(h, m, 0, 0); return d.getTime(); };

const frames = document.getElementById('frames');
const list = document.getElementById('results');
const statusEl = document.getElementById('status');
const results = [];
let frame, win, doc;
let lessons = []; // {id, type, unit, title, words: [ids], cases: [ids]} in course order

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(cond, what, ms = 15000) {
  const t0 = performance.now();
  for (;;) {
    const v = cond();
    if (v) return v;
    if (performance.now() - t0 > ms) throw new Error(`timed out waiting for ${what}`);
    await sleep(20);
  }
}

// ---------- the app in a frame ----------
function instrument(w) {
  w.testErrors = [];
  w.addEventListener('error', (e) => w.testErrors.push(e.message || String(e.error)));
  w.addEventListener('unhandledrejection', (e) => w.testErrors.push(`unhandled: ${e.reason?.message || e.reason}`));
  const error = w.console.error.bind(w.console);
  w.console.error = (...a) => { w.testErrors.push(a.join(' ')); error(...a); };
  // Sound: a file "loads" for loadMs, then "plays" for soundMs; what would be heard goes into w.heard.
  w.heard = [];
  w.audioTiming = { loadMs: 0, soundMs: 30, fail: false };
  const media = w.HTMLMediaElement.prototype;
  media.play = function () {
    const el = this, t = w.audioTiming;
    return new w.Promise((resolve, reject) => {
      el.testReject = reject;
      el.testStart = setTimeout(() => {
        if (t.fail) { reject(new w.DOMException('No such file', 'NotSupportedError')); return; }
        el.testPlaying = true;
        w.heard.push({ file: new URL(el.src).pathname.split('/').pop(), ...(el.playbackRate !== 1 ? { rate: el.playbackRate } : {}) });
        resolve();
        el.testEnd = setTimeout(() => { el.testPlaying = false; el.onended?.(); }, t.soundMs);
      }, t.loadMs);
    });
  };
  media.pause = function () {
    clearTimeout(this.testStart);
    clearTimeout(this.testEnd);
    if (!this.testPlaying) this.testReject?.(new w.DOMException('The play() request was interrupted by a call to pause().', 'AbortError'));
    this.testPlaying = false;
    this.onpause?.();
  };
  if (w.speechSynthesis) {
    w.speechSynthesis.speak = (u) => { w.heard.push({ voice: u.text }); setTimeout(() => u.onend?.(), w.audioTiming.soundMs); };
    w.speechSynthesis.cancel = () => {};
  }
  w.prompt = () => 'note from the test';
  w.confirm = () => true;
  if (w.navigator.clipboard) w.navigator.clipboard.writeText = async () => {};
}

async function attach(f = frame) {
  const w = f.contentWindow;
  instrument(w);
  await until(() => w.document.querySelector('#view h1'), 'the app to start');
  if (f === frame) { win = w; doc = w.document; }
  return w;
}

async function openFrame(hash) {
  const f = document.createElement('iframe');
  f.title = 'The app under test';
  const loaded = new Promise((r) => f.addEventListener('load', r, { once: true }));
  f.src = `../index.html?test${hash}`;
  frames.append(f);
  await loaded;
  return f;
}

// A fresh app (empty progress unless keep), at a width in CSS pixels.
async function loadApp({ hash = '#/today', width = 360, keep = false } = {}) {
  if (!keep) { localStorage.removeItem(TEST_KEY); localStorage.removeItem(`${TEST_KEY}-unreadable`); }
  frame?.remove();
  frame = await openFrame(hash);
  frame.style.width = `${width}px`;
  await attach();
  await until(() => win.innerWidth === width, `the app to be ${width} px wide (it is ${win.innerWidth} px)`, 3000);
}

// The app's own modules, imported inside the frame: the same instances the app uses.
function mod(name, w = win) {
  const key = `testModule_${name.replace(/\W/g, '_')}`;
  if (w[key]) return Promise.resolve(w[key]);
  return new Promise((resolve) => {
    w.addEventListener(key, () => resolve(w[key]), { once: true });
    const s = w.document.createElement('script');
    s.type = 'module';
    s.textContent = `import * as m from './js/${name}'; window.${key} = m; dispatchEvent(new Event('${key}'));`;
    w.document.head.append(s);
  });
}

// Moves the app's clock (Date.now and new Date()) to ms, from where it keeps running.
function setNow(ms, w = win) {
  const Real = w.testRealDate || (w.testRealDate = w.Date);
  const offset = ms - Real.now();
  w.Date = class extends Real {
    constructor(...a) { if (a.length) super(...a); else super(Real.now() + offset); }
    static now() { return Real.now() + offset; }
  };
}

// Opens a page of the app. Chrome ignores a page's address changes beyond 200 in 10 seconds
// (crbug.com/1038223), so they are spaced out.
let lastGo = 0;
async function go(hash) {
  const wait = lastGo + 55 - performance.now();
  if (wait > 0) await sleep(wait);
  lastGo = performance.now();
  let changed = false;
  win.addEventListener('hashchange', () => { changed = true; }, { once: true });
  if (win.location.hash === hash) win.dispatchEvent(new win.HashChangeEvent('hashchange'));
  else win.location.hash = hash;
  await until(() => changed, `the page ${hash} to open`, 5000);
  await sleep(0);
}

async function reloadDuring(action) {
  const loaded = new Promise((r) => frame.addEventListener('load', r, { once: true }));
  action();
  await loaded;
  await attach();
}

const findButton = (text, root = doc) => [...root.querySelectorAll('button, a')].find((b) => b.textContent.trim().startsWith(text));
function button(text, root = doc) {
  const el = findButton(text, root);
  if (!el) throw new Error(`no “${text}” button on ${win.location.hash}`);
  return el;
}
const viewText = () => doc.getElementById('view').textContent;
const popover = () => doc.getElementById('popover');
const toastText = () => doc.getElementById('toast').textContent;
const stats = () => [...doc.querySelectorAll('.stat b')].map((b) => Number(b.textContent)); // streak, words, due
const key = (k, target = doc.body) => target.dispatchEvent(new win.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
const mouse = (type, target) => target.dispatchEvent(new win.MouseEvent(type, { bubbles: true, cancelable: true }));
async function fileOf(text) { return (await mod('audio.js')).audioFile(text)?.split('/').pop() || null; }
const heard = () => JSON.stringify(win.heard);

// ---------- page checks ----------
const MARKUP = [
  [/\[[^\]\n]*\|[^\]\n]*\]/, 'raw [word|id] markup'], [/\{[^}\n]*\|[^}\n]*\}/, 'raw {text|case} markup'],
  [/\*\*/, 'raw ** markup'], [/\bundefined\b|\bNaN\b|\[object /, '“undefined”, “NaN” or “[object”'],
];
function badLink(href) {
  const [page, id, tab] = href.replace(/^#\/?/, '').split('/');
  if (PAGES.includes(page) && !id) return null;
  if (page === 'learn') return !tab && lessons.some((l) => String(l.unit) === id) ? null : 'no such unit';
  if (page !== 'lesson') return 'no such page';
  const l = lessons.find((x) => x.id === id);
  if (!l) return 'no such lesson';
  return !tab || TABS[l.type].includes(tab) ? null : `no ${tab} tab in a ${l.type} lesson`;
}
function pageProblems() {
  const out = [];
  const view = doc.getElementById('view');
  if (!view.children.length) out.push('empty page');
  const text = view.textContent;
  for (const [re, what] of MARKUP) { const m = text.match(re); if (m) out.push(`${what}: “${m[0].slice(0, 60)}”`); }
  for (const a of view.querySelectorAll('a[href^="#"]')) {
    const bad = badLink(a.getAttribute('href'));
    if (bad) out.push(`link ${a.getAttribute('href')}: ${bad}`);
  }
  const root = doc.documentElement;
  if (root.scrollWidth > root.clientWidth + 1) {
    const wide = [...view.querySelectorAll('*')].find((el) => el.getBoundingClientRect().right > root.clientWidth + 1
      && !el.closest('.table-wrap, .tabs'));
    out.push(`${root.scrollWidth - root.clientWidth}px wider than the screen${wide ? `: <${wide.tagName.toLowerCase()} class="${wide.className}"> “${wide.textContent.slice(0, 40)}”` : ''}`);
  }
  out.push(...win.testErrors.splice(0).map((e) => `error: ${e}`));
  return out;
}

// ---------- quizzes ----------
const strip = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const questionCard = () => doc.querySelector('#view .quiz-top + .card');

function answer(card, q, how) {
  if (q.options) {
    const opts = [...card.querySelectorAll('.option')];
    const right = opts.find((b) => q.answers.includes(b.dataset.v));
    const wrong = opts.find((b) => !q.answers.includes(b.dataset.v));
    if (!right) throw new Error(`no right option for “${q.prompt}”`);
    if (how === 'keys') key(String(opts.indexOf(right) + 1));
    else (how === 'wrong' ? wrong : right).click();
    return;
  }
  if (how === 'dontknow') { button("I don't know", card).click(); return; }
  const input = card.querySelector('input.answer-input');
  input.value = how === 'wrong' ? 'zzz' : how === 'accent' ? strip(q.answers[0]) : q.answers[0];
  if (how === 'keys') key('Enter', input);
  else card.querySelector('.check').click();
}

// Answers until the quiz ends. policy(question, isRetry, n) says how: right, wrong, accent, dontknow or keys.
// onQuestion(question, card) runs first; it can return 'stop', or 'answered' when it answered itself.
async function runQuiz(policy = () => 'right', onQuestion = null) {
  const log = [];
  for (let n = 0; n < 3000; n++) {
    const card = questionCard();
    if (!card) return log;
    const q = card.quizItem;
    if (!q) throw new Error('a question card without its question');
    const act = onQuestion ? await onQuestion(q, card) : null;
    if (act === 'stop') return log;
    const retry = card.querySelector('.q-kind').textContent.startsWith('Try again');
    const how = act === 'answered' ? 'right' : policy(q, retry, n);
    if (act !== 'answered') answer(card, q, how);
    const fb = card.querySelector('.feedback');
    if (!fb) throw new Error(`no feedback after answering “${q.prompt}” (${how})`);
    log.push({ q, how, retry, result: fb.classList.contains('ok') ? 'ok' : fb.classList.contains('almost') ? 'accent' : 'no', text: fb.textContent });
    if (how === 'keys') key('Enter');
    else [...card.querySelectorAll('button')].find((b) => /^(Continue|Finish)/.test(b.textContent)).click();
    await sleep(0);
  }
  throw new Error('the quiz never ended');
}
async function startQuiz(l) {
  await go(`#/lesson/${l.id}/quiz`);
  button('Start the quiz').click();
  await sleep(0);
}
async function passLesson(l, policy) { await startQuiz(l); return runQuiz(policy); }

// ---------- running and reporting ----------
async function scenario(name, fn) {
  if (ONLY.length && !ONLY.some((w) => name.toLowerCase().includes(w))) return;
  statusEl.textContent = `Running: ${name}…`;
  const problems = [];
  const expect = (cond, msg) => { if (!cond) problems.push(msg); };
  const t0 = performance.now();
  try { await fn(expect, problems); } catch (err) { problems.push(`stopped: ${err.message}`); }
  if (win?.testErrors?.length) problems.push(...win.testErrors.splice(0).map((e) => `error: ${e}`));
  results.push({ name, problems });
  const li = document.createElement('li');
  li.className = problems.length ? 'fail' : 'pass';
  li.textContent = `${problems.length ? 'FAIL' : 'PASS'}  ${name}  (${((performance.now() - t0) / 1000).toFixed(1)} s)`;
  if (problems.length) {
    const ul = document.createElement('ul');
    for (const p of [...problems.slice(0, 40), ...(problems.length > 40 ? [`… and ${problems.length - 40} more`] : [])]) {
      const x = document.createElement('li');
      x.textContent = p;
      ul.append(x);
    }
    li.append(ul);
  }
  list.append(li);
}

// ---------- the tests ----------
async function main() {
  await loadApp();
  const content = await mod('content.js');
  lessons = content.lessonList().map((l) => ({
    id: l.id, type: l.type, unit: l.unit, title: l.title, words: (l.words || []).map((w) => w.id),
    cases: [...new Set((l.quiz || []).map((q) => q.case))],
  }));
  const vocab = lessons.filter((l) => l.type === 'vocab');
  const [V1, V2, V3, V4] = vocab;
  const G1 = lessons.find((l) => l.type === 'grammar');
  const S1 = lessons.find((l) => l.type === 'sounds');
  const pageList = [...PAGES.map((p) => `#/${p}`), ...lessons.flatMap((l) => TABS[l.type].map((t) => `#/lesson/${l.id}/${t}`))];

  await scenario(`Every page at phone width (${pageList.length} pages, 360 px)`, async (expect, problems) => {
    await loadApp({ width: 360 });
    for (const p of pageList) {
      await go(p);
      for (const x of pageProblems()) problems.push(`${p}: ${x}`);
    }
  });

  await scenario('A sample of pages at computer width (1100 px)', async (expect, problems) => {
    await loadApp({ width: 1100 });
    const units = new Set([1, 20, 21, 40, 41, 60]);
    const sample = pageList.filter((p) => !p.startsWith('#/lesson/') || units.has(lessons.find((l) => p.includes(`/${l.id}/`))?.unit));
    for (const p of sample) {
      await go(p);
      for (const x of pageProblems()) problems.push(`${p}: ${x}`);
    }
  });

  await scenario('A new learner: Today and the course', async (expect) => {
    await loadApp();
    expect(stats().join() === '0,0,0', `Today shows ${stats()} (streak, words, due), expected 0,0,0`);
    expect(viewText().includes('0 / 30'), "today's goal is not 0 / 30");
    expect(button(`▶ Next: ${lessons[0].title}`).getAttribute('href').includes(lessons[0].id), 'the next-lesson button does not open the first lesson');
    await go('#/learn');
    expect(doc.querySelectorAll('.lesson-link').length === lessons.length, `the course lists ${doc.querySelectorAll('.lesson-link').length} lessons, expected ${lessons.length}`);
    expect(!doc.querySelector('.lesson-link .pill.done'), 'a lesson is marked done');
    expect(doc.querySelector('.unit.current .unit-num')?.textContent === String(lessons[0].unit) && win.scrollY === 0,
      'the course does not open at the top, with the first unit marked as in progress');
    const last = lessons.at(-1);
    await go(`#/lesson/${last.id}/${TABS[last.type][0]}`);
    expect(button('← Course').getAttribute('href') === `#/learn/${last.unit}`, '“← Course” does not lead to the lesson’s unit');
    await go(`#/learn/${last.unit}`);
    const box = [...doc.querySelectorAll('.unit')].find((u) => u.querySelector('.unit-num').textContent === String(last.unit));
    const below = box.getBoundingClientRect().top - doc.querySelector('.topbar').offsetHeight;
    expect(below >= 0 && below <= 20, `the course opens with unit ${last.unit} ${Math.round(below)} px below the top bar`);
    await go('#/review');
    expect(viewText().includes('Finish a lesson quiz'), 'the empty review page does not explain what to do');
  });

  await scenario(`Vocabulary quiz, all right (${V1.id})`, async (expect) => {
    await loadApp();
    setNow(DAY0);
    const log = await passLesson(V1);
    expect(log.length && log.every((x) => x.result === 'ok'), 'a right answer was not accepted');
    expect(viewText().includes('100%') && viewText().includes('Lesson complete!'), `summary: ${viewText().slice(0, 120)}`);
    const S = await mod('store.js');
    expect(S.lessonState(V1.id)?.done && S.lessonState(V1.id)?.best === 100, 'the lesson is not saved as done with 100%');
    const missing = V1.words.filter((id) => S.getCard(`w:${id}`)?.due !== at(1, 0));
    expect(!missing.length, `cards not due tomorrow at midnight: ${missing.join(', ')}`);
    const next = lessons.find((l) => l.id !== V1.id);
    expect(button(`Next lesson: ${next.title}`).getAttribute('href').includes(next.id), 'the next-lesson link is wrong');
    await go('#/today');
    expect(stats().join() === `1,${V1.words.length},0`, `Today shows ${stats()}, expected 1,${V1.words.length},0`);
    expect(viewText().includes(`${V1.words.length} / 30`), "today's new words are not counted");
  });

  await scenario('Vocabulary quiz with mistakes: retries, a failed quiz, a retake', async (expect) => {
    await loadApp();
    setNow(DAY0);
    const log = await passLesson(V1, (q, retry, n) => (!retry && n % 3 === 0 ? 'wrong' : 'right'));
    expect(log.some((x) => x.retry), 'missed questions did not come back');
    expect(log.filter((x) => x.retry).every((x) => x.result === 'ok'), 'a retried question was answered right but not accepted');
    expect(viewText().includes('Almost — you need 80%'), `summary: ${viewText().slice(0, 120)}`);
    expect(viewText().includes('To practise'), 'the missed words are not listed');
    const S = await mod('store.js');
    expect(!S.lessonState(V1.id) && !Object.keys(S.allCards()).length, 'a failed quiz saved progress');
    button('Retake the quiz').click();
    await sleep(0);
    expect(questionCard()?.quizItem, 'the retake did not start');
  });

  await scenario('Typed answers: accents, “I don’t know” and the keyboard', async (expect) => {
    const content = await mod('content.js');
    const l = vocab.find((x) => content.lessons.get(x.id).words.some((w) => /[àâçéèêëîïôûùüÿœ]/i.test(w.fr))) || V1;
    await loadApp();
    setNow(DAY0);
    let accent = false, dontknow = false;
    // an answer whose accents matter (s'il vous plait, without its circumflex, is also accepted)
    const accentMatters = (q) => strip(q.answers[0]) !== q.answers[0]
      && !q.answers.some((a) => a.toLowerCase() === strip(q.answers[0]).toLowerCase());
    const log = await passLesson(l, (q) => {
      if (!q.options && !accent && accentMatters(q)) { accent = true; return 'accent'; }
      if (!q.options && accent && !dontknow) { dontknow = true; return 'dontknow'; }
      return 'keys';
    });
    const a = log.find((x) => x.how === 'accent');
    expect(a?.result === 'accent' && a.text.includes('check the accents'), `an answer without its accents gave: ${a?.text || 'no such question'}`);
    expect(log.find((x) => x.how === 'dontknow')?.result === 'no', '“I don’t know” was not counted as wrong');
    const keys = log.filter((x) => x.how === 'keys' && !x.retry);
    expect(keys.length && keys.every((x) => x.result === 'ok'), 'answering with the number keys or Enter failed');
  });

  await scenario('Listening questions: the sound plays once, and never after moving on', async (expect) => {
    await loadApp();
    setNow(DAY0);
    await startQuiz(V1);
    let checked = 0;
    await runQuiz(() => 'right', async (q, card) => {
      if (!q.autoplay) return null;
      const k = checked++;
      const want = JSON.stringify([{ file: await fileOf(q.say) }]);
      win.heard.length = 0;
      if (k === 0) { // left alone: heard once, 250 ms after it appears
        await sleep(450);
        expect(heard() === want, `heard ${heard()}, expected ${want}`);
        return null;
      }
      if (k === 1) { // answered at once: heard once (the answer), not again from the autoplay
        answer(card, q, 'right');
        await sleep(450);
        expect(heard() === want, `answered at once: heard ${heard()}, expected ${want}`);
        return 'answered';
      }
      await go('#/today'); // the learner leaves at once: nothing heard
      await sleep(450);
      expect(win.heard.length === 0, `after leaving the page: heard ${heard()}`);
      return 'stop';
    });
    expect(checked >= 3, 'the quiz had too few listening questions to test');
  });

  await scenario(`Grammar and sounds quizzes (${[G1, S1].filter(Boolean).map((l) => l.id).join(', ')})`, async (expect) => {
    await loadApp();
    setNow(DAY0);
    for (const l of [G1, S1].filter(Boolean)) {
      const log = await passLesson(l);
      expect(log.length && log.every((x) => x.result === 'ok'), `${l.id}: a right answer was not accepted`);
      expect(viewText().includes('100%'), `${l.id}: summary ${viewText().slice(0, 100)}`);
      const S = await mod('store.js');
      const missing = l.cases.filter((c) => !S.getCard(`g:${l.id}:${c}`));
      expect(!missing.length, `${l.id}: no review card for ${missing.join(', ')}`);
    }
  });

  await scenario('Reviews over two days, the 60-card session and the streak', async (expect) => {
    await loadApp();
    setNow(DAY0);
    const learned = [V1, V2, V3, V4];
    let n = 0;
    for (const l of learned) { await passLesson(l); n += l.words.length; if (n > 60) break; }
    setNow(at(1, 8, 0));
    await go('#/today');
    expect(stats().join() === `1,${n},${n}`, `the next morning Today shows ${stats()}, expected 1,${n},${n}`);
    await go('#/review');
    expect(viewText().includes(`${n} cards are due. This session covers 60.`), `review page: ${viewText().slice(0, 100)}`);
    button('Start reviewing').click();
    const first = await runQuiz((q, retry, i) => (i === 0 ? 'wrong' : 'right'));
    expect(first.filter((x) => !x.retry).length === 60, `the session asked ${first.filter((x) => !x.retry).length} questions, expected 60`);
    expect(viewText().includes('59 / 60 right first time') && viewText().includes(`${n - 60} card`), `summary: ${viewText().slice(0, 140)}`);
    button('Keep reviewing').click();
    (await until(() => findButton('Start reviewing'), 'the next session')).click();
    await runQuiz();
    expect(viewText().includes('The 1 card you missed will come back in about 10 minutes.'), `summary: ${viewText().slice(0, 140)}`);
    await go('#/today');
    expect(stats()[0] === 2 && stats()[2] === 0, `Today shows ${stats()}, expected a 2-day streak and nothing due`);
    setNow(at(1, 8, 12));
    await go('#/today');
    expect(stats()[2] === 1, `12 minutes later Today shows ${stats()[2]} due, expected the missed card`);
    await go('#/review');
    button('Start reviewing').click();
    await runQuiz();
    expect(viewText().includes('All caught up for now.'), `summary: ${viewText().slice(0, 140)}`);
    await go('#/review');
    expect(viewText().includes('Nothing to review right now.') && viewText().includes('Next review'), `review page: ${viewText().slice(0, 140)}`);
  });

  await scenario('A review just before midnight: tomorrow’s cards are not “missed”', async (expect) => {
    await loadApp();
    setNow(DAY0);
    await passLesson(V1);
    setNow(at(1, 23, 40));
    await passLesson(V2); // its cards fall due at midnight, 20 minutes from now
    setNow(at(1, 23, 45));
    await go('#/review');
    button('Start reviewing').click();
    await runQuiz();
    expect(viewText().includes('All caught up for now.'), `summary: ${viewText().slice(0, 140)}`);
  });

  await scenario('A card whose word has left the course does not block the reviews', async (expect) => {
    // progress from an older course, with a word and a grammar case that no longer exist
    const card = { due: 0, ivl: 1, ease: 2.5, reps: 1, lapses: 0, last: 0 };
    const cards = { [`w:${V1.words[0]}`]: card, 'w:no-such-word': card, 'g:no-such-lesson:no-such-case': card };
    localStorage.setItem(TEST_KEY, JSON.stringify({ v: 1, cards, lessons: {}, log: {} }));
    await loadApp({ keep: true });
    expect(stats()[1] === 1 && stats()[2] === 1, `Today shows ${stats()} (streak, words, due), expected 1 word and 1 review due`);
    await go('#/review');
    expect(viewText().includes('1 card is due.'), `review page: ${viewText().slice(0, 100)}`);
    button('Start reviewing').click();
    await runQuiz();
    expect(viewText().includes('All caught up for now.'), `summary: ${viewText().slice(0, 140)}`);
    await go('#/review');
    expect(viewText().includes('Nothing to review right now.'), `review page afterwards: ${viewText().slice(0, 100)}`);
  });

  await scenario('Word cards: hover, click, keyboard, report a problem', async (expect) => {
    await loadApp();
    await go(`#/lesson/${V1.id}/story`);
    const w = doc.querySelector('#view .fr-text .w[data-id]');
    if (win.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      mouse('mouseover', w);
      await sleep(250);
      expect(!popover().hidden, 'hovering a word did not show its card');
      mouse('mouseout', w);
      await sleep(350);
      expect(popover().hidden, 'the card stayed after the pointer left');
    }
    win.heard.length = 0;
    w.click();
    await sleep(80);
    expect(!popover().hidden, 'clicking a word did not show its card');
    expect(heard() === JSON.stringify([{ file: await fileOf(w.dataset.text) }]), `clicking “${w.dataset.text}” played ${heard()}`);
    const entry = (await mod('content.js')).entries.get(w.dataset.id);
    expect(popover().querySelector('.entry-word')?.textContent && popover().textContent.includes(entry.en), 'the card does not show the word and its meaning');
    const from = [...popover().querySelectorAll('a')].find((a) => a.textContent.startsWith('From:'));
    expect(!from || !badLink(from.getAttribute('href')), `the card links to ${from?.getAttribute('href')}`);
    doc.querySelector('#view h1').click();
    expect(popover().hidden, 'clicking outside did not close the card');
    w.click();
    key('Escape', doc);
    expect(popover().hidden, 'Escape did not close the card');
    w.click();
    button('⚑ Report a problem', popover()).click();
    expect(toastText().includes('Reported problems'), `reporting gave: ${toastText()}`);
    const flags = (await mod('store.js')).flags();
    expect(flags.length === 1 && flags[0].word === w.dataset.id && flags[0].note === 'note from the test', `saved report: ${JSON.stringify(flags)}`);
    await go('#/learn');
    expect(popover().hidden, 'the card stayed open on another page');
  });

  await scenario('Stories: translations, “Read it all”, Stop, leaving the page', async (expect) => {
    await loadApp();
    await go(`#/lesson/${V1.id}/story`);
    const content = await mod('content.js');
    const lines = content.lessons.get(V1.id).story.lines;
    const sent = doc.querySelector('#view .sent');
    sent.querySelector('.reveal').click();
    expect(!sent.querySelector('.sent-en').hidden, 'EN did not show the translation');
    button('Show translations').click();
    expect([...doc.querySelectorAll('#view .sent-en')].every((e) => !e.hidden), 'not every translation is shown');
    button('Hide translations').click();
    expect([...doc.querySelectorAll('#view .sent-en')].every((e) => e.hidden), 'translations still shown');
    win.heard.length = 0;
    button('▶ Read it all').click();
    await until(() => findButton('▶ Read it all'), 'the reading to end', 30000);
    await sleep(100);
    const want = await Promise.all(lines.map((x) => fileOf(content.plain(x.fr))));
    expect(heard() === JSON.stringify(want.map((file) => ({ file }))), `read aloud ${win.heard.length} of ${lines.length} lines, or out of order`);
    win.audioTiming.soundMs = 150;
    win.heard.length = 0;
    button('▶ Read it all').click();
    await sleep(250);
    button('■ Stop').click();
    let k = win.heard.length;
    await sleep(500);
    expect(win.heard.length === k && button('▶ Read it all'), 'reading went on after Stop');
    button('▶ Read it all').click();
    await sleep(250);
    await go('#/today');
    k = win.heard.length;
    await sleep(500);
    expect(win.heard.length === k, `reading went on after leaving the page (${win.heard.length - k} more lines)`);
  });

  await scenario('Sound: a second sound before the first starts, missing files, slow mode', async (expect) => {
    await loadApp();
    const audio = await mod('audio.js');
    const content = await mod('content.js');
    const [t1, t2] = V1.words.slice(0, 2).map((id) => { const e = content.entries.get(id); return e.say || e.fr; });
    const [f1, f2] = [await fileOf(t1), await fileOf(t2)];
    expect(f1 && f2, `no recording for ${t1} or ${t2}`);
    win.audioTiming.loadMs = 200;
    win.heard.length = 0;
    audio.speak(t1);
    audio.speak(t2);
    await sleep(600);
    expect(heard() === JSON.stringify([{ file: f2 }]), `two quick sounds: heard ${heard()}, expected only ${t2}`);
    win.audioTiming.loadMs = 0;
    win.audioTiming.fail = true;
    win.heard.length = 0;
    audio.speak(t1);
    await sleep(150);
    expect(heard() === JSON.stringify([{ voice: t1 }]), `a broken file: heard ${heard()}, expected the device voice`);
    win.audioTiming.fail = false;
    win.heard.length = 0;
    audio.speak('zzz qqq');
    await sleep(150);
    expect(heard() === JSON.stringify([{ voice: 'zzz qqq' }]), `a text without a recording: heard ${heard()}`);
    win.heard.length = 0;
    audio.speak(t1, { slow: true });
    await sleep(150);
    expect(heard() === JSON.stringify([{ file: f1, rate: 0.75 }]), `slow mode: heard ${heard()}`);
  });

  await scenario('The word list: search, learned words, cards, keyboard', async (expect) => {
    await loadApp();
    setNow(DAY0);
    await passLesson(V1);
    await go('#/words');
    const rows = () => [...doc.querySelectorAll('#view .word-row')];
    const total = Number(doc.querySelector('#view .row .small').textContent.split(' ')[0]);
    expect(rows().length === Math.min(200, total) && (total <= 200 || button(`Show all ${total} words`)), 'the first 200 words and a “Show all” button');
    if (total > 200) { button(`Show all ${total} words`).click(); expect(rows().length === total, `Show all gave ${rows().length} of ${total}`); }
    const search = doc.querySelector('#view input.search');
    const find = (q) => { search.value = q; search.dispatchEvent(new win.Event('input')); return rows().map((r) => r.querySelector('.fr').textContent + ' = ' + r.querySelector('.en').textContent); };
    const content = await mod('content.js');
    const ws = content.lessons.get(V1.id).words.slice().sort((a, b) => b.fr.length - a.fr.length);
    const e = ws.find((w) => /[éèêàç]/.test(w.fr)) || ws[0]; // a long word, with accents if there is one
    expect(find(strip(e.fr)).some((r) => r.includes(e.fr)), `searching “${strip(e.fr)}” does not find ${e.fr}`);
    expect(find(e.en).some((r) => r.includes(e.fr)), `searching “${e.en}” does not find ${e.fr}`);
    expect(find('zzzqqq').length === 0 && viewText().includes('0 words'), 'a search with no match');
    find('');
    button('Show: all words').click();
    expect(rows().length === V1.words.length && rows().every((r) => r.querySelector('.pill.done')), `learned only: ${rows().length} rows, expected ${V1.words.length}`);
    rows()[1].click();
    expect(!popover().hidden, 'clicking a row did not open its card');
    doc.querySelector('#view h1').click();
    expect(popover().hidden, 'clicking outside did not close the card');
    key('Enter', rows()[2]);
    expect(!popover().hidden, 'Enter on a row did not open its card');
    key('Escape', doc);
    win.heard.length = 0;
    rows()[3].querySelector('button').click();
    await sleep(80);
    expect(win.heard.length === 1 && popover().hidden, `the row's 🔊: heard ${heard()}, card ${popover().hidden ? 'closed' : 'opened'}`);
  });

  await scenario('Settings: goal, speed, IPA, theme, voice test, backups, reports, reset', async (expect) => {
    await loadApp({ hash: '#/settings' });
    const S = await mod('store.js');
    const perDay = doc.querySelector('#view input[type=number]');
    for (const [v, want] of [['3', 5], ['200', 100], ['', 30], ['45', 45]]) {
      perDay.value = v;
      perDay.dispatchEvent(new win.Event('change'));
      expect(S.settings().newPerDay === want, `goal ${JSON.stringify(v)} saved as ${S.settings().newPerDay}, expected ${want}`);
    }
    const rate = doc.querySelector('#view input[type=range]');
    rate.value = '1.1';
    rate.dispatchEvent(new win.Event('input'));
    expect(S.settings().rate === 1.1 && viewText().includes('1.1×'), 'speed not saved or not shown');
    doc.getElementById('ipa').click();
    expect(S.settings().showIpa === false, 'IPA setting not saved');
    await go(`#/lesson/${V1.id}/words`);
    expect(!doc.querySelector('#view .ipa'), 'IPA still shown when turned off');
    await go('#/settings');
    doc.getElementById('ipa').click();
    await go(`#/lesson/${V1.id}/words`);
    expect(doc.querySelector('#view .ipa'), 'IPA not shown when turned on');
    await go('#/settings');
    const theme = [...doc.querySelectorAll('#view select')].find((s) => [...s.options].some((o) => o.value === 'dark'));
    for (const t of ['dark', 'light', 'auto']) {
      theme.value = t;
      theme.dispatchEvent(new win.Event('change'));
      expect((doc.documentElement.dataset.theme || 'auto') === t, `theme ${t} gave ${doc.documentElement.dataset.theme}`);
    }
    win.heard.length = 0;
    button('🔊 Test the voice').click();
    await sleep(80);
    expect(win.heard.length === 1, `the voice test played ${heard()}`);

    // backup: download, then load a changed copy (theme dark, an extra card)
    let href = null;
    const A = win.HTMLAnchorElement.prototype, click = A.click;
    A.click = function () { if (this.hasAttribute('download')) href = this.href; else click.call(this); };
    button('⬇ Download progress').click();
    A.click = click;
    expect(href, 'no file was offered');
    const backup = JSON.parse(await (await win.fetch(href)).text());
    expect(backup.settings?.newPerDay === 45 && backup.cards && backup.lessons, 'the backup does not hold the progress');
    backup.settings.theme = 'dark';
    backup.cards['w:from-backup'] = { due: 0, ivl: 1, ease: 2.5, reps: 1, lapses: 0, last: 0 };
    const load = async (text) => {
      const input = doc.querySelector('#view input[type=file]');
      const dt = new win.DataTransfer();
      dt.items.add(new win.File([text], 'backup.json', { type: 'application/json' }));
      input.files = dt.files;
      input.dispatchEvent(new win.Event('change'));
      await sleep(150);
    };
    await load('{"not": "a backup"}');
    expect(toastText() === 'That file is not a progress backup.' && !S.getCard('w:from-backup'), `a wrong file: ${toastText()}`);
    await load(JSON.stringify(backup));
    expect(toastText() === 'Progress restored.' && S.getCard('w:from-backup') && win.location.hash === '#/today', `loading the backup: ${toastText()}`);
    expect(doc.documentElement.dataset.theme === 'dark', 'the restored theme was not applied');

    // reports: one from a word card, then copy and clear
    await go(`#/lesson/${V1.id}/story`);
    doc.querySelector('#view .fr-text .w[data-id]').click();
    button('⚑ Report a problem', popover()).click();
    await go('#/settings');
    expect(viewText().includes('note from the test'), 'the report is not listed');
    button('Copy list').click();
    await sleep(50);
    expect(toastText() === 'Copied.', `copy: ${toastText()}`);
    await reloadDuring(() => button('Clear').click());
    await go('#/settings');
    expect(!(await mod('store.js')).flags().length && viewText().includes('Use “⚑ Report a problem”'), 'the reports were not cleared');

    button('Reset all progress').click();
    await sleep(50);
    const S2 = await mod('store.js');
    expect(!Object.keys(S2.allCards()).length && S2.settings().theme === 'auto' && !doc.documentElement.dataset.theme, 'reset left progress or the theme');
    expect(win.location.hash === '#/today' && stats().join() === '0,0,0', `after reset Today shows ${stats()}`);
  });

  await scenario('Two tabs open at once: neither overwrites the other', async (expect) => {
    await loadApp();
    const other = await openFrame('#/today');
    const winB = await attach(other);
    const [SA, SB] = [await mod('store.js'), await mod('store.js', winB)];
    SB.putCard('w:from-tab-b', { due: 0, ivl: 1, ease: 2.5, reps: 1, lapses: 0, last: 0 });
    await sleep(100);
    SA.setSetting('rate', 1);
    const saved = JSON.parse(localStorage.getItem(TEST_KEY));
    expect(saved.cards['w:from-tab-b'] && saved.settings.rate === 1, 'one tab overwrote the other’s progress');
    other.remove();
  });

  if (FULL) {
    await scenario(`Every lesson’s quiz, all right (${lessons.length} lessons)`, async (expect, problems) => {
      await loadApp({ width: 1100 });
      setNow(DAY0);
      for (const l of lessons) {
        statusEl.textContent = `Running: every lesson’s quiz… ${l.id}`;
        const log = await passLesson(l);
        const bad = log.filter((x) => x.result !== 'ok');
        if (bad.length) problems.push(`${l.id}: right answers not accepted: ${bad.map((x) => x.q.answers[0]).join(', ')}`);
        if (!viewText().includes('100%')) problems.push(`${l.id}: ${viewText().slice(0, 100)}`);
        problems.push(...win.testErrors.splice(0).map((e) => `${l.id}: error: ${e}`));
      }
      const cards = Object.keys((await mod('store.js')).allCards());
      const words = new Set(lessons.flatMap((l) => (l.type === 'vocab' ? l.words : [])));
      const cases = lessons.reduce((n, l) => n + (l.type === 'vocab' ? 0 : l.cases.length), 0);
      expect(cards.filter((c) => c.startsWith('w:')).length === words.size, `${cards.filter((c) => c.startsWith('w:')).length} word cards, expected ${words.size}`);
      expect(cards.filter((c) => c.startsWith('g:')).length === cases, `${cards.filter((c) => c.startsWith('g:')).length} grammar cards, expected ${cases}`);
      await go('#/learn');
      expect(doc.querySelectorAll('#view .lesson-link .pill.done').length === lessons.length, 'not every lesson shows as done');
      await go('#/today');
      expect(viewText().includes('You have finished every lesson'), 'Today does not say every lesson is finished');
    });
  }

  const failed = results.filter((r) => r.problems.length);
  statusEl.textContent = failed.length ? `${failed.length} of ${results.length} tests failed` : `All ${results.length} tests passed`;
  statusEl.className = failed.length ? 'fail' : 'pass';
  document.title = failed.length ? 'FAIL · App tests' : 'PASS · App tests';
  window.testResults = { done: true, passed: results.length - failed.length, failed: failed.length, failures: failed };
  // Leave no test progress behind: it shares the browser's storage space with the learner's.
  localStorage.removeItem(TEST_KEY);
  localStorage.removeItem(`${TEST_KEY}-unreadable`);
}

main().catch((err) => {
  statusEl.textContent = `The tests could not run: ${err.message}`;
  statusEl.className = 'fail';
  window.testResults = { done: true, passed: 0, failed: 1, failures: [{ name: 'setup', problems: [err.message] }] };
});
