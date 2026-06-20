<template>
  <div class="project-list-page bg-vscode">
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

const blueprintProjectService = new BlueprintProjectService();

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
    const res = await blueprintProjectService.listProjects();
    if (!res || !(res as { ok?: boolean }).ok) {
      const err = String(
        (res as { error?: string })?.error || "加载项目列表失败。"
      );
      if (!silent) loadError.value = err;
      allProjects.value = [];
      return;
    }
    const list = Array.isArray((res as { projects?: unknown[] }).projects)
      ? ((res as { projects: unknown[] }).projects as unknown[])
      : [];
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
  creating.value = true;
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
    void router.push({
      name: "AIWorkflow",
      query: { newProject: "1", rootPath },
    });
  } catch (e) {
    loadError.value = String(
      (e as { message?: string })?.message || e || "选择项目文件夹失败。"
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
    const res = await blueprintProjectService.deleteProject(project.id);
    if (!res || !(res as { ok?: boolean }).ok) {
      loadError.value = String(
        (res as { error?: string })?.error || "删除项目失败。"
      );
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
  await refreshProjects();
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
</style>
