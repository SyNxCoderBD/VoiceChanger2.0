# VoiceChanger

A Windows 11 desktop voice changer that processes your microphone in real time. It can route processed audio to a virtual microphone for calls and optionally monitor the changed voice through headphones.

## Requirements

- Windows 11, 64-bit
- A microphone and headphones
- VB-Audio Virtual Cable (free): install it from [vb-audio.com/Cable](https://vb-audio.com/Cable/), then restart Windows if its audio devices do not appear
- For development/building: Node.js 20 or newer and npm

The portable app does not install an audio driver. The virtual cable is a separate Windows audio driver and must be installed once on the PC.

## Build the portable EXE

From a development machine with Node.js and npm, in this folder (cross-building the Windows EXE from Linux is supported):

```powershell
npm install
npm test
npm run dist:win
```

The portable executable is written to `release/VoiceChanger-1.0.0-portable.exe`. Copy that file to the Windows 11 PC and run it; no app installer is needed. The virtual cable still needs to be installed separately on each PC.

To run the app during development, use `npm start`.

## Set up for calls

1. Install VB-Audio Virtual Cable and confirm Windows shows both **CABLE Input** and **CABLE Output** devices.
2. Connect headphones. In VoiceChanger, choose your physical microphone under **Microphone in**.
3. Choose **CABLE Input (VB-Audio Virtual Cable)** under **Send processed voice to**.
4. Choose your headphones under **Headphones / monitor**.
5. Press **Start voice**. Speak and check that the input meter moves.
6. In the call app, select **CABLE Output (VB-Audio Virtual Cable)** as the microphone. Keep the call app's speaker/output device set to your headphones.
7. Press **Hear myself** to monitor the processed voice in your headphones. Leave it off if you do not need monitoring.
8. Adjust pitch, gain, noise gate, bass, treble, echo, reverb, and distortion while speaking.

Use headphones when monitoring to prevent speaker audio from feeding back into the microphone. If the cable devices are missing, reinstall the virtual cable and restart Windows. If the call app cannot hear you, confirm it uses **CABLE Output** as its microphone and VoiceChanger sends to **CABLE Input**.

## Settings

- **Pitch:** -12 to +12 semitones
- **Input gain:** microphone level
- **Noise gate:** attenuates audio below the selected threshold
- **Bass / Treble:** low- and high-shelf EQ
- **Echo / Reverb:** adjustable time-based effects
- **Distortion:** adjustable saturation

Microphone audio is processed locally and is not uploaded.
