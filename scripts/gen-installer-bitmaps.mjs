import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const outDir = path.resolve(__dirname, '..', 'build')

const WIDTH = 164
const HEIGHT = 314
const BG_COLOR = { r: 24, g: 24, b: 24 }
const ACCENT = { r: 31, g: 157, b: 132 }
const ACCENT_LIGHT = { r: 39, g: 185, b: 156 }
const PANEL_BG = { r: 30, g: 30, b: 30 }
const GLOW_ALPHA = 0.35

function lerp(c1, c2, t) {
	return {
		r: Math.round(c1.r + (c2.r - c1.r) * t),
		g: Math.round(c1.g + (c2.g - c1.g) * t),
		b: Math.round(c1.b + (c2.b - c1.b) * t)
	}
}

function createBitmap(width, height, getPixel) {
	const rowSize = Math.ceil((width * 3) / 4) * 4
	const pixelDataSize = rowSize * height
	const fileSize = 54 + pixelDataSize
	const buf = Buffer.alloc(fileSize)

	// BMP File Header (14 bytes)
	buf.write('BM', 0)
	buf.writeUInt32LE(fileSize, 2)
	buf.writeUInt32LE(0, 6)
	buf.writeUInt32LE(54, 10)

	// BMP Info Header (40 bytes - BITMAPINFOHEADER)
	buf.writeUInt32LE(40, 14)
	buf.writeInt32LE(width, 18)
	buf.writeInt32LE(height, 22)
	buf.writeUInt16LE(1, 26)
	buf.writeUInt16LE(24, 28)
	buf.writeUInt32LE(0, 30)
	buf.writeUInt32LE(pixelDataSize, 34)
	buf.writeInt32LE(2835, 38)
	buf.writeInt32LE(2835, 42)
	buf.writeUInt32LE(0, 46)
	buf.writeUInt32LE(0, 50)

	// Pixel data (bottom-up, BGR)
	for (let y = height - 1; y >= 0; y--) {
		const rowOffset = 54 + (height - 1 - y) * rowSize
		for (let x = 0; x < width; x++) {
			const px = getPixel(x, y)
			const offset = rowOffset + x * 3
			buf[offset] = px.b
			buf[offset + 1] = px.g
			buf[offset + 2] = px.r
		}
	}

	return buf
}

function getInstallerPixel(x, y) {
	// Main background gradient (slight vertical)
	let color = lerp({ r: 15, g: 22, b: 28 }, BG_COLOR, y / HEIGHT)

	// Left accent stripe (glow effect)
	const stripeX = 0
	const stripeWidth = 4
	const glowWidth = 24
	if (x < stripeWidth) {
		color = lerp(color, ACCENT, 0.9)
	} else if (x < stripeWidth + glowWidth) {
		const t = 1 - (x - stripeWidth) / glowWidth
		const glow = lerp({ r: 0, g: 0, b: 0 }, ACCENT, t * GLOW_ALPHA)
		color = {
			r: Math.min(255, color.r + glow.r * 2),
			g: Math.min(255, color.g + glow.g * 2),
			b: Math.min(255, color.b + glow.b * 2)
		}
	}

	// Center brand circle area
	const cx = WIDTH / 2
	const cy = 110
	const outerR = 48
	const innerR = 36
	const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2)

	if (dist < outerR && dist > innerR) {
		const t = (dist - innerR) / (outerR - innerR)
		color = lerp(ACCENT, { r: ACCENT.r * 0.6, g: ACCENT.g * 0.6, b: ACCENT.b * 0.6 }, t)
	} else if (dist <= innerR) {
		const angle = Math.atan2(y - cy, x - cx)
		const shimmer = 0.8 + 0.2 * Math.sin(angle * 3)
		color = {
			r: Math.round(ACCENT.r * shimmer * 0.5 + PANEL_BG.r * 0.5),
			g: Math.round(ACCENT.g * shimmer * 0.5 + PANEL_BG.g * 0.5),
			b: Math.round(ACCENT.b * shimmer * 0.5 + PANEL_BG.b * 0.5)
		}
	}

	// Inner "D" shape hint - small white dot
	if (dist < 8 && x > cx - 4) {
		color = { r: 230, g: 240, b: 238 }
	}

	// Bottom decorative line
	const lineY = HEIGHT - 50
	if (y >= lineY && y < lineY + 2) {
		const progress = x / WIDTH
		if (progress < 0.85) {
			const lineGrad = Math.sin(progress * Math.PI) * 0.8
			color = lerp(color, ACCENT_LIGHT, lineGrad)
		}
	}

	// Subtle grid pattern at bottom
	if (y > HEIGHT - 100 && y < HEIGHT - 60) {
		const gridAlpha = 0.04
		if ((x + y) % 12 === 0) {
			color = {
				r: Math.round(color.r * (1 - gridAlpha) + ACCENT.r * gridAlpha),
				g: Math.round(color.g * (1 - gridAlpha) + ACCENT.g * gridAlpha),
				b: Math.round(color.b * (1 - gridAlpha) + ACCENT.b * gridAlpha)
			}
		}
	}

	// Version text area (simple block as visual indicator)
	const verY = HEIGHT - 30
	if (y >= verY && y < verY + 12 && x >= 30 && x < WIDTH - 30) {
		color = { r: 90, g: 90, b: 90 }
	}

	return color
}

function getUninstallerPixel(x, y) {
	// Similar to installer but with warm accent for uninstall context
	let color = lerp({ r: 20, g: 15, b: 15 }, { r: 30, g: 24, b: 24 }, y / HEIGHT)

	// Left accent stripe (subtle warm red)
	const stripeWidth = 3
	const glowWidth = 20
	if (x < stripeWidth) {
		color = { r: 160, g: 90, b: 70 }
	} else if (x < stripeWidth + glowWidth) {
		const t = 1 - (x - stripeWidth) / glowWidth
		color = {
			r: Math.min(255, color.r + 30 * t),
			g: Math.min(255, color.g + 10 * t),
			b: Math.min(255, color.b + 5 * t)
		}
	}

	// Still keep emerald as secondary accent for brand consistency
	const cx = WIDTH / 2
	const cy = 110
	const r = 42
	const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2)

	if (dist < r - 6 && dist > r - 12) {
		color = lerp(color, ACCENT, 0.6)
	} else if (dist < 10) {
		color = { r: 180, g: 100, b: 80 }
	}

	return color
}

const installerBmp = createBitmap(WIDTH, HEIGHT, getInstallerPixel)
const uninstallerBmp = createBitmap(WIDTH, HEIGHT, getUninstallerPixel)

fs.writeFileSync(path.join(outDir, 'installer-sidebar.bmp'), installerBmp)
fs.writeFileSync(path.join(outDir, 'uninstaller-sidebar.bmp'), uninstallerBmp)

console.log('Generated installer BMPs:')
console.log('  installer-sidebar.bmp:', installerBmp.length, 'bytes')
console.log('  uninstaller-sidebar.bmp:', uninstallerBmp.length, 'bytes')
