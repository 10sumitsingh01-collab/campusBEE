'use client';

import React, { useState } from 'react';
import {
  CheckCircle2,
  Lock,
  Mail,
  Plus,
  UserPlus,
  Users,
  XCircle,
} from 'lucide-react';
import {
  acceptTeamInvite,
  canLockTeam,
} from '@/lib/registration/teamRules';
import {
  CampusEvent,
  Team,
  TeamInvite,
  UserProfile,
} from '@/types/domain';

interface TeamsRegistrationViewProps {
  initialEventId?: string;
  initialRole: 'contestant'|'volunteer';
  onRegistered: () => void;
  student: UserProfile;
  events: CampusEvent[];
  teams: Team[];
  invites: TeamInvite[];
  onUpdateTeams: (teams: Team[]) => void;
  onUpdateInvites: (invites: TeamInvite[]) => void;
  onOpenTickets?: () => void;
}

export default function TeamsRegistrationView({
  initialEventId, initialRole, onRegistered,
  student,
  events,
  teams,
  invites,
  onUpdateTeams,
  onUpdateInvites,
  onOpenTickets,
}: TeamsRegistrationViewProps) {
  const [selectedEventId, setSelectedEventId] = useState(events.find(event => event.id === initialEventId)?.id ?? events[0]?.id ?? '');
  const [eventRole,setEventRole] = useState(initialRole);
  const [newTeamName, setNewTeamName] = useState('');
  const [phone, setPhone] = useState('');
  const [college, setCollege] = useState('Campus Institute of Technology');
  const [trackNote, setTrackNote] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [generatedTicketCode, setGeneratedTicketCode] = useState<string | null>(
    null
  );

  const myTeams = teams.filter((t) =>
    t.members.some((m) => m.userId === student.id)
  );

  const myInvites = invites.filter(
    (i) => i.invitedEmail.toLowerCase() === student.email.toLowerCase()
  );

  const getEvent = (eventId: string) => events.find((e) => e.id === eventId);

  const handleRegisterOrCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setGeneratedTicketCode(null);

    const event = getEvent(selectedEventId);
    if (!event) return;

    const res = await fetch(`/api/events/${event.id}/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-demo-role': 'student',
      },
      body: JSON.stringify({
        eventRole, teamName: newTeamName.trim(),
        attendeeName: student.name,
        attendeeEmail: student.email,
        phone: phone.trim(),
        college: college.trim(),
        customFields: trackNote.trim() ? { track: trackNote.trim() } : {},
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setFeedback(data.error ?? 'Registration failed.');
      return;
    }

    if (data.team) onUpdateTeams([...teams, data.team]);
    onRegistered();
    setNewTeamName('');
    setGeneratedTicketCode(data.ticket?.ticketCode ?? null);
    setFeedback(
      data.ticket?.ticketCode
        ? `Registered for ${event.title}! QR Pass ${data.ticket.ticketCode} generated.`
        : `Registered for ${event.title}.`
    );
  };

  const handleAcceptInvite = async (inviteId: string) => {
    const res = await fetch(`/api/invites/${inviteId}/respond`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-demo-role': 'student',
      },
      body: JSON.stringify({ action: 'accept' }),
    });
    const data = await res.json();
    if (!res.ok) {
      setFeedback(data.error ?? 'Failed to accept invite.');
      return;
    }
    const localRes = acceptTeamInvite(inviteId, student, teams, invites);
    onUpdateTeams(data.teams ?? localRes.teams);
    onUpdateInvites(data.invites ?? localRes.invites);
    setFeedback(
      'Invite accepted! Any competing invites for the same event were cancelled.'
    );
  };

  const handleDeclineInvite = async (inviteId: string) => {
    const res = await fetch(`/api/invites/${inviteId}/respond`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-demo-role': 'student',
      },
      body: JSON.stringify({ action: 'decline' }),
    });
    if (res.ok) {
      onUpdateInvites(
        invites.map((i) =>
          i.id === inviteId ? { ...i, status: 'declined' } : i
        )
      );
    }
  };

  const handleSendInvite = async (team: Team) => {
    if (!inviteEmail.trim()) return;
    const res = await fetch(`/api/teams/${team.id}/invites`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-demo-role': 'student',
      },
      body: JSON.stringify({ email: inviteEmail.trim() }),
    });
    const data = await res.json();
    if (!res.ok) {
      setFeedback(data.error ?? 'Failed to send invite.');
      return;
    }

    onUpdateInvites([...invites, data.invite]);
    setInviteEmail('');
    setFeedback(`Invite sent to ${data.invite.invitedEmail}.`);
  };

  const handleLockTeam = async (team: Team) => {
    const res = await fetch(`/api/teams/${team.id}/lock`, {
      method: 'POST',
      headers: { 'x-demo-role': 'student' },
    });
    const data = await res.json();
    if (!res.ok) {
      setFeedback(data.error ?? 'Cannot lock team.');
      return;
    }

    onUpdateTeams(
      teams.map((t) => (t.id === team.id ? data.team : t))
    );
    setFeedback(`Team "${team.name}" is now locked and confirmed!`);
  };

  const selectedEvent = getEvent(selectedEventId);

  return (
    <div className="work-page py-10 max-w-5xl mx-auto px-6 space-y-8">
      <div className="space-y-1">
        <h1 className="text-3xl font-semibold text-[#4D4D4D]">
          My Teams & Registrations
        </h1>
        <p className="text-sm text-[#717171]">
          Register solo or form teams, manage invites, and lock your roster
          before deadlines
        </p>
      </div>

      {feedback && (
        <div className="rounded-lg bg-action-tint border border-action/30 px-4 py-3 text-xs font-medium text-[#263238] flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-action shrink-0" />
            <span>{feedback}</span>
          </span>
          {generatedTicketCode && onOpenTickets && (
            <button
              type="button"
              onClick={onOpenTickets}
              className="px-3 py-1 rounded bg-action text-white text-xs font-semibold cursor-pointer"
            >
              View My Ticket →
            </button>
          )}
        </div>
      )}

      {/* Register Solo / Create Team + Generate QR Pass */}
      <form
        onSubmit={handleRegisterOrCreateTeam}
        className="bg-white border border-gray-200 rounded-lg p-6 space-y-4"
      >
        <h2 className="text-base font-semibold text-[#4D4D4D] flex items-center gap-2">
          <Plus className="h-4 w-4 text-action" />
          Register & Generate QR Pass
        </h2>

        <fieldset><legend className="font-semibold">Your role for this event</legend><div className="flex gap-4 py-2">
          {(['contestant','volunteer'] as const).map(r => <label key={r}><input type="radio" name="event-role" checked={(selectedEvent?.myEventRole ?? eventRole)===r}
            disabled={!!selectedEvent?.myEventRole} onChange={() => setEventRole(r)}/> {r==='contestant' ? 'Contestant' : 'Volunteer'}</label>)}
        </div></fieldset>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label htmlFor="register-select-event" className="block text-xs font-medium text-[#4D4D4D] mb-1">
              Select Event
            </label>
            <select id="register-select-event"
              value={selectedEventId}
              onChange={(e) => setSelectedEventId(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded px-3 py-2 bg-white focus:outline-none focus:border-action"
            >
              {events
                .filter((e) => e.status === 'published')
                .map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.title} ({ev.minTeamSize}–{ev.maxTeamSize} members)
                  </option>
                ))}
            </select>
          </div>

          <div>
            <label htmlFor="register-full-name" className="block text-xs font-medium text-[#4D4D4D] mb-1">
              Full Name
            </label>
            <input id="register-full-name"
              type="text"
              required
              value={student.name}
              readOnly
              className="w-full text-sm border border-gray-200 rounded px-3 py-2 focus:outline-none focus:border-action"
            />
          </div>

          <div>
            <label htmlFor="register-email" className="block text-xs font-medium text-[#4D4D4D] mb-1">
              Email
            </label>
            <input id="register-email"
              type="email"
              required
              value={student.email}
              readOnly
              className="w-full text-sm border border-gray-200 rounded px-3 py-2 focus:outline-none focus:border-action"
            />
          </div>

          <div>
            <label htmlFor="register-phone-number" className="block text-xs font-medium text-[#4D4D4D] mb-1">
              Phone Number
            </label>
            <input id="register-phone-number"
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91 98765 43210"
              className="w-full text-sm border border-gray-200 rounded px-3 py-2 focus:outline-none focus:border-action"
            />
          </div>

          <div>
            <label htmlFor="register-college-institution" className="block text-xs font-medium text-[#4D4D4D] mb-1">
              College / Institution
            </label>
            <input id="register-college-institution"
              type="text"
              required
              value={college}
              onChange={(e) => setCollege(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded px-3 py-2 focus:outline-none focus:border-action"
            />
          </div>

          <div>
            <label htmlFor="register-track-event-specific-note" className="block text-xs font-medium text-[#4D4D4D] mb-1">
              Track / Event-Specific Note
            </label>
            <input id="register-track-event-specific-note"
              type="text"
              value={trackNote}
              onChange={(e) => setTrackNote(e.target.value)}
              placeholder="e.g., AI Track / Vegetarian"
              className="w-full text-sm border border-gray-200 rounded px-3 py-2 focus:outline-none focus:border-action"
            />
          </div>

          {!selectedEvent?.myEventRole && eventRole === 'contestant' && selectedEvent && selectedEvent.maxTeamSize > 1 && (
            <div>
              <label htmlFor="register-team-name" className="block text-xs font-medium text-[#4D4D4D] mb-1">
                Team Name
              </label>
              <input id="register-team-name"
                type="text"
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
                placeholder="e.g., Campus Builders"
                className="w-full text-sm border border-gray-200 rounded px-3 py-2 focus:outline-none focus:border-action"
              />
            </div>
          )}

          <div className="flex items-end">
            <button
              type="submit"
              disabled={!!selectedEvent?.myEventRole || selectedEvent?.registrationSummary?.remaining===0}
              className="disabled:opacity-60 w-full md:w-auto bg-action hover:bg-action-hover text-white text-sm font-medium px-5 py-2 rounded transition cursor-pointer"
            >
              {selectedEvent?.myEventRole ? 'Registered as '+selectedEvent.myEventRole : selectedEvent?.registrationSummary?.remaining===0 ? 'Event full' : eventRole==='volunteer' ? 'Register as volunteer & get pass' : selectedEvent?.maxTeamSize === 1
                ? 'Register Solo & Get Pass'
                : 'Register Team & Get Pass'}
            </button>
          </div>
        </div>
      </form>

      {/* Incoming Invites */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
        <h2 className="text-base font-semibold text-[#4D4D4D] flex items-center gap-2">
          <Mail className="h-4 w-4 text-action" />
          Team Invitations
        </h2>

        {myInvites.length === 0 ? (
          <p className="text-sm text-[#717171]">No team invitations yet.</p>
        ) : (
          <div className="space-y-2.5">
            {myInvites.map((inv) => {
              const ev = getEvent(inv.eventId);
              return (
                <div
                  key={inv.id}
                  className="rounded bg-[#F5F7FA] border border-gray-100 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                >
                  <div>
                    <p className="text-sm font-semibold text-[#4D4D4D]">
                      {inv.teamName}{' '}
                      <span className="font-normal text-[#717171]">
                        for {ev?.title ?? inv.eventId}
                      </span>
                    </p>
                    <p className="text-xs text-[#717171] capitalize mt-0.5">
                      Status: {inv.status}
                    </p>
                  </div>

                  {inv.status === 'pending' ? (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleAcceptInvite(inv.id)}
                        className="text-xs px-3 py-1.5 rounded bg-action hover:bg-action-hover text-white font-medium cursor-pointer"
                      >
                        Accept
                      </button>
                      <button
                        onClick={() => handleDeclineInvite(inv.id)}
                        className="text-xs px-3 py-1.5 rounded bg-white border border-gray-300 text-[#4D4D4D] hover:bg-gray-50 font-medium cursor-pointer"
                      >
                        Decline
                      </button>
                    </div>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-[#717171] capitalize">
                      {inv.status === 'accepted' ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-action" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 text-gray-400" />
                      )}
                      {inv.status}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* My Teams */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
        <h2 className="text-base font-semibold text-[#4D4D4D] flex items-center gap-2">
          <Users className="h-4 w-4 text-action" />
          My Active Teams ({myTeams.length})
        </h2>

        {myTeams.length === 0 ? (
          <p className="text-sm text-[#717171]">
            You haven’t joined or created a team yet. Accept an invitation above
            or register for an event.
          </p>
        ) : (
          <div className="space-y-4">
            {myTeams.map((team) => {
              const ev = getEvent(team.eventId);
              const lockCheck = ev ? canLockTeam(team, ev) : { ok: false };
              const isLeader = team.leaderId === student.id;

              return (
                <div
                  key={team.id}
                  className="rounded-lg bg-[#F5F7FA] border border-gray-200 p-5 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-base font-semibold text-[#4D4D4D]">
                        {team.name}
                      </h3>
                      <p className="text-xs text-[#717171]">
                        {ev?.title} · {team.members.length}/
                        {ev?.maxTeamSize ?? '?'} members
                      </p>
                    </div>
                    <span
                      className={`text-xs px-2.5 py-1 rounded font-medium capitalize ${
                        team.status === 'locked'
                          ? 'bg-action-tint text-action'
                          : 'bg-amber-50 text-amber-800 border border-amber-200'
                      }`}
                    >
                      {team.status}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {team.members.map((m) => (
                      <span
                        key={m.userId}
                        className="text-xs bg-white border border-gray-200 rounded px-2.5 py-1 text-[#4D4D4D]"
                      >
                        {m.name} ({m.role})
                      </span>
                    ))}
                  </div>

                  {team.status === 'forming' && isLeader && (
                    <div className="pt-2 border-t border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <input
                          type="email"
                          value={inviteEmail}
                          onChange={(e) => setInviteEmail(e.target.value)}
                          placeholder="Teammate college email..."
                          className="text-xs bg-white border border-gray-200 rounded px-3 py-1.5 focus:outline-none focus:border-action"
                        />
                        <button
                          type="button"
                          onClick={() => handleSendInvite(team)}
                          className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded bg-white border border-gray-300 text-[#4D4D4D] hover:border-action cursor-pointer"
                        >
                          <UserPlus className="h-3.5 w-3.5" />
                          Invite
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleLockTeam(team)}
                        className="inline-flex items-center gap-1.5 text-xs px-3.5 py-1.5 rounded bg-action hover:bg-action-hover text-white font-medium cursor-pointer"
                        title={lockCheck.reason}
                      >
                        <Lock className="h-3.5 w-3.5" />
                        Lock Team
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
