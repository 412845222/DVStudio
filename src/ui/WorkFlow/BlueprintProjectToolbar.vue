<template>
  <div class="bp-toolbar-wrap" @pointerdown.stop>
    <button class="bp-toolbar-toggle" type="button" @click="toggleOpen">项目</button>

    <Transition name="bp-fade-slide">
      <div v-if="open" class="bp-toolbar-panel">
        <button class="bp-toolbar-btn" type="button" @click="$emit('request-new')">
          新建项目
        </button>
        <button class="bp-toolbar-btn" type="button" @click="openSaveDialog">
          保存项目
        </button>
        <button class="bp-toolbar-btn" type="button" @click="openLoadDialog">
          加载项目
        </button>
        <button class="bp-toolbar-btn" type="button" @click="openImportFile">
          导入本地JSON
        </button>
        <button class="bp-toolbar-btn" type="button" @click="$emit('request-export')">
          导出当前JSON
        </button>
      </div>
    </Transition>

    <input
      ref="importInputRef"
      class="bp-hidden-input"
      type="file"
      accept="application/json,.json"
      @change="onImportChange"
    />

    <Transition name="bp-fade-scale">
      <div
        v-if="saveDialogOpen"
        class="bp-dialog-mask"
        @click.self="saveDialogOpen = false"
      >
        <div class="bp-dialog">
          <div class="bp-dialog-title">保存蓝图项目</div>
          <input
            v-model="saveName"
            class="bp-input"
            type="text"
            maxlength="120"
            placeholder="请输入项目名称"
            @keydown.enter.prevent="confirmSave"
          />
          <div class="bp-dialog-actions">
            <button class="bp-btn" type="button" @click="saveDialogOpen = false">
              取消
            </button>
            <button class="bp-btn primary" type="button" @click="confirmSave">
              确认保存
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <Transition name="bp-fade-scale">
      <div
        v-if="loadDialogOpen"
        class="bp-dialog-mask"
        @click.self="loadDialogOpen = false"
      >
        <div class="bp-dialog bp-dialog-wide">
          <div class="bp-dialog-title">加载蓝图项目</div>
          <div class="bp-project-list">
            <div
              v-for="item in projects"
              :key="item.id"
              class="bp-project-item"
              :class="{ active: selectedProjectId === item.id }"
            >
              <button
                class="bp-project-main"
                type="button"
                @click="selectedProjectId = item.id"
              >
                <span>{{ item.name }}</span>
                <small>{{ formatTime(item.updatedAt) }}</small>
              </button>
              <button
                class="bp-project-del"
                type="button"
                title="删除项目"
                @click.stop="onDeleteProject(item.id, item.name)"
              >
                删除
              </button>
            </div>
            <div v-if="!projects.length" class="bp-empty">暂无项目</div>
          </div>
          <div class="bp-dialog-actions">
            <button class="bp-btn" type="button" @click="loadDialogOpen = false">
              取消
            </button>
            <button class="bp-btn primary" type="button" @click="confirmLoad">
              加载
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";

export type BlueprintProjectListItem = {
  id: number;
  name: string;
  updatedAt?: number | null;
};

const props = defineProps<{
  projects: BlueprintProjectListItem[];
  currentProjectName?: string;
}>();

const emit = defineEmits<{
  (e: "request-new"): void;
  (e: "request-save", payload?: { name?: string }): void;
  (e: "request-load-list"): void;
  (e: "request-load-project", payload: { projectId: number }): void;
  (e: "request-delete-project", payload: { projectId: number }): void;
  (e: "request-import-local", payload: { file: File }): void;
  (e: "request-export"): void;
}>();

const open = ref(false);
const saveDialogOpen = ref(false);
const loadDialogOpen = ref(false);
const saveName = ref("");
const selectedProjectId = ref<number | null>(null);
const importInputRef = ref<HTMLInputElement | null>(null);

watch(
  () => props.currentProjectName,
  (next) => {
    if (typeof next === "string" && next.trim()) saveName.value = next.trim();
  },
  { immediate: true }
);

watch(
  () => props.projects,
  (next) => {
    if (!Array.isArray(next) || !next.length) {
      selectedProjectId.value = null;
      return;
    }
    if (
      selectedProjectId.value == null ||
      !next.some((x) => x.id === selectedProjectId.value)
    ) {
      selectedProjectId.value = next[0].id;
    }
  },
  { immediate: true }
);

const toggleOpen = () => {
  open.value = !open.value;
};

const openSaveDialog = () => {
  saveName.value = String(props.currentProjectName || saveName.value || "").trim();
  saveDialogOpen.value = true;
};

const confirmSave = () => {
  const name = String(saveName.value || "").trim();
  if (!name) return;
  emit("request-save", { name });
  saveDialogOpen.value = false;
};

const openLoadDialog = () => {
  emit("request-load-list");
  loadDialogOpen.value = true;
};

const confirmLoad = () => {
  if (selectedProjectId.value == null) return;
  emit("request-load-project", { projectId: selectedProjectId.value });
  loadDialogOpen.value = false;
};

const onDeleteProject = (projectId: number, projectName: string) => {
  const ok = window.confirm(
    `确定删除项目「${projectName || `#${projectId}`}」吗？此操作不可撤销。`
  );
  if (!ok) return;
  emit("request-delete-project", { projectId });
};

const openImportFile = () => {
  importInputRef.value?.click();
};

const onImportChange = (ev: Event) => {
  const input = ev.target as HTMLInputElement | null;
  const file = input?.files?.[0];
  if (!file) return;
  emit("request-import-local", { file });
  if (input) input.value = "";
};

defineExpose({
  openSaveDialog,
});

const formatTime = (ts?: number | null) => {
  if (!Number.isFinite(Number(ts))) return "更新时间未知";
  return new Date(Number(ts)).toLocaleString();
};
</script>

<style scoped>
.bp-toolbar-wrap {
  position: absolute;
  left: 16px;
  top: 16px;
  z-index: 32;
}

.bp-toolbar-toggle,
.bp-toolbar-btn,
.bp-btn {
  border: 1px solid var(--vscode-border);
  background: var(--dweb-defualt-dark);
  color: var(--vscode-fg);
  box-shadow: var(--vscode-shadow);
  cursor: pointer;
}

.bp-toolbar-toggle {
  padding: 6px 10px;
}

.bp-toolbar-panel {
  margin-top: 8px;
  display: grid;
  gap: 8px;
  min-width: 156px;
  padding: 10px;
  border: 1px solid var(--vscode-border);
  background: color-mix(in srgb, var(--dweb-defualt-dark) 92%, transparent);
  backdrop-filter: blur(4px);
  box-shadow: var(--vscode-shadow);
}

.bp-toolbar-btn {
  padding: 6px 10px;
  text-align: left;
}

.bp-toolbar-toggle:hover,
.bp-toolbar-btn:hover,
.bp-btn:hover {
  border-color: var(--vscode-hover-border);
  background: var(--vscode-hover-bg);
}

.bp-hidden-input {
  display: none;
}

.bp-dialog-mask {
  position: fixed;
  inset: 0;
  z-index: 90;
  background: rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
}

.bp-dialog {
  width: min(420px, calc(100vw - 32px));
  border: 1px solid var(--vscode-border);
  background: var(--dweb-defualt-dark);
  box-shadow: var(--vscode-shadow);
  padding: 14px;
}

.bp-dialog-wide {
  width: min(520px, calc(100vw - 32px));
}

.bp-dialog-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 10px;
}

.bp-input {
  width: 100%;
  border: 1px solid var(--vscode-border);
  background: transparent;
  color: var(--vscode-fg);
  padding: 8px;
}

.bp-input:focus {
  outline: none;
  border-color: var(--dweb-orange);
}

.bp-dialog-actions {
  margin-top: 12px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.bp-btn {
  padding: 6px 12px;
}

.bp-btn.primary {
  border-color: var(--dweb-orange);
}

.bp-project-list {
  max-height: 320px;
  overflow: auto;
  border: 1px solid var(--vscode-border);
  padding: 6px;
  display: grid;
  gap: 6px;
}

.bp-project-item {
  border: 1px solid var(--vscode-border);
  background: transparent;
  color: var(--vscode-fg);
  padding: 6px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.bp-project-main {
  flex: 1;
  border: none;
  background: transparent;
  color: inherit;
  text-align: left;
  display: flex;
  justify-content: space-between;
  gap: 8px;
  cursor: pointer;
  padding: 2px;
}

.bp-project-del {
  border: 1px solid var(--vscode-border);
  background: transparent;
  color: var(--vscode-fg-muted);
  padding: 2px 8px;
  font-size: 11px;
  cursor: pointer;
}

.bp-project-item small {
  color: var(--vscode-fg-muted);
}

.bp-project-main:hover {
  color: var(--vscode-fg);
}

.bp-project-del:hover {
  border-color: var(--dweb-orange);
  color: var(--vscode-fg);
  background: var(--vscode-hover-bg);
}

.bp-project-item.active {
  border-color: var(--dweb-orange);
}

.bp-empty {
  color: var(--vscode-fg-muted);
  font-size: 12px;
  padding: 8px;
}

.bp-fade-slide-enter-active,
.bp-fade-slide-leave-active,
.bp-fade-scale-enter-active,
.bp-fade-scale-leave-active {
  transition: all 0.2s ease;
}

.bp-fade-slide-enter-from,
.bp-fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

.bp-fade-scale-enter-from,
.bp-fade-scale-leave-to {
  opacity: 0;
  transform: scale(0.98);
}
</style>
