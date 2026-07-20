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

function isVirtualOrIgnorableNode(ntype, nid) {
	if (Number(nid) < 0) return true
	return ntype === 'Note' || ntype === 'MarkdownNote' ||
		ntype === 'SubgraphInput' || ntype === 'SubgraphOutput' ||
		ntype === 'ComponentInput' || ntype === 'ComponentOutput' ||
		ntype === 'GraphInput' || ntype === 'GraphOutput' ||
		ntype === 'NodeInput' || ntype === 'NodeOutput' ||
		ntype === 'InputNode' || ntype === 'OutputNode'
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
	if (isVirtualOrIgnorableNode(ntype, nodeId)) return []

	if (ntype === 'Reroute') {
		const results = []
		const out = intOutLinks.get(nodeId)?.get(0) || []
		for (const l of out) {
			results.push(...traceOutputs(l.toId, l.toSlot, intNodeMap, intOutLinks, vInId, vOutId, visited, idMap))
		}
		return results
	}

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
	if (isVirtualOrIgnorableNode(ntype, nodeId)) return []

	if (ntype === 'Reroute') {
		const results = []
		const ins = intInLinks.get(nodeId)?.get(0) || []
		for (const l of ins) {
			results.push(...traceInputs(l.fromId, l.fromSlot, intNodeMap, intInLinks, vInId, vOutId, visited, idMap))
		}
		return results
	}

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
						const srcs = traceOutputs(l.fromId, l.fromSlot, intNodeMap, intOutLinks, vInId, vOutId, new Set(), idMap)
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

function widgetMatches(defn, v) {
	if (!Array.isArray(defn) || defn.length === 0) return true
	const t = defn[0]
	if (Array.isArray(t)) return typeof v === 'string'
	if (typeof t !== 'string') return true
	const tt = t.toUpperCase()
	if (tt === 'INT') return (typeof v === 'number' && Number.isInteger(v)) || (typeof v === 'string' && /^-?\d+$/.test(v))
	if (tt === 'FLOAT') return typeof v === 'number' || (typeof v === 'string' && !isNaN(parseFloat(v)))
	if (tt === 'BOOLEAN') return typeof v === 'boolean'
	if (tt === 'STRING') return typeof v === 'string'
	return true
}

function coerceVal(defn, v) {
	if (!Array.isArray(defn)) return v
	const t = defn[0]
	const opts = defn[1]
	if (Array.isArray(t)) {
		const validOpts = t
		if (validOpts.includes(v)) return v
		if (opts?.default !== undefined && validOpts.includes(opts.default)) return opts.default
		return validOpts[0]
	}
	if (typeof t !== 'string') return v
	const tt = t.toUpperCase()
	if (tt === 'INT') { const n = parseInt(v); return isNaN(n) ? v : n }
	if (tt === 'FLOAT') { const n = parseFloat(v); return isNaN(n) ? v : n }
	if (tt === 'BOOLEAN') return Boolean(v)
	if (tt === 'STRING') return String(v)
	return v
}

export function buildPromptFromFlat(flatNodes, flatLinks, objectInfo) {
	const validTypes = new Set(Object.keys(objectInfo))
	const nodeMap = new Map()
	for (const n of flatNodes) {
		if (n?.id != null) nodeMap.set(String(n.id), n)
	}

	const conns = new Map()
	for (const l of flatLinks) {
		const p = parseLink(l)
		if (!p) continue
		const k = `${p.toId}:${p.toSlot}`
		if (!conns.has(k)) conns.set(k, [])
		conns.get(k).push(p)
	}

	function resolveSrc(nodeId, slot, visited) {
		const k = `${nodeId}:${slot}`
		if (visited.has(k)) return null
		visited.add(k)
		const arr = conns.get(k)
		if (!arr || arr.length === 0) return null
		const c = arr[0]
		const src = nodeMap.get(c.fromId)
		if (!src) return { nodeId: c.fromId, slot: c.fromSlot }
		const st = String(src.type || '').trim()
		if (st === 'Reroute') return resolveSrc(c.fromId, 0, visited)
		if (st.startsWith('Primitive')) {
			const wv = Array.isArray(src.widgets_values) ? src.widgets_values : []
			if (wv.length > 0) return { value: wv[0] }
		}
		return { nodeId: c.fromId, slot: c.fromSlot }
	}

	const prompt = {}
	const unknownTypes = new Set()
	for (const n of flatNodes) {
		if (!n || typeof n !== 'object') continue
		const nid = String(n.id)
		const ct = String(n.type || '').trim()
		if (ct === 'Reroute' || ct === 'Note' || ct === 'MarkdownNote' || ct.startsWith('Primitive')) continue
		if (!validTypes.has(ct)) {
			unknownTypes.add(ct)
			continue
		}

		const objDefs = {}
		const oi = objectInfo[ct]?.input
		if (oi?.required) Object.assign(objDefs, oi.required)
		if (oi?.optional) Object.assign(objDefs, oi.optional)

		const inputs = {}
		const iList = Array.isArray(n.inputs) ? n.inputs : []
		const wv = Array.isArray(n.widgets_values) ? [...n.widgets_values] : []

		for (let si = 0; si < iList.length; si++) {
			const inp = iList[si]
			if (!inp || typeof inp !== 'object') continue
			const name = String(inp.name || '').trim()
			if (!name) continue
			const res = resolveSrc(nid, si, new Set())
			if (res) {
				inputs[name] = 'value' in res ? res.value : [String(res.nodeId), res.slot]
				continue
			}
			if (inp.widget != null && wv.length > 0) {
				const defn = objDefs[name]
				let found = -1
				for (let wi = 0; wi < wv.length; wi++) {
					if (widgetMatches(defn, wv[wi])) { found = wi; break }
				}
				if (found >= 0) {
					inputs[name] = coerceVal(defn, wv[found])
					wv.splice(found, 1)
				} else if (defn?.[1]?.default !== undefined) {
					inputs[name] = defn[1].default
				}
			}
		}

		prompt[nid] = { class_type: ct, inputs }
	}

	let error = null
	if (unknownTypes.size > 0) {
		error = `workflow contains unknown node types: ${[...unknownTypes].join(', ')}`
	}

	return { prompt, error }
}

export function workflowToPrompt(workflow, objectInfo) {
	const { nodes: flatNodes, links: flatLinks } = flattenWorkflow(workflow)
	return buildPromptFromFlat(flatNodes, flatLinks, objectInfo)
}
