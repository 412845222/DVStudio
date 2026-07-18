<template>
	<div class="comfyui-setup-page">
		<GlobalPageBackground variant="project-list" />

		<div class="setup-shell">
			<header class="setup-header">
				<div class="setup-title">ComfyUI 配置中心</div>
				<div class="setup-sub">配置 ComfyUI 运行环境、镜像源与服务管理</div>
			</header>

			<div class="setup-scroll">
				<div class="setup-content">
					<section
						v-if="freshInstallMode"
						class="setup-card setup-card-fresh"
						@mouseenter="freshCardHovered = true"
						@mouseleave="freshCardHovered = false"
						@focusin="freshCardHovered = true"
						@focusout="freshCardHovered = false"
					>
						<div class="card-glow" aria-hidden="true"></div>
						<div class="sq-container" aria-hidden="true">
							<span
								v-for="p in freshCardParticles.particles"
								:key="p.id"
								class="sq-particle"
								:class="freshCardParticles.buildHoverStateClass(freshCardHovered)"
								:style="p.style"
							></span>
						</div>
						<div class="card-frame" aria-hidden="true">
							<span class="corner tl"></span>
							<span class="corner tr"></span>
							<span class="corner bl"></span>
							<span class="corner br"></span>
						</div>
						<div class="setup-card-body">
							<div class="card-section-head">
								<h3 class="setup-card-title">全新安装 ComfyUI</h3>
							</div>
							<div class="fresh-install-form">
								<div class="fresh-form-warn">
									<span class="warn-icon">⚠️</span>
									<span>此操作将清空所有现有 ComfyUI 配置，开始全新安装流程。</span>
								</div>
								<div class="fresh-form-hint">
									请填写以下必填项（带 <span class="required-mark">*</span> 标记）以开始配置：
								</div>
								<div class="fresh-form-row">
									<label class="fresh-form-label">
										<span class="required-mark">*</span>
										ComfyUI 安装目录
									</label>
									<div class="path-input-group">
										<input
											type="text"
											class="path-input"
											:value="installPath"
											readonly
											placeholder="请选择 ComfyUI 安装目录（必填）..."
										/>
										<button
											type="button"
											class="card-action card-action-primary"
											@click="selectPath()"
											:disabled="pathChanging"
										>
											{{ pathChanging ? '选择中...' : '📂 选择目录' }}
										</button>
									</div>
									<div v-if="pathValidation?.error" class="path-hint">
										<span class="hint-error">⚠ {{ pathValidation.error }}</span>
									</div>
									<div v-else-if="pathValidation?.warning" class="path-hint">
										<span class="hint-warn">⚠ {{ pathValidation.warning }}</span>
									</div>
									<div v-else-if="pathValidation?.isComfyUI" class="path-hint">
										<span class="hint-ok">✓ 检测到有效的 ComfyUI 目录，将使用现有安装</span>
									</div>
									<div v-else-if="installPath && pathValidation?.exists" class="path-hint">
										<span class="hint-ok">✓ 目录有效，将在此位置安装 ComfyUI</span>
									</div>
									<div class="field-hint">
										选择已有的 ComfyUI 目录可直接配置使用；选择空目录将在后续步骤中自动配置环境。
									</div>
								</div>

								<div v-if="probing" class="probe-loading">
									<span class="spinner" />
									<span>正在探测 ComfyUI 环境...</span>
								</div>

								<div v-if="installPath && probeResult?.isComfyUI" class="fresh-probe-result">
									<div v-if="probeResult.version" class="fresh-probe-item">
										<span class="probe-item-label">检测到版本</span>
										<span class="probe-item-value">{{ probeResult.version }}</span>
										<span v-if="versionChecking" class="probe-version-checking">
											<span class="spinner-sm" /> 检查更新中
										</span>
										<button
											v-else
											type="button"
											class="probe-mini-btn"
											@click="checkVersionUpdate"
										>{{ versionUpdateInfo ? '重新检查' : '检查更新' }}</button>
									</div>
									<div v-if="versionUpdateInfo" class="probe-version-update">
										<template v-if="versionUpdateInfo.error">
											<div class="probe-msg probe-msg-warn">
												版本检查失败：{{ versionUpdateInfo.error }}
											</div>
										</template>
										<template v-else-if="versionUpdateInfo.updateAvailable">
											<div class="probe-msg probe-msg-update">
												🎉 发现新版本！
												<span v-if="versionUpdateInfo.latestTag">最新版本：<strong>{{ versionUpdateInfo.latestTag }}</strong></span>
												<span v-if="versionUpdateInfo.currentVersion">当前版本：{{ versionUpdateInfo.currentVersion }}</span>
												<a
													v-if="versionUpdateInfo.releaseUrl"
													class="probe-update-link"
													@click.prevent="openUrl(versionUpdateInfo.releaseUrl!)"
												>查看发布说明</a>
												<button
													v-if="!updatingComfyUI && !updateDone"
													type="button"
													class="probe-mini-btn probe-update-btn"
													@click="updateComfyUI"
												>⬇ 立即更新</button>
											</div>
										</template>
										<template v-else>
											<div class="probe-msg probe-msg-ok">
												✓ 当前已是最新版本
												<span v-if="versionUpdateInfo.latestTag">（{{ versionUpdateInfo.latestTag }}）</span>
											</div>
										</template>
									</div>
									<div class="fresh-probe-item">
										<span class="probe-item-label">Python</span>
										<span class="probe-item-value" :class="probeResult.pythonInfo?.hasTorch ? '' : 'probe-value-error'">
											<template v-if="probeResult.pythonInfo?.version">
												{{ probeResult.pythonInfo.version }}
												<span v-if="probeResult.pythonInfo?.hasTorch" class="probe-tag" :class="probeResult.pythonInfo.torchCuda ? 'tag-cuda' : 'tag-cpu'">
													{{ probeResult.pythonInfo.torchCuda ? 'CUDA' : 'CPU' }}
												</span>
											</template>
											<template v-else>未检测到可用环境</template>
										</span>
									</div>
								</div>

								<div class="fresh-form-actions">
									<button
										type="button"
										class="card-action card-action-ghost"
										@click="exitFreshInstallMode"
									>
										返回现有配置
									</button>
									<button
										type="button"
										class="card-action card-action-primary"
										@click="confirmFreshInstall"
										:disabled="!installPath || !!pathValidation?.error || pathChanging || probing"
									>
										✓ 确认并开始配置
									</button>
								</div>
							</div>
						</div>
					</section>

					<section
						v-if="!freshInstallMode"
						class="setup-card"
						@mouseenter="pathCardHovered = true"
						@mouseleave="pathCardHovered = false"
						@focusin="pathCardHovered = true"
						@focusout="pathCardHovered = false"
					>
						<div class="card-glow" aria-hidden="true"></div>
						<div class="sq-container" aria-hidden="true">
							<span
								v-for="p in pathCardParticles.particles"
								:key="p.id"
								class="sq-particle"
								:class="pathCardParticles.buildHoverStateClass(pathCardHovered)"
								:style="p.style"
							></span>
						</div>
						<div class="card-frame" aria-hidden="true">
							<span class="corner tl"></span>
							<span class="corner tr"></span>
							<span class="corner bl"></span>
							<span class="corner br"></span>
						</div>
						<div class="setup-card-body">
							<div class="card-section-head">
								<h3 class="setup-card-title">ComfyUI 路径</h3>
								<span v-if="probeResult?.isComfyUI" class="compat-badge compat-full">已检测到有效安装</span>
								<span v-else-if="probing" class="compat-badge compat-checking">
									<span class="spinner-sm" />
									检测中
								</span>
								<button
									type="button"
									class="card-action card-action-ghost card-action-sm"
									@click="resetForFreshInstall"
									title="清空所有配置，重新开始"
								>
									🔄 全新安装
								</button>
							</div>

							<div class="path-row">
								<div class="path-input-group">
									<input
										type="text"
										class="path-input"
										:value="installPath"
										readonly
										placeholder="选择 ComfyUI 目录..."
									/>
									<button
										type="button"
										class="card-action"
										@click="selectPath()"
										:disabled="pathChanging"
									>
										{{ pathChanging ? '...' : '浏览目录' }}
									</button>
								</div>
								<div v-if="pathValidation" class="path-hint">
									<span v-if="pathValidation.error" class="hint-error">{{ pathValidation.error }}</span>
									<span v-else-if="pathValidation.warning" class="hint-warn">{{ pathValidation.warning }}</span>
									<span v-else-if="pathValidation.isComfyUI" class="hint-ok">检测到有效的 ComfyUI 目录</span>
								</div>
							</div>

							<div v-if="probing" class="probe-loading">
								<span class="spinner" />
								<span>正在探测 ComfyUI 环境、Python 依赖、模型路径与启动可行性...</span>
							</div>

							<div v-if="probeResult && probeResult.isComfyUI" class="probe-result">
								<div class="probe-head">
									<span class="probe-title">环境信息</span>
									<span class="probe-compat" :class="`compat-${probeResult.launchCompatibility.status}`">
										<span v-if="probeResult.launchCompatibility.status === 'full'">可启动</span>
										<span v-else-if="probeResult.launchCompatibility.status === 'partial'">可启动（有警告）</span>
										<span v-else>不可启动</span>
									</span>
									<span v-if="probeResult.isDesktop" class="probe-badge badge-desktop">桌面版</span>
								</div>
								<div class="probe-grid">
									<div v-if="probeResult.version" class="probe-item">
										<span class="probe-item-label">版本</span>
										<span class="probe-item-value">
											{{ probeResult.version }}
											<button
												v-if="!versionChecking"
												type="button"
												class="probe-mini-btn probe-version-check-btn"
												@click="checkVersionUpdate"
												title="检查更新"
											>{{ versionUpdateInfo ? '重新检查' : '检查更新' }}</button>
											<span v-else class="probe-version-checking">
												<span class="spinner-sm" /> 检查中
											</span>
										</span>
									</div>
									<div v-if="probeResult.commitHash" class="probe-item">
										<span class="probe-item-label">Commit</span>
										<span class="probe-item-value probe-mono">{{ probeResult.commitHash.slice(0, 10) }}</span>
									</div>
									<div class="probe-item">
										<span class="probe-item-label">安装类型</span>
										<span class="probe-item-value">{{ installTypeLabel(probeResult.installType) }}</span>
									</div>
									<div v-if="probeResult.pythonInfo?.version" class="probe-item">
										<span class="probe-item-label">Python</span>
										<span class="probe-item-value">
											{{ probeResult.pythonInfo.version }}
											<span class="probe-tag">{{ pythonTypeLabel(probeResult.pythonInfo.type) }}</span>
										</span>
									</div>
									<div v-if="probeResult.pythonInfo" class="probe-item">
										<span class="probe-item-label">PyTorch</span>
										<span class="probe-item-value" :class="probeResult.pythonInfo.hasTorch ? '' : 'probe-value-error'">
											<template v-if="probeResult.pythonInfo.hasTorch">
												{{ probeResult.pythonInfo.torchVersion || '已安装' }}
												<span class="probe-tag" :class="probeResult.pythonInfo.torchCuda ? 'tag-cuda' : 'tag-cpu'">
													{{ probeResult.pythonInfo.torchCuda ? 'CUDA' : 'CPU' }}
												</span>
											</template>
											<template v-else>未安装</template>
										</span>
									</div>
									<div v-if="probeResult.pythonInfo" class="probe-item">
										<span class="probe-item-label">启动链路</span>
										<span class="probe-item-value" :class="probeResult.pythonInfo.canImportComfy && probeResult.pythonInfo.canStartComfy !== false ? '' : 'probe-value-error'">
											<template v-if="!probeResult.pythonInfo.canImportComfy">comfy 导入失败</template>
											<template v-else-if="probeResult.pythonInfo.canStartComfy === false">依赖不完整{{ probeResult.pythonInfo.importError ? '（' + probeResult.pythonInfo.importError + '）' : '' }}</template>
											<template v-else>可正常启动</template>
										</span>
									</div>
									<div v-if="probeResult.customNodeCount !== undefined" class="probe-item">
										<span class="probe-item-label">自定义节点</span>
										<span class="probe-item-value">{{ probeResult.customNodeCount }} 个</span>
									</div>
									<div v-if="probeResult.totalModelCount !== undefined" class="probe-item probe-item-wide">
										<span class="probe-item-label">模型总计</span>
										<span class="probe-item-value">{{ probeResult.totalModelCount }} 个模型文件</span>
									</div>
								</div>

								<div class="probe-model-config">
									<div class="probe-section-title model-section-head">
										<span>模型路径配置</span>
										<span class="probe-badges">
											<span v-if="probeResult.hasExtraModelConfig" class="probe-badge badge-extra">extra_model_paths.yaml</span>
											<span v-if="customModelPaths.length > 0" class="probe-badge badge-custom">自定义 {{ customModelPaths.length }}</span>
										</span>
										<button type="button" class="probe-mini-btn" @click="addCustomModelPath" title="添加模型目录">+ 添加模型目录</button>
									</div>

									<div v-if="customModelPaths.length > 0" class="custom-model-paths">
										<div v-for="mp in customModelPaths" :key="mp" class="custom-model-path-item">
											<span class="custom-model-path-text" :title="mp">{{ shortenPath(mp) }}</span>
											<button type="button" class="custom-model-path-remove" @click="removeCustomModelPath(mp)" title="移除">×</button>
										</div>
									</div>

									<div v-if="!probeResult.models || (probeResult.totalModelCount || 0) === 0" class="probe-msg probe-msg-warn model-empty-hint">
										未在默认路径下扫描到模型文件。如果您的模型存放在其他位置，请点击上方「+ 添加模型目录」手动添加。
									</div>
								</div>

								<div v-if="probeResult.models" class="probe-models">
									<div class="probe-section-title">
										<span>模型资源明细</span>
									</div>
									<div class="model-list">
										<template v-for="(info, type) in probeResult.models" :key="type">
											<div v-if="info.total > 0 || type === 'checkpoints'" class="model-row">
												<span class="model-name">{{ modelTypeLabel(String(type)) }}</span>
												<span class="model-count" :class="info.total > 0 ? '' : 'model-count-zero'">{{ info.total }}</span>
												<div v-if="info.sources.length > 0" class="model-sources">
													<div v-for="(src, si) in info.sources" :key="si" class="model-source">
														<span class="model-source-path">{{ shortenPath(src.path) }}</span>
														<span class="model-source-count">{{ src.count }}</span>
													</div>
												</div>
											</div>
										</template>
									</div>
								</div>

								<div v-if="probeResult.pythonInfo?.path" class="probe-python-path">
									<span class="probe-section-title">Python 路径</span>
									<span class="probe-path-text">{{ probeResult.pythonInfo.path }}</span>
								</div>

								<div v-if="versionUpdateInfo" class="probe-version-update">
									<template v-if="versionUpdateInfo.error">
										<div class="probe-msg probe-msg-warn">
											版本检查失败：{{ versionUpdateInfo.error }}
											<button type="button" class="probe-mini-btn" @click="checkVersionUpdate" style="margin-left:8px">重试</button>
										</div>
									</template>
									<template v-else-if="versionUpdateInfo.updateAvailable">
										<div class="probe-msg probe-msg-update">
											🎉 发现新版本！
											<span v-if="versionUpdateInfo.latestTag">最新版本：<strong>{{ versionUpdateInfo.latestTag }}</strong></span>
											<span v-if="versionUpdateInfo.currentVersion">当前版本：{{ versionUpdateInfo.currentVersion }}</span>
											<a
												v-if="versionUpdateInfo.releaseUrl"
												class="probe-update-link"
												@click.prevent="openUrl(versionUpdateInfo.releaseUrl!)"
											>查看发布说明</a>
											<button
												v-if="!updatingComfyUI && !updateDone"
												type="button"
												class="probe-mini-btn probe-update-btn"
												@click="updateComfyUI"
											>⬇ 立即更新</button>
										</div>
									</template>
									<template v-else>
										<div class="probe-msg probe-msg-ok">
											✓ 当前已是最新版本
											<span v-if="versionUpdateInfo.latestTag">（{{ versionUpdateInfo.latestTag }}）</span>
										</div>
									</template>
								</div>

								<div v-if="probeResult.launchCompatibility.warnings?.length" class="probe-messages">
									<div v-for="w in probeResult.launchCompatibility.warnings" :key="w" class="probe-msg probe-msg-warn">
										{{ w }}
									</div>
								</div>
								<div v-if="probeResult.launchCompatibility.needsFix?.length" class="probe-messages">
									<div v-for="f in probeResult.launchCompatibility.needsFix" :key="f" class="probe-msg probe-msg-error">
										{{ f }}
									</div>
								</div>
							</div>

							<div v-else-if="probeResult && !probeResult.isComfyUI" class="probe-result probe-error">
								<div class="probe-head">
									<span class="probe-title">未检测到 ComfyUI</span>
								</div>
								<div class="probe-error-msg">{{ probeResult.error || '该目录不是有效的 ComfyUI 安装，请选择正确目录或在下方配置 Python 环境后启动。' }}</div>
							</div>
						</div>
					</section>

					<section
						v-if="!freshInstallMode"
						class="setup-card"
						@mouseenter="envCardHovered = true"
						@mouseleave="envCardHovered = false"
						@focusin="envCardHovered = true"
						@focusout="envCardHovered = false"
					>
						<div class="card-glow" aria-hidden="true"></div>
						<div class="sq-container" aria-hidden="true">
							<span
								v-for="p in envCardParticles.particles"
								:key="p.id"
								class="sq-particle"
								:class="envCardParticles.buildHoverStateClass(envCardHovered)"
								:style="p.style"
							></span>
						</div>
						<div class="card-frame" aria-hidden="true">
							<span class="corner tl"></span>
							<span class="corner tr"></span>
							<span class="corner bl"></span>
							<span class="corner br"></span>
						</div>
						<div class="setup-card-body">
							<div class="card-section-head">
								<h3 class="setup-card-title">环境检测</h3>
								<button
									type="button"
									class="card-action card-action-ghost card-action-sm"
									@click="checkEnv"
									:disabled="checking"
								>
									{{ checking ? '检测中...' : '重新检测' }}
								</button>
							</div>
							<div v-if="checking && !envResult" class="setup-loading">
								<span class="spinner" />
								<span>正在检测环境...</span>
							</div>
							<div v-else-if="envResult" class="env-list">
								<div
									v-for="item in envResult.items"
									:key="item.key"
									class="env-row"
									:class="`env-${item.status}`"
								>
									<span class="env-status-dot" :style="{ backgroundColor: getStatusColor(item.status) }" />
									<span class="env-name">{{ item.label }}</span>
									<span class="env-detail">{{ item.detail }}</span>
									<span v-if="item.version" class="env-version">{{ item.version }}</span>
									<button
										v-if="item.downloadUrl"
										type="button"
										class="card-action card-action-sm"
										@click="openUrl(item.downloadUrl)"
									>
										{{ item.downloadLabel || '下载' }}
									</button>
									<button
										v-if="item.canFix && item.fixAction"
										type="button"
										class="card-action card-action-sm card-action-warn"
										@click="handleFix(item.key)"
									>
										{{ item.fixAction }}
									</button>
								</div>
							</div>
							<div v-else class="setup-empty">点击「重新检测」开始检测环境</div>
						</div>
					</section>

					<section
						v-if="showCloneSection"
						class="setup-card"
						@mouseenter="pythonCardHovered = true"
						@mouseleave="pythonCardHovered = false"
						@focusin="pythonCardHovered = true"
						@focusout="pythonCardHovered = false"
					>
						<div class="card-glow" aria-hidden="true"></div>
						<div class="sq-container" aria-hidden="true">
							<span
								v-for="p in pythonCardParticles.particles"
								:key="p.id"
								class="sq-particle"
								:class="pythonCardParticles.buildHoverStateClass(pythonCardHovered, { running: cloningComfyUI, error: !!cloneError })"
								:style="p.style"
							></span>
						</div>
						<div class="card-frame" aria-hidden="true">
							<span class="corner tl"></span>
							<span class="corner tr"></span>
							<span class="corner bl"></span>
							<span class="corner br"></span>
						</div>
						<div class="setup-card-body">
							<div class="card-section-head">
								<h3 class="setup-card-title">ComfyUI 源码安装</h3>
							</div>

							<div v-if="cloneError" class="python-error-box">
								<div class="cmd-tip error">
													<span>{{ cloneError }}</span>
								</div>
								<div class="python-error-actions">
									<button
										type="button"
										class="card-action card-action-primary"
										@click="cloneComfyUI"
										:disabled="cloningComfyUI"
									>
										{{ cloningComfyUI ? '安装中...' : '🔄 重试安装' }}
									</button>
								</div>
							</div>

							<div v-else-if="cloneDone" class="python-success-box">
								<div class="cmd-tip success">
													<span>✓ {{ cloneMessage || '源码安装完成！' }}</span>
								</div>
							</div>

							<template v-else>
								<div v-if="cloneStep === 'preparing'" class="python-status-indicator">
									<span class="spinner" />
									<span>{{ cloneMessage || '准备安装...' }}</span>
								</div>
								<div v-else-if="cloneStep === 'cloning'" class="python-status-indicator">
									<span class="spinner" />
									<span>{{ cloneMessage || '正在克隆源码...' }}</span>
								</div>
								<div v-else class="python-status-indicator">
									<span class="spinner" />
									<span>{{ cloneMessage || '安装中...' }}</span>
								</div>

								<div class="python-log-container" ref="pythonLogsRef">
									<div
										v-for="log in cloneLogs"
										:key="log.id"
										class="python-log-line"
										:class="log.stream === 'stderr' ? 'log-stderr' : 'log-stdout'"
									>
										<span class="log-stream-tag">{{ log.stream === 'stderr' ? 'ERR' : 'LOG' }}</span>
										<span class="log-text">{{ log.message }}</span>
									</div>
								</div>
							</template>
						</div>
					</section>

					<section
						v-if="showUpdateSection"
						class="setup-card"
						@mouseenter="pythonCardHovered = true"
						@mouseleave="pythonCardHovered = false"
						@focusin="pythonCardHovered = true"
						@focusout="pythonCardHovered = false"
					>
						<div class="card-glow" aria-hidden="true"></div>
						<div class="sq-container" aria-hidden="true">
							<span
								v-for="p in pythonCardParticles.particles"
								:key="'u'+p.id"
								class="sq-particle"
								:class="pythonCardParticles.buildHoverStateClass(pythonCardHovered, { running: updatingComfyUI, error: !!updateError })"
								:style="p.style"
							></span>
						</div>
						<div class="card-frame" aria-hidden="true">
							<span class="corner tl"></span>
							<span class="corner tr"></span>
							<span class="corner bl"></span>
							<span class="corner br"></span>
						</div>
						<div class="setup-card-body">
							<div class="card-section-head">
								<h3 class="setup-card-title">ComfyUI 源码更新</h3>
							</div>

							<div v-if="updateError" class="python-error-box">
								<div class="cmd-tip error">
									<span>{{ updateError }}</span>
								</div>
								<div class="python-error-actions">
									<button
										type="button"
										class="card-action card-action-primary"
										@click="updateComfyUI"
										:disabled="updatingComfyUI"
									>
										{{ updatingComfyUI ? '更新中...' : '🔄 重试更新' }}
									</button>
								</div>
							</div>

							<div v-else-if="updateDone" class="python-success-box">
								<div class="cmd-tip success">
									<span>✓ {{ updateMessage || '更新完成！' }}</span>
								</div>
								<div v-if="updateNeedDepUpdate" class="cmd-tip warn" style="margin-top:8px">
									<span>💡 更新完成，正在自动检查Python依赖兼容性...</span>
								</div>
							</div>

							<template v-else>
								<div class="python-status-indicator">
									<span class="spinner" />
									<span>{{ updateMessage || '正在更新...' }}</span>
								</div>

								<div class="python-log-container" ref="pythonLogsRef">
									<div
										v-for="log in updateLogs"
										:key="log.id"
										class="python-log-line"
										:class="log.stream === 'stderr' ? 'log-stderr' : 'log-stdout'"
									>
										<span class="log-stream-tag">{{ log.stream === 'stderr' ? 'ERR' : 'LOG' }}</span>
										<span class="log-text">{{ log.message }}</span>
									</div>
								</div>
							</template>
						</div>
					</section>

					<section
						v-if="!freshInstallMode && showMirrorSection"
						class="setup-card"
						@mouseenter="mirrorCardHovered = true"
						@mouseleave="mirrorCardHovered = false"
						@focusin="mirrorCardHovered = true"
						@focusout="mirrorCardHovered = false"
					>
						<div class="card-glow" aria-hidden="true"></div>
						<div class="sq-container" aria-hidden="true">
							<span
								v-for="p in mirrorCardParticles.particles"
								:key="p.id"
								class="sq-particle"
								:class="mirrorCardParticles.buildHoverStateClass(mirrorCardHovered)"
								:style="p.style"
							></span>
						</div>
						<div class="card-frame" aria-hidden="true">
							<span class="corner tl"></span>
							<span class="corner tr"></span>
							<span class="corner bl"></span>
							<span class="corner br"></span>
						</div>
						<div class="setup-card-body">
							<div class="card-section-head">
								<h3 class="setup-card-title">Python 镜像源配置</h3>
								<button
									type="button"
									class="card-action card-action-ghost card-action-sm"
									@click="pingMirrors"
									:disabled="pingingMirrors"
								>
									{{ pingingMirrors ? '检测中...' : 'ping 检测' }}
								</button>
							</div>
							<div class="mirror-section">
								<div class="mirror-section-title">PyPI 镜像（pip 包源）</div>
								<div class="mirror-options">
									<label class="mirror-option">
										<input type="radio" value="auto" v-model="selectedPypiMirror" />
										<span class="mirror-option-label">自动选择</span>
									</label>
									<label
										v-for="m in pypiMirrorsWithLatency"
										:key="m.key"
										class="mirror-option"
									>
										<input type="radio" :value="m.key" v-model="selectedPypiMirror" />
										<span class="mirror-option-label">{{ m.name }}</span>
										<span class="mirror-latency" :class="latencyClass(m.latency, m.reachable)">
											{{ m.reachable === null ? '—' : (m.reachable ? (m.latency !== null ? m.latency + 'ms' : '—') : '不可达') }}
										</span>
									</label>
									<label class="mirror-option">
										<input type="radio" value="custom" v-model="selectedPypiMirror" />
										<span class="mirror-option-label">自定义</span>
									</label>
								</div>
								<input
									v-if="selectedPypiMirror === 'custom'"
									type="text"
									class="mirror-custom-input"
									v-model="customPypiUrl"
									placeholder="https://pypi.example.com/simple"
								/>
							</div>

							<div class="mirror-section">
								<div class="mirror-section-title">PyTorch 镜像（torch/torchvision 源）</div>
								<div class="mirror-options">
									<label class="mirror-option">
										<input type="radio" value="auto" v-model="selectedTorchMirror" />
										<span class="mirror-option-label">自动选择</span>
									</label>
									<label
										v-for="m in torchMirrorsWithLatency"
										:key="m.key"
										class="mirror-option"
									>
										<input type="radio" :value="m.key" v-model="selectedTorchMirror" />
										<span class="mirror-option-label">{{ m.name }}</span>
										<span class="mirror-latency" :class="latencyClass(m.latency, m.reachable)">
											{{ m.reachable === null ? '—' : (m.reachable ? (m.latency !== null ? m.latency + 'ms' : '—') : '不可达') }}
										</span>
									</label>
									<label class="mirror-option">
										<input type="radio" value="custom" v-model="selectedTorchMirror" />
										<span class="mirror-option-label">自定义</span>
									</label>
								</div>
								<input
									v-if="selectedTorchMirror === 'custom'"
									type="text"
									class="mirror-custom-input"
									v-model="customTorchUrl"
									placeholder="https://download.pytorch.org/whl/cu124"
								/>
							</div>

							<div class="mirror-actions">
								<button
									type="button"
									class="card-action card-action-primary card-action-sm"
									@click="saveMirrorConfig"
									:disabled="mirrorSaving"
								>
									{{ mirrorSaving ? '保存中...' : '保存镜像设置' }}
								</button>
								<span v-if="mirrorSaveMessage === 'ok'" class="mirror-tip mirror-ok">✓ 已保存</span>
								<span v-else-if="mirrorSaveMessage" class="mirror-tip mirror-error">{{ mirrorSaveMessage }}</span>
								<span v-else class="mirror-tip">配置镜像源可加速 Python 依赖下载，建议大陆用户选择国内镜像。</span>
							</div>
						</div>
					</section>

					<section
						v-if="!freshInstallMode && showPythonFixSection"
						class="setup-card"
						@mouseenter="pythonCardHovered = true"
						@mouseleave="pythonCardHovered = false"
						@focusin="pythonCardHovered = true"
						@focusout="pythonCardHovered = false"
					>
						<div class="card-glow" aria-hidden="true"></div>
						<div class="sq-container" aria-hidden="true">
							<span
								v-for="p in pythonCardParticles.particles"
								:key="p.id"
								class="sq-particle"
								:class="pythonCardParticles.buildHoverStateClass(pythonCardHovered, { running: fixingPython, error: !!pythonFixError })"
								:style="p.style"
							></span>
						</div>
						<div class="card-frame" aria-hidden="true">
							<span class="corner tl"></span>
							<span class="corner tr"></span>
							<span class="corner bl"></span>
							<span class="corner br"></span>
						</div>
						<div class="setup-card-body">
							<div class="card-section-head">
								<h3 class="setup-card-title">Python 环境配置</h3>
							</div>
							<div v-if="!fixingPython && !pythonFixDone && !pythonFixError" class="python-fix-prompt">
								<div class="info-note">
									客户端将创建独立的 Python 虚拟环境，安装 PyTorch（CUDA 版本）和 ComfyUI 依赖，并使用该环境启动 ComfyUI。
								</div>
								<div class="venv-path-section">
									<label class="venv-path-label">虚拟环境安装位置</label>
									<div class="venv-path-row">
									<input
										type="text"
										class="path-input"
										:value="venvPath || defaultVenvPath"
										readonly
										placeholder="使用默认位置"
									/>
									<button
										type="button"
										class="card-action card-action-sm"
										@click="selectVenvPath"
										:disabled="selectingVenvPath"
									>
										{{ selectingVenvPath ? '选择中...' : '📁 更换目录' }}
									</button>
									<button
										v-if="venvPath && venvPath !== defaultVenvPath"
										type="button"
										class="card-action card-action-ghost card-action-sm"
										@click="resetVenvPath"
									>
										恢复默认
									</button>
									<button
										type="button"
										class="card-action card-action-danger card-action-sm"
										@click="onClearVenv"
										:disabled="clearingVenv || fixingPython"
										title="清空当前虚拟环境（不会影响ComfyUI源码和用户数据）"
									>
										{{ clearingVenv ? '清空中...' : '🗑 清空环境' }}
									</button>
								</div>
									<div class="venv-size-hint">
										<span class="size-hint-icon">💾</span>
										<span class="size-hint-text">预计所需磁盘空间：GPU 版本约 6-8 GB，CPU 版本约 2-3 GB</span>
									</div>
								</div>
								<button
									type="button"
									class="card-action card-action-primary"
									@click="fixPythonEnv(false)"
								>
									一键配置 Python 环境
								</button>
							</div>

							<div v-if="fixingPython || pythonFixLogs.length > 0" class="python-fix-panel">
								<div class="python-fix-step">
									<span v-if="fixingPython" class="spinner" />
									<span v-else-if="pythonFixError" class="python-fix-icon error">✗</span>
									<span v-else-if="pythonFixDone" class="python-fix-icon ok">✓</span>
									<span class="python-fix-step-text">{{ pythonFixMessage || (pythonFixDone ? '配置完成' : '配置中...') }}</span>
								</div>
								<div class="python-fix-logs" ref="pythonLogsRef">
									<div
										v-for="log in pythonFixLogs"
										:key="log.id"
										class="python-log-line"
										:class="log.stream === 'stderr' ? 'log-stderr' : 'log-stdout'"
									>{{ log.message }}</div>
									<div
										v-if="pythonProgressLine"
										:key="'progress-' + pythonProgressLine.id"
										class="python-log-line"
										:class="pythonProgressLine.stream === 'stderr' ? 'log-stderr' : 'log-stdout'"
									>{{ pythonProgressLine.message }}</div>
								</div>
								<div v-if="pythonFixError" class="python-fix-error">
									<div class="python-error-header">
										<span class="python-error-icon">⚠️</span>
										<span class="python-error-title">配置失败</span>
									</div>
									<div class="python-error-text">{{ pythonFixError }}</div>
									<div v-if="pythonNeedsManualInstall" class="python-error-solution manual-install">
										<div class="solution-env-info">
											<span class="env-badge">Python {{ pythonDetectedVersion || '?' }}</span>
											<span class="env-badge">{{ pythonPlatformTag || 'win_amd64' }}</span>
											<span class="env-badge">{{ pythonCudaVersion || 'cu124' }}</span>
											<span class="env-badge">PyTorch {{ pythonTorchVersion || '?' }}</span>
										</div>
										
										<div class="solution-section recommended">
											<div class="solution-tip">
												<span class="solution-icon">⚡</span>
												<span class="solution-text"><strong>推荐方案：一键命令安装（最简单）</strong></span>
											</div>
											<p class="solution-desc">复制下方命令，打开任意命令行窗口（CMD或PowerShell），粘贴后回车执行即可自动从阿里云镜像下载安装：</p>
											<div class="code-block with-copy one-click-cmd" @click="copyText(pythonOneClickInstallCmd)">
												<code>{{ pythonOneClickInstallCmd }}</code>
												<span class="copy-hint">点击复制</span>
											</div>
											<div class="cmd-tip success">💡 此命令会自动下载并安装PyTorch GPU版本及其依赖，使用国内阿里云镜像加速。执行完成后点击「检测并修复」按钮即可继续，不会删除已安装环境。</div>
										</div>
										
										<details class="solution-section fallback">
											<summary class="fallback-summary">
												<span class="solution-icon">📥</span>
												<span>备选方案：手动下载whl包安装（适用于一键命令仍失败的情况）</span>
											</summary>
											<ol class="solution-list ordered">
												<li>
													<strong>下载3个whl文件</strong>（点击按钮直接用浏览器打开下载，推荐阿里云源速度快）：
													<div class="wheel-download-list">
														<div class="wheel-item">
															<span class="wheel-name">torch (~2.4GB)</span>
															<span class="wheel-file" :title="pythonTorchWheel">{{ pythonTorchWheel }}</span>
															<div class="wheel-links">
																<button type="button" class="wheel-link primary" @click="openUrl(pythonAliyunTorchUrl)">⬇ 阿里云下载</button>
																<button type="button" class="wheel-link" @click="openUrl(pythonOfficialTorchUrl)">⬇ 官方下载</button>
															</div>
														</div>
														<div class="wheel-item">
															<span class="wheel-name">torchvision (~6MB)</span>
															<span class="wheel-file" :title="pythonTorchvisionWheel">{{ pythonTorchvisionWheel }}</span>
															<div class="wheel-links">
																<button type="button" class="wheel-link primary" @click="openUrl(pythonAliyunTorchvisionUrl)">⬇ 阿里云下载</button>
																<button type="button" class="wheel-link" @click="openUrl(pythonOfficialTorchvisionUrl)">⬇ 官方下载</button>
															</div>
														</div>
														<div class="wheel-item">
															<span class="wheel-name">torchaudio (~4MB)</span>
															<span class="wheel-file" :title="pythonTorchaudioWheel">{{ pythonTorchaudioWheel }}</span>
															<div class="wheel-links">
																<button type="button" class="wheel-link primary" @click="openUrl(pythonAliyunTorchaudioUrl)">⬇ 阿里云下载</button>
																<button type="button" class="wheel-link" @click="openUrl(pythonOfficialTorchaudioUrl)">⬇ 官方下载</button>
															</div>
														</div>
													</div>
												</li>
												<li>
													<strong>打开命令行</strong>：打开文件资源管理器，找到刚下载的3个whl文件所在文件夹，在文件夹空白处按住 <code>Shift</code> 键 + 鼠标右键，选择「在此处打开PowerShell窗口」或「在终端中打开」。
												</li>
												<li>
													<strong>执行本地安装命令</strong>：点击下方「复制本地安装命令」按钮，然后在打开的命令行窗口中右键粘贴并回车执行：
													<div class="code-block with-copy" @click="copyText(pythonManualInstallCmd)">
														<code>{{ pythonManualInstallCmd }}</code>
														<span class="copy-hint">点击复制</span>
													</div>
												</li>
												<li>
													<strong>安装依赖包</strong>：whl安装完成后，执行以下命令安装依赖：
													<div class="code-block with-copy" @click="copyText(pythonInstallDepsCmd)">
														<code>{{ pythonInstallDepsCmd }}</code>
														<span class="copy-hint">点击复制</span>
													</div>
												</li>
												<li>
													<strong>安装完成后</strong>，点击下方「检测并修复」按钮继续（不会删除已安装环境）。
												</li>
											</ol>
										</details>
									</div>
									<div class="python-error-actions">
									<button
										v-if="pythonAutoInstallAvailable && !autoInstallingTorch"
										type="button"
										class="card-action card-action-success card-action-sm"
										@click="autoInstallTorch"
										:disabled="fixingPython"
									>
										⚡ 一键自动安装
									</button>
									<button
										v-if="autoInstallingTorch"
										type="button"
										class="card-action card-action-success card-action-sm"
										disabled
									>
										<span class="spinner" /> 正在自动安装...
									</button>
									<button
										v-if="pythonNeedsManualInstall && pythonOneClickInstallCmd && !pythonAutoInstallAvailable"
										type="button"
										class="card-action card-action-primary card-action-sm"
										@click="copyText(pythonOneClickInstallCmd)"
									>
										📋 复制一键安装命令
									</button>
									<button
										v-if="pythonNeedsManualInstall && pythonAliyunDirUrl"
										type="button"
										class="card-action card-action-link card-action-sm"
										@click="openUrl(pythonAliyunDirUrl)"
									>
										📂 浏览阿里云镜像目录
									</button>
									<button
										type="button"
										class="card-action card-action-primary card-action-sm"
										@click="fixPythonEnv(false)"
										:disabled="fixingPython || autoInstallingTorch"
									>
										{{ fixingPython ? '检测中...' : '🔍 检测并修复' }}
									</button>
									<button
										type="button"
										class="card-action card-action-warn card-action-sm"
										@click="onRebuildEnv"
										:disabled="fixingPython || autoInstallingTorch"
										title="警告：这将删除虚拟环境并完全重新安装，仅在环境彻底损坏时使用"
									>
										🔄 彻底重建
									</button>
									<button
										type="button"
										class="card-action card-action-danger card-action-sm"
										@click="onClearVenv"
										:disabled="clearingVenv || fixingPython || autoInstallingTorch"
										title="清空当前虚拟环境，之后可重新配置"
									>
										{{ clearingVenv ? '清空中...' : '🗑 清空虚拟环境' }}
									</button>
								</div>
								</div>
								<div v-if="pythonFixDone && !fixingPython" class="python-fix-done">
									<button type="button" class="card-action card-action-primary card-action-sm" @click="checkEnv">刷新检测</button>
								</div>
							</div>
						</div>
					</section>

					<section
						v-if="!freshInstallMode"
						class="setup-card"
						@mouseenter="serviceCardHovered = true"
						@mouseleave="serviceCardHovered = false"
						@focusin="serviceCardHovered = true"
						@focusout="serviceCardHovered = false"
					>
						<div class="card-glow" aria-hidden="true"></div>
						<div class="sq-container" aria-hidden="true">
							<span
								v-for="p in serviceCardParticles.particles"
								:key="p.id"
								class="sq-particle"
								:class="serviceCardParticles.buildHoverStateClass(serviceCardHovered, { running: serviceRunning, error: false })"
								:style="p.style"
							></span>
						</div>
						<div class="card-frame" aria-hidden="true">
							<span class="corner tl"></span>
							<span class="corner tr"></span>
							<span class="corner bl"></span>
							<span class="corner br"></span>
						</div>
						<div class="setup-card-body">
							<div class="card-section-head">
								<h3 class="setup-card-title">服务管理</h3>
								<span class="service-status-badge" :class="serviceRunning ? 'on' : 'off'">
									{{ serviceRunning ? '运行中' : '未运行' }}
								</span>
							</div>
							<div class="service-row">
								<div class="service-actions">
									<button
										v-if="!serviceRunning"
										type="button"
										class="card-action card-action-primary"
										@click="startService"
										:disabled="serviceStarting || !envResult?.comfyUIFound"
										:title="!envResult?.comfyUIFound ? '请先配置有效的 ComfyUI 路径' : ''"
									>
										{{ serviceStarting ? '启动中...' : '启动 ComfyUI' }}
									</button>
									<button
										v-else
										type="button"
										class="card-action card-action-danger"
										@click="stopService"
									>
										停止服务
									</button>
									<button
										type="button"
										class="card-action"
										@click="openInstallFolder"
										:disabled="!installPath"
									>
										打开目录
									</button>
								</div>
							</div>
							<div v-if="serviceRunning && envResult?.serviceUrl" class="service-url-box">
								<span>ComfyUI 地址：</span>
								<span class="service-url-link">{{ envResult.serviceUrl }}</span>
							</div>
							<div v-if="serviceRunning" class="service-hint-box">
								<span>服务已启动，可在主窗口左侧「服务」面板查看实时日志和管理进程。</span>
							</div>
						</div>
					</section>
				</div>
			</div>

			<footer class="setup-footer">
				<button type="button" class="card-action card-action-primary" @click="closeWindow">关闭</button>
			</footer>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, onMounted, watch, nextTick, ref } from 'vue'
import { useComfyUISetup } from '../composables/useComfyUISetup'
import { useSquareParticles } from '../composables/useSquareParticles'
import { openExternalUrl } from '../electronBridge'
import GlobalPageBackground from '../ui/UIComponent/GlobalPageBackground.vue'
import '../styles/square-particles.css'

const {
	installPath, defaultInstallPath, pathValidation,
	probeResult, probing, pathChanging,
	checking, envResult,
	serviceRunning, serviceStarting,
	customModelPaths,
	pingingMirrors, mirrorPingResults, pypiMirrorList, torchMirrorList,
	selectedPypiMirror, selectedTorchMirror,
	customPypiUrl, customTorchUrl, mirrorSaving, mirrorSaveMessage,
	fixingPython, pythonFixMessage, pythonFixLogs, pythonProgressLine, pythonFixError, pythonFixDone,
	pythonNeedsManualInstall, pythonAutoInstallAvailable, pythonManualDownloadUrl, pythonOfficialDownloadUrl, pythonCudaVersion,
	pythonDetectedVersion, pythonPlatformTag, pythonAbiTag, pythonTorchVersion,
	pythonTorchWheel, pythonTorchvisionWheel, pythonTorchaudioWheel,
	pythonAliyunTorchUrl, pythonAliyunTorchvisionUrl, pythonAliyunTorchaudioUrl,
	pythonOfficialTorchUrl, pythonOfficialTorchvisionUrl, pythonOfficialTorchaudioUrl,
	pythonVenvPythonPath, pythonOneClickInstallCmd, pythonManualInstallCmd, pythonInstallDepsCmd,
	pythonAliyunDirUrl, pythonOfficialDirUrl,
	autoInstallingTorch, clearingVenv,
	logsUpdated,
	venvPath, defaultVenvPath, selectingVenvPath,
	cloningComfyUI, cloneStep, cloneMessage, cloneLogs, cloneError, cloneDone,
	updatingComfyUI, updateStep, updateMessage, updateLogs, updateError, updateDone, updateNeedDepUpdate,
	versionChecking, versionUpdateInfo, freshInstallMode,
	loadDefaultPath, loadDefaultVenvPath, selectPath, selectVenvPath, resetVenvPath, setInstallPath,
	checkVersionUpdate, resetForFreshInstall, exitFreshInstallMode, confirmFreshInstall,
	checkEnv, openInstallFolder, loadConfig, loadMirrorList, saveConfig,
	addCustomModelPath, removeCustomModelPath,
	startService, stopService,
	pingMirrors, saveMirrorConfig, fixPythonEnv, cloneComfyUI, updateComfyUI, autoInstallTorch, clearVenv,
	getStatusColor,
} = useComfyUISetup()

const pathCardParticles = useSquareParticles({ count: 6, seed: 101 })
const envCardParticles = useSquareParticles({ count: 5, seed: 102 })
const mirrorCardParticles = useSquareParticles({ count: 5, seed: 103 })
const pythonCardParticles = useSquareParticles({ count: 8, seed: 104 })
const serviceCardParticles = useSquareParticles({ count: 6, seed: 105 })
const freshCardParticles = useSquareParticles({ count: 7, seed: 106 })

const pathCardHovered = ref(false)
const envCardHovered = ref(false)
const mirrorCardHovered = ref(false)
const pythonCardHovered = ref(false)
const serviceCardHovered = ref(false)
const freshCardHovered = ref(false)

const pypiMirrorsWithLatency = computed(() => {
	const pingMap = new Map<string, { reachable: boolean; latency: number | null }>()
	for (const r of mirrorPingResults.value) {
		if (r.kind === 'pypi') pingMap.set(r.key, { reachable: r.reachable, latency: r.latency })
	}
	return pypiMirrorList.value.map(m => {
		const p = pingMap.get(m.key)
		return { ...m, reachable: p?.reachable ?? null, latency: p?.latency ?? null }
	})
})

const torchMirrorsWithLatency = computed(() => {
	const pingMap = new Map<string, { reachable: boolean; latency: number | null }>()
	for (const r of mirrorPingResults.value) {
		if (r.kind === 'torch') pingMap.set(r.key, { reachable: r.reachable, latency: r.latency })
	}
	return torchMirrorList.value.map(m => {
		const p = pingMap.get(m.key)
		return { ...m, reachable: p?.reachable ?? null, latency: p?.latency ?? null }
	})
})

const showMirrorSection = computed(() => {
	return installPath.value && pathValidation.value?.exists !== false
})

const showPythonFixSection = computed(() => {
	if (fixingPython.value || pythonFixError.value || pythonFixDone.value) return true
	if (envResult.value?.comfyUIFound) return true
	if (installPath.value && pathValidation.value?.exists !== false) return true
	return false
})

const showCloneSection = computed(() => {
	if (cloningComfyUI.value || cloneError.value || cloneDone.value) return true
	return false
})

const showUpdateSection = computed(() => {
	if (updatingComfyUI.value || updateError.value || updateDone.value) return true
	return false
})

const isNetworkError = computed(() => {
	const err = pythonFixError.value || ''
	return err.includes('IncompleteRead') || err.includes('timeout') || err.includes('Connection') || err.includes('网络下载中断') || err.includes('网络下载中断问题')
})

async function openUrl(url: string) {
	if (url) {
		await openExternalUrl(url)
	}
}

async function copyText(text: string) {
	if (!text) return
	try {
		await navigator.clipboard.writeText(text)
	} catch {
		const ta = document.createElement('textarea')
		ta.value = text
		ta.style.position = 'fixed'
		ta.style.opacity = '0'
		document.body.appendChild(ta)
		ta.select()
		try { document.execCommand('copy') } catch {}
		document.body.removeChild(ta)
	}
}

const pythonLogsRef = ref<HTMLElement | null>(null)

watch(logsUpdated, async () => {
	await nextTick()
	if (pythonLogsRef.value) {
		pythonLogsRef.value.scrollTop = pythonLogsRef.value.scrollHeight
	}
})

onMounted(async () => {
	await loadDefaultPath()
	await loadDefaultVenvPath()
	await loadConfig()
	await loadMirrorList()
	if (installPath.value) {
		await setInstallPath(installPath.value)
	} else {
		await checkEnv()
	}
})

function installTypeLabel(type: string) {
	switch (type) {
		case 'portable': return '便携版'
		case 'venv': return '虚拟环境 (venv)'
		case 'standard': return '标准安装'
		default: return '未知'
	}
}

function pythonTypeLabel(type: string) {
	switch (type) {
		case 'managed_venv': return '客户端托管'
		case 'portable': return '便携版'
		case 'venv': return 'venv'
		case 'desktop_bundled': return '桌面版内置'
		case 'system': return '系统 Python'
		case 'py_launcher': return 'py 启动器'
		default: return type
	}
}

function modelTypeLabel(type: string) {
	const labels: Record<string, string> = {
		checkpoints: 'Checkpoints',
		loras: 'LoRAs',
		vae: 'VAE',
		controlnet: 'ControlNet',
		embeddings: 'Embeddings',
		upscale_models: '放大模型',
		clip: 'CLIP',
		clip_vision: 'CLIP Vision',
		text_encoders: '文本编码器',
		diffusion_models: '扩散模型',
	}
	return labels[type] || type
}

function shortenPath(p: string) {
	if (p.length <= 55) return p
	const drive = p.match(/^[A-Za-z]:[\\/]/)?.[0] || ''
	const parts = p.replace(/^[A-Za-z]:[\\/]/, '').split(/[\\/]/)
	if (parts.length <= 3) return p
	return drive + '...' + parts.slice(-3).join('/')
}

function handleFix(key: string) {
	if (key === 'service' && envResult.value?.comfyUIFound) {
		startService()
	} else if (key === 'comfyui') {
		cloneComfyUI()
	} else if (key === 'venv' || key === 'deps') {
		fixPythonEnv(false)
	}
}

function onRebuildEnv() {
	if (window.confirm('⚠️ 确定要彻底重建 Python 环境吗？\n\n这将删除现有的虚拟环境并重新安装所有依赖（约 6-8 GB）。\n\n如果您手动通过命令行安装了 PyTorch，这些安装将会丢失。\n\n通常情况下，请使用「检测并修复」按钮，它不会删除已安装的环境。\n\n只有在环境彻底损坏无法修复时，才建议使用此选项。')) {
		fixPythonEnv(true)
	}
}

function onClearVenv() {
	if (window.confirm('⚠️ 确定要清空虚拟环境吗？\n\n这将删除当前的 Python 虚拟环境（包括已安装的 PyTorch 和所有依赖包），但不会影响 ComfyUI 源码、模型、工作流等用户数据。\n\n清空后您需要重新配置 Python 环境。')) {
		clearVenv(true)
	}
}

function latencyClass(latency: number | null, reachable: boolean | null) {
	if (reachable === null) return 'latency-unknown'
	if (!reachable) return 'latency-fail'
	if (latency === null) return 'latency-unknown'
	if (latency < 300) return 'latency-good'
	if (latency < 800) return 'latency-ok'
	return 'latency-slow'
}

function closeWindow() {
	saveConfig()
	const dweb = (window as unknown as { dweb?: { window?: { close?: () => void } } }).dweb
	if (typeof dweb?.window?.close === 'function') {
		dweb.window.close()
	}
}
</script>

<style scoped>
.comfyui-setup-page {
	position: relative;
	z-index: 1;
	width: 100%;
	height: 100%;
	overflow: hidden;
	background: linear-gradient(180deg, var(--pl-bg-0) 0%, var(--pl-bg-1) 100%);
	color: var(--pl-fg);
	font-size: 13px;
}

.setup-shell {
	position: relative;
	z-index: 1;
	display: flex;
	flex-direction: column;
	width: 100%;
	height: 100%;
	max-width: 960px;
	margin: 0 auto;
}

.setup-header {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 28px 24px 24px;
	margin-bottom: 24px;
	border-bottom: 1px solid color-mix(in srgb, var(--pl-accent) 22%, transparent);
	flex-shrink: 0;
}

.setup-title {
	font-size: 22px;
	font-weight: 700;
	color: var(--pl-fg);
	text-shadow: 0 0 12px color-mix(in srgb, var(--pl-accent) 35%, transparent);
	letter-spacing: 0.02em;
}

.setup-sub {
	font-size: 12px;
	color: var(--pl-fg-soft);
	line-height: 1.6;
}

.setup-sub::before {
	content: "";
	display: inline-block;
	width: 6px;
	height: 6px;
	margin-right: 8px;
	background: var(--pl-accent);
	box-shadow: 0 0 8px var(--pl-accent);
	vertical-align: middle;
}

.setup-scroll {
	flex: 1;
	overflow-y: auto;
	min-height: 0;
	padding: 0 24px;
}

.setup-content {
	display: flex;
	flex-direction: column;
	gap: 18px;
	padding-bottom: 20px;
}

.setup-card {
	position: relative;
	overflow: hidden;
	padding: 20px 22px;
	background: linear-gradient(
		135deg,
		color-mix(in srgb, var(--pl-bg-1) 70%, transparent),
		color-mix(in srgb, var(--pl-bg-0) 85%, transparent)
	);
	border: 1px solid var(--pl-card-border);
	box-sizing: border-box;
	box-shadow: 0 2px 10px rgba(0, 0, 0, 0.25),
		inset 0 1px 0 color-mix(in srgb, var(--pl-accent) 22%, transparent);
	transition: transform 220ms cubic-bezier(0.22, 0.61, 0.36, 1),
		box-shadow 220ms ease, border-color 220ms ease, filter 220ms ease;
	border-radius: 2px;
}

.setup-card:hover,
.setup-card:focus-within {
	transform: translateY(-2px);
	filter: brightness(1.08);
	border-color: color-mix(in srgb, var(--pl-accent) 55%, transparent);
	box-shadow: 0 0 0 1px color-mix(in srgb, var(--pl-accent) 45%, transparent),
		0 14px 40px rgba(0, 0, 0, 0.45);
}

.card-glow {
	position: absolute;
	inset: -1px;
	z-index: 1;
	pointer-events: none;
	background: radial-gradient(
		ellipse at center,
		color-mix(in srgb, var(--pl-accent) 8%, transparent),
		transparent 70%
	);
	opacity: 0;
	transition: opacity 280ms ease;
}

.setup-card:hover .card-glow,
.setup-card:focus-within .card-glow {
	opacity: 1;
}

.card-frame {
	position: absolute;
	inset: 0;
	z-index: 3;
	pointer-events: none;
}

.card-frame .corner {
	position: absolute;
	width: 10px;
	height: 10px;
	border-color: var(--pl-accent);
	transition: width 220ms cubic-bezier(0.22, 0.61, 0.36, 1),
		height 220ms cubic-bezier(0.22, 0.61, 0.36, 1);
}

.card-frame .corner.tl {
	top: 4px;
	left: 4px;
	border-top: 1px solid currentColor;
	border-left: 1px solid currentColor;
	color: var(--pl-accent);
}

.card-frame .corner.tr {
	top: 4px;
	right: 4px;
	border-top: 1px solid currentColor;
	border-right: 1px solid currentColor;
	color: var(--pl-accent);
}

.card-frame .corner.bl {
	bottom: 4px;
	left: 4px;
	border-bottom: 1px solid currentColor;
	border-left: 1px solid currentColor;
	color: var(--pl-accent);
}

.card-frame .corner.br {
	bottom: 4px;
	right: 4px;
	border-bottom: 1px solid currentColor;
	border-right: 1px solid currentColor;
	color: var(--pl-accent);
}

.setup-card:hover .card-frame .corner,
.setup-card:focus-within .card-frame .corner {
	width: 16px;
	height: 16px;
	color: var(--pl-glow-1);
}

.setup-card-body {
	position: relative;
	z-index: 4;
	display: flex;
	flex-direction: column;
	gap: 14px;
}

.card-section-head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
	flex-wrap: wrap;
}

.setup-card-title {
	margin: 0;
	font-size: 14px;
	font-weight: 600;
	color: var(--pl-fg);
	letter-spacing: 0.04em;
	text-transform: uppercase;
}

.path-row {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.path-input-group {
	display: flex;
	gap: 8px;
	align-items: center;
}

.path-input {
	flex: 1;
	height: 36px;
	padding: 0 14px;
	background: color-mix(in srgb, var(--pl-fg) 4%, transparent);
	border: 1px solid color-mix(in srgb, var(--pl-accent) 35%, transparent);
	color: var(--pl-fg);
	font-size: 13px;
	font-family: 'JetBrains Mono', 'Consolas', 'Microsoft YaHei', monospace;
	outline: none;
	border-radius: 2px;
	transition: border-color 200ms ease, background 200ms ease, box-shadow 200ms ease;
	min-width: 0;
}

.path-input::placeholder {
	color: color-mix(in srgb, var(--pl-fg-soft) 60%, transparent);
}

.path-input:focus {
	border-color: color-mix(in srgb, var(--pl-accent) 75%, transparent);
	background: color-mix(in srgb, var(--pl-fg) 6%, transparent);
	box-shadow: 0 0 0 1px color-mix(in srgb, var(--pl-accent) 30%, transparent),
		0 0 20px color-mix(in srgb, var(--pl-accent) 18%, transparent);
}

.path-hint {
	font-size: 12px;
}

.hint-ok { color: #4ade80; }
.hint-warn { color: #facc15; }
.hint-error { color: #f87171; }

.compat-badge {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	font-size: 11px;
	padding: 3px 10px;
	border-radius: 2px;
	font-weight: 500;
	letter-spacing: 0.03em;
}

.compat-badge.compat-full {
	background: color-mix(in srgb, var(--pl-accent) 15%, transparent);
	color: var(--pl-glow-1);
	border: 1px solid color-mix(in srgb, var(--pl-accent) 35%, transparent);
}

.compat-badge.compat-checking {
	background: color-mix(in srgb, var(--pl-cold) 12%, transparent);
	color: var(--pl-glow-2);
	border: 1px solid color-mix(in srgb, var(--pl-cold) 30%, transparent);
}

.spinner-sm {
	display: inline-block;
	width: 10px;
	height: 10px;
	border: 2px solid rgba(255, 255, 255, 0.12);
	border-top-color: var(--pl-glow-2);
	border-radius: 50%;
	animation: spin 0.8s linear infinite;
	flex-shrink: 0;
}

.probe-loading {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 12px 14px;
	background: color-mix(in srgb, var(--pl-cold) 8%, transparent);
	border: 1px solid color-mix(in srgb, var(--pl-cold) 25%, transparent);
	border-radius: 2px;
	font-size: 12px;
	color: var(--pl-glow-2);
}

.probe-result {
	padding: 14px 16px;
	background: color-mix(in srgb, var(--pl-accent) 5%, color-mix(in srgb, var(--pl-bg-1) 60%, transparent));
	border: 1px solid color-mix(in srgb, var(--pl-accent) 20%, var(--pl-card-border));
	border-radius: 2px;
}

.probe-result.probe-error {
	background: color-mix(in srgb, #f87171 5%, color-mix(in srgb, var(--pl-bg-1) 60%, transparent));
	border-color: color-mix(in srgb, #f87171 25%, var(--pl-card-border));
}

.probe-head {
	display: flex;
	align-items: center;
	gap: 12px;
	margin-bottom: 12px;
	flex-wrap: wrap;
}

.probe-title {
	font-weight: 600;
	font-size: 13px;
	color: var(--pl-fg);
}

.probe-compat {
	font-size: 11px;
	padding: 2px 10px;
	border-radius: 2px;
	font-weight: 500;
	border: 1px solid transparent;
}

.probe-compat.compat-full {
	background: color-mix(in srgb, #4ade80 12%, transparent);
	color: #4ade80;
	border-color: color-mix(in srgb, #4ade80 30%, transparent);
}

.probe-compat.compat-partial {
	background: color-mix(in srgb, #facc15 12%, transparent);
	color: #facc15;
	border-color: color-mix(in srgb, #facc15 30%, transparent);
}

.probe-compat.compat-none {
	background: color-mix(in srgb, #f87171 12%, transparent);
	color: #f87171;
	border-color: color-mix(in srgb, #f87171 30%, transparent);
}

.probe-grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
	gap: 8px;
}

.probe-item {
	display: flex;
	flex-direction: column;
	gap: 3px;
	padding: 8px 12px;
	background: color-mix(in srgb, var(--pl-fg) 3%, transparent);
	border: 1px solid color-mix(in srgb, var(--pl-fg) 6%, transparent);
	border-radius: 2px;
}

.probe-item-label {
	font-size: 11px;
	color: var(--pl-fg-soft);
	text-transform: uppercase;
	letter-spacing: 0.04em;
}

.probe-item-value {
	font-size: 12px;
	font-weight: 500;
	color: var(--pl-fg);
}

.probe-mono {
	font-family: 'JetBrains Mono', 'Consolas', monospace;
	font-size: 11px;
}

.probe-badge {
	display: inline-block;
	font-size: 10px;
	padding: 2px 8px;
	border-radius: 2px;
	font-weight: 500;
	vertical-align: middle;
	border: 1px solid transparent;
}

.badge-desktop {
	background: color-mix(in srgb, #a78bfa 12%, transparent);
	color: #c4b5fd;
	border-color: color-mix(in srgb, #a78bfa 30%, transparent);
}

.badge-extra {
	background: color-mix(in srgb, var(--pl-accent) 12%, transparent);
	color: var(--pl-glow-1);
	border-color: color-mix(in srgb, var(--pl-accent) 30%, transparent);
	margin-left: 6px;
}

.probe-tag {
	display: inline-block;
	font-size: 10px;
	padding: 1px 6px;
	border-radius: 2px;
	background: color-mix(in srgb, var(--pl-fg) 6%, transparent);
	color: var(--pl-fg-soft);
	margin-left: 6px;
	vertical-align: middle;
	border: 1px solid color-mix(in srgb, var(--pl-fg) 10%, transparent);
}

.probe-tag.tag-cuda {
	background: color-mix(in srgb, #34d399 12%, transparent);
	color: #6ee7b7;
	border-color: color-mix(in srgb, #34d399 30%, transparent);
}

.probe-tag.tag-cpu {
	background: color-mix(in srgb, #9ca3af 10%, transparent);
	color: #d1d5db;
	border-color: color-mix(in srgb, #9ca3af 20%, transparent);
}

.probe-value-error {
	color: #f87171;
}

.probe-item-wide {
	grid-column: span 2;
}

.probe-section-title {
	font-size: 11px;
	font-weight: 600;
	color: var(--pl-fg-soft);
	text-transform: uppercase;
	letter-spacing: 0.06em;
	margin-bottom: 8px;
	margin-top: 14px;
	display: flex;
	align-items: center;
}

.probe-models,
.probe-model-config {
	margin-top: 4px;
}

.model-list {
	display: flex;
	flex-direction: column;
	gap: 3px;
}

.model-row {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 6px 10px;
	background: color-mix(in srgb, var(--pl-fg) 2%, transparent);
	border: 1px solid color-mix(in srgb, var(--pl-fg) 5%, transparent);
	border-radius: 2px;
	flex-wrap: wrap;
}

.model-name {
	font-size: 11px;
	font-weight: 500;
	min-width: 100px;
	color: var(--pl-fg);
}

.model-count {
	font-size: 12px;
	font-weight: 600;
	color: var(--pl-glow-1);
	min-width: 30px;
	text-align: right;
	font-family: 'JetBrains Mono', 'Consolas', monospace;
}

.model-count-zero {
	color: var(--pl-fg-soft);
}

.model-sources {
	display: flex;
	flex-direction: column;
	gap: 2px;
	flex: 1;
	min-width: 200px;
}

.model-source {
	display: flex;
	align-items: center;
	gap: 8px;
	font-size: 10px;
}

.model-source-path {
	flex: 1;
	color: var(--pl-fg-soft);
	font-family: 'JetBrains Mono', 'Consolas', monospace;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.model-source-count {
	color: var(--pl-glow-1);
	font-family: 'JetBrains Mono', 'Consolas', monospace;
	font-size: 10px;
	flex-shrink: 0;
}

.model-section-head {
	justify-content: space-between;
	flex-wrap: wrap;
	gap: 6px;
}

.probe-badges {
	display: inline-flex;
	align-items: center;
	gap: 5px;
	flex-wrap: wrap;
	margin-left: 6px;
}

.probe-mini-btn {
	font-size: 10px;
	padding: 4px 10px;
	border-radius: 2px;
	border: 1px solid color-mix(in srgb, var(--pl-accent) 25%, transparent);
	background: color-mix(in srgb, var(--pl-accent) 6%, transparent);
	color: var(--pl-glow-1);
	cursor: pointer;
	transition: background 200ms ease, border-color 200ms ease, box-shadow 200ms ease;
	margin-left: auto;
	text-transform: none;
	letter-spacing: normal;
	font-weight: 500;
	font-family: inherit;
}

.probe-mini-btn:hover {
	background: color-mix(in srgb, var(--pl-accent) 14%, transparent);
	border-color: color-mix(in srgb, var(--pl-accent) 50%, transparent);
	box-shadow: 0 0 10px color-mix(in srgb, var(--pl-accent) 18%, transparent);
}

.probe-update-btn {
	margin-left: 8px;
	background: color-mix(in srgb, var(--pl-accent) 20%, transparent);
	border-color: var(--pl-accent);
	color: var(--pl-glow-2);
	font-weight: 600;
	animation: pulse-update 2s ease-in-out infinite;
}

.probe-update-btn:hover {
	background: color-mix(in srgb, var(--pl-accent) 30%, transparent);
	box-shadow: 0 0 16px color-mix(in srgb, var(--pl-accent) 30%, transparent);
	animation: none;
}

@keyframes pulse-update {
	0%, 100% { box-shadow: 0 0 6px color-mix(in srgb, var(--pl-accent) 12%, transparent); }
	50% { box-shadow: 0 0 16px color-mix(in srgb, var(--pl-accent) 28%, transparent); }
}

.cmd-tip.warn {
	background: color-mix(in srgb, #f59e0b 10%, transparent);
	border-left-color: #f59e0b;
	color: #fbbf24;
	border-left: 3px solid #f59e0b;
	padding: 8px 12px;
	border-radius: 2px;
	margin-top: 8px;
	font-style: normal;
	font-size: 11px;
}

.cmd-tip.error {
	border-left: 3px solid #ef4444;
	padding: 8px 12px;
	color: #fca5a5;
	font-style: normal;
	font-size: 11px;
	margin-top: 6px;
	background: color-mix(in srgb, #ef4444 8%, transparent);
	border-radius: 2px;
}

.custom-model-paths {
	display: flex;
	flex-direction: column;
	gap: 4px;
	margin: 6px 0 8px;
}

.custom-model-path-item {
	display: flex;
	align-items: center;
	gap: 6px;
	padding: 5px 10px;
	background: color-mix(in srgb, var(--pl-accent) 6%, transparent);
	border: 1px solid color-mix(in srgb, var(--pl-accent) 22%, transparent);
	border-radius: 2px;
}

.custom-model-path-text {
	flex: 1;
	font-size: 11px;
	font-family: 'JetBrains Mono', 'Consolas', monospace;
	color: var(--pl-fg);
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.custom-model-path-remove {
	width: 20px;
	height: 20px;
	border-radius: 2px;
	border: none;
	background: color-mix(in srgb, #f87171 12%, transparent);
	color: #f87171;
	font-size: 14px;
	line-height: 1;
	cursor: pointer;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	flex-shrink: 0;
	transition: background 150ms ease;
}

.custom-model-path-remove:hover {
	background: color-mix(in srgb, #f87171 25%, transparent);
}

.badge-custom {
	background: color-mix(in srgb, var(--pl-accent) 15%, transparent);
	color: var(--pl-glow-1);
	border-color: color-mix(in srgb, var(--pl-accent) 30%, transparent);
}

.model-empty-hint {
	margin-top: 0;
	margin-bottom: 6px;
}

.probe-python-path {
	margin-top: 10px;
}

.probe-path-text {
	display: block;
	font-size: 11px;
	font-family: 'JetBrains Mono', 'Consolas', monospace;
	color: var(--pl-fg-soft);
	padding: 8px 10px;
	background: color-mix(in srgb, var(--pl-fg) 3%, transparent);
	border: 1px solid color-mix(in srgb, var(--pl-fg) 6%, transparent);
	border-radius: 2px;
	word-break: break-all;
}

.probe-messages {
	margin-top: 10px;
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.probe-msg {
	font-size: 11px;
	padding: 6px 10px;
	border-radius: 2px;
	line-height: 1.5;
	border: 1px solid transparent;
}

.probe-msg-warn {
	background: color-mix(in srgb, #facc15 8%, transparent);
	color: #fde047;
	border-color: color-mix(in srgb, #facc15 20%, transparent);
}

.probe-msg-error {
	background: color-mix(in srgb, #f87171 8%, transparent);
	color: #fca5a5;
	border-color: color-mix(in srgb, #f87171 20%, transparent);
}

.probe-error-msg {
	font-size: 12px;
	color: #fca5a5;
}

.setup-loading, .setup-empty {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 24px;
	justify-content: center;
	color: var(--pl-fg-soft);
	font-size: 12px;
}

.env-list {
	display: flex;
	flex-direction: column;
	gap: 3px;
}

.env-row {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 9px 12px;
	border-radius: 2px;
	background: color-mix(in srgb, var(--pl-fg) 2%, transparent);
	border: 1px solid color-mix(in srgb, var(--pl-fg) 4%, transparent);
	font-size: 12px;
	transition: background 200ms ease;
}

.env-row.env-ok { background: color-mix(in srgb, #4ade80 4%, transparent); border-color: color-mix(in srgb, #4ade80 12%, transparent); }
.env-row.env-warn { background: color-mix(in srgb, #facc15 4%, transparent); border-color: color-mix(in srgb, #facc15 12%, transparent); }
.env-row.env-error { background: color-mix(in srgb, #f87171 4%, transparent); border-color: color-mix(in srgb, #f87171 12%, transparent); }

.env-status-dot {
	width: 8px;
	height: 8px;
	border-radius: 50%;
	flex-shrink: 0;
	box-shadow: 0 0 6px currentColor;
}

.env-name {
	font-weight: 500;
	min-width: 90px;
	flex-shrink: 0;
	color: var(--pl-fg);
}

.env-detail {
	flex: 1;
	color: var(--pl-fg-soft);
	font-size: 11px;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.env-version {
	color: var(--pl-glow-1);
	font-family: 'JetBrains Mono', 'Consolas', monospace;
	font-size: 11px;
	flex-shrink: 0;
}

.info-note {
	padding: 12px 14px;
	border-radius: 2px;
	font-size: 12px;
	line-height: 1.6;
	background: color-mix(in srgb, var(--pl-accent) 6%, transparent);
	border: 1px solid color-mix(in srgb, var(--pl-accent) 22%, transparent);
	color: var(--pl-glow-1);
}

.service-row {
	display: flex;
	align-items: center;
	gap: 12px;
	flex-wrap: wrap;
}

.service-status-badge {
	font-size: 11px;
	font-weight: 500;
	padding: 3px 12px;
	border-radius: 2px;
	letter-spacing: 0.04em;
	border: 1px solid transparent;
}

.service-status-badge.on {
	background: color-mix(in srgb, #4ade80 12%, transparent);
	color: #4ade80;
	border-color: color-mix(in srgb, #4ade80 30%, transparent);
}

.service-status-badge.off {
	background: color-mix(in srgb, var(--pl-fg) 4%, transparent);
	color: var(--pl-fg-soft);
	border-color: color-mix(in srgb, var(--pl-fg) 10%, transparent);
}

.service-actions {
	display: flex;
	gap: 8px;
	flex-wrap: wrap;
}

.service-url-box {
	margin-top: 12px;
	padding: 10px 12px;
	background: color-mix(in srgb, var(--pl-accent) 5%, transparent);
	border: 1px solid color-mix(in srgb, var(--pl-accent) 18%, transparent);
	border-radius: 2px;
	font-size: 12px;
	color: var(--pl-glow-1);
}

.service-url-link {
	font-family: 'JetBrains Mono', 'Consolas', monospace;
	color: var(--pl-accent);
}

.service-hint-box {
	margin-top: 8px;
	padding: 8px 12px;
	background: color-mix(in srgb, var(--pl-cold) 5%, transparent);
	border-left: 2px solid color-mix(in srgb, var(--pl-cold) 50%, transparent);
	border-radius: 2px;
	font-size: 11px;
	color: var(--pl-glow-2);
	line-height: 1.6;
}

.setup-footer {
	display: flex;
	justify-content: flex-end;
	gap: 8px;
	padding: 16px 0 4px;
	margin-top: 8px;
	border-top: 1px dashed color-mix(in srgb, var(--pl-accent) 20%, transparent);
	flex-shrink: 0;
}

.card-action {
	height: 36px;
	padding: 0 16px;
	background: color-mix(in srgb, var(--pl-fg) 4%, transparent);
	border: 1px solid color-mix(in srgb, var(--pl-accent) 22%, transparent);
	color: var(--pl-fg);
	font-size: 12px;
	letter-spacing: 0.04em;
	cursor: pointer;
	border-radius: 2px;
	transition: border-color 200ms ease, background 200ms ease, transform 160ms ease,
		box-shadow 200ms ease;
	font-family: inherit;
}

.card-action:hover:not(:disabled) {
	background: color-mix(in srgb, var(--pl-accent) 10%, transparent);
	border-color: color-mix(in srgb, var(--pl-accent) 50%, transparent);
	box-shadow: 0 0 12px color-mix(in srgb, var(--pl-accent) 20%, transparent);
}

.card-action:active:not(:disabled) {
	transform: translateY(1px);
}

.card-action:disabled {
	cursor: not-allowed;
	opacity: 0.5;
}

.card-action-primary {
	border-color: color-mix(in srgb, var(--pl-accent) 45%, transparent);
	background: color-mix(in srgb, var(--pl-accent) 10%, transparent);
	color: var(--pl-fg);
}

.card-action-primary:hover:not(:disabled) {
	background: color-mix(in srgb, var(--pl-accent) 18%, transparent);
	border-color: color-mix(in srgb, var(--pl-accent) 60%, transparent);
	box-shadow: 0 0 16px color-mix(in srgb, var(--pl-accent) 25%, transparent);
}

.card-action-danger {
	border-color: color-mix(in srgb, #f87171 35%, transparent);
	background: color-mix(in srgb, #f87171 8%, transparent);
	color: #fca5a5;
}

.card-action-danger:hover:not(:disabled) {
	background: color-mix(in srgb, #f87171 16%, transparent);
	border-color: color-mix(in srgb, #f87171 50%, transparent);
	box-shadow: 0 0 12px color-mix(in srgb, #f87171 20%, transparent);
}

.card-action-warn {
	border-color: color-mix(in srgb, #facc15 30%, transparent);
	background: color-mix(in srgb, #facc15 8%, transparent);
	color: #facc15;
}

.card-action-warn:hover:not(:disabled) {
	background: color-mix(in srgb, #facc15 16%, transparent);
	border-color: color-mix(in srgb, #facc15 50%, transparent);
	box-shadow: 0 0 12px color-mix(in srgb, #facc15 20%, transparent);
}

.card-action-success {
	border-color: color-mix(in srgb, #4ade80 40%, transparent);
	background: color-mix(in srgb, #4ade80 10%, transparent);
	color: #86efac;
}

.card-action-success:hover:not(:disabled) {
	background: color-mix(in srgb, #4ade80 18%, transparent);
	border-color: color-mix(in srgb, #4ade80 55%, transparent);
	box-shadow: 0 0 14px color-mix(in srgb, #4ade80 25%, transparent);
}

.card-action-link {
	border-color: color-mix(in srgb, #60a5fa 30%, transparent);
	background: color-mix(in srgb, #60a5fa 8%, transparent);
	color: #93c5fd;
}

.card-action-link:hover:not(:disabled) {
	background: color-mix(in srgb, #60a5fa 16%, transparent);
	border-color: color-mix(in srgb, #60a5fa 50%, transparent);
	box-shadow: 0 0 12px color-mix(in srgb, #60a5fa 20%, transparent);
}

.manual-install {
	border-color: color-mix(in srgb, #60a5fa 25%, transparent) !important;
	background: color-mix(in srgb, #60a5fa 6%, transparent) !important;
}

.manual-install .solution-tip {
	color: #93c5fd !important;
}

.manual-install .solution-list {
	color: #bfdbfe !important;
}

.card-action-ghost {
	background: transparent;
	border-color: color-mix(in srgb, var(--pl-fg) 12%, transparent);
	color: var(--pl-fg-soft);
}

.card-action-ghost:hover:not(:disabled) {
	background: color-mix(in srgb, var(--pl-fg) 5%, transparent);
	border-color: color-mix(in srgb, var(--pl-accent) 35%, transparent);
	color: var(--pl-fg);
}

.card-action-sm {
	height: 28px;
	padding: 0 12px;
	font-size: 11px;
}

.spinner {
	display: inline-block;
	width: 14px;
	height: 14px;
	border: 2px solid rgba(255, 255, 255, 0.12);
	border-top-color: var(--pl-accent);
	border-radius: 50%;
	animation: spin 0.8s linear infinite;
	flex-shrink: 0;
}

@keyframes spin {
	to { transform: rotate(360deg); }
}

.mirror-section {
	margin-bottom: 14px;
}

.mirror-section:last-of-type {
	margin-bottom: 0;
}

.mirror-section-title {
	font-size: 12px;
	font-weight: 600;
	color: var(--pl-fg);
	margin-bottom: 8px;
}

.mirror-options {
	display: flex;
	flex-wrap: wrap;
	gap: 6px 14px;
}

.mirror-option {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	font-size: 12px;
	color: var(--pl-fg);
	cursor: pointer;
}

.mirror-option input[type="radio"] {
	accent-color: var(--pl-accent);
	margin: 0;
	cursor: pointer;
}

.mirror-option-label {
	user-select: none;
}

.mirror-latency {
	font-size: 10px;
	font-family: 'JetBrains Mono', 'Consolas', monospace;
	padding: 2px 6px;
	border-radius: 2px;
	background: color-mix(in srgb, var(--pl-fg) 4%, transparent);
	color: var(--pl-fg-soft);
	border: 1px solid color-mix(in srgb, var(--pl-fg) 6%, transparent);
}

.mirror-latency.latency-good { background: color-mix(in srgb, #4ade80 10%, transparent); color: #4ade80; border-color: color-mix(in srgb, #4ade80 25%, transparent); }
.mirror-latency.latency-ok { background: color-mix(in srgb, #4ade80 8%, transparent); color: #86efac; border-color: color-mix(in srgb, #4ade80 20%, transparent); }
.mirror-latency.latency-slow { background: color-mix(in srgb, #facc15 10%, transparent); color: #fde047; border-color: color-mix(in srgb, #facc15 25%, transparent); }
.mirror-latency.latency-fail { background: color-mix(in srgb, #f87171 10%, transparent); color: #fca5a5; border-color: color-mix(in srgb, #f87171 25%, transparent); }
.mirror-latency.latency-unknown { background: color-mix(in srgb, var(--pl-fg) 3%, transparent); color: var(--pl-fg-soft); border-color: color-mix(in srgb, var(--pl-fg) 6%, transparent); }

.mirror-custom-input {
	display: block;
	width: 100%;
	margin-top: 8px;
	padding: 8px 12px;
	background: color-mix(in srgb, var(--pl-fg) 4%, transparent);
	border: 1px solid color-mix(in srgb, var(--pl-accent) 30%, transparent);
	color: var(--pl-fg);
	border-radius: 2px;
	font-size: 11px;
	font-family: 'JetBrains Mono', 'Consolas', monospace;
	outline: none;
	transition: border-color 200ms ease, background 200ms ease, box-shadow 200ms ease;
	box-sizing: border-box;
}

.mirror-custom-input:focus {
	border-color: color-mix(in srgb, var(--pl-accent) 70%, transparent);
	background: color-mix(in srgb, var(--pl-fg) 6%, transparent);
	box-shadow: 0 0 0 1px color-mix(in srgb, var(--pl-accent) 25%, transparent),
		0 0 14px color-mix(in srgb, var(--pl-accent) 15%, transparent);
}

.mirror-actions {
	display: flex;
	align-items: center;
	gap: 10px;
	margin-top: 4px;
	flex-wrap: wrap;
}

.mirror-tip {
	font-size: 11px;
	color: var(--pl-fg-soft);
}

.mirror-tip.mirror-ok {
	color: var(--pl-glow-1);
}

.mirror-tip.mirror-error {
	color: #f87171;
}

.python-fix-prompt {
	display: flex;
	flex-direction: column;
	gap: 14px;
	align-items: flex-start;
}

.venv-path-section {
	width: 100%;
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.venv-path-label {
	font-size: 12px;
	font-weight: 500;
	color: var(--pl-fg);
}

.venv-path-row {
	display: flex;
	gap: 8px;
	align-items: center;
}

.venv-size-hint {
	display: flex;
	align-items: center;
	gap: 6px;
	padding: 8px 10px;
	background: color-mix(in srgb, #facc15 6%, transparent);
	border: 1px solid color-mix(in srgb, #facc15 18%, transparent);
	border-radius: 2px;
	font-size: 11px;
	color: #fcd34d;
}

.size-hint-icon {
	font-size: 13px;
}

.size-hint-text {
	line-height: 1.4;
}

.python-fix-panel {
	display: flex;
	flex-direction: column;
	gap: 10px;
}

.python-fix-step {
	display: flex;
	align-items: center;
	gap: 10px;
	font-size: 13px;
	font-weight: 500;
	color: var(--pl-fg);
}

.python-fix-icon {
	width: 20px;
	height: 20px;
	border-radius: 50%;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	font-size: 12px;
	flex-shrink: 0;
}

.python-fix-icon.ok {
	background: color-mix(in srgb, #4ade80 15%, transparent);
	color: #4ade80;
}

.python-fix-icon.error {
	background: color-mix(in srgb, #f87171 15%, transparent);
	color: #f87171;
}

.python-fix-logs {
	max-height: 280px;
	overflow-y: auto;
	background: color-mix(in srgb, #000 40%, transparent);
	border: 1px solid color-mix(in srgb, var(--pl-fg) 6%, transparent);
	border-radius: 2px;
	padding: 10px 12px;
	font-family: 'JetBrains Mono', 'Consolas', 'Microsoft YaHei', monospace;
	font-size: 11px;
	line-height: 1.5;
	display: flex;
	flex-direction: column;
	gap: 1px;
}

.python-log-line {
	color: #b0bec5;
	white-space: pre-wrap;
	word-break: break-all;
}

.python-log-line.log-stderr {
	color: #ef9a9a;
}

.python-fix-error {
	padding: 14px 16px;
	background: color-mix(in srgb, #f87171 8%, transparent);
	border: 1px solid color-mix(in srgb, #f87171 25%, transparent);
	border-radius: 2px;
	color: #fca5a5;
	font-size: 12px;
	display: flex;
	flex-direction: column;
	gap: 10px;
}

.python-error-header {
	display: flex;
	align-items: center;
	gap: 8px;
}

.python-error-icon {
	font-size: 16px;
}

.python-error-title {
	font-size: 13px;
	font-weight: 600;
	color: #f87171;
}

.python-error-text {
	color: #fca5a5;
	line-height: 1.6;
	white-space: pre-wrap;
	word-break: break-all;
}

.python-error-solution {
	padding: 10px 12px;
	background: color-mix(in srgb, #facc15 6%, transparent);
	border: 1px solid color-mix(in srgb, #facc15 18%, transparent);
	border-radius: 2px;
}

.solution-tip {
	display: flex;
	align-items: center;
	gap: 6px;
	margin-bottom: 6px;
	color: #fcd34d;
	font-size: 12px;
}

.solution-icon {
	font-size: 13px;
}

.solution-text {
	font-weight: 500;
}

.solution-list {
	margin: 0;
	padding-left: 20px;
	color: #fde68a;
	font-size: 11px;
	line-height: 1.7;
}

.solution-list.ordered {
	padding-left: 22px;
	list-style-type: decimal;
}

.solution-list li {
	margin: 4px 0;
}

.solution-sublist {
	margin: 4px 0;
	padding-left: 18px;
	color: #fef08a;
	font-size: 10px;
	list-style-type: disc;
}

.solution-sublist li {
	margin: 2px 0;
}

.solution-sublist code {
	background: rgba(0, 0, 0, 0.3);
	padding: 1px 5px;
	border-radius: 2px;
	font-family: 'Consolas', 'Monaco', monospace;
	font-size: 10px;
}

.code-block {
	margin: 6px 0;
	padding: 8px 10px;
	background: rgba(0, 0, 0, 0.4);
	border: 1px solid rgba(74, 222, 128, 0.2);
	border-radius: 2px;
	font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
	font-size: 10px;
	color: #86efac;
	word-break: break-all;
	user-select: all;
	cursor: pointer;
	transition: border-color 0.2s;
	position: relative;
}

.code-block:hover {
	border-color: rgba(74, 222, 128, 0.5);
}

.code-block.with-copy {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	padding-right: 8px;
}

.code-block.with-copy code {
	flex: 1;
	word-break: break-all;
}

.copy-hint {
	font-size: 9px;
	color: rgba(134, 239, 172, 0.5);
	white-space: nowrap;
	opacity: 0;
	transition: opacity 0.2s;
}

.code-block.with-copy:hover .copy-hint {
	opacity: 1;
}

.solution-env-info {
	display: flex;
	gap: 6px;
	flex-wrap: wrap;
	margin-bottom: 10px;
}

.env-badge {
	display: inline-block;
	padding: 2px 8px;
	background: rgba(96, 165, 250, 0.15);
	border: 1px solid rgba(96, 165, 250, 0.3);
	border-radius: 2px;
	font-size: 10px;
	color: #93c5fd;
	font-family: 'Consolas', 'Monaco', monospace;
}

.wheel-download-list {
	margin: 8px 0;
	display: flex;
	flex-direction: column;
	gap: 6px;
}

.wheel-item {
	display: flex;
	align-items: center;
	gap: 8px;
	flex-wrap: wrap;
	padding: 6px 8px;
	background: rgba(0, 0, 0, 0.25);
	border: 1px solid rgba(255, 255, 255, 0.06);
	border-radius: 2px;
}

.wheel-name {
	font-weight: 600;
	font-size: 11px;
	color: #fcd34d;
	min-width: 70px;
}

.wheel-file {
	flex: 1;
	font-family: 'Consolas', 'Monaco', monospace;
	font-size: 9px;
	color: #d1d5db;
	word-break: break-all;
	min-width: 200px;
}

.wheel-links {
	display: flex;
	gap: 4px;
	flex-shrink: 0;
}

.wheel-link {
	display: inline-flex;
	align-items: center;
	padding: 4px 10px;
	border-radius: 2px;
	font-size: 10px;
	text-decoration: none;
	cursor: pointer;
	transition: all 0.15s;
	border: 1px solid transparent;
	font-family: inherit;
	line-height: 1.4;
}

.wheel-link.primary {
	background: rgba(74, 222, 128, 0.15);
	border-color: rgba(74, 222, 128, 0.3);
	color: #86efac;
}

.wheel-link.primary:hover {
	background: rgba(74, 222, 128, 0.25);
	border-color: rgba(74, 222, 128, 0.5);
	box-shadow: 0 0 8px rgba(74, 222, 128, 0.2);
}

.wheel-link:not(.primary) {
	background: rgba(255, 255, 255, 0.05);
	border-color: rgba(255, 255, 255, 0.1);
	color: #9ca3af;
}

.wheel-link:not(.primary):hover {
	background: rgba(255, 255, 255, 0.1);
	color: #d1d5db;
	border-color: rgba(255, 255, 255, 0.2);
}

.solution-section {
	margin: 8px 0;
	padding: 10px 12px;
	border-radius: 2px;
}

.solution-section.recommended {
	background: rgba(74, 222, 128, 0.08);
	border: 1px solid rgba(74, 222, 128, 0.25);
}

.solution-section.recommended .solution-tip {
	color: #86efac;
}

.solution-section.recommended .solution-text strong {
	color: #4ade80;
}

.solution-section.fallback {
	background: rgba(255, 255, 255, 0.03);
	border: 1px solid rgba(255, 255, 255, 0.08);
	margin-top: 10px;
}

.fallback-summary {
	display: flex;
	align-items: center;
	gap: 6px;
	cursor: pointer;
	font-size: 11px;
	color: #93c5fd;
	user-select: none;
	padding: 2px 0;
	list-style: none;
}

.fallback-summary::-webkit-details-marker {
	display: none;
}

.fallback-summary:hover {
	color: #bfdbfe;
}

.solution-desc {
	margin: 6px 0 8px;
	font-size: 11px;
	color: #bfdbfe;
	line-height: 1.6;
}

.solution-section.recommended .solution-desc {
	color: #bbf7d0;
}

.code-block.one-click-cmd {
	border-color: rgba(74, 222, 128, 0.4);
	background: rgba(0, 0, 0, 0.55);
}

.code-block.one-click-cmd code {
	color: #4ade80;
	font-weight: 500;
}

.cmd-tip.success {
	color: #86efac;
	margin-top: 6px;
	font-style: normal;
}

.cmd-tip {
	margin-top: 4px;
	font-size: 10px;
	color: #9ca3af;
	font-style: italic;
}

.python-error-actions {
	display: flex;
	gap: 8px;
	flex-wrap: wrap;
	justify-content: flex-end;
}

.python-fix-done {
	display: flex;
	justify-content: flex-end;
}

.probe-version-check-btn {
	margin-left: 8px;
	font-size: 10px;
	padding: 2px 8px;
	height: auto;
}

.probe-version-checking {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	margin-left: 8px;
	font-size: 10px;
	color: var(--pl-glow-2);
}

.probe-version-update {
	margin-top: 10px;
}

.probe-msg-ok {
	background: color-mix(in srgb, #4ade80 8%, transparent);
	color: #86efac;
	border-color: color-mix(in srgb, #4ade80 22%, transparent);
	display: flex;
	align-items: center;
	gap: 8px;
	flex-wrap: wrap;
}

.probe-msg-update {
	background: color-mix(in srgb, #34d399 10%, transparent);
	color: #6ee7b7;
	border-color: color-mix(in srgb, #34d399 30%, transparent);
	display: flex;
	align-items: center;
	gap: 10px;
	flex-wrap: wrap;
	font-weight: 500;
}

.probe-update-link {
	color: #60a5fa;
	text-decoration: underline;
	cursor: pointer;
	margin-left: auto;
	font-size: 11px;
	transition: color 150ms ease;
}

.probe-update-link:hover {
	color: #93c5fd;
}

.setup-card-fresh {
	border-color: color-mix(in srgb, var(--pl-accent) 40%, transparent);
	background: linear-gradient(
		135deg,
		color-mix(in srgb, var(--pl-accent) 8%, color-mix(in srgb, var(--pl-bg-1) 70%, transparent)),
		color-mix(in srgb, var(--pl-accent) 4%, color-mix(in srgb, var(--pl-bg-0) 85%, transparent))
	);
	box-shadow: 0 0 0 1px color-mix(in srgb, var(--pl-accent) 20%, transparent),
		0 4px 20px color-mix(in srgb, var(--pl-accent) 12%, transparent);
}

.fresh-install-form {
	display: flex;
	flex-direction: column;
	gap: 16px;
}

.fresh-form-hint {
	font-size: 12px;
	color: var(--pl-fg-soft);
	line-height: 1.6;
	padding: 10px 14px;
	background: color-mix(in srgb, var(--pl-cold) 6%, transparent);
	border: 1px solid color-mix(in srgb, var(--pl-cold) 20%, transparent);
	border-radius: 2px;
	border-left: 3px solid var(--pl-accent);
}

.fresh-form-row {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.fresh-form-label {
	font-size: 12px;
	font-weight: 500;
	color: var(--pl-fg);
	display: flex;
	align-items: center;
	gap: 4px;
}

.fresh-form-label.required::after {
	content: "*";
	color: #f87171;
	font-weight: 700;
	margin-left: 2px;
}

.fresh-form-actions {
	display: flex;
	gap: 8px;
	justify-content: flex-end;
	margin-top: 4px;
}

.required-mark {
	color: #f87171;
	font-weight: 700;
	margin-right: 2px;
}

.fresh-form-warn {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 12px 14px;
	background: color-mix(in srgb, #facc15 6%, transparent);
	border: 1px solid color-mix(in srgb, #facc15 25%, transparent);
	border-radius: 2px;
	font-size: 12px;
	color: #fde047;
	line-height: 1.5;
}

.warn-icon {
	font-size: 16px;
	flex-shrink: 0;
}

.field-hint {
	font-size: 11px;
	color: var(--pl-fg-soft);
	line-height: 1.5;
	padding: 6px 0 0;
}

.fresh-probe-result {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 12px 14px;
	background: color-mix(in srgb, var(--pl-accent) 5%, color-mix(in srgb, var(--pl-bg-1) 60%, transparent));
	border: 1px solid color-mix(in srgb, var(--pl-accent) 20%, var(--pl-card-border));
	border-radius: 2px;
}

.fresh-probe-item {
	display: flex;
	align-items: center;
	gap: 10px;
	font-size: 12px;
	flex-wrap: wrap;
}

.fresh-probe-item .probe-item-label {
	font-size: 11px;
	min-width: 70px;
}

.fresh-probe-item .probe-item-value {
	font-size: 12px;
	display: inline-flex;
	align-items: center;
	gap: 6px;
	flex-wrap: wrap;
}

.fresh-probe-item .probe-version-checking {
	margin-left: 4px;
}

@media (max-width: 768px) {
	.setup-shell {
		max-width: 100%;
	}

	.setup-header {
		padding: 20px 16px 16px;
		margin-bottom: 16px;
	}

	.setup-scroll {
		padding: 0 16px;
	}

	.setup-card {
		padding: 16px;
	}

	.setup-footer {
		padding: 16px 0 4px;
	}

	.path-input-group,
	.venv-path-row {
		flex-wrap: wrap;
	}

	.probe-grid {
		grid-template-columns: 1fr;
	}

	.probe-item-wide {
		grid-column: span 1;
	}
}

@media (prefers-reduced-motion: reduce) {
	.setup-card,
	.card-glow,
	.card-frame .corner,
	.card-action,
	.path-input,
	.spinner,
	.spinner-sm {
		transition: none !important;
		animation: none !important;
	}

	.setup-card:hover,
	.setup-card:focus-within {
		transform: none;
		filter: none;
	}
}
</style>
