/**
 * 图片截图处理增强
 * 解决截图时图片跨域、加载不完整、本地URL处理等问题
 */

const IMAGE_LOAD_TIMEOUT = 3000
const REMOTE_URL_PATTERN = /^https?:\/\//i
const LOCAL_URL_PATTERNS = [
	/^dweb:\/\//i,
	/^file:\/\//i,
	/^blob:/i,
	/^data:/i,
	/^\/\//i,
	/^\//i,
	/project-assets/i,
	/^https?:\/\/localhost/i,
	/^https?:\/\/127\.0\.0\.1/i
]

const isLocalUrl = (src: string): boolean => {
	if (!src) return true
	return LOCAL_URL_PATTERNS.some((pattern) => pattern.test(src))
}

const isRemoteUrl = (src: string): boolean => {
	return REMOTE_URL_PATTERN.test(src) && !isLocalUrl(src)
}

const waitForImageReady = (img: HTMLImageElement, timeoutMs: number = IMAGE_LOAD_TIMEOUT): Promise<boolean> => {
	return new Promise((resolve) => {
		if (img.complete && img.naturalWidth > 0) {
			resolve(true)
			return
		}

		let done = false
		const timer = setTimeout(() => {
			if (!done) {
				done = true
				resolve(img.complete && img.naturalWidth > 0)
			}
		}, timeoutMs)

		const onLoad = () => {
			if (!done) {
				done = true
				clearTimeout(timer)
				resolve(true)
			}
		}

		const onError = () => {
			if (!done) {
				done = true
				clearTimeout(timer)
				resolve(false)
			}
		}

		img.addEventListener('load', onLoad, { once: true })
		img.addEventListener('error', onError, { once: true })
	})
}

const tryConvertImageToDataUrl = (img: HTMLImageElement, useCors: boolean = true): Promise<boolean> => {
	return new Promise((resolve) => {
		try {
			const src = img.src
			if (!src || src.startsWith('data:')) {
				resolve(true)
				return
			}

			const tmpImg = new Image()
			if (useCors) {
				tmpImg.crossOrigin = 'anonymous'
			}

			let done = false
			const timer = setTimeout(() => {
				if (!done) {
					done = true
					resolve(false)
				}
			}, IMAGE_LOAD_TIMEOUT)

			tmpImg.onload = () => {
				if (done) return
				done = true
				clearTimeout(timer)
				try {
					const canvas = document.createElement('canvas')
					const w = tmpImg.naturalWidth || img.naturalWidth || img.width || 1
					const h = tmpImg.naturalHeight || img.naturalHeight || img.height || 1
					canvas.width = w
					canvas.height = h
					const ctx = canvas.getContext('2d')
					if (ctx) {
						ctx.drawImage(tmpImg, 0, 0, w, h)
						img.src = canvas.toDataURL('image/png')
						resolve(true)
						return
					}
				} catch {}
				resolve(false)
			}

			tmpImg.onerror = () => {
				if (done) return
				if (useCors) {
					tryConvertImageToDataUrl(img, false).then((result) => {
						if (!done) {
							done = true
							clearTimeout(timer)
							resolve(result)
						}
					})
				} else {
					done = true
					clearTimeout(timer)
					resolve(false)
				}
			}

			tmpImg.src = src
		} catch {
			resolve(false)
		}
	})
}

export const enhancedWaitForAllImages = async (root: HTMLElement): Promise<void> => {
	const imgs = Array.from(root.querySelectorAll('img'))
	if (imgs.length === 0) return

	await Promise.all(
		imgs.map((img) => {
			return waitForImageReady(img)
		})
	)
}

export const enhancedConvertImagesToDataUrls = async (root: HTMLElement): Promise<void> => {
	const imgs = Array.from(root.querySelectorAll('img'))
	if (imgs.length === 0) return

	await Promise.all(
		imgs.map(async (img) => {
			try {
				const src = img.src || ''
				if (!src) return

				if (src.startsWith('data:') || src.startsWith('blob:')) {
					return
				}

				if (isLocalUrl(src)) {
					await waitForImageReady(img, 1500)
					return
				}

				if (isRemoteUrl(src)) {
					const ready = await waitForImageReady(img, 2000)
					if (ready) {
						await tryConvertImageToDataUrl(img, true)
					}
					return
				}

				await waitForImageReady(img, 1500)
			} catch {}
		})
	)
}

export const prepareClonedImages = (source: HTMLElement, clone: HTMLElement): void => {
	const sourceImgs = Array.from(source.querySelectorAll('img'))
	const cloneImgs = Array.from(clone.querySelectorAll('img'))

	const len = Math.min(sourceImgs.length, cloneImgs.length)
	for (let i = 0; i < len; i++) {
		const srcImg = sourceImgs[i]
		const cloneImg = cloneImgs[i]

		if (srcImg.complete && srcImg.naturalWidth > 0) {
			try {
				const canvas = document.createElement('canvas')
				canvas.width = srcImg.naturalWidth
				canvas.height = srcImg.naturalHeight
				const ctx = canvas.getContext('2d')
				if (ctx) {
					ctx.drawImage(srcImg, 0, 0)
					cloneImg.src = canvas.toDataURL('image/png')
				}
			} catch {
				cloneImg.src = srcImg.src
			}
		} else {
			cloneImg.src = srcImg.src
		}

		cloneImg.crossOrigin = ''
	}
}

export const getImageLoadState = (img: HTMLImageElement): { loaded: boolean; error: boolean; naturalWidth: number; naturalHeight: number } => {
	return {
		loaded: img.complete && img.naturalWidth > 0,
		error: img.complete && img.naturalWidth === 0,
		naturalWidth: img.naturalWidth || 0,
		naturalHeight: img.naturalHeight || 0
	}
}
