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
				<div v-if="params.model === 'nanobanana'" class="bp-node-chat-param-row">
					<span class="bp-node-chat-param-label">{{ t('aichat.nodeChatParams.model') }}</span>
					<div class="bp-node-chat-param-options">
						<button
							v-for="opt in nanobananaModelVersionOptions"
							:key="opt.value"
							type="button"
							class="bp-node-chat-param-btn"
							:class="{ 'is-active': params.nanobananaModelVersion === opt.value }"
							:disabled="disabled"
							@click="updateParam('nanobananaModelVersion', opt.value)"
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
				<div v-if="params.model !== 'meshy' && params.model !== 'seedream'" class="bp-node-chat-param-row">
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
				<div v-if="params.model !== 'meshy' && params.model !== 'seedream'" class="bp-node-chat-param-row">
					<span class="bp-node-chat-param-label">{{ t('aichat.nodeChatParams.aspectRatio') }}</span>
					<div class="bp-node-chat-param-options">
						<button
							v-for="opt in aspectRatioOptions"
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
				<div v-if="params.model !== 'meshy' && params.model !== 'seedream'" class="bp-node-chat-param-row">
					<span class="bp-node-chat-param-label">{{ t('aichat.nodeChatParams.quantity') }}</span>
					<div class="bp-node-chat-param-options">
						<button
							v-for="n in quantityOptions"
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
			</template>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from '../../../i18n'
import type { WorkflowNodeChatType, WorkflowNodeChatParamRecord } from '../../../aiworkflow/types'
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
	getMeshyImageAspectRatioOptions,
	getSeedreamResolutionOptions,
	getSeedreamOutputFormatOptions,
	supportsSeedreamOutputFormat
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

const collapsed = ref(false)

const toggleCollapse = () => {
	collapsed.value = !collapsed.value
}

const updateParam = <K extends keyof WorkflowNodeChatParamRecord>(key: K, value: WorkflowNodeChatParamRecord[K]) => {
	const next: WorkflowNodeChatParamRecord = { ...props.params, [key]: value }

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
const seedreamModelVersionOptions = NODE_CHAT_SEEDREAM_MODEL_VERSION_OPTIONS
const nanobananaModelVersionOptions = NODE_CHAT_NANOBANANA_MODEL_VERSION_OPTIONS
const meshyImageAiModelOptions = NODE_CHAT_MESHY_IMAGE_OPTIONS.aiModel
const meshyImageOutputCountOptions = NODE_CHAT_MESHY_IMAGE_OUTPUT_COUNT_OPTIONS
const seedanceModelVersionOptions = NODE_CHAT_SEEDANCE_MODEL_VERSION_OPTIONS

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
</script>

<style scoped>
.bp-node-chat-param-panel {
	border-top: 1px solid color-mix(in srgb, var(--wf-primary, #1f9d84) 25%, transparent);
	padding: 4px 0;
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
</style>
