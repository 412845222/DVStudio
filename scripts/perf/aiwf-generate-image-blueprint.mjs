#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const asInt = (value, fallback = 0) => {
	const n = Number(value)
	return Number.isFinite(n) ? Math.floor(n) : fallback
}

const parseArgs = (argv) => {
	const args = {
		out: '',
		count: 500,
		resources: 200,
		seed: Date.now(),
		projectId: 0,
		mediaRelRoot: 'Content/Media/images/imported/20260615'
	}

	for (let i = 0; i < argv.length; i += 1) {
		const token = argv[i]
		const next = argv[i + 1]
		if (token === '--out' && next) {
			args.out = next
			i += 1
			continue
		}
		if (token === '--count' && next) {
			args.count = Math.max(1, asInt(next, args.count))
			i += 1
			continue
		}
		if (token === '--resources' && next) {
			args.resources = Math.max(1, asInt(next, args.resources))
			i += 1
			continue
		}
		if (token === '--seed' && next) {
			args.seed = asInt(next, args.seed)
			i += 1
			continue
		}
		if (token === '--projectId' && next) {
			args.projectId = Math.max(0, asInt(next, 0))
			i += 1
			continue
		}
		if (token === '--mediaRelRoot' && next) {
			args.mediaRelRoot = String(next)
			i += 1
		}
	}

	return args
}

const toAbs = (p) => (path.isAbsolute(p) ? p : path.resolve(process.cwd(), p))

const mulberry32 = (seed) => {
	let t = seed >>> 0
	return () => {
		t += 0x6d2b79f5
		let r = Math.imul(t ^ (t >>> 15), 1 | t)
		r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
		return ((r ^ (r >>> 14)) >>> 0) / 4294967296
	}
}

const pad = (n, width = 4) => String(n).padStart(width, '0')

const buildResourceUrl = (projectId, relPath) => {
	const query = new URLSearchParams()
	if (projectId > 0) query.set('projectId', String(projectId))
	else query.set('projectId', '1')
	query.set('path', relPath)
	return `dweb://project-assets?${query.toString()}`
}

const ensureDir = (filePath) => {
	const dir = path.dirname(filePath)
	fs.mkdirSync(dir, { recursive: true })
}

const main = () => {
	const args = parseArgs(process.argv.slice(2))
	if (!args.out) {
		throw new Error('Missing --out path. Example: --out ./tmp/blueprint.json')
	}

	const now = Date.now()
	const random = mulberry32(args.seed || now)
	const nodeCount = Math.max(1, args.count)
	const resourceCount = Math.max(1, Math.min(args.resources, nodeCount))

	const columns = Math.max(1, Math.ceil(Math.sqrt(nodeCount)))
	const cellW = 360
	const cellH = 300
	const nodeWidth = 240
	const nodeHeight = 220

	const resourcesById = {}
	const resourceOrder = []

	for (let i = 0; i < resourceCount; i += 1) {
		const rid = `res-img-${pad(i + 1)}`
		const file = `stress_image_${pad(i + 1)}.png`
		const relPath = `${String(args.mediaRelRoot || '')
			.replace(/\\/g, '/')
			.replace(/\/$/, '')}/${file}`
		const baseUrl = buildResourceUrl(args.projectId, relPath)
		resourcesById[rid] = {
			id: rid,
			kind: 'image',
			name: file,
			url: baseUrl,
			projectRelativePath: relPath,
			previewUrl: `${baseUrl}&variant=preview&maxSize=640`,
			previewVersion: `seed-${args.seed}-res-${i + 1}`,
			createdAt: now
		}
		resourceOrder.push(rid)
	}

	const nodesById = {}
	const nodeOrder = []
	const edgesById = {}
	const edgeOrder = []

	for (let i = 0; i < nodeCount; i += 1) {
		const nodeId = `wf-perf-img-${pad(i + 1)}`
		const col = i % columns
		const row = Math.floor(i / columns)
		const worldX = Math.round((col - columns / 2) * cellW)
		const worldY = row * cellH
		const rid = resourceOrder[i % resourceOrder.length]

		nodesById[nodeId] = {
			id: nodeId,
			type: 'image',
			title: `图片节点 ${pad(i + 1)}`,
			worldX,
			worldY,
			width: nodeWidth,
			height: nodeHeight,
			resourceId: rid,
			inputs: [{ id: 'in-image', label: '输入', mediaType: 'image' }],
			outputs: [{ id: 'out-image', label: '输出', mediaType: 'image' }],
			imageSettings: {
				outputWidth: 1024,
				outputHeight: 1024,
				naturalWidth: 1024,
				naturalHeight: 1024,
				cropEnabled: false,
				crop: { x: 0, y: 0, width: 1, height: 1 }
			},
			createdAt: now + i
		}
		nodeOrder.push(nodeId)

		if (i > 0) {
			const prevNodeId = nodeOrder[i - 1]
			const edgeId = `edge-${pad(i)}`
			edgesById[edgeId] = {
				id: edgeId,
				fromNodeId: prevNodeId,
				fromAnchorId: 'out-image',
				toNodeId: nodeId,
				toAnchorId: 'in-image',
				createdAt: now + i
			}
			edgeOrder.push(edgeId)
		}

		if (i > 0 && random() > 0.58) {
			const jumpBack = Math.max(1, Math.floor(random() * Math.min(i, 12)))
			const fromIdx = i - jumpBack
			const fromNodeId = nodeOrder[fromIdx]
			const edgeId = `edge-x-${pad(i)}-${pad(fromIdx)}`
			edgesById[edgeId] = {
				id: edgeId,
				fromNodeId,
				fromAnchorId: 'out-image',
				toNodeId: nodeId,
				toAnchorId: 'in-image',
				createdAt: now + i
			}
			edgeOrder.push(edgeId)
		}
	}

	const snapshot = {
		schemaVersion: 1,
		generatedAt: now,
		seed: args.seed,
		viewport: {
			zoom: 0.45,
			panX: 0,
			panY: 0
		},
		nodesById,
		nodeOrder,
		edgesById,
		edgeOrder,
		resourcesById,
		resourceOrder,
		selectedNodeId: null,
		selectedNodeIds: [],
		selectedEdgeId: null,
		clipboardNode: null,
		clipboardNodes: null,
		clipboardPrimaryNodeId: null,
		chatDraft: ''
	}

	const outPath = toAbs(args.out)
	ensureDir(outPath)
	fs.writeFileSync(outPath, JSON.stringify(snapshot, null, 2), 'utf8')
	console.log(`[aiwf-generate-image-blueprint] wrote ${outPath}`)
	console.log(
		`[aiwf-generate-image-blueprint] nodes=${nodeOrder.length} edges=${edgeOrder.length} resources=${resourceOrder.length}`
	)
}

try {
	main()
} catch (error) {
	console.error('[aiwf-generate-image-blueprint] Failed:', error?.message || error)
	process.exit(1)
}
