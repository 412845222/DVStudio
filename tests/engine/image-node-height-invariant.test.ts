import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const PROJECT_ROOT = join(__dirname, '..', '..')

function readSource(relativePath: string): string {
	const fullPath = join(PROJECT_ROOT, relativePath)
	expect(existsSync(fullPath), `Source file should exist: ${relativePath}`).toBe(true)
	return readFileSync(fullPath, 'utf-8')
}

describe('🟢 Image Node Height Invariant (no infinite growth bug)', () => {
	/**
	 * Bug history: When image/rotate-image nodes entered sizeCustomized mode (user manually
	 * resized the node), a ResizeObserver → autoResize feedback loop caused the node height
	 * to grow infinitely.
	 *
	 * The fix uses a layered architecture:
	 * 1. Resolver layer: passes `autoHeight: !data.sizeCustomized` to the base,
	 *    so that size-customized nodes have auto-resize disabled at the prop level.
	 * 2. Base layer: `requestAutoResize()` early-returns when `autoHeight === false`;
	 *    ResizeObserver is not set up (or is torn down) in fixed-size mode.
	 * 3. CSS layer: when not in auto-height mode, `.wf-node-body`, `.wf-media`, `.wf-media-preview`,
	 *    and `.wf-rotate-wrap` use flex layout with `flex:1; min-height:0` to fill available space
	 *    instead of relying on JS-calculated heights.
	 */

	describe('NodeComponentResolver.ts', () => {
		const filePath = 'src/engine/blueprint/dom/NodeComponentResolver.ts'
		let content: string

		it('file exists and is readable', () => {
			content = readSource(filePath)
			expect(content).toBeTruthy()
			expect(content.length).toBeGreaterThan(500)
		})

		it('passes autoHeight=!sizeCustomized to baseProps, linking size lock to auto-height disable', () => {
			content = content ?? readSource(filePath)
			// The resolver must set autoHeight to the negation of sizeCustomized
			const hasAutoHeightBinding =
				/autoHeight\s*:\s*!data\.sizeCustomized/.test(content) ||
				/autoHeight\s*:\s*!\s*data\.sizeCustomized/.test(content)
			expect(
				hasAutoHeightBinding,
				'Resolver must set baseProps.autoHeight = !data.sizeCustomized so that locked nodes disable auto-resize'
			).toBe(true)
		})

		it('also passes sizeCustomized to baseProps for CSS class binding', () => {
			content = content ?? readSource(filePath)
			const hasSizeCustomizedBinding = /sizeCustomized\s*:\s*data\.sizeCustomized/.test(content)
			expect(
				hasSizeCustomizedBinding,
				'Resolver must pass sizeCustomized to baseProps for CSS class binding'
			).toBe(true)
		})
	})

	describe('WorkflowNodeBase.vue', () => {
		const filePath = 'src/ui/WorkFlow/WorkflowNodeBase.vue'
		let content: string

		it('requestAutoResize early-returns when autoHeight is false (breaks feedback loop)', () => {
			content = readSource(filePath)
			// Extract requestAutoResize function
			const fnMatch = content.match(
				/const\s+requestAutoResize\s*=\s*\(\s*\)\s*=>\s*\{([\s\S]*?)\n\s*\}/
			)
			expect(fnMatch, 'requestAutoResize function must exist').toBeTruthy()
			if (!fnMatch) return
			const body = fnMatch[1]
			// Must have the autoHeight === false guard
			const hasAutoHeightGuard = /props\.autoHeight\s*===\s*false\s*\)\s*return/.test(body)
			expect(
				hasAutoHeightGuard,
				'requestAutoResize must early-return when props.autoHeight === false to break the feedback loop'
			).toBe(true)
		})

		it('does NOT set up ResizeObserver on mount when autoHeight is false', () => {
			content = content ?? readSource(filePath)
			const onMountedMatch = content.match(/onMounted\s*\(\s*\(\s*\)\s*=>\s*\{([\s\S]*?)\n\}\)/)
			expect(onMountedMatch, 'onMounted must exist').toBeTruthy()
			if (!onMountedMatch) return
			const body = onMountedMatch[1]
			const hasAutoHeightGuard = /props\.autoHeight\s*===\s*false\s*\)\s*return/.test(body)
			expect(
				hasAutoHeightGuard,
				'onMounted must skip setupResizeObserver() when autoHeight is false to prevent observer creation in fixed-size mode'
			).toBe(true)
		})

		it('tears down ResizeObserver when sizeCustomized becomes true (watcher)', () => {
			content = content ?? readSource(filePath)
			// Find the watch on sizeCustomized
			const watchMatch = content.match(
				/watch\s*\(\s*\(\s*\)\s*=>\s*props\.sizeCustomized[\s\S]*?\(customized\)\s*=>\s*\{([\s\S]*?)\n\s*\}\s*\)/
			)
			expect(watchMatch, 'sizeCustomized watcher must exist').toBeTruthy()
			if (!watchMatch) return
			const body = watchMatch[1]
			// When customized is true, must teardown observer
			const hasTeardown = /customized\)\s*\{[\s\S]*?teardownResizeObserver\s*\(/.test(body)
			expect(
				hasTeardown,
				'When sizeCustomized becomes true, ResizeObserver must be torn down immediately'
			).toBe(true)
		})

		it('tears down ResizeObserver when autoHeight becomes false (watcher)', () => {
			content = content ?? readSource(filePath)
			const watchMatch = content.match(
				/watch\s*\(\s*\(\s*\)\s*=>\s*props\.autoHeight[\s\S]*?\(enabled\)\s*=>\s*\{([\s\S]*?)\n\s*\}\s*\)/
			)
			expect(watchMatch, 'autoHeight watcher must exist').toBeTruthy()
			if (!watchMatch) return
			const body = watchMatch[1]
			const hasTeardown = /enabled\s*===\s*false\s*\)\s*\{[\s\S]*?teardownResizeObserver\s*\(/.test(
				body
			)
			expect(
				hasTeardown,
				'When autoHeight becomes false, ResizeObserver must be torn down immediately'
			).toBe(true)
		})

		it('CSS: fixed-size image nodes have flex fill rules for body, media, and preview', () => {
			content = content ?? readSource(filePath)
			// Body: flex-direction column (selector may be grouped with comma, ending with { before the property)
			const hasBodyFlex =
				/\.wf-node:not\(\.is-auto-height\)\.wf-node-image\s+\.wf-node-body[\s\S]*?\{[\s\S]*?flex-direction:\s*column/.test(
					content
				)
			const hasMediaFlex =
				/\.wf-node:not\(\.is-auto-height\)\.wf-node-image\s+\.wf-media\s*\{[\s\S]*?flex:\s*1/.test(
					content
				)
			const hasPreviewFlex =
				/\.wf-node:not\(\.is-auto-height\)\.wf-node-image\s+\.wf-media-preview\s*\{[\s\S]*?flex:\s*1/.test(
					content
				)
			expect(
				hasBodyFlex,
				'CSS must set flex-direction:column on body for fixed-size image nodes'
			).toBe(true)
			expect(hasMediaFlex, 'CSS must set flex:1 on .wf-media for fixed-size image nodes').toBe(true)
			expect(
				hasPreviewFlex,
				'CSS must set flex:1 on .wf-media-preview for fixed-size image nodes to fill available space'
			).toBe(true)
		})

		it('CSS: fixed-size rotate nodes have flex fill rule for wrap', () => {
			content = content ?? readSource(filePath)
			const hasWrapFlex =
				/\.wf-node:not\(\.is-auto-height\)\.wf-node-rotate-image\s+\.wf-rotate-wrap\s*\{[\s\S]*?flex:\s*1/.test(
					content
				)
			expect(
				hasWrapFlex,
				'CSS must set flex:1 on .wf-rotate-wrap for fixed-size rotate-image nodes'
			).toBe(true)
		})
	})

	describe('WorkflowImageNode.vue', () => {
		const filePath = 'src/ui/WorkFlow/WorlFlowNodes/WorkflowImageNode.vue'
		let content: string

		it('file exists and is readable', () => {
			content = readSource(filePath)
			expect(content).toBeTruthy()
			expect(content.length).toBeGreaterThan(1000)
		})

		it('uses CSS aspect-ratio for preview sizing (auto-height mode), not JS height subtraction', () => {
			content = content ?? readSource(filePath)
			// The previewWrapStyle computed should return an aspectRatio CSS property
			const hasAspectRatio = /aspectRatio\s*:/.test(content)
			expect(
				hasAspectRatio,
				'previewWrapStyle should use CSS aspectRatio for auto-height preview sizing'
			).toBe(true)
		})

		it('does NOT compute mediaStyle/previewStyle with explicit pixel heights from props.height subtraction (deprecated approach)', () => {
			content = content ?? readSource(filePath)
			// The old approach computed explicit pixel heights; new approach uses CSS
			const hasPixelHeightCalc =
				/const\s+mediaH\s*=/.test(content) || /height:\s*`\$\{mediaH\}px`/.test(content)
			expect(
				hasPixelHeightCalc,
				'Should NOT use JS-calculated pixel heights for media (CSS aspect-ratio + flex fill handles this)'
			).toBe(false)
		})
	})

	describe('WorkflowRotateImageNode.vue', () => {
		const filePath = 'src/ui/WorkFlow/WorlFlowNodes/WorkflowRotateImageNode.vue'
		let content: string

		it('file exists and is readable', () => {
			content = readSource(filePath)
			expect(content).toBeTruthy()
			expect(content.length).toBeGreaterThan(1000)
		})

		it('does NOT have tryAutoResize calling itself (infinite recursion was fixed)', () => {
			content = content ?? readSource(filePath)
			// Find all functions named tryAutoResize and check they don't call themselves
			const fnMatches = [...content.matchAll(/const\s+tryAutoResize\s*=\s*[^=]*=>\s*\{/g)]
			if (fnMatches.length === 0) {
				// Function may not exist in this version (dev branch may have removed it)
				// That's fine - it means RotateImageNode doesn't do auto-resize
				return
			}
			// Check each occurrence for self-calls
			for (const match of fnMatches) {
				const startIdx = match.index! + match[0].length
				let braceCount = 1
				let i = startIdx
				while (i < content.length && braceCount > 0) {
					if (content[i] === '{') braceCount++
					if (content[i] === '}') braceCount--
					i++
				}
				const body = content.substring(startIdx, i - 1)
				const callsSelf = /\btryAutoResize\s*\(/.test(body)
				expect(callsSelf, 'tryAutoResize must NOT call itself (infinite recursion bug)').toBe(false)
			}
		})

		it('canvas uses width:100%;height:100% to fill its flex container', () => {
			content = content ?? readSource(filePath)
			const canvasStyle = /\.wf-rotate-canvas\s*\{([\s\S]*?)\}/.exec(content)
			expect(canvasStyle, '.wf-rotate-canvas CSS class must exist').toBeTruthy()
			if (!canvasStyle) return
			const rules = canvasStyle[1]
			expect(/width:\s*100%/.test(rules), 'canvas should have width:100%').toBe(true)
			expect(
				/height:\s*100%/.test(rules),
				'canvas should have height:100% to fill flex container'
			).toBe(true)
		})
	})
})
