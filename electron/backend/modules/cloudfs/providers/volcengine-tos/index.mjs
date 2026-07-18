import { listBuckets, setupBucket, createBucket as createBucketImpl, setBucketPublicRead, setupLifecycle, getBucketAcl, ensureBucketPublicRead as ensureBucketPublicReadImpl } from './bucket.mjs'
import { getTosClient, resolveEndpoint } from './client.mjs'
import { listFiles, getFileMetadata, createFolder as createFolderImpl } from './list.mjs'
import { uploadFile, getPublicUrl } from './upload.mjs'
import { deleteFile } from './delete.mjs'
import { createCloudValidationResult, createCloudBucketSetupResult, createCloudListBucketsResult } from '../../types.mjs'

const VOLCENGINE_TOS_REGIONS = [
  { id: 'cn-beijing', name: '华北2（北京）', endpoint: 'tos-cn-beijing.volces.com' },
  { id: 'cn-shanghai', name: '华东2（上海）', endpoint: 'tos-cn-shanghai.volces.com' },
  { id: 'cn-guangzhou', name: '华南1（广州）', endpoint: 'tos-cn-guangzhou.volces.com' },
  { id: 'cn-hongkong', name: '中国香港', endpoint: 'tos-cn-hongkong.volces.com' },
]

const provider = {
  getMeta() {
    return {
      id: 'volcengine-tos',
      name: '火山引擎 TOS',
      icon: 'volcano',
      website: 'https://www.volcengine.com/product/tos',
      docsUrl: 'https://www.volcengine.com/docs/6349',
      keyApplyUrl: 'https://console.volcengine.com/iam/keymanage/',
      keyApplyTip: '建议使用子账号密钥，遵循最小权限原则',
      description: '字节跳动旗下云存储服务',
      regions: VOLCENGINE_TOS_REGIONS,
      credentialFields: [
        { key: 'accessKeyId', label: 'Access Key ID', type: 'text', placeholder: '请输入Access Key ID', required: true },
        { key: 'accessKeySecret', label: 'Secret Access Key', type: 'password', placeholder: '40位密钥', required: true },
      ],
    }
  },

  resolveEndpoint,

  async validateCredentials(credentials, region, endpoint) {
    try {
      const result = await listBuckets(credentials, region, endpoint)
      return createCloudValidationResult({
        ok: result.ok,
        error: result.error,
        buckets: result.buckets || [],
      })
    } catch (err) {
      return createCloudValidationResult({
        ok: false,
        error: err.message,
      })
    }
  },

  async listBuckets(credentials, region, endpoint) {
    try {
      const result = await listBuckets(credentials, region, endpoint)
      return createCloudListBucketsResult({
        ok: result.ok,
        error: result.error,
        buckets: result.buckets || [],
      })
    } catch (err) {
      return createCloudListBucketsResult({
        ok: false,
        error: err.message,
      })
    }
  },

  async setupBucket(credentials, region, bucketName, options = {}) {
    try {
      const result = await setupBucket(credentials, region, bucketName, {
        publicRead: true,
        lifecycleDays: options.lifecycleDays || 7,
        ...options,
      })
      return createCloudBucketSetupResult(result)
    } catch (err) {
      return createCloudBucketSetupResult({
        ok: false,
        error: err.message,
      })
    }
  },

  async createBucket(credentials, region, bucketName, options = {}) {
    try {
      const endpoint = options.endpoint || credentials.endpoint || resolveEndpoint(region || 'cn-beijing')
      const client = getTosClient(credentials, region, bucketName, endpoint)
      const result = await createBucketImpl(client, bucketName, region)
      if (!result.ok) {
        return { ok: false, error: result.error }
      }
      if (options.publicRead !== false) {
        await setBucketPublicRead(client, bucketName)
      }
      if (options.lifecycleDays) {
        await setupLifecycle(client, bucketName, options.lifecycleDays)
      }
      return { ok: true, bucketName }
    } catch (err) {
      return { ok: false, error: err.message }
    }
  },

  async createFolder(config, folderPath) {
    return createFolderImpl(config, folderPath)
  },

  async listFiles(config, prefix, options = {}) {
    return listFiles(config, prefix, options)
  },

  async uploadFile(config, data, options = {}) {
    return uploadFile(config, data, options)
  },

  async deleteFile(config, key) {
    return deleteFile(config, key)
  },

  async getPublicUrl(config, key, expires) {
    return getPublicUrl(config, key, expires)
  },

  async getFileMetadata(config, key) {
    return getFileMetadata(config, key)
  },

  async getBucketAcl(config) {
    const { credentials, region, bucketName } = config
    const endpoint = config.endpoint || credentials.endpoint || resolveEndpoint(region || 'cn-beijing')
    const client = getTosClient(credentials, region, bucketName, endpoint)
    return getBucketAcl(client, bucketName)
  },

  async ensureBucketPublicRead(config) {
    const { credentials, region, bucketName } = config
    const endpoint = config.endpoint || credentials.endpoint || resolveEndpoint(region || 'cn-beijing')
    const client = getTosClient(credentials, region, bucketName, endpoint)
    return ensureBucketPublicReadImpl(client, bucketName)
  },

  async testConnection(config) {
    try {
      const credentials = config.credentials
      const region = config.region
      const bucketName = config.bucketName
      const endpoint = config.endpoint || credentials?.endpoint || resolveEndpoint(region || 'cn-beijing')

      if (!bucketName) {
        const result = await listBuckets(credentials, region, endpoint)
        if (!result.ok) {
          return { ok: false, error: result.error }
        }
        return { ok: true }
      }

      const client = getTosClient(credentials, region, bucketName, endpoint)
      try {
        await client.headBucket(bucketName)
      } catch (err) {
        return { ok: false, error: err.message }
      }

      const testKey = `_test_connection_${Date.now()}.txt`
      const testData = Buffer.from('DVStudio CloudFS connection test')
      const uploadResult = await uploadFile(config, testData, {
        key: testKey,
        contentType: 'text/plain',
        publicRead: true,
      })
      if (!uploadResult.ok) {
        return { ok: false, error: `Upload test failed: ${uploadResult.error}` }
      }
      await deleteFile(config, testKey)
      return { ok: true, testUrl: uploadResult.publicUrl }
    } catch (err) {
      return { ok: false, error: err.message }
    }
  },
}

export default provider
