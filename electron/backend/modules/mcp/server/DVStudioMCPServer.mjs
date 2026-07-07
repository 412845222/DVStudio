/**
 * DVStudio MCP Server 实现
 * 
 * 使用 MCP SDK 的 McpServer 高阶API，提供标准MCP服务，
 * 支持stdio传输，供Codex CLI、Copilot CLI等外部AI工具调用。
 * 工具调用统一通过ToolExecutor执行。
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { getToolExecutor } from '../toolExecutor.mjs';
import logger from '../../../core/logger.mjs';

export class DVStudioMCPServer {
  constructor() {
    this.server = null;
    this.transport = null;
    this.isRunning = false;
    this.toolsRegistered = false;
  }

  createServer() {
    if (this.server) {
      return this.server;
    }

    this.server = new McpServer({
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

    this.registerTools();
    return this.server;
  }

  registerTools() {
    if (this.toolsRegistered || !this.server) {
      return;
    }

    const s = this.server;
    const executor = getToolExecutor();
    const tools = executor.getMCPTools();

    for (const tool of tools) {
      s.registerTool(tool.name, {
        description: tool.description,
        inputSchema: tool.inputSchema
      }, async (args) => {
        logger.debug(`[MCP Server] Tool called: ${tool.name}`);
        try {
          const result = await executor.callTool(tool.name, args || {}, { skipFrontend: false });
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
          };
        } catch (err) {
          return {
            content: [{ type: 'text', text: `Error: ${err.message}` }],
            isError: true
          };
        }
      });
    }

    this.toolsRegistered = true;
    logger.info(`[MCP Server] All ${tools.length} tools registered from ToolExecutor`);
  }

  async startStdio() {
    if (this.isRunning) {
      logger.warn('[MCP Server] Already running');
      return;
    }

    this.createServer();
    this.transport = new StdioServerTransport();

    try {
      await this.server.connect(this.transport);
      this.isRunning = true;
      logger.info('[MCP Server] Started on stdio transport');
    } catch (err) {
      logger.error(`[MCP Server] Failed to start: ${err.message}`);
      throw err;
    }
  }

  async stop() {
    if (!this.isRunning) {
      return;
    }

    try {
      if (this.server) {
        await this.server.close();
      }
      if (this.transport) {
        await this.transport.close();
      }
    } catch (err) {
      logger.warn(`[MCP Server] Error stopping: ${err.message}`);
    }

    this.isRunning = false;
    this.server = null;
    this.transport = null;
    this.toolsRegistered = false;
    logger.info('[MCP Server] Stopped');
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      toolsRegistered: this.toolsRegistered,
      toolCount: getToolExecutor().listTools().length
    };
  }
}

let mcpServerInstance = null;

export function getDVStudioMCPServer() {
  if (!mcpServerInstance) {
    mcpServerInstance = new DVStudioMCPServer();
  }
  return mcpServerInstance;
}
