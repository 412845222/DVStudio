<template>
	<div class="cs-bucket-list">
		<div class="cs-bl-header">
			<div class="cs-bl-title">
				<svg viewBox="0 0 16 16" class="cs-bl-title-icon" aria-hidden="true">
					<path d="M2 4.5l1.5-2h9l1.5 2M2 4.5v8a1 1 0 001 1h10a1 1 0 001-1v-8M2 4.5h12" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
				</svg>
				{{ t('cloudStorage.buckets.title') }}
			</div>
			<button class="cs-bl-add-btn" type="button" @click="emit('add-bucket')" :title="t('cloudStorage.buckets.addBucket')">
				<span class="cs-bl-add-corners" aria-hidden="true">
					<span class="cs-bl-ac tl"></span>
					<span class="cs-bl-ac tr"></span>
					<span class="cs-bl-ac bl"></span>
					<span class="cs-bl-ac br"></span>
				</span>
				<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
					<path d="M8 3v10M3 8h10"/>
				</svg>
			</button>
		</div>

		<div v-if="loading" class="cs-bl-loading">
			<div class="cs-spinner-cs"></div>
			<span>{{ t('cloudStorage.buckets.loading') }}</span>
		</div>

		<div v-else-if="!buckets.length" class="cs-bl-empty">
			<div class="cs-bl-empty-icon">
				<svg viewBox="0 0 64 64" aria-hidden="true">
					<path d="M8 18l4-6h40l4 6M8 18v32a4 4 0 004 4h40a4 4 0 004-4V18M8 18h48" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.3"/>
					<path d="M32 30v12M26 36h12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.5"/>
				</svg>
			</div>
			<p class="cs-bl-empty-text">{{ t('cloudStorage.buckets.empty') }}</p>
			<button class="cs-btn cs-btn-primary cs-bl-empty-btn" type="button" @click="emit('add-bucket')">
				<span class="cs-btn-corners" aria-hidden="true">
					<span class="cs-btn-c tl"></span>
					<span class="cs-btn-c tr"></span>
					<span class="cs-btn-c bl"></span>
					<span class="cs-btn-c br"></span>
				</span>
				{{ t('cloudStorage.buckets.addFirstBucket') }}
			</button>
		</div>

		<div v-else class="cs-bl-items">
			<button
				v-for="b in buckets"
				:key="b.id"
				class="cs-bl-item"
				:class="{ active: b.isActive }"
				type="button"
				@click="emit('select-bucket', b)"
			>
				<span class="cs-bl-item-corners" aria-hidden="true">
					<span class="cs-blic tl"></span>
					<span class="cs-blic br"></span>
				</span>
				<span class="cs-bl-item-indicator"></span>

				<div class="cs-bl-item-main">
					<div class="cs-bl-item-name-row">
						<svg viewBox="0 0 16 16" class="cs-bl-item-bucket-icon" aria-hidden="true">
							<path d="M2 4.5l1.5-2h9l1.5 2M2 4.5v8a1 1 0 001 1h10a1 1 0 001-1v-8M2 4.5h12" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
						</svg>
						<span class="cs-bl-item-name" :title="b.bucketName">{{ b.bucketName }}</span>
					</div>
					<div class="cs-bl-item-meta">
						<span v-if="b.akMask" class="cs-bl-item-ak" :title="b.akMask">
							<svg viewBox="0 0 16 16" class="cs-bl-meta-icon" aria-hidden="true">
								<path d="M5.5 5.5a2.5 2.5 0 015 0v2h-5v-2zM4 7.5v-2a4 4 0 118 0v2h.5a1 1 0 011 1v4a1 1 0 01-1 1h-9a1 1 0 01-1-1v-4a1 1 0 011-1H4z" fill="none" stroke="currentColor" stroke-width="1.2"/>
							</svg>
							{{ b.akMask }}
						</span>
						<span v-if="b.region" class="cs-bl-item-region">
							<svg viewBox="0 0 16 16" class="cs-bl-meta-icon" aria-hidden="true">
								<path d="M8 1C5.2 1 3 3.2 3 6c0 3.5 5 9 5 9s5-5.5 5-9c0-2.8-2.2-5-5-5z" fill="none" stroke="currentColor" stroke-width="1.2"/>
								<circle cx="8" cy="6" r="1.5" fill="currentColor"/>
							</svg>
							{{ b.region }}
						</span>
					</div>
				</div>

				<div class="cs-bl-item-status">
					<span class="cs-bl-acl-badge" :class="b.is_public ? 'public' : 'private'">
						<svg v-if="b.is_public" viewBox="0 0 16 16" class="cs-bl-acl-icon" aria-hidden="true">
							<circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.2"/>
							<path d="M8 5v3l2 1" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
						</svg>
						<svg v-else viewBox="0 0 16 16" class="cs-bl-acl-icon" aria-hidden="true">
							<rect x="3" y="7" width="10" height="7" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/>
							<path d="M5 7V5a3 3 0 016 0v2" fill="none" stroke="currentColor" stroke-width="1.2"/>
						</svg>
						{{ b.is_public ? t('cloudStorage.buckets.public') : t('cloudStorage.buckets.private') }}
					</span>
				</div>

				<div class="cs-bl-item-actions">
					<button
						v-if="!b.is_public"
						class="cs-bl-action-btn fix"
						type="button"
						@click.stop="emit('fix-acl', b)"
						:title="t('cloudStorage.buckets.fixAcl')"
					>
						<svg viewBox="0 0 16 16" aria-hidden="true">
							<path d="M13.5 4.5L11.5 2.5M5.5 12.5H3.5v-2l6-6 2 2-6 6z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
						</svg>
					</button>
					<button
						class="cs-bl-action-btn remove"
						type="button"
						@click.stop="emit('remove-bucket', b)"
						:title="t('cloudStorage.buckets.remove')"
					>
						<svg viewBox="0 0 16 16" aria-hidden="true">
							<path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
						</svg>
					</button>
				</div>
			</button>
		</div>
	</div>
</template>

<script setup lang="ts">
import { useI18n } from '../../i18n'

const { t } = useI18n()

export interface CloudBucket {
	id: number
	configId: number
	bucketName: string
	region: string
	endpoint: string
	aclStatus: string
	akMask?: string
	is_public: boolean
	isActive: boolean
	createdAt: number
	updatedAt: number
}

defineProps<{
	buckets: CloudBucket[]
	loading?: boolean
}>()

const emit = defineEmits<{
	(e: 'select-bucket', bucket: CloudBucket): void
	(e: 'add-bucket'): void
	(e: 'remove-bucket', bucket: CloudBucket): void
	(e: 'fix-acl', bucket: CloudBucket): void
}>()
</script>

<style scoped>
.cs-bucket-list {
	display: flex;
	flex-direction: column;
	height: 100%;
	min-height: 0;
	color: var(--pl-fg);
}

.cs-bl-header {
	flex-shrink: 0;
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 14px 16px 12px;
	border-bottom: 1px solid color-mix(in srgb, var(--pl-accent) 20%, transparent);
	background: linear-gradient(180deg, color-mix(in srgb, var(--pl-accent) 6%, transparent), transparent);
	gap: 10px;
}

.cs-bl-title {
	display: flex;
	align-items: center;
	gap: 8px;
	font-size: 11px;
	font-weight: 600;
	letter-spacing: 1.5px;
	text-transform: uppercase;
	color: var(--pl-accent);
	font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.cs-bl-title-icon {
	width: 14px;
	height: 14px;
	opacity: 0.9;
	filter: drop-shadow(0 0 6px color-mix(in srgb, var(--pl-accent) 40%, transparent));
}

.cs-bl-add-btn {
	width: 28px;
	height: 28px;
	display: flex;
	align-items: center;
	justify-content: center;
	background: transparent;
	border: 1px solid color-mix(in srgb, var(--pl-accent) 30%, transparent);
	color: var(--pl-accent);
	cursor: pointer;
	transition: all 200ms ease;
	position: relative;
	flex-shrink: 0;
}

.cs-bl-add-btn:hover {
	background: color-mix(in srgb, var(--pl-accent) 12%, transparent);
	border-color: var(--pl-accent);
	box-shadow: 0 0 12px color-mix(in srgb, var(--pl-accent) 25%, transparent);
}

.cs-bl-add-corners {
	position: absolute;
	inset: 0;
	pointer-events: none;
}

.cs-bl-ac {
	position: absolute;
	width: 5px;
	height: 5px;
	border-color: var(--pl-accent);
	opacity: 0;
	transition: opacity 200ms ease;
}

.cs-bl-add-btn:hover .cs-bl-ac {
	opacity: 1;
}

.cs-bl-ac.tl {
	top: 1px; left: 1px;
	border-top: 1px solid currentColor;
	border-left: 1px solid currentColor;
}
.cs-bl-ac.tr {
	top: 1px; right: 1px;
	border-top: 1px solid currentColor;
	border-right: 1px solid currentColor;
}
.cs-bl-ac.bl {
	bottom: 1px; left: 1px;
	border-bottom: 1px solid currentColor;
	border-left: 1px solid currentColor;
}
.cs-bl-ac.br {
	bottom: 1px; right: 1px;
	border-bottom: 1px solid currentColor;
	border-right: 1px solid currentColor;
}

.cs-bl-loading {
	flex: 1;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 12px;
	color: var(--pl-fg-soft);
	font-size: 12px;
}

.cs-spinner-cs {
	width: 20px;
	height: 20px;
	border: 2px solid color-mix(in srgb, var(--pl-accent) 20%, transparent);
	border-top-color: var(--pl-accent);
	border-radius: 50%;
	animation: cs-spin 0.7s linear infinite;
}

@keyframes cs-spin {
	to { transform: rotate(360deg); }
}

.cs-bl-empty {
	flex: 1;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	padding: 32px 20px;
	gap: 16px;
}

.cs-bl-empty-icon {
	width: 64px;
	height: 64px;
	color: color-mix(in srgb, var(--pl-fg-soft) 40%, transparent);
}

.cs-bl-empty-icon svg {
	width: 100%;
	height: 100%;
}

.cs-bl-empty-text {
	font-size: 12px;
	color: var(--pl-fg-soft);
	text-align: center;
	margin: 0;
	line-height: 1.6;
}

.cs-bl-empty-btn {
	padding: 0 20px;
}

.cs-bl-items {
	flex: 1;
	min-height: 0;
	overflow-y: auto;
	padding: 8px;
	scrollbar-width: thin;
	scrollbar-color: color-mix(in srgb, var(--pl-accent) 35%, transparent) transparent;
}

.cs-bl-items::-webkit-scrollbar {
	width: 4px;
}

.cs-bl-items::-webkit-scrollbar-thumb {
	background: color-mix(in srgb, var(--pl-accent) 35%, transparent);
	border-radius: 2px;
}

.cs-bl-item {
	position: relative;
	width: 100%;
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 12px 12px 12px 16px;
	margin-bottom: 4px;
	background: color-mix(in srgb, #161d24 40%, transparent);
	border: 1px solid color-mix(in srgb, var(--pl-accent) 8%, transparent);
	cursor: pointer;
	transition: all 180ms ease;
	text-align: left;
	color: var(--pl-fg-soft);
}

.cs-bl-item:hover {
	border-color: color-mix(in srgb, var(--pl-accent) 30%, transparent);
	background: color-mix(in srgb, var(--pl-accent) 4%, transparent);
	color: var(--pl-fg);
}

.cs-bl-item.active {
	border-color: var(--pl-accent);
	background: color-mix(in srgb, var(--pl-accent) 8%, transparent);
	color: var(--pl-fg);
	box-shadow: 0 0 12px color-mix(in srgb, var(--pl-accent) 12%, transparent), inset 0 0 20px color-mix(in srgb, var(--pl-accent) 3%, transparent);
}

.cs-bl-item-corners {
	position: absolute;
	inset: 0;
	pointer-events: none;
}

.cs-blic {
	position: absolute;
	width: 0;
	height: 0;
	border-color: var(--pl-accent);
	transition: width 150ms ease, height 150ms ease;
}

.cs-bl-item.active .cs-blic,
.cs-bl-item:hover .cs-blic {
	width: 6px;
	height: 6px;
}

.cs-blic.tl {
	top: 1px; left: 1px;
	border-top: 1px solid currentColor;
	border-left: 1px solid currentColor;
}
.cs-blic.br {
	bottom: 1px; right: 1px;
	border-bottom: 1px solid currentColor;
	border-right: 1px solid currentColor;
}

.cs-bl-item-indicator {
	position: absolute;
	left: 6px;
	top: 50%;
	transform: translateY(-50%);
	width: 3px;
	height: 0;
	background: var(--pl-accent);
	box-shadow: 0 0 6px var(--pl-accent);
	transition: height 200ms ease;
}

.cs-bl-item.active .cs-bl-item-indicator {
	height: 24px;
	animation: cs-indicator-pulse 1.5s ease-in-out infinite;
}

@keyframes cs-indicator-pulse {
	0%, 100% { opacity: 1; }
	50% { opacity: 0.4; }
}

.cs-bl-item-main {
	flex: 1;
	min-width: 0;
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.cs-bl-item-name-row {
	display: flex;
	align-items: center;
	gap: 7px;
}

.cs-bl-item-bucket-icon {
	width: 14px;
	height: 14px;
	opacity: 0.6;
	flex-shrink: 0;
}

.cs-bl-item.active .cs-bl-item-bucket-icon {
	opacity: 1;
	color: var(--pl-accent);
}

.cs-bl-item-name {
	font-size: 12px;
	font-weight: 500;
	font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
	letter-spacing: 0.2px;
}

.cs-bl-item-meta {
	display: flex;
	align-items: center;
	gap: 12px;
	flex-wrap: wrap;
}

.cs-bl-item-ak,
.cs-bl-item-region {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	font-size: 10px;
	color: var(--pl-fg-soft);
	opacity: 0.7;
	font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
	letter-spacing: 0.3px;
}

.cs-bl-meta-icon {
	width: 11px;
	height: 11px;
	opacity: 0.6;
}

.cs-bl-item-status {
	flex-shrink: 0;
}

.cs-bl-acl-badge {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	padding: 3px 8px;
	font-size: 10px;
	font-weight: 500;
	letter-spacing: 0.5px;
	text-transform: uppercase;
	border: 1px solid transparent;
}

.cs-bl-acl-badge.public {
	color: #4ade80;
	border-color: color-mix(in srgb, #4ade80 25%, transparent);
	background: color-mix(in srgb, #4ade80 8%, transparent);
}

.cs-bl-acl-badge.private {
	color: #fbbf24;
	border-color: color-mix(in srgb, #fbbf24 25%, transparent);
	background: color-mix(in srgb, #fbbf24 8%, transparent);
}

.cs-bl-acl-icon {
	width: 11px;
	height: 11px;
}

.cs-bl-item-actions {
	flex-shrink: 0;
	display: flex;
	align-items: center;
	gap: 2px;
	opacity: 0;
	transition: opacity 150ms ease;
}

.cs-bl-item:hover .cs-bl-item-actions,
.cs-bl-item.active .cs-bl-item-actions {
	opacity: 1;
}

.cs-bl-action-btn {
	width: 26px;
	height: 26px;
	display: flex;
	align-items: center;
	justify-content: center;
	background: transparent;
	border: 1px solid transparent;
	color: var(--pl-fg-soft);
	cursor: pointer;
	transition: all 150ms ease;
	padding: 0;
}

.cs-bl-action-btn svg {
	width: 13px;
	height: 13px;
}

.cs-bl-action-btn.fix:hover {
	color: #4ade80;
	border-color: color-mix(in srgb, #4ade80 40%, transparent);
	background: color-mix(in srgb, #4ade80 8%, transparent);
}

.cs-bl-action-btn.remove:hover {
	color: #f87171;
	border-color: color-mix(in srgb, #f87171 40%, transparent);
	background: color-mix(in srgb, #f87171 8%, transparent);
}
</style>
