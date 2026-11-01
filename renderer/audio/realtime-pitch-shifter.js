export class RealtimePitchShifter {
  constructor(sampleRate, channelCount = 2, grainSeconds = 0.1) {
    this.sampleRate = sampleRate;
    this.grainFrames = Math.max(32, Math.round(sampleRate * grainSeconds));
    this.bufferSize = this.grainFrames * 3 + 8;
    this.buffers = Array.from({ length: channelCount }, () => new Float32Array(this.bufferSize));
    this.frame = 0;
    this.phase = 0;
    this.pitchSemitones = 0;
    this.gateDb = -60;
    this.gateGain = 1;
  }

  processBlock(inputChannels, outputChannels) {
    const frameCount = outputChannels[0]?.length ?? 0;
    if (frameCount === 0) return;

    const ratio = 2 ** (this.pitchSemitones / 12);
    const excursion = Math.abs(1 - ratio) * this.grainFrames;
    const threshold = 10 ** (this.gateDb / 20);
    const openCoefficient = 1 - Math.exp(-1 / (this.sampleRate * 0.005));
    const closeCoefficient = 1 - Math.exp(-1 / (this.sampleRate * 0.025));

    for (let frameOffset = 0; frameOffset < frameCount; frameOffset += 1) {
      let peak = 0;
      for (const channel of inputChannels) {
        peak = Math.max(peak, Math.abs(channel[frameOffset] ?? 0));
      }
      const gateTarget = peak >= threshold ? 1 : 0;
      const coefficient = gateTarget > this.gateGain ? openCoefficient : closeCoefficient;
      this.gateGain += (gateTarget - this.gateGain) * coefficient;

      const firstPhase = this.phase;
      const secondPhase = (firstPhase + 0.5) % 1;
      const firstWeight = Math.sin(Math.PI * firstPhase) ** 2;
      const secondWeight = 1 - firstWeight;
      const firstDelay = this.#delay(firstPhase, ratio, excursion);
      const secondDelay = this.#delay(secondPhase, ratio, excursion);
      const bufferIndex = this.frame % this.bufferSize;

      for (let channelIndex = 0; channelIndex < outputChannels.length; channelIndex += 1) {
        const output = outputChannels[channelIndex];
        const source = inputChannels[Math.min(channelIndex, inputChannels.length - 1)];
        const sample = source?.[frameOffset] ?? 0;
        const buffer = this.buffers[channelIndex] ?? this.buffers[0];
        if (!buffer) {
          output[frameOffset] = 0;
          continue;
        }

        buffer[bufferIndex] = sample;
        const shifted = this.#read(buffer, firstDelay) * firstWeight
          + this.#read(buffer, secondDelay) * secondWeight;
        output[frameOffset] = shifted * this.gateGain;
      }

      this.frame += 1;
      this.phase += 1 / this.grainFrames;
      if (this.phase >= 1) this.phase -= 1;
    }
  }

  #delay(phase, ratio, excursion) {
    return 2 + (ratio >= 1 ? excursion * (1 - phase) : excursion * phase);
  }

  #read(buffer, delay) {
    const position = this.frame - delay;
    const lowerFrame = Math.floor(position);
    const fraction = position - lowerFrame;
    const lowerIndex = ((lowerFrame % this.bufferSize) + this.bufferSize) % this.bufferSize;
    const upperIndex = (lowerIndex + 1) % this.bufferSize;
    return buffer[lowerIndex] + (buffer[upperIndex] - buffer[lowerIndex]) * fraction;
  }
}