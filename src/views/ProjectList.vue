<template>
  <div class="project-list-page bg-vscode">
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
          选择一个已有项目进入，或点击“新建项目”创建一个新的蓝图项目。
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
          @click="onClickNewProject"
        >
          <div class="project-card-new-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="36" height="36">
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
        </button>

        <div
          v-for="project in filteredProjects"
          :key="project.id"
          class="project-card"
        >
          <div class="project-card-body">
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
          <div class="project-card-empty-title">未找到匹配的项目</div>
          <div class="project-card-empty-hint">
            尝试修改搜索关键字，或点击右上角“刷新”重新加载。
          </div>
        </div>

        <div
          v-if="!loading && !keyword && !allProjects.length"
          class="project-card project-card-empty"
        >
          <div class="project-card-empty-title">还没有项目</div>
          <div class="project-card-empty-hint">
            点击左侧“新建项目”创建你的第一个蓝图项目。
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { BlueprintProjectService } from "../network/BlueprintProjectService";
import { isElectron } from "../electronBridge";
import { useStartupProgress } from "../composables/useStartupProgress";

type ProjectCard = {
  id: number;
  name: string;
  createdAt: number | null;
  updatedAt: number | null;
};

const router = useRouter();

const loading = ref(false);
const loadError = ref("");
const creating = ref(false);
const deletingId = ref<number | null>(null);
const allProjects = ref<ProjectCard[]>([]);
const keyword = ref("");
const searchInputRef = ref<HTMLInputElement | null>(null);
const newProjectDialog = ref<HTMLDialogElement | null>(null);
const pendingRootPath = ref('');
const newProjectName = ref('');

const blueprintProjectService = new BlueprintProjectService();
const startupProgress = useStartupProgress();

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

  // 给每个 IPC 操作加上超时，避免 IPC 异常阻塞 UI
  const withTimeout = <T>(label: string, promiseFactory: () => Promise<T>, ms = 8000): Promise<T> => {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${label} 超时 (${ms}ms)`)), ms)
      promiseFactory().then((v) => { clearTimeout(timer); resolve(v) }).catch((err) => { clearTimeout(timer); reject(err) })
    })
  }

  // 1. 显式检查 localdb 初始化状态 — 失败时降级为 warn 而不是 throw
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

  // 2. 检查数据库查询能力（list projects）
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

  // 3. 确保项目列表数据同步已准备好
  await startupProgress.runStep('localdb.projects', '准备项目列表数据', async () => {
    await refreshProjects(true)
    return allProjects.value.length
  }, { errorDetailOnFailure: true })

  // 所有步骤完成后统一更新并在 2 秒后隐藏 — 不会让进度条"卡住"
  startupProgress.updateStep('localdb.projects', {
    status: 'ok',
    detail: `共 ${allProjects.value.length} 个项目`,
  })
  setTimeout(() => startupProgress.hide(), 2000)
}

const filteredProjects = computed<ProjectCard[]>(() => {
  const kw = String(keyword.value || "").trim().toLowerCase();
  if (!kw) return allProjects.value;
  return allProjects.value.filter((p) =>
    String(p.name || "").toLowerCase().includes(kw)
  );
});

function padTwo(n: number) {
  return String(n).padStart(2, "0");
}

function formatTime(t: unknown) {
  const num = typeof t === "number" ? t : Number(t || 0);
  if (!Number.isFinite(num) || num <= 0) return "-";
  const d = new Date(num);
  if (Number.isNaN(d.getTime())) return "-";
  return `${d.getFullYear()}-${padTwo(d.getMonth() + 1)}-${padTwo(
    d.getDate()
  )} ${padTwo(d.getHours())}:${padTwo(d.getMinutes())}`;
}

function normalizeProjectItem(item: unknown): ProjectCard {
  const row = (item || {}) as {
    id?: unknown;
    name?: unknown;
    createdAt?: unknown;
    updatedAt?: unknown;
  };
  const id = Number(row.id || 0);
  const created =
    typeof row.createdAt === "number" ? row.createdAt : null;
  const updated =
    typeof row.updatedAt === "number" ? row.updatedAt : null;
  return {
    id,
    name: String(row.name || "").trim(),
    createdAt: created,
    updatedAt: updated,
  };
}

async function refreshProjects(silent = false) {
  loading.value = true;
  loadError.value = "";
  try {
    let list: unknown[] = [];
    let usedLocal = false;
    if (isElectron() && typeof localDbBridge() === 'function') {
      usedLocal = true;
      const raw = await localDbBridge()!.call(null)
      list = Array.isArray(raw)
        ? raw
        : raw && typeof raw === 'object' && Array.isArray((raw as any)?.projects)
          ? (raw as any).projects
          : raw && typeof raw === 'object' && Array.isArray((raw as any)?.value)
            ? (raw as any).value
            : []
    } else {
      const res = await blueprintProjectService.listProjects();
      if (!res || !(res as { ok?: boolean }).ok) {
        const err = String(
          (res as { error?: string })?.error || "加载项目列表失败。"
        );
        if (!silent) loadError.value = err;
        allProjects.value = [];
        return;
      }
      list = Array.isArray((res as { projects?: unknown[] }).projects)
        ? ((res as { projects: unknown[] }).projects as unknown[])
        : [];
    }
    allProjects.value = list
      .map(normalizeProjectItem)
      .filter((p) => Number.isFinite(p.id) && p.id > 0)
      .sort((a, b) => {
        const au = a.updatedAt || 0;
        const bu = b.updatedAt || 0;
        if (bu !== au) return bu - au;
        const ac = a.createdAt || 0;
        const bc = b.createdAt || 0;
        return bc - ac;
      });
    if (usedLocal) {
      // 同步 hint，提示用户当前使用的是本地数据库
    }
  } catch (e) {
    const err = String(
      (e as { message?: string })?.message || e || "加载项目列表失败。"
    );
    if (!silent) loadError.value = err;
  } finally {
    loading.value = false;
  }
}

function openProject(project: ProjectCard) {
  if (!Number.isFinite(project.id) || project.id <= 0) return;
  const id = Math.floor(project.id);
  void router.push({
    name: "AIWorkflow",
    query: { projectId: String(id) },
  });
}

async function onClickNewProject() {
  if (creating.value) return;
  if (!isElectron()) {
    loadError.value = "新建项目需要选择本地文件夹，当前运行环境不支持。";
    return;
  }
  const bridge = (
    window as unknown as {
      dweb?: {
        aiworkflow?: {
          selectProjectFolder?: () => Promise<{
            canceled?: boolean;
            filePaths?: string[];
          }>;
        };
      };
    }
  )?.dweb?.aiworkflow;
  if (typeof bridge?.selectProjectFolder !== "function") {
    loadError.value = "当前运行环境不支持选择项目文件夹。";
    return;
  }
  try {
    const picked = await bridge.selectProjectFolder();
    if (
      picked?.canceled ||
      !Array.isArray(picked?.filePaths) ||
      !picked.filePaths[0]
    ) {
      return;
    }
    const rootPath = String(picked.filePaths[0] || "").trim();
    if (!rootPath) return;
    pendingRootPath.value = rootPath;
    newProjectName.value = '';
    newProjectDialog.value?.showModal();
  } catch (e) {
    loadError.value = String(
      (e as { message?: string })?.message || e || "选择项目文件夹失败。"
    );
  }
}

// Handle new project dialog confirmation
async function onNewProjectDialogConfirm() {
  if (!newProjectName.value.trim() || !pendingRootPath.value) return;
  creating.value = true;
  newProjectDialog.value?.close();
  try {
    // 先确保 localdb 已初始化 — 如果之前的启动检查失败，这里做一次重试
    const dbBridge = (
      window as unknown as {
        dweb?: { aiworkflow?: { db?: { _initState?: () => Promise<{ ok?: boolean; error?: string }>; _ensureInitialized?: (payload?: any) => Promise<{ ok?: boolean; error?: string }> } } }
      }
    )?.dweb?.aiworkflow?.db;
    if (dbBridge) {
      const initState = await dbBridge._initState?.();
      if (!initState?.ok) {
        const retry = await dbBridge._ensureInitialized?.({});
        if (!retry?.ok) {
          loadError.value = '本地数据库尚未就绪：' + String(retry?.error || initState?.error || '初始化失败');
          return;
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
                  ok?: boolean;
                  project?: { id: number };
                  error?: string;
                }>;
              };
            };
          };
        };
      }
    )?.dweb?.aiworkflow?.db?.projects?.openFolder;
    if (typeof openFolderBridge !== 'function') {
      loadError.value = "当前运行环境不支持创建项目。";
      return;
    }
    const result = await openFolderBridge({
      rootPath: pendingRootPath.value,
      name: newProjectName.value.trim(),
      create: true,
    });
    if (!result?.ok || !result?.project?.id) {
      loadError.value = result?.error || "创建项目失败。";
      return;
    }
    const projectId = result.project.id;
    void router.push({
      name: "AIWorkflow",
      query: { projectId: String(projectId) },
    });
  } catch (e) {
    loadError.value = String(
      (e as { message?: string })?.message || e || "创建项目失败。"
    );
  } finally {
    creating.value = false;
  }
}

async function onClickDeleteProject(project: ProjectCard) {
  if (!Number.isFinite(project.id) || project.id <= 0) return;
  const ok = window.confirm(
    `确认删除项目：${
      project.name || "未命名项目"
    }？\n\n该操作会删除数据库中该项目的记录；如果该项目未绑定本地文件夹，同时会清理对应的本地资源目录。`
  );
  if (!ok) return;
  deletingId.value = project.id;
  try {
    let succeeded = false;
    let errorMsg = "删除项目失败。";
    const del = (window as unknown as { dweb?: { aiworkflow?: { db?: { projects?: { delete?: (payload: { id: number }) => Promise<unknown> } } } } }).dweb?.aiworkflow?.db?.projects?.delete
    if (isElectron() && typeof del === 'function') {
      const raw = await del({ id: project.id })
      succeeded = (raw && typeof raw === 'object' && (raw as any).ok) === true || raw === true || (Array.isArray(raw) || typeof raw === 'number') // 宽松判断
      if (!succeeded && raw && typeof raw === 'object' && (raw as any).error) {
        errorMsg = String((raw as any).error)
      }
    } else {
      const res = await blueprintProjectService.deleteProject(project.id);
      if (res && (res as { ok?: boolean }).ok) {
        succeeded = true;
      } else if (res && (res as { error?: string }).error) {
        errorMsg = String((res as { error?: string }).error)
      }
    }
    if (!succeeded) {
      loadError.value = errorMsg;
      return;
    }
    await refreshProjects(true);
  } catch (e) {
    loadError.value = String(
      (e as { message?: string })?.message || e || "删除项目失败。"
    );
  } finally {
    deletingId.value = null;
  }
}

onMounted(async () => {
  await runStartupCheckSequence();
  if (typeof searchInputRef.value?.focus === "function") {
    searchInputRef.value.focus();
  }
});
</script>

<style scoped>
.project-list-page {
  width: 100%;
  height: 100%;
  overflow: auto;
  box-sizing: border-box;
  padding: 24px 24px 24px 74px;
  transition: padding-left 220ms cubic-bezier(0.22, 0.61, 0.36, 1);
}

body[data-side-nav-expanded="true"] .project-list-page {
  padding-left: 198px;
}

body[data-side-nav-expanded="false"] .project-list-page {
  padding-left: 74px;
}

.project-list-shell {
  max-width: 1120px;
  margin: 0 auto;
}

.project-list-header {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--vscode-border);
  margin-bottom: 18px;
}

.project-list-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--vscode-fg);
}

.project-list-sub {
  font-size: 12px;
  color: var(--vscode-fg-muted);
  line-height: 1.6;
}

.project-list-search {
  display: flex;
  gap: 8px;
  margin-top: 6px;
  align-items: center;
}

.project-list-search-input {
  flex: 1;
  height: 34px;
  padding: 0 12px;
  background: var(--dweb-defualt-dark);
  border: 1px solid var(--vscode-border);
  color: var(--vscode-fg);
  font-size: 13px;
  outline: none;
}

.project-list-search-input:focus {
  border-color: var(--vscode-border-accent);
  box-shadow: var(--dweb-shadow);
}

.project-list-search-refresh {
  height: 34px;
  padding: 0 14px;
  background: var(--dweb-defualt-dark);
  border: 1px solid var(--vscode-border);
  color: var(--vscode-fg);
  font-size: 12px;
  cursor: pointer;
}

.project-list-search-refresh:hover {
  background: var(--dweb-defualt);
  box-shadow: var(--dweb-shadow);
}

.project-list-search-refresh:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.project-list-error {
  margin-top: 6px;
  font-size: 12px;
  color: #e06c75;
  background: rgba(224, 108, 117, 0.12);
  padding: 8px 12px;
  border: 1px solid rgba(224, 108, 117, 0.35);
}

.project-list-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 14px;
  padding-bottom: 24px;
}

.project-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border: 1px solid var(--vscode-border);
  background: var(--dweb-defualt-light);
  min-height: 170px;
  box-sizing: border-box;
  transition: border-color 120ms ease, box-shadow 120ms ease,
    background 120ms ease;
}

.project-card:hover {
  border-color: var(--vscode-border-accent);
  box-shadow: var(--dweb-shadow);
}

.project-card-new {
  align-items: center;
  justify-content: center;
  cursor: pointer;
  text-align: center;
  border-style: dashed;
}

.project-card-new:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.project-card-new-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  color: var(--vscode-fg-muted);
}

.project-card-new-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--vscode-fg);
}

.project-card-new-hint {
  font-size: 12px;
  color: var(--vscode-fg-muted);
  line-height: 1.6;
  max-width: 240px;
}

.project-card-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  flex: 1;
}

.project-card-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--vscode-fg);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-card-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
}

.project-card-meta-row {
  display: flex;
  gap: 8px;
  align-items: baseline;
}

.project-card-meta-label {
  color: var(--vscode-fg-muted);
  min-width: 56px;
}

.project-card-meta-value {
  color: var(--vscode-fg);
}

.project-card-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  padding-top: 4px;
  border-top: 1px dashed var(--vscode-border);
}

.project-card-action {
  flex: 1;
  min-width: 64px;
  padding: 6px 10px;
  border: 1px solid var(--vscode-border);
  background: var(--dweb-defualt-dark);
  color: var(--vscode-fg);
  font-size: 12px;
  cursor: pointer;
}

.project-card-action:hover {
  background: var(--dweb-defualt);
  box-shadow: var(--dweb-shadow);
}

.project-card-action-primary {
  border-color: var(--vscode-border-accent);
}

.project-card-action-danger:hover {
  background: rgba(224, 108, 117, 0.18);
}

.project-card-action:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.project-card-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  text-align: center;
  padding: 22px 14px;
  border-style: dashed;
}

.project-card-empty-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--vscode-fg);
}

.project-card-empty-hint {
  font-size: 12px;
  color: var(--vscode-fg-muted);
  line-height: 1.6;
  max-width: 280px;
}

@media (max-width: 760px) {
  .project-list-page {
    padding: 16px 12px 16px 68px;
  }
  body[data-side-nav-expanded="true"] .project-list-page {
    padding-left: 180px;
  }
  .project-list-grid {
    grid-template-columns: 1fr;
  }
}

.new-project-dialog {
  background: var(--dweb-defualt-dark);
  border: 1px solid var(--vscode-border);
  color: var(--vscode-fg);
  padding: 20px 24px;
  border-radius: 8px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6);
  min-width: 360px;
  max-width: 480px;
}

.new-project-dialog::backdrop {
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(4px);
}

.new-project-dialog h3 {
  margin: 0 0 14px 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--vscode-fg);
}

.new-project-dialog p {
  margin: 0 0 12px 0;
  font-size: 13px;
  color: var(--vscode-fg-muted);
}

.new-project-dialog .folder-path {
  color: var(--vscode-fg);
  word-break: break-all;
}

.new-project-dialog label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  color: var(--vscode-fg-muted);
}

.new-project-dialog input {
  padding: 8px 12px;
  background: var(--dweb-defualt);
  border: 1px solid var(--vscode-border);
  color: var(--vscode-fg);
  font-size: 14px;
  outline: none;
  border-radius: 4px;
}

.new-project-dialog input:focus {
  border-color: var(--vscode-border-accent);
}

.new-project-dialog .dialog-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 18px;
}

.new-project-dialog .dialog-actions button {
  padding: 7px 16px;
  border: 1px solid var(--vscode-border);
  background: var(--dweb-defualt-dark);
  color: var(--vscode-fg);
  font-size: 13px;
  cursor: pointer;
  border-radius: 4px;
}

.new-project-dialog .dialog-actions button:hover:not(:disabled) {
  background: var(--dweb-defualt);
  box-shadow: var(--dweb-shadow);
}

.new-project-dialog .dialog-actions button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.new-project-dialog .dialog-actions button[type="submit"] {
  background: var(--vscode-border-accent);
  border-color: var(--vscode-border-accent);
  color: #fff;
}
</style>
