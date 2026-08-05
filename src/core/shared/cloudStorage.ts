export function maskAccessKey(ak: string): string {
	if (!ak || typeof ak !== 'string') return ''
	if (ak.length <= 10) return ak
	return `${ak.slice(0, 6)}...${ak.slice(-4)}`
}

export function resolveTosEndpoint(region?: string): string {
	const regionId = region || 'cn-beijing'
	return `tos-${regionId}.volces.com`
}

export function buildPublicUrlBase(bucketName: string, endpoint: string): string {
	return `https://${bucketName}.${endpoint}`
}

export function buildPublicObjectUrl(bucketName: string, endpoint: string, key: string): string {
	const base = buildPublicUrlBase(bucketName, endpoint)
	const safeKey = String(key || '').replace(/^\/+/, '')
	const encodedKey = safeKey.split('/').map(encodeURIComponent).join('/')
	return `${base}/${encodedKey}`
}

export function formatFileSize(bytes: number): string {
	if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return '0 B'
	if (bytes === 0) return '0 B'
	const units = ['B', 'KB', 'MB', 'GB', 'TB']
	const k = 1024
	const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), units.length - 1)
	const value = bytes / Math.pow(k, i)
	return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

export function getFileExtension(filename: string): string {
	if (!filename || typeof filename !== 'string') return ''
	const idx = filename.lastIndexOf('.')
	if (idx === -1 || idx === filename.length - 1) return ''
	return filename.slice(idx + 1).toLowerCase()
}

export function isImageFile(filename: string): boolean {
	const ext = getFileExtension(filename)
	return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'ico'].includes(ext)
}

export function isVideoFile(filename: string): boolean {
	const ext = getFileExtension(filename)
	return ['mp4', 'webm', 'mov', 'avi', 'mkv', 'flv', 'wmv'].includes(ext)
}
