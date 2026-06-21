import type { WorkflowNode } from "../types";
import type { WorkflowResource } from "./types";

/**
 * 资源引用来源类型
 * 描述一个 WorkflowResource 被哪些节点以何种方式引用
 */
export type WorkflowResourceReferenceSource =
  | "node.resourceId"
  | "node.textValue"
  | "sceneUnderstanding.input"
  | "sceneLayout.modelBinding"
  | "sceneDecompose.output"
  | "comfyui.output"
  | "meshy.input"
  | "meshy.output"
  | "model3d.input"
  | "model3d.asset";

/**
 * 单个资源的引用记录
 */
export interface WorkflowResourceUsageReference {
  nodeId: string;
  nodeTitle: string;
  nodeType: string;
  source: WorkflowResourceReferenceSource;
  description?: string;
}

/**
 * 资源使用分析结果
 */
export interface WorkflowResourceUsageInfo {
  resourceId: string;
  usedBy: WorkflowResourceUsageReference[];
  isUsed: boolean;
  usageCount: number;
}

/**
 * 规范化字符串用于比较（空字符串 / null 统一为 null）
 */
const normStr = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
};

/**
 * 提取 URL 的 pathname（去除 query/hash 和协议）
 * 例如 dweb://a/b/c.png?v=1 → a/b/c.png
 *      file:///C:/x.png → C:/x.png
 *      /path/to/image.png → /path/to/image.png
 */
const extractPath = (raw: string): string | null => {
  const r = normStr(raw);
  if (!r) return null;

  // 处理 URL 形式
  try {
    if (r.includes("://")) {
      const afterProtocol = r.split("://")[1] || "";
      const withoutQuery = afterProtocol.split("?")[0].split("#")[0];
      return withoutQuery || null;
    }
    // 纯路径：直接去除 query/hash
    return r.split("?")[0].split("#")[0] || null;
  } catch {
    return r.split("?")[0].split("#")[0] || null;
  }
};

/**
 * 从资源对象中提取所有可用于匹配的键
 */
const getMatchKeysFromResource = (r: WorkflowResource): string[] => {
  const keys: string[] = [];
  const rid = normStr(r.id);
  if (rid) keys.push(rid);

  const url = normStr((r as any).url);
  if (url) keys.push(url);

  const sourcePath = normStr((r as any).sourcePath);
  if (sourcePath) keys.push(sourcePath);

  const poster = normStr((r as any).posterUrl);
  if (poster) keys.push(poster);

  const posterSourcePath = normStr((r as any).posterSourcePath);
  if (posterSourcePath) keys.push(posterSourcePath);

  return keys;
};

/**
 * 建立资源匹配索引：Map<候选键, 资源ID[]>
 * 包含：精确字符串、规范化 path、以及大小写归一化版本
 */
const buildResourceIndex = (
  resources: WorkflowResource[],
): { byId: Map<string, WorkflowResource>; byKey: Map<string, string[]> } => {
  const byId = new Map<string, WorkflowResource>();
  const byKey = new Map<string, string[]>();

  for (const r of resources) {
    const rid = normStr(r.id);
    if (rid) byId.set(rid, r);

    const keys = getMatchKeysFromResource(r);
    for (const raw of keys) {
      // 精确匹配键
      addToMap(byKey, raw, rid || raw);
      // pathname 匹配键
      const path = extractPath(raw);
      if (path && path !== raw) {
        addToMap(byKey, path, rid || raw);
      }
      // 小写归一化匹配键（兼顾大小写差异）
      const low = raw.toLowerCase();
      if (low !== raw) {
        addToMap(byKey, low, rid || raw);
      }
    }
  }
  return { byId, byKey };
};

const addToMap = (m: Map<string, string[]>, key: string, value: string) => {
  const existing = m.get(key);
  if (existing) {
    if (!existing.includes(value)) existing.push(value);
  } else {
    m.set(key, [value]);
  }
};

/**
 * 基于候选字符串查询资源：
 * 1. 精确字符串匹配
 * 2. pathname 匹配
 * 3. 小写归一化匹配
 */
const matchResourceByCandidate = (
  candidate: string,
  index: { byKey: Map<string, string[]> },
): string[] => {
  const raw = normStr(candidate);
  if (!raw) return [];

  const matches = new Set<string>();
  const direct = index.byKey.get(raw);
  if (direct) for (const m of direct) matches.add(m);

  const path = extractPath(raw);
  if (path) {
    const pm = index.byKey.get(path);
    if (pm) for (const m of pm) matches.add(m);
  }

  const low = raw.toLowerCase();
  if (low !== raw) {
    const lm = index.byKey.get(low);
    if (lm) for (const m of lm) matches.add(m);
  }

  return Array.from(matches);
};

/**
 * 从节点中提取所有可能引用到资源的候选值
 * 按节点类型分别处理
 */
const collectCandidateUrlsFromNode = (
  node: WorkflowNode,
): Array<{ value: string; source: WorkflowResourceReferenceSource; description?: string }> => {
  const out: Array<{ value: string; source: WorkflowResourceReferenceSource; description?: string }> = [];
  const type = String(node.type ?? "").trim();

  // 通用：node.resourceId
  const rid = normStr((node as any).resourceId);
  if (rid) out.push({ value: rid, source: "node.resourceId" });

  // 文本节点：textValue
  if (type === "text") {
    const tv = normStr((node as any).textValue);
    if (tv) out.push({ value: tv, source: "node.textValue" });
  }

  // 场景理解节点：输入图像
  if (type === "scene-understanding") {
    const su = (node as any).sceneUnderstandingSettings;
    if (su) {
      const img = normStr(su.lastInputImageUrl);
      if (img) out.push({ value: img, source: "sceneUnderstanding.input", description: "输入图像" });

      const imgs: unknown = su.lastInputImageUrls;
      if (Array.isArray(imgs)) {
        for (const imgUrl of imgs) {
          const u = normStr(imgUrl);
          if (u) out.push({ value: u, source: "sceneUnderstanding.input", description: "输入图像" });
        }
      }
    }
  }

  // 场景布局节点：手动模型绑定
  if (type === "scene-layout") {
    const sl = (node as any).sceneLayoutSettings;
    if (sl && Array.isArray(sl.manualModelBindings)) {
      for (const mb of sl.manualModelBindings) {
        const mUrl = normStr(mb?.modelUrl);
        if (mUrl) out.push({ value: mUrl, source: "sceneLayout.modelBinding", description: String(mb?.objectId ?? "模型") });
        const mAsset = normStr(mb?.modelAssetUrl);
        if (mAsset) out.push({ value: mAsset, source: "sceneLayout.modelBinding", description: String(mb?.objectId ?? "模型资产") });
        const mSource = normStr(mb?.modelSourcePath);
        if (mSource) out.push({ value: mSource, source: "sceneLayout.modelBinding", description: String(mb?.objectId ?? "模型源文件") });
        const mPath = normStr(mb?.modelAssetPath);
        if (mPath) out.push({ value: mPath, source: "sceneLayout.modelBinding", description: String(mb?.objectId ?? "模型路径") });
      }
    }
  }

  // 场景分解节点：输出生成的资源
  if (type === "scene-decompose") {
    const sd = (node as any).sceneDecomposeSettings;
    if (sd && Array.isArray(sd.outputs)) {
      for (const o of sd.outputs) {
        const genId = normStr(o?.generatedResourceId);
        if (genId) out.push({ value: genId, source: "sceneDecompose.output", description: String(o?.name ?? o?.id ?? "分解输出") });
      }
    }
  }

  // ComfyUI 节点：输出媒体 URL + sourcePath
  if (type === "comfyui") {
    const cu = (node as any).comfyuiSettings;
    if (cu && Array.isArray(cu.outputs)) {
      for (const outItem of cu.outputs) {
        const url = normStr(outItem?.url);
        if (url) out.push({ value: url, source: "comfyui.output", description: String(outItem?.label ?? outItem?.anchorId ?? "输出") });
        const sp = normStr(outItem?.sourcePath);
        if (sp) out.push({ value: sp, source: "comfyui.output", description: String(outItem?.label ?? outItem?.anchorId ?? "输出") });
      }
    }
  }

  // Meshy 节点：输入参考图 + 输出资产
  if (type === "meshy") {
    const ms = (node as any).meshySettings;
    if (ms) {
      const img = normStr(ms.meshyImageUrl);
      if (img) out.push({ value: img, source: "meshy.input", description: "参考图" });

      const imgs: unknown = ms.meshyImageUrls;
      if (Array.isArray(imgs)) {
        for (const imgUrl of imgs) {
          const u = normStr(imgUrl);
          if (u) out.push({ value: u, source: "meshy.input", description: "参考图" });
        }
      }

      // 输出：优先读取各种输出 URL
      const outAsset = normStr(ms.meshyOutputAssetUrl);
      if (outAsset) out.push({ value: outAsset, source: "meshy.output", description: "输出资产" });
      const outThumb = normStr(ms.meshyThumbnailUrl);
      if (outThumb) out.push({ value: outThumb, source: "meshy.output", description: "缩略图" });

      const modelUrls: any = ms.meshyModelUrls;
      if (modelUrls && typeof modelUrls === "object") {
        for (const key of Object.keys(modelUrls)) {
          const v = normStr(modelUrls[key]);
          if (v) out.push({ value: v, source: "meshy.output", description: `模型格式:${key}` });
        }
      }
    }
  }

  // 3D 模型节点：模型输入/资产
  if (type === "model3d") {
    const m3 = (node as any).model3dSettings;
    if (m3) {
      const urls = ["modelUrl", "modelAssetUrl", "modelSourcePath", "modelAssetPath", "lastInputSourceUrl", "lastInputPlaceholderJson"];
      for (const key of urls) {
        const v = normStr((m3 as any)[key]);
        if (v) out.push({ value: v, source: key.startsWith("last") ? "model3d.input" : "model3d.asset", description: key });
      }
    }
  }

  // rotate-image 节点的输入资源通过 resourceId 已处理
  return out;
};

/**
 * 分析一组节点对资源的引用关系
 * 返回 Map<resourceId, UsageInfo>
 */
export function analyzeResourceUsage(
  resources: WorkflowResource[],
  nodesById: Record<string, WorkflowNode> | null | undefined,
  nodeOrder: string[] | null | undefined,
): Map<string, WorkflowResourceUsageInfo> {
  const result = new Map<string, WorkflowResourceUsageInfo>();

  // 初始化：每个资源建立空的使用记录
  for (const r of resources) {
    const rid = String(r.id ?? "").trim();
    if (!rid) continue;
    result.set(rid, {
      resourceId: rid,
      usedBy: [],
      isUsed: false,
      usageCount: 0,
    });
  }

  // 无节点数据：全部视为未使用
  const order = Array.isArray(nodeOrder) ? nodeOrder : [];
  if (!nodesById || !order.length) return result;

  const index = buildResourceIndex(resources);

  for (const nodeId of order) {
    const node = nodesById[nodeId];
    if (!node) continue;
    const nodeTitle = String(node.title ?? node.type ?? nodeId).trim();
    const nodeType = String(node.type ?? "").trim();

    const candidates = collectCandidateUrlsFromNode(node);
    for (const c of candidates) {
      const matchedIds = matchResourceByCandidate(c.value, index);
      for (const rid of matchedIds) {
        const info = result.get(rid);
        if (!info) continue;
        info.usedBy.push({
          nodeId: String(node.id ?? nodeId),
          nodeTitle,
          nodeType,
          source: c.source,
          description: c.description,
        });
      }
    }
  }

  // 更新 isUsed / usageCount
  for (const info of result.values()) {
    info.usageCount = info.usedBy.length;
    info.isUsed = info.usageCount > 0;
  }

  return result;
}

/**
 * 获取一个资源的使用信息，空值安全
 */
export function getUsageInfo(
  usageMap: Map<string, WorkflowResourceUsageInfo> | null | undefined,
  resourceId: string,
): WorkflowResourceUsageInfo | null {
  if (!usageMap) return null;
  const rid = String(resourceId ?? "").trim();
  if (!rid) return null;
  return usageMap.get(rid) ?? null;
}

/**
 * 计算统计数字
 */
export function computeUsageCounts(
  usageMap: Map<string, WorkflowResourceUsageInfo> | null | undefined,
): { total: number; used: number; unused: number } {
  if (!usageMap) return { total: 0, used: 0, unused: 0 };
  let used = 0;
  for (const info of usageMap.values()) {
    if (info.isUsed) used++;
  }
  return { total: usageMap.size, used, unused: usageMap.size - used };
}
