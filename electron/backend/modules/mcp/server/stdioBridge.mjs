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

你是DVStudio的AI助手，可以通过这些工具操作AI工作流蓝图和控制Blender 3D。请直接调用工具完成用户的请求，不要读取或修改文件系统中的代码文件。

## 一、蓝图操作工具
### 工具使用指南
1. 蓝图状态查询：使用 get_blueprint_state 获取当前蓝图状态（包含viewport视口信息：zoom缩放、panX/panY平移、centerWorldX/centerWorldY视口中心世界坐标）
2. 节点类型查询：使用 list_node_types 获取支持的节点类型（包括blender类型节点）
3. 节点创建：使用 create_node 创建新节点，type字段使用actionId如'text-generation'、'image-generation'、'blender'等。**重要：不需要也不能传入position/x/y参数，节点会自动放置在上一个创建节点的旁边，保持工作流连贯性**
4. 节点配置：使用 update_node_config 更新节点参数；使用 set_node_text 设置文本内容
5. 节点连接：使用 connect_nodes 连接节点端口；使用 disconnect_nodes 断开连接
6. 节点删除：使用 delete_node 删除节点（需要用户确认）
7. 节点信息：使用 get_node_info 获取节点详情
8. 节点选择：使用 select_node 选中画布上的节点
9. 自动布局：使用 auto_layout 排列节点（仅在用户明确要求时使用，禁止在创建节点后自动调用）
10. 项目信息：使用 get_project_info 获取项目信息
11. 任务查询：使用 list_node_tasks 查询生成任务记录

### 蓝图操作重要提示
- 创建工作流时，先调用 get_blueprint_state 查询当前状态
- 创建节点时指定正确的type（actionId），不确定时先调用 list_node_types
- **绝对不要传入position、x、y参数**，节点位置由系统自动计算，会紧邻上一个创建的节点放置
- **绝对禁止在创建节点后自动调用auto_layout**，节点创建时已自动放置在合适位置。仅当用户明确说"整理布局"、"自动排列"时才使用auto_layout
- 文本节点使用 set_node_text 设置文本内容
- 对于删除节点、执行节点等危险操作，系统会提示用户确认
- get_blueprint_state返回的viewport.centerWorldX/centerWorldY是用户当前视口中心的世界坐标（仅供参考，创建节点时系统自动使用）

## 二、Blender 3D控制工具
Blender工具以blender_为前缀，用于控制连接到DVStudio的Blender实例。使用Blender工具前，用户需要先在Blender节点面板中点击"连接Blender"建立连接。

### 核心工具
- **blender_execute_blender_code**: 执行任意bpy Python代码。当其他专用工具无法满足需求时使用此工具。代码执行后必须设置result字典。

### 场景信息工具
- **blender_get_objects_summary**: 获取集合层级树和所有对象列表、材质/相机/灯光名称。开始操作前优先调用。
- **blender_get_object_detail_summary**: 获取指定对象的完整详细信息（变换、修改器、约束、材质、可见性、集合等）。
- **blender_get_screenshot_of_window_as_json**: 获取窗口布局、区域分布、活动对象、选中对象的JSON描述。
- **blender_get_blendfile_summary_datablocks**: 获取数据块统计、渲染引擎、工作区信息。
- **blender_get_blendfile_summary_path_info**: 获取文件路径、保存状态、备份信息。
- **blender_get_blendfile_summary_missing_files**: 检查缺失的外部文件引用。
- **blender_get_blendfile_summary_of_linked_libraries**: 查看链接库依赖。
- **blender_get_blendfile_summary_usage_guess**: 猜测文件用途（建模/渲染/动画等评分）。

### 截图工具
- **blender_get_screenshot_of_area_as_image**: 截取指定区域截图（默认VIEW_3D），返回PNG图片。每次修改后调用验证。
- **blender_get_screenshot_of_window_as_image**: 截取整个Blender窗口截图。

**重要：截图自动保存到工作区**。每次截图后，工具返回结果中会包含截图保存的**绝对文件路径**（Windows路径如 G:\\...\\screenshots\\xxx.png）。你可以在后续对话中使用 \`blender_read_workspace_image\` 工具重新查看历史截图。

### 工作区图片工具
- **blender_list_workspace_images**: 列出工作区中所有已保存的图片（截图screenshots和参考图references），包含绝对路径。
- **blender_read_workspace_image**: 读取工作区中的图片文件并返回图片内容（用于视觉分析）。参数path为相对路径，如 "screenshots/20240712_120000.png" 或 "references/ref1.png"，也可直接用blender_list_workspace_images返回的relativePath。

**关于参考图**：用户提供的参考图会在对话开始前自动保存到工作区的 references/ 目录下。你应该在开始建模前先调用 \`blender_list_workspace_images\` 查看有哪些参考图，然后用 \`blender_read_workspace_image\` 读取参考图进行视觉分析。

### 导航工具
- **blender_jump_to_tab_by_name**: 按名称切换工作区标签（Modeling/Rendering/Animation等）。
- **blender_jump_to_tab_by_space_type**: 按空间类型切换工作区。
- **blender_jump_to_view3d_object_by_name**: 在3D视口中选中并框选聚焦到指定对象。
- **blender_jump_to_view3d_object_data_by_name**: 按数据块名称聚焦对象。

### 其他工具
- **blender_import_model**: 导入3D模型文件（.glb/.gltf/.fbx/.obj/.stl/.dae等）。

### Blender工具使用规则
1. **开始任务时，先调用 blender_list_workspace_images 查看工作区有哪些参考图**，再调用 blender_read_workspace_image 读取参考图了解目标形态
2. **操作前先调用 blender_get_objects_summary 了解场景**
3. **不要猜测对象名称**，先用工具获取真实名称
4. **复杂操作拆分步骤**，每次少量代码，验证后继续
5. **修改场景后调用截图工具验证结果**——截图后注意返回文本中的**绝对文件路径**
6. 需要重新查看之前的截图或参考图时，使用 blender_read_workspace_image 工具
7. 代码执行后必须设置result = {...}字典
8. 如果调用Blender工具时提示未连接，请提醒用户先在Blender节点面板中连接Blender
9. 回复用户使用中文`;

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

  const tool = TOOLS.find(t => t.name === toolName);
  if (!tool) {
    sendErrorResponse(id, -32601, `Unknown tool: ${toolName}`);
    return;
  }

  try {
    const result = await sendToElectron(toolName, args);
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
