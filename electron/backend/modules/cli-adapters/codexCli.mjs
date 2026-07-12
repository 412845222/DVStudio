/**
 * OpenAI Codex CLI 适配器
 *
 * 适配独立的 codex 二进制（Rust实现）：
 * - npm全局安装: npm install -g @openai/codex
 * - 官方安装脚本: curl/powershell 脚本
 * - 使用 `codex exec --json` 非交互式 JSONL 输出模式
 * - 每次发送消息启动新进程，无需维持长连接
 * - 支持 ChatGPT OAuth 登录 和 OpenAI API Key 两种认证方式
 */

import { spawn, exec } from 'child_process';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { shell } from 'electron';
import { BaseCLIAdapter, CLIEventType, CheckStatus, commandExists, findCommandPath, getProxyEnvVars } from './base.mjs';
import logger from '../../core/logger.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STDIO_BRIDGE_PATH = path.join(__dirname, '..', 'mcp', 'server', 'stdioBridge.mjs');

const CODEX_FALLBACK_MODELS = [
  { id: 'codex-mini', label: 'Codex Mini (推荐)', vendor: 'OpenAI Codex', capabilities: ['chat', 'code'], recommended: true },
  { id: 'gpt-5', label: 'GPT-5', vendor: 'OpenAI Codex', capabilities: ['chat', 'code', 'reasoning'] },
  { id: 'gpt-5-mini', label: 'GPT-5 Mini', vendor: 'OpenAI Codex', capabilities: ['chat', 'code'] },
  { id: 'gpt-5-nano', label: 'GPT-5 Nano', vendor: 'OpenAI Codex', capabilities: ['chat', 'code'] },
  { id: 'o4-mini', label: 'o4-mini', vendor: 'OpenAI Codex', capabilities: ['chat', 'code', 'reasoning'] },
];

function getCodexHomeDir() {
  return path.join(os.homedir(), '.codex');
}

function getCodexAuthFilePath() {
  return path.join(getCodexHomeDir(), 'auth.json');
}

function getCodexConfigFilePath() {
  return path.join(getCodexHomeDir(), 'config.toml');
}

function getNodePath() {
  try {
    const nodeCmd = process.platform === 'win32' ? 'node.exe' : 'node';
    const nodePath = findCommandPath(nodeCmd);
    if (nodePath && fs.existsSync(nodePath)) {
      return nodePath;
    }
  } catch {}
  logger.warn('[CodexCLI] Could not find node executable via findCommandPath, using "node" as fallback');
  return 'node';
}

function ensureDvstudioMcpProfile() {
  try {
    const codexHome = getCodexHomeDir();
    if (!fs.existsSync(codexHome)) {
      fs.mkdirSync(codexHome, { recursive: true });
    }

    const configPath = getCodexConfigFilePath();
    const bridgePath = STDIO_BRIDGE_PATH.replace(/\\/g, '/');
    const nodePath = getNodePath().replace(/\\/g, '/');
    const mcpServerConfig = `
[mcp_servers.dvstudio]
command = "${nodePath}"
args = ["${bridgePath}"]
startup_timeout_sec = 30
`;

    let configContent = '';
    try {
      configContent = fs.readFileSync(configPath, 'utf8');
    } catch {
      configContent = '';
    }

    const lines = configContent.split('\n');
    const newLines = [];
    let inDvstudioSection = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === '[mcp_servers.dvstudio]') {
        inDvstudioSection = true;
        continue;
      }
      if (inDvstudioSection) {
        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
          inDvstudioSection = false;
          newLines.push(line);
        }
        continue;
      }
      newLines.push(line);
    }

    let finalContent = newLines.join('\n').trimEnd() + mcpServerConfig;

    if (finalContent !== configContent) {
      fs.writeFileSync(configPath, finalContent + '\n', 'utf8');
      logger.info(`[CodexCLI] DVStudio MCP server config updated in ${configPath}`);
    }

    return true;
  } catch (err) {
    logger.warn(`[CodexCLI] Failed to update MCP config: ${err.message}`);
    return false;
  }
}

function getNpmGlobalBinDir() {
  try {
    if (process.platform === 'win32') {
      const npmPrefix = path.join(os.homedir(), 'AppData', 'Roaming', 'npm');
      return npmPrefix;
    }
    const npmPrefix = '/usr/local';
    return path.join(npmPrefix, 'bin');
  } catch {
    return null;
  }
}

function stripAnsi(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '')
    .replace(/\x1B\][^\x07\x1B]*[\x07\x1B\\]/g, '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/\u001b\[[0-9;]*[A-Za-z]/g, '')
    .replace(/\u009b\[[0-9;]*[A-Za-z]/g, '')
    .replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '')
    .replace(/\r/g, '');
}

function parseDeviceAuthOutput(text) {
  const cleaned = stripAnsi(text);
  const result = {
    verificationUri: null,
    userCode: null,
    expiresIn: null,
    raw: cleaned,
  };

  const urlMatch = cleaned.match(/https?:\/\/[^\s`'"<>)]+/);
  if (urlMatch) {
    result.verificationUri = urlMatch[0].replace(/[)\].,;:'"`]+$/, '').replace(/^[`'"]+/, '');
  }

  const lines = cleaned.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  const codePatterns = [
    /\b([A-Z]{2,}[0-9][A-Z0-9]*-[A-Z0-9]+)\b/,
    /\b([A-Z0-9]{4}-[A-Z0-9]{4,5})\b/,
    /\b([A-Z0-9]{3}-[A-Z0-9]{3}-[A-Z0-9]{3})\b/,
  ];

  for (const line of lines) {
    for (const pattern of codePatterns) {
      const match = line.match(pattern);
      if (match && match[1]) {
        const candidate = match[1];
        if (/[0-9]/.test(candidate) && candidate.length >= 7 && candidate.length <= 12) {
          result.userCode = candidate;
          break;
        }
      }
    }
    if (result.userCode) break;
  }

  if (!result.userCode) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/one-time code|enter this code|verification code|device code/i.test(line) && !/authorization|phishing|share/i.test(line)) {
        for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
          const codeLine = lines[j].replace(/^[`'"\s]+|[`'"\s]+$/g, '');
          const codeMatch = codeLine.match(/^([A-Z0-9]{3,}[- ]?[A-Z0-9]{3,}[- ]?[A-Z0-9]{0,})$/);
          if (codeMatch && /[0-9]/.test(codeMatch[1])) {
            result.userCode = codeMatch[1].replace(/\s+/g, '');
            break;
          }
        }
        if (result.userCode) break;
      }
    }
  }

  const expiresMatch = cleaned.match(/expires?\s+in\s+(\d+)\s*(minute|min|second|sec)/i);
  if (expiresMatch) {
    const num = parseInt(expiresMatch[1], 10);
    const unit = expiresMatch[2].toLowerCase();
    result.expiresIn = unit.startsWith('min') ? num * 60 : num;
  }

  return result;
}

function waitForFile(filePath, timeoutMs = 300000, pollIntervalMs = 2000) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    let pollTimer = null;

    const cleanup = () => {
      if (pollTimer) clearInterval(pollTimer);
    };

    const check = () => {
      try {
        if (fs.existsSync(filePath)) {
          try {
            const raw = fs.readFileSync(filePath, 'utf8');
            const auth = JSON.parse(raw);
            const hasToken = auth && (
              (auth.tokens && (auth.tokens.access_token || auth.tokens.api_key || auth.tokens.token)) ||
              auth.access_token || auth.api_key || auth.token ||
              (auth.OPENAI_API_KEY && String(auth.OPENAI_API_KEY).startsWith('sk-'))
            );
            if (hasToken) {
              cleanup();
              resolve(true);
              return;
            }
          } catch {}
        }
      } catch {}

      if (Date.now() - startTime > timeoutMs) {
        cleanup();
        reject(new Error('认证等待超时，请重试'));
        return;
      }
    };

    pollTimer = setInterval(check, pollIntervalMs);
    check();

    return {
      cancel: () => {
        cleanup();
        reject(new Error('认证已取消'));
      }
    };
  });
}

export class CodexCliAdapter extends BaseCLIAdapter {
  constructor(cliConfig = {}) {
    super(cliConfig);
    this.sessions = new Map();
    this.codexBinaryPath = null;
    this.authProcess = null;
    this.authWaitCancel = null;
  }

  get commandName() {
    return 'codex';
  }

  get displayName() {
    return 'OpenAI Codex';
  }

  async checkAvailable() {
    const binary = this.resolveCodexBinary();
    if (!binary) {
      return { available: false, version: null, status: 'not_installed' };
    }
    try {
      const version = await this.getVersion();
      return { available: true, version, status: 'available' };
    } catch (err) {
      return { available: false, version: null, status: 'unknown', error: err.message };
    }
  }

  async getVersion() {
    try {
      const binary = this.resolveCodexBinary();
      if (!binary) return 'unknown';
      const result = await this.runCommandDirect(binary, ['--version'], { timeout: 15000 });
      return (result.stdout || result.stderr || '').trim().split('\n')[0].trim() || 'unknown';
    } catch {
      return 'unknown';
    }
  }

  resolveCodexBinary() {
    if (this.codexBinaryPath && fs.existsSync(this.codexBinaryPath)) {
      return this.codexBinaryPath;
    }

    if (process.platform === 'win32') {
      const codexLocalBin = path.join(os.homedir(), 'AppData', 'Local', 'OpenAI', 'Codex', 'bin');
      if (fs.existsSync(codexLocalBin)) {
        try {
          const entries = fs.readdirSync(codexLocalBin);
          for (const entry of entries) {
            const exePath = path.join(codexLocalBin, entry, 'codex.exe');
            if (fs.existsSync(exePath)) {
              this.codexBinaryPath = exePath;
              logger.info(`[CodexCLI] Found native codex.exe at: ${exePath}`);
              return exePath;
            }
          }
        } catch (err) {
          logger.warn(`[CodexCLI] Error scanning Codex bin directory: ${err.message}`);
        }
      }

      const codexConfigPath = getCodexConfigFilePath();
      if (fs.existsSync(codexConfigPath)) {
        try {
          const configRaw = fs.readFileSync(codexConfigPath, 'utf-8');
          const cliPathMatch = configRaw.match(/CODEX_CLI_PATH\s*=\s*['"]([^'"]+)['"]/);
          if (cliPathMatch && cliPathMatch[1] && fs.existsSync(cliPathMatch[1])) {
            this.codexBinaryPath = cliPathMatch[1];
            logger.info(`[CodexCLI] Found codex binary from config.toml CODEX_CLI_PATH: ${cliPathMatch[1]}`);
            return cliPathMatch[1];
          }
        } catch {}
      }
    }

    if (commandExists('codex')) {
      this.codexBinaryPath = findCommandPath('codex');
      return this.codexBinaryPath;
    }

    const npmBinDir = getNpmGlobalBinDir();
    if (npmBinDir) {
      const candidates = process.platform === 'win32'
        ? [
            path.join(npmBinDir, 'codex.cmd'),
            path.join(npmBinDir, 'codex.exe'),
            path.join(npmBinDir, 'node_modules', '@openai', 'codex', 'bin', 'codex.cmd'),
          ]
        : [
            path.join(npmBinDir, 'codex'),
            path.join(npmBinDir, 'node_modules', '@openai', 'codex', 'bin', 'codex'),
          ];
      for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
          this.codexBinaryPath = candidate;
          return candidate;
        }
      }
    }

    const localInstalls = process.platform === 'win32'
      ? [
          path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'codex', 'codex.exe'),
          path.join(os.homedir(), 'AppData', 'Roaming', 'npm', 'codex.cmd'),
        ]
      : [
          path.join(os.homedir(), '.local', 'bin', 'codex'),
          path.join(os.homedir(), '.npm-global', 'bin', 'codex'),
          '/usr/local/bin/codex',
          '/opt/homebrew/bin/codex',
        ];
    for (const candidate of localInstalls) {
      if (fs.existsSync(candidate)) {
        this.codexBinaryPath = candidate;
        return candidate;
      }
    }

    return null;
  }

  runCommandDirect(binaryPath, args, options = {}) {
    return new Promise((resolve, reject) => {
      const timeout = options.timeout || 30000;
      const proxyEnv = getProxyEnvVars();
      let stdout = '';
      let stderr = '';
      const isWinCmd = process.platform === 'win32' && /\.(cmd|bat)$/i.test(binaryPath);

      const proc = spawn(binaryPath, args, {
        env: { ...process.env, ...proxyEnv, NO_COLOR: '1' },
        cwd: options.cwd || process.cwd(),
        shell: isWinCmd,
        windowsHide: true,
      });

      const timer = setTimeout(() => {
        proc.kill();
        reject(new Error(`Command timed out after ${timeout}ms`));
      }, timeout);

      proc.stdout?.on('data', (data) => { stdout += data.toString(); });
      proc.stderr?.on('data', (data) => { stderr += data.toString(); });

      proc.on('close', (code) => {
        clearTimeout(timer);
        resolve({ stdout, stderr, exitCode: code });
      });

      proc.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  isAuthenticated() {
    try {
      const authPath = getCodexAuthFilePath();
      if (fs.existsSync(authPath)) {
        const raw = fs.readFileSync(authPath, 'utf8');
        const auth = JSON.parse(raw);
        if (auth) {
          if (auth.tokens && (auth.tokens.access_token || auth.tokens.api_key || auth.tokens.token)) {
            return true;
          }
          if (auth.access_token || auth.api_key || auth.token) {
            return true;
          }
          if (auth.OPENAI_API_KEY && String(auth.OPENAI_API_KEY).startsWith('sk-')) {
            return true;
          }
        }
      }

      const configPath = getCodexConfigFilePath();
      if (fs.existsSync(configPath)) {
        const content = fs.readFileSync(configPath, 'utf8');
        if (/openai_api_key\s*=\s*"sk-[^"]+"/.test(content) || /api_key\s*=\s*"sk-[^"]+"/.test(content)) {
          return true;
        }
      }

      if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.startsWith('sk-')) {
        return true;
      }
      if (process.env.CODEX_ACCESS_TOKEN) {
        return true;
      }
    } catch (err) {
      logger.debug(`[CodexCLI] Auth check error: ${err.message}`);
    }
    return false;
  }

  async checkEnvironment() {
    const checks = [];
    let allPassed = true;

    const codexBin = this.resolveCodexBinary();
    checks.push({
      key: 'codex_installed',
      label: 'OpenAI Codex CLI 已安装',
      status: codexBin ? CheckStatus.PASS : CheckStatus.FAIL,
      message: codexBin ? `路径: ${codexBin}` : '未找到codex命令，请先安装Codex CLI',
      helpUrl: 'https://developers.openai.com/codex',
      action: codexBin ? undefined : {
        label: '安装 Codex CLI',
        command: 'npm install -g @openai/codex'
      }
    });
    if (!codexBin) allPassed = false;

    let codexVersion = null;
    if (codexBin) {
      try {
        codexVersion = await this.getVersion();
        checks.push({
          key: 'codex_version',
          label: 'Codex CLI 版本',
          status: CheckStatus.PASS,
          message: codexVersion
        });
      } catch (err) {
        checks.push({
          key: 'codex_version',
          label: 'Codex CLI 版本',
          status: CheckStatus.WARN,
          message: `无法获取版本: ${err.message}`
        });
      }
    } else {
      checks.push({
        key: 'codex_version',
        label: 'Codex CLI 版本',
        status: CheckStatus.SKIPPED,
        message: 'Codex未安装'
      });
    }

    const nodeAvailable = commandExists('node') || commandExists('node.exe');
    checks.push({
      key: 'node_installed',
      label: 'Node.js 运行时',
      status: nodeAvailable ? CheckStatus.PASS : CheckStatus.WARN,
      message: nodeAvailable ? 'Node.js 已安装（npm安装方式需要）' : 'Node.js 未找到（如通过npm安装则需要）',
      helpUrl: 'https://nodejs.org/'
    });

    let authenticated = false;
    if (codexBin) {
      authenticated = this.isAuthenticated();
      checks.push({
        key: 'codex_auth',
        label: 'Codex 账号已认证',
        status: authenticated ? CheckStatus.PASS : CheckStatus.FAIL,
        message: authenticated ? '已认证' : '未检测到登录状态，请完成ChatGPT登录或配置API Key',
        action: authenticated ? undefined : {
          label: '登录 Codex',
          type: 'device_auth_flow'
        }
      });
      if (!authenticated) allPassed = false;
    } else {
      checks.push({
        key: 'codex_auth',
        label: 'Codex 账号已认证',
        status: CheckStatus.SKIPPED,
        message: 'Codex未安装'
      });
    }

    let models = [];
    if (codexBin && authenticated) {
      try {
        models = await this.listModels();
        if (models.length > 0) {
          checks.push({
            key: 'codex_access',
            label: 'Codex 服务可访问',
            status: CheckStatus.PASS,
            message: `获取到 ${models.length} 个可用模型`
          });
        } else {
          allPassed = false;
          checks.push({
            key: 'codex_access',
            label: 'Codex 服务可访问',
            status: CheckStatus.WARN,
            message: '使用默认模型列表，请确认订阅/API Key有效'
          });
          models = CODEX_FALLBACK_MODELS;
        }
      } catch (err) {
        allPassed = false;
        checks.push({
          key: 'codex_access',
          label: 'Codex 服务可访问',
          status: CheckStatus.FAIL,
          message: `无法访问Codex: ${err.message}`,
          helpUrl: 'https://developers.openai.com/codex'
        });
      }
    } else {
      checks.push({
        key: 'codex_access',
        label: 'Codex 服务可访问',
        status: CheckStatus.SKIPPED,
        message: '前置检查未通过'
      });
    }

    return {
      adapter: 'codex',
      checkedAt: new Date().toISOString(),
      allPassed,
      checks,
      models: allPassed ? models : (models.length > 0 ? models : undefined),
      version: codexVersion || undefined
    };
  }

  cancelAuth() {
    if (this.authWaitCancel) {
      try { this.authWaitCancel(); } catch {}
      this.authWaitCancel = null;
    }
    if (this.authProcess) {
      try { this.authProcess.kill(); } catch {}
      this.authProcess = null;
    }
  }

  async *startAuthFlow() {
    this.cancelAuth();

    const codexBin = this.resolveCodexBinary();
    if (!codexBin) {
      yield { type: 'error', message: 'Codex CLI 未安装，请先安装' };
      return;
    }

    logger.info(`[CodexCLI] Starting auth flow with binary: ${codexBin}`);

    if (this.isAuthenticated()) {
      yield { type: 'success', message: '已经登录' };
      return;
    }

    yield { type: 'starting', message: '正在启动 Codex 设备码认证...' };

    const proxyEnv = getProxyEnvVars();
    let combinedBuf = '';
    let codeFound = false;
    let authInfo = null;
    let browserOpened = false;
    let flowDone = false;
    let flowError = null;
    const isWinCmd = process.platform === 'win32' && /\.(cmd|bat)$/i.test(codexBin);
    const spawnEnv = {
      ...process.env,
      ...proxyEnv,
      NO_COLOR: '1',
      TERM: 'dumb',
      CLICOLOR: '0',
      NODE_DISABLE_COLORS: '1',
    };

    const events = [];
    let eventsResolve = null;
    const pushEvent = (ev) => {
      events.push(ev);
      if (eventsResolve) {
        const r = eventsResolve;
        eventsResolve = null;
        r();
      }
    };
    const waitForEvent = () => new Promise((r) => { eventsResolve = r; });

    logger.info(`[CodexCLI] Spawning auth process, shell=${isWinCmd}, proxy=${proxyEnv.HTTPS_PROXY || 'none'}`);

    const proc = spawn(codexBin, ['login', '--device-auth'], {
      env: spawnEnv,
      cwd: process.cwd(),
      shell: isWinCmd,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    this.authProcess = proc;

    proc.on('spawn', () => {
      logger.info(`[CodexCLI] Auth process spawned successfully, PID: ${proc.pid}`);
      pushEvent({ type: 'spawned', pid: proc.pid });
    });

    proc.on('error', (err) => {
      logger.error(`[CodexCLI] Auth process error: ${err.message}`);
      pushEvent({ type: 'proc_error', message: err.message });
    });

    proc.on('close', (code) => {
      logger.info(`[CodexCLI] Auth process exited with code: ${code}`);
      pushEvent({ type: 'proc_close', code });
    });

    const tryParse = () => {
      if (codeFound) return;
      const cleaned = stripAnsi(combinedBuf);
      const parsed = parseDeviceAuthOutput(cleaned);

      if (parsed.verificationUri && parsed.userCode) {
        codeFound = true;
        authInfo = parsed;
        logger.info(`[CodexCLI] Got auth code: ${parsed.userCode}, URL: ${parsed.verificationUri}`);
        pushEvent({ type: 'code_ready', auth: parsed });
      }
    };

    const onStdout = (data) => {
      const text = data.toString();
      logger.debug(`[CodexCLI][stdout]: ${text.substring(0, 500)}`);
      combinedBuf += text;
      const cleanedLine = stripAnsi(text);
      if (cleanedLine.trim()) {
        pushEvent({ type: 'raw_output', text: cleanedLine, stream: 'stdout' });
      }
      tryParse();
    };

    const onStderr = (data) => {
      const text = data.toString();
      logger.debug(`[CodexCLI][stderr]: ${text.substring(0, 500)}`);
      combinedBuf += text;
      const cleanedLine = stripAnsi(text);
      if (cleanedLine.trim()) {
        pushEvent({ type: 'raw_output', text: cleanedLine, stream: 'stderr' });
      }
      tryParse();
    };

    proc.stdout.on('data', onStdout);
    proc.stderr.on('data', onStderr);

    const fallbackTimeout = setTimeout(() => {
      if (!codeFound) {
        pushEvent({ type: 'fallback_manual' });
      }
    }, 8000);

    const startTime = Date.now();
    const overallTimeout = setTimeout(() => {
      pushEvent({ type: 'fatal_timeout' });
    }, 120000);

    let pollTimer = null;
    let authWaitStart = 0;
    const startPollingAuth = () => {
      if (pollTimer) return;
      authWaitStart = Date.now();
      const authPath = getCodexAuthFilePath();
      pollTimer = setInterval(() => {
        try {
          if (fs.existsSync(authPath)) {
            const raw = fs.readFileSync(authPath, 'utf8');
            const auth = JSON.parse(raw);
            const hasToken = auth && (
              (auth.tokens && (auth.tokens.access_token || auth.tokens.api_key || auth.tokens.token)) ||
              auth.access_token || auth.api_key || auth.token ||
              (auth.OPENAI_API_KEY && String(auth.OPENAI_API_KEY).startsWith('sk-'))
            );
            if (hasToken) {
              clearInterval(pollTimer);
              pollTimer = null;
              pushEvent({ type: 'auth_success' });
              return;
            }
          }
        } catch {}
        const timeoutMs = (authInfo?.expiresIn || 900) * 1000;
        if (Date.now() - authWaitStart > timeoutMs) {
          clearInterval(pollTimer);
          pollTimer = null;
          pushEvent({ type: 'auth_timeout' });
        }
      }, 1500);
      this.authWaitCancel = () => {
        if (pollTimer) {
          clearInterval(pollTimer);
          pollTimer = null;
        }
        pushEvent({ type: 'auth_cancelled' });
      };
    };

    try {
      while (!flowDone) {
        if (events.length === 0) {
          await waitForEvent();
        }
        const ev = events.shift();
        if (!ev) continue;

        switch (ev.type) {
          case 'spawned':
            yield { type: 'spawned', message: '认证进程已启动，等待获取验证码...' };
            break;

          case 'raw_output':
            yield { type: 'raw_output', text: ev.text };
            break;

          case 'proc_error':
            throw new Error(`认证进程启动失败: ${ev.message}`);

          case 'proc_close':
            if (pollTimer) {
              clearInterval(pollTimer);
              pollTimer = null;
            }
            if (this.isAuthenticated()) {
              flowDone = true;
              yield { type: 'success', message: 'Codex 登录成功！' };
            } else if (!codeFound) {
              throw new Error(`认证进程意外退出 (code=${ev.code})，请检查网络连接或代理设置`);
            }
            break;

          case 'code_ready': {
            const a = ev.auth;
            clearTimeout(fallbackTimeout);
            yield {
              type: 'code_ready',
              verificationUri: a.verificationUri,
              userCode: a.userCode,
              expiresIn: a.expiresIn || 900,
              message: '已获取认证信息'
            };

            if (!browserOpened) {
              browserOpened = true;
              try {
                await shell.openExternal(a.verificationUri);
                logger.info(`[CodexCLI] Opened browser to: ${a.verificationUri}`);
                yield { type: 'browser_opened', message: '已在浏览器中打开认证页面' };
              } catch (err) {
                logger.warn(`[CodexCLI] Failed to open browser: ${err.message}`);
                yield { type: 'browser_open_failed', message: `无法自动打开浏览器: ${err.message}`, verificationUri: a.verificationUri };
              }
              yield { type: 'waiting', message: '请在浏览器中输入验证码并完成登录...' };
              startPollingAuth();
            }
            break;
          }

          case 'fallback_manual':
            clearTimeout(fallbackTimeout);
            if (!codeFound) {
              codeFound = true;
              authInfo = { expiresIn: 900 };
              yield {
                type: 'fallback_manual',
                message: '自动获取验证码较慢，您可以手动打开认证页面',
                defaultUri: 'https://auth.openai.com/codex/device',
                rawOutput: stripAnsi(combinedBuf),
              };
              startPollingAuth();
            }
            break;

          case 'fatal_timeout':
            throw new Error('获取认证信息超时，请检查网络连接和代理设置后重试');

          case 'auth_success':
            flowDone = true;
            yield { type: 'success', message: 'Codex 登录成功！' };
            break;

          case 'auth_timeout':
            throw new Error('认证超时，请重试');

          case 'auth_cancelled':
            throw new Error('认证已取消');
        }
      }
    } catch (err) {
      logger.error(`[CodexCLI] Auth flow error: ${err.message}`);
      yield { type: 'error', message: err.message || '认证失败' };
    } finally {
      clearTimeout(fallbackTimeout);
      clearTimeout(overallTimeout);
      this.authWaitCancel = null;
      if (this.authProcess === proc) {
        try { proc.kill(); } catch {}
        this.authProcess = null;
      }
    }
  }

  async runFixAction(checkKey) {
    switch (checkKey) {
      case 'codex_installed': {
        return new Promise((resolve) => {
          const isWin = process.platform === 'win32';
          const isMac = process.platform === 'darwin';
          const proxyEnv = getProxyEnvVars();
          const proxyEnvParts = Object.entries(proxyEnv);
          let cmd;
          if (isWin) {
            const envSetCmd = proxyEnvParts.map(([k, v]) => `set "${k}=${v}"`).join(' && ');
            const prefix = envSetCmd ? `${envSetCmd} && ` : '';
            cmd = `start "OpenAI Codex 安装" cmd /k "${prefix}npm install -g @openai/codex && echo 安装完成后请关闭此窗口"`;
          } else if (isMac) {
            const envExports = proxyEnvParts.map(([k, v]) => `export ${k}="${v}"`).join('; ');
            const prefix = envExports ? `${envExports}; ` : '';
            cmd = `osascript -e 'tell application "Terminal" to do script "${prefix}npm install -g @openai/codex; echo 安装完成后请关闭此窗口"'`;
          } else {
            const envExports = proxyEnvParts.map(([k, v]) => `export ${k}="${v}"`).join('; ');
            const prefix = envExports ? `${envExports}; ` : '';
            cmd = `x-terminal-emulator -e bash -c "${prefix}npm install -g @openai/codex; echo 安装完成后请关闭此窗口; exec bash"`;
          }
          exec(cmd, (error) => {
            if (error) {
              resolve({ ok: false, output: error.message, interactive: true, message: '无法打开终端，请手动运行: npm install -g @openai/codex（若有代理请先设置HTTP_PROXY环境变量）' });
            } else {
              resolve({ ok: true, output: '', interactive: true, message: '已打开终端窗口，请等待 npm 安装完成' });
            }
          });
        });
      }
      case 'codex_auth': {
        return {
          ok: true,
          requiresStreamAuth: true,
          adapter: 'codex',
          message: '请按照引导完成 Codex 设备码认证'
        };
      }
      default:
        throw new Error(`Unknown fix action: ${checkKey}`);
    }
  }

  async listModels() {
    const codexBin = this.resolveCodexBinary();
    if (!codexBin) {
      return CODEX_FALLBACK_MODELS;
    }

    try {
      const models = await new Promise((resolve, reject) => {
        const isWinCmd = process.platform === 'win32' && /\.(cmd|bat)$/i.test(codexBin);
        const proxyEnv = getProxyEnvVars();
        
        const proc = spawn(codexBin, ['debug', 'models'], {
          env: {
            ...process.env,
            ...proxyEnv,
            NO_COLOR: '1',
            TERM: 'dumb',
          },
          shell: isWinCmd,
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
        });

        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (d) => { stdout += d.toString(); });
        proc.stderr.on('data', (d) => { stderr += d.toString(); });

        proc.on('error', reject);
        proc.on('close', (code) => {
          if (code !== 0) {
            reject(new Error(`codex debug models exited with code ${code}: ${stderr.substring(0, 200)}`));
            return;
          }
          try {
            const data = JSON.parse(stdout);
            const modelList = Array.isArray(data.models) ? data.models : [];
            const filteredModels = modelList
              .filter(m => m.visibility !== 'hide' && m.slug && m.display_name)
              .sort((a, b) => (a.priority || 0) - (b.priority || 0))
              .map((m, idx) => ({
                id: m.slug,
                label: m.display_name,
                vendor: 'OpenAI Codex',
                capabilities: this.parseModelCapabilities(m),
                recommended: idx === 0,
                contextWindow: m.context_window,
                description: m.description,
              }));
            resolve(filteredModels.length > 0 ? filteredModels : CODEX_FALLBACK_MODELS);
          } catch (err) {
            reject(new Error(`Failed to parse models output: ${err.message}`));
          }
        });

        setTimeout(() => {
          try { proc.kill(); } catch {}
          reject(new Error('Models fetch timed out'));
        }, 15000);
      });

      return models;
    } catch (err) {
      logger.warn(`[CodexCLI] Failed to fetch dynamic models: ${err.message}, using fallback`);
      return CODEX_FALLBACK_MODELS;
    }
  }

  parseModelCapabilities(model) {
    const caps = ['chat', 'code'];
    if (model.supports_search_tool) caps.push('web_search');
    if (model.input_modalities?.includes('image')) caps.push('image');
    if (model.supports_parallel_tool_calls) caps.push('parallel_tools');
    if (model.supported_reasoning_levels && model.supported_reasoning_levels.length > 0) caps.push('reasoning');
    return caps;
  }

  async startSession(options = {}) {
    const sessionId = `codex_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    const codexBin = this.resolveCodexBinary();
    if (!codexBin) {
      throw new Error('Codex CLI binary not found. Please run environment check first.');
    }

    const session = {
      id: sessionId,
      codexBin,
      cwd: options.cwd || process.cwd(),
      active: true,
    };

    this.sessions.set(sessionId, session);
    logger.info(`[CodexCLI] Session created: ${sessionId}, binary: ${codexBin}, cwd: ${session.cwd}`);
    return sessionId;
  }

  async *sendMessage(sessionId, content, options = {}) {
    const session = this.sessions.get(sessionId);
    if (!session || !session.active) {
      yield { type: CLIEventType.ERROR, error: '会话不存在或已关闭' };
      return;
    }

    const codexBin = session.codexBin || this.resolveCodexBinary();
    if (!codexBin) {
      yield { type: CLIEventType.ERROR, error: 'Codex CLI 未找到' };
      return;
    }

    const model = options.model || this.cliConfig.model || 'codex-mini';

    yield { type: CLIEventType.THINKING_DELTA, content: '正在启动 Codex...' };

    const proxyEnv = getProxyEnvVars();
    const isWinCmd = process.platform === 'win32' && /\.(cmd|bat)$/i.test(codexBin);

    ensureDvstudioMcpProfile();

    const mcpInstruction = `你是DVStudio的AI工作流助手。DVStudio是一个AI工作流蓝图编辑器，提供了名为"dvstudio"的MCP工具服务器。

# 重要规则
1. 必须使用dvstudio MCP工具操作工作流蓝图，绝对不要读取/修改文件系统代码，也不要执行shell命令
2. 创建节点前，先调用 get_blueprint_state 了解当前蓝图状态（返回值包含viewport视口信息：zoom/panX/panY/centerWorldX/centerWorldY）
3. 创建节点时，如果不确定正确的节点类型ID，先调用 list_node_types 获取所有可用类型，然后再调用 create_node
4. create_node的type参数必须使用list_node_types返回的type值（actionId，如image-generation表示图片节点，text-generation表示文本节点，blender表示Blender 3D节点）
5. **绝对不要给create_node传入position、x、y参数**。系统会自动将新节点放置在用户当前蓝图视口中心，并自动避开已有节点。传入错误坐标会导致节点创建到视口外，用户看不到节点！
6. 不要试图分析项目源代码，直接通过MCP工具完成所有操作
7. get_blueprint_state返回的viewport.centerWorldX/centerWorldY是用户当前视口中心的世界坐标，仅供你了解用户视角，创建节点时系统自动使用

## Blender 3D工具使用说明
当用户需要操作Blender 3D场景时，使用以blender_为前缀的工具：
- 开始任务时，先调用 blender_list_workspace_images 查看工作区是否有参考图，再调用 blender_read_workspace_image 读取参考图了解目标形态
- 操作前先调用 blender_get_objects_summary 了解场景结构
- 使用blender_execute_blender_code执行bpy Python代码（必须设置result字典返回结果）
- 修改场景后调用blender_get_screenshot_of_area_as_image验证结果（默认截取VIEW_3D视口）
- **截图自动保存到工作区**：截图工具返回结果中包含截图的绝对文件路径，可通过 blender_read_workspace_image 重新查看历史截图
- 需要重新查看截图或参考图时，使用 blender_read_workspace_image 工具（传入相对路径如 "screenshots/xxx.png"）
- 如果调用Blender工具时提示未连接，请提醒用户先在Blender节点面板中点击"连接Blender"

`;
    const enhancedContent = mcpInstruction + content;

    const args = [
      'exec',
      '--json',
      '--skip-git-repo-check',
      '--ephemeral',
      '--color', 'never',
      '--dangerously-bypass-approvals-and-sandbox',
      '-c', 'web_search="disabled"',
      '--disable', 'shell_tool',
      '--disable', 'computer_use',
      '--disable', 'browser_use',
      '--disable', 'browser_use_external',
      '--disable', 'browser_use_full_cdp_access',
      '--disable', 'in_app_browser',
      '--disable', 'image_generation',
      '--disable', 'hooks',
      '--disable', 'multi_agent',
      '--disable', 'apps',
      '-C', session.cwd,
    ];

    if (model) {
      args.push('-m', model);
    }

    args.push(enhancedContent);

    logger.info(`[CodexCLI] Running: codex ${args.join(' ')}`);

    const proc = spawn(codexBin, args, {
      env: {
        ...process.env,
        ...proxyEnv,
        NO_COLOR: '1',
        TERM: 'dumb',
        CODEX_DISABLE_TELEMETRY: '1',
      },
      cwd: session.cwd,
      shell: isWinCmd,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stdoutBuf = '';
    let stderrBuf = '';
    let fullText = '';
    let toolCall = null;
    let procError = null;
    let procExited = false;
    let exitCode = null;

    const chunkQueue = [];
    let resolver = null;
    let rejecter = null;
    let streamDone = false;

    const queueChunk = (chunk) => {
      if (chunk.type === CLIEventType.TEXT_DELTA) {
        fullText += chunk.content || '';
      }
      chunkQueue.push(chunk);
      if (resolver) {
        const r = resolver;
        resolver = null;
        r();
      }
    };

    const waitForChunk = () => new Promise((resolve, reject) => {
      resolver = resolve;
      rejecter = reject;
    });

    const signalDone = () => {
      streamDone = true;
      if (resolver) {
        const r = resolver;
        resolver = null;
        r();
      }
    };

    const signalError = (err) => {
      procError = err;
      streamDone = true;
      queueChunk({ type: CLIEventType.ERROR, error: err.message });
    };

    const parseJsonLine = (line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    };

    const processLine = (line) => {
      const obj = parseJsonLine(line);
      if (!obj) {
        if (line.trim()) {
          logger.debug(`[CodexCLI] Non-JSON line: ${line.substring(0, 200)}`);
        }
        return;
      }

      logger.debug(`[CodexCLI] JSON type=${obj.type || 'unknown'}: ${JSON.stringify(obj).substring(0, 300)}`);

      switch (obj.type) {
        case 'thread.started': {
          if (obj.thread_id) {
            session.threadId = obj.thread_id;
          }
          break;
        }

        case 'turn.started': {
          break;
        }

        case 'item.started': {
          const item = obj.item;
          if (!item) break;

          const itemType = String(item.type || '');
          logger.debug(`[CodexCLI] item.started type=${itemType}: ${JSON.stringify(item).substring(0, 400)}`);

          if (itemType === 'command_execution') {
            const cmd = item.command || '';
            logger.debug(`[CodexCLI] Command execution started (should be disabled): ${cmd.substring(0, 200)}`);
          } else if (itemType === 'mcp_tool_call' || itemType === 'tool_call' || itemType === 'tool_use' || item.tool || item.name) {
            const toolName = item.tool || item.name || '';
            if (toolName) {
              if (toolCall) {
                queueChunk({
                  type: CLIEventType.TOOL_CALL_END,
                  toolCallId: toolCall.id,
                  tool: toolCall.name,
                  output: 'Interrupted by new tool call'
                });
              }
              toolCall = {
                id: item.id || `tool_${Date.now()}`,
                name: toolName,
                server: item.server || '',
                input: item.arguments || item.input || item.parameters || {},
              };
              logger.info(`[CodexCLI] Tool call started: ${toolName} (${toolCall.id})`);
              queueChunk({
                type: CLIEventType.TOOL_CALL_START,
                toolCallId: toolCall.id,
                tool: toolCall.name,
                input: toolCall.input,
              });
            }
          }
          break;
        }

        case 'item.completed': {
          const item = obj.item;
          if (!item) break;

          const itemType = String(item.type || '');
          logger.debug(`[CodexCLI] item.completed type=${itemType}: ${JSON.stringify(item).substring(0, 400)}`);

          if (itemType === 'agent_message' || itemType === 'message') {
            const text = item.text || item.content || '';
            if (text) {
              queueChunk({ type: CLIEventType.TEXT_DELTA, content: text });
            }
          } else if (itemType === 'error') {
            const errMsg = item.message || '';
            if (errMsg && !errMsg.includes('Skill descriptions were shortened')) {
              logger.warn(`[CodexCLI] Item error: ${errMsg}`);
            }
          } else if (itemType === 'mcp_tool_call' || itemType === 'tool_call' || itemType === 'tool_use' || item.tool || item.name) {
            const toolName = item.tool || item.name || (toolCall ? toolCall.name : '');
            const tcId = item.id || (toolCall ? toolCall.id : `tool_${Date.now()}`);
            if (toolCall || toolName) {
              if (item.error) {
                const errMsg = typeof item.error === 'string' ? item.error : (item.error.message || JSON.stringify(item.error));
                logger.warn(`[CodexCLI] Tool call error: ${toolName} - ${errMsg}`);
                queueChunk({
                  type: CLIEventType.TOOL_CALL_ERROR,
                  toolCallId: tcId,
                  tool: toolName,
                  error: errMsg,
                });
              } else {
                let result;
                if (item.result !== null && item.result !== undefined) {
                  result = (typeof item.result === 'string') ? (() => {
                    const trimmed = item.result.trim();
                    if ((trimmed.startsWith('{') || trimmed.startsWith('['))) {
                      try { return JSON.parse(trimmed); } catch { return item.result; }
                    }
                    return item.result;
                  })() : item.result;
                } else if (item.output !== null && item.output !== undefined) {
                  result = (typeof item.output === 'string') ? (() => {
                    const trimmed = item.output.trim();
                    if ((trimmed.startsWith('{') || trimmed.startsWith('['))) {
                      try { return JSON.parse(trimmed); } catch { return item.output; }
                    }
                    return item.output;
                  })() : item.output;
                } else {
                  result = item.status === 'failed' ? 'Tool call failed' : 'Success';
                }
                logger.info(`[CodexCLI] Tool call completed: ${toolName}`);
                queueChunk({
                  type: CLIEventType.TOOL_CALL_END,
                  toolCallId: tcId,
                  tool: toolName,
                  output: result,
                });
              }
              toolCall = null;
            }
          } else if (itemType === 'command_execution') {
            const cmd = item.command || '';
            const output = item.aggregated_output || '';
            logger.debug(`[CodexCLI] Command execution completed: ${cmd.substring(0, 150)}, exit_code=${item.exit_code}`);
          } else {
            logger.debug(`[CodexCLI] Unhandled item.completed type: ${itemType}`);
          }
          break;
        }

        case 'turn.completed': {
          break;
        }

        case 'assistant': {
          const content = obj.content || obj.message?.content;
          if (typeof content === 'string' && content) {
            queueChunk({ type: CLIEventType.TEXT_DELTA, content });
          } else if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === 'text' && block.text) {
                queueChunk({ type: CLIEventType.TEXT_DELTA, content: block.text });
              } else if (block.type === 'tool_use' || block.type === 'tool_call') {
                if (toolCall) {
                  queueChunk({
                    type: CLIEventType.TOOL_CALL_END,
                    toolCallId: toolCall.id,
                    tool: toolCall.name,
                    output: 'Interrupted by new tool call'
                  });
                }
                toolCall = {
                  id: block.id || `tool_${Date.now()}`,
                  name: block.name || block.tool || '',
                  input: block.input || block.arguments || {},
                };
                queueChunk({
                  type: CLIEventType.TOOL_CALL_START,
                  toolCallId: toolCall.id,
                  tool: toolCall.name,
                  input: toolCall.input,
                });
              }
            }
          }
          break;
        }

        case 'thinking': {
          const thinking = obj.thinking || obj.content || '';
          if (thinking) {
            queueChunk({ type: CLIEventType.THINKING_DELTA, content: thinking });
          }
          break;
        }

        case 'tool_call':
        case 'tool_use': {
          if (toolCall) {
            queueChunk({
              type: CLIEventType.TOOL_CALL_END,
              toolCallId: toolCall.id,
              tool: toolCall.name,
              output: 'Interrupted by new tool call'
            });
          }
          toolCall = {
            id: obj.id || `tool_${Date.now()}`,
            name: obj.name || obj.tool || '',
            input: obj.input || obj.arguments || obj.parameters || {},
          };
          queueChunk({
            type: CLIEventType.TOOL_CALL_START,
            toolCallId: toolCall.id,
            tool: toolCall.name,
            input: toolCall.input,
          });
          break;
        }

        case 'tool_result': {
          if (toolCall) {
            const rawResult = obj.result || obj.content || obj.output || '';
            let parsedResult = rawResult;
            if (typeof rawResult === 'string') {
              const trimmed = rawResult.trim();
              if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                try { parsedResult = JSON.parse(trimmed); } catch { parsedResult = rawResult; }
              }
            }
            queueChunk({
              type: CLIEventType.TOOL_CALL_END,
              toolCallId: toolCall.id,
              tool: toolCall.name,
              output: parsedResult,
            });
            toolCall = null;
          }
          break;
        }

        case 'item':
        case 'delta': {
          if (obj.delta?.type === 'text_delta' || obj.type === 'text_delta') {
            const text = obj.delta?.text || obj.text || obj.content || '';
            if (text) {
              queueChunk({ type: CLIEventType.TEXT_DELTA, content: text });
            }
          } else if (obj.delta?.type === 'thinking_delta') {
            const thinking = obj.delta?.thinking || obj.thinking || '';
            if (thinking) {
              queueChunk({ type: CLIEventType.THINKING_DELTA, content: thinking });
            }
          } else if (obj.text) {
            queueChunk({ type: CLIEventType.TEXT_DELTA, content: obj.text });
          }
          break;
        }

        case 'error': {
          const errMsg = obj.message || obj.error || JSON.stringify(obj);
          signalError(new Error(errMsg));
          break;
        }

        case 'result': {
          if (obj.result?.status === 'error') {
            const errMsg = obj.result.message || obj.result.error || 'Codex execution failed';
            signalError(new Error(errMsg));
          }
          break;
        }

        default:
          if (obj.content && typeof obj.content === 'string') {
            queueChunk({ type: CLIEventType.TEXT_DELTA, content: obj.content });
          } else if (obj.text && typeof obj.text === 'string') {
            queueChunk({ type: CLIEventType.TEXT_DELTA, content: obj.text });
          }
          break;
      }
    };

    proc.stdout.on('data', (data) => {
      const text = data.toString();
      stdoutBuf += text;
      let idx;
      while ((idx = stdoutBuf.indexOf('\n')) !== -1) {
        const line = stdoutBuf.substring(0, idx).trim();
        stdoutBuf = stdoutBuf.substring(idx + 1);
        if (line) {
          processLine(line);
        }
      }
    });

    proc.stderr.on('data', (data) => {
      const text = data.toString();
      stderrBuf += text;
      const cleaned = stripAnsi(text);
      if (cleaned.trim()) {
        logger.debug(`[CodexCLI][stderr]: ${cleaned.substring(0, 300)}`);
      }
    });

    proc.on('error', (err) => {
      logger.error(`[CodexCLI] Process error: ${err.message}`);
      signalError(err);
    });

    proc.on('close', (code) => {
      exitCode = code;
      procExited = true;
      logger.info(`[CodexCLI] Process exited with code: ${code}`);

      if (stdoutBuf.trim()) {
        processLine(stdoutBuf.trim());
      }

      if (toolCall) {
        queueChunk({ type: CLIEventType.TOOL_CALL_END, toolCallId: toolCall.id, tool: toolCall.name, output: 'Process exited' });
        toolCall = null;
      }

      if (code !== 0 && fullText.length === 0 && !procError) {
        const stderrClean = stripAnsi(stderrBuf).trim();
        let errMsg = `Codex 进程退出 (code=${code})`;
        if (stderrClean) {
          errMsg += ': ' + stderrClean.split('\n').slice(-3).join('; ');
        }
        signalError(new Error(errMsg));
      } else {
        signalDone();
      }
    });

    try {
      while (!streamDone || chunkQueue.length > 0) {
        if (chunkQueue.length > 0) {
          yield chunkQueue.shift();
        } else {
          await waitForChunk();
        }
      }

      if (procError && fullText.length === 0) {
        yield { type: CLIEventType.ERROR, error: procError.message };
      } else {
        yield { type: CLIEventType.DONE };
      }
    } catch (err) {
      yield { type: CLIEventType.ERROR, error: err.message };
    } finally {
      if (!procExited) {
        try { proc.kill(); } catch {}
      }
    }
  }

  async stopSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.active = false;
      this.sessions.delete(sessionId);
      logger.info(`[CodexCLI] Session stopped: ${sessionId}`);
    }
  }

  cancel(sessionId) {
    this.stopSession(sessionId);
  }

  dispose() {
    for (const [sessionId, session] of this.sessions) {
      session.active = false;
    }
    this.sessions.clear();
    this.cancelAuth();
  }
}
