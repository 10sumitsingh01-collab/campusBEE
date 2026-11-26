export type UserRole = 'student' | 'club_organizer' | 'judge' | 'college_admin';

export type EventStatus =
  | 'draft'
  | 'pending_approval'
  | 'published'
  | 'ongoing'
  | 'completed'
  | 'cancelled';

export type RecommendationType =
  | 'clash_resolution'
  | 'club_collaboration'
  | 'volunteer_match'
  | 'club_revival'
  | 'event_report';

export type RecommendationStatus =
  | 'draft'
  | 'pending_review'
  | 'accepted'
  | 'edited'
  | 'dismissed';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  rollNumber?: string;
  department: string;
  year?: number;
  skills: string[];
  interests: string[];
  role: UserRole;
  managedClubIds?: string[];
}

export interface Club {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  interests: string[];
  capabilities: string[];
  status: 'active' | 'inactive' | 'pending';
  ownerId: string;
  memberCount: number;
}

export interface Venue {
  id: string;
  name: string;
  building: string;
  capacity: number;
  equipment: string[];
}

export type EventRole = 'contestant' | 'volunteer';

export interface CampusEvent {
  maxTeams?: number;
  assignedToJudge?:boolean;
  myEventRole?: EventRole;
  signupsByMonth?: Record<string,number>;
  volunteerRoster?: {userId:string; name:string}[];
  registrationSummary?: { capacity:number | null; registered:number; remaining:number | null };
  id: string;
  clubId: string;
  title: string;
  description: string;
  eventType: 'Hackathon' | 'Workshop' | 'Competition' | 'Seminar' | 'Design Jam';
  tags: string[];
  eligibilityDepartments: string[];
  eligibilityYears: number[];
  minTeamSize: number;
  maxTeamSize: number;
  registrationDeadline: string;
  submissionDeadline?: string;
  startTime: string;
  endTime: string;
  setupBufferMinutes: number;
  teardownBufferMinutes: number;
  venueId: string;
  status: EventStatus;
  registrationsCount: number;
}

export interface VolunteerProfile {
  id: string;
  userId: string;
  name: string;
  department: string;
  year: number;
  skills: string[];
  interests: string[];
  availabilityWindows: string[];
  consentToContact: boolean;
}

export interface ClubActivityMetric {
  clubId: string;
  periodLabel: string;
  eventCount: number;
  registrationsCount: number;
  attendanceCount: number;
  activeMembersCount: number;
  volunteerParticipationCount: number;
}

export interface AIRecommendation {
  id: string;
  type: RecommendationType;
  eventId?: string;
  clubId?: string;
  title: string;
  summary: string;
  explanation: string;
  sourceRecords: string[];
  confidenceScore: number;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: RecommendationStatus;
  createdByAgent:
    | 'Event Coordination Agent'
    | 'Club Collaboration Agent'
    | 'Volunteer & Club Health Agent'
    | 'Event Intelligence Agent';
  suggestedActionLabel?: string;
  scheduleChange?: { venueId: string } | { startTime: string; endTime: string };
  createdAt: string;
}

export interface NavItem {
  label: string;
  href: string;
  section: string;
  roles: UserRole[];
}

export interface TeamMember {
  userId: string;
  name: string;
  email: string;
  role: 'leader' | 'member';
}

export interface Team {
  id: string;
  eventId: string;
  name: string;
  leaderId: string;
  status: 'forming' | 'locked';
  members: TeamMember[];
  lockedAt?: string;
}

export interface TeamInvite {
  id: string;
  teamId: string;
  eventId: string;
  teamName: string;
  invitedEmail: string;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
  expiresAt: string;
}

export interface Submission {
  problemStatement?:string;
  id: string;
  eventId: string;
  teamId: string;
  title: string;
  description: string;
  links: { label: string; url: string }[];
  fileUrls: string[];
  submittedBy: string;
  submittedAt: string;
}

export interface RubricCriterion {
  id: string;
  eventId: string;
  name: string;
  description: string;
  maxScore: number;
  weight: number;
  sortOrder: number;
}

export interface JudgeAssignment {
  id: string;
  eventId: string;
  judgeId: string;
  submissionId: string;
  assignedAt: string;
}

export interface ScoreEntry {
  id: string;
  judgeAssignmentId: string;
  criterionId: string;
  score: number;
  feedback: string;
  locked: boolean;
  submittedAt: string;
}

export interface EventAttendance {
  id: string;
  eventId: string;
  userId?: string;
  teamId?: string;
  checkInTime: string;
  checkInMethod: 'qr' | 'manual' | 'barcode';
}

export interface CertificateRecord {
  id: string;
  eventId: string;
  userId: string;
  teamId?: string;
  type: 'participation' | 'winner' | 'volunteer';
  rankLabel?: string;
  certificateCode: string;
  issuedAt: string;
}

export interface VolunteerAssignment {
  id: string;
  eventId: string;
  userId: string;
  roleName: string;
  invitationStatus: 'invited' | 'accepted' | 'declined';
  confirmed: boolean;
  attended: boolean;
  invitedAt: string;
  respondedAt?: string;
}

export interface EventCollaboration {
  id: string;
  primaryEventId?: string;
  partnerEventId?: string;
  primaryClubId: string;
  partnerClubId: string;
  proposal: string;
  roleSplit: Record<string, string[]>;
  approvalStatus: 'draft' | 'proposed' | 'approved' | 'rejected';
  createdAt: string;
}

export interface EventReport {
  id: string;
  eventId: string;
  verifiedMetricsSnapshot: {
    capacity?: number | null;
    remaining?: number | null;
    registrationsCount: number;
    attendanceCount: number;
    attendanceRate: number;
    noShowCount: number;
    volunteerCount: number;
    submissionCount: number;
  };
  generatedNarrative: string;
  organizerNotes: string;
  approvalStatus: 'draft' | 'approved' | 'published';
  approvedBy?: string;
  publishedAt?: string;
  createdAt: string;
}

export interface EventTicket {
  eventRole?: EventRole;
  id: string;
  eventId: string;
  eventTitle: string;
  eventStartTime: string;
  eventEndTime: string;
  venueName: string;
  venueBuilding: string;
  userId: string;
  teamId?: string;
  attendeeName: string;
  attendeeEmail: string;
  phone: string;
  college: string;
  customFields: Record<string, string>;
  ticketCode: string;
  qrToken: string;
  status: 'registered' | 'waitlisted' | 'cancelled';
  registeredAt: string;
  checkedInAt?: string;
}

export interface CollegeIdCard {
  id: string;
  userId?: string;
  name: string;
  usn: string | null;
  email: string;
  department: string | null;
  year: number | null;
  college: string | null;
  barcodeToken: string | null;
  isDemo: boolean;
}
