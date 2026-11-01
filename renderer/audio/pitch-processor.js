import { RealtimePitchShifter } from './realtime-pitch-shifter.js';
import { RealtimeVocoder } from './vocoder.js';

class PitchProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'pitch', defaultValue: 0, minValue: -12, maxValue: 12, automationRate: 'k-rate' },
      { name: 'gate', defaultValue: -60, minValue: -80, maxValue: -20, automationRate: 'k-rate' },
      { name: 'vocoder', defaultValue: 0, minValue: 0, maxValue: 100, automationRate: 'k-rate' }
    ];
  }

  constructor() {
    super();
    this.shifter = new RealtimePitchShifter(sampleRate, 2);
    this.vocoder = new RealtimeVocoder(sampleRate);
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input?.length || !output?.length) return true;

    this.shifter.pitchSemitones = parameters.pitch[0];
    this.shifter.gateDb = parameters.gate[0];
    this.shifter.processBlock(input, output);
    this.vocoder.processBlock(output, parameters.vocoder[0]);
    return true;
  }
}

registerProcessor('pitch-processor', PitchProcessor);