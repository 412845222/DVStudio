<template>
	<Teleport to="body">
		<div class="scifi-toast-container" aria-live="polite">
			<TransitionGroup name="scifi-toast" tag="div" class="scifi-toast-stack">
				<div
					v-for="toast in toasts"
					:key="toast.id"
					class="scifi-toast"
					:class="[`scifi-toast--${toast.tone || 'info'}`, { 'scifi-toast--persistent': toast.persistent }]"
					@mouseenter="onHover(true)"
					@mouseleave="onHover(false)"
				>
					<div class="scifi-toast-border">
						<span class="scifi-toast-corner scifi-toast-corner-tl"></span>
						<span class="scifi-toast-corner scifi-toast-corner-tr"></span>
						<span class="scifi-toast-corner scifi-toast-corner-bl"></span>
						<span class="scifi-toast-corner scifi-toast-corner-br"></span>
					</div>
					<div class="scifi-toast-glow"></div>
					<div class="scifi-toast-scanline"></div>
					
					<div class="scifi-toast-icon">
						<svg v-if="toast.tone === 'success'" viewBox="0 0 16 16" width="16" height="16">
							<path d="M3 8l3.5 3.5L13 5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
						</svg>
						<svg v-else-if="toast.tone === 'error'" viewBox="0 0 16 16" width="16" height="16">
							<path d="M8 2L2 14h12L8 2zm0 3l4.5 8h-9L8 5zm-0.5 3v3h1V8h-1zm0 4v1h1v-1h-1z" fill="currentColor"/>
						</svg>
						<svg v-else-if="toast.tone === 'warn'" viewBox="0 0 16 16" width="16" height="16">
							<path d="M8 2L2 14h12L8 2zm0 3l4.5 8h-9L8 5zm-0.5 3v3h1V8h-1zm0 4v1h1v-1h-1z" fill="currentColor"/>
						</svg>
						<svg v-else viewBox="0 0 16 16" width="16" height="16">
							<circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
							<path d="M8 5v4M8 11v1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
						</svg>
					</div>
					
					<div class="scifi-toast-content">
						<div class="scifi-toast-message">{{ toast.message }}</div>
						<div v-if="toast.actions && toast.actions.length > 0" class="scifi-toast-actions">
							<button
								v-for="(action, idx) in toast.actions"
								:key="idx"
								class="scifi-toast-action-btn"
								@click="handleAction(toast, action)"
							>
								{{ action.label }}
							</button>
						</div>
					</div>
					
					<button v-if="!toast.persistent || toast.showClose" class="scifi-toast-close" @click="removeToast(toast.id)" aria-label="Close">
						<svg viewBox="0 0 16 16" width="12" height="12">
							<path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
						</svg>
					</button>
					
					<div v-if="!toast.persistent" class="scifi-toast-progress">
						<div class="scifi-toast-progress-fill" :style="{ animationDuration: `${toast.duration || 2600}ms`, animationPlayState: isHovering ? 'paused' : 'running' }"></div>
					</div>
				</div>
			</TransitionGroup>
		</div>
		
		<Teleport to="body">
			<Transition name="scifi-modal">
				<div v-if="activeModal" class="scifi-modal-mask" @click.self="handleModalCancel">
					<div class="scifi-modal">
						<div class="scifi-modal-border">
							<span class="scifi-modal-corner scifi-modal-corner-tl"></span>
							<span class="scifi-modal-corner scifi-modal-corner-tr"></span>
							<span class="scifi-modal-corner scifi-modal-corner-bl"></span>
							<span class="scifi-modal-corner scifi-modal-corner-br"></span>
						</div>
						<div class="scifi-modal-glow"></div>
						<div class="scifi-modal-scanline"></div>
						
						<div class="scifi-modal-icon" :class="[`scifi-modal-icon--${activeModal.tone || 'info'}`]">
							<svg v-if="activeModal.tone === 'success'" viewBox="0 0 24 24" width="28" height="28">
								<path d="M5 12l5 5L20 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
							</svg>
							<svg v-else-if="activeModal.tone === 'error'" viewBox="0 0 24 24" width="28" height="28">
								<circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/>
								<path d="M12 7v6M12 16v1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
							</svg>
							<svg v-else-if="activeModal.tone === 'warn'" viewBox="0 0 24 24" width="28" height="28">
								<path d="M12 3L2 21h20L12 3zm0 4l7 13H5l7-13zm-1 5v4h2v-4h-2zm0 6v1h2v-1h-2z" fill="currentColor"/>
							</svg>
							<svg v-else viewBox="0 0 24 24" width="28" height="28">
								<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/>
								<path d="M12 8v5M12 16v1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
							</svg>
						</div>
						
						<h3 class="scifi-modal-title">{{ activeModal.title }}</h3>
						<p v-if="activeModal.message" class="scifi-modal-message">{{ activeModal.message }}</p>
						
						<div class="scifi-modal-buttons">
							<button
								v-if="activeModal.showCancel !== false"
								class="scifi-modal-btn scifi-modal-btn--cancel"
								@click="handleModalCancel"
							>
								{{ activeModal.cancelText || 'Cancel' }}
							</button>
							<button
								class="scifi-modal-btn scifi-modal-btn--confirm"
								:class="[`scifi-modal-btn--${activeModal.tone || 'info'}`]"
								@click="handleModalConfirm"
							>
								{{ activeModal.confirmText || 'Confirm' }}
							</button>
						</div>
					</div>
				</div>
			</Transition>
		</Teleport>
	</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useGlobalFeedback } from './useGlobalFeedback'

const {
	toasts,
	activeModal,
	isHovering,
	removeToast,
	handleAction: handleToastAction,
	confirmModal,
	cancelModal,
	setToastHovering,
} = useGlobalFeedback()

function onHover(hovering: boolean) {
	setToastHovering(hovering)
}

function handleAction(toast: (typeof toasts.value)[number], action: { label: string; onClick?: () => void }) {
	handleToastAction(toast.id, action)
}

function handleModalConfirm() {
	confirmModal()
}

function handleModalCancel() {
	cancelModal()
}
</script>

<style scoped>
/* ========== TOAST STYLES ========== */
.scifi-toast-container {
	position: fixed;
	inset: 0;
	pointer-events: none;
	z-index: 9999;
}

.scifi-toast-stack {
	position: absolute;
	right: 20px;
	bottom: 20px;
	display: flex;
	flex-direction: column-reverse;
	gap: 12px;
	max-width: min(380px, 90vw);
}

.scifi-toast {
	--sc-accent: #1f9d84;
	--sc-accent-glow: rgba(31, 157, 132, 0.4);
	--sc-bg: rgba(7, 12, 18, 0.92);
	--sc-border: rgba(31, 157, 132, 0.3);
	--sc-fg: #eaf2f5;
	--sc-fg-soft: #9aa0a6;
	position: relative;
	display: flex;
	align-items: flex-start;
	gap: 12px;
	padding: 14px 40px 14px 14px;
	background: var(--sc-bg);
	border: 1px solid var(--sc-border);
	border-radius: 2px;
	pointer-events: auto;
	overflow: hidden;
	backdrop-filter: blur(12px);
	min-width: 280px;
}

.scifi-toast--success {
	--sc-accent: #2ec27e;
	--sc-accent-glow: rgba(46, 194, 126, 0.4);
	--sc-border: rgba(46, 194, 126, 0.3);
}

.scifi-toast--error {
	--sc-accent: #e05b5b;
	--sc-accent-glow: rgba(224, 91, 91, 0.4);
	--sc-border: rgba(224, 91, 91, 0.3);
}

.scifi-toast--warn {
	--sc-accent: #e5b567;
	--sc-accent-glow: rgba(229, 181, 103, 0.4);
	--sc-border: rgba(229, 181, 103, 0.3);
}

.scifi-toast-border {
	position: absolute;
	inset: 0;
	pointer-events: none;
}

.scifi-toast-corner {
	position: absolute;
	width: 8px;
	height: 8px;
	border-color: var(--sc-accent);
	border-style: solid;
	border-width: 0;
	opacity: 0.8;
}
.scifi-toast-corner-tl { top: 3px; left: 3px; border-top-width: 1.5px; border-left-width: 1.5px; }
.scifi-toast-corner-tr { top: 3px; right: 3px; border-top-width: 1.5px; border-right-width: 1.5px; }
.scifi-toast-corner-bl { bottom: 3px; left: 3px; border-bottom-width: 1.5px; border-left-width: 1.5px; }
.scifi-toast-corner-br { bottom: 3px; right: 3px; border-bottom-width: 1.5px; border-right-width: 1.5px; }

.scifi-toast-glow {
	position: absolute;
	inset: 0;
	background: radial-gradient(ellipse at top left, var(--sc-accent-glow), transparent 60%);
	pointer-events: none;
	opacity: 0.6;
}

.scifi-toast-scanline {
	position: absolute;
	top: 0;
	left: 0;
	right: 0;
	height: 1px;
	background: linear-gradient(90deg, transparent, var(--sc-accent), transparent);
	opacity: 0.5;
	pointer-events: none;
}

.scifi-toast-icon {
	flex-shrink: 0;
	width: 20px;
	height: 20px;
	display: flex;
	align-items: center;
	justify-content: center;
	color: var(--sc-accent);
	margin-top: 1px;
	filter: drop-shadow(0 0 6px var(--sc-accent-glow));
}

.scifi-toast-content {
	flex: 1;
	min-width: 0;
}

.scifi-toast-message {
	font-size: 13px;
	line-height: 1.5;
	color: var(--sc-fg);
	word-break: break-word;
}

.scifi-toast-actions {
	display: flex;
	gap: 8px;
	margin-top: 10px;
}

.scifi-toast-action-btn {
	padding: 5px 12px;
	font-size: 11px;
	background: color-mix(in srgb, var(--sc-accent) 15%, transparent);
	border: 1px solid var(--sc-border);
	color: var(--sc-accent);
	border-radius: 2px;
	cursor: pointer;
	font-family: inherit;
	transition: all 160ms ease;
	letter-spacing: 0.03em;
}
.scifi-toast-action-btn:hover {
	background: var(--sc-accent);
	color: #fff;
	box-shadow: 0 0 10px var(--sc-accent-glow);
}

.scifi-toast-close {
	position: absolute;
	top: 8px;
	right: 8px;
	width: 24px;
	height: 24px;
	display: flex;
	align-items: center;
	justify-content: center;
	background: transparent;
	border: none;
	color: var(--sc-fg-soft);
	cursor: pointer;
	border-radius: 2px;
	padding: 0;
	transition: all 160ms ease;
}
.scifi-toast-close:hover {
	color: var(--sc-fg);
	background: color-mix(in srgb, var(--sc-fg) 10%, transparent);
}

.scifi-toast-progress {
	position: absolute;
	bottom: 0;
	left: 0;
	right: 0;
	height: 2px;
	background: color-mix(in srgb, var(--sc-fg) 5%, transparent);
	overflow: hidden;
}

.scifi-toast-progress-fill {
	height: 100%;
	background: linear-gradient(90deg, var(--sc-accent), color-mix(in srgb, var(--sc-accent) 60%, white));
	animation: scifi-toast-progress linear forwards;
	box-shadow: 0 0 6px var(--sc-accent-glow);
}

@keyframes scifi-toast-progress {
	from { width: 100%; }
	to { width: 0%; }
}

/* TOAST TRANSITIONS */
.scifi-toast-enter-active {
	animation: scifi-toast-in 220ms cubic-bezier(0.22, 0.61, 0.36, 1);
}
.scifi-toast-leave-active {
	animation: scifi-toast-out 180ms ease-in forwards;
}
.scifi-toast-move {
	transition: transform 200ms ease;
}

@keyframes scifi-toast-in {
	from {
		opacity: 0;
		transform: translateX(40px) scale(0.95);
	}
	to {
		opacity: 1;
		transform: translateX(0) scale(1);
	}
}
@keyframes scifi-toast-out {
	from {
		opacity: 1;
		transform: translateX(0) scale(1);
	}
	to {
		opacity: 0;
		transform: translateX(40px) scale(0.9);
	}
}

/* ========== MODAL STYLES ========== */
.scifi-modal-mask {
	position: fixed;
	inset: 0;
	z-index: 10000;
	display: flex;
	align-items: center;
	justify-content: center;
	background: rgba(0, 0, 0, 0.7);
	backdrop-filter: blur(8px);
	padding: 24px;
	box-sizing: border-box;
}

.scifi-modal {
	--sc-modal-accent: #1f9d84;
	--sc-modal-accent-glow: rgba(31, 157, 132, 0.3);
	--sc-modal-bg: rgba(7, 12, 18, 0.96);
	--sc-modal-border: rgba(31, 157, 132, 0.35);
	--sc-modal-fg: #eaf2f5;
	--sc-modal-fg-soft: #9aa0a6;
	position: relative;
	width: 100%;
	max-width: 400px;
	padding: 32px 28px 24px;
	background: var(--sc-modal-bg);
	border: 1px solid var(--sc-modal-border);
	border-radius: 2px;
	text-align: center;
	backdrop-filter: blur(16px);
	box-shadow:
		0 24px 80px rgba(0, 0, 0, 0.5),
		0 0 0 1px color-mix(in srgb, var(--sc-modal-accent) 10%, transparent),
		0 0 60px var(--sc-modal-accent-glow);
}

.scifi-modal-icon--success { --sc-modal-accent: #2ec27e; --sc-modal-accent-glow: rgba(46, 194, 126, 0.3); --sc-modal-border: rgba(46, 194, 126, 0.35); }
.scifi-modal-icon--error { --sc-modal-accent: #e05b5b; --sc-modal-accent-glow: rgba(224, 91, 91, 0.3); --sc-modal-border: rgba(224, 91, 91, 0.35); }
.scifi-modal-icon--warn { --sc-modal-accent: #e5b567; --sc-modal-accent-glow: rgba(229, 181, 103, 0.3); --sc-modal-border: rgba(229, 181, 103, 0.35); }

.scifi-modal-border {
	position: absolute;
	inset: 0;
	pointer-events: none;
}

.scifi-modal-corner {
	position: absolute;
	width: 12px;
	height: 12px;
	border-color: var(--sc-modal-accent);
	border-style: solid;
	border-width: 0;
	opacity: 0.9;
}
.scifi-modal-corner-tl { top: 5px; left: 5px; border-top-width: 2px; border-left-width: 2px; }
.scifi-modal-corner-tr { top: 5px; right: 5px; border-top-width: 2px; border-right-width: 2px; }
.scifi-modal-corner-bl { bottom: 5px; left: 5px; border-bottom-width: 2px; border-left-width: 2px; }
.scifi-modal-corner-br { bottom: 5px; right: 5px; border-bottom-width: 2px; border-right-width: 2px; }

.scifi-modal-glow {
	position: absolute;
	inset: 0;
	background: radial-gradient(ellipse at top center, var(--sc-modal-accent-glow), transparent 60%);
	pointer-events: none;
	opacity: 0.5;
	border-radius: inherit;
}

.scifi-modal-scanline {
	position: absolute;
	top: 0;
	left: 0;
	right: 0;
	height: 1px;
	background: linear-gradient(90deg, transparent, var(--sc-modal-accent), transparent);
	opacity: 0.6;
	pointer-events: none;
}

.scifi-modal-icon {
	width: 56px;
	height: 56px;
	margin: 0 auto 16px;
	display: flex;
	align-items: center;
	justify-content: center;
	color: var(--sc-modal-accent);
	border: 1px solid var(--sc-modal-border);
	border-radius: 50%;
	background: color-mix(in srgb, var(--sc-modal-accent) 8%, transparent);
	filter: drop-shadow(0 0 12px var(--sc-modal-accent-glow));
}

.scifi-modal-title {
	margin: 0 0 10px;
	font-size: 17px;
	font-weight: 600;
	color: var(--sc-modal-fg);
	letter-spacing: 0.02em;
	text-shadow: 0 0 12px var(--sc-modal-accent-glow);
}

.scifi-modal-message {
	margin: 0 0 24px;
	font-size: 13px;
	line-height: 1.6;
	color: var(--sc-modal-fg-soft);
}

.scifi-modal-buttons {
	display: flex;
	gap: 10px;
	justify-content: center;
}

.scifi-modal-btn {
	padding: 9px 24px;
	font-size: 12px;
	font-family: inherit;
	border-radius: 2px;
	cursor: pointer;
	letter-spacing: 0.04em;
	transition: all 200ms ease;
	border: 1px solid var(--sc-modal-border);
	background: color-mix(in srgb, var(--sc-modal-fg) 3%, transparent);
	color: var(--sc-modal-fg);
}

.scifi-modal-btn:hover {
	background: color-mix(in srgb, var(--sc-modal-accent) 10%, transparent);
	border-color: color-mix(in srgb, var(--sc-modal-accent) 50%, transparent);
	box-shadow: 0 0 12px var(--sc-modal-accent-glow);
}

.scifi-modal-btn--confirm {
	background: color-mix(in srgb, var(--sc-modal-accent) 18%, transparent);
	border-color: color-mix(in srgb, var(--sc-modal-accent) 55%, transparent);
	color: var(--sc-modal-accent);
	font-weight: 600;
}
.scifi-modal-btn--confirm:hover {
	background: var(--sc-modal-accent);
	border-color: var(--sc-modal-accent);
	color: #fff;
	box-shadow: 0 0 18px var(--sc-modal-accent-glow);
}

.scifi-modal-btn--success { --sc-modal-accent: #2ec27e; --sc-modal-accent-glow: rgba(46, 194, 126, 0.3); }
.scifi-modal-btn--error { --sc-modal-accent: #e05b5b; --sc-modal-accent-glow: rgba(224, 91, 91, 0.3); }
.scifi-modal-btn--warn { --sc-modal-accent: #e5b567; --sc-modal-accent-glow: rgba(229, 181, 103, 0.3); }

/* MODAL TRANSITIONS */
.scifi-modal-enter-active {
	animation: scifi-modal-in 220ms cubic-bezier(0.22, 0.61, 0.36, 1);
}
.scifi-modal-leave-active {
	animation: scifi-modal-out 160ms ease-in forwards;
}
@keyframes scifi-modal-in {
	from { opacity: 0; transform: scale(0.92) translateY(10px); }
	to { opacity: 1; transform: scale(1) translateY(0); }
}
@keyframes scifi-modal-out {
	from { opacity: 1; transform: scale(1); }
	to { opacity: 0; transform: scale(0.95); }
}

/* LIGHT THEME */
[data-theme='light'] .scifi-toast {
	--sc-bg: rgba(240, 245, 248, 0.94);
	--sc-fg: #1a1d21;
	--sc-fg-soft: #5a6270;
}
[data-theme='light'] .scifi-modal {
	--sc-modal-bg: rgba(245, 248, 251, 0.96);
	--sc-modal-fg: #1a1d21;
	--sc-modal-fg-soft: #5a6270;
}
</style>
