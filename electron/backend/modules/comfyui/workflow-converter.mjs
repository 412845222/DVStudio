import crypto from 'node:crypto'

function isRecord(v) {
	return v !== null && typeof v === 'object' && !Array.isArray(v)
}

const UUID_RE = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i

function isUuidType(t) {
	return typeof t === 'string' && UUID_RE.test(t.trim())
}

function deepClone(v) {
	return JSON.parse(JSON.stringify(v))
}

function normalizeNodeId(id) {
	if (id == null) return ''
	const s = String(id).trim()
	if (!s || s === 'undefined' || s === 'null' || s === 'NaN') return ''
	return s
}

function parseLink(l) {
	if (!l) return null
	if (Array.isArray(l) && l.length >= 5) {
		return { id: String(l[0]), fromId: String(l[1]), fromSlot: l[2], toId: String(l[3]), toSlot: l[4], type: l[5] || '*' }
	}
	if (isRecord(l)) {
		return {
			id: String(l.id || crypto.randomUUID()),
			fromId: String(l.origin_id ?? l.fromId ?? l.source_id ?? ''),
			fromSlot: l.origin_slot ?? l.fromSlot ?? l.source_slot ?? 0,
			toId: String(l.target_id ?? l.toId ?? l.dest_id ?? ''),
			toSlot: l.target_slot ?? l.toSlot ?? l.dest_slot ?? 0,
			type: l.type || '*'
		}
	}
	return null
}

function getSubgraphContent(def) {
	if (Array.isArray(def.nodes) && Array.isArray(def.links)) return { nodes: def.nodes, links: def.links }
	if (def.data?.nodes) return { nodes: def.data.nodes, links: def.data.links || [] }
	if (def.graph?.nodes) return { nodes: def.graph.nodes, links: def.graph.links || [] }
	if (def.subgraph?.nodes) return { nodes: def.subgraph.nodes, links: def.subgraph.links || [] }
	return { nodes: [], links: [] }
}

const FRONTEND_ONLY_NODE_TYPES = new Set([
	'MarkdownNote', 'Note', 'Reroute', 'PrimitiveNode',
	'PrimitiveString', 'PrimitiveStringMultiline', 'PrimitiveNumber', 'PrimitiveBoolean',
	'PrimitiveInteger', 'PrimitiveFloat', 'PrimitiveText',
	'GroupNode', 'SubgraphNode', 'ComfyNote', 'NoteNode',
	'NodeNote', 'Comment', 'Annotation', 'Label',
	'WidgetNode', 'Converter', 'RelayNode', 'RerouteNode',
	'FrontendNode', 'VirtualNode', 'PlaceholderNode',
	'QuickNodes', 'TextNote', 'StickyNote'
])

const SOCKET_TYPES = new Set([
	'MODEL', 'CLIP', 'VAE', 'CONDITIONING', 'LATENT', 'IMAGE', 'MASK',
	'SAMPLER', 'SIGMAS', 'AUDIO', 'VIDEO', 'CLIP_VISION_OUTPUT',
	'CONTROL_NET', 'STYLE_MODEL', 'CLIP_VISION', 'GLIGEN',
	'BOOLEAN', 'STRING', 'INT', 'FLOAT', 'NUMBER'
])

function isVirtualOrIgnorableNode(ntype, nid) {
	if (Number(nid) < 0) return true
	if (ntype === 'Note' || ntype === 'MarkdownNote' || ntype === 'StickyNote' || ntype === 'TextNote' || ntype === 'ComfyNote' || ntype === 'NoteNode' || ntype === 'NodeNote') return true
	if (ntype === 'Comment' || ntype === 'Annotation' || ntype === 'Label' || ntype === 'QuickNodes') return true
	if (ntype === 'FrontendNode' || ntype === 'VirtualNode' || ntype === 'PlaceholderNode') return true
	return ntype === 'SubgraphInput' || ntype === 'SubgraphOutput' ||
		ntype === 'ComponentInput' || ntype === 'ComponentOutput' ||
		ntype === 'GraphInput' || ntype === 'GraphOutput' ||
		ntype === 'NodeInput' || ntype === 'NodeOutput' ||
		ntype === 'InputNode' || ntype === 'OutputNode'
}

const RELAY_NODE_TYPES = new Set([
	'Reroute', 'RerouteNode', 'RelayNode', 'Converter', 'WidgetNode'
])

function isRelayNodeType(ntype) {
	return RELAY_NODE_TYPES.has(ntype)
}

function isPrimitiveNodeType(ntype) {
	return ntype === 'PrimitiveNode' || ntype.startsWith('Primitive')
}

function isDataFlowRelay(node) {
	if (!isRecord(node)) return false
	const ct = String(node.type || '').trim()
	if (isRelayNodeType(ct)) return true
	if (structurallyLooksLikeReroute(node)) return true
	return false
}

function isRerouteType(ntype) {
	return ntype === 'Reroute' || ntype === 'RerouteNode' || ntype === 'RelayNode'
}

function isPrimitiveType(ntype) {
	return ntype.startsWith('Primitive') || FRONTEND_ONLY_NODE_TYPES.has(ntype) && (
		ntype === 'PrimitiveNode' || ntype.startsWith('Primitive')
	)
}

function structurallyLooksLikeNote(node) {
	if (!isRecord(node)) return false
	const ct = String(node.type || '').trim()
	if (ct === 'Note' || ct === 'MarkdownNote' || ct === 'StickyNote' || ct === 'TextNote') return true
	return false
}

function structurallyLooksLikeReroute(node) {
	if (!isRecord(node)) return false
	const ct = String(node.type || '').trim()
	if (isRerouteType(ct)) return true
	const inputs = Array.isArray(node.inputs) ? node.inputs : []
	const outputs = Array.isArray(node.outputs) ? node.outputs : []
	if (inputs.length <= 1 && outputs.length <= 1) {
		const inpType = inputs.length === 1 ? String(inputs[0]?.type || '*').trim() : ''
		const outType = outputs.length === 1 ? String(outputs[0]?.type || '*').trim() : ''
		if (inpType === '*' && outType === '*') return true
	}
	return false
}

function structurallyLooksLikePrimitive(node) {
	if (!isRecord(node)) return false
	const ct = String(node.type || '').trim()
	if (isPrimitiveType(ct)) return true
	const inputs = Array.isArray(node.inputs) ? node.inputs : []
	const outputs = Array.isArray(node.outputs) ? node.outputs : []
	const values = Array.isArray(node.widgets_values) ? node.widgets_values : []
	if (inputs.length === 0 && outputs.length <= 1 && values.length >= 1) {
		return true
	}
	if (inputs.length === 0 && outputs.length === 1 && isRecord(outputs[0])) {
		const outType = String(outputs[0].type || '*').trim().toUpperCase()
		if (['*', 'STRING', 'INT', 'FLOAT', 'NUMBER', 'BOOLEAN', 'BOOL'].includes(outType)) {
			return true
		}
	}
	return false
}

function getNodeInputLinks(node) {
	const links = []
	const inputs = Array.isArray(node.inputs) ? node.inputs : []
	for (let si = 0; si < inputs.length; si++) {
		const inp = inputs[si]
		if (!isRecord(inp)) continue
		if (inp.link != null) {
			links.push({ slot: si, linkId: normalizeNodeId(inp.link) })
		} else if (Array.isArray(inp.links) && inp.links.length > 0) {
			links.push({ slot: si, linkId: normalizeNodeId(inp.links[0]) })
		}
	}
	return links
}

function getPrimitiveNodeValue(node) {
	if (!isRecord(node)) return undefined
	const values = Array.isArray(node.widgets_values) ? node.widgets_values : []
	if (values.length > 0) return values[0]
	const inputs = Array.isArray(node.inputs) ? node.inputs : []
	for (const inp of inputs) {
		if (isRecord(inp) && isRecord(inp.widget) && 'value' in inp.widget) {
			return inp.widget.value
		}
	}
	return undefined
}

function extractObjectInfoInputDefs(info) {
	if (!isRecord(info)) return {}
	const raw = info.input
	if (!isRecord(raw)) return {}
	const out = {}
	for (const bucket of ['required', 'optional']) {
		const b = raw[bucket]
		if (!isRecord(b)) continue
		for (const [k, v] of Object.entries(b)) {
			out[k] = v
		}
	}
	return out
}

function isObjectInfoWidgetDef(defn) {
	if (!Array.isArray(defn) || defn.length === 0) return false
	const t = defn[0]
	if (Array.isArray(t)) return true
	if (typeof t === 'string') {
		const tt = t.toUpperCase()
		if (SOCKET_TYPES.has(tt)) {
			if (tt === 'BOOLEAN' || tt === 'STRING' || tt === 'INT' || tt === 'FLOAT' || tt === 'NUMBER') return true
			return false
		}
		return true
	}
	return false
}

function objectInfoValueFits(defn, value) {
	if (!Array.isArray(defn) || defn.length === 0) return false
	const t = defn[0]
	if (Array.isArray(t)) {
		if (typeof value === 'string') return t.includes(value)
		return false
	}
	if (typeof t !== 'string') return false
	const tt = t.toUpperCase()
	if (tt === 'INT') {
		if (typeof value === 'boolean') return false
		if (typeof value === 'number' && Number.isInteger(value)) return true
		if (typeof value === 'string') { const s = value.trim(); return /^-?\d+$/.test(s) }
		return false
	}
	if (tt === 'FLOAT' || tt === 'NUMBER') {
		if (typeof value === 'boolean') return false
		if (typeof value === 'number') return true
		if (typeof value === 'string') { try { return !isNaN(parseFloat(value.trim())) } catch { return false } }
		return false
	}
	if (tt === 'BOOLEAN' || tt === 'BOOL') {
		if (typeof value === 'boolean') return true
		if (typeof value === 'number') return true
		if (typeof value === 'string') { const v = value.trim().toLowerCase(); return ['true', 'false', 'enable', 'disable', 'enabled', 'disabled', '1', '0'].includes(v) }
		return false
	}
	if (tt === 'STRING') return typeof value === 'string'
	return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
}

function objectInfoCoerceValue(defn, value) {
	if (!Array.isArray(defn) || defn.length === 0) return value
	const t = defn[0]
	if (Array.isArray(t)) {
		if (typeof value === 'string' && t.includes(value)) return value
		const d = defn[1]?.default
		return d !== undefined ? d : value
	}
	if (typeof t !== 'string') return value
	const tt = t.toUpperCase()
	if (tt === 'INT') {
		if (typeof value === 'number' && !Number.isNaN(value) && Number.isFinite(value) && typeof value !== 'boolean') return Math.trunc(value)
		if (typeof value === 'string') { try { const n = parseInt(value.trim(), 10); if (!isNaN(n)) return n } catch {} }
		const d = defn[1]?.default; return d !== undefined ? d : value
	}
	if (tt === 'FLOAT' || tt === 'NUMBER') {
		if (typeof value === 'number' && !Number.isNaN(value) && Number.isFinite(value) && typeof value !== 'boolean') return value
		if (typeof value === 'string') { try { const n = parseFloat(value.trim()); if (!isNaN(n)) return n } catch {} }
		const d = defn[1]?.default; return d !== undefined ? d : value
	}
	if (tt === 'BOOLEAN' || tt === 'BOOL') {
		if (typeof value === 'boolean') return value
		if (typeof value === 'number') return Boolean(value)
		if (typeof value === 'string') { const v = value.trim().toLowerCase(); if (['true', 'enable', 'enabled', '1'].includes(v)) return true; if (['false', 'disable', 'disabled', '0'].includes(v)) return false }
		const d = defn[1]?.default; return d !== undefined ? d : value
	}
	if (tt === 'STRING') return String(value)
	return value
}

function collectAllSubgraphDefs(workflow) {
	const defs = new Map()
	function walk(obj) {
		if (!obj || typeof obj !== 'object') return
		if (Array.isArray(obj)) { for (const x of obj) walk(x); return }
		if (Array.isArray(obj.definitions?.subgraphs)) {
			for (const sg of obj.definitions.subgraphs) {
				if (!sg || typeof sg !== 'object') continue
				const sgId = String(sg.id || sg.uuid || '')
				if (!sgId) continue
				if (!defs.has(sgId)) {
					const content = getSubgraphContent(sg)
					defs.set(sgId, {
						id: sgId,
						name: String(sg.name || ''),
						inputNodeId: sg.inputNode?.id != null ? String(sg.inputNode.id) : (sg.inputNode != null ? String(sg.inputNode) : null),
						outputNodeId: sg.outputNode?.id != null ? String(sg.outputNode.id) : (sg.outputNode != null ? String(sg.outputNode) : null),
						nodes: content.nodes,
						links: content.links
					})
				}
				walk(sg)
			}
		}
		for (const v of Object.values(obj)) walk(v)
	}
	walk(workflow)
	return defs
}

function traceOutputs(nodeId, slot, intNodeMap, intOutLinks, vInId, vOutId, visited, idMap) {
	const key = `${nodeId}:${slot}`
	if (visited.has(key)) return []
	visited.add(key)

	const node = intNodeMap.get(nodeId)
	if (!node) {
		if (nodeId !== vInId && nodeId !== vOutId && Number(nodeId) >= 0) {
			const newId = idMap?.get(nodeId)
			if (newId && newId !== '__VIRTUAL__') return [{ nodeId: newId, slot }]
		}
		return []
	}

	const ntype = String(node.type || '').trim()

	if (isRelayNodeType(ntype) || structurallyLooksLikeReroute(node)) {
		const results = []
		const outSlots = intOutLinks.get(nodeId)
		if (outSlots) {
			for (const [outSlot, linkArr] of outSlots) {
				for (const l of linkArr) {
					results.push(...traceOutputs(l.toId, l.toSlot, intNodeMap, intOutLinks, vInId, vOutId, visited, idMap))
				}
			}
		}
		return results
	}

	if (isVirtualOrIgnorableNode(ntype, nodeId)) return []

	const newId = idMap?.get(nodeId)
	if (newId && newId !== '__VIRTUAL__') return [{ nodeId: newId, slot }]
	return []
}

function traceInputs(nodeId, slot, intNodeMap, intInLinks, vInId, vOutId, visited, idMap) {
	const key = `${nodeId}:${slot}`
	if (visited.has(key)) return []
	visited.add(key)

	const node = intNodeMap.get(nodeId)
	if (!node) {
		if (nodeId !== vInId && nodeId !== vOutId && Number(nodeId) >= 0) {
			const newId = idMap?.get(nodeId)
			if (newId && newId !== '__VIRTUAL__') return [{ nodeId: newId, slot }]
		}
		return []
	}

	const ntype = String(node.type || '').trim()

	if (isRelayNodeType(ntype) || structurallyLooksLikeReroute(node)) {
		const results = []
		const inSlots = intInLinks.get(nodeId)
		if (inSlots) {
			for (const [inSlot, linkArr] of inSlots) {
				for (const l of linkArr) {
					results.push(...traceInputs(l.fromId, l.fromSlot, intNodeMap, intInLinks, vInId, vOutId, visited, idMap))
				}
			}
		}
		return results
	}

	if (isPrimitiveNodeType(ntype)) {
		const newId = idMap?.get(nodeId)
		if (newId && newId !== '__VIRTUAL__') return [{ nodeId: newId, slot }]
		return []
	}

	if (isVirtualOrIgnorableNode(ntype, nodeId)) return []

	const newId = idMap?.get(nodeId)
	if (newId && newId !== '__VIRTUAL__') return [{ nodeId: newId, slot }]
	return []
}

function buildInternalConnMaps(nodes, links) {
	const nodeMap = new Map()
	for (const n of nodes) {
		if (n?.id != null) nodeMap.set(String(n.id), n)
	}
	const parsedLinks = links.map(parseLink).filter(Boolean)
	const outLinks = new Map()
	const inLinks = new Map()
	for (const l of parsedLinks) {
		if (!outLinks.has(l.fromId)) outLinks.set(l.fromId, new Map())
		if (!outLinks.get(l.fromId).has(l.fromSlot)) outLinks.get(l.fromId).set(l.fromSlot, [])
		outLinks.get(l.fromId).get(l.fromSlot).push(l)
		if (!inLinks.has(l.toId)) inLinks.set(l.toId, new Map())
		if (!inLinks.get(l.toId).has(l.toSlot)) inLinks.get(l.toId).set(l.toSlot, [])
		inLinks.get(l.toId).get(l.toSlot).push(l)
	}
	return { nodeMap, parsedLinks, outLinks, inLinks }
}

export function flattenWorkflow(workflow) {
	let nodes = deepClone(workflow.nodes || [])
	let links = deepClone(workflow.links || [])
	const allDefs = collectAllSubgraphDefs(workflow)

	let maxId = 0
	for (const n of nodes) {
		const id = Number(n?.id)
		if (Number.isFinite(id) && id > maxId) maxId = id
	}

	let pass = 0
	let expandedAny = true
	while (expandedAny && pass < 30) {
		pass++
		expandedAny = false
		const newNodes = []
		const usedIds = new Set()
		for (const n of nodes) if (n?.id != null) usedIds.add(String(n.id))

		function allocId() {
			maxId++
			while (usedIds.has(String(maxId))) maxId++
			usedIds.add(String(maxId))
			return String(maxId)
		}

		const extParsedLinks = links.map(parseLink).filter(Boolean)
		const extOutBy = new Map()
		const extInBy = new Map()
		for (const l of extParsedLinks) {
			if (!extOutBy.has(l.fromId)) extOutBy.set(l.fromId, new Map())
			if (!extOutBy.get(l.fromId).has(l.fromSlot)) extOutBy.get(l.fromId).set(l.fromSlot, [])
			extOutBy.get(l.fromId).get(l.fromSlot).push(l)
			if (!extInBy.has(l.toId)) extInBy.set(l.toId, new Map())
			if (!extInBy.get(l.toId).has(l.toSlot)) extInBy.get(l.toId).set(l.toSlot, [])
			extInBy.get(l.toId).get(l.toSlot).push(l)
		}

		let foundUuid = null
		for (const n of nodes) {
			if (!n || typeof n !== 'object') { newNodes.push(n); continue }
			const nid = String(n.id)
			const ntype = String(n.type || '').trim()

			if (!isUuidType(ntype) || !allDefs.has(ntype)) {
				newNodes.push(n)
				continue
			}

			foundUuid = { node: n, nid, ntype }
			break
		}

		if (foundUuid) {
			const afterStart = nodes.indexOf(foundUuid.node) + 1
			for (let i = afterStart; i < nodes.length; i++) {
				newNodes.push(nodes[i])
			}

			const { nid, ntype } = foundUuid
			expandedAny = true
			const def = allDefs.get(ntype)
			const defNodes = deepClone(def.nodes)
			const defLinks = deepClone(def.links)
			const vInId = def.inputNodeId
			const vOutId = def.outputNodeId

			const { nodeMap: intNodeMap, outLinks: intOutLinks, inLinks: intInLinks } = buildInternalConnMaps(defNodes, defLinks)

			const idMap = new Map()
			const keptNodes = []
			for (const inNode of defNodes) {
				if (!inNode || typeof inNode !== 'object') continue
				const oldId = String(inNode.id)
				const itype = String(inNode.type || '').trim()
				if (isVirtualOrIgnorableNode(itype, oldId)) {
					idMap.set(oldId, '__VIRTUAL__')
					continue
				}
				const newId = allocId()
				idMap.set(oldId, newId)
				inNode.id = newId
				if (Array.isArray(inNode.inputs)) {
					for (const inp of inNode.inputs) {
						if (inp && typeof inp === 'object') { inp.link = null; if (Array.isArray(inp.links)) inp.links = [] }
					}
				}
				if (Array.isArray(inNode.outputs)) {
					for (const out of inNode.outputs) {
						if (out && typeof out === 'object') { if (Array.isArray(out.links)) out.links = [] }
					}
				}
				keptNodes.push(inNode)
			}

			const inputBridges = new Map()
			if (vInId) {
				const vOutConns = intOutLinks.get(vInId)
				if (vOutConns) {
					for (const [slot, linkArr] of vOutConns) {
						const targets = []
						for (const l of linkArr) {
							const t = traceOutputs(l.toId, l.toSlot, intNodeMap, intOutLinks, vInId, vOutId, new Set(), idMap)
							targets.push(...t)
						}
						inputBridges.set(slot, targets)
					}
				}
			}

			const outputBridges = new Map()
			if (vOutId) {
				const vInConns = intInLinks.get(vOutId)
				if (vInConns) {
					for (const [slot, linkArr] of vInConns) {
						const sources = []
						for (const l of linkArr) {
							const s = traceInputs(l.fromId, l.fromSlot, intNodeMap, intInLinks, vInId, vOutId, new Set(), idMap)
							sources.push(...s)
						}
						outputBridges.set(slot, sources)
					}
				}
			}

			links = links.filter(l => {
				const p = parseLink(l)
				if (!p) return true
				return p.fromId !== nid && p.toId !== nid
			})

			const internalDirectLinks = []
			const seenLinks = new Set()
			for (const inNode of keptNodes) {
				const iNid = String(inNode.id)
				const oldId = [...idMap.entries()].find(([, v]) => v === iNid)?.[0]
				if (!oldId) continue
				const incoming = intInLinks.get(oldId)
				if (!incoming) continue
				for (const [slot, linkArr] of incoming) {
					for (const l of linkArr) {
						if (vInId && l.fromId === vInId) continue
						if (vOutId && l.fromId === vOutId) continue
						const srcs = traceInputs(l.fromId, l.fromSlot, intNodeMap, intInLinks, vInId, vOutId, new Set(), idMap)
						for (const s of srcs) {
							if (s.nodeId === iNid) continue
							const lk = `${s.nodeId}:${s.slot}->${iNid}:${slot}`
							if (seenLinks.has(lk)) continue
							seenLinks.add(lk)
							internalDirectLinks.push([crypto.randomUUID(), s.nodeId, s.slot, iNid, slot, l.type])
						}
					}
				}
			}
			for (const il of internalDirectLinks) links.push(il)

			const extIns = extInBy.get(nid)
			if (extIns) {
				for (const [slot, srcLinks] of extIns) {
					const targets = inputBridges.get(slot) || []
					for (const sl of srcLinks) {
						for (const t of targets) {
							links.push([crypto.randomUUID(), sl.fromId, sl.fromSlot, t.nodeId, t.slot, sl.type])
						}
					}
				}
			}
			const extOuts = extOutBy.get(nid)
			if (extOuts) {
				for (const [slot, tgtLinks] of extOuts) {
					const sources = outputBridges.get(slot) || []
					for (const tl of tgtLinks) {
						for (const s of sources) {
							links.push([crypto.randomUUID(), s.nodeId, s.slot, tl.toId, tl.toSlot, tl.type])
						}
					}
				}
			}

			for (const kn of keptNodes) newNodes.push(kn)
		}
		nodes = newNodes
	}

	return { nodes, links }
}

export function buildPromptFromFlat(flatNodes, flatLinks, objectInfo) {
	const validTypes = new Set(Object.keys(objectInfo || {}))
	const nodeMap = new Map()
	for (const n of flatNodes) {
		if (n?.id != null) nodeMap.set(String(n.id), n)
	}

	const linkFromById = new Map()
	const linkToById = new Map()
	const nodeInputLinksMap = new Map()
	const connsByTo = new Map()
	const rerouteNodeIds = new Set()
	const valueProviderNodes = new Map()
	const unknownTypes = new Set()

	for (const l of flatLinks) {
		const p = parseLink(l)
		if (!p) continue
		linkFromById.set(p.id, { origin_id: p.fromId, origin_slot: p.fromSlot })
		linkToById.set(p.id, { target_id: p.toId, target_slot: p.toSlot })
		if (!nodeInputLinksMap.has(p.toId)) nodeInputLinksMap.set(p.toId, [])
		nodeInputLinksMap.get(p.toId).push({ linkId: p.id, fromNodeId: p.fromId, fromSlot: p.fromSlot, toSlot: p.toSlot })
		const connKey = `${p.toId}:${p.toSlot}`
		if (!connsByTo.has(connKey)) connsByTo.set(connKey, [])
		connsByTo.get(connKey).push(p)
	}

	for (const [nid, node] of nodeMap) {
		const ct = String(node.type || '').trim()
		if (structurallyLooksLikeNote(node)) {
			if (!structurallyLooksLikePrimitive(node) && !structurallyLooksLikeReroute(node)) {
				rerouteNodeIds.add(nid)
				continue
			}
		}
		if (structurallyLooksLikeReroute(node)) {
			rerouteNodeIds.add(nid)
			continue
		}
		if (structurallyLooksLikePrimitive(node)) {
			const v = getPrimitiveNodeValue(node)
			if (v !== undefined) {
				valueProviderNodes.set(nid, v)
			} else if (nodeInputLinksMap.has(nid)) {
				rerouteNodeIds.add(nid)
			}
			continue
		}
		if (FRONTEND_ONLY_NODE_TYPES.has(ct)) {
			if (nodeInputLinksMap.has(nid)) {
				rerouteNodeIds.add(nid)
			} else {
				const v = getPrimitiveNodeValue(node)
				if (v !== undefined) {
					valueProviderNodes.set(nid, v)
				}
			}
			continue
		}
	}

	const finalPromptNodeIds = new Set()
	for (const [nid, node] of nodeMap) {
		if (rerouteNodeIds.has(nid) || valueProviderNodes.has(nid)) continue
		const ct = String(node.type || '').trim()
		if (!ct) continue
		if (structurallyLooksLikeNote(node) || structurallyLooksLikePrimitive(node) || structurallyLooksLikeReroute(node)) continue
		if (FRONTEND_ONLY_NODE_TYPES.has(ct)) continue
		finalPromptNodeIds.add(nid)
		if (!validTypes.has(ct)) {
			unknownTypes.add(ct)
		}
	}

	function inputHasConnection(inp, nodeId, slotIdx) {
		const ck = `${nodeId}:${slotIdx}`
		if (connsByTo.has(ck)) return true
		if (inp.link != null) return true
		if (Array.isArray(inp.links) && inp.links.length > 0) return true
		return false
	}

	function getInputLinkId(inp, nodeId, slotIdx) {
		const ck = `${nodeId}:${slotIdx}`
		const slotConns = connsByTo.get(ck)
		if (slotConns && slotConns.length > 0) return slotConns[0].id
		if (inp.link != null) return normalizeNodeId(inp.link)
		if (Array.isArray(inp.links) && inp.links.length > 0) return normalizeNodeId(inp.links[0])
		return null
	}

	function resolveLinkSource(linkId, visited) {
		if (visited.has(linkId)) return null
		visited.add(linkId)
		const fromInfo = linkFromById.get(linkId)
		if (!fromInfo) return null
		const { origin_id, origin_slot } = fromInfo
		if (valueProviderNodes.has(origin_id)) {
			return { value: valueProviderNodes.get(origin_id) }
		}
		if (finalPromptNodeIds.has(origin_id)) {
			return { nodeId: origin_id, slot: origin_slot }
		}
		const relayNode = nodeMap.get(origin_id)
		if (!isRecord(relayNode)) return null

		const relayNodeId = String(relayNode.id)
		const relayInputs = Array.isArray(relayNode.inputs) ? relayNode.inputs : []
		const relayOutputs = Array.isArray(relayNode.outputs) ? relayNode.outputs : []

		let targetInputIndex = -1
		const targetOutput = relayOutputs[origin_slot]
		if (isRecord(targetOutput)) {
			const targetOutType = String(targetOutput.type || '*').trim().toUpperCase()
			const targetOutName = String(targetOutput.name || '').trim().toLowerCase()
			for (let i = 0; i < relayInputs.length; i++) {
				const inp = relayInputs[i]
				if (!isRecord(inp)) continue
				const inType = String(inp.type || '*').trim().toUpperCase()
				const inName = String(inp.name || '').trim().toLowerCase()
				if (inType === targetOutType || inName === targetOutName) {
					if (inputHasConnection(inp, relayNodeId, i)) {
						targetInputIndex = i
						break
					}
				}
			}
			if (targetInputIndex < 0 && origin_slot < relayInputs.length) {
				const candidate = relayInputs[origin_slot]
				if (isRecord(candidate) && inputHasConnection(candidate, relayNodeId, origin_slot)) {
					targetInputIndex = origin_slot
				}
			}
		}
		if (targetInputIndex < 0) {
			for (let i = 0; i < relayInputs.length; i++) {
				const inp = relayInputs[i]
				if (!isRecord(inp)) continue
				if (inputHasConnection(inp, relayNodeId, i)) {
					targetInputIndex = i
					break
				}
			}
		}

		if (targetInputIndex < 0) {
			const v = getPrimitiveNodeValue(relayNode)
			if (v !== undefined) {
				return { value: v }
			}
			return null
		}

		const targetInput = relayInputs[targetInputIndex]
		const prevLinkId = getInputLinkId(targetInput, relayNodeId, targetInputIndex)
		if (!prevLinkId) {
			const v = getPrimitiveNodeValue(relayNode)
			if (v !== undefined) {
				return { value: v }
			}
			return null
		}
		return resolveLinkSource(prevLinkId, visited)
	}

	const prompt = {}
	const unresolvedConnections = []

	for (const [nid, node] of nodeMap) {
		if (!finalPromptNodeIds.has(nid)) continue
		const classType = String(node.type || '').trim()
		if (!classType) continue

		const objDefs = extractObjectInfoInputDefs(objectInfo[classType])

		const inputsList = Array.isArray(node.inputs) ? node.inputs : []
		const widgetValues = Array.isArray(node.widgets_values) ? [...node.widgets_values] : []
		const inputs = {}
		const linkedNames = new Set()

		const inputWidgetValues = new Map()
		for (const inp of inputsList) {
			if (!isRecord(inp)) continue
			const inpName = String(inp.name || '').trim()
			if (!inpName) continue
			if (isRecord(inp.widget) && 'value' in inp.widget) {
				inputWidgetValues.set(inpName, inp.widget.value)
			}
		}

		for (let si = 0; si < inputsList.length; si++) {
			const inp = inputsList[si]
			if (!isRecord(inp)) continue
			const name = String(inp.name || '').trim()
			if (!name) continue
			let inputLinkId = null
			const connKey = `${nid}:${si}`
			const slotConns = connsByTo.get(connKey)
			if (slotConns && slotConns.length > 0) {
				inputLinkId = slotConns[0].id
			}
			if (!inputLinkId) {
				if (inp.link != null) {
					inputLinkId = normalizeNodeId(inp.link)
				} else if (Array.isArray(inp.links) && inp.links.length > 0) {
					inputLinkId = normalizeNodeId(inp.links[0])
				}
			}
			if (inputLinkId) {
				const resolved = resolveLinkSource(inputLinkId, new Set())
				if (!resolved) {
					const fromInfo = linkFromById.get(inputLinkId)
					const connKey = `${nid}:${si}`
					const slotConns = connsByTo.get(connKey)
					const connsSummary = slotConns ? slotConns.map(c => `[${c.fromId}:${c.fromSlot}→${c.toId}:${c.toSlot} id=${c.id}]`).join(', ') : 'none'
					unresolvedConnections.push({
						targetNodeId: nid,
						targetClassType: classType,
						targetInputName: name,
						targetSlotIndex: si,
						linkId: inputLinkId,
						sourceNodeId: fromInfo ? fromInfo.origin_id : null,
						sourceSlotIndex: fromInfo ? fromInfo.origin_slot : null,
						connsByToSlot: connsSummary,
						inpLinks: Array.isArray(inp.links) ? inp.links : null,
						inpLink: inp.link != null ? inp.link : null
					})
					continue
				}
				if ('value' in resolved) {
					inputs[name] = resolved.value
					linkedNames.add(name)
				} else {
					inputs[name] = [String(resolved.nodeId), resolved.slot]
					linkedNames.add(name)
				}
			}
		}

		if (inputWidgetValues.size > 0) {
			for (const [wname, wval] of inputWidgetValues) {
				if (wname in inputs || linkedNames.has(wname)) continue
				inputs[wname] = wval
			}
		}

		const orderedWidgetNames = []
		if (Object.keys(objDefs).length > 0) {
			for (const inp of inputsList) {
				if (!isRecord(inp)) continue
				const name = String(inp.name || '').trim()
				if (!name || linkedNames.has(name) || name in inputs) continue
				if (!isObjectInfoWidgetDef(objDefs[name])) continue
				orderedWidgetNames.push(name)
			}
		}

		if (orderedWidgetNames.length > 0 && widgetValues.length > 0) {
			let idx = 0
			for (const name of orderedWidgetNames) {
				if (name in inputs) continue
				const defn = objDefs[name]
				let assigned = false
				while (idx < widgetValues.length) {
					const cand = widgetValues[idx]
					if (objectInfoValueFits(defn, cand)) {
						inputs[name] = objectInfoCoerceValue(defn, cand)
						idx++
						assigned = true
						break
					}
					idx++
				}
				if (!assigned) {
					const d = defn?.[1]?.default
					if (d !== undefined) inputs[name] = d
				}
			}
		} else {
			let valueIdx = 0
			for (let si = 0; si < inputsList.length; si++) {
				const inp = inputsList[si]
				if (!isRecord(inp)) continue
				const name = String(inp.name || '').trim()
				if (!name || name in inputs) continue
				if (inputHasConnection(inp, nid, si)) continue
				const inpType = String(inp.type || '').trim().toUpperCase()
				const isKnownSocket = /^(MODEL|CLIP|VAE|CONDITIONING|LATENT|IMAGE|MASK|SAMPLER|SIGMAS|AUDIO|VIDEO|CLIP_VISION_OUTPUT|CONTROL_NET|STYLE_MODEL|CLIP_VISION|UPSCALE_MODEL|GLIGEN|NOISE|GUIDER|BOOST|WEBCAM|IPADAPTER|FACEID|INSTANTID|FACEMASK)$/.test(inpType)
				if (isKnownSocket) continue
				if (valueIdx < widgetValues.length) {
					inputs[name] = widgetValues[valueIdx]
					valueIdx++
				}
			}
		}

		const nodeMeta = isRecord(node._meta) ? { ...node._meta } : {}
		if (node.title && !nodeMeta.title) nodeMeta.title = String(node.title)
		if (node.type && !nodeMeta.node_type) nodeMeta.node_type = String(node.type)
		if (Array.isArray(node.pos) && node.pos.length >= 2) {
			const px = Number(node.pos[0]), py = Number(node.pos[1])
			if (Number.isFinite(px) && Number.isFinite(py)) nodeMeta.pos = [px, py]
		}
		prompt[nid] = { class_type: classType, inputs, _meta: nodeMeta }
	}

	let error = null
	if (Object.keys(prompt).length === 0) {
		error = 'workflow contains no executable nodes'
	}

	const warnings = unresolvedConnections.length > 0
		? unresolvedConnections.map(c => `unresolved link ${c.linkId}: ${c.targetClassType}[${c.targetNodeId}].${c.targetInputName} (slot ${c.targetSlotIndex}) <- source[${c.sourceNodeId}:${c.sourceSlotIndex}] connsByTo[${c.connsByToSlot}] inp.link=${c.inpLink} inp.links=${JSON.stringify(c.inpLinks)}`)
		: undefined

	return { prompt, error, warnings }
}

export function workflowToPrompt(workflow, objectInfo) {
	const { nodes: flatNodes, links: flatLinks } = flattenWorkflow(workflow)
	const flatNodeMap = new Map()
	for (const n of flatNodes) {
		if (n?.id != null) flatNodeMap.set(String(n.id), n)
	}
	const saveVideoNodes = flatNodes.filter(n => String(n?.type || '').includes('SaveVideo'))
	if (saveVideoNodes.length > 0) {
		console.log('[ComfyUI workflow-converter] After flattening:')
		console.log(`  total flatNodes: ${flatNodes.length}, total flatLinks: ${flatLinks.length}`)
		for (const sv of saveVideoNodes) {
			const svId = String(sv.id)
			const svInputs = Array.isArray(sv.inputs) ? sv.inputs : []
			console.log(`  SaveVideo[${svId}] inputs:`, svInputs.map((i, idx) => {
				if (!i || typeof i !== 'object') return `[${idx}] <invalid>`
				return `[${idx}] ${i.name} (type=${i.type}, link=${i.link}, links=${JSON.stringify(i.links)})`
			}))
			const incomingLinks = flatLinks.filter(l => {
				const p = parseLink(l)
				return p && p.toId === svId
			})
			console.log(`  SaveVideo[${svId}] incoming flatLinks:`, incomingLinks.map(l => {
				const p = parseLink(l)
				const srcNode = flatNodeMap.get(p.fromId)
				return `id=${p.id} ${p.fromId}(${srcNode?.type || 'unknown'}):${p.fromSlot} → ${p.toId}:${p.toSlot} type=${p.type}`
			}))
		}
	}
	return buildPromptFromFlat(flatNodes, flatLinks, objectInfo)
}
