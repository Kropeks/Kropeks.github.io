const CACHE_KEY = 'fitsavory_subscription_status_v1'
const DEFAULT_TTL = 15000

const supportsSessionStorage = () => {
  try {
    if (typeof window === 'undefined') return false
    if (!window.sessionStorage) return false
    return true
  } catch {
    return false
  }
}

export const getCachedSubscriptionStatus = () => {
  if (!supportsSessionStorage()) return null
  try {
    const raw = window.sessionStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    if (typeof parsed.expiresAt === 'number' && parsed.expiresAt <= Date.now()) {
      window.sessionStorage.removeItem(CACHE_KEY)
      return null
    }
    return parsed.data ?? null
  } catch {
    return null
  }
}

export const setCachedSubscriptionStatus = (data, ttl = DEFAULT_TTL) => {
  if (!supportsSessionStorage()) return
  try {
    const duration = Number(ttl)
    const expiresAt = Date.now() + (Number.isFinite(duration) ? Math.max(0, duration) : DEFAULT_TTL)
    window.sessionStorage.setItem(CACHE_KEY, JSON.stringify({ expiresAt, data }))
  } catch {}
}

export const clearCachedSubscriptionStatus = () => {
  if (!supportsSessionStorage()) return
  try {
    window.sessionStorage.removeItem(CACHE_KEY)
  } catch {}
}

export const resolveFitSavoryAccess = (data) => {
  if (!data) return false
  const planName = data?.plan?.name?.toString().toLowerCase()
  const planFeatures = Array.isArray(data?.plan?.features) ? data.plan.features.map((feature) => feature?.toString().toLowerCase()) : []
  const hasPremiumPlan = planName?.includes('premium')
  const hasFitSavoryFeature = planFeatures.some((feature) => feature?.includes('fitsavory'))
  const statusLabel = data?.status?.toString().toLowerCase()
  const hasSubscription = data?.hasSubscription === true
  return hasPremiumPlan || hasFitSavoryFeature || statusLabel === 'active' || hasSubscription
}
