import fs from 'node:fs'
import path from 'node:path'

export function detectVenv(projectPath: string): string | undefined {
  const candidates = ['.venv', 'venv']
  for (const candidate of candidates) {
    const venvPath = path.join(projectPath, candidate)
    if (fs.existsSync(venvPath) && fs.statSync(venvPath).isDirectory()) {
      const activatePath = path.join(venvPath, 'bin', 'activate')
      if (fs.existsSync(activatePath)) {
        return candidate
      }
    }
  }
  return undefined
}

export function getActivateCommand(projectPath: string, venvName: string): string {
  return `source ${path.join(projectPath, venvName, 'bin', 'activate')}`
}
