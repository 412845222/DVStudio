/**
 * Codex CLI 适配器
 * 
 * 支持 OpenAI Codex CLI 的 STDIO 模式。
 * 使用 app-server 命令启动，通过 JSON-RPC 进行通信。
 */

import { spawn } from 'child_process';
import { BaseCLIAdapter, CLIEventType, commandExists, getProxyEnvVars } from './base.mjs';
import logger from '../../core/logger.mjs';

/**
 * Codex CLI JSON-RPC 消息类型
 */
const CodexMessageType = {
  PROTOCOL_VERSION: 'protocol_version',
  INITIALIZE: 'initialize',
  TOOLS_REGISTER: 'tools/register',
  TOOLS_CALL: 'tools/call',
  TOOLS_RESPONSE: 'tools/response',
  TEXT_DELTA: 'text/delta',
  TOOL_START: 'tool/start',
  TOOL_END: 'tool/end',
  MESSAGE: 'message',
  ERROR: 'error',
};

/**
 * Codex CLI 适配器
 */
export class CodexCliAdapter extends BaseCLIAdapter {
  constructor(cliConfig = {}) {
    super(cliConfig);
    this.processes = new Map();
    this.pendingRequests = new Map();
    this.messageBuffer = '';
  }

  get commandName() {
    return 'npx';
  }

  get displayName() {
    return 'OpenAI Codex';
  }

  /**
   * 检查 Codex CLI 是否可用
   */
  async checkAvailable() {
    // Codex CLI 需要通过 npx 调用，检查 npx 是否可用
    if (!commandExists('npx')) {
      return { available: false, version: null, status: 'not_installed' };
    }

    try {
      // 尝试获取版本
      const version = await this.getVersion();
      return { available: true, version, status: 'available' };
    } catch (err) {
      return { available: false, version: null, status: 'unknown', error: err.message };
    }
  }

  /**
   * 获取 CLI 版本
   */
  async getVersion() {
    try {
      // Codex CLI 版本检测
      const result = await this.runCommand(['-y', '@openai/codex', '--version'], { timeout: 30000 });
      return result.stdout?.trim() || 'unknown';
    } catch {
      return 'unknown';
    }
  }

  /**
   * 开始会话 - 启动 app-server 模式
   * @param {object} options 
   */
  async startSession(options = {}) {
    const sessionId = `codex_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    
    // Codex CLI 使用 app-server --stdio 模式
    const args = [
      '-y', '@openai/codex',
      'app-server',
      '--stdio',
    ];

    const proxyEnv = getProxyEnvVars();

    const proc = spawn(this.commandName, args, {
      env: { 
        ...process.env, 
        ...proxyEnv,
        ...this.cliConfig.env,
        CODX_API_KEY: this.cliConfig.apiKey || process.env.OPENAI_API_KEY || '',
        CODX_BASE_URL: this.cliConfig.baseUrl || 'https://api.openai.com/v1',
      },
      cwd: options.cwd || process.cwd(),
      shell: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const session = {
      proc,
      started: false,
      initialized: false,
      tools: new Map(),
    };

    this.processes.set(sessionId, session);

    // 设置消息处理
    proc.stdout?.on('data', (data) => {
      this.handleMessage(sessionId, data.toString());
    });

    proc.stderr?.on('data', (data) => {
      const output = data.toString().trim();
      if (output) {
        logger.debug(`Codex CLI stderr: ${output}`);
      }
    });

    proc.on('error', (err) => {
      logger.error(`Codex CLI error: ${err.message}`);
      session.started = false;
    });

    // 发送初始化请求
    try {
      await this.sendJsonRpc(sessionId, 'initialize', {
        protocol_version: '2024-11-20',
        capabilities: {
          tools: {},
          resources: {},
        },
        client_info: {
          name: 'dvstudio-codex-adapter',
          version: '1.0.0',
        },
      });

      session.initialized = true;
      session.started = true;
      return sessionId;
    } catch (err) {
      logger.error(`Codex CLI init failed: ${err.message}`);
      this.processes.delete(sessionId);
      throw err;
    }
  }

  /**
   * 处理收到的消息
   * @param {string} sessionId 
   * @param {string} data 
   */
  handleMessage(sessionId, data) {
    const session = this.processes.get(sessionId);
    if (!session) return;

    this.messageBuffer += data;
    
    // 按行分割处理 JSON-RPC 消息
    const lines = this.messageBuffer.split('\n');
    this.messageBuffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const message = JSON.parse(line);
        this.processMessage(sessionId, message);
      } catch (err) {
        logger.warn(`Failed to parse Codex message: ${err.message}`);
      }
    }
  }

  /**
   * 处理 JSON-RPC 消息
   * @param {string} sessionId 
   * @param {object} message 
   */
  processMessage(sessionId, message) {
    const session = this.processes.get(sessionId);
    if (!session) return;

    // 处理工具注册
    if (message.method === 'tools/register') {
      const { tools } = message.params || {};
      if (tools) {
        for (const tool of tools) {
          session.tools.set(tool.name, tool);
        }
      }
    }

    // 处理工具调用结果
    if (message.method === 'tools/response') {
      const requestId = message.id;
      const resolver = this.pendingRequests.get(requestId);
      if (resolver) {
        resolver(message.params);
        this.pendingRequests.delete(requestId);
      }
    }

    // 处理错误
    if (message.error) {
      logger.error(`Codex CLI error: ${JSON.stringify(message.error)}`);
    }
  }

  /**
   * 发送 JSON-RPC 请求
   * @param {string} sessionId 
   * @param {string} method 
   * @param {object} params 
   */
  sendJsonRpc(sessionId, method, params = {}) {
    const session = this.processes.get(sessionId);
    if (!session || !session.proc.stdin) {
      throw new Error('Session not available');
    }

    const id = `req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const request = JSON.stringify({ jsonrpc: '2.0', id, method, params });
    
    session.proc.stdin.write(request + '\n');

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request ${method} timed out`));
      }, 30000);

      this.pendingRequests.set(id, (params) => {
        clearTimeout(timeout);
        resolve(params);
      });
    });
  }

  /**
   * 发送消息
   * @param {string} sessionId 
   * @param {string} content 
   * @param {object} options 
   */
  async *sendMessage(sessionId, content, options = {}) {
    const session = this.processes.get(sessionId);
    if (!session || !session.started) {
      yield { type: CLIEventType.ERROR, error: 'Session not started' };
      return;
    }

    try {
      // 发送消息请求
      const result = await this.sendJsonRpc(sessionId, 'message', {
        message: {
          role: 'user',
          content,
        },
        context: options.context || {},
      });

      // 处理响应
      if (result.content) {
        for (const block of result.content) {
          if (block.type === 'text') {
            yield { type: CLIEventType.TEXT_DELTA, content: block.text };
          } else if (block.type === 'tool_use') {
            yield { 
              type: CLIEventType.TOOL_CALL_START, 
              id: block.id, 
              name: block.name,
              arguments: block.input ? JSON.stringify(block.input) : '{}'
            };
          }
        }
      }

      yield { type: CLIEventType.DONE };
    } catch (err) {
      yield { type: CLIEventType.ERROR, error: err.message };
    }
  }

  /**
   * 解析 CLI 输出（用于流式模式）
   * @param {string} line 
   */
  parseOutput(line) {
    try {
      const event = JSON.parse(line);
      
      if (event.type === 'text/delta') {
        return { type: CLIEventType.TEXT_DELTA, content: event.delta };
      }
      
      if (event.type === 'tool/start') {
        return { 
          type: CLIEventType.TOOL_CALL_START, 
          id: event.tool_call_id, 
          name: event.name,
          arguments: '{}'
        };
      }
      
      if (event.type === 'tool/end') {
        return { type: CLIEventType.TOOL_CALL_END, id: event.tool_call_id, result: event.result };
      }
      
      if (event.type === 'error') {
        return { type: CLIEventType.ERROR, error: event.message };
      }
      
      if (event.type === 'done') {
        return { type: CLIEventType.DONE };
      }
    } catch {}
    
    return null;
  }

  /**
   * 结束会话
   */
  async stopSession(sessionId) {
    const session = this.processes.get(sessionId);
    if (session) {
      try {
        session.proc.kill();
      } catch (e) {
        logger.warn(`Failed to kill Codex CLI process: ${e.message}`);
      }
      this.processes.delete(sessionId);
    }
  }

  /**
   * 清理资源
   */
  dispose() {
    for (const [sessionId, session] of this.processes) {
      try {
        session.proc.kill();
      } catch {}
    }
    this.processes.clear();
    this.pendingRequests.clear();
  }
}
