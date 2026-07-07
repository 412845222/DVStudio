#!/usr/bin/env node
/**
 * DVStudio MCP Server stdio桥接入口
 * 
 * 这是一个独立的Node.js脚本，作为MCP Server通过stdio运行，
 * 供Codex CLI、Copilot CLI等外部工具通过spawn连接。
 * 
 * 该脚本通过命名管道/TCP socket与Electron主进程通信，将工具调用转发给前端执行。
 * 
 * 使用方式：
 * - 在Codex/Copilot配置中，设置command为node，args为[此脚本路径]
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
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

function sendToElectron(toolName, args) {
  return new Promise((resolve, reject) => {
    const client = net.createConnection(SOCKET_PATH, () => {
      const requestId = `req-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      const request = JSON.stringify({
        requestId,
        toolName,
        args
      });

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

function makeToolHandler(toolName) {
  return async (args) => {
    try {
      const result = await sendToElectron(toolName, args || {});
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
    }
  };
}

async function main() {
  const server = new McpServer({
    name: 'dvstudio',
    version: '1.0.0'
  }, {
    capabilities: {
      tools: {}
    },
    instructions: `DVStudio MCP Server - AI工作流蓝图操作接口

你是DVStudio的AI助手，可以通过这些工具操作AI工作流蓝图：

## 工具使用指南

1. **蓝图状态查询**：使用 get_blueprint_state 获取当前蓝图状态，包括节点列表和连接关系
2. **节点类型查询**：使用 list_node_types 获取支持的节点类型
3. **节点创建**：使用 create_node 创建新节点
4. **节点配置**：使用 update_node_config 更新节点参数；使用 set_node_text 设置文本节点内容或提示词
5. **节点连接**：使用 connect_nodes 连接节点端口；使用 disconnect_nodes 断开连接
6. **节点删除**：使用 delete_node 删除节点（需要用户确认）
7. **节点信息**：使用 get_node_info 获取指定节点的详细信息
8. **节点选择**：使用 select_node 选中画布上的节点
9. **自动布局**：使用 auto_layout 自动排列节点
10. **项目信息**：使用 get_project_info 获取当前项目信息
11. **任务查询**：使用 list_node_tasks 查询生成任务记录

## 节点类型说明
- text-generation: 文本节点，用于输入和输出文本
- image-generation: 图片节点，用于生成和处理图片
- video-generation: 视频节点，用于生成和处理视频
- scene-understanding: 场景理解节点，分析场景信息
- scene-layout: 场景布局节点，生成3D场景布局
- scene-decompose: 场景拆解节点，拆解场景元素
- comfyui: ComfyUI节点，高级图像生成
- model3d: 3D模型节点，预览和处理3D模型
- meshy: Meshy模型生成，图生3D
- unreal-export: Unreal导出节点
- rotate-image: 旋转图片节点

## 工作流程建议
- 创建工作流时，先调用 get_blueprint_state 查询当前蓝图状态和节点类型
- 创建节点时指定正确的type（actionId），如 'text-generation', 'image-generation'
- 创建节点后可以使用 connect_nodes 自动连接它们
- 文本节点使用 set_node_text 设置文本内容
- 对于需要用户确认的操作（如删除节点、执行节点），系统会自动提示用户
- 所有位置坐标基于蓝图画布坐标系，默认创建在画布中心`
  });

  const tools = [
    {
      name: 'get_blueprint_state',
      description: '获取当前工作流蓝图的状态，包括节点列表、连接关系、选中节点等信息',
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
      description: '在工作流蓝图中创建新节点',
      inputSchema: {
        type: 'object',
        required: ['type'],
        properties: {
          type: { type: 'string', description: '节点类型，如 text-generation、image-generation 等' },
          title: { type: 'string', description: '节点名称/标题，可选' },
          alias: { type: 'string', description: '节点别名，可选' },
          position: {
            type: 'object',
            description: '节点位置坐标',
            properties: {
              x: { type: 'number' },
              y: { type: 'number' }
            }
          },
          config: { type: 'object', description: '节点初始配置，可选' }
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
      description: '自动排列当前蓝图中的节点，使其布局更整齐',
      inputSchema: {
        type: 'object',
        properties: {
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

  for (const tool of tools) {
    server.registerTool(tool.name, {
      description: tool.description,
      inputSchema: tool.inputSchema
    }, makeToolHandler(tool.name));
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[DVStudio MCP Bridge] Server started on stdio with', tools.length, 'tools');
}

main().catch((err) => {
  console.error('[DVStudio MCP Bridge] Fatal error:', err);
  process.exit(1);
});
