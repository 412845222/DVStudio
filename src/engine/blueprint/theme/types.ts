import type { ThemeMode } from '../../../store/theme/store'

export type { ThemeMode }

export interface NodeStatusColors {
	border: string
	bracket: string
	glow: string
	badge: string
}

export interface BlueprintThemeTokens {
	canvasBackground: string
	gridLine: string
	gridMajorLine: string
	nodeBackground: string
	nodeHeaderBackground: string
	nodeBorder: string
	nodeBorderHovered: string
	nodeBorderSelected: string
	nodeText: string
	nodeTextMuted: string
	statusIdle: NodeStatusColors
	statusHovered: NodeStatusColors
	statusSelected: NodeStatusColors
	statusRunning: NodeStatusColors
	statusSuccess: NodeStatusColors
	statusError: NodeStatusColors
	connectionLine: string
	connectionLineSelected: string
	connectionLineHover: string
	portBackground: string
	portBorder: string
	portInner: string
	selectionFrame: string
	selectionFrameFill: string
}

export type ThemeTokenName = keyof BlueprintThemeTokens
