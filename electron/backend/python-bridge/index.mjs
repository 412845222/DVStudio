/**
 * Python Bridge - Main entry point for Node.js to Python communication
 * 
 * This module exports the PythonBridge class that provides a unified API
 * for calling Python functions from Node.js, with support for:
 * - Regular function calls (call)
 * - Streaming calls (callStream)
 * - Request cancellation (cancel)
 * - Worker warmup (warmup)
 * - Pip package management (pip)
 */

import { PythonWorkerRuntime } from './runtime.mjs'
import { getPipManager } from './pip.mjs'
import { ErrorCodes, isError, getError } from './rpc.mjs'

const DEFAULT_OPTIONS = {
  logLevel: 'INFO',
  devMode: false,
  idleTimeout: 5 * 60 * 1000, // 5 minutes
}

/**
 * Python Bridge class - singleton manager for Python worker
 */
export class PythonBridge {
  constructor(options = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options }
    this.runtime = new PythonWorkerRuntime({
      ...this.options,
      onLog: (line) => this._handleLog(line),
      onCrash: (err) => this._handleCrash(err),
    })
  }
  
  /**
   * Call a Python method and wait for result
   * 
   * @param method - Method name (e.g., 'subtitle.understand')
   * @param params - Parameters object
   * @param options - Optional timeout and other settings
   * @returns Promise<any> - The result from Python handler
   */
  async call(method, params, options = {}) {
    return this.runtime.call(method, params, options)
  }
  
  /**
   * Call a Python method and stream results
   * 
   * @param method - Method name
   * @param params - Parameters object
   * @param options - Optional settings
   * @returns AsyncGenerator - Yields chunks from Python handler
   */
  async *callStream(method, params, options = {}) {
    yield* this.runtime.callStream(method, params, options)
  }
  
  /**
   * Cancel a pending request
   * 
   * @param requestId - The request ID to cancel
   * @returns boolean - Whether the cancellation was sent
   */
  async cancel(requestId) {
    return this.runtime.cancel(requestId)
  }
  
  /**
   * Warmup: start worker proactively before first request
   * 
   * Call this when user enters a page that will use Python features
   */
  async warmup() {
    return this.runtime.warmup()
  }
  
  /**
   * Shutdown: stop the worker and release resources
   */
  async shutdown() {
    return this.runtime.shutdown()
  }
  
  /**
   * Get current runtime state
   */
  getState() {
    return this.runtime.getState()
  }
  
  /**
   * Check if worker is healthy
   */
  isHealthy() {
    return this.runtime.isHealthy()
  }
  
  /**
   * Pip package management interface
   */
  get pip() {
    return {
      /**
       * Ensure a package is installed
       */
      ensurePackage: async (name, version, onProgress) => {
        const py = await this.runtime.detectPython()
        const pipManager = getPipManager(py, { onProgress })
        return pipManager.ensurePackage(name, version, { onProgress })
      },
      
      /**
       * Ensure all packages from requirements.txt are installed
       */
      ensureRequirements: async (requirementsPath, onProgress) => {
        const py = await this.runtime.detectPython()
        const pipManager = getPipManager(py, { onProgress })
        return pipManager.ensureRequirements(requirementsPath, { onProgress })
      },
      
      /**
       * Check if a package is installed
       */
      isInstalled: async (name) => {
        const py = await this.runtime.detectPython()
        const pipManager = getPipManager(py)
        return pipManager.isInstalled(name)
      },
      
      /**
       * List all installed packages
       */
      listInstalled: async () => {
        const py = await this.runtime.detectPython()
        const pipManager = getPipManager(py)
        return pipManager.listInstalled()
      },
    }
  }
  
  // === Private handlers ===
  
  _handleLog(line) {
    // Parse log level prefix
    const prefixMatch = line.match(/^\[(DEBUG|INFO|WARN|ERROR|CRITICAL)\]\s*/)
    const level = prefixMatch ? prefixMatch[1].toLowerCase() : 'info'
    const message = prefixMatch ? line.slice(prefixMatch[0].length) : line
    
    // Use appropriate console method
    switch (level) {
      case 'debug':
        console.debug('[Python]', message)
        break
      case 'info':
        console.info('[Python]', message)
        break
      case 'warn':
        console.warn('[Python]', message)
        break
      case 'error':
        console.error('[Python]', message)
        break
      case 'critical':
        console.error('[Python CRITICAL]', message)
        break
      default:
        console.log('[Python]', message)
    }
  }
  
  _handleCrash(err) {
    console.error('[PythonBridge] Worker crashed:', err.message)
    // Could emit an event for upper layers to handle
  }
}

/**
 * Create a singleton PythonBridge instance
 */
let _instance = null

export function getPythonBridge(options = {}) {
  if (!_instance) {
    _instance = new PythonBridge({
      ...options,
      devMode: options.devMode ?? (process.env.NODE_ENV === 'development'),
    })
  }
  return _instance
}

/**
 * Reset the singleton (for testing)
 */
export function resetPythonBridge() {
  if (_instance) {
    _instance.shutdown().catch(() => {})
    _instance = null
  }
}

// Export error codes
export { ErrorCodes, isError, getError }