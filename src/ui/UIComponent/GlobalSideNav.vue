<template>
  <nav
    class="global-side-nav"
    :class="{ expanded }"
    aria-label="全局导航"
    @pointerdown.stop
    @mouseenter="setExpanded(true)"
    @mouseleave="setExpanded(false)"
  >
    <button
      v-for="item in items"
      :key="item.key"
      class="global-side-nav-item"
      :class="{ active: item.active }"
      type="button"
      @click="onSelect(item.key)"
    >
      <span class="global-side-nav-icon" aria-hidden="true">
        <svg v-if="item.key === 'projects'" viewBox="0 0 24 24" fill="none">
          <path
            d="M4 5h7l2 2h7v12H4z"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linejoin="round"
          />
        </svg>
        <svg v-else-if="item.key === 'welcome'" viewBox="0 0 24 24" fill="none">
          <path
            d="M4 9.5L12 4l8 5.5"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <path
            d="M6.5 10.5V20h11V10.5"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <path
            d="M10 20v-4h4v4"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        <svg v-else-if="item.key === 'workflow'" viewBox="0 0 24 24" fill="none">
          <circle cx="6" cy="6" r="2" stroke="currentColor" stroke-width="1.8" />
          <circle cx="18" cy="6" r="2" stroke="currentColor" stroke-width="1.8" />
          <circle cx="12" cy="18" r="2" stroke="currentColor" stroke-width="1.8" />
          <path
            d="M8 7.2L10.6 16.8M16 7.2L13.4 16.8M8 6h8"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
          />
        </svg>
        <svg v-else-if="item.key === 'studio'" viewBox="0 0 24 24" fill="none">
          <rect
            x="3"
            y="4"
            width="18"
            height="14"
            rx="2"
            stroke="currentColor"
            stroke-width="1.8"
          />
          <path
            d="M8 20h8M10 18v2M14 18v2"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
          />
          <path
            d="M7.5 9.5h9M7.5 13h6"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
          />
        </svg>
        <svg v-else viewBox="0 0 24 24" fill="none">
          <path
            d="M12 3.5l2 1.2 2.3-.3.9 2.1 2.1.9-.3 2.3 1.2 2-1.2 2 .3 2.3-2.1.9-.9 2.1-2.3-.3-2 1.2-2-1.2-2.3.3-.9-2.1-2.1-.9.3-2.3-1.2-2 1.2-2-.3-2.3 2.1-.9.9-2.1 2.3.3 2-1.2z"
            stroke="currentColor"
            stroke-width="1.4"
            stroke-linejoin="round"
          />
          <circle cx="12" cy="12" r="3.2" stroke="currentColor" stroke-width="1.6" />
        </svg>
      </span>
      <span class="global-side-nav-label">{{ item.label }}</span>
    </button>
  </nav>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";

const props = defineProps<{ expanded: boolean }>();

const emit = defineEmits<{
  (e: "expand-change", expanded: boolean): void;
}>();

const route = useRoute();
const router = useRouter();

const items = computed(() => [
  {
    key: "projects",
    label: "项目列表",
    active: route.name === "ProjectList",
  },
  {
    key: "workflow",
    label: "AI素材工作流",
    active: route.name === "AIWorkflow",
  },
  {
    key: "studio",
    label: "动画编辑器",
    active: route.name === "VideoStudio",
  },
  {
    key: "settings",
    label: "设置",
    active: route.name === "Settings",
  },
]);

function onSelect(key: string) {
  if (key === "projects") void router.push({ name: "ProjectList" });
  if (key === "workflow") void router.push({ name: "AIWorkflow" });
  if (key === "studio") void router.push({ name: "VideoStudio" });
  if (key === "settings") void router.push({ name: "Settings" });
}

function setExpanded(v: boolean) {
  if (props.expanded === v) return;
  emit("expand-change", v);
}
</script>

<style scoped>
.global-side-nav {
  box-sizing: border-box;
  width: 46px;
  height: 100%;
  background: color-mix(in srgb, var(--dweb-defualt-dark) 52%, transparent);
  backdrop-filter: blur(14px) saturate(1.25);
  -webkit-backdrop-filter: blur(14px) saturate(1.25);
  box-shadow: var(--vscode-shadow);
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 6px;
  overflow: visible;
  transition: width 220ms cubic-bezier(0.22, 0.61, 0.36, 1), background 220ms ease;
  z-index: 100;
}

.global-side-nav.expanded {
  width: 170px;
  padding: 10px 8px;
  box-shadow: 0 0 20px rgba(0, 0, 0, 0.3);
}

.global-side-nav-item {
  box-sizing: border-box;
  appearance: none;
  -webkit-appearance: none;
  width: 100%;
  border: 1px solid var(--vscode-border);
  border-radius: 0;
  background: color-mix(in srgb, var(--dweb-defualt) 70%, transparent);
  color: var(--vscode-fg);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0;
  padding: 8px 8px;
  cursor: pointer;
  overflow: visible;
}

.global-side-nav.expanded .global-side-nav-item {
  justify-content: flex-start;
  gap: 10px;
}

.global-side-nav-item:hover {
  background: color-mix(in srgb, var(--vscode-hover-bg) 75%, transparent);
  border-color: var(--vscode-hover-border);
}

.global-side-nav-item.active {
  border-color: var(--vscode-border-accent);
  box-shadow: var(--dweb-shadow);
}

.global-side-nav-icon {
  width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 20px;
}

.global-side-nav-icon svg {
  width: 18px;
  height: 18px;
}

.global-side-nav-label {
  max-width: 0;
  opacity: 0;
  white-space: nowrap;
  transition: max-width 160ms ease, opacity 120ms ease;
  font-size: 12px;
  flex-shrink: 0;
}

.global-side-nav.expanded .global-side-nav-label {
  max-width: 120px;
  opacity: 1;
}
</style>
