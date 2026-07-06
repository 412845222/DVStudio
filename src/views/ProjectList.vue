<template>
	<div class="project-list-page">
		<GlobalPageBackground variant="project-list" />

		<dialog ref="newProjectDialog" class="new-project-dialog">
			<form @submit.prevent="onNewProjectDialogConfirm">
				<h3>{{ t('projectList.dialogTitle') }}</h3>
				<p>
					{{ t('projectList.dialogFolder') }}
					<span class="folder-path">{{ pendingRootPath }}</span>
				</p>
				<label>
					{{ t('projectList.dialogProjectName') }}
					<input
						ref="newProjectNameInput"
						v-model="newProjectName"
						:placeholder="t('projectList.dialogNamePlaceholder')"
						required
					/>
				</label>
				<div class="dialog-actions">
					<button type="button" @click="newProjectDialog?.close()">{{ t('projectList.dialogCancel') }}</button>
					<button type="submit" :disabled="!newProjectName.trim()">{{ t('projectList.dialogCreate') }}</button>
				</div>
			</form>
		</dialog>

		<div class="project-list-shell">
			<header class="project-list-header">
				<div class="project-list-title">{{ t('projectList.title') }}</div>
				<div class="project-list-sub">
					{{ t('projectList.subtitle') }}
				</div>
				<div class="project-list-search">
					<input
						ref="searchInputRef"
						v-model.trim="keyword"
						class="project-list-search-input"
						type="text"
						:placeholder="t('projectList.searchPlaceholder')"
						maxlength="120"
						@keydown.esc.prevent="keyword = ''"
					/>
					<button
						class="project-list-search-refresh"
						type="button"
						:disabled="loading"
						@click="() => refreshProjects()"
					>
						{{ loading ? t('projectList.refreshing') : t('projectList.refresh') }}
					</button>
				</div>
				<div v-if="loadError" class="project-list-error">{{ loadError }}</div>
			</header>

			<section class="project-list-grid">
				<button
					class="project-card project-card-new"
					type="button"
					:disabled="creating"
					@mouseenter="newCardHovered = true"
					@mouseleave="newCardHovered = false"
					@focusin="newCardHovered = true"
					@focusout="newCardHovered = false"
					@click="onClickNewProject"
				>
					<div class="card-glow" aria-hidden="true"></div>
					<div class="sq-container" aria-hidden="true">
						<span
							v-for="p in newProjectParticles.particles"
							:key="p.id"
							class="sq-particle"
							:class="newProjectParticles.buildHoverStateClass(newCardHovered)"
							:style="p.style"
						></span>
					</div>
					<div class="card-frame" aria-hidden="true">
						<span class="corner tl"></span>
						<span class="corner tr"></span>
						<span class="corner bl"></span>
						<span class="corner br"></span>
					</div>
					<div class="project-card-body">
						<div class="project-card-new-icon" aria-hidden="true">
							<svg viewBox="0 0 24 24" width="44" height="44">
								<path
									d="M12 4v16M4 12h16"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
								/>
							</svg>
						</div>
						<div class="project-card-new-title">
							{{ creating ? t('projectList.creating') : t('projectList.newProject') }}
						</div>
						<div class="project-card-new-hint">{{ t('projectList.newProjectHint') }}</div>
					</div>
				</button>

				<div
					v-for="project in filteredProjects"
					:key="project.id"
					class="project-card"
					@mouseenter="setProjectHovered(project.id, true)"
					@mouseleave="setProjectHovered(project.id, false)"
					@focusin="setProjectHovered(project.id, true)"
					@focusout="setProjectHovered(project.id, false)"
				>
					<div class="card-glow" aria-hidden="true"></div>
					<div class="sq-container" aria-hidden="true">
						<span
							v-for="p in getProjectParticles(project.id).particles"
							:key="p.id"
							class="sq-particle"
							:class="
								getProjectParticles(project.id).buildHoverStateClass(isProjectHovered(project.id))
							"
							:style="p.style"
						></span>
					</div>
					<div class="card-frame" aria-hidden="true">
						<span class="corner tl"></span>
						<span class="corner tr"></span>
						<span class="corner bl"></span>
						<span class="corner br"></span>
					</div>
					<div class="project-card-body">
						<span class="project-card-id">{{ formatProjectId(project.id) }}</span>
						<div class="project-card-name" :title="project.name">
							{{ project.name || t('projectList.unnamedProject') }}
						</div>
						<div class="project-card-meta">
							<div class="project-card-meta-row">
								<span class="project-card-meta-label">{{ t('projectList.createdAt') }}</span>
								<span class="project-card-meta-value">
									{{ formatTime(project.createdAt) }}
								</span>
							</div>
							<div class="project-card-meta-row">
								<span class="project-card-meta-label">{{ t('projectList.updatedAt') }}</span>
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
							{{ t('projectList.open') }}
						</button>
						<button
							class="project-card-action"
							type="button"
							:disabled="loading"
							@click="openProject(project)"
						>
							{{ t('projectList.edit') }}
						</button>
						<button
							class="project-card-action project-card-action-danger"
							type="button"
							:disabled="deletingId === project.id"
							@click="onClickDeleteProject(project)"
						>
							{{ deletingId === project.id ? t('projectList.deleting') : t('projectList.delete') }}
						</button>
					</div>
				</div>

				<div
					v-if="!loading && keyword && !filteredProjects.length"
					class="project-card project-card-empty"
				>
					<div class="card-glow" aria-hidden="true"></div>
					<div class="card-frame" aria-hidden="true">
						<span class="corner tl"></span>
						<span class="corner tr"></span>
						<span class="corner bl"></span>
						<span class="corner br"></span>
					</div>
					<div class="project-card-body">
						<div class="project-card-empty-title">{{ t('projectList.noMatchTitle') }}</div>
						<div class="project-card-empty-hint">
							{{ t('projectList.noMatchHint') }}
						</div>
					</div>
				</div>

				<div
					v-if="!loading && !keyword && !allProjects.length"
					class="project-card project-card-empty"
				>
					<div class="card-glow" aria-hidden="true"></div>
					<div class="card-frame" aria-hidden="true">
						<span class="corner tl"></span>
						<span class="corner tr"></span>
						<span class="corner bl"></span>
						<span class="corner br"></span>
					</div>
					<div class="project-card-body">
						<div class="project-card-empty-title">{{ t('projectList.noProjectsTitle') }}</div>
						<div class="project-card-empty-hint">{{ t('projectList.noProjectsHint') }}</div>
					</div>
				</div>
			</section>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { BlueprintProjectService } from '../network/BlueprintProjectService'
import { isElectron } from '../electronBridge'
import { useStartupProgress } from '../composables/useStartupProgress'
import { useSquareParticles, type SquareParticlesResult } from '../composables/useSquareParticles'
import GlobalPageBackground from '../ui/UIComponent/GlobalPageBackground.vue'
import { getErrorMessage } from '../types/utils'
import { useI18n } from '../i18n'
import '../styles/project-list.css'
import '../styles/square-particles.css'

const { t } = useI18n()

type ProjectCardItem = {
	id: number
	name: string
	rootPath?: string
	createdAt: number | null
	updatedAt: number | null
}

const router = useRouter()

const loading = ref(false)
const loadError = ref('')
const creating = ref(false)
const deletingId = ref<number | null>(null)
const allProjects = ref<ProjectCardItem[]>([])
const keyword = ref('')
const searchInputRef = ref<HTMLInputElement | null>(null)
const newProjectDialog = ref<HTMLDialogElement | null>(null)
const pendingRootPath = ref('')
const newProjectName = ref('')

const blueprintProjectService = new BlueprintProjectService()
const startupProgress = useStartupProgress()

// --- Square particles (DOM-based, replaces Canvas particles) ---
const newProjectParticles: SquareParticlesResult = useSquareParticles({
	count: 8,
	seed: 42
})
const newCardHovered = ref(false)

// Cache particle generators + hovered state per project id
const particleByProjectId = new Map<number, SquareParticlesResult>()
const hoveredProjectIds = new Set<number>()

function getProjectParticles(id: number): SquareParticlesResult {
	let p = particleByProjectId.get(id)
	if (!p) {
		p = useSquareParticles({ count: 6, seed: id })
		particleByProjectId.set(id, p)
	}
	return p
}

function setProjectHovered(id: number, hovering: boolean) {
	if (hovering) hoveredProjectIds.add(id)
	else hoveredProjectIds.delete(id)
}

function isProjectHovered(id: number): boolean {
	return hoveredProjectIds.has(id)
}

// Cleanup orphan entries after projects list refresh
function pruneProjectParticleCache(validIds: Set<number>) {
	for (const key of Array.from(particleByProjectId.keys())) {
		if (!validIds.has(key)) particleByProjectId.delete(key)
	}
	for (const key of Array.from(hoveredProjectIds.keys())) {
		if (!validIds.has(key)) hoveredProjectIds.delete(key)
	}
}

function formatProjectId(id: number): string {
	const n = Number.isFinite(id) && id > 0 ? id : 0
	return '#' + String(n).padStart(4, '0')
}

const localDbBridge = () => {
	return window.dweb?.aiworkflow?.db?.projects?.list
}

async function runStartupCheckSequence() {
	if (!isElectron()) {
		return
	}
	startupProgress.show(t('projectList.startup.checkTitle'), null)
	startupProgress.reset(t('projectList.startup.checkTitle'))

	await startupProgress.runStep(
		'localdb.projects',
		t('projectList.startup.prepareProjectList'),
		async () => {
			await refreshProjects(true)
			return allProjects.value.length
		},
		{ errorDetailOnFailure: true }
	)

	startupProgress.updateStep('localdb.projects', {
		status: 'ok',
		detail: t('projectList.startup.totalProjects', { count: allProjects.value.length })
	})
	setTimeout(() => startupProgress.hide(), 800)
}

const filteredProjects = computed<ProjectCardItem[]>(() => {
	const kw = String(keyword.value || '')
		.trim()
		.toLowerCase()
	if (!kw) return allProjects.value
	return allProjects.value.filter((p) =>
		String(p.name || '')
			.toLowerCase()
			.includes(kw)
	)
})

function padTwo(n: number) {
	return String(n).padStart(2, '0')
}

function formatTime(t: unknown) {
	const num = typeof t === 'number' ? t : Number(t || 0)
	if (!Number.isFinite(num) || num <= 0) return '-'
	const d = new Date(num)
	if (Number.isNaN(d.getTime())) return '-'
	return `${d.getFullYear()}-${padTwo(d.getMonth() + 1)}-${padTwo(
		d.getDate()
	)} ${padTwo(d.getHours())}:${padTwo(d.getMinutes())}`
}

function normalizeProjectItem(item: unknown): ProjectCardItem {
	const row = (item || {}) as {
		id?: unknown
		name?: unknown
		createdAt?: unknown
		updatedAt?: unknown
	}
	const id = Number(row.id || 0)
	const created = typeof row.createdAt === 'number' ? row.createdAt : null
	const updated = typeof row.updatedAt === 'number' ? row.updatedAt : null
	return {
		id,
		name: String(row.name || '').trim(),
		createdAt: created,
		updatedAt: updated
	}
}

async function refreshProjects(silent = false) {
	loading.value = true
	loadError.value = ''
	try {
		let list: unknown[] = []
		let usedLocal = false
		if (isElectron() && typeof localDbBridge() === 'function') {
			usedLocal = true
			let raw: unknown
			try {
				raw = await localDbBridge()!.call(null)
			} catch (e) {
				const dbBridge = window.dweb?.aiworkflow?.db
				if (dbBridge?._ensureInitialized) {
					const initResult = await dbBridge._ensureInitialized({})
					if (initResult?.ok) {
						raw = await localDbBridge()!.call(null)
					} else {
						throw e
					}
				} else {
					throw e
				}
			}
			if (Array.isArray(raw)) {
				list = raw
			} else if (raw != null && typeof raw === 'object') {
				const obj = raw as { projects?: unknown; value?: unknown; ok?: boolean }
				if (Array.isArray(obj.projects)) {
					list = obj.projects
				} else if (obj.ok && Array.isArray(obj.value)) {
					list = obj.value
				} else if (Array.isArray(obj.value)) {
					list = obj.value
				}
			}
		} else {
			const res = await blueprintProjectService.listProjects()
			if (!res || !(res as { ok?: boolean }).ok) {
				const err = String((res as { error?: string })?.error || t('projectList.error.loadFailed'))
				if (!silent) loadError.value = err
				allProjects.value = []
				return
			}
			list = Array.isArray((res as { projects?: unknown[] }).projects)
				? ((res as { projects: unknown[] }).projects as unknown[])
				: []
		}
		// Clean up old particle cache for projects no longer present
		const newIds = new Set(
			list.map((it) => Number((it as { id?: unknown })?.id || 0)).filter((n) => n > 0)
		)
		pruneProjectParticleCache(newIds)
		allProjects.value = list
			.map(normalizeProjectItem)
			.filter((p) => Number.isFinite(p.id) && p.id > 0)
			.sort((a, b) => {
				const au = a.updatedAt || 0
				const bu = b.updatedAt || 0
				if (bu !== au) return bu - au
				const ac = a.createdAt || 0
				const bc = b.createdAt || 0
				return bc - ac
			})
		if (usedLocal) {
			// synced hint placeholder (non-blocking)
		}
	} catch (e: unknown) {
		const err = getErrorMessage(e) || t('projectList.error.loadFailed')
		if (!silent) loadError.value = err
	} finally {
		loading.value = false
	}
}

function openProject(project: ProjectCardItem) {
	if (!Number.isFinite(project.id) || project.id <= 0) return
	const id = Math.floor(project.id)
	void router.push({
		name: 'AIWorkflow',
		query: { projectId: String(id) }
	})
}

async function onClickNewProject() {
	if (creating.value) return
	if (!isElectron()) {
		loadError.value = t('projectList.error.newProjectNeedFolder')
		return
	}
	const bridge = window.dweb?.aiworkflow
	if (typeof bridge?.selectProjectFolder !== 'function') {
		loadError.value = t('projectList.error.cannotSelectFolder')
		return
	}
	try {
		const picked = await bridge.selectProjectFolder()
		if (picked?.canceled || !Array.isArray(picked?.filePaths) || !picked.filePaths[0]) {
			return
		}
		const rootPath = String(picked.filePaths[0] || '').trim()
		if (!rootPath) return
		pendingRootPath.value = rootPath
		newProjectName.value = ''
		newProjectDialog.value?.showModal()
	} catch (e: unknown) {
		loadError.value = getErrorMessage(e) || t('projectList.error.selectFolderFailed')
	}
}

async function onNewProjectDialogConfirm() {
	if (!newProjectName.value.trim() || !pendingRootPath.value) return
	creating.value = true
	newProjectDialog.value?.close()
	try {
		const dbBridge = window.dweb?.aiworkflow?.db
		if (dbBridge) {
			const initState = await dbBridge._initState?.()
			if (!initState?.ok) {
				const retry = await dbBridge._ensureInitialized?.({})
				if (!retry?.ok) {
					loadError.value =
						t('projectList.error.dbNotReady', { error: String(retry?.error || initState?.error || t('projectList.error.createFailed')) })
					return
				}
			}
		}
		const openFolderBridge = window.dweb?.aiworkflow?.db?.projects?.openFolder
		if (typeof openFolderBridge !== 'function') {
			loadError.value = t('projectList.error.cannotCreateProject')
			return
		}
		const result = await openFolderBridge({
			rootPath: pendingRootPath.value,
			name: newProjectName.value.trim(),
			create: true
		})
		if (!result?.ok || !result?.project?.id) {
			loadError.value = result?.error || t('projectList.error.createFailed')
			return
		}
		const projectId = result.project.id
		void router.push({
			name: 'AIWorkflow',
			query: { projectId: String(projectId) }
		})
	} catch (e: unknown) {
		loadError.value = getErrorMessage(e) || t('projectList.error.createFailed')
	} finally {
		creating.value = false
	}
}

async function onClickDeleteProject(project: ProjectCardItem) {
	if (!Number.isFinite(project.id) || project.id <= 0) return
	const ok = window.confirm(
		t('projectList.deleteConfirmMessage', { name: project.name || t('projectList.unnamedProject') })
	)
	if (!ok) return
	deletingId.value = project.id
	try {
		let succeeded = false
		let errorMsg = t('projectList.error.deleteFailed')
		const del = window.dweb?.aiworkflow?.db?.projects?.delete
		type DeleteResult = { ok?: boolean; error?: string } | boolean | unknown[] | number
		if (isElectron() && typeof del === 'function') {
			const raw = await del({ id: project.id })
			const deleteRes = raw as DeleteResult
			succeeded =
				(deleteRes != null &&
					typeof deleteRes === 'object' &&
					'ok' in deleteRes &&
					deleteRes.ok === true) ||
				deleteRes === true ||
				Array.isArray(deleteRes) ||
				typeof deleteRes === 'number'
			if (
				!succeeded &&
				deleteRes != null &&
				typeof deleteRes === 'object' &&
				'error' in deleteRes &&
				deleteRes.error
			) {
				errorMsg = String(deleteRes.error)
			}
		} else {
			const res = await blueprintProjectService.deleteProject(project.id)
			if (res && (res as { ok?: boolean }).ok) {
				succeeded = true
			} else if (res && (res as { error?: string }).error) {
				errorMsg = String((res as { error?: string }).error)
			}
		}
		if (!succeeded) {
			loadError.value = errorMsg
			return
		}
		await refreshProjects(true)
	} catch (e: unknown) {
		loadError.value = getErrorMessage(e) || t('projectList.error.deleteFailed')
	} finally {
		deletingId.value = null
	}
}

onMounted(async () => {
	await runStartupCheckSequence()
	if (typeof searchInputRef.value?.focus === 'function') {
		searchInputRef.value.focus()
	}
})

onBeforeUnmount(() => {
	// DOM particles are auto-cleaned by Vue on unmount —
	// just clear our in-memory caches to free references.
	particleByProjectId.clear()
	hoveredProjectIds.clear()
})
</script>
