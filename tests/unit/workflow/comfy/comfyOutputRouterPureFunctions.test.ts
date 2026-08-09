import { describe, it, expect } from 'vitest'
import {
	buildComfyMediaKey,
	buildDesiredComfyMediaFilename
} from '@/views/AIWorkflow/node-business/comfy/useAIWorkflowComfyOutputRouter'
import type { ComfyBridgeMedia } from '@/views/AIWorkflow/node-business/comfy/comfyOutputResolver'

describe('comfy output router pure functions (FX6 输出缓存修复)', () => {
	describe('buildComfyMediaKey', () => {
		it('url / subfolder / type 完全相同 → key 相同（允许同一任务同一输出被缓存复用）', () => {
			const a: ComfyBridgeMedia = {
				nodeId: '501',
				filename: 'video.mp4',
				subfolder: 'Minimax_H3',
				type: 'output',
				url: 'http://localhost:8188/view?prompt_id=0000aaaa1111bbbb&filename=video.mp4&subfolder=Minimax_H3&type=output'
			}
			const b: ComfyBridgeMedia = {
				nodeId: '777',
				filename: 'video.mp4',
				subfolder: 'Minimax_H3',
				type: 'output',
				url: 'http://localhost:8188/view?prompt_id=0000aaaa1111bbbb&filename=video.mp4&subfolder=Minimax_H3&type=output'
			}
			expect(buildComfyMediaKey(a)).toBe(buildComfyMediaKey(b))
		})

		it('URL 不同（prompt_id 不同）→ key 不同；这是 FX6 的核心保证，用于两次任务文件名相同但实际不同媒体的正确区分', () => {
			const oldRun: ComfyBridgeMedia = {
				filename: 'video.mp4',
				subfolder: 'Minimax_H3',
				type: 'output',
				url: 'http://localhost:8188/view?prompt_id=OLD_OLDOLD&filename=video.mp4&subfolder=Minimax_H3&type=output'
			}
			const newRun: ComfyBridgeMedia = {
				filename: 'video.mp4',
				subfolder: 'Minimax_H3',
				type: 'output',
				url: 'http://localhost:8188/view?prompt_id=NEW_NEWNEW&filename=video.mp4&subfolder=Minimax_H3&type=output'
			}
			expect(oldRun.filename).toBe(newRun.filename)
			expect(oldRun.subfolder).toBe(newRun.subfolder)
			expect(oldRun.type).toBe(newRun.type)
			expect(buildComfyMediaKey(oldRun)).not.toBe(buildComfyMediaKey(newRun))
		})

		it('key 不依赖 nodeId 与 filename（不把这些不稳定因素带进缓存判定）', () => {
			// 场景：两个工作流 nodeId 不一样 / filename 不一样，但实际 URL 完全相同（极端共享）也必须 key 相同；
			//   反向体现：key 不因 nodeId / filename 差异而变化（只看 subfolder+type+url）
			const base = 'http://localhost:8188/view?prompt_id=X&filename=x.png&subfolder=s&type=o'
			const k1 = buildComfyMediaKey({
				nodeId: '1',
				filename: 'x.png',
				subfolder: 's',
				type: 'o',
				url: base
			})
			const k2 = buildComfyMediaKey({
				nodeId: '999999',
				filename: 'IRRELEVANT.mp4',
				subfolder: 's',
				type: 'o',
				url: base
			})
			expect(k1).toBe(k2)
			expect(k1).toBe('s|o|' + base)
		})

		it('null/undefined 字段不抛错，稳定输出兜底 key', () => {
			const key1 = buildComfyMediaKey({
				subfolder: null as any,
				type: undefined as any,
				url: null as any
			})
			const key2 = buildComfyMediaKey({} as ComfyBridgeMedia)
			expect(key1).toBe('||')
			expect(key2).toBe('||')
		})
	})

	describe('buildDesiredComfyMediaFilename', () => {
		it('两次调用（默认 now/random）生成的文件名绝不相同 → 避免 downloadUrlToProjectRoot 命中旧文件', () => {
			const sharedArgs = {
				filename: 'video.mp4',
				kind: 'video' as const,
				url: 'http://localhost:8188/view?prompt_id=ABCDEF1234567890&filename=video.mp4&subfolder=foo&type=output'
			}
			const a = buildDesiredComfyMediaFilename(sharedArgs)
			const b = buildDesiredComfyMediaFilename(sharedArgs)
			expect(a).not.toBe(b)
			// 都必须带 .mp4 扩展名
			expect(a.endsWith('.mp4')).toBe(true)
			expect(b.endsWith('.mp4')).toBe(true)
		})

		it('从 URL query 里的 prompt_id 截取最后 8 位，作为人类可读 token', () => {
			const name = buildDesiredComfyMediaFilename({
				filename: 'video.mp4',
				kind: 'video',
				url: 'http://localhost:8188/view?prompt_id=99990000_aaaabbbbccccdddd&filename=video.mp4&type=output',
				now: 1710000000000,
				random2: '42',
				origin: 'http://localhost'
			})
			// prompt_id = '99990000_aaaabbbbccccdddd'，length=24，slice(-8) = 'ccccdddd'
			expect(name).toContain('_ccccdddd')
			expect(name).toContain('_t171000000000042')
			expect(name).toBe('video_ccccdddd_t171000000000042.mp4')
		})

		it('没有 prompt_id 时，使用 subfolder + filename 构造 token（非法字符统一替换成 _）', () => {
			const name = buildDesiredComfyMediaFilename({
				filename: 'clip.mp4',
				kind: 'video',
				url: 'http://localhost:8188/view?subfolder=Foo Bar/Test+1&filename=clip.mp4&type=output',
				now: 1,
				random2: '07',
				origin: 'http://localhost'
			})
			// token 末尾 24 位（sfTok_fnTok = 'Foo Bar/Test+1_clip.mp4' → 非法字符全部变 _，再取最后 24 位）
			const safe = 'Foo_Bar_Test_1_clip.mp4'.replace(/[^a-zA-Z0-9_-]/g, '_')
			expect(name).toBe(`clip_${safe.slice(-24)}_t107.mp4`)
		})

		it('filename 为空或无扩展名时，按 kind 生成兜底 basename 和扩展名', () => {
			const image = buildDesiredComfyMediaFilename({
				kind: 'image',
				now: 100,
				random2: '00'
			})
			const video = buildDesiredComfyMediaFilename({
				kind: 'video',
				now: 101,
				random2: '01'
			})
			const model = buildDesiredComfyMediaFilename({
				kind: 'model3d',
				now: 102,
				random2: '02'
			})
			expect(image).toBe('comfy_image_t10000.png')
			expect(video).toBe('comfy_video_t10101.mp4')
			expect(model).toBe('comfy_model3d_t10202.glb')
		})

		it('随机两位 random2 会被 padStart(2,0) 截断/填充成恰好 2 位', () => {
			const n1 = buildDesiredComfyMediaFilename({
				filename: 'a.MP4',
				kind: 'video',
				now: 5,
				random2: '9', // 短，会填 0
				origin: 'http://localhost'
			})
			const n2 = buildDesiredComfyMediaFilename({
				filename: 'a.MP4',
				kind: 'video',
				now: 5,
				random2: 'abcdef', // 长，会截前 2
				origin: 'http://localhost'
			})
			expect(n1).toBe('a_t509.mp4')
			expect(n2).toBe('a_t5ab.mp4')
			expect(n1.endsWith('.mp4')).toBe(true) // 扩展名被 toLowerCase
			expect(n2.endsWith('.mp4')).toBe(true)
		})

		it('保留原扩展名并统一小写（JPG→jpg，WEBM→webm）', () => {
			expect(
				buildDesiredComfyMediaFilename({
					filename: 'photo.JPG',
					kind: 'image',
					now: 1,
					random2: '00',
					origin: 'http://localhost'
				})
			).toBe('photo_t100.jpg')
			expect(
				buildDesiredComfyMediaFilename({
					filename: 'anim.WEBM',
					kind: 'video',
					now: 2,
					random2: '99',
					origin: 'http://localhost'
				})
			).toBe('anim_t299.webm')
		})
	})
})
