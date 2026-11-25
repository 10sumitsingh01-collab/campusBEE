import { NavItem, UserRole } from '@/types/domain';

export const ROLE_LABELS: Record<UserRole, string> = {
  student: 'Student',
  club_organizer: 'Club Organizer',
  judge: 'Judge',
  college_admin: 'College Admin',
};

export const ROLE_PERMISSIONS: Record<
  UserRole,
  { canDo: string[]; restrictedByDefault: string[] }
> = {
  student: {
    canDo: [
      'Browse events and register solo or form/join teams',
      'Accept team invites and submit project links/files',
      'View own scores, feedback, and QR certificates',
      'Maintain skills, interests, and volunteer availability',
    ],
    restrictedByDefault: [
      'Edit another student’s profile, submissions, or private evaluations',
      'Publish club events or access Crew Sync organizer controls',
    ],
  },
  club_organizer: {
    canDo: [
      'Manage own club profile and publish club events',
      'View registrations, request venues, and invite volunteers',
      'Review, accept, or dismiss Crew Sync AI suggestions',
      'View club health metrics and post-event reports',
    ],
    restrictedByDefault: [
      'Access private data belonging to unrelated clubs',
      'Modify another club’s bookings without approval',
    ],
  },
  judge: {
    canDo: [
      'View assigned submissions and score against event rubrics',
      'Add structured feedback and lock submitted scores',
    ],
    restrictedByDefault: [
      'Change event setup, team membership, or other judges’ scores',
    ],
  },
  college_admin: {
    canDo: [
      'Manage users, roles, and club/event approvals',
      'Oversee campus venue inventory and resolve escalations',
      'Access campus-wide Crew Sync intelligence and reports',
    ],
    restrictedByDefault: [
      'Bypass audit history or data protection controls',
    ],
  },
};

export const MAIN_NAVIGATION: NavItem[] = [
  {
    label: 'Home',
    href: '#home',
    section: 'home',
    roles: ['student', 'club_organizer', 'judge', 'college_admin'],
  },
  {
    label: 'Explore Events',
    href: '#events',
    section: 'events',
    roles: ['student', 'club_organizer', 'judge', 'college_admin'],
  },
  {
    label: 'Clubs',
    href: '#clubs',
    section: 'clubs',
    roles: ['student', 'club_organizer', 'college_admin'],
  },
  {
    label: 'My Teams & Registrations',
    href: '#teams',
    section: 'teams',
    roles: ['student'],
  },
  {
    label: 'My Tickets',
    href: '#tickets',
    section: 'tickets',
    roles: ['student'],
  },
  {
    label: 'Competitions & Results',
    href: '#competitions',
    section: 'competitions',
    roles: ['student', 'club_organizer', 'judge'],
  },
  {
    label: 'Certificates',
    href: '#certificates',
    section: 'certificates',
    roles: ['student', 'college_admin'],
  },
  {
    label: 'Crew Sync AI',
    href: '#crew-sync',
    section: 'crew-sync',
    roles: ['club_organizer', 'college_admin'],
  },
  {
    label: 'Organizer / Admin',
    href: '#operations',
    section: 'operations',
    roles: ['club_organizer', 'judge', 'college_admin'],
  },
];

export function canAccessCrewSync(role: UserRole): boolean {
  return role === 'club_organizer' || role === 'college_admin';
}
