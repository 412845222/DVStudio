import { listBuckets, setupBucket, createBucket as createBucketImpl, setBucketPublicRead, setupLifecycle, getBucketAcl, ensureBucketPublicRead as ensureBucketPublicReadImpl } from './bucket.mjs'
import { getOssClient, resolveEndpoint, withNoProxyEnv } from './client.mjs'
import { listFiles, getFileMetadata, createFolder as createFolderImpl } from './list.mjs'
import { uploadFile, getPublicUrl } from './upload.mjs'
import { deleteFile } from './delete.mjs'
import { createCloudValidationResult, createCloudBucketSetupResult, createCloudListBucketsResult } from '../../types.mjs'

const ALIYUN_OSS_REGIONS = [
  { id: 'oss-cn-hangzhou', name: '华东1（杭州）', endpoint: 'oss-cn-hangzhou.aliyuncs.com' },
  { id: 'oss-cn-shanghai', name: '华东2（上海）', endpoint: 'oss-cn-shanghai.aliyuncs.com' },
  { id: 'oss-cn-nanjing', name: '华东5（南京本地地域）', endpoint: 'oss-cn-nanjing.aliyuncs.com' },
  { id: 'oss-cn-fuzhou', name: '华东6（福州本地地域）', endpoint: 'oss-cn-fuzhou.aliyuncs.com' },
  { id: 'oss-cn-wuhan-lr', name: '华中1（武汉本地地域）', endpoint: 'oss-cn-wuhan-lr.aliyuncs.com' },
  { id: 'oss-cn-qingdao', name: '华北1（青岛）', endpoint: 'oss-cn-qingdao.aliyuncs.com' },
  { id: 'oss-cn-beijing', name: '华北2（北京）', endpoint: 'oss-cn-beijing.aliyuncs.com' },
  { id: 'oss-cn-zhangjiakou', name: '华北3（张家口）', endpoint: 'oss-cn-zhangjiakou.aliyuncs.com' },
  { id: 'oss-cn-huhehaote', name: '华北5（呼和浩特）', endpoint: 'oss-cn-huhehaote.aliyuncs.com' },
  { id: 'oss-cn-wulanchabu', name: '华北6（乌兰察布）', endpoint: 'oss-cn-wulanchabu.aliyuncs.com' },
  { id: 'oss-cn-shenzhen', name: '华南1（深圳）', endpoint: 'oss-cn-shenzhen.aliyuncs.com' },
  { id: 'oss-cn-heyuan', name: '华南2（河源）', endpoint: 'oss-cn-heyuan.aliyuncs.com' },
  { id: 'oss-cn-guangzhou', name: '华南3（广州）', endpoint: 'oss-cn-guangzhou.aliyuncs.com' },
  { id: 'oss-cn-chengdu', name: '西南1（成都）', endpoint: 'oss-cn-chengdu.aliyuncs.com' },
  { id: 'oss-cn-hongkong', name: '中国（香港）', endpoint: 'oss-cn-hongkong.aliyuncs.com' },
  { id: 'oss-us-west-1', name: '美国（硅谷）', endpoint: 'oss-us-west-1.aliyuncs.com' },
  { id: 'oss-us-east-1', name: '美国（弗吉尼亚）', endpoint: 'oss-us-east-1.aliyuncs.com' },
  { id: 'oss-ap-southeast-1', name: '新加坡', endpoint: 'oss-ap-southeast-1.aliyuncs.com' },
  { id: 'oss-ap-northeast-1', name: '日本（东京）', endpoint: 'oss-ap-northeast-1.aliyuncs.com' },
  { id: 'oss-ap-southeast-2', name: '澳大利亚（悉尼）', endpoint: 'oss-ap-southeast-2.aliyuncs.com' },
  { id: 'oss-eu-west-1', name: '英国（伦敦）', endpoint: 'oss-eu-west-1.aliyuncs.com' },
  { id: 'oss-eu-central-1', name: '德国（法兰克福）', endpoint: 'oss-eu-central-1.aliyuncs.com' },
  { id: 'oss-me-east-1', name: '阿联酋（迪拜）', endpoint: 'oss-me-east-1.aliyuncs.com' },
]

const provider = {
  getMeta() {
    return {
      id: 'aliyun-oss',
      name: '阿里云 OSS',
      icon: 'aliyun',
      website: 'https://www.aliyun.com/product/oss',
      docsUrl: 'https://help.aliyun.com/zh/oss/',
      keyApplyUrl: 'https://ram.console.aliyun.com/manage/ak',
      keyApplyTip: '建议使用RAM子账号密钥，遵循最小权限原则',
      description: '阿里云对象存储服务',
      regions: ALIYUN_OSS_REGIONS,
      credentialFields: [
        { key: 'accessKeyId', label: 'AccessKey ID', type: 'text', placeholder: '请输入AccessKey ID', required: true },
        { key: 'accessKeySecret', label: 'AccessKey Secret', type: 'password', placeholder: '请输入AccessKey Secret', required: true },
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
      const endpoint = options.endpoint || credentials.endpoint || resolveEndpoint(region || 'oss-cn-hangzhou')
      const client = getOssClient(credentials, region, bucketName, endpoint)
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
    const endpoint = config.endpoint || credentials.endpoint || resolveEndpoint(region || 'oss-cn-hangzhou')
    const client = getOssClient(credentials, region, bucketName, endpoint)
    return getBucketAcl(client, bucketName)
  },

  async ensureBucketPublicRead(config) {
    const { credentials, region, bucketName } = config
    const endpoint = config.endpoint || credentials.endpoint || resolveEndpoint(region || 'oss-cn-hangzhou')
    const client = getOssClient(credentials, region, bucketName, endpoint)
    return ensureBucketPublicReadImpl(client, bucketName)
  },

  async testConnection(config) {
    try {
      const credentials = config.credentials
      const region = config.region
      const bucketName = config.bucketName
      const endpoint = config.endpoint || credentials?.endpoint || resolveEndpoint(region || 'oss-cn-hangzhou')

      if (!bucketName) {
        const result = await listBuckets(credentials, region, endpoint)
        if (!result.ok) {
          return { ok: false, error: result.error }
        }
        return { ok: true }
      }

      const client = getOssClient(credentials, region, bucketName, endpoint)
      try {
        await withNoProxyEnv(() => client.getBucketInfo(bucketName))
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
