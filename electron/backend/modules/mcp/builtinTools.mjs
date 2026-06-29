/**
 * DVStudio 内置 MCP 工具
 * 
 * 注册与工作流蓝图相关的内置工具，通过 IPC 与前端通信执行实际操作。
 */

import { BrowserWindow, ipcMain } from 'electron';
import logger from '../../core/logger.mjs';

const TOOL_TIMEOUT_MS = 30000;

function broadcastToWindows(channel, payload) {
  const windows = BrowserWindow.getAllWindows();
  for (const win of windows) {
    try {
      win.webContents.send(channel, payload);
    } catch (err) {
      logger.debug(`Failed to broadcast to window: ${err.message}`);
    }
  }
}

/**
 * 等待前端响应工具调用
 * @param {string} toolName - 工具名称
 * @param {object} args - 工具参数
 * @param {string} requestId - 请求 ID
 * @returns {Promise<object>} 工具执行结果
 */
function waitForToolResponse(toolName, args, requestId) {
  return new Promise((resolve, reject) => {
    const channel = `dweb:builtin-tool:${requestId}:response`;
    const timeout = setTimeout(() => {
      ipcMain.removeHandler(channel);
      reject(new Error(`Tool ${toolName} timed out after ${TOOL_TIMEOUT_MS}ms`));
    }, TOOL_TIMEOUT_MS);

    ipcMain.once(channel, (_event, response) => {
      clearTimeout(timeout);
      if (response && response.error) {
        reject(new Error(response.error));
      } else {
        resolve(response?.result ?? response);
      }
    });

    broadcastToWindows(`dweb:builtin-tool:call`, {
      requestId,
      toolName,
      args,
    });
  });
}

let requestCounter = 0;
const nextRequestId = () => `tool-${Date.now()}-${++requestCounter}`;

/**
 * 注册 DVStudio 内置工具
 * @param {object} mcpServerManager - MCP 服务器管理器
 */
export function registerBuiltinTools(mcpServerManager) {

  // ========== get_blueprint_state ==========
  mcpServerManager.registerBuiltinTool(
    'get_blueprint_state',
    '获取当前工作流蓝图的状态，包括节点列表、连接关系、选中节点等信息',
    {
      type: 'object',
      properties: {
        includeNodes: {
          type: 'boolean',
          description: '是否包含节点详情，默认 true',
        },
        includeEdges: {
          type: 'boolean',
          description: '是否包含连接详情，默认 true',
        },
      },
    },
    async (args) => {
      const requestId = nextRequestId();
      logger.debug(`Builtin tool get_blueprint_state called: ${requestId}`);
      return waitForToolResponse('get_blueprint_state', args || {}, requestId);
    }
  );

  // ========== list_node_types ==========
  mcpServerManager.registerBuiltinTool(
    'list_node_types',
    '列出 DVStudio 支持的节点类型，可按分类筛选',
    {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description: '节点分类，如 image、video、3d、text、control 等，可选',
        },
      },
    },
    async (args) => {
      const requestId = nextRequestId();
      logger.debug(`Builtin tool list_node_types called: ${requestId}`);
      return waitForToolResponse('list_node_types', args || {}, requestId);
    }
  );

  // ========== create_node ==========
  mcpServerManager.registerBuiltinTool(
    'create_node',
    '在工作流蓝图中创建新节点',
    {
      type: 'object',
      required: ['type'],
      properties: {
        type: {
          type: 'string',
          description: '节点类型，如 image-generate、video-generate、comfyui-custom 等',
        },
        label: {
          type: 'string',
          description: '节点名称/标题，可选',
        },
        position: {
          type: 'object',
          description: '节点位置坐标',
          properties: {
            x: { type: 'number' },
            y: { type: 'number' },
          },
        },
        config: {
          type: 'object',
          description: '节点初始配置，可选',
        },
      },
    },
    async (args) => {
      const requestId = nextRequestId();
      logger.debug(`Builtin tool create_node called: ${requestId}, type=${args?.type}`);
      return waitForToolResponse('create_node', args || {}, requestId);
    }
  );

  // ========== delete_node ==========
  mcpServerManager.registerBuiltinTool(
    'delete_node',
    '删除工作流蓝图中的指定节点，危险操作需要确认',
    {
      type: 'object',
      required: ['nodeId'],
      properties: {
        nodeId: {
          type: 'string',
          description: '要删除的节点 ID',
        },
        force: {
          type: 'boolean',
          description: '是否强制删除（跳过确认），默认 false',
        },
      },
    },
    async (args) => {
      const requestId = nextRequestId();
      logger.debug(`Builtin tool delete_node called: ${requestId}, nodeId=${args?.nodeId}`);
      return waitForToolResponse('delete_node', args || {}, requestId);
    }
  );

  // ========== update_node_config ==========
  mcpServerManager.registerBuiltinTool(
    'update_node_config',
    '更新指定节点的配置参数',
    {
      type: 'object',
      required: ['nodeId', 'config'],
      properties: {
        nodeId: {
          type: 'string',
          description: '节点 ID',
        },
        config: {
          type: 'object',
          description: '要更新的配置项，将与现有配置合并',
        },
      },
    },
    async (args) => {
      const requestId = nextRequestId();
      logger.debug(`Builtin tool update_node_config called: ${requestId}, nodeId=${args?.nodeId}`);
      return waitForToolResponse('update_node_config', args || {}, requestId);
    }
  );

  // ========== connect_nodes ==========
  mcpServerManager.registerBuiltinTool(
    'connect_nodes',
    '连接两个节点的指定端口',
    {
      type: 'object',
      required: ['fromNode', 'fromPort', 'toNode', 'toPort'],
      properties: {
        fromNode: {
          type: 'string',
          description: '源节点 ID',
        },
        fromPort: {
          type: 'string',
          description: '源端口 ID（输出端口）',
        },
        toNode: {
          type: 'string',
          description: '目标节点 ID',
        },
        toPort: {
          type: 'string',
          description: '目标端口 ID（输入端口）',
        },
      },
    },
    async (args) => {
      const requestId = nextRequestId();
      logger.debug(`Builtin tool connect_nodes called: ${requestId}`);
      return waitForToolResponse('connect_nodes', args || {}, requestId);
    }
  );

  // ========== disconnect_nodes ==========
  mcpServerManager.registerBuiltinTool(
    'disconnect_nodes',
    '断开指定的连接',
    {
      type: 'object',
      required: ['edgeId'],
      properties: {
        edgeId: {
          type: 'string',
          description: '要断开的连接边 ID',
        },
      },
    },
    async (args) => {
      const requestId = nextRequestId();
      logger.debug(`Builtin tool disconnect_nodes called: ${requestId}, edgeId=${args?.edgeId}`);
      return waitForToolResponse('disconnect_nodes', args || {}, requestId);
    }
  );

  // ========== get_project_info ==========
  mcpServerManager.registerBuiltinTool(
    'get_project_info',
    '获取当前项目的基本信息',
    {
      type: 'object',
      properties: {},
    },
    async (args) => {
      const requestId = nextRequestId();
      logger.debug(`Builtin tool get_project_info called: ${requestId}`);
      return waitForToolResponse('get_project_info', args || {}, requestId);
    }
  );

  logger.info('DVStudio builtin tools registered');
}
