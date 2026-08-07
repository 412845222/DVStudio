import { describe, it, expect } from 'vitest'
import {
	resolveModel3dNodeTrueAssetPath,
	resolveModel3dNodeAssetFileName,
	checkAssetExists,
	Model3dTrueAssetInfo
} from '../../../../src/views/AIWorkflow/node-business/model3d/resolveModel3dNodeTrueAssetPath'

// ====================================================================
// resolveModel3dNodeTrueAssetPath 单元测试
//
// 覆盖场景：
//  1. 优先级 A：resource.absolutePath 最高优先级（即使其他字段也存在）
//  2. 优先级 B：无 absolutePath 时回退到 resource.sourcePath
//  3. 优先级 C：无 A/B 时走 projectRoot + resource.projectRelativePath
//  4. 优先级 D：dweb:// URL 反解 / file:// URL 反解
//  5. 优先级 E：settings.modelAssetPath / modelAssetProjectRelativePath /
//              modelProjectRelativePath / modelSourcePath fallback
//  6. 字段语义隔离：resource.name 不参与路径拼接
//  7. 非 3D 模型扩展名的候选被过滤（不会误拿图片等）
//  8. resolveModel3dNodeAssetFileName 优先 resource.name
// ====================================================================

type StoreLike = Parameters<typeof resolveModel3dNodeTrueAssetPath>[0]

const makeStore = (override: Partial<StoreLike['state']> = {}): StoreLike => ({
	state: {
		projectRootPath: 'D:/DVStudioProject',
		resourcesById: {},
		nodesById: {},
		...(override as any)
	}
})

const makeModel3dNode = (patch: Partial<any> = {}): any => ({
	id: 'n-model3d-001',
	type: 'model3d',
	title: '3D Model Node',
	resourceId: 'r-asset-001',
	...patch
})

describe('resolveModel3dNodeTrueAssetPath', () => {
	describe('优先级 A: resource.absolutePath 最高', () => {
		it('当 absolutePath/sourcePath/projectRelativePath/url 同时存在时，选择 absolutePath', () => {
			const store = makeStore({
				resourcesById: {
					'r-asset-001': {
						absolutePath: 'G:/DVSResource/Content/Media/chair_real_a.glb',
						sourcePath: 'G:/Other/chair_stale_source.glb',
						projectRelativePath: 'Content/Media/chair_rel.glb',
						url: 'dweb://project-assets?projectId=1&path=Content%2FMedia%2Fchair_dweb.glb',
						name: 'chair_real_a.glb'
					}
				}
			})
			const info = resolveModel3dNodeTrueAssetPath(store, makeModel3dNode())
			expect(info.absolutePath).toBe('G:/DVSResource/Content/Media/chair_real_a.glb')
			expect(info.source).toBe('resource.absolutePath')
			expect(info.fileName).toBe('chair_real_a.glb')
		})

		it('absolutePath 不匹配扩展名时，降级到 sourcePath', () => {
			const store = makeStore({
				resourcesById: {
					'r-asset-001': {
						absolutePath: 'G:/preview.png',
						sourcePath: 'G:/DVSResource/Content/Media/chair.glb',
						name: 'chair.glb'
					}
				}
			})
			const info = resolveModel3dNodeTrueAssetPath(store, makeModel3dNode())
			expect(info.absolutePath).toBe('G:/DVSResource/Content/Media/chair.glb')
			expect(info.source).toBe('resource.sourcePath')
		})
	})

	describe('优先级 B: sourcePath fallback', () => {
		it('无 absolutePath 时从 sourcePath 解析', () => {
			const store = makeStore({
				resourcesById: {
					'r-asset-001': {
						sourcePath: 'G:/Work/models/sofa.fbx',
						name: 'sofa.fbx'
					}
				}
			})
			const info = resolveModel3dNodeTrueAssetPath(store, makeModel3dNode())
			expect(info.absolutePath).toBe('G:/Work/models/sofa.fbx')
			expect(info.source).toBe('resource.sourcePath')
			expect(info.directoryPath).toBe('G:/Work/models')
		})
	})

	describe('优先级 C: projectRoot + projectRelativePath', () => {
		it('无 A/B 时合成 projectRelativePath', () => {
			const store = makeStore({
				projectRootPath: 'D:/MyProject',
				resourcesById: {
					'r-asset-001': {
						projectRelativePath: 'Content/Media/table.obj',
						name: 'table.obj'
					}
				}
			})
			const info = resolveModel3dNodeTrueAssetPath(store, makeModel3dNode())
			expect(info.absolutePath).toBe('D:/MyProject/Content/Media/table.obj')
			expect(info.source).toBe('resource.projectRelativePath')
			expect(info.projectRelativePath).toBe('Content/Media/table.obj')
		})

		it('projectRelativePath 即使有前导斜杠也能正确规范化', () => {
			const store = makeStore({
				projectRootPath: 'D:/MyProject/',
				resourcesById: {
					'r-asset-001': {
						projectRelativePath: '/Content/Media/door.gltf',
						name: 'door.gltf'
					}
				}
			})
			const info = resolveModel3dNodeTrueAssetPath(store, makeModel3dNode())
			expect(info.absolutePath).toBe('D:/MyProject/Content/Media/door.gltf')
		})
	})

	describe('优先级 D: dweb:// / file:// URL', () => {
		it('dweb URL 从 path 参数反解并拼接 projectRoot', () => {
			const store = makeStore({
				projectRootPath: 'D:/Proj',
				resourcesById: {
					'r-asset-001': {
						url: 'dweb://project-assets?projectId=42&path=Content%2FMedia%2Fteapot.usdz',
						name: 'teapot.usdz'
					}
				}
			})
			const info = resolveModel3dNodeTrueAssetPath(store, makeModel3dNode())
			expect(info.absolutePath).toBe('D:/Proj/Content/Media/teapot.usdz')
			expect(info.source).toBe('resource.url-dweb')
		})

		it('file:// URL 直接反解 pathname', () => {
			const store = makeStore({
				resourcesById: {
					'r-asset-001': {
						url: 'file:///G:/3dmodels/cup.stl',
						name: 'cup.stl'
					}
				}
			})
			const info = resolveModel3dNodeTrueAssetPath(store, makeModel3dNode())
			expect(
				info.absolutePath.endsWith('/G:/3dmodels/cup.stl') ||
					info.absolutePath === 'G:/3dmodels/cup.stl'
			).toBe(true)
			expect([
				'resource.url-file',
				'resource.url-dweb'
			] as Model3dTrueAssetInfo['source'][]).toContain(info.source)
		})
	})

	describe('优先级 E: settings fallback（无 resourceId / resourcesById 中无条目）', () => {
		it('settings.modelAssetPath 生效（兼容旧蓝图）', () => {
			const store = makeStore()
			const node = makeModel3dNode({
				resourceId: '',
				model3dSettings: {
					modelAssetPath: 'G:/LegacyAssets/old_chair.glb'
				}
			})
			const info = resolveModel3dNodeTrueAssetPath(store, node)
			expect(info.absolutePath).toBe('G:/LegacyAssets/old_chair.glb')
			expect(info.source).toBe('settings.modelAssetPath')
		})

		it('settings.modelProjectRelativePath 会拼 projectRoot', () => {
			const store = makeStore({ projectRootPath: 'D:/LegacyProj' })
			const node = makeModel3dNode({
				resourceId: '',
				model3dSettings: {
					modelProjectRelativePath: 'Content/Media/legacy.glb'
				}
			})
			const info = resolveModel3dNodeTrueAssetPath(store, node)
			expect(info.absolutePath).toBe('D:/LegacyProj/Content/Media/legacy.glb')
			expect(info.source).toBe('settings.modelProjectRelativePath')
		})
	})

	describe('字段语义隔离 & 过滤', () => {
		it('非 3D 模型扩展名候选会被过滤（图片 / URL 远程）', () => {
			const store = makeStore({
				resourcesById: {
					'r-asset-001': {
						absolutePath: 'G:/thumb.jpg',
						sourcePath: 'G:/preview.png',
						projectRelativePath: 'Content/Mesh/screen.webp',
						url: 'https://example.com/image.png',
						name: 'mesh.glb'
					}
				},
				nodesById: {}
			})
			const node = makeModel3dNode({
				model3dSettings: {
					modelAssetPath: 'G:/real.glb'
				}
			})
			// A~D 全部被过滤（扩展名非模型），应命中 settings.modelAssetPath
			const info = resolveModel3dNodeTrueAssetPath(store, node)
			expect(info.absolutePath).toBe('G:/real.glb')
			expect(info.source).toBe('settings.modelAssetPath')
		})

		it('https:// 远程 URL 不会作为本地路径被错误选中', () => {
			const store = makeStore({
				resourcesById: {
					'r-asset-001': {
						url: 'https://cdn.example.com/model.glb',
						sourcePath: 'G:/LocalAsset/model_local.glb',
						name: 'model_local.glb'
					}
				}
			})
			const info = resolveModel3dNodeTrueAssetPath(store, makeModel3dNode())
			expect(info.absolutePath).toBe('G:/LocalAsset/model_local.glb')
		})
	})

	describe('resolveModel3dNodeAssetFileName', () => {
		it('优先返回 resource.name（面板真实文件名）', () => {
			const store = makeStore({
				resourcesById: {
					'r-asset-001': {
						name: 'armchair_8f3a2c.glb',
						absolutePath: 'G:/DVSResource/Content/Media/armchair_8f3a2c.glb'
					}
				}
			})
			expect(resolveModel3dNodeAssetFileName(store, makeModel3dNode())).toBe('armchair_8f3a2c.glb')
		})

		it('无 resource.name 时，从 absolutePath 尾段解析文件名', () => {
			const store = makeStore({
				resourcesById: {
					'r-asset-001': {
						absolutePath: 'G:/folder/sub/sofa_2026.glb'
					}
				}
			})
			expect(resolveModel3dNodeAssetFileName(store, makeModel3dNode())).toBe('sofa_2026.glb')
		})
	})

	describe('unresolved', () => {
		it('所有候选都缺失时返回 unresolved + 空路径', () => {
			const store = makeStore({
				resourcesById: {
					'r-asset-001': {
						name: 'empty.model'
					}
				}
			})
			const info = resolveModel3dNodeTrueAssetPath(store, makeModel3dNode())
			expect(info.absolutePath).toBe('')
			expect(info.source).toBe('unresolved')
		})
	})

	describe('meshy / tripo3d 节点类型也可解析（normalizeSettings 分支）', () => {
		it('meshy 节点读取 meshySettings', () => {
			const store = makeStore()
			const node = {
				id: 'n-meshy-001',
				type: 'meshy',
				resourceId: '',
				meshySettings: {
					modelAssetPath: 'G:/MeshyOut/cat.glb'
				}
			} as any
			const info = resolveModel3dNodeTrueAssetPath(store, node)
			expect(info.absolutePath).toBe('G:/MeshyOut/cat.glb')
			expect(info.source).toBe('settings.modelAssetPath')
		})

		it('tripo3d 节点读取 tripo3dSettings', () => {
			const store = makeStore()
			const node = {
				id: 'n-tripo-001',
				type: 'tripo3d',
				resourceId: '',
				tripo3dSettings: {
					modelAssetPath: 'G:/TripoOut/dog.glb'
				}
			} as any
			const info = resolveModel3dNodeTrueAssetPath(store, node)
			expect(info.absolutePath).toBe('G:/TripoOut/dog.glb')
			expect(info.source).toBe('settings.modelAssetPath')
		})
	})
})

describe('checkAssetExists', () => {
	it('无 window.dweb.fs.stat 环境下放行（返回 true）', async () => {
		// vitest 环境没有 dweb，直接 true（不阻断）
		await expect(checkAssetExists('G:/anything/foo.glb')).resolves.toBe(true)
	})

	it('空路径直接返回 false', async () => {
		await expect(checkAssetExists('')).resolves.toBe(false)
	})
})
