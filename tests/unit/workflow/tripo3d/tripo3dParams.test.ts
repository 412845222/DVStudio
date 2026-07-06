import { describe, it, expect } from 'vitest'
import {
	isTripo3DPSeries,
	isTripo3DV3OrLater,
	getTripo3DFaceLimitRange,
	normalizeTripo3DParams,
} from '@/ui/BluePrint/node-dialog/nodeChatConfig'

describe('tripo3dParams', () => {
	describe('isTripo3DPSeries', () => {
		it('should return true for P-series model versions', () => {
			expect(isTripo3DPSeries('P1-20260311')).toBe(true)
			expect(isTripo3DPSeries('P2-20260311')).toBe(true)
			expect(isTripo3DPSeries('P0.5-20260101')).toBe(true)
		})

		it('should return false for non-P-series model versions', () => {
			expect(isTripo3DPSeries('v3.1-20260211')).toBe(false)
			expect(isTripo3DPSeries('v3.0-20250812')).toBe(false)
			expect(isTripo3DPSeries('v2.5-20250123')).toBe(false)
			expect(isTripo3DPSeries('v2.0-20240919')).toBe(false)
		})
	})

	describe('isTripo3DV3OrLater', () => {
		it('should return true for v3.x models', () => {
			expect(isTripo3DV3OrLater('v3.1-20260211')).toBe(true)
			expect(isTripo3DV3OrLater('v3.0-20250812')).toBe(true)
		})

		it('should return false for older models', () => {
			expect(isTripo3DV3OrLater('v2.5-20250123')).toBe(false)
			expect(isTripo3DV3OrLater('v2.0-20240919')).toBe(false)
			expect(isTripo3DV3OrLater('P1-20260311')).toBe(false)
		})
	})

	describe('getTripo3DFaceLimitRange', () => {
		describe('P-series models', () => {
			it('should return 50-20000 range for triangles (default)', () => {
				const range = getTripo3DFaceLimitRange('P1-20260311', false, false)
				expect(range.min).toBe(50)
				expect(range.max).toBe(20000)
				expect(range.default).toBe(10000)
			})

			it('should return 50-10000 range for quad (quads)', () => {
				const range = getTripo3DFaceLimitRange('P1-20260311', true, false)
				expect(range.min).toBe(50)
				expect(range.max).toBe(10000)
				expect(range.default).toBe(10000)
			})

			it('should ignore smartLowPoly for P-series', () => {
				const rangeNoSmart = getTripo3DFaceLimitRange('P1-20260311', false, false)
				const rangeWithSmart = getTripo3DFaceLimitRange('P1-20260311', false, true)
				expect(rangeWithSmart.min).toBe(rangeNoSmart.min)
				expect(rangeWithSmart.max).toBe(rangeNoSmart.max)
			})
		})

		describe('v3.x H-series models (v3.0/v3.1)', () => {
			const modelVersion = 'v3.1-20260211'

			it('should return 1000-2000000 range for default settings', () => {
				const range = getTripo3DFaceLimitRange(modelVersion, false, false)
				expect(range.min).toBe(1000)
				expect(range.max).toBe(2000000)
				expect(range.default).toBe(0)
			})

			it('should return 1000-150000 range for quad mode', () => {
				const range = getTripo3DFaceLimitRange(modelVersion, true, false)
				expect(range.min).toBe(1000)
				expect(range.max).toBe(150000)
			})

			it('should return 500-20000 range for smartLowPoly triangles', () => {
				const range = getTripo3DFaceLimitRange(modelVersion, false, true)
				expect(range.min).toBe(500)
				expect(range.max).toBe(20000)
				expect(range.default).toBe(10000)
			})

			it('should return 500-10000 range for smartLowPoly quads', () => {
				const range = getTripo3DFaceLimitRange(modelVersion, true, true)
				expect(range.min).toBe(500)
				expect(range.max).toBe(10000)
			})
		})

		describe('v2.5 model', () => {
			it('should return 1000-500000 range', () => {
				const range = getTripo3DFaceLimitRange('v2.5-20250123', false, false)
				expect(range.min).toBe(1000)
				expect(range.max).toBe(500000)
				expect(range.default).toBe(0)
			})

			it('should ignore quad and smartLowPoly for v2.5', () => {
				const rangeDefault = getTripo3DFaceLimitRange('v2.5-20250123', false, false)
				const rangeQuad = getTripo3DFaceLimitRange('v2.5-20250123', true, false)
				const rangeSmart = getTripo3DFaceLimitRange('v2.5-20250123', false, true)
				expect(rangeQuad.max).toBe(rangeDefault.max)
				expect(rangeSmart.max).toBe(rangeDefault.max)
			})
		})
	})

	describe('normalizeTripo3DParams', () => {
		it('should apply sensible defaults for empty params', () => {
			const result = normalizeTripo3DParams({})
			expect(result.tripo3dModelVersion).toBe('v3.1-20260211')
			expect(result.tripo3dModelSeries).toBe('h')
			expect(result.tripo3dTexture).toBe(true)
			expect(result.tripo3dPbr).toBe(true)
			expect(result.tripo3dQuad).toBe(false)
			expect(result.tripo3dSmartLowPoly).toBe(false)
			expect(result.tripo3dGenerateParts).toBe(false)
			expect(result.tripo3dAutoSize).toBe(false)
			expect(result.tripo3dCompress).toBe(false)
			expect(result.tripo3dGeometryQuality).toBe('standard')
			expect(result.tripo3dFaceLimit).toBe(0)
			expect(result.tripo3dExportUv).toBe(true)
			expect(Array.isArray(result.tripo3dSelectedImages)).toBe(true)
		})

		it('should clamp faceLimit for P-series models', () => {
			const result = normalizeTripo3DParams({
				tripo3dModelVersion: 'P1-20260311',
				tripo3dFaceLimit: 66960,
			})
			expect(result.tripo3dModelSeries).toBe('p')
			expect(result.tripo3dFaceLimit).toBe(20000)
		})

		it('should clamp faceLimit to minimum for P-series', () => {
			const result = normalizeTripo3DParams({
				tripo3dModelVersion: 'P1-20260311',
				tripo3dFaceLimit: 10,
			})
			expect(result.tripo3dFaceLimit).toBe(50)
		})

		it('should disable smartLowPoly for P-series', () => {
			const result = normalizeTripo3DParams({
				tripo3dModelVersion: 'P1-20260311',
				tripo3dSmartLowPoly: true,
			})
			expect(result.tripo3dSmartLowPoly).toBe(false)
		})

		it('should disable generateParts for P-series', () => {
			const result = normalizeTripo3DParams({
				tripo3dModelVersion: 'P1-20260311',
				tripo3dGenerateParts: true,
			})
			expect(result.tripo3dGenerateParts).toBe(false)
		})

		it('should disable autoSize/compress for P-series', () => {
			const result = normalizeTripo3DParams({
				tripo3dModelVersion: 'P1-20260311',
				tripo3dAutoSize: true,
				tripo3dCompress: 'true',
			})
			expect(result.tripo3dAutoSize).toBe(false)
			expect(result.tripo3dCompress).toBe(false)
		})

		it('should disable texture/pbr/quad when generateParts is true (v3.x)', () => {
			const result = normalizeTripo3DParams({
				tripo3dModelVersion: 'v3.1-20260211',
				tripo3dGenerateParts: true,
				tripo3dTexture: true,
				tripo3dPbr: true,
				tripo3dQuad: true,
				tripo3dSmartLowPoly: true,
			})
			expect(result.tripo3dTexture).toBe(false)
			expect(result.tripo3dPbr).toBe(false)
			expect(result.tripo3dQuad).toBe(false)
			expect(result.tripo3dSmartLowPoly).toBe(false)
		})

		it('should enable texture when pbr is true', () => {
			const result = normalizeTripo3DParams({
				tripo3dModelVersion: 'v3.1-20260211',
				tripo3dPbr: true,
				tripo3dTexture: false,
			})
			expect(result.tripo3dTexture).toBe(true)
		})

		it('should disable quad when smartLowPoly is true', () => {
			const result = normalizeTripo3DParams({
				tripo3dModelVersion: 'v3.1-20260211',
				tripo3dQuad: true,
				tripo3dSmartLowPoly: true,
			})
			expect(result.tripo3dQuad).toBe(false)
			expect(result.tripo3dSmartLowPoly).toBe(true)
		})

		it('should disable advanced options for v2.5', () => {
			const result = normalizeTripo3DParams({
				tripo3dModelVersion: 'v2.5-20250123',
				tripo3dQuad: true,
				tripo3dSmartLowPoly: true,
				tripo3dGenerateParts: true,
				tripo3dAutoSize: true,
			})
			expect(result.tripo3dQuad).toBe(false)
			expect(result.tripo3dSmartLowPoly).toBe(false)
			expect(result.tripo3dGenerateParts).toBe(false)
			expect(result.tripo3dAutoSize).toBe(false)
		})

		it('should keep faceLimit 0 as adaptive (no clamping)', () => {
			const result = normalizeTripo3DParams({
				tripo3dModelVersion: 'v3.1-20260211',
				tripo3dFaceLimit: 0,
			})
			expect(result.tripo3dFaceLimit).toBe(0)
		})

		it('should infer modelSeries from modelVersion if not set', () => {
			const pResult = normalizeTripo3DParams({
				tripo3dModelVersion: 'P1-20260311',
			})
			expect(pResult.tripo3dModelSeries).toBe('p')

			const hResult = normalizeTripo3DParams({
				tripo3dModelVersion: 'v3.0-20250812',
			})
			expect(hResult.tripo3dModelSeries).toBe('h')
		})

		it('should reset invalid selectedImages to empty array', () => {
			const result = normalizeTripo3DParams({
				tripo3dSelectedImages: 'not-an-array',
			})
			expect(Array.isArray(result.tripo3dSelectedImages)).toBe(true)
			expect(result.tripo3dSelectedImages).toHaveLength(0)
		})
	})
})
