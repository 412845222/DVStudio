/**
 * pip Package Manager - Lazy install for Python dependencies
 * 
 * Supports:
 * - ensurePackage: Install a single package
 * - ensureRequirements: Install from requirements.txt
 * - Progress callbacks for frontend display
 */

import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const PIP_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes for pip operations

/**
 * Create a pip manager for the given Python runtime
 */
export function getPipManager(pythonCommand, options = {}) {
  return new PipManager(pythonCommand, options)
}

class PipManager {
  constructor(pythonCommand, options = {}) {
    this.py = pythonCommand
    this.options = {
      timeout: options.timeout ?? PIP_TIMEOUT_MS,
      onProgress: options.onProgress ?? (() => {}),
      pythonDir: pythonCommand.pythonDir || null,
    }
    this._installedCache = new Map() // Package name -> version
  }
  
  /**
   * Check if a package is installed
   */
  async isInstalled(name) {
    if (this._installedCache.has(name)) return true
    
    const cmd = this.py.command
    const args = [...this.py.argsPrefix, '-m', 'pip', 'show', name]
    
    try {
      const result = await this._runPipAsync(cmd, args)
      if (result.status === 0) {
        // Parse version from output
        const versionMatch = result.stdout.match(/Version:\s*(\S+)/)
        if (versionMatch) {
          this._installedCache.set(name, versionMatch[1])
        }
        return true
      }
      return false
    } catch {
      return false
    }
  }
  
  /**
   * Ensure a single package is installed
   */
  async ensurePackage(name, version = null, options = {}) {
    const spec = version ? `${name}==${version}` : name
    const alreadyInstalled = await this.isInstalled(name)
    
    if (alreadyInstalled && !version) return { ok: true, cached: true }
    
    // If version specified and already installed, check if matches
    if (alreadyInstalled && version) {
      const installedVersion = this._installedCache.get(name)
      if (installedVersion === version) return { ok: true, cached: true }
      // Version mismatch - reinstall
    }
    
    const onProgress = options.onProgress ?? this.options.onProgress
    
    onProgress({ stage: 'installing', package: spec, message: `Installing ${spec}...` })
    
    const cmd = this.py.command
    const args = [
      ...this.py.argsPrefix,
      '-m', 'pip', 'install',
      '--disable-pip-version-check',
      '--no-cache-dir',
      spec,
    ]
    
    // Use bundled python's site-packages if available
    if (this.options.pythonDir) {
      const sitePackages = path.resolve(this.options.pythonDir, 'Lib', 'site-packages')
      if (fs.existsSync(sitePackages)) {
        args.push('--target', sitePackages)
      }
    }
    
    try {
      const result = await this._runPipAsync(cmd, args, { 
        timeout: this.options.timeout,
        onProgress: (line) => {
          // Parse pip output for progress
          const progressMatch = line.match(/Collecting\s+(\S+)/)
          if (progressMatch) {
            onProgress({ stage: 'collecting', package: progressMatch[1] })
          }
          const downloadingMatch = line.match(/Downloading\s+(\S+)/)
          if (downloadingMatch) {
            onProgress({ stage: 'downloading', url: downloadingMatch[1] })
          }
          const installingMatch = line.match(/Installing\s+collected\s+packages/)
          if (installingMatch) {
            onProgress({ stage: 'installing', message: 'Installing collected packages...' })
          }
        }
      })
      
      if (result.status === 0) {
        this._installedCache.set(name, version || 'unknown')
        onProgress({ stage: 'done', package: spec })
        return { ok: true }
      } else {
        onProgress({ stage: 'error', package: spec, error: result.stderr })
        return { ok: false, error: result.stderr }
      }
    } catch (err) {
      onProgress({ stage: 'error', package: spec, error: err.message })
      return { ok: false, error: err.message }
    }
  }
  
  /**
   * Ensure all packages from a requirements.txt file are installed
   */
  async ensureRequirements(requirementsPath, options = {}) {
    if (!fs.existsSync(requirementsPath)) {
      return { ok: false, error: `requirements.txt not found: ${requirementsPath}` }
    }
    
    const onProgress = options.onProgress ?? this.options.onProgress
    
    // Parse requirements to count packages
    const content = fs.readFileSync(requirementsPath, 'utf-8')
    const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('#'))
    const packageCount = lines.length
    
    onProgress({ 
      stage: 'starting', 
      count: packageCount, 
      message: `Installing ${packageCount} packages from ${path.basename(requirementsPath)}...`
    })
    
    const cmd = this.py.command
    const args = [
      ...this.py.argsPrefix,
      '-m', 'pip', 'install',
      '--disable-pip-version-check',
      '-r', requirementsPath,
    ]
    
    // Use bundled python's site-packages if available
    if (this.options.pythonDir) {
      const sitePackages = path.resolve(this.options.pythonDir, 'Lib', 'site-packages')
      if (fs.existsSync(sitePackages)) {
        args.push('--target', sitePackages)
      }
    }
    
    try {
      const result = await this._runPipAsync(cmd, args, {
        timeout: this.options.timeout * 2, // More time for bulk install
        onProgress: (line) => {
          // Parse pip output for progress
          const progressMatch = line.match(/Collecting\s+(\S+)/)
          if (progressMatch) {
            onProgress({ stage: 'collecting', package: progressMatch[1] })
          }
          const downloadingMatch = line.match(/Downloading\s+(\S+)/)
          if (downloadingMatch) {
            onProgress({ stage: 'downloading', url: downloadingMatch[1] })
          }
        }
      })
      
      if (result.status === 0) {
        // Cache all packages from requirements
        for (const line of lines) {
          const pkgMatch = line.match(/^(\w+)/)
          if (pkgMatch) {
            this._installedCache.set(pkgMatch[1], 'installed')
          }
        }
        onProgress({ stage: 'done', message: 'All packages installed' })
        return { ok: true }
      } else {
        onProgress({ stage: 'error', error: result.stderr })
        return { ok: false, error: result.stderr }
      }
    } catch (err) {
      onProgress({ stage: 'error', error: err.message })
      return { ok: false, error: err.message }
    }
  }
  
  /**
   * Get list of installed packages
   */
  async listInstalled() {
    const cmd = this.py.command
    const args = [...this.py.argsPrefix, '-m', 'pip', 'list', '--format=json']
    
    try {
      const result = await this._runPipAsync(cmd, args)
      if (result.status === 0) {
        return JSON.parse(result.stdout)
      }
      return []
    } catch {
      return []
    }
  }
  
  // === Private methods ===
  
  _runPipAsync(cmd, args, options = {}) {
    const timeout = options.timeout ?? this.options.timeout
    const onProgress = options.onProgress ?? (() => {})
    
    return new Promise((resolve) => {
      let stdout = ''
      let stderr = ''
      
      const proc = spawn(cmd, args, {
        windowsHide: true,
        timeout,
      })
      
      proc.stdout.on('data', (data) => {
        stdout += data.toString()
        const lines = data.toString().split('\n')
        for (const line of lines) {
          if (line.trim()) onProgress(line.trim())
        }
      })
      
      proc.stderr.on('data', (data) => {
        stderr += data.toString()
        const lines = data.toString().split('\n')
        for (const line of lines) {
          if (line.trim()) onProgress(line.trim())
        }
      })
      
      proc.on('close', (code) => {
        resolve({ status: code, stdout, stderr })
      })
      
      proc.on('error', (err) => {
        resolve({ status: -1, stdout, stderr: err.message })
      })
    })
  }
}