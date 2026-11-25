import { NextRequest, NextResponse } from 'next/server';
import {
  getRequestUser,
  requireRole,
  unauthorizedResponse,
} from '@/lib/server/authGuard';
import { generateId, getDataMode, getStore } from '@/lib/server/store';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Club } from '@/types/domain';

export async function GET(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return unauthorizedResponse();

  if (getDataMode() === 'supabase') {
    const supabase = await createServerSupabaseClient();
    if (supabase) {
      const { data, error } = await supabase.from('clubs').select('*').order('name');
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ clubs: data });
    }
  }

  return NextResponse.json({ clubs: getStore().clubs });
}

export async function POST(request: NextRequest) {
  const user = await getRequestUser(request);
  const roleError = requireRole(user, ['club_organizer', 'college_admin']);
  if (roleError || !user) return roleError ?? unauthorizedResponse();

  const body = (await request.json()) as Partial<Club>;
  if (!body.name?.trim() || !body.category?.trim()) {
    return NextResponse.json(
      { error: 'Club name and category are required.' },
      { status: 400 }
    );
  }

  const slug = body.name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

  const store = getStore();
  if (getDataMode() === 'supabase') {
    const supabase = await createServerSupabaseClient();
    if (!supabase) return unauthorizedResponse();

    const { data, error } = await supabase
      .from('clubs')
      .insert({
        name: body.name.trim(),
        slug,
        description: body.description?.trim() ?? '',
        category: body.category.trim(),
        interests: body.interests ?? [],
        capabilities: body.capabilities ?? [],
        status: user.role === 'college_admin' ? 'active' : 'pending',
        owner_id: user.id,
      })
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      {
        club: {
          id: data.id,
          name: data.name,
          slug: data.slug,
          description: data.description ?? '',
          category: data.category,
          interests: data.interests ?? [],
          capabilities: data.capabilities ?? [],
          status: data.status,
          ownerId: data.owner_id,
          memberCount: 1,
        },
      },
      { status: 201 }
    );
  }

  if (store.clubs.some((c) => c.slug === slug)) {
    return NextResponse.json(
      { error: 'A club with this name already exists.' },
      { status: 409 }
    );
  }

  const newClub: Club = {
    id: generateId('club'),
    name: body.name.trim(),
    slug,
    description: body.description?.trim() ?? '',
    category: body.category.trim(),
    interests: body.interests ?? [],
    capabilities: body.capabilities ?? [],
    status: user.role === 'college_admin' ? 'active' : 'pending',
    ownerId: user.id,
    memberCount: 1,
  };

  store.clubs.push(newClub);
  if (user.role === 'club_organizer') {
    user.managedClubIds = [...(user.managedClubIds ?? []), newClub.id];
  }

  return NextResponse.json({ club: newClub }, { status: 201 });
}
