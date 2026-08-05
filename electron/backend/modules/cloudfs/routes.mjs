import { CLOUD_FS_CHANNELS } from './types.mjs'
import * as handlers from './handlers.mjs'

export const routes = [
	{ channel: CLOUD_FS_CHANNELS.LIST_PROVIDERS, handler: handlers.listProviders },
	{ channel: CLOUD_FS_CHANNELS.GET_ACTIVE_CONFIG, handler: handlers.getActiveConfig },
	{ channel: CLOUD_FS_CHANNELS.GET_CONFIG_STATUS, handler: handlers.getConfigStatus },
	{ channel: CLOUD_FS_CHANNELS.SAVE_CONFIG, handler: handlers.saveConfig },
	{ channel: CLOUD_FS_CHANNELS.CLEAR_CONFIG, handler: handlers.clearConfig },
	{ channel: CLOUD_FS_CHANNELS.TEST_CONFIG, handler: handlers.testConfig },
	{ channel: CLOUD_FS_CHANNELS.VALIDATE_CREDENTIALS, handler: handlers.validateCredentials },
	{ channel: CLOUD_FS_CHANNELS.SETUP_BUCKET, handler: handlers.setupBucket },
	{ channel: CLOUD_FS_CHANNELS.LIST_BUCKETS, handler: handlers.listBuckets },
	{ channel: CLOUD_FS_CHANNELS.CREATE_BUCKET, handler: handlers.createBucket },
	{ channel: CLOUD_FS_CHANNELS.CREATE_FOLDER, handler: handlers.createFolder },
	{ channel: CLOUD_FS_CHANNELS.UPDATE_BUCKET, handler: handlers.updateBucket },
	{ channel: CLOUD_FS_CHANNELS.LIST_FILES, handler: handlers.listFiles },
	{ channel: CLOUD_FS_CHANNELS.UPLOAD_FILE, handler: handlers.uploadFile },
	{ channel: CLOUD_FS_CHANNELS.DELETE_FILE, handler: handlers.deleteFile },
	{ channel: CLOUD_FS_CHANNELS.GET_PUBLIC_URL, handler: handlers.getPublicUrl },
	{ channel: CLOUD_FS_CHANNELS.UPLOAD_TO_PUBLIC_URL, handler: handlers.uploadToPublicUrl },
	{ channel: CLOUD_FS_CHANNELS.LIST_CONFIGURED_BUCKETS, handler: handlers.listConfiguredBuckets },
	{ channel: CLOUD_FS_CHANNELS.ADD_BUCKET_FROM_CLOUD, handler: handlers.addBucketFromCloud },
	{ channel: CLOUD_FS_CHANNELS.REMOVE_CONFIGURED_BUCKET, handler: handlers.removeConfiguredBucket },
	{ channel: CLOUD_FS_CHANNELS.SWITCH_ACTIVE_BUCKET, handler: handlers.switchActiveBucket },
	{ channel: CLOUD_FS_CHANNELS.FIX_BUCKET_ACL, handler: handlers.fixBucketAcl }
]
