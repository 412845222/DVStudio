import { Scene } from '../graphbase/scene/Scene'
import { Vector2 } from '../graphbase/core/Vector2'
import { BlueprintNode, clearBlueprintNodeImageCache } from './BlueprintNode'
import { Connection, TempConnection } from './Connection'
import { Port } from './Port'
import { BlueprintGrid } from './BlueprintGrid'
import type { RenderContext } from '../graphbase/renderer/RenderContext'
import { BlueprintEditorTool } from './BlueprintEditorTool'
import type {
	BlueprintNodeData,
	BlueprintData,
	ConnectionData,
	SavedSelectionFrameData,
	LegacyBlueprintData,
	LegacyResourceData
} from './types'
import { CURRENT_SCHEMA_VERSION, DEFAULT_NODE_SIZES, clampZoom, clampPan } from './types'
import type { PortSpec } from './types'
import type { SavedSelectionFrame } from './SelectionFrame'
import { BlueprintLegacyLoader } from './BlueprintLegacyLoader'
import { BlueprintLegacySaver } from './BlueprintLegacySaver'
import { CommandStack } from '../graphbase/commands/CommandStack'
import type { Command } from '../graphbase/commands/Command'
import { PasteCommand } from './commands/PasteCommand'
import { AddNodeCommand } from './commands/AddNodeCommand'
import { CreateConnectionCommand } from './commands/CreateConnectionCommand'
import { DeleteSelectionCommand } from './commands/DeleteSelectionCommand'
import { ResizeNodeCommand } from './commands/ResizeNodeCommand'
import { MoveNodeCommand } from '../graphbase/commands/CompositeCommand'
import { ThemeManager, getThemeManager } from './theme'
import { I18nManager, getI18nManager } from './i18n'

interface PendingConnection {
	fromNode: BlueprintNode
	fromPort: Port
	currentPos: Vector2
	isValid: boolean
}

function portsChanged(a: PortSpec[] | undefined, b: PortSpec[] | undefined): boolean {
	const arrA = Array.isArray(a) ? a : []
	const arrB = Array.isArray(b) ? b : []
	if (arrA.length !== arrB.length) return true
	for (let i = 0; i < arrA.length; i++) {
		const pa = arrA[i]
		const pb = arrB[i]
		if (!pa || !pb) return true
		if (pa.id !== pb.id || pa.label !== pb.label || pa.mediaType !== pb.mediaType) return true
	}
	return false
}

function portSpecsSignature(ports: PortSpec[] | undefined): string {
	const arr = Array.isArray(ports) ? ports : []
	return arr.map((p) => `${p.id}:${p.label}:${p.mediaType}`).join(',')
}

export class BlueprintScene extends Scene {
	private _nodeMap: Map<string, BlueprintNode> = new Map()
	private _connectionMap: Map<string, Connection> = new Map()
	private _grid: BlueprintGrid
	private _tempConnection: TempConnection
	private _pendingConnection: PendingConnection | null = null
	private _savedSelectionFrames: Map<string, SavedSelectionFrame> = new Map()
	private _legacyResources: Record<string, LegacyResourceData> = {}
	private _lastLoadSignature = ''
	private _clipboardNodes: BlueprintNodeData[] = []
	private _clipboardEdges: ConnectionData[] = []
	public isEngineDragging: boolean = false
	public isDomInteractionLocked: boolean = false
	private _isViewportPanning: boolean = false
	private _lastMouseWorldPos: Vector2 | null = null
	private _themeManager: ThemeManager
	private _i18nManager: I18nManager
	private _unsubscribeTheme: (() => void) | null = null
	private _unsubscribeI18n: (() => void) | null = null

	get theme(): ThemeManager {
		return this._themeManager
	}

	get i18n(): I18nManager {
		return this._i18nManager
	}

	get isViewportPanning(): boolean {
		return this._isViewportPanning
	}
	set isViewportPanning(value: boolean) {
		const wasPanning = this._isViewportPanning
		this._isViewportPanning = value
		if (wasPanning && !value) {
			this.requestRedraw()
			this.requestContinuousFrames(3)
		}
	}

	constructor(canvas: HTMLCanvasElement) {
		super(canvas, { backgroundColor: null, enableDefaultTools: false })

		this._themeManager = getThemeManager()
		this._i18nManager = getI18nManager()

		const forceFullRedraw = () => {
			// Mark all nodes dirty for complete redraw
			for (const node of this._nodeMap.values()) {
				node.markDirty(1)
			}
			for (const conn of this._connectionMap.values()) {
				conn.markDirty(1)
			}
			this._grid.markDirty(1)
			this._tempConnection.markDirty(1)
			this.requestRedraw(true)
		}

		this._unsubscribeTheme = this._themeManager.onChange(() => {
			forceFullRedraw()
		})
		this._unsubscribeI18n = this._i18nManager.onChange(() => {
			forceFullRedraw()
		})

		this._grid = new BlueprintGrid()
		this.addChild(this._grid)

		this._tempConnection = new TempConnection()
		this._tempConnection.visible = false
		this.addChild(this._tempConnection)

		this.tools.registerTool(new BlueprintEditorTool())
		this.tools.setDefaultTool('blueprint_editor')

		this.camera.minZoom = 0.2
		this.camera.maxZoom = 6

		this.commands.on.on('execute', () => this.on.emit('after-command'))
		this.commands.on.on('undo', () => this.on.emit('after-command'))
		this.commands.on.on('redo', () => this.on.emit('after-command'))
	}

	onResize(_width: number, _height: number): void {
		this.requestRedraw()
	}

	get legacyResources(): Record<string, LegacyResourceData> {
		return this._legacyResources
	}

	onViewportChanged(): void {
		this.requestRedraw()
	}

	getAllBlueprintNodes(): BlueprintNode[] {
		return Array.from(this._nodeMap.values())
	}

	getAllConnections(): Connection[] {
		return Array.from(this._connectionMap.values())
	}

	executeCommand(command: Command): void {
		this.commands.execute(command)
		this.syncLoadSignature()
	}

	undo(): boolean {
		const result = super.undo()
		if (result) {
			this.updateAllConnectionEndpoints()
			this.syncLoadSignature()
		}
		return result
	}

	redo(): boolean {
		const result = super.redo()
		if (result) {
			this.updateAllConnectionEndpoints()
			this.syncLoadSignature()
		}
		return result
	}

	private syncLoadSignature(): void {
		const nodeIds = Array.from(this._nodeMap.keys()).sort()
		const nodeEntries: string[] = []
		for (const id of nodeIds) {
			const node = this._nodeMap.get(id)!
			node.syncDataFromTransform()
			const inSig = portSpecsSignature(node.data.inputs)
			const outSig = portSpecsSignature(node.data.outputs)
			nodeEntries.push(
				`${node.id}=${Math.round(node.data.worldX)},${Math.round(node.data.worldY)},${Math.round(node.data.width)},${Math.round(node.data.height)},${node.data.sizeCustomized ? 1 : 0},${inSig},${outSig}`
			)
		}
		const edgeCount = this._connectionMap.size
		this._lastLoadSignature = `${this._nodeMap.size}:${edgeCount}:${nodeEntries.join('|')}`
	}

	canUndo(): boolean {
		return this.commands.canUndo()
	}

	canRedo(): boolean {
		return this.commands.canRedo()
	}

	clearCommandStack(): void {
		this.commands.clear()
	}

	createWorkflowNode(data: BlueprintNodeData): BlueprintNode | null {
		const existing = this._nodeMap.get(data.id)
		if (existing) return existing
		this.executeCommand(new AddNodeCommand(this, data))
		return this._nodeMap.get(data.id) ?? null
	}

	createWorkflowEdge(data: ConnectionData): Connection | null {
		this.executeCommand(new CreateConnectionCommand(this, data))
		return this._connectionMap.get(data.id) ?? null
	}

	loadBlueprint(data: BlueprintData | LegacyBlueprintData): void {
		if (!data || typeof data !== 'object') {
			console.warn('[Blueprint] loadBlueprint: invalid data, loading empty blueprint')
			data = {
				schemaVersion: CURRENT_SCHEMA_VERSION,
				viewport: { zoom: 1, panX: 0, panY: 0 },
				nodes: [],
				edges: []
			}
		}

		let blueprintData: BlueprintData

		if (BlueprintLegacyLoader.isLegacyFormat(data)) {
			blueprintData = BlueprintLegacyLoader.load(data)
		} else {
			blueprintData = data as BlueprintData
		}

		if (!Array.isArray(blueprintData.nodes)) blueprintData.nodes = []
		if (!Array.isArray(blueprintData.edges)) blueprintData.edges = []
		if (!Array.isArray(blueprintData.savedSelectionFrames)) blueprintData.savedSelectionFrames = []
		if (!blueprintData.legacyResources || typeof blueprintData.legacyResources !== 'object')
			blueprintData.legacyResources = {}

		const version = blueprintData.schemaVersion ?? 1
		if (version > CURRENT_SCHEMA_VERSION) {
			console.warn(
				`[Blueprint] Loading data from newer schema version ${version} (current: ${CURRENT_SCHEMA_VERSION}). Some features may not be available.`
			)
		}

		blueprintData = this.migrateSchema(blueprintData)
		blueprintData = this.sanitizeLoadedData(blueprintData)

		const incomingNodeIds = new Set(blueprintData.nodes.map((n) => n.id))
		const incomingEdgeIds = new Set(blueprintData.edges.map((e) => e.id))

		const existingNodeCount = this._nodeMap.size
		const existingEdgeCount = this._connectionMap.size
		const isInitialLoad = existingNodeCount === 0 && existingEdgeCount === 0

		const sortedIncomingNodes = [...blueprintData.nodes].sort((a, b) => a.id.localeCompare(b.id))
		const positionSignature = sortedIncomingNodes
			.map(
				(n) =>
					`${n.id}=${Math.round(n.worldX)},${Math.round(n.worldY)},${Math.round(n.width)},${Math.round(n.height)},${n.sizeCustomized ? 1 : 0},${portSpecsSignature(n.inputs)},${portSpecsSignature(n.outputs)}`
			)
			.join('|')
		const signature = `${blueprintData.nodes.length}:${blueprintData.edges.length}:${positionSignature}`
		if (this._lastLoadSignature === signature) {
			return
		}
		this._lastLoadSignature = signature

		this.isEngineDragging = false
		this.isDomInteractionLocked = false
		this.isViewportPanning = false

		if (isInitialLoad) {
			this._legacyResources = blueprintData.legacyResources || {}

			if (blueprintData.viewport) {
				this.setViewport({
					zoom: clampZoom(blueprintData.viewport.zoom ?? 1),
					panX: clampPan(blueprintData.viewport.panX ?? 0),
					panY: clampPan(blueprintData.viewport.panY ?? 0)
				})
			}

			for (const nodeData of blueprintData.nodes) {
				this.addBlueprintNode(nodeData)
			}

			for (const edgeData of blueprintData.edges) {
				this.addConnection(edgeData)
			}
		} else {
			this._legacyResources = blueprintData.legacyResources || {}

			if (blueprintData.viewport) {
				this.setViewport({
					zoom: clampZoom(blueprintData.viewport.zoom ?? 1),
					panX: clampPan(blueprintData.viewport.panX ?? 0),
					panY: clampPan(blueprintData.viewport.panY ?? 0)
				})
			}

			const nodeIdsToRemove: string[] = []
			for (const [existingId] of this._nodeMap) {
				if (!incomingNodeIds.has(existingId)) {
					nodeIdsToRemove.push(existingId)
				}
			}
			for (const id of nodeIdsToRemove) {
				this.removeBlueprintNode(id)
			}

			for (const nodeData of blueprintData.nodes) {
				const existing = this._nodeMap.get(nodeData.id)
				if (existing) {
					const posChanged =
						existing.data.worldX !== nodeData.worldX || existing.data.worldY !== nodeData.worldY
					const sizeChanged =
						existing.data.width !== nodeData.width || existing.data.height !== nodeData.height
					const inputsChanged = portsChanged(existing.data.inputs, nodeData.inputs)
					const outputsChanged = portsChanged(existing.data.outputs, nodeData.outputs)
					if (posChanged || sizeChanged || inputsChanged || outputsChanged) {
						existing.setData(nodeData)
					}
				} else {
					this.addBlueprintNode(nodeData)
				}
			}

			const edgeIdsToRemove: string[] = []
			for (const [existingId] of this._connectionMap) {
				if (!incomingEdgeIds.has(existingId)) {
					edgeIdsToRemove.push(existingId)
				}
			}
			for (const id of edgeIdsToRemove) {
				this.removeConnection(id)
			}

			for (const edgeData of blueprintData.edges) {
				const existing = this._connectionMap.get(edgeData.id)
				if (existing) {
					const changed =
						existing.data.fromNodeId !== edgeData.fromNodeId ||
						existing.data.toNodeId !== edgeData.toNodeId ||
						existing.data.fromAnchorId !== edgeData.fromAnchorId ||
						existing.data.toAnchorId !== edgeData.toAnchorId
					if (changed) {
						existing.data.fromNodeId = edgeData.fromNodeId
						existing.data.toNodeId = edgeData.toNodeId
						existing.data.fromAnchorId = edgeData.fromAnchorId
						existing.data.toAnchorId = edgeData.toAnchorId
					}
				} else {
					this.addConnection(edgeData)
				}
			}
		}

		this._savedSelectionFrames.clear()
		if (blueprintData.savedSelectionFrames) {
			for (const frameData of blueprintData.savedSelectionFrames) {
				this._savedSelectionFrames.set(frameData.id, {
					id: frameData.id,
					nodeIds: [...frameData.nodeIds],
					label: frameData.label
				})
			}
		}

		this.updateAllConnectionEndpoints()
		this.requestRedraw()
	}

	private migrateSchema(data: BlueprintData): BlueprintData {
		const version = data.schemaVersion ?? 1
		if (version >= CURRENT_SCHEMA_VERSION) return data

		const nodes = data.nodes.map((n) => ({ ...n }))

		if (version < 2) {
			for (const node of nodes) {
				if (typeof (node as any).x === 'number' && node.worldX === undefined) {
					node.worldX = (node as any).x
				}
				if (typeof (node as any).y === 'number' && node.worldY === undefined) {
					node.worldY = (node as any).y
				}
			}
		}

		return {
			...data,
			schemaVersion: CURRENT_SCHEMA_VERSION,
			viewport: data.viewport ?? { zoom: 1, panX: 0, panY: 0 },
			nodes,
			edges: data.edges ?? [],
			savedSelectionFrames: data.savedSelectionFrames ?? [],
			legacyResources: data.legacyResources ?? {}
		}
	}

	private sanitizeLoadedData(data: BlueprintData): BlueprintData {
		const validNodeIds = new Set<string>()
		const nodes: BlueprintNodeData[] = []
		const discarded = { nodes: 0, edges: 0, frames: 0 }

		for (const raw of data.nodes ?? []) {
			if (!raw || typeof raw !== 'object') {
				discarded.nodes++
				continue
			}
			if (!raw.id || typeof raw.id !== 'string') {
				discarded.nodes++
				continue
			}
			if (validNodeIds.has(raw.id)) {
				discarded.nodes++
				continue
			}
			const type = raw.type || 'generic'
			const defaultSize = DEFAULT_NODE_SIZES[type] ||
				DEFAULT_NODE_SIZES.base || { width: 240, height: 160 }
			const node: BlueprintNodeData = {
				id: raw.id,
				type,
				title: raw.title ?? type,
				subtitle: raw.subtitle,
				alias: raw.alias,
				worldX: typeof raw.worldX === 'number' ? raw.worldX : 0,
				worldY: typeof raw.worldY === 'number' ? raw.worldY : 0,
				width: typeof raw.width === 'number' && raw.width > 0 ? raw.width : defaultSize.width,
				height: typeof raw.height === 'number' && raw.height > 0 ? raw.height : defaultSize.height,
				sizeCustomized: !!raw.sizeCustomized,
				inputs: Array.isArray(raw.inputs) ? [...raw.inputs] : [],
				outputs: Array.isArray(raw.outputs) ? [...raw.outputs] : [],
				color: raw.color,
				icon: raw.icon,
				selected: false,
				status: raw.status || 'idle',
				resourceId: raw.resourceId,
				resourcePath: raw.resourcePath,
				textValue: raw.textValue,
				previewContent: raw.previewContent ? { ...raw.previewContent } : undefined,
				imageSettings: raw.imageSettings ? { ...raw.imageSettings } : undefined,
				videoSettings: raw.videoSettings ? { ...raw.videoSettings } : undefined,
				model3dSettings: raw.model3dSettings ? { ...raw.model3dSettings } : undefined,
				meshySettings: raw.meshySettings ? { ...raw.meshySettings } : undefined,
				tripo3dSettings: raw.tripo3dSettings ? { ...raw.tripo3dSettings } : undefined,
				blenderSettings: raw.blenderSettings ? { ...raw.blenderSettings } : undefined,
				storySettings: raw.storySettings ? { ...raw.storySettings } : undefined,
				sceneUnderstandingSettings: raw.sceneUnderstandingSettings
					? { ...raw.sceneUnderstandingSettings }
					: undefined,
				sceneLayoutSettings: raw.sceneLayoutSettings ? { ...raw.sceneLayoutSettings } : undefined,
				sceneDecomposeSettings: raw.sceneDecomposeSettings
					? { ...raw.sceneDecomposeSettings }
					: undefined,
				unrealExportSettings: raw.unrealExportSettings
					? { ...raw.unrealExportSettings }
					: undefined,
				comfyuiSettings: raw.comfyuiSettings ? { ...raw.comfyuiSettings } : undefined,
				nodeChatDraft: raw.nodeChatDraft,
				nodeChatParams: raw.nodeChatParams,
				nodeChatSelectedRefs: Array.isArray(raw.nodeChatSelectedRefs)
					? [...raw.nodeChatSelectedRefs]
					: raw.nodeChatSelectedRefs,
				rotatePromptText: raw.rotatePromptText,
				textMergeItems: Array.isArray(raw.textMergeItems)
					? [...raw.textMergeItems]
					: raw.textMergeItems,
				branches: Array.isArray(raw.branches) ? [...raw.branches] : raw.branches,
				prompt: raw.prompt,
				createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : Date.now()
			}
			for (const key of Object.keys(raw)) {
				if (!(key in node)) {
					;(node as any)[key] = (raw as any)[key]
				}
			}
			validNodeIds.add(node.id)
			nodes.push(node)
		}

		const edges: ConnectionData[] = []
		for (const raw of data.edges ?? []) {
			if (!raw || typeof raw !== 'object') {
				discarded.edges++
				continue
			}
			const fromNodeId = raw.fromNodeId ?? (raw as any).sourceNodeId
			const toNodeId = raw.toNodeId ?? (raw as any).targetNodeId
			const fromAnchorId = raw.fromAnchorId ?? (raw as any).sourcePortIndex
			const toAnchorId = raw.toAnchorId ?? (raw as any).targetPortIndex
			if (!raw.id || !fromNodeId || !toNodeId) {
				discarded.edges++
				continue
			}
			if (!validNodeIds.has(fromNodeId) || !validNodeIds.has(toNodeId)) {
				discarded.edges++
				continue
			}
			edges.push({
				id: raw.id,
				fromNodeId,
				fromAnchorId: typeof fromAnchorId === 'string' ? fromAnchorId : String(fromAnchorId ?? ''),
				toNodeId,
				toAnchorId: typeof toAnchorId === 'string' ? toAnchorId : String(toAnchorId ?? ''),
				selected: !!raw.selected,
				createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : Date.now()
			})
		}

		const savedSelectionFrames: SavedSelectionFrameData[] = []
		for (const raw of data.savedSelectionFrames ?? []) {
			if (!raw || !raw.id || !raw.label) {
				discarded.frames++
				continue
			}
			const nodeIds = Array.isArray(raw.nodeIds)
				? raw.nodeIds.filter((id: any) => validNodeIds.has(id))
				: []
			if (nodeIds.length === 0) {
				discarded.frames++
				continue
			}
			savedSelectionFrames.push({ id: raw.id, nodeIds, label: raw.label })
		}

		const totalDiscarded = discarded.nodes + discarded.edges + discarded.frames
		if (totalDiscarded > 0) {
			console.warn(
				`[Blueprint] sanitizeLoadedData: discarded invalid entries - nodes:${discarded.nodes} edges:${discarded.edges} frames:${discarded.frames}`
			)
		}

		return {
			schemaVersion: CURRENT_SCHEMA_VERSION,
			viewport: {
				zoom: clampZoom(data.viewport?.zoom ?? 1),
				panX: clampPan(data.viewport?.panX ?? 0),
				panY: clampPan(data.viewport?.panY ?? 0)
			},
			nodes,
			edges,
			savedSelectionFrames,
			legacyResources:
				data.legacyResources && typeof data.legacyResources === 'object'
					? { ...data.legacyResources }
					: {}
		}
	}

	loadLegacyBlueprint(data: LegacyBlueprintData): void {
		this.loadBlueprint(data)
	}

	addBlueprintNode(data: BlueprintNodeData): BlueprintNode {
		const node = new BlueprintNode(data)
		node.on.on('nodemoved', () => this.markConnectionEndpointsDirty())
		this._nodeMap.set(data.id, node)
		this.addChild(node)
		this._connectionEndpointsDirty = true
		this.requestRedraw()
		return node
	}

	removeBlueprintNode(nodeId: string): void {
		const node = this._nodeMap.get(nodeId)
		if (!node) return

		const connectionsToRemove: string[] = []
		for (const [id, conn] of this._connectionMap) {
			if (conn.data.fromNodeId === nodeId || conn.data.toNodeId === nodeId) {
				connectionsToRemove.push(id)
			}
		}
		for (const id of connectionsToRemove) {
			this.removeConnection(id)
		}

		this._nodeMap.delete(nodeId)
		this.removeChild(node)
		node.dispose()
		this._connectionEndpointsDirty = true
		this.requestRedraw()
	}

	addConnection(data: ConnectionData): Connection | null {
		const fromNode = this._nodeMap.get(data.fromNodeId)
		const toNode = this._nodeMap.get(data.toNodeId)
		if (!fromNode || !toNode) return null

		const fromPort = fromNode.getOutputPort(data.fromAnchorId)
		const toPort = toNode.getInputPort(data.toAnchorId)
		if (!fromPort || !toPort) return null

		const connection = new Connection(data)
		connection.setEndpoints({
			fromWorld: fromPort.getWorldPosition(),
			toWorld: toPort.getWorldPosition(),
			mediaType: fromPort.mediaType
		})
		fromPort.connected = true
		toPort.connected = true
		this._connectionMap.set(connection.id, connection)
		this.addChild(connection)

		this._connectionEndpointsDirty = true
		this.requestRedraw()
		return connection
	}

	removeConnection(connectionId: string): void {
		const conn = this._connectionMap.get(connectionId)
		if (!conn) return

		const fromNode = this._nodeMap.get(conn.data.fromNodeId)
		const toNode = this._nodeMap.get(conn.data.toNodeId)
		if (fromNode) {
			const port = fromNode.getOutputPort(conn.data.fromAnchorId)
			if (port) {
				const otherConns = Array.from(this._connectionMap.values()).filter(
					(c) =>
						c !== conn &&
						c.data.fromNodeId === conn.data.fromNodeId &&
						c.data.fromAnchorId === conn.data.fromAnchorId
				)
				if (otherConns.length === 0) port.connected = false
			}
		}
		if (toNode) {
			const port = toNode.getInputPort(conn.data.toAnchorId)
			if (port) {
				const otherConns = Array.from(this._connectionMap.values()).filter(
					(c) =>
						c !== conn &&
						c.data.toNodeId === conn.data.toNodeId &&
						c.data.toAnchorId === conn.data.toAnchorId
				)
				if (otherConns.length === 0) port.connected = false
			}
		}

		this._connectionMap.delete(connectionId)
		this.removeChild(conn)
		conn.dispose()
		this._connectionEndpointsDirty = true
		this.requestRedraw()
	}

	getBlueprintNode(nodeId: string): BlueprintNode | null {
		return this._nodeMap.get(nodeId) ?? null
	}

	getConnection(connectionId: string): Connection | null {
		return this._connectionMap.get(connectionId) ?? null
	}

	startPendingConnection(fromNode: BlueprintNode, fromPort: Port, currentWorldPos: Vector2): void {
		this._pendingConnection = {
			fromNode,
			fromPort,
			currentPos: currentWorldPos.clone(),
			isValid: false
		}
		this._tempConnection.visible = true
		this._tempConnection.setPoints(
			fromPort.getWorldPosition(),
			currentWorldPos,
			fromPort.mediaType,
			false
		)
		this.requestRedraw()
	}

	updatePendingConnection(
		worldPos: Vector2,
		_hoveredPort: Port | null,
		compatible: boolean | null = null
	): void {
		if (!this._pendingConnection) return
		this._pendingConnection.currentPos.copy(worldPos)
		this._pendingConnection.isValid = compatible === true

		this._tempConnection.setPoints(
			this._pendingConnection.fromPort.getWorldPosition(),
			worldPos,
			this._pendingConnection.fromPort.mediaType,
			compatible !== false
		)
		this.requestRedraw()
	}

	cancelPendingConnection(): void {
		this._pendingConnection = null
		this._tempConnection.visible = false
		this._tempConnection.clear()
		this.requestRedraw()
	}

	isPortCompatible(fromPort: Port, toPort: Port): boolean {
		if (fromPort.isInput === toPort.isInput) return false
		if (fromPort.mediaType === 'generic' || toPort.mediaType === 'generic') return true
		return fromPort.mediaType === toPort.mediaType
	}

	isPortAlreadyConnected(
		fromNodeId: string,
		fromAnchorId: string,
		toNodeId: string,
		toAnchorId: string
	): boolean {
		for (const conn of this._connectionMap.values()) {
			if (
				conn.data.fromNodeId === fromNodeId &&
				conn.data.fromAnchorId === fromAnchorId &&
				conn.data.toNodeId === toNodeId &&
				conn.data.toAnchorId === toAnchorId
			) {
				return true
			}
		}
		return false
	}

	completePendingConnection(toNode: BlueprintNode, toPort: Port): ConnectionData | null {
		if (!this._pendingConnection) return null

		const { fromNode, fromPort } = this._pendingConnection
		if (fromPort.isInput === toPort.isInput || fromNode === toNode) {
			this.cancelPendingConnection()
			return null
		}

		const outPort = fromPort.isInput ? toPort : fromPort
		const inPort = fromPort.isInput ? fromPort : toPort
		if (!this.isPortCompatible(outPort, inPort)) {
			this.cancelPendingConnection()
			return null
		}

		if (this.isPortAlreadyConnected(fromNode.id, fromPort.spec.id, toNode.id, toPort.spec.id)) {
			this.cancelPendingConnection()
			return null
		}

		const data: ConnectionData = {
			id: `conn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
			fromNodeId: fromPort.isInput ? toNode.id : fromNode.id,
			fromAnchorId: fromPort.isInput ? toPort.spec.id : fromPort.spec.id,
			toNodeId: fromPort.isInput ? fromNode.id : toNode.id,
			toAnchorId: fromPort.isInput ? fromPort.spec.id : toPort.spec.id
		}

		this.cancelPendingConnection()
		return data
	}

	getPendingConnection(): PendingConnection | null {
		return this._pendingConnection
	}

	getSavedSelectionFrames(): SavedSelectionFrame[] {
		return Array.from(this._savedSelectionFrames.values())
	}

	getSavedSelectionFrame(frameId: string): SavedSelectionFrame | null {
		return this._savedSelectionFrames.get(frameId) ?? null
	}

	saveSelectionFrame(nodeIds: string[], label: string): SavedSelectionFrame {
		const id = `frame_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
		const sortedIds = [...nodeIds].sort()
		const frame: SavedSelectionFrame = { id, nodeIds: sortedIds, label }
		this._savedSelectionFrames.set(id, frame)
		this.requestRedraw()
		return frame
	}

	deleteSavedSelectionFrame(frameId: string): boolean {
		const deleted = this._savedSelectionFrames.delete(frameId)
		if (deleted) this.requestRedraw()
		return deleted
	}

	renameSavedSelectionFrame(frameId: string, newLabel: string): boolean {
		const frame = this._savedSelectionFrames.get(frameId)
		if (!frame) return false
		frame.label = newLabel
		this.requestRedraw()
		return true
	}

	getNodesByIds(ids: string[]): BlueprintNode[] {
		const nodes: BlueprintNode[] = []
		for (const id of ids) {
			const node = this._nodeMap.get(id)
			if (node) nodes.push(node)
		}
		return nodes
	}

	copySelection(selectedNodes: BlueprintNode[]): void {
		if (selectedNodes.length === 0) return

		const selectedIds = new Set(selectedNodes.map((n) => n.id))

		this._clipboardNodes = selectedNodes.map((node) => ({
			...node.data
		}))

		this._clipboardEdges = []
		for (const conn of this._connectionMap.values()) {
			if (selectedIds.has(conn.data.fromNodeId) && selectedIds.has(conn.data.toNodeId)) {
				this._clipboardEdges.push({ ...conn.data })
			}
		}
	}

	hasClipboardData(): boolean {
		return this._clipboardNodes.length > 0
	}

	setLastMouseWorldPos(x: number, y: number): void {
		this._lastMouseWorldPos = new Vector2(x, y)
	}

	pasteFromMouse(): string[] {
		if (this._clipboardNodes.length === 0) return []
		if (this._lastMouseWorldPos) {
			return this.pasteAt(this._lastMouseWorldPos.x, this._lastMouseWorldPos.y)
		}
		return this.executePaste(50, 50)
	}

	executePaste(offsetX: number = 50, offsetY: number = 50): string[] {
		if (this._clipboardNodes.length === 0) return []
		const cmd = new PasteCommand(
			this,
			this._clipboardNodes,
			this._clipboardEdges,
			undefined,
			undefined,
			offsetX,
			offsetY
		)
		this.executeCommand(cmd)
		return cmd.getCreatedNodeIds()
	}

	pasteAt(worldX: number, worldY: number): string[] {
		if (this._clipboardNodes.length === 0) return []
		const cmd = new PasteCommand(this, this._clipboardNodes, this._clipboardEdges, worldX, worldY)
		this.executeCommand(cmd)
		return cmd.getCreatedNodeIds()
	}

	deleteSelection(): void {
		const selected = this.selection.getSelection()
		const nodeIds: string[] = []
		const connIds: string[] = []
		for (const item of selected) {
			if (item instanceof BlueprintNode) {
				nodeIds.push(item.id)
			} else if (item instanceof Connection) {
				connIds.push(item.id)
			}
		}
		if (nodeIds.length > 0 || connIds.length > 0) {
			this.executeCommand(new DeleteSelectionCommand(this, nodeIds, connIds))
			this.selection.clearSelection()
		}
	}

	duplicateSelection(offsetX: number = 30, offsetY: number = 30): string[] {
		const selectedNodes = this.selection
			.getSelection()
			.filter((n) => n instanceof BlueprintNode) as BlueprintNode[]
		if (selectedNodes.length === 0) return []
		this.copySelection(selectedNodes)
		return this.executePaste(offsetX, offsetY)
	}

	moveNodesByDelta(nodeIds: string[], dx: number, dy: number): void {
		if (!nodeIds || nodeIds.length === 0) return
		if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return

		const startPositions = new Map<string, Vector2>()
		const endPositions = new Map<string, Vector2>()

		for (const id of nodeIds) {
			const node = this.getBlueprintNode(id)
			if (!node) continue
			node.syncDataFromTransform()
			const startX = node.data.worldX
			const startY = node.data.worldY
			startPositions.set(id, new Vector2(startX, startY))
			endPositions.set(id, new Vector2(startX + dx, startY + dy))
		}

		if (startPositions.size === 0) return

		const moveFn = (nid: string, pos: Vector2) => {
			const n = this.getBlueprintNode(nid)
			if (n) {
				n.setPosition(pos.x, pos.y)
				n.syncDataFromTransform()
			}
		}

		this.executeCommand(new MoveNodeCommand(startPositions, endPositions, moveFn))
		this.updateAllConnectionEndpoints()
		this.requestRedraw()
	}

	setNodePosition(nodeId: string, worldX: number, worldY: number): void {
		const node = this.getBlueprintNode(nodeId)
		if (!node) return
		node.syncDataFromTransform()
		const startX = node.data.worldX
		const startY = node.data.worldY
		const dx = worldX - startX
		const dy = worldY - startY
		if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return
		this.moveNodesByDelta([nodeId], dx, dy)
	}

	setNodeSize(nodeId: string, width?: number, height?: number): void {
		const node = this.getBlueprintNode(nodeId)
		if (!node) return
		node.syncDataFromTransform()
		const startX = node.data.worldX
		const startY = node.data.worldY
		const startW = node.data.width
		const startH = node.data.height
		const endW = typeof width === 'number' && width > 0 ? width : startW
		const endH = typeof height === 'number' && height > 0 ? height : startH
		if (startW === endW && startH === endH) return

		this.executeCommand(
			new ResizeNodeCommand(this, node, startX, startY, startW, startH, startX, startY, endW, endH)
		)
	}

	setSelectedNode(nodeId: string | null): void {
		if (nodeId) {
			const node = this.getBlueprintNode(nodeId)
			if (node) {
				this.selection.setSelection([node.id])
			}
		} else {
			this.selection.clearSelection()
		}
		this.requestRedraw()
	}

	setSelectedNodes(nodeIds: string[], primaryNodeId?: string | null): void {
		const validIds: string[] = []
		for (const id of nodeIds) {
			const node = this.getBlueprintNode(id)
			if (node) validIds.push(id)
		}
		this.selection.setSelection(validIds)
		this.requestRedraw()
	}

	clearSelection(): void {
		this.selection.clearSelection()
		this.requestRedraw()
	}

	setEngineViewport(zoom: number, panX: number, panY: number): void {
		this.setViewport({
			zoom: clampZoom(zoom),
			panX: clampPan(panX),
			panY: clampPan(panY)
		})
		this.requestRedraw()
	}

	updateNodePositionDirect(nodeId: string, worldX: number, worldY: number): void {
		const node = this.getBlueprintNode(nodeId)
		if (!node) return
		node.setPosition(worldX, worldY)
		this.markConnectionEndpointsDirty()
		this.requestRedraw()
	}

	updateNodesPositionDirect(nodePositions: Map<string, { x: number; y: number }>): void {
		for (const [id, pos] of nodePositions) {
			const node = this.getBlueprintNode(id)
			if (node) {
				node.setPosition(pos.x, pos.y)
			}
		}
		this.markConnectionEndpointsDirty()
		this.requestRedraw()
	}

	commitNodeMovement(
		startPositions: Map<string, { x: number; y: number }>,
		endPositions: Map<string, { x: number; y: number }>
	): void {
		if (startPositions.size === 0 || endPositions.size === 0) return

		const startVec = new Map<string, Vector2>()
		const endVec = new Map<string, Vector2>()
		for (const [id, pos] of startPositions) {
			startVec.set(id, new Vector2(pos.x, pos.y))
		}
		for (const [id, pos] of endPositions) {
			endVec.set(id, new Vector2(pos.x, pos.y))
		}

		const moveFn = (nid: string, pos: Vector2) => {
			const n = this.getBlueprintNode(nid)
			if (n) {
				n.setPosition(pos.x, pos.y)
				n.syncDataFromTransform()
			}
		}

		this.executeCommand(new MoveNodeCommand(startVec, endVec, moveFn))
		this.updateAllConnectionEndpoints()
		this.requestRedraw()
	}

	focusNode(nodeId: string): boolean {
		const node = this.getBlueprintNode(nodeId)
		if (!node) return false
		node.syncDataFromTransform()
		const zoom = Math.max(0.01, Number(this.getViewport().zoom) || 1)
		const targetPanX = -node.data.worldX * zoom
		const targetPanY = -node.data.worldY * zoom
		this.setEngineViewport(zoom, targetPanX, targetPanY)
		return true
	}

	connectNodes(
		fromNodeId: string,
		fromAnchorId: string,
		toNodeId: string,
		toAnchorId: string
	): Connection | null {
		const fromNode = this.getBlueprintNode(fromNodeId)
		const toNode = this.getBlueprintNode(toNodeId)
		if (!fromNode || !toNode) return null

		const fromPort = fromNode.getOutputPort(fromAnchorId)
		const toPort = toNode.getInputPort(toAnchorId)
		if (!fromPort || !toPort) return null

		if (!this.isPortCompatible(fromPort, toPort)) return null
		if (this.isPortAlreadyConnected(fromNodeId, fromAnchorId, toNodeId, toAnchorId)) return null

		const existing = this._connectionMap.get(
			`conn_${fromNodeId}_${fromAnchorId}_${toNodeId}_${toAnchorId}`
		)
		if (existing) return existing

		const edgeData: ConnectionData = {
			id: `conn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
			fromNodeId,
			fromAnchorId,
			toNodeId,
			toAnchorId
		}
		return this.createWorkflowEdge(edgeData)
	}

	private _connectionEndpointsDirty: boolean = true

	markConnectionEndpointsDirty(): void {
		this._connectionEndpointsDirty = true
		this.requestRedraw()
	}

	updateAllConnectionEndpoints(): void {
		for (const conn of this._connectionMap.values()) {
			const fromNode = this._nodeMap.get(conn.data.fromNodeId)
			const toNode = this._nodeMap.get(conn.data.toNodeId)
			if (!fromNode || !toNode) continue

			const fromPort = fromNode.getOutputPort(conn.data.fromAnchorId)
			const toPort = toNode.getInputPort(conn.data.toAnchorId)
			if (fromPort && toPort) {
				conn.setEndpoints({
					fromWorld: fromPort.getWorldPosition(),
					toWorld: toPort.getWorldPosition(),
					mediaType: fromPort.mediaType
				})
			}
		}
		this._connectionEndpointsDirty = false
	}

	screenToWorld(screen: Vector2): Vector2 {
		return this.camera.screenToWorld(screen)
	}

	serialize(): BlueprintData {
		for (const node of this._nodeMap.values()) {
			node.syncDataFromTransform()
		}

		const nodes: BlueprintNodeData[] = []
		for (const node of this._nodeMap.values()) {
			nodes.push({ ...node.data })
		}

		const edges: ConnectionData[] = []
		for (const conn of this._connectionMap.values()) {
			edges.push({ ...conn.data })
		}

		const savedSelectionFrames: SavedSelectionFrameData[] = []
		for (const frame of this._savedSelectionFrames.values()) {
			savedSelectionFrames.push({
				id: frame.id,
				nodeIds: [...frame.nodeIds],
				label: frame.label
			})
		}

		return {
			schemaVersion: CURRENT_SCHEMA_VERSION,
			viewport: this.getViewport(),
			nodes,
			edges,
			savedSelectionFrames,
			legacyResources:
				Object.keys(this._legacyResources).length > 0 ? { ...this._legacyResources } : undefined
		}
	}

	serializeLegacy(): LegacyBlueprintData {
		return BlueprintLegacySaver.save(this.serialize())
	}

	render(ctx: RenderContext): void {
		if (this._connectionEndpointsDirty) {
			this.updateAllConnectionEndpoints()
		}
		super.render(ctx)
	}

	update(deltaTime: number): void {
		let hasRunningNode = false
		for (const node of this._nodeMap.values()) {
			if (node.data.status === 'running') {
				hasRunningNode = true
				break
			}
		}
		this.setPersistentAnimation(hasRunningNode)
	}

	dispose(): void {
		if (this._unsubscribeTheme) {
			this._unsubscribeTheme()
			this._unsubscribeTheme = null
		}
		if (this._unsubscribeI18n) {
			this._unsubscribeI18n()
			this._unsubscribeI18n = null
		}
		for (const node of this._nodeMap.values()) {
			node.dispose()
		}
		this._nodeMap.clear()
		this._connectionMap.clear()
		this._savedSelectionFrames.clear()
		clearBlueprintNodeImageCache()
		super.dispose()
	}
}
