export type Vec2 = { x: number; y: number }

export const vec2 = (x = 0, y = 0): Vec2 => ({ x, y })

export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

export const nearlyEqual = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps
