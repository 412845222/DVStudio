export const slugSceneLayoutPlaceholderModelName = (
  value: unknown,
  fallback = 'placeholder-model'
) => {
  const raw = String(value ?? '').trim().toLowerCase()
  const slug = raw.replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '')
  return slug || fallback
}
