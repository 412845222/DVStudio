import type { BlueprintThemeTokens, ThemeMode } from './types'

export const darkThemeTokens: BlueprintThemeTokens = {
	canvasBackground: '#15181c',
	gridLine: 'rgba(237, 242, 244, 0.12)',
	gridMajorLine: 'rgba(237, 242, 244, 0.20)',
	nodeBackground: 'rgba(21, 24, 28, 0.85)',
	nodeHeaderBackground: 'rgba(31, 157, 132, 0.15)',
	nodeBorder: 'rgba(31, 157, 132, 0.45)',
	nodeBorderHovered: 'rgba(31, 157, 132, 0.55)',
	nodeBorderSelected: 'rgba(31, 157, 132, 0.75)',
	nodeText: '#edf2f4',
	nodeTextMuted: '#aeb8bd',
	statusIdle: {
		border: 'rgba(31, 157, 132, 0.45)',
		bracket: 'rgba(31, 157, 132, 0.55)',
		glow: 'rgba(31, 157, 132, 0.10)',
		badge: 'rgba(31, 157, 132, 0.25)'
	},
	statusHovered: {
		border: 'rgba(31, 157, 132, 0.55)',
		bracket: 'rgba(31, 157, 132, 0.85)',
		glow: 'rgba(31, 157, 132, 0.22)',
		badge: 'rgba(31, 157, 132, 0.35)'
	},
	statusSelected: {
		border: 'rgba(31, 157, 132, 0.75)',
		bracket: '#1f9d84',
		glow: 'rgba(31, 157, 132, 0.30)',
		badge: 'rgba(31, 157, 132, 0.45)'
	},
	statusRunning: {
		border: 'rgba(229, 181, 103, 0.70)',
		bracket: 'rgba(229, 181, 103, 0.80)',
		glow: 'rgba(229, 181, 103, 0.35)',
		badge: 'rgba(229, 181, 103, 0.45)'
	},
	statusSuccess: {
		border: 'rgba(46, 164, 79, 0.70)',
		bracket: 'rgba(46, 164, 79, 0.80)',
		glow: 'rgba(46, 164, 79, 0.30)',
		badge: 'rgba(46, 164, 79, 0.45)'
	},
	statusError: {
		border: 'rgba(207, 90, 70, 0.75)',
		bracket: 'rgba(207, 90, 70, 0.80)',
		glow: 'rgba(207, 90, 70, 0.35)',
		badge: 'rgba(207, 90, 70, 0.45)'
	},
	connectionLine: 'rgba(31, 157, 132, 0.6)',
	connectionLineSelected: 'rgba(31, 157, 132, 1)',
	connectionLineHover: 'rgba(31, 157, 132, 0.8)',
	portBackground: 'rgba(21, 24, 28, 0.9)',
	portBorder: 'rgba(31, 157, 132, 0.6)',
	portInner: '#1f9d84',
	selectionFrame: 'rgba(31, 157, 132, 0.85)',
	selectionFrameFill: 'rgba(31, 157, 132, 0)'
}

export const lightThemeTokens: BlueprintThemeTokens = {
	canvasBackground: '#f5f7f8',
	gridLine: 'rgba(30, 40, 50, 0.08)',
	gridMajorLine: 'rgba(30, 40, 50, 0.15)',
	nodeBackground: 'rgba(255, 255, 255, 0.95)',
	nodeHeaderBackground: 'rgba(31, 157, 132, 0.12)',
	nodeBorder: 'rgba(31, 157, 132, 0.5)',
	nodeBorderHovered: 'rgba(31, 157, 132, 0.7)',
	nodeBorderSelected: 'rgba(31, 157, 132, 0.9)',
	nodeText: '#2d3748',
	nodeTextMuted: '#718096',
	statusIdle: {
		border: 'rgba(31, 157, 132, 0.5)',
		bracket: 'rgba(31, 157, 132, 0.6)',
		glow: 'rgba(31, 157, 132, 0.08)',
		badge: 'rgba(31, 157, 132, 0.2)'
	},
	statusHovered: {
		border: 'rgba(31, 157, 132, 0.65)',
		bracket: 'rgba(31, 157, 132, 0.9)',
		glow: 'rgba(31, 157, 132, 0.18)',
		badge: 'rgba(31, 157, 132, 0.3)'
	},
	statusSelected: {
		border: 'rgba(31, 157, 132, 0.9)',
		bracket: '#1f9d84',
		glow: 'rgba(31, 157, 132, 0.25)',
		badge: 'rgba(31, 157, 132, 0.4)'
	},
	statusRunning: {
		border: 'rgba(218, 150, 54, 0.8)',
		bracket: 'rgba(218, 150, 54, 0.9)',
		glow: 'rgba(218, 150, 54, 0.25)',
		badge: 'rgba(218, 150, 54, 0.4)'
	},
	statusSuccess: {
		border: 'rgba(39, 174, 96, 0.8)',
		bracket: 'rgba(39, 174, 96, 0.9)',
		glow: 'rgba(39, 174, 96, 0.2)',
		badge: 'rgba(39, 174, 96, 0.35)'
	},
	statusError: {
		border: 'rgba(207, 90, 70, 0.85)',
		bracket: 'rgba(207, 90, 70, 0.9)',
		glow: 'rgba(207, 90, 70, 0.25)',
		badge: 'rgba(207, 90, 70, 0.4)'
	},
	connectionLine: 'rgba(31, 157, 132, 0.7)',
	connectionLineSelected: 'rgba(31, 157, 132, 1)',
	connectionLineHover: 'rgba(31, 157, 132, 0.9)',
	portBackground: 'rgba(255, 255, 255, 0.95)',
	portBorder: 'rgba(31, 157, 132, 0.7)',
	portInner: '#1f9d84',
	selectionFrame: 'rgba(31, 157, 132, 0.9)',
	selectionFrameFill: 'rgba(31, 157, 132, 0)'
}

export function getThemeTokens(mode: ThemeMode): BlueprintThemeTokens {
	return mode === 'light' ? lightThemeTokens : darkThemeTokens
}
