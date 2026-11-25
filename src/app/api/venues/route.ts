import { NextRequest, NextResponse } from 'next/server';
import {
  getRequestUser,
  requireRole,
  unauthorizedResponse,
} from '@/lib/server/authGuard';
import { generateId, getDataMode, getStore } from '@/lib/server/store';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Venue } from '@/types/domain';

export async function GET(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return unauthorizedResponse();

  if (getDataMode() === 'supabase') {
    const supabase = await createServerSupabaseClient();
    if (supabase) {
      const { data, error } = await supabase.from('venues').select('*').order('name');
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ venues: data });
    }
  }

  return NextResponse.json({ venues: getStore().venues });
}

export async function POST(request: NextRequest) {
  const user = await getRequestUser(request);
  const roleError = requireRole(user, ['college_admin']);
  if (roleError || !user) return roleError ?? unauthorizedResponse();

  const body = (await request.json()) as Partial<Venue>;
  if (!body.name?.trim() || !body.building?.trim() || !body.capacity || body.capacity <= 0) {
    return NextResponse.json(
      { error: 'Venue name, building, and positive capacity are required.' },
      { status: 400 }
    );
  }

  const store = getStore();
  const newVenue: Venue = {
    id: generateId('venue'),
    name: body.name.trim(),
    building: body.building.trim(),
    capacity: body.capacity,
    equipment: body.equipment ?? [],
  };

  store.venues.push(newVenue);
  return NextResponse.json({ venue: newVenue }, { status: 201 });
}
