/**
 * generate-sounds.ts
 *
 * Generates all UI sound effects for pina as 44100 Hz, mono, 16-bit PCM WAV files.
 * No external dependencies — uses only Node.js Buffer manipulation.
 *
 * Run with:  npx tsx scripts/generate-sounds.ts
 */

import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

// ---------------------------------------------------------------------------
// WAV file writer
// ---------------------------------------------------------------------------

const SAMPLE_RATE = 44100;
const BIT_DEPTH = 16;
const NUM_CHANNELS = 1;

/**
 * Wraps a Float32Array of audio samples (range -1..1) into a valid WAV buffer.
 */
function samplesToWav(samples: Float32Array): Buffer {
  const numSamples = samples.length;
  const dataSize = numSamples * (BIT_DEPTH / 8) * NUM_CHANNELS;
  const headerSize = 44;
  const buf = Buffer.alloc(headerSize + dataSize);

  // RIFF header
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4); // chunk size
  buf.write("WAVE", 8);

  // fmt sub-chunk
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);                            // sub-chunk size (PCM)
  buf.writeUInt16LE(1, 20);                             // PCM format
  buf.writeUInt16LE(NUM_CHANNELS, 22);
  buf.writeUInt32LE(SAMPLE_RATE, 24);
  buf.writeUInt32LE(SAMPLE_RATE * NUM_CHANNELS * (BIT_DEPTH / 8), 28); // byte rate
  buf.writeUInt16LE(NUM_CHANNELS * (BIT_DEPTH / 8), 32);              // block align
  buf.writeUInt16LE(BIT_DEPTH, 34);

  // data sub-chunk
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);

  // Write 16-bit signed PCM samples
  const MAX_INT16 = 32767;
  for (let i = 0; i < numSamples; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(clamped * MAX_INT16), headerSize + i * 2);
  }

  return buf;
}

function writeSoundFile(outDir: string, name: string, samples: Float32Array): void {
  const buf = samplesToWav(samples);
  const outPath = join(outDir, name);
  writeFileSync(outPath, buf);
  console.log(`  wrote ${name}  (${samples.length} samples, ${(samples.length / SAMPLE_RATE * 1000).toFixed(0)} ms)`);
}

// ---------------------------------------------------------------------------
// DSP building blocks
// ---------------------------------------------------------------------------

/** Allocate a sample buffer for a given duration in seconds. */
function alloc(durationSec: number): Float32Array {
  return new Float32Array(Math.ceil(SAMPLE_RATE * durationSec));
}

/**
 * Convert a note name + octave to a frequency in Hz.
 * e.g. noteToHz("A", 4) === 440
 */
function noteToHz(note: string, octave: number): number {
  const NOTES: Record<string, number> = {
    C: 0, "C#": 1, Db: 1,
    D: 2, "D#": 3, Eb: 3,
    E: 4,
    F: 5, "F#": 6, Gb: 6,
    G: 7, "G#": 8, Ab: 8,
    A: 9, "A#": 10, Bb: 10,
    B: 11,
  };
  const semitone = NOTES[note];
  if (semitone === undefined) throw new Error(`Unknown note: ${note}`);
  // A4 = 440 Hz, MIDI number 69
  const midi = (octave + 1) * 12 + semitone;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Shift a frequency by a number of semitones. */
function shiftSemitones(hz: number, semitones: number): number {
  return hz * Math.pow(2, semitones / 12);
}

/**
 * ADSR envelope — returns a per-sample multiplier array.
 * All times are in seconds. Sustain is a level (0..1).
 */
function adsr(
  numSamples: number,
  attack: number,
  decay: number,
  sustain: number,
  release: number
): Float32Array {
  const env = new Float32Array(numSamples);
  const sr = SAMPLE_RATE;
  const aSamples = Math.floor(attack * sr);
  const dSamples = Math.floor(decay * sr);
  const rSamples = Math.floor(release * sr);
  const sSamples = Math.max(0, numSamples - aSamples - dSamples - rSamples);

  for (let i = 0; i < numSamples; i++) {
    if (i < aSamples) {
      env[i] = i / aSamples;
    } else if (i < aSamples + dSamples) {
      const t = (i - aSamples) / dSamples;
      env[i] = 1 - t * (1 - sustain);
    } else if (i < aSamples + dSamples + sSamples) {
      env[i] = sustain;
    } else {
      const t = (i - aSamples - dSamples - sSamples) / Math.max(1, rSamples);
      env[i] = sustain * (1 - t);
    }
  }
  return env;
}

/**
 * Simple exponential decay envelope — starts at 1 and decays to ~0.
 * `decay` is the time constant in seconds.
 */
function expDecay(numSamples: number, decayTime: number): Float32Array {
  const env = new Float32Array(numSamples);
  const k = 1 / (decayTime * SAMPLE_RATE);
  let v = 1;
  for (let i = 0; i < numSamples; i++) {
    env[i] = v;
    v *= 1 - k * 5; // 5 time-constants → effectively silent
  }
  return env;
}

/** Sine oscillator. Phase in radians, returns sample value. */
function sineOsc(freq: number, phase: number): number {
  return Math.sin(2 * Math.PI * freq * phase);
}

/** Triangle wave oscillator (band-limited approximation via first few partials). */
function triangleOsc(freq: number, phase: number): number {
  // Odd harmonics with alternating signs: n=1 amplitude 1, n=3 amplitude 1/9, n=5 1/25 …
  let v = 0;
  for (let n = 1; n <= 7; n += 2) {
    const sign = Math.floor((n - 1) / 2) % 2 === 0 ? 1 : -1;
    v += (sign / (n * n)) * Math.sin(2 * Math.PI * freq * n * phase);
  }
  return v * (8 / (Math.PI * Math.PI)); // normalise peak to ~1
}

/** Simple one-pole low-pass filter. Returns filtered sample, updates state in `state[0]`. */
function lpFilter(sample: number, cutoffHz: number, state: Float32Array): number {
  const rc = 1 / (2 * Math.PI * cutoffHz);
  const dt = 1 / SAMPLE_RATE;
  const alpha = dt / (rc + dt);
  state[0] += alpha * (sample - state[0]);
  return state[0];
}

/** Normalise a sample buffer so the peak absolute value equals targetPeak. */
function normalise(samples: Float32Array, targetPeak = 0.85): void {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    if (Math.abs(samples[i]) > peak) peak = Math.abs(samples[i]);
  }
  if (peak === 0) return;
  const gain = targetPeak / peak;
  for (let i = 0; i < samples.length; i++) samples[i] *= gain;
}

/** Apply a short linear fade-in and fade-out to kill any clicks at the edges. */
function declick(samples: Float32Array, fadeSamples = 64): void {
  const fade = Math.min(fadeSamples, Math.floor(samples.length / 4));
  for (let i = 0; i < fade; i++) {
    const gain = i / fade;
    samples[i] *= gain;
    samples[samples.length - 1 - i] *= gain;
  }
}

// ---------------------------------------------------------------------------
// Sound synthesisers
// ---------------------------------------------------------------------------

/**
 * navigate — very short soft tick.
 * A lightly filtered triangle pulse at a mid frequency.
 * Designed to be extremely subtle: no sustain, fast attack, quick decay.
 */
function synthNavigate(semitoneShift = 0): Float32Array {
  const dur = 0.05; // 50 ms
  const samples = alloc(dur);
  const baseHz = noteToHz("G", 5); // 784 Hz — soft, high, unobtrusive
  const freq = shiftSemitones(baseHz, semitoneShift);
  const env = expDecay(samples.length, dur * 0.6);
  const lpState = new Float32Array(1);

  for (let i = 0; i < samples.length; i++) {
    const t = i / SAMPLE_RATE;
    // Thin triangle — gives a woody "tick" character
    let v = triangleOsc(freq, t) * 0.5;
    // Add a very faint sine at the same pitch for warmth
    v += sineOsc(freq, t) * 0.3;
    v = lpFilter(v, 3000, lpState);
    samples[i] = v * env[i];
  }

  normalise(samples, 0.35); // deliberately quiet
  declick(samples, 32);
  return samples;
}

/**
 * enter — short bright "pop" / confirm tone.
 * A sine at a cheerful mid-high pitch with a soft attack and clean decay.
 */
function synthEnter(): Float32Array {
  const dur = 0.08;
  const samples = alloc(dur);
  const freq = noteToHz("E", 5); // 659 Hz — bright but not shrill
  const freq2 = shiftSemitones(freq, 7); // fifth above — adds "pop" transient
  const env = adsr(samples.length, 0.003, 0.02, 0.6, 0.05);
  const envTransient = expDecay(samples.length, 0.015);

  for (let i = 0; i < samples.length; i++) {
    const t = i / SAMPLE_RATE;
    const base = sineOsc(freq, t) * env[i];
    // Brief high-frequency burst shapes the initial pop
    const transient = sineOsc(freq2, t) * envTransient[i] * 0.4;
    samples[i] = base + transient;
  }

  normalise(samples, 0.6);
  declick(samples, 32);
  return samples;
}

/**
 * back — soft descending tone.
 * Frequency sweeps down over the duration using an exponential chirp.
 */
function synthBack(): Float32Array {
  const dur = 0.1;
  const samples = alloc(dur);
  const freqStart = noteToHz("E", 5); // 659 Hz
  const freqEnd = noteToHz("B", 4);   // 494 Hz — a minor third down
  const env = adsr(samples.length, 0.004, 0.04, 0.3, 0.05);
  let phase = 0;

  for (let i = 0; i < samples.length; i++) {
    const t = i / SAMPLE_RATE;
    // Interpolate frequency logarithmically (exponential chirp)
    const progress = t / dur;
    const freq = freqStart * Math.pow(freqEnd / freqStart, progress);
    const dt = 1 / SAMPLE_RATE;
    phase += freq * dt;
    // Blend sine and triangle for a slightly warm, rounded tone
    const v = (sineOsc(1, phase) * 0.7 + triangleOsc(1, phase) * 0.3);
    samples[i] = v * env[i];
  }

  normalise(samples, 0.55);
  declick(samples, 32);
  return samples;
}

/**
 * action — satisfying "ding" / chime.
 * A bell-like tone: fundamental + inharmonic partials, long sustain relative to duration.
 */
function synthAction(): Float32Array {
  const dur = 0.12;
  const samples = alloc(dur);
  const fundamental = noteToHz("A", 5); // 880 Hz
  // Bell partials: approximate physical bell ratios
  const partials: Array<[number, number]> = [
    [1.0, 1.0],
    [2.756, 0.35],  // minor third above octave
    [5.404, 0.12],
    [8.933, 0.05],
  ];
  const env = adsr(samples.length, 0.002, 0.03, 0.55, 0.07);

  for (let i = 0; i < samples.length; i++) {
    const t = i / SAMPLE_RATE;
    let v = 0;
    for (const [ratio, amp] of partials) {
      // Each partial decays at a different rate — higher partials fade faster
      const partialDecay = Math.exp(-t * (4 + ratio * 2));
      v += sineOsc(fundamental * ratio, t) * amp * partialDecay;
    }
    samples[i] = v * env[i];
  }

  normalise(samples, 0.65);
  declick(samples, 32);
  return samples;
}

/**
 * success — ascending two-note chime.
 * Two tones played sequentially (major third), each shaped with a bell envelope.
 */
function synthSuccess(): Float32Array {
  const dur = 0.2;
  const samples = alloc(dur);

  // Note 1: C#5 at t=0, Note 2: E5 (~major third up) at t=90ms
  const note1Hz = noteToHz("C#", 5); // 554 Hz
  const note2Hz = noteToHz("F#", 5); // 740 Hz — major third up

  const note1Start = 0;
  const note1End = Math.floor(0.14 * SAMPLE_RATE);
  const note2Start = Math.floor(0.08 * SAMPLE_RATE); // slight overlap
  const note2End = samples.length;

  // Individual bell envelopes for each note
  const len1 = note1End - note1Start;
  const len2 = note2End - note2Start;
  const env1 = adsr(len1, 0.003, 0.02, 0.5, 0.09);
  const env2 = adsr(len2, 0.003, 0.02, 0.5, 0.09);

  for (let i = note1Start; i < note1End; i++) {
    const t = i / SAMPLE_RATE;
    // Bell tone: fundamental + 2nd partial
    const v = sineOsc(note1Hz, t) * 0.8 + sineOsc(note1Hz * 2.756, t) * 0.2;
    samples[i] += v * env1[i - note1Start];
  }
  for (let i = note2Start; i < note2End; i++) {
    const t = i / SAMPLE_RATE;
    const v = sineOsc(note2Hz, t) * 0.8 + sineOsc(note2Hz * 2.756, t) * 0.2;
    samples[i] += v * env2[i - note2Start];
  }

  normalise(samples, 0.65);
  declick(samples, 48);
  return samples;
}

/**
 * error — low buzz/thud.
 * Short burst of low-frequency noise plus a descending pitch, conveying "wrong".
 */
function synthError(): Float32Array {
  const dur = 0.15;
  const samples = alloc(dur);
  const freq = noteToHz("A#", 2); // 116 Hz — low, thumpy
  const env = adsr(samples.length, 0.005, 0.06, 0.1, 0.07);
  const lpState = new Float32Array(1);

  // Pseudo-random noise seeded deterministically
  let noiseState = 0x12345678;
  function nextNoise(): number {
    noiseState ^= noiseState << 13;
    noiseState ^= noiseState >> 17;
    noiseState ^= noiseState << 5;
    return (noiseState & 0xffff) / 0x8000 - 1;
  }

  for (let i = 0; i < samples.length; i++) {
    const t = i / SAMPLE_RATE;
    const progress = t / dur;
    // Descending frequency sweep for the buzz character
    const instFreq = freq * (1 + (1 - progress) * 0.5);
    const sine = sineOsc(instFreq, t) * 0.5;
    // Low-frequency noise adds the "thud" body
    const noise = nextNoise() * 0.4;
    const mixed = lpFilter(sine + noise, 400, lpState);
    samples[i] = mixed * env[i];
  }

  normalise(samples, 0.7);
  declick(samples, 32);
  return samples;
}

/**
 * toggle — quick on/off click, like a physical switch.
 * A sharp transient with a very brief low sine to give it body.
 */
function synthToggle(): Float32Array {
  const dur = 0.06;
  const samples = alloc(dur);
  // Two-part click: a high-frequency transient followed immediately by a low thump
  const highFreq = noteToHz("G", 6); // 1568 Hz
  const lowFreq = noteToHz("G", 3);  // 196 Hz — rounded body
  const envHigh = expDecay(samples.length, 0.006);
  const envLow = expDecay(samples.length, 0.025);

  for (let i = 0; i < samples.length; i++) {
    const t = i / SAMPLE_RATE;
    const high = sineOsc(highFreq, t) * envHigh[i] * 0.6;
    const low = sineOsc(lowFreq, t) * envLow[i] * 0.9;
    samples[i] = high + low;
  }

  normalise(samples, 0.5);
  declick(samples, 16);
  return samples;
}

/**
 * delete — soft descending whoosh.
 * Filtered noise with a fast cutoff sweep from mid to low, plus a pitch-dropping sine.
 */
function synthDelete(): Float32Array {
  const dur = 0.15;
  const samples = alloc(dur);
  const freqStart = noteToHz("D", 5); // 587 Hz
  const freqEnd = noteToHz("G", 3);   // 196 Hz
  const env = adsr(samples.length, 0.005, 0.05, 0.2, 0.08);
  const lpState = new Float32Array(1);
  let phase = 0;

  // Pseudo-random noise
  let noiseState = 0xDEADBEEF;
  function nextNoise(): number {
    noiseState ^= noiseState << 13;
    noiseState ^= noiseState >> 17;
    noiseState ^= noiseState << 5;
    return (noiseState & 0xffff) / 0x8000 - 1;
  }

  for (let i = 0; i < samples.length; i++) {
    const t = i / SAMPLE_RATE;
    const progress = t / dur;
    // Exponential chirp downward
    const instFreq = freqStart * Math.pow(freqEnd / freqStart, progress);
    const dt = 1 / SAMPLE_RATE;
    phase += instFreq * dt;
    const sine = sineOsc(1, phase) * 0.5;
    // Noise filtered through a cutoff that sweeps down with the pitch
    const cutoff = instFreq * 2.5;
    const noise = lpFilter(nextNoise() * 0.4, cutoff, lpState);
    samples[i] = (sine + noise) * env[i];
  }

  normalise(samples, 0.55);
  declick(samples, 48);
  return samples;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const OUT_DIR = "/Users/yifengsun/dev/pina/sounds";

mkdirSync(OUT_DIR, { recursive: true });

console.log("\nGenerating pina UI sounds...\n");

// Core sounds
writeSoundFile(OUT_DIR, "navigate.wav", synthNavigate(0));
writeSoundFile(OUT_DIR, "enter.wav",    synthEnter());
writeSoundFile(OUT_DIR, "back.wav",     synthBack());
writeSoundFile(OUT_DIR, "action.wav",   synthAction());
writeSoundFile(OUT_DIR, "success.wav",  synthSuccess());
writeSoundFile(OUT_DIR, "error.wav",    synthError());
writeSoundFile(OUT_DIR, "toggle.wav",   synthToggle());
writeSoundFile(OUT_DIR, "delete.wav",   synthDelete());

console.log();

// navigate_0 through navigate_11 — 12 chromatic variants
// navigate_0 is identical to navigate.wav (base pitch, 0 semitone shift)
for (let i = 0; i < 12; i++) {
  writeSoundFile(OUT_DIR, `navigate_${i}.wav`, synthNavigate(i));
}

console.log("\nDone. All files written to:", OUT_DIR, "\n");
