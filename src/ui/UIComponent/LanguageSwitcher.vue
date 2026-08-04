<template>
	<div class="lang-switcher" ref="rootRef">
		<button
			class="lang-btn"
			type="button"
			:aria-label="t('titlebar.language')"
			:title="t('titlebar.language')"
			@click="toggleDropdown"
		>
			<span class="lang-code">{{ localeCodeShort }}</span>
		</button>
		<Transition name="lang-dropdown">
			<div v-if="showDropdown" class="lang-dropdown" role="menu">
				<button
					v-for="loc in availableLocales"
					:key="loc.code"
					class="lang-option"
					:class="{ active: loc.code === currentLocale }"
					type="button"
					role="menuitem"
					@click="selectLocale(loc.code)"
				>
					<span class="lang-option-flag">{{ loc.flag }}</span>
					<span class="lang-option-name">{{ loc.name }}</span>
					<span v-if="loc.code === currentLocale" class="lang-option-check">✓</span>
				</button>
			</div>
		</Transition>
	</div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from '../../i18n'
import type { LocaleCode } from '../../i18n/types'

const { t, locale, availableLocales, setLocale } = useI18n()

const currentLocale = computed(() => locale.value)
const currentMeta = computed(
	() => availableLocales.value.find((l) => l.code === locale.value) || availableLocales.value[0]
)

const localeCodeShort = computed(() => {
	const code = currentMeta.value.code
	if (code === 'zh-CN') return '中'
	return 'EN'
})

const showDropdown = ref(false)
const rootRef = ref<HTMLElement | null>(null)

function toggleDropdown() {
	showDropdown.value = !showDropdown.value
}

async function selectLocale(code: LocaleCode) {
	if (code === currentLocale.value) {
		showDropdown.value = false
		return
	}
	await setLocale(code)
	showDropdown.value = false
}

function handleClickOutside(e: MouseEvent) {
	if (!showDropdown.value) return
	if (!rootRef.value) return
	if (!rootRef.value.contains(e.target as Node)) {
		showDropdown.value = false
	}
}

onMounted(() => {
	document.addEventListener('mousedown', handleClickOutside)
})

onBeforeUnmount(() => {
	document.removeEventListener('mousedown', handleClickOutside)
})
</script>

<style scoped>
.lang-switcher {
	position: relative;
	flex-shrink: 0;
}

.lang-btn {
	appearance: none;
	-webkit-appearance: none;
	position: relative;
	height: 26px;
	min-width: 40px;
	padding: 0 10px;
	border: 1px solid var(--theme-border);
	border-radius: 13px;
	background: var(--theme-bg-tertiary);
	cursor: pointer;
	overflow: hidden;
	-webkit-app-region: no-drag;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	transition:
		border-color 160ms ease,
		background 160ms ease,
		transform 120ms ease;
}

.lang-btn:hover {
	border-color: var(--theme-accent);
	background: var(--theme-hover-bg);
}

.lang-btn:active {
	transform: scale(0.96);
}

.lang-btn:focus {
	outline: none;
	box-shadow: 0 0 0 2px
		var(--theme-accent-muted, color-mix(in srgb, var(--theme-accent) 25%, transparent));
}

.lang-code {
	font-size: 11px;
	font-weight: 600;
	line-height: 1;
	letter-spacing: 0.02em;
	color: var(--theme-text-primary);
}

.lang-dropdown {
	position: absolute;
	top: calc(100% + 6px);
	right: 0;
	min-width: 160px;
	background: var(--theme-bg-tertiary);
	backdrop-filter: blur(16px) saturate(1.4);
	-webkit-backdrop-filter: blur(16px) saturate(1.4);
	border: 1px solid var(--theme-border);
	border-radius: 8px;
	box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
	z-index: 1000;
	padding: 4px;
	-webkit-app-region: no-drag;
}

.lang-dropdown-enter-active {
	transition:
		opacity 150ms ease,
		transform 150ms ease;
}

.lang-dropdown-leave-active {
	transition: opacity 100ms ease;
}

.lang-dropdown-enter-from {
	opacity: 0;
	transform: translateY(-4px);
}

.lang-dropdown-leave-to {
	opacity: 0;
}

.lang-option {
	appearance: none;
	-webkit-appearance: none;
	width: 100%;
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 7px 10px;
	border: none;
	border-radius: 6px;
	background: transparent;
	color: var(--theme-text-primary);
	font-size: 13px;
	cursor: pointer;
	text-align: left;
	box-sizing: border-box;
	transition:
		background 120ms ease,
		color 120ms ease;
}

.lang-option:hover {
	background: var(--theme-hover-bg);
}

.lang-option.active {
	background: color-mix(in srgb, var(--theme-accent) 18%, transparent);
	color: var(--theme-accent);
}

.lang-option-flag {
	font-size: 15px;
	line-height: 1;
	flex-shrink: 0;
}

.lang-option-name {
	flex: 1;
	min-width: 0;
	white-space: nowrap;
}

.lang-option-check {
	font-size: 13px;
	font-weight: 700;
	flex-shrink: 0;
	opacity: 0.9;
}
</style>
