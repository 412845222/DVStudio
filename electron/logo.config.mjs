import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Logo统一配置入口 - 所有logo相关的路径和配置都从这里读取
// 使用说明：
// 1. 替换logo时，只需将新的1024x1024 PNG放置到 public/logo.png
// 2. 运行 npm run gen:logo 生成所有尺寸
// 3. 运行 npm run dev:electron 测试效果

export const LOGO_CONFIG = {
	// Logo源文件（唯一真理源）- 必须是1024x1024 PNG格式
	sourceFile: path.resolve(__dirname, '..', 'public', 'logo.png'),

	// 需要生成的多尺寸PNG列表（用于应用内显示）
	pngSizes: [32, 48, 64, 128, 256],

	// 输出路径配置
	outputs: {
		// Web/Electron窗口使用的favicon
		favicon: path.resolve(__dirname, '..', 'public', 'favicon.ico'),
		// 安装包使用的图标
		installerIcon: path.resolve(__dirname, '..', 'build', 'icon.ico'),
		// 多尺寸PNG输出目录
		pngDir: path.resolve(__dirname, '..', 'public')
	},

	// ICO文件包含的尺寸配置
	icoConfig: {
		// favicon.ico包含的尺寸
		faviconSizes: [16, 32, 48, 64, 256],
		// installerIcon.ico包含的尺寸（Windows安装包要求256x256）
		installerSizes: [16, 32, 48, 64, 256]
	},

	// 安装器侧边栏位图配置
	installerBitmaps: {
		// 是否在位图中嵌入logo图片
		embedLogo: true,
		// logo在位图中的显示尺寸
		logoSize: 48,
		// logo在位图中的位置（中心点）
		logoPosition: { x: 82, y: 110 },
		// 位图尺寸（固定）
		width: 164,
		height: 314
	},

	// 应用信息（用于logo文件名等）
	appName: 'DVStudio',
	appId: 'club.dweb.dvstudio'
}
