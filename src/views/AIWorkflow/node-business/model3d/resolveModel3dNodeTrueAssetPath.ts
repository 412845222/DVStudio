import type { Store } from 'vuex'
import type { WorkflowState, WorkflowNode } from '../../../../aiworkflow/types'

/**
 * 3D 模型节点「真实资产路径 / 文件名 / 目录路径」统一解析工具。
 *
 * 设计目标（方案 A1）：
 * - 单一真相源：以 Vuex store.resourcesById[resourceId] 为最高优先级，
 *   settings 字段仅用作旧蓝图/无 resourceId 节点的 fallback。
 * - 三方同源：WorkflowModel3DNode 面板显示、右键"在文件夹中显示"、
 *   Blender 节点 collectBlenderUpstreamInputs 导入路径，必须均调用本工具返回值。
 * - 优先级（与 NodeComponentResolver.resolveResourceProps 保持一致）：
 *   A. absolutePath（本机绝对路径，2026-08-03 新增）
 *   B. sourcePath（本机绝对路径，历史字段，广泛存在）
 *   C. projectRoot + projectRelativePath（蓝图项目相对路径，跨机器可移植）
 *   D. dweb:// URL 反解 path 参数 → 拼接 projectRoot
 *   E. file:// URL 反解 pathname
 *   F. settings 中 modelAssetPath / modelAssetProjectRelativePath /
 *      modelProjectRelativePath / modelSourcePath（按上述 A~E 规则同样转换）
 * - 不做文件存在性校验（存在性校验留给 onBlenderImport 导入前统一处理，
 *   面板侧按需使用 checkAssetExists 异步函数）。
 */

export type Model3dTrueAssetInfo = {
	/** 最终解析到的本机绝对路径（Windows: G:\xxx\Content\Media\xxx.glb, Unix: /...） */
	absolutePath: string
	/** 真实资产文件名（含扩展名），如 "chair_01_a1b2c3.glb" */
	fileName: string
	/** 目录路径（absolutePath 的父目录），用于"在文件夹中显示" */
	directoryPath: string
	/** 蓝图项目相对路径（形如 Content/Media/xxx.glb），找不到则为空串 */
	projectRelativePath: string
	/** 解析来源描述，用于诊断信息与面板 tooltip */
	source:
		| 'resource.absolutePath'
		| 'resource.sourcePath'
		| 'resource.projectRelativePath'
		| 'resource.url-dweb'
		| 'resource.url-file'
		| 'settings.modelAssetPath'
		| 'settings.modelAssetProjectRelativePath'
		| 'settings.modelProjectRelativePath'
		| 'settings.modelSourcePath'
		| 'unresolved'
}

const MODEL_EXTS = ['.glb', '.gltf', '.fbx', '.obj', '.stl', '.dae', '.usd', '.usdz', '.blend']

type AIWorkflowStoreLike = Pick<Store<WorkflowState>, 'state'> & {
	state: WorkflowState & {
		projectRootPath?: string
		resourcesById: Record<
			string,
			{
				absolutePath?: unknown
				sourcePath?: unknown
				projectRelativePath?: unknown
				url?: unknown
				name?: unknown
			}
		>
	}
}

const hasModelExt = (p: string): boolean => {
	if (!p) return false
	const lower = String(p).split('?')[0].split('#')[0].toLowerCase()
	return MODEL_EXTS.some((ext) => lower.endsWith(ext))
}

const normalizeProjectRoot = (root: string | undefined): string =>
	String(root ?? '').replace(/[/\\]+$/, '')

const joinProjectPath = (root: string, rel: string): string => {
	const r = normalizeProjectRoot(root)
	const p = String(rel ?? '').replace(/^[/\\]+/, '')
	return r ? `${r}/${p}` : p
}

const basename = (p: string): string => {
	if (!p) return ''
	const norm = String(p).replace(/\\/g, '/')
	const i = norm.lastIndexOf('/')
	return i >= 0 ? norm.slice(i + 1) : norm
}

const dirname = (p: string): string => {
	if (!p) return ''
	const norm = String(p).replace(/\\/g, '/')
	const i = norm.lastIndexOf('/')
	if (i <= 0) return norm.startsWith('/') ? '/' : '.'
	return norm.slice(0, i)
}

const resolveFileUrlPath = (url: string): string => {
	if (!url || !url.startsWith('file://')) return ''
	try {
		const u = new URL(url)
		let p = decodeURIComponent(u.pathname)
		// Windows: /C:/foo/bar → C:/foo/bar
		if (/^\/[A-Za-z]:[\\/]/.test(p)) p = p.slice(1)
		return p
	} catch {
		return ''
	}
}

const resolveDwebUrlPath = (url: string, projectRoot: string | undefined): string => {
	if (!url || !url.startsWith('dweb://')) return ''
	try {
		const u = new URL(url)
		const p = u.searchParams.get('path')
		if (!p) return ''
		const rel = decodeURIComponent(p)
		const root = normalizeProjectRoot(projectRoot)
		if (root) return joinProjectPath(root, rel)
		// 无 projectRoot 时，直接返回 path 参数（可能是绝对路径）
		return rel
	} catch {
		return ''
	}
}

const toAbsoluteLocalPath = (
	candidate: string,
	projectRoot: string | undefined
): { path: string; kind: 'absolute' | 'relative' | 'dweb' | 'file' | 'http' | 'unknown' } => {
	const c = String(candidate ?? '').trim()
	if (!c) return { path: '', kind: 'unknown' }
	if (/^https?:\/\//i.test(c)) return { path: '', kind: 'http' }
	if (/^[A-Za-z]:[\\/]|^\//.test(c)) return { path: c, kind: 'absolute' }
	if (c.startsWith('file://')) {
		const p = resolveFileUrlPath(c)
		return { path: p, kind: p ? 'file' : 'unknown' }
	}
	if (c.startsWith('dweb://')) {
		const p = resolveDwebUrlPath(c, projectRoot)
		return { path: p, kind: p ? 'dweb' : 'unknown' }
	}
	// 相对路径：拼接 projectRoot
	const root = normalizeProjectRoot(projectRoot)
	if (root && !c.includes('://')) {
		return { path: joinProjectPath(root, c), kind: 'relative' }
	}
	return { path: hasModelExt(c) ? c : '', kind: 'unknown' }
}

const pickFirstValidCandidate = (
	candidates: Array<{ raw: string | null | undefined; source: Model3dTrueAssetInfo['source'] }>,
	projectRoot: string | undefined
): Pick<Model3dTrueAssetInfo, 'absolutePath' | 'source'> => {
	for (const c of candidates) {
		const raw = String(c.raw ?? '').trim()
		if (!raw) continue
		const resolved = toAbsoluteLocalPath(raw, projectRoot)
		if (resolved.path && hasModelExt(resolved.path)) {
			return { absolutePath: resolved.path, source: c.source as Model3dTrueAssetInfo['source'] }
		}
	}
	return { absolutePath: '', source: 'unresolved' as const }
}

const normalizeSettings = (node: WorkflowNode): Record<string, unknown> | undefined => {
	const anyNode = node as {
		model3dSettings?: Record<string, unknown>
		meshySettings?: Record<string, unknown>
		tripo3dSettings?: Record<string, unknown>
	}
	if (node.type === 'model3d') return anyNode.model3dSettings
	if (node.type === 'meshy') return anyNode.meshySettings
	if (node.type === 'tripo3d') return anyNode.tripo3dSettings
	return anyNode.model3dSettings ?? anyNode.meshySettings ?? anyNode.tripo3dSettings
}

/**
 * 解析 3D 模型节点的真实资产信息（路径/文件名/目录）。
 *
 * @param store Vuex store（提供 projectRootPath + resourcesById）
 * @param node  目标节点（model3d / meshy / tripo3d）
 */
export function resolveModel3dNodeTrueAssetPath(
	store: AIWorkflowStoreLike,
	node: WorkflowNode
): Model3dTrueAssetInfo {
	const state = store.state
	const projectRoot = state.projectRootPath
	const settings = normalizeSettings(node) as any
	const resourceRid = String((node as { resourceId?: string }).resourceId ?? '').trim()

	let picked: Pick<Model3dTrueAssetInfo, 'absolutePath' | 'source'> = {
		absolutePath: '',
		source: 'unresolved'
	}
	let resolvedProjectRelative = ''

	// ===== A~D 级：resourcesById[rid] 最高优先级 =====
	if (resourceRid) {
		const res = state.resourcesById?.[resourceRid]
		if (res) {
			const candidatesA: Array<{
				raw: string | null | undefined
				source: Model3dTrueAssetInfo['source']
			}> = [
				{
					raw: typeof res.absolutePath === 'string' ? res.absolutePath : undefined,
					source: 'resource.absolutePath'
				},
				{
					raw: typeof res.sourcePath === 'string' ? res.sourcePath : undefined,
					source: 'resource.sourcePath'
				}
			]
			const prp = String(res.projectRelativePath ?? '').trim()
			if (prp && projectRoot) {
				const abs = joinProjectPath(projectRoot, prp)
				candidatesA.push({ raw: abs, source: 'resource.projectRelativePath' })
			}
			const urlStr = String(res.url ?? '').trim()
			if (urlStr) {
				candidatesA.push({
					raw: urlStr,
					source: urlStr.startsWith('dweb://') ? 'resource.url-dweb' : 'resource.url-file'
				})
			}
			picked = pickFirstValidCandidate(candidatesA, projectRoot)
			if (prp) resolvedProjectRelative = prp
		}
	}

	// ===== E~F 级：settings 字段（兼容旧蓝图 / 无 resourceId 场景）=====
	if (!picked.absolutePath && settings) {
		const settingsCandidates: Array<{
			raw: string | null | undefined
			source: Model3dTrueAssetInfo['source']
			isRelative?: boolean
		}> = [
			{ raw: settings.modelAssetPath, source: 'settings.modelAssetPath' },
			{
				raw:
					settings.modelAssetProjectRelativePath && projectRoot
						? joinProjectPath(projectRoot, String(settings.modelAssetProjectRelativePath))
						: settings.modelAssetProjectRelativePath,
				source: 'settings.modelAssetProjectRelativePath'
			},
			{
				raw:
					settings.modelProjectRelativePath && projectRoot
						? joinProjectPath(projectRoot, String(settings.modelProjectRelativePath))
						: settings.modelProjectRelativePath,
				source: 'settings.modelProjectRelativePath'
			},
			{ raw: settings.modelSourcePath, source: 'settings.modelSourcePath' }
		]

		// 对相对路径标注，交由 pickFirstValidCandidate 中的 toAbsoluteLocalPath 统一处理
		picked = pickFirstValidCandidate(
			settingsCandidates.map((sc) => ({ raw: sc.raw, source: sc.source })),
			projectRoot
		)

		// 记录相对路径（用于 projectRelativePath 输出）
		if (picked.absolutePath && !resolvedProjectRelative) {
			const prpCandidates = [
				settings.modelAssetProjectRelativePath,
				settings.modelProjectRelativePath
			]
			for (const rp of prpCandidates) {
				const s = String(rp ?? '').trim()
				if (s && hasModelExt(s)) {
					resolvedProjectRelative = s
					break
				}
			}
			// 若 picked 是 projectRoot+相对路径 拼接得到，反解出相对部分
			if (!resolvedProjectRelative && projectRoot) {
				const root = normalizeProjectRoot(projectRoot).replace(/\\/g, '/') + '/'
				const abs = picked.absolutePath.replace(/\\/g, '/')
				if (abs.toLowerCase().startsWith(root.toLowerCase())) {
					resolvedProjectRelative = abs.slice(root.length)
				}
			}
		}
	}

	const path = picked.absolutePath
	return {
		absolutePath: path,
		fileName: path ? basename(path) : '',
		directoryPath: path ? dirname(path) : '',
		projectRelativePath: resolvedProjectRelative,
		source: picked.source
	}
}

/**
 * 异步校验文件是否存在（基于 window.dweb.fs.stat 或等价 API）。
 * 缺失 stat API 时返回 true（放行），避免因为环境差异阻塞业务。
 */
export async function checkAssetExists(absolutePath: string): Promise<boolean> {
	if (!absolutePath) return false
	const dwebFs = (window as any)?.dweb?.fs
	if (typeof dwebFs?.stat === 'function') {
		try {
			const r = await dwebFs.stat(absolutePath)
			// 只要 stat 不抛错即视为存在；若返回对象带 exists 字段，优先采信
			if (r && typeof r === 'object' && typeof (r as any).exists === 'boolean') {
				return Boolean((r as any).exists)
			}
			return true
		} catch {
			return false
		}
	}
	// 无 dweb fs 能力：跳过存在性校验
	return true
}

/**
 * 便捷函数：获取 3D 模型节点的真实资产文件名（面板显示用）。
 * 优先级：resource.name（如果有）> 解析后的 absolutePath 取 basename > settings.modelSourceName（仅兜底显示）
 */
export function resolveModel3dNodeAssetFileName(
	store: AIWorkflowStoreLike,
	node: WorkflowNode
): string {
	const resourceRid = String((node as { resourceId?: string }).resourceId ?? '').trim()
	if (resourceRid) {
		const res = store.state.resourcesById?.[resourceRid]
		const rn = String(res?.name ?? '').trim()
		if (rn) return rn
	}
	const info = resolveModel3dNodeTrueAssetPath(store, node)
	if (info.fileName) return info.fileName
	// 最后兜底：仅用于文案显示（不参与路径推导！）
	const settings = normalizeSettings(node) as any
	const sourceName = String(settings?.modelSourceName ?? '').trim()
	if (sourceName) return sourceName
	const inputName = String(settings?.lastInputSourceName ?? '').trim()
	if (inputName) return inputName
	return ''
}
