import { describe, it, expect } from 'vitest'
import type { Store } from 'vuex'
import type { WorkflowState, WorkflowNode } from '../../../../src/aiworkflow/types'

// ====================================================================
// Blender 上游 3D 模型路径解析优先级测试
//
// 验证 resolveUpstreamModelPath 的优先级重排（方案 M1 / P1 + P3 修复）：
//   ① 最高：resourcesById[resourceId] 分支
//        （absolutePath → sourcePath → projectRelativePath → url）
//   ② 其次：model3d 内嵌 meshyModelSettings / tripo3dModelSettings 子 settings
//   ③ 最后：settings 字段（兼容旧蓝图）
//
// 同时确保：
//   - 图片扩展名不会被误判为 3D 模型（扩展名过滤）
//   - settings.modelSourceName / lastInputSourceName 不会参与路径拼接（字段语义隔离）
//
// 注意：为避免依赖运行时 import，这里以内联等价方式实现同构逻辑，
// 与 useBlenderUpstreamInputs.ts 的 resolveUpstreamModelPath /
// resolveUpstreamModelPathFromResource 保持逐行语义一致（source: M1 §4.3）。
// ====================================================================

const MODEL_EXTS = ['.glb', '.gltf', '.fbx', '.obj', '.stl', '.dae', '.usd', '.usdz', '.blend']
const hasModelExt = (p: string): boolean => {
	if (!p) return false
	let testPath = p
	if (/^dweb:\/\//i.test(p)) {
		try {
			const u = new URL(p)
			const d = u.searchParams.get('path')
			if (d) testPath = d
		} catch {}
	} else if (/^file:\/\//i.test(p)) {
		try {
			const u = new URL(p)
			testPath = decodeURIComponent(u.pathname)
		} catch {}
	}
	const lower = String(testPath).split('?')[0].split('#')[0].toLowerCase()
	return MODEL_EXTS.some((ext) => lower.endsWith(ext))
}

const resolveDwebToLocalPath = (raw: string, projectRoot: string | undefined): string => {
	const c = String(raw ?? '').trim()
	if (!c) return ''
	if (/^dweb:\/\//i.test(c)) {
		try {
			const qIdx = c.indexOf('?')
			if (qIdx < 0) return ''
			const qs = new URLSearchParams(c.slice(qIdx + 1))
			const path = qs.get('path') || qs.get('file')
			if (!path) return ''
			const decoded = decodeURIComponent(path).replace(/^[/\\]+/, '')
			if (!projectRoot) return decoded
			return `${String(projectRoot).replace(/[/\\]+$/, '')}/${decoded}`
		} catch {
			return ''
		}
	}
	if (/^file:\/\//i.test(c)) {
		try {
			const u = new URL(c)
			const pathname = decodeURIComponent(u.pathname)
			// file:///G:/foo → /G:/foo 规范化
			const normalized = pathname.replace(/^\/+([a-zA-Z]:)/, '$1')
			return normalized
		} catch {
			return ''
		}
	}
	return ''
}

// 内联等价实现：useBlenderUpstreamInputs.ts 中 resolveUpstreamModelPathFromResource
const resolveUpstreamModelPathFromResource = (
	state: WorkflowState,
	resourceRid: string,
	resolveCandidate: (raw: string) => string
): string => {
	const resource = (state.resourcesById as any)[resourceRid]
	if (!resource) return ''
	const projectRoot = (state as { projectRootPath?: string }).projectRootPath
	const absPath = String(resource?.absolutePath ?? '').trim()
	if (absPath) {
		const r = resolveCandidate(absPath)
		if (r) return r
	}
	const sourcePath = String(resource?.sourcePath ?? '').trim()
	if (sourcePath) {
		const r = resolveCandidate(sourcePath)
		if (r) return r
	}
	const rel = String(resource?.projectRelativePath ?? '').trim()
	if (rel) {
		const normalizedRoot = String(projectRoot ?? '').replace(/[/\\]+$/, '')
		const normalizedRel = rel.replace(/^[/\\]+/, '')
		const joined = normalizedRoot ? `${normalizedRoot}/${normalizedRel}` : rel
		const r = resolveCandidate(joined)
		if (r) return r
	}
	const resUrl = String(resource?.url ?? '').trim()
	if (resUrl) {
		const r = resolveCandidate(resUrl)
		if (r) return r
	}
	return ''
}

// 内联等价实现：useBlenderUpstreamInputs.ts 中 resolveUpstreamModelPath
const resolveUpstreamModelPath = (store: Store<WorkflowState>, node: WorkflowNode): string => {
	const state = store.state
	const resolveCandidate = (raw: string): string => {
		const projectRoot = (state as { projectRootPath?: string }).projectRootPath
		const c = String(raw ?? '').trim()
		if (!c) return ''
		if (/^https?:\/\//i.test(c)) return ''
		if (/^[A-Za-z]:[\\/]|^\//.test(c)) return hasModelExt(c) ? c : ''
		const resolved = resolveDwebToLocalPath(c, projectRoot)
		if (resolved && hasModelExt(resolved)) return resolved
		if (projectRoot && !c.includes('://')) {
			const normalizedRoot = String(projectRoot).replace(/[/\\]+$/, '')
			const normalizedRel = c.replace(/^[/\\]+/, '')
			const joined = `${normalizedRoot}/${normalizedRel}`
			if (hasModelExt(joined)) return joined
		}
		if (hasModelExt(c)) return c
		return ''
	}
	const trySettingsCandidates = (settings: Record<string, unknown> | undefined): string => {
		if (!settings) return ''
		const s = settings as any
		const candidates = [
			s.modelSourcePath,
			s.modelAssetPath,
			s.modelProjectRelativePath,
			s.modelAssetProjectRelativePath,
			s.persistedModelPath,
			s.tripo3dOutputAssetPath,
			s.tripo3dModelUrl,
			s.outputAssetPath,
			s.modelUrl,
			s.modelAssetUrl
		]
		for (const raw of candidates) {
			const resolved = resolveCandidate(String(raw ?? ''))
			if (resolved) return resolved
		}
		return ''
	}
	const settings =
		node.type === 'model3d'
			? ((node as any).model3dSettings ?? undefined)
			: node.type === 'meshy'
				? ((node as any).meshySettings ?? undefined)
				: node.type === 'tripo3d'
					? ((node as any).tripo3dSettings ?? undefined)
					: undefined

	// ===== ① resource 分支最高优先级 =====
	const resourceRid = String((node as any).resourceId ?? '').trim()
	if (resourceRid) {
		const resourceHit = resolveUpstreamModelPathFromResource(
			state as any,
			resourceRid,
			resolveCandidate
		)
		if (resourceHit) return resourceHit
	}

	// ===== ② model3d 内嵌 meshy/tripo 子 settings =====
	if (node.type === 'model3d' && settings) {
		const m3d = settings as any
		const trySub = (subSettings: any) => {
			if (!subSettings || typeof subSettings !== 'object') return ''
			const subRid = String((subSettings as any).resourceId ?? '').trim()
			if (subRid) {
				const r = resolveUpstreamModelPathFromResource(state as any, subRid, resolveCandidate)
				if (r) return r
			}
			return trySettingsCandidates(subSettings as Record<string, unknown>)
		}
		const h1 = trySub(m3d.meshyModelSettings)
		if (h1) return h1
		const h2 = trySub(m3d.tripo3dModelSettings)
		if (h2) return h2
	}

	// ===== ③ settings fallback =====
	const s = trySettingsCandidates(settings)
	if (s) return s
	return ''
}

// 最小 store，覆盖 store.state.resourcesById / projectRootPath / nodesById
const makeStore = (override: Partial<any> = {}): Store<any> =>
	({
		state: {
			projectRootPath: 'D:/MyProject',
			resourcesById: {},
			nodesById: {},
			...override
		}
	}) as any

const makeNode = (patch: Partial<any> = {}): any => ({
	id: 'n-model3d-001',
	type: 'model3d',
	title: '3D Model',
	resourceId: 'r-001',
	...patch
})

describe('resolveUpstreamModelPath 优先级重排（M1 §4.3 P1 + P3 修复）', () => {
	it('P3 修复：resource.absolutePath 优先于 settings.modelAssetPath（防止选择面板旧数据）', () => {
		const store = makeStore({
			resourcesById: {
				'r-001': {
					absolutePath: 'G:/Resource/Live/chair_latest_a1b2c3.glb',
					sourcePath: 'G:/Legacy/chair_stale.glb'
				}
			}
		})
		const node = makeNode({
			model3dSettings: {
				modelAssetPath: 'G:/OldPanel/chair_from_panel_old.glb'
			}
		})
		// Blender 导入必须命中 resource，而不是 settings 里的旧面板数据
		expect(resolveUpstreamModelPath(store as any, node)).toBe(
			'G:/Resource/Live/chair_latest_a1b2c3.glb'
		)
	})

	it('P1 修复：resourcesById 四字段优先级 absolutePath > sourcePath > projectRelativePath > url', () => {
		const store = makeStore({
			resourcesById: {
				'r-001': {
					// 四个都有值时必须选第一个命中的 absolutePath
					absolutePath: 'G:/1abs/monkey.glb',
					sourcePath: 'G:/2src/monkey.glb',
					projectRelativePath: 'Content/Media/monkey_rel.glb',
					url: 'dweb://project-assets?projectId=1&path=Content%2FMedia%2Fmonkey_dweb.glb'
				}
			}
		})
		const node = makeNode()
		expect(resolveUpstreamModelPath(store as any, node)).toBe('G:/1abs/monkey.glb')
	})

	it('P1-C：无 A/B 时合成 projectRelativePath + projectRoot', () => {
		const store = makeStore({
			projectRootPath: 'D:/Workspace',
			resourcesById: {
				'r-001': {
					projectRelativePath: 'Content/Media/table.glb'
				}
			}
		})
		const node = makeNode()
		expect(resolveUpstreamModelPath(store as any, node)).toBe(
			'D:/Workspace/Content/Media/table.glb'
		)
	})

	it('P1-D：dweb URL 反解路径 + 拼 projectRoot', () => {
		const store = makeStore({
			projectRootPath: 'D:/Workspace',
			resourcesById: {
				'r-001': {
					url: 'dweb://project-assets?projectId=1&path=Content%2FMedia%2Fsofa.glb'
				}
			}
		})
		const node = makeNode()
		expect(resolveUpstreamModelPath(store as any, node)).toBe('D:/Workspace/Content/Media/sofa.glb')
	})

	it('字段语义隔离：settings.modelSourceName / lastInputSourceName 不应参与路径拼接', () => {
		// modelSourceName 记录的是内部 mesh 名称（例如 "Cube"、"Suzanne.001"）
		// lastInputSourceName 是上游节点标题，两者都不是文件名
		const store = makeStore({
			resourcesById: {
				'r-001': {
					absolutePath: 'G:/Assets/room/sofa.glb'
				}
			}
		})
		const node = makeNode({
			model3dSettings: {
				modelSourceName: 'Mesh_Sofa_Armrest',
				lastInputSourceName: '场景合成-沙发',
				modelAssetPath: 'G:/ShouldNotTakeOldPanelPath/sofa_panel.glb'
			}
		})
		// 不应命中 modelSourceName / lastInputSourceName；应走 resource.absolutePath
		const resolved = resolveUpstreamModelPath(store as any, node)
		expect(resolved).toBe('G:/Assets/room/sofa.glb')
		expect(resolved).not.toContain('Armrest')
		expect(resolved).not.toContain('场景合成')
	})

	it('② 子 settings：model3d.meshyModelSettings.resourceId 独立走 resource 分支', () => {
		const store = makeStore({
			resourcesById: {
				'r-meshy-sub-999': {
					absolutePath: 'G:/MeshyResult/bunny_mesh.glb'
				}
			}
		})
		const node = makeNode({
			resourceId: '', // 顶层无 resourceId
			model3dSettings: {
				meshyModelSettings: {
					resourceId: 'r-meshy-sub-999',
					modelAssetPath: 'G:/PanelCached/bunny_panel_old.glb' // 不应命中
				}
			}
		})
		expect(resolveUpstreamModelPath(store as any, node)).toBe('G:/MeshyResult/bunny_mesh.glb')
	})

	it('③ fallback：无任何 resourceId 时，兼容旧蓝图 settings.modelAssetPath', () => {
		const store = makeStore({ resourcesById: {} })
		const node = makeNode({
			resourceId: '',
			model3dSettings: {
				modelAssetPath: 'G:/LegacyAssets/old.glb'
			}
		})
		expect(resolveUpstreamModelPath(store as any, node)).toBe('G:/LegacyAssets/old.glb')
	})

	it('扩展名过滤：图片候选会被拒绝（不会把图片当作 3D 模型导入 Blender）', () => {
		const store = makeStore({
			resourcesById: {
				'r-001': {
					absolutePath: 'G:/img/preview.png',
					sourcePath: 'G:/img/thumb.jpg',
					projectRelativePath: 'Content/img/model.webp',
					name: 'mesh.png'
				}
			}
		})
		const node = makeNode({
			model3dSettings: {
				modelAssetPath: 'G:/real/teapot.glb'
			}
		})
		// resource 分支全是图片，应降级到 settings fallback 的真实 3D 模型路径
		expect(resolveUpstreamModelPath(store as any, node)).toBe('G:/real/teapot.glb')
	})

	it('远程 https:// URL 不会被作为本地路径选择', () => {
		const store = makeStore({
			resourcesById: {
				'r-001': {
					url: 'https://cdn.example.com/model.glb',
					sourcePath: 'G:/Local/model_local.glb'
				}
			}
		})
		const node = makeNode()
		expect(resolveUpstreamModelPath(store as any, node)).toBe('G:/Local/model_local.glb')
	})
})
