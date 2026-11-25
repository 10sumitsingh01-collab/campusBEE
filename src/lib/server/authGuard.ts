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

    const meta = authUser.user_metadata as
      | { name?: string; department?: string; role?: UserRole }
      | undefined;

    if (!profile) {
      const fallbackRole =
        meta?.role && VALID_ROLES.includes(meta.role) ? meta.role : 'student';
      return {
        id: authUser.id,
        name: meta?.name ?? authUser.email?.split('@')[0] ?? 'Campus User',
        email: authUser.email ?? '',
        department: meta?.department ?? 'General',
        skills: [],
        interests: [],
        role: fallbackRole,
      };
    }

    const dbRole = profile.role as UserRole;
    const resolvedDbRole =
      dbRole === 'student' &&
      meta?.role &&
      VALID_ROLES.includes(meta.role)
        ? meta.role
        : dbRole;

    return {
      id: profile.id,
      name: profile.name,
      email: profile.email,
      rollNumber: profile.roll_number ?? undefined,
      department: profile.department ?? 'General',
      year: profile.year ?? undefined,
      skills: profile.skills ?? [],
      interests: profile.interests ?? [],
      role: resolvedDbRole,
    };
  }

  // Local seed mode: allow testing any role via x-demo-role header
  const headerRole = request.headers.get('x-demo-role') as UserRole | null;
  const resolvedRole: UserRole =
    headerRole && VALID_ROLES.includes(headerRole)
      ? headerRole
      : 'club_organizer';

  return getStore().users[resolvedRole];
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
