<template>
  <div class="project-list-page">
    <GlobalPageBackground variant="project-list" />

    <dialog ref="newProjectDialog" class="new-project-dialog">
      <form @submit.prevent="onNewProjectDialogConfirm">
        <h3>新建项目</h3>
        <p>文件夹：<span class="folder-path">{{ pendingRootPath }}</span></p>
        <label>
          项目名称
          <input ref="newProjectNameInput" v-model="newProjectName" placeholder="输入项目名称" required />
        </label>
        <div class="dialog-actions">
          <button type="button" @click="newProjectDialog?.close()">取消</button>
          <button type="submit" :disabled="!newProjectName.trim()">创建</button>
        </div>
      </form>
    </dialog>

    <div class="project-list-shell">
      <header class="project-list-header">
        <div class="project-list-title">蓝图项目</div>
        <div class="project-list-sub">
          选择一个已有项目进入，或点击"新建项目"创建一个新的蓝图项目。
        </div>
        <div class="project-list-search">
          <input
            ref="searchInputRef"
            v-model.trim="keyword"
            class="project-list-search-input"
            type="text"
            placeholder="搜索项目名称…"
            maxlength="120"
            @keydown.esc.prevent="keyword = ''"
          />
          <button
            class="project-list-search-refresh"
            type="button"
            :disabled="loading"
            @click="refreshProjects"
          >
            {{ loading ? "刷新中…" : "刷新" }}
          </button>
        </div>
        <div v-if="loadError" class="project-list-error">{{ loadError }}</div>
      </header>

      <section class="project-list-grid">
        <button
          class="project-card project-card-new"
          type="button"
          :disabled="creating"
          @mouseenter="newCardHovered = true"
          @mouseleave="newCardHovered = false"
          @focusin="newCardHovered = true"
          @focusout="newCardHovered = false"
          @click="onClickNewProject"
        >
          <div class="card-glow" aria-hidden="true"></div>
          <div class="sq-container" aria-hidden="true">
            <span
              v-for="p in newProjectParticles.particles"
              :key="p.id"
              class="sq-particle"
              :class="newProjectParticles.buildHoverStateClass(newCardHovered)"
              :style="p.style"
            ></span>
          </div>
          <div class="card-frame" aria-hidden="true">
            <span class="corner tl"></span>
            <span class="corner tr"></span>
            <span class="corner bl"></span>
            <span class="corner br"></span>
          </div>
          <div class="project-card-body">
            <div class="project-card-new-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="44" height="44">
                <path
                  d="M12 4v16M4 12h16"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                />
              </svg>
            </div>
            <div class="project-card-new-title">
              {{ creating ? "新建中…" : "新建项目" }}
            </div>
            <div class="project-card-new-hint">
              选择一个本地文件夹作为项目根目录。
            </div>
          </div>
        </button>

        <div
          v-for="(project, pIndex) in filteredProjects"
          :key="project.id"
          class="project-card"
          @mouseenter="setProjectHovered(project.id, true)"
          @mouseleave="setProjectHovered(project.id, false)"
          @focusin="setProjectHovered(project.id, true)"
          @focusout="setProjectHovered(project.id, false)"
        >
          <div class="card-glow" aria-hidden="true"></div>
          <div class="sq-container" aria-hidden="true">
            <span
              v-for="p in getProjectParticles(project.id).particles"
              :key="p.id"
              class="sq-particle"
              :class="getProjectParticles(project.id).buildHoverStateClass(isProjectHovered(project.id))"
              :style="p.style"
            ></span>
          </div>
          <div class="card-frame" aria-hidden="true">
            <span class="corner tl"></span>
            <span class="corner tr"></span>
            <span class="corner bl"></span>
            <span class="corner br"></span>
          </div>
          <div class="project-card-body">
            <span class="project-card-id">{{ formatProjectId(project.id) }}</span>
            <div class="project-card-name" :title="project.name">
              {{ project.name || "未命名项目" }}
            </div>
            <div class="project-card-meta">
              <div class="project-card-meta-row">
                <span class="project-card-meta-label">创建时间</span>
                <span class="project-card-meta-value">
                  {{ formatTime(project.createdAt) }}
                </span>
              </div>
              <div class="project-card-meta-row">
                <span class="project-card-meta-label">最后修改</span>
                <span class="project-card-meta-value">
                  {{ formatTime(project.updatedAt) }}
                </span>
              </div>
            </div>
          </div>
          <div class="project-card-actions">
            <button
              class="project-card-action project-card-action-primary"
              type="button"
              :disabled="loading"
              @click="openProject(project)"
            >
              打开
            </button>
            <button
              class="project-card-action"
              type="button"
              :disabled="loading"
              @click="openProject(project)"
            >
              编辑
            </button>
            <button
              class="project-card-action project-card-action-danger"
              type="button"
              :disabled="deletingId === project.id"
              @click="onClickDeleteProject(project)"
            >
              {{ deletingId === project.id ? "删除中…" : "删除" }}
            </button>
          </div>
        </div>

        <div
          v-if="!loading && keyword && !filteredProjects.length"
          class="project-card project-card-empty"
        >
          <div class="card-glow" aria-hidden="true"></div>
          <div class="card-frame" aria-hidden="true">
            <span class="corner tl"></span>
            <span class="corner tr"></span>
            <span class="corner bl"></span>
            <span class="corner br"></span>
          </div>
          <div class="project-card-body">
            <div class="project-card-empty-title">未找到匹配的项目</div>
            <div class="project-card-empty-hint">
              尝试修改搜索关键字，或点击右上角"刷新"重新加载。
            </div>
          </div>
        </div>

        <div
          v-if="!loading && !keyword && !allProjects.length"
          class="project-card project-card-empty"
        >
          <div class="card-glow" aria-hidden="true"></div>
          <div class="card-frame" aria-hidden="true">
            <span class="corner tl"></span>
            <span class="corner tr"></span>
            <span class="corner bl"></span>
            <span class="corner br"></span>
          </div>
          <div class="project-card-body">
            <div class="project-card-empty-title">还没有项目</div>
            <div class="project-card-empty-hint">
              点击左侧"新建项目"创建你的第一个蓝图项目。
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue"
import { useRouter } from "vue-router"
import { BlueprintProjectService } from "../network/BlueprintProjectService"
import { isElectron } from "../electronBridge"
import { useStartupProgress } from "../composables/useStartupProgress"
import { useSquareParticles, type SquareParticlesResult } from "../composables/useSquareParticles"
import GlobalPageBackground from "../ui/UIComponent/GlobalPageBackground.vue"
import "../styles/project-list.css"
import "../styles/square-particles.css"

type ProjectCardItem = {
  id: number
  name: string
  createdAt: number | null
  updatedAt: number | null
}

const router = useRouter()

const loading = ref(false)
const loadError = ref("")
const creating = ref(false)
const deletingId = ref<number | null>(null)
const allProjects = ref<ProjectCardItem[]>([])
const keyword = ref("")
const searchInputRef = ref<HTMLInputElement | null>(null)
const newProjectDialog = ref<HTMLDialogElement | null>(null)
const pendingRootPath = ref('')
const newProjectName = ref('')

const blueprintProjectService = new BlueprintProjectService()
const startupProgress = useStartupProgress()

// --- Square particles (DOM-based, replaces Canvas particles) ---
const newProjectParticles: SquareParticlesResult = useSquareParticles({
  count: 8,
  seed: 42,
})
const newCardHovered = ref(false)

// Cache particle generators + hovered state per project id
const particleByProjectId = new Map<number, SquareParticlesResult>()
const hoveredProjectIds = new Set<number>()

function getProjectParticles(id: number): SquareParticlesResult {
  let p = particleByProjectId.get(id)
  if (!p) {
    p = useSquareParticles({ count: 6, seed: id })
    particleByProjectId.set(id, p)
  }
  return p
}

function setProjectHovered(id: number, hovering: boolean) {
  if (hovering) hoveredProjectIds.add(id)
  else hoveredProjectIds.delete(id)
}

function isProjectHovered(id: number): boolean {
  return hoveredProjectIds.has(id)
}

// Cleanup orphan entries after projects list refresh
function pruneProjectParticleCache(validIds: Set<number>) {
  for (const key of Array.from(particleByProjectId.keys())) {
    if (!validIds.has(key)) particleByProjectId.delete(key)
  }
  for (const key of Array.from(hoveredProjectIds.keys())) {
    if (!validIds.has(key)) hoveredProjectIds.delete(key)
  }
}

function formatProjectId(id: number): string {
  const n = Number.isFinite(id) && id > 0 ? id : 0
  return '#' + String(n).padStart(4, '0')
}

const localDbBridge = () => {
  const dweb = (window as unknown as { dweb?: { aiworkflow?: { db?: { projects?: { list?: () => Promise<unknown> } } } } }).dweb
  return dweb?.aiworkflow?.db?.projects?.list
}

async function runStartupCheckSequence() {
  if (!isElectron()) {
    return
  }
  startupProgress.show("客户端启动检查", null)
  startupProgress.reset("客户端启动检查")

  const withTimeout = <T>(label: string, promiseFactory: () => Promise<T>, ms = 8000): Promise<T> => {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${label} 超时 (${ms}ms)`)), ms)
      promiseFactory().then((v) => { clearTimeout(timer); resolve(v) }).catch((err) => { clearTimeout(timer); reject(err) })
    })
  }

  await startupProgress.runStep('localdb.init', '初始化本地数据库', async () => {
    const dbBridge = (window as unknown as {
      dweb?: { aiworkflow?: { db?: { _initState?: () => Promise<{ ok?: boolean; error?: string; dbFilePath?: string }>; _ensureInitialized?: (payload?: any) => Promise<{ ok?: boolean; error?: string }> } } }
    })?.dweb?.aiworkflow?.db
    if (!dbBridge) {
      startupProgress.updateStep('localdb.init', { status: 'warn', detail: 'IPC 桥不可用，将使用后端数据' })
      return 'fallback'
    }
    const initState = await withTimeout('localdb.init', () => Promise.resolve(dbBridge._initState?.()).then((v) => v ?? ({ ok: false, error: '未实现' })), 5000)
    if (initState?.ok) return `已就绪 @ ${String((initState as any).dbFilePath || 'default')}`
    const retry = await withTimeout('localdb.ensureInitialized', () => Promise.resolve(dbBridge._ensureInitialized?.({})).then((v) => v ?? ({ ok: false, error: '未实现' })), 5000)
    if (!retry?.ok) {
      const errMsg = String(retry?.error || '本地数据库初始化失败')
      startupProgress.updateStep('localdb.init', { status: 'warn', detail: errMsg + '（降级使用后端）' })
      return 'fallback'
    }
    return '初始化成功'
  }, { errorDetailOnFailure: true })

  const dbOpenResult = await startupProgress.runStep('localdb.open', '检查本地数据库', async () => {
    const listFn = localDbBridge()
    if (typeof listFn !== 'function') {
      startupProgress.updateStep('localdb.open', { status: 'warn', detail: '未检测到 IPC 列表接口' })
      return -1
    }
    let rows: unknown
    try {
      rows = await withTimeout('localdb.projects.list', () => Promise.resolve(listFn()), 5000)
    } catch (e) {
      startupProgress.updateStep('localdb.open', { status: 'warn', detail: String((e as any)?.message ?? e ?? '本地数据库调用失败') })
      return -1
    }
    const arr = Array.isArray(rows) ? rows : (rows && typeof rows === 'object' && Array.isArray((rows as any)?.projects) ? (rows as any).projects : [])
    return arr.length
  }, { errorDetailOnFailure: true })
  if (dbOpenResult.ok && typeof dbOpenResult.value === 'number' && dbOpenResult.value >= 0) {
    startupProgress.updateStep('localdb.open', {
      status: 'ok',
      detail: `发现 ${dbOpenResult.value} 个本地项目`,
    })
  }

  await startupProgress.runStep('localdb.projects', '准备项目列表数据', async () => {
    await refreshProjects(true)
    return allProjects.value.length
  }, { errorDetailOnFailure: true })

  startupProgress.updateStep('localdb.projects', {
    status: 'ok',
    detail: `共 ${allProjects.value.length} 个项目`,
  })
  setTimeout(() => startupProgress.hide(), 2000)
}

const filteredProjects = computed<ProjectCardItem[]>(() => {
  const kw = String(keyword.value || "").trim().toLowerCase()
  if (!kw) return allProjects.value
  return allProjects.value.filter((p) =>
    String(p.name || "").toLowerCase().includes(kw)
  )
})

function padTwo(n: number) {
  return String(n).padStart(2, "0")
}

function formatTime(t: unknown) {
  const num = typeof t === "number" ? t : Number(t || 0)
  if (!Number.isFinite(num) || num <= 0) return "-"
  const d = new Date(num)
  if (Number.isNaN(d.getTime())) return "-"
  return `${d.getFullYear()}-${padTwo(d.getMonth() + 1)}-${padTwo(
    d.getDate()
  )} ${padTwo(d.getHours())}:${padTwo(d.getMinutes())}`
}

function normalizeProjectItem(item: unknown): ProjectCardItem {
  const row = (item || {}) as {
    id?: unknown
    name?: unknown
    createdAt?: unknown
    updatedAt?: unknown
  }
  const id = Number(row.id || 0)
  const created =
    typeof row.createdAt === "number" ? row.createdAt : null
  const updated =
    typeof row.updatedAt === "number" ? row.updatedAt : null
  return {
    id,
    name: String(row.name || "").trim(),
    createdAt: created,
    updatedAt: updated,
  }
}

async function refreshProjects(silent = false) {
  loading.value = true
  loadError.value = ""
  try {
    let list: unknown[] = []
    let usedLocal = false
    if (isElectron() && typeof localDbBridge() === 'function') {
      usedLocal = true
      const raw = await localDbBridge()!.call(null)
      list = Array.isArray(raw)
        ? raw
        : raw && typeof raw === 'object' && Array.isArray((raw as any)?.projects)
          ? (raw as any).projects
          : raw && typeof raw === 'object' && Array.isArray((raw as any)?.value)
            ? (raw as any).value
            : []
    } else {
      const res = await blueprintProjectService.listProjects()
      if (!res || !(res as { ok?: boolean }).ok) {
        const err = String(
          (res as { error?: string })?.error || "加载项目列表失败。"
        )
        if (!silent) loadError.value = err
        allProjects.value = []
        return
      }
      list = Array.isArray((res as { projects?: unknown[] }).projects)
        ? ((res as { projects: unknown[] }).projects as unknown[])
        : []
    }
    // Clean up old particle cache for projects no longer present
    const newIds = new Set(list.map((it) => Number((it as { id?: unknown })?.id || 0)).filter((n) => n > 0))
    pruneProjectParticleCache(newIds)
    allProjects.value = list
      .map(normalizeProjectItem)
      .filter((p) => Number.isFinite(p.id) && p.id > 0)
      .sort((a, b) => {
        const au = a.updatedAt || 0
        const bu = b.updatedAt || 0
        if (bu !== au) return bu - au
        const ac = a.createdAt || 0
        const bc = b.createdAt || 0
        return bc - ac
      })
    if (usedLocal) {
      // synced hint placeholder (non-blocking)
    }
  } catch (e) {
    const err = String(
      (e as { message?: string })?.message || e || "加载项目列表失败。"
    )
    if (!silent) loadError.value = err
  } finally {
    loading.value = false
  }
}

function openProject(project: ProjectCardItem) {
  if (!Number.isFinite(project.id) || project.id <= 0) return
  const id = Math.floor(project.id)
  void router.push({
    name: "AIWorkflow",
    query: { projectId: String(id) },
  })
}

async function onClickNewProject() {
  if (creating.value) return
  if (!isElectron()) {
    loadError.value = "新建项目需要选择本地文件夹，当前运行环境不支持。"
    return
  }
  const bridge = (
    window as unknown as {
      dweb?: {
        aiworkflow?: {
          selectProjectFolder?: () => Promise<{
            canceled?: boolean
            filePaths?: string[]
          }>
        }
      }
    }
  )?.dweb?.aiworkflow
  if (typeof bridge?.selectProjectFolder !== "function") {
    loadError.value = "当前运行环境不支持选择项目文件夹。"
    return
  }
  try {
    const picked = await bridge.selectProjectFolder()
    if (
      picked?.canceled ||
      !Array.isArray(picked?.filePaths) ||
      !picked.filePaths[0]
    ) {
      return
    }
    const rootPath = String(picked.filePaths[0] || "").trim()
    if (!rootPath) return
    pendingRootPath.value = rootPath
    newProjectName.value = ''
    newProjectDialog.value?.showModal()
  } catch (e) {
    loadError.value = String(
      (e as { message?: string })?.message || e || "选择项目文件夹失败。"
    )
  }
}

async function onNewProjectDialogConfirm() {
  if (!newProjectName.value.trim() || !pendingRootPath.value) return
  creating.value = true
  newProjectDialog.value?.close()
  try {
    const dbBridge = (
      window as unknown as {
        dweb?: { aiworkflow?: { db?: { _initState?: () => Promise<{ ok?: boolean; error?: string }>; _ensureInitialized?: (payload?: any) => Promise<{ ok?: boolean; error?: string }> } } }
      }
    )?.dweb?.aiworkflow?.db
    if (dbBridge) {
      const initState = await dbBridge._initState?.()
      if (!initState?.ok) {
        const retry = await dbBridge._ensureInitialized?.({})
        if (!retry?.ok) {
          loadError.value = '本地数据库尚未就绪：' + String(retry?.error || initState?.error || '初始化失败')
          return
        }
      }
    }
    const openFolderBridge = (
      window as unknown as {
        dweb?: {
          aiworkflow?: {
            db?: {
              projects?: {
                openFolder?: (payload: { rootPath: string; name: string; create: boolean }) => Promise<{
                  ok?: boolean
                  project?: { id: number }
                  error?: string
                }>
              }
            }
          }
        }
      }
    )?.dweb?.aiworkflow?.db?.projects?.openFolder
    if (typeof openFolderBridge !== 'function') {
      loadError.value = "当前运行环境不支持创建项目。"
      return
    }
    const result = await openFolderBridge({
      rootPath: pendingRootPath.value,
      name: newProjectName.value.trim(),
      create: true,
    })
    if (!result?.ok || !result?.project?.id) {
      loadError.value = result?.error || "创建项目失败。"
      return
    }
    const projectId = result.project.id
    void router.push({
      name: "AIWorkflow",
      query: { projectId: String(projectId) },
    })
  } catch (e) {
    loadError.value = String(
      (e as { message?: string })?.message || e || "创建项目失败。"
    )
  } finally {
    creating.value = false
  }
}

async function onClickDeleteProject(project: ProjectCardItem) {
  if (!Number.isFinite(project.id) || project.id <= 0) return
  const ok = window.confirm(
    `确认删除项目：${
      project.name || "未命名项目"
    }？\n\n该操作会删除数据库中该项目的记录；如果该项目未绑定本地文件夹，同时会清理对应的本地资源目录。`
  )
  if (!ok) return
  deletingId.value = project.id
  try {
    let succeeded = false
    let errorMsg = "删除项目失败。"
    const del = (window as unknown as { dweb?: { aiworkflow?: { db?: { projects?: { delete?: (payload: { id: number }) => Promise<unknown> } } } } }).dweb?.aiworkflow?.db?.projects?.delete
    if (isElectron() && typeof del === 'function') {
      const raw = await del({ id: project.id })
      succeeded = (raw && typeof raw === 'object' && (raw as any).ok) === true || raw === true || (Array.isArray(raw) || typeof raw === 'number')
      if (!succeeded && raw && typeof raw === 'object' && (raw as any).error) {
        errorMsg = String((raw as any).error)
      }
    } else {
      const res = await blueprintProjectService.deleteProject(project.id)
      if (res && (res as { ok?: boolean }).ok) {
        succeeded = true
      } else if (res && (res as { error?: string }).error) {
        errorMsg = String((res as { error?: string }).error)
      }
    }
    if (!succeeded) {
      loadError.value = errorMsg
      return
    }
    await refreshProjects(true)
  } catch (e) {
    loadError.value = String(
      (e as { message?: string })?.message || e || "删除项目失败。"
    )
  } finally {
    deletingId.value = null
  }
}

onMounted(async () => {
  await runStartupCheckSequence()
  if (typeof searchInputRef.value?.focus === "function") {
    searchInputRef.value.focus()
  }
})

onBeforeUnmount(() => {
  // DOM particles are auto-cleaned by Vue on unmount —
  // just clear our in-memory caches to free references.
  particleByProjectId.clear()
  hoveredProjectIds.clear()
})
</script>
