<template>
  <div class="app-shell" :class="{ electron: isElectronRuntime }">
    <GlobalTitleBar v-if="isElectronRuntime" class="app-titlebar" />
    <GlobalSideNav
      class="app-side-nav"
      :expanded="navExpanded"
      @expand-change="onNavExpandChange"
    />
    <main ref="contentEl" class="app-content">
      <router-view />
    </main>
    <StartupProgressBar :state="startupProgressState" @dismiss="hideStartupProgress" />
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, provide, ref } from "vue";
import { VideoStudioKey, VideoStudioStore } from "./store/videostudio";
import { TimelineKey, TimelineStore } from "./store/timeline";
import { AIWorkflowKey, AIWorkflowStore } from "./store/aiworkflow";
import GlobalSideNav from "./ui/UIComponent/GlobalSideNav.vue";
import GlobalTitleBar from "./ui/UIComponent/GlobalTitleBar.vue";
import StartupProgressBar from "./ui/UIComponent/StartupProgressBar.vue";
import { useStartupProgress } from "./composables/useStartupProgress";

provide(VideoStudioKey, VideoStudioStore);
provide(TimelineKey, TimelineStore);
provide(AIWorkflowKey, AIWorkflowStore);

const contentEl = ref<HTMLElement | null>(null);
const navExpanded = ref(false);
const isElectronRuntime = (window as any)?.__DWEB_RUNTIME__?.isElectron === true;
let ro: ResizeObserver | null = null;

const { state: startupProgressState, hide: hideStartupProgress } = useStartupProgress();

function onNavExpandChange(expanded: boolean) {
  navExpanded.value = expanded;
  document.body.setAttribute('data-side-nav-expanded', String(expanded));
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
  document.body.setAttribute('data-side-nav-expanded', String(navExpanded.value));
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
  --titlebar-height: 0px;
  width: 100vw;
  height: 100vh;
  display: grid;
  grid-template-rows: var(--titlebar-height) minmax(0, 1fr);
  overflow: hidden;
  background: var(--dweb-defualt-dark);
}

.app-shell.electron {
  --titlebar-height: 36px;
}

.app-titlebar {
  grid-column: 1 / -1;
  grid-row: 1;
  z-index: 20;
}

.app-side-nav {
  position: absolute;
  left: 0;
  top: var(--titlebar-height);
  bottom: 0;
  width: 46px;
  z-index: 15;
}

.app-content {
  grid-column: 1 / -1;
  grid-row: 2;
  min-width: 0;
  min-height: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: var(--dweb-defualt);
}
</style>
