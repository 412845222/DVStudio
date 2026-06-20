// 自动重建 better-sqlite3 以适配 Electron 运行时的 ABI 版本
// 每次 npm install 后自动执行，避免手动运行 electron-rebuild
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

function readElectronVersion() {
  try {
    const pkg = JSON.parse(require('node:fs').readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8'))
    const devDeps = pkg.devDependencies || {}
    const deps = pkg.dependencies || {}
    const raw = devDeps.electron || deps.electron || ''
    if (!raw) return null
    // 移除 ^ ~ >= 等前缀，提取纯版本号
    const m = raw.match(/(\d+\.\d+\.\d+)/)
    return m ? m[1] : raw.replace(/[^\d.]/g, '')
  } catch {
    return null
  }
}

function currentBinaryValid(printLog = false) {
  // 尝试从 node_modules 读取 better-sqlite3 的已编译二进制的 ABI 信息
  // 方法：检查是否能在 Electron 模拟环境下 require('better-sqlite3')
  // 这里采用轻量检查：读取 package.json 中保存的 binding 版本 / 直接尝试动态加载
  try {
    const dbPkg = path.resolve(process.cwd(), 'node_modules', 'better-sqlite3', 'package.json')
    if (!existsSync(dbPkg)) {
      if (printLog) console.log('[rebuild-better-sqlite3] better-sqlite3 尚未安装，跳过检查')
      return false
    }
    const binaryPath = path.resolve(
      process.cwd(),
      'node_modules',
      'better-sqlite3',
      'build',
      'Release',
      'better_sqlite3.node',
    )
    return existsSync(binaryPath)
  } catch {
    return false
  }
}

const electronVersion = readElectronVersion()
if (!electronVersion) {
  console.log('[rebuild-better-sqlite3] 未在 package.json 中找到 electron 依赖，跳过')
  process.exit(0)
}

const needsRebuild = !currentBinaryValid(true)
// 即便二进制存在，也强制轻量检查一次 — 确保与 Electron 版本对齐
// 为避免拖慢 npm install，仅当缺失时触发 rebuild
if (needsRebuild) {
  console.log(`[rebuild-better-sqlite3] better-sqlite3 原生模块缺失，开始针对 Electron ${electronVersion} 重编译...`)
} else {
  console.log(`[rebuild-better-sqlite3] 检测到已编译的 better-sqlite3 二进制，将执行一次 @electron/rebuild 以确保 ABI 与 Electron ${electronVersion} 匹配`)
}

try {
  const args = [
    '@electron/rebuild',
    '-f',
    '-v',
    electronVersion,
    '-w',
    'better-sqlite3',
    '--only',
    'better-sqlite3',
  ]
  const cmd = `npx --yes ${args.join(' ')}`
  console.log(`[rebuild-better-sqlite3] ${cmd}`)
  execSync(cmd, { stdio: 'inherit', cwd: process.cwd() })
  console.log('[rebuild-better-sqlite3] 完成')
} catch (err) {
  console.warn(
    `\n[rebuild-better-sqlite3] 警告：自动重编译失败（${String(err?.message || err)}）。\n` +
      `  请手动执行：\n` +
      `    npx --yes @electron/rebuild -f -v ${electronVersion} -w better-sqlite3\n` +
      `  或：\n` +
      `    npm rebuild better-sqlite3 --runtime=electron --target=${electronVersion} --disturl=https://electronjs.org/headers --build-from-source\n`,
  )
  // postinstall 不应阻断整个 npm install，这里仅警告
}
