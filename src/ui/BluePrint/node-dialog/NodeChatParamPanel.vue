<template>
	<div class="bp-node-chat-param-panel" :class="{ 'is-collapsed': collapsed }">
		<div class="bp-node-chat-param-header" @click="toggleCollapse">
			<span class="bp-node-chat-param-title">{{ t('aichat.nodeChatParams.title') }}</span>
			<span class="bp-node-chat-param-toggle">
				<svg
					class="bp-node-chat-chevron"
					:class="{ 'is-collapsed': collapsed }"
					width="14"
					height="14"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
				>
					<polyline points="6 9 12 15 18 9" />
				</svg>
			</span>
		</div>
		<div v-show="!collapsed" class="bp-node-chat-param-body">
			<template v-if="nodeType === 'text'">
				<div class="bp-node-chat-param-row">
					<span class="bp-node-chat-param-label">{{ t('aichat.nodeChatParams.modelApi') }}</span>
					<div class="bp-node-chat-param-options">
						<button
							v-for="opt in textModelOptions"
							:key="opt.value"
							type="button"
							class="bp-node-chat-param-btn"
							:class="{ 'is-active': params.model === opt.value }"
							:disabled="disabled"
							@click="updateParam('model', opt.value)"
						>
							{{ translateOpt(opt) }}
						</button>
					</div>
				</div>
				<div v-if="params.model === 'gemini'" class="bp-node-chat-param-row">
					<span class="bp-node-chat-param-label">{{ t('aichat.nodeChatParams.model') }}</span>
					<div class="bp-node-chat-param-options">
						<button
							v-for="opt in geminiTextModelVersionOptions"
							:key="opt.value"
							type="button"
							class="bp-node-chat-param-btn"
							:class="{ 'is-active': params.geminiTextModelVersion === opt.value }"
							:disabled="disabled"
							@click="updateParam('geminiTextModelVersion', opt.value)"
						>
							{{ translateOpt(opt) }}
						</button>
					</div>
				</div>
				<div v-if="params.model === 'bytedance'" class="bp-node-chat-param-row">
					<span class="bp-node-chat-param-label">{{ t('aichat.nodeChatParams.seedVersion') }}</span>
					<div class="bp-node-chat-param-options">
						<button
							v-for="opt in seedModelVersionOptions"
							:key="opt.value"
							type="button"
							class="bp-node-chat-param-btn"
							:class="{ 'is-active': params.textModelVersion === opt.value }"
							:disabled="disabled"
							@click="updateParam('textModelVersion', opt.value)"
						>
							{{ translateOpt(opt) }}
						</button>
					</div>
				</div>
				<div class="bp-node-chat-param-row">
					<span class="bp-node-chat-param-label">{{ t('aichat.nodeChatParams.speed') }}</span>
					<div class="bp-node-chat-param-options">
						<button
							v-for="opt in textSpeedOptions"
							:key="opt.value"
							type="button"
							class="bp-node-chat-param-btn"
							:class="{ 'is-active': params.speed === opt.value }"
							:disabled="disabled"
							@click="updateParam('speed', opt.value)"
						>
							{{ translateOpt(opt) }}
						</button>
					</div>
				</div>
				<div v-if="params.model === 'bytedance'" class="bp-node-chat-param-row">
					<span class="bp-node-chat-param-label">{{ t('aichat.nodeChatParams.deepThinking') }}</span>
					<div class="bp-node-chat-param-options">
						<button
							v-for="opt in textThinkingOptions"
							:key="opt.value"
							type="button"
							class="bp-node-chat-param-btn"
							:class="{ 'is-active': params.thinking === opt.value }"
							:disabled="disabled"
							@click="updateParam('thinking', opt.value)"
						>
							{{ translateOpt(opt) }}
						</button>
					</div>
				</div>
				<div v-if="params.model === 'bytedance'" class="bp-node-chat-param-row">
					<span class="bp-node-chat-param-label">{{ t('aichat.nodeChatParams.outputFormat') }}</span>
					<div class="bp-node-chat-param-options">
						<button
							v-for="opt in textResponseFormatOptions"
							:key="opt.value"
							type="button"
							class="bp-node-chat-param-btn"
							:class="{ 'is-active': params.responseFormat === opt.value }"
							:disabled="disabled"
							@click="updateParam('responseFormat', opt.value)"
						>
							{{ translateOpt(opt) }}
						</button>
					</div>
				</div>
				<div v-if="params.model === 'bytedance'" class="bp-node-chat-param-row">
					<span class="bp-node-chat-param-label">{{ t('aichat.nodeChatParams.maxOutput') }}</span>
					<div class="bp-node-chat-param-options">
						<button
							v-for="opt in textMaxTokensOptions"
							:key="opt.value"
							type="button"
							class="bp-node-chat-param-btn"
							:class="{ 'is-active': params.maxTokens === opt.value }"
							:disabled="disabled"
							@click="updateParam('maxTokens', opt.value)"
						>
							{{ translateOpt(opt) }}
						</button>
					</div>
				</div>
			</template>

			<template v-else-if="nodeType === 'image'">
				<div class="bp-node-chat-param-row">
					<span class="bp-node-chat-param-label">{{ t('aichat.nodeChatParams.modelApi') }}</span>
					<div class="bp-node-chat-param-options">
						<button
							v-for="opt in imageModelOptions"
							:key="opt.value"
							type="button"
							class="bp-node-chat-param-btn"
							:class="{ 'is-active': params.model === opt.value }"
							:disabled="disabled"
							@click="updateParam('model', opt.value)"
						>
							{{ translateOpt(opt) }}
						</button>
					</div>
				</div>
				<div v-if="params.model === 'tripo3d'" class="bp-node-chat-param-row">
					<span class="bp-node-chat-param-label">{{ t('aichat.nodeChatParams.model') }}</span>
					<div class="bp-node-chat-param-options">
						<button
							v-for="opt in NODE_CHAT_TRIPO3D_IMAGE_MODEL_OPTIONS"
							:key="opt.value"
							type="button"
							class="bp-node-chat-param-btn"
							:class="{ 'is-active': params.tripo3dImageModel === opt.value }"
							:disabled="disabled"
							:title="opt.description ? t(opt.description) : undefined"
							@click="updateTripo3DParam('tripo3dImageModel', opt.value)"
						>
							{{ t(opt.label) }}
							<span v-if="opt.badge" class="bp-node-chat-param-badge">{{ t(opt.badge) }}</span>
						</button>
					</div>
				</div>
				<div v-if="params.model === 'tripo3d'" class="bp-node-chat-param-row">
					<span class="bp-node-chat-param-label">{{ t('aichat.nodeChatParams.genMode') }}</span>
					<div class="bp-node-chat-param-auto-mode">
						<span class="bp-node-chat-param-auto-mode-badge">{{ tripo3dImageDetectedModeLabel }}</span>
						<span class="bp-node-chat-param-auto-mode-hint">{{ tripo3dImageDetectedModeHint }}</span>
					</div>
				</div>
				<div v-if="params.model === 'tripo3d' && showTripo3DForceSingleImage" class="bp-node-chat-param-row">
					<span class="bp-node-chat-param-label"></span>
					<div class="bp-node-chat-param-advanced">
						<label class="bp-node-chat-param-toggle">
							<input
								type="checkbox"
								:checked="params.tripo3dImageForceSingleImage === true"
								:disabled="disabled"
								@change="updateTripo3DParam('tripo3dImageForceSingleImage', ($event.target as HTMLInputElement).checked)"
							/>
							<span>{{ t('aichat.nodeChatParams.forceSingleImage') }}</span>
						</label>
					</div>
				</div>
				<template v-if="params.model === 'tripo3d' && showTripo3DSizeOptions">
					<div class="bp-node-chat-param-row">
						<span class="bp-node-chat-param-label">{{ t('aichat.nodeChatParams.size') }}</span>
						<div class="bp-node-chat-param-options">
							<button
								v-for="opt in currentTripo3DImageSizeOptions"
								:key="opt.value"
								type="button"
								class="bp-node-chat-param-btn"
								:class="{ 'is-active': params.tripo3dImageSize === opt.value }"
								:disabled="disabled"
								:title="opt.description ? (opt.description.startsWith('aiConfig.') ? t(opt.description) : opt.description) : undefined"
								@click="updateTripo3DParam('tripo3dImageSize', opt.value)"
							>
								{{ opt.label }}
							</button>
						</div>
					</div>
					<div v-if="showTripo3DAspectRatio" class="bp-node-chat-param-row">
						<span class="bp-node-chat-param-label">{{ t('aichat.nodeChatParams.aspectRatio') }}</span>
						<div class="bp-node-chat-param-options">
							<button
								v-for="opt in NODE_CHAT_TRIPO3D_IMAGE_ASPECT_RATIO_OPTIONS"
								:key="opt.value"
								type="button"
								class="bp-node-chat-param-btn"
								:class="{ 'is-active': params.tripo3dImageAspectRatio === opt.value }"
								:disabled="disabled"
								@click="updateTripo3DParam('tripo3dImageAspectRatio', opt.value)"
							>
								{{ opt.label }}
							</button>
						</div>
					</div>
					<div class="bp-node-chat-param-row">
						<span class="bp-node-chat-param-label">{{ t('aichat.nodeChatParams.outputFormat') }}</span>
						<div class="bp-node-chat-param-options">
							<button
								v-for="opt in NODE_CHAT_TRIPO3D_IMAGE_OUTPUT_FORMAT_OPTIONS"
								:key="opt.value"
								type="button"
								class="bp-node-chat-param-btn"
								:class="{ 'is-active': params.tripo3dImageOutputFormat === opt.value }"
								:disabled="disabled"
								@click="updateTripo3DParam('tripo3dImageOutputFormat', opt.value)"
							>
								{{ opt.label }}
							</button>
						</div>
					</div>
					<div v-if="showTripo3DWatermark" class="bp-node-chat-param-row">
						<span class="bp-node-chat-param-label">{{ t('aichat.nodeChatParams.watermark') }}</span>
						<div class="bp-node-chat-param-options">
							<button
								v-for="opt in NODE_CHAT_TRIPO3D_IMAGE_WATERMARK_OPTIONS"
								:key="String(opt.value)"
								type="button"
								class="bp-node-chat-param-btn"
								:class="{ 'is-active': params.tripo3dImageWatermark === opt.value }"
								:disabled="disabled"
								@click="updateTripo3DParam('tripo3dImageWatermark', opt.value)"
							>
								{{ t(opt.label) }}
							</button>
						</div>
					</div>
					<div v-if="showTripo3DTemplate && currentTripo3DTemplateOptions.length > 0" class="bp-node-chat-param-row">
						<span class="bp-node-chat-param-label">{{ t('aichat.nodeChatParams.template') }}</span>
						<div class="bp-node-chat-param-options">
							<button
								v-for="opt in currentTripo3DTemplateOptions"
								:key="opt.value"
								type="button"
								class="bp-node-chat-param-btn"
								:class="{ 'is-active': params.tripo3dImageTemplate === opt.value }"
								:disabled="disabled"
								@click="updateTripo3DParam('tripo3dImageTemplate', opt.value)"
							>
								{{ t(opt.label) }}
							</button>
						</div>
					</div>
					<div class="bp-node-chat-param-row">
						<span class="bp-node-chat-param-label">{{ t('aichat.nodeChatParams.quantity') }}</span>
						<div class="bp-node-chat-param-options">
							<button
								v-for="n in [1, 2, 4]"
								:key="n"
								type="button"
								class="bp-node-chat-param-btn"
								:class="{ 'is-active': params.tripo3dImageNumOutputs === n }"
								:disabled="disabled"
								@click="updateTripo3DParam('tripo3dImageNumOutputs', n)"
							>
								{{ n }}x
							</button>
						</div>
					</div>
				</template>
				<div v-if="params.model === 'tripo3d' && showTripo3DStrength" class="bp-node-chat-param-row">
					<span class="bp-node-chat-param-label">{{ t('aichat.nodeChatParams.strength') }}</span>
					<div class="bp-node-chat-param-options">
						<button
							v-for="opt in NODE_CHAT_TRIPO3D_IMAGE_STRENGTH_OPTIONS"
							:key="opt.value"
							type="button"
							class="bp-node-chat-param-btn"
							:class="{ 'is-active': params.tripo3dImageStrength === opt.value }"
							:disabled="disabled"
							@click="updateTripo3DParam('tripo3dImageStrength', opt.value)"
						>
							{{ opt.label }}
						</button>
					</div>
				</div>
				<div v-if="params.model === 'tripo3d' && showTripo3DNegativePrompt" class="bp-node-chat-param-row">
					<span class="bp-node-chat-param-label">{{ t('aichat.nodeChatParams.negativePrompt') }}</span>
					<div class="bp-node-chat-param-input">
						<input
							type="text"
							:value="params.tripo3dImageNegativePrompt"
							:disabled="disabled"
							:placeholder="t('aichat.nodeChatParams.negativePromptPlaceholder')"
							@input="updateTripo3DParam('tripo3dImageNegativePrompt', ($event.target as HTMLInputElement).value)"
						/>
					</div>
				</div>
				<div v-if="params.model === 'tripo3d' && showTripo3DAdvanced" class="bp-node-chat-param-row">
					<span class="bp-node-chat-param-label">{{ t('aichat.nodeChatParams.advancedSettings') }}</span>
					<div class="bp-node-chat-param-advanced">
						<div class="bp-node-chat-param-seed">
							<label>{{ t('aichat.nodeChatParams.seed') }}</label>
							<input
								type="number"
								:value="params.tripo3dImageSeed"
								:disabled="disabled"
								:placeholder="t('aichat.nodeChatParams.seedRandom')"
								@input="
									updateTripo3DParam('tripo3dImageSeed', parseInt(($event.target as HTMLInputElement).value) || -1)
								"
							/>
						</div>
					</div>
				</div>
				<div v-if="params.model === 'gemini' || params.model === 'nanobanana'" class="bp-node-chat-param-row">
					<span class="bp-node-chat-param-label">{{ t('aichat.nodeChatParams.model') }}</span>
					<div class="bp-node-chat-param-options">
						<button
							v-for="opt in geminiImageModelVersionOptions"
							:key="opt.value"
							type="button"
							class="bp-node-chat-param-btn"
							:class="{ 'is-active': params.geminiImageModelVersion === opt.value || params.nanobananaModelVersion === opt.value }"
							:disabled="disabled"
							@click="updateParam('geminiImageModelVersion', opt.value)"
							:title="opt.description"
						>
							{{ opt.label?.includes('Banana') ? opt.label.split(' (')[0] : translateOpt(opt) }}
							<span v-if="opt.badge" class="bp-node-chat-param-badge">{{ opt.badge }}</span>
						</button>
					</div>
				</div>
				<div v-if="params.model === 'gemini' || params.model === 'nanobanana'" class="bp-node-chat-param-row">
					<span class="bp-node-chat-param-label">{{ t('aichat.nodeChatParams.resolution') }}（清晰度）</span>
					<div class="bp-node-chat-param-options">
						<button
							v-for="opt in currentGeminiImageSizeOptions"
							:key="opt.value"
							type="button"
							class="bp-node-chat-param-btn"
							:class="{ 'is-active': params.geminiImageSize === opt.value }"
							:disabled="disabled"
							:title="opt.description"
							@click="updateParam('geminiImageSize', opt.value)"
						>
							{{ opt.label }}
						</button>
					</div>
				</div>
				<div v-if="params.model === 'seedream'" class="bp-node-chat-param-row">
					<span class="bp-node-chat-param-label">{{ t('aichat.nodeChatParams.model') }}</span>
					<div class="bp-node-chat-param-options">
						<button
							v-for="opt in seedreamModelVersionOptions"
							:key="opt.value"
							type="button"
							class="bp-node-chat-param-btn"
							:class="{ 'is-active': params.seedreamModelVersion === opt.value }"
							:disabled="disabled"
							@click="updateParam('seedreamModelVersion', opt.value)"
						>
							{{ translateOpt(opt) }}
						</button>
					</div>
				</div>
				<div v-if="params.model === 'meshy'" class="bp-node-chat-param-row">
					<span class="bp-node-chat-param-label">{{ t('aichat.nodeChatParams.model') }}</span>
					<div class="bp-node-chat-param-options">
						<button
							v-for="opt in meshyImageAiModelOptions"
							:key="opt.value"
							type="button"
							class="bp-node-chat-param-btn"
							:class="{ 'is-active': params.meshyImageAiModel === opt.value }"
							:disabled="disabled"
							@click="updateParam('meshyImageAiModel', opt.value)"
						>
							{{ translateOpt(opt) }}
						</button>
					</div>
				</div>
				<div v-if="params.model === 'meshy'" class="bp-node-chat-param-row">
					<span class="bp-node-chat-param-label">{{ t('aichat.nodeChatParams.poseMode') }}</span>
					<div class="bp-node-chat-param-options">
						<button
							v-for="opt in meshyPoseModeOptions"
							:key="opt.value"
							type="button"
							class="bp-node-chat-param-btn"
							:class="{ 'is-active': params.meshyPoseMode === opt.value }"
							:disabled="disabled"
							@click="updateParam('meshyPoseMode', opt.value)"
						>
							{{ translateOpt(opt) }}
						</button>
					</div>
				</div>
				<div v-if="params.model === 'meshy'" class="bp-node-chat-param-row">
					<span class="bp-node-chat-param-label">{{ t('aichat.nodeChatParams.multiView') }}</span>
					<div class="bp-node-chat-param-options">
						<button
							type="button"
							class="bp-node-chat-param-btn"
							:class="{ 'is-active': !params.meshyGenerateMultiView }"
							:disabled="disabled"
							@click="updateParam('meshyGenerateMultiView', false)"
						>
							{{ t('aichat.nodeChatParams.off') }}
						</button>
						<button
							type="button"
							class="bp-node-chat-param-btn"
							:class="{ 'is-active': params.meshyGenerateMultiView === true }"
							:disabled="disabled"
							@click="updateParam('meshyGenerateMultiView', true)"
						>
							{{ t('aichat.nodeChatParams.on') }}
						</button>
					</div>
				</div>
				<div v-if="params.model === 'seedream'" class="bp-node-chat-param-row">
					<span class="bp-node-chat-param-label">{{ t('aichat.nodeChatParams.resolution') }}</span>
					<div class="bp-node-chat-param-options">
						<button
							v-for="opt in currentSeedreamResolutionOptions"
							:key="opt.value"
							type="button"
							class="bp-node-chat-param-btn"
							:class="{ 'is-active': params.seedreamSize === opt.value }"
							:disabled="disabled"
							@click="updateParam('seedreamSize', opt.value)"
						>
							{{ translateOpt(opt) }}
						</button>
					</div>
				</div>
				<div v-if="params.model === 'seedream'" class="bp-node-chat-param-row">
					<span class="bp-node-chat-param-label">{{ t('aichat.nodeChatParams.aspectRatio') }}</span>
					<div class="bp-node-chat-param-options">
						<button
							v-for="opt in aspectRatioOptions"
							:key="opt.value"
							type="button"
							class="bp-node-chat-param-btn"
							:class="{ 'is-active': params.seedreamAspectRatio === opt.value }"
							:disabled="disabled"
							@click="updateParam('seedreamAspectRatio', opt.value)"
						>
							{{ translateOpt(opt) }}
						</button>
					</div>
				</div>
				<div v-if="params.model === 'seedream'" class="bp-node-chat-param-row">
					<span class="bp-node-chat-param-label">{{ t('aichat.nodeChatParams.quantity') }}</span>
					<div class="bp-node-chat-param-options">
						<button
							v-for="n in seedreamQuantityOptions"
							:key="n"
							type="button"
							class="bp-node-chat-param-btn"
							:class="{ 'is-active': params.seedreamQuantity === n }"
							:disabled="disabled"
							@click="updateParam('seedreamQuantity', n)"
						>
							{{ n }}x
						</button>
					</div>
				</div>
				<div v-if="params.model === 'seedream' && showSeedreamOutputFormat" class="bp-node-chat-param-row">
					<span class="bp-node-chat-param-label">{{ t('aichat.nodeChatParams.outputFormat') }}</span>
					<div class="bp-node-chat-param-options">
						<button
							v-for="opt in currentSeedreamOutputFormatOptions"
							:key="opt.value"
							type="button"
							class="bp-node-chat-param-btn"
							:class="{ 'is-active': params.seedreamOutputFormat === opt.value }"
							:disabled="disabled"
							@click="updateParam('seedreamOutputFormat', opt.value)"
						>
							{{ translateOpt(opt) }}
						</button>
					</div>
				</div>
				<div v-if="params.model === 'seedream'" class="bp-node-chat-param-row">
					<span class="bp-node-chat-param-label">{{ t('aichat.nodeChatParams.advancedSettings') }}</span>
					<div class="bp-node-chat-param-advanced">
						<label class="bp-node-chat-param-toggle">
							<input
								type="checkbox"
								:checked="params.seedreamWatermark"
								:disabled="disabled"
								@change="updateParam('seedreamWatermark', ($event.target as HTMLInputElement).checked)"
							/>
							<span>{{ t('aichat.nodeChatParams.addWatermark') }}</span>
						</label>
						<div class="bp-node-chat-param-seed">
							<label>{{ t('aichat.nodeChatParams.seed') }}</label>
							<input
								type="number"
								:value="params.seedreamSeed"
								:disabled="disabled"
								:placeholder="t('aichat.nodeChatParams.seedRandom')"
								@input="
									updateParam('seedreamSeed', parseInt(($event.target as HTMLInputElement).value) || -1)
								"
							/>
						</div>
					</div>
				</div>
				<div v-if="params.model === 'seedream'" class="bp-node-chat-param-row">
					<span class="bp-node-chat-param-label">{{ t('aichat.nodeChatParams.negativePrompt') }}</span>
					<div class="bp-node-chat-param-input">
						<input
							type="text"
							:value="params.seedreamNegativePrompt"
							:disabled="disabled"
							:placeholder="t('aichat.nodeChatParams.negativePromptPlaceholder')"
							@input="updateParam('seedreamNegativePrompt', ($event.target as HTMLInputElement).value)"
						/>
					</div>
				</div>
				<div v-if="params.model !== 'meshy' && params.model !== 'seedream' && params.model !== 'gemini' && params.model !== 'nanobanana' && params.model !== 'tripo3d'" class="bp-node-chat-param-row">
					<span class="bp-node-chat-param-label">{{ t('aichat.nodeChatParams.size') }}</span>
					<div class="bp-node-chat-param-options">
						<button
							v-for="opt in resolutionOptions"
							:key="opt.value"
							type="button"
							class="bp-node-chat-param-btn"
							:class="{ 'is-active': params.resolution === opt.value }"
							:disabled="disabled"
							@click="updateParam('resolution', opt.value)"
						>
							{{ translateOpt(opt) }}
						</button>
					</div>
				</div>
				<div v-if="params.model === 'gemini' || params.model === 'nanobanana'" class="bp-node-chat-param-row">
					<span class="bp-node-chat-param-label">{{ t('aichat.nodeChatParams.aspectRatio') }}</span>
					<div class="bp-node-chat-param-options">
						<button
							v-for="opt in currentGeminiAspectRatioOptions"
							:key="opt.value"
							type="button"
							class="bp-node-chat-param-btn"
							:class="{ 'is-active': params.geminiAspectRatio === opt.value }"
							:disabled="disabled"
							:title="opt.labelZh"
							@click="updateParam('geminiAspectRatio', opt.value)"
						>
							{{ opt.label }}
						</button>
					</div>
				</div>
				<div v-else-if="params.model !== 'meshy' && params.model !== 'seedream' && params.model !== 'tripo3d'" class="bp-node-chat-param-row">
					<span class="bp-node-chat-param-label">{{ t('aichat.nodeChatParams.aspectRatio') }}</span>
					<div class="bp-node-chat-param-options">
						<button
							v-for="opt in currentAspectRatioOptions"
							:key="opt.value"
							type="button"
							class="bp-node-chat-param-btn"
							:class="{ 'is-active': params.aspectRatio === opt.value }"
							:disabled="disabled"
							@click="updateParam('aspectRatio', opt.value)"
						>
							{{ translateOpt(opt) }}
						</button>
					</div>
				</div>
				<div v-if="params.model === 'meshy'" class="bp-node-chat-param-row">
					<span class="bp-node-chat-param-label">{{ t('aichat.nodeChatParams.aspectRatio') }}</span>
					<div class="bp-node-chat-param-options">
						<button
							v-for="opt in currentMeshyAspectRatioOptions"
							:key="opt.value"
							type="button"
							class="bp-node-chat-param-btn"
							:class="{ 'is-active': params.meshyAspectRatio === opt.value }"
							:disabled="disabled || params.meshyGenerateMultiView"
							@click="updateParam('meshyAspectRatio', opt.value)"
						>
							{{ translateOpt(opt) }}
						</button>
						<span v-if="params.meshyGenerateMultiView" class="bp-node-chat-param-hint">
							{{ t('aichat.nodeChatParams.multiViewFixedRatio') }}
						</span>
					</div>
				</div>
				<div v-if="params.model === 'meshy'" class="bp-node-chat-param-row">
					<span class="bp-node-chat-param-label">{{ t('aichat.nodeChatParams.outputCount') }}</span>
					<div class="bp-node-chat-param-options">
						<button
							v-for="n in meshyImageOutputCountOptions"
							:key="n"
							type="button"
							class="bp-node-chat-param-btn"
							:class="{ 'is-active': params.meshyOutputImageCount === n }"
							:disabled="disabled"
							@click="updateParam('meshyOutputImageCount', n)"
						>
							{{ n }}x
						</button>
					</div>
				</div>
				<div v-if="params.model === 'gemini' || params.model === 'nanobanana'" class="bp-node-chat-param-row">
					<span class="bp-node-chat-param-label">{{ t('aichat.nodeChatParams.quantity') }}</span>
					<div class="bp-node-chat-param-options">
						<button
							v-for="n in geminiQuantityOptions"
							:key="n"
							type="button"
							class="bp-node-chat-param-btn"
							:class="{ 'is-active': params.geminiQuantity === n }"
							:disabled="disabled"
							@click="updateParam('geminiQuantity', n)"
						>
							{{ n }}x
						</button>
					</div>
				</div>
				<div v-else-if="params.model !== 'meshy' && params.model !== 'seedream' && params.model !== 'tripo3d'" class="bp-node-chat-param-row">
					<span class="bp-node-chat-param-label">{{ t('aichat.nodeChatParams.quantity') }}</span>
					<div class="bp-node-chat-param-options">
						<button
							v-for="n in currentQuantityOptions"
							:key="n"
							type="button"
							class="bp-node-chat-param-btn"
							:class="{ 'is-active': params.quantity === n }"
							:disabled="disabled"
							@click="updateParam('quantity', n)"
						>
							{{ n }}x
						</button>
					</div>
				</div>
				<div v-if="(params.model === 'gemini' || params.model === 'nanobanana') && showGeminiThinkingLevel" class="bp-node-chat-param-row">
					<span class="bp-node-chat-param-label">{{ t('aichat.nodeChatParams.thinkingLevel') }}</span>
					<div class="bp-node-chat-param-options">
						<button
							v-for="opt in currentGeminiThinkingLevelOptions"
							:key="opt.value"
							type="button"
							class="bp-node-chat-param-btn"
							:class="{ 'is-active': params.geminiThinkingLevel === opt.value }"
							:disabled="disabled"
							:title="opt.description"
							@click="updateParam('geminiThinkingLevel', opt.value)"
						>
							{{ opt.label }}
						</button>
					</div>
				</div>
				<div v-if="params.model === 'gemini' || params.model === 'nanobanana'" class="bp-node-chat-param-row">
					<span class="bp-node-chat-param-label">{{ t('aichat.nodeChatParams.negativePrompt') }}</span>
					<div class="bp-node-chat-param-input">
						<input
							type="text"
							:value="params.geminiNegativePrompt"
							:disabled="disabled"
							:placeholder="t('aichat.nodeChatParams.negativePromptPlaceholder')"
							@input="updateParam('geminiNegativePrompt', ($event.target as HTMLInputElement).value)"
						/>
					</div>
				</div>
				<div v-if="params.model === 'meshy'" class="bp-node-chat-param-row">
					<span class="bp-node-chat-param-label">{{ t('aichat.nodeChatParams.negativePrompt') }}</span>
					<div class="bp-node-chat-param-input">
						<input
							type="text"
							:value="params.meshyNegativePrompt"
							:disabled="disabled"
							:placeholder="t('aichat.nodeChatParams.negativePromptPlaceholder')"
							@input="updateParam('meshyNegativePrompt', ($event.target as HTMLInputElement).value)"
						/>
					</div>
				</div>
				<div v-if="params.model === 'meshy'" class="bp-node-chat-param-row">
					<span class="bp-node-chat-param-label">{{ t('aichat.nodeChatParams.randomSeed') }}</span>
					<div class="bp-node-chat-param-input">
						<input
							type="number"
							:value="params.meshySeed"
							:disabled="disabled"
							:placeholder="t('aichat.nodeChatParams.seedRandom')"
							@input="
								updateParam('meshySeed', parseInt(($event.target as HTMLInputElement).value) || -1)
							"
						/>
					</div>
				</div>
			</template>

			<template v-else-if="nodeType === 'video'">
				<div class="bp-node-chat-param-row">
					<span class="bp-node-chat-param-label">{{ t('aichat.nodeChatParams.modelApi') }}</span>
					<div class="bp-node-chat-param-options">
						<button
							v-for="opt in videoModelOptions"
							:key="opt.value"
							type="button"
							class="bp-node-chat-param-btn"
							:class="{ 'is-active': params.model === opt.value }"
							:disabled="disabled"
							@click="updateParam('model', opt.value)"
						>
							{{ translateOpt(opt) }}
						</button>
					</div>
				</div>
				<div v-if="params.model === 'seedance'" class="bp-node-chat-param-row">
					<span class="bp-node-chat-param-label">{{ t('aichat.nodeChatParams.model') }}</span>
					<div class="bp-node-chat-param-options">
						<button
							v-for="opt in seedanceModelVersionOptions"
							:key="opt.value"
							type="button"
							class="bp-node-chat-param-btn"
							:class="{ 'is-active': params.seedanceModelVersion === opt.value }"
							:disabled="disabled"
							@click="updateParam('seedanceModelVersion', opt.value)"
						>
							{{ translateOpt(opt) }}
						</button>
					</div>
				</div>
				<div class="bp-node-chat-param-row">
					<span class="bp-node-chat-param-label">{{ t('aichat.nodeChatParams.videoMode') }}</span>
					<div class="bp-node-chat-param-options">
						<button
							v-for="opt in videoModeOptions"
							:key="opt.value"
							type="button"
							class="bp-node-chat-param-btn"
							:class="{ 'is-active': params.mode === opt.value }"
							:disabled="disabled"
							@click="updateParam('mode', opt.value)"
						>
							{{ translateOpt(opt) }}
						</button>
					</div>
				</div>
				<div class="bp-node-chat-param-row">
					<span class="bp-node-chat-param-label">{{ t('aichat.nodeChatParams.resolution') }}</span>
					<div class="bp-node-chat-param-options">
						<button
							v-for="opt in videoResolutionOptions"
							:key="opt.value"
							type="button"
							class="bp-node-chat-param-btn"
							:class="{ 'is-active': params.resolution === opt.value }"
							:disabled="disabled"
							@click="updateParam('resolution', opt.value)"
						>
							{{ translateOpt(opt) }}
						</button>
					</div>
				</div>
				<div class="bp-node-chat-param-row">
					<span class="bp-node-chat-param-label">{{ t('aichat.nodeChatParams.aspectRatio') }}</span>
					<div class="bp-node-chat-param-options">
						<button
							v-for="opt in videoRatioOptions"
							:key="opt.value"
							type="button"
							class="bp-node-chat-param-btn"
							:class="{ 'is-active': params.ratio === opt.value }"
							:disabled="disabled"
							@click="updateParam('ratio', opt.value)"
						>
							{{ translateOpt(opt) }}
						</button>
					</div>
				</div>
				<div class="bp-node-chat-param-row">
					<span class="bp-node-chat-param-label">{{ t('aichat.nodeChatParams.duration') }}</span>
					<div class="bp-node-chat-param-options">
						<button
							v-for="opt in videoDurationOptions"
							:key="opt.value"
							type="button"
							class="bp-node-chat-param-btn"
							:class="{ 'is-active': params.duration === opt.value }"
							:disabled="disabled"
							@click="updateParam('duration', opt.value)"
						>
							{{ translateDurationOpt(opt) }}
						</button>
					</div>
				</div>
				<div class="bp-node-chat-param-row">
					<span class="bp-node-chat-param-label">{{ t('aichat.nodeChatParams.advancedSettings') }}</span>
					<div class="bp-node-chat-param-advanced">
						<label class="bp-node-chat-param-toggle">
							<input
								type="checkbox"
								:checked="params.generateAudio"
								:disabled="disabled"
								@change="updateParam('generateAudio', ($event.target as HTMLInputElement).checked)"
							/>
							<span>{{ t('aichat.nodeChatParams.generateAudio') }}</span>
						</label>
						<label class="bp-node-chat-param-toggle">
							<input
								type="checkbox"
								:checked="params.watermark"
								:disabled="disabled"
								@change="updateParam('watermark', ($event.target as HTMLInputElement).checked)"
							/>
							<span>{{ t('aichat.nodeChatParams.addWatermark') }}</span>
						</label>
						<label class="bp-node-chat-param-toggle">
							<input
								type="checkbox"
								:checked="params.cameraFixed"
								:disabled="disabled"
								@change="updateParam('cameraFixed', ($event.target as HTMLInputElement).checked)"
							/>
							<span>{{ t('aichat.nodeChatParams.fixedCamera') }}</span>
						</label>
						<label class="bp-node-chat-param-toggle">
							<input
								type="checkbox"
								:checked="params.returnLastFrame"
								:disabled="disabled"
								@change="
									updateParam('returnLastFrame', ($event.target as HTMLInputElement).checked)
								"
							/>
							<span>{{ t('aichat.nodeChatParams.returnLastFrame') }}</span>
						</label>
						<div class="bp-node-chat-param-seed">
							<label>{{ t('aichat.nodeChatParams.seed') }}</label>
							<input
								type="number"
								:value="params.seed"
								:disabled="disabled"
								:placeholder="t('aichat.nodeChatParams.seedRandom')"
								@input="
									updateParam('seed', parseInt(($event.target as HTMLInputElement).value) || -1)
								"
							/>
						</div>
					</div>
				</div>
			</template>

			<template v-else-if="nodeType === 'model3d'">
				<div class="bp-node-chat-param-row">
					<span class="bp-node-chat-param-label">{{ t('aichat.nodeChatParams.modelApi') }}</span>
					<div class="bp-node-chat-param-options">
						<button
							v-for="opt in model3dProviderOptions"
							:key="opt.value"
							type="button"
							class="bp-node-chat-param-btn"
							:class="{ 'is-active': params.provider === opt.value }"
							:disabled="disabled"
							@click="updateParam('provider', opt.value)"
						>
							{{ translateOpt(opt) }}
						</button>
					</div>
				</div>
				<template v-if="params.provider === 'meshy'">
					<div class="bp-node-chat-param-row">
						<span class="bp-node-chat-param-label">{{ t('aichat.nodeChatParams.genMode') }}</span>
						<div class="bp-node-chat-param-options">
							<button
								v-for="opt in meshyModeOptions"
								:key="opt.value"
								type="button"
								class="bp-node-chat-param-btn"
								:class="{ 'is-active': params.meshyMode === opt.value }"
								:disabled="disabled"
								@click="updateParam('meshyMode', opt.value)"
							>
								{{ translateOpt(opt) }}
							</button>
						</div>
					</div>
					<div v-if="!isMeshyPostProcessMode" class="bp-node-chat-param-row">
						<span class="bp-node-chat-param-label">{{ t('aichat.nodeChatParams.aiModel') }}</span>
						<div class="bp-node-chat-param-options">
							<button
								v-for="opt in meshyAiModelOptions"
								:key="opt.value"
								type="button"
								class="bp-node-chat-param-btn"
								:class="{ 'is-active': params.meshyAiModel === opt.value }"
								:disabled="disabled"
								@click="updateParam('meshyAiModel', opt.value)"
							>
								{{ translateOpt(opt) }}
							</button>
						</div>
					</div>
					<div v-if="!isMeshyPostProcessMode" class="bp-node-chat-param-row">
						<span class="bp-node-chat-param-label">{{ t('aichat.nodeChatParams.modelType') }}</span>
						<div class="bp-node-chat-param-options">
							<button
								v-for="opt in meshyModelTypeOptions"
								:key="opt.value"
								type="button"
								class="bp-node-chat-param-btn"
								:class="{ 'is-active': params.meshyModelType === opt.value }"
								:disabled="disabled"
								@click="updateParam('meshyModelType', opt.value)"
							>
								{{ translateOpt(opt) }}
							</button>
						</div>
					</div>
					<div v-if="showMeshyTopology" class="bp-node-chat-param-row">
						<span class="bp-node-chat-param-label">{{ t('aichat.nodeChatParams.topology') }}</span>
						<div class="bp-node-chat-param-options">
							<button
								v-for="opt in meshyTopologyOptions"
								:key="opt.value"
								type="button"
								class="bp-node-chat-param-btn"
								:class="{ 'is-active': params.meshyTopology === opt.value }"
								:disabled="disabled"
								@click="updateParam('meshyTopology', opt.value)"
							>
								{{ translateOpt(opt) }}
							</button>
						</div>
					</div>
					<div v-if="!isMeshyPostProcessMode" class="bp-node-chat-param-row">
						<span class="bp-node-chat-param-label">{{ t('aichat.nodeChatParams.symmetryMode') }}</span>
						<div class="bp-node-chat-param-options">
							<button
								v-for="opt in meshySymmetryModeOptions"
								:key="opt.value"
								type="button"
								class="bp-node-chat-param-btn"
								:class="{ 'is-active': params.meshySymmetryMode === opt.value }"
								:disabled="disabled"
								@click="updateParam('meshySymmetryMode', opt.value)"
							>
								{{ translateOpt(opt) }}
							</button>
						</div>
					</div>
					<div v-if="!isMeshyPostProcessMode || params.meshyMode === 'remesh'" class="bp-node-chat-param-row">
						<span class="bp-node-chat-param-label">{{ t('aichat.nodeChatParams.originPosition') }}</span>
						<div class="bp-node-chat-param-options">
							<button
								v-for="opt in meshyOriginAtOptions"
								:key="opt.value"
								type="button"
								class="bp-node-chat-param-btn"
								:class="{ 'is-active': params.meshyOriginAt === opt.value }"
								:disabled="disabled"
								@click="updateParam('meshyOriginAt', opt.value)"
							>
								{{ translateOpt(opt) }}
							</button>
						</div>
					</div>
					<div v-if="!isMeshyPostProcessMode" class="bp-node-chat-param-row">
						<span class="bp-node-chat-param-label">{{ t('aichat.nodeChatParams.poseMode') }}</span>
						<div class="bp-node-chat-param-options">
							<button
								v-for="opt in meshyPoseModeOptions"
								:key="opt.value"
								type="button"
								class="bp-node-chat-param-btn"
								:class="{ 'is-active': params.meshyPoseMode === opt.value }"
								:disabled="disabled"
								@click="updateParam('meshyPoseMode', opt.value)"
							>
								{{ translateOpt(opt) }}
							</button>
						</div>
					</div>
					<div v-if="params.meshyMode !== 'uv-unwrap'" class="bp-node-chat-param-row">
						<span class="bp-node-chat-param-label">{{ t('aichat.nodeChatParams.outputFormat') }}</span>
						<div class="bp-node-chat-param-options">
							<button
								v-for="opt in meshyOutputFormatOptions"
								:key="opt.value"
								type="button"
								class="bp-node-chat-param-btn"
								:class="{ 'is-active': params.meshyOutputFormat === opt.value }"
								:disabled="disabled"
								@click="updateParam('meshyOutputFormat', opt.value)"
							>
								{{ translateOpt(opt) }}
							</button>
						</div>
					</div>
					<div v-if="params.meshyMode === 'remesh'" class="bp-node-chat-param-row">
						<span class="bp-node-chat-param-label">{{ t('aichat.nodeChatParams.targetPolycount') }}</span>
						<div class="bp-node-chat-param-input">
							<input
								type="number"
								:value="params.meshyTargetPolycount"
								:disabled="disabled"
								placeholder="30000"
								min="100"
								max="300000"
								@input="
									updateParam(
										'meshyTargetPolycount',
										parseInt(($event.target as HTMLInputElement).value) || 30000
									)
								"
							/>
						</div>
					</div>
					<div v-if="params.meshyMode === 'remesh'" class="bp-node-chat-param-row">
						<span class="bp-node-chat-param-label">{{ t('aichat.nodeChatParams.decimationMode') }}</span>
						<div class="bp-node-chat-param-options">
							<button
								v-for="opt in meshyDecimationModeOptions"
								:key="opt.value"
								type="button"
								class="bp-node-chat-param-btn"
								:class="{ 'is-active': params.meshyDecimationMode === opt.value }"
								:disabled="disabled"
								@click="updateParam('meshyDecimationMode', opt.value)"
							>
								{{ translateOpt(opt) }}
							</button>
						</div>
					</div>
					<template v-if="params.meshyMode === 'retexture'">
						<div class="bp-node-chat-param-row">
							<span class="bp-node-chat-param-label">{{ t('aichat.nodeChatParams.styleMode') }}</span>
							<div class="bp-node-chat-param-options">
								<button
									type="button"
									class="bp-node-chat-param-btn"
									:class="{ 'is-active': params.meshyStyleSource === 'text' }"
									:disabled="disabled"
									@click="updateParam('meshyStyleSource', 'text')"
								>
									{{ t('aichat.nodeChatParams.textDescription') }}
								</button>
								<button
									type="button"
									class="bp-node-chat-param-btn"
									:class="{ 'is-active': params.meshyStyleSource === 'image' }"
									:disabled="disabled"
									@click="updateParam('meshyStyleSource', 'image')"
								>
									{{ t('aichat.nodeChatParams.referenceImage') }}
								</button>
							</div>
						</div>
						<div v-if="params.meshyStyleSource === 'image'" class="bp-node-chat-param-row">
							<span class="bp-node-chat-param-label">{{ t('aichat.nodeChatParams.referenceImage') }}</span>
							<div v-if="retextureConnectedImages.length > 0" class="bp-node-chat-param-thumb-list">
								<button
									v-for="img in retextureConnectedImages"
									:key="img.nodeId"
									type="button"
									class="bp-node-chat-param-thumb"
									:class="{ 'is-selected': params.meshyTextureImageNodeId === img.nodeId }"
									:disabled="disabled"
									@click="updateParam('meshyTextureImageNodeId', img.nodeId)"
								>
									<img :src="img.thumb || img.url" :alt="img.name" />
								</button>
							</div>
							<span v-else class="bp-node-chat-param-hint">{{ t('aichat.nodeChatParams.connectImageNode') }}</span>
						</div>
						<div class="bp-node-chat-param-row">
							<span class="bp-node-chat-param-label">{{ t('aichat.nodeChatParams.aiModel') }}</span>
							<div class="bp-node-chat-param-options">
								<button
									v-for="opt in meshyAiModelOptions"
									:key="opt.value"
									type="button"
									class="bp-node-chat-param-btn"
									:class="{ 'is-active': params.meshyAiModel === opt.value }"
									:disabled="disabled"
									@click="updateParam('meshyAiModel', opt.value)"
								>
									{{ translateOpt(opt) }}
								</button>
							</div>
						</div>
						<div class="bp-node-chat-param-row">
							<span class="bp-node-chat-param-label">{{ t('aichat.nodeChatParams.uvAndMesh') }}</span>
							<div class="bp-node-chat-param-advanced">
								<label class="bp-node-chat-param-toggle">
									<input
										type="checkbox"
										:checked="params.meshyEnableOriginalUv"
										:disabled="disabled"
										@change="
											updateParam('meshyEnableOriginalUv', ($event.target as HTMLInputElement).checked)
										"
									/>
									<span>{{ t('aichat.nodeChatParams.keepOriginalUV') }}</span>
								</label>
							</div>
						</div>
						<div class="bp-node-chat-param-row">
							<span class="bp-node-chat-param-label">{{ t('aichat.nodeChatParams.textureOptions') }}</span>
							<div class="bp-node-chat-param-advanced">
								<label class="bp-node-chat-param-toggle">
									<input
										type="checkbox"
										:checked="params.meshyEnablePbr"
										:disabled="disabled"
										@change="
											updateParam('meshyEnablePbr', ($event.target as HTMLInputElement).checked)
										"
									/>
									<span>{{ t('aichat.nodeChatParams.generatePbr') }}</span>
								</label>
								<label class="bp-node-chat-param-toggle">
									<input
										type="checkbox"
										:checked="params.meshyHdTexture"
										:disabled="disabled"
										@change="
											updateParam('meshyHdTexture', ($event.target as HTMLInputElement).checked)
										"
									/>
									<span>{{ t('aichat.nodeChatParams.hdBaseColor') }}</span>
								</label>
								<label class="bp-node-chat-param-toggle">
									<input
										type="checkbox"
										:checked="params.meshyRemoveLighting"
										:disabled="disabled"
										@change="
											updateParam('meshyRemoveLighting', ($event.target as HTMLInputElement).checked)
										"
									/>
									<span>{{ t('aichat.nodeChatParams.removeLighting') }}</span>
								</label>
								<label class="bp-node-chat-param-toggle">
									<input
										type="checkbox"
										:checked="params.meshyAlphaThumbnail"
										:disabled="disabled"
										@change="
											updateParam('meshyAlphaThumbnail', ($event.target as HTMLInputElement).checked)
										"
									/>
									<span>{{ t('aichat.nodeChatParams.transparentPreview') }}</span>
								</label>
							</div>
						</div>
					</template>
					<div v-if="!isMeshyPostProcessMode" class="bp-node-chat-param-row">
						<span class="bp-node-chat-param-label">{{ t('aichat.nodeChatParams.advancedSettings') }}</span>
						<div class="bp-node-chat-param-advanced">
							<label class="bp-node-chat-param-toggle">
								<input
									type="checkbox"
									:checked="params.meshyMultiView"
									:disabled="disabled"
									@change="
										updateParam('meshyMultiView', ($event.target as HTMLInputElement).checked)
									"
								/>
								<span>{{ t('aichat.nodeChatParams.multiView') }}</span>
							</label>
							<div class="bp-node-chat-param-seed">
								<label>{{ t('aichat.nodeChatParams.seed') }}</label>
								<input
									type="number"
									:value="params.meshySeed"
									:disabled="disabled"
									:placeholder="t('aichat.nodeChatParams.seedRandom')"
									@input="
										updateParam(
											'meshySeed',
											parseInt(($event.target as HTMLInputElement).value) || -1
										)
									"
								/>
							</div>
						</div>
					</div>
				</template>
				<template v-else-if="params.provider === 'tripo3d'">
					<div class="bp-node-chat-param-row">
						<span class="bp-node-chat-param-label">{{ t('aichat.nodeChatParams.detectedMode') }}</span>
						<div class="bp-node-chat-param-mode-display">
							<span class="bp-node-chat-param-mode-badge" :class="'mode-' + tripo3dDetectedMode">
								{{ t('aiConfig.tripo3dModes.' + (tripo3dDetectedMode === 'text_to_model' ? 'textToModel' : tripo3dDetectedMode === 'image_to_model' ? 'imageToModel' : 'multiviewToModel')) }}
							</span>
							<label v-if="tripo3dConnectedImages.length >= 2" class="bp-node-chat-param-toggle bp-node-chat-param-force-single">
								<input
									type="checkbox"
									:checked="params.tripo3dForceSingleImage"
									:disabled="disabled"
									@change="updateParam('tripo3dForceSingleImage', ($event.target as HTMLInputElement).checked)"
								/>
								<span>{{ t('aichat.nodeChatParams.forceSingleImage') }}</span>
							</label>
						</div>
					</div>
					<div class="bp-node-chat-param-row">
						<span class="bp-node-chat-param-label">{{ t('aichat.nodeChatParams.modelSeries') }}</span>
						<div class="bp-node-chat-param-options">
							<button
								v-for="opt in tripo3dModelSeriesOptions"
								:key="opt.value"
								type="button"
								class="bp-node-chat-param-btn bp-node-chat-param-btn-series"
								:class="{ 'is-active': tripo3dCurrentSeries === opt.value }"
								:disabled="disabled"
								@click="updateParam('tripo3dModelSeries', opt.value)"
							>
								<span class="bp-node-chat-param-btn-icon">{{ opt.icon }}</span>
								{{ t(opt.label) }}
								<span v-if="opt.badge" class="bp-node-chat-param-badge">{{ t(opt.badge) }}</span>
							</button>
						</div>
					</div>
					<div class="bp-node-chat-param-row">
						<span class="bp-node-chat-param-label">{{ t('aichat.nodeChatParams.aiModel') }}</span>
						<div class="bp-node-chat-param-options">
							<button
								v-for="opt in tripo3dCurrentVersionOptions"
								:key="opt.value"
								type="button"
								class="bp-node-chat-param-btn"
								:class="{ 'is-active': tripo3dCurrentVersion === opt.value }"
								:disabled="disabled"
								:title="opt.description ? t(opt.description) : ''"
								@click="updateParam('tripo3dModelVersion', opt.value)"
							>
								{{ opt.label }}
								<span v-if="opt.badge" class="bp-node-chat-param-badge">{{ t(opt.badge) }}</span>
							</button>
						</div>
					</div>
					<template v-if="tripo3dDetectedMode !== 'text_to_model'">
						<div class="bp-node-chat-param-row">
							<span class="bp-node-chat-param-label">
								{{ t('aichat.nodeChatParams.selectImages') }}
								<span v-if="tripo3dDetectedMode === 'multiview_to_model'" class="bp-node-chat-param-hint-inline">
									{{ t('aichat.nodeChatParams.viewProgress', { selected: tripo3dSelectedViewCount, total: tripo3dConnectedImages.length }) }}
								</span>
							</span>
							<div v-if="tripo3dConnectedImages.length > 0" class="bp-node-chat-param-image-grid">
								<div
									v-for="img in tripo3dConnectedImages"
									:key="img.nodeId"
									class="bp-node-chat-param-image-item"
								>
									<div
										class="bp-node-chat-param-thumb"
										:class="{ 'is-selected': isTripo3DImageSelected(img.nodeId) }"
										@click="selectTripo3DImage(img.nodeId)"
									>
										<img :src="img.thumb || img.url" :alt="img.name" />
										<button
											type="button"
											class="bp-node-chat-param-thumb-remove"
											:disabled="disabled"
											@click.stop="removeTripo3DImage(img.nodeId)"
										>
											×
										</button>
										<div
											v-if="tripo3dDetectedMode === 'multiview_to_model' && isTripo3DImageSelected(img.nodeId)"
											class="bp-node-chat-param-view-badge"
											:style="{ backgroundColor: tripo3dViewOptions.find(v => v.key === getTripo3DImageView(img.nodeId))?.color }"
										>
											{{ t('aiConfig.tripo3dViews.' + getTripo3DImageView(img.nodeId)) }}
										</div>
									</div>
									<template v-if="tripo3dDetectedMode === 'multiview_to_model' && !isTripo3DImageSelected(img.nodeId)">
										<div class="bp-node-chat-param-view-selector">
											<button
												v-for="view in tripo3dViewOptions"
												:key="view.key"
												type="button"
												class="bp-node-chat-param-view-btn"
												:class="{ 'is-required': view.required }"
												:disabled="disabled || tripo3dSelectedImages.some(s => s.view === view.key)"
												:style="tripo3dSelectedImages.some(s => s.view === view.key) ? {} : { '--view-color': view.color }"
												@click="selectTripo3DImage(img.nodeId, view.key)"
											>
												{{ t('aiConfig.tripo3dViews.' + view.key) }}
											</button>
										</div>
									</template>
								</div>
							</div>
							<span v-else class="bp-node-chat-param-hint">{{ t('aichat.nodeChatParams.connectImageNode') }}</span>
						</div>
					</template>
					<div class="bp-node-chat-param-row">
						<span class="bp-node-chat-param-label">
							{{ t('aichat.nodeChatParams.faceLimit') }}
							<span class="bp-node-chat-param-face-count">{{ tripo3dFaceLimitDisplay }}</span>
						</span>
						<div class="bp-node-chat-param-slider-row">
							<input
								type="range"
								class="bp-node-chat-param-slider"
								:min="tripo3dFaceLimitRange.min"
								:max="tripo3dFaceLimitRange.max"
								step="1"
								:value="localTripo3dFaceLimit"
								:disabled="disabled"
								@mousedown.stop
								@touchstart.stop
								@mousemove.stop
								@touchmove.stop
								@mouseup.stop
								@touchend.stop
								@pointerdown.stop
								@pointermove.stop
								@pointerup.stop
								@input="onTripo3dFaceLimitInput($event)"
								@change="onTripo3dFaceLimitChange($event)"
							/>
							<input
								type="number"
								class="bp-node-chat-param-number-input"
								:min="tripo3dFaceLimitRange.min"
								:max="tripo3dFaceLimitRange.max"
								step="1"
								:value="localTripo3dFaceLimit"
								:disabled="disabled"
								@mousedown.stop
								@touchstart.stop
								@input="onTripo3dFaceLimitInput($event)"
								@change="onTripo3dFaceLimitChange($event)"
							/>
						</div>
						<div class="bp-node-chat-param-options bp-node-chat-param-presets">
							<button
								v-for="preset in tripo3dAvailablePresets"
								:key="preset.value"
								type="button"
								class="bp-node-chat-param-btn bp-node-chat-param-preset-btn"
								:class="{ 'is-active': params.tripo3dFaceLimit === preset.value }"
								:disabled="disabled"
								:title="preset.description ? t(preset.description) : ''"
								@click="updateParam('tripo3dFaceLimit', preset.value)"
							>
								{{ t(preset.label) }}
							</button>
						</div>
					</div>
					<div class="bp-node-chat-param-row">
						<span class="bp-node-chat-param-label">{{ t('aichat.nodeChatParams.textureOptions') }}</span>
						<div class="bp-node-chat-param-advanced">
							<label class="bp-node-chat-param-toggle">
								<input
									type="checkbox"
									:checked="params.tripo3dTexture"
									:disabled="disabled || params.tripo3dGenerateParts"
									@change="updateParam('tripo3dTexture', ($event.target as HTMLInputElement).checked)"
								/>
								<span>{{ t('aichat.nodeChatParams.generateTexture') }}</span>
							</label>
							<label class="bp-node-chat-param-toggle">
								<input
									type="checkbox"
									:checked="params.tripo3dPbr"
									:disabled="disabled || !params.tripo3dTexture || params.tripo3dGenerateParts"
									@change="updateParam('tripo3dPbr', ($event.target as HTMLInputElement).checked)"
								/>
								<span>{{ t('aichat.nodeChatParams.generatePbr') }}</span>
							</label>
						</div>
					</div>
					<template v-if="tripo3dDetectedMode !== 'text_to_model'">
						<div class="bp-node-chat-param-row">
							<span class="bp-node-chat-param-label">{{ t('aichat.nodeChatParams.enableImageAutofix') }}</span>
							<div class="bp-node-chat-param-options">
								<button
									type="button"
									class="bp-node-chat-param-btn"
									:class="{ 'is-active': !params.tripo3dEnableImageAutofix }"
									:disabled="disabled"
									@click="updateParam('tripo3dEnableImageAutofix', false)"
								>
									{{ t('aiConfig.common.off') }}
								</button>
								<button
									type="button"
									class="bp-node-chat-param-btn"
									:class="{ 'is-active': params.tripo3dEnableImageAutofix === true }"
									:disabled="disabled"
									@click="updateParam('tripo3dEnableImageAutofix', true)"
								>
									{{ t('aiConfig.common.on') }}
								</button>
							</div>
						</div>
						<div class="bp-node-chat-param-row">
							<span class="bp-node-chat-param-label">{{ t('aichat.nodeChatParams.textureAlignment') }}</span>
							<div class="bp-node-chat-param-options">
								<button
									v-for="opt in tripo3dTextureAlignmentOptions"
									:key="opt.value"
									type="button"
									class="bp-node-chat-param-btn"
									:class="{ 'is-active': params.tripo3dTextureAlignment === opt.value }"
									:disabled="disabled"
									@click="updateParam('tripo3dTextureAlignment', opt.value)"
								>
									{{ t(opt.label) }}
								</button>
							</div>
						</div>
						<div class="bp-node-chat-param-row">
							<span class="bp-node-chat-param-label">{{ t('aichat.nodeChatParams.orientation') }}</span>
							<div class="bp-node-chat-param-options">
								<button
									v-for="opt in tripo3dOrientationOptions"
									:key="opt.value"
									type="button"
									class="bp-node-chat-param-btn"
									:class="{ 'is-active': params.tripo3dOrientation === opt.value }"
									:disabled="disabled"
									@click="updateParam('tripo3dOrientation', opt.value)"
								>
									{{ t(opt.label) }}
								</button>
							</div>
						</div>
					</template>
					<div class="bp-node-chat-param-row">
						<div class="bp-node-chat-param-advanced-header" @click="advancedCollapsed = !advancedCollapsed">
							<span class="bp-node-chat-param-label">{{ t('aichat.nodeChatParams.advancedCollapsed') }}</span>
							<svg
								class="bp-node-chat-chevron"
								:class="{ 'is-collapsed': advancedCollapsed }"
								width="12"
								height="12"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
							>
								<polyline points="6 9 12 15 18 9" />
							</svg>
						</div>
						<div v-show="!advancedCollapsed" class="bp-node-chat-param-advanced-body">
							<div class="bp-node-chat-param-subsection">
								<span class="bp-node-chat-param-subtitle">{{ t('aichat.nodeChatParams.qualitySettings') }}</span>
								<div v-if="tripo3dIsV3OrLater" class="bp-node-chat-param-row">
									<span class="bp-node-chat-param-sublabel">{{ t('aichat.nodeChatParams.geometryQuality') }}</span>
									<div class="bp-node-chat-param-options">
										<button
											v-for="opt in tripo3dGeometryQualityOptions"
											:key="opt.value"
											type="button"
											class="bp-node-chat-param-btn"
											:class="{ 'is-active': params.tripo3dGeometryQuality === opt.value }"
											:disabled="disabled"
											@click="updateParam('tripo3dGeometryQuality', opt.value)"
										>
											{{ t(opt.label) }}
										</button>
									</div>
								</div>
								<div class="bp-node-chat-param-row">
									<span class="bp-node-chat-param-sublabel">{{ t('aichat.nodeChatParams.textureQuality') }}</span>
									<div class="bp-node-chat-param-options">
										<button
											v-for="opt in tripo3dTextureQualityOptions"
											:key="opt.value"
											type="button"
											class="bp-node-chat-param-btn"
											:class="{ 'is-active': params.tripo3dTextureQuality === opt.value }"
											:disabled="disabled || !params.tripo3dTexture"
											@click="updateParam('tripo3dTextureQuality', opt.value)"
										>
											{{ t(opt.label) }}
											<span v-if="opt.badge" class="bp-node-chat-param-badge">{{ t(opt.badge) }}</span>
										</button>
									</div>
								</div>
							</div>
							<div class="bp-node-chat-param-subsection">
								<span class="bp-node-chat-param-subtitle">{{ t('aichat.nodeChatParams.topologySettings') }}</span>
								<div class="bp-node-chat-param-advanced">
									<label v-if="tripo3dSupportsAdvancedFeatures" class="bp-node-chat-param-toggle">
										<input
											type="checkbox"
											:checked="params.tripo3dQuad"
											:disabled="disabled || params.tripo3dGenerateParts || params.tripo3dSmartLowPoly"
											@change="updateParam('tripo3dQuad', ($event.target as HTMLInputElement).checked)"
										/>
										<span>{{ t('aichat.nodeChatParams.quad') }}</span>
									</label>
									<label v-if="tripo3dIsV3OrLater && !tripo3dIsPSeries" class="bp-node-chat-param-toggle">
										<input
											type="checkbox"
											:checked="params.tripo3dSmartLowPoly"
											:disabled="disabled || params.tripo3dQuad"
											@change="updateParam('tripo3dSmartLowPoly', ($event.target as HTMLInputElement).checked)"
										/>
										<span>{{ t('aichat.nodeChatParams.smartLowPoly') }}</span>
									</label>
									<label v-if="tripo3dIsV3OrLater" class="bp-node-chat-param-toggle">
										<input
											type="checkbox"
											:checked="params.tripo3dGenerateParts"
											:disabled="disabled"
											@change="updateParam('tripo3dGenerateParts', ($event.target as HTMLInputElement).checked)"
										/>
										<span>{{ t('aichat.nodeChatParams.generateParts') }}</span>
									</label>
								</div>
							</div>
							<div class="bp-node-chat-param-subsection">
								<span class="bp-node-chat-param-subtitle">{{ t('aichat.nodeChatParams.otherOptions') }}</span>
								<div class="bp-node-chat-param-advanced">
									<label v-if="tripo3dIsV3OrLater" class="bp-node-chat-param-toggle">
										<input
											type="checkbox"
											:checked="params.tripo3dAutoSize"
											:disabled="disabled"
											@change="updateParam('tripo3dAutoSize', ($event.target as HTMLInputElement).checked)"
										/>
										<span>{{ t('aichat.nodeChatParams.autoSize') }}</span>
									</label>
									<label v-if="tripo3dIsV3OrLater" class="bp-node-chat-param-toggle">
										<input
											type="checkbox"
											:checked="params.tripo3dCompress"
											:disabled="disabled"
											@change="updateParam('tripo3dCompress', ($event.target as HTMLInputElement).checked)"
										/>
										<span>{{ t('aichat.nodeChatParams.compress') }}</span>
									</label>
									<label class="bp-node-chat-param-toggle">
										<input
											type="checkbox"
											:checked="params.tripo3dExportUv"
											:disabled="disabled"
											@change="updateParam('tripo3dExportUv', ($event.target as HTMLInputElement).checked)"
										/>
										<span>{{ t('aichat.nodeChatParams.exportUv') }}</span>
									</label>
								</div>
							</div>
							<div class="bp-node-chat-param-subsection">
								<div class="bp-node-chat-param-seed-group">
									<div class="bp-node-chat-param-seed">
										<label>{{ t('aichat.nodeChatParams.modelSeed') }}</label>
										<input
											type="number"
											:value="params.tripo3dModelSeed"
											:disabled="disabled"
											:placeholder="t('aichat.nodeChatParams.seedRandom')"
											@input="
												updateParam(
													'tripo3dModelSeed',
													parseInt(($event.target as HTMLInputElement).value) || -1
												)
											"
										/>
										<button type="button" class="bp-node-chat-param-seed-random" :disabled="disabled" @click="randomizeSeed('tripo3dModelSeed')">
											🎲
										</button>
									</div>
									<div class="bp-node-chat-param-seed">
										<label>{{ t('aichat.nodeChatParams.textureSeed') }}</label>
										<input
											type="number"
											:value="params.tripo3dTextureSeed"
											:disabled="disabled || !params.tripo3dTexture"
											:placeholder="t('aichat.nodeChatParams.seedRandom')"
											@input="
												updateParam(
													'tripo3dTextureSeed',
													parseInt(($event.target as HTMLInputElement).value) || -1
												)
											"
										/>
										<button type="button" class="bp-node-chat-param-seed-random" :disabled="disabled || !params.tripo3dTexture" @click="randomizeSeed('tripo3dTextureSeed')">
											🎲
										</button>
									</div>
								</div>
							</div>
							<div class="bp-node-chat-param-subsection">
								<span class="bp-node-chat-param-sublabel">{{ t('aichat.nodeChatParams.negativePrompt') }}</span>
								<div class="bp-node-chat-param-input">
									<input
										type="text"
										:value="params.tripo3dNegativePrompt"
										:disabled="disabled"
										:placeholder="t('aichat.nodeChatParams.negativePromptPlaceholder')"
										maxlength="255"
										@input="
											updateParam(
												'tripo3dNegativePrompt',
												($event.target as HTMLInputElement).value
											)
										"
									/>
								</div>
							</div>
						</div>
					</div>
				</template>
			</template>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from '../../../i18n'
import type { WorkflowNodeChatType, WorkflowNodeChatParamRecord, WorkflowTripo3DView } from '../../../aiworkflow/types'
import type { InputParamPreviewRef } from './index'
import {
	NODE_CHAT_ASPECT_RATIO_OPTIONS,
	NODE_CHAT_RESOLUTION_OPTIONS,
	NODE_CHAT_QUANTITY_OPTIONS,
	NODE_CHAT_VIDEO_MODE_OPTIONS,
	NODE_CHAT_VIDEO_DURATION_OPTIONS,
	NODE_CHAT_VIDEO_RATIO_OPTIONS,
	NODE_CHAT_VIDEO_RESOLUTION_OPTIONS,
	NODE_CHAT_TEXT_SPEED_OPTIONS,
	NODE_CHAT_TEXT_MODEL_OPTIONS,
	NODE_CHAT_TEXT_THINKING_OPTIONS,
	NODE_CHAT_TEXT_RESPONSE_FORMAT_OPTIONS,
	NODE_CHAT_TEXT_MAX_TOKENS_OPTIONS,
	NODE_CHAT_IMAGE_MODEL_OPTIONS,
	NODE_CHAT_VIDEO_MODEL_OPTIONS,
	NODE_CHAT_MODEL3D_PROVIDER_OPTIONS,
	NODE_CHAT_SEEDREAM_MODEL_VERSION_OPTIONS,
	NODE_CHAT_SEEDREAM_QUANTITY_OPTIONS,
	NODE_CHAT_GEMINI_IMAGE_MODEL_VERSION_OPTIONS,
	NODE_CHAT_GEMINI_TEXT_MODEL_VERSION_OPTIONS,
	NODE_CHAT_NANOBANANA_MODEL_VERSION_OPTIONS,
	NODE_CHAT_SEEDANCE_MODEL_VERSION_OPTIONS,
	NODE_CHAT_SEED_MODEL_VERSION_OPTIONS,
	NODE_CHAT_MESHY_MODE_OPTIONS,
	NODE_CHAT_MESHY_AI_MODEL_OPTIONS,
	NODE_CHAT_MESHY_IMAGE_OPTIONS,
	NODE_CHAT_MESHY_IMAGE_OUTPUT_COUNT_OPTIONS,
	NODE_CHAT_MESHY_MODEL_TYPE_OPTIONS,
	NODE_CHAT_MESHY_TOPOLOGY_OPTIONS,
	NODE_CHAT_MESHY_SYMMETRY_MODE_OPTIONS,
	NODE_CHAT_MESHY_ORIGIN_AT_OPTIONS,
	NODE_CHAT_MESHY_POSE_MODE_OPTIONS,
	NODE_CHAT_MESHY_OUTPUT_FORMAT_OPTIONS,
	NODE_CHAT_MESHY_DECIMATION_MODE_OPTIONS,
	NODE_CHAT_TRIPO3D_MODEL_SERIES_OPTIONS,
	NODE_CHAT_TRIPO3D_H_MODEL_VERSION_OPTIONS,
	NODE_CHAT_TRIPO3D_P_MODEL_VERSION_OPTIONS,
	getTripo3DModelVersionOptions,
	NODE_CHAT_TRIPO3D_FACE_LIMIT_PRESETS,
	NODE_CHAT_TRIPO3D_TEXTURE_QUALITY_OPTIONS,
	NODE_CHAT_TRIPO3D_GEOMETRY_QUALITY_OPTIONS,
	NODE_CHAT_TRIPO3D_TEXTURE_ALIGNMENT_OPTIONS,
	NODE_CHAT_TRIPO3D_ORIENTATION_OPTIONS,
	NODE_CHAT_TRIPO3D_VIEW_OPTIONS,
	getTripo3DFaceLimitRange,
	isTripo3DPSeries,
	isTripo3DV3OrLater,
	normalizeTripo3DParams,
	GEMINI_QUANTITY_OPTIONS,
	getGeminiImageSizeOptions,
	getGeminiAspectRatioOptions,
	getGeminiThinkingLevelOptions,
	getDefaultGeminiImageSize,
	supportsGeminiThinkingLevel,
	getMeshyImageAspectRatioOptions,
	getSeedreamResolutionOptions,
	getSeedreamOutputFormatOptions,
	supportsSeedreamOutputFormat,
	NODE_CHAT_TRIPO3D_IMAGE_MODE_OPTIONS,
	NODE_CHAT_TRIPO3D_IMAGE_MODEL_OPTIONS,
	NODE_CHAT_TRIPO3D_IMAGE_ASPECT_RATIO_OPTIONS,
	NODE_CHAT_TRIPO3D_IMAGE_OUTPUT_FORMAT_OPTIONS,
	NODE_CHAT_TRIPO3D_IMAGE_WATERMARK_OPTIONS,
	NODE_CHAT_TRIPO3D_IMAGE_STRENGTH_OPTIONS,
	getTripo3DImageSizeOptions,
	getTripo3DImageDefaultSize,
	getTripo3DImageTemplateOptions,
	supportsTripo3DAspectRatio,
	supportsTripo3DWatermark,
	isTripo3DBananaModel
} from './nodeChatConfig'

const { t } = useI18n()

const props = defineProps<{
	nodeType: WorkflowNodeChatType
	nodeId?: string | null
	params: WorkflowNodeChatParamRecord
	disabled?: boolean
	inputParamPreviewRefs?: InputParamPreviewRef[]
}>()

const emit = defineEmits<{
	(e: 'update:params', params: WorkflowNodeChatParamRecord): void
}>()

const normalizeIfNeeded = () => {
	if (props.nodeType !== 'model3d') return
	if (props.params.provider !== 'tripo3d') return
	const normalized = normalizeTripo3DParams(props.params)
	let changed = false
	for (const key of Object.keys(normalized)) {
		if (props.params[key as keyof WorkflowNodeChatParamRecord] !== normalized[key as keyof WorkflowNodeChatParamRecord]) {
			changed = true
			break
		}
	}
	if (changed) {
		emit('update:params', normalized)
	}
}

watch(() => [props.nodeType, props.params], () => {
	normalizeIfNeeded()
}, { immediate: true, deep: false })

const collapsed = ref(false)

const toggleCollapse = () => {
	collapsed.value = !collapsed.value
}

const updateParam = <K extends keyof WorkflowNodeChatParamRecord>(key: K, value: WorkflowNodeChatParamRecord[K]) => {
	const next: WorkflowNodeChatParamRecord = { ...props.params, [key]: value }

	if (key === 'model') {
		if (value === 'gemini' || value === 'nanobanana') {
			if (props.nodeType === 'text' && !next.geminiTextModelVersion) {
				next.geminiTextModelVersion = 'gemini-3.5-flash'
			}
			if (props.nodeType === 'image') {
				const defaultModel = 'gemini-3.1-flash-image'
				if (!next.geminiImageModelVersion || !String(next.geminiImageModelVersion).startsWith('gemini-')) {
					next.geminiImageModelVersion = defaultModel
				}
				next.nanobananaModelVersion = next.geminiImageModelVersion
				const modelVer = String(next.geminiImageModelVersion)
				const allowedAspectRatios = getGeminiAspectRatioOptions(modelVer).map(o => o.value)
				if (!allowedAspectRatios.includes(String(next.geminiAspectRatio))) {
					next.geminiAspectRatio = '1:1'
				}
				const allowedSizes = getGeminiImageSizeOptions(modelVer).map(o => o.value)
				if (!allowedSizes.includes(String(next.geminiImageSize))) {
					next.geminiImageSize = getDefaultGeminiImageSize(modelVer)
				}
				if (!GEMINI_QUANTITY_OPTIONS.includes(Number(next.geminiQuantity))) {
					next.geminiQuantity = 1
				}
				if (!supportsGeminiThinkingLevel(modelVer)) {
					next.geminiThinkingLevel = 'minimal'
				}
				next.aspectRatio = next.geminiAspectRatio
				next.quantity = next.geminiQuantity
			}
		}
	}

	if (key === 'geminiImageModelVersion' && typeof value === 'string') {
		next.nanobananaModelVersion = value
		const modelVer = value
		const allowedAspectRatios = getGeminiAspectRatioOptions(modelVer).map(o => o.value)
		if (!allowedAspectRatios.includes(String(next.geminiAspectRatio))) {
			next.geminiAspectRatio = '1:1'
		}
		const allowedSizes = getGeminiImageSizeOptions(modelVer).map(o => o.value)
		if (!allowedSizes.includes(String(next.geminiImageSize))) {
			next.geminiImageSize = getDefaultGeminiImageSize(modelVer)
		}
		if (!supportsGeminiThinkingLevel(modelVer)) {
			next.geminiThinkingLevel = 'minimal'
		}
		next.aspectRatio = next.geminiAspectRatio
	}

	if (key === 'seedreamModelVersion' && typeof value === 'string') {
		const modelVer = value
		const allowedResolutions = getSeedreamResolutionOptions(modelVer).map(o => o.value)
		if (!allowedResolutions.includes(String(next.seedreamSize))) {
			next.seedreamSize = allowedResolutions[0]
		}
		if (!supportsSeedreamOutputFormat(modelVer)) {
			next.seedreamOutputFormat = 'jpeg'
		} else {
			const allowedFormats = getSeedreamOutputFormatOptions(modelVer).map(o => o.value)
			if (!allowedFormats.includes(String(next.seedreamOutputFormat))) {
				next.seedreamOutputFormat = allowedFormats[0]
			}
		}
	}

	if (key === 'meshyImageAiModel' && typeof value === 'string') {
		const allowedAspectRatios = getMeshyImageAspectRatioOptions(value).map(o => o.value)
		if (!allowedAspectRatios.includes(String(next.meshyAspectRatio))) {
			next.meshyAspectRatio = allowedAspectRatios[0] || '1:1'
		}
	}

	if (key === 'model' && value === 'seedream') {
		const ver = String(next.seedreamModelVersion || 'doubao-seedream-4-5-251128')
		const allowedResolutions = getSeedreamResolutionOptions(ver).map(o => o.value)
		if (!allowedResolutions.includes(String(next.seedreamSize))) {
			next.seedreamSize = allowedResolutions[0]
		}
		if (!supportsSeedreamOutputFormat(ver)) {
			next.seedreamOutputFormat = 'jpeg'
		}
	}

	if (key === 'model' && value === 'tripo3d') {
		if (!next.tripo3dImageMode) {
			next.tripo3dImageMode = 'text_to_image'
		}
		if (!next.tripo3dImageModel) {
			next.tripo3dImageModel = 'tripo-image-1.0'
		}
		if (!next.tripo3dImageSize) {
			next.tripo3dImageSize = '1024x1024'
		}
		if (!next.tripo3dImageNumOutputs) {
			next.tripo3dImageNumOutputs = 1
		}
		if (!next.tripo3dImageNegativePrompt) {
			next.tripo3dImageNegativePrompt = ''
		}
		if (!next.tripo3dImageStrength) {
			next.tripo3dImageStrength = 0.7
		}
		if (!next.tripo3dImageSeed) {
			next.tripo3dImageSeed = -1
		}
	}

	if (key === 'provider' && value === 'tripo3d') {
		if (!next.tripo3dModelSeries) {
			next.tripo3dModelSeries = 'h'
		}
		if (!next.tripo3dModelVersion) {
			next.tripo3dModelVersion = 'v3.1-20260211'
		}
	}

	if (key === 'tripo3dModelSeries' && typeof value === 'string') {
		const newVersionOptions = getTripo3DModelVersionOptions(value as 'h' | 'p')
		const currentVersion = String(next.tripo3dModelVersion || '')
		const validVersions = newVersionOptions.map(o => o.value)
		if (!validVersions.includes(currentVersion)) {
			next.tripo3dModelVersion = newVersionOptions[0].value
		}
	}

	if (props.nodeType === 'model3d' && next.provider === 'tripo3d') {
		const normalized = normalizeTripo3DParams(next)
		Object.assign(next, normalized)
	}

	emit('update:params', next)
}

const textSpeedOptions = NODE_CHAT_TEXT_SPEED_OPTIONS
const textModelOptions = NODE_CHAT_TEXT_MODEL_OPTIONS
const textThinkingOptions = NODE_CHAT_TEXT_THINKING_OPTIONS
const textResponseFormatOptions = NODE_CHAT_TEXT_RESPONSE_FORMAT_OPTIONS
const textMaxTokensOptions = NODE_CHAT_TEXT_MAX_TOKENS_OPTIONS
const seedModelVersionOptions = NODE_CHAT_SEED_MODEL_VERSION_OPTIONS
const imageModelOptions = NODE_CHAT_IMAGE_MODEL_OPTIONS
const videoModelOptions = NODE_CHAT_VIDEO_MODEL_OPTIONS
const model3dProviderOptions = NODE_CHAT_MODEL3D_PROVIDER_OPTIONS
const resolutionOptions = NODE_CHAT_RESOLUTION_OPTIONS
const aspectRatioOptions = NODE_CHAT_ASPECT_RATIO_OPTIONS
const quantityOptions = NODE_CHAT_QUANTITY_OPTIONS
const videoModeOptions = NODE_CHAT_VIDEO_MODE_OPTIONS
const videoDurationOptions = NODE_CHAT_VIDEO_DURATION_OPTIONS
const videoRatioOptions = NODE_CHAT_VIDEO_RATIO_OPTIONS
const videoResolutionOptions = NODE_CHAT_VIDEO_RESOLUTION_OPTIONS
const meshyModeOptions = NODE_CHAT_MESHY_MODE_OPTIONS
const meshyAiModelOptions = NODE_CHAT_MESHY_AI_MODEL_OPTIONS
const meshyModelTypeOptions = NODE_CHAT_MESHY_MODEL_TYPE_OPTIONS
const meshyTopologyOptions = NODE_CHAT_MESHY_TOPOLOGY_OPTIONS
const meshySymmetryModeOptions = NODE_CHAT_MESHY_SYMMETRY_MODE_OPTIONS
const meshyOriginAtOptions = NODE_CHAT_MESHY_ORIGIN_AT_OPTIONS
const meshyPoseModeOptions = NODE_CHAT_MESHY_POSE_MODE_OPTIONS
const meshyOutputFormatOptions = NODE_CHAT_MESHY_OUTPUT_FORMAT_OPTIONS
const meshyDecimationModeOptions = NODE_CHAT_MESHY_DECIMATION_MODE_OPTIONS
const tripo3dModelSeriesOptions = NODE_CHAT_TRIPO3D_MODEL_SERIES_OPTIONS
const tripo3dTextureQualityOptions = NODE_CHAT_TRIPO3D_TEXTURE_QUALITY_OPTIONS
const tripo3dGeometryQualityOptions = NODE_CHAT_TRIPO3D_GEOMETRY_QUALITY_OPTIONS
const tripo3dTextureAlignmentOptions = NODE_CHAT_TRIPO3D_TEXTURE_ALIGNMENT_OPTIONS
const tripo3dOrientationOptions = NODE_CHAT_TRIPO3D_ORIENTATION_OPTIONS
const tripo3dViewOptions = NODE_CHAT_TRIPO3D_VIEW_OPTIONS
const tripo3dFaceLimitPresets = NODE_CHAT_TRIPO3D_FACE_LIMIT_PRESETS
const seedreamModelVersionOptions = NODE_CHAT_SEEDREAM_MODEL_VERSION_OPTIONS
const geminiTextModelVersionOptions = NODE_CHAT_GEMINI_TEXT_MODEL_VERSION_OPTIONS
const geminiImageModelVersionOptions = NODE_CHAT_GEMINI_IMAGE_MODEL_VERSION_OPTIONS
const nanobananaModelVersionOptions = NODE_CHAT_NANOBANANA_MODEL_VERSION_OPTIONS
const meshyImageAiModelOptions = NODE_CHAT_MESHY_IMAGE_OPTIONS.aiModel
const meshyImageOutputCountOptions = NODE_CHAT_MESHY_IMAGE_OUTPUT_COUNT_OPTIONS
const seedanceModelVersionOptions = NODE_CHAT_SEEDANCE_MODEL_VERSION_OPTIONS
const geminiQuantityOptions = GEMINI_QUANTITY_OPTIONS

const advancedCollapsed = ref(true)

const tripo3dCurrentSeries = computed<'h' | 'p'>(() => {
	const series = props.params.tripo3dModelSeries
	return series === 'p' ? 'p' : 'h'
})

const tripo3dCurrentVersion = computed(() => {
	return String(props.params.tripo3dModelVersion || 'v3.1-20260211')
})

const tripo3dIsPSeries = computed(() => {
	return isTripo3DPSeries(tripo3dCurrentVersion.value)
})

const tripo3dIsV3OrLater = computed(() => {
	return isTripo3DV3OrLater(tripo3dCurrentVersion.value)
})

const tripo3dSupportsAdvancedFeatures = computed(() => {
	return tripo3dIsV3OrLater.value || tripo3dIsPSeries.value
})

const tripo3dCurrentVersionOptions = computed(() => {
	return getTripo3DModelVersionOptions(tripo3dCurrentSeries.value)
})

const tripo3dConnectedImages = computed<ConnectedImageInfo[]>(() => {
	if (props.nodeType !== 'model3d' || props.params.provider !== 'tripo3d') return []
	const refs = props.inputParamPreviewRefs ?? []
	const results: ConnectedImageInfo[] = []
	const seenNodeIds = new Set<string>()
	for (const ref of refs) {
		if (ref.kind !== 'image') continue
		const url = ref.previewUrl || ''
		const fromNodeId = ref.fromNodeId || ''
		if (!url || !fromNodeId || seenNodeIds.has(fromNodeId)) continue
		seenNodeIds.add(fromNodeId)
		results.push({
			url,
			thumb: url,
			name: ref.label || ref.name || t('aichat.nodeChatParams.imageFallback', { n: results.length + 1 }),
			nodeId: fromNodeId
		})
	}
	return results
})

const tripo3dDetectedMode = computed<'text_to_model' | 'image_to_model' | 'multiview_to_model'>(() => {
	const imageCount = tripo3dConnectedImages.value.length
	const forceSingle = props.params.tripo3dForceSingleImage === true
	if (imageCount === 0) return 'text_to_model'
	if (imageCount === 1 || forceSingle) return 'image_to_model'
	return 'multiview_to_model'
})

const tripo3dSelectedImages = computed<Array<{ nodeId: string; view: WorkflowTripo3DView; order: number }>>(() => {
	return (props.params.tripo3dSelectedImages as Array<{ nodeId: string; view: WorkflowTripo3DView; order: number }>) || []
})

const tripo3dFaceLimitRange = computed(() => {
	return getTripo3DFaceLimitRange(
		tripo3dCurrentVersion.value,
		props.params.tripo3dQuad === true,
		props.params.tripo3dSmartLowPoly === true
	)
})

const tripo3dAvailablePresets = computed(() => {
	return tripo3dFaceLimitPresets.filter(preset => {
		if (preset.hSeriesOnly && tripo3dCurrentSeries.value !== 'h') return false
		if (preset.value === 0) return true
		return preset.value <= tripo3dFaceLimitRange.value.max && preset.value >= tripo3dFaceLimitRange.value.min
	})
})

const localTripo3dFaceLimit = ref<number>(Number(props.params.tripo3dFaceLimit) || 0)

watch(() => props.params.tripo3dFaceLimit, (newVal: number | undefined) => {
	localTripo3dFaceLimit.value = Number(newVal) || 0
}, { immediate: true })

const onTripo3dFaceLimitInput = (event: Event) => {
	const input = event.target as HTMLInputElement
	const value = parseInt(input.value) || 0
	localTripo3dFaceLimit.value = value
}

const onTripo3dFaceLimitChange = (event: Event) => {
	const input = event.target as HTMLInputElement
	let value = parseInt(input.value) || 0
	const range = tripo3dFaceLimitRange.value
	if (value !== 0) {
		value = Math.min(Math.max(value, range.min), range.max)
	}
	localTripo3dFaceLimit.value = value
	updateParam('tripo3dFaceLimit', value)
}

const tripo3dFaceLimitDisplay = computed(() => {
	const faceLimit = Number(localTripo3dFaceLimit.value)
	if (!faceLimit || faceLimit === 0) return t('aichat.nodeChatParams.faceLimitFaces', { count: 0 }).replace('0 面', '自适应')
	return t('aichat.nodeChatParams.faceLimitFaces', { count: faceLimit })
})

const tripo3dSelectedViewCount = computed(() => {
	return tripo3dSelectedImages.value.length
})

const selectTripo3DImage = (nodeId: string, view?: WorkflowTripo3DView) => {
	const currentSelected = [...tripo3dSelectedImages.value]
	const existingIndex = currentSelected.findIndex(s => s.nodeId === nodeId)

	if (tripo3dDetectedMode.value === 'image_to_model') {
		if (existingIndex >= 0) {
			updateParam('tripo3dSelectedImages', [])
		} else {
			updateParam('tripo3dSelectedImages', [{ nodeId, view: 'front', order: 1 }])
		}
	} else {
		if (existingIndex >= 0) {
			currentSelected.splice(existingIndex, 1)
		} else if (view) {
			const viewExists = currentSelected.find(s => s.view === view)
			if (viewExists) return
			currentSelected.push({
				nodeId,
				view,
				order: tripo3dViewOptions.find(v => v.key === view)?.order || currentSelected.length + 1
			})
		}
		currentSelected.sort((a, b) => a.order - b.order)
		updateParam('tripo3dSelectedImages', currentSelected)
	}
}

const removeTripo3DImage = (nodeId: string) => {
	const currentSelected = tripo3dSelectedImages.value.filter(s => s.nodeId !== nodeId)
	updateParam('tripo3dSelectedImages', currentSelected)
}

const isTripo3DImageSelected = (nodeId: string) => {
	return tripo3dSelectedImages.value.some(s => s.nodeId === nodeId)
}

const getTripo3DImageView = (nodeId: string): WorkflowTripo3DView | undefined => {
	return tripo3dSelectedImages.value.find(s => s.nodeId === nodeId)?.view
}

const randomizeSeed = (seedKey: 'tripo3dModelSeed' | 'tripo3dTextureSeed') => {
	updateParam(seedKey, -1)
}

const geminiModelVersion = computed(() => {
	return typeof props.params.geminiImageModelVersion === 'string'
		? props.params.geminiImageModelVersion
		: 'gemini-3.1-flash-image'
})

const currentGeminiImageSizeOptions = computed(() => {
	return getGeminiImageSizeOptions(geminiModelVersion.value)
})

const currentGeminiAspectRatioOptions = computed(() => {
	return getGeminiAspectRatioOptions(geminiModelVersion.value)
})

const currentGeminiThinkingLevelOptions = computed(() => {
	return getGeminiThinkingLevelOptions(geminiModelVersion.value)
})

const showGeminiThinkingLevel = computed(() => {
	return supportsGeminiThinkingLevel(geminiModelVersion.value)
})

const I18N_KEY_PREFIXES = ['aiConfig.', 'aichat.', 'common.']
const isI18nKey = (label: string): boolean => I18N_KEY_PREFIXES.some(prefix => label.startsWith(prefix))

const translateOpt = (opt: { label: string; value: unknown; tokens?: number }) => {
	if (!isI18nKey(opt.label)) return opt.label
	if (opt.tokens !== undefined) {
		return t(opt.label, { n: opt.tokens })
	}
	return t(opt.label)
}

const translateDurationOpt = (opt: { label: string; value: number; isAuto?: boolean; seconds?: number }) => {
	if (!isI18nKey(opt.label)) return opt.label
	if (opt.isAuto) {
		return t(opt.label)
	}
	if (opt.seconds !== undefined) {
		return t(opt.label, { n: opt.seconds })
	}
	return t(opt.label)
}

const currentMeshyAspectRatioOptions = computed(() => {
	const modelVal =
		typeof props.params.meshyImageAiModel === 'string'
			? props.params.meshyImageAiModel
			: 'nano-banana'
	return getMeshyImageAspectRatioOptions(modelVal)
})

const isGeminiModel = computed(() => {
	return props.params.model === 'gemini' || props.params.model === 'nanobanana'
})

const currentAspectRatioOptions = computed(() => {
	return NODE_CHAT_ASPECT_RATIO_OPTIONS
})

const currentQuantityOptions = computed(() => {
	return NODE_CHAT_QUANTITY_OPTIONS
})

const seedreamVersion = computed(() => {
	return typeof props.params.seedreamModelVersion === 'string'
		? props.params.seedreamModelVersion
		: 'doubao-seedream-4-5-251128'
})

const currentSeedreamResolutionOptions = computed(() => {
	return getSeedreamResolutionOptions(seedreamVersion.value)
})

const currentSeedreamOutputFormatOptions = computed(() => {
	return getSeedreamOutputFormatOptions(seedreamVersion.value)
})

const showSeedreamOutputFormat = computed(() => {
	return supportsSeedreamOutputFormat(seedreamVersion.value)
})

const isMeshyPostProcessMode = computed(() => {
	const mode = String(props.params.meshyMode || '')
	return mode === 'remesh' || mode === 'retexture' || mode === 'uv-unwrap'
})

const showMeshyTopology = computed(() => {
	const mode = String(props.params.meshyMode || '')
	if (mode === 'retexture' || mode === 'uv-unwrap') return false
	return mode === 'remesh' || !isMeshyPostProcessMode.value
})

interface ConnectedImageInfo {
	url: string
	thumb: string
	name: string
	nodeId: string
}

const retextureConnectedImages = computed<ConnectedImageInfo[]>(() => {
	if (String(props.params.meshyMode || '') !== 'retexture') return []
	const refs = props.inputParamPreviewRefs ?? []
	const results: ConnectedImageInfo[] = []
	const seenNodeIds = new Set<string>()
	for (const ref of refs) {
		if (ref.kind !== 'image') continue
		const url = ref.previewUrl || ''
		const fromNodeId = ref.fromNodeId || ''
		if (!url || !fromNodeId || seenNodeIds.has(fromNodeId)) continue
		seenNodeIds.add(fromNodeId)
		results.push({
			url,
			thumb: url,
			name: ref.label || ref.name || t('aichat.nodeChatParams.imageFallback', { n: results.length + 1 }),
			nodeId: fromNodeId
		})
	}
	return results
})

const seedreamQuantityOptions = NODE_CHAT_SEEDREAM_QUANTITY_OPTIONS

const tripo3dImageModel = computed(() => {
	return String(props.params.tripo3dImageModel || 'seedream_v4')
})

const tripo3dImageConnectedImages = computed<ConnectedImageInfo[]>(() => {
	if (props.nodeType !== 'image' || props.params.model !== 'tripo3d') return []
	const refs = props.inputParamPreviewRefs ?? []
	const results: ConnectedImageInfo[] = []
	const seenNodeIds = new Set<string>()
	for (const ref of refs) {
		if (ref.kind !== 'image') continue
		const fromNodeId = ref.fromNodeId || ''
		if (!fromNodeId || seenNodeIds.has(fromNodeId)) continue
		seenNodeIds.add(fromNodeId)
		const url = ref.previewUrl || ''
		if (url) {
			results.push({
				url,
				thumb: url,
				name: ref.label || ref.name || t('aichat.nodeChatParams.imageFallback', { n: results.length + 1 }),
				nodeId: fromNodeId
			})
		}
	}
	return results
})

const tripo3dImageConnectedCount = computed(() => {
	if (props.nodeType !== 'image' || props.params.model !== 'tripo3d') return 0
	const refs = props.inputParamPreviewRefs ?? []
	const seenNodeIds = new Set<string>()
	for (const ref of refs) {
		if (ref.kind !== 'image') continue
		const fromNodeId = ref.fromNodeId || ''
		if (fromNodeId && !seenNodeIds.has(fromNodeId)) {
			seenNodeIds.add(fromNodeId)
		}
	}
	return seenNodeIds.size
})

const tripo3dImageForceSingle = computed(() => props.params.tripo3dImageForceSingleImage === true)

const tripo3dImageDetectedMode = computed<'text_to_image' | 'image_to_image' | 'image_to_multiview'>(() => {
	const count = tripo3dImageConnectedCount.value
	if (count === 0) return 'text_to_image'
	if (count === 1 || tripo3dImageForceSingle.value) return 'image_to_image'
	return 'image_to_multiview'
})

const tripo3dImageDetectedModeLabel = computed(() => {
	switch (tripo3dImageDetectedMode.value) {
		case 'text_to_image': return t('aiConfig.tripo3dImageMode.textToImage')
		case 'image_to_image': return t('aiConfig.tripo3dImageMode.imageToImage')
		case 'image_to_multiview': return t('aiConfig.tripo3dImageMode.imageToMultiview')
		default: return ''
	}
})

const tripo3dImageDetectedModeHint = computed(() => {
	const count = tripo3dImageConnectedCount.value
	const forceSingle = tripo3dImageForceSingle.value
	if (count === 0) return t('aichat.nodeChatParams.modeHintNoImage')
	if (count >= 2 && forceSingle) return t('aichat.nodeChatParams.modeHintForceSingle', { count })
	if (count === 1) return t('aichat.nodeChatParams.modeHintSingleImage')
	if (count >= 2) return t('aichat.nodeChatParams.modeHintMultiImage', { count })
	return ''
})

const showTripo3DForceSingleImage = computed(() => {
	return tripo3dImageConnectedCount.value >= 2
})

const tripo3dImageMode = computed(() => {
	return tripo3dImageDetectedMode.value
})

const currentTripo3DImageSizeOptions = computed(() => {
	return getTripo3DImageSizeOptions(tripo3dImageModel.value)
})

const showTripo3DAspectRatio = computed(() => {
	return supportsTripo3DAspectRatio(tripo3dImageModel.value)
})

const showTripo3DWatermark = computed(() => {
	return supportsTripo3DWatermark(tripo3dImageModel.value)
})

const currentTripo3DTemplateOptions = computed(() => {
	return getTripo3DImageTemplateOptions(tripo3dImageMode.value)
})

const showTripo3DSizeOptions = computed(() => {
	return true
})

const showTripo3DOutputFormat = computed(() => {
	return true
})

const showTripo3DTemplate = computed(() => {
	return true
})

const showTripo3DNegativePrompt = computed(() => {
	return true
})

const showTripo3DStrength = computed(() => {
	return tripo3dImageMode.value === 'image_to_image' || tripo3dImageMode.value === 'image_to_multiview'
})

const showTripo3DAdvanced = computed(() => {
	return true
})

const updateTripo3DParam = (key: string, value: unknown) => {
	updateParam(key as any, value as any)
}
</script>

<style scoped>
.bp-node-chat-param-panel {
	border-top: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 25%, transparent);
	padding: 4px 0;
	overflow: visible;
	max-height: none;
}

.bp-node-chat-param-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 6px 14px;
	cursor: pointer;
	user-select: none;
	transition: background 0.22s ease;
}

.bp-node-chat-param-header:hover {
	background: color-mix(in srgb, var(--wf-primary, #1f9d84) 8%, transparent);
}

.bp-node-chat-param-title {
	font-size: 12px;
	font-weight: 600;
	color: var(--wf-primary, #1f9d84);
	text-shadow: 0 0 6px color-mix(in srgb, var(--wf-primary, #1f9d84) 35%, transparent);
	letter-spacing: 0.5px;
}

.bp-node-chat-param-toggle {
	display: flex;
	align-items: center;
}

.bp-node-chat-chevron {
	transition: transform 0.22s ease;
	color: color-mix(in srgb, var(--wf-primary, #1f9d84) 70%, transparent);
}

.bp-node-chat-chevron.is-collapsed {
	transform: rotate(-90deg);
}

.bp-node-chat-param-body {
	padding: 4px 14px 12px 14px;
}

.bp-node-chat-param-row {
	margin-bottom: 10px;
}

.bp-node-chat-param-label {
	display: block;
	font-size: 11px;
	color: color-mix(in srgb, var(--wf-primary, #1f9d84) 70%, transparent);
	margin-bottom: 6px;
	text-transform: uppercase;
	letter-spacing: 0.8px;
	font-weight: 500;
}

.bp-node-chat-param-options {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.bp-node-chat-param-auto-mode {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 8px;
}

.bp-node-chat-param-auto-mode-badge {
	padding: 4px 10px;
	font-size: 12px;
	font-weight: 600;
	border: 1px solid var(--wf-primary, #1f9d84);
	border-radius: 2px;
	background: color-mix(in srgb, var(--wf-primary, #1f9d84) 15%, transparent);
	color: var(--wf-primary, #1f9d84);
	letter-spacing: 0.3px;
}

.bp-node-chat-param-auto-mode-hint {
	font-size: 11px;
	color: color-mix(in srgb, var(--wf-text, #edf2f4) 55%, transparent);
	line-height: 1.4;
}

.bp-node-chat-param-btn {
	padding: 5px 10px;
	font-size: 12px;
	border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 30%, transparent);
	border-radius: 2px;
	background: transparent;
	color: var(--wf-text, #edf2f4);
	cursor: pointer;
	transition: all 0.22s ease;
	font-family: inherit;
}

.bp-node-chat-param-btn:hover:not(:disabled) {
	border-color: var(--wf-primary, #1f9d84);
	color: var(--wf-primary, #1f9d84);
	box-shadow: 0 0 8px color-mix(in srgb, var(--wf-primary, #1f9d84) 30%, transparent);
	background: color-mix(in srgb, var(--wf-primary, #1f9d84) 8%, transparent);
}

.bp-node-chat-param-btn.is-active {
	background: color-mix(in srgb, var(--wf-primary, #1f9d84) 20%, transparent);
	border-color: color-mix(in srgb, var(--wf-primary, #1f9d84) 65%, transparent);
	color: var(--wf-primary, #1f9d84);
	box-shadow: 0 0 10px color-mix(in srgb, var(--wf-primary, #1f9d84) 35%, transparent);
}

.bp-node-chat-param-badge {
	display: inline-block;
	margin-left: 4px;
	padding: 1px 5px;
	font-size: 9px;
	background: color-mix(in srgb, var(--wf-primary, #1f9d84) 25%, transparent);
	border-radius: 2px;
	color: var(--wf-primary, #1f9d84);
	font-weight: 600;
	letter-spacing: 0.5px;
}

.bp-node-chat-param-btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.bp-node-chat-param-advanced {
	display: flex;
	flex-wrap: wrap;
	gap: 12px;
	align-items: center;
}

.bp-node-chat-param-toggle {
	display: flex;
	align-items: center;
	gap: 4px;
	font-size: 12px;
	color: var(--wf-text, #edf2f4);
	cursor: pointer;
}

.bp-node-chat-param-toggle input[type='checkbox'] {
	width: 14px;
	height: 14px;
	accent-color: var(--wf-primary, #1f9d84);
}

.bp-node-chat-param-seed {
	display: flex;
	align-items: center;
	gap: 6px;
	font-size: 12px;
	color: var(--wf-text, #edf2f4);
}

.bp-node-chat-param-seed input {
	width: 80px;
	padding: 4px 8px;
	font-size: 12px;
	border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 35%, transparent);
	border-radius: 2px;
	background: color-mix(in srgb, var(--wf-surface-base, rgba(21, 24, 28, 0.9)) 92%, transparent);
	color: var(--wf-text, #edf2f4);
	font-family: monospace;
	transition:
		border-color 0.22s ease,
		box-shadow 0.22s ease;
}

.bp-node-chat-param-seed input:focus {
	outline: none;
	border-color: var(--wf-primary, #1f9d84);
	box-shadow:
		0 0 0 2px color-mix(in srgb, var(--wf-primary, #1f9d84) 22%, transparent),
		0 0 10px color-mix(in srgb, var(--wf-primary, #1f9d84) 35%, transparent);
}

.bp-node-chat-param-input {
	display: flex;
	align-items: center;
}

.bp-node-chat-param-input input {
	flex: 1;
	padding: 4px 8px;
	font-size: 12px;
	border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 35%, transparent);
	border-radius: 2px;
	background: color-mix(in srgb, var(--wf-surface-base, rgba(21, 24, 28, 0.9)) 92%, transparent);
	color: var(--wf-text, #edf2f4);
	font-family: inherit;
	transition:
		border-color 0.22s ease,
		box-shadow 0.22s ease;
}

.bp-node-chat-param-input input:focus {
	outline: none;
	border-color: var(--wf-primary, #1f9d84);
	box-shadow:
		0 0 0 2px color-mix(in srgb, var(--wf-primary, #1f9d84) 22%, transparent),
		0 0 10px color-mix(in srgb, var(--wf-primary, #1f9d84) 35%, transparent);
}

.bp-node-chat-param-input input::placeholder {
	color: color-mix(in srgb, var(--wf-text, #edf2f4) 40%, transparent);
}

.bp-node-chat-param-hint {
	font-size: 11px;
	color: color-mix(in srgb, var(--wf-text, #edf2f4) 50%, transparent);
	margin-left: 8px;
	font-style: italic;
}

.bp-node-chat-param-thumb-list {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.bp-node-chat-param-thumb {
	width: 52px;
	height: 52px;
	padding: 2px;
	border: 2px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 30%, transparent);
	border-radius: 4px;
	background: transparent;
	cursor: pointer;
	overflow: hidden;
	transition: all 0.2s ease;
}

.bp-node-chat-param-thumb img {
	width: 100%;
	height: 100%;
	object-fit: cover;
	display: block;
	border-radius: 2px;
}

.bp-node-chat-param-thumb:hover:not(:disabled) {
	border-color: var(--wf-primary, #1f9d84);
	box-shadow: 0 0 8px color-mix(in srgb, var(--wf-primary, #1f9d84) 40%, transparent);
}

.bp-node-chat-param-thumb.is-selected {
	border-color: var(--wf-primary, #1f9d84);
	box-shadow: 0 0 10px color-mix(in srgb, var(--wf-primary, #1f9d84) 50%, transparent);
	background: color-mix(in srgb, var(--wf-primary, #1f9d84) 10%, transparent);
}

.bp-node-chat-param-thumb:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.bp-node-chat-param-thumb-single {
	min-height: 56px;
	display: flex;
	align-items: center;
}

.bp-node-chat-param-thumb-preview {
	width: 52px;
	height: 52px;
	border: 2px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 40%, transparent);
	border-radius: 4px;
	overflow: hidden;
}

.bp-node-chat-param-thumb-preview img {
	width: 100%;
	height: 100%;
	object-fit: cover;
	display: block;
}

.bp-node-chat-param-mode-display {
	display: flex;
	align-items: center;
	gap: 8px;
	flex-wrap: wrap;
}

.bp-node-chat-param-mode-badge {
	font-size: 11px;
	font-weight: 600;
	padding: 3px 8px;
	border-radius: 4px;
	background: color-mix(in srgb, var(--wf-primary, #1f9d84) 20%, transparent);
	color: var(--wf-primary, #1f9d84);
}

.bp-node-chat-param-mode-badge.mode-text_to_model {
	background: color-mix(in srgb, #6366f1 20%, transparent);
	color: #818cf8;
}

.bp-node-chat-param-mode-badge.mode-image_to_model {
	background: color-mix(in srgb, #f59e0b 20%, transparent);
	color: #fbbf24;
}

.bp-node-chat-param-mode-badge.mode-multiview_to_model {
	background: color-mix(in srgb, #10b981 20%, transparent);
	color: #34d399;
}

.bp-node-chat-param-force-single {
	margin-left: 8px;
}

.bp-node-chat-param-btn-series {
	gap: 4px;
}

.bp-node-chat-param-btn-icon {
	font-size: 14px;
}

.bp-node-chat-param-image-grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
	gap: 8px;
	width: 100%;
}

.bp-node-chat-param-image-item {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 4px;
}

.bp-node-chat-param-thumb-remove {
	position: absolute;
	top: 2px;
	right: 2px;
	width: 18px;
	height: 18px;
	border-radius: 50%;
	border: none;
	background: color-mix(in srgb, #ef4444 90%, transparent);
	color: white;
	font-size: 14px;
	line-height: 1;
	cursor: pointer;
	display: flex;
	align-items: center;
	justify-content: center;
	opacity: 0;
	transition: opacity 0.2s ease;
}

.bp-node-chat-param-thumb:hover .bp-node-chat-param-thumb-remove {
	opacity: 1;
}

.bp-node-chat-param-view-badge {
	position: absolute;
	bottom: 2px;
	left: 2px;
	font-size: 10px;
	font-weight: 600;
	padding: 1px 5px;
	border-radius: 3px;
	color: white;
	text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
}

.bp-node-chat-param-view-selector {
	display: flex;
	gap: 3px;
	flex-wrap: wrap;
	justify-content: center;
}

.bp-node-chat-param-view-btn {
	font-size: 10px;
	padding: 2px 5px;
	border: 1px solid var(--view-color, var(--wf-primary, #1f9d84));
	border-radius: 3px;
	background: transparent;
	color: var(--view-color, var(--wf-primary, #1f9d84));
	cursor: pointer;
	transition: all 0.15s ease;
}

.bp-node-chat-param-view-btn:hover:not(:disabled) {
	background: var(--view-color, var(--wf-primary, #1f9d84));
	color: white;
}

.bp-node-chat-param-view-btn:disabled {
	opacity: 0.3;
	cursor: not-allowed;
}

.bp-node-chat-param-view-btn.is-required::after {
	content: '*';
	color: #ef4444;
	margin-left: 1px;
}

.bp-node-chat-param-hint-inline {
	font-size: 10px;
	color: color-mix(in srgb, var(--wf-text, #edf2f4) 50%, transparent);
	font-weight: normal;
	margin-left: 6px;
}

.bp-node-chat-param-face-count {
	font-size: 11px;
	color: var(--wf-primary, #1f9d84);
	font-weight: 600;
	margin-left: 6px;
}

.bp-node-chat-param-slider-row {
	display: flex;
	align-items: center;
	gap: 8px;
	width: 100%;
}

.bp-node-chat-param-slider {
	flex: 1;
	height: 4px;
	-webkit-appearance: none;
	appearance: none;
	background: color-mix(in srgb, var(--wf-primary, #1f9d84) 25%, transparent);
	border-radius: 2px;
	outline: none;
}

.bp-node-chat-param-slider::-webkit-slider-thumb {
	-webkit-appearance: none;
	appearance: none;
	width: 14px;
	height: 14px;
	border-radius: 50%;
	background: var(--wf-primary, #1f9d84);
	cursor: pointer;
	box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
	transition: transform 0.15s ease;
}

.bp-node-chat-param-slider::-webkit-slider-thumb:hover {
	transform: scale(1.15);
}

.bp-node-chat-param-slider::-moz-range-thumb {
	width: 14px;
	height: 14px;
	border-radius: 50%;
	background: var(--wf-primary, #1f9d84);
	cursor: pointer;
	border: none;
	box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
}

.bp-node-chat-param-number-input {
	width: 80px;
	padding: 4px 6px;
	font-size: 11px;
	border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 35%, transparent);
	border-radius: 3px;
	background: color-mix(in srgb, var(--wf-surface-base, rgba(21, 24, 28, 0.9)) 92%, transparent);
	color: var(--wf-text, #edf2f4);
	font-family: inherit;
	text-align: right;
}

.bp-node-chat-param-number-input:focus {
	outline: none;
	border-color: var(--wf-primary, #1f9d84);
}

.bp-node-chat-param-presets {
	margin-top: 6px;
}

.bp-node-chat-param-preset-btn {
	font-size: 11px;
	padding: 3px 8px;
}

.bp-node-chat-param-textarea textarea {
	width: 100%;
	padding: 6px 8px;
	font-size: 12px;
	border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 35%, transparent);
	border-radius: 4px;
	background: color-mix(in srgb, var(--wf-surface-base, rgba(21, 24, 28, 0.9)) 92%, transparent);
	color: var(--wf-text, #edf2f4);
	font-family: inherit;
	resize: vertical;
	min-height: 60px;
	transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.bp-node-chat-param-textarea textarea:focus {
	outline: none;
	border-color: var(--wf-primary, #1f9d84);
	box-shadow: 0 0 0 2px color-mix(in srgb, var(--wf-primary, #1f9d84) 22%, transparent);
}

.bp-node-chat-param-textarea textarea::placeholder {
	color: color-mix(in srgb, var(--wf-text, #edf2f4) 40%, transparent);
}

.bp-node-chat-param-advanced-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	cursor: pointer;
	padding: 4px 0;
	user-select: none;
	width: 100%;
}

.bp-node-chat-param-advanced-header .bp-node-chat-param-label {
	margin-bottom: 0;
	cursor: pointer;
}

.bp-node-chat-chevron {
	transition: transform 0.2s ease;
	color: var(--wf-primary, #1f9d84);
}

.bp-node-chat-chevron.is-collapsed {
	transform: rotate(-90deg);
}

.bp-node-chat-param-advanced-body {
	margin-top: 8px;
	padding-left: 4px;
	border-left: 2px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 20%, transparent);
}

.bp-node-chat-param-subsection {
	margin-bottom: 10px;
}

.bp-node-chat-param-subtitle {
	display: block;
	font-size: 11px;
	font-weight: 600;
	color: var(--wf-primary, #1f9d84);
	margin-bottom: 6px;
	text-transform: uppercase;
	letter-spacing: 0.3px;
}

.bp-node-chat-param-sublabel {
	font-size: 11px;
	color: color-mix(in srgb, var(--wf-text, #edf2f4) 70%, transparent);
	margin-bottom: 4px;
	display: block;
}

.bp-node-chat-param-seed-group {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 8px;
}

.bp-node-chat-param-seed {
	display: flex;
	align-items: center;
	gap: 4px;
}

.bp-node-chat-param-seed label {
	font-size: 10px;
	color: color-mix(in srgb, var(--wf-text, #edf2f4) 60%, transparent);
	white-space: nowrap;
	min-width: 40px;
}

.bp-node-chat-param-seed input {
	flex: 1;
	padding: 3px 6px;
	font-size: 11px;
	border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 30%, transparent);
	border-radius: 3px;
	background: color-mix(in srgb, var(--wf-surface-base, rgba(21, 24, 28, 0.9)) 92%, transparent);
	color: var(--wf-text, #edf2f4);
	font-family: inherit;
	width: 60px;
}

.bp-node-chat-param-seed input:focus {
	outline: none;
	border-color: var(--wf-primary, #1f9d84);
}

.bp-node-chat-param-seed-random {
	width: 24px;
	height: 24px;
	border: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 35%, transparent);
	border-radius: 3px;
	background: transparent;
	cursor: pointer;
	font-size: 12px;
	display: flex;
	align-items: center;
	justify-content: center;
	transition: all 0.15s ease;
}

.bp-node-chat-param-seed-random:hover:not(:disabled) {
	background: color-mix(in srgb, var(--wf-primary, #1f9d84) 20%, transparent);
	border-color: var(--wf-primary, #1f9d84);
}

.bp-node-chat-param-seed-random:disabled {
	opacity: 0.4;
	cursor: not-allowed;
}

.bp-node-chat-param-thumb {
	position: relative;
}
</style>
