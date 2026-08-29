import type { NextRequest, NextResponse } from 'next/server';
import { ATLAS_REFERRAL_CONFIG } from '@/app/lib/atlas-referral-config';
import { normalizeReferralCode } from '@/app/lib/atlas-referral-utils';

export const ATLAS_REFERRAL_COOKIE = ATLAS_REFERRAL_CONFIG.pendingCodeStorageKey;

export function referralCookieOptions(): {
  path: string;
  maxAge: number;
  sameSite: 'lax';
  httpOnly: boolean;
  secure: boolean;
} {
  return {
    path: '/',
    maxAge: ATLAS_REFERRAL_CONFIG.cookieMaxAgeSec,
    sameSite: 'lax',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
  };
}

export function readReferralCodeFromCookieHeader(value: string | undefined | null): string {
  return normalizeReferralCode(value);
}

export function applyReferralCookieFromRequest(request: NextRequest, response: NextResponse): void {
  try {
    const code = normalizeReferralCode(request.nextUrl.searchParams.get('ref'));
    if (!code) return;
    response.cookies.set(ATLAS_REFERRAL_COOKIE, code, referralCookieOptions());
  } catch (error) {
    console.warn('[referral] cookie stamp failed', error instanceof Error ? error.message : error);
  }
}

export function clearReferralCookie(response: NextResponse): void {
  try {
    response.cookies.set(ATLAS_REFERRAL_COOKIE, '', { ...referralCookieOptions(), maxAge: 0 });
  } catch {
    // non-blocking
  }
}
