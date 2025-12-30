export type HitTestResult = { layerId: string; nodeId: string }

export type MarqueeSelectionResolution =
	| { type: 'clear' }
	| { type: 'single'; nodeId: string; layerId?: string }
	| { type: 'multi'; nodeIds: string[] }
