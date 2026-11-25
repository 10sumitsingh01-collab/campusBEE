import { NextRequest, NextResponse } from 'next/server';
import { ROLE_PERMISSIONS } from '@/lib/auth/roles';
import { getRequestUser, unauthorizedResponse } from '@/lib/server/authGuard';
import { getDataMode, getStore } from '@/lib/server/store';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return unauthorizedResponse();

  return NextResponse.json({
    mode: getDataMode(),
    user,
    permissions: ROLE_PERMISSIONS[user.role],
  });
}

export async function PATCH(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return unauthorizedResponse();

  const body = (await request.json()) as {
    name?: string;
    department?: string;
    year?: number | null;
    rollNumber?: string | null;
    skills?: string[];
    interests?: string[];
  };

  const name = body.name?.trim() || user.name;
  const department = body.department?.trim() || user.department;
  const year = body.year ?? user.year;
  const rollNumber =
    body.rollNumber !== undefined
      ? body.rollNumber?.trim() || undefined
      : user.rollNumber;
  const skills = Array.isArray(body.skills) ? body.skills : user.skills;
  const interests = Array.isArray(body.interests)
    ? body.interests
    : user.interests;

  if (getDataMode() === 'supabase') {
    const supabase = await createServerSupabaseClient();
    if (!supabase) return unauthorizedResponse();

    // Update public.users (email and role are intentionally excluded)
    const { error } = await supabase
      .from('users')
      .upsert(
        {
          id: user.id,
          name,
          email: user.email,
          department,
          year: year ?? null,
          roll_number: rollNumber ?? null,
          skills,
          interests,
          role: user.role,
        },
        { onConflict: 'id' }
      );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    await supabase.auth.updateUser({
      data: { name, department },
    });

    return NextResponse.json({
      user: {
        ...user,
        name,
        department,
        year,
        rollNumber,
        skills,
        interests,
      },
    });
  }

  const store = getStore();
  const updated = {
    ...store.users[user.role],
    name,
    department,
    year,
    rollNumber,
    skills,
    interests,
  };
  store.users[user.role] = updated;

  return NextResponse.json({ user: updated });
}
