import { NextRequest, NextResponse } from 'next/server';
import {
  canManageClub,
  forbiddenResponse,
  getRequestUser,
  unauthorizedResponse,
} from '@/lib/server/authGuard';
import { getStore } from '@/lib/server/store';
import { Club } from '@/types/domain';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getRequestUser(request);
  if (!user) return unauthorizedResponse();

  const { id } = await context.params;
  const store = getStore();
  const club = store.clubs.find((c) => c.id === id);
  if (!club) {
    return NextResponse.json({ error: 'Club not found' }, { status: 404 });
  }

  const canManage = canManageClub(user, id);
  const events = store.events.filter(
    (e) =>
      e.clubId === id &&
      (e.status !== 'draft' || canManage)
  );
  const metrics = store.clubMetrics.filter((m) => m.clubId === id);

  return NextResponse.json({ club, events, metrics });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getRequestUser(request);
  if (!user) return unauthorizedResponse();

  const { id } = await context.params;
  if (!canManageClub(user, id)) {
    return forbiddenResponse(
      'Only this club’s organizer or a college admin can update this club.'
    );
  }

  const store = getStore();
  const idx = store.clubs.findIndex((c) => c.id === id);
  if (idx === -1) {
    return NextResponse.json({ error: 'Club not found' }, { status: 404 });
  }

  const body = (await request.json()) as Partial<Club>;
  const existing = store.clubs[idx];

  store.clubs[idx] = {
    ...existing,
    description: body.description ?? existing.description,
    category: body.category ?? existing.category,
    interests: body.interests ?? existing.interests,
    capabilities: body.capabilities ?? existing.capabilities,
    status:
      user.role === 'college_admin' && body.status
        ? body.status
        : existing.status,
  };

  return NextResponse.json({ club: store.clubs[idx] });
}
