<template>
	<WorkflowNodeBase
		:nodeId="nodeId"
		:title="title"
		:alias="alias"
		:nodeType="nodeType"
		:subtitle="subtitle"
		:style="style"
		:width="width"
		:height="height"
		:zoom="zoom"
		:worldX="worldX"
		:worldY="worldY"
		:inputs="inputs"
		:outputs="outputs"
		:selected="selected"
		:hoverInputAnchorId="hoverInputAnchorId"
		:hoverOutputAnchorId="hoverOutputAnchorId"
		@update:world-x="(v) => emit('update:worldX', v)"
		@update:world-y="(v) => emit('update:worldY', v)"
		@update:world-position="(p) => emit('update:worldPosition', p)"
		@select="(id) => emit('select', id)"
		@start-link="onStartLink"
		@end-link="onEndLink"
		@copy="() => emit('copy')"
		@refresh="() => emit('refresh')"
		@delete="() => emit('delete')"
		@set-type="onSetType"
		@resize="onResize"
	>
		<template #body>
			<div class="wf-meshy-body" @pointerdown.stop>
				<div class="wf-meshy-hero">
					<div class="wf-meshy-hero-copy">
						<div class="wf-meshy-badge-row">
							<div class="wf-meshy-badge">Meshy</div>
						<div class="wf-meshy-badge subtle">{{ t('nodes.meshy.workstationBadge') }}</div>
						</div>
						<div class="wf-meshy-title">{{ targetTitle }}</div>
						<div class="wf-meshy-subtitle">{{ targetSubtitle }}</div>
					</div>
					<div class="wf-meshy-status-card" :class="statusClass">
						<div class="wf-meshy-status-label">{{ statusLabel }}</div>
						<div class="wf-meshy-status-value">{{ statusValue }}</div>
						<div class="wf-meshy-status-detail">{{ statusDetail }}</div>
					</div>
				</div>

				<div class="wf-meshy-target-switch">
					<button
						type="button"
						class="wf-meshy-target-btn"
						:class="{ active: meshyTaskTarget === '3d' }"
						@click.stop="onTargetSelect('3d')"
					>
						{{ t('nodes.meshy.target3d') }}
					</button>
					<button
						type="button"
						class="wf-meshy-target-btn"
						:class="{ active: meshyTaskTarget === 'image' }"
						@click.stop="onTargetSelect('image')"
					>
						{{ t('nodes.meshy.targetImage') }}
					</button>
				</div>

				<div class="wf-meshy-summary-grid">
					<div class="wf-meshy-summary-card">
						<div class="wf-meshy-summary-label">{{ t('nodes.meshy.taskFamilyLabel') }}</div>
						<div class="wf-meshy-summary-value">{{ familyLabel }}</div>
					</div>
					<div class="wf-meshy-summary-card">
						<div class="wf-meshy-summary-label">{{ t('nodes.meshy.currentStageLabel') }}</div>
						<div class="wf-meshy-summary-value">{{ relationSummaryText }}</div>
					</div>
					<div class="wf-meshy-summary-card">
						<div class="wf-meshy-summary-label">{{ t('nodes.meshy.inputSummaryLabel') }}</div>
						<div class="wf-meshy-summary-value">{{ inputSummaryText }}</div>
					</div>
					<div class="wf-meshy-summary-card">
						<div class="wf-meshy-summary-label">{{ t('nodes.meshy.outputAnchorLabel') }}</div>
						<div class="wf-meshy-summary-value">{{ outputSummaryText }}</div>
					</div>
					<div class="wf-meshy-summary-card">
						<div class="wf-meshy-summary-label">{{ t('nodes.meshy.advancedParamsLabel') }}</div>
						<div class="wf-meshy-summary-value">{{ advancedSummaryText }}</div>
					</div>
				</div>

				<div v-if="meshyTaskTarget === '3d'" class="wf-meshy-preview-grid">
					<div class="wf-meshy-thumb-shell wf-meshy-preview-card">
						<div class="wf-meshy-preview-label">{{ t('nodes.meshy.sourcePreviewLabel') }}</div>
						<div class="wf-meshy-preview-sub">{{ sourcePreviewLabelText }}</div>
						<img
							v-if="safeDisplaySourcePreviewUrl"
							class="wf-meshy-thumb"
							:src="safeDisplaySourcePreviewUrl"
							alt="meshy source preview"
							@error="onSourcePreviewError"
						/>
						<div v-else class="wf-meshy-preview-empty">{{ t('nodes.meshy.sourcePreviewEmpty') }}</div>
					</div>
					<div class="wf-meshy-thumb-shell wf-meshy-preview-card">
						<div class="wf-meshy-preview-label">{{ t('nodes.meshy.meshyPreviewLabel') }}</div>
						<div class="wf-meshy-preview-sub">{{ t('nodes.meshy.meshyPreviewSub') }}</div>
						<img
							v-if="safeDisplayThumbnailUrl"
							class="wf-meshy-thumb"
							:src="safeDisplayThumbnailUrl"
							alt="meshy output preview"
							@error="onThumbnailError"
						/>
						<div v-else class="wf-meshy-preview-empty">{{ t('nodes.meshy.meshyPreviewEmpty') }}</div>
					</div>
				</div>
				<div v-else-if="safeDisplayThumbnailUrl" class="wf-meshy-thumb-shell">
					<img
						class="wf-meshy-thumb"
						:src="safeDisplayThumbnailUrl"
						alt="meshy thumbnail"
						@error="onThumbnailError"
					/>
				</div>
			</div>
		</template>

		<template #footer>
			<div class="wf-meshy-footer" @pointerdown.stop>
				<template v-if="showHeavyEditor">
					<div class="wf-meshy-row">
						<label class="wf-meshy-field wf-meshy-field-wide">
							<span class="wf-meshy-label">{{ t('nodes.meshy.taskFamily') }}</span>
							<select class="wf-meshy-input" :value="meshyTaskFamily" @change="onFamilyChange">
								<option v-for="item in familyOptions" :key="item.value" :value="item.value">
									{{ item.label }}
								</option>
							</select>
						</label>
					</div>

					<div class="wf-meshy-row">
						<div
							v-if="showImageConfigTable"
							class="wf-meshy-field wf-meshy-field-wide wf-meshy-config-card"
						>
							<span class="wf-meshy-label">{{ t('nodes.meshy.imageConfigTitle') }}</span>
							<table class="wf-meshy-config-table">
								<tbody>
									<tr>
										<th>{{ t('nodes.meshy.aiModel') }}</th>
										<td>
											<select
												class="wf-meshy-input"
												:value="meshyAiModel"
												@change="onAiModelChange"
											>
												<option value="nano-banana">{{ t('aiConfig.meshModes.modelNanoBanana') }}</option>
												<option value="nano-banana-pro">{{ t('aiConfig.meshModes.modelNanoBananaPro') }}</option>
											</select>
										</td>
									</tr>
									<tr>
										<th>{{ t('nodes.meshy.outputImageCount') }}</th>
										<td>
											<select
												class="wf-meshy-input"
												:value="meshyOutputImageCount"
												@change="onOutputImageCountChange"
											>
												<option
													v-for="count in imageOutputCountOptions"
													:key="count"
													:value="count"
												>
													{{ count }} {{ t('nodes.meshy.outputCountUnit') }}
												</option>
											</select>
											<div class="wf-meshy-config-inline">
												{{ t('nodes.meshy.outputAnchorsHint', { count: meshyOutputImageCount }) }}
											</div>
										</td>
									</tr>
									<tr>
										<th>{{ t('nodes.meshy.creditEstimate') }}</th>
										<td>
											<div class="wf-meshy-static-value">
												{{ t('nodes.meshy.creditCost', { price: imageUnitPrice, cost: imageEstimatedCost }) }}
											</div>
										</td>
									</tr>
									<tr>
										<th>{{ t('nodes.meshy.multiView') }}</th>
										<td>
											<label class="wf-meshy-switch-row">
												<input
													type="checkbox"
													:checked="meshyGenerateMultiView"
													@change="onGenerateMultiViewToggle"
												/>
												<span>{{ meshyGenerateMultiView ? t('nodes.meshy.enabled') : t('nodes.meshy.disabled') }}</span>
											</label>
										</td>
									</tr>
									<tr>
										<th>{{ t('nodes.meshy.aspectRatio') }}</th>
										<td>
											<select
												class="wf-meshy-input"
												:value="meshyAspectRatio"
												:disabled="meshyGenerateMultiView"
												@change="onAspectRatioChange"
											>
												<option v-if="meshyGenerateMultiView" value="">Auto (multi-view)</option>
												<option value="1:1">1:1</option>
												<option value="16:9">16:9</option>
												<option value="9:16">9:16</option>
												<option value="4:3">4:3</option>
												<option value="3:4">3:4</option>
											</select>
										</td>
									</tr>
									<tr>
										<th>{{ t('nodes.meshy.pose') }}</th>
										<td>
											<select
												class="wf-meshy-input"
												:value="meshyPoseMode"
												@change="onPoseModeChange"
											>
												<option value="">{{ t('nodes.meshy.poseNone') }}</option>
												<option value="a-pose">A Pose</option>
												<option value="t-pose">T Pose</option>
											</select>
										</td>
									</tr>
									<tr v-if="meshyTaskFamily === 'image-to-image'">
										<th>{{ t('nodes.meshy.refImageInputCount') }}</th>
										<td>
											<div class="wf-meshy-static-value">
												{{ t('nodes.meshy.refImageFixedCount') }}
											</div>
										</td>
									</tr>
									<tr>
										<th>Seed</th>
										<td>
											<input
												class="wf-meshy-input"
												type="number"
												min="0"
												step="1"
												:value="meshySeed"
												:placeholder="t('nodes.meshy.seedPlaceholder')"
												@change="onSeedChange"
											/>
										</td>
									</tr>
								</tbody>
							</table>
							<div class="wf-meshy-config-note">
								{{ t('nodes.meshy.imageConfigNote') }}
							</div>
						</div>

						<div
							v-if="showModelTypeField"
							class="wf-meshy-field wf-meshy-field-wide wf-meshy-config-card"
						>
							<span class="wf-meshy-label">{{ t('nodes.meshy.model3dConfigTitle') }}</span>
							<table class="wf-meshy-config-table">
								<tbody>
									<tr>
										<th>{{ t('nodes.meshy.modelVersion') }}</th>
										<td>
											<select
												class="wf-meshy-input"
												:value="meshyAiModel"
												@change="onAiModelChange"
											>
												<option value="latest">{{ t('aiConfig.meshModes.modelLatest') }}</option>
												<option value="meshy-6">{{ t('aiConfig.meshModes.modelMeshy6') }}</option>
												<option value="meshy-5">{{ t('aiConfig.meshModes.modelMeshy5') }}</option>
											</select>
											<div class="wf-meshy-config-inline">
												{{ t('nodes.meshy.modelVersionNote') }}
											</div>
										</td>
									</tr>
									<tr>
										<th>{{ t('nodes.meshy.meshMode') }}</th>
										<td>
											<select
												class="wf-meshy-input"
												:value="meshyModelType"
												@change="onModelTypeChange"
											>
												<option value="standard">{{ t('aiConfig.meshModes.standard') }}</option>
												<option value="lowpoly">{{ t('aiConfig.meshModes.lowpoly') }}</option>
											</select>
											<div class="wf-meshy-config-inline">
												{{ t('nodes.meshy.meshModeNote', { mode: modelTypeLabel }) }}
											</div>
										</td>
									</tr>
									<tr>
										<th>{{ t('nodes.meshy.topology') }}</th>
										<td>
											<select
												class="wf-meshy-input"
												:value="meshyTopology"
												:disabled="isLowpolyModelType"
												@change="onTopologyChange"
											>
												<option value="triangle">triangle</option>
												<option value="quad">quad</option>
											</select>
											<div class="wf-meshy-config-inline">
												{{ t('nodes.meshy.topologyNote') }}
											</div>
										</td>
									</tr>
									<tr>
										<th>{{ t('nodes.meshy.targetPolycount') }}</th>
										<td>
											<input
												class="wf-meshy-input"
												type="number"
												min="100"
												max="300000"
												step="100"
												:disabled="isLowpolyModelType"
												:value="meshyTargetPolycount"
												@change="onTargetPolycountChange"
											/>
											<div class="wf-meshy-config-inline">
												{{ t('nodes.meshy.targetPolycountNote') }}
											</div>
										</td>
									</tr>
									<tr>
										<th>{{ t('nodes.meshy.symmetryMode') }}</th>
										<td>
											<select
												class="wf-meshy-input"
												:disabled="isLowpolyModelType"
												:value="meshySymmetryMode"
												@change="onSymmetryModeChange"
											>
												<option value="auto">auto</option>
												<option value="on">on</option>
												<option value="off">off</option>
											</select>
											<div class="wf-meshy-config-inline">{{ t('nodes.meshy.symmetryModeNote') }}</div>
										</td>
									</tr>
									<tr>
										<th>{{ t('nodes.meshy.shouldRemesh') }}</th>
										<td>
											<label class="wf-meshy-switch-row">
												<input
													type="checkbox"
													:disabled="isLowpolyModelType"
													:checked="meshyShouldRemesh"
													@change="onShouldRemeshToggle"
												/>
												<span>{{ meshyShouldRemesh ? t('nodes.meshy.enabled') : t('nodes.meshy.disabled') }}</span>
											</label>
											<div class="wf-meshy-config-inline">
												{{ t('nodes.meshy.shouldRemeshNote') }}
											</div>
										</td>
									</tr>
									<tr>
										<th>{{ t('nodes.meshy.savePreRemeshed') }}</th>
										<td>
											<label class="wf-meshy-switch-row">
												<input
													type="checkbox"
													:disabled="isLowpolyModelType || !meshyShouldRemesh"
													:checked="meshySavePreRemeshedModel"
													@change="onSavePreRemeshedToggle"
												/>
												<span>{{ meshySavePreRemeshedModel ? t('nodes.meshy.enabled') : t('nodes.meshy.disabled') }}</span>
											</label>
											<div class="wf-meshy-config-inline">
												{{ t('nodes.meshy.savePreRemeshedNote') }}
											</div>
										</td>
									</tr>
									<tr>
										<th>{{ t('nodes.meshy.shouldTexture') }}</th>
										<td>
											<label class="wf-meshy-switch-row">
												<input
													type="checkbox"
													:checked="meshyShouldTexture"
													@change="onShouldTextureToggle"
												/>
												<span>{{ meshyShouldTexture ? t('nodes.meshy.enabled') : t('nodes.meshy.disabled') }}</span>
											</label>
											<div class="wf-meshy-config-inline">
												{{ t('nodes.meshy.shouldTextureNote') }}
											</div>
										</td>
									</tr>
									<tr>
										<th>{{ t('nodes.meshy.enablePbr') }}</th>
										<td>
											<label class="wf-meshy-switch-row">
												<input
													type="checkbox"
													:disabled="!meshyShouldTexture"
													:checked="meshyEnablePbr"
													@change="onEnablePbrToggle"
												/>
												<span>{{ meshyEnablePbr ? t('nodes.meshy.enabled') : t('nodes.meshy.disabled') }}</span>
											</label>
											<div class="wf-meshy-config-inline">
												{{ t('nodes.meshy.enablePbrNote') }}
											</div>
										</td>
									</tr>
									<tr>
										<th>{{ t('nodes.meshy.texturePrompt') }}</th>
										<td>
											<textarea
												class="wf-meshy-textarea compact"
												rows="2"
												:disabled="!meshyShouldTexture"
												:value="meshyTexturePrompt"
												:placeholder="t('nodes.meshy.texturePromptPlaceholder')"
												@input="onTexturePromptInput"
											/>
											<div class="wf-meshy-config-inline">
												{{ t('nodes.meshy.texturePromptNote') }}
											</div>
										</td>
									</tr>
									<tr>
										<th>{{ t('nodes.meshy.textureImageUrl') }}</th>
										<td>
											<input
												class="wf-meshy-input"
												type="text"
												:disabled="!meshyShouldTexture"
												:value="meshyTextureImageUrl"
												:placeholder="t('nodes.meshy.textureImageUrlPlaceholder')"
												@input="onTextureImageUrlInput"
											/>
											<div class="wf-meshy-config-inline">
												{{ t('nodes.meshy.textureImageUrlNote') }}
											</div>
										</td>
									</tr>
									<tr>
										<th>{{ t('nodes.meshy.poseMode') }}</th>
										<td>
											<select
												class="wf-meshy-input"
												:value="meshyPoseMode"
												@change="onPoseModeChange"
											>
												<option value="">{{ t('nodes.meshy.poseNone') }}</option>
												<option value="a-pose">a-pose</option>
												<option value="t-pose">t-pose</option>
											</select>
											<div class="wf-meshy-config-inline">{{ t('nodes.meshy.poseModeNote') }}</div>
										</td>
									</tr>
									<tr>
										<th>{{ t('nodes.meshy.autoSize') }}</th>
										<td>
											<label class="wf-meshy-switch-row">
												<input
													type="checkbox"
													:checked="meshyAutoSize"
													@change="onAutoSizeToggle"
												/>
												<span>{{ meshyAutoSize ? t('nodes.meshy.enabled') : t('nodes.meshy.disabled') }}</span>
											</label>
											<div class="wf-meshy-config-inline">{{ t('nodes.meshy.autoSizeNote') }}</div>
										</td>
									</tr>
									<tr>
										<th>{{ t('nodes.meshy.originAt') }}</th>
										<td>
											<select
												class="wf-meshy-input"
												:disabled="!meshyAutoSize"
												:value="meshyOriginAt"
												@change="onOriginAtChange"
											>
												<option value="bottom">bottom</option>
												<option value="center">center</option>
											</select>
											<div class="wf-meshy-config-inline">
												{{ t('nodes.meshy.originAtNote') }}
											</div>
										</td>
									</tr>
									<tr>
										<th>{{ t('nodes.meshy.moderation') }}</th>
										<td>
											<label class="wf-meshy-switch-row">
												<input
													type="checkbox"
													:checked="meshyModeration"
													@change="onModerationToggle"
												/>
												<span>{{ meshyModeration ? t('nodes.meshy.enabled') : t('nodes.meshy.disabled') }}</span>
											</label>
											<div class="wf-meshy-config-inline">
												{{ t('nodes.meshy.moderationNote') }}
											</div>
										</td>
									</tr>
									<tr>
										<th>{{ t('nodes.meshy.imageEnhancement') }}</th>
										<td>
											<label class="wf-meshy-switch-row">
												<input
													type="checkbox"
													:checked="meshyImageEnhancement"
													@change="onImageEnhancementToggle"
												/>
												<span>{{ meshyImageEnhancement ? t('nodes.meshy.enabled') : t('nodes.meshy.disabled') }}</span>
											</label>
											<div class="wf-meshy-config-inline">
												{{ t('nodes.meshy.imageEnhancementNote') }}
											</div>
										</td>
									</tr>
									<tr>
										<th>{{ t('nodes.meshy.removeLighting') }}</th>
										<td>
											<label class="wf-meshy-switch-row">
												<input
													type="checkbox"
													:checked="meshyRemoveLighting"
													@change="onRemoveLightingToggle"
												/>
												<span>{{ meshyRemoveLighting ? t('nodes.meshy.enabled') : t('nodes.meshy.disabled') }}</span>
											</label>
											<div class="wf-meshy-config-inline">
												{{ t('nodes.meshy.removeLightingNote') }}
											</div>
										</td>
									</tr>
									<tr>
										<th>{{ t('nodes.meshy.targetFormats') }}</th>
										<td>
											<div class="wf-meshy-format-grid">
												<label
													v-for="fmt in targetFormatOptions"
													:key="fmt"
													class="wf-meshy-switch-row wf-meshy-format-item"
												>
													<input
														type="checkbox"
														:checked="meshyTargetFormats.includes(fmt)"
														@change="onTargetFormatToggle(fmt, $event)"
													/>
													<span>{{ fmt }}</span>
												</label>
											</div>
											<div class="wf-meshy-config-inline">
												{{ t('nodes.meshy.targetFormatsNote') }}
											</div>
										</td>
									</tr>
									<tr>
										<th>Seed</th>
										<td>
											<input
												class="wf-meshy-input"
												type="number"
												min="0"
												step="1"
												:value="meshySeed"
												:placeholder="t('nodes.meshy.seedPlaceholder')"
												@change="onSeedChange"
											/>
											<div class="wf-meshy-config-inline">
												{{ t('nodes.meshy.seedNote') }}
											</div>
										</td>
									</tr>
								</tbody>
							</table>
						</div>

						<label v-if="showPromptField" class="wf-meshy-field wf-meshy-field-wide">
							<span class="wf-meshy-label">{{ t('nodes.meshy.prompt') }}</span>
							<textarea
								class="wf-meshy-textarea"
								rows="3"
								:value="meshyPrompt"
								:placeholder="t('nodes.meshy.promptPlaceholder')"
								@input="onPromptInput"
							/>
						</label>

						<label v-if="showNegativePromptField" class="wf-meshy-field wf-meshy-field-wide">
							<span class="wf-meshy-label">{{ t('nodes.meshy.negativePrompt') }}</span>
							<textarea
								class="wf-meshy-textarea compact"
								rows="2"
								:value="meshyNegativePrompt"
								:placeholder="t('nodes.meshy.negativePromptPlaceholder')"
								@input="onNegativePromptInput"
							/>
						</label>

						<label v-if="showPreviewTaskField" class="wf-meshy-field wf-meshy-field-wide">
							<span class="wf-meshy-label">{{ t('nodes.meshy.previewTaskId') }}</span>
							<input
								class="wf-meshy-input"
								type="text"
								:value="meshyPreviewTaskId"
								:placeholder="t('nodes.meshy.previewTaskIdPlaceholder')"
								@input="onPreviewTaskIdInput"
							/>
						</label>

						<label v-if="showSingleImageField" class="wf-meshy-field wf-meshy-field-wide">
							<span class="wf-meshy-label">{{ t('nodes.meshy.refImageUrl') }}</span>
							<input
								class="wf-meshy-input"
								type="text"
								:value="meshyImageUrl"
								:placeholder="t('nodes.meshy.refImageUrlPlaceholder')"
								@input="onImageUrlInput"
							/>
						</label>

						<label v-if="showMultiImageField" class="wf-meshy-field wf-meshy-field-wide">
							<span class="wf-meshy-label">{{ t('nodes.meshy.refImageUrlList') }}</span>
							<textarea
								class="wf-meshy-textarea compact"
								rows="3"
								:value="multiImageText"
								:placeholder="multiImagePlaceholder"
								@input="onMultiImageInput"
							/>
						</label>
					</div>
				</template>

				<div v-else class="wf-meshy-collapsed-note">
					{{ t('nodes.meshy.collapsedNote') }}
				</div>

				<div class="wf-meshy-actions">
					<div class="wf-meshy-hint-shell">
						<div class="wf-meshy-hint">{{ actionHint }}</div>
						<div class="wf-meshy-followup-row">
							<button
								class="wf-media-btn wf-media-btn-secondary"
								type="button"
								:disabled="!canTextureFollowup"
								:title="textureFollowupHint"
								@click.stop="emit('run-followup-meshy', 'texture')"
							>
								{{ textureFollowupLabel }}
							</button>
						</div>
						<div class="wf-meshy-followup-row">
							<button
								class="wf-media-btn wf-media-btn-secondary"
								type="button"
								:disabled="!canRefreshTask"
								@click.stop="emit('refresh-meshy-task')"
							>
								{{ t('nodes.meshy.refreshStatus') }}
							</button>
							<button
								class="wf-media-btn wf-media-btn-secondary"
								type="button"
								:disabled="!canPullOutput"
								@click.stop="emit('pull-meshy-output')"
							>
								{{ t('nodes.meshy.pullOutput') }}
							</button>
							<button
								class="wf-media-btn wf-media-btn-secondary"
								type="button"
								:disabled="!canRestartAsNewTask"
								@click.stop="emit('restart-meshy-task')"
							>
								{{ t('nodes.meshy.restartTask') }}
							</button>
						</div>
						<div class="wf-meshy-followup-row">
							<button
								class="wf-media-btn wf-media-btn-secondary"
								type="button"
								:disabled="!canStopTask"
								@click.stop="emit('stop-meshy-task')"
							>
								{{ t('nodes.meshy.stopTask') }}
							</button>
							<button
								class="wf-media-btn wf-media-btn-secondary"
								type="button"
								:disabled="!canDeleteTask"
								@click.stop="emit('delete-meshy-task')"
							>
								{{ t('nodes.meshy.deleteTask') }}
							</button>
						</div>
					</div>
					<button
						class="wf-media-btn"
						type="button"
						:disabled="!canGenerate"
						:title="generateDisabledReason"
						@click.stop="emit('generate-meshy')"
					>
						{{ generateButtonText }}
					</button>
				</div>
			</div>
		</template>
	</WorkflowNodeBase>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import WorkflowNodeBase from '../WorkflowNodeBase.vue'
import { sanitizeMeshyPreviewUrl } from '../../../views/AIWorkflow/node-business/meshy/useAIWorkflowMeshyAssets'
import type {
	WorkflowMeshyNodeSettings,
	WorkflowMeshyTaskFamily,
	WorkflowMeshyTaskTarget
} from '../../../aiworkflow/types'
import { useI18n } from '../../../i18n'

const { t } = useI18n()

type AnchorSpec = {
	id: string
	label?: string
	offsetY?: number
	mediaType?: 'generic' | 'image' | 'video' | 'text' | 'flow'
}

const props = defineProps<{
	nodeId: string
	title: string
	alias?: string
	nodeType: string
	subtitle?: string
	style?: Record<string, string>
	meshySettings?: WorkflowMeshyNodeSettings | null
	connectedPrompt?: string
	connectedImageUrls?: string[]
	sourcePreviewUrl?: string
	sourcePreviewLabel?: string
	width: number
	height: number
	zoom: number
	worldX: number
	worldY: number
	inputs?: AnchorSpec[]
	outputs?: AnchorSpec[]
	selected?: boolean
	hoverInputAnchorId?: string | null
	hoverOutputAnchorId?: string | null
}>()

const onStartLink = (payload: { nodeId: string; anchorId: string; anchorIndex: number; event: PointerEvent }) => { emit('start-link', payload) }
const onEndLink = (payload: { nodeId: string; anchorId: string; anchorIndex: number }) => { emit('end-link', payload) }
const onSetType = (type: 'base' | 'text' | 'text-merge' | 'image' | 'rotate-image' | 'video' | 'scene-understanding' | 'scene-decompose' | 'scene-layout' | 'unreal-export' | 'story' | 'comfyui' | 'model3d' | 'meshy' | 'blender') => { emit('set-type', type) }
const onResize = (payload: { width: number; height: number; worldX: number; worldY: number }) => { emit('resize', payload) }



const emit = defineEmits<{
	(e: 'update:worldX', v: number): void
	(e: 'update:worldY', v: number): void
	(e: 'update:worldPosition', p: { worldX: number; worldY: number }): void
	(e: 'select', nodeId: string): void
	(
		e: 'start-link',
		payload: {
			nodeId: string
			anchorId: string
			anchorIndex: number
			event: PointerEvent
		}
	): void
	(e: 'end-link', payload: { nodeId: string; anchorId: string; anchorIndex: number }): void
	(e: 'copy'): void
	(e: 'refresh'): void
	(e: 'delete'): void
	(
		e: 'set-type',
		v:
			| 'base'
			| 'text'
			| 'text-merge'
			| 'image'
			| 'rotate-image'
			| 'video'
			| 'scene-understanding'
			| 'scene-decompose'
			| 'scene-layout'
			| 'unreal-export'
			| 'story'
			| 'comfyui'
			| 'model3d'
			| 'meshy'
			| 'blender'
	): void
	(e: 'resize', payload: { width: number; height: number; worldX: number; worldY: number }): void
	(e: 'update-meshy-settings', payload: Partial<WorkflowMeshyNodeSettings>): void
	(e: 'generate-meshy'): void
	(e: 'run-followup-meshy', kind: 'texture'): void
	(e: 'restart-meshy-task'): void
	(e: 'refresh-meshy-task'): void
	(e: 'stop-meshy-task'): void
	(e: 'delete-meshy-task'): void
	(e: 'pull-meshy-output'): void
}>()

const settings = computed(() => props.meshySettings ?? null)
const showHeavyEditor = computed(() => props.selected === true)
const meshyTaskTarget = computed(
	() =>
		(String(settings.value?.meshyTaskTarget ?? '3d') === 'image'
			? 'image'
			: '3d') as WorkflowMeshyTaskTarget
)
const meshyTaskFamily = computed(
	() =>
		String(
			settings.value?.meshyTaskFamily ??
				(meshyTaskTarget.value === 'image' ? 'text-to-image' : 'text-to-3d')
		) as WorkflowMeshyTaskFamily
)
const meshyPrompt = computed(() => String(settings.value?.meshyPrompt ?? ''))
const meshyNegativePrompt = computed(() => String(settings.value?.meshyNegativePrompt ?? ''))
const meshyPreviewTaskId = computed(() => String(settings.value?.meshyPreviewTaskId ?? ''))
const meshyImageUrl = computed(() => String(settings.value?.meshyImageUrl ?? ''))
const meshyTexturePrompt = computed(() => String(settings.value?.meshyTexturePrompt ?? ''))
const meshyTextureImageUrl = computed(() => String(settings.value?.meshyTextureImageUrl ?? ''))
const meshyAiModel = computed(() => {
	const fallback = meshyTaskTarget.value === 'image' ? 'nano-banana' : 'latest'
	return String(settings.value?.meshyAiModel ?? fallback)
})
const meshyAspectRatio = computed(() => {
	if (meshyGenerateMultiView.value) return ''
	return String(settings.value?.meshyAspectRatio ?? '1:1')
})
const meshyGenerateMultiView = computed(() => settings.value?.meshyGenerateMultiView === true)
const meshyOutputImageCount = computed(() => {
	const n = Number(settings.value?.meshyOutputImageCount ?? 1)
	if (!Number.isFinite(n)) return 1
	return Math.max(1, Math.min(4, Math.floor(n)))
})
const imageOutputCountOptions = [1, 2, 3, 4]
const imageUnitPrice = computed(() => (meshyAiModel.value === 'nano-banana-pro' ? 9 : 3))
const imageEstimatedCost = computed(() => imageUnitPrice.value * meshyOutputImageCount.value)
const meshyImageInputCount = computed(() => {
	const n = Number(settings.value?.meshyImageInputCount ?? 5)
	if (!Number.isFinite(n)) return 5
	return Math.max(1, Math.min(5, Math.floor(n)))
})
const meshyPoseMode = computed(() => String(settings.value?.meshyPoseMode ?? ''))
const meshySeed = computed(() => Math.max(0, Number(settings.value?.meshySeed ?? 0) || 0))
const meshyModelType = computed(() => String(settings.value?.meshyModelType ?? 'standard'))
const meshyTopology = computed(() => String(settings.value?.meshyTopology ?? 'triangle'))
const meshyTargetPolycount = computed(() => {
	const n = Number(settings.value?.meshyTargetPolycount ?? 30000)
	if (!Number.isFinite(n)) return 30000
	return Math.max(100, Math.min(300000, Math.floor(n)))
})
const meshySymmetryMode = computed(() => {
	const v = String(settings.value?.meshySymmetryMode ?? 'auto').trim()
	return v === 'on' || v === 'off' ? v : 'auto'
})
const meshyShouldRemesh = computed(() => settings.value?.meshyShouldRemesh === true)
const meshySavePreRemeshedModel = computed(() => settings.value?.meshySavePreRemeshedModel === true)
const meshyShouldTexture = computed(() => settings.value?.meshyShouldTexture !== false)
const meshyEnablePbr = computed(() => settings.value?.meshyEnablePbr === true)
const meshyModeration = computed(() => settings.value?.meshyModeration === true)
const meshyImageEnhancement = computed(() => settings.value?.meshyImageEnhancement !== false)
const meshyRemoveLighting = computed(() => settings.value?.meshyRemoveLighting !== false)
const meshyAutoSize = computed(() => settings.value?.meshyAutoSize === true)
const meshyOriginAt = computed(() =>
	String(settings.value?.meshyOriginAt ?? 'bottom') === 'center' ? 'center' : 'bottom'
)
const targetFormatOptions = ['glb', 'obj', 'fbx', 'stl', 'usdz'] as const
type TargetFormat = (typeof targetFormatOptions)[number]
const isTargetFormat = (x: string): x is TargetFormat =>
	(targetFormatOptions as readonly string[]).includes(x)
const meshyTargetFormats = computed(() => {
	const list = Array.isArray(settings.value?.meshyTargetFormats)
		? settings.value!.meshyTargetFormats!
		: ['glb']
	const normalized = list
		.map((x) =>
			String(x ?? '')
				.trim()
				.toLowerCase()
		)
		.filter(isTargetFormat)
	return normalized.length ? normalized : ['glb']
})
const taskStatus = computed(() => String(settings.value?.meshyTaskStatus ?? 'idle'))
const taskProgress = computed(() => Number(settings.value?.meshyProgress ?? 0))
const taskId = computed(() => String(settings.value?.meshyTaskId ?? '').trim())
const relationKind = computed(
	() =>
		String(
			settings.value?.meshyRelationSummary?.effectiveRelationKind ??
				settings.value?.meshyRelationKind ??
				'model'
		).trim() || 'model'
)
const hasTextureChild = computed(
	() =>
		settings.value?.meshyRelationSummary?.hasTextureChild === true ||
		relationKind.value === 'texture'
)
const hasRiggingChild = computed(
	() =>
		settings.value?.meshyRelationSummary?.hasRiggingChild === true ||
		relationKind.value === 'rigging'
)
const hasAnimationChild = computed(
	() =>
		settings.value?.meshyRelationSummary?.hasAnimationChild === true ||
		relationKind.value === 'animation'
)
const thumbnailUrl = computed(() =>
	sanitizeMeshyPreviewUrl(String(settings.value?.meshyThumbnailUrl ?? '').trim())
)
const sourcePreviewUrl = computed(() =>
	sanitizeMeshyPreviewUrl(String(props.sourcePreviewUrl ?? '').trim())
)
const has3DModelOutput = computed(() => {
	if (meshyTaskTarget.value !== '3d') return false
	const localAssetUrl = String(
		settings.value?.meshyRelationSummary?.effectiveLocalAssetUrl ??
			settings.value?.meshyOutputAssetUrl ??
			settings.value?.meshyOutputSummary?.assetUrl ??
			''
	).trim()
	const preferredModelUrl = String(
		settings.value?.meshyRelationSummary?.effectivePreferredModelUrl ??
			settings.value?.meshyOutputSummary?.preferredUrl ??
			''
	).trim()
	return !!(localAssetUrl || preferredModelUrl)
})
const displayThumbnailUrl = computed(() => (has3DModelOutput.value ? '' : thumbnailUrl.value))
const displaySourcePreviewUrl = computed(() =>
	has3DModelOutput.value ? '' : sourcePreviewUrl.value
)
const failedThumbnailUrl = ref('')
const failedSourcePreviewUrl = ref('')
const safeDisplayThumbnailUrl = computed(() => {
	const v = String(displayThumbnailUrl.value || '').trim()
	if (!v) return ''
	return v === String(failedThumbnailUrl.value || '').trim() ? '' : v
})
const safeDisplaySourcePreviewUrl = computed(() => {
	const v = String(displaySourcePreviewUrl.value || '').trim()
	if (!v) return ''
	return v === String(failedSourcePreviewUrl.value || '').trim() ? '' : v
})

const onThumbnailError = (event: Event) => {
	const img = event.target as HTMLImageElement | null
	const failed = String(img?.currentSrc || img?.src || displayThumbnailUrl.value || '').trim()
	if (!failed) return
	failedThumbnailUrl.value = failed
}

const onSourcePreviewError = (event: Event) => {
	const img = event.target as HTMLImageElement | null
	const failed = String(img?.currentSrc || img?.src || displaySourcePreviewUrl.value || '').trim()
	if (!failed) return
	failedSourcePreviewUrl.value = failed
}

watch(
	() => displayThumbnailUrl.value,
	() => {
		failedThumbnailUrl.value = ''
	}
)

watch(
	() => displaySourcePreviewUrl.value,
	() => {
		failedSourcePreviewUrl.value = ''
	}
)
const sourcePreviewLabelText = computed(
	() => String(props.sourcePreviewLabel ?? t('nodes.meshy.sourceNotConnected')).trim() || t('nodes.meshy.sourceNotConnected')
)
const targetFormats = computed(() =>
	Array.isArray(settings.value?.meshyTargetFormats) && settings.value?.meshyTargetFormats?.length
		? settings.value.meshyTargetFormats!.join(', ')
		: 'glb'
)
const multiImageText = computed(() => (settings.value?.meshyImageUrls ?? []).join('\n'))
const connectedPromptText = computed(() => String(props.connectedPrompt ?? '').trim())
const connectedImageUrls = computed(() =>
	Array.isArray(props.connectedImageUrls)
		? props.connectedImageUrls.filter((x) => !!String(x ?? '').trim())
		: []
)

const familyOptions = computed(() => {
	if (meshyTaskTarget.value === 'image') {
		return [
			{ value: 'text-to-image', label: t('nodes.meshy.familyTextToImage') },
			{ value: 'image-to-image', label: t('nodes.meshy.familyImageToImage') }
		]
	}
	return [
		{ value: 'text-to-3d', label: t('nodes.meshy.familyTextTo3d') },
		{ value: 'image-to-3d', label: t('nodes.meshy.familyImageTo3d') },
		{ value: 'multi-image-to-3d', label: t('nodes.meshy.familyMultiImageTo3d') },
		{ value: 'refine', label: t('nodes.meshy.familyRefine') },
		{ value: 'remesh', label: t('nodes.meshy.familyRemesh') },
		{ value: 'retexture', label: t('nodes.meshy.familyRetexture') }
	]
})

const familyLabel = computed(() => {
	const map: Record<string, string> = {
		'text-to-3d': t('nodes.meshy.familyTextTo3d'),
		'image-to-3d': t('nodes.meshy.familyImageTo3d'),
		'multi-image-to-3d': t('nodes.meshy.familyMultiImageTo3d'),
		refine: t('nodes.meshy.familyRefine'),
		remesh: t('nodes.meshy.familyRemesh'),
		retexture: t('nodes.meshy.familyRetexture'),
		'text-to-image': t('nodes.meshy.familyTextToImage'),
		'image-to-image': t('nodes.meshy.familyImageToImage')
	}
	return map[meshyTaskFamily.value] ?? meshyTaskFamily.value
})
const targetTitle = computed(() =>
	meshyTaskTarget.value === 'image' ? t('nodes.meshy.targetTitleImage') : t('nodes.meshy.targetTitle3d')
)
const targetSubtitle = computed(() =>
	meshyTaskTarget.value === 'image'
		? t('nodes.meshy.targetSubtitleImage')
		: relationKind.value === 'texture'
			? t('nodes.meshy.targetSubtitle3dTexture')
			: t('nodes.meshy.targetSubtitle3d')
)

const showPromptField = computed(() => true)
const showNegativePromptField = computed(
	() => meshyTaskFamily.value === 'text-to-3d' || meshyTaskFamily.value === 'refine'
)
const showImageConfigTable = computed(
	() => meshyTaskFamily.value === 'text-to-image' || meshyTaskFamily.value === 'image-to-image'
)
const showModelTypeField = computed(
	() =>
		meshyTaskTarget.value === '3d' &&
		(meshyTaskFamily.value === 'text-to-3d' ||
			meshyTaskFamily.value === 'image-to-3d' ||
			meshyTaskFamily.value === 'multi-image-to-3d')
)
const showPreviewTaskField = computed(() => meshyTaskFamily.value === 'refine')
const showSingleImageField = computed(() => meshyTaskFamily.value === 'image-to-3d')
const showMultiImageField = computed(
	() => meshyTaskFamily.value === 'multi-image-to-3d' || meshyTaskFamily.value === 'image-to-image'
)
const isLowpolyModelType = computed(() => meshyModelType.value === 'lowpoly')
const modelTypeLabel = computed(() =>
	isLowpolyModelType.value ? t('aiConfig.meshModes.lowpoly') : t('aiConfig.meshModes.standard')
)
const modelTypeDocNote = computed(() =>
	isLowpolyModelType.value
		? t('nodes.meshy.meshModeNote', { mode: t('aiConfig.meshModes.lowpoly') })
		: t('nodes.meshy.meshModeNote', { mode: t('aiConfig.meshModes.standard') })
)

const multiImagePlaceholder = computed(() => {
	if (meshyTaskFamily.value === 'image-to-image') {
		return t('nodes.meshy.multiImagePlaceholderI2I')
	}
	return t('nodes.meshy.multiImagePlaceholderM2I')
})

const inputSummaryText = computed(() => {
	const promptState = connectedPromptText.value
		? t('nodes.meshy.inputTextConnected')
		: meshyPrompt.value.trim()
			? t('nodes.meshy.inputManualPrompt')
			: t('nodes.meshy.inputNoPrompt')
	const imageCount = connectedImageUrls.value.length
	if (meshyTaskTarget.value === 'image') {
		return imageCount
			? `${promptState}${t('nodes.meshy.inputImagesConnected', { count: imageCount })}`
			: `${promptState}${t('nodes.meshy.inputWaitingImages')}`
	}
	return imageCount
		? `${promptState}${t('nodes.meshy.inputRefImagesConnected', { count: imageCount })}`
		: `${promptState}${t('nodes.meshy.inputNoRefImages')}`
})

const outputSummaryText = computed(() =>
	meshyTaskTarget.value === 'image'
		? t('nodes.meshy.outputSummaryImage', { count: meshyOutputImageCount.value })
		: t('nodes.meshy.outputSummary3d')
)

const advancedSummaryText = computed(() =>
	meshyTaskTarget.value === 'image'
		? imageAdvancedSummaryText.value
		: `${meshyAiModel.value} / ${modelTypeLabel.value} / ${targetFormats.value}`
)
const imageAdvancedSummaryText = computed(() => {
	const ratio = meshyGenerateMultiView.value ? 'auto' : meshyAspectRatio.value
	return `${meshyAiModel.value} / ratio ${ratio} / multi-view ${
		meshyGenerateMultiView.value ? 'on' : 'off'
	}`
})

const relationSummaryText = computed(() => {
	const parts: string[] = []
	if (relationKind.value === 'texture') parts.push(t('nodes.meshy.relationTextured'))
	else if (relationKind.value === 'rigging') parts.push(t('nodes.meshy.relationRigged'))
	else if (relationKind.value === 'animation') parts.push(t('nodes.meshy.relationAnimated'))
	else parts.push(t('nodes.meshy.relationBaseModel'))
	if (hasTextureChild.value && relationKind.value !== 'texture') parts.push(t('nodes.meshy.hasTextureChild'))
	if (hasRiggingChild.value && relationKind.value !== 'rigging') parts.push(t('nodes.meshy.hasRiggingChild'))
	if (hasAnimationChild.value && relationKind.value !== 'animation') parts.push(t('nodes.meshy.hasAnimationChild'))
	return parts.join(' / ')
})

const statusLabel = computed(() => {
	if (taskStatus.value === 'running') return t('nodes.meshy.taskRunning')
	if (taskStatus.value === 'pending') return t('nodes.meshy.taskPending')
	if (taskStatus.value === 'succeeded') return t('nodes.meshy.taskSucceeded')
	if (taskStatus.value === 'failed') return t('nodes.meshy.taskFailed')
	if (taskStatus.value === 'canceled') return t('nodes.meshy.taskCanceled')
	return t('nodes.meshy.taskIdle')
})

const statusValue = computed(() => {
	if (taskStatus.value === 'running' || taskStatus.value === 'pending')
		return `${taskProgress.value}%`
	if (taskId.value) return taskId.value
	return familyLabel.value
})

const statusDetail = computed(() =>
	String(
		settings.value?.meshyStatusText ??
			settings.value?.meshyErrorMessage ??
			(meshyTaskTarget.value === 'image'
				? t('nodes.meshy.statusDetailImage')
				: t('nodes.meshy.statusDetail3d'))
	).trim()
)
const statusClass = computed(() => `is-${taskStatus.value}`)

const unsupportedReason = computed(() => {
	if (meshyTaskFamily.value === 'remesh') {
		return t('nodes.meshy.remeshUnsupported')
	}
	return ''
})

const generateDisabledReason = computed(() => {
	if (taskStatus.value === 'pending' || taskStatus.value === 'running') return t('nodes.meshy.errorTaskInProgress')
	if (unsupportedReason.value) return unsupportedReason.value
	if (!connectedPromptText.value && !meshyPrompt.value.trim()) return t('nodes.meshy.errorNoPrompt')
	if (meshyTaskFamily.value === 'text-to-image' || meshyTaskFamily.value === 'image-to-image') {
		if (
			meshyTaskFamily.value === 'text-to-image' &&
			meshyGenerateMultiView.value &&
			!!meshyAspectRatio.value
		)
			return t('nodes.meshy.errorMultiViewRatio')
		if (
			meshyTaskFamily.value === 'image-to-image' &&
			!connectedImageUrls.value.length &&
			!multiImageText.value.trim()
		) {
			return t('nodes.meshy.errorI2INoImage')
		}
	}
	if (meshyTaskFamily.value === 'refine' && !meshyPreviewTaskId.value.trim())
		return t('nodes.meshy.errorRefineNoId')
	if (
		meshyTaskFamily.value === 'image-to-3d' &&
		!connectedImageUrls.value.length &&
		!meshyImageUrl.value.trim()
	)
		return t('nodes.meshy.errorI2dNoImage')
	if (
		meshyTaskFamily.value === 'multi-image-to-3d' &&
		!connectedImageUrls.value.length &&
		!multiImageText.value.trim()
	)
		return t('nodes.meshy.errorM2INoImage')
	return ''
})
const canGenerate = computed(() => !generateDisabledReason.value)

const generateButtonText = computed(() => {
	if (taskStatus.value === 'pending') return t('nodes.meshy.queuing')
	if (taskStatus.value === 'running') return t('nodes.meshy.running')
	if (unsupportedReason.value) return t('nodes.meshy.pending')
	if (taskStatus.value === 'succeeded') return t('nodes.meshy.reExecute')
	return t('nodes.meshy.startTask')
})

const canTextureFollowup = computed(
	() => taskStatus.value === 'succeeded' && !!taskId.value && relationKind.value === 'model'
)
const canRefreshTask = computed(() => !!taskId.value)
const canStopTask = computed(
	() => !!taskId.value && (taskStatus.value === 'pending' || taskStatus.value === 'running')
)
const canDeleteTask = computed(() => !!taskId.value)
const canPullOutput = computed(
	() =>
		!!taskId.value &&
		(taskStatus.value === 'succeeded' ||
			taskStatus.value === 'running' ||
			taskStatus.value === 'pending')
)
const canRestartAsNewTask = computed(
	() => !!taskId.value && taskStatus.value !== 'pending' && taskStatus.value !== 'running'
)
const textureFollowupLabel = computed(() => (hasTextureChild.value ? t('nodes.meshy.textureAgain') : t('nodes.meshy.generateTexture')))
const textureFollowupHint = computed(() => {
	if (relationKind.value !== 'model') return t('nodes.meshy.textureHintNotBase')
	if (taskStatus.value !== 'succeeded') return t('nodes.meshy.textureHintNotSucceeded')
	if (!taskId.value) return t('nodes.meshy.textureHintNoId')
	return t('nodes.meshy.textureHintReady')
})

const actionHint = computed(() => {
	if (taskStatus.value === 'failed')
		return String(settings.value?.meshyErrorMessage ?? t('nodes.meshy.actionHintFailed'))
	if (unsupportedReason.value) return unsupportedReason.value
	if (relationKind.value === 'texture')
		return t('nodes.meshy.actionHintTexture')
	return meshyTaskTarget.value === 'image'
		? t('nodes.meshy.actionHintImage')
		: t('nodes.meshy.actionHint3d')
})

const updateSettings = (patch: Partial<WorkflowMeshyNodeSettings>) =>
	emit('update-meshy-settings', patch)

const onTargetSelect = (target: WorkflowMeshyTaskTarget) => {
	const family = target === 'image' ? 'text-to-image' : 'text-to-3d'
	updateSettings({
		meshyTaskTarget: target,
		meshyTaskFamily: family,
		meshyHelpTopic: family,
		...(target === 'image'
			? {
					meshyAiModel: 'nano-banana' as const,
					meshyAspectRatio: '1:1' as const,
					meshyGenerateMultiView: false,
					meshyOutputImageCount: 1 as const,
					meshyImageInputCount: 5
				}
			: {
					meshyAiModel: (['latest', 'meshy-6', 'meshy-5'].includes(
						String(settings.value?.meshyAiModel ?? '')
					)
						? String(settings.value?.meshyAiModel ?? 'latest')
						: 'latest') as WorkflowMeshyNodeSettings['meshyAiModel'],
					meshyModelType:
						String(settings.value?.meshyModelType ?? '') === 'lowpoly' ? 'lowpoly' : 'standard'
				})
	})
}

const onFamilyChange = (e: Event) => {
	const family = String(
		(e.target as HTMLSelectElement).value || 'text-to-3d'
	) as WorkflowMeshyTaskFamily
	const imageFamily = family === 'text-to-image' || family === 'image-to-image'
	updateSettings({
		meshyTaskFamily: family,
		meshyHelpTopic: family,
		...(imageFamily
			? {
					meshyAiModel: (['nano-banana', 'nano-banana-pro'].includes(
						String(settings.value?.meshyAiModel ?? '')
					)
						? String(settings.value?.meshyAiModel ?? 'nano-banana')
						: 'nano-banana') as WorkflowMeshyNodeSettings['meshyAiModel'],
					meshyOutputImageCount: (Number(settings.value?.meshyOutputImageCount ?? 1) >= 1
						? Math.max(
								1,
								Math.min(4, Math.floor(Number(settings.value?.meshyOutputImageCount ?? 1)))
							)
						: 1) as 1 | 2 | 3 | 4,
					meshyImageInputCount: family === 'image-to-image' ? 5 : 0
				}
			: {
					meshyAiModel: (['latest', 'meshy-6', 'meshy-5'].includes(
						String(settings.value?.meshyAiModel ?? '')
					)
						? String(settings.value?.meshyAiModel ?? 'latest')
						: 'latest') as WorkflowMeshyNodeSettings['meshyAiModel'],
					meshyModelType:
						String(settings.value?.meshyModelType ?? '') === 'lowpoly' ? 'lowpoly' : 'standard'
				})
	})
}

const onAiModelChange = (e: Event) => {
	const value = String((e.target as HTMLSelectElement).value ?? '').trim()
	updateSettings({
		meshyAiModel:
			value === 'nano-banana-pro'
				? 'nano-banana-pro'
				: value === 'nano-banana'
					? 'nano-banana'
					: value === 'meshy-5'
						? 'meshy-5'
						: value === 'meshy-6'
							? 'meshy-6'
							: 'latest'
	})
}

const onModelTypeChange = (e: Event) => {
	const value = String((e.target as HTMLSelectElement).value ?? '').trim()
	updateSettings({
		meshyModelType: value === 'lowpoly' ? 'lowpoly' : 'standard'
	})
}

const onAspectRatioChange = (e: Event) => {
	const value = String((e.target as HTMLSelectElement).value ?? '1:1').trim()
	if (!['1:1', '16:9', '9:16', '4:3', '3:4'].includes(value)) {
		updateSettings({ meshyAspectRatio: '1:1' })
		return
	}
	updateSettings({ meshyAspectRatio: value as WorkflowMeshyNodeSettings['meshyAspectRatio'] })
}

const onGenerateMultiViewToggle = (e: Event) => {
	const checked = (e.target as HTMLInputElement).checked === true
	updateSettings({
		meshyGenerateMultiView: checked,
		...(checked ? { meshyAspectRatio: undefined } : {})
	})
}

const onPoseModeChange = (e: Event) => {
	const value = String((e.target as HTMLSelectElement).value ?? '').trim()
	updateSettings({
		meshyPoseMode: (value === 'a-pose' || value === 't-pose'
			? value
			: '') as WorkflowMeshyNodeSettings['meshyPoseMode']
	})
}

const onTopologyChange = (e: Event) => {
	const value = String((e.target as HTMLSelectElement).value ?? '').trim()
	updateSettings({ meshyTopology: value === 'quad' ? 'quad' : 'triangle' })
}

const onTargetPolycountChange = (e: Event) => {
	const raw = Number((e.target as HTMLInputElement).value ?? 30000)
	const value = Number.isFinite(raw) ? Math.max(100, Math.min(300000, Math.floor(raw))) : 30000
	updateSettings({ meshyTargetPolycount: value })
}

const onSymmetryModeChange = (e: Event) => {
	const value = String((e.target as HTMLSelectElement).value ?? 'auto').trim()
	updateSettings({
		meshySymmetryMode: (value === 'on' || value === 'off'
			? value
			: 'auto') as WorkflowMeshyNodeSettings['meshySymmetryMode']
	})
}

const onShouldRemeshToggle = (e: Event) => {
	const checked = (e.target as HTMLInputElement).checked === true
	updateSettings({
		meshyShouldRemesh: checked,
		...(checked ? {} : { meshySavePreRemeshedModel: false })
	})
}

const onSavePreRemeshedToggle = (e: Event) => {
	const checked = (e.target as HTMLInputElement).checked === true
	updateSettings({ meshySavePreRemeshedModel: checked })
}

const onShouldTextureToggle = (e: Event) => {
	const checked = (e.target as HTMLInputElement).checked === true
	updateSettings({
		meshyShouldTexture: checked,
		...(checked ? {} : { meshyEnablePbr: false })
	})
}

const onEnablePbrToggle = (e: Event) => {
	const checked = (e.target as HTMLInputElement).checked === true
	updateSettings({ meshyEnablePbr: checked })
}

const onModerationToggle = (e: Event) => {
	const checked = (e.target as HTMLInputElement).checked === true
	updateSettings({ meshyModeration: checked })
}

const onImageEnhancementToggle = (e: Event) => {
	const checked = (e.target as HTMLInputElement).checked === true
	updateSettings({ meshyImageEnhancement: checked })
}

const onRemoveLightingToggle = (e: Event) => {
	const checked = (e.target as HTMLInputElement).checked === true
	updateSettings({ meshyRemoveLighting: checked })
}

const onAutoSizeToggle = (e: Event) => {
	const checked = (e.target as HTMLInputElement).checked === true
	updateSettings({
		meshyAutoSize: checked,
		...(checked ? {} : { meshyOriginAt: 'bottom' })
	})
}

const onOriginAtChange = (e: Event) => {
	const value = String((e.target as HTMLSelectElement).value ?? 'bottom').trim()
	updateSettings({ meshyOriginAt: value === 'center' ? 'center' : 'bottom' })
}

const onTargetFormatToggle = (format: (typeof targetFormatOptions)[number], e: Event) => {
	const checked = (e.target as HTMLInputElement).checked === true
	const current = [...meshyTargetFormats.value]
	const next = checked
		? Array.from(new Set([...current, format]))
		: current.filter((x) => x !== format)
	updateSettings({
		meshyTargetFormats: (next.length
			? next
			: ['glb']) as WorkflowMeshyNodeSettings['meshyTargetFormats']
	})
}

const onSeedChange = (e: Event) => {
	const raw = Number((e.target as HTMLInputElement).value ?? 0)
	updateSettings({ meshySeed: Math.max(0, Number.isFinite(raw) ? Math.floor(raw) : 0) })
}

const onOutputImageCountChange = (e: Event) => {
	const raw = Number((e.target as HTMLSelectElement).value ?? 1)
	const count = Number.isFinite(raw) ? Math.max(1, Math.min(4, Math.floor(raw))) : 1
	updateSettings({ meshyOutputImageCount: count as 1 | 2 | 3 | 4 })
}

const onPromptInput = (e: Event) =>
	updateSettings({ meshyPrompt: String((e.target as HTMLTextAreaElement).value ?? '') })
const onNegativePromptInput = (e: Event) =>
	updateSettings({
		meshyNegativePrompt: String((e.target as HTMLTextAreaElement).value ?? '')
	})
const onImageUrlInput = (e: Event) =>
	updateSettings({ meshyImageUrl: String((e.target as HTMLInputElement).value ?? '') })
const onPreviewTaskIdInput = (e: Event) =>
	updateSettings({
		meshyPreviewTaskId: String((e.target as HTMLInputElement).value ?? '')
	})
const onTexturePromptInput = (e: Event) =>
	updateSettings({
		meshyTexturePrompt: String((e.target as HTMLTextAreaElement).value ?? '')
	})
const onTextureImageUrlInput = (e: Event) =>
	updateSettings({
		meshyTextureImageUrl: String((e.target as HTMLInputElement).value ?? '')
	})
const onMultiImageInput = (e: Event) =>
	updateSettings({
		meshyImageUrls: String((e.target as HTMLTextAreaElement).value ?? '')
			.split(/\r?\n/)
			.map((x) => x.trim())
			.filter((x) => !!x)
			.slice(0, meshyTaskFamily.value === 'image-to-image' ? 5 : 4)
	})
</script>

<style scoped>
.wf-meshy-body,
.wf-meshy-footer {
	width: 100%;
	display: grid;
	gap: 10px;
}

.wf-meshy-hero {
	display: grid;
	grid-template-columns: minmax(0, 1fr) 176px;
	gap: 10px;
}

.wf-meshy-hero-copy,
.wf-meshy-status-card,
.wf-meshy-summary-card,
.wf-meshy-thumb-shell {
	border: 1px solid rgb(from var(--vscode-border) r g b / 0.85);
	background: linear-gradient(
		180deg,
		rgb(from var(--dweb-defualt-dark) r g b / 0.82),
		rgb(from var(--dweb-defualt) r g b / 0.76)
	);
	backdrop-filter: blur(8px);
}

.wf-meshy-hero-copy,
.wf-meshy-status-card,
.wf-meshy-summary-card,
.wf-meshy-thumb-shell {
	padding: 12px;
}

.wf-meshy-badge-row {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.wf-meshy-badge {
	width: fit-content;
	padding: 3px 8px;
	border: 1px solid rgb(90 180 255 / 0.55);
	color: #9ed2ff;
	font-size: 11px;
}

.wf-meshy-badge.subtle {
	border-color: rgb(from var(--vscode-border) r g b / 0.72);
	color: var(--vscode-fg-muted);
}

.wf-meshy-title {
	font-size: 15px;
	color: var(--vscode-fg);
}

.wf-meshy-subtitle,
.wf-meshy-status-detail,
.wf-meshy-hint,
.wf-meshy-summary-value {
	font-size: 12px;
	color: var(--vscode-fg-muted);
	line-height: 1.45;
}

.wf-meshy-status-label,
.wf-meshy-summary-label,
.wf-meshy-label {
	font-size: 11px;
	color: #9ec2dd;
	text-transform: uppercase;
	letter-spacing: 0.04em;
}

.wf-meshy-status-value,
.wf-meshy-summary-value {
	color: var(--vscode-fg);
	word-break: break-word;
}

.wf-meshy-status-card.is-running,
.wf-meshy-status-card.is-pending {
	box-shadow:
		0 0 0 1px rgb(90 180 255 / 0.24),
		0 0 18px rgb(90 180 255 / 0.18);
}

.wf-meshy-status-card.is-succeeded {
	box-shadow:
		0 0 0 1px rgb(56 189 140 / 0.24),
		0 0 18px rgb(56 189 140 / 0.16);
}

.wf-meshy-status-card.is-failed {
	box-shadow:
		0 0 0 1px rgb(248 113 113 / 0.24),
		0 0 18px rgb(248 113 113 / 0.16);
}

.wf-meshy-target-switch {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 8px;
}

.wf-meshy-target-btn,
.wf-media-btn {
	border: 1px solid rgb(from var(--vscode-border) r g b / 0.88);
	background: linear-gradient(
		180deg,
		rgb(from var(--dweb-defualt-dark) r g b / 0.78),
		rgb(from var(--dweb-defualt) r g b / 0.72)
	);
	color: var(--vscode-fg);
	padding: 8px 10px;
	font-size: 12px;
	cursor: pointer;
	backdrop-filter: blur(8px);
}

.wf-meshy-target-btn.active {
	border-color: rgb(90 180 255 / 0.72);
	box-shadow:
		0 0 0 1px rgb(90 180 255 / 0.18),
		0 0 16px rgb(90 180 255 / 0.12);
}

.wf-meshy-target-btn:hover,
.wf-media-btn:hover {
	border-color: var(--vscode-hover-border);
}

.wf-meshy-summary-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 10px;
}

.wf-meshy-preview-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 10px;
}

.wf-meshy-preview-card {
	display: grid;
	gap: 6px;
}

.wf-meshy-preview-label {
	font-size: 11px;
	color: #9ec2dd;
	text-transform: uppercase;
	letter-spacing: 0.04em;
}

.wf-meshy-preview-sub {
	font-size: 11px;
	color: var(--vscode-fg-muted);
	line-height: 1.35;
}

.wf-meshy-preview-empty {
	min-height: 130px;
	display: flex;
	align-items: center;
	justify-content: center;
	border: 1px dashed rgb(from var(--vscode-border) r g b / 0.68);
	color: var(--vscode-fg-muted);
	font-size: 12px;
}

.wf-meshy-summary-card {
	display: grid;
	gap: 6px;
}

.wf-meshy-thumb {
	display: block;
	width: 100%;
	max-height: 220px;
	object-fit: contain;
}

.wf-meshy-row {
	display: grid;
	gap: 10px;
}

.wf-meshy-collapsed-note {
	border: 1px dashed rgb(from var(--vscode-border) r g b / 0.68);
	background: rgb(from var(--dweb-defualt-dark) r g b / 0.42);
	color: var(--vscode-fg-muted);
	font-size: 12px;
	line-height: 1.45;
	padding: 10px 12px;
}

.wf-meshy-field {
	display: grid;
	gap: 6px;
}

.wf-meshy-config-card {
	border: 1px solid rgb(from var(--vscode-border) r g b / 0.85);
	background: rgb(from var(--dweb-defualt-dark) r g b / 0.54);
	padding: 10px;
	gap: 8px;
}

.wf-meshy-config-table {
	width: 100%;
	border-collapse: collapse;
	table-layout: fixed;
}

.wf-meshy-config-table th,
.wf-meshy-config-table td {
	border: 1px solid rgb(from var(--vscode-border) r g b / 0.68);
	padding: 6px 8px;
	vertical-align: middle;
}

.wf-meshy-config-table th {
	width: 38%;
	text-align: left;
	color: #9ec2dd;
	font-size: 11px;
	font-weight: 500;
	letter-spacing: 0.04em;
	text-transform: uppercase;
}

.wf-meshy-switch-row {
	display: flex;
	align-items: center;
	gap: 8px;
	font-size: 12px;
	color: var(--vscode-fg);
}

.wf-meshy-config-note {
	font-size: 11px;
	color: var(--vscode-fg-muted);
	line-height: 1.4;
}

.wf-meshy-static-value {
	min-height: 34px;
	display: flex;
	align-items: center;
	color: var(--vscode-fg);
	font-size: 12px;
}

.wf-meshy-static-copy {
	align-items: flex-start;
	line-height: 1.45;
}

.wf-meshy-config-inline {
	margin-top: 6px;
	font-size: 11px;
	color: var(--vscode-fg-muted);
}

.wf-meshy-field-wide {
	grid-column: 1 / -1;
}

.wf-meshy-input,
.wf-meshy-textarea {
	width: 100%;
	box-sizing: border-box;
	border: 1px solid rgb(from var(--vscode-border) r g b / 0.85);
	background: rgb(from var(--dweb-defualt-dark) r g b / 0.72);
	color: var(--vscode-fg);
	padding: 8px 10px;
	font-size: 12px;
	border-radius: 0;
}

.wf-meshy-textarea {
	resize: vertical;
	min-height: 76px;
}

.wf-meshy-textarea.compact {
	min-height: 60px;
}

.wf-meshy-format-grid {
	display: grid;
	grid-template-columns: repeat(3, minmax(0, 1fr));
	gap: 6px;
}

.wf-meshy-format-item {
	justify-content: flex-start;
}

.wf-meshy-actions {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
}

.wf-meshy-hint-shell {
	min-width: 0;
	display: grid;
	gap: 8px;
}

.wf-meshy-followup-row {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.wf-media-btn-secondary {
	padding: 6px 8px;
	font-size: 11px;
}

.wf-media-btn:disabled {
	opacity: 0.58;
	cursor: not-allowed;
}

@media (max-width: 720px) {
	.wf-meshy-hero,
	.wf-meshy-summary-grid,
	.wf-meshy-target-switch,
	.wf-meshy-preview-grid,
	.wf-meshy-format-grid {
		grid-template-columns: 1fr;
	}
}
</style>
