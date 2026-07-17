import https from 'node:https'
import http from 'node:http'
import { URL } from 'node:url'
import { createCloudFileItem, createCloudListResult, createCloudUploadResult, createCloudValidationResult, createCloudBucketSetupResult } from '../../types.mjs'
import { generateKey, isValidHttpsUrl } from '../../base/utils.mjs'
import logger from '../../../../core/logger.mjs'

function parseNestedValue(obj, path) {
  if (!path || !obj) return obj
  const parts = path.split('.')
  let current = obj
  for (const part of parts) {
    if (current == null) return undefined
    if (Array.isArray(current) && /^\d+$/.test(part)) {
      current = current[parseInt(part, 10)]
    } else {
      current = current[part]
    }
  }
  return current
}

function doRequest(options, body) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(options.url)
    const isHttps = parsedUrl.protocol === 'https:'
    const transport = isHttps ? https : http
    
    const reqOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || 'POST',
      headers: {
        ...(options.headers || {}),
      },
    }

    if (body && !reqOptions.headers['Content-Length']) {
      reqOptions.headers['Content-Length'] = Buffer.isBuffer(body) ? body.length : Buffer.byteLength(body)
    }

    const req = transport.request(reqOptions, (res) => {
      const chunks = []
      res.on('data', chunk => chunks.push(chunk))
      res.on('end', () => {
        const responseBody = Buffer.concat(chunks).toString('utf-8')
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: responseBody,
        })
      })
    })

    req.on('error', reject)

    if (options.timeout) {
      req.setTimeout(options.timeout, () => {
        req.destroy(new Error('Request timeout'))
      })
    }

    if (body) {
      req.write(body)
    }
    req.end()
  })
}

function buildMultipartBody(fields, fileBuffer, fileName, fileFieldName, contentType) {
  const boundary = `----DVSCloudFS${Date.now()}`
  const chunks = []

  for (const [key, value] of Object.entries(fields || {})) {
    chunks.push(Buffer.from(`--${boundary}\r\n`))
    chunks.push(Buffer.from(`Content-Disposition: form-data; name="${key}"\r\n\r\n`))
    chunks.push(Buffer.from(String(value)))
    chunks.push(Buffer.from('\r\n'))
  }

  chunks.push(Buffer.from(`--${boundary}\r\n`))
  chunks.push(Buffer.from(`Content-Disposition: form-data; name="${fileFieldName}"; filename="${fileName}"\r\n`))
  chunks.push(Buffer.from(`Content-Type: ${contentType || 'application/octet-stream'}\r\n\r\n`))
  chunks.push(fileBuffer)
  chunks.push(Buffer.from('\r\n'))
  chunks.push(Buffer.from(`--${boundary}--\r\n`))

  return {
    body: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
  }
}

async function customUploadFile(config, data, options = {}) {
  const { credentials } = config
  const uploadUrl = credentials.uploadUrl
  const method = credentials.method || 'POST'
  const fileFieldName = credentials.fileFieldName || 'file'
  const urlPath = credentials.urlPath || ''
  const headers = { ...(credentials.headers || {}) }
  const formFields = { ...(credentials.formFields || {}), ...(options.formFields || {}) }
  
  const contentType = options.contentType || 'application/octet-stream'
  const fileName = options.fileName || generateKey('', contentType, options.extension)

  try {
    let body
    let reqHeaders = { ...headers }

    if (method === 'PUT') {
      body = data
      reqHeaders['Content-Type'] = contentType
    } else {
      const multipart = buildMultipartBody(formFields, data, fileName, fileFieldName, contentType)
      body = multipart.body
      reqHeaders['Content-Type'] = multipart.contentType
    }

    const result = await doRequest({
      url: uploadUrl,
      method,
      headers: reqHeaders,
      timeout: options.timeout || 120000,
    }, body)

    if (result.statusCode < 200 || result.statusCode >= 300) {
      return createCloudUploadResult({
        ok: false,
        error: `Upload failed with status ${result.statusCode}: ${result.body.slice(0, 200)}`,
      })
    }

    let publicUrl = ''
    try {
      const parsed = JSON.parse(result.body)
      publicUrl = urlPath ? parseNestedValue(parsed, urlPath) : (parsed.url || parsed.publicUrl || parsed.data?.url || '')
    } catch {
      publicUrl = result.body.trim()
    }

    if (!publicUrl) {
      return createCloudUploadResult({
        ok: false,
        error: 'Could not extract public URL from response',
      })
    }

    return createCloudUploadResult({
      ok: true,
      key: fileName,
      publicUrl: String(publicUrl),
    })
  } catch (err) {
    logger.error('[cloudfs:custom-http] uploadFile failed:', err.message)
    return createCloudUploadResult({
      ok: false,
      error: err.message,
    })
  }
}

async function customValidateCredentials(credentials, region) {
  const { uploadUrl } = credentials || {}
  if (!uploadUrl) {
    return createCloudValidationResult({
      ok: false,
      error: '上传接口地址不能为空',
    })
  }
  try {
    new URL(uploadUrl)
  } catch {
    return createCloudValidationResult({
      ok: false,
      error: '上传接口地址格式无效',
    })
  }
  if (!uploadUrl.startsWith('https://') && !uploadUrl.startsWith('http://')) {
    return createCloudValidationResult({
      ok: false,
      error: '上传接口必须使用 HTTP 或 HTTPS 协议',
    })
  }
  return createCloudValidationResult({
    ok: true,
    buckets: ['default'],
  })
}

async function customSetupBucket(credentials, region, bucketName, options = {}) {
  return createCloudBucketSetupResult({
    ok: true,
    bucketName: bucketName || 'default',
    endpoint: '',
    publicUrlBase: '',
  })
}

async function customListFiles(config, prefix, options = {}) {
  const { credentials } = config
  if (!credentials?.listFilesUrl) {
    return createCloudListResult({
      ok: false,
      error: 'listFilesUrl not configured',
      items: [],
      prefixes: [],
      isTruncated: false,
    })
  }
  try {
    const result = await doRequest({
      url: credentials.listFilesUrl,
      method: 'GET',
      headers: credentials.headers || {},
      timeout: 30000,
    })
    if (result.statusCode < 200 || result.statusCode >= 300) {
      throw new Error(`List files failed with status ${result.statusCode}`)
    }
    let files = []
    try {
      const parsed = JSON.parse(result.body)
      files = Array.isArray(parsed) ? parsed : (parseNestedValue(parsed, credentials.listFilesPath || 'files') || [])
    } catch {
      files = []
    }
    return createCloudListResult({
      ok: true,
      items: files.map(f => createCloudFileItem({
        key: f.key || f.name || f.path || '',
        name: f.name || f.key?.split('/').pop() || '',
        size: f.size || 0,
        contentType: f.contentType || f.type || '',
        publicUrl: f.url || f.publicUrl || '',
      })),
      prefixes: [],
      isTruncated: false,
    })
  } catch (err) {
    logger.error('[cloudfs:custom-http] listFiles failed:', err.message)
    return createCloudListResult({
      ok: false,
      error: err.message,
      items: [],
      prefixes: [],
      isTruncated: false,
    })
  }
}

async function customDeleteFile(config, key) {
  const { credentials } = config
  if (!credentials?.deleteUrl) {
    return { ok: false, error: 'Delete URL not configured' }
  }
  try {
    const deleteUrl = credentials.deleteUrl.replace('{key}', encodeURIComponent(key))
    await doRequest({
      url: deleteUrl,
      method: 'DELETE',
      headers: credentials.headers || {},
      timeout: 30000,
    })
    return { ok: true }
  } catch (err) {
    logger.error('[cloudfs:custom-http] deleteFile failed:', err.message)
    return { ok: false, error: err.message }
  }
}

function customGetPublicUrl(config, key, expires) {
  const { credentials } = config
  if (credentials?.publicUrlPattern) {
    return credentials.publicUrlPattern.replace('{key}', encodeURIComponent(key))
  }
  return key
}

function customGetFileMetadata(config, key) {
  return createCloudFileItem({
    key,
    name: key.split('/').pop() || key,
    isFolder: false,
  })
}

async function customTestConnection(config) {
  try {
    const testData = Buffer.from('DVStudio CloudFS custom HTTP test')
    const result = await customUploadFile(config, testData, {
      fileName: `_test_${Date.now()}.txt`,
      contentType: 'text/plain',
      timeout: 30000,
    })
    if (!result.ok) {
      return { ok: false, error: result.error }
    }
    return { ok: true, testUrl: result.publicUrl }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

async function customListBuckets(credentials, region) {
  return {
    ok: true,
    buckets: ['default'],
  }
}

async function customCreateBucket(credentials, region, bucketName, options) {
  return {
    ok: false,
    error: '自定义 HTTP 模式不支持创建桶，请在您的服务端管理',
  }
}

async function customCreateFolder(config, folderPath) {
  return {
    ok: false,
    error: '自定义 HTTP 模式不支持创建文件夹',
  }
}

const provider = {
  getMeta() {
    return {
      id: 'custom-http',
      name: '自定义 HTTP 上传',
      icon: 'http',
      website: '',
      docsUrl: '',
      regions: [],
      credentialFields: [
        { key: 'uploadUrl', label: '上传接口地址', type: 'text', placeholder: 'https://your-server.com/upload', required: true },
        { key: 'method', label: '请求方法', type: 'select', options: ['POST', 'PUT'], default: 'POST' },
        { key: 'fileFieldName', label: '文件字段名', type: 'text', placeholder: 'file', default: 'file' },
        { key: 'urlPath', label: '响应中URL路径', type: 'text', placeholder: 'data.url (可选)', hint: '如 data.url 或 files.0.url，留空直接取响应文本' },
      ],
    }
  },

  validateCredentials: customValidateCredentials,
  setupBucket: customSetupBucket,
  listBuckets: customListBuckets,
  createBucket: customCreateBucket,
  createFolder: customCreateFolder,
  listFiles: customListFiles,
  uploadFile: customUploadFile,
  deleteFile: customDeleteFile,
  getPublicUrl: customGetPublicUrl,
  getFileMetadata: customGetFileMetadata,
  testConnection: customTestConnection,
}

export default provider
