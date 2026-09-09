import { registerCharacterTools } from './tools/characterTools.ts'
import { registerCameraTools } from './tools/cameraTools.ts'
import { registerTimelineTools } from './tools/timelineTools.ts'
import { registerCompositeTools } from './tools/compositeTools.ts'

export const name = 'dvstudio-director-plugin'
export const inject = ['tools']

const LOAD_KEY = '__dvstudio_director_plugin_loaded__'

export function apply(ctx: any) {
	if ((globalThis as Record<string, unknown>)[LOAD_KEY]) {
		ctx.logger?.warn?.('[dvstudio-director] plugin already loaded, skipping')
		return
	}
	;(globalThis as Record<string, unknown>)[LOAD_KEY] = true

	registerCharacterTools(ctx)
	registerCameraTools(ctx)
	registerTimelineTools(ctx)
	registerCompositeTools(ctx)

	ctx.logger?.info?.('[dvstudio-director] plugin loaded: 13 dc_* tools')
	console.error('[dvstudio-director] plugin loaded: 13 dc_* tools')
}
