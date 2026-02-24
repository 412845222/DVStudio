import fs from 'node:fs'
import path from 'node:path'

import pngToIco from 'png-to-ico'

function readPngSize(filePath) {
	const buf = fs.readFileSync(filePath)
	// PNG signature: 89 50 4E 47 0D 0A 1A 0A
	if (buf.length < 24) throw new Error('PNG file too small')
	if (
		buf[0] !== 0x89 ||
		buf[1] !== 0x50 ||
		buf[2] !== 0x4e ||
		buf[3] !== 0x47 ||
		buf[4] !== 0x0d ||
		buf[5] !== 0x0a ||
		buf[6] !== 0x1a ||
		buf[7] !== 0x0a
	) {
		throw new Error('Not a valid PNG signature')
	}
	// IHDR chunk starts at offset 8; width/height at IHDR data offset 16
	const width = buf.readUInt32BE(16)
	const height = buf.readUInt32BE(20)
	return { width, height }
}

async function main() {
	const repoRoot = process.cwd()
	const srcPng = path.resolve(repoRoot, 'public', 'logo.png')
	const outDir = path.resolve(repoRoot, 'build')
	const outIco = path.resolve(outDir, 'icon.ico')

	if (!fs.existsSync(srcPng)) {
		throw new Error(`logo.png not found: ${srcPng}`)
	}

	const { width, height } = readPngSize(srcPng)
	if (width < 256 || height < 256) {
		throw new Error(`public/logo.png must be at least 256x256. current=${width}x${height}`)
	}

	fs.mkdirSync(outDir, { recursive: true })

	// electron-builder on Windows expects an .ico with 256x256 available.
	// png-to-ico will generate a proper ICO container from the PNG.
	const icoBuf = await pngToIco(srcPng)
	fs.writeFileSync(outIco, icoBuf)

	process.stdout.write(`[gen:win-icon] OK: ${path.relative(repoRoot, outIco)} (from public/logo.png ${width}x${height})\n`)
}

main().catch((e) => {
	process.stderr.write(`[gen:win-icon] FAILED: ${String(e?.message || e)}\n`)
	process.exitCode = 1
})
