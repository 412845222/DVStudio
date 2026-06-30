/**
 * Copilot CLI 适配器
 * 
 * 支持 GitHub Copilot CLI 的 STDIO 模式。
 * 使用 copilot gRPC do STDIO 进行通信。
 */

import { spawn } from 'child_process';
import { BaseCLIAdapter, CLIEventType, commandExists } from './base.mjs';
import logger from '../../core/logger.mjs';

/**
 * Copilot CLI 适配器
 */
export class CopilotCliAdapter extends BaseCLIAdapter {
  constructor(cliConfig = {}) {
    super(cliConfig);
    this.commandName = 'gh';
    this.displayName = 'GitHub Copilot';
    this.processes = new Map();
    this.pendingRequests = new Map();
    this.messageBuffer = '';
  }

  /**
   * 检查 Copilot CLI 是否可用
   */
  async checkAvailable() {
    // 检查 gh CLI
    if (!commandExists(this.commandName)) {
      return { available: false, version: null, status: 'not_installed' };
    }

    try {
      // 检查 gh copilot extension
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
      const result = await this.runCommand(['copilot', '--version'], { timeout: 10000 });
      return result.stdout?.trim() || 'unknown';
    } catch {
      return 'unknown';
    }
  }

  /**
   * 开始会话 - 启动 copilot gRPC 模式
   * @param {object} options 
   */
  async startSession(options = {}) {
    const sessionId = `copilot_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    
    // Copilot CLI 使用 copilot gRPC do --stdio
    const args = ['copilot', 'gRPC', 'do', '--stdio'];

    const proc = spawn(this.commandName, args, {
      env: { 
        ...process.env, 
        ...this.cliConfig.env,
        GITHUB_TOKEN: this.cliConfig.githubToken || process.env.GITHUB_TOKEN || '',
      },
      cwd: options.cwd || process.cwd(),
      shell: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const session = {
      proc,
      started: false,
      messageId: 0,
    };

    this.processes.set(sessionId, session);

    // 设置消息处理
    proc.stdout?.on('data', (data) => {
      this.handleMessage(sessionId, data.toString());
    });

    proc.stderr?.on('data', (data) => {
      const output = data.toString().trim();
      if (output) {
        logger.debug(`Copilot CLI stderr: ${output}`);
      }
    });

    proc.on('error', (err) => {
      logger.error(`Copilot CLI error: ${err.message}`);
      session.started = false;
    });

    proc.on('close', (code) => {
      logger.info(`Copilot CLI closed with code ${code}`);
      session.started = false;
    });

    // 等待初始化
    session.started = true;
    return sessionId;
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
    
    // Copilot CLI 使用长度前缀的 JSON-RPC 消息
    // 格式: <length>\n<json-rpc-message>
    const lines = this.messageBuffer.split('\n');
    this.messageBuffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;

      // 检查是否是长度前缀格式
      const lengthMatch = line.match(/^(\d+)$/);
      if (lengthMatch) {
        // 下一行应该是实际的 JSON 数据
        continue;
      }

      try {
        const message = JSON.parse(line);
        this.processMessage(sessionId, message);
      } catch {}
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

    // 处理响应
    if (message.id) {
      const resolver = this.pendingRequests.get(message.id);
      if (resolver) {
        if (message.error) {
          resolver.reject(new Error(JSON.stringify(message.error)));
        } else {
          resolver(message.result);
        }
        this.pendingRequests.delete(message.id);
      }
    }

    // 处理通知（无 id）
    if (message.method && !message.id) {
      this.handleNotification(sessionId, message);
    }
  }

  /**
   * 处理通知消息
   * @param {string} sessionId 
   * @param {object} message 
   */
  handleNotification(sessionId, message) {
    const method = message.method;
    const params = message.params || {};

    switch (method) {
      case 'binaryMessage':
        // 处理二进制消息
        break;
      case 'showStatus':
        // 显示状态
        logger.debug(`Copilot status: ${JSON.stringify(params)}`);
        break;
      case 'llmDenied':
        logger.warn('Copilot access denied');
        break;
      default:
        logger.debug(`Copilot notification: ${method}`);
    }
  }

  /**
   * 发送 JSON-RPC 请求
   * @param {string} sessionId 
   * @param {string} method 
   * @param {object} params 
   */
  sendRequest(sessionId, method, params = {}) {
    const session = this.processes.get(sessionId);
    if (!session || !session.proc.stdin) {
      throw new Error('Session not available');
    }

    const id = ++session.messageId;
    const request = { jsonrpc: '2.0', id, method, params };
    const jsonStr = JSON.stringify(request);
    
    // 发送长度前缀格式
    session.proc.stdin.write(`${jsonStr.length}\n${jsonStr}`);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request ${method} timed out`));
      }, 60000);

      this.pendingRequests.set(id, (result) => {
        clearTimeout(timeout);
        resolve(result);
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
      // 发送完成请求
      const result = await this.sendRequest(sessionId, 'complete', {
        prompt: content,
        context: options.context || {},
        language: options.language || 'plaintext',
      });

      // 处理响应
      if (result?.choices) {
        for (const choice of result.choices) {
          if (choice.text) {
            yield { type: CLIEventType.TEXT_DELTA, content: choice.text };
          }
        }
      }

      yield { type: CLIEventType.DONE };
    } catch (err) {
      yield { type: CLIEventType.ERROR, error: err.message };
    }
  }

  /**
   * 解析 CLI 输出
   * @param {string} line 
   */
  parseOutput(line) {
    try {
      const event = JSON.parse(line);
      
      if (event.method === 'complete') {
        const choice = event.params?.choice;
        if (choice?.text) {
          return { type: CLIEventType.TEXT_DELTA, content: choice.text };
        }
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
        logger.warn(`Failed to kill Copilot CLI process: ${e.message}`);
      }
      this.processes.delete(sessionId);
    }
  }

  /**
   * 取消当前请求
   * @param {string} sessionId 
   */
  cancel(sessionId) {
    this.stopSession(sessionId);
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
