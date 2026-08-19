/**
 * DVStudio 内置 MCP 工具注册
 *
 * 使用统一的ToolExecutor注册与工作流蓝图相关的内置工具。
 */

import { getToolExecutor } from './toolExecutor.mjs'
import logger from '../../core/logger.mjs'
import fs from 'node:fs'
import path from 'node:path'
import https from 'node:https'
import http from 'node:http'

const DEFAULT_SEEDREAM_MODEL = 'doubao-seedream-4-5-251128'

/**
 * Provider-only 短名（是 UI/面板里的"提供商"显示名，不是真实 Ark endpoint ID）。
 * 这些字符串直接当 model 发给 Ark 会报 "endpoint xxx does not exist or you do not have access"。
 * 列表必须和蓝图节点面板（nodeChatConfig.ts NODE_CHAT_IMAGE_MODEL_OPTIONS 的 value）对齐：
 *   seedream / gemini / nanobanana / meshy / tripo3d / seedance
 */
const PROVIDER_ONLY_TOKENS = new Set([
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

/**
 * 判断给定的字符串在"形式上"像一个真实可调用的 Doubao Ark Seedream Endpoint ID。
 * 注意：
 *   - 真正的 endpoint ID 有两种形态：
 *       (a) 官方预置模型名，如 doubao-seedream-4-5-251128 / doubao-seedream-5-0-260128
 *       (b) 用户自建接入点，形如 ep-20240819xxxxx（火山方舟控制台创建）
 *   - 必须排除 provider-only short tokens（seedream / gemini / meshy ...）
 */
function looksLikeRealSeedreamEndpointId(m) {
	if (!m) return false
	const raw = String(m).trim()
	if (!raw) return false
	const s = raw.toLowerCase()
	if (PROVIDER_ONLY_TOKENS.has(s)) return false
	if (s.startsWith('ep-')) return true
	// 官方预置名：必须是 doubao-<family>-<version>-<date> 或 jimeng-image-xxx
	if (s.startsWith('doubao-') && s.length >= 15) return true
	if (s.startsWith('jimeng-') && s.length >= 12) return true
	if (s.startsWith('seedance-') && s.length >= 12) return true
	if (s.startsWith('seedream-') && s.length >= 15) return true
	if (s.startsWith('bytedance-') && s.length >= 15) return true
	// 兜底：长度 >=10 且包含至少一个 '-' / '_'，看起来像一个 endpoint 版本串
	if (s.length >= 10 && (s.includes('-') || s.includes('_'))) return true
	return false
}

/**
 * 判断给定的模型字符串是否属于 Seedream / Doubao Ark 家族（用于路由，不验证能否真正调用）。
 * 和之前 isSeedreamLikeModel 不同：这里只判断"属不属于字节方舟生态"，
 * 不用于 payload.model 的最终采信（最终采信走 looksLikeRealSeedreamEndpointId）。
 */
function isSeedreamFamily(m) {
	if (!m) return false
	const s = String(m).toLowerCase().replace(/[-_]/g, '')
	return (
		s.includes('seedream') ||
		s.includes('doubao') ||
		s.includes('bytedance') ||
		s.includes('ark') ||
		s.startsWith('volc') ||
		s.includes('byte') ||
		s.includes('jimeng') ||
		s.includes('seedance')
	)
}

/**
 * 解析 args/payload，按优先级拿到最终作为 Seedream Ark 请求 model 字段的"真实 Endpoint ID"。
 * 优先级必须与 service.mjs resolveSeedreamEndpointFromPayload 完全一致：
 *   1) seedreamModelVersion  → 蓝图节点面板 "Seedream model version" 下拉
 *   2) imageModel            → ComfyUI 桥接层约定 key
 *   3) endpoint_id           → ComfyUI 桥接层约定 key
 *   4) model                 → CLI 入参或 tool 调用方
 * 任何一层若只是 provider-only 短名（seedream/gemini/meshy...）则跳过，回退下一层或默认值。
 */
function resolveSeedreamEndpointFromArgs(args) {
	const candidates = [args?.seedreamModelVersion, args?.imageModel, args?.endpoint_id, args?.model]
	for (const raw of candidates) {
		const s = String(raw || '').trim()
		if (!s) continue
		if (looksLikeRealSeedreamEndpointId(s)) return s
	}
	return DEFAULT_SEEDREAM_MODEL
}

function normalizeSeedreamModel(rawModel) {
	const raw = String(rawModel || '').trim()
	if (looksLikeRealSeedreamEndpointId(raw)) return raw
	// 任何不可信的值（provider-only 短名、空、gemini/meshy 这种非方舟 ID）→ 统一回退到默认模型，
	// 并打印 WARN（方便用户在后端日志看到 endpoint 被替换的原因）。
	if (raw) {
		logger.warn(
			`[generate_image] model="${raw}" 不是合法的 Doubao Ark Seedream Endpoint ID。` +
				`合法的 Endpoint ID 应形如 doubao-seedream-5-0-260128（官方预置名）或 ep-20240819xxxxx（火山方舟控制台自建接入点）。` +
				`已自动回退到默认模型 ${DEFAULT_SEEDREAM_MODEL}。`
		)
	}
	return DEFAULT_SEEDREAM_MODEL
}

/**
 * 下载远程图片 URL 到本地临时文件
 */
function downloadImageToTemp(url) {
	return new Promise((resolve, reject) => {
		const client = url.startsWith('https') ? https : http
		const tmpDir = path.join(process.env.TEMP || process.env.TMP || '/tmp', 'dvs-genimg')
		if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true })
		const ext = '.png'
		const tmpFile = path.join(
			tmpDir,
			`img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`
		)
		const writeStream = fs.createWriteStream(tmpFile)
		const req = client.get(url, { timeout: 120000 }, (res) => {
			if (res.statusCode !== 200) {
				reject(new Error(`download failed: HTTP ${res.statusCode}`))
				return
			}
			res.pipe(writeStream)
			writeStream.on('finish', () => {
				writeStream.close()
				resolve(tmpFile)
			})
		})
		req.on('error', (err) => reject(err))
		req.on('timeout', () => {
			req.destroy()
			reject(new Error('download timeout'))
		})
	})
}

/**
 * 将 data: URI 写入临时文件
 */
function dataUriToTempFile(dataUri) {
	const match = dataUri.match(/^data:image\/(\w+);base64,(.+)$/)
	if (!match) throw new Error('invalid data URI')
	const ext = match[1] === 'jpeg' ? '.jpg' : `.${match[1]}`
	const buf = Buffer.from(match[2], 'base64')
	const tmpDir = path.join(process.env.TEMP || process.env.TMP || '/tmp', 'dvs-genimg')
	if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true })
	const tmpFile = path.join(
		tmpDir,
		`img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`
	)
	fs.writeFileSync(tmpFile, buf)
	return tmpFile
}

/**
 * 将 base64 字符串转为临时文件
 */
function base64ToTempFile(b64, ext = '.png') {
	const buf = Buffer.from(b64, 'base64')
	const tmpDir = path.join(process.env.TEMP || process.env.TMP || '/tmp', 'dvs-genimg')
	if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true })
	const tmpFile = path.join(
		tmpDir,
		`img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`
	)
	fs.writeFileSync(tmpFile, buf)
	return tmpFile
}

/**
 * P3: 生成图片的复合 MCP 工具（generate_image）
 *
 * 策略：优先走 seedream 直连路径（火山引擎 Ark API），失败再回退到 node pipeline
 * 返回：{ nodeId, outputFiles, exportedFiles, provider }，该结构会被 Agent Runtime 写入 assistant message，
 * 前端 useCLIAgentTrigger 的 JSON 解析器可直接识别并写回 CLI Control Server 的 completed 状态
 */
async function generateImageHandler(args, { requestId }) {
	const executor = getToolExecutor()
	const prompt = String(args?.prompt || '').trim()
	if (!prompt) throw new Error('prompt is required (non-empty string)')

	const width = typeof args?.width === 'number' ? Math.max(64, Math.floor(args.width)) : undefined
	const height =
		typeof args?.height === 'number' ? Math.max(64, Math.floor(args.height)) : undefined
	const aspectRatio = typeof args?.aspectRatio === 'string' ? args.aspectRatio : '1:1'
	const negativePrompt = typeof args?.negativePrompt === 'string' ? args.negativePrompt : undefined
	// 关键：按优先级解析 seedreamModelVersion > imageModel > endpoint_id > model，与蓝图节点面板完全对齐
	const model = resolveSeedreamEndpointFromArgs(args)
	const imageCount =
		typeof args?.imageCount === 'number'
			? Math.max(1, Math.min(16, Math.floor(args.imageCount)))
			: 1
	const seed = typeof args?.seed === 'number' ? Math.floor(args.seed) : undefined
	const outputPath = typeof args?.outputPath === 'string' ? args.outputPath || '' : ''
	const autoExport = args?.autoExport !== false
	const references = Array.isArray(args?.references)
		? args.references.filter((x) => typeof x === 'string' && x)
		: undefined

	// ===== 路径 A: seedream 直连优先 =====
	try {
		const seedreamResult = await generateImageViaSeedream(
			{
				prompt,
				width,
				height,
				aspectRatio,
				negativePrompt,
				model,
				imageCount,
				seed,
				outputPath,
				autoExport,
				references
			},
			{ requestId }
		)
		if (seedreamResult) {
			logger.info(
				`[generate_image][${requestId}] seedream direct: provider=seedream outputs=${seedreamResult.outputFiles.length} exported=${seedreamResult.exportedFiles.length}`
			)
			return seedreamResult
		}
	} catch (seedreamErr) {
		logger.warn(
			`[generate_image][${requestId}] seedream direct failed, falling back to node pipeline: ${seedreamErr?.message || seedreamErr}`
		)
	}

	// ===== 路径 B: 回退到 node pipeline（create_node → execute_node → 轮询） =====
	logger.info(`[generate_image][${requestId}] falling back to node pipeline`)
	// 把完整的 args 传入 node pipeline，让其能访问 seedreamSize/seedreamAspectRatio/seedreamQuantity 等蓝图原生字段
	return generateImageViaNodePipeline(
		{
			...(args || {}),
			prompt,
			width,
			height,
			aspectRatio,
			negativePrompt,
			model,
			imageCount,
			seed,
			outputPath,
			autoExport,
			references
		},
		{ requestId, executor }
	)
}

/**
 * seedream 直连路径：直接调用火山引擎 Ark API，绕过前端节点创建/执行流程
 * 优势：无 IPC 超时问题，速度快，直接在后端进程内完成
 */
async function generateImageViaSeedream(params, { requestId }) {
	const {
		prompt,
		aspectRatio,
		negativePrompt,
		imageCount,
		seed,
		outputPath,
		autoExport,
		references
	} = params
	// 独立保证 model 是 seedream 兼容 ID（即便上层没调用 normalizeSeedreamModel）
	const model = normalizeSeedreamModel(params?.model)

	// 动态 import 避免在没有 third-party 模块时崩溃
	// 说明：third-party 位于 electron/backend/modules/third-party/service.mjs
	const seedreamMod = await import('../third-party/service.mjs')
	const seedreamGenerateStream = seedreamMod.seedreamGenerateStream
	const seedreamRefCache = seedreamMod.seedreamRefCache

	// 构造 ctx（从全局获取 localdb）
	const ctx = _builtinCtx
	if (!ctx?.localdb?.apiKeys) {
		logger.warn(
			`[generate_image][${requestId}] seedream: no apiKeys repo available, skipping direct path`
		)
		return null
	}

	// 处理参考图：将本地文件路径缓存为 seedream 可用的 refImages
	let refImages = []
	if (references && references.length > 0) {
		try {
			const cacheResult = seedreamRefCache(ctx, { files: references })
			if (cacheResult?.cacheIds?.length) {
				// seedreamRefCache 返回 cacheIds，但 seedreamGenerateStream 接受 refImages 数组
				// 这里直接传本地文件路径作为 refImages（seedream API 会读取 data: URI 或 URL）
				for (const refPath of references) {
					if (fs.existsSync(refPath)) {
						const buf = fs.readFileSync(refPath)
						const ext = path.extname(refPath).toLowerCase() || '.png'
						const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png'
						refImages.push(`data:${mime};base64,${buf.toString('base64')}`)
					}
				}
			}
		} catch (cacheErr) {
			logger.warn(
				`[generate_image][${requestId}] seedream ref-cache failed (non-fatal): ${cacheErr?.message || cacheErr}`
			)
		}
	}

	// 构造 seedream 参数
	const seedreamModel = model || 'doubao-seedream-4-5-251128'
	// 与蓝图面板参数完全对齐的优先级读取：
	//   1) seedreamSize / seedreamAspectRatio（蓝图原生字段，经 service.mjs normalizeSeedreamPayloadForSubmission 规范化后一定是合法枚举）
	//   2) size / aspectRatio / aspect_ratio（third-party seedreamGenerateStream 会识别）
	//   3) width/height（反向解析成最匹配的预设 size + aspectRatio；third-party resolveSeedreamSize 会再做一次兜底）
	const VALID_SIZES = new Set(['1K', '2K', '3K', '4K'])
	const VALID_RATIOS = new Set(['1:1', '16:9', '9:16', '4:3', '3:4', '21:9', '3:2', '2:3'])
	let sizePreset = String(params?.seedreamSize || params?.size || '')
		.trim()
		.toUpperCase()
	if (!VALID_SIZES.has(sizePreset)) sizePreset = ''
	let ratioEnum = String(
		params?.seedreamAspectRatio ||
			params?.aspectRatio ||
			params?.aspect_ratio ||
			params?.ratio ||
			''
	)
		.trim()
		.replace(/\s/g, '')
	if (!VALID_RATIOS.has(ratioEnum)) ratioEnum = ''
	if (!sizePreset && typeof params?.width === 'number' && typeof params?.height === 'number') {
		// 走到这里说明 service.mjs 没做规范化（例如非 CLI 路径），做个最小化兜底：按面积选 1K/2K/3K/4K
		const area = params.width * params.height
		if (area >= 16e6) sizePreset = '4K'
		else if (area >= 8e6) sizePreset = '3K'
		else if (area >= 2.5e6) sizePreset = '2K'
		else sizePreset = '1K'
	}
	if (!sizePreset) sizePreset = '2K'
	if (!ratioEnum) ratioEnum = '1:1'
	const outputFormatEnum = String(
		params?.seedreamOutputFormat || params?.outputFormat || params?.output_format || 'jpeg'
	)
		.trim()
		.toLowerCase()
	const watermarkFlag =
		params?.seedreamWatermark === true ||
		params?.watermark === true ||
		params?.watermark === 'true' ||
		params?.watermark === 1 ||
		params?.watermark === '1'
	const seedreamPayload = {
		prompt,
		model: seedreamModel,
		// third-party seedreamGenerateStream 会读 size + aspect_ratio / aspectRatio，然后 resolveSeedreamSize(size, ratio) 展开成像素
		size: sizePreset,
		aspect_ratio: ratioEnum,
		aspectRatio: ratioEnum,
		n: imageCount,
		...(negativePrompt ? { negative_prompt: negativePrompt } : {}),
		...(typeof seed === 'number' && seed >= 0 ? { seed } : {}),
		...(refImages.length > 0 ? { refImages } : {}),
		output_format:
			outputFormatEnum === 'png' || outputFormatEnum === 'jpeg' ? outputFormatEnum : 'jpeg',
		watermark: watermarkFlag
	}

	logger.info(
		`[generate_image][${requestId}] seedream: model=${seedreamModel} size_preset=${sizePreset} aspect_ratio=${ratioEnum} n=${imageCount} refs=${refImages.length} watermark=${watermarkFlag}`
	)

	// 调用 seedreamGenerateStream 并收集图片 URL
	const stream = seedreamGenerateStream(ctx, seedreamPayload)
	const imageUrls = []
	let streamError = null

	try {
		for await (const chunk of stream) {
			try {
				const msg = JSON.parse(chunk)
				if (msg.type === 'error') {
					streamError = msg.error?.message || 'seedream stream error'
					continue
				}
				if (msg.type === 'msg' && msg.message?.type === 'agentToUi/chatMessage') {
					const content = msg.message.payload?.content
					if (!content) continue
					let parsed
					try {
						parsed = typeof content === 'string' ? JSON.parse(content) : content
					} catch {
						// content 是纯文本（状态消息等），忽略
						continue
					}
					if (parsed && typeof parsed === 'object' && parsed.imageUrl) {
						imageUrls.push(parsed.imageUrl)
					}
				}
			} catch (parseErr) {
				// 非 JSON chunk（极少见），忽略
				logger.debug(
					`[generate_image][${requestId}] seedream chunk parse skip: ${parseErr?.message || parseErr}`
				)
			}
		}
	} catch (streamErr) {
		streamError = String(streamErr?.message || streamErr)
	}

	if (streamError) {
		throw new Error(`seedream stream error: ${streamError}`)
	}
	if (imageUrls.length === 0) {
		throw new Error('seedream returned no images')
	}

	logger.info(`[generate_image][${requestId}] seedream: received ${imageUrls.length} image URLs`)

	// 下载图片到本地临时文件
	const outputFiles = []
	for (const url of imageUrls) {
		try {
			if (url.startsWith('data:')) {
				outputFiles.push(dataUriToTempFile(url))
			} else {
				outputFiles.push(await downloadImageToTemp(url))
			}
		} catch (dlErr) {
			logger.warn(
				`[generate_image][${requestId}] download failed (non-fatal): ${dlErr?.message || dlErr}`
			)
		}
	}

	if (outputFiles.length === 0) {
		throw new Error('seedream: all image downloads failed')
	}

	// autoExport: 复制到 outputPath
	const exportedFiles = []
	if (autoExport && outputPath && outputFiles.length > 0) {
		try {
			const outParsed = path.parse(outputPath)
			const stat = fs.existsSync(outputPath) ? fs.statSync(outputPath) : null
			const destIsDir = stat ? stat.isDirectory() : !outParsed.ext
			const destDir = destIsDir ? outputPath : outParsed.dir
			if (destDir && !fs.existsSync(destDir)) {
				fs.mkdirSync(destDir, { recursive: true })
			}
			for (let i = 0; i < outputFiles.length; i++) {
				const src = outputFiles[i]
				let dest
				if (destIsDir) {
					const ext = path.extname(src) || '.png'
					dest = path.join(outputPath, `seedream-${Date.now()}-${i + 1}${ext}`)
				} else if (outputFiles.length === 1) {
					dest = outputPath
				} else {
					const ext = outParsed.ext || path.extname(src) || '.png'
					const base = outParsed.name || `image-${i}`
					dest = path.join(destDir || '.', `${base}_${i + 1}${ext}`)
				}
				fs.copyFileSync(src, dest)
				exportedFiles.push(dest)
				logger.debug(`[generate_image][${requestId}] exported ${src} → ${dest}`)
			}
		} catch (copyErr) {
			logger.warn(
				`[generate_image][${requestId}] autoExport copy failed (non-fatal): ${copyErr?.message || copyErr}`
			)
		}
	}

	const nodeId = `seedream-${Date.now()}`
	return {
		ok: true,
		nodeId,
		provider: 'seedream',
		taskStatus: 'completed',
		outputFiles,
		exportedFiles,
		_jsonBridge: JSON.stringify({ nodeId, outputFiles, exportedFiles })
	}
}

/**
 * 回退路径：通过 node pipeline 创建节点并执行
 */
async function generateImageViaNodePipeline(params, { requestId, executor }) {
	const {
		prompt,
		width,
		height,
		aspectRatio,
		negativePrompt,
		imageCount,
		seed,
		outputPath,
		autoExport,
		references
	} = params
	// 节点路径：按优先级解析真实 endpoint（即使用户传了 model=seedream，也会从 seedreamModelVersion/imageModel 中取到真实值）
	const resolvedEndpoint = resolveSeedreamEndpointFromArgs(params)

	// ===== Seedream 参数规范化（镜像 service.mjs 的 normalizeSeedreamPayloadForSubmission，保证即使 P3 失败回退到 P2 也和蓝图面板完全一致）
	const VALID_SIZES = new Set(['1K', '2K', '3K', '4K'])
	const VALID_RATIOS = new Set(['1:1', '16:9', '9:16', '4:3', '3:4', '21:9', '3:2', '2:3'])
	// 1. seedreamSize / seedreamAspectRatio 规范化
	let preset = String(params?.seedreamSize || params?.size || '')
		.trim()
		.toUpperCase()
	if (!VALID_SIZES.has(preset)) preset = ''
	let ratio = String(
		params?.seedreamAspectRatio ||
			params?.aspectRatio ||
			params?.aspect_ratio ||
			params?.ratio ||
			''
	)
		.trim()
		.replace(/\s/g, '')
	if (!VALID_RATIOS.has(ratio)) ratio = ''
	if (!(preset && ratio)) {
		const hasW = typeof width === 'number',
			hasH = typeof height === 'number'
		if (hasW || hasH) {
			// 用标准映射表反查
			const MAP = {
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
			const gw = hasW ? Number(width) : 1000
			const gh = hasH ? Number(height) : 1000
			// 简化比计算（用于 Strategy A 的 ratio 过滤）
			const gcdFn = (a, b) => (b ? gcdFn(b, a % b) : a)
			const g = gcdFn(Math.floor(gw), Math.floor(gh)) || 1
			const simpleRatio = `${Math.floor(gw / g)}:${Math.floor(gh / g)}`
			const VALID_RATIOS = new Set(['1:1', '16:9', '9:16', '4:3', '3:4', '21:9', '3:2', '2:3'])
			let best = null
			// Strategy A: simplified ratio hits official enum -> filter by ratio, then min area diff
			for (const p of Object.keys(MAP)) {
				for (const r of Object.keys(MAP[p])) {
					if (VALID_RATIOS.has(simpleRatio) && r !== simpleRatio) continue
					const [sw, sh] = MAP[p][r].split('x').map(Number)
					const diff = Math.abs(gw * gh - sw * sh)
					if (!best || diff < best.diff) best = { preset: p, ratio: r, diff }
				}
			}
			// Strategy B: if simplified ratio NOT in official enum, Strategy A filtered everything -> global fallback
			if (best === null) {
				for (const p of Object.keys(MAP)) {
					for (const r of Object.keys(MAP[p])) {
						const [sw, sh] = MAP[p][r].split('x').map(Number)
						const diff = Math.abs(gw * gh - sw * sh)
						if (!best || diff < best.diff) best = { preset: p, ratio: r, diff }
					}
				}
			}
			if (best) {
				preset = best.preset
				ratio = best.ratio
			}
		} else if (ratio) {
			preset = '2K'
		} else if (preset) {
			ratio = '1:1'
		} else {
			preset = '2K'
			ratio = '1:1'
		}
	}
	if (!VALID_SIZES.has(preset)) preset = '2K'
	if (!VALID_RATIOS.has(ratio)) ratio = '1:1'
	// 2. quantity（蓝图：1/2/4）——和 seedreamQuantity、imageCount 对齐
	const qtyRaw = params?.seedreamQuantity ?? imageCount ?? params?.n ?? params?.quantity
	const qty = Number.isFinite(Number(qtyRaw))
		? Math.min(4, Math.max(1, Math.floor(Number(qtyRaw))))
		: 1
	// 3. watermark（蓝图默认 false）
	const wm =
		params?.seedreamWatermark === true ||
		params?.watermark === true ||
		params?.watermark === 'true' ||
		params?.watermark === 1 ||
		params?.watermark === '1'
	// 4. outputFormat（蓝图默认 jpeg）
	const fmtRaw = String(
		params?.seedreamOutputFormat || params?.outputFormat || params?.output_format || 'jpeg'
	)
		.trim()
		.toLowerCase()
	const fmt = fmtRaw === 'png' ? 'png' : 'jpeg'
	// 5. seedream seed（蓝图默认 -1 表示不指定；仅当显式 seed≥0 时写入）
	const sRaw = typeof params?.seedreamSeed === 'number' ? params.seedreamSeed : seed
	const seedreamSeed = Number.isFinite(sRaw) && sRaw >= 0 ? Math.floor(sRaw) : -1

	// 1. 构造 image-generation 节点配置（与蓝图节点底部参数面板完全一致：每个 seedream 原生字段都带上）
	const nodeConfig = {
		prompt,
		...(negativePrompt
			? {
					negativePrompt,
					negative_prompt: negativePrompt,
					seedreamNegativePrompt: String(negativePrompt)
				}
			: {}),
		// 显式 width/height 写回（来自 size+ratio 展开的标准像素）
		width,
		height,
		aspectRatio: ratio,
		aspect_ratio: ratio,
		// provider 短名：用于 normalizeImageModel 的 kind 路由分支
		model: 'seedream',
		modelKey: 'seedream',
		imageModel: 'seedream',
		// 真实 Seedream Endpoint ID：与蓝图节点面板 "Seedream model version" 下拉完全一致
		seedreamModelVersion: resolvedEndpoint,
		// === Seedream 原生完整字段，与 nodeChatConfig.ts 默认结构 1:1 对齐 ===
		seedreamSize: preset,
		seedreamAspectRatio: ratio,
		seedreamQuantity: qty,
		seedreamWatermark: Boolean(wm),
		seedreamOutputFormat: fmt,
		seedreamSeed,
		// 兼容字段
		...(typeof qty === 'number' ? { imageCount: qty, count: qty, numImages: qty, n: qty } : {}),
		...(Number.isFinite(seed) && seed >= 0 ? { seed: Math.floor(seed) } : {}),
		size: preset,
		watermark: Boolean(wm),
		outputFormat: fmt,
		output_format: fmt,
		...(Array.isArray(references) && references.length
			? { references, referenceImages: references }
			: {})
	}

	// 2. create_node
	const title = `CLI图片 ${prompt.slice(0, 18)}${prompt.length > 18 ? '…' : ''}`
	const createRes = await executor.callTool(
		'create_node',
		{
			type: 'image-generation',
			title,
			config: nodeConfig
		},
		{ skipFrontend: false }
	)
	const nodeId = String(createRes?.nodeId || createRes?.id || '')
	if (!nodeId) {
		throw new Error(
			`create_node did not return nodeId. createRes=${JSON.stringify(createRes).slice(0, 400)}`
		)
	}
	logger.info(`[generate_image][${requestId}] node pipeline: created node=${nodeId}`)

	// 3. execute_node（超时 5 分钟）
	const IPC_TIMEOUT_5MIN = 5 * 60 * 1000
	const execRes = await executor.callTool(
		'execute_node',
		{ nodeId },
		{ skipFrontend: false, timeoutMs: IPC_TIMEOUT_5MIN }
	)
	logger.info(`[generate_image][${requestId}] execute_node submitted. node=${nodeId}`)

	// 4. 轮询 list_node_tasks
	const WAIT_START = Date.now()
	const WAIT_TIMEOUT_MS = 10 * 60 * 1000
	const POLL_MS = 2500
	const POLL_IPC_TIMEOUT = 30 * 1000
	let finalTask = null
	while (Date.now() - WAIT_START < WAIT_TIMEOUT_MS) {
		const tasksRes = await executor.callTool(
			'list_node_tasks',
			{ nodeId },
			{ skipFrontend: false, timeoutMs: POLL_IPC_TIMEOUT }
		)
		const tasks = Array.isArray(tasksRes?.tasks)
			? tasksRes.tasks
			: Array.isArray(tasksRes)
				? tasksRes
				: []
		const sorted = tasks
			.filter((t) => t && (t.nodeId === nodeId || !nodeId))
			.sort(
				(a, b) =>
					Number(b.createdAt || b.created_at || 0) - Number(a.createdAt || a.created_at || 0)
			)
		const latest = sorted[0]
		if (latest) {
			const st = String(latest.status || '').toLowerCase()
			if (st === 'completed') {
				finalTask = latest
				break
			}
			if (st === 'failed' || st === 'canceled') {
				finalTask = latest
				break
			}
		}
		await new Promise((r) => setTimeout(r, POLL_MS))
	}
	if (!finalTask) {
		throw new Error(`execute_node timed out (>${WAIT_TIMEOUT_MS}ms) waiting for node ${nodeId}`)
	}
	const finalStatus = String(finalTask.status || '').toLowerCase()
	if (finalStatus === 'failed') {
		const msg = finalTask.error?.message || finalTask.error || finalTask.errMsg || '生成失败'
		throw new Error(`image generation failed for node ${nodeId}: ${String(msg)}`)
	}
	if (finalStatus === 'canceled') {
		throw new Error(`image generation canceled for node ${nodeId}`)
	}

	// 5. get_node_info 获取输出文件
	let outputFiles = Array.isArray(finalTask?.outputFiles)
		? finalTask.outputFiles.filter(Boolean)
		: []
	if (outputFiles.length === 0) {
		const info = await executor.callTool(
			'get_node_info',
			{ nodeId },
			{ skipFrontend: false, timeoutMs: 30 * 1000 }
		)
		const maybe = info?.outputFiles || info?.outputs || info?.output || info?.result
		if (Array.isArray(maybe)) outputFiles = maybe.filter((x) => typeof x === 'string' && x)
		else if (typeof maybe === 'string' && maybe) outputFiles = [maybe]
	}

	const exportedFiles = []

	// 6. autoExport
	if (autoExport && outputPath && outputFiles.length > 0) {
		try {
			const outParsed = path.parse(outputPath)
			const stat = fs.existsSync(outputPath) ? fs.statSync(outputPath) : null
			const destIsDir = stat ? stat.isDirectory() : !outParsed.ext
			const destDir = destIsDir ? outputPath : outParsed.dir
			if (destDir && !fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true })
			for (let i = 0; i < outputFiles.length; i++) {
				const src = outputFiles[i]
				if (!fs.existsSync(src)) continue
				let dest
				if (destIsDir) {
					dest = path.join(outputPath, path.basename(src))
				} else if (outputFiles.length === 1) {
					dest = outputPath
				} else {
					const ext = outParsed.ext || path.extname(src) || '.png'
					const base = outParsed.name || `image-${i}`
					dest = path.join(destDir || '.', `${base}_${i + 1}${ext}`)
				}
				fs.copyFileSync(src, dest)
				exportedFiles.push(dest)
			}
		} catch (copyErr) {
			logger.warn(
				`[generate_image][${requestId}] autoExport copy failed (non-fatal): ${copyErr?.message || copyErr}`
			)
		}
	}

	logger.info(
		`[generate_image][${requestId}] node pipeline done. node=${nodeId} outputs=${outputFiles.length} exported=${exportedFiles.length}`
	)
	return {
		ok: true,
		nodeId,
		provider: 'node-pipeline',
		taskStatus: finalTask?.status || 'completed',
		outputFiles,
		exportedFiles,
		_jsonBridge: JSON.stringify({ nodeId, outputFiles, exportedFiles })
	}
}

// 全局 ctx 引用（由 registerBuiltinTools(ctx) 注入）
let _builtinCtx = null

/**
 * 注册 DVStudio 内置工具到统一工具执行器
 * @param {object} [ctx] - 后端上下文（含 localdb.apiKeys 等），供 generate_image 等工具直连后端服务
 */
export function registerBuiltinTools(ctx = null) {
	_builtinCtx = ctx
	const executor = getToolExecutor()

	// ========== get_blueprint_state ==========
	executor.registerTool(
		'get_blueprint_state',
		'获取当前工作流蓝图的状态，包括节点列表、连接关系、选中节点，以及viewport（视口位置与缩放信息）。在创建节点之前建议先调用此工具了解当前蓝图状态。',
		{
			type: 'object',
			properties: {
				includeNodes: {
					type: 'boolean',
					description: '是否包含节点详情，默认 true'
				},
				includeEdges: {
					type: 'boolean',
					description: '是否包含连接详情，默认 true'
				}
			}
		}
	)

	// ========== list_node_types ==========
	executor.registerTool('list_node_types', '列出 DVStudio 支持的节点类型，可按分类筛选', {
		type: 'object',
		properties: {
			category: {
				type: 'string',
				description: '节点分类，如 image、video、3d、text、control 等，可选'
			}
		}
	})

	// ========== create_node ==========
	executor.registerTool(
		'create_node',
		'在工作流蓝图中创建新节点。重要提示：新节点会自动放置在用户当前蓝图视口中心（自动避开已有节点），你不需要也不应该传入position/x/y参数。创建前建议先调用 list_node_types 获取正确的节点类型ID。',
		{
			type: 'object',
			required: ['type'],
			properties: {
				type: {
					type: 'string',
					description:
						'节点类型ID，必须是list_node_types返回的有效type值。常用类型：text-generation(文本节点), image-generation(图片节点), video-generation(视频节点), scene-understanding(场景理解), scene-layout(场景布局), scene-decompose(场景拆解), comfyui(ComfyUI), model3d(3D模型), rotate-image(旋转图片), unreal-export(Unreal导出)'
				},
				title: {
					type: 'string',
					description: '节点显示名称/标题，可选。不指定则使用节点类型默认名称'
				},
				alias: {
					type: 'string',
					description: '节点别名，可选'
				},
				config: {
					type: 'object',
					description: '节点初始配置参数，可选'
				}
			}
		}
	)

	// ========== delete_node ==========
	executor.registerTool('delete_node', '删除工作流蓝图中的指定节点，危险操作需要用户确认', {
		type: 'object',
		required: ['nodeId'],
		properties: {
			nodeId: {
				type: 'string',
				description: '要删除的节点 ID'
			},
			force: {
				type: 'boolean',
				description: '是否强制删除（跳过确认），默认 false'
			}
		}
	})

	// ========== update_node_config ==========
	executor.registerTool('update_node_config', '更新指定节点的配置参数', {
		type: 'object',
		required: ['nodeId', 'config'],
		properties: {
			nodeId: {
				type: 'string',
				description: '节点 ID'
			},
			config: {
				type: 'object',
				description: '要更新的配置项，将与现有配置合并'
			}
		}
	})

	// ========== connect_nodes ==========
	executor.registerTool('connect_nodes', '连接两个节点的指定端口', {
		type: 'object',
		required: ['fromNode', 'fromPort', 'toNode', 'toPort'],
		properties: {
			fromNode: {
				type: 'string',
				description: '源节点 ID'
			},
			fromPort: {
				type: 'string',
				description: '源端口 ID（输出端口）'
			},
			toNode: {
				type: 'string',
				description: '目标节点 ID'
			},
			toPort: {
				type: 'string',
				description: '目标端口 ID（输入端口）'
			}
		}
	})

	// ========== disconnect_nodes ==========
	executor.registerTool('disconnect_nodes', '断开指定的连接', {
		type: 'object',
		properties: {
			edgeId: {
				type: 'string',
				description: '要断开的连接边 ID'
			},
			nodeId: {
				type: 'string',
				description: '节点ID（断开该节点所有连接）'
			},
			portType: {
				type: 'string',
				enum: ['input', 'output', 'all'],
				description: '端口类型，默认all'
			}
		}
	})

	// ========== get_project_info ==========
	executor.registerTool('get_project_info', '获取当前项目的基本信息', {
		type: 'object',
		properties: {}
	})

	// ========== get_node_info ==========
	executor.registerTool('get_node_info', '获取指定节点的详细信息，包括配置、输入输出端口、状态等', {
		type: 'object',
		required: ['nodeId'],
		properties: {
			nodeId: {
				type: 'string',
				description: '节点 ID'
			}
		}
	})

	// ========== select_node ==========
	executor.registerTool('select_node', '选中指定节点，使其在画布中高亮显示', {
		type: 'object',
		required: ['nodeId'],
		properties: {
			nodeId: {
				type: 'string',
				description: '要选中的节点 ID'
			}
		}
	})

	// ========== set_node_text ==========
	executor.registerTool('set_node_text', '设置文本节点的文本内容或其他节点的提示词', {
		type: 'object',
		required: ['nodeId', 'text'],
		properties: {
			nodeId: {
				type: 'string',
				description: '节点 ID'
			},
			text: {
				type: 'string',
				description: '要设置的文本内容'
			}
		}
	})

	// ========== execute_node ==========
	executor.registerTool('execute_node', '执行指定节点（提交生成任务），危险操作需要用户确认', {
		type: 'object',
		required: ['nodeId'],
		properties: {
			nodeId: {
				type: 'string',
				description: '要执行的节点 ID'
			}
		}
	})

	// ========== auto_layout ==========
	executor.registerTool(
		'auto_layout',
		'【仅在用户明确要求时使用】自动排列指定的节点。注意：不要在创建节点后自动调用此工具，节点创建时已自动放置在合适位置。',
		{
			type: 'object',
			properties: {
				nodeIds: {
					type: 'array',
					items: { type: 'string' },
					description:
						'要排列的节点ID列表。如果不提供，将只排列本次会话中新创建的节点，不会影响已有节点。'
				},
				direction: {
					type: 'string',
					enum: ['horizontal', 'vertical'],
					description: '布局方向，默认horizontal'
				},
				spacing: {
					type: 'number',
					description: '节点间距，默认200'
				}
			}
		}
	)

	// ========== list_node_tasks ==========
	executor.registerTool('list_node_tasks', '列出指定节点或所有节点的生成任务记录', {
		type: 'object',
		properties: {
			nodeId: {
				type: 'string',
				description: '节点 ID，可选。不提供则列出所有任务'
			},
			status: {
				type: 'string',
				enum: ['pending', 'running', 'completed', 'failed', 'canceled'],
				description: '按状态筛选，可选'
			}
		}
	})

	// ========== generate_image (P3 新增：复合MCP工具) ==========
	executor.registerTool(
		'generate_image',
		'生成图片的复合 MCP 工具。优先通过 seedream（火山引擎 Ark API）直连生成，若 seedream 失败则回退到节点管线（create_node → execute_node → 轮询完成）。支持提示词、参考图、宽高、宽高比、负向提示词、模型、数量、随机种子、输出路径等参数。当用户的请求包含提示词、参考图、尺寸、输出路径等参数时，优先使用该工具。',
		{
			type: 'object',
			required: ['prompt'],
			properties: {
				prompt: {
					type: 'string',
					description: '图片生成提示词（必填）'
				},
				references: {
					type: 'array',
					description: '参考图本地路径列表（可选），用于图生图、IP适配器、参考风格等',
					items: { type: 'string' }
				},
				width: {
					type: 'number',
					description: '图片宽度（像素，推荐 512/768/1024 等标准值，可选）'
				},
				height: {
					type: 'number',
					description: '图片高度（像素，可选）'
				},
				aspectRatio: {
					type: 'string',
					description:
						'宽高比，如 1:1、16:9、9:16、3:4、4:3（可选，如果指定了width/height则以实际像素为准）'
				},
				negativePrompt: {
					type: 'string',
					description: '负向提示词（可选）'
				},
				model: {
					type: 'string',
					default: 'doubao-seedream-4-5-251128',
					description:
						'使用的生成模型名称或ID（默认 doubao-seedream-4-5-251128，优先走字节方舟 Seedream 接口）。如果传入 gemini/gpt 等非 Seedream 模型 ID，会自动回退到默认 Seedream 模型。'
				},
				imageCount: {
					type: 'number',
					description: '生成图片数量（1-16，默认 1）'
				},
				seed: {
					type: 'number',
					description: '随机种子（可选，不传则随机）'
				},
				outputPath: {
					type: 'string',
					description:
						'生成完成后自动复制到的目标路径。当为目录时将输出逐个复制到目录下；当为文件路径且 imageCount=1 时复制为指定文件名；多个图时按 outputPath 命名规则加后缀（可选）'
				},
				autoExport: {
					type: 'boolean',
					description: '是否在生成完成后自动复制输出文件到 outputPath（默认 true）'
				},
				projectId: {
					type: 'number',
					description: '项目ID（可选，当前未使用，保留）'
				}
			}
		},
		generateImageHandler
	)

	executor.registerIPCBridge()
	logger.info('DVStudio builtin tools registered via ToolExecutor')
}
