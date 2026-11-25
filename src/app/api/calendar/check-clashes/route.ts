import { NextRequest, NextResponse } from 'next/server';
import {
  checkCandidateEventClashes,
  detectAudienceClashes,
  detectVenueClashes,
} from '@/lib/coordination/clashCheck';
import { getRequestUser, unauthorizedResponse } from '@/lib/server/authGuard';
import { getStore } from '@/lib/server/store';
import { CampusEvent } from '@/types/domain';

export async function GET(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return unauthorizedResponse();

  const store = getStore();
  const venueClashes = detectVenueClashes(store.events, store.venues);
  const audienceClashes = detectAudienceClashes(store.events);

  return NextResponse.json({ venueClashes, audienceClashes });
}

export async function POST(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return unauthorizedResponse();

  const candidate = (await request.json()) as CampusEvent;
  if (!candidate.venueId || !candidate.startTime || !candidate.endTime) {
    return NextResponse.json(
      { error: 'venueId, startTime, and endTime are required.' },
      { status: 400 }
    );
  }

  const store = getStore();
  const clashes = checkCandidateEventClashes(
    { ...candidate, status: candidate.status ?? 'published' },
    store.events,
    store.venues
  );

  return NextResponse.json({ clashes });
}
