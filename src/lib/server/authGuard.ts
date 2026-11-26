import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getDataMode, getStore } from '@/lib/server/store';
import { UserProfile, UserRole } from '@/types/domain';

const VALID_ROLES: UserRole[] = [
  'student',
  'club_organizer',
  'judge',
  'college_admin',
];

export async function getRequestUser(
  request: NextRequest
): Promise<UserProfile | null> {
  const mode = getDataMode();

  if (mode === 'supabase') {
    const supabase = await createServerSupabaseClient();
    if (!supabase) return null;

    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    if (!authUser) return null;

    const { data: profile } = await supabase
      .from('users')
      .select('*')
      .eq('id', authUser.id)
      .single();

    if (!profile || !VALID_ROLES.includes(profile.role)) return null;
    return {
      id: profile.id,
      name: profile.name,
      email: profile.email,
      rollNumber: profile.roll_number ?? undefined,
      department: profile.department ?? 'General',
      year: profile.year ?? undefined,
      skills: profile.skills ?? [],
      interests: profile.interests ?? [],
      role: profile.role,
    };
  }

  return demoSessionUser(request);
}

export function demoSessionUser(request: NextRequest): UserProfile | null {
  const token = request.cookies.get('campus_session')?.value;
  if (!token) return null;
  const store = getStore();
  const digest = sessionDigest(token);
  const session = store.sessions.find(s => s.digest === digest && s.expires > Date.now());
  return session ? store.accounts.find(a => a.profile.id === session.userId)?.profile ?? null : null;
}

export function unauthorizedResponse(message = 'Authentication required') {
  return NextResponse.json({ error: message }, { status: 401 });
}

export function forbiddenResponse(
  message = 'You do not have permission to perform this action'
) {
  return NextResponse.json({ error: message }, { status: 403 });
}

export function requireRole(
  user: UserProfile | null,
  allowedRoles: UserRole[]
): NextResponse | null {
  if (!user) return unauthorizedResponse();
  if (!allowedRoles.includes(user.role)) {
    return forbiddenResponse(
      `Role "${user.role}" is not permitted. Required: ${allowedRoles.join(', ')}`
    );
  }
  return null;
}

export function canManageClub(user: UserProfile, clubId: string): boolean {
  if (user.role === 'college_admin') return true;
  if (user.role === 'club_organizer') {
    const store = getStore();
    const club = store.clubs.find((c) => c.id === clubId);
    if (club && club.ownerId === user.id) return true;
    return Boolean(user.managedClubIds?.includes(clubId));
  }
  return false;
}

export function sessionDigest(token: string) {
  return createHash('sha256').update(token).digest('hex');
}
