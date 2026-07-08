#!/usr/bin/env node
/**
 * DVStudio MCP Server stdio桥接入口
 * 
 * 独立Node.js脚本，作为MCP Server通过stdio运行。
 * 直接实现MCP JSON-RPC协议，不依赖@modelcontextprotocol/sdk，
 * 避免子进程中模块解析和zod schema问题。
 * 
 * 工具调用通过命名管道转发给Electron主进程的socketBridge。
 */

import net from 'net';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SOCKET_PATH = process.platform === 'win32'
  ? '\\\\.\\pipe\\dvstudio-mcp-bridge'
  : path.join(os.tmpdir(), 'dvstudio-mcp-bridge.sock');

const BRIDGE_TIMEOUT = 60000;

const PROTOCOL_VERSION = '2024-11-05';
const SERVER_NAME = 'dvstudio';
const SERVER_VERSION = '1.0.0';

const TOOLS = [
  {
    name: 'get_blueprint_state',
    description: '获取当前工作流蓝图的状态，包括节点列表、连接关系、选中节点，以及viewport（视口位置与缩放信息）。在创建节点之前建议先调用此工具了解当前蓝图状态。',
    inputSchema: {
      type: 'object',
      properties: {
        includeNodes: { type: 'boolean', description: '是否包含节点详情，默认 true' },
        includeEdges: { type: 'boolean', description: '是否包含连接详情，默认 true' }
      }
    }
  },
  {
    name: 'list_node_types',
    description: '列出 DVStudio 支持的节点类型，可按分类筛选',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string', description: '节点分类，如 image、video、3d、text、control 等，可选' }
      }
    }
  },
  {
    name: 'create_node',
    description: '在工作流蓝图中创建新节点。重要提示：新节点会自动放置在用户当前蓝图视口中心（自动避开已有节点），你不需要也不应该传入position/x/y参数。创建前建议先调用 list_node_types 获取正确的节点类型ID。',
    inputSchema: {
      type: 'object',
      required: ['type'],
      properties: {
        type: { type: 'string', description: '节点类型ID（actionId），如 text-generation、image-generation、video-generation、scene-understanding、scene-layout、scene-decompose、comfyui、model3d、rotate-image、unreal-export 等' },
        title: { type: 'string', description: '节点显示名称/标题，可选。不指定则使用节点类型默认名称' },
        alias: { type: 'string', description: '节点别名，可选' },
        config: { type: 'object', description: '节点初始配置参数，可选' }
      }
    }
  },
  {
    name: 'delete_node',
    description: '删除工作流蓝图中的指定节点，危险操作需要用户确认',
    inputSchema: {
      type: 'object',
      required: ['nodeId'],
      properties: {
        nodeId: { type: 'string', description: '要删除的节点 ID' },
        force: { type: 'boolean', description: '是否强制删除（跳过确认），默认 false' }
      }
    }
  },
  {
    name: 'update_node_config',
    description: '更新指定节点的配置参数',
    inputSchema: {
      type: 'object',
      required: ['nodeId', 'config'],
      properties: {
        nodeId: { type: 'string', description: '节点 ID' },
        config: { type: 'object', description: '要更新的配置项，将与现有配置合并' }
      }
    }
  },
  {
    name: 'connect_nodes',
    description: '连接两个节点的指定端口',
    inputSchema: {
      type: 'object',
      required: ['fromNode', 'toNode'],
      properties: {
        fromNode: { type: 'string', description: '源节点 ID' },
        fromPort: { type: 'string', description: '源端口 ID（输出端口），默认 out-0' },
        toNode: { type: 'string', description: '目标节点 ID' },
        toPort: { type: 'string', description: '目标端口 ID（输入端口），默认 in-0' }
      }
    }
  },
  {
    name: 'disconnect_nodes',
    description: '断开指定的连接',
    inputSchema: {
      type: 'object',
      properties: {
        edgeId: { type: 'string', description: '要断开的连接边 ID' },
        nodeId: { type: 'string', description: '节点ID（断开该节点所有连接）' },
        portType: {
          type: 'string',
          enum: ['input', 'output', 'all'],
          description: '端口类型，默认all'
        }
      }
    }
  },
  {
    name: 'get_project_info',
    description: '获取当前项目的基本信息',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'get_node_info',
    description: '获取指定节点的详细信息，包括配置、输入输出端口、状态等',
    inputSchema: {
      type: 'object',
      required: ['nodeId'],
      properties: {
        nodeId: { type: 'string', description: '节点 ID' }
      }
    }
  },
  {
    name: 'select_node',
    description: '选中指定节点，使其在画布中高亮显示',
    inputSchema: {
      type: 'object',
      required: ['nodeId'],
      properties: {
        nodeId: { type: 'string', description: '要选中的节点 ID' }
      }
    }
  },
  {
    name: 'set_node_text',
    description: '设置文本节点的文本内容或其他节点的提示词',
    inputSchema: {
      type: 'object',
      required: ['nodeId', 'text'],
      properties: {
        nodeId: { type: 'string', description: '节点 ID' },
        text: { type: 'string', description: '要设置的文本内容' }
      }
    }
  },
  {
    name: 'execute_node',
    description: '执行指定节点（提交生成任务），危险操作需要用户确认',
    inputSchema: {
      type: 'object',
      required: ['nodeId'],
      properties: {
        nodeId: { type: 'string', description: '要执行的节点 ID' }
      }
    }
  },
  {
    name: 'auto_layout',
    description: '【仅在用户明确要求时使用】自动排列指定的节点。注意：不要在创建节点后自动调用此工具，节点创建时已自动放置在合适位置。',
    inputSchema: {
      type: 'object',
      properties: {
        nodeIds: {
          type: 'array',
          items: { type: 'string' },
          description: '要排列的节点ID列表。如果不提供，将只排列本次会话中新创建的节点，不会影响已有节点。'
        },
        direction: {
          type: 'string',
          enum: ['horizontal', 'vertical'],
          description: '布局方向，默认horizontal'
        },
        spacing: { type: 'number', description: '节点间距，默认200' }
      }
    }
  },
  {
    name: 'list_node_tasks',
    description: '列出指定节点或所有节点的生成任务记录',
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: '节点 ID，可选。不提供则列出所有任务' },
        status: {
          type: 'string',
          enum: ['pending', 'running', 'completed', 'failed', 'canceled'],
          description: '按状态筛选，可选'
        }
      }
    }
  }
];

const SERVER_INSTRUCTIONS = `DVStudio MCP Server - AI工作流蓝图操作接口

你是DVStudio的AI助手，可以通过这些工具操作AI工作流蓝图。请直接调用工具完成用户的蓝图操作请求，不要读取或修改文件系统中的代码文件。

## 工具使用指南
1. 蓝图状态查询：使用 get_blueprint_state 获取当前蓝图状态（包含viewport视口信息：zoom缩放、panX/panY平移、centerWorldX/centerWorldY视口中心世界坐标）
2. 节点类型查询：使用 list_node_types 获取支持的节点类型
3. 节点创建：使用 create_node 创建新节点，type字段使用actionId如'text-generation'。**重要：不需要也不能传入position/x/y参数，节点会自动放置在上一个创建节点的旁边，保持工作流连贯性**
4. 节点配置：使用 update_node_config 更新节点参数；使用 set_node_text 设置文本内容
5. 节点连接：使用 connect_nodes 连接节点端口；使用 disconnect_nodes 断开连接
6. 节点删除：使用 delete_node 删除节点（需要用户确认）
7. 节点信息：使用 get_node_info 获取节点详情
8. 节点选择：使用 select_node 选中画布上的节点
9. 自动布局：使用 auto_layout 排列节点（仅在用户明确要求时使用，禁止在创建节点后自动调用）
10. 项目信息：使用 get_project_info 获取项目信息
11. 任务查询：使用 list_node_tasks 查询生成任务记录

## 重要提示
- 创建工作流时，先调用 get_blueprint_state 查询当前状态
- 创建节点时指定正确的type（actionId），不确定时先调用 list_node_types
- **绝对不要传入position、x、y参数**，节点位置由系统自动计算，会紧邻上一个创建的节点放置
- **绝对禁止在创建节点后自动调用auto_layout**，节点创建时已自动放置在合适位置。仅当用户明确说"整理布局"、"自动排列"时才使用auto_layout
- 文本节点使用 set_node_text 设置文本内容
- 对于删除节点、执行节点等危险操作，系统会提示用户确认
- get_blueprint_state返回的viewport.centerWorldX/centerWorldY是用户当前视口中心的世界坐标（仅供参考，创建节点时系统自动使用）`;

function sendToElectron(toolName, args) {
  return new Promise((resolve, reject) => {
    const client = net.createConnection(SOCKET_PATH, () => {
      const requestId = `req-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      const request = JSON.stringify({ requestId, toolName, args });

      const timeout = setTimeout(() => {
        try { client.destroy(); } catch {}
        reject(new Error(`Bridge request timed out after ${BRIDGE_TIMEOUT}ms`));
      }, BRIDGE_TIMEOUT);

      let responseData = '';

      client.on('data', (data) => {
        responseData += data.toString();
        try {
          const response = JSON.parse(responseData);
          if (response.requestId === requestId) {
            clearTimeout(timeout);
            client.destroy();
            if (response.error) {
              reject(new Error(response.error));
            } else {
              resolve(response.result);
            }
          }
        } catch {}
      });

      client.on('error', (err) => {
        clearTimeout(timeout);
        reject(new Error(`Bridge connection error: ${err.message}. Is DVStudio running?`));
      });

      client.write(request + '\n');
    });

    client.on('error', (err) => {
      reject(new Error(`Cannot connect to DVStudio: ${err.message}. Please ensure DVStudio is running.`));
    });
  });
}

function sendResponse(id, result) {
  const response = { jsonrpc: '2.0', id, result };
  process.stdout.write(JSON.stringify(response) + '\n');
}

function sendErrorResponse(id, code, message, data) {
  const response = {
    jsonrpc: '2.0',
    id,
    error: { code, message, data }
  };
  process.stdout.write(JSON.stringify(response) + '\n');
}

function sendNotification(method, params) {
  const notification = { jsonrpc: '2.0', method, params };
  process.stdout.write(JSON.stringify(notification) + '\n');
}

function handleRequest(method, id, params) {
  switch (method) {
    case 'initialize':
      sendResponse(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {
          tools: { listChanged: false },
          resources: { listChanged: false, subscribe: false },
          prompts: { listChanged: false }
        },
        serverInfo: {
          name: SERVER_NAME,
          version: SERVER_VERSION
        },
        instructions: SERVER_INSTRUCTIONS
      });
      break;

    case 'ping':
      sendResponse(id, {});
      break;

    case 'tools/list':
      sendResponse(id, { tools: TOOLS });
      break;

    case 'tools/call':
      handleToolCall(id, params);
      break;

    case 'resources/list':
      sendResponse(id, { resources: [] });
      break;

    case 'resources/templates/list':
      sendResponse(id, { resourceTemplates: [] });
      break;

    case 'prompts/list':
      sendResponse(id, { prompts: [] });
      break;

    case 'logging/setLevel':
      sendResponse(id, {});
      break;

    case 'completion/complete':
      sendResponse(id, { completion: { values: [], total: 0, hasMore: false } });
      break;

    default:
      sendErrorResponse(id, -32601, `Method not found: ${method}`);
  }
}

async function handleToolCall(id, params) {
  const toolName = params?.name;
  const args = params?.arguments || {};

  const tool = TOOLS.find(t => t.name === toolName);
  if (!tool) {
    sendErrorResponse(id, -32601, `Unknown tool: ${toolName}`);
    return;
  }

  try {
    const result = await sendToElectron(toolName, args);
    sendResponse(id, {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      isError: false
    });
  } catch (err) {
    sendResponse(id, {
      content: [{ type: 'text', text: `Error: ${err.message}` }],
      isError: true
    });
  }
}

function handleNotification(method) {
  if (method === 'notifications/initialized') {
    process.stderr.write('[DVStudio MCP Bridge] Initialized\n');
  }
}

let buffer = '';

process.stdin.on('data', (data) => {
  buffer += data.toString();

  const lines = buffer.split('\n');
  buffer = lines.pop() || '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    try {
      const message = JSON.parse(trimmed);
      if (message.id !== undefined) {
        handleRequest(message.method, message.id, message.params);
      } else {
        handleNotification(message.method, message.params);
      }
    } catch (err) {
      process.stderr.write(`[DVStudio MCP Bridge] Parse error: ${err.message}\n`);
    }
  }
});

process.stdin.on('end', () => {
  process.exit(0);
});

process.stderr.write(`[DVStudio MCP Bridge] Server started with ${TOOLS.length} tools\n`);
