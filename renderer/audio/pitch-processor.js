import { RealtimePitchShifter } from './realtime-pitch-shifter.js';

class PitchProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'pitch', defaultValue: 0, minValue: -12, maxValue: 12, automationRate: 'k-rate' },
      { name: 'gate', defaultValue: -60, minValue: -80, maxValue: -20, automationRate: 'k-rate' }
    ];
  }

  constructor() {
    super();
    this.shifter = new RealtimePitchShifter(sampleRate, 2);
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input?.length || !output?.length) return true;

    this.shifter.pitchSemitones = parameters.pitch[0];
    this.shifter.gateDb = parameters.gate[0];
    this.shifter.processBlock(input, output);
    return true;
  }
}

registerProcessor('pitch-processor', PitchProcessor);