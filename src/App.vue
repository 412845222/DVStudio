<template>
  <div class="app-shell" :class="{ expanded: navExpanded, electron: isElectronRuntime }">
    <GlobalTitleBar v-if="isElectronRuntime" class="app-titlebar" />
    <GlobalSideNav
      class="app-side-nav"
      :expanded="navExpanded"
      @expand-change="onNavExpandChange"
    />
    <div class="app-shell-divider" aria-hidden="true" />
    <main ref="contentEl" class="app-content">
      <router-view />
    </main>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, provide, ref } from "vue";
import { useRouter } from "vue-router";
import { VideoStudioKey, VideoStudioStore } from "./store/videostudio";
import { TimelineKey, TimelineStore } from "./store/timeline";
import { AIWorkflowKey, AIWorkflowStore } from "./store/aiworkflow";
import GlobalSideNav from "./ui/UIComponent/GlobalSideNav.vue";
import GlobalTitleBar from "./ui/UIComponent/GlobalTitleBar.vue";

provide(VideoStudioKey, VideoStudioStore);
provide(TimelineKey, TimelineStore);
provide(AIWorkflowKey, AIWorkflowStore);

const contentEl = ref<HTMLElement | null>(null);
const navExpanded = ref(false);
const isElectronRuntime = (window as any)?.__DWEB_RUNTIME__?.isElectron === true;
const router = useRouter();
let ro: ResizeObserver | null = null;

function onNavExpandChange(expanded: boolean) {
  navExpanded.value = expanded;
  syncContentRect();
  window.setTimeout(syncContentRect, 120);
  window.setTimeout(syncContentRect, 240);
}

function syncContentRect() {
  const el = contentEl.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const width = Math.max(0, Math.round(rect.width));
  const height = Math.max(0, Math.round(rect.height));
  document.documentElement.style.setProperty("--dweb-content-width", `${width}px`);
  document.documentElement.style.setProperty("--dweb-content-height", `${height}px`);
  window.dispatchEvent(
    new CustomEvent("dweb:content/resize", {
      detail: { width, height, left: rect.left, top: rect.top },
    })
  );
}

onMounted(() => {
  if (isElectronRuntime && router.currentRoute.value.name !== "Welcome") {
    void router.replace({ name: "Welcome" });
  }
  syncContentRect();
  if ("ResizeObserver" in window) {
    ro = new ResizeObserver(() => syncContentRect());
    if (contentEl.value) ro.observe(contentEl.value);
  }
  window.addEventListener("resize", syncContentRect, { passive: true });
});

onBeforeUnmount(() => {
  ro?.disconnect();
  ro = null;
  window.removeEventListener("resize", syncContentRect);
});
</script>

<style scoped>
.app-shell {
  --nav-width: 46px;
  --titlebar-height: 0px;
  width: 100vw;
  height: 100vh;
  display: grid;
  grid-template-columns: var(--nav-width) 1px minmax(0, 1fr);
  grid-template-rows: var(--titlebar-height) minmax(0, 1fr);
  overflow: hidden;
  background: var(--dweb-defualt-dark);
  transition: grid-template-columns 260ms cubic-bezier(0.22, 0.61, 0.36, 1);
}

.app-shell.electron {
  --titlebar-height: 36px;
}

.app-shell.expanded {
  --nav-width: 170px;
}

.app-titlebar {
  grid-column: 1 / 4;
  grid-row: 1;
}

.app-side-nav {
  grid-column: 1;
  grid-row: 2;
}

.app-shell-divider {
  grid-column: 2;
  grid-row: 2;
  width: 1px;
  height: 100%;
  background: color-mix(in srgb, var(--vscode-border) 75%, transparent);
  box-shadow: 1px 0 0 color-mix(in srgb, var(--dweb-defualt-dark) 45%, transparent);
}

.app-content {
  grid-column: 3;
  grid-row: 2;
  min-width: 0;
  min-height: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: var(--dweb-defualt);
}
</style>
