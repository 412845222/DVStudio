/**
 * MCP Socket桥接服务器
 * 
 * 在Electron主进程中创建一个命名管道/TCP socket服务器，
 * 接收来自stdioBridge.mjs的工具调用请求，通过ToolExecutor执行，然后返回结果。
 */

import net from 'net';
import path from 'path';
import os from 'os';
import { getToolExecutor } from '../toolExecutor.mjs';
import logger from '../../../core/logger.mjs';

const SOCKET_PATH = process.platform === 'win32'
  ? '\\\\.\\pipe\\dvstudio-mcp-bridge'
  : path.join(os.tmpdir(), 'dvstudio-mcp-bridge.sock');

export class MCPBridgeServer {
  constructor() {
    this.server = null;
    this.isRunning = false;
    this.toolRequestCounter = 0;
  }

  start() {
    if (this.isRunning) {
      return;
    }

    try {
      this.server = net.createServer((socket) => {
        logger.debug('[MCP Bridge] Client connected');

        let buffer = '';

        socket.on('data', async (data) => {
          buffer += data.toString();
          
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.trim()) continue;
            await this.handleRequest(socket, line);
          }
        });

        socket.on('error', (err) => {
          logger.debug(`[MCP Bridge] Socket error: ${err.message}`);
        });

        socket.on('close', () => {
          logger.debug('[MCP Bridge] Client disconnected');
        });
      });

      this.server.on('error', (err) => {
        logger.error(`[MCP Bridge] Server error: ${err.message}`);
      });

      this.server.listen(SOCKET_PATH, () => {
        this.isRunning = true;
        logger.info(`[MCP Bridge] Server listening on: ${SOCKET_PATH}`);
      });
    } catch (err) {
      logger.error(`[MCP Bridge] Failed to start: ${err.message}`);
    }
  }

  async handleRequest(socket, line) {
    const executor = getToolExecutor();
    try {
      const request = JSON.parse(line);
      const { requestId, action, toolName, args } = request;

      if (action === 'tools/list') {
        const tools = executor.getMCPTools();
        const response = JSON.stringify({
          requestId,
          result: tools
        });
        socket.write(response + '\n');
        return;
      }

      this.toolRequestCounter++;
      logger.debug(`[MCP Bridge] Tool request #${this.toolRequestCounter}: ${toolName} (${requestId})`);

      try {
        const result = await executor.callTool(toolName, args || {}, { requestId });
        const response = JSON.stringify({
          requestId,
          result
        });
        socket.write(response + '\n');
      } catch (err) {
        const response = JSON.stringify({
          requestId,
          error: err.message
        });
        socket.write(response + '\n');
      }
    } catch (err) {
      logger.error(`[MCP Bridge] Invalid request: ${err.message}`);
    }
  }

  stop() {
    if (!this.isRunning) {
      return;
    }

    try {
      if (this.server) {
        this.server.close();
      }
    } catch (err) {
      logger.warn(`[MCP Bridge] Error stopping: ${err.message}`);
    }

    this.isRunning = false;
    this.server = null;
    logger.info('[MCP Bridge] Server stopped');
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      socketPath: SOCKET_PATH,
      toolCount: getToolExecutor().listTools().length
    };
  }
}

let bridgeInstance = null;

export function getMCPBridgeServer() {
  if (!bridgeInstance) {
    bridgeInstance = new MCPBridgeServer();
  }
  return bridgeInstance;
}
