/**
 * DVStudio MCP Server 状态管理
 * 
 * 管理MCP Server的运行状态。
 * 外部CLI（Codex等）通过stdioBridge.mjs（独立子进程）连接，
 * 内部DVSAgent通过ToolRegistry直接调用ToolExecutor。
 */

import { getToolExecutor } from '../toolExecutor.mjs';
import logger from '../../../core/logger.mjs';

export class DVStudioMCPServer {
  constructor() {
    this.isRunning = false;
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      toolsRegistered: true,
      toolCount: getToolExecutor().listTools().length
    };
  }

  async startStdio() {
    logger.warn('[MCP Server] startStdio() is not supported in Electron main process. Use stdioBridge.mjs for external CLI connections.');
  }

  async stop() {
    this.isRunning = false;
  }
}

let mcpServerInstance = null;

export function getDVStudioMCPServer() {
  if (!mcpServerInstance) {
    mcpServerInstance = new DVStudioMCPServer();
  }
  return mcpServerInstance;
}
