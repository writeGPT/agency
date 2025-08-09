// src/lib/session.ts
import { cookies as nextCookies } from 'next/headers';
import { getIronSession, type SessionOptions, type IronSession } from 'iron-session';

export type SessionData = {
  user?: { id: string; email: string; name?: string | null } | null;
};

export const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET || 'complex_password_at_least_32_characters_long',
  cookieName: 'ai-reporting-session',
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
  },
};

// Handle both sync and (some envs) async cookies() typings
export async function getSession(): Promise<IronSession<SessionData>> {
  const store = await Promise.resolve(nextCookies() as any);
  return getIronSession<SessionData>(store, sessionOptions);
}