export type AllowedOriginConfiguration = {
  allowedOrigins: readonly string[]
  valid: boolean
}

export type AllowedOriginOptions = {
  requireHttps?: boolean
}

const asExactOrigin = (value: string, options: AllowedOriginOptions): string | null => {
  try {
    const parsed = new URL(value)
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:")
      || (options.requireHttps === true && parsed.protocol !== "https:")
      || parsed.username
      || parsed.password
      || parsed.hostname.includes("*")
      || parsed.pathname !== "/"
      || parsed.search
      || parsed.hash
      || parsed.origin !== value
    ) {
      return null
    }
    return parsed.origin
  } catch {
    return null
  }
}

/**
 * Parse the deployment-owned ALLOWED_ORIGINS setting. Entries must be canonical
 * origins, rather than URL prefixes, so neither CORS nor Auth redirects can be
 * widened by a path, wildcard, or credential-bearing URL.
 */
export const parseAllowedOrigins = (rawValue: string | undefined, options: AllowedOriginOptions = {}): AllowedOriginConfiguration => {
  const values = (rawValue ?? "").split(",").map((value) => value.trim()).filter(Boolean)
  if (!values.length) return { allowedOrigins: [], valid: false }

  const parsed = values.map((value) => asExactOrigin(value, options))
  if (parsed.some((origin) => origin === null)) return { allowedOrigins: [], valid: false }

  return { allowedOrigins: [...new Set(parsed as string[])], valid: true }
}

export const isAllowedOrigin = (origin: string | null, allowedOrigins: readonly string[] = []) =>
  origin !== null && allowedOrigins.includes(origin)

/**
 * A supplied redirect is safe only when its actual URL origin is a configured
 * exact origin. Returning a canonical URL avoids recording or forwarding the
 * original, potentially deceptive representation.
 */
export const resolveAllowedRedirect = (value: unknown, allowedOrigins: readonly string[]): string | null | undefined => {
  if (value === undefined) return undefined
  if (typeof value !== "string" || !value || value.length > 2_048) return null

  try {
    const parsed = new URL(value)
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:")
      || parsed.username
      || parsed.password
      || !allowedOrigins.includes(parsed.origin)
    ) {
      return null
    }
    return parsed.toString()
  } catch {
    return null
  }
}
