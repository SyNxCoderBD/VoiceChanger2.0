const BAND_FREQUENCIES = [180, 280, 420, 620, 900, 1300, 1850, 2600, 3600, 4700];

function makeBandpass(sampleRate, frequency, quality = 1.15) {
  const omega = 2 * Math.PI * frequency / sampleRate;
  const alpha = Math.sin(omega) / (2 * quality);
  const normalizer = 1 / (1 + alpha);
  return {
    b0: alpha * normalizer,
    b1: 0,
    b2: -alpha * normalizer,
    a1: -2 * Math.cos(omega) * normalizer,
    a2: (1 - alpha) * normalizer,
    x1: 0,
    x2: 0,
    y1: 0,
    y2: 0
  };
}

function filterSample(filter, input) {
  const output = filter.b0 * input + filter.b1 * filter.x1 + filter.b2 * filter.x2
    - filter.a1 * filter.y1 - filter.a2 * filter.y2;
  filter.x2 = filter.x1;
  filter.x1 = input;
  filter.y2 = filter.y1;
  filter.y1 = output;
  return output;
}

export class RealtimeVocoder {
  constructor(sampleRate) {
    this.sampleRate = sampleRate;
    this.bands = BAND_FREQUENCIES.map((frequency) => ({
      analysis: makeBandpass(sampleRate, frequency),
      carrier: makeBandpass(sampleRate, frequency),
      envelope: 0
    }));
    this.attack = 1 - Math.exp(-1 / (sampleRate * 0.006));
    this.release = 1 - Math.exp(-1 / (sampleRate * 0.075));
    this.phase = 0;
    this.noiseState = 0x13579bdf;
  }

  processBlock(channels, amount) {
    const mix = Math.max(0, Math.min(1, amount / 100));
    if (mix === 0 || channels.length === 0) return;
    const frameCount = channels[0].length;

    for (let frame = 0; frame < frameCount; frame += 1) {
      let voice = 0;
      for (const channel of channels) voice += channel[frame] ?? 0;
      voice /= channels.length;

      this.noiseState = (1664525 * this.noiseState + 1013904223) >>> 0;
      const noise = this.noiseState / 0x80000000 - 1;
      let carrier = noise * 0.16;
      for (let harmonic = 1; harmonic <= 9; harmonic += 2) {
        carrier += Math.sin(2 * Math.PI * harmonic * this.phase) * (0.82 / harmonic);
      }

      let vocoded = 0;
      for (const band of this.bands) {
        const voiceBand = filterSample(band.analysis, voice);
        const level = Math.abs(voiceBand);
        const coefficient = level > band.envelope ? this.attack : this.release;
        band.envelope += (level - band.envelope) * coefficient;
        vocoded += band.envelope * filterSample(band.carrier, carrier);
      }
      vocoded *= 2.2;

      for (const channel of channels) {
        const dry = channel[frame];
        channel[frame] = dry * (1 - mix) + vocoded * mix;
      }

      this.phase += 110 / this.sampleRate;
      if (this.phase >= 1) this.phase -= 1;
    }
  }
}