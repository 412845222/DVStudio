import * as handlers from './handlers.mjs'

export const routes = [
  { channel: 'dweb:project-assets:health',        handler: handlers.health },
  { channel: 'dweb:project-assets:upload',        handler: handlers.uploadAsset },
  { channel: 'dweb:project-assets:import',        handler: handlers.importAsset },
  { channel: 'dweb:project-assets:delete',        handler: handlers.deleteAsset },
  { channel: 'dweb:project-assets:resolve',       handler: handlers.resolveAsset },
  { channel: 'dweb:project-assets:repair',        handler: handlers.repairAsset },
  { channel: 'dweb:project-assets:repair-all',    handler: handlers.repairAllAssets },
  { channel: 'dweb:project-assets:register-root', handler: handlers.registerRoot },
  { channel: 'dweb:project-assets:clear-root',    handler: handlers.clearRoot },
  { channel: 'dweb:project-assets:validate-root', handler: handlers.validateRoot },
  { channel: 'dweb:project-assets:root-snapshot', handler: handlers.getRootSnapshot },
  { channel: 'dweb:project-assets:diagnose',      handler: handlers.diagnose },
  { channel: 'dweb:project-assets:access-logs',   handler: handlers.getAccessLogs },
]
