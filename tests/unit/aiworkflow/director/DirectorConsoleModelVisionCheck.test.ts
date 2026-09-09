/**
 * 导演控制台 模型多模态检查 IPC 逻辑测试
 *
 * 验证 settings.yaml 中模型 input/inputModalities 字段的解析逻辑：
 * 1. 识别所有 llm-* 适配器下的所有模型
 * 2. 同时检测 input 和 inputModalities 两种字段名
 * 3. 正确识别已声明 image 支持的模型
 * 4. 正确识别缺少 image 支持的模型
 * 5. 覆盖多个 provider 的场景
 */

import { describe, it, expect } from 'vitest'

// ===== 提取自 electron/main.mjs 的检查逻辑（纯函数化，不依赖 fs） =====

interface ModelCheckResult {
	id: string
	hasImageInput: boolean
	adapter: string | null
}

function parseModelsFromYaml(raw: string): ModelCheckResult[] {
	const lines = raw.split(/\r?\n/)
	const models: ModelCheckResult[] = []
	let currentAdapter: string | null = null
	let inProviders = false
	let inModels = false
	let currentModelId: string | null = null
	let currentModelHasImage = false

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]
		const adapterMatch = line.match(/^(llm-[a-z\-]+):\s*$/)
		if (adapterMatch) {
			if (currentModelId) {
				models.push({
					id: currentModelId,
					hasImageInput: currentModelHasImage,
					adapter: currentAdapter
				})
			}
			currentAdapter = adapterMatch[1]
			inProviders = false
			inModels = false
			currentModelId = null
			currentModelHasImage = false
			continue
		}
		if (currentAdapter && /^[a-z]/.test(line) && !/^\s/.test(line) && !line.startsWith('llm-')) {
			if (currentModelId) {
				models.push({
					id: currentModelId,
					hasImageInput: currentModelHasImage,
					adapter: currentAdapter
				})
			}
			currentAdapter = null
			inProviders = false
			inModels = false
			currentModelId = null
			currentModelHasImage = false
			continue
		}
		if (currentAdapter && /^(\s+)providers:\s*$/.test(line)) {
			inProviders = true
			continue
		}
		if (inProviders && /^(\s+)models:\s*$/.test(line)) {
			inModels = true
			continue
		}
		if (inProviders && inModels && /^(\s*)[a-z]/.test(line)) {
			const indent = line.match(/^(\s*)/)?.[1].length ?? 0
			if (!line.trim().startsWith('-') && indent <= 4) {
				if (currentModelId) {
					models.push({
						id: currentModelId,
						hasImageInput: currentModelHasImage,
						adapter: currentAdapter
					})
				}
				inModels = false
				currentModelId = null
				currentModelHasImage = false
				if (indent <= 2) {
					inProviders = false
				}
				continue
			}
		}
		if (inModels && /^(\s*)-\s+id:\s*(.+)$/.test(line)) {
			if (currentModelId) {
				models.push({
					id: currentModelId,
					hasImageInput: currentModelHasImage,
					adapter: currentAdapter
				})
			}
			const m = line.match(/^(\s*)-\s+id:\s*(.+)$/)
			currentModelId = m![2].trim()
			currentModelHasImage = false
			continue
		}
		if (inModels && currentModelId) {
			const inputMatch = line.match(/(?:input|inputModalities):\s*\[([^\]]*)\]/)
			if (inputMatch && inputMatch[1].includes('image')) {
				currentModelHasImage = true
			}
		}
	}
	if (currentModelId) {
		models.push({
			id: currentModelId,
			hasImageInput: currentModelHasImage,
			adapter: currentAdapter
		})
	}
	return models
}

// ===== 测试 =====

describe('导演控制台 模型多模态检查', () => {
	describe('parseModelsFromYaml', () => {
		it('应识别 llm-pi-ai 适配器下带 input: [text, image] 的模型', () => {
			const yaml = `llm-pi-ai:
  providers:
    volcengine-ark:
      displayName: 火山引擎
      models:
        - id: doubao-seed-2-1-turbo-260628
          name: Seed-2.1-Turbo
          input: [text, image]
`
			const models = parseModelsFromYaml(yaml)
			expect(models.length).toBe(1)
			expect(models[0].id).toBe('doubao-seed-2-1-turbo-260628')
			expect(models[0].hasImageInput).toBe(true)
			expect(models[0].adapter).toBe('llm-pi-ai')
		})

		it('应识别缺少 input 声明的模型', () => {
			const yaml = `llm-pi-ai:
  providers:
    volcengine-ark:
      displayName: 火山引擎
      models:
        - id: doubao-seed-2-1-turbo-260628
          name: Seed-2.1-Turbo
`
			const models = parseModelsFromYaml(yaml)
			expect(models.length).toBe(1)
			expect(models[0].hasImageInput).toBe(false)
		})

		it('应同时识别 input 和 inputModalities 两种字段', () => {
			const yaml = `llm-pi-ai:
  providers:
    volcengine-ark:
      models:
        - id: model-a
          input: [text, image]
llm-deepseek:
  providers:
    deepseek:
      models:
        - id: model-b
          inputModalities: [text, image]
        - id: model-c
`
			const models = parseModelsFromYaml(yaml)
			expect(models.length).toBe(3)
			expect(models[0].id).toBe('model-a')
			expect(models[0].hasImageInput).toBe(true)
			expect(models[0].adapter).toBe('llm-pi-ai')
			expect(models[1].id).toBe('model-b')
			expect(models[1].hasImageInput).toBe(true)
			expect(models[1].adapter).toBe('llm-deepseek')
			expect(models[2].id).toBe('model-c')
			expect(models[2].hasImageInput).toBe(false)
			expect(models[2].adapter).toBe('llm-deepseek')
		})

		it('应识别多个 provider 下的多个模型', () => {
			const yaml = `llm-pi-ai:
  providers:
    volcengine-ark:
      models:
        - id: model-a
          input: [text, image]
        - id: model-b
    bigmodel:
      models:
        - id: model-c
          input: [text]
`
			const models = parseModelsFromYaml(yaml)
			expect(models.length).toBe(3)
			expect(models[0].id).toBe('model-a')
			expect(models[0].hasImageInput).toBe(true)
			expect(models[1].id).toBe('model-b')
			expect(models[1].hasImageInput).toBe(false)
			expect(models[2].id).toBe('model-c')
			expect(models[2].hasImageInput).toBe(false)
		})

		it('空 YAML 应返回空数组', () => {
			expect(parseModelsFromYaml('')).toEqual([])
		})

		it('无 llm-* 适配器的 YAML 应返回空数组', () => {
			const yaml = `someOtherConfig:
  key: value
`
			expect(parseModelsFromYaml(yaml)).toEqual([])
		})

		it('应识别只有 text 的 input 声明（不含 image）', () => {
			const yaml = `llm-pi-ai:
  providers:
    volcengine-ark:
      models:
        - id: model-a
          input: [text]
`
			const models = parseModelsFromYaml(yaml)
			expect(models[0].hasImageInput).toBe(false)
		})
	})
})
