// Renders French text (with markup) as clickable word spans.
import { h } from './util.js';
import { tokenize } from './content.js';

const NBSP_BEFORE = /^[!?:;»]$/;

export function renderText(markup, { prefer = new Set(), newIds = new Set() } = {}) {
  const segs = tokenize(markup, prefer);
  const root = h('span', { class: 'fr-inline' });
  let group = null, groupCase;
  segs.forEach((s, i) => {
    if (s.caseId !== groupCase) {
      groupCase = s.caseId;
      group = s.caseId ? h('span', { class: 'gspan', 'data-case': s.caseId }) : null;
      if (group) root.append(group);
    }
    const parent = group || root;
    if (s.w) {
      const cls = ['w'];
      if (!s.id) cls.push('unk');
      else if (newIds.has(s.id)) cls.push('new');
      if (s.target) cls.push('tgt');
      parent.append(h('span', { class: cls.join(' '), 'data-id': s.id || null, 'data-text': s.text, 'data-case': s.caseId || null }, s.text));
    } else {
      let t = s.text;
      if (/^\s+$/.test(t) && (NBSP_BEFORE.test(segs[i + 1]?.text || '') || segs[i - 1]?.text === '«')) t = ' ';
      parent.append(t);
    }
  });
  return root;
}

// A French sentence with a speaker button and a tap-to-show translation.
export function sentenceBlock(fr, en, speakFn, opts = {}) {
  const enEl = en ? h('span', { class: 'sent-en', hidden: !opts.showEn }, en) : null;
  return h('span', { class: 'sent' },
    renderText(fr, opts),
    ' ',
    h('button', { class: 'icon-btn sm sent-play', title: 'Listen', 'aria-label': 'Listen to this sentence', onclick: () => speakFn() }, '🔊'),
    en ? h('button', { class: 'reveal', title: 'Show translation', onclick: (e) => { enEl.hidden = !enEl.hidden; e.currentTarget.textContent = enEl.hidden ? 'EN' : 'hide'; } }, opts.showEn ? 'hide' : 'EN') : null,
    enEl,
  );
}
