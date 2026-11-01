import assert from 'node:assert/strict';
import test from 'node:test';
import { RealtimePitchShifter } from '../renderer/audio/realtime-pitch-shifter.js';
import { RealtimeVocoder } from '../renderer/audio/vocoder.js';
import { DEFAULT_HOTKEY, formatHotkey, hotkeyFromEvent, matchesHotkey, toElectronAccelerator } from '../renderer/hotkeys.js';

function renderSine(pitchSemitones) {
  const sampleRate = 48000;
  const frequency = 440;
  const shifter = new RealtimePitchShifter(sampleRate, 1);
  shifter.pitchSemitones = pitchSemitones;
  const output = [];

  for (let blockStart = 0; blockStart < sampleRate; blockStart += 128) {
    const inputBlock = new Float32Array(128);
    const outputBlock = new Float32Array(128);
    for (let index = 0; index < inputBlock.length; index += 1) {
      const time = (blockStart + index) / sampleRate;
      inputBlock[index] = Math.sin(2 * Math.PI * frequency * time) * 0.5;
    }
    shifter.processBlock([inputBlock], [outputBlock]);
    if (blockStart >= sampleRate / 2) output.push(...outputBlock);
  }

  let crossings = 0;
  for (let index = 1; index < output.length; index += 1) {
    if (output[index - 1] <= 0 && output[index] > 0) crossings += 1;
  }
  return crossings * sampleRate / output.length;
}

test('zero semitones preserves the incoming pitch', () => {
  const measuredFrequency = renderSine(0);
  assert.ok(measuredFrequency > 430 && measuredFrequency < 450, `${measuredFrequency} Hz`);
});

test('one octave up raises a 440 Hz tone to approximately 880 Hz', () => {
  const measuredFrequency = renderSine(12);
  assert.ok(measuredFrequency > 820 && measuredFrequency < 940, `${measuredFrequency} Hz`);
});

test('one octave down lowers a 440 Hz tone to approximately 220 Hz', () => {
  const measuredFrequency = renderSine(-12);
  assert.ok(measuredFrequency > 190 && measuredFrequency < 250, `${measuredFrequency} Hz`);
});

test('stereo processing stays finite when given silence', () => {
  const shifter = new RealtimePitchShifter(48000, 2);
  shifter.gateDb = -35;
  const silence = new Float32Array(128);
  const left = new Float32Array(128);
  const right = new Float32Array(128);

  shifter.processBlock([silence, silence], [left, right]);

  assert.ok([...left, ...right].every(Number.isFinite));
});

test('vocoder at zero amount leaves the signal unchanged', () => {
  const vocoder = new RealtimeVocoder(48000);
  const left = Float32Array.from([0.1, -0.2, 0.3, -0.4]);
  const original = [...left];

  vocoder.processBlock([left], 0);

  assert.deepEqual([...left], original);
});

test('active vocoder changes the signal without producing non-finite samples', () => {
  const vocoder = new RealtimeVocoder(48000);
  const left = new Float32Array(4096);
  const right = new Float32Array(4096);
  for (let index = 0; index < left.length; index += 1) {
    left[index] = Math.sin(2 * Math.PI * 220 * index / 48000) * 0.5;
    right[index] = left[index];
  }

  vocoder.processBlock([left, right], 100);

  assert.ok([...left, ...right].every(Number.isFinite));
  assert.ok(left.some((sample, index) => Math.abs(sample - right[index]) > 0) === false);
  assert.notDeepEqual([...left.slice(100)], Array.from({ length: left.length - 100 }, (_, index) =>
    Math.sin(2 * Math.PI * 220 * (index + 100) / 48000) * 0.5));
});

test('default hotkey is Alt+V and matches only the exact chord', () => {
  assert.equal(formatHotkey(DEFAULT_HOTKEY), 'Alt+V');
  assert.equal(toElectronAccelerator(DEFAULT_HOTKEY), 'Alt+V');
  assert.equal(matchesHotkey({ key: 'V', altKey: true, ctrlKey: false, shiftKey: false, metaKey: false }, DEFAULT_HOTKEY), true);
  assert.equal(matchesHotkey({ key: 'v', altKey: false, ctrlKey: false, shiftKey: false, metaKey: false }, DEFAULT_HOTKEY), false);
});

test('hotkey capture normalizes keys and ignores bare modifiers', () => {
  assert.deepEqual(hotkeyFromEvent({ key: 'F8', altKey: false, ctrlKey: true, shiftKey: false, metaKey: false }), {
    key: 'F8', alt: false, ctrl: true, shift: false, meta: false
  });
  assert.equal(hotkeyFromEvent({ key: 'Alt', altKey: true, ctrlKey: false, shiftKey: false, metaKey: false }), null);
});