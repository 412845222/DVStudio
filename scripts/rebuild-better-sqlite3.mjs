// 自动重建 better-sqlite3 以适配 Electron 运行时的 ABI 版本
// - npm install 的 postinstall 会自动触发
// - dev:electron / dev:electron:app 启动前也会再次触发
// 核心：better-sqlite3 的原生 .node 文件必须与 Electron 内置 Node 的 NODE_MODULE_VERSION 一致，
//      否则主进程里 require('better-sqlite3') 就会报 "was compiled against a different Node.js version..."。
import { execSync, spawnSync } from 'node:child_process'
import { existsSync, writeFileSync, mkdtempSync, rmSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'

const ROOT = process.cwd()

function readElectronVersion() {
  try {
    const pkg = JSON.parse(readFileSync(path.resolve(ROOT, 'package.json'), 'utf8'))
    const devDeps = pkg.devDependencies || {}
    const deps = pkg.dependencies || {}
    const raw = devDeps.electron || deps.electron || ''
    if (!raw) return null
    const m = raw.match(/(\d+\.\d+\.\d+)/)
    return m ? m[1] : raw.replace(/[^\d.]/g, '')
  } catch {
    return null
  }
}

// https://github.com/electron/releases 常见 Electron 的 NODE_MODULE_VERSION 映射
// 只在 ABI 决策前做查表，无匹配时默认"一定重建"，避免漏掉新 Electron 版本
const ELECTRON_MODULE_VERSION = {
  // Electron 28 (Chromium 120 / Node 18)
  '28.0.0': 119, '28.1.0': 119, '28.2.0': 119, '28.2.1': 119,
  '28.2.2': 119, '28.2.3': 119, '28.2.4': 119, '28.2.5': 119,
  '28.2.6': 119, '28.2.7': 119, '28.2.8': 119, '28.2.9': 119,
  '28.2.10': 119, '28.3.0': 119, '28.3.1': 119, '28.3.2': 119,
  // Electron 29
  '29.0.0': 121, '29.1.0': 121, '29.1.4': 121, '29.2.0': 121,
  '29.3.0': 121, '29.4.0': 121, '29.4.3': 121,
  // Electron 30
  '30.0.0': 122, '30.0.6': 122, '30.0.8': 122, '30.0.9': 122,
  '30.1.0': 122, '30.1.2': 122, '30.2.0': 122, '30.3.0': 122, '30.3.1': 122,
  // Electron 31
  '31.0.0': 124, '31.0.2': 124, '31.1.0': 124, '31.2.0': 124,
  '31.2.1': 124, '31.3.0': 124, '31.3.1': 124,
  // Electron 32 / 33 (Chromium 128+ / Node 22).
  // Note: NODE_MODULE_VERSION inside Electron differs from upstream Node 22 (127)
  // because Electron pins its own ABI value. The actual runtime value (discovered
  // by the electron probe below) is what matters — this table is only informational.
  '32.0.0': 127, '32.1.0': 127, '32.2.0': 127, '32.3.0': 127,
  '33.0.0': 130, '33.2.0': 130, '33.4.0': 130, '33.4.11': 130,
}

function lookUpExpectedModuleVersion(electronVersion) {
  if (!electronVersion) return null
  if (ELECTRON_MODULE_VERSION[electronVersion]) return ELECTRON_MODULE_VERSION[electronVersion]
  // 精确匹配失败时，退化到 major.minor 前缀搜索
  const parts = electronVersion.split('.')
  for (let len = parts.length - 1; len >= 1; len--) {
    const prefix = parts.slice(0, len).join('.')
    const hit = Object.keys(ELECTRON_MODULE_VERSION).find((k) => k.startsWith(prefix + '.'))
    if (hit) return ELECTRON_MODULE_VERSION[hit]
  }
  return null
}

// 枚举所有"看起来像 better-sqlite3 原生二进制"的文件，便于错误定位
function enumerateBetterSqlite3Binaries() {
  const result = []
  const root = path.resolve(ROOT, 'node_modules', 'better-sqlite3')
  if (!existsSync(root)) return result
  const walk = (dir, depth) => {
    if (depth > 4) return
    let entries = []
    try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const ent of entries) {
      const full = path.resolve(dir, ent.name)
      if (ent.isDirectory()) walk(full, depth + 1)
      else if (ent.isFile() && ent.name.endsWith('.node')) result.push(full)
    }
  }
  walk(root, 0)
  return result
}

// 直接用子 Node 进程 require('better-sqlite3')，观察是否成功以及错误信息里是否出现 NODE_MODULE_VERSION 冲突
function probeBinaryModuleVersion() {
  const pkgPath = path.resolve(ROOT, 'node_modules', 'better-sqlite3', 'package.json')
  if (!existsSync(pkgPath)) return { ok: false, reason: 'pkg-not-installed', binaries: enumerateBetterSqlite3Binaries() }

  const probeDir = mkdtempSync(path.join(tmpdir(), 'dweb-bsqlite-probe-'))
  const probeScript = path.resolve(probeDir, 'probe.mjs')
  writeFileSync(
    probeScript,
    [
      "import { createRequire } from 'node:module'",
      "const require = createRequire(import.meta.url)",
      "try {",
      "  const Database = require('better-sqlite3')",
      // 仅 require，不打开任何数据库文件；成功时打印当前 Node 的 ABI
      "  console.log('DWEB_SQLITE3_OK modules=' + String(process.versions.modules))",
      "} catch (e) {",
      "  const msg = String(e && e.message ? e.message : e)",
      "  console.log('DWEB_SQLITE3_ERR modules=' + String(process.versions.modules) + ' message=' + msg)",
      "}",
    ].join('\n'),
    'utf-8',
  )

  try {
    const res = spawnSync(process.execPath, [probeScript], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30 * 1000,
      encoding: 'utf-8',
    })
    const combined = String(res.stdout || '') + '\n' + String(res.stderr || '')
    if (combined.includes('DWEB_SQLITE3_OK')) {
      const m = combined.match(/modules=(\d+)/)
      return {
        ok: true,
        runtimeModuleVersion: m ? Number(m[1]) : null,
        binaries: enumerateBetterSqlite3Binaries(),
      }
    }
    if (combined.includes('DWEB_SQLITE3_ERR')) {
      const abiMatches = Array.from(combined.matchAll(/NODE_MODULE_VERSION\s+(\d+)/g)).map((x) => Number(x[1])).filter(Boolean)
      const compiledAbi = abiMatches.length ? abiMatches[0] : null
      const expectedAbiInErr = abiMatches.length ? abiMatches[abiMatches.length - 1] : null
      return {
        ok: false,
        reason: 'abi-mismatch-detected',
        compiledAbi,
        expectedAbiInErr,
        raw: combined.replace(/\s+/g, ' ').slice(0, 800),
        binaries: enumerateBetterSqlite3Binaries(),
      }
    }
    return {
      ok: false,
      reason: 'probe-failed-no-marker',
      raw: combined.replace(/\s+/g, ' ').slice(0, 800),
      binaries: enumerateBetterSqlite3Binaries(),
    }
  } finally {
    try { rmSync(probeDir, { recursive: true, force: true }) } catch { /* ignore */ }
  }
}

// ============== 主流程 ==============
const electronVersion = readElectronVersion()
if (!electronVersion) {
  console.log('[rebuild-better-sqlite3] 未在 package.json 中找到 electron 依赖，跳过')
  process.exit(0)
}

const expectedModuleVersion = lookUpExpectedModuleVersion(electronVersion)
console.log(
  '[rebuild-better-sqlite3] target: Electron=' + electronVersion +
  (expectedModuleVersion ? ' (expected NODE_MODULE_VERSION=' + expectedModuleVersion + ')' : ' (unknown ABI; will rebuild conservatively)'),
)

// Step 1: 若 better-sqlite3 尚未安装，则直接走一次 @electron/rebuild 做首次编译
const pkgPath = path.resolve(ROOT, 'node_modules', 'better-sqlite3', 'package.json')
if (!existsSync(pkgPath)) {
  console.log('[rebuild-better-sqlite3] node_modules/better-sqlite3 不存在，开始首次编译...')
  try {
    execSync('npx --yes @electron/rebuild -f -v ' + electronVersion + ' -w better-sqlite3 --only better-sqlite3', {
      stdio: 'inherit', cwd: ROOT,
    })
    console.log('[rebuild-better-sqlite3] 完成')
  } catch (err) {
    console.warn('\n[rebuild-better-sqlite3] 自动重编译失败: ' + String(err?.message || err))
  }
  process.exit(0)
}

// 直接在 Electron 进程里 require('better-sqlite3')，这是"最权威"的探针——
// - 成功则说明当前二进制已经与 Electron 目标 ABI 匹配；
// - 失败则错误消息里会带 NODE_MODULE_VERSION，我们据此判断"是否真的需要重建"。
function probeInElectronProcess() {
  const probeDir = mkdtempSync(path.join(tmpdir(), 'dweb-bsqlite3-electron-probe-'))
  const probeScript = path.resolve(probeDir, '_probe_electron.cjs')
  // 注意：probe 脚本放在临时目录里，必须显式用 node_modules 的绝对路径来 require，否则 Electron 无法解析到 better-sqlite3
  const betterSqlite3Dir = path.resolve(ROOT, 'node_modules', 'better-sqlite3')
  const safeDir = betterSqlite3Dir.replace(/\\/g, '\\\\')
  writeFileSync(
    probeScript,
    [
      "try {",
      "  const m = require('" + safeDir + "');",
      "  process.stdout.write('DWEB_ELECTRON_PROBE_OK NODE_MODULE_VERSION=' + process.versions.modules + ' electron=' + process.versions.electron + '\\n');",
      "} catch (e) {",
      "  process.stdout.write('DWEB_ELECTRON_PROBE_ERR NODE_MODULE_VERSION=' + process.versions.modules + ' electron=' + process.versions.electron + '\\n');",
      "  process.stdout.write('DWEB_ELECTRON_PROBE_ERR msg=' + e.message + '\\n');",
      "}",
      "process.exit(0);",
    ].join('\n'),
    'utf-8',
  )

  try {
    // Windows 下优先用 node_modules/.bin/electron.cmd；其他平台走对应 shim
    const winShim = path.resolve(ROOT, 'node_modules', '.bin', 'electron.cmd')
    const nixShim = path.resolve(ROOT, 'node_modules', '.bin', 'electron')
    const hasWinShim = process.platform === 'win32' && existsSync(winShim)
    const hasNixShim = process.platform !== 'win32' && existsSync(nixShim)
    const cmd = hasWinShim
      ? '"' + winShim + '" "' + probeScript + '"'
      : hasNixShim
        ? '"' + nixShim + '" "' + probeScript + '"'
        : 'npx --no-install electron "' + probeScript + '"'

    let out = ''
    try {
      out = execSync(cmd, { cwd: ROOT, maxBuffer: 4 * 1024 * 1024, windowsHide: true, timeout: 60 * 1000, encoding: 'utf-8' })
    } catch (err) {
      // 即便命令非零退出，stdout/stderr 里仍然可能包含 PROBE_OK 标记
      out = String((err && err.stdout) || '') + '\n' + String((err && err.stderr) || '')
    }
    if (String(out).includes('DWEB_ELECTRON_PROBE_OK')) return { ok: true, raw: out.slice(0, 400) }
    return { ok: false, raw: out.slice(0, 600) }
  } catch (e) {
    return { ok: false, error: String(e?.message || e) }
  } finally {
    try { rmSync(probeDir, { recursive: true, force: true }) } catch { /* ignore */ }
  }
}

// Step 3: 决策
// 规则（2025 版，同时兼容 Node 与 Electron 双 ABI）：
//   a) 优先用 Electron 进程做权威 probe：若 Electron 能直接 require('better-sqlite3')，则二进制已正确匹配 Electron 目标 ABI，跳过重建。
//   b) Electron probe 失败才退回到本地 Node probe + 查表，给出"一定需要重建"的结论。
//     （原因：在本地 Node 22 上安装 better-sqlite3 时，其预编译二进制通常是 ABI=127，
//      与 Electron 28 的 ABI=119 并不兼容，必须由 @electron/rebuild 重新编译。）
console.log('[rebuild-better-sqlite3] 启动 Electron probe 以确认二进制是否已匹配 Electron ABI...')
const electronProbe = probeInElectronProcess()
console.log('[rebuild-better-sqlite3] electron-probe: ' + JSON.stringify(electronProbe))

let needRebuild = true
let reason = 'conservative-rebuild'

if (electronProbe.ok) {
  needRebuild = false
  reason = 'electron-probe-ok'
} else {
  // Electron probe 失败，触发重建；顺便用 Node probe 输出诊断信息便于定位问题
  const nodeProbe = probeBinaryModuleVersion()
  console.log('[rebuild-better-sqlite3] node-probe: ' + JSON.stringify({
    ok: nodeProbe.ok,
    reason: nodeProbe.reason,
    compiledAbi: nodeProbe.compiledAbi,
    runtimeModuleVersion: nodeProbe.runtimeModuleVersion,
    binaries: nodeProbe.binaries,
  }))
  reason = 'electron-probe-failed(need-rebuild-for-electron-' + electronVersion + ')'
}

if (!needRebuild) {
  console.log('[rebuild-better-sqlite3] better-sqlite3 已与 Electron ' + electronVersion + ' 兼容，跳过重建。')
  process.exit(0)
}

console.log('[rebuild-better-sqlite3] 判定需重建: ' + reason + '；开始针对 Electron ' + electronVersion + ' 重建...')

try {
  execSync('npx --yes @electron/rebuild -f -v ' + electronVersion + ' -w better-sqlite3 --only better-sqlite3', {
    stdio: 'inherit', cwd: ROOT,
  })
  console.log('[rebuild-better-sqlite3] 重建完成。再次用 Electron 探针确认...')
  const after = probeInElectronProcess()
  if (after.ok) {
    console.log('[rebuild-better-sqlite3] 重建后 Electron probe 通过 ✅')
  } else {
    console.warn('[rebuild-better-sqlite3] 警告：重建后 Electron probe 仍未通过：' + (after.raw || after.error))
  }
} catch (err) {
  console.warn(
    '\n[rebuild-better-sqlite3] 警告：自动重编译失败。\n' +
    '  请手动执行（任选其一）：\n' +
    '    npx --yes @electron/rebuild -f -v ' + electronVersion + ' -w better-sqlite3\n' +
    '    npm rebuild better-sqlite3 --runtime=electron --target=' + electronVersion + ' --disturl=https://electronjs.org/headers --build-from-source\n' +
    '  原始错误: ' + String(err?.message || err),
  )
  // postinstall 不阻断整个 npm install；但在 dev:electron 前置脚本里我们主动退出非零
  if (process.env.DWEB_FAIL_ON_REBUILD_ERROR === '1') process.exit(2)
}
