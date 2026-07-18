<template>
	<div class="cs-provider-selector">
		<div class="cs-providers-grid">
			<button
				v-for="provider in displayProviders"
				:key="provider.id"
				class="cs-provider-card"
				:class="{
					active: selectedId === provider.id,
					disabled: !provider.available
				}"
				type="button"
				:disabled="!provider.available"
				@click="selectProvider(provider)"
			>
				<span class="cs-pc-corners" aria-hidden="true">
					<span class="cs-pcc tl"></span>
					<span class="cs-pcc tr"></span>
					<span class="cs-pcc bl"></span>
					<span class="cs-pcc br"></span>
				</span>
				<span v-if="selectedId === provider.id" class="cs-pc-check" aria-hidden="true">
					<svg viewBox="0 0 16 16" width="12" height="12">
						<path d="M3 8l3.5 3.5L13 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
					</svg>
				</span>
				<span v-if="!provider.available" class="cs-pc-badge">{{ t('cloudStorage.config.comingSoon') }}</span>
				<div class="cs-pc-icon-box">
					<svg v-if="provider.icon === 'volcano'" viewBox="0 0 24 24" class="cs-pc-icon" aria-hidden="true">
						<path d="M4 20L8 10L10 13L12 8L14 14L16 10L20 20H4Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
						<path d="M9 6L9.5 4L10.5 6L10 8L9 6Z" fill="currentColor" opacity="0.8"/>
					</svg>
					<svg v-else-if="provider.id === 'aliyun-oss'" viewBox="0 0 24 24" class="cs-pc-icon" aria-hidden="true">
						<path d="M4 8a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v2M4 8v8a4 4 0 0 0 4 4h8a4 4 0 0 0 4-4V8M4 8h16M8 12h8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
					</svg>
					<svg v-else-if="provider.id === 'tencent-cos'" viewBox="0 0 24 24" class="cs-pc-icon" aria-hidden="true">
						<path d="M12 3L21 8V16L12 21L3 16V8L12 3Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
						<path d="M12 12M8 10L16 14M16 10L8 14" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
					</svg>
					<svg v-else-if="provider.id === 'aws-s3'" viewBox="0 0 24 24" class="cs-pc-icon" aria-hidden="true">
						<ellipse cx="12" cy="6" rx="8" ry="3" fill="none" stroke="currentColor" stroke-width="1.5"/>
						<path d="M4 6V12C4 13.657 7.582 15 12 15C16.418 15 20 13.657 20 12V6" fill="none" stroke="currentColor" stroke-width="1.5"/>
						<path d="M4 12V18C4 19.657 7.582 21 12 21C16.418 21 20 19.657 20 18V12" fill="none" stroke="currentColor" stroke-width="1.5"/>
					</svg>
					<svg v-else viewBox="0 0 24 24" class="cs-pc-icon" aria-hidden="true">
						<rect x="3" y="4" width="18" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/>
						<path d="M3 10H21M8 4V20" fill="none" stroke="currentColor" stroke-width="1.5"/>
					</svg>
				</div>
				<div class="cs-pc-name">{{ provider.name }}</div>
				<div class="cs-pc-desc">{{ provider.description }}</div>
			</button>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, watch } from 'vue'
import { useI18n } from '../../i18n'
import type { CloudStorageProviderMeta } from '../../electronBridge/types'

const { t } = useI18n()

interface DisplayProvider extends CloudStorageProviderMeta {
	available: boolean
}

const props = defineProps<{
	modelValue?: string
}>()

const emit = defineEmits<{
	(e: 'update:modelValue', id: string): void
	(e: 'selected', provider: CloudStorageProviderMeta): void
}>()

const selectedId = ref(props.modelValue || '')

watch(() => props.modelValue, (newVal) => {
	if (newVal !== undefined && newVal !== selectedId.value) {
		selectedId.value = newVal
	}
})

const staticProviders: DisplayProvider[] = [
	{
		id: 'volcengine-tos',
		name: '火山引擎 TOS',
		description: '字节跳动旗下云存储服务',
		icon: 'volcano',
		website: 'https://www.volcengine.com/product/tos',
		docsUrl: 'https://www.volcengine.com/docs/6349',
		keyApplyUrl: 'https://console.volcengine.com/iam/keymanage/',
		keyApplyTip: '建议使用子账号密钥，遵循最小权限原则',
		regions: [],
		credentialFields: [],
		available: true,
	},
	{
		id: 'aliyun-oss',
		name: '阿里云 OSS',
		description: '阿里巴巴集团旗下云存储服务',
		icon: 'cloud',
		website: 'https://www.aliyun.com/product/oss',
		docsUrl: 'https://help.aliyun.com/product/31815.html',
		keyApplyUrl: 'https://ram.console.aliyun.com/manage/ak',
		keyApplyTip: '建议使用 RAM 子账号 AccessKey',
		regions: [],
		credentialFields: [],
		available: false,
	},
	{
		id: 'tencent-cos',
		name: '腾讯云 COS',
		description: '腾讯旗下云对象存储服务',
		icon: 'cloud',
		website: 'https://cloud.tencent.com/product/cos',
		docsUrl: 'https://cloud.tencent.com/document/product/436',
		keyApplyUrl: 'https://console.cloud.tencent.com/cam/capi',
		keyApplyTip: '建议使用子用户密钥并授予COS权限',
		regions: [],
		credentialFields: [],
		available: false,
	},
	{
		id: 'aws-s3',
		name: 'AWS S3',
		description: 'Amazon 简单存储服务',
		icon: 'cloud',
		website: 'https://aws.amazon.com/s3/',
		docsUrl: 'https://docs.aws.amazon.com/s3/',
		keyApplyUrl: 'https://us-east-1.console.aws.amazon.com/iam/home#/security_credentials',
		keyApplyTip: '建议创建IAM用户并附加AmazonS3FullAccess策略',
		regions: [],
		credentialFields: [],
		available: false,
	},
]

const backendProviders = ref<CloudStorageProviderMeta[]>([])

const displayProviders = computed<DisplayProvider[]>(() => {
	const backendMap = new Map(backendProviders.value.map(p => [p.id, p]))
	return staticProviders.map(sp => {
		const backend = backendMap.get(sp.id)
		if (backend) {
			return {
				...sp,
				...backend,
				name: backend.name || sp.name,
				description: backend.description || sp.description,
				available: true,
			}
		}
		return sp
	})
})

const selectProvider = (provider: DisplayProvider) => {
	if (!provider.available) return
	selectedId.value = provider.id
	emit('update:modelValue', provider.id)
	emit('selected', provider)
}

onMounted(async () => {
	try {
		const dweb = (window as any).dweb
		if (dweb?.cloudfs?.listProviders) {
			const result = await dweb.cloudfs.listProviders()
			if (result?.ok && Array.isArray(result.providers)) {
				backendProviders.value = result.providers
			}
		}
	} catch (_e) {
		// ignore, use static fallback
	}
})
</script>

<style scoped>
.cs-provider-selector {
	width: 100%;
}

.cs-providers-grid {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 10px;
}

.cs-provider-card {
	position: relative;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 8px;
	padding: 18px 10px 16px;
	background: color-mix(in srgb, var(--pl-fg) 1.5%, transparent);
	border: 1px solid color-mix(in srgb, var(--pl-accent) 15%, transparent);
	cursor: pointer;
	transition: all 220ms ease;
	font-family: inherit;
	text-align: center;
	overflow: hidden;
	animation: cs-card-in 300ms ease-out backwards;
}

.cs-provider-card:nth-child(1) { animation-delay: 50ms; }
.cs-provider-card:nth-child(2) { animation-delay: 100ms; }
.cs-provider-card:nth-child(3) { animation-delay: 150ms; }
.cs-provider-card:nth-child(4) { animation-delay: 200ms; }

@keyframes cs-card-in {
	from { opacity: 0; transform: translateY(6px); }
	to { opacity: 1; transform: translateY(0); }
}

.cs-provider-card::before {
	content: "";
	position: absolute;
	top: 0;
	left: 0;
	width: 30px;
	height: 2px;
	background: linear-gradient(90deg, var(--pl-accent), transparent);
	box-shadow: 0 0 8px color-mix(in srgb, var(--pl-accent) 30%, transparent);
	opacity: 0;
	transition: opacity 200ms ease;
}

.cs-provider-card::after {
	content: "";
	position: absolute;
	bottom: 0;
	right: 0;
	width: 30px;
	height: 1px;
	background: linear-gradient(270deg, color-mix(in srgb, var(--pl-accent) 30%, transparent), transparent);
	opacity: 0;
	transition: opacity 200ms ease;
}

.cs-provider-card:not(.disabled):hover {
	border-color: color-mix(in srgb, var(--pl-accent) 45%, transparent);
	background: color-mix(in srgb, var(--pl-accent) 5%, transparent);
	box-shadow: 0 0 16px color-mix(in srgb, var(--pl-accent) 10%, transparent);
	transform: translateY(-2px);
}

.cs-provider-card:not(.disabled):hover::before,
.cs-provider-card:not(.disabled):hover::after {
	opacity: 1;
}

.cs-provider-card.active {
	border-color: var(--pl-accent);
	background: color-mix(in srgb, var(--pl-accent) 10%, transparent);
	box-shadow: 0 0 20px color-mix(in srgb, var(--pl-accent) 20%, transparent),
		inset 0 0 20px color-mix(in srgb, var(--pl-accent) 5%, transparent);
}

.cs-provider-card.active::before,
.cs-provider-card.active::after {
	opacity: 1;
}

.cs-provider-card.disabled {
	opacity: 0.45;
	cursor: not-allowed;
	filter: grayscale(0.6);
}

.cs-pc-corners {
	position: absolute;
	inset: 0;
	pointer-events: none;
}

.cs-pcc {
	position: absolute;
	width: 0;
	height: 0;
	border-color: var(--pl-accent);
	transition: width 180ms ease, height 180ms ease;
}

.cs-provider-card.active .cs-pcc,
.cs-provider-card:not(.disabled):hover .cs-pcc {
	width: 7px;
	height: 7px;
}

.cs-pcc.tl {
	top: 2px;
	left: 2px;
	border-top: 1px solid currentColor;
	border-left: 1px solid currentColor;
	color: var(--pl-accent);
}

.cs-pcc.tr {
	top: 2px;
	right: 2px;
	border-top: 1px solid currentColor;
	border-right: 1px solid currentColor;
	color: var(--pl-accent);
}

.cs-pcc.bl {
	bottom: 2px;
	left: 2px;
	border-bottom: 1px solid currentColor;
	border-left: 1px solid currentColor;
	color: var(--pl-accent);
}

.cs-pcc.br {
	bottom: 2px;
	right: 2px;
	border-bottom: 1px solid currentColor;
	border-right: 1px solid currentColor;
	color: var(--pl-accent);
}

.cs-pc-check {
	position: absolute;
	top: 6px;
	right: 6px;
	width: 20px;
	height: 20px;
	display: flex;
	align-items: center;
	justify-content: center;
	background: var(--pl-accent);
	color: #fff;
	box-shadow: 0 0 10px color-mix(in srgb, var(--pl-accent) 50%, transparent);
	animation: cs-check-in 200ms ease-out;
}

@keyframes cs-check-in {
	from { opacity: 0; transform: scale(0.5); }
	to { opacity: 1; transform: scale(1); }
}

.cs-pc-badge {
	position: absolute;
	top: 8px;
	right: 8px;
	padding: 2px 6px;
	font-size: 8px;
	font-family: 'JetBrains Mono', ui-monospace, monospace;
	color: var(--pl-fg-soft);
	background: color-mix(in srgb, var(--pl-fg) 10%, transparent);
	border: 1px solid color-mix(in srgb, var(--pl-fg) 15%, transparent);
	letter-spacing: 0.5px;
	text-transform: uppercase;
}

.cs-pc-icon-box {
	position: relative;
	width: 40px;
	height: 40px;
	display: flex;
	align-items: center;
	justify-content: center;
	margin-bottom: 2px;
}

.cs-pc-icon-box::before {
	content: "";
	position: absolute;
	inset: 0;
	border: 1px solid color-mix(in srgb, var(--pl-accent) 30%, transparent);
	background: color-mix(in srgb, var(--pl-accent) 6%, transparent);
	transition: all 200ms ease;
}

.cs-provider-card.active .cs-pc-icon-box::before,
.cs-provider-card:not(.disabled):hover .cs-pc-icon-box::before {
	border-color: color-mix(in srgb, var(--pl-accent) 55%, transparent);
	background: color-mix(in srgb, var(--pl-accent) 12%, transparent);
	box-shadow: inset 0 0 12px color-mix(in srgb, var(--pl-accent) 8%, transparent);
}

.cs-pc-icon {
	width: 22px;
	height: 22px;
	color: var(--pl-accent);
	filter: drop-shadow(0 0 6px color-mix(in srgb, var(--pl-accent) 40%, transparent));
	position: relative;
	z-index: 1;
}

.cs-pc-name {
	font-size: 12px;
	font-weight: 600;
	color: var(--pl-fg);
	letter-spacing: 0.5px;
}

.cs-provider-card.active .cs-pc-name {
	color: var(--pl-accent);
	text-shadow: 0 0 8px color-mix(in srgb, var(--pl-accent) 40%, transparent);
}

.cs-pc-desc {
	font-size: 9px;
	color: var(--pl-fg-soft);
	letter-spacing: 0.2px;
	line-height: 1.4;
	opacity: 0.8;
}
</style>
