/**
 * Copilot CLI 适配器
 * 
 * 适配新版 GitHub Copilot CLI (v1.0+)：
 * - gh 内置 copilot 命令，自动下载 copilot 二进制到 %LOCALAPPDATA%\GitHub CLI\copilot\
 * - 使用 `copilot.exe -p <prompt> --output-format json --stream on` 进行流式对话
 * - 事件类型: assistant.message_delta (deltaContent), assistant.message (完整内容), result (结束)
 */

import { spawn, exec } from 'child_process';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { BaseCLIAdapter, CLIEventType, CheckStatus, commandExists, findCommandPath, getProxyEnvVars } from './base.mjs';
import logger from '../../core/logger.mjs';

function getBuiltinCopilotPath() {
  if (process.platform === 'win32') {
    return path.join(os.homedir(), 'AppData', 'Local', 'GitHub CLI', 'copilot', 'copilot.exe');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'GitHub CLI', 'copilot', 'copilot');
  }
  return path.join(os.homedir(), '.local', 'share', 'gh', 'copilot', 'copilot');
}

const FALLBACK_MODELS = [
  { id: 'auto', label: 'Auto (推荐)', vendor: 'GitHub Copilot', capabilities: ['chat', 'code'], recommended: true },
  { id: 'gpt-5.4-mini', label: 'GPT-5.4 Mini', vendor: 'GitHub Copilot', capabilities: ['chat', 'code'] },
  { id: 'gpt-5.4', label: 'GPT-5.4', vendor: 'GitHub Copilot', capabilities: ['chat', 'code', 'reasoning'] },
  { id: 'claude-sonnet-4.5', label: 'Claude Sonnet 4.5', vendor: 'GitHub Copilot', capabilities: ['chat', 'code'] },
  { id: 'o4-mini', label: 'o4-mini', vendor: 'GitHub Copilot', capabilities: ['chat', 'code', 'reasoning'] },
];

export class CopilotCliAdapter extends BaseCLIAdapter {
  constructor(cliConfig = {}) {
    super(cliConfig);
    this.processes = new Map();
    this.copilotBinaryPath = null;
  }

  get commandName() {
    return 'gh';
  }

  get displayName() {
    return 'GitHub Copilot';
  }

  async checkAvailable() {
    if (!commandExists(this.commandName)) {
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
      const result = await this.runCommand(['copilot', '--version'], { timeout: 30000 });
      return result.stdout?.trim() || 'unknown';
    } catch {
      return 'unknown';
    }
  }

  resolveCopilotBinary() {
    if (this.copilotBinaryPath && fs.existsSync(this.copilotBinaryPath)) {
      return this.copilotBinaryPath;
    }
    const builtin = getBuiltinCopilotPath();
    if (fs.existsSync(builtin)) {
      this.copilotBinaryPath = builtin;
      return builtin;
    }
    if (commandExists('copilot')) {
      this.copilotBinaryPath = findCommandPath('copilot');
      return this.copilotBinaryPath;
    }
    return null;
  }

  async ensureCopilotBinary() {
    const existing = this.resolveCopilotBinary();
    if (existing) return existing;

    logger.info('[CopilotCLI] Copilot binary not found, triggering download via gh copilot --version');
    try {
      await this.runCommand(['copilot', '--version'], { timeout: 120000 });
    } catch (err) {
      logger.warn(`[CopilotCLI] gh copilot --version failed: ${err.message}`);
    }

    return this.resolveCopilotBinary();
  }

  async checkEnvironment() {
    const checks = [];
    let allPassed = true;

    const ghExists = commandExists(this.commandName);
    const ghPath = ghExists ? findCommandPath(this.commandName) : null;
    checks.push({
      key: 'gh_installed',
      label: 'GitHub CLI (gh) 已安装',
      status: ghExists ? CheckStatus.PASS : CheckStatus.FAIL,
      message: ghExists ? `路径: ${ghPath}` : '未找到gh命令，请先安装GitHub CLI',
      helpUrl: 'https://cli.github.com/',
      action: ghExists ? undefined : {
        label: '查看安装指南',
        command: 'https://cli.github.com/manual/installation'
      }
    });
    if (!ghExists) allPassed = false;

    let ghVersion = null;
    if (ghExists) {
      try {
        const result = await this.runCommand(['--version'], { timeout: 10000 });
        ghVersion = (result.stdout || '').trim().split('\n')[0].trim();
        checks.push({
          key: 'gh_version',
          label: 'GitHub CLI 版本',
          status: CheckStatus.PASS,
          message: ghVersion
        });
      } catch (err) {
        checks.push({
          key: 'gh_version',
          label: 'GitHub CLI 版本',
          status: CheckStatus.WARN,
          message: `无法获取版本: ${err.message}`
        });
      }
    } else {
      checks.push({
        key: 'gh_version',
        label: 'GitHub CLI 版本',
        status: CheckStatus.SKIPPED,
        message: 'gh未安装'
      });
    }

    let copilotReady = false;
    let copilotVersion = null;
    if (ghExists) {
      try {
        const copilotBin = await this.ensureCopilotBinary();
        if (copilotBin) {
          copilotReady = true;
          try {
            const vResult = await this.runCommand(['copilot', '--version'], { timeout: 15000 });
            copilotVersion = (vResult.stdout || '').trim();
          } catch {
            copilotVersion = '已安装';
          }
          checks.push({
            key: 'copilot_extension',
            label: 'GitHub Copilot CLI 可用',
            status: CheckStatus.PASS,
            message: copilotVersion || '已就绪'
          });
        } else {
          allPassed = false;
          checks.push({
            key: 'copilot_extension',
            label: 'GitHub Copilot CLI 可用',
            status: CheckStatus.FAIL,
            message: 'Copilot CLI 二进制文件未找到，将自动下载',
            action: {
              label: '安装 Copilot CLI',
              command: 'gh copilot --version'
            }
          });
        }
      } catch (err) {
        allPassed = false;
        checks.push({
          key: 'copilot_extension',
          label: 'GitHub Copilot CLI 可用',
          status: CheckStatus.FAIL,
          message: `检查失败: ${err.message}`,
          action: {
            label: '安装 Copilot CLI',
            command: 'gh copilot --version'
          }
        });
      }
    } else {
      checks.push({
        key: 'copilot_extension',
        label: 'GitHub Copilot CLI 可用',
        status: CheckStatus.SKIPPED,
        message: 'gh未安装'
      });
    }

    let authenticated = false;
    let authUser = null;
    if (ghExists) {
      try {
        const result = await this.runCommand(['auth', 'status'], { timeout: 10000 });
        const output = (result.stdout || '') + (result.stderr || '');
        const accountMatch = output.match(/Logged in to [^\s]+ (?:as|account) ([^\s(]+)/);
        if (accountMatch) {
          authenticated = true;
          authUser = accountMatch[1].trim();
          checks.push({
            key: 'gh_auth',
            label: 'GitHub 账号已登录',
            status: CheckStatus.PASS,
            message: `已登录: ${authUser}`
          });
        } else {
          allPassed = false;
          checks.push({
            key: 'gh_auth',
            label: 'GitHub 账号已登录',
            status: CheckStatus.FAIL,
            message: '未检测到登录状态，请在终端运行 gh auth login',
            action: {
              label: '登录GitHub',
              command: 'gh auth login'
            }
          });
        }
      } catch (err) {
        allPassed = false;
        checks.push({
          key: 'gh_auth',
          label: 'GitHub 账号已登录',
          status: CheckStatus.FAIL,
          message: '未登录或登录已过期，请在终端运行 gh auth login',
          action: {
            label: '登录GitHub',
            command: 'gh auth login'
          }
        });
      }
    } else {
      checks.push({
        key: 'gh_auth',
        label: 'GitHub 账号已登录',
        status: CheckStatus.SKIPPED,
        message: 'gh未安装'
      });
    }

    let models = [];
    if (ghExists && copilotReady && authenticated) {
      try {
        models = await this.listModels();
        if (models.length > 0) {
          checks.push({
            key: 'copilot_access',
            label: 'Copilot 服务可访问',
            status: CheckStatus.PASS,
            message: `获取到 ${models.length} 个可用模型`
          });
        } else {
          allPassed = false;
          checks.push({
            key: 'copilot_access',
            label: 'Copilot 服务可访问',
            status: CheckStatus.WARN,
            message: '使用默认模型列表，请确认Copilot订阅已激活'
          });
        }
      } catch (err) {
        allPassed = false;
        checks.push({
          key: 'copilot_access',
          label: 'Copilot 服务可访问',
          status: CheckStatus.FAIL,
          message: `无法访问Copilot: ${err.message}`,
          helpUrl: 'https://github.com/features/copilot'
        });
      }
    } else {
      checks.push({
        key: 'copilot_access',
        label: 'Copilot 服务可访问',
        status: CheckStatus.SKIPPED,
        message: '前置检查未通过'
      });
    }

    return {
      adapter: 'copilot',
      checkedAt: new Date().toISOString(),
      allPassed,
      checks,
      models: allPassed ? models : undefined,
      version: copilotVersion || ghVersion || undefined
    };
  }

  async runFixAction(checkKey) {
    switch (checkKey) {
      case 'copilot_extension': {
        try {
          logger.info('[CopilotCLI] Running fix: triggering copilot binary download via gh copilot --version');
          await this.runCommand(['copilot', '--version'], { timeout: 120000 });
          const copilotBin = this.resolveCopilotBinary();
          if (copilotBin) {
            return {
              ok: true,
              output: '',
              interactive: false,
              message: 'Copilot CLI 安装成功，请重新运行环境检查'
            };
          }
          return {
            ok: false,
            output: '',
            interactive: false,
            message: 'Copilot CLI 下载似乎未完成，请检查网络连接或代理设置后重试'
          };
        } catch (err) {
          return { ok: false, output: err.message, interactive: false, message: '安装失败: ' + err.message };
        }
      }
      case 'gh_auth': {
        return new Promise((resolve) => {
          const isWin = process.platform === 'win32';
          const isMac = process.platform === 'darwin';
          const proxyEnv = getProxyEnvVars();
          const proxyEnvParts = Object.entries(proxyEnv);
          let cmd;
          if (isWin) {
            const envSetCmd = proxyEnvParts.map(([k, v]) => `set "${k}=${v}"`).join(' && ');
            const prefix = envSetCmd ? `${envSetCmd} && ` : '';
            cmd = `start "GitHub Copilot 登录" cmd /k "${prefix}gh auth login --web && echo 登录完成后请关闭此窗口"`;
          } else if (isMac) {
            const envExports = proxyEnvParts.map(([k, v]) => `export ${k}="${v}"`).join('; ');
            const prefix = envExports ? `${envExports}; ` : '';
            cmd = `osascript -e 'tell application "Terminal" to do script "${prefix}gh auth login --web; echo 登录完成后请关闭此窗口"'`;
          } else {
            const envExports = proxyEnvParts.map(([k, v]) => `export ${k}="${v}"`).join('; ');
            const prefix = envExports ? `${envExports}; ` : '';
            cmd = `x-terminal-emulator -e bash -c "${prefix}gh auth login --web; echo 登录完成后请关闭此窗口; exec bash"`;
          }
          exec(cmd, (error) => {
            if (error) {
              resolve({ ok: false, output: error.message, interactive: true, message: '无法打开终端，请手动运行: gh auth login --web（若有代理请先设置HTTP_PROXY环境变量）' });
            } else {
              resolve({ ok: true, output: '', interactive: true, message: '已打开终端窗口，请在其中完成 GitHub 登录' });
            }
          });
        });
      }
      default:
        throw new Error(`Unknown fix action: ${checkKey}`);
    }
  }

  async listModels() {
    return FALLBACK_MODELS;
  }

  async startSession(options = {}) {
    const sessionId = `copilot_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    const copilotBin = this.resolveCopilotBinary();
    if (!copilotBin) {
      throw new Error('Copilot CLI binary not found. Please run environment check first.');
    }

    const session = {
      id: sessionId,
      copilotBin,
      proc: null,
      active: true,
      chunkQueue: [],
      done: false,
      error: null,
      receivedDeltas: false,
    };

    this.processes.set(sessionId, session);

    logger.info(`[CopilotCLI] Session started: ${sessionId}, binary: ${copilotBin}`);
    return sessionId;
  }

  async *sendMessage(sessionId, content, options = {}) {
    const session = this.processes.get(sessionId);
    if (!session || !session.active) {
      yield { type: CLIEventType.ERROR, error: 'Session not started' };
      return;
    }

    if (session.proc) {
      try { session.proc.kill(); } catch {}
      session.proc = null;
    }

    const model = options.model || this.cliConfig.model || 'auto';
    const proxyEnv = getProxyEnvVars();
    const copilotBin = session.copilotBin;

    const args = [
      '-p', content,
      '--output-format', 'json',
      '--stream', 'on',
      '--model', model,
      '-s',
    ];

    yield { type: CLIEventType.THINKING_DELTA, content: '正在连接 Copilot...' };

    const proc = spawn(copilotBin, args, {
      env: {
        ...process.env,
        ...proxyEnv,
        ...this.cliConfig.env,
        NO_COLOR: '1',
      },
      cwd: options.cwd || process.cwd(),
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    session.proc = proc;
    session.done = false;
    session.error = null;
    session.chunkQueue = [];
    session.receivedDeltas = false;

    let stdoutBuf = '';
    let stderrBuf = '';
    let resolver = null;
    let rejecter = null;
    let fullText = '';

    const queueChunk = (chunk) => {
      fullText += chunk.content || '';
      session.chunkQueue.push(chunk);
      if (resolver) {
        resolver();
        resolver = null;
      }
    };

    const signalDone = () => {
      session.done = true;
      if (resolver) {
        resolver();
        resolver = null;
      }
    };

    const signalError = (err) => {
      session.error = err;
      session.done = true;
      if (rejecter) {
        rejecter(err);
        rejecter = null;
      }
    };

    const handleLine = (line) => {
      if (!line.trim()) return;
      try {
        const event = JSON.parse(line);
        this.processStreamEvent(event, session.receivedDeltas, queueChunk, signalDone, signalError);
        if (event.type === 'assistant.message_delta' && event.data?.deltaContent) {
          session.receivedDeltas = true;
        }
      } catch (e) {
        logger.debug(`[CopilotCLI] Failed to parse JSON line: ${line.substring(0, 200)}`);
      }
    };

    const onData = (data) => {
      stdoutBuf += data.toString();
      const lines = stdoutBuf.split('\n');
      stdoutBuf = lines.pop() || '';
      for (const line of lines) {
        handleLine(line);
      }
    };

    const onErr = (data) => {
      stderrBuf += data.toString();
      const text = data.toString().trim();
      if (text) {
        logger.debug(`[CopilotCLI] stderr: ${text.substring(0, 200)}`);
      }
    };

    const onClose = (code) => {
      if (stdoutBuf.trim()) {
        handleLine(stdoutBuf.trim());
      }

      if (code !== 0 && !session.done && !session.error) {
        const errMsg = stderrBuf.trim() || `Process exited with code ${code}`;
        session.error = new Error(errMsg);
        session.chunkQueue.push({ type: CLIEventType.ERROR, error: errMsg });
      }
      signalDone();
    };

    const onError = (err) => {
      signalError(err);
    };

    proc.stdout.on('data', onData);
    proc.stderr.on('data', onErr);
    proc.on('close', onClose);
    proc.on('error', onError);

    try {
      while (!session.done || session.chunkQueue.length > 0) {
        if (session.chunkQueue.length > 0) {
          yield session.chunkQueue.shift();
        } else {
          await new Promise((resolve, reject) => {
            resolver = resolve;
            rejecter = reject;
          });
        }
      }

      if (session.error && fullText.length === 0) {
        yield { type: CLIEventType.ERROR, error: session.error.message };
      } else {
        yield { type: CLIEventType.DONE };
      }
    } finally {
      if (session.proc === proc) {
        try { proc.kill(); } catch {}
        session.proc = null;
      }
    }
  }

  processStreamEvent(event, hasDeltas, onDelta, onDone, onError) {
    const { type, data } = event;

    switch (type) {
      case 'assistant.message_delta': {
        const delta = data?.deltaContent || '';
        if (delta) {
          onDelta({ type: CLIEventType.TEXT_DELTA, content: delta });
        }
        break;
      }
      case 'assistant.message': {
        if (hasDeltas) break;
        const content = data?.content;
        if (Array.isArray(content)) {
          for (const item of content) {
            if (item.type === 'text' && item.text) {
              onDelta({ type: CLIEventType.TEXT_DELTA, content: item.text });
            }
          }
        } else if (typeof content === 'string' && content) {
          onDelta({ type: CLIEventType.TEXT_DELTA, content });
        }
        break;
      }
      case 'assistant.reasoning': {
        break;
      }
      case 'result': {
        onDone();
        break;
      }
      case 'assistant.turn_end':
      case 'assistant.idle': {
        break;
      }
      default:
        logger.debug(`[CopilotCLI] unhandled event: ${type}`);
    }
  }

  async stopSession(sessionId) {
    const session = this.processes.get(sessionId);
    if (session) {
      if (session.proc) {
        try {
          session.proc.kill();
        } catch (e) {
          logger.warn(`[CopilotCLI] Failed to kill process: ${e.message}`);
        }
        session.proc = null;
      }
      session.active = false;
      this.processes.delete(sessionId);
    }
  }

  cancel(sessionId) {
    this.stopSession(sessionId);
  }

  dispose() {
    for (const [sessionId, session] of this.processes) {
      if (session.proc) {
        try { session.proc.kill(); } catch {}
      }
    }
    this.processes.clear();
  }
}
