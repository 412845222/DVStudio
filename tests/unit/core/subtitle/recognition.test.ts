import { describe, it, expect } from 'vitest'
import {
	convertRecognitionCuesToSubtitleCues,
	formatSrtTimeFromSeconds,
	buildSubtitleExtractedAudioUrl,
	parseProjectIdFromVideoUrl
} from '@/core/subtitle/recognition'

describe('core/subtitle/recognition', () => {
	describe('convertRecognitionCuesToSubtitleCues', () => {
		it('converts seconds-based cues to milliseconds', () => {
			const input = [
				{ startTime: 0, endTime: 2.5, text: 'Hello' },
				{ startTime: 3.0, endTime: 5.123, text: 'World' }
			]
			const result = convertRecognitionCuesToSubtitleCues(input)
			expect(result).toHaveLength(2)
			expect(result[0]).toEqual({ startMs: 0, endMs: 2500, text: 'Hello' })
			expect(result[1]).toEqual({ startMs: 3000, endMs: 5123, text: 'World' })
		})

		it('returns empty array for empty/invalid input', () => {
			expect(convertRecognitionCuesToSubtitleCues([])).toEqual([])
			expect(convertRecognitionCuesToSubtitleCues(null as any)).toEqual([])
			expect(convertRecognitionCuesToSubtitleCues(undefined as any)).toEqual([])
		})

		it('clamps negative startTime to 0', () => {
			const input = [{ startTime: -1.5, endTime: 1, text: 'Test' }]
			const result = convertRecognitionCuesToSubtitleCues(input)
			expect(result[0].startMs).toBe(0)
			expect(result[0].endMs).toBe(1000)
		})

		it('ensures endMs > startMs by clamping to startMs+1 if needed', () => {
			const input = [{ startTime: 1, endTime: 0.5, text: 'Out of order' }]
			const result = convertRecognitionCuesToSubtitleCues(input)
			expect(result[0].endMs).toBeGreaterThan(result[0].startMs)
		})

		it('handles missing or invalid time values gracefully', () => {
			const input = [
				{ startTime: null, endTime: undefined, text: 'No times' },
				{ startTime: NaN, endTime: Infinity, text: 'Bad times' }
			]
			const result = convertRecognitionCuesToSubtitleCues(input)
			expect(result).toHaveLength(2)
			expect(result[0].startMs).toBe(0)
			expect(result[0].endMs).toBeGreaterThan(0)
		})

		it('trims text and filters out empty-text cues', () => {
			const input = [
				{ startTime: 0, endTime: 1, text: '  ' },
				{ startTime: 1, endTime: 2, text: '' },
				{ startTime: 2, endTime: 3, text: null as any },
				{ startTime: 3, endTime: 4, text: 'Valid' }
			]
			const result = convertRecognitionCuesToSubtitleCues(input)
			expect(result).toHaveLength(1)
			expect(result[0].text).toBe('Valid')
		})
	})

	describe('formatSrtTimeFromSeconds', () => {
		it('formats 0 seconds correctly', () => {
			expect(formatSrtTimeFromSeconds(0)).toBe('00:00:00,000')
		})

		it('formats seconds with milliseconds', () => {
			expect(formatSrtTimeFromSeconds(1.5)).toBe('00:00:01,500')
			expect(formatSrtTimeFromSeconds(61.123)).toBe('00:01:01,123')
			expect(formatSrtTimeFromSeconds(3600)).toBe('01:00:00,000')
			expect(formatSrtTimeFromSeconds(3661.001)).toBe('01:01:01,001')
		})

		it('handles negative or non-finite values as 0', () => {
			expect(formatSrtTimeFromSeconds(-5)).toBe('00:00:00,000')
			expect(formatSrtTimeFromSeconds(NaN)).toBe('00:00:00,000')
			expect(formatSrtTimeFromSeconds(Infinity)).toBe('00:00:00,000')
		})
	})

	describe('buildSubtitleExtractedAudioUrl', () => {
		it('builds correct dweb URL for valid projectId', () => {
			const url = buildSubtitleExtractedAudioUrl(42)
			expect(url).toBe(
				'dweb://project-assets?projectId=42&path=Content%2FMedia%2Fsubtitle_extracted_audio.wav'
			)
		})

		it('returns null for invalid projectId', () => {
			expect(buildSubtitleExtractedAudioUrl(0)).toBeNull()
			expect(buildSubtitleExtractedAudioUrl(-1)).toBeNull()
			expect(buildSubtitleExtractedAudioUrl(NaN)).toBeNull()
			expect(buildSubtitleExtractedAudioUrl(null as any)).toBeNull()
			expect(buildSubtitleExtractedAudioUrl(undefined as any)).toBeNull()
		})
	})

	describe('parseProjectIdFromVideoUrl', () => {
		it('parses projectId from a valid dweb project-assets URL', () => {
			const url = 'dweb://project-assets?projectId=123&path=Content%2FMedia%2Fvideo.mp4'
			expect(parseProjectIdFromVideoUrl(url)).toBe(123)
		})

		it('returns null for non-dweb URLs', () => {
			expect(parseProjectIdFromVideoUrl('http://example.com/video.mp4')).toBeNull()
			expect(parseProjectIdFromVideoUrl('https://example.com/video.mp4')).toBeNull()
			expect(parseProjectIdFromVideoUrl('file:///path/to/video.mp4')).toBeNull()
		})

		it('returns null for dweb URLs with wrong host', () => {
			expect(parseProjectIdFromVideoUrl('dweb://other-host?projectId=1')).toBeNull()
		})

		it('returns null for missing or invalid projectId', () => {
			expect(parseProjectIdFromVideoUrl('dweb://project-assets?path=video.mp4')).toBeNull()
			expect(
				parseProjectIdFromVideoUrl('dweb://project-assets?projectId=abc&path=video.mp4')
			).toBeNull()
			expect(
				parseProjectIdFromVideoUrl('dweb://project-assets?projectId=-1&path=video.mp4')
			).toBeNull()
		})

		it('returns null for empty/null/undefined input', () => {
			expect(parseProjectIdFromVideoUrl('')).toBeNull()
			expect(parseProjectIdFromVideoUrl(null)).toBeNull()
			expect(parseProjectIdFromVideoUrl(undefined)).toBeNull()
		})

		it('returns null for malformed URLs that throw', () => {
			expect(parseProjectIdFromVideoUrl('not a url at all')).toBeNull()
		})
	})
})
