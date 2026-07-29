/**
 * 通用节点连线事务工具
 * 
 * 用途：封装"创建节点→连线→强制同步到store→验证"的完整事务流程，
 *       解决图形引擎层与Vuex store层状态不一致导致的连线消失、节点数据丢失问题。
 * 
 * 使用场景：
 * - 视频截图自动创建图片节点并连线
 * - 未来可复用：音频提取自动连线、文本生成图片自动连线等类似场景
 * 
 * 设计原则：
 * - 严格遵循"开启bulk update→引擎操作→forceSyncToStore→验证→关闭bulk update"的时序
 * - 内置详细日志便于调试
 * - 回调式API，不硬编码特定节点类型
 */

export interface NodeConnectionTransactionOptions {
	/** 创建目标节点，返回新节点ID */
	createTargetNode: () => string | null
	/** 在源节点和目标节点之间创建连线，返回是否成功 */
	connectNodes: (targetNodeId: string) => boolean
	/** 强制将引擎状态同步到Vuex store（关键！必须await） */
	forceSyncToStore: () => Promise<boolean>
	/** 开启批量更新模式（阻止引擎emitChange事件） */
	beginBulkUpdate?: () => void
	/** 结束批量更新模式（恢复引擎emitChange事件） */
	endBulkUpdate?: () => void
	/** 清除pending的change定时器 */
	clearPendingChanges?: () => void
	/** 验证节点和连线是否已正确固化到store（可选） */
	validate?: (targetNodeId: string) => boolean
	/** 日志前缀，便于区分不同业务场景 */
	logPrefix?: string
}

export interface NodeConnectionTransactionResult {
	/** 事务是否成功完成（创建节点+连线成功，同步和验证可能有警告但节点已创建） */
	success: boolean
	/** 创建的目标节点ID */
	targetNodeId: string | null
	/** 错误信息（如果失败） */
	error?: string
	/** 验证警告（如果验证失败但节点已创建） */
	warning?: string
}

/**
 * 执行节点连线事务
 * 
 * 时序保证：
 * 1. 调用beginBulkUpdate()阻止引擎emitChange
 * 2. 调用createTargetNode()在引擎层创建节点
 * 3. 调用connectNodes()在引擎层创建连线
 * 4. await forceSyncToStore()将引擎状态固化到store
 * 5. 调用validate()验证状态正确性
 * 6. 调用endBulkUpdate()恢复引擎emitChange
 * 
 * @param options 事务配置
 * @returns 事务结果
 */
export async function executeNodeConnectionTransaction(
	options: NodeConnectionTransactionOptions
): Promise<NodeConnectionTransactionResult> {
	const log = (message: string, ...args: unknown[]) => {
		const prefix = options.logPrefix || '[NodeTransaction]'
		console.log(`${prefix} ${message}`, ...args)
	}

	const warn = (message: string, ...args: unknown[]) => {
		const prefix = options.logPrefix || '[NodeTransaction]'
		console.warn(`${prefix} ${message}`, ...args)
	}

	const error = (message: string, ...args: unknown[]) => {
		const prefix = options.logPrefix || '[NodeTransaction]'
		console.error(`${prefix} ${message}`, ...args)
	}

	log('Starting transaction')
	const startTime = performance.now()

	// 诊断：记录bulk update回调状态
	log('Transaction options status:', {
		hasBeginBulkUpdate: typeof options.beginBulkUpdate === 'function',
		hasEndBulkUpdate: typeof options.endBulkUpdate === 'function',
		hasClearPendingChanges: typeof options.clearPendingChanges === 'function',
		hasForceSync: typeof options.forceSyncToStore === 'function'
	})

	// Step 0: 开启批量更新模式，阻止引擎在操作过程中触发emitChange
	// 这必须在所有引擎操作之前调用，否则addNode/connectNodes内部的
	// after-command事件会触发emitChange，导致状态竞态
	if (options.beginBulkUpdate) {
		log('Step 0: Enabling bulk update mode to prevent engine emitChange race conditions')
		try {
			options.beginBulkUpdate()
			log('Step 0: beginBulkUpdate() completed successfully')
		} catch (err) {
			console.error('[NodeTransaction] Step 0: beginBulkUpdate() threw error:', err)
		}
	} else {
		warn('Step 0: beginBulkUpdate callback not provided! Bulk update protection disabled - this may cause race conditions!')
	}
	if (options.clearPendingChanges) {
		log('Step 0: Clearing pending changes')
		try {
			options.clearPendingChanges()
		} catch (err) {
			console.error('[NodeTransaction] Step 0: clearPendingChanges() threw error:', err)
		}
	}

	try {
		// Step 1: 创建目标节点
		log('Step 1: Creating target node in engine...')
		const targetNodeId = options.createTargetNode()
		if (!targetNodeId) {
			const err = 'Failed to create target node: createTargetNode() returned null/empty'
			error(err)
			return { success: false, targetNodeId: null, error: err }
		}
		log('Step 1: Target node created, nodeId:', targetNodeId)

		// 节点创建后也清除一次pending changes（createTargetNode内部可能通过nextTick注册了emitChange）
		if (options.clearPendingChanges) {
			options.clearPendingChanges()
		}

		// Step 2: 创建连线
		log('Step 2: Connecting nodes in engine...')
		const connected = options.connectNodes(targetNodeId)
		if (!connected) {
			const err = `Failed to connect nodes: connectNodes() returned false for targetNodeId=${targetNodeId}`
			error(err)
			return { success: false, targetNodeId, error: err }
		}
		log('Step 2: Nodes connected successfully')

		// 连线后再清除一次pending changes
		if (options.clearPendingChanges) {
			options.clearPendingChanges()
		}

		// 关键修复：先结束bulk update模式，清除它可能触发的pending emitChange，然后再执行forceSyncToStore
		// 时序说明：
		// 1. endBulkUpdate将_bulkUpdateDepth减到0，此时BlueprintEditor.endBulkUpdate会触发一个setTimeout(0)的emitChange
		// 2. clearPendingChanges立即清除这个setTimeout(0)定时器，防止它在isUpdatingFromStore保护生效前执行
		// 3. 然后调用forceSyncToStore，它会设置isUpdatingFromStore=true，执行hydrateDraft，
		//    并等待足够时间（nextTick+RAF+setTimeout(0)+setTimeout(50)）确保没有后续的emitChange能覆盖状态
		log('Step 3: Ending bulk update and clearing pending changes BEFORE forceSyncToStore...')
		if (options.endBulkUpdate) {
			options.endBulkUpdate()
		}
		if (options.clearPendingChanges) {
			options.clearPendingChanges()
		}

		// Step 4: 强制同步到store（此时bulk update已结束，pending changes已清除，isUpdatingFromStore会保护状态）
		log('Step 4: Force syncing engine state to store...')
		const syncOk = await options.forceSyncToStore()
		log('Step 4: forceSyncToStore completed, result:', syncOk)

		if (!syncOk) {
			warn('Step 4: forceSyncToStore returned false, but continuing with validation...')
		}

		// Step 5: 验证
		let warning: string | undefined
		if (options.validate) {
			log('Step 5: Validating state in store...')
			const valid = options.validate(targetNodeId)
			if (!valid) {
				warning = `Validation warning: node/edge may not be fully persisted to store for targetNodeId=${targetNodeId}, but node was created in engine`
				warn(warning)
				// 不return失败，节点已在引擎中创建，继续后续业务操作
			} else {
				log('Step 5: Validation passed')
			}
		} else {
			log('Step 5: No validation callback provided, skipping validation')
		}

		const elapsed = performance.now() - startTime
		log(`Transaction completed in ${elapsed.toFixed(2)}ms`, { targetNodeId, warning })

		return {
			success: true,
			targetNodeId,
			warning
		}
	} catch (err) {
		const elapsed = performance.now() - startTime
		const errMessage = err instanceof Error ? err.message : String(err)
		error(`Transaction threw exception after ${elapsed.toFixed(2)}ms:`, err)
		return {
			success: false,
			targetNodeId: null,
			error: errMessage
		}
	} finally {
		// 确保bulk update模式最终被关闭（即使出错）
		// 注意：正常流程中endBulkUpdate已经在Step 4调用过了，这里是安全兜底
		// 因为endBulkUpdate使用引用计数，重复调用不会有问题
		if (options.endBulkUpdate) {
			log('Finally: ensuring bulk update mode is exited')
			if (options.clearPendingChanges) {
				options.clearPendingChanges()
			}
			// 只有当仍在bulk模式中时才调用endBulkUpdate（异常情况）
			// 由于我们无法直接访问_bulkUpdateDepth，endBulkUpdate内部有>0检查，重复调用安全
			options.endBulkUpdate()
		}
	}
}
