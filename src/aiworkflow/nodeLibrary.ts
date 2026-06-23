import type {
  Newui2NodeCatalogCategory,
  Newui2NodeCatalogItem,
  Newui2NodeCategoryId,
  Newui2NodeSpecialGroup,
  Newui2NodeSpecialGroupId,
  Newui2NodeTopCategory,
  Newui2NodeTopCategoryId,
  DwebCanvasMenuNodeActionId,
} from '../ui/UIComponent/DwebCanvasMenu.types'

type Newui2NodeCatalogMetadata = Pick<
  Newui2NodeCatalogItem,
  'description' | 'primaryCategoryId' | 'categoryIds' | 'topCategoryId' | 'specialGroupId' | 'searchAliases' | 'featuredBasicOrder'
>

const uniqueCategoryIds = (ids: Newui2NodeCategoryId[]) => Array.from(new Set(ids))

const catalogMetadata = (
  topCategoryId: Newui2NodeTopCategoryId,
  primaryCategoryId: Newui2NodeCategoryId,
  categoryIds: Newui2NodeCategoryId[],
  description: string,
  searchAliases: string[] = [],
  featuredBasicOrder?: number,
  specialGroupId?: Newui2NodeSpecialGroupId,
): Newui2NodeCatalogMetadata => ({
  topCategoryId,
  primaryCategoryId,
  categoryIds: uniqueCategoryIds([primaryCategoryId, ...categoryIds]),
  description,
  searchAliases,
  featuredBasicOrder,
  specialGroupId,
})

export const NEWUI2_NODE_CATALOG_CATEGORIES: Newui2NodeCatalogCategory[] = [
  {
    id: 'basic',
    label: 'Basic',
    description: 'Common entry nodes for text, image, video, audio, and 3D flows.',
  },
  {
    id: 'image2d',
    label: '2D Image',
    description: 'Image generation, gallery, annotation, segmentation, and style nodes.',
  },
  {
    id: 'video',
    label: 'Video',
    description: 'Video generation, motion understanding, and MetaHuman solver nodes.',
  },
  {
    id: 'audio',
    label: 'Audio',
    description: 'Audio resource creation, upload, and preview nodes.',
  },
  {
    id: 'model3d',
    label: '3D',
    description: '3D generation, retopo, DCC utilities, and runtime integration nodes.',
  },
]

export const NEWUI2_NODE_TOP_CATEGORIES: Newui2NodeTopCategory[] = [
  {
    id: 'inputs',
    label: 'Basic',
    description: 'Text input, canvas, sticky notes, and foundational workflow nodes.',
    iconKey: 'inputs',
  },
  {
    id: 'text',
    label: 'Text',
    description: 'Text generation, merge, conversation, and script nodes.',
    iconKey: 'text',
  },
  {
    id: 'image',
    label: 'Image',
    description: 'Image generation, gallery, decomposition, explosion, and mask nodes.',
    iconKey: 'image',
  },
  {
    id: 'video',
    label: 'Video',
    description: 'Video generation, motion understanding, MetaHuman animation, and SP launch.',
    iconKey: 'video',
  },
  {
    id: 'scene',
    label: 'Scene',
    description: 'Scene understanding, layout, extraction chains, and Gaussian scene nodes.',
    iconKey: 'scene',
  },
  {
    id: 'model3d',
    label: '3D',
    description: '3D generation, retopo, Blender tools, and Unreal import nodes.',
    iconKey: 'model3d',
  },
]

export const NEWUI2_NODE_SPECIAL_GROUPS: Newui2NodeSpecialGroup[] = []

const NEWUI2_NODE_CATALOG_META: Record<DwebCanvasMenuNodeActionId, Newui2NodeCatalogMetadata> = {
  'text-generation': catalogMetadata('text', 'basic', [], '用于输入、编辑和输出提示词或说明文本。', ['文本', 'prompt', 'llm'], 10),
  'text-input': catalogMetadata('inputs', 'basic', [], '创建文本输入节点。', ['文本输入']),
  'text-merge': catalogMetadata('text', 'basic', [], '将多个文本输入整合为单一输出。', ['文本整合', 'merge']),
  'image-generation': catalogMetadata('image', 'image2d', ['basic'], '图片生成与四视图工作流的基础图片节点。', ['图片节点', '四视图', 'image'], 20),
  'rotate-image': catalogMetadata('image', 'image2d', [], '旋转图片并生成新视角的图片节点。', ['旋转图片', 'rotate']),
  'video-generation': catalogMetadata('video', 'video', ['basic'], '视频输入、生成与输出的基础视频节点。', ['视频', 'video'], 30),
  'scene-understanding': catalogMetadata('scene', 'image2d', ['model3d'], '对图片或文本中的场景信息做结构化理解。', ['场景理解', 'scene'], undefined, 'indoor-scene'),
  'scene-layout': catalogMetadata('scene', 'model3d', [], '生成或编辑可导向 3D 场景的布局信息。', ['场景布局', 'layout'], undefined, 'indoor-scene'),
  'scene-decompose': catalogMetadata('scene', 'image2d', ['model3d'], '拆解场景图片并输出图片与结构化信息。', ['场景拆解', 'decompose'], undefined, 'indoor-scene'),
  'comfyui': catalogMetadata('image', 'image2d', [], '集成 ComfyUI 工作流进行图像生成和处理。', ['ComfyUI', '工作流']),
  'model3d': catalogMetadata('model3d', 'model3d', ['basic'], '预览、承接和输出 3D 模型资源。', ['3D模型', '模型预览', 'model'], 40),
  'meshy': catalogMetadata('model3d', 'model3d', [], '通过 Meshy API 生成高质量 3D 模型。', ['Meshy', '3D生成', '图生3D']),
  'story': catalogMetadata('text', 'basic', [], '创建剧情分支节点，支持多分支叙事。', ['剧情', '故事', 'story']),
  'base': catalogMetadata('inputs', 'basic', [], '创建基础空节点。', ['基础节点']),
  'canvas': catalogMetadata('inputs', 'basic', [], '创建画板节点。', ['画板']),
  'sticky-note': catalogMetadata('inputs', 'basic', [], '创建便签节点。', ['便签', '备注']),
}

const RAW_NEWUI2_NODE_CATALOG: Newui2NodeCatalogItem[] = [
  {
    actionId: 'text-generation',
    nodeType: 'text',
    label: '文本节点',
    inputKinds: ['text'],
    outputKinds: ['text'],
    order: 10,
  },
  {
    actionId: 'text-input',
    nodeType: 'text',
    label: '文本输入节点',
    inputKinds: [],
    outputKinds: ['text'],
    order: 11,
  },
  {
    actionId: 'text-merge',
    nodeType: 'text-merge',
    label: '文本整合节点',
    inputKinds: ['text'],
    outputKinds: ['text'],
    order: 12,
  },
  {
    actionId: 'image-generation',
    nodeType: 'image',
    label: '图片节点',
    inputKinds: ['resource'],
    outputKinds: ['image'],
    order: 20,
  },
  {
    actionId: 'rotate-image',
    nodeType: 'rotate-image',
    label: '旋转图片节点',
    inputKinds: ['image'],
    outputKinds: ['image'],
    order: 21,
  },
  {
    actionId: 'video-generation',
    nodeType: 'video',
    label: '视频节点',
    inputKinds: ['video'],
    outputKinds: ['video'],
    order: 30,
  },
  {
    actionId: 'scene-understanding',
    nodeType: 'scene-understanding',
    label: '场景理解节点',
    inputKinds: ['image', 'text'],
    outputKinds: ['text'],
    order: 35,
  },
  {
    actionId: 'scene-layout',
    nodeType: 'scene-layout',
    label: '场景布局节点',
    inputKinds: ['text', 'resource'],
    outputKinds: ['text', 'generic'],
    order: 36,
  },
  {
    actionId: 'scene-decompose',
    nodeType: 'scene-decompose',
    label: '场景拆解节点',
    inputKinds: ['image', 'text'],
    outputKinds: ['image', 'text'],
    order: 37,
  },
  {
    actionId: 'comfyui',
    nodeType: 'comfyui',
    label: 'ComfyUI节点',
    inputKinds: ['text'],
    outputKinds: ['image', 'video'],
    order: 38,
  },
  {
    actionId: 'model3d',
    nodeType: 'model3d',
    label: '3D模型节点',
    inputKinds: ['resource', 'text', 'image', 'image', 'image', 'image'],
    outputKinds: ['resource', 'image'],
    order: 40,
  },
  {
    actionId: 'meshy',
    nodeType: 'meshy',
    label: 'Meshy模型生成',
    inputKinds: ['text', 'image'],
    outputKinds: ['resource'],
    order: 41,
  },
  {
    actionId: 'story',
    nodeType: 'story',
    label: '剧情节点',
    inputKinds: ['text'],
    outputKinds: ['text'],
    order: 50,
  },
  {
    actionId: 'base',
    nodeType: 'base',
    label: '基础节点',
    inputKinds: [],
    outputKinds: [],
    order: 60,
  },
  {
    actionId: 'canvas',
    nodeType: 'canvas',
    label: '画板节点',
    inputKinds: [],
    outputKinds: [],
    order: 61,
  },
  {
    actionId: 'sticky-note',
    nodeType: 'sticky-note',
    label: '便签节点',
    inputKinds: [],
    outputKinds: [],
    order: 62,
  },
]

export const NEWUI2_NODE_CATALOG: Newui2NodeCatalogItem[] = RAW_NEWUI2_NODE_CATALOG.map((item) => ({
  ...item,
  ...(NEWUI2_NODE_CATALOG_META[item.actionId] ?? catalogMetadata('inputs', 'basic', [], '')),
}))