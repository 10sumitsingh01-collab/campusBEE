import { NextRequest, NextResponse } from 'next/server';
import { inHostedDemo } from '@/lib/server/hostedDemo';
import * as AuthMe from '@/app/api/auth/me/route';
import * as AuthSession from '@/app/api/auth/session/route';
import * as Bootstrap from '@/app/api/bootstrap/route';
import * as CalendarCheckClashes from '@/app/api/calendar/check-clashes/route';
import * as CertificatesVerifyCode from '@/app/api/certificates/verify/[code]/route';
import * as ClubsId from '@/app/api/clubs/[id]/route';
import * as Clubs from '@/app/api/clubs/route';
import * as CrewSyncClubHealth from '@/app/api/crew-sync/club-health/route';
import * as CrewSyncCollaborations from '@/app/api/crew-sync/collaborations/route';
import * as CrewSyncCoordination from '@/app/api/crew-sync/coordination/route';
import * as CrewSyncEventBlurb from '@/app/api/crew-sync/event-blurb/route';
import * as CrewSyncRecommendationsId from '@/app/api/crew-sync/recommendations/[id]/route';
import * as CrewSyncReports from '@/app/api/crew-sync/reports/route';
import * as CrewSyncVolunteers from '@/app/api/crew-sync/volunteers/route';
import * as EvaluationDesk from '@/app/api/evaluation/desk/route';
import * as EvaluationManage from '@/app/api/evaluation/manage/route';
import * as EvaluationResults from '@/app/api/evaluation/results/route';
import * as EvaluationSession from '@/app/api/evaluation/session/route';
import * as EvaluationWorkflow from '@/app/api/evaluation/workflow/route';
import * as EventsIdAssignJudges from '@/app/api/events/[id]/assign-judges/route';
import * as EventsIdCertificatesGenerate from '@/app/api/events/[id]/certificates/generate/route';
import * as EventsIdCheckin from '@/app/api/events/[id]/checkin/route';
import * as EventsIdCollegeIdCheckin from '@/app/api/events/[id]/college-id-checkin/route';
import * as EventsIdLeaderboard from '@/app/api/events/[id]/leaderboard/route';
import * as EventsIdRegister from '@/app/api/events/[id]/register/route';
import * as EventsId from '@/app/api/events/[id]/route';
import * as EventsIdRubric from '@/app/api/events/[id]/rubric/route';
import * as EventsIdSubmissions from '@/app/api/events/[id]/submissions/route';
import * as Events from '@/app/api/events/route';
import * as InvitesIdRespond from '@/app/api/invites/[id]/respond/route';
import * as JudgingScores from '@/app/api/judging/scores/route';
import * as TeamsIdInvites from '@/app/api/teams/[id]/invites/route';
import * as TeamsIdLock from '@/app/api/teams/[id]/lock/route';
import * as Tickets from '@/app/api/tickets/route';
import * as Venues from '@/app/api/venues/route';

type Handler = (request: NextRequest, context: { params: Promise<Record<string,string> & {id:string;code:string}> }) => Promise<Response>;
const routes: [string, Partial<Record<string, Handler>>][] = [
  ['auth/me', AuthMe],
  ['auth/session', AuthSession],
  ['bootstrap', Bootstrap],
  ['calendar/check-clashes', CalendarCheckClashes],
  ['certificates/verify/[code]', CertificatesVerifyCode],
  ['clubs/[id]', ClubsId],
  ['clubs', Clubs],
  ['crew-sync/club-health', CrewSyncClubHealth],
  ['crew-sync/collaborations', CrewSyncCollaborations],
  ['crew-sync/coordination', CrewSyncCoordination],
  ['crew-sync/event-blurb', CrewSyncEventBlurb],
  ['crew-sync/recommendations/[id]', CrewSyncRecommendationsId],
  ['crew-sync/reports', CrewSyncReports],
  ['crew-sync/volunteers', CrewSyncVolunteers],
  ['evaluation/desk', EvaluationDesk],
  ['evaluation/manage', EvaluationManage],
  ['evaluation/results', EvaluationResults],
  ['evaluation/session', EvaluationSession],
  ['evaluation/workflow', EvaluationWorkflow],
  ['events/[id]/assign-judges', EventsIdAssignJudges],
  ['events/[id]/certificates/generate', EventsIdCertificatesGenerate],
  ['events/[id]/checkin', EventsIdCheckin],
  ['events/[id]/college-id-checkin', EventsIdCollegeIdCheckin],
  ['events/[id]/leaderboard', EventsIdLeaderboard],
  ['events/[id]/register', EventsIdRegister],
  ['events/[id]', EventsId],
  ['events/[id]/rubric', EventsIdRubric],
  ['events/[id]/submissions', EventsIdSubmissions],
  ['events', Events],
  ['invites/[id]/respond', InvitesIdRespond],
  ['judging/scores', JudgingScores],
  ['teams/[id]/invites', TeamsIdInvites],
  ['teams/[id]/lock', TeamsIdLock],
  ['tickets', Tickets],
  ['venues', Venues],
];
type Context = { params: Promise<{path:string[]}> };
async function dispatch(request: NextRequest, context: Context) {
  const { path } = await context.params;
  for (const [pattern, methods] of routes) {
    const parts = pattern.split('/');
    if (parts.length !== path.length) continue;
    const params = { id: '', code: '' };
    if (!parts.every((part, index) => {
      if (part === '[id]' || part === '[code]') {
        params[part === '[id]' ? 'id' : 'code'] = path[index];
        return true;
      }
      return part === path[index];
    })) continue;
    const handle = methods[request.method];
    if (!handle) return NextResponse.json({error:'Method unavailable.'}, {status:405});
    return inHostedDemo(request, () => handle(request, {params:Promise.resolve(params)}));
  }
  return NextResponse.json({error:'Unknown demo endpoint.'}, {status:404});
}
export {dispatch as GET, dispatch as POST, dispatch as PATCH, dispatch as DELETE};
