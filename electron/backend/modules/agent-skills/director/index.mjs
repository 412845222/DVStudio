/**
 * 导演多场景工作台（director-multi-scene）后端子模块统一出口
 */
export {
	DIRECTOR_WORKBENCH_TYPE,
	DIRECTOR_MULTI_SCENE_SYSTEM_PROMPT,
	DIRECTOR_SHELL_SYSTEM_PROMPT,
	DIRECTOR_ROOM_DETAIL_SYSTEM_PROMPT,
	buildDirectorUserPrompt,
	buildDirectorSceneSeparator,
	buildDirectorShellUserPrompt,
	buildDirectorRoomDetailUserPrompt
} from './prompts.mjs'

export {
	DIRECTOR_MAX_SCENES,
	DIRECTOR_MAX_IMAGES_PER_SCENE,
	isDirectorWorkbenchJson,
	applyRoomTransform,
	applyRoomYaw,
	flattenDirectorWorkbench
} from './schema.mjs'
