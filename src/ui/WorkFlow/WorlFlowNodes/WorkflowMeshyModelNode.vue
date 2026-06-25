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
    @update:worldX="(v) => emit('update:worldX', v)"
    @update:worldY="(v) => emit('update:worldY', v)"
    @select="(id) => emit('select', id)"
    @start-link="(payload: any) => emit('start-link', payload)"
    @end-link="(payload: any) => emit('end-link', payload)"
    @copy="() => emit('copy')"
    @refresh="() => emit('refresh')"
    @delete="() => emit('delete')"
    @set-type="(type: any) => emit('set-type', type)"
    @resize="(payload: any) => emit('resize', payload)"
  >
    <template #body>
      <div class="wf-meshy-body" @pointerdown.stop>
        <div class="wf-meshy-hero">
          <div class="wf-meshy-hero-copy">
            <div class="wf-meshy-badge-row">
              <div class="wf-meshy-badge">Meshy</div>
              <div class="wf-meshy-badge subtle">任务工作站</div>
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
            3D 主链路
          </button>
          <button
            type="button"
            class="wf-meshy-target-btn"
            :class="{ active: meshyTaskTarget === 'image' }"
            @click.stop="onTargetSelect('image')"
          >
            图像链路
          </button>
        </div>

        <div class="wf-meshy-summary-grid">
          <div class="wf-meshy-summary-card">
            <div class="wf-meshy-summary-label">当前任务族</div>
            <div class="wf-meshy-summary-value">{{ familyLabel }}</div>
          </div>
          <div class="wf-meshy-summary-card">
            <div class="wf-meshy-summary-label">当前阶段</div>
            <div class="wf-meshy-summary-value">{{ relationSummaryText }}</div>
          </div>
          <div class="wf-meshy-summary-card">
            <div class="wf-meshy-summary-label">输入摘要</div>
            <div class="wf-meshy-summary-value">{{ inputSummaryText }}</div>
          </div>
          <div class="wf-meshy-summary-card">
            <div class="wf-meshy-summary-label">输出锚点</div>
            <div class="wf-meshy-summary-value">{{ outputSummaryText }}</div>
          </div>
          <div class="wf-meshy-summary-card">
            <div class="wf-meshy-summary-label">高级参数</div>
            <div class="wf-meshy-summary-value">{{ advancedSummaryText }}</div>
          </div>
        </div>

        <div v-if="meshyTaskTarget === '3d'" class="wf-meshy-preview-grid">
          <div class="wf-meshy-thumb-shell wf-meshy-preview-card">
            <div class="wf-meshy-preview-label">来源预览（首个蓝色输入锚点）</div>
            <div class="wf-meshy-preview-sub">{{ sourcePreviewLabelText }}</div>
            <img
              v-if="safeDisplaySourcePreviewUrl"
              class="wf-meshy-thumb"
              :src="safeDisplaySourcePreviewUrl"
              alt="meshy source preview"
              @error="onSourcePreviewError"
            />
            <div v-else class="wf-meshy-preview-empty">当前来源暂无可用预览图</div>
          </div>
          <div class="wf-meshy-thumb-shell wf-meshy-preview-card">
            <div class="wf-meshy-preview-label">Meshy 返回预览</div>
            <div class="wf-meshy-preview-sub">用于确认当前任务结果是否已更新</div>
            <img
              v-if="safeDisplayThumbnailUrl"
              class="wf-meshy-thumb"
              :src="safeDisplayThumbnailUrl"
              alt="meshy output preview"
              @error="onThumbnailError"
            />
            <div v-else class="wf-meshy-preview-empty">任务未返回缩略图</div>
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
              <span class="wf-meshy-label">任务族</span>
              <select
                class="wf-meshy-input"
                :value="meshyTaskFamily"
                @change="onFamilyChange"
              >
                <option
                  v-for="item in familyOptions"
                  :key="item.value"
                  :value="item.value"
                >
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
              <span class="wf-meshy-label">图像链路参数表</span>
              <table class="wf-meshy-config-table">
                <tbody>
                  <tr>
                    <th>生成模型</th>
                    <td>
                      <select
                        class="wf-meshy-input"
                        :value="meshyAiModel"
                        @change="onAiModelChange"
                      >
                        <option value="nano-banana">nano-banana（标准）</option>
                        <option value="nano-banana-pro">nano-banana-pro（高质量）</option>
                      </select>
                    </td>
                  </tr>
                  <tr>
                    <th>输出图片数量</th>
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
                          {{ count }} 张
                        </option>
                      </select>
                      <div class="wf-meshy-config-inline">
                        将生成 {{ meshyOutputImageCount }} 个输出锚点（out-image-1 ~
                        out-image-{{ meshyOutputImageCount }}）
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <th>积分预估</th>
                    <td>
                      <div class="wf-meshy-static-value">
                        单价 {{ imageUnitPrice }} 积分/张，预计消耗
                        {{ imageEstimatedCost }} 积分
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <th>是否多视图</th>
                    <td>
                      <label class="wf-meshy-switch-row">
                        <input
                          type="checkbox"
                          :checked="meshyGenerateMultiView"
                          @change="onGenerateMultiViewToggle"
                        />
                        <span>{{ meshyGenerateMultiView ? "开启" : "关闭" }}</span>
                      </label>
                    </td>
                  </tr>
                  <tr>
                    <th>比例（Aspect Ratio）</th>
                    <td>
                      <select
                        class="wf-meshy-input"
                        :value="meshyAspectRatio"
                        :disabled="meshyGenerateMultiView"
                        @change="onAspectRatioChange"
                      >
                        <option v-if="meshyGenerateMultiView" value="">
                          Auto (multi-view)
                        </option>
                        <option value="1:1">1:1</option>
                        <option value="16:9">16:9</option>
                        <option value="9:16">9:16</option>
                        <option value="4:3">4:3</option>
                        <option value="3:4">3:4</option>
                      </select>
                    </td>
                  </tr>
                  <tr>
                    <th>姿势（Pose）</th>
                    <td>
                      <select
                        class="wf-meshy-input"
                        :value="meshyPoseMode"
                        @change="onPoseModeChange"
                      >
                        <option value="">无</option>
                        <option value="a-pose">A Pose</option>
                        <option value="t-pose">T Pose</option>
                      </select>
                    </td>
                  </tr>
                  <tr v-if="meshyTaskFamily === 'image-to-image'">
                    <th>参考图输入锚点数量</th>
                    <td>
                      <div class="wf-meshy-static-value">
                        固定 5 路（匹配 Meshy image-to-image API）
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
                        placeholder="0 表示由后端自动随机"
                        @change="onSeedChange"
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
              <div class="wf-meshy-config-note">
                注：根据 Meshy 官方文档，开启多视图时不允许同时设置比例；image-to-image
                参考图支持最多 5 张。
              </div>
            </div>

            <div
              v-if="showModelTypeField"
              class="wf-meshy-field wf-meshy-field-wide wf-meshy-config-card"
            >
              <span class="wf-meshy-label">3D 生成参数表</span>
              <table class="wf-meshy-config-table">
                <tbody>
                  <tr>
                    <th>模型版本 (ai_model)</th>
                    <td>
                      <select
                        class="wf-meshy-input"
                        :value="meshyAiModel"
                        @change="onAiModelChange"
                      >
                        <option value="latest">latest (Meshy 6)</option>
                        <option value="meshy-6">meshy-6</option>
                        <option value="meshy-5">meshy-5</option>
                      </select>
                      <div class="wf-meshy-config-inline">
                        文档可选值：meshy-5 / meshy-6 / latest。
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <th>网格模式</th>
                    <td>
                      <select
                        class="wf-meshy-input"
                        :value="meshyModelType"
                        @change="onModelTypeChange"
                      >
                        <option value="standard">标准 Standard</option>
                        <option value="lowpoly">低模 Low Poly</option>
                      </select>
                      <div class="wf-meshy-config-inline">
                        当前：{{ modelTypeLabel }}。lowpoly 时 ai_model / topology /
                        target_polycount / should_remesh / save_pre_remeshed_model
                        会被忽略。
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <th>拓扑 (topology)</th>
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
                        当 should_remesh=false 时，该参数会被服务端忽略。
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <th>目标面数 (target_polycount)</th>
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
                        文档范围：100 - 300000，仅在 remesh 阶段生效。
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <th>对称模式 (symmetry_mode)</th>
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
                      <div class="wf-meshy-config-inline">
                        auto 会根据输入几何自动判断对称性。
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <th>重建网格 (should_remesh)</th>
                    <td>
                      <label class="wf-meshy-switch-row">
                        <input
                          type="checkbox"
                          :disabled="isLowpolyModelType"
                          :checked="meshyShouldRemesh"
                          @change="onShouldRemeshToggle"
                        />
                        <span>{{ meshyShouldRemesh ? "开启" : "关闭" }}</span>
                      </label>
                      <div class="wf-meshy-config-inline">
                        关闭后直接返回高精度三角网格，topology 与 target_polycount
                        不再生效。
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <th>保留重建前模型</th>
                    <td>
                      <label class="wf-meshy-switch-row">
                        <input
                          type="checkbox"
                          :disabled="isLowpolyModelType || !meshyShouldRemesh"
                          :checked="meshySavePreRemeshedModel"
                          @change="onSavePreRemeshedToggle"
                        />
                        <span>{{ meshySavePreRemeshedModel ? "开启" : "关闭" }}</span>
                      </label>
                      <div class="wf-meshy-config-inline">
                        对应 save_pre_remeshed_model，仅 should_remesh=true 时生效。
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <th>生成贴图 (should_texture)</th>
                    <td>
                      <label class="wf-meshy-switch-row">
                        <input
                          type="checkbox"
                          :checked="meshyShouldTexture"
                          @change="onShouldTextureToggle"
                        />
                        <span>{{ meshyShouldTexture ? "开启" : "关闭" }}</span>
                      </label>
                      <div class="wf-meshy-config-inline">
                        关闭时仅生成网格；enable_pbr 与贴图引导参数将自动失效。
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <th>PBR 材质 (enable_pbr)</th>
                    <td>
                      <label class="wf-meshy-switch-row">
                        <input
                          type="checkbox"
                          :disabled="!meshyShouldTexture"
                          :checked="meshyEnablePbr"
                          @change="onEnablePbrToggle"
                        />
                        <span>{{ meshyEnablePbr ? "开启" : "关闭" }}</span>
                      </label>
                      <div class="wf-meshy-config-inline">
                        开启后输出 base_color + metallic + roughness + normal。
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <th>贴图提示词 (texture_prompt)</th>
                    <td>
                      <textarea
                        class="wf-meshy-textarea compact"
                        rows="2"
                        :disabled="!meshyShouldTexture"
                        :value="meshyTexturePrompt"
                        placeholder="可选。最多 600 字符。"
                        @input="onTexturePromptInput"
                      />
                      <div class="wf-meshy-config-inline">
                        文档说明：与 texture_image_url 同时提供时，优先使用
                        texture_prompt。
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <th>贴图参考图 (texture_image_url)</th>
                    <td>
                      <input
                        class="wf-meshy-input"
                        type="text"
                        :disabled="!meshyShouldTexture"
                        :value="meshyTextureImageUrl"
                        placeholder="可选。支持 URL 或 Data URI。"
                        @input="onTextureImageUrlInput"
                      />
                      <div class="wf-meshy-config-inline">
                        用于引导材质风格；与 texture_prompt 二选一更清晰。
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <th>姿势模式 (pose_mode)</th>
                    <td>
                      <select
                        class="wf-meshy-input"
                        :value="meshyPoseMode"
                        @change="onPoseModeChange"
                      >
                        <option value="">无</option>
                        <option value="a-pose">a-pose</option>
                        <option value="t-pose">t-pose</option>
                      </select>
                      <div class="wf-meshy-config-inline">替代已废弃的 is_a_t_pose。</div>
                    </td>
                  </tr>
                  <tr>
                    <th>自动尺寸 (auto_size)</th>
                    <td>
                      <label class="wf-meshy-switch-row">
                        <input
                          type="checkbox"
                          :checked="meshyAutoSize"
                          @change="onAutoSizeToggle"
                        />
                        <span>{{ meshyAutoSize ? "开启" : "关闭" }}</span>
                      </label>
                      <div class="wf-meshy-config-inline">
                        开启后由服务自动估算真实高度。
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <th>原点位置 (origin_at)</th>
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
                        仅 auto_size=true 时有效，文档默认 bottom。
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <th>内容审核 (moderation)</th>
                    <td>
                      <label class="wf-meshy-switch-row">
                        <input
                          type="checkbox"
                          :checked="meshyModeration"
                          @change="onModerationToggle"
                        />
                        <span>{{ meshyModeration ? "开启" : "关闭" }}</span>
                      </label>
                      <div class="wf-meshy-config-inline">
                        会审核 image_url / texture_image_url / texture_prompt。
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <th>图像增强 (image_enhancement)</th>
                    <td>
                      <label class="wf-meshy-switch-row">
                        <input
                          type="checkbox"
                          :checked="meshyImageEnhancement"
                          @change="onImageEnhancementToggle"
                        />
                        <span>{{ meshyImageEnhancement ? "开启" : "关闭" }}</span>
                      </label>
                      <div class="wf-meshy-config-inline">
                        仅 ai_model 为 meshy-6 / latest 时支持。
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <th>去除光照烘焙 (remove_lighting)</th>
                    <td>
                      <label class="wf-meshy-switch-row">
                        <input
                          type="checkbox"
                          :checked="meshyRemoveLighting"
                          @change="onRemoveLightingToggle"
                        />
                        <span>{{ meshyRemoveLighting ? "开启" : "关闭" }}</span>
                      </label>
                      <div class="wf-meshy-config-inline">
                        使 base color 更纯净，便于在引擎内重打光。
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <th>输出格式 (target_formats)</th>
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
                        省略时服务端会返回全部支持格式。建议至少保留 glb。
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
                        placeholder="0 表示由后端自动随机"
                        @change="onSeedChange"
                      />
                      <div class="wf-meshy-config-inline">
                        用于复现；同输入与同 seed 时结果更稳定。
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <label v-if="showPromptField" class="wf-meshy-field wf-meshy-field-wide">
              <span class="wf-meshy-label">提示词</span>
              <textarea
                class="wf-meshy-textarea"
                rows="3"
                :value="meshyPrompt"
                placeholder="可直接填写，也可以由文本节点连入。若存在文本输入锚点连接，将优先使用上游文本。"
                @input="onPromptInput"
              />
            </label>

            <label
              v-if="showNegativePromptField"
              class="wf-meshy-field wf-meshy-field-wide"
            >
              <span class="wf-meshy-label">负向提示词</span>
              <textarea
                class="wf-meshy-textarea compact"
                rows="2"
                :value="meshyNegativePrompt"
                placeholder="例如：low quality, low poly, ugly"
                @input="onNegativePromptInput"
              />
            </label>

            <label v-if="showPreviewTaskField" class="wf-meshy-field wf-meshy-field-wide">
              <span class="wf-meshy-label">Preview Task ID</span>
              <input
                class="wf-meshy-input"
                type="text"
                :value="meshyPreviewTaskId"
                placeholder="018a..."
                @input="onPreviewTaskIdInput"
              />
            </label>

            <label v-if="showSingleImageField" class="wf-meshy-field wf-meshy-field-wide">
              <span class="wf-meshy-label">参考图 URL</span>
              <input
                class="wf-meshy-input"
                type="text"
                :value="meshyImageUrl"
                placeholder="可直接填写，也可由参考图锚点输入覆盖。"
                @input="onImageUrlInput"
              />
            </label>

            <label v-if="showMultiImageField" class="wf-meshy-field wf-meshy-field-wide">
              <span class="wf-meshy-label">参考图 URL 列表</span>
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
          当前为性能折叠视图，选中该节点后显示完整参数表单。
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
                刷新状态
              </button>
              <button
                class="wf-media-btn wf-media-btn-secondary"
                type="button"
                :disabled="!canPullOutput"
                @click.stop="emit('pull-meshy-output')"
              >
                拉取产物
              </button>
              <button
                class="wf-media-btn wf-media-btn-secondary"
                type="button"
                :disabled="!canRestartAsNewTask"
                @click.stop="emit('restart-meshy-task')"
              >
                重开新任务
              </button>
            </div>
            <div class="wf-meshy-followup-row">
              <button
                class="wf-media-btn wf-media-btn-secondary"
                type="button"
                :disabled="!canStopTask"
                @click.stop="emit('stop-meshy-task')"
              >
                停止任务
              </button>
              <button
                class="wf-media-btn wf-media-btn-secondary"
                type="button"
                :disabled="!canDeleteTask"
                @click.stop="emit('delete-meshy-task')"
              >
                删除任务
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
import { computed, ref, watch } from "vue";
import WorkflowNodeBase from "../WorkflowNodeBase.vue";
import { sanitizeMeshyPreviewUrl } from "../../../views/AIWorkflow/node-business/meshy/useAIWorkflowMeshyAssets";
import type {
  WorkflowMeshyNodeSettings,
  WorkflowMeshyTaskFamily,
  WorkflowMeshyTaskTarget,
} from "../../../aiworkflow/types";

type AnchorSpec = {
  id: string;
  label?: string;
  offsetY?: number;
  mediaType?: "generic" | "image" | "video" | "text" | "flow";
};

const props = defineProps<{
  nodeId: string;
  title: string;
  alias?: string;
  nodeType: string;
  subtitle?: string;
  style?: Record<string, string>;
  meshySettings?: WorkflowMeshyNodeSettings | null;
  connectedPrompt?: string;
  connectedImageUrls?: string[];
  sourcePreviewUrl?: string;
  sourcePreviewLabel?: string;
  width: number;
  height: number;
  zoom: number;
  worldX: number;
  worldY: number;
  inputs?: AnchorSpec[];
  outputs?: AnchorSpec[];
  selected?: boolean;
  hoverInputAnchorId?: string | null;
  hoverOutputAnchorId?: string | null;
}>();

const emit = defineEmits<{
  (e: "update:worldX", v: number): void;
  (e: "update:worldY", v: number): void;
  (e: "select", nodeId: string): void;
  (
    e: "start-link",
    payload: {
      nodeId: string;
      anchorId: string;
      anchorIndex: number;
      event: PointerEvent;
    }
  ): void;
  (
    e: "end-link",
    payload: { nodeId: string; anchorId: string; anchorIndex: number }
  ): void;
  (e: "copy"): void;
  (e: "refresh"): void;
  (e: "delete"): void;
  (
    e: "set-type",
    v:
      | "base"
      | "text"
      | "text-merge"
      | "image"
      | "rotate-image"
      | "video"
      | "scene-understanding"
      | "scene-decompose"
      | "scene-layout"
      | "unreal-export"
      | "story"
      | "comfyui"
      | "model3d"
      | "meshy"
  ): void;
  (
    e: "resize",
    payload: { width: number; height: number; worldX: number; worldY: number }
  ): void;
  (e: "update-meshy-settings", payload: Partial<WorkflowMeshyNodeSettings>): void;
  (e: "generate-meshy"): void;
  (e: "run-followup-meshy", kind: "texture"): void;
  (e: "restart-meshy-task"): void;
  (e: "refresh-meshy-task"): void;
  (e: "stop-meshy-task"): void;
  (e: "delete-meshy-task"): void;
  (e: "pull-meshy-output"): void;
}>();

const settings = computed(() => props.meshySettings ?? null);
const showHeavyEditor = computed(() => props.selected === true);
const meshyTaskTarget = computed(
  () =>
    (String(settings.value?.meshyTaskTarget ?? "3d") === "image"
      ? "image"
      : "3d") as WorkflowMeshyTaskTarget
);
const meshyTaskFamily = computed(
  () =>
    String(
      settings.value?.meshyTaskFamily ??
        (meshyTaskTarget.value === "image" ? "text-to-image" : "text-to-3d")
    ) as WorkflowMeshyTaskFamily
);
const meshyPrompt = computed(() => String(settings.value?.meshyPrompt ?? ""));
const meshyNegativePrompt = computed(() =>
  String(settings.value?.meshyNegativePrompt ?? "")
);
const meshyPreviewTaskId = computed(() =>
  String(settings.value?.meshyPreviewTaskId ?? "")
);
const meshyImageUrl = computed(() => String(settings.value?.meshyImageUrl ?? ""));
const meshyTexturePrompt = computed(() =>
  String(settings.value?.meshyTexturePrompt ?? "")
);
const meshyTextureImageUrl = computed(() =>
  String(settings.value?.meshyTextureImageUrl ?? "")
);
const meshyAiModel = computed(() => {
  const fallback = meshyTaskTarget.value === "image" ? "nano-banana" : "latest";
  return String(settings.value?.meshyAiModel ?? fallback);
});
const meshyAspectRatio = computed(() => {
  if (meshyGenerateMultiView.value) return "";
  return String(settings.value?.meshyAspectRatio ?? "1:1");
});
const meshyGenerateMultiView = computed(
  () => settings.value?.meshyGenerateMultiView === true
);
const meshyOutputImageCount = computed(() => {
  const n = Number(settings.value?.meshyOutputImageCount ?? 1);
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(4, Math.floor(n)));
});
const imageOutputCountOptions = [1, 2, 3, 4];
const imageUnitPrice = computed(() => (meshyAiModel.value === "nano-banana-pro" ? 9 : 3));
const imageEstimatedCost = computed(
  () => imageUnitPrice.value * meshyOutputImageCount.value
);
const meshyImageInputCount = computed(() => {
  const n = Number(settings.value?.meshyImageInputCount ?? 5);
  if (!Number.isFinite(n)) return 5;
  return Math.max(1, Math.min(5, Math.floor(n)));
});
const meshyPoseMode = computed(() => String(settings.value?.meshyPoseMode ?? ""));
const meshySeed = computed(() =>
  Math.max(0, Number(settings.value?.meshySeed ?? 0) || 0)
);
const meshyModelType = computed(() =>
  String(settings.value?.meshyModelType ?? "standard")
);
const meshyTopology = computed(() => String(settings.value?.meshyTopology ?? "triangle"));
const meshyTargetPolycount = computed(() => {
  const n = Number(settings.value?.meshyTargetPolycount ?? 30000);
  if (!Number.isFinite(n)) return 30000;
  return Math.max(100, Math.min(300000, Math.floor(n)));
});
const meshySymmetryMode = computed(() => {
  const v = String(settings.value?.meshySymmetryMode ?? "auto").trim();
  return v === "on" || v === "off" ? v : "auto";
});
const meshyShouldRemesh = computed(() => settings.value?.meshyShouldRemesh === true);
const meshySavePreRemeshedModel = computed(
  () => settings.value?.meshySavePreRemeshedModel === true
);
const meshyShouldTexture = computed(() => settings.value?.meshyShouldTexture !== false);
const meshyEnablePbr = computed(() => settings.value?.meshyEnablePbr === true);
const meshyModeration = computed(() => settings.value?.meshyModeration === true);
const meshyImageEnhancement = computed(
  () => settings.value?.meshyImageEnhancement !== false
);
const meshyRemoveLighting = computed(() => settings.value?.meshyRemoveLighting !== false);
const meshyAutoSize = computed(() => settings.value?.meshyAutoSize === true);
const meshyOriginAt = computed(() =>
  String(settings.value?.meshyOriginAt ?? "bottom") === "center" ? "center" : "bottom"
);
const targetFormatOptions = ["glb", "obj", "fbx", "stl", "usdz"] as const;
const meshyTargetFormats = computed(() => {
  const list = Array.isArray(settings.value?.meshyTargetFormats)
    ? settings.value!.meshyTargetFormats!
    : ["glb"];
  const normalized = list
    .map((x) =>
      String(x ?? "")
        .trim()
        .toLowerCase()
    )
    .filter((x) => targetFormatOptions.includes(x as any));
  return normalized.length
    ? (normalized as Array<typeof targetFormatOptions[number]>)
    : ["glb"];
});
const taskStatus = computed(() => String(settings.value?.meshyTaskStatus ?? "idle"));
const taskProgress = computed(() => Number(settings.value?.meshyProgress ?? 0));
const taskId = computed(() => String(settings.value?.meshyTaskId ?? "").trim());
const relationKind = computed(
  () =>
    String(
      settings.value?.meshyRelationSummary?.effectiveRelationKind ??
        settings.value?.meshyRelationKind ??
        "model"
    ).trim() || "model"
);
const hasTextureChild = computed(
  () =>
    settings.value?.meshyRelationSummary?.hasTextureChild === true ||
    relationKind.value === "texture"
);
const hasRiggingChild = computed(
  () =>
    settings.value?.meshyRelationSummary?.hasRiggingChild === true ||
    relationKind.value === "rigging"
);
const hasAnimationChild = computed(
  () =>
    settings.value?.meshyRelationSummary?.hasAnimationChild === true ||
    relationKind.value === "animation"
);
const thumbnailUrl = computed(() =>
  sanitizeMeshyPreviewUrl(String(settings.value?.meshyThumbnailUrl ?? "").trim())
);
const sourcePreviewUrl = computed(() =>
  sanitizeMeshyPreviewUrl(String(props.sourcePreviewUrl ?? "").trim())
);
const has3DModelOutput = computed(() => {
  if (meshyTaskTarget.value !== "3d") return false;
  const localAssetUrl = String(
    settings.value?.meshyRelationSummary?.effectiveLocalAssetUrl ??
      settings.value?.meshyOutputAssetUrl ??
      settings.value?.meshyOutputSummary?.assetUrl ??
      ""
  ).trim();
  const preferredModelUrl = String(
    settings.value?.meshyRelationSummary?.effectivePreferredModelUrl ??
      settings.value?.meshyOutputSummary?.preferredUrl ??
      ""
  ).trim();
  return !!(localAssetUrl || preferredModelUrl);
});
const displayThumbnailUrl = computed(() =>
  has3DModelOutput.value ? "" : thumbnailUrl.value
);
const displaySourcePreviewUrl = computed(() =>
  has3DModelOutput.value ? "" : sourcePreviewUrl.value
);
const failedThumbnailUrl = ref("");
const failedSourcePreviewUrl = ref("");
const safeDisplayThumbnailUrl = computed(() => {
  const v = String(displayThumbnailUrl.value || "").trim();
  if (!v) return "";
  return v === String(failedThumbnailUrl.value || "").trim() ? "" : v;
});
const safeDisplaySourcePreviewUrl = computed(() => {
  const v = String(displaySourcePreviewUrl.value || "").trim();
  if (!v) return "";
  return v === String(failedSourcePreviewUrl.value || "").trim() ? "" : v;
});

const onThumbnailError = (event: Event) => {
  const img = event.target as HTMLImageElement | null;
  const failed = String(img?.currentSrc || img?.src || displayThumbnailUrl.value || "").trim();
  if (!failed) return;
  failedThumbnailUrl.value = failed;
};

const onSourcePreviewError = (event: Event) => {
  const img = event.target as HTMLImageElement | null;
  const failed = String(img?.currentSrc || img?.src || displaySourcePreviewUrl.value || "").trim();
  if (!failed) return;
  failedSourcePreviewUrl.value = failed;
};

watch(
  () => displayThumbnailUrl.value,
  () => {
    failedThumbnailUrl.value = "";
  }
);

watch(
  () => displaySourcePreviewUrl.value,
  () => {
    failedSourcePreviewUrl.value = "";
  }
);
const sourcePreviewLabelText = computed(
  () => String(props.sourcePreviewLabel ?? "来源未连接").trim() || "来源未连接"
);
const targetFormats = computed(() =>
  Array.isArray(settings.value?.meshyTargetFormats) &&
  settings.value?.meshyTargetFormats?.length
    ? settings.value.meshyTargetFormats!.join(", ")
    : "glb"
);
const multiImageText = computed(() => (settings.value?.meshyImageUrls ?? []).join("\n"));
const connectedPromptText = computed(() => String(props.connectedPrompt ?? "").trim());
const connectedImageUrls = computed(() =>
  Array.isArray(props.connectedImageUrls)
    ? props.connectedImageUrls.filter((x) => !!String(x ?? "").trim())
    : []
);

const familyOptions = computed(() => {
  if (meshyTaskTarget.value === "image") {
    return [
      { value: "text-to-image", label: "Text to Image" },
      { value: "image-to-image", label: "Image to Image" },
    ];
  }
  return [
    { value: "text-to-3d", label: "Text to 3D" },
    { value: "image-to-3d", label: "Image to 3D" },
    { value: "multi-image-to-3d", label: "Multi-Image to 3D" },
    { value: "refine", label: "Refine" },
    { value: "remesh", label: "Remesh" },
    { value: "retexture", label: "Retexture" },
  ];
});

const familyLabelMap: Record<string, string> = {
  "text-to-3d": "Text to 3D",
  "image-to-3d": "Image to 3D",
  "multi-image-to-3d": "Multi-Image to 3D",
  refine: "Refine",
  remesh: "Remesh",
  retexture: "Retexture",
  "text-to-image": "Text to Image",
  "image-to-image": "Image to Image",
};

const familyLabel = computed(
  () => familyLabelMap[meshyTaskFamily.value] ?? meshyTaskFamily.value
);
const targetTitle = computed(() =>
  meshyTaskTarget.value === "image" ? "Meshy 图像任务" : "Meshy 3D 任务"
);
const targetSubtitle = computed(() =>
  meshyTaskTarget.value === "image"
    ? "节点负责图像链路任务编排、输入摘要和输出分发。"
    : relationKind.value === "texture"
    ? "当前节点已切换到贴图阶段，下游 3D 节点将优先消费贴图产物。"
    : "节点负责 3D 主链路任务编排、输入摘要和输出分发。"
);

const showPromptField = computed(() => true);
const showNegativePromptField = computed(
  () => meshyTaskFamily.value === "text-to-3d" || meshyTaskFamily.value === "refine"
);
const showImageConfigTable = computed(
  () =>
    meshyTaskFamily.value === "text-to-image" ||
    meshyTaskFamily.value === "image-to-image"
);
const showModelTypeField = computed(
  () =>
    meshyTaskTarget.value === "3d" &&
    (meshyTaskFamily.value === "text-to-3d" ||
      meshyTaskFamily.value === "image-to-3d" ||
      meshyTaskFamily.value === "multi-image-to-3d")
);
const showPreviewTaskField = computed(() => meshyTaskFamily.value === "refine");
const showSingleImageField = computed(() => meshyTaskFamily.value === "image-to-3d");
const showMultiImageField = computed(
  () =>
    meshyTaskFamily.value === "multi-image-to-3d" ||
    meshyTaskFamily.value === "image-to-image"
);
const isLowpolyModelType = computed(() => meshyModelType.value === "lowpoly");
const modelTypeLabel = computed(() =>
  isLowpolyModelType.value ? "低模 Low Poly" : "标准 Standard"
);
const modelTypeDocNote = computed(() =>
  isLowpolyModelType.value
    ? "低模模式会输出更干净的低多边形网格；根据官方文档，ai_model、topology、target_polycount、should_remesh、save_pre_remeshed_model 会被忽略。"
    : "标准模式会走常规高细节 3D 网格生成流程，适合默认建模链路。"
);

const multiImagePlaceholder = computed(() => {
  if (meshyTaskFamily.value === "image-to-image") {
    return "每行一个 URL，最多 5 张；若有图像输入锚点连接，将优先使用上游图像。";
  }
  return "每行一个 URL，最多 4 张；若有图像输入锚点连接，将优先使用上游图像。";
});

const inputSummaryText = computed(() => {
  const promptState = connectedPromptText.value
    ? "文本已连入"
    : meshyPrompt.value.trim()
    ? "使用手填提示词"
    : "无提示词";
  const imageCount = connectedImageUrls.value.length;
  if (meshyTaskTarget.value === "image") {
    return imageCount
      ? `${promptState}，已连入 ${imageCount} 张图片`
      : `${promptState}，等待图片输入`;
  }
  return imageCount
    ? `${promptState}，已连入 ${imageCount} 张参考图`
    : `${promptState}，当前无参考图输入`;
});

const outputSummaryText = computed(() =>
  meshyTaskTarget.value === "image"
    ? `out-image-1 ~ out-image-${meshyOutputImageCount.value} 连接下游图片输入锚点`
    : "out-model 需连接下游资源/模型输入锚点"
);

const advancedSummaryText = computed(() =>
  meshyTaskTarget.value === "image"
    ? imageAdvancedSummaryText.value
    : `${meshyAiModel.value} / ${modelTypeLabel.value} / ${targetFormats.value}`
);
const imageAdvancedSummaryText = computed(() => {
  const ratio = meshyGenerateMultiView.value ? "auto" : meshyAspectRatio.value;
  return `${meshyAiModel.value} / ratio ${ratio} / multi-view ${
    meshyGenerateMultiView.value ? "on" : "off"
  }`;
});

const relationSummaryText = computed(() => {
  const parts: string[] = [];
  if (relationKind.value === "texture") parts.push("已贴图产物");
  else if (relationKind.value === "rigging") parts.push("已绑骨产物");
  else if (relationKind.value === "animation") parts.push("已动作产物");
  else parts.push("裸模型主任务");
  if (hasTextureChild.value && relationKind.value !== "texture")
    parts.push("存在贴图子任务");
  if (hasRiggingChild.value && relationKind.value !== "rigging")
    parts.push("存在绑骨子任务");
  if (hasAnimationChild.value && relationKind.value !== "animation")
    parts.push("存在动作子任务");
  return parts.join(" / ");
});

const statusLabel = computed(() => {
  if (taskStatus.value === "running") return "任务执行中";
  if (taskStatus.value === "pending") return "任务排队中";
  if (taskStatus.value === "succeeded") return "任务已完成";
  if (taskStatus.value === "failed") return "任务失败";
  if (taskStatus.value === "canceled") return "任务已取消";
  return "待发起任务";
});

const statusValue = computed(() => {
  if (taskStatus.value === "running" || taskStatus.value === "pending")
    return `${taskProgress.value}%`;
  if (taskId.value) return taskId.value;
  return familyLabel.value;
});

const statusDetail = computed(() =>
  String(
    settings.value?.meshyStatusText ??
      settings.value?.meshyErrorMessage ??
      (meshyTaskTarget.value === "image"
        ? "图像链路后续会接入任务中心和独立帮助面板。"
        : "3D 结果会通过 out-model 输出给下游节点。")
  ).trim()
);
const statusClass = computed(() => `is-${taskStatus.value}`);

const unsupportedReason = computed(() => {
  if (meshyTaskFamily.value === "remesh") {
    return "Remesh 独立任务接口尚未接入，本批先完成主模型与贴图闭环。";
  }
  return "";
});

const generateDisabledReason = computed(() => {
  if (taskStatus.value === "pending" || taskStatus.value === "running")
    return "Meshy 任务进行中";
  if (unsupportedReason.value) return unsupportedReason.value;
  if (!connectedPromptText.value && !meshyPrompt.value.trim())
    return "请填写提示词或连接文本输入";
  if (
    meshyTaskFamily.value === "text-to-image" ||
    meshyTaskFamily.value === "image-to-image"
  ) {
    if (
      meshyTaskFamily.value === "text-to-image" &&
      meshyGenerateMultiView.value &&
      !!meshyAspectRatio.value
    )
      return "开启多视图时，不能再设置固定比例。";
    if (
      meshyTaskFamily.value === "image-to-image" &&
      !connectedImageUrls.value.length &&
      !multiImageText.value.trim()
    ) {
      return "Image to Image 需要至少 1 张参考图 URL 或输入锚点。";
    }
  }
  if (meshyTaskFamily.value === "refine" && !meshyPreviewTaskId.value.trim())
    return "Refine 阶段需要 Preview Task ID";
  if (
    meshyTaskFamily.value === "image-to-3d" &&
    !connectedImageUrls.value.length &&
    !meshyImageUrl.value.trim()
  )
    return "请填写图片 URL 或连接参考图";
  if (
    meshyTaskFamily.value === "multi-image-to-3d" &&
    !connectedImageUrls.value.length &&
    !multiImageText.value.trim()
  )
    return "请至少提供一张参考图";
  return "";
});
const canGenerate = computed(() => !generateDisabledReason.value);

const generateButtonText = computed(() => {
  if (taskStatus.value === "pending") return "排队中…";
  if (taskStatus.value === "running") return "执行中…";
  if (unsupportedReason.value) return "待接入";
  if (taskStatus.value === "succeeded") return "重新执行";
  return "启动任务";
});

const canTextureFollowup = computed(
  () =>
    taskStatus.value === "succeeded" && !!taskId.value && relationKind.value === "model"
);
const canRefreshTask = computed(() => !!taskId.value);
const canStopTask = computed(
  () =>
    !!taskId.value && (taskStatus.value === "pending" || taskStatus.value === "running")
);
const canDeleteTask = computed(() => !!taskId.value);
const canPullOutput = computed(
  () =>
    !!taskId.value &&
    (taskStatus.value === "succeeded" ||
      taskStatus.value === "running" ||
      taskStatus.value === "pending")
);
const canRestartAsNewTask = computed(
  () => !!taskId.value && taskStatus.value !== "pending" && taskStatus.value !== "running"
);
const textureFollowupLabel = computed(() =>
  hasTextureChild.value ? "再次贴图" : "生成贴图"
);
const textureFollowupHint = computed(() => {
  if (relationKind.value !== "model") return "当前节点已不是裸模型阶段。";
  if (taskStatus.value !== "succeeded") return "需要先生成基础模型后才能继续贴图。";
  if (!taskId.value) return "缺少基础模型任务 ID。";
  return "基于当前模型任务继续发起贴图子任务。";
});

const actionHint = computed(() => {
  if (taskStatus.value === "failed")
    return String(settings.value?.meshyErrorMessage ?? "任务失败，请调整参数后重试。");
  if (unsupportedReason.value) return unsupportedReason.value;
  if (relationKind.value === "texture")
    return "当前节点已进入贴图阶段，下游模型节点会优先使用贴图结果。";
  return meshyTaskTarget.value === "image"
    ? "运行前会校验 out-image 是否已连接到下游图片输入。"
    : "运行前会校验 out-model 是否已连接到下游模型/资源输入。";
});

const updateSettings = (patch: Partial<WorkflowMeshyNodeSettings>) =>
  emit("update-meshy-settings", patch);

const onTargetSelect = (target: WorkflowMeshyTaskTarget) => {
  const family = target === "image" ? "text-to-image" : "text-to-3d";
  updateSettings({
    meshyTaskTarget: target,
    meshyTaskFamily: family,
    meshyHelpTopic: family,
    ...(target === "image"
      ? {
          meshyAiModel: "nano-banana",
          meshyAspectRatio: "1:1",
          meshyGenerateMultiView: false,
          meshyOutputImageCount: 1,
          meshyImageInputCount: 5,
        }
      : {
          meshyAiModel: ["latest", "meshy-6", "meshy-5"].includes(
            String(settings.value?.meshyAiModel ?? "")
          )
            ? (String(settings.value?.meshyAiModel ?? "latest") as any)
            : "latest",
          meshyModelType:
            String(settings.value?.meshyModelType ?? "") === "lowpoly"
              ? "lowpoly"
              : "standard",
        }),
  });
};

const onFamilyChange = (e: Event) => {
  const family = String(
    (e.target as HTMLSelectElement).value || "text-to-3d"
  ) as WorkflowMeshyTaskFamily;
  const imageFamily = family === "text-to-image" || family === "image-to-image";
  updateSettings({
    meshyTaskFamily: family,
    meshyHelpTopic: family,
    ...(imageFamily
      ? {
          meshyAiModel: ["nano-banana", "nano-banana-pro"].includes(
            String(settings.value?.meshyAiModel ?? "")
          )
            ? (String(settings.value?.meshyAiModel ?? "nano-banana") as any)
            : "nano-banana",
          meshyOutputImageCount:
            Number(settings.value?.meshyOutputImageCount ?? 1) >= 1
              ? (Math.max(
                  1,
                  Math.min(
                    4,
                    Math.floor(Number(settings.value?.meshyOutputImageCount ?? 1))
                  )
                ) as any)
              : 1,
          meshyImageInputCount: family === "image-to-image" ? 5 : 0,
        }
      : {
          meshyAiModel: ["latest", "meshy-6", "meshy-5"].includes(
            String(settings.value?.meshyAiModel ?? "")
          )
            ? (String(settings.value?.meshyAiModel ?? "latest") as any)
            : "latest",
          meshyModelType:
            String(settings.value?.meshyModelType ?? "") === "lowpoly"
              ? "lowpoly"
              : "standard",
        }),
  });
};

const onAiModelChange = (e: Event) => {
  const value = String((e.target as HTMLSelectElement).value ?? "").trim();
  updateSettings({
    meshyAiModel:
      value === "nano-banana-pro"
        ? "nano-banana-pro"
        : value === "nano-banana"
        ? "nano-banana"
        : value === "meshy-5"
        ? "meshy-5"
        : value === "meshy-6"
        ? "meshy-6"
        : "latest",
  });
};

const onModelTypeChange = (e: Event) => {
  const value = String((e.target as HTMLSelectElement).value ?? "").trim();
  updateSettings({
    meshyModelType: value === "lowpoly" ? "lowpoly" : "standard",
  });
};

const onAspectRatioChange = (e: Event) => {
  const value = String((e.target as HTMLSelectElement).value ?? "1:1").trim();
  if (!["1:1", "16:9", "9:16", "4:3", "3:4"].includes(value)) {
    updateSettings({ meshyAspectRatio: "1:1" });
    return;
  }
  updateSettings({ meshyAspectRatio: value as any });
};

const onGenerateMultiViewToggle = (e: Event) => {
  const checked = (e.target as HTMLInputElement).checked === true;
  updateSettings({
    meshyGenerateMultiView: checked,
    ...(checked ? { meshyAspectRatio: undefined } : {}),
  });
};

const onPoseModeChange = (e: Event) => {
  const value = String((e.target as HTMLSelectElement).value ?? "").trim();
  updateSettings({
    meshyPoseMode: value === "a-pose" || value === "t-pose" ? (value as any) : "",
  });
};

const onTopologyChange = (e: Event) => {
  const value = String((e.target as HTMLSelectElement).value ?? "").trim();
  updateSettings({ meshyTopology: value === "quad" ? "quad" : "triangle" });
};

const onTargetPolycountChange = (e: Event) => {
  const raw = Number((e.target as HTMLInputElement).value ?? 30000);
  const value = Number.isFinite(raw)
    ? Math.max(100, Math.min(300000, Math.floor(raw)))
    : 30000;
  updateSettings({ meshyTargetPolycount: value });
};

const onSymmetryModeChange = (e: Event) => {
  const value = String((e.target as HTMLSelectElement).value ?? "auto").trim();
  updateSettings({
    meshySymmetryMode: value === "on" || value === "off" ? (value as any) : "auto",
  });
};

const onShouldRemeshToggle = (e: Event) => {
  const checked = (e.target as HTMLInputElement).checked === true;
  updateSettings({
    meshyShouldRemesh: checked,
    ...(checked ? {} : { meshySavePreRemeshedModel: false }),
  });
};

const onSavePreRemeshedToggle = (e: Event) => {
  const checked = (e.target as HTMLInputElement).checked === true;
  updateSettings({ meshySavePreRemeshedModel: checked });
};

const onShouldTextureToggle = (e: Event) => {
  const checked = (e.target as HTMLInputElement).checked === true;
  updateSettings({
    meshyShouldTexture: checked,
    ...(checked ? {} : { meshyEnablePbr: false }),
  });
};

const onEnablePbrToggle = (e: Event) => {
  const checked = (e.target as HTMLInputElement).checked === true;
  updateSettings({ meshyEnablePbr: checked });
};

const onModerationToggle = (e: Event) => {
  const checked = (e.target as HTMLInputElement).checked === true;
  updateSettings({ meshyModeration: checked });
};

const onImageEnhancementToggle = (e: Event) => {
  const checked = (e.target as HTMLInputElement).checked === true;
  updateSettings({ meshyImageEnhancement: checked });
};

const onRemoveLightingToggle = (e: Event) => {
  const checked = (e.target as HTMLInputElement).checked === true;
  updateSettings({ meshyRemoveLighting: checked });
};

const onAutoSizeToggle = (e: Event) => {
  const checked = (e.target as HTMLInputElement).checked === true;
  updateSettings({
    meshyAutoSize: checked,
    ...(checked ? {} : { meshyOriginAt: "bottom" }),
  });
};

const onOriginAtChange = (e: Event) => {
  const value = String((e.target as HTMLSelectElement).value ?? "bottom").trim();
  updateSettings({ meshyOriginAt: value === "center" ? "center" : "bottom" });
};

const onTargetFormatToggle = (format: typeof targetFormatOptions[number], e: Event) => {
  const checked = (e.target as HTMLInputElement).checked === true;
  const current = [...meshyTargetFormats.value];
  const next = checked
    ? Array.from(new Set([...current, format]))
    : current.filter((x) => x !== format);
  updateSettings({ meshyTargetFormats: (next.length ? next : ["glb"]) as any });
};

const onSeedChange = (e: Event) => {
  const raw = Number((e.target as HTMLInputElement).value ?? 0);
  updateSettings({ meshySeed: Math.max(0, Number.isFinite(raw) ? Math.floor(raw) : 0) });
};

const onOutputImageCountChange = (e: Event) => {
  const raw = Number((e.target as HTMLSelectElement).value ?? 1);
  const count = Number.isFinite(raw) ? Math.max(1, Math.min(4, Math.floor(raw))) : 1;
  updateSettings({ meshyOutputImageCount: count as any });
};

const onPromptInput = (e: Event) =>
  updateSettings({ meshyPrompt: String((e.target as HTMLTextAreaElement).value ?? "") });
const onNegativePromptInput = (e: Event) =>
  updateSettings({
    meshyNegativePrompt: String((e.target as HTMLTextAreaElement).value ?? ""),
  });
const onImageUrlInput = (e: Event) =>
  updateSettings({ meshyImageUrl: String((e.target as HTMLInputElement).value ?? "") });
const onPreviewTaskIdInput = (e: Event) =>
  updateSettings({
    meshyPreviewTaskId: String((e.target as HTMLInputElement).value ?? ""),
  });
const onTexturePromptInput = (e: Event) =>
  updateSettings({
    meshyTexturePrompt: String((e.target as HTMLTextAreaElement).value ?? ""),
  });
const onTextureImageUrlInput = (e: Event) =>
  updateSettings({
    meshyTextureImageUrl: String((e.target as HTMLInputElement).value ?? ""),
  });
const onMultiImageInput = (e: Event) =>
  updateSettings({
    meshyImageUrls: String((e.target as HTMLTextAreaElement).value ?? "")
      .split(/\r?\n/)
      .map((x) => x.trim())
      .filter((x) => !!x)
      .slice(0, meshyTaskFamily.value === "image-to-image" ? 5 : 4),
  });
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
  box-shadow: 0 0 0 1px rgb(90 180 255 / 0.24), 0 0 18px rgb(90 180 255 / 0.18);
}

.wf-meshy-status-card.is-succeeded {
  box-shadow: 0 0 0 1px rgb(56 189 140 / 0.24), 0 0 18px rgb(56 189 140 / 0.16);
}

.wf-meshy-status-card.is-failed {
  box-shadow: 0 0 0 1px rgb(248 113 113 / 0.24), 0 0 18px rgb(248 113 113 / 0.16);
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
  box-shadow: 0 0 0 1px rgb(90 180 255 / 0.18), 0 0 16px rgb(90 180 255 / 0.12);
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
