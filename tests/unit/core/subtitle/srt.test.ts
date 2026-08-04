import { describe, it, expect } from 'vitest'
import { parseSrt, msToFrameRangeInclusive, type SrtCue } from '@/core/subtitle/srt'

describe('parseSrt', () => {
	it('parses valid SRT text', () => {
		const srt = `1
00:00:00,000 --> 00:00:02,500
Hello world

2
00:00:02,500 --> 00:00:05,000
Second subtitle
`
		const cues = parseSrt(srt)
		expect(cues).toHaveLength(2)
		expect(cues[0]).toEqual({
			startMs: 0,
			endMs: 2500,
			text: 'Hello world'
		})
		expect(cues[1]).toEqual({
			startMs: 2500,
			endMs: 5000,
			text: 'Second subtitle'
		})
	})

	it('handles empty text', () => {
		expect(parseSrt('')).toEqual([])
		expect(parseSrt('   ')).toEqual([])
		expect(parseSrt(null as any)).toEqual([])
	})

	it('handles various timestamp formats', () => {
		// Comma as decimal separator
		const srt1 = `1
00:00:01,500 --> 00:00:03,000
Test
`
		expect(parseSrt(srt1)[0].startMs).toBe(1500)

		// Dot as decimal separator
		const srt2 = `1
00:00:01.500 --> 00:00:03.000
Test
`
		expect(parseSrt(srt2)[0].startMs).toBe(1500)
	})

	it('rejects invalid timestamps', () => {
		// Invalid: minute > 59
		const invalid1 = `1
00:60:00,000 --> 00:00:02,000
Invalid
`
		expect(parseSrt(invalid1)).toEqual([])

		// Second > 59
		const invalid2 = `1
00:00:60,000 --> 00:00:02,000
Invalid
`
		expect(parseSrt(invalid2)).toEqual([])

		// End before start
		const invalid3 = `1
00:00:03,000 --> 00:00:01,000
Invalid
`
		expect(parseSrt(invalid3)).toEqual([])
	})

	it('handles multi-line subtitles', () => {
		const srt = `1
00:00:00,000 --> 00:00:03,000
Line 1
Line 2
Line 3
`
		const cues = parseSrt(srt)
		expect(cues).toHaveLength(1)
		expect(cues[0].text).toBe('Line 1\nLine 2\nLine 3')
	})

	it('handles BOM header', () => {
		const srt = '\uFEFF1\n00:00:00,000 --> 00:00:02,000\nTest\n'
		const cues = parseSrt(srt)
		expect(cues).toHaveLength(1)
		expect(cues[0].text).toBe('Test')
	})

	it('handles CRLF line endings', () => {
		const srt =
			'1\r\n00:00:00,000 --> 00:00:02,000\r\nTest\r\n\r\n2\r\n00:00:02,000 --> 00:00:04,000\r\nTest2\r\n'
		const cues = parseSrt(srt)
		expect(cues).toHaveLength(2)
	})

	it('handles CR-only line endings', () => {
		const srt =
			'1\r00:00:00,000 --> 00:00:02,000\rTest\r\r2\r00:00:02,000 --> 00:00:04,000\rTest2\r'
		const cues = parseSrt(srt)
		expect(cues).toHaveLength(2)
	})

	it('handles missing sequence numbers', () => {
		const srt = `00:00:00,000 --> 00:00:02,000
Test without number
`
		const cues = parseSrt(srt)
		expect(cues).toHaveLength(1)
		expect(cues[0].text).toBe('Test without number')
	})

	it('skips blocks without text', () => {
		const srt = `1
00:00:00,000 --> 00:00:02,000

2
00:00:02,000 --> 00:00:04,000
Has text
`
		const cues = parseSrt(srt)
		expect(cues).toHaveLength(1)
		expect(cues[0].text).toBe('Has text')
	})

	it('sorts cues by start time', () => {
		const srt = `1
00:00:02,000 --> 00:00:04,000
Second

2
00:00:00,000 --> 00:00:01,000
First
`
		const cues = parseSrt(srt)
		expect(cues[0].startMs).toBe(0)
		expect(cues[1].startMs).toBe(2000)
	})

	it('handles milliseconds with varying precision', () => {
		const srt1 = `1
00:00:01,1 --> 00:00:02,0
One digit
`
		expect(parseSrt(srt1)[0].startMs).toBe(1100)

		const srt2 = `1
00:00:01,12 --> 00:00:02,0
Two digits
`
		expect(parseSrt(srt2)[0].startMs).toBe(1120)

		const srt3 = `1
00:00:01,123 --> 00:00:02,0
Three digits
`
		expect(parseSrt(srt3)[0].startMs).toBe(1123)
	})
})

describe('msToFrameRangeInclusive', () => {
	it('converts milliseconds to frame range with 30fps', () => {
		const result = msToFrameRangeInclusive(0, 1000, 30)
		expect(result).toEqual({
			startFrame: 0,
			endFrame: 29,
			fps: 30
		})
	})

	it('handles 60fps', () => {
		const result = msToFrameRangeInclusive(0, 1000, 60)
		expect(result).toEqual({
			startFrame: 0,
			endFrame: 59,
			fps: 60
		})
	})

	it('caps fps at 240', () => {
		const result = msToFrameRangeInclusive(0, 1000, 300)
		expect(result.fps).toBe(240)
	})

	it('minimum fps is 1', () => {
		const result = msToFrameRangeInclusive(0, 1000, 0)
		expect(result.fps).toBe(1)
	})

	it('handles negative values', () => {
		const result = msToFrameRangeInclusive(-100, 1000, 30)
		expect(result.startFrame).toBe(0)
		expect(result.endFrame).toBe(29)
	})

	it('handles non-finite values', () => {
		const result1 = msToFrameRangeInclusive(Infinity, 1000, 30)
		expect(result1.startFrame).toBe(0)

		const result2 = msToFrameRangeInclusive(0, NaN, 30)
		expect(result2.endFrame).toBe(0)
	})

	it('endFrame is always >= startFrame', () => {
		const result = msToFrameRangeInclusive(500, 600, 30)
		expect(result.endFrame).toBeGreaterThanOrEqual(result.startFrame)
	})
})
