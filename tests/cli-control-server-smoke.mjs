/**
 * P1.3 - CLI Control Server 集成测试（无需启动 DVStudio/Electron）
 * 运行方式:
 *   cd DVStudio
 *   node tests/cli-control-server-smoke.mjs
 *
 * 覆盖：
 *  1. /health 公开端点（无token）返回 200 且包含 app/server 字段
 *  2. /tools 无 token → 401 AUTH_FAILED
 *  3. /tools 正确 token → 200 generate_image 工具存在
 *  4. POST /v1/generate-image 正确 token + 有效 prompt → 200 返回 taskId
 *  5. GET /v1/tasks/:id 正确 token → 200 任务详情（status=running）
 *  6. listTasks / filterSource=cli → 正确计数
 *  7. addTaskChangeListener 被触发（created + running 更新）
 */
import http from 'node:http'

// 预加载并 monkey-patch logger（在 service 之前）
const loggerModuleUrl = new URL('./../electron/backend/core/logger.mjs', import.meta.url)
try {
  await import(loggerModuleUrl)
} catch (_) { /* ignore */ }

// ✅ 通过 service 层启动（等价于 backend/index.mjs 的 initCliControlService 调用），deps 由 buildDeps 注入
const { initCliControlService, shutdownCliControlService } =
  await import(new URL('./../electron/backend/modules/cli-control-server/service.mjs', import.meta.url))
const { getCliControlServerToken } =
  await import(new URL('./../electron/backend/modules/cli-control-server/httpServer.mjs', import.meta.url))
const { addTaskChangeListener } =
  await import(new URL('./../electron/backend/modules/cli-control-server/taskStore.mjs', import.meta.url))

function requestJson({ method, port, path, token, body, timeoutMs = 5000 }) {
  return new Promise((resolve) => {
    const headers = {}
    let bodyData = null
    if (token) headers['x-dvs-cli-token'] = token
    if (body !== undefined) {
      bodyData = JSON.stringify(body)
      headers['Content-Type'] = 'application/json'
    }
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers,
      timeout: timeoutMs
    }, (res) => {
      let raw = ''
      res.on('data', (c) => { raw += c })
      res.on('end', () => {
        let parsed
        try { parsed = raw ? JSON.parse(raw) : {} } catch (_) { parsed = { raw } }
        resolve({ status: res.statusCode, data: parsed })
      })
    })
    req.on('error', (e) => resolve({ status: 0, data: { error: e.code, message: e.message } }))
    req.on('timeout', () => { req.destroy() })
    if (bodyData) req.write(bodyData)
    req.end()
  })
}

async function main() {
  const failures = []
  const pass = (label) => console.log(`  ✓ ${label}`)
  const fail = (label, detail) => { failures.push({ label, detail }); console.log(`  ✗ ${label} → ${JSON.stringify(detail)}`) }
  const assert = (label, condition, detail) => condition ? pass(label) : fail(label, detail)

  // 启动服务器（通过 service 层，等价于 DVStudio backend/index.mjs 的初始化路径）
  console.log('[P1-Smoke] 启动控制服务器...')
  const result = await initCliControlService({ appVersion: '1.0.0-smoke' })
  assert('server start ok', !!result.ok, result)
  if (!result.ok) {
    console.error('  fatal: server failed to start, aborting tests')
    process.exit(1)
  }
  const port = result.port
  const token = getCliControlServerToken()
  console.log(`  running on :${port}, token=${token.slice(0, 10)}...`)

  // 测试 1: /health 公开端点
  console.log('\n--- 1. /health public endpoint')
  const h1 = await requestJson({ method: 'GET', port, path: '/health' })
  assert('status 200', h1.status === 200, h1)
  assert('running=true', h1.data?.running === true, h1.data)
  assert('app.name=DVStudio', h1.data?.app?.name === 'DVStudio', h1.data?.app)
  assert('server.port matches', h1.data?.server?.port === port, h1.data?.server)
  assert('agent runtime present', typeof h1.data?.agent?.runtime === 'string', h1.data?.agent)
  assert('mcp.builtinToolsCount is number', typeof h1.data?.mcp?.builtinToolsCount === 'number', h1.data?.mcp)

  // 测试 2: /tools 无 token → 401
  console.log('\n--- 2. AUTH test (missing token)')
  const h2 = await requestJson({ method: 'GET', port, path: '/tools' })
  assert('no token → 401', h2.status === 401, h2)
  assert('no token → AUTH_FAILED error', h2.data?.error === 'AUTH_FAILED', h2.data)

  // 测试 3: /tools 错 token → 401
  console.log('\n--- 3. AUTH test (wrong token)')
  const h3 = await requestJson({ method: 'GET', port, path: '/tools', token: 'dvs_cli_DEADBEEF_DEADBEEF_DEADBEEF_DEADBEEF' })
  assert('wrong token → 401', h3.status === 401, h3)

  // 测试 4: /tools 正确 token → 200 + generate_image 存在
  console.log('\n--- 4. /tools with correct token')
  const h4 = await requestJson({ method: 'GET', port, path: '/tools', token })
  assert('correct token → 200', h4.status === 200, h4)
  assert('ok=true', h4.data?.ok === true, h4.data)
  const hasGenImg = Array.isArray(h4.data?.tools) && h4.data.tools.some((t) => t.name === 'generate_image')
  assert('generate_image tool present', hasGenImg, h4.data?.tools?.map((t) => t.name))

  // 测试 5: POST /v1/generate-image 参数校验（无 prompt）
  console.log('\n--- 5. generate-image param validation (missing prompt)')
  const h5 = await requestJson({ method: 'POST', port, path: '/v1/generate-image', token, body: { width: 512 } })
  assert('missing prompt → 400', h5.status === 400, h5)
  assert('INVALID_PARAMS error code', h5.data?.error === 'INVALID_PARAMS', h5.data)

  // 任务变更事件计数
  let createdEvents = 0
  let runningEvents = 0
  const unsub = addTaskChangeListener((evt) => {
    if (evt.type === 'created') createdEvents++
    if (evt.type === 'updated' && evt.patch?.status === 'running') runningEvents++
  })

  // 测试 6: POST /v1/generate-image 成功创建任务
  console.log('\n--- 6. generate-image create task')
  const h6 = await requestJson({
    method: 'POST',
    port,
    path: '/v1/generate-image',
    token,
    body: {
      prompt: '一只可爱的猫咪',
      width: 1024,
      height: 1024,
      outputPath: 'C:/tmp/out/cat.png'
    }
  })
  assert('create → 200', h6.status === 200, h6)
  assert('ok=true', h6.data?.ok === true, h6.data)
  const TASK_ID = h6.data?.taskId
  assert('taskId present', typeof TASK_ID === 'string' && TASK_ID.startsWith('task_'), TASK_ID)
  assert('status=running (P1 immediate markRunning)', h6.data?.status === 'running', h6.data)

  // 测试 7: 任务事件触发
  await new Promise((r) => setTimeout(r, 20))
  console.log('\n--- 7. task change listener events')
  assert('created event fired once', createdEvents === 1, { createdEvents })
  assert('running event fired once', runningEvents === 1, { runningEvents })
  unsub()

  // 测试 8: GET /v1/tasks/:id 详情
  console.log('\n--- 8. task query by id')
  const h8 = await requestJson({ method: 'GET', port, path: `/v1/tasks/${TASK_ID}`, token })
  assert('task query → 200', h8.status === 200, h8)
  assert('task.command=generate-image', h8.data?.task?.command === 'generate-image', h8.data?.task)
  assert('task.status=running', h8.data?.task?.status === 'running', h8.data?.task)
  assert('task.payload.prompt matches', h8.data?.task?.payload?.prompt === '一只可爱的猫咪', h8.data?.task?.payload)
  assert('task.payload.outputPath matches', h8.data?.task?.payload?.outputPath === 'C:/tmp/out/cat.png', h8.data?.task?.payload)

  // 测试 9: listTasks 过滤（先创建第二个任务用于验证分页）
  console.log('\n--- 9. listTasks with filters')
  const h9pre = await requestJson({
    method: 'POST', port, path: '/v1/generate-image', token,
    body: { prompt: 'second smoke task' }
  })
  assert('second task create 200', h9pre.status === 200, h9pre.status)
  const { listTasks } = await import(new URL('./../electron/backend/modules/cli-control-server/taskStore.mjs', import.meta.url))
  const r9a = listTasks({ limit: 1, offset: 0, filterSource: 'cli' })
  assert('listTasks(limit:1) → 1 task', r9a.tasks.length === 1, r9a)
  assert('total >= 2', r9a.total >= 2, r9a)
  const r9b = listTasks({ status: 'running' })
  assert('filter status=running → all match', r9b.tasks.every((t) => t.status === 'running'), r9b.tasks.map((t) => t.status))

  // 测试 10: 任务取消
  console.log('\n--- 10. task cancel')
  const h10 = await requestJson({ method: 'POST', port, path: `/v1/tasks/${TASK_ID}/cancel`, token, body: {} })
  assert('cancel → 200/ok', h10.data?.ok === true, h10)
  const afterCancel = await requestJson({ method: 'GET', port, path: `/v1/tasks/${TASK_ID}`, token })
  assert('post-cancel status=cancelled', afterCancel.data?.task?.status === 'cancelled', afterCancel.data?.task)

  // 清理
  console.log('\n[P1-Smoke] 关闭服务器...')
  shutdownCliControlService()

  console.log('\n=================')
  if (failures.length === 0) {
    console.log('ALL TESTS PASSED')
    process.exit(0)
  } else {
    console.log(`${failures.length} FAILURES:`)
    failures.forEach((f, i) => console.log(`  ${i + 1}. ${f.label}: ${JSON.stringify(f.detail)}`))
    process.exit(1)
  }
}

// 捕获未处理异常
process.on('uncaughtException', (e) => {
  console.error('[uncaught]', e)
  process.exit(2)
})
process.on('unhandledRejection', (e) => {
  console.error('[unhandledRejection]', e)
  process.exit(3)
})

main()
