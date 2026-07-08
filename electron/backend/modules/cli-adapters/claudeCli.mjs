/**
 * Claude CLI 适配器
 * 
 * 支持 Claude Code CLI 的流式输出。
 * 使用 --output-format stream-json 获取结构化事件流。
 */

import { spawn } from 'child_process';
import { BaseCLIAdapter, CLIEventType, commandExists, findCommandPath, getProxyEnvVars } from './base.mjs';
import logger from '../../core/logger.mjs';

/**
 * Claude CLI 适配器
 */
export class ClaudeCliAdapter extends BaseCLIAdapter {
  constructor(cliConfig = {}) {
    super(cliConfig);
    this.processes = new Map(); // sessionId -> { proc, stdin }
  }

  get commandName() {
    return 'claude';
  }

  get displayName() {
    return 'Claude Code';
  }

  /**
   * 检查 Claude CLI 是否可用
   */
  async checkAvailable() {
    if (!commandExists(this.commandName)) {
      return { available: false, version: null, status: 'not_installed' };
    }

    try {
      const version = await this.getVersion();
      // Claude CLI 要求 0.7.0+ 版本
      const minVersion = [0, 7, 0];
      const versionParts = version?.replace(/[^\d.]/g, '').split('.').map(Number) || [];
      
      let supported = true;
      for (let i = 0; i < minVersion.length; i++) {
        if ((versionParts[i] || 0) < minVersion[i]) {
          supported = false;
          break;
        }
      }

      if (supported) {
        return { available: true, version, status: 'available' };
      } else {
        return { available: false, version, status: 'version_unsupported' };
      }
    } catch (err) {
      return { available: false, version: null, status: 'unknown', error: err.message };
    }
  }

  /**
   * 获取 CLI 版本
   */
  async getVersion() {
    try {
      const result = await this.runCommand([ '--version' ], { timeout: 5000 });
      // 输出格式: "claude 1.0.10 (commit 1234567)" 或 "claude code 1.0.10"
      const match = result.stdout.match(/claude[^\d]*(\d+\.\d+\.\d+)/);
      return match ? match[1] : result.stdout.trim();
    } catch {
      return null;
    }
  }

  /**
   * 开始会话
   * @param {object} options 
   */
  async startSession(options = {}) {
    const sessionId = `claude_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    
    // 构建基本参数
    const args = [
      '--no-input',
      '--output-format', 'stream-json',
    ];

    // 添加附加选项
    if (options.model) {
      args.push('--model', options.model);
    }
    if (options.maxTokens) {
      args.push('--max-tokens', String(options.maxTokens));
    }
    if (options.systemPrompt) {
      args.push('--system-prompt', options.systemPrompt);
    }
    if (options.tooling) {
      args.push('--enable-tooling');
    }

    // 使用 --print 模式进行初始连接测试
    const testArgs = [...args, '--print', '--', 'test'];
    const proxyEnv = getProxyEnvVars();
    
    const proc = spawn(this.commandName, testArgs, {
      env: { ...process.env, ...proxyEnv, ...this.cliConfig.env, NO_COLOR: '1' },
      cwd: options.cwd || process.cwd(),
      shell: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.processes.set(sessionId, { proc, args, started: false });

    // 设置超时检测会话是否成功启动
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.processes.delete(sessionId);
        reject(new Error('Session start timeout'));
      }, 10000);

      proc.on('error', (err) => {
        clearTimeout(timeout);
        this.processes.delete(sessionId);
        reject(err);
      });

      // 一旦有输出，说明会话已建立
      proc.stdout?.on('data', (data) => {
        const output = data.toString().trim();
        if (output) {
          clearTimeout(timeout);
          this.processes.get(sessionId).started = true;
          resolve(sessionId);
        }
      });

      proc.stderr?.on('data', (data) => {
        const output = data.toString().trim();
        // 忽略某些无害的 stderr 输出
        if (output && !output.includes('Connecting to Anthropic')) {
          logger.debug(`Claude CLI stderr: ${output}`);
        }
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

    const { proc, args } = session;
    
    // 使用 --resume 或新会话
    // 注意：Claude CLI 不支持交互式输入，我们需要用 --print 模式
    const messageArgs = [
      ...args.filter(a => a !== '--print'),
      '--print',
      '--',
      content
    ];

    // 终止旧进程
    try { proc.kill(); } catch {}

    // 启动新进程发送消息
    const msgProxyEnv = getProxyEnvVars();
    const newProc = spawn(this.commandName, messageArgs, {
      env: { ...process.env, ...msgProxyEnv, ...this.cliConfig.env, NO_COLOR: '1' },
      cwd: options.cwd || process.cwd(),
      shell: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    session.proc = newProc;

    let buffer = '';
    let accumulatedContent = '';
    let currentToolCall = null;

    newProc.stdout?.on('data', (data) => {
      buffer += data.toString();
      
      // 处理多行 JSON
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (!line.trim()) continue;
        
        try {
          const event = JSON.parse(line);
          const result = this.parseEvent(event, currentToolCall);
          
          if (result) {
            if (result.type === CLIEventType.TOOL_CALL_START) {
              currentToolCall = { id: result.id, name: result.name, arguments: '' };
            } else if (result.type === CLIEventType.TOOL_CALL_END && currentToolCall) {
              currentToolCall = null;
            }
            
            // 累积文本内容
            if (result.type === CLIEventType.TEXT_DELTA) {
              accumulatedContent += result.content;
            }
            
            // yield 解析后的事件
            return result; // 注意：这只能在 async generator 中使用
          }
        } catch {}
      }
    });

    // 使用事件处理
    const eventHandler = (data) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (!line.trim()) continue;
        
        try {
          const event = JSON.parse(line);
          const result = this.parseEvent(event, currentToolCall);
          
          if (result) {
            if (result.type === CLIEventType.TOOL_CALL_START) {
              currentToolCall = { id: result.id, name: result.name, arguments: '' };
            } else if (result.type === CLIEventType.TOOL_CALL_END && currentToolCall) {
              currentToolCall = null;
            }
          }
        } catch {}
      }
    };

    newProc.stdout?.on('data', eventHandler);

    // 收集 stderr 中的错误
    newProc.stderr?.on('data', (data) => {
      const output = data.toString().trim();
      if (output && output.includes('Error')) {
        logger.error(`Claude CLI error: ${output}`);
      }
    });

    // 等待进程结束
    yield* this.waitForProcess(newProc, sessionId, accumulatedContent);
  }

  /**
   * 等待进程结束
   */
  async *waitForProcess(proc, sessionId, accumulatedContent) {
    yield new Promise((resolve) => {
      proc.on('close', (code) => {
        resolve({ content: accumulatedContent, exitCode: code });
      });
    });
  }

  /**
   * 解析 Claude CLI 事件
   * @param {object} event 
   * @param {object} currentToolCall 
   */
  parseEvent(event, currentToolCall) {
    const type = event.type;

    switch (type) {
      case 'assistant':
        if (event.message?.content) {
          for (const block of event.message.content) {
            if (block.type === 'text') {
              return { type: CLIEventType.TEXT_DELTA, content: block.text };
            } else if (block.type === 'tool_use') {
              return { 
                type: CLIEventType.TOOL_CALL_START, 
                id: block.id, 
                name: block.name,
                arguments: block.input ? JSON.stringify(block.input) : '{}'
              };
            }
          }
        }
        break;

      case 'assistant_chunk':
        if (event.chunk?.text) {
          return { type: CLIEventType.TEXT_DELTA, content: event.chunk.text };
        }
        if (event.chunk?.type === 'tool_use') {
          return { 
            type: CLIEventType.TOOL_CALL_START, 
            id: event.chunk.id, 
            name: event.chunk.name,
            arguments: event.chunk.input ? JSON.stringify(event.chunk.input) : '{}'
          };
        }
        break;

      case 'tool_result':
        if (event.tool_use_id && event.content) {
          return { 
            type: CLIEventType.TOOL_CALL_END, 
            id: event.tool_use_id, 
            result: event.content 
          };
        }
        break;

      case 'error':
        return { type: CLIEventType.ERROR, error: event.message || 'Unknown error' };

      case 'done':
        return { type: CLIEventType.DONE };

      default:
        // 忽略其他事件类型
        break;
    }

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
        logger.warn(`Failed to kill Claude CLI process: ${e.message}`);
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
  }
}
