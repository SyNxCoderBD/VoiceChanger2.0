import { DEFAULT_HOTKEY, formatHotkey, hotkeyFromEvent, matchesHotkey } from './hotkeys.js';

const elements = {
  microphone: document.querySelector('#microphone-select'),
  output: document.querySelector('#output-select'),
  monitorOutput: document.querySelector('#monitor-select'),
  start: document.querySelector('#start-button'),
  stop: document.querySelector('#stop-button'),
  monitor: document.querySelector('#monitor-button'),
  monitorLabel: document.querySelector('#monitor-label'),
  talkMode: document.querySelector('#talk-mode'),
  talkButton: document.querySelector('#talk-button'),
  talkLabel: document.querySelector('#talk-button-label'),
  talkHelp: document.querySelector('#talk-help'),
  hotkeyButton: document.querySelector('#hotkey-button'),
  hotkeyLabel: document.querySelector('#hotkey-label'),
  template: document.querySelector('#template-select'),
  callAudio: document.querySelector('#call-audio'),
  monitorAudio: document.querySelector('#monitor-audio'),
  status: document.querySelector('#status-label'),
  liveState: document.querySelector('#live-state'),
  routeNote: document.querySelector('#route-note'),
  error: document.querySelector('#error-message'),
  meter: document.querySelector('#meter-fill'),
  reset: document.querySelector('#reset-button')
};

const sliderIds = ['pitch', 'gain', 'gate', 'bass', 'treble', 'echo', 'reverb', 'distortion', 'boost', 'loudness', 'crispiness', 'vocoder'];
const sliders = Object.fromEntries(sliderIds.map((id) => [id, document.querySelector(`#${id}-control`)]));
const defaults = { pitch: 0, gain: 100, gate: -60, bass: 0, treble: 0, echo: 0, reverb: 0, distortion: 0, boost: 100, loudness: 0, crispiness: 0, vocoder: 0 };
const readouts = {
  pitch: (value) => `${value} st`,
  gain: (value) => `${value}%`,
  gate: (value) => `${value} dB`,
  bass: (value) => `${value} dB`,
  treble: (value) => `${value} dB`,
  echo: (value) => `${value}%`,
  reverb: (value) => `${value}%`,
  distortion: (value) => `${value}%`,
  boost: (value) => `${value}%`,
  loudness: (value) => `${value}%`,
  crispiness: (value) => `${value}%`,
  vocoder: (value) => `${value}%`
};
const templates = {
  custom: { settings: {}, highPass: 30, lowPass: 18000 },
  radio: { settings: { gate: -55, bass: -5, treble: 2, distortion: 10, boost: 115, loudness: 55, crispiness: 30 }, highPass: 350, lowPass: 3200 },
  walkie: { settings: { pitch: -1, gate: -50, bass: -8, treble: 1, distortion: 16, boost: 125, loudness: 68, crispiness: 35 }, highPass: 500, lowPass: 2800 },
  loud: { settings: { treble: 2, boost: 200, loudness: 100, crispiness: 10 }, highPass: 30, lowPass: 18000 },
  megaphone: { settings: { bass: -6, treble: 3, distortion: 30, boost: 140, loudness: 75, crispiness: 25 }, highPass: 280, lowPass: 3600 },
  underwater: { settings: { bass: 5, treble: -10, echo: 8, reverb: 25, loudness: 35 }, highPass: 70, lowPass: 750 },
  room: { settings: { echo: 15, reverb: 85, loudness: 35 }, highPass: 30, lowPass: 16000 },
  vocoder: { settings: { vocoder: 100, boost: 120, loudness: 45 }, highPass: 30, lowPass: 18000 }
};

let microphoneStream;
let audioContext;
let source;
let pitchNode;
let inputGain;
let bassFilter;
let trebleFilter;
let crispinessFilter;
let presetHighPass;
let presetLowPass;
let shaper;
let compressor;
let loudnessCompressor;
let makeupGain;
let boostGain;
let limiter;
let safetyClipper;
let transmitGain;
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
let transmitting = false;
let hotkeyHeld = false;
let capturingHotkey = false;
let activeMicrophoneId = 'default';

function loadHotkey() {
  try {
    const saved = JSON.parse(localStorage.getItem('voicechanger.talkHotkey'));
    if (typeof saved?.key === 'string' && saved.key.length > 0) {
      return {
        key: saved.key,
        alt: Boolean(saved.alt),
        ctrl: Boolean(saved.ctrl),
        shift: Boolean(saved.shift),
        meta: Boolean(saved.meta)
      };
    }
  } catch {}
  return { ...DEFAULT_HOTKEY };
}

let talkHotkey = loadHotkey();

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
  crispinessFilter.gain.setTargetAtTime(Number(sliders.crispiness.value) / 100 * 9, now, 0.03);
  loudnessCompressor.threshold.setTargetAtTime(-6 - Number(sliders.loudness.value) * 0.2, now, 0.03);
  loudnessCompressor.ratio.setTargetAtTime(1 + Number(sliders.loudness.value) * 0.09, now, 0.03);
  makeupGain.gain.setTargetAtTime(1 + Number(sliders.loudness.value) / 100 * 0.45, now, 0.03);
  boostGain.gain.setTargetAtTime(Number(sliders.boost.value) / 100, now, 0.03);
  pitchNode.parameters.get('vocoder').setTargetAtTime(Number(sliders.vocoder.value), now, 0.03);
  const template = templates[elements.template.value] || templates.custom;
  presetHighPass.frequency.setTargetAtTime(template.highPass, now, 0.03);
  presetLowPass.frequency.setTargetAtTime(template.lowPass, now, 0.03);
}

function applyTemplate(name) {
  const template = templates[name] || templates.custom;
  for (const [id, value] of Object.entries({ ...defaults, ...template.settings })) setControlValue(id, value);
  elements.template.value = name;
  updateControls();
}

function updateTalkButton() {
  const pushToTalk = elements.talkMode.value === 'ptt';
  elements.talkButton.classList.toggle('is-transmitting', transmitting);
  elements.talkButton.setAttribute('aria-pressed', String(transmitting));
  elements.talkLabel.textContent = !audioContext
    ? 'Start voice first'
    : pushToTalk
      ? transmitting ? 'Talking · release to mute' : 'Hold to talk'
      : transmitting ? 'Voice on · click to mute' : 'Voice muted · click to talk';
  elements.talkHelp.textContent = pushToTalk
    ? 'Audio is sent only while this button is held.'
    : 'Click once to talk; click again to mute your call audio.';
}

function updateHotkeyButton() {
  elements.hotkeyLabel.textContent = capturingHotkey ? 'Press shortcut' : formatHotkey(talkHotkey);
  elements.hotkeyButton.classList.toggle('is-capturing', capturingHotkey);
  elements.hotkeyButton.querySelector('.hotkey-action').textContent = capturingHotkey ? 'Esc to cancel' : 'Change';
}

function captureHotkey(event) {
  if (!capturingHotkey) return false;
  event.preventDefault();
  event.stopPropagation();
  if (event.key === 'Escape') {
    capturingHotkey = false;
    updateHotkeyButton();
    return true;
  }

  const nextHotkey = hotkeyFromEvent(event);
  if (!nextHotkey) return true;
  talkHotkey = nextHotkey;
  try {
    localStorage.setItem('voicechanger.talkHotkey', JSON.stringify(talkHotkey));
  } catch {}
  capturingHotkey = false;
  updateHotkeyButton();
  return true;
}

function setTransmitting(enabled) {
  transmitting = Boolean(enabled && audioContext && transmitGain);
  if (transmitGain && audioContext) {
    transmitGain.gain.setTargetAtTime(transmitting ? 1 : 0, audioContext.currentTime, 0.008);
  }
  updateTalkButton();
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

function makeSafetyCurve() {
  const curve = new Float32Array(2048);
  for (let index = 0; index < curve.length; index += 1) {
    const sample = index * 2 / (curve.length - 1) - 1;
    curve[index] = Math.max(-0.96, Math.min(0.96, sample));
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

async function switchMicrophone() {
  if (!audioContext || !inputGain) return;
  const requestedDeviceId = elements.microphone.value || 'default';
  if (requestedDeviceId === activeMicrophoneId) return;

  let replacementStream;
  try {
    const constraints = {
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      },
      video: false
    };
    if (requestedDeviceId !== 'default') constraints.audio.deviceId = { exact: requestedDeviceId };
    replacementStream = await navigator.mediaDevices.getUserMedia(constraints);
    const replacementSource = audioContext.createMediaStreamSource(replacementStream);
    replacementSource.connect(inputGain);

    const previousSource = source;
    const previousStream = microphoneStream;
    source = replacementSource;
    microphoneStream = replacementStream;
    activeMicrophoneId = requestedDeviceId;
    previousSource?.disconnect();
    previousStream?.getTracks().forEach((track) => track.stop());
    showError('');
  } catch (error) {
    replacementStream?.getTracks().forEach((track) => track.stop());
    elements.microphone.value = activeMicrophoneId;
    showError(error.message || 'Could not switch microphone. The previous microphone is still active.');
  }
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
    activeMicrophoneId = elements.microphone.value || 'default';
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
    presetHighPass = audioContext.createBiquadFilter();
    presetHighPass.type = 'highpass';
    presetHighPass.frequency.value = 30;
    presetHighPass.Q.value = 0.7;
    presetLowPass = audioContext.createBiquadFilter();
    presetLowPass.type = 'lowpass';
    presetLowPass.frequency.value = 18000;
    presetLowPass.Q.value = 0.7;
    crispinessFilter = audioContext.createBiquadFilter();
    crispinessFilter.type = 'peaking';
    crispinessFilter.frequency.value = 3200;
    crispinessFilter.Q.value = 0.85;
    shaper = audioContext.createWaveShaper();
    shaper.oversample = '4x';
    compressor = audioContext.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 18;
    compressor.ratio.value = 3;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.16;
    loudnessCompressor = audioContext.createDynamicsCompressor();
    loudnessCompressor.knee.value = 12;
    loudnessCompressor.attack.value = 0.006;
    loudnessCompressor.release.value = 0.14;
    makeupGain = audioContext.createGain();
    boostGain = audioContext.createGain();
    limiter = audioContext.createDynamicsCompressor();
    limiter.threshold.value = -1;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.12;
    safetyClipper = audioContext.createWaveShaper();
    safetyClipper.curve = makeSafetyCurve();
    safetyClipper.oversample = '4x';
    transmitGain = audioContext.createGain();
    transmitGain.gain.value = 0;

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
    trebleFilter.connect(presetHighPass);
    presetHighPass.connect(presetLowPass);
    presetLowPass.connect(crispinessFilter);
    crispinessFilter.connect(shaper);
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

    const monitorDestination = audioContext.createMediaStreamDestination();
    const callDestination = audioContext.createMediaStreamDestination();
    masterGain.connect(loudnessCompressor);
    loudnessCompressor.connect(makeupGain);
    makeupGain.connect(boostGain);
    boostGain.connect(limiter);
    limiter.connect(safetyClipper);
    safetyClipper.connect(monitorDestination);
    safetyClipper.connect(transmitGain);
    transmitGain.connect(callDestination);
    elements.callAudio.srcObject = callDestination.stream;
    elements.monitorAudio.srcObject = monitorDestination.stream;
    await setAudioSink(elements.callAudio, elements.output.value);
    await elements.callAudio.play();
    updateControls();

    elements.start.hidden = true;
    elements.stop.disabled = false;
    elements.monitor.disabled = false;
    elements.talkButton.disabled = false;
    setTransmitting(false);
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
  setTransmitting(false);
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
  elements.talkButton.disabled = true;
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
    if (audioContext.state === 'suspended') await audioContext.resume();
    await setAudioSink(elements.monitorAudio, elements.monitorOutput.value);
    elements.monitorAudio.volume = 0.85;
    await elements.monitorAudio.play();
    monitoring = true;
    updateMonitorButton();
  } catch (error) {
    showError(error.message || 'Could not start headphone monitoring.');
  }
}

for (const id of sliderIds) {
  sliders[id].addEventListener('input', () => {
    elements.template.value = 'custom';
    updateControls();
  });
}
elements.start.addEventListener('click', startVoice);
elements.stop.addEventListener('click', stopVoice);
elements.monitor.addEventListener('click', toggleMonitor);
elements.template.addEventListener('change', () => applyTemplate(elements.template.value));
elements.talkMode.addEventListener('change', () => {
  hotkeyHeld = false;
  setTransmitting(false);
  updateTalkButton();
});
elements.hotkeyButton.addEventListener('click', () => {
  capturingHotkey = true;
  updateHotkeyButton();
});
elements.talkButton.addEventListener('click', () => {
  if (elements.talkMode.value === 'toggle' && audioContext) setTransmitting(!transmitting);
});
elements.talkButton.addEventListener('pointerdown', (event) => {
  if (elements.talkMode.value !== 'ptt' || !audioContext || !event.isPrimary) return;
  event.preventDefault();
  elements.talkButton.setPointerCapture(event.pointerId);
  setTransmitting(true);
});
elements.talkButton.addEventListener('pointerup', () => {
  if (elements.talkMode.value === 'ptt') setTransmitting(false);
});
elements.talkButton.addEventListener('pointercancel', () => setTransmitting(false));
elements.talkButton.addEventListener('lostpointercapture', () => {
  if (elements.talkMode.value === 'ptt') setTransmitting(false);
});
elements.talkButton.addEventListener('keydown', (event) => {
  if (elements.talkMode.value === 'ptt' && [' ', 'Enter'].includes(event.key)) {
    event.preventDefault();
    if (!event.repeat) setTransmitting(true);
  }
});
elements.talkButton.addEventListener('keyup', (event) => {
  if (elements.talkMode.value === 'ptt' && [' ', 'Enter'].includes(event.key)) {
    event.preventDefault();
    setTransmitting(false);
  }
});
window.addEventListener('blur', () => {
  hotkeyHeld = false;
  if (elements.talkMode.value === 'ptt') setTransmitting(false);
});
window.addEventListener('keydown', (event) => {
  if (captureHotkey(event) || event.isComposing || !matchesHotkey(event, talkHotkey)) return;
  event.preventDefault();
  if (elements.talkMode.value === 'ptt') {
    if (!hotkeyHeld && !event.repeat) {
      hotkeyHeld = true;
      setTransmitting(true);
    }
  } else if (!event.repeat) {
    setTransmitting(!transmitting);
  }
});
window.addEventListener('keyup', (event) => {
  const released = hotkeyFromEvent(event);
  if (elements.talkMode.value === 'ptt' && hotkeyHeld && released?.key === talkHotkey.key) {
    hotkeyHeld = false;
    setTransmitting(false);
  }
});
elements.reset.addEventListener('click', () => {
  applyTemplate('custom');
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
elements.microphone.addEventListener('change', switchMicrophone);
navigator.mediaDevices.addEventListener('devicechange', refreshDevices);

for (const [id, value] of Object.entries(defaults)) setControlValue(id, value);
updateTalkButton();
updateHotkeyButton();
refreshDevices().catch(() => {});