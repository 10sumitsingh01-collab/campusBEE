import { CampusEvent, Team, TeamInvite, UserProfile } from '@/types/domain';

let idCounter = 100;
export function nextClientId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

export interface EligibilityCheck {
  eligible: boolean;
  reason?: string;
}

export function checkStudentEligibility(
  student: UserProfile,
  event: CampusEvent,
  now: Date = new Date()
): EligibilityCheck {
  if (now.getTime() > new Date(event.registrationDeadline).getTime()) {
    return {
      eligible: false,
      reason: 'Registration deadline has passed for this event.',
    };
  }

  const deptAllowed =
    event.eligibilityDepartments.includes('All Departments') ||
    event.eligibilityDepartments.includes(student.department);

  if (!deptAllowed) {
    return {
      eligible: false,
      reason: `Restricted to ${event.eligibilityDepartments.join(', ')}.`,
    };
  }

  if (
    student.year !== undefined &&
    event.eligibilityYears.length > 0 &&
    !event.eligibilityYears.includes(student.year)
  ) {
    return {
      eligible: false,
      reason: `Eligible years: ${event.eligibilityYears.join(', ')}.`,
    };
  }

  return { eligible: true };
}

export function canLockTeam(
  team: Team,
  event: CampusEvent
): { ok: boolean; reason?: string } {
  const count = team.members.length;
  if (count < event.minTeamSize) {
    return {
      ok: false,
      reason: `Need at least ${event.minTeamSize} members to lock (currently ${count}).`,
    };
  }
  if (count > event.maxTeamSize) {
    return {
      ok: false,
      reason: `Maximum ${event.maxTeamSize} members allowed (currently ${count}).`,
    };
  }
  return { ok: true };
}

/**
 * Enforces: A student can be an accepted member of only one team per event.
 * Accepting one invite automatically cancels other pending invites for that event.
 */
export function acceptTeamInvite(
  inviteId: string,
  student: UserProfile,
  teams: Team[],
  invites: TeamInvite[]
): { teams: Team[]; invites: TeamInvite[]; error?: string } {
  const target = invites.find((i) => i.id === inviteId);
  if (!target || target.status !== 'pending') {
    return { teams, invites, error: 'Invite is no longer pending.' };
  }

  if (new Date(target.expiresAt).getTime() < Date.now()) {
    return {
      teams,
      invites: invites.map((i) =>
        i.id === inviteId ? { ...i, status: 'cancelled' } : i
      ),
      error: 'Invite has expired.',
    };
  }

  const alreadyInEventTeam = teams.some(
    (t) =>
      t.eventId === target.eventId &&
      t.members.some((m) => m.userId === student.id)
  );
  if (alreadyInEventTeam) {
    return {
      teams,
      invites,
      error: 'You are already a member of a team for this event.',
    };
  }

  const updatedTeams = teams.map((t) =>
    t.id === target.teamId
      ? {
          ...t,
          members: [
            ...t.members,
            {
              userId: student.id,
              name: student.name,
              email: student.email,
              role: 'member' as const,
            },
          ],
        }
      : t
  );

  // First accepted membership wins; cancel other pending invites for same event
  const updatedInvites = invites.map((i) => {
    if (i.id === inviteId) return { ...i, status: 'accepted' as const };
    if (
      i.eventId === target.eventId &&
      i.invitedEmail.toLowerCase() === student.email.toLowerCase() &&
      i.status === 'pending'
    ) {
      return { ...i, status: 'cancelled' as const };
    }
    return i;
  });

  return { teams: updatedTeams, invites: updatedInvites };
}
