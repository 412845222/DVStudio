<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import ModalDialog from './ModalDialog.vue'
import { getAppInfo, openHomepage, openRepoUrl, openBilibili, openIssues, openExternalUrl, checkForUpdate, isSteamVersion } from '../../network/appInfo'
import { useAboutDialog } from './aboutDialogStore'
import { useI18n } from '../../i18n'
import type { UpdateCheckResult } from '../../network/appInfo'

const { t } = useI18n()
const { aboutOpen, closeAboutDialog } = useAboutDialog()
const info = getAppInfo()

type UpdateStatus = 'idle' | 'checking' | 'available' | 'latest' | 'error' | 'steam'

const updateStatus = ref<UpdateStatus>('idle')
const updateResult = ref<UpdateCheckResult | null>(null)
const isSteam = ref(false)

const updateStatusText = computed(() => {
	switch (updateStatus.value) {
		case 'checking':
			return t('about.checkingUpdate')
		case 'available':
			return t('about.updateAvailable')
		case 'latest':
			return t('about.noUpdate')
		case 'error':
			return updateResult.value?.error || t('about.updateCheckFailed')
		case 'steam':
			return t('about.steamVersion')
		default:
			return ''
	}
})

const hasUpdate = computed(() => updateStatus.value === 'available' && updateResult.value?.hasUpdate)
const isChecking = computed(() => updateStatus.value === 'checking')

async function handleCheckUpdate() {
	if (isChecking.value) return
	updateStatus.value = 'checking'
	updateResult.value = null
	try {
		const result = await checkForUpdate()
		updateResult.value = result
		if (result.skipped && result.reason === 'steam') {
			updateStatus.value = 'steam'
		} else if (!result.ok) {
			updateStatus.value = 'error'
		} else if (result.hasUpdate) {
			updateStatus.value = 'available'
		} else {
			updateStatus.value = 'latest'
		}
	} catch (e) {
		updateStatus.value = 'error'
		updateResult.value = {
			ok: false,
			error: e instanceof Error ? e.message : String(e),
			currentVersion: info.appVersion,
		}
	}
}

function handleDownloadUpdate() {
	if (updateResult.value?.releaseUrl) {
		openExternalUrl(updateResult.value.releaseUrl)
	} else {
		openRepoUrl()
	}
}

function handleConfirm() {
	closeAboutDialog()
}

function onClose() {
	closeAboutDialog()
}

onMounted(async () => {
	isSteam.value = await isSteamVersion()
})
</script>

<template>
	<ModalDialog
		:open="aboutOpen"
		:title="t('about.title', { appName: info.appName })"
		:confirm-text="t('about.confirm')"
		:close-text="t('about.close')"
		@confirm="handleConfirm"
		@close="onClose"
	>
		<div class="about-content">
			<div class="about-header">
				<img class="about-logo" src="/favicon.ico" alt="" aria-hidden="true" />
				<div class="about-title-wrap">
					<div class="about-app-name">{{ info.appName }}</div>
					<div class="about-version-row">
						<span class="about-version-label">{{ t('about.currentVersion') }}:</span>
						<span class="about-version-value">{{ info.appVersion }}</span>
					</div>
				</div>
			</div>

			<div class="about-info-section">
				<div class="about-info-row">
					<span class="about-info-label">{{ t('about.license') }}</span>
					<span class="about-license-badge">{{ info.license }}</span>
				</div>
				<div class="about-info-row">
					<span class="about-info-label">{{ t('about.copyright') }}</span>
					<span class="about-info-value">{{ info.copyright }}</span>
				</div>
			</div>

			<div class="about-update-section" v-if="!isSteam">
				<div class="about-update-header">
					<button
						class="about-check-update-btn"
						type="button"
						:disabled="isChecking"
						@click="handleCheckUpdate"
					>
						<span v-if="isChecking" class="about-update-spinner"></span>
						{{ isChecking ? t('about.checkingUpdate') : t('about.checkUpdate') }}
					</button>
				</div>
				<div class="about-update-status" v-if="updateStatus !== 'idle'" :class="updateStatus">
					<div class="about-update-status-text">{{ updateStatusText }}</div>
					<div class="about-update-version-info" v-if="hasUpdate && updateResult">
						<span class="about-latest-label">{{ t('about.latestVersion') }}:</span>
						<span class="about-latest-value">{{ updateResult.latestVersion }}</span>
					</div>
					<button
						v-if="hasUpdate"
						class="about-download-btn"
						type="button"
						@click="handleDownloadUpdate"
					>
						{{ t('about.downloadUpdate') }}
					</button>
				</div>
			</div>

			<div class="about-steam-notice" v-else>
				<span class="about-steam-icon">🎮</span>
				<span>{{ t('about.steamVersion') }}</span>
			</div>

			<div class="about-links">
				<button class="about-link-btn" type="button" @click="openHomepage()">
					<span class="about-link-icon">🌐</span>
					{{ t('about.officialWebsite') }}
				</button>
				<button class="about-link-btn" type="button" @click="openRepoUrl()">
					<span class="about-link-icon">📦</span>
					{{ t('about.githubRepo') }}
				</button>
				<button class="about-link-btn" type="button" @click="openBilibili()">
					<span class="about-link-icon">📺</span>
					{{ t('about.bilibili') }}
				</button>
				<button class="about-link-btn about-feedback-btn" type="button" @click="openIssues()">
					<span class="about-link-icon">💬</span>
					{{ t('about.feedback') }}
				</button>
			</div>
		</div>
	</ModalDialog>
</template>

<style scoped>
.about-content {
	padding: 4px 4px 8px;
	display: flex;
	flex-direction: column;
	gap: 16px;
}

.about-header {
	display: flex;
	align-items: center;
	gap: 14px;
}

.about-logo {
	width: 64px;
	height: 64px;
	flex: 0 0 64px;
	border-radius: 14px;
	box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
}

.about-title-wrap {
	min-width: 0;
}

.about-app-name {
	font-size: 22px;
	font-weight: 600;
	color: var(--theme-text-primary);
	line-height: 1.3;
}

.about-version-row {
	display: flex;
	align-items: center;
	gap: 6px;
	margin-top: 4px;
	font-size: 13px;
}

.about-version-label {
	color: var(--theme-text-secondary);
}

.about-version-value {
	color: var(--theme-accent);
	font-weight: 600;
}

.about-info-section {
	border: 1px solid var(--theme-border);
	border-radius: 10px;
	padding: 14px 16px;
	background: var(--theme-bg-tertiary);
	display: flex;
	flex-direction: column;
	gap: 10px;
}

.about-info-row {
	display: flex;
	align-items: center;
	gap: 10px;
	font-size: 13px;
}

.about-info-label {
	color: var(--theme-text-secondary);
	min-width: 56px;
	flex-shrink: 0;
}

.about-info-value {
	color: var(--theme-text-primary);
}

.about-license-badge {
	display: inline-block;
	padding: 2px 10px;
	border-radius: 6px;
	border: 1px solid var(--theme-border);
	background: var(--theme-bg-secondary);
	font-weight: 600;
	font-size: 12px;
	color: var(--theme-text-primary);
}

.about-update-section {
	border: 1px solid var(--theme-border);
	border-radius: 10px;
	padding: 14px 16px;
	background: var(--theme-bg-tertiary);
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.about-update-header {
	display: flex;
	align-items: center;
}

.about-check-update-btn {
	appearance: none;
	-webkit-appearance: none;
	border: 1px solid var(--theme-accent);
	border-radius: 8px;
	background: color-mix(in srgb, var(--theme-accent) 12%, transparent);
	color: var(--theme-accent);
	padding: 8px 18px;
	font-size: 13px;
	font-weight: 500;
	cursor: pointer;
	transition: all 0.2s;
	display: inline-flex;
	align-items: center;
	gap: 8px;
}

.about-check-update-btn:hover:not(:disabled) {
	background: color-mix(in srgb, var(--theme-accent) 22%, transparent);
	border-color: var(--theme-accent);
}

.about-check-update-btn:disabled {
	opacity: 0.7;
	cursor: not-allowed;
}

.about-update-spinner {
	width: 14px;
	height: 14px;
	border: 2px solid currentColor;
	border-top-color: transparent;
	border-radius: 50%;
	animation: spin 0.8s linear infinite;
}

@keyframes spin {
	to {
		transform: rotate(360deg);
	}
}

.about-update-status {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding-top: 4px;
	border-top: 1px solid var(--theme-border);
}

.about-update-status-text {
	font-size: 13px;
	display: flex;
	align-items: center;
	gap: 8px;
}

.about-update-status.available {
	color: var(--theme-success, #22c55e);
}

.about-update-status.latest {
	color: var(--theme-text-secondary);
}

.about-update-status.error {
	color: var(--theme-error, #ef4444);
}

.about-update-status.steam {
	color: var(--theme-accent);
}

.about-update-status.checking {
	color: var(--theme-text-secondary);
}

.about-update-version-info {
	display: flex;
	align-items: center;
	gap: 6px;
	font-size: 13px;
}

.about-latest-label {
	color: var(--theme-text-secondary);
}

.about-latest-value {
	color: var(--theme-success, #22c55e);
	font-weight: 600;
}

.about-download-btn {
	appearance: none;
	-webkit-appearance: none;
	align-self: flex-start;
	border: none;
	border-radius: 8px;
	background: var(--theme-accent);
	color: white;
	padding: 8px 20px;
	font-size: 13px;
	font-weight: 500;
	cursor: pointer;
	transition: all 0.2s;
}

.about-download-btn:hover {
	filter: brightness(1.1);
	transform: translateY(-1px);
}

.about-steam-notice {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 14px 16px;
	border: 1px solid color-mix(in srgb, var(--theme-accent) 40%, var(--theme-border));
	border-radius: 10px;
	background: color-mix(in srgb, var(--theme-accent) 8%, var(--theme-bg-tertiary));
	font-size: 13px;
	color: var(--theme-accent);
}

.about-steam-icon {
	font-size: 20px;
}

.about-links {
	display: flex;
	gap: 10px;
	flex-wrap: wrap;
}

.about-link-btn {
	appearance: none;
	-webkit-appearance: none;
	border: 1px solid var(--theme-border);
	border-radius: 8px;
	background: var(--theme-bg-secondary);
	color: var(--theme-text-primary);
	padding: 8px 14px;
	font-size: 13px;
	cursor: pointer;
	transition: all 0.15s;
	display: inline-flex;
	align-items: center;
	gap: 6px;
}

.about-link-btn:hover {
	border-color: var(--theme-accent);
	background: var(--theme-hover-bg);
	color: var(--theme-accent);
}

.about-link-icon {
	font-size: 14px;
}

.about-feedback-btn:hover {
	border-color: var(--theme-warning, #f59e0b);
	color: var(--theme-warning, #f59e0b);
}
</style>
