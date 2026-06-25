<!-- NOTE: file will be rebuilt; marker -->
<template>
  <Teleport to="body">
    <div v-if="open">
      <div
        ref="dialogRef"
        class="dvs-pbed-dialog"
        role="dialog"
        aria-modal="false"
        :style="dialogStyle"
        @pointerdown.stop
      >
        <div class="dvs-pbed-head" @pointerdown.stop.prevent="onHeadPointerDown">
          <div class="dvs-pbed-title">进度条编辑</div>
          <button
            class="dvs-pbed-close vs-btn"
            type="button"
            aria-label="关闭"
            @click="emit('close')"
          >
            ×
          </button>
        </div>

        <div class="dvs-pbed-body">
          <div class="dvs-pbed-row1">
            <div class="dvs-pbed-col">
              <div class="dvs-pbed-col-head">段落配置</div>
              <div v-if="!spec" class="dvs-pbed-empty">
                未找到该图层的进度条数据（请先生成进度条）。
              </div>
              <div v-else class="dvs-pbed-list">
                <div v-for="(seg, idx) in segmentsDraft" :key="idx" class="dvs-pbed-row">
                  <label class="vs-label" style="flex: 1; min-width: 0">
                    <span>标题</span>
                    <input v-model="seg.title" class="vs-input" type="text" />
                  </label>
                  <label class="vs-label" style="width: 120px">
                    <span>开始帧</span>
                    <input
                      v-model.number="seg.startFrame"
                      class="vs-input"
                      type="number"
                      :min="0"
                      :max="Math.max(0, frameCount - 1)"
                      step="1"
                      @change="onSegmentStartEdit(idx)"
                    />
                  </label>
                  <label class="vs-label" style="width: 120px">
                    <span>结束帧</span>
                    <input
                      v-model.number="seg.endFrame"
                      class="vs-input"
                      type="number"
                      :min="0"
                      :max="Math.max(0, frameCount - 1)"
                      step="1"
                      @change="onSegmentEndEdit(idx)"
                    />
                  </label>
                  <button
                    class="vs-btn dvs-pbed-seg-del"
                    type="button"
                    :title="segmentsDraft.length <= 1 ? '至少保留 1 段' : '删除此段'"
                    :disabled="segmentsDraft.length <= 1"
                    @click="removeSegment(idx)"
                  >
                    删除
                  </button>
                </div>
                <button
                  class="vs-btn dvs-pbed-seg-add"
                  type="button"
                  :disabled="segmentsDraft.length >= frameCount"
                  @click="addSegment"
                >
                  添加段落
                </button>
              </div>
            </div>

            <div class="dvs-pbed-col">
              <div class="dvs-pbed-col-head">样式</div>
              <div v-if="!spec" class="dvs-pbed-empty">—</div>
              <div v-else class="dvs-pbed-style">
                <label class="vs-label">
                  <span>背景色</span>
                  <input v-model="bg" class="vs-input vs-color" type="color" />
                </label>
                <label class="vs-label">
                  <span>边框色</span>
                  <input v-model="border" class="vs-input vs-color" type="color" />
                </label>
                <label class="vs-label">
                  <span>文字色</span>
                  <input v-model="text" class="vs-input vs-color" type="color" />
                </label>

                <div class="dvs-pbed-divider" />

                <label class="vs-label">
                  <span>已播放颜色</span>
                  <input v-model="played" class="vs-input vs-color" type="color" />
                </label>
                <label class="vs-label">
                  <span>已播放边框</span>
                  <input v-model="playedBorder" class="vs-input vs-color" type="color" />
                </label>

                <div class="dvs-pbed-divider" />

                <label class="vs-label">
                  <span>标记形状</span>
                  <select v-model="markerShape" class="vs-select">
                    <option value="circle">圆</option>
                    <option value="square">方</option>
                  </select>
                </label>
                <label class="vs-label">
                  <span>标记大小</span>
                  <input
                    v-model.number="markerSize"
                    class="vs-input"
                    type="number"
                    min="1"
                    max="64"
                    step="1"
                  />
                </label>
                <label class="vs-label">
                  <span>标记颜色</span>
                  <input v-model="markerColor" class="vs-input vs-color" type="color" />
                </label>
                <label class="vs-label">
                  <span>标记边框</span>
                  <input v-model="markerBorder" class="vs-input vs-color" type="color" />
                </label>
              </div>
            </div>
          </div>

          <div class="dvs-pbed-row2 dvs-pbed-filters">
            <div v-if="!spec" class="dvs-pbed-empty">—</div>
            <template v-else>
              <div class="dvs-pbed-filter-block">
                <div class="dvs-pbed-filter-label">背景（root）</div>
                <NodeFiltersForm
                  v-if="filtersNodeIds.rootId"
                  :layer-id="String(props.layerId)"
                  :node-id="filtersNodeIds.rootId"
                  :filters="filtersByNodeId(filtersNodeIds.rootId)"
                />
              </div>
              <div class="dvs-pbed-filter-block">
                <div class="dvs-pbed-filter-label">段落矩形（segments）</div>
                <NodeFiltersForm
                  v-if="filtersNodeIds.segmentRepId"
                  :layer-id="String(props.layerId)"
                  :node-id="filtersNodeIds.segmentRepId"
                  :filters="filtersByNodeId(filtersNodeIds.segmentRepId)"
                />
              </div>
              <div class="dvs-pbed-filter-block">
                <div class="dvs-pbed-filter-label">段落文字（titles）</div>
                <NodeFiltersForm
                  v-if="filtersNodeIds.titleRepId"
                  :layer-id="String(props.layerId)"
                  :node-id="filtersNodeIds.titleRepId"
                  :filters="filtersByNodeId(filtersNodeIds.titleRepId)"
                />
              </div>
              <div class="dvs-pbed-filter-block">
                <div class="dvs-pbed-filter-label">已播放（played overlay）</div>
                <NodeFiltersForm
                  v-if="filtersNodeIds.playedOverlayId"
                  :layer-id="String(props.layerId)"
                  :node-id="filtersNodeIds.playedOverlayId"
                  :filters="filtersByNodeId(filtersNodeIds.playedOverlayId)"
                />
              </div>
            </template>
          </div>
        </div>

        <div class="dvs-pbed-foot">
          <button class="vs-btn" type="button" :disabled="!spec" @click="applyAll">
            应用（Ctrl+S）
          </button>
          <button class="vs-btn" type="button" @click="emit('close')">关闭</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useStore } from 'vuex'
import NodeFiltersForm from '../parts/nodeDetail/forms/NodeFiltersForm.vue'
import { DwebCanvasGLKey } from '../VideoSceneRuntime'
import { TimelineKey, type TimelineState } from '../../../store/timeline'
import type { ProgressBarSpec } from '../../../core/timeline'
import { VideoSceneStore } from '../../../store/videoscene'
import { cloneJsonSafe } from '../../../core/shared/cloneJsonSafe'

defineOptions({ name: 'ProgressBarEditDialog' })

const emit = defineEmits<{ close: [] }>()

const props = withDefaults(
	defineProps<{
		open: boolean
		layerId: string | number
	}>(),
	{ open: false },
)

const store = useStore<TimelineState>(TimelineKey)
const dwebCanvasRef = inject<any>(DwebCanvasGLKey, null)

const open = computed(() => !!props.open)
const frameCount = computed(() => store.state.frameCount)

const spec = computed(() => {
	const lid = String(props.layerId || '').trim()
	const map = store.state.progressBarByLayerId as Record<string, ProgressBarSpec>
	return lid && map ? (map[lid] ?? null) : null
})

const filtersNodeIds = computed(() => {
	const s = spec.value as any
	const ids = s?.nodeIds
	const rootId = String(ids?.rootId ?? '').trim()
	const playedOverlayId = String(ids?.playedOverlayId ?? '').trim()
	const segmentIds: string[] = Array.isArray(ids?.segmentIds) ? ids.segmentIds : []
	const titleIds: string[] = Array.isArray(ids?.titleIds) ? ids.titleIds : []
	const markerIds: string[] = Array.isArray(ids?.markerIds) ? ids.markerIds : []
	const segmentRepId = String(segmentIds[0] ?? '').trim()
	const titleRepId = String(titleIds[0] ?? '').trim()
	return {
		rootId,
		playedOverlayId,
		segmentIds: segmentIds.map((x) => String(x ?? '').trim()).filter(Boolean),
		titleIds: titleIds.map((x) => String(x ?? '').trim()).filter(Boolean),
		markerIds: markerIds.map((x) => String(x ?? '').trim()).filter(Boolean),
		segmentRepId,
		titleRepId,
	}
})

const findNodeInLayer = (layerId: string, nodeId: string): any | null => {
	const lid = String(layerId || '').trim()
	const id = String(nodeId || '').trim()
	if (!lid || !id) return null
	const layer = (VideoSceneStore.state.layers as any[]).find((l) => String(l?.id ?? '') === lid)
	if (!layer) return null
	const dfs = (nodes: any[] | undefined): any | null => {
		const list = Array.isArray(nodes) ? nodes : []
		for (const n of list) {
			if (!n || typeof n !== 'object') continue
			if (String((n as any).id ?? '') === id) return n
			const hit = dfs((n as any).children)
			if (hit) return hit
		}
		return null
	}
	return dfs(layer.nodeTree)
}

const filtersByNodeId = (nodeId: string): any[] => {
	const n = findNodeInLayer(String(props.layerId), nodeId)
	const v = (n as any)?.props?.filters
	return Array.isArray(v) ? (v as any[]) : []
}

const jsonStable = (v: any) => {
	try {
		return JSON.stringify(v ?? null)
	} catch {
		return ''
	}
}

const syncFiltersToNodeIds = (nodeIds: string[], filters: any[], excludeId?: string) => {
	const lid = String(props.layerId || '').trim()
	if (!lid) return
	const ex = String(excludeId ?? '').trim()
	for (const id of nodeIds) {
		const nid = String(id ?? '').trim()
		if (!nid || nid === ex) continue
		VideoSceneStore.dispatch('updateNodeProps', { layerId: lid, nodeId: nid, patch: { filters } })
	}
	dwebCanvasRef?.value?.requestRender?.()
	scheduleWriteBackToFirstKeyframeSoon()
	scheduleCommitStyleToStore()
}

// --- live commit filters to timeline spec (microtask coalesced) ---
let pendingFilterStylePatch: Record<string, any> | null = null
let filterCommitMicrotask = false
const scheduleCommitFiltersToStoreSoon = (patch: Record<string, any>) => {
	if (!props.open) return
	if (!spec.value) return
	const lid = String(props.layerId || '').trim()
	if (!lid) return
	if (!patch || typeof patch !== 'object') return
	pendingFilterStylePatch = { ...(pendingFilterStylePatch ?? {}), ...patch }
	if (filterCommitMicrotask) return
	filterCommitMicrotask = true
	queueMicrotask(() => {
		filterCommitMicrotask = false
		const merged = pendingFilterStylePatch
		pendingFilterStylePatch = null
		if (!merged || Object.keys(merged).length === 0) return
		void store.dispatch('updateProgressBarStyle', { layerId: lid, style: merged as any })
	})
}

type SegmentDraft = { title: string; startFrame: number; endFrame: number }
const segmentsDraft = ref<SegmentDraft[]>([])

const getMinKeyframeFrameForLayer = (layerId: string): number | null => {
	const lid = String(layerId || '').trim()
	if (!lid) return null
	const spans = store.state.keyframeSpansByLayer?.[lid] ?? []
	if (!Array.isArray(spans) || spans.length === 0) return null
	let min: number | null = null
	for (const s of spans) {
		const a = typeof s === 'number' ? Math.floor(s) : s && typeof s === 'object' ? Math.floor((s as any).start) : null
		if (a == null || !Number.isFinite(a)) continue
		if (min == null || a < min) min = a
	}
	return min
}

let writeBackFirstKfRaf: number | null = null
const scheduleWriteBackToFirstKeyframe = () => {
	if (!spec.value) return
	if (writeBackFirstKfRaf != null) return
	writeBackFirstKfRaf = window.requestAnimationFrame(() => {
		writeBackFirstKfRaf = null
		void writeBackToFirstKeyframe()
	})
}

let writeBackFirstKfMicrotask = false
const scheduleWriteBackToFirstKeyframeSoon = () => {
	if (!spec.value) return
	if (writeBackFirstKfMicrotask) return
	writeBackFirstKfMicrotask = true
	queueMicrotask(() => {
		writeBackFirstKfMicrotask = false
		void writeBackToFirstKeyframe()
	})
}

const writeBackToFirstKeyframe = async () => {
	const lid = String(props.layerId || '').trim()
	if (!lid) return
	let first = getMinKeyframeFrameForLayer(lid)
	if (first == null) {
		// progress bar layer should always have a stable base keyframe; if missing, create one at frame 0.
		await store.dispatch('addKeyframeRange', { layerId: lid, startFrame: 0, endFrame: 0 })
		first = 0
	}
	const layer = (VideoSceneStore.state.layers as any[]).find((l) => String(l?.id ?? '') === lid)
	if (!layer) return
	await store.dispatch('setStageKeyframeSnapshotRange', {
		startFrame: first,
		endFrame: first,
		layers: [cloneJsonSafe(layer)] as any,
	})
}

const patchNodeFiltersInLayerSnapshot = (layerSnap: any, nodeId: string, filters: any[]) => {
	const id = String(nodeId ?? '').trim()
	if (!id) return
	const dfs = (nodes: any[] | undefined): boolean => {
		const list = Array.isArray(nodes) ? nodes : []
		for (const n of list) {
			if (!n || typeof n !== 'object') continue
			if (String((n as any).id ?? '') === id) {
				;(n as any).props = { ...((n as any).props ?? {}), filters: cloneJsonSafe(filters) }
				return true
			}
			if (dfs((n as any).children)) return true
		}
		return false
	}
	dfs(layerSnap?.nodeTree)
}

const writeBackToFirstKeyframeWithPatchedFilters = async (nodeId: string, filters: any[]) => {
	const lid = String(props.layerId || '').trim()
	if (!lid) return
	let first = getMinKeyframeFrameForLayer(lid)
	if (first == null) {
		await store.dispatch('addKeyframeRange', { layerId: lid, startFrame: 0, endFrame: 0 })
		first = 0
	}
	const layer = (VideoSceneStore.state.layers as any[]).find((l) => String(l?.id ?? '') === lid)
	if (!layer) return
	const snap = cloneJsonSafe(layer)
	patchNodeFiltersInLayerSnapshot(snap, nodeId, filters)
	await store.dispatch('setStageKeyframeSnapshotRange', {
		startFrame: first,
		endFrame: first,
		layers: [snap] as any,
	})
}

const ensureProgressBarNodesForSegmentCount = async (lid: string, segCount: number) => {
	const s = spec.value as any
	if (!s) return
	const ids = s.nodeIds
	if (!ids) return
	const rootId = String(ids.rootId ?? '').trim()
	const playedId = String(ids.playedOverlayId ?? '').trim()
	if (!rootId || !playedId) return

	const n = Math.max(1, Math.floor(Number(segCount) || 1))
	const desiredSegmentIds = Array.from({ length: n }, (_, i) => `${rootId}-seg-${i}`)
	const desiredTitleIds = Array.from({ length: n }, (_, i) => `${rootId}-seg-title-${i}`)
	const desiredMarkerIds = Array.from({ length: Math.max(0, n - 1) }, (_, k) => `${rootId}-marker-${k + 1}`)

	const curSegIds: string[] = Array.isArray(ids.segmentIds) ? ids.segmentIds.map((x: any) => String(x ?? '').trim()).filter(Boolean) : []
	const curTitleIds: string[] = Array.isArray(ids.titleIds) ? ids.titleIds.map((x: any) => String(x ?? '').trim()).filter(Boolean) : []
	const curMarkerIds: string[] = Array.isArray(ids.markerIds) ? ids.markerIds.map((x: any) => String(x ?? '').trim()).filter(Boolean) : []

	const desiredSet = new Set([...desiredSegmentIds, ...desiredTitleIds, ...desiredMarkerIds])
	const toDelete = [...curSegIds, ...curTitleIds, ...curMarkerIds].filter((id) => id && !desiredSet.has(id))
	if (toDelete.length) {
		VideoSceneStore.dispatch('deleteNodesById', { layerId: lid, nodeIds: toDelete })
	}

	const layer = (VideoSceneStore.state.layers as any[]).find((l) => String(l?.id ?? '') === lid)
	if (!layer) return
	const root = findNodeInLayer(lid, rootId)
	if (!root) return

	const barH = Math.max(1, Math.round(Number((root as any).transform?.height ?? 40)))
	const baseFontSize = (() => {
		const repTitleId = String(curTitleIds[0] ?? '').trim()
		const rep = repTitleId ? findNodeInLayer(lid, repTitleId) : null
		const fs = Number((rep as any)?.props?.fontSize)
		if (Number.isFinite(fs) && fs > 0) return Math.round(fs)
		return Math.max(12, Math.min(28, Math.round(barH * 0.42)))
	})()

	const segFilters = filtersNodeIds.value.segmentRepId ? filtersByNodeId(filtersNodeIds.value.segmentRepId) : []
	const titleFilters = filtersNodeIds.value.titleRepId ? filtersByNodeId(filtersNodeIds.value.titleRepId) : []
	const bgFilters = filtersNodeIds.value.rootId ? filtersByNodeId(filtersNodeIds.value.rootId) : []
	const playedFilters = filtersNodeIds.value.playedOverlayId ? filtersByNodeId(filtersNodeIds.value.playedOverlayId) : []

	const addChildIfMissing = (node: any) => {
		const id = String(node?.id ?? '').trim()
		if (!id) return
		if (findNodeInLayer(lid, id)) return
		VideoSceneStore.dispatch('addNodeTree', { layerId: lid, parentId: rootId, node })
	}

	// Ensure base nodes keep their filters (root/played) if user edited filters.
	if (rootId) {
		VideoSceneStore.dispatch('updateNodeProps', { layerId: lid, nodeId: rootId, patch: { filters: bgFilters } })
	}
	if (playedId) {
		VideoSceneStore.dispatch('updateNodeProps', { layerId: lid, nodeId: playedId, patch: { filters: playedFilters } })
	}

	// Add missing segment/title/marker nodes.
	for (let i = 0; i < n; i++) {
		const segId = desiredSegmentIds[i]
		const titleId = desiredTitleIds[i]
		addChildIfMissing({
			id: segId,
			name: `Segment ${i + 1}`,
			category: 'user',
			userType: 'rect',
			transform: { x: 0, y: 0, width: 10, height: barH, rotation: 0, opacity: 1 },
			props: {
				fillColor: border.value,
				fillOpacity: 0.18,
				borderColor: border.value,
				borderOpacity: 0.35,
				borderWidth: 1,
				cornerRadius: 0,
				filters: segFilters,
			},
		})
		addChildIfMissing({
			id: titleId,
			name: `Segment Title ${i + 1}`,
			category: 'user',
			userType: 'text',
			transform: { x: 0, y: 0, width: 10, height: barH, rotation: 0, opacity: 1 },
			props: {
				textContent: String(segmentsDraft.value[i]?.title ?? '').trim() || `段落${i + 1}`,
				textAlign: 'center',
				fontSize: baseFontSize,
				fontColor: text.value,
				fontStyle: 'normal',
				filters: titleFilters,
			},
		})
		if (i > 0) {
			const mid = desiredMarkerIds[i - 1]
			const cr = markerShape.value === 'circle' ? 999 : 0
			addChildIfMissing({
				id: mid,
				name: `Marker ${i + 1}`,
				category: 'user',
				userType: 'rect',
				transform: { x: 0, y: 0, width: markerSize.value, height: markerSize.value, rotation: 0, opacity: 1 },
				props: {
					fillColor: markerColor.value,
					fillOpacity: 1,
					borderColor: markerBorder.value,
					borderOpacity: 0.85,
					borderWidth: 1,
					cornerRadius: cr,
				},
			})
		}
	}

	// Update timeline spec.nodeIds to reflect new arrays.
	const prevSpec = spec.value as any
	if (!prevSpec) return
	await store.dispatch('setProgressBarSpec', {
		layerId: lid,
		spec: {
			...cloneJsonSafe(prevSpec),
			nodeIds: {
				rootId,
				playedOverlayId: playedId,
				segmentIds: desiredSegmentIds,
				titleIds: desiredTitleIds,
				markerIds: desiredMarkerIds,
			},
		} as any,
	})
}

const toHexOr = (v: unknown, fallback: string) => {
	const s = String(v ?? '').trim()
	return /^#[0-9a-fA-F]{6}$/.test(s) ? s : fallback
}

const bg = ref('#222222')
const border = ref('#3aa1ff')
const text = ref('#ffffff')
const played = ref('#3aa1ff')
const playedBorder = ref('#3aa1ff')
const markerShape = ref<'circle' | 'square'>('circle')
const markerSize = ref(6)
const markerColor = ref('#3aa1ff')
const markerBorder = ref('#3aa1ff')

const clampInt = (v: unknown, min: number, max: number, fallback: number) => {
	const n = Number(v)
	if (!Number.isFinite(n)) return fallback
	const x = Math.floor(n)
	return Math.max(min, Math.min(max, x))
}

const allocateByWeights = (totalFrames: number, weights: number[]) => {
	const n = weights.length
	if (n === 0) return [] as number[]
	const total = Math.max(0, Math.floor(totalFrames))
	// We enforce at least 1 frame per segment.
	const minPer = 1
	const base = new Array(n).fill(minPer)
	let remaining = total - n * minPer
	if (remaining <= 0) {
		// If not enough frames, still keep contiguous allocation; caller should have clamped anchor to make space.
		// Here we just truncate from the tail.
		for (let i = n - 1; i >= 0 && remaining < 0; i--) {
			const can = Math.min(base[i] - 0, -remaining)
			base[i] -= can
			remaining += can
		}
		return base
	}
	const w = weights.map((x) => Math.max(1, Math.floor(Number(x) || 1)))
	const sumW = w.reduce((a, b) => a + b, 0) || 1
	const extra = new Array(n).fill(0)
	const frac = new Array(n).fill(0)
	let used = 0
	for (let i = 0; i < n; i++) {
		const ideal = (remaining * w[i]) / sumW
		const f = Math.floor(ideal)
		extra[i] = f
		frac[i] = ideal - f
		used += f
	}
	let left = remaining - used
	if (left > 0) {
		const idxs = Array.from({ length: n }, (_, i) => i).sort((a, b) => frac[b] - frac[a])
		let p = 0
		while (left > 0) {
			extra[idxs[p % n]] += 1
			left--
			p++
		}
	}
	return base.map((b, i) => b + extra[i])
}

const recomputeSegmentsWithAnchor = (anchorIndex: number, mode: 'start' | 'end') => {
	const list = segmentsDraft.value
	const n = list.length
	if (n <= 0) return
	const idx = Math.max(0, Math.min(n - 1, Math.floor(anchorIndex)))
	const preCount = idx
	const postCount = n - idx - 1

	const maxFrame = Math.max(0, frameCount.value - 1)
	const minAnchorLen = 1

	// If no pre/post segments exist, the anchor must touch the edge.
	let s = preCount === 0 ? 0 : clampInt(list[idx]?.startFrame, 0, maxFrame, 0)
	let e = postCount === 0 ? maxFrame : clampInt(list[idx]?.endFrame, 0, maxFrame, maxFrame)

	const minStart = preCount
	const maxStart = Math.max(minStart, frameCount.value - (minAnchorLen + postCount))
	const maxEnd = Math.max(0, frameCount.value - 1 - postCount)

	if (mode === 'start') {
		s = preCount === 0 ? 0 : Math.max(minStart, Math.min(maxStart, s))
		e = postCount === 0 ? maxFrame : Math.min(maxEnd, Math.max(s, e))
	} else {
		e = postCount === 0 ? maxFrame : Math.min(maxEnd, Math.max(0, e))
		s = preCount === 0 ? 0 : Math.max(minStart, Math.min(Math.min(maxStart, e), s))
		if (e < s) e = s
	}
	if (e - s + 1 < minAnchorLen) e = Math.min(maxEnd, s + minAnchorLen - 1)

	const preWeights = list.slice(0, idx).map((x) => Math.max(1, (x?.endFrame ?? 0) - (x?.startFrame ?? 0) + 1))
	const postWeights = list.slice(idx + 1).map((x) => Math.max(1, (x?.endFrame ?? 0) - (x?.startFrame ?? 0) + 1))

	const preTotal = s
	const anchorTotal = Math.max(1, e - s + 1)
	const postTotal = Math.max(0, frameCount.value - (s + anchorTotal))

	const preLens = allocateByWeights(preTotal, preWeights)
	const postLens = allocateByWeights(postTotal, postWeights)

	const next: SegmentDraft[] = list.map((x) => ({
		title: String(x?.title ?? '').trim(),
		startFrame: 0,
		endFrame: 0,
	}))

	let cursor = 0
	for (let i = 0; i < idx; i++) {
		const len = Math.max(1, preLens[i] ?? 1)
		next[i].startFrame = cursor
		next[i].endFrame = Math.min(maxFrame, cursor + len - 1)
		cursor = next[i].endFrame + 1
	}

	next[idx].startFrame = s
	next[idx].endFrame = Math.min(maxFrame, e)
	cursor = next[idx].endFrame + 1

	for (let j = 0; j < postCount; j++) {
		const i = idx + 1 + j
		const len = Math.max(1, postLens[j] ?? 1)
		next[i].startFrame = cursor
		next[i].endFrame = Math.min(maxFrame, cursor + len - 1)
		cursor = next[i].endFrame + 1
	}

	// Final hard clamp to ensure last ends exactly at maxFrame.
	if (n > 0) {
		next[0].startFrame = 0
		next[n - 1].endFrame = maxFrame
		for (let i = 1; i < n; i++) {
			next[i].startFrame = Math.max(next[i].startFrame, next[i - 1].endFrame + 1)
			if (next[i].endFrame < next[i].startFrame) next[i].endFrame = next[i].startFrame
		}
	}

	segmentsDraft.value = next
}

const normalizeSegmentsToFullRange = (items: SegmentDraft[]) => {
	const maxFrame = Math.max(0, frameCount.value - 1)
	const list = (items ?? []).map((x) => ({
		title: String(x?.title ?? '').trim(),
		startFrame: 0,
		endFrame: 0,
	}))
	const n = list.length
	if (n <= 0) {
		segmentsDraft.value = []
		return
	}
	// Each segment consumes at least 1 frame; cap count.
	if (n > frameCount.value) list.splice(frameCount.value)
	const lens = (items ?? []).slice(0, list.length).map((x) => Math.max(1, Math.floor((x?.endFrame ?? 0) - (x?.startFrame ?? 0) + 1)))
	const weights = lens.length === list.length ? lens : new Array(list.length).fill(1)
	const alloc = allocateByWeights(frameCount.value, weights)
	let cursor = 0
	for (let i = 0; i < list.length; i++) {
		const len = Math.max(1, alloc[i] ?? 1)
		list[i].startFrame = cursor
		list[i].endFrame = Math.min(maxFrame, cursor + len - 1)
		cursor = list[i].endFrame + 1
	}
	list[0].startFrame = 0
	list[list.length - 1].endFrame = maxFrame
	for (let i = 1; i < list.length; i++) {
		list[i].startFrame = Math.max(list[i].startFrame, list[i - 1].endFrame + 1)
		if (list[i].endFrame < list[i].startFrame) list[i].endFrame = list[i].startFrame
	}
	segmentsDraft.value = list
}

const removeSegment = (idx: number) => {
	if (!spec.value) return
	const list = segmentsDraft.value.slice()
	if (list.length <= 1) return
	const i = Math.max(0, Math.min(list.length - 1, Math.floor(idx)))
	list.splice(i, 1)
	normalizeSegmentsToFullRange(list)
	void syncSegmentsDraftToLayer({ rebuildOverlayKeyframes: true })
}

const addSegment = () => {
	if (!spec.value) return
	const maxAdd = frameCount.value
	const list = segmentsDraft.value.slice()
	if (list.length >= maxAdd) return
	const nextIdx = list.length + 1
	const avgLen = list.length ? Math.max(1, Math.floor(frameCount.value / (list.length + 1))) : frameCount.value
	list.push({ title: `段落${nextIdx}`, startFrame: 0, endFrame: Math.max(0, avgLen - 1) })
	normalizeSegmentsToFullRange(list)
	void syncSegmentsDraftToLayer({ rebuildOverlayKeyframes: true })
}

let segmentsSyncBusy = false
let segmentsSyncPending = false
const syncSegmentsDraftToLayer = async (opts?: { rebuildOverlayKeyframes?: boolean }) => {
	if (segmentsSyncBusy) {
		segmentsSyncPending = true
		return
	}
	segmentsSyncBusy = true
	try {
		const s = spec.value as any
		if (!s) return
		const lid = String(props.layerId || '').trim()
		if (!lid) return
		const segs = segmentsDraft.value.map((x) => ({
			title: String(x.title ?? '').trim(),
			startFrame: Math.max(0, Math.min(frameCount.value - 1, Math.floor(Number(x.startFrame ?? 0)))),
			endFrame: Math.max(0, Math.min(frameCount.value - 1, Math.floor(Number(x.endFrame ?? 0)))),
		}))
		await ensureProgressBarNodesForSegmentCount(lid, segs.length)
		await store.dispatch('updateProgressBarSegments', { layerId: lid, segments: segs as any })
		applySegmentsToStageNodes()
		if (opts?.rebuildOverlayKeyframes) {
			await rebuildPlayedOverlayKeyframes(lid, segs)
		}
		await writeBackToFirstKeyframe()
	} finally {
		segmentsSyncBusy = false
		if (segmentsSyncPending) {
			segmentsSyncPending = false
			void syncSegmentsDraftToLayer(opts)
		}
	}
}

const onSegmentStartEdit = (idx: number) => {
	if (!spec.value) return
	recomputeSegmentsWithAnchor(idx, 'start')
}

const onSegmentEndEdit = (idx: number) => {
	if (!spec.value) return
	recomputeSegmentsWithAnchor(idx, 'end')
}

watch(
	() => spec.value,
	() => {
		// no-op: draft hydration is handled below.
	},
	{ immediate: true }
)

// Hydrate drafts only when opening dialog / switching layer.
// Otherwise, applying style (which updates spec.style) would overwrite the user's segment edits.
let hydratedKey = ''
const hydrateFromSpecIfNeeded = () => {
	if (!props.open) return
	const lid = String(props.layerId || '').trim()
	const s = spec.value as any
	if (!lid || !s) return
	const key = `${lid}:${String(s?.nodeIds?.rootId ?? '')}`
	if (hydratedKey === key) return
	hydratedKey = key

	const segs = Array.isArray((s as any).segments) ? (s as any).segments : []
	segmentsDraft.value = segs.map((x: any) => ({
		title: String(x?.title ?? '').trim(),
		startFrame: Math.max(0, Math.min(frameCount.value - 1, Math.floor(Number(x?.startFrame ?? 0)))),
		endFrame: Math.max(0, Math.min(frameCount.value - 1, Math.floor(Number(x?.endFrame ?? 0)))),
	}))

	bg.value = toHexOr((s as any).style?.backgroundColor, bg.value)
	border.value = toHexOr((s as any).style?.borderColor, border.value)
	text.value = toHexOr((s as any).style?.textColor, text.value)
	played.value = toHexOr((s as any).style?.playedOverlayColor, played.value)
	playedBorder.value = toHexOr((s as any).style?.playedOverlayBorderColor, playedBorder.value)
	markerShape.value = ((s as any).style?.marker?.shape === 'square' ? 'square' : 'circle')
	markerSize.value = Math.max(1, Math.min(64, Math.floor(Number((s as any).style?.marker?.size ?? markerSize.value))))
	markerColor.value = toHexOr((s as any).style?.marker?.color, markerColor.value)
	markerBorder.value = toHexOr((s as any).style?.marker?.borderColor, markerBorder.value)
}

watch(
	() => [props.open, String(props.layerId || '').trim()] as const,
	([o]) => {
		if (!o) {
			hydratedKey = ''
			return
		}
		hydratedKey = ''
		hydrateFromSpecIfNeeded()
	},
	{ immediate: true }
)

watch(
	() => spec.value,
	() => {
		// If spec becomes available after open, hydrate once.
		hydrateFromSpecIfNeeded()
	}
)

// --- draggable dialog ---
const dialogRef = ref<HTMLDivElement | null>(null)
const pos = ref<{ left: number; top: number }>({ left: 80, top: 80 })
let drag: null | { startX: number; startY: number; startLeft: number; startTop: number } = null

const dialogStyle = computed(() => ({ left: `${pos.value.left}px`, top: `${pos.value.top}px` }))

const clampPos = () => {
	const el = dialogRef.value
	if (!el) return
	const w = el.offsetWidth
	const h = el.offsetHeight
	const vw = Math.max(1, window.innerWidth)
	const vh = Math.max(1, window.innerHeight)
	pos.value.left = Math.max(8, Math.min(vw - w - 8, pos.value.left))
	pos.value.top = Math.max(8, Math.min(vh - h - 8, pos.value.top))
}

const onHeadPointerDown = (ev: PointerEvent) => {
	if (ev.button !== 0) return
	const el = dialogRef.value
	if (!el) return
	;(ev.target as any)?.setPointerCapture?.(ev.pointerId)
	drag = { startX: ev.clientX, startY: ev.clientY, startLeft: pos.value.left, startTop: pos.value.top }
}

const onMove = (ev: PointerEvent) => {
	if (!drag) return
	pos.value.left = drag.startLeft + (ev.clientX - drag.startX)
	pos.value.top = drag.startTop + (ev.clientY - drag.startY)
	clampPos()
}

const onUp = () => {
	drag = null
}

onMounted(() => {
	window.addEventListener('pointermove', onMove)
	window.addEventListener('pointerup', onUp)
	window.addEventListener('resize', clampPos)
	window.addEventListener('dvs:shortcut/save', onSaveShortcut as any)
})

onBeforeUnmount(() => {
	window.removeEventListener('pointermove', onMove)
	window.removeEventListener('pointerup', onUp)
	window.removeEventListener('resize', clampPos)
	window.removeEventListener('dvs:shortcut/save', onSaveShortcut as any)
	if (styleCommitTimer != null) {
		window.clearTimeout(styleCommitTimer)
		styleCommitTimer = null
	}
	if (stylePreviewRaf != null) {
		window.cancelAnimationFrame(stylePreviewRaf)
		stylePreviewRaf = null
	}
	if (writeBackFirstKfRaf != null) {
		window.cancelAnimationFrame(writeBackFirstKfRaf)
		writeBackFirstKfRaf = null
	}
})

watch(
	() => props.open,
	(open) => {
		if (!open) return
		setTimeout(() => clampPos(), 0)
		// ensure played overlay is sized like background when opening
		applyPlayedOverlayLayout()
	},
	{ immediate: true }
)

// --- apply to store + stage ---
const applyPlayedOverlayLayout = () => {
	const s = spec.value as any
	if (!s) return
	const ids = s.nodeIds
	if (!ids) return
	const rootId = String(ids.rootId ?? '').trim()
	const playedId = String(ids.playedOverlayId ?? '').trim()
	if (!rootId || !playedId) return

	const layer = (VideoSceneStore.state.layers as any[]).find((l) => String(l?.id ?? '') === String(props.layerId))
	if (!layer) return
	const findNode = (nodes: any[] | undefined, id: string): any | null => {
		const list = Array.isArray(nodes) ? nodes : []
		for (const n of list) {
			if (!n || typeof n !== 'object') continue
			if (String((n as any).id ?? '') === id) return n
			const hit = findNode((n as any).children, id)
			if (hit) return hit
		}
		return null
	}
	const root = findNode(layer.nodeTree, rootId)
	if (!root) return
	const rw = Math.max(1, Math.round(Number(root.transform?.width ?? 1)))
	const rh = Math.max(1, Math.round(Number(root.transform?.height ?? 1)))
	const leftX = Math.round(-rw / 2)

	VideoSceneStore.dispatch('updateNodeTransform', {
		layerId: props.layerId,
		nodeId: playedId,
		patch: { y: 0, height: rh, x: leftX, pivotX: 0, pivotY: 0.5 },
	})
	// width is controlled by keyframes during playback; keep as-is
	scheduleWriteBackToFirstKeyframeSoon()
}

const clamp01 = (v: unknown, fallback = 0.5) => {
	const n = typeof v === 'number' ? v : Number(v)
	if (!Number.isFinite(n)) return fallback
	if (n < 0) return 0
	if (n > 1) return 1
	return n
}

const rebuildPlayedOverlayKeyframes = async (lid: string, segs: Array<{ startFrame: number; endFrame: number }>) => {
	const s = spec.value as any
	if (!s) return
	const ids = s.nodeIds
	if (!ids) return
	const playedId = String(ids.playedOverlayId ?? '').trim()
	const rootId = String(ids.rootId ?? '').trim()
	if (!playedId || !rootId) return

	const layer = (VideoSceneStore.state.layers as any[]).find((l) => String(l?.id ?? '') === String(lid))
	if (!layer) return
	const findNode = (nodes: any[] | undefined, id: string): any | null => {
		const list = Array.isArray(nodes) ? nodes : []
		for (const n of list) {
			if (!n || typeof n !== 'object') continue
			if (String((n as any).id ?? '') === id) return n
			const hit = findNode((n as any).children, id)
			if (hit) return hit
		}
		return null
	}
	const root = findNode(layer.nodeTree, rootId)
	if (!root) return
	const rw = Math.max(1, Math.round(Number(root.transform?.width ?? 1)))
	const rh = Math.max(1, Math.round(Number(root.transform?.height ?? 1)))
	const leftX = Math.round(-rw / 2)
	const endFrame = Math.max(0, frameCount.value - 1)

	const playedNode = findNode(layer.nodeTree, playedId)
	const baseRotation = Number((playedNode as any)?.transform?.rotation ?? 0)
	const baseOpacity = Number((playedNode as any)?.transform?.opacity ?? 1)

	// 使用当前 segments 的比例宽度，确保“每段起点”就是一个关键帧
	const lens = segs.map((x) => Math.max(1, x.endFrame - x.startFrame + 1))
	const total = Math.max(1, lens.reduce((a, b) => a + b, 0))
	let used = 0
	let accW = 0
	const keyframes = new Map<number, number>()
	keyframes.set(0, 0)
	for (let i = 0; i < segs.length; i++) {
		const isLast = i === segs.length - 1
		const ideal = Math.round((rw * lens[i]) / total)
		let w = isLast ? Math.max(1, rw - used) : Math.max(1, ideal)
		w = Math.min(w, Math.max(1, rw - used))
		const f = Math.max(0, Math.min(endFrame, Math.floor(Number(segs[i].startFrame))))
		keyframes.set(f, Math.max(0, Math.min(rw, Math.round(accW))))
		used += w
		accW += w
	}
	keyframes.set(endFrame, rw)

	const frames = Array.from(keyframes.keys()).sort((a, b) => a - b)
	for (const f of frames) {
		await store.dispatch('addKeyframeRange', { layerId: lid, startFrame: f, endFrame: f })
		await store.dispatch('setNodeKeyframeSnapshotRange', {
			layerId: lid,
			startFrame: f,
			endFrame: f,
			nodesById: {
				[playedId]: {
					transform: {
						x: leftX,
						y: 0,
						width: keyframes.get(f) ?? 0,
						height: rh,
						pivotX: 0,
						pivotY: 0.5,
						rotation: baseRotation,
						opacity: baseOpacity,
					},
				},
			},
		})
	}
	for (let i = 0; i + 1 < frames.length; i++) {
		const a = frames[i]
		const b = frames[i + 1]
		if (!(a < b)) continue
		await store.dispatch('enableEasingSegment', { layerId: lid, startFrame: a, endFrame: b })
		await store.dispatch('setEasingCurve', {
			segmentKey: `${lid}:${a}:${b}`,
			curve: { x1: 0, y1: 0, x2: 1, y2: 1, preset: 'linear' },
		})
	}

	// 保证 overlay 是左锚点（pivotX=0），width 只向右增长
	VideoSceneStore.dispatch('updateNodeTransform', {
		layerId: lid,
		nodeId: playedId,
		patch: { x: leftX, pivotX: 0, pivotY: clamp01((root.transform as any)?.pivotY, 0.5) },
	})
}

const reorderChildren = () => {
	const s = spec.value as any
	if (!s) return
	const ids = s.nodeIds
	if (!ids) return
	const rootId = String(ids.rootId ?? '').trim()
	const playedId = String(ids.playedOverlayId ?? '').trim()
	const segmentIds: string[] = Array.isArray(ids.segmentIds) ? ids.segmentIds : []
	const titleIds: string[] = Array.isArray(ids.titleIds) ? ids.titleIds : []
	const markerIds: string[] = Array.isArray(ids.markerIds) ? ids.markerIds : []
	if (!rootId) return

	const order = [...segmentIds, playedId, ...markerIds, ...titleIds].map((x) => String(x ?? '').trim()).filter(Boolean)
	let idx = 0
	for (const nodeId of order) {
		VideoSceneStore.dispatch('moveNode', {
			layerId: props.layerId,
			nodeId,
			targetParentId: rootId,
			targetIndex: idx,
		})
		idx++
	}
}

const applySegmentsToStageNodes = () => {
	const s = spec.value as any
	if (!s) return
	const ids = s.nodeIds
	if (!ids) return
	const rootId = String(ids.rootId ?? '').trim()
	if (!rootId) return

	const segmentIds: string[] = Array.isArray(ids.segmentIds) ? ids.segmentIds : []
	const titleIds: string[] = Array.isArray(ids.titleIds) ? ids.titleIds : []
	const markerIds: string[] = Array.isArray(ids.markerIds) ? ids.markerIds : []

	const layer = (VideoSceneStore.state.layers as any[]).find((l) => String(l?.id ?? '') === String(props.layerId))
	if (!layer) return
	const findNode = (nodes: any[] | undefined, id: string): any | null => {
		const list = Array.isArray(nodes) ? nodes : []
		for (const n of list) {
			if (!n || typeof n !== 'object') continue
			if (String((n as any).id ?? '') === id) return n
			const hit = findNode((n as any).children, id)
			if (hit) return hit
		}
		return null
	}
	const root = findNode(layer.nodeTree, rootId)
	if (!root) return
	const rw = Math.max(1, Math.round(Number(root.transform?.width ?? 1)))
	const rh = Math.max(1, Math.round(Number(root.transform?.height ?? 1)))
	const leftX = Math.round(-rw / 2)

	const segs = segmentsDraft.value.map((x) => ({
		title: String(x.title ?? '').trim() || '段落',
		startFrame: Math.max(0, Math.min(frameCount.value - 1, Math.floor(Number(x.startFrame ?? 0)))),
		endFrame: Math.max(0, Math.min(frameCount.value - 1, Math.floor(Number(x.endFrame ?? 0)))),
	}))

	const lens = segs.map((x) => Math.max(1, x.endFrame - x.startFrame + 1))
	const total = Math.max(1, lens.reduce((a, b) => a + b, 0))

	let used = 0
	let accW = 0
	for (let i = 0; i < segs.length; i++) {
		const isLast = i === segs.length - 1
		const ideal = Math.round((rw * lens[i]) / total)
		let w = isLast ? Math.max(1, rw - used) : Math.max(1, ideal)
		w = Math.min(w, Math.max(1, rw - used))
		const centerX = Math.round(leftX + accW + w / 2)

		const segId = String(segmentIds[i] ?? '').trim()
		if (segId) {
			VideoSceneStore.dispatch('updateNodeTransform', {
				layerId: props.layerId,
				nodeId: segId,
				patch: { x: centerX, y: 0, width: w, height: rh },
			})
		}
		const titleId = String(titleIds[i] ?? '').trim()
		if (titleId) {
			VideoSceneStore.dispatch('updateNodeTransform', {
				layerId: props.layerId,
				nodeId: titleId,
				patch: { x: centerX, y: 0, width: w, height: rh },
			})
			VideoSceneStore.dispatch('updateNodeProps', {
				layerId: props.layerId,
				nodeId: titleId,
				patch: { textContent: segs[i].title },
			})
		}

		// marker at segment start (except first)
		if (i > 0) {
			const mid = String(markerIds[i - 1] ?? '').trim()
			if (mid) {
				const mx = Math.round(leftX + accW)
				VideoSceneStore.dispatch('updateNodeTransform', {
					layerId: props.layerId,
					nodeId: mid,
					patch: { x: mx, y: 0 },
				})
			}
		}

		used += w
		accW += w
	}

	reorderChildren()
	applyPlayedOverlayLayout()
	scheduleWriteBackToFirstKeyframeSoon()
}

// --- live preview for style changes ---
let stylePreviewRaf: number | null = null
const scheduleStylePreview = () => {
	if (stylePreviewRaf != null) return
	stylePreviewRaf = window.requestAnimationFrame(() => {
		stylePreviewRaf = null
		applyStyleToStageNodesOnly()
	})
}

const applyStyleToStageNodesOnly = () => {
	const s = spec.value as any
	if (!s) return
	const lid = String(props.layerId || '').trim()
	if (!lid) return
	const ids = (s as any).nodeIds
	if (!ids) return
	const rootId = String(ids.rootId ?? '').trim()
	const playedId = String(ids.playedOverlayId ?? '').trim()
	const segmentIds: string[] = Array.isArray(ids.segmentIds) ? ids.segmentIds : []
	const titleIds: string[] = Array.isArray(ids.titleIds) ? ids.titleIds : []
	const markerIds: string[] = Array.isArray(ids.markerIds) ? ids.markerIds : []

	if (rootId) {
		VideoSceneStore.dispatch('updateNodeProps', {
			layerId: lid,
			nodeId: rootId,
			patch: { fillColor: bg.value, borderColor: border.value },
		})
	}
	for (const id of segmentIds) {
		const sid = String(id ?? '').trim()
		if (!sid) continue
		VideoSceneStore.dispatch('updateNodeProps', {
			layerId: lid,
			nodeId: sid,
			patch: { fillColor: border.value, borderColor: border.value },
		})
	}
	for (const id of titleIds) {
		const tid = String(id ?? '').trim()
		if (!tid) continue
		VideoSceneStore.dispatch('updateNodeProps', { layerId: lid, nodeId: tid, patch: { fontColor: text.value } })
	}
	if (playedId) {
		VideoSceneStore.dispatch('updateNodeProps', {
			layerId: lid,
			nodeId: playedId,
			patch: {
				fillColor: played.value,
				borderColor: playedBorder.value,
				borderWidth: 1,
				borderOpacity: 0.55,
			},
		})
	}

	const cr = markerShape.value === 'circle' ? 999 : 0
	for (const id of markerIds) {
		const mid = String(id ?? '').trim()
		if (!mid) continue
		VideoSceneStore.dispatch('updateNodeTransform', { layerId: lid, nodeId: mid, patch: { width: markerSize.value, height: markerSize.value } })
		VideoSceneStore.dispatch('updateNodeProps', {
			layerId: lid,
			nodeId: mid,
			patch: { fillColor: markerColor.value, borderColor: markerBorder.value, borderWidth: 1, borderOpacity: 0.85, cornerRadius: cr },
		})
	}

	dwebCanvasRef?.value?.requestRender?.()
	scheduleWriteBackToFirstKeyframeSoon()
}

// --- live commit style to timeline spec (debounced) ---
let styleCommitTimer: number | null = null
const scheduleCommitStyleToStore = () => {
	if (!props.open) return
	if (!spec.value) return
	if (styleCommitTimer != null) window.clearTimeout(styleCommitTimer)
	styleCommitTimer = window.setTimeout(() => {
		styleCommitTimer = null
		void commitStyleToStore()
	}, 120)
}

const commitStyleToStore = async () => {
	const s = spec.value as any
	if (!s) return
	const lid = String(props.layerId || '').trim()
	if (!lid) return
	const bgFilters = filtersNodeIds.value.rootId ? filtersByNodeId(filtersNodeIds.value.rootId) : []
	const segFilters = filtersNodeIds.value.segmentRepId ? filtersByNodeId(filtersNodeIds.value.segmentRepId) : []
	const titleFilters = filtersNodeIds.value.titleRepId ? filtersByNodeId(filtersNodeIds.value.titleRepId) : []
	const playedFilters = filtersNodeIds.value.playedOverlayId ? filtersByNodeId(filtersNodeIds.value.playedOverlayId) : []
	await store.dispatch('updateProgressBarStyle', {
		layerId: lid,
		style: {
			backgroundColor: bg.value,
			borderColor: border.value,
			textColor: text.value,
			marker: {
				shape: markerShape.value,
				size: Math.max(1, Math.min(64, Math.floor(markerSize.value))),
				color: markerColor.value,
				borderColor: markerBorder.value,
			},
			playedOverlayColor: played.value,
			playedOverlayBorderColor: playedBorder.value,
			backgroundFilters: bgFilters as any,
			segmentFilters: segFilters as any,
			titleFilters: titleFilters as any,
			playedOverlayFilters: playedFilters as any,
		},
	})
}

watch(
	() => [bg.value, border.value, text.value, played.value, playedBorder.value, markerShape.value, markerSize.value, markerColor.value, markerBorder.value] as const,
	() => {
		if (!props.open) return
		if (!spec.value) return
		scheduleStylePreview()
		scheduleCommitStyleToStore()
	}
)

// keep segment/title filters uniform: use rep node as source of truth
let lastSegFiltersJson = ''
watch(
	() => filtersNodeIds.value.segmentRepId,
	() => {
		lastSegFiltersJson = ''
	}
)
watch(
	() => (filtersNodeIds.value.segmentRepId ? filtersByNodeId(filtersNodeIds.value.segmentRepId) : []),
	(next) => {
		if (!props.open) return
		const repId = filtersNodeIds.value.segmentRepId
		if (!repId) return
		const json = jsonStable(next)
		if (json === lastSegFiltersJson) return
		lastSegFiltersJson = json
		syncFiltersToNodeIds(filtersNodeIds.value.segmentIds, next, repId)
		scheduleCommitFiltersToStoreSoon({ segmentFilters: cloneJsonSafe(next) as any })
	},
	{ deep: true }
)

let lastTitleFiltersJson = ''
watch(
	() => filtersNodeIds.value.titleRepId,
	() => {
		lastTitleFiltersJson = ''
	}
)
watch(
	() => (filtersNodeIds.value.titleRepId ? filtersByNodeId(filtersNodeIds.value.titleRepId) : []),
	(next) => {
		if (!props.open) return
		const repId = filtersNodeIds.value.titleRepId
		if (!repId) return
		const json = jsonStable(next)
		if (json === lastTitleFiltersJson) return
		lastTitleFiltersJson = json
		syncFiltersToNodeIds(filtersNodeIds.value.titleIds, next, repId)
		scheduleCommitFiltersToStoreSoon({ titleFilters: cloneJsonSafe(next) as any })
	},
	{ deep: true }
)

// root / played overlay filter edits should also write back to first keyframe
let lastRootFiltersJson = ''
watch(
	() => filtersNodeIds.value.rootId,
	() => {
		lastRootFiltersJson = ''
	}
)
watch(
	() => (filtersNodeIds.value.rootId ? filtersByNodeId(filtersNodeIds.value.rootId) : []),
	(next) => {
		if (!props.open) return
		const id = filtersNodeIds.value.rootId
		if (!id) return
		const json = jsonStable(next)
		if (json === lastRootFiltersJson) return
		lastRootFiltersJson = json
		scheduleCommitFiltersToStoreSoon({ backgroundFilters: cloneJsonSafe(next) as any })
		queueMicrotask(() => void writeBackToFirstKeyframeWithPatchedFilters(id, next))
	},
	{ deep: true }
)

let lastPlayedFiltersJson = ''
watch(
	() => filtersNodeIds.value.playedOverlayId,
	() => {
		lastPlayedFiltersJson = ''
	}
)
watch(
	() => (filtersNodeIds.value.playedOverlayId ? filtersByNodeId(filtersNodeIds.value.playedOverlayId) : []),
	(next) => {
		if (!props.open) return
		const id = filtersNodeIds.value.playedOverlayId
		if (!id) return
		const json = jsonStable(next)
		if (json === lastPlayedFiltersJson) return
		lastPlayedFiltersJson = json
		scheduleCommitFiltersToStoreSoon({ playedOverlayFilters: cloneJsonSafe(next) as any })
		queueMicrotask(() => void writeBackToFirstKeyframeWithPatchedFilters(id, next))
	},
	{ deep: true }
)

const applySegments = async () => {
	const s = spec.value as any
	if (!s) return
	const lid = String(props.layerId || '').trim()
	if (!lid) return
	const segs = segmentsDraft.value.map((x) => ({
		title: String(x.title ?? '').trim(),
		startFrame: Math.max(0, Math.min(frameCount.value - 1, Math.floor(Number(x.startFrame ?? 0)))),
		endFrame: Math.max(0, Math.min(frameCount.value - 1, Math.floor(Number(x.endFrame ?? 0)))),
	}))
	await ensureProgressBarNodesForSegmentCount(lid, segs.length)
	await store.dispatch('updateProgressBarSegments', { layerId: lid, segments: segs as any })
	applySegmentsToStageNodes()
	await rebuildPlayedOverlayKeyframes(lid, segs)
	await writeBackToFirstKeyframe()
}

const applyStyle = async () => {
	const s = spec.value as any
	if (!s) return
	const lid = String(props.layerId || '').trim()
	if (!lid) return
	const bgFilters = filtersNodeIds.value.rootId ? filtersByNodeId(filtersNodeIds.value.rootId) : []
	const segFilters = filtersNodeIds.value.segmentRepId ? filtersByNodeId(filtersNodeIds.value.segmentRepId) : []
	const titleFilters = filtersNodeIds.value.titleRepId ? filtersByNodeId(filtersNodeIds.value.titleRepId) : []
	const playedFilters = filtersNodeIds.value.playedOverlayId ? filtersByNodeId(filtersNodeIds.value.playedOverlayId) : []
	await store.dispatch('updateProgressBarStyle', {
		layerId: lid,
		style: {
			backgroundColor: bg.value,
			borderColor: border.value,
			textColor: text.value,
			marker: {
				shape: markerShape.value,
				size: Math.max(1, Math.min(64, Math.floor(markerSize.value))),
				color: markerColor.value,
				borderColor: markerBorder.value,
			},
			playedOverlayColor: played.value,
			playedOverlayBorderColor: playedBorder.value,
			backgroundFilters: bgFilters as any,
			segmentFilters: segFilters as any,
			titleFilters: titleFilters as any,
			playedOverlayFilters: playedFilters as any,
		},
	})

	const ids = (s as any).nodeIds
	if (!ids) return
	const rootId = String(ids.rootId ?? '').trim()
	const playedId = String(ids.playedOverlayId ?? '').trim()
	const segmentIds: string[] = Array.isArray(ids.segmentIds) ? ids.segmentIds : []
	const titleIds: string[] = Array.isArray(ids.titleIds) ? ids.titleIds : []
	const markerIds: string[] = Array.isArray(ids.markerIds) ? ids.markerIds : []

	if (rootId) {
		VideoSceneStore.dispatch('updateNodeProps', {
			layerId: lid,
			nodeId: rootId,
			patch: { fillColor: bg.value, borderColor: border.value },
		})
	}
	for (const id of segmentIds) {
		const sid = String(id ?? '').trim()
		if (!sid) continue
		VideoSceneStore.dispatch('updateNodeProps', {
			layerId: lid,
			nodeId: sid,
			patch: { fillColor: border.value, borderColor: border.value },
		})
	}
	for (const id of titleIds) {
		const tid = String(id ?? '').trim()
		if (!tid) continue
		VideoSceneStore.dispatch('updateNodeProps', { layerId: lid, nodeId: tid, patch: { fontColor: text.value } })
	}

	if (playedId) {
		VideoSceneStore.dispatch('updateNodeProps', {
			layerId: lid,
			nodeId: playedId,
			patch: {
				fillColor: played.value,
				borderColor: playedBorder.value,
				borderWidth: 1,
				borderOpacity: 0.55,
			},
		})
	}

	const cr = markerShape.value === 'circle' ? 999 : 0
	for (const id of markerIds) {
		const mid = String(id ?? '').trim()
		if (!mid) continue
		VideoSceneStore.dispatch('updateNodeTransform', { layerId: lid, nodeId: mid, patch: { width: markerSize.value, height: markerSize.value } })
		VideoSceneStore.dispatch('updateNodeProps', {
			layerId: lid,
			nodeId: mid,
			patch: { fillColor: markerColor.value, borderColor: markerBorder.value, borderWidth: 1, borderOpacity: 0.85, cornerRadius: cr },
		})
	}

	reorderChildren()
	applyPlayedOverlayLayout()
	await writeBackToFirstKeyframe()
}

const applyAll = async () => {
	if (!spec.value) return
	await applySegments()
	await applyStyle()
}

const onSaveShortcut = (e: Event) => {
	if (!props.open) return
	e.preventDefault()
	void applyAll()
}
</script>

<style scoped>
.dvs-pbed-dialog {
  position: fixed;
  z-index: 60;
  width: 760px;
  height: auto;
  max-height: calc(100vh - 16px);
  background: var(--dweb-defualt-dark);
  border: 1px solid var(--vscode-border);
  border-radius: 6px;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.35);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.dvs-pbed-head {
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 10px;
  border-bottom: 1px solid var(--vscode-border);
  cursor: move;
  user-select: none;
}

.dvs-pbed-title {
  color: var(--vscode-fg);
  font-size: 14px;
  font-weight: 600;
}

.dvs-pbed-close {
  flex: 0 0 auto;
  width: 28px;
  height: 28px;
  padding: 0;
  line-height: 26px;
  text-align: center;
  font-size: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.dvs-pbed-body {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.dvs-pbed-row1 {
  flex: 0 0 auto;
  min-height: 0;
  display: grid;
  grid-template-columns: 1fr 280px;
}

.dvs-pbed-row2 {
  flex: 1 1 auto;
  min-height: 0;
  border-top: 1px solid var(--vscode-border);
  padding: 10px;
  overflow: auto;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.dvs-pbed-col {
  padding: 10px;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.dvs-pbed-col + .dvs-pbed-col {
  border-left: 1px solid var(--vscode-border);
}

.dvs-pbed-col-head {
  color: var(--vscode-fg);
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 8px;
}

.dvs-pbed-empty {
  color: var(--vscode-fg-muted);
  font-size: 12px;
}

.dvs-pbed-list {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.dvs-pbed-row {
  display: flex;
  gap: 8px;
  align-items: flex-end;
}

.dvs-pbed-filter-block {
  border: 1px solid var(--vscode-border);
  border-radius: 6px;
  padding: 8px;
  min-width: 0;
  background: rgba(255, 255, 255, 0.02);
}

.dvs-pbed-filter-label {
  color: var(--vscode-fg);
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 6px;
}

/* shrink NodeFiltersForm typography inside this dialog */
.dvs-pbed-filters :deep(.vs-filter-title) {
  font-size: 12px;
}

.dvs-pbed-filters :deep(.vs-filter-item-title) {
  font-size: 12px;
}

.dvs-pbed-filters :deep(.vs-row .vs-k) {
  font-size: 12px;
}

.dvs-pbed-filters :deep(.vs-filter-empty) {
  font-size: 12px;
}

.dvs-pbed-style {
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow: auto;
  padding-right: 2px;
}

.dvs-pbed-foot {
  flex: 0 0 auto;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border-top: 1px solid var(--vscode-border);
}

/* Local control skin: keep consistent with other dialogs/panels */
.vs-btn {
  padding: 6px 10px;
  border-radius: 0;
  border: 1px solid var(--vscode-border-accent);
  background: transparent;
  color: var(--vscode-fg);
  cursor: pointer;
}

.vs-btn:hover {
  background: var(--vscode-hover-bg);
}

.vs-btn:disabled {
  background: var(--vscode-disabled-bg);
  color: var(--vscode-disabled-fg);
  border-color: var(--vscode-border);
  cursor: not-allowed;
}

.vs-label {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--vscode-fg);
  font-size: 12px;
}

.vs-label > span {
  flex: 0 0 auto;
  color: var(--vscode-fg-muted);
  font-size: 11px;
}

.vs-input {
  flex: 1 1 0;
  min-width: 0;
  height: 28px;
  padding: 0 8px;
  border-radius: 0;
  border: 1px solid var(--vscode-border);
  background: var(--dweb-defualt);
  color: var(--vscode-fg);
  outline: none;
  box-sizing: border-box;
}

.vs-input:hover {
  border-color: var(--vscode-hover-border);
}

.vs-input:focus {
  border-color: var(--dweb-green-main);
  box-shadow: var(--dweb-shadow);
}

.vs-select {
  flex: 1 1 0;
  min-width: 0;
  height: 28px;
  padding: 0 8px;
  border-radius: 0;
  border: 1px solid var(--vscode-border);
  background: var(--dweb-defualt);
  color: var(--vscode-fg);
  outline: none;
  box-sizing: border-box;
}

.vs-select:hover {
  border-color: var(--vscode-hover-border);
}

.vs-select:focus {
  border-color: var(--dweb-green-main);
  box-shadow: var(--dweb-shadow);
}

.vs-color {
  padding: 0;
  width: 44px;
  flex: 0 0 auto;
}

.vs-color::-webkit-color-swatch-wrapper {
  padding: 2px;
}

.vs-color::-webkit-color-swatch {
  border: 1px solid var(--vscode-border);
}

.dvs-pbed-divider {
  height: 1px;
  background: var(--vscode-border);
  opacity: 0.6;
}
</style>
