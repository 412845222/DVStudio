<template>
  <div class="m3de-outliner-node">
    <div
      class="m3de-tree-item"
      :class="{ selected: isSelected }"
      :style="{ paddingLeft: `${depth * 16 + 8}px` }"
      @click="$emit('select', node.id)"
    >
      <button
        class="m3de-tree-expand-btn"
        :style="{ visibility: hasChildren ? 'visible' : 'hidden' }"
        @click.stop="$emit('toggleExpand', node.id)"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" :class="{ expanded: isExpanded }">
          <path d="M3 2l4 3-4 3" fill="none" stroke="currentColor" stroke-width="1.2" />
        </svg>
      </button>

      <span class="m3de-tree-type-icon" :class="node.type">
        <svg v-if="node.type === 'model'" viewBox="0 0 16 16" width="12" height="12">
          <path d="M8 1L15 5v6l-7 4-7-4V5l7-4z" fill="none" stroke="currentColor" stroke-width="1.2"/>
          <path d="M8 1v7M1 5l7 3 7-3" fill="none" stroke="currentColor" stroke-width="1"/>
        </svg>
        <svg v-else-if="node.type === 'mesh'" viewBox="0 0 16 16" width="12" height="12">
          <polygon points="8,2 14,7 12,14 4,14 2,7" fill="none" stroke="currentColor" stroke-width="1.2"/>
        </svg>
        <svg v-else-if="node.type === 'light'" viewBox="0 0 16 16" width="12" height="12">
          <circle cx="8" cy="6" r="4" fill="none" stroke="currentColor" stroke-width="1.2"/>
          <path d="M8 10v4M6 14h4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
        </svg>
        <svg v-else-if="node.type === 'camera'" viewBox="0 0 16 16" width="12" height="12">
          <rect x="2" y="4" width="12" height="8" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/>
          <circle cx="8" cy="8" r="2.5" fill="none" stroke="currentColor" stroke-width="1"/>
        </svg>
        <svg v-else viewBox="0 0 16 16" width="12" height="12">
          <path d="M3 3h10v10H3z" fill="none" stroke="currentColor" stroke-width="1.2"/>
        </svg>
      </span>

      <span class="m3de-tree-label">{{ node.name }}</span>

      <span class="m3de-tree-actions">
        <button
          class="m3de-tree-icon-btn"
          :class="{ active: node.visible }"
          @click.stop="$emit('toggleVisibility', node.id)"
          :title="node.visible ? 'Hide' : 'Show'"
        >
          <svg v-if="node.visible" viewBox="0 0 16 16" width="11" height="11">
            <path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" fill="none" stroke="currentColor" stroke-width="1.2"/>
            <circle cx="8" cy="8" r="2" fill="none" stroke="currentColor" stroke-width="1"/>
          </svg>
          <svg v-else viewBox="0 0 16 16" width="11" height="11" class="m3de-icon-strike">
            <path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" fill="none" stroke="currentColor" stroke-width="1.2"/>
            <path d="M2 2l12 12" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
          </svg>
        </button>
        <button
          class="m3de-tree-icon-btn"
          :class="{ active: !node.locked }"
          @click.stop="$emit('toggleLock', node.id)"
          :title="node.locked ? 'Unlock' : 'Lock'"
        >
          <svg v-if="node.locked" viewBox="0 0 16 16" width="11" height="11">
            <rect x="4" y="7" width="8" height="6" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/>
            <path d="M5 7V5a3 3 0 016 0v2" fill="none" stroke="currentColor" stroke-width="1.2"/>
          </svg>
          <svg v-else viewBox="0 0 16 16" width="11" height="11">
            <rect x="4" y="7" width="8" height="6" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/>
            <path d="M5 7V5a3 3 0 015.5-1.5" fill="none" stroke="currentColor" stroke-width="1.2"/>
          </svg>
        </button>
      </span>
    </div>

    <template v-if="isExpanded && hasChildren">
      <OutlinerNode
        v-for="child in node.children"
        :key="child.id"
        :node="child"
        :selected-ids="selectedIds"
        :expanded-ids="expandedIds"
        :depth="depth + 1"
        @select="$emit('select', $event)"
        @toggle-visibility="$emit('toggleVisibility', $event)"
        @toggle-lock="$emit('toggleLock', $event)"
        @toggle-expand="$emit('toggleExpand', $event)"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { OutlinerNode } from '../../WorkFlow/WorlFlowNodes/model3d/editor/types'

interface Props {
  node: OutlinerNode
  selectedIds: Set<string>
  expandedIds: Set<string>
  depth: number
}

const props = defineProps<Props>()

defineEmits<{
  select: [id: string]
  toggleVisibility: [id: string]
  toggleLock: [id: string]
  toggleExpand: [id: string]
}>()

const hasChildren = computed(() => props.node.children && props.node.children.length > 0)
const isSelected = computed(() => props.selectedIds.has(props.node.id))
const isExpanded = computed(() => props.expandedIds.has(props.node.id))
</script>

<style scoped>
.m3de-tree-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 6px 3px 8px;
  font-size: 11px;
  color: var(--wf-text-muted);
  cursor: pointer;
  transition: all 120ms ease;
  border-left: 2px solid transparent;
  user-select: none;
  position: relative;
}

.m3de-tree-item:hover {
  background: color-mix(in srgb, var(--wf-primary) 5%, var(--wf-hover-bg, transparent));
  color: var(--wf-text);
}

.m3de-tree-item.selected {
  background: var(--wf-state-selected-bg, color-mix(in srgb, var(--wf-primary) 12%, transparent));
  color: var(--wf-primary);
  border-left-color: var(--wf-primary);
  text-shadow: 0 0 4px color-mix(in srgb, var(--wf-primary) 30%, transparent);
  box-shadow: inset 0 0 12px color-mix(in srgb, var(--wf-primary) 6%, transparent);
}

.m3de-tree-expand-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  padding: 0;
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  flex-shrink: 0;
  transition: transform 120ms ease;
}

.m3de-tree-expand-btn svg.expanded {
  transform: rotate(90deg);
}

.m3de-tree-type-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  opacity: 0.8;
}

.m3de-tree-type-icon.model { color: var(--wf-primary); }
.m3de-tree-type-icon.mesh { color: #6ea8d8; }
.m3de-tree-type-icon.light { color: #e8c858; }
.m3de-tree-type-icon.camera { color: #d86e8a; }
.m3de-tree-type-icon.group { color: #888; }

.m3de-tree-label {
  flex: 1 1 auto;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.m3de-tree-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  opacity: 0;
  transition: opacity 120ms ease;
}

.m3de-tree-item:hover .m3de-tree-actions {
  opacity: 1;
}

.m3de-tree-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--wf-text-muted);
  cursor: pointer;
  transition: color 120ms ease;
}

.m3de-tree-icon-btn:hover {
  color: var(--wf-text);
}

.m3de-tree-icon-btn.active {
  color: var(--wf-text-muted);
}

.m3de-tree-icon-btn:not(.active) {
  opacity: 0.4;
}
</style>
