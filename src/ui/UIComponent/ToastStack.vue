<template>
  <Teleport to="body">
    <div
      class="wf-toast-stack"
      aria-live="polite"
      aria-atomic="false"
      @mouseenter="emit('hover', true)"
      @mouseleave="emit('hover', false)"
    >
      <div v-for="item in items" :key="item.id" class="wf-toast" :class="item.tone">
        <div class="wf-toast-body">
          <div
            class="wf-toast-message"
            :class="{
              clamp: isLong(item) && !isExpanded(item.id),
              expanded: isExpanded(item.id),
            }"
          >
            {{ item.message }}
          </div>
          <button
            v-if="isLong(item)"
            class="wf-toast-more"
            type="button"
            @click.stop="toggle(item.id)"
          >
            {{ isExpanded(item.id) ? "收起" : "展开" }}
          </button>
        </div>
        <button class="wf-toast-close" type="button" @click="emit('close', item.id)">
          关闭
        </button>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";

export type ToastItem = {
  id: string;
  message: string;
  tone?: "info" | "warn" | "error";
};

const props = defineProps<{
  items: ToastItem[];
}>();

// Expose for template (keep existing `items` usage)
const items = computed(() => props.items);

const expandedIds = ref(new Set<string>());

const isLong = (item: ToastItem) => {
  const msg = String(item?.message ?? "");
  return msg.length > 180 || msg.includes("\n");
};

const isExpanded = (id: string) => expandedIds.value.has(id);
const toggle = (id: string) => {
  const next = new Set(expandedIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  expandedIds.value = next;
};

watch(
  () => (Array.isArray(props.items) ? props.items.map((x) => x?.id).filter(Boolean) : []),
  (ids) => {
    const keep = new Set(
      (Array.isArray(ids) ? ids : []).filter((x) => typeof x === "string") as string[]
    );
    const next = new Set<string>();
    for (const id of expandedIds.value) if (keep.has(id)) next.add(id);
    expandedIds.value = next;
  },
  { immediate: true }
);

const emit = defineEmits<{
  (e: "close", id: string): void;
  (e: "hover", hovering: boolean): void;
}>();
</script>

<style scoped>
.wf-toast-stack {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 101;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: min(320px, 60vw);
}

.wf-toast {
  border: 1px solid var(--vscode-border);
  background: var(--dweb-defualt-dark);
  color: var(--vscode-fg);
  padding: 10px 12px;
  border-radius: 0;
  box-shadow: var(--vscode-shadow);
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  font-size: 12px;
  animation: wf-toast-in 160ms ease-out both;
}

.wf-toast.warn {
  border-color: rgba(242, 157, 56, 0.7);
  background: rgba(242, 157, 56, 0.12);
}

.wf-toast.error {
  border-color: rgba(220, 86, 86, 0.75);
  background: rgba(220, 86, 86, 0.12);
}

.wf-toast-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.wf-toast-message {
  white-space: pre-wrap;
  word-break: break-word;
}

.wf-toast-message.clamp {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 4;
  line-clamp: 4;
  overflow: hidden;
}

.wf-toast-message.expanded {
  max-height: 45vh;
  overflow: auto;
  padding-right: 4px;
}

.wf-toast-more {
  border: 1px solid var(--vscode-border);
  background: transparent;
  color: var(--vscode-fg);
  padding: 2px 8px;
  cursor: pointer;
  font-size: 11px;
  align-self: flex-start;
}

.wf-toast-more:hover {
  border-color: var(--vscode-hover-border);
  background: var(--vscode-hover-bg);
}

.wf-toast-close {
  border: 1px solid var(--vscode-border);
  background: transparent;
  color: var(--vscode-fg);
  padding: 4px 8px;
  cursor: pointer;
  font-size: 11px;
}

.wf-toast-close:hover {
  border-color: var(--vscode-hover-border);
  background: var(--vscode-hover-bg);
}

@keyframes wf-toast-in {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
