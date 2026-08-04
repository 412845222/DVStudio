import { describe, it, expect, beforeEach } from 'vitest'
import { __test__inlineAllStyles } from '@/views/AIWorkflow/node-screenshot/useNodeScreenshotPool'

describe('__test__inlineAllStyles', () => {
	let source: HTMLElement
	let clone: HTMLElement

	beforeEach(() => {
		document.body.innerHTML = ''
		source = document.createElement('div')
		source.style.cssText = 'width: 200px; height: 100px; background: red; color: white;'
		document.body.appendChild(source)
		clone = source.cloneNode(true) as HTMLElement
	})

	it('should inline computed styles from source to clone', async () => {
		await __test__inlineAllStyles(source, clone)
		expect(clone.style.width).toBeTruthy()
	})

	it('should preserve root element positioning styles (position, left, top, transform)', async () => {
		const positionedSource = document.createElement('div')
		positionedSource.style.cssText = 'width:200px;height:100px;'
		document.body.appendChild(positionedSource)
		const posClone = positionedSource.cloneNode(true) as HTMLElement

		posClone.style.position = 'absolute'
		posClone.style.left = '20px'
		posClone.style.top = '10px'
		posClone.style.right = 'auto'
		posClone.style.bottom = 'auto'
		posClone.style.margin = '0'
		posClone.style.transform = 'none'
		posClone.style.transformOrigin = 'top left'

		await __test__inlineAllStyles(positionedSource, posClone)

		expect(posClone.style.position).toBe('absolute')
		expect(posClone.style.left).toBe('20px')
		expect(posClone.style.top).toBe('10px')
		expect(posClone.style.transform).toBe('none')
		expect(posClone.style.transformOrigin).toBe('top left')
	})

	it('should preserve root element margin', async () => {
		const src = document.createElement('div')
		src.style.cssText = 'width:200px;height:100px;'
		document.body.appendChild(src)
		const cl = src.cloneNode(true) as HTMLElement
		cl.style.margin = '0'

		await __test__inlineAllStyles(src, cl)
		expect(cl.style.margin).toBe('0px')
	})

	it('should inline styles for child elements', async () => {
		const parent = document.createElement('div')
		parent.style.cssText = 'width:200px;height:200px;display:flex;'
		const child = document.createElement('span')
		child.style.cssText = 'color:blue;font-size:14px;'
		child.textContent = 'hello'
		parent.appendChild(child)
		document.body.appendChild(parent)

		const parentClone = parent.cloneNode(true) as HTMLElement
		await __test__inlineAllStyles(parent, parentClone)

		const childClone = parentClone.querySelector('span') as HTMLElement
		expect(childClone).toBeTruthy()
	})

	it('should skip cursor and pointer-events properties', async () => {
		const src = document.createElement('div')
		src.style.cursor = 'pointer'
		src.style.pointerEvents = 'none'
		src.style.width = '100px'
		document.body.appendChild(src)
		const cl = src.cloneNode(true) as HTMLElement

		await __test__inlineAllStyles(src, cl)
	})

	it('should set crossOrigin on cloned images', async () => {
		const container = document.createElement('div')
		const img = document.createElement('img')
		img.src =
			'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
		container.appendChild(img)
		document.body.appendChild(container)

		const containerClone = container.cloneNode(true) as HTMLElement
		await __test__inlineAllStyles(container, containerClone)

		const clonedImg = containerClone.querySelector('img') as HTMLImageElement
		expect(clonedImg.crossOrigin).toBe('anonymous')
	})

	it('should accept additional preserveProps', async () => {
		const src = document.createElement('div')
		src.style.width = '100px'
		document.body.appendChild(src)
		const cl = src.cloneNode(true) as HTMLElement

		await __test__inlineAllStyles(src, cl, undefined, new Set(['width']))
	})

	it('should walk tree in sync order', async () => {
		const container = document.createElement('div')
		const a = document.createElement('div')
		a.className = 'child-a'
		a.style.color = 'red'
		const b = document.createElement('div')
		b.className = 'child-b'
		b.style.color = 'blue'
		container.appendChild(a)
		container.appendChild(b)
		document.body.appendChild(container)

		const containerClone = container.cloneNode(true) as HTMLElement
		await __test__inlineAllStyles(container, containerClone)

		expect(containerClone.querySelectorAll('.child-a').length).toBe(1)
		expect(containerClone.querySelectorAll('.child-b').length).toBe(1)
	})
})
