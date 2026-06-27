/**
 * useSquareParticles — DOM-based rectangular floating particles
 *
 * Replaces the Canvas-based useCardParticles.
 * Produces pure data ({ id, style object }[]) that templates render as <span> elements.
 * Keeps logic stateless and cheap: no rAF, no canvas, no lifecycle hooks inside composable.
 *
 * Usage in Vue components:
 *
 *   import { useSquareParticles } from "../composables/useSquareParticles"
 *   const { particles, buildHoverStateClass } = useSquareParticles({ count: 6 })
 *
 *   <template>
 *     <div class="sq-container">
 *       <span v-for="p in particles.value" :key="p.id"
 *             class="sq-particle"
 *             :class="buildHoverStateClass(isHovered, { running: isRunning, error: isError })"
 *             :style="p.style" />
 *     </div>
 *   </template>
 */

export type ParticleState = 'default' | 'hovered' | 'running' | 'error'

export interface SquareParticlesOptions {
	/** Number of particles. Default 6. */
	count?: number
	/** Color palette. Default uses project accent colors. */
	palette?: string[]
	/** Min/Max particle size in px. Default [3, 7]. */
	minSize?: number
	maxSize?: number
	/** Base animation duration range in seconds. Default [6, 12]. */
	minDuration?: number
	maxDuration?: number
	/** Whether reduced motion is detected (optional, auto-detected on client). */
	reducedMotion?: boolean
	/** Base opacity multiplier. Default 0.55 (dark) / 0.48 (light). */
	baseOpacity?: number
	/** Optional deterministic seed for stable renders (not strictly random). */
	seed?: number
}

export interface SquareParticle {
	id: number
	style: Record<string, string>
}

export interface SquareParticlesResult {
	particles: SquareParticle[]
	/**
	 * Build CSS class string for particle state transitions.
	 * Usage: :class="buildHoverStateClass(hovered, { running, error })"
	 */
	buildHoverStateClass: (
		hovered: boolean,
		other?: { running?: boolean; error?: boolean }
	) => string[]
}

// ---------- helpers ----------

// Tiny seeded PRNG so particles are stable across re-renders when a seed is provided.
function makeRng(seed: number) {
	let s = seed >>> 0
	return () => {
		s = (s * 1664525 + 1013904223) >>> 0
		return s / 0xffffffff
	}
}

function defaultPalette(): string[] {
	// Matches theme-tokens: --sqp-color-accent / glow / cold / warm
	return ['#1f9d84', '#27b99c', '#3aa8b4', '#e5b567']
}

function isReducedMotion(): boolean {
	if (typeof window === 'undefined' || !window.matchMedia) return false
	try {
		return window.matchMedia('(prefers-reduced-motion: reduce)').matches
	} catch (_e) {
		return false
	}
}

// ---------- public API ----------

export function useSquareParticles(options: SquareParticlesOptions = {}): SquareParticlesResult {
	const {
		count = 6,
		palette = defaultPalette(),
		minSize = 3,
		maxSize = 7,
		minDuration = 6,
		maxDuration = 12,
		reducedMotion = typeof window !== 'undefined' ? isReducedMotion() : false,
		baseOpacity = 0.55,
		seed
	} = options

	const rng = typeof seed === 'number' ? makeRng(seed) : Math.random

	const particles: SquareParticle[] = []
	const actualCount = reducedMotion ? Math.max(2, Math.floor(count / 2)) : count

	for (let i = 0; i < actualCount; i++) {
		const sizePx = Math.round(minSize + rng() * (maxSize - minSize))
		const leftPct = rng() * 100
		const topPct = 20 + rng() * 70 // start between 20% and 90% (go upwards)
		const delayS = +(rng() * 6).toFixed(2)
		const durS = +(minDuration + rng() * (maxDuration - minDuration)).toFixed(2)
		const rotateDeg = Math.round(rng() * 180 - 90) // -90..90
		const swayPx = Math.round(-18 + rng() * 36) // -18..18
		const color = palette[i % palette.length]
		const opacity = +(baseOpacity * (0.6 + rng() * 0.8)).toFixed(2)

		const style: Record<string, string> = {
			width: sizePx + 'px',
			height: sizePx + 'px',
			left: leftPct + '%',
			top: topPct + '%'
		}
		style['--sq-color'] = color
		style['--sq-opacity'] = String(opacity)
		style['--sq-duration'] = durS + 's'
		style['--sq-delay'] = delayS + 's'
		style['--sq-rotate'] = rotateDeg + 'deg'
		style['--sq-sway'] = swayPx + 'px'
		particles.push({
			id: i,
			style
		})
	}

	return {
		particles,
		buildHoverStateClass(hovered: boolean, other?: { running?: boolean; error?: boolean }) {
			const classes: string[] = []
			if (other?.running) classes.push('sq-running')
			else if (other?.error) classes.push('sq-error')
			else if (hovered) classes.push('sq-hovered')
			return classes
		}
	}
}

/**
 * Static version — useful when you don't need reactivity
 * (e.g. side-nav particles that are rendered once).
 */
export function buildSquareParticles(options: SquareParticlesOptions = {}): SquareParticle[] {
	return useSquareParticles(options).particles
}
