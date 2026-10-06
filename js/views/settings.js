// Settings: daily goal, voice, display, backup and reported problems.
import { h, toast, todayKey } from '../util.js';
import * as store from '../store.js';
import { frenchVoices, voiceInfo, speak, audioCredit } from '../audio.js';

export function applyTheme() {
  const t = store.settings().theme;
  if (t === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
}

function field(label, control, help) {
  return h('div', { class: 'field' }, h('label', {}, label), control, help ? h('div', { class: 'small muted' }, help) : null);
}

export function renderSettings(view) {
  const s = store.settings();

  const perDay = h('input', { type: 'number', min: '5', max: '100', step: '5', value: s.newPerDay });
  perDay.onchange = () => store.setSetting('newPerDay', Math.max(5, Math.min(100, Number(perDay.value) || 30)));

  const voices = frenchVoices();
  const voice = h('select', {}, h('option', { value: '' }, 'Automatic (best available)'),
    voices.map((v) => h('option', { value: v.name, selected: v.name === s.voice }, `${v.name} (${v.lang})`)));
  voice.onchange = () => store.setSetting('voice', voice.value);
  const info = voiceInfo();

  const rate = h('input', { type: 'range', min: '0.5', max: '1.2', step: '0.05', value: s.rate });
  const rateLbl = h('span', {}, `${s.rate}×`);
  rate.oninput = () => { rateLbl.textContent = `${rate.value}×`; store.setSetting('rate', Number(rate.value)); };

  const ipa = h('input', { type: 'checkbox', checked: s.showIpa, id: 'ipa' });
  ipa.onchange = () => store.setSetting('showIpa', ipa.checked);

  const theme = h('select', {}, ['auto', 'light', 'dark'].map((t) => h('option', { value: t, selected: t === s.theme }, t)));
  theme.onchange = () => { store.setSetting('theme', theme.value); applyTheme(); };

  const file = h('input', { type: 'file', accept: 'application/json,.json', class: 'hidden' });
  file.onchange = async () => {
    const f = file.files[0];
    if (!f) return;
    try { store.importJSON(await f.text()); toast('Progress restored.'); location.hash = '#/today'; }
    catch { toast('That file is not a progress backup.'); }
  };

  const flags = store.flags();
  const flagText = flags.map((f) => `• ${f.text || f.word} (${f.word || 'unknown'}) ${f.page}${f.note ? ` — ${f.note}` : ''}`).join('\n');

  view.append(
    h('h1', {}, 'Settings'),
    h('section', { class: 'card' }, h('h2', {}, 'Daily goal'),
      field('New words per day', perDay, 'After a few weeks, each new word per day adds roughly 5–10 reviews per day. 30 a day fits about 1–1½ hours.')),
    h('section', { class: 'card' }, h('h2', {}, 'Pronunciation'),
      info.recorded ? h('p', { class: 'small' }, `Natural-sounding audio (made with a neural voice) is installed for ${info.recorded} words and sentences. The device voice below is only used for anything without it.`)
        : info.robotic ? h('div', { class: 'note', style: 'margin:0 0 12px' },
          'This device only has a robotic French voice, so treat it as a rough guide. Phones usually have natural French voices.') : null,
      field('Device voice', voice, info.name ? `Now using: ${info.name}` : 'No French voice found on this device.'),
      field(h('span', {}, 'Device voice speed ', rateLbl), rate),
      h('button', { class: 'btn', onclick: () => speak('Bonjour ! Je m’appelle Léa. Je suis française, et toi ?') }, '🔊 Test the voice'),
      audioCredit() ? h('p', { class: 'small muted', style: 'margin:12px 0 0' }, audioCredit()) : null),
    h('section', { class: 'card' }, h('h2', {}, 'Display'),
      h('label', { class: 'row', for: 'ipa' }, ipa, 'Show phonetic spelling (IPA)'),
      field('Theme', theme)),
    h('section', { class: 'card' }, h('h2', {}, 'Backup & other devices'),
      h('p', { class: 'small muted' }, 'Progress is saved in this browser only. To continue on another device, download it here and load it there.'),
      h('div', { class: 'row' },
        h('button', { class: 'btn', onclick: () => download(store.exportJSON(), `francais-progress-${todayKey()}.json`) }, '⬇ Download progress'),
        h('button', { class: 'btn', onclick: () => file.click() }, '⬆ Load progress'), file)),
    h('section', { class: 'card' }, h('h2', {}, 'Reported problems'),
      flags.length ? h('div', {},
        h('div', { class: 'flag-list' }, flagText),
        h('div', { class: 'row', style: 'margin-top:8px' },
          h('button', { class: 'btn', onclick: () => navigator.clipboard?.writeText(flagText).then(() => toast('Copied.'), () => toast('Copy failed.')) }, 'Copy list'),
          h('button', { class: 'btn', onclick: () => { if (confirm('Clear the list?')) { store.clearFlags(); location.reload(); } } }, 'Clear')))
        : h('p', { class: 'small muted' }, 'Use “⚑ Report a problem” on any word card. Your reports collect here so they can be fixed.')),
    h('section', { class: 'card' }, h('h2', {}, 'Start over'),
      h('button', { class: 'btn', onclick: () => { if (confirm('Delete all progress on this device?')) { store.resetAll(); location.hash = '#/today'; } } }, 'Reset all progress')),
  );
}

function download(text, name) {
  const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: 'application/json' })), download: name });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
