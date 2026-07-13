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
        type: { type: 'string', description: '节点类型ID（actionId），如 text-generation、image-generation、video-generation、scene-understanding、scene-layout、scene-decompose、comfyui、model3d、blender、rotate-image、unreal-export 等' },
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
  },
  {
    name: 'blender_execute_blender_code',
    description: '【Blender工具】在Blender中执行任意Python(bpy)代码。代码执行后必须将结果赋值给名为result的字典变量。这是核心工具，所有场景操作都通过它完成。使用前需要用户先在Blender节点面板中连接Blender。',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: '要执行的Python(bpy)代码。执行后必须设置result = {...}字典返回结果。' },
      },
      required: ['code'],
    }
  },
  {
    name: 'blender_get_objects_summary',
    description: '【Blender工具】获取场景的集合层级结构和所有对象列表（名称、类型、位置、可见性、选中状态），以及材质/相机/灯光名称列表。开始操作前优先调用。',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'blender_get_object_detail_summary',
    description: '【Blender工具】获取指定对象的结构化详细信息，包括变换、尺寸、父子关系、修改器、约束、材质、可见性、所属集合等。',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string', description: '对象名称' } },
      required: ['name'],
    }
  },
  {
    name: 'blender_get_blendfile_summary_datablocks',
    description: '【Blender工具】返回blend文件的数据块统计（各类datablock数量）、当前工作区、渲染引擎和Blender版本。',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'blender_get_blendfile_summary_missing_files',
    description: '【Blender工具】报告磁盘上缺失的外部文件引用（图片、链接库、字体、声音、视频、缓存、序列等）。',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'blender_get_blendfile_summary_of_linked_libraries',
    description: '【Blender工具】返回直接和间接链接的库文件树，以及每个库链接的数据块数量。',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'blender_get_blendfile_summary_path_info',
    description: '【Blender工具】获取blend文件的路径、保存状态、是否修改未保存、文件存在时长、大小和备份文件列表。',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'blender_get_blendfile_summary_usage_guess',
    description: '【Blender工具】猜测当前blend文件的主要用途（建模/渲染/动画/合成/几何节点/视频编辑/脚本/油脂笔/UV展开/运动跟踪/音频等），每项给出0-100分和置信度。',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'blender_get_screenshot_of_area_as_image',
    description: '【Blender工具】截取Blender中指定类型区域的截图并返回PNG图片。默认截取VIEW_3D区域，自动缩放到合适大小。修改场景后调用此工具验证结果。',
    inputSchema: {
      type: 'object',
      properties: {
        area_type: { type: 'string', description: '区域类型，如VIEW_3D、NODE_EDITOR、IMAGE_EDITOR、UV、GRAPH_EDITOR、DOPESHEET_EDITOR、OUTLINER、PROPERTIES等，默认VIEW_3D', default: 'VIEW_3D' },
        size_limit_in_bytes: { type: 'number', description: '图片大小限制（字节），默认786432(768KB)', default: 786432 },
      },
    }
  },
  {
    name: 'blender_get_screenshot_of_window_as_image',
    description: '【Blender工具】截取整个Blender窗口的截图并返回PNG图片，自动缩放到合适大小。',
    inputSchema: {
      type: 'object',
      properties: {
        size_limit_in_bytes: { type: 'number', description: '图片大小限制（字节）', default: 786432 },
      },
    }
  },
  {
    name: 'blender_get_screenshot_of_window_as_json',
    description: '【Blender工具】返回Blender窗口布局的JSON描述，包括窗口尺寸、工作区、场景、所有区域类型/位置/大小、活动空间类型、活动对象和选中对象列表。',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'blender_jump_to_tab_by_name',
    description: '【Blender工具】按名称切换到指定工作区（标签页），如"Modeling"、"Rendering"、"Animation"、"UV Editing"、"Scripting"、"Compositing"等。',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string', description: '工作区名称' } },
      required: ['name'],
    }
  },
  {
    name: 'blender_jump_to_tab_by_space_type',
    description: '【Blender工具】切换到主区域为指定空间类型的工作区。可选择是否在不存在时自动创建新工作区。',
    inputSchema: {
      type: 'object',
      properties: {
        space_type: { type: 'string', description: '空间类型，如VIEW_3D、NODE_EDITOR、IMAGE_EDITOR、UV、GRAPH_EDITOR、DOPESHEET_EDITOR、TEXT_EDITOR、PROPERTIES、OUTLINER等' },
        allow_edits: { type: 'boolean', description: '是否允许在找不到时自动创建新工作区', default: false },
      },
      required: ['space_type'],
    }
  },
  {
    name: 'blender_jump_to_view3d_object_by_name',
    description: '【Blender工具】在3D视口中选中并聚焦到指定对象。可选择是否自动显示隐藏对象和启用集合。会退出相机视角并框选对象。',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '对象名称' },
        allow_edits: { type: 'boolean', description: '是否允许自动显示隐藏对象和启用集合', default: true },
      },
      required: ['name'],
    }
  },
  {
    name: 'blender_jump_to_view3d_object_data_by_name',
    description: '【Blender工具】在3D视口中选中并聚焦到数据块名称匹配的对象（如按Mesh名称查找）。',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '数据块名称（如Mesh名称）' },
        allow_edits: { type: 'boolean', description: '是否允许自动显示隐藏对象', default: true },
      },
      required: ['name'],
    }
  },
  {
    name: 'blender_import_model',
    description: '【Blender工具】导入3D模型文件到Blender当前场景。支持.glb/.gltf/.fbx/.obj/.stl/.dae等格式。',
    inputSchema: {
      type: 'object',
      properties: { file_path: { type: 'string', description: '模型文件的绝对路径' } },
      required: ['file_path'],
    }
  },
  {
    name: 'blender_read_workspace_image',
    description: '【Blender工具】读取工作区中的图片文件并返回图片内容（用于视觉分析）。可以用来重新查看之前保存的截图或参考图。',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '图片的相对路径（相对于工作区根目录），如 "screenshots/20240101_120000.png" 或 "references/ref.png"。也可以只传文件名。' },
      },
      required: ['path'],
    }
  },
  {
    name: 'blender_list_workspace_images',
    description: '【Blender工具】列出工作区中所有可用的图片文件（screenshots和references目录），返回文件名、相对路径、绝对路径和大小。',
    inputSchema: { type: 'object', properties: {} }
  }
];

const SERVER_INSTRUCTIONS = `DVStudio MCP Server - AI工作流蓝图与Blender 3D操作接口

你是DVStudio的AI助手，通过MCP工具操作AI工作流蓝图和控制Blender 3D。

# 核心规则（必须严格遵守）
1. **严格串行调用工具**：每次只能调用一个工具，必须等待结果完全返回后再调用下一个工具。绝对不要并行/同时发起多个工具调用！
2. **截图工具返回的结果中已经直接包含图片**：调用blender_get_screenshot_of_area_as_image后，图片数据会直接在工具返回结果中，你可以立即看到截图内容，**不需要再调用blender_read_workspace_image去读取截图文件**！
3. blender_read_workspace_image仅用于：查看用户提供的参考图、或查看更早之前的历史截图。刚刚截取的最新截图直接看工具返回结果即可。
4. 只有当用户明确提到"参考图"时，才先调用blender_list_workspace_images查看，否则跳过这一步直接开始工作。
5. 直接调用工具完成用户请求，不要读取或修改文件系统中的代码文件，不要执行shell命令。
6. 回复用户使用中文。

## 一、蓝图操作工具
1. 蓝图状态查询：使用get_blueprint_state获取当前蓝图状态（包含viewport视口信息）。
2. 节点类型查询：使用list_node_types获取支持的节点类型（包括blender类型节点）。
3. 节点创建：使用create_node创建新节点，type字段使用actionId如'blender'等。**重要：不需要也不能传入position/x/y参数，节点会自动放置在合适位置**。
4. 节点配置：使用update_node_config更新节点参数；使用set_node_text设置文本内容。
5. 节点连接：使用connect_nodes连接节点端口；使用disconnect_nodes断开连接。
6. 节点删除：使用delete_node删除节点（危险操作需确认）。
7. 节点信息：使用get_node_info获取节点详情；使用select_node选中节点。
8. 自动布局：auto_layout仅在用户明确要求时使用，禁止创建节点后自动调用。

## 二、Blender 3D控制工具
Blender工具以blender_为前缀。使用前用户需要先在Blender节点面板连接Blender。

### 工作流程
1. 如果用户明确提到有参考图，才调用blender_list_workspace_images查看，再用blender_read_workspace_image读取参考图。否则直接开始。
2. 操作前先调用blender_get_objects_summary了解场景结构。
3. 使用blender_execute_blender_code执行bpy Python代码，代码执行后必须设置result字典。
4. 复杂操作拆分成小步骤，每次少量代码。
5. **修改场景后调用blender_get_screenshot_of_area_as_image验证结果——截图直接在工具返回结果中显示图片，直接查看即可，不需要额外读取文件**。
6. 如果工具返回"未连接"错误，提醒用户在Blender节点面板中点击"连接Blender"。

### 可用工具列表
- blender_execute_blender_code: 执行bpy Python代码（核心工具）
- blender_get_objects_summary: 获取场景对象列表
- blender_get_object_detail_summary: 获取对象详细信息
- blender_get_screenshot_of_area_as_image: 截取VIEW_3D等区域截图（返回图片，直接可见）
- blender_get_screenshot_of_window_as_image: 截取整个Blender窗口（返回图片）
- blender_get_screenshot_of_window_as_json: 获取窗口布局JSON
- blender_list_workspace_images: 列出工作区图片（参考图/历史截图）
- blender_read_workspace_image: 读取工作区图片（参考图/历史截图）
- 其他blender_get_blendfile_summary_*工具获取文件信息
- blender_jump_to_*工具导航切换工作区/聚焦对象
- blender_import_model导入模型文件`;

function sendToElectron(requestData) {
  return new Promise((resolve, reject) => {
    const client = net.createConnection(SOCKET_PATH, () => {
      const requestId = `req-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      const request = JSON.stringify({ requestId, ...requestData });

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

let cachedTools = null;
let cacheTimestamp = 0;
const TOOLS_CACHE_TTL = 5000;

async function getDynamicToolsList() {
  const now = Date.now();
  if (cachedTools && now - cacheTimestamp < TOOLS_CACHE_TTL) {
    return cachedTools;
  }

  try {
    const tools = await sendToElectron({ action: 'tools/list' });
    const result = Array.isArray(tools) ? tools : [];
    cachedTools = result;
    cacheTimestamp = now;
    return result;
  } catch (err) {
    process.stderr.write(`[DVStudio MCP Bridge] Failed to get dynamic tools: ${err.message}, using fallback\n`);
    return TOOLS;
  }
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

async function handleRequest(method, id, params) {
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
      await handleToolsList(id);
      break;

    case 'tools/call':
      await handleToolCall(id, params);
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

async function handleToolsList(id) {
  try {
    const tools = await getDynamicToolsList();
    sendResponse(id, { tools });
  } catch (err) {
    process.stderr.write(`[DVStudio MCP Bridge] Error handling tools/list: ${err.message}\n`);
    sendResponse(id, { tools: TOOLS });
  }
}

function convertResultToMCPContent(result) {
  if (result === null || result === undefined) {
    return [{ type: 'text', text: '' }];
  }

  if (typeof result === 'string') {
    return [{ type: 'text', text: result }];
  }

  if (typeof result === 'object' && Array.isArray(result.content)) {
    const mcpContent = [];
    for (const item of result.content) {
      if (item.type === 'text') {
        mcpContent.push({ type: 'text', text: item.text || '' });
      } else if (item.type === 'image') {
        mcpContent.push({
          type: 'image',
          data: item.data,
          mimeType: item.mimeType || 'image/png'
        });
      }
    }
    if (mcpContent.length > 0) {
      return mcpContent;
    }
  }

  return [{ type: 'text', text: JSON.stringify(result, null, 2) }];
}

async function handleToolCall(id, params) {
  const toolName = params?.name;
  const args = params?.arguments || {};

  try {
    const result = await sendToElectron({ toolName, args });
    sendResponse(id, {
      content: convertResultToMCPContent(result),
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

let requestQueue = Promise.resolve();
let isProcessingRequest = false;

function enqueueRequest(handler) {
  requestQueue = requestQueue.then(
    () => handler(),
    () => handler()
  );
  return requestQueue;
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

      if (Array.isArray(message)) {
        const firstId = message.find(m => m && m.id !== undefined)?.id;
        if (firstId !== undefined) {
          sendErrorResponse(firstId, -32600, 'Batch requests are not supported. Please send one request at a time (strictly sequential tool calls).');
        }
        process.stderr.write('[DVStudio MCP Bridge] Rejected JSON-RPC batch request - sequential execution required\n');
        continue;
      }

      if (message.id !== undefined) {
        enqueueRequest(async () => {
          await handleRequest(message.method, message.id, message.params);
        });
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

process.stderr.write(`[DVStudio MCP Bridge] Server started with ${TOOLS.length} fallback tools\n`);
process.stderr.write(`[DVStudio MCP Bridge] Node.js version: ${process.version}, Executable: ${process.execPath}\n`);
