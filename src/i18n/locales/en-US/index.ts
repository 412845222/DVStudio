import type { LocalePackage } from '../../types'
import common from './common.json'
import titlebar from './titlebar.json'
import menu from './menu.json'
import dialog from './dialog.json'
import envCheck from './envCheck.json'
import consoleNs from './console.json'
import startup from './startup.json'
import settings from './settings.json'
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
import tasksVideo from './tasks/video.json'
import tasksMeshy from './tasks/meshy.json'
import tasksArk from './tasks/ark.json'
import tasksLog from './tasks/log.json'
import aiConfigNodeChat from './aiConfig/nodeChat.json'

const messages = {
	...common,
	...titlebar,
	...menu,
	...dialog,
	...envCheck,
	...consoleNs,
	...startup,
	...settings,
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
	...nodesTypes,
	...aichatDialog,
	...aichatTools,
	...aichatStages,
	...aichatErrors,
	...aichatMessages,
	...aichatNodeChat,
	...aichatNodeChatParams,
	...tasksVideo,
	...tasksMeshy,
	...tasksArk,
	...tasksLog,
	...aiConfigNodeChat,
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
