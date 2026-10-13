/** Nigeria Government Revenue System — product brand constants */
export const BRAND = {
  shortName: 'NGRS',
  name: 'Nigeria Government Revenue System',
  product: 'Government Revenue',
  tagline: 'Federal revenue collection & treasury operations',
  consoleLabel: 'Revenue console',
} as const;

/** Soften legacy Customs/NCS names returned by seeded tenants */
export function displayAgencyName(name?: string | null, fallback = BRAND.name) {
  if (!name?.trim()) return fallback;
  if (/customs/i.test(name) || /^ncs$/i.test(name.trim())) return BRAND.name;
  return name;
}

export function displayAgencyCode(code?: string | null, fallback = BRAND.shortName) {
  if (!code?.trim()) return fallback;
  if (/^ncs$/i.test(code.trim())) return BRAND.shortName;
  return code;
}
