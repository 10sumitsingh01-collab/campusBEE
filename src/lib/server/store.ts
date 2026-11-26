import { AsyncLocalStorage } from 'node:async_hooks';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  DEMO_USERS,
  SEED_CLUB_METRICS,
  SEED_CLUBS,
  SEED_EVENTS,
  SEED_RECOMMENDATIONS,
  SEED_TEAM_INVITES,
  SEED_TEAMS,
  SEED_VENUES,
  SEED_VOLUNTEERS,
} from '@/lib/data/seed';
import {
  AIRecommendation,
  CampusEvent,
  CertificateRecord,
  Club,
  ClubActivityMetric,
  CollegeIdCard,
  EventAttendance,
  EventCollaboration,
  EventReport,
  EventTicket,
  JudgeAssignment,
  RubricCriterion,
  ScoreEntry,
  Submission,
  Team,
  TeamInvite,
  UserProfile,
  UserRole,
  Venue,
  VolunteerAssignment,
  VolunteerProfile,
} from '@/types/domain';

export interface CampusOSStore {
  competitions?: Record<string,{revision:number;state:import('@/lib/judging/model').Competition}>;
  users: Record<UserRole, UserProfile>;
  accounts: { profile: UserProfile; salt: string; passwordHash: string }[];
  sessions: { digest: string; userId: string; expires: number }[];
  clubs: Club[];
  venues: Venue[];
  events: CampusEvent[];
  teams: Team[];
  tickets: EventTicket[];
  collegeIdCards: CollegeIdCard[];
  collegeCardKey?: string;
  invites: TeamInvite[];
  submissions: Submission[];
  rubrics: RubricCriterion[];
  judgeAssignments: JudgeAssignment[];
  scores: ScoreEntry[];
  attendance: EventAttendance[];
  certificates: CertificateRecord[];
  volunteers: VolunteerProfile[];
  volunteerAssignments: VolunteerAssignment[];
  collaborations: EventCollaboration[];
  clubMetrics: ClubActivityMetric[];
  recommendations: AIRecommendation[];
  reports: EventReport[];
}

export function createInitialStore(): CampusOSStore {
  return {
    users: structuredClone(DEMO_USERS),
    accounts: [],
    sessions: [],
    clubs: structuredClone(SEED_CLUBS),
    venues: structuredClone(SEED_VENUES),
    events: structuredClone(SEED_EVENTS),
    teams: structuredClone(SEED_TEAMS),
    tickets: [
      {
        id: 'reg-demo-1',
        eventId: 'evt-ai-hackathon',
        eventTitle: 'AI Hackathon',
        eventStartTime: '2026-11-28T10:00:00+05:30',
        eventEndTime: '2026-11-28T16:00:00+05:30',
        venueName: 'Main Auditorium',
        venueBuilding: 'Central Academic Block',
        userId: 'user-demo-shlok',
        teamId: 'team-neural-spark',
        attendeeName: 'Shlok Saitavya',
        attendeeEmail: 'shlok.saitavya@campus.edu',
        phone: '+91 98765 43210',
        college: 'BMSIT',
        customFields: { track: 'Campus AI Agents' },
        ticketCode: 'TKT-AI2026',
        qrToken:
          '9f8e7d6c5b4a32109f8e7d6c5b4a32109f8e7d6c5b4a32109f8e7d6c5b4a3210',
        status: 'registered',
        registeredAt: '2026-11-25T10:00:00+05:30',
      },
      {
        id: 'reg-demo-2',
        eventId: 'evt-uiux-workshop',
        eventTitle: 'UI/UX Workshop',
        eventStartTime: '2026-11-30T14:00:00+05:30',
        eventEndTime: '2026-11-30T16:00:00+05:30',
        venueName: 'Design Lab',
        venueBuilding: 'Innovation Wing 2F',
        userId: 'user-student-1',
        attendeeName: 'Aarav Sharma',
        attendeeEmail: 'aarav.sharma@campus.edu',
        phone: '+91 98765 43210',
        college: 'BMSIT',
        customFields: { track: 'Figma Prototyping' },
        ticketCode: 'TKT-UI2026',
        qrToken:
          '1a2b3c4d5e6f78901a2b3c4d5e6f78901a2b3c4d5e6f78901a2b3c4d5e6f7890',
        status: 'registered',
        registeredAt: '2026-11-25T10:15:00+05:30',
      },
      {
        id: 'reg-demo-3',
        eventId: 'evt-ai-hackathon',
        eventTitle: 'AI Hackathon',
        eventStartTime: '2026-11-28T10:00:00+05:30',
        eventEndTime: '2026-11-28T16:00:00+05:30',
        venueName: 'Main Auditorium',
        venueBuilding: 'Central Academic Block',
        userId: 'user-demo-sumit',
        attendeeName: 'Sumit Singh',
        attendeeEmail: 'sumit.singh@campus.edu',
        phone: '',
        college: '',
        customFields: {},
        ticketCode: 'TKT-SM2026',
        qrToken:
          '2b3c4d5e6f78901a2b3c4d5e6f78901a2b3c4d5e6f78901a2b3c4d5e6f78901a',
        status: 'registered',
        registeredAt: '2026-11-25T10:20:00+05:30',
      },
      {
        id: 'reg-demo-4',
        eventId: 'evt-ai-hackathon',
        eventTitle: 'AI Hackathon',
        eventStartTime: '2026-11-28T10:00:00+05:30',
        eventEndTime: '2026-11-28T16:00:00+05:30',
        venueName: 'Main Auditorium',
        venueBuilding: 'Central Academic Block',
        userId: 'user-demo-rohan',
        attendeeName: 'Rohan Singh',
        attendeeEmail: 'rohan.singh@campus.edu',
        phone: '+91 98765 22222',
        college: 'BMSIT',
        customFields: { track: 'Embedded AI' },
        ticketCode: 'TKT-RS2026',
        qrToken:
          '3c4d5e6f78901a2b3c4d5e6f78901a2b3c4d5e6f78901a2b3c4d5e6f78901a2b',
        status: 'registered',
        registeredAt: '2026-11-25T10:25:00+05:30',
      },
    ],
    collegeIdCards: [
      {
        id: 'cid-demo-1',
        userId: 'user-demo-shlok',
        name: 'Shlok Saitavya',
        usn: '1BY25EC137',
        email: 'shlok.saitavya@campus.edu',
        department: 'CSE',
        year: 2,
        college: 'BMSIT',
        barcodeToken: '19764',
        isDemo: true,
      },
      {
        id: 'cid-demo-2',
        userId: 'user-demo-sumit',
        name: 'Sumit Singh',
        usn: null,
        email: 'sumit.singh@campus.edu',
        department: null,
        year: null,
        college: null,
        barcodeToken: null,
        isDemo: true,
      },
      {
        id: 'cid-demo-3',
        userId: 'user-demo-archit',
        name: 'Archit Sharma',
        usn: '1BY25CS055',
        email: 'archit.sharma@campus.edu',
        department: 'CSE',
        year: 2,
        college: 'BMSIT',
        barcodeToken: '19691',
        isDemo: true,
      },
      {
        id: 'cid-demo-4',
        userId: 'user-demo-rohan',
        name: 'Rohan Singh',
        usn: '1BY25EC124',
        email: 'rohan.singh@campus.edu',
        department: 'CSE',
        year: 2,
        college: 'BMSIT',
        barcodeToken: '19944',
        isDemo: true,
      },
    ],
    invites: structuredClone(SEED_TEAM_INVITES),
    submissions: [],
    rubrics: [
      {
        id: 'rub-1',
        eventId: 'evt-ai-hackathon',
        name: 'Technical Execution',
        description: 'Working prototype, code quality, and system design',
        maxScore: 40,
        weight: 1.0,
        sortOrder: 1,
      },
      {
        id: 'rub-2',
        eventId: 'evt-ai-hackathon',
        name: 'Campus Impact & Grounding',
        description: 'Relevance to campus problem and data accuracy',
        maxScore: 35,
        weight: 1.0,
        sortOrder: 2,
      },
      {
        id: 'rub-3',
        eventId: 'evt-ai-hackathon',
        name: 'UX & Presentation',
        description: 'Clarity of demo and usability',
        maxScore: 25,
        weight: 1.0,
        sortOrder: 3,
      },
    ],
    judgeAssignments: [],
    scores: [],
    attendance: [],
    certificates: [],
    volunteers: structuredClone(SEED_VOLUNTEERS),
    volunteerAssignments: [],
    collaborations: [],
    clubMetrics: structuredClone(SEED_CLUB_METRICS),
    recommendations: structuredClone(SEED_RECOMMENDATIONS),
    reports: [],
  };
}

// A hosted demo request owns its copy until the storage revision commits.
export const hostedDemo = new AsyncLocalStorage<{store: CampusOSStore}>();

const globalForStore = globalThis as unknown as {
  __campusOSStore?: CampusOSStore;
};

// The LAN prototype runs as a single Node process with one shared snapshot.
const snapshot = process.env.CAMPUS_DEMO_FILE || '.campus-data/local.json';

export function saveDemoStore(store: CampusOSStore) {
  const demo = hostedDemo.getStore();
  if (demo) { demo.store = store; return; }
  mkdirSync(dirname(snapshot), { recursive: true });
  const temporary = snapshot + '.tmp';
  writeFileSync(temporary, JSON.stringify(store), { mode: 0o600 });
  renameSync(temporary, snapshot);
}

export function getStore(): CampusOSStore {
  const demo = hostedDemo.getStore();
  if (demo) return demo.store;
  if (!globalForStore.__campusOSStore) {
    globalForStore.__campusOSStore = existsSync(/* turbopackIgnore: true */ snapshot)
      ? JSON.parse(readFileSync(/* turbopackIgnore: true */ snapshot, 'utf8')) as CampusOSStore
      : createInitialStore();
  }
  globalForStore.__campusOSStore.collegeIdCards ??= [];
  globalForStore.__campusOSStore.accounts ??= [];
  globalForStore.__campusOSStore.sessions ??= [];
  return globalForStore.__campusOSStore;
}

export function getDataMode(): 'supabase' | 'local_seed' {
  if (hostedDemo.getStore()) return 'local_seed';
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const hasSupabase = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && key);
  if (process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'false' && hasSupabase) {
    return 'supabase';
  }
  return 'local_seed';
}

export function generateId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}
