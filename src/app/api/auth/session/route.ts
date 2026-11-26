import { randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { NextRequest, NextResponse } from 'next/server';
import { getDataMode, getStore, saveDemoStore } from '@/lib/server/store';
import { sessionDigest } from '@/lib/server/authGuard';
import type { UserProfile } from '@/types/domain';

const derive = promisify(scrypt);
const lifetime = 7 * 24 * 60 * 60;
const failure = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function POST(request: NextRequest) {
  if (getDataMode() !== 'local_seed') return failure('Use campus single sign-in.', 404);
  if (!request.headers.get('content-type')?.startsWith('application/json')) return failure('JSON body required.', 415);
  const input = await request.json().catch(() => null);
  const email = typeof input?.email === 'string' ? input.email.trim().toLowerCase() : '';
  const password = input?.password;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 ||
      typeof password !== 'string' || password.length < 8 || password.length > 256) {
    return failure('Enter a valid email and a password between 8 and 256 characters.', 400);
  }
  const store = getStore();
  const signup = input.mode === 'signup';
  if (!signup && input.mode !== 'signin') return failure('Invalid account action.', 400);
  let account = store.accounts.find(a => a.profile.email === email);
  const salt = signup ? randomBytes(16).toString('hex') : account?.salt ?? 'unregistered-account';
  const hash = await derive(password, salt, 64) as Buffer;
  if (signup) {
    const { role } = input;
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    const club = typeof input.clubName === 'string' ? input.clubName.trim() : '';
    if (!['student','club_organizer','judge','college_admin'].includes(role) || !name) return failure('Choose a role and enter your name.', 400);
    if (role === 'club_organizer' && !club) return failure('Enter the name of your club.', 400);
    if (store.accounts.some(a => a.profile.email === email)) return failure('An account already uses this email. Sign in to continue.', 409);
    const profile: UserProfile = { id: randomUUID(), email, name, role, department: String(input.department || 'General'), skills: [], interests: [] };
    if (role === 'club_organizer') {
      if (store.clubs.some(c => c.name.toLowerCase() === club.toLowerCase())) return failure('This club already exists. Choose a unique club name.', 409);
      const id = randomUUID();
      store.clubs.push({ id, name: club, slug: id, ownerId: profile.id, category: 'Student organization', description: '', interests: [], capabilities: [], memberCount: 1, status: 'active' });
      profile.managedClubIds = [id];
    }
    account = { profile, salt, passwordHash: hash.toString('hex') };
    store.accounts.push(account);
  } else if (!account || !timingSafeEqual(hash, Buffer.from(account.passwordHash, 'hex'))) {
    return failure('Email or password is incorrect.', 401);
  }
  const token = randomBytes(32).toString('hex');
  store.sessions = store.sessions.filter(s => s.expires > Date.now() && s.digest !== sessionDigest(request.cookies.get('campus_session')?.value ?? ''));
  store.sessions.push({ digest: sessionDigest(token), userId: account.profile.id, expires: Date.now() + lifetime * 1000 });
  saveDemoStore(store);
  const response = NextResponse.json({ user: account.profile }, { status: signup ? 201 : 200 });
  response.cookies.set('campus_session', token, { httpOnly: true, sameSite: 'lax', path: '/', secure: request.nextUrl.protocol === 'https:', maxAge: lifetime });
  return response;
}

export async function DELETE(request: NextRequest) {
  if (getDataMode() !== 'local_seed') return failure('Use campus single sign-in.', 404);
  const digest = sessionDigest(request.cookies.get('campus_session')?.value ?? '');
  const store = getStore();
  store.sessions = store.sessions.filter(s => s.digest !== digest);
  saveDemoStore(store);
  const response = NextResponse.json({ signedOut: true });
  response.cookies.delete('campus_session');
  return response;
}
