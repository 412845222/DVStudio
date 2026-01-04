export type FlyPoint = { x: number; y: number }

export async function flyThumbnailPng(args: {
	dataUrl: string
	from: FlyPoint
	to: FlyPoint
	initialSize?: { width: number; height: number }
	ms?: number
}) {
	const ms = Math.max(180, Math.floor(Number(args.ms ?? 360) || 360))
	const w0 = Math.max(48, Math.floor(Number(args.initialSize?.width ?? 160) || 160))
	const h0 = Math.max(36, Math.floor(Number(args.initialSize?.height ?? 90) || 90))

	const img = document.createElement('img')
	img.src = args.dataUrl
	img.alt = ''
	img.decoding = 'async'
	img.draggable = false
	img.style.position = 'fixed'
	img.style.left = '0px'
	img.style.top = '0px'
	img.style.width = `${w0}px`
	img.style.height = `${h0}px`
	img.style.transformOrigin = 'center center'
	img.style.transform = `translate(${args.from.x - w0 / 2}px, ${args.from.y - h0 / 2}px) scale(1)`
	img.style.opacity = '1'
	img.style.pointerEvents = 'none'
	img.style.zIndex = '9999'
	img.style.borderRadius = '6px'
	img.style.boxShadow = 'var(--vscode-shadow)'
	img.style.border = '1px solid var(--vscode-border)'

	document.body.appendChild(img)
	// Force layout
	img.getBoundingClientRect()

	img.style.transition = `transform ${ms}ms cubic-bezier(0.2, 0.9, 0.2, 1), opacity ${ms}ms ease`
	img.style.transform = `translate(${args.to.x - w0 / 2}px, ${args.to.y - h0 / 2}px) scale(0.18)`
	img.style.opacity = '0.15'

	await new Promise<void>((resolve) => {
		const cleanup = () => {
			img.removeEventListener('transitionend', onEnd)
			resolve()
		}
		const onEnd = () => cleanup()
		img.addEventListener('transitionend', onEnd, { once: true })
		window.setTimeout(cleanup, ms + 80)
	})

	try {
		img.remove()
	} catch {
		// ignore
	}
}
