# 3D编辑器渲染优化技术指南

## 目录
1. [渲染管线架构](#渲染管线架构)
2. [后处理Pass详解](#后处理pass详解)
3. [光照预设设计](#光照预设设计)
4. [PBR材质调优](#pbr材质调优)
5. [性能优化建议](#性能优化建议)
6. [常见问题排查](#常见问题排查)

---

## 渲染管线架构

### 整体架构

```
用户打开3D编辑器
  ↓
初始化WebGLRenderer
  ↓
配置渐变背景环境 (SphereGeometry + ShaderMaterial)
  ↓
加载RoomEnvironment环境贴图 (PMREMGenerator)
  ↓
配置三点光照系统 (主光+补光+边缘光)
  ↓
初始化后处理管线 (EffectComposer)
  ↓
渲染循环
  ├─ RenderPass (基础渲染)
  ├─ SSAOPass (环境光遮蔽)
  ├─ ColorCorrectionPass (色彩校正)
  ├─ UnrealBloomPass (辉光效果)
  └─ FXAAPass (抗锯齿)
```

### 核心模块

| 模块 | 文件 | 职责 |
|-----|------|------|
| EditorViewer | `editor/EditorViewer.ts` | 3D编辑器主控制器 |
| EnhancedRenderingPipeline | `editor/EnhancedRenderingPipeline.ts` | 后处理管线封装 |
| EnvironmentPresets | `editor/EnvironmentPresets.ts` | 光照/背景预设配置 |
| useEnhancedModel3DEditor | `composables/useEnhancedModel3DEditor.ts` | Vue Composable封装 |

---

## 后处理Pass详解

### Pass顺序

后处理Pass的顺序对最终效果有重要影响，当前顺序为：

1. **RenderPass** - 基础场景渲染
2. **SSAOPass** - 屏幕空间环境光遮蔽
3. **ColorCorrectionPass** - 色彩校正
4. **UnrealBloomPass** - 辉光效果
5. **FXAAPass** - 快速近似抗锯齿

### SSAOPass (屏幕空间环境光遮蔽)

**作用**: 增强模型细节和真实感，在模型缝隙、角落处添加自然的阴影。

**关键参数**:

| 参数 | 默认值 | 说明 | 调优建议 |
|-----|-------|------|---------|
| kernelRadius | 12 | 采样核半径 | 值越大，AO范围越广 |
| minDistance | 0.01 | 最小距离阈值 | 避免近距离过暗 |
| maxDistance | 0.15 | 最大距离阈值 | 避免远距离伪影 |

**调优指南**:
- 模型细节不足 → 减小 `kernelRadius`，增加 `maxDistance`
- 画面过暗 → 增大 `minDistance`，减小 `kernelRadius`
- 性能优化 → 降低分辨率或禁用SSAO

### UnrealBloomPass (辉光效果)

**作用**: 为高光区域添加柔和的辉光，增强材质的真实感。

**关键参数**:

| 参数 | 默认值 | 说明 | 调优建议 |
|-----|-------|------|---------|
| strength | 0.03 | 辉光强度 | 过高会导致"油腻感" |
| radius | 0.3 | 辉光半径 | 控制辉光扩散范围 |
| threshold | 0.9 | 亮度阈值 | 只有超过阈值的像素才发光 |

**调优指南**:
- 材质"油腻" → 降低 `strength`，提高 `threshold`
- 金属材质不够闪亮 → 适度提高 `strength`
- 性能优化 → 降低 `radius` 或禁用

### ColorCorrectionPass (色彩校正)

**作用**: 调整画面的整体色彩倾向，提供电影级调色效果。

**关键参数**:

| 参数 | 默认值 | 说明 |
|-----|-------|------|
| powRGB | [1.1, 1.1, 1.12] | Gamma校正（幂运算） |
| mulRGB | [1.0, 1.0, 1.02] | 乘法色彩调整 |

**调优指南**:
- 画面偏暗 → 降低 `powRGB` 或提高 `mulRGB`
- 画面偏暖 → 降低红色通道值
- 画面偏冷 → 降低蓝色通道值

### FXAAPass (抗锯齿)

**作用**: 快速近似抗锯齿，减少模型边缘的锯齿。

**注意**: FXAA是性能消耗最低的抗锯齿方案，但效果不如MSAA。当前已配合 `antialias: true` 的WebGL原生MSAA使用。

---

## 光照预设设计

### 三点光照系统

专业3D渲染的标准配置，包含：

1. **主光源 (Key Light)**: 最亮的光源，塑造主要形态和阴影
2. **补光 (Fill Light)**: 减弱主光造成的阴影，照亮暗部
3. **边缘光 (Rim Light)**: 从背后照亮模型边缘，增强轮廓感

### 预设列表

| 预设 | 适用场景 | 特点 |
|-----|---------|------|
| studio | 通用模型预览 | 均衡的三点光照，适中的环境反射 |
| soft-studio | 细腻材质展示 | 柔和光照，低对比度，突出材质细节 |
| outdoor | 户外风格模型 | 暖色调主光，高曝光，模拟阳光 |
| dark | 暗调氛围展示 | 低环境光，强边缘光，神秘感 |
| no-light | 纯材质查看 | 仅环境光，无方向光阴影 |

### 预设参数对比

| 参数 | studio | soft-studio | outdoor | dark |
|-----|--------|-------------|---------|------|
| 环境光强度 | 0.6 | 0.3 | 0.4 | 0.15 |
| 主光强度 | 1.8 | 1.2 | 2.0 | 0.8 |
| 补光强度 | 0.5 | 0.35 | 0.3 | 0.1 |
| 边缘光强度 | 0.7 | 0.4 | 0.25 | 1.5 |
| 环境强度 | 0.5 | 0.45 | 0.6 | 0.3 |
| 曝光度 | 0.85 | 0.8 | 1.0 | 0.8 |

---

## PBR材质调优

### "油腻感"问题分析

PBR材质"油腻"通常由以下原因造成：

1. **曝光度过高** → 降低 `toneMappingExposure`
2. **环境反射过强** → 降低 `environmentIntensity`
3. **Bloom强度过高** → 降低 `bloomStrength`，提高 `threshold`
4. **金属度过高** → 调整材质 `metalness` 参数
5. **粗糙度过低** → 调整材质 `roughness` 参数

### 推荐参数范围

| 参数 | 推荐范围 | 说明 |
|-----|---------|------|
| toneMappingExposure | 0.7 - 1.0 | 全局曝光度 |
| environmentIntensity | 0.4 - 0.8 | 环境反射强度 |
| bloomStrength | 0.02 - 0.08 | 辉光强度 |
| bloomThreshold | 0.85 - 0.95 | 辉光阈值 |

### 色调映射

当前使用 `ACESFilmicToneMapping`，这是电影工业标准的色调映射算法：
- 高光过渡更自然
- 暗部细节保留更好
- 色彩更具电影感

---

## 性能优化建议

### 性能等级

| 等级 | SSAO | Bloom | ColorCorrection | 像素比 | 适用场景 |
|-----|------|-------|-----------------|-------|---------|
| 高质量 | ✅ | ✅ | ✅ | 2.0 | 高端设备 |
| 平衡 | ✅ | ✅ | ❌ | 1.5 | 中端设备 |
| 性能 | ❌ | ❌ | ❌ | 1.0 | 低端设备 |

### 优化技巧

1. **降低SSAO分辨率**: 显著提升性能，视觉损失较小
2. **减少Bloom半径**: 小半径Bloom性能更好
3. **控制模型面数**: 使用LOD（细节层次）技术
4. **限制后处理Pass数量**: 只启用必要的效果
5. **使用requestAnimationFrame**: 确保与浏览器同步

### 性能监控

- 使用 `renderer.info` 监控绘制调用和三角形数量
- 使用 Chrome DevTools Performance 面板分析帧率
- 关注 `render` 方法的执行时间

---

## 常见问题排查

### 问题1: 背景是纯黑色

**可能原因**:
- 渐变背景Shader未正确渲染
- `bgMesh.renderOrder` 设置不正确
- 背景色覆盖了渐变

**排查步骤**:
1. 检查 `bgMesh` 是否已添加到场景
2. 确认 `renderOrder` 设置为 -1
3. 检查 `depthWrite: false` 和 `depthTest: false`
4. 验证 `side: THREE.BackSide`

### 问题2: 模型全黑

**可能原因**:
- 环境贴图未正确生成
- 光照强度为0
- 材质 `metalness` 太高且无环境反射

**排查步骤**:
1. 检查 `RoomEnvironment` 是否正常生成
2. 验证 `environmentIntensity` > 0
3. 确认 `ambientLight.intensity` > 0
4. 切换到 "无光照" 模式测试

### 问题3: 材质"油腻"

**可能原因**:
- 曝光度过高
- 环境反射过强
- Bloom强度过高

**排查步骤**:
1. 降低 `toneMappingExposure` 到 0.7-0.8
2. 降低 `environmentIntensity` 到 0.4-0.5
3. 降低Bloom的 `strength`，提高 `threshold`
4. 检查材质 `metalness` 是否过高

### 问题4: 阴影有锯齿

**可能原因**:
- 阴影贴图分辨率太低
- 未启用软阴影

**排查步骤**:
1. 确认 `shadowMap.type = THREE.PCFSoftShadowMap`
2. 检查 `shadow.mapSize.width/height` >= 2048
3. 调整 `shadow.radius` 增加柔化
4. 调整 `shadow.bias` 消除阴影失真

### 问题5: SSAO效果过强/过弱

**可能原因**:
- `kernelRadius` 不合适
- `minDistance`/`maxDistance` 阈值不对

**排查步骤**:
- 效果过强 → 减小 `kernelRadius`，增大 `minDistance`
- 效果过弱 → 增大 `kernelRadius`，减小 `maxDistance`
- 有伪影 → 增大 `minDistance`

---

## 参考文献

1. Three.js 官方文档: https://threejs.org/docs/
2. Real-Time Rendering 第四版
3. Blender EEVEE 技术文档
4. Google Model Viewer 最佳实践
5. Learn OpenGL: https://learnopengl.com/
