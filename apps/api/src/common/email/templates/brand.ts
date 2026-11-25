import { safeColor } from './shared';

export interface BrandConfig {
  brandName: string;
  logoUrl?: string | null;
  primaryColor: string;
  textColor: string;
  backgroundColor: string;
}

/** Same palette as apps/web/src/app/globals.css. Used for auth and as fallback. */
export const DEFAULT_BRAND: BrandConfig = {
  brandName: 'Eventos',
  primaryColor: '#b8431a',
  textColor: '#12141a',
  backgroundColor: '#f8f6f1',
};

export function resolveBrand(input?: Partial<BrandConfig> | null): BrandConfig {
  const name = typeof input?.brandName === 'string' ? input.brandName.trim().slice(0, 80) : '';
  return {
    brandName: name || DEFAULT_BRAND.brandName,
    logoUrl: input?.logoUrl ?? null,
    primaryColor: safeColor(input?.primaryColor, DEFAULT_BRAND.primaryColor),
    textColor: safeColor(input?.textColor, DEFAULT_BRAND.textColor),
    backgroundColor: safeColor(input?.backgroundColor, DEFAULT_BRAND.backgroundColor),
  };
}
