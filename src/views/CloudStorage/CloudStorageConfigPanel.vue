<template>
	<div class="cs-config">
		<div class="cs-config-header">
			<button class="cs-back-btn" @click="$emit('cancel')" :title="t('common.back')">
				<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
					<polyline points="15 18 9 12 15 6"/>
				</svg>
			</button>
			<div class="cs-header-deco left" aria-hidden="true"></div>
			<div class="cs-config-title">
				<div class="cs-title-icon-box">
					<svg viewBox="0 0 24 24" class="cs-config-icon" aria-hidden="true">
						<path
							d="M4 7a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V7z"
							fill="none"
							stroke="currentColor"
							stroke-width="1.5"
						/>
						<path d="M12 8v8M8 12h8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
					</svg>
				</div>
				<span>{{ t('cloudStorage.config.addBucket') }}</span>
			</div>
			<div class="cs-header-deco right" aria-hidden="true"></div>
		</div>

		<div class="cs-config-body">
			<div class="cs-form-section">
				<div class="cs-section-corners" aria-hidden="true">
					<span class="cs-sc tl"></span>
					<span class="cs-sc tr"></span>
					<span class="cs-sc bl"></span>
					<span class="cs-sc br"></span>
				</div>
				<div class="cs-section-header">
					<div class="cs-section-indicator"></div>
					<span class="cs-section-label">{{ t('cloudStorage.config.tos.credentials') }}</span>
					<div class="cs-section-line"></div>
				</div>
				<div class="cs-field">
					<div class="cs-field-label-row">
						<label class="cs-field-label">{{ t('cloudStorage.config.tos.accessKey') }}</label>
						<button class="cs-link-btn" type="button" @click="openUrl('https://console.volcengine.com/iam/keymanage/')">
							<svg viewBox="0 0 16 16" class="cs-link-icon" aria-hidden="true">
								<path d="M6.5 3.5H3.5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-3" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
								<path d="M9.5 3.5h3v3M13 3l-5.5 5.5" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" />
							</svg>
							{{ t('cloudStorage.config.tos.getKeyLink') }}
						</button>
					</div>
					<div class="cs-input-wrap">
						<span class="cs-input-deco left" aria-hidden="true"></span>
						<input
							v-model="tosConfig.accessKeyId"
							type="text"
							class="cs-input"
							:placeholder="t('cloudStorage.config.tos.accessKeyPlaceholder')"
						/>
						<span class="cs-input-focus-line" aria-hidden="true"></span>
					</div>
				</div>
				<div class="cs-field">
					<div class="cs-field-label-row">
						<label class="cs-field-label">{{ t('cloudStorage.config.tos.secretKey') }}</label>
					</div>
					<div class="cs-input-wrap">
						<span class="cs-input-deco left" aria-hidden="true"></span>
						<input
							v-model="tosConfig.accessKeySecret"
							type="password"
							class="cs-input"
							:placeholder="t('cloudStorage.config.tos.secretKeyPlaceholder')"
						/>
						<span class="cs-input-focus-line" aria-hidden="true"></span>
					</div>
				</div>
				<div class="cs-field">
					<label class="cs-field-label">{{ t('cloudStorage.config.tos.region') }}</label>
					<div class="cs-input-wrap">
						<span class="cs-input-deco left" aria-hidden="true"></span>
						<select v-model="tosConfig.region" class="cs-input cs-select" @change="onRegionChange">
							<option v-for="r in tosRegions" :key="r.id" :value="r.id">{{ r.name }} ({{ r.id }})</option>
						</select>
						<span class="cs-input-focus-line" aria-hidden="true"></span>
					</div>
				</div>
			</div>

			<div v-if="credentialsVerified" class="cs-form-section">
				<div class="cs-section-corners" aria-hidden="true">
					<span class="cs-sc tl"></span>
					<span class="cs-sc tr"></span>
					<span class="cs-sc bl"></span>
					<span class="cs-sc br"></span>
				</div>
				<div class="cs-section-header">
					<div class="cs-section-indicator"></div>
					<span class="cs-section-label">{{ t('cloudStorage.config.selectBucket') }}</span>
					<div class="cs-section-line"></div>
				</div>
				<div class="cs-field">
					<div v-if="availableBuckets.length" class="cs-bucket-list">
						<button
							v-for="b in availableBuckets"
							:key="b.name"
							class="cs-bucket-item"
							:class="{ active: selectedBucketName === b.name }"
							type="button"
							@click="selectedBucketName = b.name"
						>
							<span class="cs-bucket-corners" aria-hidden="true">
								<span class="cs-bc tl"></span>
								<span class="cs-bc br"></span>
							</span>
							<span class="cs-bucket-indicator"></span>
							<svg viewBox="0 0 16 16" class="cs-bucket-icon" aria-hidden="true">
								<path d="M2 4.5l1.5-2h9l1.5 2M2 4.5v8a1 1 0 001 1h10a1 1 0 001-1v-8M2 4.5h12" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
							</svg>
							{{ b.name }}
						</button>
					</div>
					<div v-else-if="listingBuckets" class="cs-loading-buckets">
						<div class="cs-spinner-inline"></div>
						<span>{{ t('cloudStorage.config.listingBuckets') }}</span>
					</div>
				</div>
			</div>

			<div class="cs-form-actions">
				<button v-if="!credentialsVerified" class="cs-btn cs-btn-primary" type="button" :disabled="verifying || !canVerify" @click="verifyCredentials">
					<span class="cs-btn-corners" aria-hidden="true">
						<span class="cs-btn-c tl"></span>
						<span class="cs-btn-c tr"></span>
						<span class="cs-btn-c bl"></span>
						<span class="cs-btn-c br"></span>
					</span>
					<span v-if="verifying" class="cs-spinner"></span>
					{{ verifying ? t('cloudStorage.config.verifying') : t('cloudStorage.config.verifyAndList') }}
				</button>
				<button v-else class="cs-btn cs-btn-primary" type="button" :disabled="!selectedBucketName || adding" @click="addBucket">
					<span class="cs-btn-corners" aria-hidden="true">
						<span class="cs-btn-c tl"></span>
						<span class="cs-btn-c tr"></span>
						<span class="cs-btn-c bl"></span>
						<span class="cs-btn-c br"></span>
					</span>
					<span v-if="adding" class="cs-spinner"></span>
					{{ adding ? t('cloudStorage.config.adding') : t('cloudStorage.config.addBucketConfirm') }}
				</button>
				<button class="cs-btn cs-btn-ghost" type="button" @click="$emit('cancel')">
					{{ t('common.cancel') }}
				</button>
			</div>

			<div v-if="verifyStatus.type && verifyStatus.message" class="cs-status" :class="verifyStatus.type">
				<div class="cs-status-corners" aria-hidden="true">
					<span class="cs-stc tl"></span>
					<span class="cs-stc tr"></span>
					<span class="cs-stc bl"></span>
					<span class="cs-stc br"></span>
				</div>
				<div class="cs-status-bar" aria-hidden="true"></div>
				<svg v-if="verifyStatus.type === 'success'" viewBox="0 0 16 16" class="cs-status-icon" aria-hidden="true">
					<path d="M3 8l3.5 3.5L13 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
				</svg>
				<svg v-else viewBox="0 0 16 16" class="cs-status-icon" aria-hidden="true">
					<circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.5" />
					<path d="M8 5v4M8 11v.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
				</svg>
				<span class="cs-status-message">{{ verifyStatus.message }}</span>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { reactive, ref, computed } from 'vue'
import { useI18n } from '../../i18n'
import { openExternalUrl } from '../../electronBridge'

const { t } = useI18n()

type VerifyStatusType = 'success' | 'error' | ''

const emit = defineEmits<{
	(e: 'cancel'): void
	(e: 'bucket-added', bucket?: any): void
}>()

interface TOSConfig {
	accessKeyId: string
	accessKeySecret: string
	region: string
	endpoint: string
}

const tosRegions = [
	{ id: 'cn-beijing', name: '华北2（北京）', endpoint: 'tos-cn-beijing.volces.com' },
	{ id: 'cn-shanghai', name: '华东2（上海）', endpoint: 'tos-cn-shanghai.volces.com' },
	{ id: 'cn-guangzhou', name: '华南1（广州）', endpoint: 'tos-cn-guangzhou.volces.com' },
	{ id: 'cn-hongkong', name: '中国香港', endpoint: 'tos-cn-hongkong.volces.com' },
]

const verifying = ref(false)
const listingBuckets = ref(false)
const adding = ref(false)
const credentialsVerified = ref(false)
const verifyStatus = ref<{ type: VerifyStatusType; message: string }>({ type: '', message: '' })
const availableBuckets = ref<any[]>([])
const selectedBucketName = ref('')

const tosConfig = reactive<TOSConfig>({
	accessKeyId: '',
	accessKeySecret: '',
	region: 'cn-beijing',
	endpoint: 'tos-cn-beijing.volces.com'
})

const canVerify = computed(() => {
	return tosConfig.accessKeyId.trim() && tosConfig.accessKeySecret.trim()
})

const openUrl = (url: string) => {
	openExternalUrl(url)
}

const onRegionChange = () => {
	const region = tosRegions.find(r => r.id === tosConfig.region)
	if (region) {
		tosConfig.endpoint = region.endpoint
	}
}

const listBuckets = async () => {
	listingBuckets.value = true
	try {
		availableBuckets.value = []
		const cloudfs = (window as any).dweb?.cloudfs
		if (!cloudfs?.listBuckets) {
			return false
		}
		const result = await cloudfs.listBuckets({
			providerId: 'volcengine-tos',
			region: tosConfig.region,
			endpoint: tosConfig.endpoint,
			credentials: {
				accessKeyId: tosConfig.accessKeyId,
				accessKeySecret: tosConfig.accessKeySecret,
			}
		})
		if (result?.ok && Array.isArray(result.buckets)) {
			availableBuckets.value = result.buckets.map((b: any) => ({
				name: b.name || b,
				location: b.location || tosConfig.region,
				extranetEndpoint: b.extranetEndpoint || tosConfig.endpoint,
			}))
			return true
		} else if (result?.ok === false) {
			verifyStatus.value = { type: 'error', message: result.error || '获取桶列表失败' }
			return false
		}
		return false
	} catch (e: any) {
		verifyStatus.value = { type: 'error', message: e?.message || '获取桶列表异常' }
		return false
	} finally {
		listingBuckets.value = false
	}
}

const verifyCredentials = async () => {
	verifying.value = true
	verifyStatus.value = { type: '', message: '' }
	try {
		const cloudfs = (window as any).dweb?.cloudfs

		if (cloudfs?.testConfig) {
			const configToTest = {
				credentials: {
					accessKeyId: tosConfig.accessKeyId,
					accessKeySecret: tosConfig.accessKeySecret,
				},
				region: tosConfig.region,
				endpoint: tosConfig.endpoint,
			}
			const result = await cloudfs.testConfig({
				providerId: 'volcengine-tos',
				config: configToTest
			})
			if (result?.ok) {
				credentialsVerified.value = true
				verifyStatus.value = { type: 'success', message: t('cloudStorage.config.verifySuccess') }
				await listBuckets()
			} else {
				credentialsVerified.value = false
				verifyStatus.value = { type: 'error', message: result?.error || t('cloudStorage.config.verifyFailed') }
			}
		} else {
			credentialsVerified.value = true
			verifyStatus.value = { type: 'success', message: t('cloudStorage.config.verifySuccess') }
			await listBuckets()
		}
	} catch (e: any) {
		credentialsVerified.value = false
		verifyStatus.value = { type: 'error', message: e?.message || t('cloudStorage.config.verifyFailed') }
	} finally {
		verifying.value = false
	}
}

const addBucket = async () => {
	if (!selectedBucketName.value) return
	adding.value = true
	try {
		const cloudfs = (window as any).dweb?.cloudfs
		if (!cloudfs?.addBucketFromCloud) {
			throw new Error('API not available')
		}
		const selectedBucket = availableBuckets.value.find(b => b.name === selectedBucketName.value)
		const bucketEndpoint = selectedBucket?.extranetEndpoint || tosConfig.endpoint
		const result = await cloudfs.addBucketFromCloud({
			bucketName: selectedBucketName.value,
			providerId: 'volcengine-tos',
			region: selectedBucket?.location || tosConfig.region,
			endpoint: bucketEndpoint,
			credentials: {
				accessKeyId: tosConfig.accessKeyId,
				accessKeySecret: tosConfig.accessKeySecret,
			}
		})
		if (result?.ok) {
			emit('bucket-added', result.bucket)
		} else {
			verifyStatus.value = { type: 'error', message: result?.error || '添加桶失败' }
		}
	} catch (e: any) {
		verifyStatus.value = { type: 'error', message: e?.message || '添加桶失败' }
	} finally {
		adding.value = false
	}
}
</script>

<style scoped>
.cs-config {
	display: flex;
	flex-direction: column;
	height: 100%;
	min-height: 0;
	color: var(--pl-fg);
	position: relative;
	z-index: 5;
}

.cs-config-header {
	flex-shrink: 0;
	padding: 16px 20px 14px;
	border-bottom: 1px solid color-mix(in srgb, var(--pl-accent) 20%, transparent);
	background: linear-gradient(180deg, color-mix(in srgb, var(--pl-accent) 8%, transparent), transparent);
	position: relative;
	display: flex;
	align-items: center;
	gap: 12px;
}

.cs-back-btn {
	width: 28px;
	height: 28px;
	display: flex;
	align-items: center;
	justify-content: center;
	background: transparent;
	border: 1px solid color-mix(in srgb, var(--pl-accent) 30%, transparent);
	color: var(--pl-fg-soft);
	cursor: pointer;
	transition: all 200ms ease;
	flex-shrink: 0;
}

.cs-back-btn:hover {
	border-color: var(--pl-accent);
	color: var(--pl-accent);
}

.cs-header-deco {
	flex: 1;
	height: 1px;
	background: linear-gradient(
		90deg,
		transparent,
		color-mix(in srgb, var(--pl-accent) 30%, transparent)
	);
}

.cs-header-deco.right {
	background: linear-gradient(
		90deg,
		color-mix(in srgb, var(--pl-accent) 30%, transparent),
		transparent
	);
}

.cs-config-title {
	display: flex;
	align-items: center;
	gap: 10px;
	font-size: 14px;
	font-weight: 600;
	color: var(--pl-fg);
	letter-spacing: 0.8px;
	text-transform: uppercase;
	flex-shrink: 0;
}

.cs-title-icon-box {
	position: relative;
	width: 28px;
	height: 28px;
	display: flex;
	align-items: center;
	justify-content: center;
}

.cs-title-icon-box::before {
	content: "";
	position: absolute;
	inset: 0;
	border: 1px solid color-mix(in srgb, var(--pl-accent) 45%, transparent);
	background: color-mix(in srgb, var(--pl-accent) 10%, transparent);
	box-shadow: inset 0 0 8px color-mix(in srgb, var(--pl-accent) 8%, transparent);
}

.cs-title-icon-box::after {
	content: "";
	position: absolute;
	inset: -4px;
	border: 1px solid color-mix(in srgb, var(--pl-accent) 15%, transparent);
}

.cs-config-icon {
	width: 15px;
	height: 15px;
	color: var(--pl-accent);
	filter: drop-shadow(0 0 8px color-mix(in srgb, var(--pl-accent) 55%, transparent));
	position: relative;
	z-index: 1;
}

.cs-config-body {
	flex: 1;
	min-height: 0;
	overflow-y: auto;
	padding: 18px;
	scrollbar-width: thin;
	scrollbar-color: color-mix(in srgb, var(--pl-accent) 35%, transparent) transparent;
}

.cs-config-body::-webkit-scrollbar {
	width: 5px;
}

.cs-config-body::-webkit-scrollbar-track {
	background: transparent;
}

.cs-config-body::-webkit-scrollbar-thumb {
	background: color-mix(in srgb, var(--pl-accent) 35%, transparent);
	border-radius: 2px;
}

.cs-form-section {
	margin-bottom: 20px;
	padding: 16px;
	padding-bottom: 4px;
	border: 1px solid color-mix(in srgb, var(--pl-accent) 12%, transparent);
	background: color-mix(in srgb, var(--pl-fg) 1.5%, transparent);
	position: relative;
	transition: border-color 200ms ease, box-shadow 200ms ease;
}

.cs-form-section:hover {
	border-color: color-mix(in srgb, var(--pl-accent) 25%, transparent);
	box-shadow: 0 0 12px color-mix(in srgb, var(--pl-accent) 6%, transparent);
}

.cs-form-section::before {
	content: "";
	position: absolute;
	top: 0;
	left: 0;
	width: 40px;
	height: 2px;
	background: linear-gradient(90deg, var(--pl-accent), transparent);
	box-shadow: 0 0 8px color-mix(in srgb, var(--pl-accent) 40%, transparent);
}

.cs-form-section::after {
	content: "";
	position: absolute;
	bottom: 0;
	right: 0;
	width: 40px;
	height: 1px;
	background: linear-gradient(270deg, color-mix(in srgb, var(--pl-accent) 30%, transparent), transparent);
}

.cs-section-corners {
	position: absolute;
	inset: 0;
	pointer-events: none;
}

.cs-sc {
	position: absolute;
	width: 8px;
	height: 8px;
	border-color: var(--pl-accent);
}

.cs-sc.tl {
	top: 3px;
	left: 3px;
	border-top: 1px solid currentColor;
	border-left: 1px solid currentColor;
	color: var(--pl-accent);
}

.cs-sc.tr {
	top: 3px;
	right: 3px;
	border-top: 1px solid currentColor;
	border-right: 1px solid currentColor;
	color: var(--pl-accent);
}

.cs-sc.bl {
	bottom: 3px;
	left: 3px;
	border-bottom: 1px solid currentColor;
	border-left: 1px solid currentColor;
	color: var(--pl-accent);
}

.cs-sc.br {
	bottom: 3px;
	right: 3px;
	border-bottom: 1px solid currentColor;
	border-right: 1px solid currentColor;
	color: var(--pl-accent);
}

.cs-section-header {
	display: flex;
	align-items: center;
	gap: 8px;
	margin-bottom: 16px;
}

.cs-section-indicator {
	width: 3px;
	height: 14px;
	background: linear-gradient(180deg, var(--pl-accent), color-mix(in srgb, var(--pl-accent) 50%, transparent));
	box-shadow: 0 0 8px color-mix(in srgb, var(--pl-accent) 40%, transparent);
}

.cs-section-label {
	font-size: 10px;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 1.2px;
	color: var(--pl-accent);
	font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
	flex-shrink: 0;
}

.cs-section-line {
	flex: 1;
	height: 1px;
	background: linear-gradient(
		90deg,
		color-mix(in srgb, var(--pl-accent) 25%, transparent),
		transparent
	);
}

.cs-field {
	margin-bottom: 14px;
}

.cs-field:last-child {
	margin-bottom: 12px;
}

.cs-field-label-row {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-bottom: 8px;
}

.cs-field-label {
	display: block;
	font-size: 12px;
	font-weight: 500;
	color: var(--pl-fg);
	letter-spacing: 0.3px;
}

.cs-field-label-row .cs-field-label {
	margin-bottom: 0;
}

.cs-link-btn {
	display: inline-flex;
	align-items: center;
	gap: 5px;
	padding: 4px 10px;
	font-size: 10px;
	color: var(--pl-accent);
	background: color-mix(in srgb, var(--pl-accent) 8%, transparent);
	border: 1px solid color-mix(in srgb, var(--pl-accent) 30%, transparent);
	cursor: pointer;
	transition: all 180ms ease;
	font-family: inherit;
	letter-spacing: 0.4px;
	position: relative;
	text-transform: uppercase;
}

.cs-link-btn:hover {
	background: color-mix(in srgb, var(--pl-accent) 15%, transparent);
	border-color: color-mix(in srgb, var(--pl-accent) 55%, transparent);
	box-shadow: 0 0 14px color-mix(in srgb, var(--pl-accent) 22%, transparent);
}

.cs-link-icon {
	width: 10px;
	height: 10px;
	position: relative;
	z-index: 1;
}

.cs-input-wrap {
	position: relative;
}

.cs-input-deco {
	position: absolute;
	top: 0;
	bottom: 0;
	width: 2px;
	background: linear-gradient(180deg, transparent, var(--pl-accent), transparent);
	opacity: 0.5;
	transition: opacity 200ms ease;
}

.cs-input-deco.left {
	left: 0;
}

.cs-input-wrap:focus-within .cs-input-deco {
	opacity: 1;
	box-shadow: 0 0 8px var(--pl-accent);
}

.cs-input {
	width: 100%;
	box-sizing: border-box;
	height: 34px;
	padding: 0 12px 0 14px;
	font-size: 12px;
	color: var(--pl-fg);
	background: color-mix(in srgb, #161d24 65%, transparent);
	border: 1px solid color-mix(in srgb, var(--pl-accent) 25%, transparent);
	border-left: none;
	outline: none;
	transition: border-color 200ms ease, box-shadow 200ms ease, background 200ms ease;
	font-family: inherit;
	position: relative;
}

.cs-select {
	appearance: none;
	cursor: pointer;
	background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath d='M3 4.5l3 3 3-3' fill='none' stroke='%235c6670' stroke-width='1.2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
	background-repeat: no-repeat;
	background-position: right 10px center;
	padding-right: 30px;
}

.cs-select option {
	background: #161d24;
	color: var(--pl-fg);
}

.cs-input::placeholder {
	color: #5c6670;
}

.cs-input:focus {
	border-color: color-mix(in srgb, var(--pl-accent) 60%, transparent);
	background: color-mix(in srgb, #161d24 80%, transparent);
	box-shadow: inset 0 0 12px color-mix(in srgb, var(--pl-accent) 6%, transparent),
		0 0 0 1px color-mix(in srgb, var(--pl-accent) 20%, transparent);
}

.cs-input-focus-line {
	position: absolute;
	bottom: 0;
	left: 0;
	width: 0;
	height: 1px;
	background: var(--pl-accent);
	box-shadow: 0 0 10px var(--pl-accent);
	transition: width 200ms ease;
	pointer-events: none;
}

.cs-input:focus ~ .cs-input-focus-line {
	width: 100%;
}

.cs-btn {
	height: 34px;
	padding: 0 16px;
	font-size: 12px;
	font-weight: 500;
	font-family: inherit;
	cursor: pointer;
	transition: all 220ms ease;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 6px;
	border: 1px solid color-mix(in srgb, var(--pl-accent) 30%, transparent);
	background: color-mix(in srgb, #161d24 50%, transparent);
	color: var(--pl-fg);
	position: relative;
	letter-spacing: 0.5px;
	overflow: hidden;
}

.cs-btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.cs-btn-corners {
	position: absolute;
	inset: 0;
	pointer-events: none;
}

.cs-btn-c {
	position: absolute;
	width: 6px;
	height: 6px;
	border-color: var(--pl-accent);
	opacity: 0;
	transition: opacity 200ms ease;
}

.cs-btn:hover .cs-btn-c {
	opacity: 1;
}

.cs-btn-c.tl {
	top: 2px;
	left: 2px;
	border-top: 1px solid currentColor;
	border-left: 1px solid currentColor;
	color: var(--pl-accent);
}

.cs-btn-c.tr {
	top: 2px;
	right: 2px;
	border-top: 1px solid currentColor;
	border-right: 1px solid currentColor;
	color: var(--pl-accent);
}

.cs-btn-c.bl {
	bottom: 2px;
	left: 2px;
	border-bottom: 1px solid currentColor;
	border-left: 1px solid currentColor;
	color: var(--pl-accent);
}

.cs-btn-c.br {
	bottom: 2px;
	right: 2px;
	border-bottom: 1px solid currentColor;
	border-right: 1px solid currentColor;
	color: var(--pl-accent);
}

.cs-btn-primary {
	background: linear-gradient(135deg, var(--pl-accent), color-mix(in srgb, var(--pl-accent) 70%, #4fb7c5));
	border-color: var(--pl-accent);
	color: #fff;
	text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
	box-shadow: 0 0 18px color-mix(in srgb, var(--pl-accent) 28%, transparent);
}

.cs-btn-primary::before {
	content: "";
	position: absolute;
	top: 0;
	left: -100%;
	width: 100%;
	height: 100%;
	background: linear-gradient(90deg, transparent, color-mix(in srgb, #fff 25%, transparent), transparent);
	transition: left 0.5s ease;
}

.cs-btn-primary:hover:not(:disabled)::before {
	left: 100%;
}

.cs-btn-primary:hover:not(:disabled) {
	filter: brightness(1.15);
	box-shadow: 0 0 28px color-mix(in srgb, var(--pl-accent) 40%, transparent);
}

.cs-btn-ghost:hover:not(:disabled) {
	border-color: var(--pl-accent);
	color: var(--pl-accent);
	background: color-mix(in srgb, var(--pl-accent) 8%, transparent);
	box-shadow: 0 0 14px color-mix(in srgb, var(--pl-accent) 12%, transparent);
}

.cs-spinner {
	width: 12px;
	height: 12px;
	border: 1.5px solid transparent;
	border-top-color: currentColor;
	border-radius: 50%;
	animation: cs-spin 0.7s linear infinite;
	position: relative;
	z-index: 1;
}

.cs-spinner-inline {
	width: 14px;
	height: 14px;
	border: 2px solid color-mix(in srgb, var(--pl-accent) 20%, transparent);
	border-top-color: var(--pl-accent);
	border-radius: 50%;
	animation: cs-spin 0.7s linear infinite;
}

@keyframes cs-spin {
	to { transform: rotate(360deg); }
}

.cs-loading-buckets {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 10px;
	padding: 20px;
	color: var(--pl-fg-soft);
	font-size: 12px;
}

.cs-bucket-list {
	display: flex;
	flex-direction: column;
	gap: 6px;
	max-height: 240px;
	overflow-y: auto;
	padding: 4px;
	scrollbar-width: thin;
}

.cs-bucket-list::-webkit-scrollbar {
	width: 4px;
}

.cs-bucket-list::-webkit-scrollbar-thumb {
	background: color-mix(in srgb, var(--pl-accent) 35%, transparent);
}

.cs-bucket-item {
	position: relative;
	padding: 10px 14px 10px 28px;
	font-size: 12px;
	color: var(--pl-fg-soft, #8a949c);
	background: color-mix(in srgb, #161d24 50%, transparent);
	border: 1px solid color-mix(in srgb, var(--pl-accent) 12%, transparent);
	cursor: pointer;
	transition: all 180ms ease;
	font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
	display: flex;
	align-items: center;
	gap: 8px;
	text-align: left;
	width: 100%;
}

.cs-bucket-icon {
	width: 14px;
	height: 14px;
	opacity: 0.7;
	flex-shrink: 0;
}

.cs-bucket-item:hover {
	border-color: color-mix(in srgb, var(--pl-accent) 45%, transparent);
	color: var(--pl-fg);
	background: color-mix(in srgb, var(--pl-accent) 5%, transparent);
}

.cs-bucket-item.active {
	border-color: var(--pl-accent);
	background: color-mix(in srgb, var(--pl-accent) 10%, transparent);
	color: var(--pl-accent);
	box-shadow: 0 0 12px color-mix(in srgb, var(--pl-accent) 18%, transparent);
}

.cs-bucket-corners {
	position: absolute;
	inset: 0;
	pointer-events: none;
}

.cs-bc {
	position: absolute;
	width: 0;
	height: 0;
	border-color: var(--pl-accent);
	transition: width 150ms ease, height 150ms ease;
}

.cs-bucket-item.active .cs-bc,
.cs-bucket-item:hover .cs-bc {
	width: 6px;
	height: 6px;
}

.cs-bc.tl {
	top: 1px;
	left: 1px;
	border-top: 1px solid currentColor;
	border-left: 1px solid currentColor;
	color: var(--pl-accent);
}

.cs-bc.br {
	bottom: 1px;
	right: 1px;
	border-bottom: 1px solid currentColor;
	border-right: 1px solid currentColor;
	color: var(--pl-accent);
}

.cs-bucket-indicator {
	position: absolute;
	left: 10px;
	top: 50%;
	transform: translateY(-50%);
	width: 4px;
	height: 4px;
	background: #5c6670;
}

.cs-bucket-item.active .cs-bucket-indicator {
	background: var(--pl-accent);
	box-shadow: 0 0 8px var(--pl-accent);
	animation: cs-indicator-blink 1.5s ease-in-out infinite;
}

@keyframes cs-indicator-blink {
	0%, 100% { opacity: 1; }
	50% { opacity: 0.4; }
}

.cs-form-actions {
	display: flex;
	gap: 10px;
	margin-top: 20px;
	padding-top: 18px;
	border-top: 1px dashed color-mix(in srgb, var(--pl-accent) 12%, transparent);
}

.cs-form-actions .cs-btn {
	flex: 1;
}

.cs-form-actions .cs-btn span {
	position: relative;
	z-index: 1;
}

.cs-status {
	margin-top: 16px;
	padding: 12px 16px 12px 20px;
	font-size: 12px;
	display: flex;
	align-items: flex-start;
	gap: 10px;
	border: 1px solid transparent;
	position: relative;
	background: color-mix(in srgb, #161d24 50%, transparent);
	letter-spacing: 0.3px;
	user-select: text;
	-webkit-user-select: text;
	max-height: 200px;
	overflow-y: auto;
	scrollbar-width: thin;
}

.cs-status.success {
	color: #4ade80;
	border-color: color-mix(in srgb, #4ade80 25%, transparent);
	background: color-mix(in srgb, #4ade80 6%, transparent);
}

.cs-status.success .cs-status-bar {
	background: linear-gradient(180deg, #4ade80, color-mix(in srgb, #4ade80 50%, transparent));
	box-shadow: 0 0 12px #4ade80;
}

.cs-status.success .cs-stc {
	color: #4ade80;
}

.cs-status.error {
	color: #f87171;
	border-color: color-mix(in srgb, #f87171 20%, transparent);
	background: color-mix(in srgb, #f87171 6%, transparent);
}

.cs-status.error .cs-status-bar {
	background: linear-gradient(180deg, #f87171, color-mix(in srgb, #f87171 50%, transparent));
	box-shadow: 0 0 12px #f87171;
}

.cs-status.error .cs-stc {
	color: #f87171;
}

.cs-status-corners {
	position: absolute;
	inset: 0;
	pointer-events: none;
}

.cs-stc {
	position: absolute;
	width: 6px;
	height: 6px;
}

.cs-stc.tl {
	top: 2px;
	left: 2px;
	border-top: 1px solid currentColor;
	border-left: 1px solid currentColor;
}

.cs-stc.tr {
	top: 2px;
	right: 2px;
	border-top: 1px solid currentColor;
	border-right: 1px solid currentColor;
}

.cs-stc.bl {
	bottom: 2px;
	left: 2px;
	border-bottom: 1px solid currentColor;
	border-left: 1px solid currentColor;
}

.cs-stc.br {
	bottom: 2px;
	right: 2px;
	border-bottom: 1px solid currentColor;
	border-right: 1px solid currentColor;
}

.cs-status-bar {
	position: absolute;
	left: 0;
	top: 0;
	bottom: 0;
	width: 3px;
}

.cs-status-icon {
	width: 14px;
	height: 14px;
	flex-shrink: 0;
	filter: drop-shadow(0 0 6px currentColor);
	margin-top: 1px;
}

.cs-status-message {
	flex: 1;
	min-width: 0;
	word-break: break-all;
	word-wrap: break-word;
	overflow-wrap: break-word;
	white-space: pre-wrap;
	line-height: 1.5;
	font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
	font-size: 11px;
}
</style>
