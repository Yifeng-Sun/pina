import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadRegistry, saveRegistry } from './config.js'
import type { SoundProfile } from '../types.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function resolveSoundsDir(): string {
  let current = __dirname
  const root = path.parse(current).root
  while (true) {
    const candidate = path.join(current, 'sounds')
    if (fs.existsSync(candidate)) return candidate
    if (current === root) break
    current = path.dirname(current)
  }
  // Fallback: still return a path so errors surface clearly if missing
  return path.join(__dirname, '..', '..', 'sounds')
}

const SOUNDS_DIR = resolveSoundsDir()

// All available profiles (for CLI `pina sound <profile>`)
export const SOUND_PROFILES: SoundProfile[] = ['default', 'cyberpunk', 'forest', 'dreamy']

// Profiles available in the dashboard toggle cycle
export const ACTIVE_PROFILES: SoundProfile[] = ['default', 'dreamy']

const SOUND_FILES = {
  navigate:           'navigate.wav',
  enter:              'enter.wav',
  back:               'back.wav',
  action:             'action.wav',
  success:            'success.wav',
  error:              'error.wav',
  toggle:             'toggle.wav',
  delete:             'delete.wav',
  completion:         'completion.wav',
  'ultra-completion': 'ultra-completion.wav',
} as const

export type SoundEvent = keyof typeof SOUND_FILES

/**
 * Play a sound effect. Non-blocking — spawns afplay in a detached process.
 *
 * @param event - The sound event type
 * @param index - Optional index for pitch variation (0-11 for navigate sounds).
 *                Higher index = higher pitch (semitone steps).
 */
export function playSound(event: SoundEvent, index?: number): void {
  const registry = loadRegistry()
  if (registry.config.muted) return

  const profile = registry.config.soundProfile

  let file: string
  if (event === 'navigate' && index !== undefined) {
    const semitone = index % 12
    file = path.join(SOUNDS_DIR, profile, `navigate_${semitone}.wav`)
  } else {
    file = path.join(SOUNDS_DIR, profile, SOUND_FILES[event])
  }

  const child = spawn('afplay', [file], {
    detached: true,
    stdio: 'ignore',
  })
  child.unref()
}

export function isMuted(): boolean {
  return loadRegistry().config.muted
}

export function setMuted(muted: boolean): void {
  const registry = loadRegistry()
  registry.config.muted = muted
  saveRegistry(registry)
}

export function toggleMute(): boolean {
  const registry = loadRegistry()
  registry.config.muted = !registry.config.muted
  saveRegistry(registry)
  return registry.config.muted
}

export function getSoundProfile(): SoundProfile {
  return loadRegistry().config.soundProfile
}

export function setSoundProfile(profile: SoundProfile): void {
  const registry = loadRegistry()
  registry.config.soundProfile = profile
  saveRegistry(registry)
}

export function cycleSoundProfile(): SoundProfile {
  const registry = loadRegistry()
  const currentIdx = ACTIVE_PROFILES.indexOf(registry.config.soundProfile)
  // If current profile isn't in the active list, start from the beginning
  const nextIdx = currentIdx === -1 ? 0 : (currentIdx + 1) % ACTIVE_PROFILES.length
  const next = ACTIVE_PROFILES[nextIdx]!
  registry.config.soundProfile = next
  saveRegistry(registry)
  return next
}
