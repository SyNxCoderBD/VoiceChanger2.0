const elements = {
  microphone: document.querySelector('#microphone-select'),
  output: document.querySelector('#output-select'),
  monitorOutput: document.querySelector('#monitor-select'),
  start: document.querySelector('#start-button'),
  stop: document.querySelector('#stop-button'),
  monitor: document.querySelector('#monitor-button'),
  monitorLabel: document.querySelector('#monitor-label'),
  callAudio: document.querySelector('#call-audio'),
  monitorAudio: document.querySelector('#monitor-audio'),
  status: document.querySelector('#status-label'),
  liveState: document.querySelector('#live-state'),
  routeNote: document.querySelector('#route-note'),
  error: document.querySelector('#error-message'),
  meter: document.querySelector('#meter-fill'),
  reset: document.querySelector('#reset-button')
};

const sliderIds = ['pitch', 'gain', 'gate', 'bass', 'treble', 'echo', 'reverb', 'distortion'];
const sliders = Object.fromEntries(sliderIds.map((id) => [id, document.querySelector(`#${id}-control`)]));
const defaults = { pitch: 0, gain: 100, gate: -60, bass: 0, treble: 0, echo: 0, reverb: 0, distortion: 0 };
const readouts = {
  pitch: (value) => `${value} st`,
  gain: (value) => `${value}%`,
  gate: (value) => `${value} dB`,
  bass: (value) => `${value} dB`,
  treble: (value) => `${value} dB`,
  echo: (value) => `${value}%`,
  reverb: (value) => `${value}%`,
  distortion: (value) => `${value}%`
};

let microphoneStream;
let audioContext;
let source;
let pitchNode;
let inputGain;
let bassFilter;
let trebleFilter;
let shaper;
let compressor;
let echoSend;
let echoDelay;
let echoFeedback;
let echoReturn;
let reverbSend;
let reverbReturn;
let masterGain;
let analyser;
let animationFrame;
let monitoring = false;

function updateStatus(label, live = false) {
  elements.status.textContent = label;
  elements.liveState.classList.toggle('is-live', live);
}

function showError(message) {
  elements.error.textContent = message;
  elements.error.hidden = !message;
}

function setControlValue(id, value) {
  sliders[id].value = String(value);
  document.querySelector(`#${id}-value`).textContent = readouts[id](value);
}

function updateControls() {
  for (const id of sliderIds) {
    const value = Number(sliders[id].value);
    document.querySelector(`#${id}-value`).textContent = readouts[id](value);
  }

  if (!audioContext || !pitchNode) return;
  const now = audioContext.currentTime;
  pitchNode.parameters.get('pitch').setTargetAtTime(Number(sliders.pitch.value), now, 0.03);
  pitchNode.parameters.get('gate').setTargetAtTime(Number(sliders.gate.value), now, 0.03);
  inputGain.gain.setTargetAtTime(Number(sliders.gain.value) / 100, now, 0.03);
  bassFilter.gain.setTargetAtTime(Number(sliders.bass.value), now, 0.03);
  trebleFilter.gain.setTargetAtTime(Number(sliders.treble.value), now, 0.03);
  echoSend.gain.setTargetAtTime(Number(sliders.echo.value) / 100 * 0.32, now, 0.03);
  reverbSend.gain.setTargetAtTime(Number(sliders.reverb.value) / 100 * 0.38, now, 0.03);
  shaper.curve = makeDistortionCurve(Number(sliders.distortion.value));
}

function makeDistortionCurve(amount) {
  if (amount === 0) return null;
  const samples = 2048;
  const curve = new Float32Array(samples);
  const drive = 1 + (amount / 100) ** 2 * 45;
  const normalizer = Math.tanh(drive);
  for (let index = 0; index < samples; index += 1) {
    const input = index * 2 / (samples - 1) - 1;
    curve[index] = Math.tanh(input * drive) / normalizer;
  }
  return curve;
}

function makeReverbImpulse(context) {
  const sampleRate = context.sampleRate;
  const length = Math.floor(sampleRate * 2.2);
  const impulse = context.createBuffer(2, length, sampleRate);
  for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
    const samples = impulse.getChannelData(channel);
    for (let index = 0; index < length; index += 1) {
      const decay = (1 - index / length) ** 3;
      samples[index] = (Math.random() * 2 - 1) * decay;
    }
  }
  return impulse;
}

function addDeviceOptions(select, devices, placeholder, selectedValue) {
  select.replaceChildren(new Option(placeholder, 'default'));
  for (const device of devices) {
    const option = new Option(device.label || `Audio device ${select.length}`, device.deviceId);
    select.add(option);
  }
  if ([...select.options].some((option) => option.value === selectedValue)) select.value = selectedValue;
}

async function refreshDevices() {
  const previousMicrophone = elements.microphone.value;
  const previousOutput = elements.output.value;
  const previousMonitor = elements.monitorOutput.value;
  const devices = await navigator.mediaDevices.enumerateDevices();
  const microphones = devices.filter((device) => device.kind === 'audioinput');
  const outputs = devices.filter((device) => device.kind === 'audiooutput');

  addDeviceOptions(elements.microphone, microphones, 'Default microphone', previousMicrophone);
  addDeviceOptions(elements.output, outputs, 'System default output', previousOutput);
  addDeviceOptions(elements.monitorOutput, outputs, 'System default output', previousMonitor);

  if (!previousOutput || previousOutput === 'default') {
    const cable = outputs.find((device) => /cable input|vb-audio/i.test(device.label));
    if (cable) elements.output.value = cable.deviceId;
  }
  if (!previousMonitor || previousMonitor === 'default') {
    const monitor = outputs.find((device) => !/cable input|vb-audio/i.test(device.label));
    if (monitor) elements.monitorOutput.value = monitor.deviceId;
  }
  updateRouteNote();
}

function updateRouteNote() {
  const selected = elements.output.selectedOptions[0]?.textContent || '';
  const routedToCable = /cable input|vb-audio/i.test(selected);
  elements.routeNote.classList.toggle('route-ready', routedToCable);
  elements.routeNote.querySelector('span:last-child').innerHTML = routedToCable
    ? 'Processed voice is routed to <strong>CABLE Input</strong>. Select <strong>CABLE Output</strong> as your microphone in the call app.'
    : 'For calls, send audio to <strong>CABLE Input</strong>, then select <strong>CABLE Output</strong> as your microphone in the call app.';
}

function updateMonitorButton() {
  elements.monitor.setAttribute('aria-pressed', String(monitoring));
  elements.monitor.classList.toggle('is-on', monitoring);
  elements.monitorLabel.textContent = monitoring ? 'On' : 'Off';
}

async function setAudioSink(audioElement, deviceId) {
  if (typeof audioElement.setSinkId !== 'function') {
    throw new Error('This Windows audio runtime does not support output-device selection. Rebuild with the included Electron version.');
  }
  await audioElement.setSinkId(deviceId || 'default');
}

async function startVoice() {
  elements.start.disabled = true;
  showError('');
  updateStatus('Starting');

  try {
    const audioConstraints = {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false
    };
    if (elements.microphone.value && elements.microphone.value !== 'default') {
      audioConstraints.deviceId = { exact: elements.microphone.value };
    }
    microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints, video: false });
    await refreshDevices();

    audioContext = new AudioContext({ latencyHint: 'interactive' });
    await audioContext.audioWorklet.addModule('./audio/pitch-processor.js');
    source = audioContext.createMediaStreamSource(microphoneStream);
    inputGain = audioContext.createGain();
    pitchNode = new AudioWorkletNode(audioContext, 'pitch-processor', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      channelCount: 2,
      channelCountMode: 'explicit'
    });
    bassFilter = audioContext.createBiquadFilter();
    bassFilter.type = 'lowshelf';
    bassFilter.frequency.value = 140;
    trebleFilter = audioContext.createBiquadFilter();
    trebleFilter.type = 'highshelf';
    trebleFilter.frequency.value = 4200;
    shaper = audioContext.createWaveShaper();
    shaper.oversample = '4x';
    compressor = audioContext.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 18;
    compressor.ratio.value = 3;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.16;

    echoSend = audioContext.createGain();
    echoDelay = audioContext.createDelay(1);
    echoDelay.delayTime.value = 0.24;
    echoFeedback = audioContext.createGain();
    echoFeedback.gain.value = 0.24;
    echoReturn = audioContext.createGain();
    echoReturn.gain.value = 0.7;
    reverbSend = audioContext.createGain();
    const convolver = audioContext.createConvolver();
    convolver.buffer = makeReverbImpulse(audioContext);
    reverbReturn = audioContext.createGain();
    reverbReturn.gain.value = 0.58;
    masterGain = audioContext.createGain();
    masterGain.gain.value = 0.78;
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;

    source.connect(inputGain);
    inputGain.connect(pitchNode);
    pitchNode.connect(bassFilter);
    bassFilter.connect(trebleFilter);
    trebleFilter.connect(shaper);
    shaper.connect(compressor);
    compressor.connect(masterGain);
    compressor.connect(echoSend);
    echoSend.connect(echoDelay);
    echoDelay.connect(echoFeedback);
    echoFeedback.connect(echoDelay);
    echoDelay.connect(echoReturn);
    echoReturn.connect(masterGain);
    compressor.connect(reverbSend);
    reverbSend.connect(convolver);
    convolver.connect(reverbReturn);
    reverbReturn.connect(masterGain);
    compressor.connect(analyser);

    const output = audioContext.createMediaStreamDestination();
    masterGain.connect(output);
    elements.callAudio.srcObject = output.stream;
    elements.monitorAudio.srcObject = output.stream;
    await setAudioSink(elements.callAudio, elements.output.value);
    await elements.callAudio.play();
    updateControls();

    elements.start.hidden = true;
    elements.stop.disabled = false;
    elements.monitor.disabled = false;
    updateStatus('Live', true);
    await refreshDevices();
    beginMeter();
  } catch (error) {
    await stopVoice();
    showError(error.name === 'NotAllowedError'
      ? 'Microphone access was blocked. Allow microphone access in Windows Settings, then try again.'
      : error.message || 'Could not start the audio engine. Check the selected microphone and try again.');
    updateStatus('Ready');
  } finally {
    elements.start.disabled = false;
  }
}

function beginMeter() {
  const samples = new Uint8Array(analyser.fftSize);
  const draw = () => {
    analyser.getByteTimeDomainData(samples);
    let energy = 0;
    for (const sample of samples) {
      const normalized = (sample - 128) / 128;
      energy += normalized * normalized;
    }
    const level = Math.min(1, Math.sqrt(energy / samples.length) * 2.6);
    elements.meter.style.transform = `scaleX(${level})`;
    animationFrame = requestAnimationFrame(draw);
  };
  draw();
}

async function stopVoice() {
  cancelAnimationFrame(animationFrame);
  microphoneStream?.getTracks().forEach((track) => track.stop());
  elements.callAudio.pause();
  elements.monitorAudio.pause();
  elements.callAudio.srcObject = null;
  elements.monitorAudio.srcObject = null;
  if (audioContext && audioContext.state !== 'closed') await audioContext.close();
  microphoneStream = undefined;
  audioContext = undefined;
  pitchNode = undefined;
  monitoring = false;
  updateMonitorButton();
  elements.start.hidden = false;
  elements.stop.disabled = true;
  elements.monitor.disabled = true;
  elements.meter.style.transform = 'scaleX(0)';
  updateStatus('Ready');
}

async function toggleMonitor() {
  if (!audioContext) return;
  showError('');
  if (monitoring) {
    elements.monitorAudio.pause();
    monitoring = false;
    updateMonitorButton();
    return;
  }

  try {
    await setAudioSink(elements.monitorAudio, elements.monitorOutput.value);
    elements.monitorAudio.volume = 0.85;
    await elements.monitorAudio.play();
    monitoring = true;
    updateMonitorButton();
  } catch (error) {
    showError(error.message || 'Could not start headphone monitoring.');
  }
}

for (const id of sliderIds) sliders[id].addEventListener('input', updateControls);
elements.start.addEventListener('click', startVoice);
elements.stop.addEventListener('click', stopVoice);
elements.monitor.addEventListener('click', toggleMonitor);
elements.reset.addEventListener('click', () => {
  for (const [id, value] of Object.entries(defaults)) setControlValue(id, value);
  updateControls();
});
elements.output.addEventListener('change', async () => {
  updateRouteNote();
  if (audioContext) {
    try {
      await setAudioSink(elements.callAudio, elements.output.value);
    } catch (error) {
      showError(error.message || 'Could not change the processed voice output.');
    }
  }
});
elements.monitorOutput.addEventListener('change', async () => {
  if (monitoring) {
    try {
      await setAudioSink(elements.monitorAudio, elements.monitorOutput.value);
    } catch (error) {
      showError(error.message || 'Could not change the monitor output.');
    }
  }
});
navigator.mediaDevices.addEventListener('devicechange', refreshDevices);

for (const [id, value] of Object.entries(defaults)) setControlValue(id, value);
refreshDevices().catch(() => {});