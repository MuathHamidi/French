// Pronunciation: plays a generated audio file (tools/make_audio.py) when one exists for the text,
// otherwise falls back to the device's French text-to-speech voice.
import { settings } from './store.js';
import { normKey } from './util.js';

let files = null;      // normalized text -> audio file path (data/audio.json)
let voices = [];
let player = null;
let credit = '';      // attribution for the recorded voice (shown in Settings)
let gen = 0;          // bumps on every speak(), so a running read-aloud knows it was interrupted

export const speechGen = () => gen;
export const audioCredit = () => credit;

export async function initAudio() {
  try {
    const res = await fetch('data/audio.json');
    if (res.ok) {
      const j = await res.json();
      files = j.files && Object.keys(j.files).length ? j.files : null;
      credit = j.credit || '';
    }
  } catch { files = null; }
  if ('speechSynthesis' in window) {
    const refresh = () => { voices = speechSynthesis.getVoices().filter((v) => /^fr/i.test(v.lang)); };
    refresh();
    speechSynthesis.addEventListener?.('voiceschanged', refresh);
  }
}

function score(v) {
  let s = 0;
  if (/^fr[-_]FR/i.test(v.lang)) s += 4;
  if (/natural|neural|premium|enhanced|online/i.test(v.name)) s += 6;
  if (/google|microsoft|apple|amélie|amelie|thomas|audrey|aurélie|marie|denise|henri|daniel/i.test(v.name)) s += 3;
  if (/espeak|mbrola/i.test(v.name)) s -= 8;
  return s;
}

export function frenchVoices() {
  return voices.slice().sort((a, b) => score(b) - score(a));
}

function chosenVoice() {
  const want = settings().voice;
  return voices.find((v) => v.name === want) || frenchVoices()[0] || null;
}

// What the settings page shows about speech quality.
export function voiceInfo() {
  const v = chosenVoice();
  return {
    name: v ? `${v.name} (${v.lang})` : null,
    robotic: !v || /espeak|mbrola/i.test(v.name),
    recorded: files ? Object.keys(files).length : 0,
  };
}

// Resolves when the text has finished playing (or was stopped).
export function speak(text, { slow = false } = {}) {
  const t = String(text).replace(/\s+/g, ' ').trim();
  if (!t) return Promise.resolve();
  stop();
  gen += 1;
  // An exact-case key exists only where capitals change the sound (the name Jean vs jean, the clothing).
  const file = files && (files[t.normalize('NFC').replace(/[’‘`]/g, "'")] || files[normKey(t)]);
  if (file) {
    return new Promise((resolve) => {
      const a = new Audio(file);
      player = a;
      a.playbackRate = slow ? 0.75 : 1;
      a.onended = a.onpause = () => resolve();
      a.play().catch(() => tts(t, slow).then(resolve));
    });
  }
  return tts(t, slow);
}

function tts(text, slow) {
  if (!('speechSynthesis' in window)) return Promise.resolve();
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    const v = chosenVoice();
    if (v) u.voice = v;
    u.lang = v?.lang || 'fr-FR';
    u.rate = slow ? 0.6 : settings().rate;
    u.onend = u.onerror = () => resolve();
    speechSynthesis.speak(u);
  });
}

export function stop() {
  if (player) { player.pause(); player = null; }
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}
