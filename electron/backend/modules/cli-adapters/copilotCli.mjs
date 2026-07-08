/**
 * Copilot CLI 适配器
 * 
 * 适配新版 GitHub Copilot CLI (v1.0+)：
 * - gh 内置 copilot 命令，自动下载 copilot 二进制到 %LOCALAPPDATA%\GitHub CLI\copilot\
 * - 使用 `copilot.exe -p <prompt> --output-format json --stream on` 进行流式对话
 * - 支持 MCP (Model Context Protocol) 工具调用，配置通过 ~/.copilot/mcp-config.json
 * - 事件类型: assistant.message_delta (deltaContent), assistant.message (完整内容), result (结束),
 *             tool_call (工具调用), tool_result (工具结果)
 */

import { spawn, exec } from 'child_process';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { BaseCLIAdapter, CLIEventType, CheckStatus, commandExists, findCommandPath, getProxyEnvVars } from './base.mjs';
import logger from '../../core/logger.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STDIO_BRIDGE_PATH = path.join(__dirname, '..', 'mcp', 'server', 'stdioBridge.mjs');

function getBuiltinCopilotPath() {
  if (process.platform === 'win32') {
    return path.join(os.homedir(), 'AppData', 'Local', 'GitHub CLI', 'copilot', 'copilot.exe');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'GitHub CLI', 'copilot', 'copilot');
  }
  return path.join(os.homedir(), '.local', 'share', 'gh', 'copilot', 'copilot');
}

function getCopilotHomeDir() {
  return path.join(os.homedir(), '.copilot');
}

function getCopilotMcpConfigPath() {
  return path.join(getCopilotHomeDir(), 'mcp-config.json');
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

function ensureDvstudioMcpConfig() {
  try {
    const copilotHome = getCopilotHomeDir();
    if (!fs.existsSync(copilotHome)) {
      fs.mkdirSync(copilotHome, { recursive: true });
    }

    const configPath = getCopilotMcpConfigPath();
    const bridgePath = STDIO_BRIDGE_PATH.replace(/\\/g, '/');

    let config = { mcpServers: {} };
    try {
      if (fs.existsSync(configPath)) {
        const raw = fs.readFileSync(configPath, 'utf8');
        config = JSON.parse(raw);
        if (!config.mcpServers) {
          config.mcpServers = {};
        }
      }
    } catch {
      config = { mcpServers: {} };
    }

    const dvstudioConfig = {
      command: 'node',
      args: [bridgePath],
      timeout: 30000
    };

    const existingConfig = config.mcpServers.dvstudio;
    const configChanged = !existingConfig ||
      existingConfig.command !== dvstudioConfig.command ||
      JSON.stringify(existingConfig.args) !== JSON.stringify(dvstudioConfig.args);

    if (configChanged) {
      config.mcpServers.dvstudio = dvstudioConfig;
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
      logger.info(`[CopilotCLI] DVStudio MCP server config updated in ${configPath}`);
    }

    return true;
  } catch (err) {
    logger.warn(`[CopilotCLI] Failed to update MCP config: ${err.message}`);
    return false;
  }
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

    ensureDvstudioMcpConfig();

    const mcpInstruction = `你是DVStudio的AI工作流助手。DVStudio是一个AI工作流蓝图编辑器，提供了名为"dvstudio"的MCP工具服务器。

# 重要规则
1. 必须使用dvstudio MCP工具操作工作流蓝图，绝对不要读取/修改文件系统代码，也不要执行shell命令
2. 创建节点前，先调用 get_blueprint_state 了解当前蓝图状态（返回值包含viewport视口信息：zoom/panX/panY/centerWorldX/centerWorldY）
3. 创建节点时，如果不确定正确的节点类型ID，先调用 list_node_types 获取所有可用类型，然后再调用 create_node
4. create_node的type参数必须使用list_node_types返回的type值（actionId，如image-generation表示图片节点，text-generation表示文本节点）
5. **绝对不要给create_node传入position、x、y参数**。系统会自动将新节点放置在用户当前蓝图视口中心，并自动避开已有节点。传入错误坐标会导致节点创建到视口外，用户看不到节点！
6. 不要试图分析项目源代码，直接通过MCP工具完成所有操作
7. get_blueprint_state返回的viewport.centerWorldX/centerWorldY是用户当前视口中心的世界坐标，仅供你了解用户视角，创建节点时系统自动使用

`;
    const enhancedContent = mcpInstruction + content;

    const args = [
      '-p', enhancedContent,
      '--output-format', 'json',
      '--stream', 'on',
      '--model', model,
      '-s',
      '--allow-all-mcp-server-instructions',
      '--allow-all-tools',
      '--allow-all-paths',
      '--no-ask-user',
      '--disable-mcp-server', 'github-mcp-server',
    ];

    yield { type: CLIEventType.THINKING_DELTA, content: '正在连接 Copilot...' };

    const proc = spawn(copilotBin, args, {
      env: {
        ...process.env,
        ...proxyEnv,
        ...this.cliConfig.env,
        NO_COLOR: '1',
        TERM: 'dumb',
        COPILOT_DISABLE_TELEMETRY: '1',
      },
      cwd: options.cwd || process.cwd(),
      shell: process.platform === 'win32' && /\.(cmd|bat)$/i.test(copilotBin),
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    session.proc = proc;
    session.done = false;
    session.error = null;
    session.chunkQueue = [];
    session.receivedDeltas = false;
    session.pendingToolDeltas = {};
    session.activeToolCalls = new Map();

    let stdoutBuf = '';
    let stderrBuf = '';
    let resolver = null;
    let rejecter = null;
    let fullText = '';

    const getActiveToolCall = (toolCallId) => {
      if (toolCallId) {
        return session.activeToolCalls.get(toolCallId) || null;
      }
      const entries = Array.from(session.activeToolCalls.values());
      return entries.length > 0 ? entries[entries.length - 1] : null;
    };
    const setActiveToolCall = (tc) => {
      if (tc && tc.id) {
        session.activeToolCalls.set(tc.id, tc);
      }
    };
    const deleteActiveToolCall = (toolCallId) => {
      if (toolCallId) {
        session.activeToolCalls.delete(toolCallId);
      }
    };

    const normalizeToolName = (name) => {
      if (!name) return name;
      if (name.startsWith('dvstudio-')) {
        return name.substring('dvstudio-'.length);
      }
      if (name.startsWith('dvstudio_')) {
        return name.substring('dvstudio_'.length);
      }
      return name;
    };

    const queueChunk = (chunk) => {
      if (chunk.type === CLIEventType.TEXT_DELTA) {
        fullText += chunk.content || '';
      }
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

    const parseJsonLine = (line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    };

    const processLine = (line) => {
      const event = parseJsonLine(line);
      if (!event) {
        if (line.trim()) {
          logger.debug(`[CopilotCLI] Non-JSON line: ${line.substring(0, 200)}`);
        }
        return;
      }

      this.processStreamEvent(
        event,
        session.receivedDeltas,
        queueChunk,
        signalDone,
        signalError,
        setActiveToolCall,
        getActiveToolCall,
        deleteActiveToolCall,
        normalizeToolName,
        session.pendingToolDeltas
      );
      if (event.type === 'assistant.message_delta' && event.data?.deltaContent) {
        session.receivedDeltas = true;
      }
    };

    const onData = (data) => {
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
    };

    const onErr = (data) => {
      const text = data.toString();
      stderrBuf += text;
      const cleaned = stripAnsi(text);
      if (cleaned.trim()) {
        logger.debug(`[CopilotCLI][stderr]: ${cleaned.substring(0, 300)}`);
      }
    };

    const onClose = (code) => {
      if (stdoutBuf.trim()) {
        processLine(stdoutBuf.trim());
      }

      for (const [tcId, tc] of session.activeToolCalls) {
        queueChunk({
          type: CLIEventType.TOOL_CALL_END,
          toolCallId: tcId,
          tool: tc.name,
          output: 'Process exited'
        });
      }
      session.activeToolCalls.clear();

      if (code !== 0 && !session.done && !session.error && fullText.length === 0) {
        const errMsg = stderrBuf.trim() || `Copilot 进程退出 (code=${code})`;
        session.error = new Error(errMsg);
        queueChunk({ type: CLIEventType.ERROR, error: errMsg });
      }
      signalDone();
    };

    const onError = (err) => {
      logger.error(`[CopilotCLI] Process error: ${err.message}`);
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

  processStreamEvent(event, hasDeltas, onDelta, onDone, onError, setToolCall, getToolCall, deleteToolCall, normalizeToolName, pendingToolDeltas) {
    const { type, data } = event;

    const extractToolInfo = (item) => {
      if (!item) return null;
      const itemType = String(item.type || '');
      
      if (itemType === 'mcp_tool_call' || itemType === 'tool_call' || itemType === 'tool_use' || item.tool || item.name || item.function) {
        let toolName = item.tool || item.name || item.function?.name || '';
        if (normalizeToolName) {
          toolName = normalizeToolName(toolName);
        }
        const toolInput = item.arguments || item.input || item.parameters || item.function?.arguments || {};
        const parsedInput = typeof toolInput === 'string' ? (() => { try { return JSON.parse(toolInput); } catch { return {}; } })() : toolInput;
        const serverName = item.server || item.mcpServerName || '';
        
        if (toolName) {
          return {
            id: item.id || item.toolCallId || `tool_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            name: toolName,
            server: serverName,
            input: parsedInput,
          };
        }
      }
      return null;
    };

    switch (type) {
      case 'assistant.message_delta': {
        const delta = data?.deltaContent || '';
        if (delta) {
          onDelta({ type: CLIEventType.TEXT_DELTA, content: delta });
        }
        break;
      }
      case 'assistant.reasoning_delta': {
        const delta = data?.deltaContent || '';
        if (delta) {
          onDelta({ type: CLIEventType.THINKING_DELTA, content: delta });
        }
        break;
      }
      case 'assistant.tool_call_delta': {
        if (!data) break;
        const toolCallId = data.toolCallId;
        const toolName = data.toolName ? (normalizeToolName ? normalizeToolName(data.toolName) : data.toolName) : '';
        const inputDelta = data.inputDelta || '';
        
        if (toolCallId && inputDelta) {
          if (!pendingToolDeltas[toolCallId]) {
            pendingToolDeltas[toolCallId] = {
              id: toolCallId,
              name: toolName,
              inputDelta: '',
            };
          }
          pendingToolDeltas[toolCallId].inputDelta += inputDelta;
          if (toolName && !pendingToolDeltas[toolCallId].name) {
            pendingToolDeltas[toolCallId].name = toolName;
          }
        }
        break;
      }
      case 'tool.execution_start': {
        if (!data) break;
        const toolCallId = data.toolCallId;
        let toolName = data.mcpToolName || data.toolName || '';
        if (normalizeToolName) {
          toolName = normalizeToolName(toolName);
        }
        if (!toolName) {
          if (toolCallId && pendingToolDeltas[toolCallId]?.name) {
            toolName = pendingToolDeltas[toolCallId].name;
          }
        }
        if (!toolName) {
          logger.debug(`[CopilotCLI] Tool call start without tool name, skipping: ${JSON.stringify(data).substring(0, 200)}`);
          break;
        }
        const toolInput = data.arguments || {};
        
        let parsedInput = toolInput;
        if (toolCallId && pendingToolDeltas[toolCallId] && typeof toolInput === 'object') {
          try {
            const deltaStr = pendingToolDeltas[toolCallId].inputDelta;
            if (deltaStr) {
              parsedInput = JSON.parse(deltaStr);
            }
          } catch {}
        }
        
        const tc = {
          id: toolCallId || `tool_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          name: toolName,
          input: parsedInput,
        };
        
        if (setToolCall) setToolCall(tc);
        if (toolCallId) delete pendingToolDeltas[toolCallId];
        
        logger.info(`[CopilotCLI] Tool call started: ${tc.name} (${tc.id})`);
        onDelta({
          type: CLIEventType.TOOL_CALL_START,
          toolCallId: tc.id,
          tool: tc.name,
          input: tc.input,
        });
        break;
      }
      case 'tool.execution_complete': {
        if (!data) break;
        const toolCallId = data.toolCallId;
        const success = data.success !== false;
        
        let activeTc = toolCallId ? getToolCall(toolCallId) : null;
        if (!activeTc && toolCallId && pendingToolDeltas[toolCallId]?.name) {
          activeTc = {
            id: toolCallId,
            name: pendingToolDeltas[toolCallId].name,
          };
        }
        if (!activeTc || !activeTc.name) {
          logger.debug(`[CopilotCLI] Tool call complete without active tool, skipping: ${JSON.stringify(data).substring(0, 200)}`);
          if (toolCallId) {
            deleteToolCall(toolCallId);
            delete pendingToolDeltas[toolCallId];
          }
          break;
        }
        
        if (!success || data.error) {
          const errMsg = data.error || 'Tool execution failed';
          logger.warn(`[CopilotCLI] Tool call error: ${activeTc.name} - ${errMsg}`);
          onDelta({
            type: CLIEventType.TOOL_CALL_ERROR,
            toolCallId: activeTc.id,
            tool: activeTc.name,
            error: typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg),
          });
        } else {
          let resultOutput = 'Success';
          const result = data.result;
          if (result !== undefined && result !== null) {
            if (typeof result === 'string') {
              const trimmed = result.trim();
              if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                try { resultOutput = JSON.parse(trimmed); } catch { resultOutput = result; }
              } else {
                resultOutput = result;
              }
            } else if (result.content !== undefined && result.content !== null) {
              resultOutput = (typeof result.content === 'string') ? (() => {
                const trimmed = result.content.trim();
                if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                  try { return JSON.parse(trimmed); } catch { return result.content; }
                }
                return result.content;
              })() : result.content;
            } else {
              resultOutput = result;
            }
          }
          logger.info(`[CopilotCLI] Tool call completed: ${activeTc.name}`);
          onDelta({
            type: CLIEventType.TOOL_CALL_END,
            toolCallId: activeTc.id,
            tool: activeTc.name,
            output: resultOutput,
          });
        }
        if (toolCallId) {
          deleteToolCall(toolCallId);
          delete pendingToolDeltas[toolCallId];
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
            } else if (item.type === 'tool_use' || item.type === 'tool_call') {
              const tc = extractToolInfo(item);
              if (tc) {
                if (setToolCall) setToolCall(tc);
                onDelta({
                  type: CLIEventType.TOOL_CALL_START,
                  toolCallId: tc.id,
                  tool: tc.name,
                  input: tc.input,
                });
              }
            }
          }
        } else if (typeof content === 'string' && content) {
          onDelta({ type: CLIEventType.TEXT_DELTA, content });
        }
        break;
      }
      case 'assistant.reasoning':
      case 'thinking': {
        const thinking = event.thinking || event.content || data?.thinking || data?.content || '';
        if (thinking) {
          onDelta({ type: CLIEventType.THINKING_DELTA, content: thinking });
        }
        break;
      }
      case 'item.started': {
        const item = event.item;
        const tc = extractToolInfo(item);
        if (tc) {
          if (setToolCall) setToolCall(tc);
          logger.info(`[CopilotCLI] Tool call started: ${tc.name} (${tc.id})`);
          onDelta({
            type: CLIEventType.TOOL_CALL_START,
            toolCallId: tc.id,
            tool: tc.name,
            input: tc.input,
          });
        }
        break;
      }
      case 'item.completed': {
        const item = event.item;
        if (!item) break;
        
        const itemId = item.id || item.toolCallId;
        const itemType = String(item.type || '');
        
        if (itemType === 'agent_message' || itemType === 'message') {
          const text = item.text || item.content || '';
          if (text) {
            onDelta({ type: CLIEventType.TEXT_DELTA, content: text });
          }
        } else if (itemType === 'error') {
          const errMsg = item.message || '';
          if (errMsg && !errMsg.includes('Skill descriptions were shortened')) {
            logger.warn(`[CopilotCLI] Item error: ${errMsg}`);
          }
        } else {
          const activeTc = itemId ? getToolCall(itemId) : null;
          if (activeTc && activeTc.name) {
            if (item.error) {
              const errMsg = typeof item.error === 'string' ? item.error : (item.error.message || JSON.stringify(item.error));
              logger.warn(`[CopilotCLI] Tool call error: ${activeTc.name} - ${errMsg}`);
              onDelta({
                type: CLIEventType.TOOL_CALL_ERROR,
                toolCallId: activeTc.id,
                tool: activeTc.name,
                error: errMsg,
              });
            } else {
              const result = item.result !== null && item.result !== undefined
                ? (typeof item.result === 'string' ? item.result : JSON.stringify(item.result, null, 2))
                : (item.output !== null && item.output !== undefined
                  ? (typeof item.output === 'string' ? item.output : JSON.stringify(item.output, null, 2))
                  : (item.status === 'failed' ? 'Tool call failed' : 'Success'));
              logger.info(`[CopilotCLI] Tool call completed: ${activeTc.name}`);
              onDelta({
                type: CLIEventType.TOOL_CALL_END,
                toolCallId: activeTc.id,
                tool: activeTc.name,
                output: result,
              });
            }
            if (itemId) {
              deleteToolCall(itemId);
            }
          }
        }
        break;
      }
      case 'tool_call':
      case 'tool_use': {
        const tc = extractToolInfo(event);
        if (tc) {
          if (setToolCall) setToolCall(tc);
          onDelta({
            type: CLIEventType.TOOL_CALL_START,
            toolCallId: tc.id,
            tool: tc.name,
            input: tc.input,
          });
        }
        break;
      }
      case 'tool_result': {
        const resultTcId = event.toolCallId || event.id;
        const activeTc = resultTcId ? getToolCall(resultTcId) : getToolCall();
        if (activeTc && activeTc.name) {
          const rawResult = event.result || event.content || event.output || '';
          let parsedResult = rawResult;
          if (typeof rawResult === 'string') {
            try {
              const trimmed = rawResult.trim();
              if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                parsedResult = JSON.parse(trimmed);
              }
            } catch {
              parsedResult = rawResult;
            }
          }
          onDelta({
            type: CLIEventType.TOOL_CALL_END,
            toolCallId: activeTc.id,
            tool: activeTc.name,
            output: parsedResult,
          });
          if (resultTcId) {
            deleteToolCall(resultTcId);
          }
        }
        break;
      }
      case 'delta': {
        if (event.delta?.type === 'text_delta') {
          const text = event.delta?.text || event.text || '';
          if (text) {
            onDelta({ type: CLIEventType.TEXT_DELTA, content: text });
          }
        } else if (event.delta?.type === 'thinking_delta') {
          const thinking = event.delta?.thinking || event.thinking || '';
          if (thinking) {
            onDelta({ type: CLIEventType.THINKING_DELTA, content: thinking });
          }
        } else if (event.text) {
          onDelta({ type: CLIEventType.TEXT_DELTA, content: event.text });
        }
        break;
      }
      case 'result': {
        if (event.result?.status === 'error') {
          const errMsg = event.result.message || event.result.error || 'Copilot execution failed';
          if (onError) onError(new Error(errMsg));
        } else {
          onDone();
        }
        break;
      }
      case 'session.completed': {
        onDone();
        break;
      }
      case 'error': {
        const errMsg = event.message || event.error || JSON.stringify(event);
        if (onError) onError(new Error(errMsg));
        break;
      }
      default:
        logger.debug(`[CopilotCLI] unhandled event: ${type}`, JSON.stringify(event).substring(0, 300));
        if (event.content && typeof event.content === 'string') {
          onDelta({ type: CLIEventType.TEXT_DELTA, content: event.content });
        } else if (event.text && typeof event.text === 'string') {
          onDelta({ type: CLIEventType.TEXT_DELTA, content: event.text });
        }
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
