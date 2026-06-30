<template>
	<Teleport to="body">
		<transition name="dweb-add-node-modal-fade">
			<div
				v-if="visible"
				class="dweb-add-node-modal__backdrop"
				role="presentation"
				@click.self="onBackdropClick"
				@contextmenu.prevent
			>
				<div
					ref="dialogEl"
					class="dweb-add-node-modal"
					role="dialog"
					aria-modal="true"
					:aria-label="dialogTitle"
					@mousedown.stop
					@pointerdown.stop
				>
					<!-- Left sidebar with category tabs -->
					<aside class="dweb-add-node-modal__sidebar">
						<nav
							class="dweb-add-node-modal__sidebar-tabs"
							role="tablist"
							aria-label="节点分类"
							@mouseleave="onTabsMouseLeave"
						>
							<button
								v-for="item in leftSidebarTabs"
								:key="`${item.kind}:${item.id}`"
								type="button"
								class="dweb-add-node-modal__sidebar-tab"
								:class="{ 'is-active': isTabActive(item) }"
								role="tab"
								:aria-selected="isTabActive(item)"
								:title="item.description || item.label"
								@mouseenter="onTabHover(item)"
								@focus="onTabHover(item)"
								@click="onTabClick(item)"
							>
								<span class="dweb-add-node-modal__sidebar-tab-icon" aria-hidden="true">
									<svg viewBox="0 0 16 16">
										<template v-if="item.iconKey === 'inputs'">
											<path d="M8 11.8V4.2" />
											<path d="M5.2 6.8L8 4l2.8 2.8" />
											<path d="M3 12.8h10" />
										</template>
										<template v-else-if="item.iconKey === 'text'">
											<path d="M3 3.5h10M3 7h8M3 10.5h7M3 13h5" />
										</template>
										<template v-else-if="item.iconKey === 'image'">
											<path d="M2.5 3.5h11v9h-11z" />
											<path d="M4 10l2.2-2.3 1.7 1.9 1.8-2 2.3 2.4" />
											<circle cx="5.4" cy="5.5" r="0.9" fill="currentColor" stroke="none" />
										</template>
										<template v-else-if="item.iconKey === 'video'">
											<path d="M2.5 4h7.5v8H2.5z" />
											<path d="M10 6.5l3-1.5v6l-3-1.5z" />
											<path d="M5.8 6.2v3.6l2.8-1.8z" fill="currentColor" stroke="none" />
										</template>
										<template v-else-if="item.iconKey === 'audio'">
											<path d="M3.2 9.4h2.5l3.4-2.8v5.6L5.7 9.4H3.2z" />
											<path d="M11 6.4a2.7 2.7 0 0 1 0 3.2" />
											<path d="M12.8 5.2a4.7 4.7 0 0 1 0 5.6" />
										</template>
										<template v-else-if="item.iconKey === 'scene'">
											<path d="M2.5 12.5L6 7l3 3.5 2-2.2 2.5 4.2z" />
											<circle cx="11.6" cy="4.6" r="1.4" fill="currentColor" stroke="none" />
										</template>
										<template v-else-if="item.iconKey === 'model3d'">
											<path d="M8 2.5l5 2.8v5.4L8 13.5l-5-2.8V5.3z" />
											<path d="M3 5.3l5 2.8 5-2.8" />
											<path d="M8 8.1V13.5" />
										</template>
										<template v-else-if="item.iconKey === 'materials'">
											<circle cx="8" cy="8" r="5" />
											<path d="M3.4 6.3l9.2 0M3.4 9.7l9.2 0" />
										</template>
										<template v-else-if="item.iconKey === 'plugin'">
											<path d="M7 2H3v12h10V7l-3-3V2z" />
											<path d="M9 9v3H7V9" />
										</template>
										<template v-else-if="item.iconKey === 'object-cluster'">
											<circle cx="5.2" cy="6" r="1.6" />
											<circle cx="10.6" cy="5.2" r="1.6" />
											<circle cx="8.4" cy="10.4" r="1.6" />
										</template>
										<template v-else-if="item.iconKey === 'indoor-scene'">
											<path d="M2.5 7.5L8 3l5.5 4.5" />
											<path d="M3.5 7.5v6h9v-6" />
											<path d="M6.8 13.5v-3.4h2.4v3.4" />
										</template>
										<template v-else-if="item.iconKey === 'outdoor-scene'">
											<path d="M2 12.5L5.4 7l2.4 4 2-3.2 4.2 4.7z" />
											<circle cx="11.5" cy="4.5" r="1.5" fill="currentColor" stroke="none" />
										</template>
										<template v-else-if="item.iconKey === 'gaussian-splat'">
											<circle cx="5" cy="5.5" r="1.4" fill="currentColor" stroke="none" />
											<circle cx="10.4" cy="6.4" r="1" fill="currentColor" stroke="none" />
											<circle cx="7.6" cy="9.4" r="1.6" fill="currentColor" stroke="none" />
											<circle cx="11.4" cy="11" r="0.9" fill="currentColor" stroke="none" />
											<circle cx="4.4" cy="10.4" r="0.7" fill="currentColor" stroke="none" />
										</template>
										<template v-else-if="item.iconKey === 'motion'">
											<circle cx="9" cy="3.4" r="1.3" />
											<path d="M5 8.4l2.8-2.6 2 1.6 2.6 0.4" />
											<path d="M7.8 5.8l-1.6 4.4 2.6 1.4-0.6 2.6" />
											<path d="M10.6 9.6l1.4 2.4 1.6-0.6" />
										</template>
									</svg>
								</span>
								<span class="dweb-add-node-modal__sidebar-tab-label">{{ item.label }}</span>
							</button>
						</nav>
					</aside>

					<!-- Right content area -->
					<div class="dweb-add-node-modal__content">
						<header class="dweb-add-node-modal__header">
							<h2 class="dweb-add-node-modal__title">{{ dialogTitle }}</h2>
							<button
								type="button"
								class="dweb-add-node-modal__close"
								:aria-label="closeLabel"
								@click="emit('close')"
							>
								<svg viewBox="0 0 16 16" aria-hidden="true">
									<path d="M4 4l8 8M12 4l-8 8" />
								</svg>
							</button>
						</header>

						<!-- HUD scanline animation layer -->
						<div class="nsm-hud-scanlines" aria-hidden="true"></div>

						<!-- Sci-fi L corner brackets -->
						<span class="nsm-bracket nsm-bracket-tl" aria-hidden="true"></span>
						<span class="nsm-bracket nsm-bracket-tr" aria-hidden="true"></span>
						<span class="nsm-bracket nsm-bracket-bl" aria-hidden="true"></span>
						<span class="nsm-bracket nsm-bracket-br" aria-hidden="true"></span>

						<div class="dweb-add-node-modal__search">
							<svg viewBox="0 0 16 16" aria-hidden="true">
								<circle cx="7" cy="7" r="4.2" />
								<path d="M10.2 10.2 13.2 13.2" />
							</svg>
							<input
								ref="searchInputEl"
								v-model="query"
								type="search"
								:placeholder="searchPlaceholder"
								autocomplete="off"
								spellcheck="false"
							/>
						</div>

						<div class="dweb-add-node-modal__body custom-scrollbar-right">
							<template v-if="hasSearch">
								<div v-if="searchResults.length === 0" class="dweb-add-node-modal__empty">
									{{ emptyHintSearch }}
								</div>
								<button
									v-for="item in searchResults"
									:key="`search:${item.actionId}`"
									type="button"
									class="dweb-add-node-modal__item"
									@click="onItemSelect(item.actionId)"
								>
									<span class="dweb-add-node-modal__item-label">{{ item.label }}</span>
									<span v-if="item.description" class="dweb-add-node-modal__item-desc">
										{{ item.description }}
									</span>
								</button>
							</template>

							<template v-else>
								<button
									v-if="isTopActive && activeTopCategoryId === 'inputs'"
									type="button"
									class="dweb-add-node-modal__item dweb-add-node-modal__item--upload"
									@click="onUploadClick"
								>
									<span class="dweb-add-node-modal__item-label">
										<svg
											viewBox="0 0 16 16"
											aria-hidden="true"
											class="dweb-add-node-modal__upload-icon"
										>
											<path d="M8 11.8V4.2" />
											<path d="M5.2 6.8L8 4l2.8 2.8" />
											<path d="M3 12.8h10" />
										</svg>
										{{ uploadLabel }}
									</span>
									<span class="dweb-add-node-modal__item-desc">
										{{ uploadDescription }}
									</span>
								</button>

								<div
									v-if="
										activeItems.length === 0 && !(isTopActive && activeTopCategoryId === 'inputs')
									"
									class="dweb-add-node-modal__empty"
								>
									{{ emptyHintCategory }}
								</div>

								<button
									v-for="item in activeItems"
									:key="`tab:${activeTabKey}:${item.actionId}`"
									type="button"
									class="dweb-add-node-modal__item"
									@click="onItemSelect(item.actionId)"
								>
									<span class="dweb-add-node-modal__item-label">{{ item.label }}</span>
									<span v-if="item.description" class="dweb-add-node-modal__item-desc">
										{{ item.description }}
									</span>
								</button>
							</template>
						</div>
					</div>
				</div>

				<input
					ref="uploadInputEl"
					class="dweb-add-node-modal__upload-input"
					type="file"
					:accept="uploadAccept"
					@change="onUploadInputChange"
				/>
			</div>
		</transition>
	</Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type {
	Newui2NodeCatalogCategory,
	Newui2NodeCatalogItem,
	Newui2NodeSpecialGroup,
	Newui2NodeSpecialGroupId,
	Newui2NodeTopCategory,
	Newui2NodeTopCategoryId,
	DwebCanvasMenuNodeActionId
} from './DwebCanvasMenu.types'

const props = withDefaults(
	defineProps<{
		visible: boolean
		items: Newui2NodeCatalogItem[]
		categories: Newui2NodeCatalogCategory[]
		topCategories: Newui2NodeTopCategory[]
		specialGroups?: Newui2NodeSpecialGroup[]
		uploadAccept?: string
		dialogTitle?: string
		closeLabel?: string
		searchPlaceholder?: string
		uploadLabel?: string
		uploadDescription?: string
		emptyHintSearch?: string
		emptyHintCategory?: string
	}>(),
	{
		items: () => [],
		categories: () => [],
		topCategories: () => [],
		specialGroups: () => [],
		uploadAccept:
			'image/*,video/*,audio/*,.txt,.doc,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain',
		dialogTitle: '添加节点',
		closeLabel: '关闭',
		searchPlaceholder: '搜索节点、类型或能力',
		uploadLabel: '上传文件',
		uploadDescription: '从本地选择图片、视频、音频或文本文件创建对应资源节点。',
		emptyHintSearch: '没有匹配的节点',
		emptyHintCategory: '该分类暂无节点'
	}
)

const emit = defineEmits<{
	(e: 'select', actionId: DwebCanvasMenuNodeActionId): void
	(e: 'close'): void
	(e: 'upload-file', file: File): void
}>()

const dialogEl = ref<HTMLElement | null>(null)
const searchInputEl = ref<HTMLInputElement | null>(null)
const uploadInputEl = ref<HTMLInputElement | null>(null)
const query = ref('')
const activeMode = ref<'top' | 'special'>('top')
const activeTopCategoryId = ref<Newui2NodeTopCategoryId>('inputs')
const activeSpecialGroupId = ref<Newui2NodeSpecialGroupId | null>(null)

const hasSearch = computed(() => query.value.trim().length > 0)
const isTopActive = computed(() => activeMode.value === 'top')
const isSpecialActive = computed(() => activeMode.value === 'special')
const activeTabKey = computed(() =>
	isSpecialActive.value
		? `special:${activeSpecialGroupId.value ?? ''}`
		: `top:${activeTopCategoryId.value}`
)

const normalizeSearchText = (value: unknown) =>
	String(value ?? '')
		.toLowerCase()
		.replace(/[_-]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()

const compactSearchText = (value: string) => value.replace(/\s+/g, '')

const tokenizeSearchText = (value: string) => (value ? value.split(' ').filter(Boolean) : [])

const buildSearchBlob = (item: Newui2NodeCatalogItem) => {
	const raw = [
		item.label,
		item.nodeType,
		item.actionId,
		item.description ?? '',
		...(Array.isArray(item.searchAliases) ? item.searchAliases : [])
	].join(' ')
	const normalized = normalizeSearchText(raw)
	return {
		normalized,
		compact: compactSearchText(normalized)
	}
}

const matchesQuery = (item: Newui2NodeCatalogItem, queryText: string) => {
	const tokens = tokenizeSearchText(normalizeSearchText(queryText))
	if (!tokens.length) return true
	const blob = buildSearchBlob(item)
	return tokens.every((token) => {
		const compactToken = compactSearchText(token)
		return blob.normalized.includes(token) || (compactToken && blob.compact.includes(compactToken))
	})
}

const sortItemsForTopCategory = (
	topCategoryId: Newui2NodeTopCategoryId,
	items: Newui2NodeCatalogItem[]
) =>
	items.slice().sort((left, right) => {
		if (topCategoryId === 'inputs') {
			const leftOrder =
				typeof left.featuredBasicOrder === 'number' ? left.featuredBasicOrder : 9999 + left.order
			const rightOrder =
				typeof right.featuredBasicOrder === 'number' ? right.featuredBasicOrder : 9999 + right.order
			return leftOrder - rightOrder
		}
		return left.order - right.order
	})

const itemsForTopCategory = (categoryId: Newui2NodeTopCategoryId) => {
	if (categoryId === 'inputs') {
		return props.items.filter((item) => typeof item.featuredBasicOrder === 'number')
	}
	return props.items.filter((item) => (item.topCategoryId ?? 'inputs') === categoryId)
}

const itemsForSpecialGroup = (groupId: Newui2NodeSpecialGroupId) =>
	props.items.filter((item) => item.specialGroupId === groupId)

const visibleTopCategories = computed(() =>
	props.topCategories.filter((cat) => {
		if (cat.id === 'inputs') return true
		return itemsForTopCategory(cat.id).length > 0
	})
)

const activeItems = computed(() => {
	if (isSpecialActive.value && activeSpecialGroupId.value) {
		return itemsForSpecialGroup(activeSpecialGroupId.value)
			.slice()
			.sort((left, right) => left.order - right.order)
	}
	return sortItemsForTopCategory(
		activeTopCategoryId.value,
		itemsForTopCategory(activeTopCategoryId.value)
	)
})

const searchResults = computed(() => {
	const q = query.value
	if (!q) return [] as Newui2NodeCatalogItem[]
	return props.items
		.filter((item) => matchesQuery(item, q))
		.slice()
		.sort((left, right) => left.order - right.order)
})

const ensureActiveTab = () => {
	if (!visibleTopCategories.value.length) {
		if (props.specialGroups.length) {
			activeMode.value = 'special'
			activeSpecialGroupId.value = props.specialGroups[0]!.id
		}
		return
	}
	if (isTopActive.value) {
		if (!visibleTopCategories.value.some((cat) => cat.id === activeTopCategoryId.value)) {
			activeTopCategoryId.value = visibleTopCategories.value[0]!.id
		}
	} else if (isSpecialActive.value) {
		if (!props.specialGroups.some((g) => g.id === activeSpecialGroupId.value)) {
			activeMode.value = 'top'
			activeTopCategoryId.value = visibleTopCategories.value[0]!.id
		}
	}
}

type UnifiedTab =
	| {
			kind: 'top'
			id: Newui2NodeTopCategoryId
			label: string
			description?: string
			iconKey: string
	  }
	| {
			kind: 'special'
			id: Newui2NodeSpecialGroupId
			label: string
			description?: string
			iconKey: string
	  }

const unifiedTabs = computed<UnifiedTab[]>(() => {
	const list: UnifiedTab[] = []
	const motionGroup = props.specialGroups.find((g) => g.id === 'motion')
	for (const cat of visibleTopCategories.value) {
		list.push({
			kind: 'top',
			id: cat.id,
			label: cat.label,
			description: cat.description,
			iconKey: cat.iconKey
		})
		if (cat.id === 'model3d' && motionGroup) {
			list.push({
				kind: 'special',
				id: motionGroup.id,
				label: motionGroup.label,
				description: motionGroup.description,
				iconKey: motionGroup.iconKey
			})
		}
	}
	for (const group of props.specialGroups) {
		if (group.id === 'motion') continue
		list.push({
			kind: 'special',
			id: group.id,
			label: group.label,
			description: group.description,
			iconKey: group.iconKey
		})
	}
	return list
})

const topTabs = computed(() =>
	unifiedTabs.value.filter((t) => t.kind === 'top' || t.id === 'motion')
)
const specialTabs = computed(() =>
	unifiedTabs.value.filter((t) => t.kind === 'special' && t.id !== 'motion')
)

// Left sidebar tabs: all top categories + special groups combined
const leftSidebarTabs = computed<UnifiedTab[]>(() => unifiedTabs.value)

const isTabActive = (item: UnifiedTab) => {
	if (item.kind === 'top') return isTopActive.value && item.id === activeTopCategoryId.value
	return isSpecialActive.value && item.id === activeSpecialGroupId.value
}

let hoverTimer: number | null = null
const HOVER_SWITCH_DELAY = 120

const cancelHoverTimer = () => {
	if (hoverTimer != null) {
		window.clearTimeout(hoverTimer)
		hoverTimer = null
	}
}

const applyTabSelection = (item: UnifiedTab) => {
	if (item.kind === 'top') {
		activeMode.value = 'top'
		activeTopCategoryId.value = item.id
	} else {
		activeMode.value = 'special'
		activeSpecialGroupId.value = item.id
	}
}

const onTabHover = (item: UnifiedTab) => {
	if (isTabActive(item)) return
	cancelHoverTimer()
	hoverTimer = window.setTimeout(() => {
		applyTabSelection(item)
		hoverTimer = null
	}, HOVER_SWITCH_DELAY)
}

const onTabClick = (item: UnifiedTab) => {
	cancelHoverTimer()
	applyTabSelection(item)
}

const onTabsMouseLeave = () => {
	cancelHoverTimer()
}

watch(
	() => props.visible,
	async (visible) => {
		if (!visible) return
		query.value = ''
		ensureActiveTab()
		await nextTick()
		searchInputEl.value?.focus()
		searchInputEl.value?.select()
	}
)

watch(
	() => [props.topCategories, props.specialGroups, props.items],
	() => ensureActiveTab(),
	{ immediate: true, deep: true }
)

const onItemSelect = (actionId: DwebCanvasMenuNodeActionId) => {
	emit('select', actionId)
}

const onBackdropClick = () => {
	emit('close')
}

const onUploadClick = () => {
	uploadInputEl.value?.click()
}

const onUploadInputChange = (event: Event) => {
	const input = event.target as HTMLInputElement | null
	const file = input?.files?.[0]
	if (input) input.value = ''
	if (!file) return
	emit('upload-file', file)
}

watch(
	() => props.visible,
	(visible) => {
		if (typeof window === 'undefined') return
		const handler = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				event.stopPropagation()
				emit('close')
			}
		}
		if (visible) {
			window.addEventListener('keydown', handler, true)
		}
		return () => {
			window.removeEventListener('keydown', handler, true)
		}
	}
)
</script>

<style scoped>
/* ============================================================
   DwebCanvasNodeSearchMenu — Sci-Fi / Cyber Futuristic Style
   Uses --wf-primary, --wf-*, --theme-accent tokens
   ============================================================ */

/* ── Backdrop ── */
.dweb-add-node-modal__backdrop {
	position: fixed;
	inset: 0;
	z-index: 9500;
	background:
		radial-gradient(
			ellipse at 50% 30%,
			color-mix(in srgb, var(--wf-primary, #1f9d84) 12%, transparent) 0%,
			transparent 55%
		),
		rgba(0, 0, 0, 0.52);
	backdrop-filter: blur(6px);
	-webkit-backdrop-filter: blur(6px);
	display: flex;
	align-items: flex-start;
	justify-content: center;
	padding: 8vh 16px 16px;
	overflow: hidden;
}

/* ── Modal container (horizontal layout: sidebar + content) ── */
.dweb-add-node-modal {
	position: relative;
	width: min(720px, calc(100vw - 32px));
	max-height: calc(86vh - 16px);
	display: flex;
	flex-direction: row;
	background:
		linear-gradient(
			180deg,
			color-mix(in srgb, var(--wf-surface-raised, rgba(29, 34, 39, 0.94)) 99%, transparent),
			color-mix(in srgb, var(--wf-surface-raised, rgba(29, 34, 39, 0.94)) 92%, transparent)
		),
		var(--wf-surface-raised, rgba(29, 34, 39, 0.94));
	border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 48%, transparent);
	border-radius: 2px;
	box-shadow:
		0 0 0 1px color-mix(in srgb, var(--wf-primary, #1f9d84) 10%, transparent),
		0 0 28px color-mix(in srgb, var(--wf-primary, #1f9d84) 18%, transparent),
		0 24px 64px rgba(0, 0, 0, 0.5);
	color: var(--wf-text, #edf2f4);
	overflow: hidden;
	animation: dweb-add-node-modal-pop 180ms cubic-bezier(0.22, 0.61, 0.36, 1);
	backdrop-filter: blur(20px) saturate(140%);
	-webkit-backdrop-filter: blur(20px) saturate(140%);
}

/* ── Left Sidebar ── */
.dweb-add-node-modal__sidebar {
	flex: 0 0 auto;
	width: 120px;
	display: flex;
	flex-direction: column;
	background: linear-gradient(
		180deg,
		color-mix(in srgb, var(--wf-primary, #1f9d84) 8%, transparent) 0%,
		transparent 100%
	);
	border-right: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 22%, transparent);
}

.dweb-add-node-modal__sidebar-tabs {
	display: flex;
	flex-direction: column;
	padding: 8px 0;
	overflow-y: auto;
	flex: 1;
}

.dweb-add-node-modal__sidebar-tab {
	flex: 0 0 auto;
	display: flex;
	align-items: center;
	gap: 6px;
	padding: 8px 12px;
	border: 0;
	border-left: 2px solid transparent;
	background: transparent;
	color: var(--wf-text-muted, #aeb8bd);
	font-size: 12px;
	font-weight: 500;
	cursor: pointer;
	text-align: left;
	transition:
		color 160ms ease,
		background-color 160ms ease,
		border-color 160ms ease;
	white-space: nowrap;
	letter-spacing: 0.01em;
}

.dweb-add-node-modal__sidebar-tab:hover,
.dweb-add-node-modal__sidebar-tab:focus-visible {
	color: var(--wf-text, #edf2f4);
	background: color-mix(in srgb, var(--wf-primary, #1f9d84) 10%, transparent);
	outline: none;
}

.dweb-add-node-modal__sidebar-tab.is-active {
	color: var(--wf-primary, #1f9d84);
	background: color-mix(in srgb, var(--wf-primary, #1f9d84) 12%, transparent);
	border-left-color: var(--wf-primary, #1f9d84);
	text-shadow: 0 0 8px color-mix(in srgb, var(--wf-primary, #1f9d84) 35%, transparent);
}

.dweb-add-node-modal__sidebar-tab-icon {
	width: 14px;
	height: 14px;
	flex: 0 0 auto;
	display: inline-flex;
	align-items: center;
	justify-content: center;
}

.dweb-add-node-modal__sidebar-tab-icon svg {
	width: 14px;
	height: 14px;
}

.dweb-add-node-modal__sidebar-tab-icon svg path,
.dweb-add-node-modal__sidebar-tab-icon svg circle {
	fill: none;
	stroke: currentColor;
	stroke-width: 1.35;
	stroke-linecap: round;
	stroke-linejoin: round;
}

.dweb-add-node-modal__sidebar-tab-label {
	flex: 1;
	overflow: hidden;
	text-overflow: ellipsis;
}

/* ── Right Content Area ── */
.dweb-add-node-modal__content {
	flex: 1;
	display: flex;
	flex-direction: column;
	min-width: 0;
	position: relative;
}

/* Top pulse glow line */
.dweb-add-node-modal__content::before {
	content: '';
	position: absolute;
	left: 4px;
	right: 4px;
	top: -1px;
	height: 1px;
	background: linear-gradient(
		90deg,
		transparent 0%,
		color-mix(in srgb, var(--wf-primary, #1f9d84) 72%, transparent) 50%,
		transparent 100%
	);
	box-shadow: 0 0 8px var(--wf-primary, #1f9d84);
	pointer-events: none;
	z-index: 5;
}

/* ── Sci-fi L corner brackets ── */
.nsm-bracket {
	position: absolute;
	width: 12px;
	height: 12px;
	pointer-events: none;
	z-index: 4;
	opacity: 0;
	transition: opacity 200ms ease;
}
.nsm-bracket-tl {
	top: -2px;
	left: -2px;
	border-top: 1.5px solid var(--wf-primary, #1f9d84);
	border-left: 1.5px solid var(--wf-primary, #1f9d84);
}
.nsm-bracket-tr {
	top: -2px;
	right: -2px;
	border-top: 1.5px solid var(--wf-primary, #1f9d84);
	border-right: 1.5px solid var(--wf-primary, #1f9d84);
}
.nsm-bracket-bl {
	bottom: -2px;
	left: -2px;
	border-bottom: 1.5px solid var(--wf-primary, #1f9d84);
	border-left: 1.5px solid var(--wf-primary, #1f9d84);
}
.nsm-bracket-br {
	bottom: -2px;
	right: -2px;
	border-bottom: 1.5px solid var(--wf-primary, #1f9d84);
	border-right: 1.5px solid var(--wf-primary, #1f9d84);
}
.dweb-add-node-modal__content:hover .nsm-bracket {
	opacity: 1;
}

/* ── HUD scanline overlay ── */
.nsm-hud-scanlines {
	position: absolute;
	inset: 0;
	pointer-events: none;
	z-index: 3;
	opacity: 0;
	transition: opacity 240ms ease;
	background: repeating-linear-gradient(
		0deg,
		transparent,
		transparent 3px,
		color-mix(in srgb, var(--wf-primary, #1f9d84) 3%, transparent) 3px,
		color-mix(in srgb, var(--wf-primary, #1f9d84) 3%, transparent) 4px
	);
}

.dweb-add-node-modal__content:hover .nsm-hud-scanlines {
	opacity: 0.3;
}

/* ── Header ── */
.dweb-add-node-modal__header {
	position: relative;
	display: flex;
	align-items: center;
	justify-content: space-between;
	height: 40px;
	padding: 0 10px 0 14px;
	border-bottom: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 22%, transparent);
	z-index: 2;
}

.dweb-add-node-modal__title {
	margin: 0;
	font-size: 14px;
	font-weight: 700;
	line-height: 1.2;
	color: var(--wf-text, #edf2f4);
	letter-spacing: 0.02em;
	text-shadow: 0 0 10px color-mix(in srgb, var(--wf-primary, #1f9d84) 28%, transparent);
}

.dweb-add-node-modal__close {
	width: 30px;
	height: 30px;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	border: 1px solid transparent;
	border-radius: 2px;
	background: transparent;
	color: var(--wf-text-muted, #aeb8bd);
	cursor: pointer;
	transition:
		border-color 160ms ease,
		background-color 160ms ease,
		color 160ms ease,
		box-shadow 160ms ease;
}

.dweb-add-node-modal__close:hover,
.dweb-add-node-modal__close:focus-visible {
	border-color: color-mix(in srgb, var(--wf-primary, #1f9d84) 55%, transparent);
	background: color-mix(in srgb, var(--wf-primary, #1f9d84) 14%, transparent);
	color: var(--wf-primary, #1f9d84);
	outline: none;
	box-shadow: 0 0 8px color-mix(in srgb, var(--wf-primary, #1f9d84) 22%, transparent);
}

.dweb-add-node-modal__close svg {
	width: 14px;
	height: 14px;
}

.dweb-add-node-modal__close svg path {
	stroke: currentColor;
	stroke-width: 1.5;
	stroke-linecap: round;
	stroke-linejoin: round;
	fill: none;
}

/* ── Search ── */
.dweb-add-node-modal__search {
	height: 36px;
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 0 14px;
	border-bottom: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 22%, transparent);
	position: relative;
	z-index: 2;
}

.dweb-add-node-modal__search svg {
	width: 16px;
	height: 16px;
	flex: 0 0 auto;
	color: color-mix(in srgb, var(--wf-primary, #1f9d84) 60%, var(--wf-text-muted, #aeb8bd));
}

.dweb-add-node-modal__search svg circle,
.dweb-add-node-modal__search svg path {
	fill: none;
	stroke: currentColor;
	stroke-width: 1.35;
	stroke-linecap: round;
	stroke-linejoin: round;
}

.dweb-add-node-modal__search input {
	min-width: 0;
	width: 100%;
	height: 32px;
	border: 0;
	outline: none;
	background: transparent;
	color: var(--wf-text, #edf2f4);
	font-size: 13.5px;
	caret-color: var(--wf-primary, #1f9d84);
	transition: color 160ms ease;
}

.dweb-add-node-modal__search input::placeholder {
	color: color-mix(in srgb, var(--wf-text-muted, #aeb8bd) 50%, transparent);
}

/* ── Body ── */
.dweb-add-node-modal__body {
	position: relative;
	min-height: 200px;
	max-height: calc(86vh - 16px - 40px - 36px);
	overflow-y: auto;
	padding: 6px 8px 12px;
	z-index: 2;
}

/* Left accent bar on body */
.dweb-add-node-modal__body::before {
	content: '';
	position: absolute;
	left: 0;
	top: 0;
	bottom: 0;
	width: 2px;
	background: linear-gradient(
		180deg,
		var(--wf-primary, #1f9d84) 0%,
		color-mix(in srgb, var(--wf-primary, #1f9d84) 40%, transparent) 100%
	);
	opacity: 0.25;
	pointer-events: none;
	border-radius: 0 1px 1px 0;
}

/* ── Items ── */
.dweb-add-node-modal__item {
	position: relative;
	width: 100%;
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding: 14px 18px;
	border: 0;
	border-radius: 0;
	background: transparent;
	color: inherit;
	text-align: left;
	cursor: pointer;
	transition:
		background-color 160ms ease,
		box-shadow 160ms ease;
	border-bottom: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 15%, transparent);
}

/* Left indicator stripe on hover */
.dweb-add-node-modal__item::before {
	content: '';
	position: absolute;
	left: -1px;
	top: 8px;
	bottom: 8px;
	width: 2px;
	background: var(--wf-primary, #1f9d84);
	border-radius: 1px;
	opacity: 0;
	transition: opacity 160ms ease;
}

.dweb-add-node-modal__item:last-child {
	border-bottom: none;
}

.dweb-add-node-modal__item:hover,
.dweb-add-node-modal__item:focus-visible {
	background: color-mix(in srgb, var(--wf-primary, #1f9d84) 10%, transparent);
	outline: none;
	box-shadow: 0 0 12px color-mix(in srgb, var(--wf-primary, #1f9d84) 14%, transparent);
}

.dweb-add-node-modal__item:hover::before,
.dweb-add-node-modal__item:focus-visible::before {
	opacity: 1;
}

.dweb-add-node-modal__item:hover .dweb-add-node-modal__item-label,
.dweb-add-node-modal__item:focus-visible .dweb-add-node-modal__item-label {
	color: var(--wf-primary, #1f9d84);
	text-shadow: 0 0 10px color-mix(in srgb, var(--wf-primary, #1f9d84) 35%, transparent);
}

.dweb-add-node-modal__item-label {
	display: inline-flex;
	align-items: center;
	gap: 8px;
	font-size: 14px;
	font-weight: 600;
	line-height: 1.3;
	color: var(--wf-text, #edf2f4);
	transition:
		color 160ms ease,
		text-shadow 160ms ease;
}

/* Description keeps muted color on hover */
.dweb-add-node-modal__item-desc {
	font-size: 12px;
	line-height: 1.5;
	color: var(--wf-text-muted, #aeb8bd);
}

/* Upload item */
.dweb-add-node-modal__item--upload .dweb-add-node-modal__item-label {
	color: var(--wf-primary, #1f9d84);
	text-shadow: 0 0 8px color-mix(in srgb, var(--wf-primary, #1f9d84) 35%, transparent);
}

.dweb-add-node-modal__item--upload:hover,
.dweb-add-node-modal__item--upload:focus-visible {
	background: color-mix(in srgb, var(--wf-primary, #1f9d84) 12%, transparent);
	box-shadow: 0 0 14px color-mix(in srgb, var(--wf-primary, #1f9d84) 22%, transparent);
}

.dweb-add-node-modal__upload-icon {
	width: 14px;
	height: 14px;
	flex: 0 0 auto;
	color: currentColor;
}

.dweb-add-node-modal__upload-icon path {
	fill: none;
	stroke: currentColor;
	stroke-width: 1.4;
	stroke-linecap: round;
	stroke-linejoin: round;
}

/* ── Empty state ── */
.dweb-add-node-modal__empty {
	padding: 24px 16px;
	text-align: center;
	color: var(--wf-text-muted, #aeb8bd);
	font-size: 12px;
}

.dweb-add-node-modal__upload-input {
	width: 1px;
	height: 1px;
	position: absolute;
	opacity: 0;
	pointer-events: none;
}

/* ── Scrollbar ── */
.custom-scrollbar-right::-webkit-scrollbar {
	width: 5px;
}

.custom-scrollbar-right::-webkit-scrollbar-track {
	background: transparent;
	margin: 12px 0;
}

.custom-scrollbar-right::-webkit-scrollbar-thumb {
	background-color: color-mix(in srgb, var(--wf-primary, #1f9d84) 40%, transparent);
	border-radius: 2px;
	transition: background-color 160ms ease;
}

.custom-scrollbar-right::-webkit-scrollbar-thumb:hover {
	background-color: color-mix(in srgb, var(--wf-primary, #1f9d84) 65%, transparent);
}

.custom-scrollbar-right {
	scrollbar-width: thin;
	scrollbar-color: color-mix(in srgb, var(--wf-primary, #1f9d84) 40%, transparent) transparent;
}

/* ── Animations ── */
@keyframes dweb-add-node-modal-pop {
	from {
		opacity: 0;
		transform: translateY(-8px) scale(0.97);
	}
	to {
		opacity: 1;
		transform: translateY(0) scale(1);
	}
}

.dweb-add-node-modal-fade-enter-active,
.dweb-add-node-modal-fade-leave-active {
	transition: opacity 160ms ease;
}

.dweb-add-node-modal-fade-enter-from,
.dweb-add-node-modal-fade-leave-to {
	opacity: 0;
}

/* ── Reduced motion ── */
@media (prefers-reduced-motion: reduce) {
	.dweb-add-node-modal {
		animation: none;
	}
	.nsm-bracket {
		opacity: 1 !important;
	}
	.nsm-hud-scanlines {
		display: none;
	}
	.dweb-add-node-modal__sidebar-tab,
	.dweb-add-node-modal__item,
	.dweb-add-node-modal__close {
		transition: none !important;
	}
}
</style>
