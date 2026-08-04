import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
	useSquareParticles,
	buildSquareParticles
} from '../../../src/composables/useSquareParticles'

describe('useSquareParticles', () => {
	beforeEach(() => {
		vi.stubGlobal('window', {
			matchMedia: vi.fn().mockReturnValue({ matches: false })
		})
	})

	afterEach(() => {
		vi.unstubAllGlobals()
	})

	describe('basic generation', () => {
		it('returns the requested number of particles by default', () => {
			const { particles } = useSquareParticles({ count: 6 })
			expect(particles).toHaveLength(6)
		})

		it('generates unique ids for each particle', () => {
			const { particles } = useSquareParticles({ count: 8 })
			const ids = new Set(particles.map((p) => p.id))
			expect(ids.size).toBe(8)
		})

		it('each particle has required style properties', () => {
			const { particles } = useSquareParticles({ count: 3 })
			for (const p of particles) {
				expect(p.style).toBeDefined()
				expect(p.style.width).toMatch(/^\d+px$/)
				expect(p.style.height).toMatch(/^\d+px$/)
				expect(p.style.left).toMatch(/^[\d.]+%$/)
				expect(p.style.top).toMatch(/^[\d.]+%$/)
				expect(p.style['--sq-color']).toBeDefined()
				expect(p.style['--sq-opacity']).toBeDefined()
				expect(p.style['--sq-duration']).toMatch(/^[\d.]+s$/)
				expect(p.style['--sq-delay']).toMatch(/^[\d.]+s$/)
				expect(p.style['--sq-rotate']).toMatch(/^-?\d+deg$/)
				expect(p.style['--sq-sway']).toMatch(/^-?\d+px$/)
			}
		})
	})

	describe('size bounds', () => {
		it('respects minSize and maxSize', () => {
			const { particles } = useSquareParticles({ count: 20, minSize: 5, maxSize: 10, seed: 42 })
			for (const p of particles) {
				const size = parseInt(p.style.width, 10)
				expect(size).toBeGreaterThanOrEqual(5)
				expect(size).toBeLessThanOrEqual(10)
				expect(p.style.height).toBe(p.style.width)
			}
		})
	})

	describe('position bounds', () => {
		it('top position is between 20% and 90%', () => {
			const { particles } = useSquareParticles({ count: 30, seed: 123 })
			for (const p of particles) {
				const top = parseFloat(p.style.top)
				expect(top).toBeGreaterThanOrEqual(20)
				expect(top).toBeLessThanOrEqual(90)
			}
		})

		it('left position is between 0% and 100%', () => {
			const { particles } = useSquareParticles({ count: 30, seed: 456 })
			for (const p of particles) {
				const left = parseFloat(p.style.left)
				expect(left).toBeGreaterThanOrEqual(0)
				expect(left).toBeLessThanOrEqual(100)
			}
		})
	})

	describe('duration bounds', () => {
		it('respects minDuration and maxDuration', () => {
			const { particles } = useSquareParticles({
				count: 20,
				minDuration: 4,
				maxDuration: 8,
				seed: 789
			})
			for (const p of particles) {
				const dur = parseFloat(p.style['--sq-duration'])
				expect(dur).toBeGreaterThanOrEqual(4)
				expect(dur).toBeLessThanOrEqual(8)
			}
		})
	})

	describe('rotation bounds', () => {
		it('rotation is between -90deg and 90deg', () => {
			const { particles } = useSquareParticles({ count: 30, seed: 101 })
			for (const p of particles) {
				const rot = parseInt(p.style['--sq-rotate'], 10)
				expect(rot).toBeGreaterThanOrEqual(-90)
				expect(rot).toBeLessThanOrEqual(90)
			}
		})
	})

	describe('sway bounds', () => {
		it('sway is between -18px and 18px', () => {
			const { particles } = useSquareParticles({ count: 30, seed: 202 })
			for (const p of particles) {
				const sway = parseInt(p.style['--sq-sway'], 10)
				expect(sway).toBeGreaterThanOrEqual(-18)
				expect(sway).toBeLessThanOrEqual(18)
			}
		})
	})

	describe('opacity bounds', () => {
		it('opacity is within expected range based on baseOpacity', () => {
			const { particles } = useSquareParticles({ count: 20, baseOpacity: 0.5, seed: 303 })
			for (const p of particles) {
				const op = parseFloat(p.style['--sq-opacity'])
				expect(op).toBeGreaterThanOrEqual(0.3)
				expect(op).toBeLessThanOrEqual(0.9)
			}
		})
	})

	describe('color palette', () => {
		it('uses custom palette colors', () => {
			const customPalette = ['#ff0000', '#00ff00', '#0000ff']
			const { particles } = useSquareParticles({ count: 6, palette: customPalette, seed: 404 })
			for (const p of particles) {
				expect(customPalette).toContain(p.style['--sq-color'])
			}
		})

		it('cycles through palette for multiple particles', () => {
			const customPalette = ['#ff0000', '#00ff00']
			const { particles } = useSquareParticles({ count: 4, palette: customPalette, seed: 505 })
			expect(particles[0].style['--sq-color']).toBe('#ff0000')
			expect(particles[1].style['--sq-color']).toBe('#00ff00')
			expect(particles[2].style['--sq-color']).toBe('#ff0000')
			expect(particles[3].style['--sq-color']).toBe('#00ff00')
		})
	})

	describe('reduced motion', () => {
		it('reduces particle count when reducedMotion is true', () => {
			const { particles } = useSquareParticles({ count: 10, reducedMotion: true })
			expect(particles.length).toBe(5)
		})

		it('keeps at least 2 particles even with reduced motion', () => {
			const { particles } = useSquareParticles({ count: 3, reducedMotion: true })
			expect(particles.length).toBe(2)
		})
	})

	describe('seeded randomness', () => {
		it('produces identical particles with same seed', () => {
			const r1 = useSquareParticles({ count: 5, seed: 12345 })
			const r2 = useSquareParticles({ count: 5, seed: 12345 })
			for (let i = 0; i < 5; i++) {
				expect(r1.particles[i].style).toEqual(r2.particles[i].style)
			}
		})

		it('produces different particles with different seeds', () => {
			const r1 = useSquareParticles({ count: 5, seed: 111 })
			const r2 = useSquareParticles({ count: 5, seed: 222 })
			let allSame = true
			for (let i = 0; i < 5; i++) {
				if (JSON.stringify(r1.particles[i].style) !== JSON.stringify(r2.particles[i].style)) {
					allSame = false
					break
				}
			}
			expect(allSame).toBe(false)
		})
	})

	describe('buildHoverStateClass', () => {
		it('returns empty array by default', () => {
			const { buildHoverStateClass } = useSquareParticles()
			expect(buildHoverStateClass(false)).toEqual([])
		})

		it('returns sq-hovered when hovered is true', () => {
			const { buildHoverStateClass } = useSquareParticles()
			expect(buildHoverStateClass(true)).toEqual(['sq-hovered'])
		})

		it('returns sq-running when running is true (overrides hover)', () => {
			const { buildHoverStateClass } = useSquareParticles()
			expect(buildHoverStateClass(true, { running: true })).toEqual(['sq-running'])
		})

		it('returns sq-error when error is true (overrides hover)', () => {
			const { buildHoverStateClass } = useSquareParticles()
			expect(buildHoverStateClass(true, { error: true })).toEqual(['sq-error'])
		})

		it('returns sq-running when both running and error are true (running takes priority)', () => {
			const { buildHoverStateClass } = useSquareParticles()
			expect(buildHoverStateClass(true, { running: true, error: true })).toEqual(['sq-running'])
		})
	})
})

describe('buildSquareParticles', () => {
	it('returns just the particles array (static version)', () => {
		const particles = buildSquareParticles({ count: 4, seed: 999 })
		expect(Array.isArray(particles)).toBe(true)
		expect(particles).toHaveLength(4)
		expect(particles[0]).toHaveProperty('id')
		expect(particles[0]).toHaveProperty('style')
	})
})
