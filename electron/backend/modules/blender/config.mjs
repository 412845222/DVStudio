/**
 * Blender MCP 配置常量
 */

export const BLENDER_MCP_SERVER_ID = 'blender'
export const BLENDER_MCP_HOST = 'localhost'
export const BLENDER_MCP_PORT = 9876

export const BLENDER_DEFAULT_PATHS = {
	win32: [
		'C:\\Program Files\\Blender Foundation\\Blender.exe',
		'C:\\Program Files (x86)\\Blender Foundation\\Blender.exe'
	],
	darwin: [
		'/Applications/Blender.app/Contents/MacOS/Blender'
	],
	linux: [
		'/usr/bin/blender',
		'/usr/local/bin/blender',
		'/snap/bin/blender'
	]
}
