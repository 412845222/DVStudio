import { describe, it, expect } from 'vitest'
import {
	CHIP_MARKER,
	areParamsEqual,
	areSelectedRefsEqual,
	matchSelectedRefsWithSerializedDraft,
	normalizeChatStateForStore,
	normalizeRefsForStorage,
	simplifySelectedRefsForSubmit,
	stableParamsKey
} from '../../../../src/ui/BluePrint/node-dialog/chatStateUtils'

describe('chatStateUtils - CHIP_MARKER 常量一致性', () => {
	it('CHIP_MARKER 应为 U+0001 SOH（全局唯一 marker）', () => {
		expect(CHIP_MARKER).toBe('\u0001')
		expect(CHIP_MARKER.length).toBe(1)
	})
})

describe('chatStateUtils - normalizeRefsForStorage', () => {
	it('空/null/undefined 输入输出空数组', () => {
		expect(normalizeRefsForStorage(null)).toEqual([])
		expect(normalizeRefsForStorage(undefined)).toEqual([])
		expect(normalizeRefsForStorage([])).toEqual([])
	})

	it('剔除冗余字段 id / name / type / fromContent / id 并稳定键顺序', () => {
		const refs = [
			{
				id: 'some-ui-id',
				type: 'image',
				name: '节点X',
				fromContent: '冗余内容',
				kind: 'image',
				edgeId: 'edge_abc',
				fromNodeId: 'n1',
				fromAnchorId: 'a_img_out',
				label: '参考图X',
				previewUrl: 'https://example.com/a.png'
			}
		]
		const out = normalizeRefsForStorage(refs)
		expect(out).toHaveLength(1)
		const o = out[0]
		// 必须包含 refKey
		expect(o.refKey).toBe('edge_abc')
		// 必须带最小字段
		expect(o.kind).toBe('image')
		expect(o.edgeId).toBe('edge_abc')
		expect(o.fromNodeId).toBe('n1')
		expect(o.fromAnchorId).toBe('a_img_out')
		expect(o.label).toBe('参考图X')
		expect(o.previewUrl).toBe('https://example.com/a.png')
		// 冗余字段必须被剔除
		expect((o as any).id).toBeUndefined()
		expect((o as any).name).toBeUndefined()
		expect((o as any).type).toBeUndefined()
		expect((o as any).fromContent).toBeUndefined()
	})

	it('无 edgeId 时，refKey 回退到 fromNodeId:fromAnchorId', () => {
		const refs = [
			{ kind: 'video', fromNodeId: 'n2', fromAnchorId: 'a_vid_out', label: '视频', previewUrl: '' }
		]
		const out = normalizeRefsForStorage(refs)
		expect(out[0].refKey).toBe('n2:a_vid_out')
		expect(out[0].edgeId).toBeUndefined()
	})

	it('什么键都没有时走兜底 refKey（包含 idx / kind / label 避免空值）', () => {
		const refs = [
			{ kind: 'model3d', label: '' },
			{ kind: 'text', label: 'prompt' }
		]
		const out = normalizeRefsForStorage(refs)
		expect(out[0].refKey.startsWith('__fb_0_')).toBe(true)
		expect(out[1].refKey.startsWith('__fb_1_text_prompt')).toBe(true)
	})

	it('type 字段兼容为 kind（InputParamPreviewRef 用 type 表示类型）', () => {
		const refs = [{ type: 'image', edgeId: 'e1' }]
		const out = normalizeRefsForStorage(refs as any)
		expect(out[0].kind).toBe('image')
		expect(out[0].refKey).toBe('e1')
	})
})

describe('chatStateUtils - matchSelectedRefsWithSerializedDraft', () => {
	it('chipCount = 0 → 返回 normalized（纯文本模式无 chip）', () => {
		const refs = [
			{ kind: 'image', edgeId: 'e1', label: 'a', previewUrl: '' },
			{ kind: 'image', edgeId: 'e2', label: 'b', previewUrl: '' }
		]
		const r = matchSelectedRefsWithSerializedDraft('Hello world', refs)
		expect(r).toHaveLength(2)
	})

	it('chipCount = refs.length → 顺序原样返回，长度严格对齐', () => {
		const refs = [
			{ kind: 'image', edgeId: 'e1' },
			{ kind: 'video', edgeId: 'e2' }
		]
		const draft = `A${CHIP_MARKER}B${CHIP_MARKER}C`
		const r = matchSelectedRefsWithSerializedDraft(draft, refs)
		expect(r).toHaveLength(2)
		expect(r[0].refKey).toBe('e1')
		expect(r[1].refKey).toBe('e2')
	})

	it('chipCount < refs.length → 截断到 chipCount，不越界', () => {
		const refs = [
			{ kind: 'image', edgeId: 'e1' },
			{ kind: 'image', edgeId: 'e2' },
			{ kind: 'image', edgeId: 'e3' }
		]
		const draft = `A${CHIP_MARKER}B`
		const r = matchSelectedRefsWithSerializedDraft(draft, refs)
		expect(r).toHaveLength(1)
		expect(r[0].refKey).toBe('e1')
	})

	it('chipCount > refs.length → 缺失位置补「引用丢失」占位，长度严格对齐', () => {
		const refs = [{ kind: 'image', edgeId: 'e1' }]
		const draft = `A${CHIP_MARKER}B${CHIP_MARKER}C`
		const r = matchSelectedRefsWithSerializedDraft(draft, refs)
		expect(r).toHaveLength(2)
		expect(r[0].refKey).toBe('e1')
		expect(r[1].label).toBe('引用丢失')
		expect(r[1].refKey.startsWith('__missing_')).toBe(true)
	})

	it('输出的每一项都是 StoredNodeChatRef 结构，保证二次渲染不会丢失 refKey', () => {
		const refs = [{ type: 'model3d', fromNodeId: 'n1', fromAnchorId: 'a_out' }]
		const draft = `${CHIP_MARKER}`
		const r = matchSelectedRefsWithSerializedDraft(draft, refs)
		expect(r).toHaveLength(1)
		expect(typeof r[0].refKey === 'string' && r[0].refKey.length > 0).toBe(true)
	})
})

describe('chatStateUtils - simplifySelectedRefsForSubmit', () => {
	it('基本替换：按 kind 独立编号，marker 位置替换为（参考图N）/（参考视频N）', () => {
		const refs = [
			{ kind: 'image', edgeId: 'e1' },
			{ kind: 'video', edgeId: 'e2' },
			{ kind: 'image', edgeId: 'e3' }
		]
		const draft = `请把${CHIP_MARKER}的风格应用到${CHIP_MARKER}，结合${CHIP_MARKER}的构图`
		const r = simplifySelectedRefsForSubmit(draft, refs)
		expect(r.prompt).toBe('请把（参考图1）的风格应用到（参考视频1），结合（参考图2）的构图')
		expect(r.selectedReferences).toHaveLength(3)
	})

	it('refs 比 CHIP_MARKER 多：超出部分顺序追加到 prompt 末尾，不静默丢失', () => {
		const refs = [
			{ kind: 'image', edgeId: 'e1' },
			{ kind: 'image', edgeId: 'e2' },
			{ kind: 'model3d', edgeId: 'e3' }
		]
		const draft = `基于${CHIP_MARKER}，参考${CHIP_MARKER}`
		const r = simplifySelectedRefsForSubmit(draft, refs)
		// 前 2 个替换 chip 位置，第 3 个 model3d 追加到末尾
		expect(r.prompt.endsWith('（参考模型1）')).toBe(true)
		expect(r.selectedReferences).toHaveLength(3)
	})

	it('空输入：空 refs 返回空 prompt 和空数组', () => {
		const r = simplifySelectedRefsForSubmit('', [])
		expect(r.prompt).toBe('')
		expect(r.selectedReferences).toEqual([])
	})

	it('输出 selectedReferences 为最小化结构：无 id/name/type/fromContent', () => {
		const refs = [
			{
				id: 'x',
				type: 'text',
				name: '冗余name',
				fromContent: 'xx',
				kind: 'text',
				edgeId: 'e5',
				label: 'prompt',
				previewUrl: ''
			}
		]
		const draft = `${CHIP_MARKER}`
		const r = simplifySelectedRefsForSubmit(draft, refs)
		const first = r.selectedReferences[0] as any
		expect(first.id).toBeUndefined()
		expect(first.name).toBeUndefined()
		expect(first.fromContent).toBeUndefined()
		expect(first.kind).toBe('text')
		expect(first.edgeId).toBe('e5')
		expect(first.label).toBe('prompt')
	})

	it('模型类 kind 归一化为「参考模型」：model3d/blender/tripo3d/meshy', () => {
		const refs = [
			{ kind: 'model3d', edgeId: 'a' },
			{ kind: 'blender', edgeId: 'b' },
			{ kind: 'tripo3d', edgeId: 'c' },
			{ kind: 'meshy', edgeId: 'd' }
		]
		const draft = `${CHIP_MARKER} ${CHIP_MARKER} ${CHIP_MARKER} ${CHIP_MARKER}`
		const r = simplifySelectedRefsForSubmit(draft, refs)
		expect(r.prompt).toBe('（参考模型1） （参考模型2） （参考模型3） （参考模型4）')
	})
})

describe('chatStateUtils - areSelectedRefsEqual', () => {
	it('字段顺序 / 冗余字段不影响比较：内容相等返回 true', () => {
		const a = [
			{
				id: 'x1',
				kind: 'image',
				edgeId: 'e1',
				label: 'a',
				previewUrl: 'p1',
				fromNodeId: 'n1',
				fromAnchorId: 'a_out'
			}
		]
		const b = [
			{
				fromAnchorId: 'a_out',
				fromNodeId: 'n1',
				previewUrl: 'p1',
				label: 'a',
				edgeId: 'e1',
				type: 'image',
				name: 'a'
			}
		]
		expect(areSelectedRefsEqual(a as any, b as any)).toBe(true)
	})

	it('长度不同返回 false', () => {
		expect(areSelectedRefsEqual([{ kind: 'image' }], [])).toBe(false)
	})

	it('预览 URL 不同返回 false', () => {
		expect(
			areSelectedRefsEqual(
				[{ kind: 'image', edgeId: 'e1', previewUrl: 'a.png' }],
				[{ kind: 'image', edgeId: 'e1', previewUrl: 'b.png' }]
			)
		).toBe(false)
	})
})

describe('chatStateUtils - areParamsEqual / stableParamsKey', () => {
	it('键顺序不影响 areParamsEqual：深层比较', () => {
		const a = { steps: 20, sampler: 'euler', cfg: 7.0 }
		const b = { cfg: 7.0, steps: 20, sampler: 'euler' }
		expect(areParamsEqual(a, b)).toBe(true)
		expect(stableParamsKey(a)).toBe(stableParamsKey(b))
	})

	it('嵌套对象键顺序不影响', () => {
		const a = { outer: { b: 1, a: 2 }, list: [3, 2, 1] }
		const b = { outer: { a: 2, b: 1 }, list: [3, 2, 1] }
		expect(areParamsEqual(a, b)).toBe(true)
	})

	it('内容不同返回 false', () => {
		expect(areParamsEqual({ x: 1 }, { x: 2 })).toBe(false)
		expect(stableParamsKey({ x: 1 })).not.toBe(stableParamsKey({ x: 2 }))
	})
})

describe('chatStateUtils - normalizeChatStateForStore + isChatStateSnapshotEqual', () => {
	it('输出字段稳定：selectedRefs 带排序 + 兼容字段 name/type/id', () => {
		const snap = {
			nodeId: 'node_1',
			visible: true,
			draft: 'hello',
			params: { b: 2, a: 1 },
			selectedRefs: [
				{ kind: 'image', edgeId: 'e2', label: 'second' },
				{ kind: 'image', edgeId: 'e1', label: 'first' }
			]
		}
		const out = normalizeChatStateForStore(snap)
		// params 键应该按排序
		expect(JSON.stringify(out.params)).toBe(JSON.stringify({ a: 1, b: 2 }))
		// selectedRefs 带兼容 name 和 type 字段，避免 Vuex/引擎 回读差异
		expect(out.selectedRefs[0]).toHaveProperty('name')
		expect(out.selectedRefs[0]).toHaveProperty('type')
		expect(out.selectedRefs[0]).toHaveProperty('id')
		expect(out.selectedRefs[0].type).toBe('image')
	})
})
