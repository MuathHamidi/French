// Settings: daily goal, speed and voice, display, backup and reported problems.
import { h, toast, todayKey, plural } from '../util.js';
import * as store from '../store.js';
import { frenchVoices, voiceInfo, playbackSpeed, speak, audioCredit } from '../audio.js';
import { lessonList, cardInCourse } from '../content.js';

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

  // The device voice only stands in for a missing or failed recording, so its list shows only when none are installed.
  const info = voiceInfo();
  const voice = info.recorded ? null : h('select', {}, h('option', { value: '' }, 'Automatic (best available)'),
    frenchVoices().map((v) => h('option', { value: v.name, selected: v.name === s.voice }, `${v.name} (${v.lang})`)));
  if (voice) voice.onchange = () => store.setSetting('voice', voice.value);

  const speed = h('input', { type: 'range', min: '0.5', max: '1.5', step: '0.05', value: playbackSpeed() });
  const speedLbl = h('span', {}, `${playbackSpeed()}×`);
  speed.oninput = () => { speedLbl.textContent = `${speed.value}×`; store.setSetting('speed', Number(speed.value)); };

  const ipa = h('input', { type: 'checkbox', checked: s.showIpa, id: 'ipa' });
  ipa.onchange = () => store.setSetting('showIpa', ipa.checked);

  const theme = h('select', {}, ['auto', 'light', 'dark'].map((t) => h('option', { value: t, selected: t === s.theme }, t)));
  theme.onchange = () => { store.setSetting('theme', theme.value); applyTheme(); };

  const file = h('input', { type: 'file', accept: 'application/json,.json', class: 'hidden' });
  file.onchange = async () => {
    const f = file.files[0];
    if (!f) return;
    try {
      const damaged = store.importJSON(await f.text());
      applyTheme();
      if (damaged) toast(`Progress restored, but ${plural(damaged, 'damaged entry was', 'damaged entries were')} left out or repaired.`, 5000);
      else toast('Progress restored.');
      location.hash = '#/today';
    } catch { toast('That file is not a progress backup.'); }
    file.value = ''; // so that choosing the same file again loads it again
  };

  // When progress was last downloaded here, whether the browser keeps the data when space runs short, and the
  // space the app takes: the browser may delete the whole site, progress included, to free space.
  const backedUp = h('p', { class: 'small muted', style: 'margin:10px 0 0' }, backupText());
  const space = h('p', { class: 'small muted', style: 'margin:6px 0 0', hidden: true });
  store.storageInfo().then(({ kept, used }) => {
    space.textContent = [
      kept === true ? "This browser keeps the app's data even when the device runs short of space." : '',
      kept === false ? "When the device runs short of space, this browser may delete the app's data, progress included: download it now and then." : '',
      used !== null ? `The app takes ${megabytes(used)} on this device (the course and the recordings you have heard).` : '',
    ].filter(Boolean).join(' ');
    space.hidden = !space.textContent;
  });

  const downloadProgress = () => {
    download(store.exportJSON(), `francais-progress-${todayKey()}.json`);
    store.markBackup();
    backedUp.textContent = backupText();
  };

  // A reset can't be undone: it first says what it would delete, with the download at hand.
  const startOver = h('div', {});
  const closeReset = () => startOver.replaceChildren(h('button', { class: 'btn', type: 'button', onclick: openReset }, 'Reset all progress'));
  function openReset() {
    const copy = h('p', { class: 'small muted', style: 'margin:8px 0 0' },
      `${backupText()} Download your progress first to keep a copy: you can load it back here or on another device.`);
    const keep = h('button', { class: 'btn primary', type: 'button', onclick: () => { downloadProgress(); copy.textContent = backupText(); } }, '⬇ Download progress');
    startOver.replaceChildren(
      h('p', { style: 'margin:0' }, lossText()),
      copy,
      h('div', { class: 'row', style: 'margin-top:12px' },
        keep,
        h('button', { class: 'btn danger', type: 'button', onclick: () => {
          store.resetAll();
          applyTheme();
          toast('All progress on this device was deleted.');
          location.hash = '#/today';
        } }, 'Delete everything'),
        h('button', { class: 'btn', type: 'button', onclick: closeReset }, 'Cancel')));
    keep.focus();
  }
  closeReset();

  const flags = store.flags();
  const flagText = flags.map((f) => `• ${f.text || f.word} (${f.word || 'unknown'}) ${f.page}${f.note ? ` — ${f.note}` : ''}`).join('\n');

  view.append(
    h('h1', {}, 'Settings'),
    h('section', { class: 'card' }, h('h2', {}, 'Daily goal'),
      field('New words per day', perDay, 'After a few weeks, each new word per day adds roughly 5–10 reviews per day. 30 a day fits about 1–1½ hours.')),
    h('section', { class: 'card' }, h('h2', {}, 'Pronunciation'),
      info.recorded ? h('p', { class: 'small' }, `Natural-sounding audio (made with a neural voice) is installed for ${info.recorded} words and sentences. If one can't be played, the device's own French voice reads it.`)
        : info.robotic ? h('div', { class: 'note', style: 'margin:0 0 12px' },
          'This device only has a robotic French voice, so treat it as a rough guide. Phones usually have natural French voices.') : null,
      voice ? field('Device voice', voice, info.name ? `Now using: ${info.name}` : 'No French voice found on this device.') : null,
      field(h('span', {}, 'Speed ', speedLbl), speed, 'For all the sound in the course. 🐢 Slow plays at three quarters of this speed.'),
      h('button', { class: 'btn', onclick: () => speak('Bonjour ! Je m’appelle Léa. Je suis française, et toi ?') }, '🔊 Test the voice'),
      audioCredit() ? h('p', { class: 'small muted', style: 'margin:12px 0 0' }, audioCredit()) : null),
    h('section', { class: 'card' }, h('h2', {}, 'Display'),
      h('label', { class: 'row', for: 'ipa' }, ipa, 'Show phonetic spelling (IPA)'),
      field('Theme', theme)),
    h('section', { class: 'card' }, h('h2', {}, 'Backup & other devices'),
      h('p', { class: 'small muted' }, 'Progress is saved in this browser only. To continue on another device, download it here and load it there.'),
      h('div', { class: 'row' },
        h('button', { class: 'btn', onclick: downloadProgress }, '⬇ Download progress'),
        h('button', { class: 'btn', onclick: () => file.click() }, '⬆ Load progress'), file),
      backedUp, space),
    h('section', { class: 'card' }, h('h2', {}, 'Reported problems'),
      flags.length ? h('div', {},
        h('div', { class: 'flag-list' }, flagText),
        h('div', { class: 'row', style: 'margin-top:8px' },
          h('button', { class: 'btn', onclick: () => navigator.clipboard?.writeText(flagText).then(() => toast('Copied.'), () => toast('Copy failed.')) }, 'Copy list'),
          h('button', { class: 'btn', onclick: () => { if (confirm('Clear the list?')) { store.clearFlags(); location.reload(); } } }, 'Clear')))
        : h('p', { class: 'small muted' }, 'Use “⚑ Report a problem” on any word card. Your reports collect here so they can be fixed.')),
    h('section', { class: 'card' }, h('h2', {}, 'Start over'), startOver),
  );
}

// What a reset would delete.
function lossText() {
  const lessons = lessonList().filter((l) => store.lessonState(l.id)?.done).length;
  const words = Object.keys(store.allCards()).filter((k) => k.startsWith('w:') && cardInCourse(k)).length;
  const days = store.streak();
  const parts = [
    lessons && plural(lessons, 'lesson finished', 'lessons finished'),
    words && plural(words, 'word learned', 'words learned'),
    days && `your ${days}-day streak`,
  ].filter(Boolean);
  return parts.length
    ? `This deletes all progress on this device: ${parts.join(', ')}, your settings and reported problems. It can't be undone.`
    : 'There is no progress on this device yet. This puts back the default settings and clears the reported problems.';
}

function backupText() {
  const at = store.lastBackup();
  return at ? `Last downloaded on ${new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.`
    : 'Not downloaded yet on this device.';
}

const megabytes = (bytes) => (bytes < 1e5 ? 'less than 0.1 MB' : `${bytes < 1e7 ? (bytes / 1e6).toFixed(1) : Math.round(bytes / 1e6)} MB`);

function download(text, name) {
  const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: 'application/json' })), download: name });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
