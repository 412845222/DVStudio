/**
 * Offline test: extract and run normalizeSeedreamPayloadForSubmission + resolveSeedreamEndpointFromPayload
 * from service.mjs logic WITHOUT loading the whole Electron backend.
 *
 * Run:  node tests/test-seedream-service-normalize.mjs
 */

const assert = (cond, msg) => {
	if (!cond) {
		throw new Error('ASSERT: ' + (msg || 'failed'))
	}
}

// ===== Copy core logic directly from service.mjs =====
const PROVIDER_ONLY_SHORT_NAMES = new Set([
	'seedream',
	'gemini',
	'nanobanana',
	'meshy',
	'tripo3d',
	'seedance',
	'jimeng',
	'bytedance',
	'volcengine',
	'doubao',
	'ark',
	'openai',
	'coze'
])
function _looksLikeRealSeedreamEndpoint(raw) {
	const s = String(raw || '').trim()
	if (!s) return false
	const low = s.toLowerCase()
	if (PROVIDER_ONLY_SHORT_NAMES.has(low)) return false
	if (low.startsWith('ep-')) return true
	if (low.startsWith('doubao-') && low.length >= 15) return true
	if (low.startsWith('jimeng-') && low.length >= 12) return true
	if (low.startsWith('seedance-') && low.length >= 12) return true
	if (low.startsWith('seedream-') && low.length >= 15) return true
	if (low.startsWith('bytedance-') && low.length >= 15) return true
	if (low.length >= 10 && (low.includes('-') || low.includes('_'))) return true
	return false
}
function resolveSeedreamEndpointFromPayload(payload) {
	const DEFAULT = 'doubao-seedream-4-5-251128'
	const candidates = [
		payload?.seedreamModelVersion,
		payload?.imageModel,
		payload?.endpoint_id,
		payload?.model
	]
	for (const raw of candidates) {
		if (_looksLikeRealSeedreamEndpoint(raw)) return String(raw).trim()
	}
	return DEFAULT
}

const SEEDREAM_SIZE_ENUM = new Set(['1K', '2K', '3K', '4K'])
const SEEDREAM_ASPECT_RATIO_ENUM = new Set([
	'1:1',
	'16:9',
	'9:16',
	'4:3',
	'3:4',
	'21:9',
	'3:2',
	'2:3'
])
const SEEDREAM_SIZE_PIXEL_MAP = {
	'1K': {
		'1:1': '1024x1024',
		'4:3': '1152x864',
		'3:4': '864x1152',
		'16:9': '1280x720',
		'9:16': '720x1280',
		'3:2': '1248x832',
		'2:3': '832x1248',
		'21:9': '1512x648'
	},
	'2K': {
		'1:1': '2048x2048',
		'4:3': '2304x1728',
		'3:4': '1728x2304',
		'16:9': '2848x1600',
		'9:16': '1600x2848',
		'3:2': '2496x1664',
		'2:3': '1664x2496',
		'21:9': '3136x1344'
	},
	'3K': {
		'1:1': '3072x3072',
		'4:3': '3456x2592',
		'3:4': '2592x3456',
		'16:9': '4096x2304',
		'9:16': '2304x4096',
		'3:2': '3744x2496',
		'2:3': '2496x3744',
		'21:9': '4704x2016'
	},
	'4K': {
		'1:1': '4096x4096',
		'4:3': '4704x3520',
		'3:4': '3520x4704',
		'16:9': '5504x3040',
		'9:16': '3040x5504',
		'3:2': '4992x3328',
		'2:3': '3328x4992',
		'21:9': '6240x2656'
	}
}
const _WXH_TO_PRESET_RATIO = (() => {
	const m = new Map()
	for (const [preset, ratios] of Object.entries(SEEDREAM_SIZE_PIXEL_MAP)) {
		for (const [ratio, wxh] of Object.entries(ratios)) {
			if (!m.has(wxh)) m.set(wxh, { preset, ratio })
		}
	}
	return m
})()
function _gcd(a, b) {
	return b ? _gcd(b, a % b) : a
}
function _simplifyRatio(w, h) {
	if (!w || !h) return null
	const g = _gcd(w, h)
	if (!g) return null
	return `${Math.floor(w / g)}:${Math.floor(h / g)}`
}
function _matchSeedreamPresetAndRatio(width, height) {
	const isGoodNumber = (v) => Number.isFinite(v) && v > 0
	const w = isGoodNumber(width) ? Math.max(64, Math.floor(width)) : 0
	const h = isGoodNumber(height) ? Math.max(64, Math.floor(height)) : 0
	if (w > 0 && h > 0) {
		const exactKey = `${w}x${h}`
		if (_WXH_TO_PRESET_RATIO.has(exactKey)) return _WXH_TO_PRESET_RATIO.get(exactKey)
		const simpleRatio = _simplifyRatio(w, h)
		let candidates = []
		for (const [preset, ratios] of Object.entries(SEEDREAM_SIZE_PIXEL_MAP)) {
			for (const [ratio, wxh] of Object.entries(ratios)) {
				if (simpleRatio && ratio !== simpleRatio) continue
				const [rw, rh] = wxh.split('x').map(Number)
				const diff = Math.abs(w * h - rw * rh)
				candidates.push({ preset, ratio, wxh, diff })
			}
		}
		if (candidates.length === 0) {
			for (const [preset, ratios] of Object.entries(SEEDREAM_SIZE_PIXEL_MAP)) {
				for (const [ratio, wxh] of Object.entries(ratios)) {
					const [rw, rh] = wxh.split('x').map(Number)
					const diff = Math.abs(w * h - rw * rh)
					candidates.push({ preset, ratio, wxh, diff })
				}
			}
		}
		if (candidates.length) {
			candidates.sort((a, b) => a.diff - b.diff)
			return { preset: candidates[0].preset, ratio: candidates[0].ratio }
		}
	} else if (w > 0 || h > 0) {
		const known = Math.max(w, h)
		return _matchSeedreamPresetAndRatio(known, known)
	}
	return { preset: '2K', ratio: '1:1' }
}
function normalizeSeedreamPayloadForSubmission(rawPayload) {
	const p = rawPayload || {}
	const out = { ...p }

	const rawN = p.seedreamQuantity ?? p.imageCount ?? p.n ?? p.quantity
	const seedreamQuantity = Number.isFinite(Number(rawN))
		? Math.min(4, Math.max(1, Math.floor(Number(rawN))))
		: 1
	out.seedreamQuantity = seedreamQuantity
	if (out.imageCount === undefined) out.imageCount = seedreamQuantity
	if (out.n === undefined) out.n = seedreamQuantity

	out.seedreamWatermark =
		p.seedreamWatermark === true ||
		p.watermark === true ||
		p.watermark === 'true' ||
		p.watermark === 1 ||
		p.watermark === '1'

	if (typeof p.seedreamOutputFormat === 'string' && p.seedreamOutputFormat.trim()) {
		out.seedreamOutputFormat = p.seedreamOutputFormat.trim().toLowerCase()
	} else if (typeof p.outputFormat === 'string' && p.outputFormat.trim()) {
		out.seedreamOutputFormat = p.outputFormat.trim().toLowerCase()
	} else if (typeof p.output_format === 'string' && p.output_format.trim()) {
		out.seedreamOutputFormat = p.output_format.trim().toLowerCase()
	} else {
		out.seedreamOutputFormat = 'jpeg'
	}

	if (typeof p.seedreamSeed === 'number' && Number.isFinite(p.seedreamSeed)) {
		out.seedreamSeed = p.seedreamSeed
	} else if (typeof p.seed === 'number' && Number.isFinite(p.seed) && p.seed >= 0) {
		out.seedreamSeed = Math.floor(p.seed)
	}

	const np = String(
		typeof p.seedreamNegativePrompt === 'string'
			? p.seedreamNegativePrompt
			: typeof p.negativePrompt === 'string'
				? p.negativePrompt
				: typeof p.negative_prompt === 'string'
					? p.negative_prompt
					: ''
	).trim()
	if (np) out.seedreamNegativePrompt = np

	let sizeFromUser = String(p.seedreamSize || p.size || '')
		.trim()
		.toUpperCase()
	if (!SEEDREAM_SIZE_ENUM.has(sizeFromUser)) sizeFromUser = ''
	let ratioFromUser = String(
		p.seedreamAspectRatio || p.aspectRatio || p.aspect_ratio || p.ratio || ''
	)
		.trim()
		.replace(/\s/g, '')
	if (!SEEDREAM_ASPECT_RATIO_ENUM.has(ratioFromUser)) ratioFromUser = ''

	if (sizeFromUser && ratioFromUser) {
		out.seedreamSize = sizeFromUser
		out.seedreamAspectRatio = ratioFromUser
	} else {
		const hasW = typeof p.width === 'number' && Number.isFinite(p.width)
		const hasH = typeof p.height === 'number' && Number.isFinite(p.height)
		let matched = null
		if (hasW || hasH) {
			const wArg = hasW ? Number(p.width) : 0
			const hArg = hasH ? Number(p.height) : 0
			matched = _matchSeedreamPresetAndRatio(wArg, hArg)
		} else if (ratioFromUser) {
			matched = { preset: '2K', ratio: ratioFromUser }
		} else if (sizeFromUser) {
			matched = { preset: sizeFromUser, ratio: '1:1' }
		} else {
			matched = { preset: '2K', ratio: '1:1' }
		}
		out.seedreamSize = matched.preset
		out.seedreamAspectRatio = matched.ratio
	}
	out.size = out.seedreamSize
	out.aspectRatio = out.seedreamAspectRatio
	out.aspect_ratio = out.seedreamAspectRatio

	const standardWxh =
		(SEEDREAM_SIZE_PIXEL_MAP[out.seedreamSize] || {})[out.seedreamAspectRatio] || ''
	if (standardWxh) {
		const [sw, sh] = standardWxh.split('x').map(Number)
		out.width = sw
		out.height = sh
	}
	return out
}

// ===== Tests =====
let passed = 0,
	failed = 0
const cases = [
	// exact pixels
	{
		input: { width: 1024, height: 1024 },
		expect: { seedreamSize: '1K', seedreamAspectRatio: '1:1' }
	},
	{
		input: { width: 2048, height: 2048 },
		expect: { seedreamSize: '2K', seedreamAspectRatio: '1:1' }
	},
	{
		input: { width: 2848, height: 1600 },
		expect: { seedreamSize: '2K', seedreamAspectRatio: '16:9' }
	},
	{
		input: { width: 1600, height: 2848 },
		expect: { seedreamSize: '2K', seedreamAspectRatio: '9:16' }
	},
	{
		input: { width: 4096, height: 2304 },
		expect: { seedreamSize: '3K', seedreamAspectRatio: '16:9' }
	},
	{
		input: { width: 5504, height: 3040 },
		expect: { seedreamSize: '4K', seedreamAspectRatio: '16:9' }
	},
	// area approx with ratio hit
	{
		input: { width: 1000, height: 1000 },
		expect: { seedreamSize: '1K', seedreamAspectRatio: '1:1' }
	},
	{
		input: { width: 1900, height: 1900 },
		expect: { seedreamSize: '2K', seedreamAspectRatio: '1:1' }
	},
	{
		input: { width: 1200, height: 700 },
		expect: { seedreamSize: '1K', seedreamAspectRatio: '16:9' }
	},
	// only width (1:1 assumption)
	{ input: { width: 2000 }, expect: { seedreamSize: '2K', seedreamAspectRatio: '1:1' } },
	// only aspectRatio
	{
		input: { seedreamAspectRatio: '3:4' },
		expect: { seedreamSize: '2K', seedreamAspectRatio: '3:4' }
	},
	// only size
	{ input: { seedreamSize: '3K' }, expect: { seedreamSize: '3K', seedreamAspectRatio: '1:1' } },
	// empty fallback
	{ input: {}, expect: { seedreamSize: '2K', seedreamAspectRatio: '1:1' } },
	// 4:3 simplified ratio
	{
		input: { width: 800, height: 600 },
		expect: { seedreamSize: '1K', seedreamAspectRatio: '4:3' }
	},
	// quantity normalization (caps at 4)
	{
		input: { width: 1024, height: 1024, imageCount: 10 },
		expect: { seedreamSize: '1K', seedreamQuantity: 4, n: 4 }
	},
	// quantity from seedreamQuantity field (same as blueprint dialog native field)
	{ input: { seedreamQuantity: 2 }, expect: { seedreamQuantity: 2, n: 2 } },
	// direct size + ratio (highest priority, should skip pixel matching)
	{
		input: { width: 100, height: 100, seedreamSize: '4K', seedreamAspectRatio: '21:9' },
		expect: { seedreamSize: '4K', seedreamAspectRatio: '21:9', width: 6240, height: 2656 }
	},
	// watermark default false
	{ input: {}, expectWatermark: false },
	// negative prompt
	{ input: { negativePrompt: 'ugly, blurry' }, expectNegativePrompt: 'ugly, blurry' }
]

console.log('=== Seedream Normalize Service Test (MJS) ===')
for (const tc of cases) {
	const out = normalizeSeedreamPayloadForSubmission(tc.input)
	let ok = true
	const msgs = []
	if (tc.expect?.seedreamSize) {
		if (out.seedreamSize !== tc.expect.seedreamSize) {
			ok = false
			msgs.push(`size expect=${tc.expect.seedreamSize} actual=${out.seedreamSize}`)
		}
	}
	if (tc.expect?.seedreamAspectRatio) {
		if (out.seedreamAspectRatio !== tc.expect.seedreamAspectRatio) {
			ok = false
			msgs.push(`ratio expect=${tc.expect.seedreamAspectRatio} actual=${out.seedreamAspectRatio}`)
		}
	}
	if (tc.expect?.seedreamQuantity !== undefined) {
		if (out.seedreamQuantity !== tc.expect.seedreamQuantity) {
			ok = false
			msgs.push(`qty expect=${tc.expect.seedreamQuantity} actual=${out.seedreamQuantity}`)
		}
	}
	if (tc.expect?.n !== undefined) {
		if (out.n !== tc.expect.n) {
			ok = false
			msgs.push(`n expect=${tc.expect.n} actual=${out.n}`)
		}
	}
	if (tc.expect?.width !== undefined) {
		if (out.width !== tc.expect.width) {
			ok = false
			msgs.push(`width expect=${tc.expect.width} actual=${out.width}`)
		}
	}
	if (tc.expect?.height !== undefined) {
		if (out.height !== tc.expect.height) {
			ok = false
			msgs.push(`height expect=${tc.expect.height} actual=${out.height}`)
		}
	}
	if (tc.expectWatermark !== undefined) {
		if (out.seedreamWatermark !== tc.expectWatermark) {
			ok = false
			msgs.push(`watermark expect=${tc.expectWatermark} actual=${out.seedreamWatermark}`)
		}
	}
	if (tc.expectNegativePrompt !== undefined) {
		if (out.seedreamNegativePrompt !== tc.expectNegativePrompt) {
			ok = false
			msgs.push(`neg expect=${tc.expectNegativePrompt} actual=${out.seedreamNegativePrompt}`)
		}
	}
	const label = JSON.stringify(tc.input).slice(0, 70)
	if (ok) {
		passed++
		console.log(
			`\x1b[32m[PASS]\x1b[0m ${label.padEnd(74)} -> size=${out.seedreamSize} ratio=${out.seedreamAspectRatio}`
		)
	} else {
		failed++
		console.log(`\x1b[31m[FAIL]\x1b[0m ${label}`)
		for (const m of msgs) console.log(`       \x1b[31m- ${m}\x1b[0m`)
	}
}

// Endpoint resolution tests
console.log('')
console.log('=== Endpoint Resolution Test (MJS) ===')
const epCases = [
	{
		input: { seedreamModelVersion: 'doubao-seedream-5-0-260128' },
		expect: 'doubao-seedream-5-0-260128'
	},
	{ input: { imageModel: 'ep-20240101abc' }, expect: 'ep-20240101abc' },
	{ input: { model: 'seedream' }, expect: 'doubao-seedream-4-5-251128' }, // provider short name -> fallback
	{ input: { model: 'gemini' }, expect: 'doubao-seedream-4-5-251128' },
	{
		input: { seedreamModelVersion: 'seedream', model: 'doubao-seedream-4-5-251128' },
		expect: 'doubao-seedream-4-5-251128'
	}, // seedreamModelVersion is short -> skip to next
	{ input: {}, expect: 'doubao-seedream-4-5-251128' } // empty -> default
]
for (const tc of epCases) {
	const got = resolveSeedreamEndpointFromPayload(tc.input)
	const ok = got === tc.expect
	const label = JSON.stringify(tc.input).slice(0, 70)
	if (ok) {
		passed++
		console.log(`\x1b[32m[PASS]\x1b[0m ${label.padEnd(74)} -> ${got}`)
	} else {
		failed++
		console.log(`\x1b[31m[FAIL]\x1b[0m ${label}`)
		console.log(`       \x1b[31mexpect=${tc.expect} actual=${got}\x1b[0m`)
	}
}

console.log('')
const color = failed === 0 ? '\x1b[32m' : '\x1b[31m'
console.log(
	`${color}Results: PASS=${passed} FAIL=${failed} TOTAL=${cases.length + epCases.length}\x1b[0m`
)
process.exit(failed === 0 ? 0 : 1)
