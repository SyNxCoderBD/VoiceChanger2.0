import assert from 'node:assert/strict';
import test from 'node:test';
import { RealtimePitchShifter } from '../renderer/audio/realtime-pitch-shifter.js';

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