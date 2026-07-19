const providers = new Map()

const PROVIDER_ALIASES = {
  'tos': 'volcengine-tos',
  'http': 'custom-http',
  'volcano': 'volcengine-tos',
  'volcengine': 'volcengine-tos',
}

function resolveProviderId(id) {
  if (!id) return id
  if (providers.has(id)) return id
  const resolved = PROVIDER_ALIASES[id]
  return resolved || id
}

export function registerProvider(provider) {
  if (!provider || typeof provider.getMeta !== 'function') {
    throw new Error('Invalid provider: must implement getMeta()')
  }
  const meta = provider.getMeta()
  if (!meta || !meta.id) {
    throw new Error('Invalid provider meta: id is required')
  }
  if (providers.has(meta.id)) {
    throw new Error(`Provider already registered: ${meta.id}`)
  }
  providers.set(meta.id, provider)
}

export function getProvider(providerId) {
  const resolved = resolveProviderId(providerId)
  return providers.get(resolved) || null
}

export function listProviders() {
  return Array.from(providers.values()).map(p => p.getMeta())
}

export function hasProvider(providerId) {
  const resolved = resolveProviderId(providerId)
  return providers.has(resolved)
}

export function getResolvedProviderId(providerId) {
  return resolveProviderId(providerId)
}
