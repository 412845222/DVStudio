import { describe, it, expect } from 'vitest'
import {
  maskAccessKey,
  resolveTosEndpoint,
  buildPublicUrlBase,
  buildPublicObjectUrl,
  formatFileSize,
  getFileExtension,
  isImageFile,
  isVideoFile,
} from '@/core/shared/cloudStorage'

describe('maskAccessKey', () => {
  it('returns empty string for falsy values', () => {
    expect(maskAccessKey('')).toBe('')
    expect(maskAccessKey(null as unknown as string)).toBe('')
    expect(maskAccessKey(undefined as unknown as string)).toBe('')
  })

  it('returns original string when length <= 10', () => {
    expect(maskAccessKey('abc123')).toBe('abc123')
    expect(maskAccessKey('1234567890')).toBe('1234567890')
  })

  it('masks access key with first 6 and last 4 chars', () => {
    const ak = 'TESTKEYABCDEFGHIJKLMNOPQRSTUVWXYZ1234wxyz'
    expect(maskAccessKey(ak)).toBe('TESTKE...wxyz')
  })

  it('handles exactly 11 characters', () => {
    expect(maskAccessKey('12345678901')).toBe('123456...8901')
  })
})

describe('resolveTosEndpoint', () => {
  it('returns default cn-beijing endpoint when region is not provided', () => {
    expect(resolveTosEndpoint()).toBe('tos-cn-beijing.volces.com')
    expect(resolveTosEndpoint('')).toBe('tos-cn-beijing.volces.com')
  })

  it('resolves endpoint for specific regions', () => {
    expect(resolveTosEndpoint('cn-shanghai')).toBe('tos-cn-shanghai.volces.com')
    expect(resolveTosEndpoint('cn-guangzhou')).toBe('tos-cn-guangzhou.volces.com')
    expect(resolveTosEndpoint('ap-southeast-1')).toBe('tos-ap-southeast-1.volces.com')
  })
})

describe('buildPublicUrlBase', () => {
  it('builds correct base URL for bucket and endpoint', () => {
    expect(buildPublicUrlBase('my-bucket', 'tos-cn-beijing.volces.com')).toBe(
      'https://my-bucket.tos-cn-beijing.volces.com'
    )
  })
})

describe('buildPublicObjectUrl', () => {
  it('builds correct public URL for object key', () => {
    expect(buildPublicObjectUrl('my-bucket', 'tos-cn-beijing.volces.com', 'images/photo.jpg')).toBe(
      'https://my-bucket.tos-cn-beijing.volces.com/images/photo.jpg'
    )
  })

  it('strips leading slashes from key', () => {
    expect(buildPublicObjectUrl('bucket', 'tos-cn-beijing.volces.com', '/path/to/file.png')).toBe(
      'https://bucket.tos-cn-beijing.volces.com/path/to/file.png'
    )
    expect(buildPublicObjectUrl('bucket', 'tos-cn-beijing.volces.com', '//double-slash.txt')).toBe(
      'https://bucket.tos-cn-beijing.volces.com/double-slash.txt'
    )
  })

  it('handles empty key', () => {
    expect(buildPublicObjectUrl('bucket', 'tos-cn-beijing.volces.com', '')).toBe(
      'https://bucket.tos-cn-beijing.volces.com/'
    )
  })

  it('encodes Chinese and special characters in filenames', () => {
    expect(buildPublicObjectUrl('bucket', 'oss-cn-beijing.aliyuncs.com', 'uploads/测试文件.png')).toBe(
      'https://bucket.oss-cn-beijing.aliyuncs.com/uploads/%E6%B5%8B%E8%AF%95%E6%96%87%E4%BB%B6.png'
    )
    expect(buildPublicObjectUrl('bucket', 'oss-cn-beijing.aliyuncs.com', 'images/photo 1.jpg')).toBe(
      'https://bucket.oss-cn-beijing.aliyuncs.com/images/photo%201.jpg'
    )
    expect(buildPublicObjectUrl('bucket', 'oss-cn-beijing.aliyuncs.com', 'docs/报告(v2).pdf')).toBe(
      'https://bucket.oss-cn-beijing.aliyuncs.com/docs/%E6%8A%A5%E5%91%8A(v2).pdf'
    )
  })

  it('preserves directory separators while encoding path segments', () => {
    expect(buildPublicObjectUrl('bucket', 'oss-cn-beijing.aliyuncs.com', 'a/b/c/file name.txt')).toBe(
      'https://bucket.oss-cn-beijing.aliyuncs.com/a/b/c/file%20name.txt'
    )
  })
})

describe('formatFileSize', () => {
  it('returns "0 B" for invalid or zero values', () => {
    expect(formatFileSize(0)).toBe('0 B')
    expect(formatFileSize(-1)).toBe('0 B')
    expect(formatFileSize(NaN)).toBe('0 B')
    expect(formatFileSize(Infinity)).toBe('0 B')
  })

  it('formats bytes correctly', () => {
    expect(formatFileSize(500)).toBe('500 B')
    expect(formatFileSize(1024)).toBe('1.0 KB')
    expect(formatFileSize(1536)).toBe('1.5 KB')
    expect(formatFileSize(1048576)).toBe('1.0 MB')
    expect(formatFileSize(1073741824)).toBe('1.0 GB')
    expect(formatFileSize(1099511627776)).toBe('1.0 TB')
  })

  it('handles large values without exceeding TB', () => {
    const huge = 1099511627776 * 2
    expect(formatFileSize(huge)).toBe('2.0 TB')
  })
})

describe('getFileExtension', () => {
  it('returns lowercase extension', () => {
    expect(getFileExtension('photo.JPG')).toBe('jpg')
    expect(getFileExtension('document.PDF')).toBe('pdf')
  })

  it('returns extension for normal filenames', () => {
    expect(getFileExtension('image.png')).toBe('png')
    expect(getFileExtension('video.mp4')).toBe('mp4')
    expect(getFileExtension('archive.tar.gz')).toBe('gz')
  })

  it('returns empty string for files without extension', () => {
    expect(getFileExtension('README')).toBe('')
    expect(getFileExtension('noext')).toBe('')
    expect(getFileExtension('')).toBe('')
  })

  it('returns empty string for dotfiles or trailing dot', () => {
    expect(getFileExtension('.gitignore')).toBe('gitignore')
    expect(getFileExtension('file.')).toBe('')
  })
})

describe('isImageFile', () => {
  it('returns true for image extensions', () => {
    expect(isImageFile('photo.jpg')).toBe(true)
    expect(isImageFile('photo.jpeg')).toBe(true)
    expect(isImageFile('icon.png')).toBe(true)
    expect(isImageFile('anim.gif')).toBe(true)
    expect(isImageFile('pic.webp')).toBe(true)
    expect(isImageFile('img.bmp')).toBe(true)
    expect(isImageFile('vector.svg')).toBe(true)
    expect(isImageFile('favicon.ico')).toBe(true)
  })

  it('returns false for non-image files', () => {
    expect(isImageFile('video.mp4')).toBe(false)
    expect(isImageFile('doc.pdf')).toBe(false)
    expect(isImageFile('archive.zip')).toBe(false)
    expect(isImageFile('noext')).toBe(false)
  })

  it('is case-insensitive', () => {
    expect(isImageFile('photo.JPG')).toBe(true)
    expect(isImageFile('photo.PNG')).toBe(true)
  })
})

describe('isVideoFile', () => {
  it('returns true for video extensions', () => {
    expect(isVideoFile('movie.mp4')).toBe(true)
    expect(isVideoFile('clip.webm')).toBe(true)
    expect(isVideoFile('recording.mov')).toBe(true)
    expect(isVideoFile('video.avi')).toBe(true)
    expect(isVideoFile('movie.mkv')).toBe(true)
  })

  it('returns false for non-video files', () => {
    expect(isVideoFile('photo.jpg')).toBe(false)
    expect(isVideoFile('doc.pdf')).toBe(false)
    expect(isVideoFile('audio.mp3')).toBe(false)
  })

  it('is case-insensitive', () => {
    expect(isVideoFile('movie.MP4')).toBe(true)
    expect(isVideoFile('clip.WEBM')).toBe(true)
  })
})
