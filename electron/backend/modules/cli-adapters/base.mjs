/**
 * CLI 适配器基类
 * 
 * 定义统一接口，各 CLI 工具适配器继承实现。
 * 支持 Claude Code、OpenAI Codex、GitHub Copilot CLI 等。
 */

import { spawn, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { app } from 'electron';
import logger from '../../core/logger.mjs';

function getServiceRepoRoot() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '..', '..', '..', '..');
}

function findNearestGitRoot(startDir) {
  let current = path.resolve(startDir);
  while (true) {
    if (fs.existsSync(path.resolve(current, '.git'))) return current;
    const parent = path.dirname(current);
    if (parent === current) return '';
    current = parent;
  }
}

function getClientRootDir() {
  if (app.isPackaged) return path.dirname(process.execPath);
  const repoRoot = getServiceRepoRoot();
  const gitRoot = findNearestGitRoot(repoRoot);
  return gitRoot || repoRoot;
}

function getDvsResourceDir() {
  const envResourceDir = String(process.env.DWEB_RESOURCE_DIR || '').trim();
  if (envResourceDir) return path.resolve(envResourceDir);
  return path.resolve(getClientRootDir(), 'DVSResource');
}

function getUserSettingsFilePath() {
  return path.resolve(getDvsResourceDir(), 'UserSettings', 'settings.json');
}

export function getProxyEnvVars() {
  try {
    const settingsPath = getUserSettingsFilePath();
    if (fs.existsSync(settingsPath)) {
      const raw = fs.readFileSync(settingsPath, 'utf-8');
      const settings = JSON.parse(raw);
      let httpProxy = String(settings.httpProxy || '').trim();
      if (httpProxy) {
        if (!/^https?:\/\//i.test(httpProxy)) {
          httpProxy = 'http://' + httpProxy;
        }
        logger.info(`[CLIAdapter] Using HTTP proxy from settings: ${httpProxy}`);
        return {
          HTTP_PROXY: httpProxy,
          HTTPS_PROXY: httpProxy,
          http_proxy: httpProxy,
          https_proxy: httpProxy,
          NO_PROXY: 'localhost,127.0.0.1',
          no_proxy: 'localhost,127.0.0.1',
        };
      }
    }
  } catch (err) {
    logger.error(`[CLIAdapter] Failed to read proxy settings: ${err.message}`);
  }
  return {};
}

/**
 * CLI 适配器事件类型
 */
export const CLIEventType = {
  TEXT_DELTA: 'text_delta',
  THINKING_DELTA: 'thinking_delta',
  TOOL_CALL_START: 'tool_call_start',
  TOOL_CALL_END: 'tool_call_end',
  TOOL_CALL_ERROR: 'tool_call_error',
  DONE: 'done',
  ERROR: 'error',
  SESSION_START: 'session_start',
  SESSION_END: 'session_end',
};

/**
 * CLI 可用性状态
 */
export const CLIAvailability = {
  AVAILABLE: 'available',
  NOT_INSTALLED: 'not_installed',
  VERSION_UNSUPPORTED: 'version_unsupported',
  AUTH_REQUIRED: 'auth_required',
  UNKNOWN: 'unknown',
};

/**
 * 环境检查项状态
 */
export const CheckStatus = {
  PENDING: 'pending',
  PASS: 'pass',
  FAIL: 'fail',
  WARN: 'warn',
  SKIPPED: 'skipped',
};

/**
 * CLI 适配器基类
 */
export class BaseCLIAdapter {
  constructor(cliConfig = {}) {
    this.cliConfig = cliConfig;
    this.process = null;
    this.sessionId = null;
    this.isRunning = false;
  }

  /**
   * 获取 CLI 命令名称
   */
  get commandName() {
    throw new Error('commandName must be implemented by subclass');
  }

  /**
   * 获取 CLI 显示名称
   */
  get displayName() {
    return this.commandName;
  }

  /**
   * 检查 CLI 是否可用
   * @returns {Promise<{available: boolean, version: string|null, status: string}>}
   */
  async checkAvailable() {
    try {
      const version = await this.getVersion();
      if (version) {
        return { available: true, version, status: CLIAvailability.AVAILABLE };
      }
      return { available: false, version: null, status: CLIAvailability.NOT_INSTALLED };
    } catch (err) {
      return { available: false, version: null, status: CLIAvailability.NOT_INSTALLED };
    }
  }

  /**
   * 获取 CLI 版本
   * @returns {Promise<string|null>}
   */
  async getVersion() {
    try {
      const result = await this.runCommand([ '--version' ], { timeout: 5000 });
      return result.stdout?.trim() || null;
    } catch {
      return null;
    }
  }

  /**
   * 运行命令（同步，用于版本检测等）
   * @param {string[]} args 
   * @param {object} options 
   */
  async runCommand(args, options = {}) {
    return new Promise((resolve, reject) => {
      const cmd = this.commandName;
      const timeout = options.timeout || 30000;
      const proxyEnv = getProxyEnvVars();
      
      let stdout = '';
      let stderr = '';

      const proc = spawn(cmd, args, {
        env: { ...process.env, ...proxyEnv, ...this.cliConfig.env },
        cwd: options.cwd || process.cwd(),
        shell: true,
      });

      const timer = setTimeout(() => {
        proc.kill();
        reject(new Error(`Command timed out after ${timeout}ms`));
      }, timeout);

      proc.stdout?.on('data', (data) => { stdout += data.toString(); });
      proc.stderr?.on('data', (data) => { stderr += data.toString(); });

      proc.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0) {
          resolve({ stdout, stderr, exitCode: code });
        } else {
          reject(new Error(`Command failed with exit code ${code}: ${stderr}`));
        }
      });

      proc.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  /**
   * 开始会话
   * @param {object} options - 会话选项
   * @returns {Promise<string>} sessionId
   */
  async startSession(options = {}) {
    throw new Error('startSession must be implemented by subclass');
  }

  /**
   * 结束会话
   * @param {string} sessionId 
   */
  async stopSession(sessionId) {
    if (this.process && this.process[sessionId]) {
      try {
        this.process[sessionId].kill();
      } catch (e) {
        logger.warn(`Failed to kill process for session ${sessionId}: ${e.message}`);
      }
      delete this.process[sessionId];
    }
    this.isRunning = false;
  }

  /**
   * 发送消息
   * @param {string} sessionId 
   * @param {string} content 
   * @param {object} options 
   * @returns {AsyncGenerator} 事件生成器
   */
  async sendMessage(sessionId, content, options = {}) {
    throw new Error('sendMessage must be implemented by subclass');
  }

  /**
   * 取消当前请求
   * @param {string} sessionId 
   */
  cancel(sessionId) {
    this.stopSession(sessionId);
  }

  /**
   * 解析 CLI 输出行为事件
   * @param {string} line 
   * @returns {object|null}
   */
  parseOutput(line) {
    throw new Error('parseOutput must be implemented by subclass');
  }

  /**
   * 执行完整环境检查（可选实现）
   * @returns {Promise<object>} EnvironmentCheckResult
   */
  async checkEnvironment() {
    const available = await this.checkAvailable();
    return {
      adapter: this.commandName,
      checkedAt: new Date().toISOString(),
      allPassed: available.available,
      checks: [
        {
          key: 'basic_available',
          label: `${this.displayName} 可用`,
          status: available.available ? CheckStatus.PASS : CheckStatus.FAIL,
          message: available.version || available.error || '未知状态'
        }
      ],
      models: undefined,
      version: available.version
    };
  }

  /**
   * 获取可用模型列表（可选实现）
   * @returns {Promise<Array>} CliModel[]
   */
  async listModels() {
    return [];
  }

  /**
   * 发送进度（用于某些 CLI 的确认提示）
   * @param {string} sessionId 
   * @param {string} input 
   */
  sendInput(sessionId, input) {
    if (this.process && this.process[sessionId] && this.process[sessionId].stdin) {
      this.process[sessionId].stdin.write(input + '\n');
    }
  }

  /**
   * 清理资源
   */
  dispose() {
    if (this.process) {
      for (const [sessionId, proc] of Object.entries(this.process)) {
        try {
          proc.kill();
        } catch (e) {
          // ignore
        }
      }
      this.process = {};
    }
  }
}

/**
 * 辅助函数：检测命令是否存在
 * @param {string} command 
 * @returns {boolean}
 */
export function commandExists(command) {
  try {
    if (process.platform === 'win32') {
      execSync(`where ${command}`, { stdio: 'ignore' });
    } else {
      execSync(`which ${command}`, { stdio: 'ignore' });
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * 辅助函数：查找命令路径
 * @param {string} command 
 * @returns {string|null}
 */
export function findCommandPath(command) {
  try {
    if (process.platform === 'win32') {
      const result = execSync(`where ${command}`, { encoding: 'utf8' });
      return result.trim().split('\n')[0];
    } else {
      const result = execSync(`which ${command}`, { encoding: 'utf8' });
      return result.trim();
    }
  } catch {
    return null;
  }
}

/**
 * 适配器注册表
 */
export const cliAdapterRegistry = new Map();

/**
 * 注册 CLI 适配器
 * @param {string} name 
 * @param {class} adapterClass 
 */
export function registerCLIAdapter(name, adapterClass) {
  cliAdapterRegistry.set(name, adapterClass);
}

/**
 * 获取 CLI 适配器
 * @param {string} name 
 * @returns {class|null}
 */
export function getCLIAdapterClass(name) {
  return cliAdapterRegistry.get(name) || null;
}
