import type { LocalePackage } from '../../types'
import common from './common.json'
import titlebar from './titlebar.json'
import menu from './menu.json'
import dialog from './dialog.json'
import envCheck from './envCheck.json'
import consoleNs from './console.json'
import startup from './startup.json'
import settings from './settings.json'
import copilot from './copilot.json'
import codex from './codex.json'
import about from './about.json'
import welcome from './welcome.json'
import projectList from './projectList.json'
import toast from './toast.json'
import userMenu from './userMenu.json'
import steam from './steam.json'
import aiworkflowToolbar from './aiworkflow/toolbar.json'
import aiworkflowCanvas from './aiworkflow/canvas.json'
import aiworkflowNodeBase from './aiworkflow/nodeBase.json'
import aiworkflowContextMenu from './aiworkflow/contextMenu.json'
import aiworkflowInspector from './aiworkflow/inspector.json'
import nodesTypes from './nodes/types.json'
import aichatDialog from './aichat/dialog.json'
import aichatTools from './aichat/tools.json'
import aichatStages from './aichat/stages.json'
import aichatErrors from './aichat/errors.json'
import aichatMessages from './aichat/messages.json'
import aichatNodeChat from './aichat/nodeChat.json'
import aichatNodeChatParams from './aichat/nodeChatParams.json'
import aichatDock from './aichat/dock.json'
import aiworkflowNodeSearch from './aiworkflow/nodeSearch.json'
import aiworkflowNodeLibrary from './aiworkflow/nodeLibrary.json'
import aiworkflowSelectionToolbar from './aiworkflow/selectionToolbar.json'
import resourcesPanel from './resources/panel.json'
import tasksVideo from './tasks/video.json'
import tasksMeshy from './tasks/meshy.json'
import tasksArk from './tasks/ark.json'
import tasksGemini from './tasks/gemini.json'
import tasksTripo3d from './tasks/tripo3d.json'
import tasksLog from './tasks/log.json'
import aiConfigNodeChat from './aiConfig/nodeChat.json'
import nodesText from './nodes/text.json'
import nodesTextMerge from './nodes/textMerge.json'
import nodesImage from './nodes/image.json'
import nodesVideo from './nodes/video.json'
import nodesStory from './nodes/story.json'
import nodesModel3d from './nodes/model3d.json'
import nodesComfyui from './nodes/comfyui.json'
import nodesMeshy from './nodes/meshy.json'
import nodesSceneUnderstanding from './nodes/sceneUnderstanding.json'
import nodesSceneDecompose from './nodes/sceneDecompose.json'
import nodesSceneLayout from './nodes/sceneLayout.json'
import nodesUnreal from './nodes/unreal.json'
import nodesRotateImage from './nodes/rotateImage.json'
import nodesImageMarkup from './nodes/imageMarkup.json'
import nodesTagEditor from './nodes/tagEditor.json'
import nodesBlender from './nodes/blender.json'
import uiPreview from './ui/preview.json'
import aiworkflowPerfMonitor from './aiworkflow/perfMonitor.json'
import aiworkflowToastMessages from './aiworkflow/toastMessages.json'
import aiConfigMeshModes from './aiConfig/meshModes.json'
import aiConfigWatermark from './aiConfig/watermark.json'
import aiConfigSceneElements from './aiConfig/sceneElements.json'
import aiworkflowScenePreview from './aiworkflow/scenePreview.json'
import aiworkflowRuntime from './aiworkflow/runtime.json'
import aiworkflowPage from './aiworkflow/page.json'
import aiworkflowTemplateCenter from './aiworkflow/templateCenter.json'

const messages = {
	...common,
	...titlebar,
	...menu,
	...dialog,
	...envCheck,
	...consoleNs,
	...startup,
	...settings,
	...copilot,
	...codex,
	...about,
	...welcome,
	...projectList,
	...toast,
	...userMenu,
	...steam,
	...aiworkflowToolbar,
	...aiworkflowCanvas,
	...aiworkflowNodeBase,
	...aiworkflowContextMenu,
	...aiworkflowInspector,
	...aiworkflowNodeSearch,
	...aiworkflowNodeLibrary,
	...aiworkflowSelectionToolbar,
	...nodesTypes,
	...aichatDialog,
	...aichatTools,
	...aichatStages,
	...aichatErrors,
	...aichatMessages,
	...aichatNodeChat,
	...aichatNodeChatParams,
	...aichatDock,
	...resourcesPanel,
	...tasksVideo,
	...tasksMeshy,
	...tasksArk,
	...tasksGemini,
	...tasksTripo3d,
	...tasksLog,
	...aiConfigNodeChat,
	...nodesText,
	...nodesTextMerge,
	...nodesImage,
	...nodesVideo,
	...nodesStory,
	...nodesModel3d,
	...nodesComfyui,
	...nodesMeshy,
	...nodesSceneUnderstanding,
	...nodesSceneDecompose,
	...nodesSceneLayout,
	...nodesUnreal,
	...nodesRotateImage,
	...nodesImageMarkup,
	...nodesTagEditor,
	...nodesBlender,
	...uiPreview,
	...aiworkflowPerfMonitor,
	...aiworkflowToastMessages,
	...aiConfigMeshModes,
	...aiConfigWatermark,
	...aiConfigSceneElements,
	...aiworkflowScenePreview,
	...aiworkflowRuntime,
	...aiworkflowPage,
	...aiworkflowTemplateCenter,
}

const locale: LocalePackage = {
	meta: {
		code: 'en-US',
		name: 'English',
		englishName: 'English',
		flag: '🇺🇸',
	},
	messages,
}

export default locale
