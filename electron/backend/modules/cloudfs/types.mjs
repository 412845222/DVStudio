export const CLOUD_FS_CHANNELS = Object.freeze({
  LIST_PROVIDERS: 'dweb:cloudfs:list-providers',
  GET_ACTIVE_CONFIG: 'dweb:cloudfs:get-active-config',
  GET_CONFIG_STATUS: 'dweb:cloudfs:get-config-status',
  SAVE_CONFIG: 'dweb:cloudfs:save-config',
  CLEAR_CONFIG: 'dweb:cloudfs:clear-config',
  TEST_CONFIG: 'dweb:cloudfs:test-config',
  VALIDATE_CREDENTIALS: 'dweb:cloudfs:validate-credentials',
  SETUP_BUCKET: 'dweb:cloudfs:setup-bucket',
  LIST_BUCKETS: 'dweb:cloudfs:list-buckets',
  CREATE_BUCKET: 'dweb:cloudfs:create-bucket',
  CREATE_FOLDER: 'dweb:cloudfs:create-folder',
  UPDATE_BUCKET: 'dweb:cloudfs:update-bucket',
  LIST_FILES: 'dweb:cloudfs:list-files',
  UPLOAD_FILE: 'dweb:cloudfs:upload-file',
  DELETE_FILE: 'dweb:cloudfs:delete-file',
  GET_PUBLIC_URL: 'dweb:cloudfs:get-public-url',
  UPLOAD_TO_PUBLIC_URL: 'dweb:cloudfs:upload-to-public-url',
  LIST_CONFIGURED_BUCKETS: 'dweb:cloudfs:list-configured-buckets',
  ADD_BUCKET_FROM_CLOUD: 'dweb:cloudfs:add-bucket-from-cloud',
  REMOVE_CONFIGURED_BUCKET: 'dweb:cloudfs:remove-configured-bucket',
  SWITCH_ACTIVE_BUCKET: 'dweb:cloudfs:switch-active-bucket',
  FIX_BUCKET_ACL: 'dweb:cloudfs:fix-bucket-acl',
})

export function createCloudFileItem(partial) {
  return {
    key: '',
    name: '',
    isFolder: false,
    size: 0,
    contentType: '',
    lastModified: 0,
    etag: '',
    publicUrl: '',
    thumbnailUrl: '',
    ...partial,
  }
}

export function createCloudListResult(partial) {
  return {
    items: [],
    prefixes: [],
    nextMarker: undefined,
    isTruncated: false,
    ...partial,
  }
}

export function createCloudUploadResult(partial) {
  return {
    ok: false,
    error: '',
    key: '',
    publicUrl: '',
    size: 0,
    etag: '',
    ...partial,
  }
}

export function createCloudValidationResult(partial) {
  return {
    ok: false,
    error: '',
    buckets: [],
    ...partial,
  }
}

export function createCloudBucketSetupResult(partial) {
  return {
    ok: false,
    error: '',
    bucketName: '',
    endpoint: '',
    publicUrlBase: '',
    ...partial,
  }
}

export function createCloudFolderResult(partial) {
  return {
    ok: false,
    error: '',
    key: '',
    ...partial,
  }
}

export function createCloudListBucketsResult(partial) {
  return {
    ok: false,
    error: '',
    buckets: [],
    ...partial,
  }
}
