import MarkdownIt from 'markdown-it'
import { load as loadYaml } from 'js-yaml'

export type DvsStyleSpec = {
	id: string
	name?: string
	palette?: Record<string, string>
	[key: string]: unknown
}

export type DvsTemplateSpec = {
	id: string
	name?: string
	priority?: number
	category?: string
	styleRef?: string
	styleDescription?: string
	previewable?: boolean
	[key: string]: unknown
}

export type DvsPlanSuggestion = {
	id: string
	title?: string
	layerName?: string
	kind?: string
	templateRef?: string
	start?: { cueIndex?: number }
	end?: { cueIndex?: number }
	confirmRequired?: boolean
	previewable?: boolean
	styleHint?: Record<string, unknown>
	bindings?: Record<string, string>
	notes?: string
	[key: string]: unknown
}

export type ParsedMarkdownDoc = {
	raw: string
	outlineMd: string
	styleSectionMd: string
	templateSectionMd: string
	planSectionMd: string
	style: { spec: DvsStyleSpec; rawYaml: string } | null
	templates: Array<{ spec: DvsTemplateSpec; rawYaml: string }>
	plans: Array<{ spec: DvsPlanSuggestion; rawYaml: string }>
}

const md = new MarkdownIt({
	html: false,
	linkify: true,
	breaks: true
})

// Avoid XSS via crafted links like javascript:...
md.validateLink = (url: string) => {
	const u = String(url || '')
		.trim()
		.toLowerCase()
	if (!u) return false
	if (u.startsWith('http://') || u.startsWith('https://')) return true
	if (u.startsWith('mailto:')) return true
	if (u.startsWith('/') || u.startsWith('#')) return true
	return false
}

const normalize = (s: unknown) => (typeof s === 'string' ? s : '')

const extractSectionByH2 = (src: string, title: string) => {
	const lines = normalize(src).split(/\r?\n/)
	const head = `## ${title}`
	let start = -1
	for (let i = 0; i < lines.length; i++) {
		if (lines[i].trim() === head) {
			start = i
			break
		}
	}
	if (start < 0) return ''
	let end = lines.length
	for (let i = start + 1; i < lines.length; i++) {
		if (lines[i].startsWith('## ')) {
			end = i
			break
		}
	}
	return lines
		.slice(start + 1, end)
		.join('\n')
		.trim()
}

const fencedBlockRe = /```([\w-]+)\n([\s\S]*?)\n```/g

export const extractFencedBlocks = (src: string, lang: string) => {
	const out: Array<{ raw: string; content: string; start: number; end: number }> = []
	const s = normalize(src)
	for (const m of s.matchAll(fencedBlockRe)) {
		const l = String(m[1] ?? '').trim()
		if (l !== lang) continue
		const raw = String(m[0] ?? '')
		const content = String(m[2] ?? '')
		const start = m.index ?? -1
		out.push({ raw, content, start, end: start + raw.length })
	}
	return out
}

const stripFencedBlocks = (src: string, langs: string[]) => {
	let s = normalize(src)
	for (const lang of langs) {
		const blocks = extractFencedBlocks(s, lang)
		// remove from back to front to keep indices stable
		for (let i = blocks.length - 1; i >= 0; i--) {
			const b = blocks[i]
			if (b.start >= 0) s = s.slice(0, b.start) + s.slice(b.end)
		}
	}
	return s.trim()
}

const safeYaml = (rawYaml: string): any | null => {
	try {
		const obj = loadYaml(rawYaml)
		if (obj === null || obj === undefined) return null
		return obj
	} catch {
		return null
	}
}

export const parseMarkdownDoc = (raw: string): ParsedMarkdownDoc => {
	const src = normalize(raw)

	const outlineMd = extractSectionByH2(src, '脚本大纲')
	const styleSectionMd = extractSectionByH2(src, '配色与风格建议')
	const templateSectionMd = extractSectionByH2(src, '可复用高级组件描述')
	const planSectionMd = extractSectionByH2(src, '高级组件建议清单')

	const styleBlocks = extractFencedBlocks(src, 'dvs-style')
	let style: ParsedMarkdownDoc['style'] = null
	if (styleBlocks[0]) {
		const obj = safeYaml(styleBlocks[0].content)
		if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
			style = { spec: obj as DvsStyleSpec, rawYaml: styleBlocks[0].content }
		}
	}

	const templates: ParsedMarkdownDoc['templates'] = []
	for (const b of extractFencedBlocks(src, 'dvs-template')) {
		const obj = safeYaml(b.content)
		if (!obj) continue
		if (Array.isArray(obj)) {
			for (const it of obj) {
				if (it && typeof it === 'object')
					templates.push({ spec: it as DvsTemplateSpec, rawYaml: b.content })
			}
			continue
		}
		if (typeof obj === 'object')
			templates.push({ spec: obj as DvsTemplateSpec, rawYaml: b.content })
	}

	const plans: ParsedMarkdownDoc['plans'] = []
	for (const b of extractFencedBlocks(src, 'dvs-plan')) {
		const obj = safeYaml(b.content)
		if (!obj) continue
		if (Array.isArray(obj)) {
			for (const it of obj) {
				if (it && typeof it === 'object')
					plans.push({ spec: it as DvsPlanSuggestion, rawYaml: b.content })
			}
			continue
		}
		if (typeof obj === 'object') plans.push({ spec: obj as DvsPlanSuggestion, rawYaml: b.content })
	}

	return {
		raw: src,
		outlineMd,
		styleSectionMd,
		templateSectionMd,
		planSectionMd,
		style,
		templates,
		plans
	}
}

export const renderMarkdownToHtml = (markdown: string) => {
	return md.render(normalize(markdown))
}

export const renderSectionTextHtml = (sectionMd: string) => {
	// For human-readable parts, strip structured YAML blocks before rendering.
	const stripped = stripFencedBlocks(sectionMd, ['dvs-style', 'dvs-template', 'dvs-plan'])
	return md.render(stripped)
}

export const extractFirstDvsStyleBlock = (text: string): string | null => {
	const b = extractFencedBlocks(normalize(text), 'dvs-style')[0]
	return b ? b.content.trim() : null
}

export const replaceFirstDvsStyleBlock = (markdown: string, newYaml: string) => {
	const src = normalize(markdown)
	const blocks = extractFencedBlocks(src, 'dvs-style')
	const replacement = `\n\n\`\`\`dvs-style\n${newYaml.trim()}\n\`\`\`\n\n`
	if (!blocks.length || blocks[0].start < 0) {
		return (src.trim() + replacement).trim() + '\n'
	}
	const b = blocks[0]
	return (src.slice(0, b.start) + replacement + src.slice(b.end)).trim() + '\n'
}
