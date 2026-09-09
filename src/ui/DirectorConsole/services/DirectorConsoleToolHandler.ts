import type { DirectorSceneViewer } from '../viewers/DirectorSceneViewer'
import { DirectorVideoExportService } from './DirectorVideoExportService'
import { writeProjectAssetBinary } from '../../../electronBridge'

/** 把 Blob 转 base64 dataURL（供 Agent 工具回传图像给 DSH 模型）。 */
function blobToDataURL(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader()
		reader.onloadend = () => {
			const result = reader.result
			if (typeof result === 'string') resolve(result)
			else reject(new Error('FileReader 未返回字符串'))
		}
		reader.onerror = () => reject(reader.error || new Error('FileReader 读取失败'))
		reader.readAsDataURL(blob)
	})
}

/**
 * 导演控制台 Agent 工具调用处理器。
 *
 * 监听 Electron IPC 的 dweb:builtin-tool:call 通道，
 * 将 dc_* 工具调用分发到 DirectorSceneViewer 对应方法，
 * 执行结果通过 dweb:builtin-tool:{requestId}:response 回传。
 *
 * 遵循 DSH function calling 三段契约：
 * 1. 工具已在后端 ToolExecutor 注册（schemas 暴露给模型）
 * 2. DSH 解析 tool_calls 后通过 MCP → IPC 到达此处
 * 3. 此处执行后返回 JSON 结果，DSH 回注到对话上下文
 */
export class DirectorConsoleToolHandler {
	private viewer: DirectorSceneViewer
	private listenerId = -1
	private exportService: DirectorVideoExportService
	private getLayoutItems: () => unknown[]
	private getProjectId: () => number | undefined
	private getNodeId: () => string | undefined

	constructor(
		viewer: DirectorSceneViewer,
		getLayoutItems: () => unknown[] = () => [],
		getProjectId: () => number | undefined = () => undefined,
		getNodeId: () => string | undefined = () => undefined
	) {
		this.viewer = viewer
		this.exportService = new DirectorVideoExportService(viewer)
		this.getLayoutItems = getLayoutItems
		this.getProjectId = getProjectId
		this.getNodeId = getNodeId
	}

	/** 注册 IPC 监听器，开始接收 dc_* 工具调用。 */
	setup(): void {
		const mcp = (window as any).dweb?.mcp
		if (!mcp?.onBuiltinToolCall) return
		this.listenerId = mcp.onBuiltinToolCall((payload: any) => {
			this.handleToolCall(payload)
		})
	}

	/** 注销 IPC 监听器。 */
	cleanup(): void {
		if (this.listenerId < 0) return
		const mcp = (window as any).dweb?.mcp
		if (mcp?.offBuiltinToolCall) {
			mcp.offBuiltinToolCall(this.listenerId)
		}
		this.listenerId = -1
	}

	private respond(requestId: string, result: unknown, error?: string): void {
		const mcp = (window as any).dweb?.mcp
		mcp?.respondBuiltinTool?.(requestId, result, error)
	}

	private async handleToolCall(payload: {
		requestId: string
		toolName: string
		args: Record<string, unknown>
	}): Promise<void> {
		const { requestId, toolName, args } = payload
		// 只处理 dc_ 前缀的导演控制台工具
		if (!toolName?.startsWith('dc_')) return

		try {
			const result = await this.dispatch(toolName, args || {})
			this.respond(requestId, result)
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err)
			console.error(`[DirectorConsoleToolHandler] ${toolName} error:`, msg)
			this.respond(requestId, undefined, msg)
		}
	}

	private async dispatch(toolName: string, args: Record<string, unknown>): Promise<unknown> {
		switch (toolName) {
			// ===== 角色工具 =====
			case 'dc_add_character':
				return this.addCharacter(args)
			case 'dc_set_character_transform':
				return this.setCharacterTransform(args)
			case 'dc_set_character_parent':
				return this.setCharacterParent(args)
			case 'dc_list_characters':
				return this.listCharacters()

			// ===== 摄像头工具 =====
			case 'dc_add_camera':
				return this.addCamera()
			case 'dc_set_camera_transform':
				return this.setCameraTransform(args)
			case 'dc_set_camera_parent':
				return this.setCameraParent(args)

			// ===== 时间轴关键帧工具 =====
			case 'dc_set_timeline':
				return this.setTimeline(args)
			case 'dc_add_camera_keyframe':
				return this.addCameraKeyframe(args)
			case 'dc_add_character_keyframe':
				return this.addCharacterKeyframe(args)
			case 'dc_seek_frame':
				return this.seekFrame(args)

			// ===== 综合工具 =====
			case 'dc_get_scene_state':
				return this.getSceneState()
			case 'dc_export_video':
				return this.exportVideo()
			// ===== 镜头预览截图工具 =====
			case 'dc_capture_camera_preview':
				return this.captureCameraPreview(args)

			default:
				throw new Error(`未知导演控制台工具: ${toolName}`)
		}
	}

	// ===== 角色工具实现 =====

	private addCharacter(args: Record<string, unknown>): {
		ok: boolean
		characterId: string
		name: string
	} {
		const name = String(args.name || '角色')
		const color = String(args.color || this.randomColor())
		const position = args.position as { x: number; y: number; z: number } | undefined
		const id = this.viewer.addCharacter(color, position)
		// 更新角色名称
		const chars = this.viewer.getCharacters()
		const ch = chars.find((c) => c.id === id)
		if (ch) ch.name = name
		return { ok: true, characterId: id, name }
	}

	private setCharacterTransform(args: Record<string, unknown>): { ok: boolean } {
		const characterId = String(args.characterId)
		const kind = args.kind as 'position' | 'rotation' | 'scale'
		const axis = args.axis as 'x' | 'y' | 'z'
		const value = Number(args.value)
		this.viewer.updateCharacterTransform(characterId, kind, axis, value)
		return { ok: true }
	}

	private setCharacterParent(args: Record<string, unknown>): { ok: boolean } {
		const childId = String(args.childId)
		const parentId = args.parentId === null ? null : String(args.parentId || null)
		this.viewer.setCharacterParent(childId, parentId)
		return { ok: true }
	}

	private listCharacters(): {
		ok: boolean
		count: number
		characters: {
			id: string
			name: string
			position: { x: number; y: number; z: number }
			parentId?: string
		}[]
	} {
		const chars = this.viewer.getCharacters()
		return {
			ok: true,
			count: chars.length,
			characters: chars.map((c) => ({
				id: c.id,
				name: c.name,
				position: c.position,
				parentId: c.parentId
			}))
		}
	}

	// ===== 摄像头工具实现 =====

	private async addCamera(): Promise<{ ok: boolean; cameraId?: string }> {
		const ok = await this.viewer.addCameraAtCenter()
		return { ok, cameraId: ok ? 'director-camera' : undefined }
	}

	private setCameraTransform(args: Record<string, unknown>): { ok: boolean } {
		const position = args.position as { x: number; y: number; z: number }
		const target = args.target as { x: number; y: number; z: number }
		this.viewer.setCameraActorTransform(position, target)
		return { ok: true }
	}

	private setCameraParent(args: Record<string, unknown>): { ok: boolean } {
		const parentId = args.parentId === null ? null : String(args.parentId || null)
		this.viewer.setCameraParent(parentId)
		return { ok: true }
	}

	// ===== 时间轴关键帧工具实现 =====

	private setTimeline(args: Record<string, unknown>): {
		ok: boolean
		fps?: number
		totalFrames?: number
	} {
		const result: { ok: boolean; fps?: number; totalFrames?: number } = { ok: true }
		if (args.fps !== undefined) {
			this.viewer.setFps(Number(args.fps))
			result.fps = Number(args.fps)
		}
		if (args.totalFrames !== undefined) {
			this.viewer.setTotalFrames(Number(args.totalFrames))
			result.totalFrames = Number(args.totalFrames)
		}
		return result
	}

	private addCameraKeyframe(args: Record<string, unknown>): {
		ok: boolean
		frame?: number
		keyframeId?: string
	} {
		const frame = Number(args.frame)
		const kf = this.viewer.addCameraKeyframe(frame)
		return { ok: !!kf, frame, keyframeId: kf?.id }
	}

	private addCharacterKeyframe(args: Record<string, unknown>): { ok: boolean; frame?: number } {
		const characterId = String(args.characterId)
		const frame = Number(args.frame)
		const kf = this.viewer.addCharacterKeyframe(characterId, frame)
		return { ok: !!kf, frame }
	}

	private seekFrame(args: Record<string, unknown>): { ok: boolean; frame: number } {
		const frame = Number(args.frame)
		this.viewer.setCurrentFrame(frame)
		return { ok: true, frame }
	}

	// ===== 综合工具实现 =====

	private getSceneState(): unknown {
		const chars = this.viewer.getCharacters()
		const camTransform = this.viewer.getCameraActorTransform()
		const cameraKeyframes = this.viewer.getCameraKeyframes()
		const characterKeyframes: Record<string, unknown[]> = {}
		for (const c of chars) {
			characterKeyframes[c.id] = this.viewer.getCharacterKeyframes(c.id).map((k) => ({
				frame: k.frame,
				position: k.position
			}))
		}

		// 场景布局数据（房间、墙壁、家具等），从上游输入锚点传入
		const layoutItems = this.getLayoutItems()
		const sceneLayout = layoutItems.map((item: any) => ({
			id: item.id,
			name: item.name,
			category: item.category,
			subCategory: item.subCategory,
			placement: item.placement,
			wallRole: item.wallRole,
			mountType: item.mountType,
			semanticRole: item.semanticRole,
			isKeyElement: item.isKeyElement,
			roomId: item.roomId,
			roomLabel: item.roomLabel,
			isRoomShell: item.isRoomShell,
			position: item.position,
			size: item.size,
			rotation: item.rotation
		}))

		// 提取墙壁和房间壳体信息，帮助 Agent 理解空间结构
		const walls = layoutItems
			.filter((item: any) => item.wallRole || item.placement === 'wall' || item.isRoomShell)
			.map((item: any) => ({
				id: item.id,
				name: item.name,
				roomId: item.roomId,
				roomLabel: item.roomLabel,
				isRoomShell: item.isRoomShell,
				wallRole: item.wallRole,
				position: item.position,
				size: item.size,
				rotation: item.rotation
			}))

		// 提取房间信息
		const rooms = new Map<string, { id: string; label: string; itemCount: number }>()
		for (const item of layoutItems as any[]) {
			if (item.roomId) {
				const existing = rooms.get(item.roomId)
				if (existing) {
					existing.itemCount++
				} else {
					rooms.set(item.roomId, {
						id: item.roomId,
						label: item.roomLabel || item.roomId,
						itemCount: 1
					})
				}
			}
		}

		return {
			ok: true,
			sceneLayout: {
				totalItems: layoutItems.length,
				walls: walls.length > 0 ? walls : undefined,
				rooms: rooms.size > 0 ? Array.from(rooms.values()) : undefined,
				allItems: sceneLayout
			},
			characters: chars.map((c) => ({
				id: c.id,
				name: c.name,
				position: c.position,
				parentId: c.parentId
			})),
			camera: {
				exists: !!camTransform,
				position: camTransform?.position ?? null,
				target: camTransform?.target ?? null,
				parentId: this.viewer.getCameraParentId()
			},
			timeline: {
				fps: this.viewer.getFps(),
				totalFrames: this.viewer.getTotalFrames(),
				currentFrame: this.viewer.getCurrentFrame()
			},
			cameraKeyframes: cameraKeyframes.map((k) => ({
				frame: k.frame ?? Math.round(k.time * this.viewer.getFps()),
				position: k.position,
				target: k.target
			})),
			characterKeyframes
		}
	}

	private async exportVideo(): Promise<unknown> {
		// 需要 projectId 和 nodeId，从 viewer 或外部注入
		// 此处简化：调用已有的导出服务
		const result = await this.exportService.exportVideo({
			fps: this.viewer.getFps(),
			totalFrames: this.viewer.getTotalFrames(),
			nodeId: '',
			projectId: 0
		})
		if (result.ok) {
			return { ok: true, assetUrl: result.assetUrl, assetName: result.assetName }
		}
		return { ok: false, error: result.error }
	}

	/**
	 * 镜头预览截图：让 Agent 检查当前镜头画面，判断是否需要调整位置/FOV。
	 *
	 * 默认截当前帧；可指定 frame 跳转到目标帧后截图，
	 * 用于检查关键帧位置镜头是否过低或构图是否合理。
	 *
	 * 返回 base64 dataURL（image/png），DSH render 函数会把它作为图像返回给模型。
	 */
	private async captureCameraPreview(args: Record<string, unknown>): Promise<{
		ok: boolean
		dataUrl?: string
		absolutePath?: string
		projectRelativePath?: string
		width?: number
		height?: number
		frame?: number
		error?: string
	}> {
		try {
			// 可选：先跳转到指定帧，截该帧的镜头画面
			if (args.frame !== undefined && args.frame !== null) {
				const frame = Number(args.frame)
				if (Number.isFinite(frame)) {
					this.viewer.setCurrentFrame(frame)
					// 等待一帧 RAF 让插值与渲染完成
					await new Promise<void>((resolve) => {
						requestAnimationFrame(() => resolve())
					})
				}
			}

			const blob = await this.viewer.capturePreviewFrame()
			if (!blob) {
				return { ok: false, error: '镜头预览不可用（无摄像头或预览未初始化）' }
			}

			// 转 base64 dataURL
			const dataUrl = await blobToDataURL(blob)
			const size = this.viewer.getPreviewSize?.() ?? { width: 240, height: 160 }
			const currentFrame = this.viewer.getCurrentFrame()

			// 尝试把截图保存到节点工作区，让 Agent 通过文件读取工具查看
			const projectId = this.getProjectId()
			const nodeId = this.getNodeId()
			let absolutePath: string | undefined
			let projectRelativePath: string | undefined
			if (projectId && nodeId) {
				try {
					// 文件名带时间戳避免覆盖，让 Agent 能区分多次截图
					const timestamp = Date.now()
					const fileName = `preview_f${currentFrame}_${timestamp}.png`
					const subPath = `director-console/${nodeId}/previews`
					const writeResult = await writeProjectAssetBinary({
						projectId,
						name: fileName,
						subPath,
						data: new Uint8Array(await blob.arrayBuffer())
					})
					if (writeResult?.ok) {
						absolutePath = writeResult.absolutePath
						projectRelativePath = writeResult.projectRelativePath
						console.log('[DirectorConsoleToolHandler] screenshot saved to workspace:', absolutePath)
					} else {
						console.warn(
							'[DirectorConsoleToolHandler] writeProjectAssetBinary failed:',
							writeResult?.error
						)
					}
				} catch (e) {
					console.warn('[DirectorConsoleToolHandler] save screenshot to workspace failed:', e)
				}
			}

			return {
				ok: true,
				dataUrl,
				absolutePath,
				projectRelativePath,
				width: size.width,
				height: size.height,
				frame: currentFrame
			}
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err)
			console.error(`[DirectorConsoleToolHandler] dc_capture_camera_preview error:`, msg)
			return { ok: false, error: msg }
		}
	}

	private randomColor(): string {
		const h = Math.floor(Math.random() * 360)
		return `hsl(${h}, 70%, 55%)`
	}
}
