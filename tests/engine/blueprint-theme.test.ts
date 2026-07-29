import { describe, it, expect } from 'vitest'
import { darkThemeTokens, lightThemeTokens, getThemeTokens } from '@/engine/blueprint/theme/tokens'
import type { BlueprintThemeTokens } from '@/engine/blueprint/theme/types'

function validateTokenStructure(tokens: BlueprintThemeTokens, mode: string) {
	const requiredKeys = [
		'canvasBackground',
		'gridLine',
		'gridMajorLine',
		'nodeBackground',
		'nodeHeaderBackground',
		'nodeBorder',
		'nodeBorderHovered',
		'nodeBorderSelected',
		'nodeText',
		'nodeTextMuted',
		'statusIdle',
		'statusHovered',
		'statusSelected',
		'statusRunning',
		'statusSuccess',
		'statusError',
		'connectionLine',
		'connectionLineSelected',
		'connectionLineHover',
		'portBackground',
		'portBorder',
		'portInner',
		'selectionFrame',
		'selectionFrameFill'
	] as const

	const statusKeys = ['border', 'bracket', 'glow', 'badge'] as const

	for (const key of requiredKeys) {
		it(`${mode} theme has ${key} token`, () => {
			expect(tokens[key as keyof BlueprintThemeTokens]).toBeDefined()
		})
	}

	for (const status of ['statusIdle', 'statusHovered', 'statusSelected', 'statusRunning', 'statusSuccess', 'statusError']) {
		for (const key of statusKeys) {
			it(`${mode} theme ${status} has ${key}`, () => {
				const statusColors = tokens[status as keyof BlueprintThemeTokens] as Record<string, string>
				expect(statusColors[key]).toBeDefined()
				expect(typeof statusColors[key]).toBe('string')
				expect(statusColors[key].length).toBeGreaterThan(0)
			})
		}
	}
}

describe('Blueprint Theme Tokens', () => {
	describe('dark theme tokens', () => {
		validateTokenStructure(darkThemeTokens, 'dark')

		it('returns dark theme when mode is dark', () => {
			expect(getThemeTokens('dark')).toBe(darkThemeTokens)
		})

		it('has dark canvas background', () => {
			expect(darkThemeTokens.canvasBackground).toBe('#15181c')
		})

		it('has dark text color (light text for dark background)', () => {
			expect(darkThemeTokens.nodeText).toBe('#edf2f4')
		})
	})

	describe('light theme tokens', () => {
		validateTokenStructure(lightThemeTokens, 'light')

		it('returns light theme when mode is light', () => {
			expect(getThemeTokens('light')).toBe(lightThemeTokens)
		})

		it('has light canvas background', () => {
			expect(lightThemeTokens.canvasBackground).toBe('#f5f7f8')
		})

		it('has dark text color (dark text for light background)', () => {
			expect(lightThemeTokens.nodeText).toBe('#2d3748')
		})
	})

	describe('theme differences', () => {
		it('dark and light themes have different canvas backgrounds', () => {
			expect(darkThemeTokens.canvasBackground).not.toBe(lightThemeTokens.canvasBackground)
		})

		it('dark and light themes have different node backgrounds', () => {
			expect(darkThemeTokens.nodeBackground).not.toBe(lightThemeTokens.nodeBackground)
		})

		it('dark and light themes have different text colors', () => {
			expect(darkThemeTokens.nodeText).not.toBe(lightThemeTokens.nodeText)
		})

		it('dark and light themes have different text muted colors', () => {
			expect(darkThemeTokens.nodeTextMuted).not.toBe(lightThemeTokens.nodeTextMuted)
		})
	})
})
