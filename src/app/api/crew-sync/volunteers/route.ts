import { NextRequest, NextResponse } from 'next/server';
import {
  getRequestUser,
  requireRole,
  unauthorizedResponse,
} from '@/lib/server/authGuard';
import { getDataMode, getStore } from '@/lib/server/store';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { VolunteerProfile } from '@/types/domain';

export async function POST(request: NextRequest) {
  const user = await getRequestUser(request);
  const roleError = requireRole(user, ['club_organizer', 'college_admin']);
  if (roleError || !user) return roleError ?? unauthorizedResponse();

  const body = (await request.json().catch(() => ({}))) as {
    eventId?: string;
    requiredSkills?: string[];
  };

  const requiredSkills =
    body.requiredSkills && body.requiredSkills.length > 0
      ? body.requiredSkills
      : ['Frontend', 'Hardware', 'Media'];

  const mode = getDataMode();
  let consented: VolunteerProfile[] = [];

  if (mode === 'supabase') {
    const supabase = await createServerSupabaseClient();
    if (!supabase) return unauthorizedResponse();

    const [{ data: profiles }, { data: directory }] = await Promise.all([
      supabase
        .from('volunteer_profiles')
        .select('*')
        .eq('consent_to_contact', true),
      supabase.from('user_directory').select('id, name, department, year'),
    ]);

    const dirMap = new Map(
      (directory ?? []).map((u) => [u.id, u])
    );

    consented = (profiles ?? []).map((vp) => {
      const person = dirMap.get(vp.user_id);
      return {
        id: vp.id,
        userId: vp.user_id,
        name: person?.name ?? 'Campus Volunteer',
        department: person?.department ?? 'General',
        year: person?.year ?? 2,
        skills: vp.skills ?? [],
        interests: vp.interests ?? [],
        availabilityWindows: Array.isArray(vp.availability)
          ? vp.availability.map(String)
          : [],
        consentToContact: Boolean(vp.consent_to_contact),
      };
    });
  } else {
    consented = getStore().volunteers.filter((v) => v.consentToContact);
  }

  const ranked = consented
    .map((v) => {
      const matchedSkills = v.skills.filter((s) =>
        requiredSkills.some(
          (req) =>
            s.toLowerCase().includes(req.toLowerCase()) ||
            req.toLowerCase().includes(s.toLowerCase())
        )
      );

      return {
        volunteerId: v.id,
        userId: v.userId,
        name: v.name,
        department: v.department,
        year: v.year,
        matchedSkills,
        availabilityWindows: v.availabilityWindows,
        score: matchedSkills.length,
        fitReason:
          matchedSkills.length > 0
            ? `Matches required role skill(s): ${matchedSkills.join(', ')} and has declared availability.`
            : 'Available during event window; general ops fit.',
      };
    })
    .filter((v) => v.score > 0)
    .sort((a, b) => b.score - a.score);

  if (mode === 'supabase' && ranked.length > 0 && body.eventId) {
    const supabase = await createServerSupabaseClient();
    if (supabase) {
      await supabase.from('ai_recommendations').insert({
        type: 'volunteer_match',
        event_id: body.eventId,
        title: `Matched ${ranked.length} volunteer candidate(s)`,
        summary: `Top match: ${ranked[0].name} (${ranked[0].matchedSkills.join(', ')})`,
        explanation: ranked[0].fitReason,
        payload: { candidates: ranked.slice(0, 5) },
        source_records: ranked.slice(0, 5).map((r) => r.volunteerId),
        confidence_score: 0.9,
        priority: 'medium',
        status: 'pending_review',
        created_by_agent: 'Volunteer & Club Health Agent',
      });
    }
  }

  return NextResponse.json({
    eventId: body.eventId ?? null,
    requiredSkills,
    candidates: ranked,
  });
}
