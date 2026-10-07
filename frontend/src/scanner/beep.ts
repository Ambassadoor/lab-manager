// A short beep for each camera read, like a handheld scanner's. Browsers
// (Safari especially) only let a page start sound after a tap, so
// unlockBeep() is called from the tap that opens the camera.
let audio: AudioContext | null = null;

export function unlockBeep(): void {
  try {
    audio ??= new AudioContext();
    void audio.resume();
  } catch {
    // No Web Audio: the camera just reads silently
  }
}

export function beep(): void {
  // Android buzzes; iOS doesn't support vibrate
  navigator.vibrate?.(50);
  if (!audio || audio.state !== 'running') return;
  const tone = audio.createOscillator();
  const volume = audio.createGain();
  tone.frequency.value = 1800;
  volume.gain.value = 0.1;
  tone.connect(volume).connect(audio.destination);
  tone.start();
  tone.stop(audio.currentTime + 0.08);
}
