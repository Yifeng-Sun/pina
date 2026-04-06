/**
 * generate-forest.ts
 *
 * Generates the "forest" UI sound profile for pina.
 * Character: organic, natural, echoing, rainy — rainforest ambiance.
 *
 * All files: 44100 Hz, mono, 16-bit PCM WAV, no external dependencies.
 *
 * Run with:  npx tsx scripts/generate-forest.ts
 */

import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

// ---------------------------------------------------------------------------
// WAV writer (same approach as generate-sounds.ts)
// ---------------------------------------------------------------------------

const SAMPLE_RATE = 44100;
const BIT_DEPTH = 16;
const NUM_CHANNELS = 1;

function samplesToWav(samples: Float32Array): Buffer {
  const numSamples = samples.length;
  const dataSize = numSamples * (BIT_DEPTH / 8) * NUM_CHANNELS;
  const headerSize = 44;
  const buf = Buffer.alloc(headerSize + dataSize);

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
  const buf = samplesToWav(samples);
  const outPath = join(outDir, name);
  writeFileSync(outPath, buf);
  console.log(`  wrote ${name}  (${samples.length} samples, ${(samples.length / SAMPLE_RATE * 1000).toFixed(0)} ms)`);
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

function shiftSemitones(hz: number, semitones: number): number {
  return hz * Math.pow(2, semitones / 12);
}

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

function expDecay(numSamples: number, decayTime: number): Float32Array {
  const env = new Float32Array(numSamples);
  // True exponential: e^(-t/tau) where tau = decayTime / 5 (5 time-constants → -60 dB)
  const tau = decayTime * SAMPLE_RATE / 5;
  for (let i = 0; i < numSamples; i++) {
    env[i] = Math.exp(-i / tau);
  }
  return env;
}

/** Exponential curve from `start` to `end` over numSamples. */
function expRamp(numSamples: number, start: number, end: number): Float32Array {
  const env = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / Math.max(1, numSamples - 1);
    env[i] = start * Math.pow(end / start, t);
  }
  return env;
}

/** One-pole low-pass filter, returns filtered sample and updates state[0]. */
function lpFilter(sample: number, cutoffHz: number, state: Float32Array): number {
  const rc = 1 / (2 * Math.PI * cutoffHz);
  const dt = 1 / SAMPLE_RATE;
  const alpha = dt / (rc + dt);
  state[0] += alpha * (sample - state[0]);
  return state[0];
}

/** One-pole high-pass filter, returns filtered sample and updates state[0], state[1]. */
function hpFilter(sample: number, cutoffHz: number, state: Float32Array): number {
  const rc = 1 / (2 * Math.PI * cutoffHz);
  const dt = 1 / SAMPLE_RATE;
  const alpha = rc / (rc + dt);
  const out = alpha * (state[1] + sample - state[0]);
  state[0] = sample;
  state[1] = out;
  return out;
}

/** Deterministic pseudo-random noise generator. Returns values in -1..1. */
function makeNoise(seed: number): () => number {
  let state = seed >>> 0;
  if (state === 0) state = 1;
  return () => {
    state ^= state << 13;
    state ^= state >> 17;
    state ^= state << 5;
    state = state >>> 0;
    return (state & 0xffff) / 0x8000 - 1;
  };
}

/** Normalise so the peak absolute value equals targetPeak. */
function normalise(samples: Float32Array, targetPeak = 0.85): void {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    if (Math.abs(samples[i]) > peak) peak = Math.abs(samples[i]);
  }
  if (peak === 0) return;
  const gain = targetPeak / peak;
  for (let i = 0; i < samples.length; i++) samples[i] *= gain;
}

/** Linear fade-in and fade-out to kill clicks at the buffer edges. */
function declick(samples: Float32Array, fadeSamples = 64): void {
  const fade = Math.min(fadeSamples, Math.floor(samples.length / 4));
  for (let i = 0; i < fade; i++) {
    const gain = i / fade;
    samples[i] *= gain;
    samples[samples.length - 1 - i] *= gain;
  }
}

/**
 * Simple Schroeder-style comb reverb.
 * Blends the dry signal with a series of comb filter echoes to create a
 * natural spatial wash without allpass diffusers (which add phase smear).
 *
 * delayTimes: array of delay times in seconds (pick prime-ish multiples)
 * decays: per-comb feedback gain (0..1)
 * wet: wet mix amount (0..1)
 */
function applyReverb(
  input: Float32Array,
  delayTimes: number[],
  decays: number[],
  wet: number
): Float32Array {
  const out = new Float32Array(input.length);

  // Mix dry signal
  for (let i = 0; i < input.length; i++) out[i] += input[i] * (1 - wet);

  // Add each comb filter contribution
  for (let c = 0; c < delayTimes.length; c++) {
    const delaySamples = Math.round(delayTimes[c] * SAMPLE_RATE);
    const feedback = decays[c];
    const combBuf = new Float32Array(delaySamples);
    let writePos = 0;

    for (let i = 0; i < input.length; i++) {
      const readPos = (writePos + delaySamples - delaySamples) % delaySamples;
      const delayed = combBuf[readPos];
      combBuf[writePos] = input[i] + delayed * feedback;
      out[i] += delayed * wet * (1 / delayTimes.length);
      writePos = (writePos + 1) % delaySamples;
    }
  }

  return out;
}

/**
 * Natural forest reverb: short pre-delay, diffuse decay, warm (LP filtered) tail.
 * Tuned to sound like a clearing in dense trees — reflections from all sides.
 */
function forestReverb(input: Float32Array, amount = 0.4): Float32Array {
  // Four comb delays at mutually prime lengths → avoids metallic resonance
  const delays = [0.031, 0.037, 0.041, 0.053]; // 31–53 ms
  const decays = [0.55, 0.52, 0.50, 0.48];
  const wet = amount;
  const result = applyReverb(input, delays, decays, wet);

  // Low-pass the result to warm the reverb tail (absorb high-freq like foliage)
  const lpState = new Float32Array(1);
  for (let i = 0; i < result.length; i++) {
    result[i] = lpFilter(result[i], 6000, lpState);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Forest sound synthesizers
// ---------------------------------------------------------------------------

/**
 * navigate — water drop hitting a leaf.
 * Synthesis: a short sine burst at a liquid frequency with a fast exponential
 * decay, plus a thin noise click transient and a pitch-downward FM droop that
 * mimics the way a droplet "plunks" with slight inharmonic shimmer.
 * Then passed through a short forest reverb for spatial depth.
 */
function synthForestNavigate(semitoneShift = 0): Float32Array {
  const dur = 0.085; // slightly longer than 50ms to accommodate reverb tail
  const samples = alloc(dur);

  // Water drops sit in the 800–2000 Hz range; the FM droop gives the liquid "plonk"
  const baseHz = noteToHz("G", 5); // 784 Hz — pleasant, mid-high
  const freq = shiftSemitones(baseHz, semitoneShift);

  // FM modulation: modulator sweeps down rapidly → creates the pitch "blip" of a drop
  const modRatio = 3.5;
  const modDepth = freq * 2.0; // initial FM depth — decays quickly
  const modDecay = expDecay(samples.length, dur * 0.15); // very fast droop

  // Amplitude envelope: nearly instant attack, exponential tail
  const ampEnv = expDecay(samples.length, dur * 0.45);

  // Noise click: tiny burst right at the start (drop impact)
  const noiseEnv = expDecay(samples.length, dur * 0.04);
  const noise = makeNoise(0xA1B2C3D4 + semitoneShift * 7919);

  for (let i = 0; i < samples.length; i++) {
    const t = i / SAMPLE_RATE;
    const modFreq = freq * modRatio;
    const modSig = Math.sin(2 * Math.PI * modFreq * t) * modDepth * modDecay[i];
    // FM carrier: instantaneous frequency = freq + modSig
    // Approximate with a phase accumulator for accuracy
    const carrier = Math.sin(2 * Math.PI * freq * t + modSig * (1 / (freq * 2 * Math.PI)));
    const click = noise() * noiseEnv[i] * 0.3;
    samples[i] = (carrier * 0.9 + click) * ampEnv[i];
  }

  // Short reverb — like the drop echoing in a hollow leaf cup
  const wet = forestReverb(samples, 0.3);
  normalise(wet, 0.38); // quiet, like the default navigate
  declick(wet, 32);
  return wet;
}

/**
 * enter — soft wooden tap on a hollow log.
 * Synthesis: a low-mid resonant sine burst (wood body resonance) with a
 * noisy click transient (the actual tap), plus a short forest echo.
 * Wood resonances cluster around 200–400 Hz.
 */
function synthForestEnter(): Float32Array {
  const dur = 0.13; // 80ms body + 50ms reverb space
  const samples = alloc(dur);

  // Primary wood resonance — hollow log pitch
  const freq1 = noteToHz("E", 3);   // 164 Hz — fundamental hollow resonance
  const freq2 = noteToHz("B", 3);   // 247 Hz — second mode of the log
  const freq3 = noteToHz("E", 4);   // 329 Hz — third mode

  const env1 = expDecay(samples.length, 0.045);
  const env2 = expDecay(samples.length, 0.028);
  const env3 = expDecay(samples.length, 0.018);

  // Tap transient: brief wide-band noise burst
  const noiseEnv = expDecay(samples.length, 0.006);
  const noise = makeNoise(0xFEDCBA98);
  const lpState = new Float32Array(1);

  for (let i = 0; i < samples.length; i++) {
    const t = i / SAMPLE_RATE;
    const wood = Math.sin(2 * Math.PI * freq1 * t) * env1[i] * 0.7
               + Math.sin(2 * Math.PI * freq2 * t) * env2[i] * 0.4
               + Math.sin(2 * Math.PI * freq3 * t) * env3[i] * 0.2;
    const tap = lpFilter(noise() * noiseEnv[i], 2500, lpState) * 0.5;
    samples[i] = wood + tap;
  }

  // Forest echo: longer than navigate, echoes between trees
  const wet = forestReverb(samples, 0.45);
  normalise(wet, 0.62);
  declick(wet, 48);
  return wet;
}

/**
 * back — gentle breeze through leaves, descending.
 * Synthesis: band-pass filtered noise with a cutoff that sweeps downward
 * (like wind dying away), plus a very soft sine undertone that descends
 * to reinforce the "going back" feeling. Rustling, airy.
 */
function synthForestBack(): Float32Array {
  const dur = 0.16; // 100ms + reverb tail space
  const samples = alloc(dur);

  const freqStart = 1800; // Hz — bright wind rustle
  const freqEnd   = 400;  // Hz — breeze dying to murmur

  const env = adsr(samples.length, 0.008, 0.06, 0.15, 0.07);
  const noise = makeNoise(0x77665544);
  const lpState = new Float32Array(1);
  const hpState = new Float32Array(2);

  // Descending sine undertone for pitch directionality
  const sineStart = noteToHz("D", 5); // 587 Hz
  const sineEnd   = noteToHz("G", 4); // 392 Hz
  let phase = 0;

  for (let i = 0; i < samples.length; i++) {
    const t = i / SAMPLE_RATE;
    const progress = t / dur;

    // Sweeping bandpass: LP and HP moving together
    const cutoff = freqStart * Math.pow(freqEnd / freqStart, progress);
    const filtered = hpFilter(
      lpFilter(noise() * 0.6, cutoff, lpState),
      cutoff * 0.25,
      hpState
    );

    // Descending sine undertone (very soft)
    const instFreq = sineStart * Math.pow(sineEnd / sineStart, progress);
    const dt = 1 / SAMPLE_RATE;
    phase += instFreq * dt;
    const sine = Math.sin(2 * Math.PI * phase) * 0.25;

    samples[i] = (filtered + sine) * env[i];
  }

  // Wind doesn't echo as sharply — lighter reverb
  const wet = forestReverb(samples, 0.35);
  normalise(wet, 0.55);
  declick(wet, 48);
  return wet;
}

/**
 * action — bright bird-chirp-like tone.
 * Synthesis: a short ascending FM sweep that mimics a small bird call.
 * Start at a lower pitch, rapidly rise over ~60ms, then decay.
 * FM ratio adds the overtone shimmer typical of bird vocalizations.
 */
function synthForestAction(): Float32Array {
  const dur = 0.15; // 120ms + space
  const samples = alloc(dur);

  // Bird call sits between 2kHz and 4kHz
  const freqStart = noteToHz("D", 6);  // 1175 Hz — chirp base
  const freqEnd   = noteToHz("A", 6);  // 1760 Hz — chirp peak

  const env = adsr(samples.length, 0.004, 0.055, 0.3, 0.07);

  // FM settings: modulator at ~4x carrier, moderate depth
  const modRatio = 4.1;
  const modDepth = 0.8; // radians of phase deviation

  let phase = 0;
  let modPhase = 0;

  for (let i = 0; i < samples.length; i++) {
    const t = i / SAMPLE_RATE;
    const progress = t / dur;

    // Pitch glide: fast initial rise (first 40%), then gentle hold
    const riseProgress = Math.min(1, progress / 0.4);
    const instFreq = freqStart * Math.pow(freqEnd / freqStart, riseProgress);
    const modFreq = instFreq * modRatio;

    const dt = 1 / SAMPLE_RATE;
    modPhase += modFreq * dt;
    phase += instFreq * dt;

    const modSig = Math.sin(2 * Math.PI * modPhase) * modDepth;
    const carrier = Math.sin(2 * Math.PI * phase + modSig);

    // Add a faint harmonic shimmer (2nd partial, like a real chirp overtone)
    const shimmer = Math.sin(2 * Math.PI * phase * 2 + modSig * 0.5) * 0.2;

    samples[i] = (carrier * 0.85 + shimmer) * env[i];
  }

  // Short reverb — bird call bouncing off foliage
  const wet = forestReverb(samples, 0.38);
  normalise(wet, 0.60);
  declick(wet, 32);
  return wet;
}

/**
 * success — ascending wind-chime tones with natural reverb.
 * Three chime voices in an open fifth/octave voicing, staggered 50ms apart.
 * Each chime: a bell partial set with faster high-partial decay (real chime physics).
 * Natural reverb makes it feel like chimes hanging in the forest.
 */
function synthForestSuccess(): Float32Array {
  const dur = 0.28; // 200ms + reverb tail
  const samples = alloc(dur);

  // Chime pitches: pentatonic ascending (fits a forest, avoids harsh minor intervals)
  const notes = [
    noteToHz("G", 5),  // 784 Hz
    noteToHz("A", 5),  // 880 Hz — whole step up
    noteToHz("C", 6),  // 1047 Hz — minor third up
  ];
  const offsets = [0, 0.05, 0.11]; // stagger each chime by 50ms

  // Bell/chime partial ratios (approximately tubular bell physics)
  const partials: Array<[number, number]> = [
    [1.0,    1.00],
    [2.756,  0.30],  // characteristic "bell 2nd partial" ratio
    [5.404,  0.10],
    [8.933,  0.04],
  ];

  for (let n = 0; n < notes.length; n++) {
    const startSample = Math.floor(offsets[n] * SAMPLE_RATE);
    const fund = notes[n];

    for (let i = startSample; i < samples.length; i++) {
      const t = (i - startSample) / SAMPLE_RATE;
      let v = 0;
      for (const [ratio, amp] of partials) {
        // Higher partials decay faster — key to chime realism
        const partialDecay = Math.exp(-t * (5 + ratio * 3));
        v += Math.sin(2 * Math.PI * fund * ratio * t) * amp * partialDecay;
      }
      samples[i] += v;
    }
  }

  // Lush reverb — chimes in a forest clearing
  const wet = forestReverb(samples, 0.50);
  normalise(wet, 0.65);
  declick(wet, 64);
  return wet;
}

/**
 * error — low rumble, like distant thunder.
 * Synthesis: low-frequency noise burst shaped with a slow attack and long
 * decay, passed through a band-pass filter centered around 80–120 Hz.
 * A subtle pitched component at ~80 Hz gives it a tonal core, like thunder
 * that resonates across the forest floor.
 */
function synthForestError(): Float32Array {
  const dur = 0.22; // 150ms + slow tail
  const samples = alloc(dur);

  const env = adsr(samples.length, 0.020, 0.080, 0.20, 0.090);

  const noise = makeNoise(0xDEAD1234);
  const lpState1 = new Float32Array(1);
  const lpState2 = new Float32Array(1);
  const hpState  = new Float32Array(2);

  // Thunder fundamental: a very low sine with slight wobble (rumble LFO)
  const thunderFreq = 82; // Hz — E2, deep chest resonance
  const lfoRate = 6.5;    // Hz — the trembling character of thunder

  for (let i = 0; i < samples.length; i++) {
    const t = i / SAMPLE_RATE;

    // White noise → bandpass around thunder region
    const rawNoise = noise();
    const lpd1 = lpFilter(rawNoise, 280, lpState1);
    const lpd2 = lpFilter(lpd1, 180, lpState2);
    const bandpass = hpFilter(lpd2, 40, hpState);

    // Low sine with LFO tremor — the tonal "boom" core
    const lfo = 1 + 0.3 * Math.sin(2 * Math.PI * lfoRate * t);
    const boom = Math.sin(2 * Math.PI * thunderFreq * t) * lfo * 0.6;

    samples[i] = (bandpass * 0.7 + boom) * env[i];
  }

  // Distant reverb — thunder rolling between hills
  const wet = forestReverb(samples, 0.55);
  normalise(wet, 0.72);
  declick(wet, 80);
  return wet;
}

/**
 * toggle — twig snap, crisp and quick.
 * Synthesis: a very sharp noise burst (the crack) with an immediate HP filter
 * to keep it crisp, plus a tiny low-freq body (the wood settling after the snap).
 * No sustain — just a clean, satisfying click.
 */
function synthForestToggle(): Float32Array {
  const dur = 0.09; // 60ms + tiny tail
  const samples = alloc(dur);

  // Crack transient: white noise burst, very short
  const crackEnv = expDecay(samples.length, 0.004);
  // Wood body: low thump, slightly longer
  const bodyEnv  = expDecay(samples.length, 0.018);
  const bodyFreq = noteToHz("D", 3); // 147 Hz — small wood pop

  const noise = makeNoise(0xC0FFEE42);
  const hpState = new Float32Array(2);
  const lpState = new Float32Array(1);

  for (let i = 0; i < samples.length; i++) {
    const t = i / SAMPLE_RATE;
    const rawNoise = noise();
    const crack = hpFilter(rawNoise, 1800, hpState) * crackEnv[i] * 0.9;
    const body = lpFilter(
      Math.sin(2 * Math.PI * bodyFreq * t),
      500, lpState
    ) * bodyEnv[i] * 0.6;
    samples[i] = crack + body;
  }

  // Very subtle reverb — twig snap has a brief echo in the trees
  const wet = forestReverb(samples, 0.22);
  normalise(wet, 0.52);
  declick(wet, 24);
  return wet;
}

/**
 * delete — leaves rustling away, filtered noise fading out.
 * Synthesis: band-pass noise starting with a bright mid-frequency cutoff that
 * rapidly sweeps downward (like leaves falling), with amplitude tapering to
 * nothing. Dry, organic, slightly airy. The rustling dies away completely.
 */
function synthForestDelete(): Float32Array {
  const dur = 0.22; // 150ms + tail
  const samples = alloc(dur);

  const env = adsr(samples.length, 0.006, 0.10, 0.05, 0.09);

  const noise = makeNoise(0x55AA77BB);
  const lpState = new Float32Array(1);
  const hpState = new Float32Array(2);

  // Cutoff sweeps: 3kHz → 300Hz over the sound duration
  const cutoffStart = 3000;
  const cutoffEnd   = 300;

  // Tiny descending sine undertone for the sense of "falling away"
  const sineStart = noteToHz("A", 4); // 440 Hz
  const sineEnd   = noteToHz("D", 3); // 147 Hz
  let phase = 0;

  for (let i = 0; i < samples.length; i++) {
    const t = i / SAMPLE_RATE;
    const progress = t / dur;

    const cutoff = cutoffStart * Math.pow(cutoffEnd / cutoffStart, progress);
    const filtered = hpFilter(
      lpFilter(noise() * 0.65, cutoff, lpState),
      cutoff * 0.15,
      hpState
    );

    const instFreq = sineStart * Math.pow(sineEnd / sineStart, progress);
    const dt = 1 / SAMPLE_RATE;
    phase += instFreq * dt;
    const sine = Math.sin(2 * Math.PI * phase) * 0.18;

    samples[i] = (filtered + sine) * env[i];
  }

  // Light reverb — leaves falling in a forest clearing
  const wet = forestReverb(samples, 0.30);
  normalise(wet, 0.55);
  declick(wet, 64);
  return wet;
}

/**
 * completion — cascading water drops forming an ascending melody.
 * Four drops, each a water-drop FM plunk, staggered 90ms apart, ascending
 * the pentatonic scale. Rich reverb blankets the whole texture.
 * The final drop has extra shimmer and a longer tail — the "reveal" moment.
 */
function synthForestCompletion(): Float32Array {
  const dur = 0.55; // 475ms + generous reverb wash
  const samples = alloc(dur);

  // Ascending pentatonic drop pitches — like drops in pools of different sizes
  // Larger pool = lower pitch; smaller pool = higher
  const dropFreqs = [
    noteToHz("G", 4),   // 392 Hz  — large pool
    noteToHz("A", 4),   // 440 Hz
    noteToHz("C", 5),   // 523 Hz
    noteToHz("E", 5),   // 659 Hz  — small puddle, bright
    noteToHz("G", 5),   // 784 Hz  — tiny drop on a leaf
  ];
  const dropOffsets = [0.0, 0.075, 0.155, 0.245, 0.335]; // seconds

  // FM plunk synthesis — same approach as navigate but with tunable parameters
  function addDrop(
    buf: Float32Array,
    freq: number,
    startSec: number,
    amplitude: number,
    decayTime: number,
    modDepthScale: number
  ): void {
    const startSample = Math.floor(startSec * SAMPLE_RATE);
    const modRatio = 3.2 + freq / 2000; // slightly different FM ratio per pitch
    const modDepth = freq * 1.8 * modDepthScale;
    const noise = makeNoise((freq * 1000) | 0);
    const noiseEnvDecay = decayTime * 0.04;

    for (let i = startSample; i < buf.length; i++) {
      const t = (i - startSample) / SAMPLE_RATE;
      const ampEnv = Math.exp(-t / (decayTime * SAMPLE_RATE / 5));
      if (ampEnv < 0.0001) break;

      const modDecayVal = Math.exp(-t / (noiseEnvDecay * SAMPLE_RATE / 5 * (freq / 400)));
      const modFreq = freq * modRatio;
      const modSig = Math.sin(2 * Math.PI * modFreq * t) * modDepth * modDecayVal;
      const carrier = Math.sin(2 * Math.PI * freq * t + modSig / (freq * 2 * Math.PI));
      const click = noise() * Math.exp(-t / (0.003 * SAMPLE_RATE / 5)) * 0.2;
      buf[i] += (carrier * 0.9 + click) * ampEnv * amplitude;
    }
  }

  // Layer all five drops
  for (let d = 0; d < dropFreqs.length; d++) {
    const isLast = d === dropFreqs.length - 1;
    addDrop(
      samples,
      dropFreqs[d],
      dropOffsets[d],
      isLast ? 1.0 : 0.75,          // last drop brighter
      isLast ? 0.18 : 0.12,         // last drop longer decay
      isLast ? 1.4 : 1.0            // last drop more FM shimmer
    );
  }

  // Lush reverb — like hearing drops in a cave behind a waterfall
  const wet = forestReverb(samples, 0.55);
  normalise(wet, 0.75);
  declick(wet, 128);
  return wet;
}

/**
 * ultra-completion — a full forest awakening.
 * Layered structure in four movements:
 *   0–150ms:  Bird calls layer — two short chirps ascending (FM synthesis)
 *   100–350ms: Wind chime cascade — three chimes ascending in a warm chord
 *   250–550ms: Rich warm tone swells — a low pad of stacked partials (additive)
 *              with slow attack and a gentle vibrato
 *   500–900ms: Resolution — bright open chord with shimmer, fading into
 *              a final waterfall-like wash of the reverb tail
 * All layers pass through a deep forest reverb, giving the sense of the
 * canopy opening up to reveal sunlight.
 */
function synthForestUltraCompletion(): Float32Array {
  const dur = 1.05; // 900ms + generous reverb
  const samples = alloc(dur);

  const noise = makeNoise(0xBEEFF00D);

  // === Movement 1: Bird calls (0–250ms) ===
  // Two short FM chirps — like a greeting from the canopy
  function addBirdChirp(
    buf: Float32Array,
    startSec: number,
    baseFreq: number,
    peakFreq: number,
    durationSec: number,
    amplitude: number
  ): void {
    const startSample = Math.floor(startSec * SAMPLE_RATE);
    const chirpSamples = Math.floor(durationSec * SAMPLE_RATE);
    const endSample = Math.min(buf.length, startSample + chirpSamples);
    const env = adsr(chirpSamples, 0.005, durationSec * 0.45, 0.25, durationSec * 0.35);
    const modRatio = 4.1;
    const modDepth = 0.75;
    let phase = 0, modPhase = 0;

    for (let i = startSample; i < endSample; i++) {
      const localI = i - startSample;
      const progress = localI / chirpSamples;
      // Rapid pitch glide up in first third, then hold
      const riseP = Math.min(1, progress / 0.3);
      const instFreq = baseFreq * Math.pow(peakFreq / baseFreq, riseP);
      const dt = 1 / SAMPLE_RATE;
      modPhase += instFreq * modRatio * dt;
      phase += instFreq * dt;
      const modSig = Math.sin(2 * Math.PI * modPhase) * modDepth;
      const v = Math.sin(2 * Math.PI * phase + modSig);
      buf[i] += v * env[localI] * amplitude;
    }
  }

  addBirdChirp(samples, 0.005, noteToHz("F", 6), noteToHz("C", 7), 0.065, 0.50);
  addBirdChirp(samples, 0.090, noteToHz("G", 6), noteToHz("D", 7), 0.060, 0.45);
  // A third answering chirp from "the other side of the clearing"
  addBirdChirp(samples, 0.185, noteToHz("A", 6), noteToHz("E", 7), 0.055, 0.38);

  // === Movement 2: Wind chime cascade (100–450ms) ===
  // Four chimes in an open voicing — G major add9 (G B D A)
  const chimeNotes = [
    noteToHz("G", 5),  // 784 Hz
    noteToHz("B", 5),  // 988 Hz
    noteToHz("D", 6),  // 1175 Hz
    noteToHz("A", 6),  // 1760 Hz — high shimmer
  ];
  const chimeOffsets = [0.10, 0.17, 0.25, 0.34];
  const chimeAmps    = [0.70, 0.65, 0.60, 0.45];

  const chimePartials: Array<[number, number]> = [
    [1.0,    1.00],
    [2.756,  0.28],
    [5.404,  0.09],
    [8.933,  0.03],
  ];

  for (let n = 0; n < chimeNotes.length; n++) {
    const startSample = Math.floor(chimeOffsets[n] * SAMPLE_RATE);
    const fund = chimeNotes[n];
    for (let i = startSample; i < samples.length; i++) {
      const t = (i - startSample) / SAMPLE_RATE;
      let v = 0;
      for (const [ratio, amp] of chimePartials) {
        const partialDecay = Math.exp(-t * (4 + ratio * 2.5));
        v += Math.sin(2 * Math.PI * fund * ratio * t) * amp * partialDecay;
      }
      samples[i] += v * chimeAmps[n];
    }
  }

  // === Movement 3: Warm pad swell (250–750ms) ===
  // Low additive pad — stacked harmonics with slow attack, vibrato, and warmth.
  // This is the "warm tone that swells" — feels like sunlight through leaves.
  {
    const padStart = 0.25;
    const padDur   = 0.55;
    const padStartSample = Math.floor(padStart * SAMPLE_RATE);
    const padSamples = Math.floor(padDur * SAMPLE_RATE);
    const padEnd = Math.min(samples.length, padStartSample + padSamples);
    const padEnv = adsr(padSamples, 0.18, 0.10, 0.70, 0.20);

    const padRoot = noteToHz("G", 3); // 196 Hz — warm, resonant bass
    const vibratoRate = 4.5; // Hz — natural-feeling vibrato

    // Harmonic series: fundamental + octave + fifth + 2nd octave + 3rd
    // These together create a rich, organ-like "forest hum"
    const padPartials: Array<[number, number]> = [
      [1.0, 0.60],
      [2.0, 0.35],
      [3.0, 0.20],  // fifth above octave
      [4.0, 0.14],
      [5.0, 0.09],  // major third (5th harmonic)
      [6.0, 0.06],
    ];

    for (let i = padStartSample; i < padEnd; i++) {
      const localI = i - padStartSample;
      const t = localI / SAMPLE_RATE;
      // Slow vibrato LFO — ramps in after 100ms
      const vibratoDepth = Math.min(t / 0.1, 1.0) * 0.012;
      const vibrato = 1 + vibratoDepth * Math.sin(2 * Math.PI * vibratoRate * t);
      let v = 0;
      for (const [ratio, amp] of padPartials) {
        v += Math.sin(2 * Math.PI * padRoot * ratio * vibrato * t) * amp;
      }
      samples[i] += v * padEnv[localI] * 0.45;
    }
  }

  // === Movement 4: Resolution chord + shimmer (500–900ms) ===
  // G major chord voiced openly — G4 B4 D5 G5, struck together with a bright
  // attack, fading with a shimmering tail like light through moving leaves.
  {
    const resStart = 0.50;
    const resDur   = 0.50;
    const resStartSample = Math.floor(resStart * SAMPLE_RATE);
    const resSamples = Math.floor(resDur * SAMPLE_RATE);
    const resEnd = Math.min(samples.length, resStartSample + resSamples);
    const resEnv = adsr(resSamples, 0.006, 0.09, 0.45, 0.35);

    const chordNotes = [
      noteToHz("G", 4),  // 392 Hz
      noteToHz("B", 4),  // 494 Hz
      noteToHz("D", 5),  // 587 Hz
      noteToHz("G", 5),  // 784 Hz
    ];

    // Bell/chime partials for each chord note
    for (const freq of chordNotes) {
      for (let i = resStartSample; i < resEnd; i++) {
        const localI = i - resStartSample;
        const t = localI / SAMPLE_RATE;
        const v = Math.sin(2 * Math.PI * freq * t) * 0.70
                + Math.sin(2 * Math.PI * freq * 2.756 * t) * Math.exp(-t * 12) * 0.20;
        samples[i] += v * resEnv[localI] * 0.40;
      }
    }

    // Shimmer layer: very high-frequency sparkle, like light refraction
    // Slightly detuned pairs of high tones beating against each other
    const shimmerFreqs: Array<[number, number]> = [
      [noteToHz("G", 7), noteToHz("G", 7) * 1.004],  // tiny detuning = shimmer
      [noteToHz("D", 7), noteToHz("D", 7) * 1.003],
    ];
    for (const [fa, fb] of shimmerFreqs) {
      for (let i = resStartSample; i < resEnd; i++) {
        const localI = i - resStartSample;
        const t = localI / SAMPLE_RATE;
        const shimmerEnv = Math.exp(-t * 6);
        samples[i] += (Math.sin(2 * Math.PI * fa * t) + Math.sin(2 * Math.PI * fb * t))
                      * shimmerEnv * 0.08;
      }
    }
  }

  // === Final: Deep, lush forest reverb ===
  // Heavier wet mix — the forest is vast, the sound fills the entire space.
  const wet = forestReverb(samples, 0.62);
  normalise(wet, 0.82);
  declick(wet, 256);
  return wet;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const OUT_DIR = "/Users/yifengsun/dev/pina/sounds/forest";

mkdirSync(OUT_DIR, { recursive: true });

console.log("\nGenerating pina forest sound profile...\n");

// Core UI sounds
writeSoundFile(OUT_DIR, "navigate.wav",   synthForestNavigate(0));
writeSoundFile(OUT_DIR, "enter.wav",      synthForestEnter());
writeSoundFile(OUT_DIR, "back.wav",       synthForestBack());
writeSoundFile(OUT_DIR, "action.wav",     synthForestAction());
writeSoundFile(OUT_DIR, "success.wav",    synthForestSuccess());
writeSoundFile(OUT_DIR, "error.wav",      synthForestError());
writeSoundFile(OUT_DIR, "toggle.wav",     synthForestToggle());
writeSoundFile(OUT_DIR, "delete.wav",     synthForestDelete());

console.log();

// navigate_0 through navigate_11 — chromatic variants (water drops in different pools)
for (let i = 0; i < 12; i++) {
  writeSoundFile(OUT_DIR, `navigate_${i}.wav`, synthForestNavigate(i));
}

console.log();

// Completion sounds
writeSoundFile(OUT_DIR, "completion.wav",       synthForestCompletion());
writeSoundFile(OUT_DIR, "ultra-completion.wav", synthForestUltraCompletion());

console.log(`\nDone. All files written to: ${OUT_DIR}\n`);
