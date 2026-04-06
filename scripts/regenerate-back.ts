/**
 * regenerate-back.ts
 *
 * Overwrites back.wav in all 4 pina sound profiles with gentler, quieter versions.
 * No external dependencies — pure Node.js Buffer manipulation.
 *
 * Design goals:
 *   - Raised-cosine (Hann) fade-in to prevent any click or pop at the start
 *   - Long fade-out tail so the sound dissolves, not cuts
 *   - Peak amplitudes of 20–25% — quietest sounds in each profile
 *   - Pure sine waves or very gently filtered signals only
 *   - Exponential chirp (logarithmic frequency interpolation) for natural pitch sweep
 *
 * Run with:  npx tsx scripts/regenerate-back.ts
 */

import { writeFileSync } from "fs";
import { join } from "path";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SAMPLE_RATE   = 44100;
const BIT_DEPTH     = 16;
const NUM_CHANNELS  = 1;
const BASE_DIR      = "/Users/yifengsun/dev/pina/sounds";

// ---------------------------------------------------------------------------
// WAV file writer (44100 Hz, mono, 16-bit PCM — same approach as all profiles)
// ---------------------------------------------------------------------------

function samplesToWav(samples: Float32Array): Buffer {
  const numSamples = samples.length;
  const dataSize   = numSamples * (BIT_DEPTH / 8) * NUM_CHANNELS;
  const headerSize = 44;
  const buf        = Buffer.alloc(headerSize + dataSize);

  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);

  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(NUM_CHANNELS, 22);
  buf.writeUInt32LE(SAMPLE_RATE, 24);
  buf.writeUInt32LE(SAMPLE_RATE * NUM_CHANNELS * (BIT_DEPTH / 8), 28);
  buf.writeUInt16LE(NUM_CHANNELS * (BIT_DEPTH / 8), 32);
  buf.writeUInt16LE(BIT_DEPTH, 34);

  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);

  const MAX_INT16 = 32767;
  for (let i = 0; i < numSamples; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(clamped * MAX_INT16), headerSize + i * 2);
  }
  return buf;
}

function writeSoundFile(outDir: string, name: string, samples: Float32Array): void {
  const buf     = samplesToWav(samples);
  const outPath = join(outDir, name);
  writeFileSync(outPath, buf);
  const ms = (samples.length / SAMPLE_RATE * 1000).toFixed(0);
  console.log(`  wrote ${outPath}  (${samples.length} samples, ${ms} ms)`);
}

// ---------------------------------------------------------------------------
// DSP building blocks
// ---------------------------------------------------------------------------

function alloc(durationSec: number): Float32Array {
  return new Float32Array(Math.ceil(SAMPLE_RATE * durationSec));
}

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
  const midi = (octave + 1) * 12 + semitone;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Raised-cosine (Hann-window) envelope.
 *
 * fadeInFrac  — fraction of total length used for the raised-cosine fade-in (0..1)
 * fadeOutFrac — fraction of total length used for the cosine fade-out (0..1)
 *
 * The fade-in goes from 0 → 1 using the first quarter of a cosine cycle so
 * it starts with zero slope — no click at sample 0 even if the oscillator
 * happens to start at a non-zero value.
 */
function hannEnvelope(
  numSamples: number,
  fadeInFrac: number,
  fadeOutFrac: number
): Float32Array {
  const env         = new Float32Array(numSamples);
  const fadeInEnd   = Math.floor(numSamples * fadeInFrac);
  const fadeOutStart = numSamples - Math.floor(numSamples * fadeOutFrac);

  for (let i = 0; i < numSamples; i++) {
    let gain = 1.0;
    if (i < fadeInEnd) {
      // 0 → π/2 of cosine: goes 0 → 1 with zero derivative at both ends
      const t = i / Math.max(1, fadeInEnd);
      gain = 0.5 * (1 - Math.cos(Math.PI * t));
    }
    if (i >= fadeOutStart) {
      // π/2 → π of cosine: goes 1 → 0 with zero derivative at both ends
      const t = (i - fadeOutStart) / Math.max(1, numSamples - 1 - fadeOutStart);
      gain *= 0.5 * (1 + Math.cos(Math.PI * t));
    }
    env[i] = gain;
  }
  return env;
}

/**
 * Normalise the buffer so its peak absolute value equals targetPeak.
 * targetPeak should be 0.20–0.25 for these soft back sounds.
 */
function normalise(samples: Float32Array, targetPeak: number): void {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const a = Math.abs(samples[i]);
    if (a > peak) peak = a;
  }
  if (peak === 0) return;
  const gain = targetPeak / peak;
  for (let i = 0; i < samples.length; i++) samples[i] *= gain;
}

/**
 * Simple one-pole low-pass filter.
 * state[0] holds the filter memory between calls.
 */
function lpFilter(sample: number, cutoffHz: number, state: Float32Array): number {
  const rc    = 1 / (2 * Math.PI * cutoffHz);
  const dt    = 1 / SAMPLE_RATE;
  const alpha = dt / (rc + dt);
  state[0]   += alpha * (sample - state[0]);
  return state[0];
}

// ---------------------------------------------------------------------------
// 1. DEFAULT — very soft, gentle descending sine (minor third, ~100 ms)
//
// Pure sine chirp from E5 → C#5 (a minor third down).
// Hann envelope: slow 30 % fade-in, long 60 % fade-out.
// Normalised to 25 % peak — barely there, like a quiet step back.
// ---------------------------------------------------------------------------

function synthDefaultBack(): Float32Array {
  const dur       = 0.1;            // 100 ms
  const samples   = alloc(dur);
  const freqStart = noteToHz("E", 5);   // 659 Hz
  const freqEnd   = noteToHz("C#", 5);  // 554 Hz — minor third down (3 semitones)

  // Raised-cosine: 30 % fade-in, 60 % fade-out → only a 10 % plateau at peak
  const env   = hannEnvelope(samples.length, 0.30, 0.60);
  let   phase = 0;

  for (let i = 0; i < samples.length; i++) {
    const progress = i / (samples.length - 1);
    // Exponential (logarithmic) frequency interpolation — sounds natural
    const freq = freqStart * Math.pow(freqEnd / freqStart, progress);
    phase += freq / SAMPLE_RATE;
    samples[i] = Math.sin(2 * Math.PI * phase) * env[i];
  }

  // 25 % peak — the quietest it needs to be to still register as a sound
  normalise(samples, 0.25);
  return samples;
}

// ---------------------------------------------------------------------------
// 2. CYBERPUNK — gentle descending sine with subtle FM, no harshness (~100 ms)
//
// Carrier: pure sine chirp from D5 → B4 (minor third down).
// Modulator: very low-depth FM (ratio 2.0, index ramps from 0.15 → 0) to add
// a faint digital shimmer that fades away as the pitch drops — keeps the
// cyberpunk character without any harsh harmonics or clipping.
// Normalised to 25 %.
// ---------------------------------------------------------------------------

function synthCyberpunkBack(): Float32Array {
  const dur         = 0.1;
  const samples     = alloc(dur);
  const freqStart   = noteToHz("D", 5);  // 587 Hz
  const freqEnd     = noteToHz("B", 4);  // 494 Hz — minor third down

  // Hann envelope: 20 % fade-in, 65 % fade-out
  const env     = hannEnvelope(samples.length, 0.20, 0.65);
  let   carrPhase = 0;
  let   modPhase  = 0;

  for (let i = 0; i < samples.length; i++) {
    const progress = i / (samples.length - 1);
    const carrFreq = freqStart * Math.pow(freqEnd / freqStart, progress);

    // FM index decreases from 0.15 → 0 as sound progresses — shimmer fades out
    const fmIndex  = 0.15 * (1 - progress);
    const modFreq  = carrFreq * 2.0;

    modPhase  += modFreq  / SAMPLE_RATE;
    const modSig = Math.sin(2 * Math.PI * modPhase) * fmIndex;

    // FM carrier: instantaneous frequency is modulated by modSig
    carrPhase += (carrFreq + carrFreq * modSig) / SAMPLE_RATE;
    samples[i] = Math.sin(2 * Math.PI * carrPhase) * env[i];
  }

  normalise(samples, 0.25);
  return samples;
}

// ---------------------------------------------------------------------------
// 3. FOREST — whisper-quiet breeze: filtered noise with gentle downward sweep (~100 ms)
//
// White noise passed through a one-pole low-pass whose cutoff frequency sweeps
// downward from 900 Hz → 300 Hz over the duration.  The downward sweep gives
// the impression of a breeze dying away.  Hann envelope: 15 % fade-in, 70 %
// fade-out so it dissolves into silence.  Normalised to 20 %.
// ---------------------------------------------------------------------------

function synthForestBack(): Float32Array {
  const dur     = 0.1;
  const samples = alloc(dur);

  // Hann envelope: 15 % fade-in, 70 % fade-out
  const env     = hannEnvelope(samples.length, 0.15, 0.70);
  const lpState = new Float32Array(1);

  // Deterministic noise (xorshift32) — same output every run
  let noiseState = 0x9E3779B9;
  function nextNoise(): number {
    noiseState ^= noiseState << 13;
    noiseState ^= noiseState >> 17;
    noiseState ^= noiseState << 5;
    // Mask to 32 bits (JS bitwise ops are 32-bit signed)
    noiseState = noiseState | 0;
    return (noiseState & 0xffff) / 0x8000 - 1;
  }

  const cutoffStart = 900;   // Hz — mid breeze
  const cutoffEnd   = 300;   // Hz — dying away

  for (let i = 0; i < samples.length; i++) {
    const progress = i / (samples.length - 1);
    // Logarithmic sweep of the LP cutoff — sounds more natural than linear
    const cutoff = cutoffStart * Math.pow(cutoffEnd / cutoffStart, progress);
    const noise  = nextNoise();
    const filtered = lpFilter(noise, cutoff, lpState);
    samples[i] = filtered * env[i];
  }

  normalise(samples, 0.20);
  return samples;
}

// ---------------------------------------------------------------------------
// 4. DREAMY — barely audible descending shimmer: two detuned sines fading away (~100 ms)
//
// Two pure sine oscillators:
//   - Osc A: chirps from G#4 → E4 (minor third down, 493 Hz → 330 Hz)
//   - Osc B: detuned +7 cents above Osc A at every instant — produces a very
//     slow, gentle beating (imperceptible as "beating" at this pitch, just adds
//     warmth and shimmer)
// Hann envelope: 25 % fade-in, 65 % fade-out — the softest, slowest bloom.
// Normalised to 20 % — the most delicate of all four.
// ---------------------------------------------------------------------------

function synthDreamyBack(): Float32Array {
  const dur       = 0.1;
  const samples   = alloc(dur);
  const freqStart = noteToHz("G#", 4);  // 415 Hz
  const freqEnd   = noteToHz("E", 4);   // 330 Hz — minor third down

  // +7 cents detune ratio: 2^(7/1200)
  const detuneRatio = Math.pow(2, 7 / 1200);

  // Hann envelope: 25 % fade-in, 65 % fade-out
  const env    = hannEnvelope(samples.length, 0.25, 0.65);
  let   phaseA = 0;
  let   phaseB = 0;

  for (let i = 0; i < samples.length; i++) {
    const progress = i / (samples.length - 1);
    const freqA = freqStart * Math.pow(freqEnd / freqStart, progress);
    const freqB = freqA * detuneRatio;

    phaseA += freqA / SAMPLE_RATE;
    phaseB += freqB / SAMPLE_RATE;

    // Equal blend of both oscillators
    const v = (Math.sin(2 * Math.PI * phaseA) + Math.sin(2 * Math.PI * phaseB)) * 0.5;
    samples[i] = v * env[i];
  }

  normalise(samples, 0.20);
  return samples;
}

// ---------------------------------------------------------------------------
// Main — generate and overwrite all 4 back.wav files
// ---------------------------------------------------------------------------

console.log("\nRegenerating back.wav for all 4 pina sound profiles...\n");

writeSoundFile(`${BASE_DIR}/default`,   "back.wav", synthDefaultBack());
writeSoundFile(`${BASE_DIR}/cyberpunk`, "back.wav", synthCyberpunkBack());
writeSoundFile(`${BASE_DIR}/forest`,    "back.wav", synthForestBack());
writeSoundFile(`${BASE_DIR}/dreamy`,    "back.wav", synthDreamyBack());

console.log("\nDone. All 4 back.wav files overwritten.\n");
