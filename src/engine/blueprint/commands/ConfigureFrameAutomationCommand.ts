import { Command } from '../../graphbase/commands/Command'
import type { BlueprintScene } from '../BlueprintScene'
import type { FrameAutomationData } from '../frame-automation/FrameAutomationTypes'

/**
 * 修改绿色多选框的自动化配置（开关 / 循环次数 / 输入输出绑定）。
 * execute/undo 对称替换整份配置快照，天然可撤销。
 * 运行临时态（FrameAutomationRunState）不经由此命令，不持久化。
 */
export class ConfigureFrameAutomationCommand extends Command {
	private scene: BlueprintScene
	private frameId: string
	private nextConfig: FrameAutomationData | undefined
	private prevConfig: FrameAutomationData | undefined

	constructor(
		scene: BlueprintScene,
		frameId: string,
		nextConfig: FrameAutomationData | undefined,
		prevConfig?: FrameAutomationData | undefined
	) {
		super('configure-frame-automation')
		this.scene = scene
		this.frameId = frameId
		// 构造即深拷贝：命令入栈后外部仍可能持有/修改源配置对象，
		// 快照必须与外部引用完全隔离，保证 undo/redo 还原的是入队时的状态。
		this.nextConfig = cloneConfig(nextConfig)
		this.prevConfig = cloneConfig(prevConfig)
	}

	execute(): void {
		this.scene.setFrameAutomationInternal(this.frameId, cloneConfig(this.nextConfig))
		this.scene.requestRedraw()
	}

	undo(): void {
		this.scene.setFrameAutomationInternal(this.frameId, cloneConfig(this.prevConfig))
		this.scene.requestRedraw()
	}
}

function cloneConfig(c: FrameAutomationData | undefined): FrameAutomationData | undefined {
	if (!c) return undefined
	return {
		enabled: c.enabled,
		loopCount: c.loopCount,
		inputBindings: c.inputBindings.map((b) => ({ ...b })),
		outputBindings: c.outputBindings.map((b) => ({ ...b }))
	}
}
