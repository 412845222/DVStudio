import { describe, it, expect } from 'vitest'
import { DEFAULT_NODE_SIZES, getDefaultNodeData } from '@/engine/blueprint/types'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const PROJECT_ROOT = join(__dirname, '..', '..')

/**
 * 回归守卫：视频节点"创建/导入后高度自动膨胀成细长矩形"问题。
 *
 * 根因链：
 * 1. WorkflowNodeWrapper 对所有节点默认开启内容 auto-height（sizeCustomized!==true），
 *    ResizeObserver → requestAutoResize → onNodeAutoResize → store height 变更 → 再触发测量；
 * 2. WorkflowVideoNode 预览区曾用 aspect-ratio / flex 拉伸 / 百分比 max-height 与节点高度互相反馈，
 *    测量值被逐步抬高，新建视频节点被统一撑成细长矩形；
 * 3. 导入元数据 autoSizeVideoNodeFromDims 无高度上限，竖屏视频直接产出 800px+ 细长节点。
 *
 * 修复（固定尺寸模式）：
 * - wrapper 对 video 强制 autoHeight=false，自动测高链路整体短路；
 * - 预览区填充式布局（flex:1 1 auto + min-height:0），视频以 object-fit:contain 按比例显示；
 * - 导入元数据仅做一次带高度夹取 [420,560] 的调整。
 * 同时提供 [WFSize] 前缀诊断日志（create/wrapper/autoResize/videoLoaded/videoMeta）。
 */

const WRAPPER_PATH = join(PROJECT_ROOT, 'src/engine/blueprint/dom/WorkflowNodeWrapper.vue')
const NODE_BASE_PATH = join(PROJECT_ROOT, 'src/ui/WorkFlow/WorkflowNodeBase.vue')
const VIDEO_NODE_PATH = join(PROJECT_ROOT, 'src/ui/WorkFlow/WorlFlowNodes/WorkflowVideoNode.vue')
const PAGE_PATH = join(PROJECT_ROOT, 'src/views/AIWorkflow/AIWorkflowPage.vue')

describe('🔵 Video node fixed-size mode (视频节点固定尺寸模式，杜绝创建后高度膨胀)', () => {
	describe('data layer: 默认尺寸与图片节点一致', () => {
		it('DEFAULT_NODE_SIZES.video must equal image default', () => {
			expect(DEFAULT_NODE_SIZES.video).toEqual(DEFAULT_NODE_SIZES.image)
		})

		it('getDefaultNodeData("video") must use default size and not set sizeCustomized', () => {
			const data = getDefaultNodeData('video', 'v-1', 0, 0)
			expect(data.width).toBe(DEFAULT_NODE_SIZES.video.width)
			expect(data.height).toBe(DEFAULT_NODE_SIZES.video.height)
			expect(data.sizeCustomized).toBeFalsy()
		})
	})

	describe('wrapper layer: 视频节点强制关闭 auto-height', () => {
		it('resolvedProps must derive isVideoNode from engine nodeType', () => {
			const content = readFileSync(WRAPPER_PATH, 'utf-8')
			expect(/const isVideoNode = \(props\.node as any\)\.nodeType === 'video'/.test(content)).toBe(
				true
			)
		})

		it('autoHeight must be false for video nodes even when sizeCustomized=false', () => {
			const content = readFileSync(WRAPPER_PATH, 'utf-8')
			expect(/autoHeight:\s*props\.sizeCustomized !== true && !isVideoNode/.test(content)).toBe(
				true
			)
		})
	})

	describe('base layer: auto-height 对 video 节点必须短路', () => {
		it('requestAutoResize guard must early-return for video nodes (skip log as marker)', () => {
			const content = readFileSync(NODE_BASE_PATH, 'utf-8')
			const start = content.indexOf('const requestAutoResize')
			const end = content.indexOf('const setupResizeObserver')
			expect(start, 'requestAutoResize function must exist').toBeGreaterThan(0)
			expect(end, 'setupResizeObserver function must exist').toBeGreaterThan(start)
			const body = content.slice(start, end)
			expect(body).toContain('props.autoHeight === false')
			expect(body).toContain("props.nodeType === 'video'")
			expect(body).toContain('skip(autoHeight=false)')
		})
	})

	describe('video node layer: 预览区与节点高度解耦（填充式布局）', () => {
		it('wf-media-preview must be fill-mode flex without height feedback sizing', () => {
			const content = readFileSync(VIDEO_NODE_PATH, 'utf-8')
			const start = content.indexOf('.wf-media-preview {')
			const end = content.indexOf('}', start)
			expect(start, '.wf-media-preview rule must exist').toBeGreaterThan(0)
			const block = content.slice(start, end)
			expect(block).toContain('flex: 1 1 auto')
			expect(block).toContain('min-height: 0')
			expect(block).not.toContain('max-height: 60%')
			expect(block).not.toContain('flex: 0 0 auto')
		})

		it('previewWrapStyle must not lock aspect-ratio (竖屏视频撑高通道已移除)', () => {
			const content = readFileSync(VIDEO_NODE_PATH, 'utf-8')
			expect(/return\s*\{\s*aspectRatio/.test(content)).toBe(false)
		})

		it('video/poster must render with object-fit: contain (任意比例按比例显示)', () => {
			const content = readFileSync(VIDEO_NODE_PATH, 'utf-8')
			expect(content).toContain('object-fit: contain')
		})
	})

	describe('page layer: 导入元数据自动调整必须带高度夹取', () => {
		it('autoSizeVideoNodeFromDims clamps height into [420, 560] (禁止细长矩形)', () => {
			const content = readFileSync(PAGE_PATH, 'utf-8')
			expect(
				/Math\.min\(560,\s*Math\.max\(420,\s*previewHeight \+ chromeHeight\)\)/.test(content)
			).toBe(true)
		})

		it('autoSizeVideoNodeFromDims must skip sizeCustomized nodes', () => {
			const content = readFileSync(PAGE_PATH, 'utf-8')
			const start = content.indexOf('const autoSizeVideoNodeFromDims')
			expect(start, 'autoSizeVideoNodeFromDims must exist').toBeGreaterThan(0)
			const body = content.slice(start, start + 900)
			expect(body).toContain('node.sizeCustomized')
		})
	})
})
