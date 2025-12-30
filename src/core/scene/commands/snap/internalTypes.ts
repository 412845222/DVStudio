export type SnapTarget = { cx: number; cy: number; w: number; h: number }

export type SnapModeX = 'l' | 'c' | 'r'
export type SnapModeY = 't' | 'c' | 'b'
export type SnapMode = SnapModeX | SnapModeY

export type SnapCandidateX = { mode: SnapModeX; v: number }
export type SnapCandidateY = { mode: SnapModeY; v: number }
export type SnapCandidate = SnapCandidateX | SnapCandidateY
