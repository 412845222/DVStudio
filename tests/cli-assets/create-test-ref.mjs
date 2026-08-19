// 创建测试用最小有效 PNG 文件（100x100 纯红色）
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

function createPng(width, height, r, g, b) {
    // PNG signature
    const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])

    function makeChunk(type, data) {
        const len = Buffer.alloc(4)
        len.writeUInt32BE(data.length, 0)
        const typeBuf = Buffer.from(type, 'ascii')
        const crc = Buffer.alloc(4)
        const crcData = Buffer.concat([typeBuf, data])
        crc.writeUInt32BE(0xFFFFFFFF ^ zlib.crc32(crcData) >>> 0, 0)
        return Buffer.concat([len, typeBuf, data, crc])
    }

    // IHDR
    const ihdr = Buffer.alloc(13)
    ihdr.writeUInt32BE(width, 0)
    ihdr.writeUInt32BE(height, 4)
    ihdr[8] = 8 // bit depth
    ihdr[9] = 2 // color type RGB
    ihdr[10] = 0
    ihdr[11] = 0
    ihdr[12] = 0

    // IDAT - raw pixel data
    const raw = Buffer.alloc(height * (1 + width * 3))
    for (let y = 0; y < height; y++) {
        raw[y * (1 + width * 3)] = 0 // filter type none
        for (let x = 0; x < width; x++) {
            const off = y * (1 + width * 3) + 1 + x * 3
            raw[off] = r
            raw[off + 1] = g
            raw[off + 2] = b
        }
    }
    const compressed = zlib.deflateSync(raw)

    const ihdrChunk = makeChunk('IHDR', ihdr)
    const idatChunk = makeChunk('IDAT', compressed)
    const iendChunk = makeChunk('IEND', Buffer.alloc(0))

    return Buffer.concat([sig, ihdrChunk, idatChunk, iendChunk])
}

const testDir = path.resolve('g:/DwebStudio/DwebVideoStudio/DVStudio/tests/cli-assets')
const refPath = path.join(testDir, 'reference.png')
const outDir = path.join(testDir, 'outputs')

fs.mkdirSync(testDir, { recursive: true })
fs.mkdirSync(outDir, { recursive: true })

// 生成 100x100 红色参考图
fs.writeFileSync(refPath, createPng(100, 100, 220, 60, 60))
console.log(`reference image created: ${refPath} (${fs.statSync(refPath).size} bytes)`)
console.log(`output dir created: ${outDir}`)
