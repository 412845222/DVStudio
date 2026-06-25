import { isRecord } from '../../../types/utils'

const trimText = (value: unknown) => String(value ?? '').trim()

const isBlockedScheme = (text: string) => {
  const lower = text.toLowerCase()
  return (
    lower.startsWith('package://') ||
    lower.startsWith('javascript:') ||
    lower.startsWith('vbscript:')
  )
}

export const sanitizeWorkflowMediaUrl = (value: unknown) => {
  const text = trimText(value)
  if (!text) return ''
  if (isBlockedScheme(text)) return ''
  return text
}

export const sanitizeWorkflowUrlFieldsDeep = <T>(value: T): T => {
  if (!value || typeof value !== 'object') return value

  const walk = (cur: unknown) => {
    if (!cur || typeof cur !== 'object') return
    if (Array.isArray(cur)) {
      for (const item of cur) walk(item)
      return
    }
    if (isRecord(cur)) {
      for (const key of Object.keys(cur)) {
        const next = cur[key]
        if (typeof next === 'string') {
          if (/url|poster|thumbnail|preview/i.test(key)) {
            cur[key] = sanitizeWorkflowMediaUrl(next)
          }
          continue
        }
        walk(next)
      }
    }
  }

  walk(value)
  return value
}

/**
 * 检测并清洗资源名称中的非安全字符和中文字符
 * - 去除 Windows 不允许的文件名字符
 * - 清洗中文字符，确保不会出现"AI 生成图片 xxx"等非法名称
 */
export const sanitizeResourceName = (name: unknown, fallback: string): string => {
  const raw = String(name ?? '').trim()
  if (!raw) return String(fallback || 'resource').replace(/[^\x00-\x7F]/g, '_')
  
  // 检查是否包含中文字符
  const hasChinese = /[\u4e00-\u9fff]/.test(raw)
  
  let safe = raw
  
  // 如果包含中文，直接替换为安全的英文名称
  if (hasChinese) {
    const hash = Math.abs(Array.from(raw).reduce((acc, c) => acc + c.charCodeAt(0), 0) % 100000)
    safe = `resource_${hash}`
  }
  
  // 去除 Windows 不允许的文件名字符
  safe = safe.replace(/[\\/:*?"<>|\x00-\x1F]+/g, '_')
  
  // 替换连续的下划线
  safe = safe.replace(/_+/g, '_')
  
  // 去除首尾的下划线和点
  safe = safe.replace(/^[_.]+|[_.]+$/g, '')
  
  if (!safe) {
    const hash = Math.abs(Array.from(raw).reduce((acc, c) => acc + c.charCodeAt(0), 0) % 100000)
    safe = `resource_${hash}`
  }
  
  return safe.slice(0, 80)
}

/**
 * 清洗本地文件路径，去除非法的 file:// 协议
 * - 如果是 file:// 协议，返回空字符串（应该使用 dweb://project-assets）
 * - 去除路径中的非法字符
 */
export const sanitizeLocalFilePath = (path: unknown): string => {
  const raw = String(path ?? '').trim()
  if (!raw) return ''
  
  const lower = raw.toLowerCase()
  if (lower.startsWith('file://')) return ''
  if (lower.startsWith('file:')) return ''
  
  return raw
}

/**
 * 检测资源URL是否使用了被禁止的 file:// 协议
 */
export const isFileProtocolUrl = (url: unknown): boolean => {
  const raw = String(url ?? '').trim().toLowerCase()
  return raw.startsWith('file://') || raw.startsWith('file:')
}

/**
 * 从本地绝对路径中推断项目相对路径
 * 用于修复旧项目中只有 sourcePath 但没有 projectRelativePath 的情况
 */
export const inferProjectRelativePath = (sourcePath: unknown, projectRootPath: unknown): string => {
  const src = String(sourcePath ?? '').replace(/\\/g, '/').trim()
  const root = String(projectRootPath ?? '').replace(/\\/g, '/').trim()
  
  if (!src || !root) return ''
  
  const normalizedRoot = root.toLowerCase().replace(/\/+$/, '')
  const normalizedSrc = src.toLowerCase()
  
  if (normalizedSrc.startsWith(normalizedRoot + '/')) {
    const rel = src.slice(root.length + 1)
    return rel
  }
  
  return ''
}

/**
 * 构建标准的 dweb://project-assets URL
 */
export const buildProjectAssetRuntimeUrl = (projectId: number, projectRelativePath: string): string => {
  const pid = Number(projectId)
  const rel = String(projectRelativePath || '').trim()
  if (!Number.isFinite(pid) || pid <= 0 || !rel) return ''
  return `dweb://project-assets?projectId=${encodeURIComponent(String(Math.floor(pid)))}&path=${encodeURIComponent(rel)}`
}