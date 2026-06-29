/**
 * Logo统一生成脚本
 * 
 * 功能：
 * 1. 从 public/logo.png (1024x1024) 生成所有尺寸的PNG
 * 2. 生成 favicon.ico (包含16/32/48/64/256)
 * 3. 生成 build/icon.ico (Windows安装包图标)
 * 4. 生成安装器侧边栏位图（可选嵌入logo）
 * 
 * 使用方法：
 *   node scripts/gen-logo-assets.mjs
 * 
 * 前置条件：
 *   npm install sharp png-to-ico
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import pngToIco from 'png-to-ico'
import { LOGO_CONFIG } from '../electron/logo.config.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * 读取PNG尺寸信息
 */
function readPngSize(filePath) {
  const buf = fs.readFileSync(filePath)
  if (buf.length < 24) {
    throw new Error('PNG file too small')
  }
  // 检查PNG签名
  if (buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47) {
    throw new Error('Not a valid PNG file')
  }
  const width = buf.readUInt32BE(16)
  const height = buf.readUInt32BE(20)
  return { width, height, size: buf.length }
}

/**
 * 确保目录存在
 */
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

/**
 * 生成BMP位图数据
 */
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

/**
 * 线性插值颜色
 */
function lerp(c1, c2, t) {
  return {
    r: Math.round(c1.r + (c2.r - c1.r) * t),
    g: Math.round(c1.g + (c2.g - c1.g) * t),
    b: Math.round(c1.b + (c2.b - c1.b) * t)
  }
}

/**
 * 生成带logo嵌入的安装器位图
 */
async function generateInstallerBitmapWithLogo(logoPath, config) {
  const { width, height, logoSize, logoPosition } = config
  
  // 读取logo并缩放
  const logoBuffer = await sharp(logoPath)
    .resize(logoSize, logoSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()
  
  const logoPng = await sharp(logoBuffer)
    .raw()
    .toBuffer({ resolveWithObject: true })
    .catch(() => null)
  
  // 颜色配置
  const BG_COLOR = { r: 24, g: 24, b: 24 }
  const ACCENT = { r: 31, g: 157, b: 132 }
  const ACCENT_LIGHT = { r: 39, g: 185, b: 156 }
  const GLOW_ALPHA = 0.35

  function getPixel(x, y) {
    // 背景渐变
    let color = lerp({ r: 15, g: 22, b: 28 }, BG_COLOR, y / height)

    // 左侧条纹发光效果
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

    // 中心logo区域（保留空白，让logo更突出）
    const cx = logoPosition.x
    const cy = logoPosition.y
    const outerR = logoSize / 2 + 10
    
    // logo周围装饰圆环
    const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2)
    if (dist > logoSize / 2 && dist < outerR) {
      const t = (dist - logoSize / 2) / (outerR - logoSize / 2)
      color = lerp(ACCENT, { r: ACCENT.r * 0.5, g: ACCENT.g * 0.5, b: ACCENT.b * 0.5 }, t * 0.3)
    }

    // 底部装饰线
    const lineY = height - 50
    if (y >= lineY && y < lineY + 2) {
      const progress = x / width
      if (progress < 0.85) {
        const lineGrad = Math.sin(progress * Math.PI) * 0.8
        color = lerp(color, ACCENT_LIGHT, lineGrad)
      }
    }

    // 版本区域背景
    const verY = height - 30
    if (y >= verY && y < verY + 12 && x >= 30 && x < width - 30) {
      color = { r: 90, g: 90, b: 90 }
    }

    return color
  }

  return createBitmap(width, height, getPixel)
}

/**
 * 主函数
 */
async function main() {
  console.log('=== Logo资源生成脚本 ===\n')
  
  const { sourceFile, pngSizes, outputs, icoConfig, installerBitmaps } = LOGO_CONFIG
  
  // 1. 验证源文件
  console.log('[1/5] 验证源文件...')
  if (!fs.existsSync(sourceFile)) {
    throw new Error(`❌ Logo源文件不存在: ${sourceFile}\n   请确保 public/logo.png 存在`)
  }
  
  const { width, height, size } = readPngSize(sourceFile)
  console.log(`   ✓ 源logo: ${width}x${height}, ${(size / 1024).toFixed(1)}KB`)
  
  if (width < 256 || height < 256) {
    throw new Error(`❌ Logo尺寸至少需要256x256，当前: ${width}x${height}`)
  }
  
  // 2. 生成多尺寸PNG
  console.log('\n[2/5] 生成多尺寸PNG...')
  ensureDir(outputs.pngDir)
  
  for (const size of pngSizes) {
    const outFile = path.join(outputs.pngDir, `logo-${size}.png`)
    await sharp(sourceFile)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(outFile)
    console.log(`   ✓ logo-${size}.png`)
  }
  
  // 3. 生成favicon.ico
  console.log('\n[3/5] 生成favicon.ico...')
  const faviconBuffers = await Promise.all(
    icoConfig.faviconSizes.map(size => 
      sharp(sourceFile)
        .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer()
    )
  )
  const faviconIco = await pngToIco(faviconBuffers)
  fs.writeFileSync(outputs.favicon, faviconIco)
  console.log(`   ✓ favicon.ico (含 ${icoConfig.faviconSizes.join('/')}px)`)
  
  // 4. 生成build/icon.ico
  console.log('\n[4/5] 生成build/icon.ico...')
  const installerBuffers = await Promise.all(
    icoConfig.installerSizes.map(size => 
      sharp(sourceFile)
        .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer()
    )
  )
  const installerIco = await pngToIco(installerBuffers)
  ensureDir(path.dirname(outputs.installerIcon))
  fs.writeFileSync(outputs.installerIcon, installerIco)
  console.log(`   ✓ build/icon.ico (含 ${icoConfig.installerSizes.join('/')}px)`)
  
  // 5. 生成安装器位图
  console.log('\n[5/5] 生成安装器位图...')
  if (installerBitmaps.embedLogo) {
    const installerBmp = await generateInstallerBitmapWithLogo(sourceFile, {
      ...installerBitmaps,
      width: installerBitmaps.width,
      height: installerBitmaps.height
    })
    fs.writeFileSync(
      path.join(path.dirname(outputs.installerIcon), 'installer-sidebar.bmp'),
      installerBmp
    )
    
    // 卸载器位图（稍有不同的配色）
    const uninstallerBmp = await generateInstallerBitmapWithLogo(sourceFile, {
      ...installerBitmaps,
      width: installerBitmaps.width,
      height: installerBitmaps.height,
      logoPosition: installerBitmaps.logoPosition
    })
    fs.writeFileSync(
      path.join(path.dirname(outputs.installerIcon), 'uninstaller-sidebar.bmp'),
      uninstallerBmp
    )
    console.log('   ✓ installer-sidebar.bmp')
    console.log('   ✓ uninstaller-sidebar.bmp')
  } else {
    console.log('   ⊘ 跳过（embedLogo = false）')
  }
  
  console.log('\n=== ✅ Logo资源生成完成 ===')
  console.log('\n生成的文件：')
  console.log('  public/logo-{32,48,64,128,256}.png - 应用内显示')
  console.log('  public/favicon.ico - Web/Electron窗口图标')
  console.log('  build/icon.ico - Windows安装包图标')
  console.log('  build/*.bmp - 安装器位图')
  console.log('\n下一步：')
  console.log('  npm run dev:electron - 测试效果')
  console.log('  npm run dist:win - 打包发布')
}

main().catch((e) => {
  console.error('\n❌ 生成失败:', e.message)
  process.exitCode = 1
})
