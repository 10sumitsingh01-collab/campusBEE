// Run after npm run build. All writes go to a disposable, isolated snapshot.
import assert from 'node:assert/strict';
import {checkJudging} from './check-judging-rounds.mjs';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import net from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

const scratch = await mkdtemp(path.join(tmpdir(), 'campus-accounts-'));
const listener = net.createServer();
listener.listen(0, '127.0.0.1');
await once(listener, 'listening');
const port = listener.address().port;
await new Promise(resolve => listener.close(resolve));
const base = 'http://127.0.0.1:' + port + '/api/';
let server;
async function start() {
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', String(port)], {
    env: { ...process.env, GEMINI_API_KEY: '', CAMPUS_DEMO_FILE: path.join(scratch, 'store.json'), NEXT_PUBLIC_USE_MOCK_DATA: 'true' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error('Test server exited');
    if (await fetch(base + 'health').then(r => r.ok).catch(() => false)) return;
    await delay(100);
  }
  throw new Error('Test server timed out');
}
async function stop() {
  if (server && server.exitCode === null && !server.signalCode) {
    const exited = once(server, 'exit');
    server.kill();
    await exited;
  }
}
async function api(client, url, body, expected, method) {
  const response = await fetch(base + url, {
    method: method ?? (body ? 'POST' : 'GET'),
    headers: { cookie: client.cookie ?? '', 'Content-Type':'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const value = await response.json();
  if (expected) assert.equal(response.status, expected, url + ' ' + JSON.stringify(value));
  else assert.ok(response.ok, url + ' ' + JSON.stringify(value));
  const cookie = response.headers.get('set-cookie');
  if (cookie) client.cookie = cookie.split(';')[0];
  return value;
}
async function signup(name, role) {
  const client = { email: name + '@example.test', password: randomUUID() };
  const { user } = await api(client,'auth/session', { mode:'signup', email:client.email, password:client.password, name, role, clubName:'Test Society' }, 201);
  return Object.assign(client,{user});
}
try {
  await start();
  const [organizer, a, b, judge, otherJudge] = await Promise.all([
    signup('Host','club_organizer'), signup('Ada','student'), signup('Ben','student'),
    signup('JudgeOne','judge'), signup('JudgeTwo','judge'),
  ]);
  const blurbFacts = { title: 'Print studio', eventType: 'Workshop', tags: ['Letterpress'] };
  await api(a, 'crew-sync/event-blurb', blurbFacts, 403);
  const draft = await api(organizer, 'crew-sync/event-blurb', blurbFacts);
  assert.equal(draft.usedGemini, false);
  assert.ok(draft.text.includes(blurbFacts.title) && draft.text.includes('Letterpress'));
  await api(organizer, 'crew-sync/event-blurb', { ...blurbFacts, title: '' }, 400);
  assert.equal((await api({}, 'health')).services.gemini, false);
  console.log('Verified organiser-only poster copy, input checks and the keyless template.');
  const startTime = Date.now() + 21 * 86400000;
  const {event} = await api(organizer,'events',{title:'Solo showcase',clubId:organizer.user.managedClubIds[0],status:'published',minTeamSize:1,maxTeamSize:1,startTime:new Date(startTime).toISOString(),endTime:new Date(startTime+3600000).toISOString()});
  const admin = await signup('CampusAdmin','college_admin');
  const decision = (id,status) => api(admin,'events/'+id+'?from=pending_approval',{status},200,'PATCH');
  assert.equal(event.status,'pending_approval');
  assert.ok((await api(admin,'bootstrap')).events.some(e=>e.id===event.id && e.status==='pending_approval'));
  assert.ok(!(await api(a,'bootstrap')).events.some(e=>e.id===event.id));
  await api(a,'events/'+event.id+'/register',{},404);
  await api(organizer,'events/'+event.id,{status:'published'},403,'PATCH');
  await decision(event.id,'draft');
  await api(organizer,'events/'+event.id,{status:'pending_approval'},200,'PATCH');
  await decision(event.id,'published');
  await api(admin,'events/'+event.id+'?from=pending_approval',{status:'draft'},409,'PATCH');
  const url = 'events/'+event.id;
  const competing = await api(organizer,'events',{...event,title:'Overlapping booking',reserveVenue:true},409);
  assert.ok(competing.clashes.some(c => c.eventA.id === event.id));
  const discovery = await api({}, 'public/discover');
  assert.ok(discovery.events.some(e => e.id === event.id), 'The hosted event must appear in discovery');
  const submissions = await Promise.all([a,b].map(async student => {
    const {ticket} = await api(student,url+'/register',{},201);
    assert.equal(ticket.userId,student.user.id);
    await api(student,url+'/register',{},409);
    const {submission} = await api(student,url+'/submissions',{title:'My project'},201);
    const {tickets} = await api(student,'tickets');
    assert.deepEqual(tickets.map(t=>t.userId),[student.user.id]);
    return submission;
  }));
  const scanUrl = url + '/college-id-checkin';
  const card = { barcodeOrUsn: '0005347', method: 'barcode' };
  const passA = (await api(a, 'tickets')).tickets[0];
  const passB = (await api(b, 'tickets')).tickets[0];
  assert.equal((await api(organizer, scanUrl, card, 404)).status, 'CARD_NOT_LINKED');
  await api(a, scanUrl, { ...card, ticketCode:passA.ticketCode }, 403);
  await api(organizer, scanUrl, { ...card, ticketCode:'TKT-MISSING' }, 400);
  assert.equal((await api(organizer, scanUrl, { ...card, ticketCode:passA.ticketCode }, 201)).status, 'ATTENDANCE_MARKED');
  await api(organizer, scanUrl, { ...card, ticketCode:passB.ticketCode }, 409);
  await api(organizer, scanUrl, { barcodeOrUsn:'11111', ticketCode:passA.ticketCode }, 409);
  await stop(); await start();
  assert.equal((await api(organizer, scanUrl, card)).status, 'ALREADY_CHECKED_IN');
  assert.equal((await api(organizer, url+'/checkin', { ticketCode:passA.ticketCode, method:'manual' })).status,'ALREADY_CHECKED_IN');
  assert.equal((await api(organizer, url+'/checkin')).count,1);
  assert.ok((await api(organizer, scanUrl)).cards.every(c => c.isDemo));
  console.log('Verified first-time college card linking, duplicate prevention across QR and card, registration ownership and restart persistence.');
  assert.notEqual(submissions[0].teamId,submissions[1].teamId);
  const {judges} = await api(organizer,url+'/assign-judges');
  assert.equal(judges.length,2);
  for (const submission of submissions) await api(organizer,url+'/assign-judges',{judgeId:judge.user.id,submissionId:submission.id});
  assert.equal((await api(otherJudge,url+'/submissions')).submissions.length,0);
  const assigned = (await api(judge,url+'/submissions')).submissions;
  assert.equal(assigned.length,2);
  const {criteria} = await api(judge,url+'/rubric');
  for (const s of assigned) await api(judge,'judging/scores',{judgeAssignmentId:s.assignmentId,scores:criteria.map(c=>({criterionId:c.id,score:s.submittedBy===a.user.id ? 92 : 81}))},201);
  assert.deepEqual((await api(a,url+'/leaderboard')).leaderboard,[]);
  const rows = (await api(organizer,url+'/leaderboard')).leaderboard;
  assert.deepEqual(rows.map(r=>[r.teamId,r.averageWeightedScore]),[[submissions[0].teamId,92],[submissions[1].teamId,81]]);
  await checkJudging({api,organizer,student:a,eventId:event.id,submissions,expireSession:async judgeId=>{
    await stop();
    const file=path.join(scratch,'store.json');
    const snapshot=JSON.parse(await readFile(file,'utf8'));
    snapshot.competitions[event.id].state.judges.find(j=>j.id===judgeId).sessionExpires=Date.now()-1;
    await writeFile(file,JSON.stringify(snapshot));await start();
  }});
  const reportResult = await api(organizer, 'crew-sync/reports', { eventId: event.id });
  const metrics = reportResult.report.verifiedMetricsSnapshot;
  assert.equal(metrics.registrationsCount, 2);
  assert.equal(metrics.submissionCount, 2);
  const helper = await signup('Student-Volunteer','student');
  const volunteerResponse = await api(helper,url+'/register',{eventRole:'volunteer'},201);
  assert.ok(volunteerResponse.ticket.ticketCode && !volunteerResponse.team);
  await api(helper,url+'/register',{eventRole:'contestant'},409);
  await api(a,url+'/register',{eventRole:'volunteer'},409);
  assert.equal((await api(helper,'bootstrap')).events.find(e=>e.id===event.id).myEventRole,'volunteer');
  const view = (await api(organizer,'bootstrap')).events.find(e=>e.id===event.id);
  assert.deepEqual(view.volunteerRoster,[{userId:helper.user.id,name:helper.user.name}]);
  assert.equal(view.registrationSummary.registered,3);
  assert.equal(view.registrationSummary.remaining,view.registrationSummary.capacity-3);
  const volunteerReport = (await api(organizer,'crew-sync/reports',{eventId:event.id})).report;
  const snapshot = volunteerReport.verifiedMetricsSnapshot;
  assert.equal(snapshot.volunteerCount,1);
  assert.equal(snapshot.remaining,view.registrationSummary.remaining);
  console.log('Verified exclusive volunteer and contestant roles, event roster and remaining seats.');
  const clubId = event.clubId;
  const collaboration = await api(organizer, 'crew-sync/collaborations', { clubId, eventId: event.id });
  assert.equal(collaboration.recommendation.clubId, clubId);
  assert.ok(collaboration.rankedPartners.length);
  const volunteers = await api(organizer, 'crew-sync/volunteers', { requiredSkills: ['Frontend'], eventId: event.id });
  assert.ok(volunteers.candidates.length);
  assert.ok(volunteers.candidates.every(v => v.matchedSkills.length > 0));
  const health = await api(organizer, 'crew-sync/club-health', { clubId });
  assert.equal(health.assessments[0].status, 'insufficient_data');
  console.log('Verified event report (2 registrations, 2 projects), club collaboration, volunteer skill matching and low-data club health.');

  // The event programmes do not overlap. Their teardown and setup windows do.
  const later = await api(organizer, 'events', {
    ...event, title: 'Poster finals',
    startTime: new Date(startTime + 90 * 60000).toISOString(),
    endTime: new Date(startTime + 150 * 60000).toISOString(),
  });
  await decision(later.event.id,'published');
  const laterUrl = 'events/' + later.event.id;
  assert.equal((await api(organizer, laterUrl+'/college-id-checkin', card)).status, 'STUDENT_IDENTIFIED_NOT_REGISTERED');
  const { ticket: beforeMove } = await api(a, laterUrl + '/register', {}, 201);
  const matches = c => c.eventA.id === event.id && c.eventB.id === later.event.id;
  const clash = later.clashes.find(matches);
  assert.ok(clash, 'Publishing must identify the setup/teardown conflict');
  assert.ok(clash.alternateVenues.length && clash.alternateTimeSlots.length);
  for (const venue of clash.alternateVenues) {
    const preview = await api(organizer, 'calendar/check-clashes', { ...later.event, venueId: venue.id });
    assert.deepEqual(preview.clashes, []);
  }
  for (const slot of clash.alternateTimeSlots) {
    assert.equal(Date.parse(slot.endTime) - Date.parse(slot.startTime), 3600000);
    const preview = await api(organizer, 'calendar/check-clashes', { ...later.event, ...slot });
    assert.deepEqual(preview.clashes, []);
  }
  console.log('Verified that every proposed venue and time cleared the conflict on recheck.');
  assert.equal(Date.parse(clash.overlapStart), startTime + 60 * 60000);
  assert.equal(Date.parse(clash.overlapEnd), startTime + 90 * 60000);
  const scan = () => api(organizer, 'crew-sync/coordination', {});
  const recommendation = result => result.recommendations.find(r => r.sourceRecords.includes(event.id) && r.sourceRecords.includes(later.event.id));
  const plan = recommendation(await scan());
  assert.ok(plan);
  assert.equal(recommendation(await scan()).id, plan.id, 'A repeated scan should return the saved recommendation');
  await api(judge, 'crew-sync/coordination', {}, 403);
  await api(organizer, 'crew-sync/recommendations/' + plan.id, { status: 'accepted' }, 200, 'PATCH');
  assert.equal((await api(organizer, laterUrl)).event.venueId, clash.alternateVenues[0].id);
  assert.equal((await scan()).venueClashes.some(matches), false);
  const movedTicket = (await api(a, 'tickets')).tickets.find(t => t.id === beforeMove.id);
  assert.equal(movedTicket.venueName, clash.alternateVenues[0].name);
  assert.equal(movedTicket.qrToken, beforeMove.qrToken);
  console.log('Verified that approving the suggested plan moved the event and cleared the clash.');

  // Fill each other venue and ensure a once-valid move cannot double-book it.
  await api(organizer, laterUrl, { venueId: event.venueId }, 200, 'PATCH');
  const previousPlan = recommendation(await scan());
  for (const venue of clash.alternateVenues) {
    await api(organizer, 'events', { ...later.event, title: 'Reserved room', venueId: venue.id });
  }
  await api(organizer, 'crew-sync/recommendations/' + previousPlan.id, { status: 'accepted' }, 409, 'PATCH');
  const timePlan = recommendation(await scan());
  assert.ok(timePlan.scheduleChange.startTime);
  await api(organizer, 'crew-sync/recommendations/' + timePlan.id, { status: 'accepted', expectedPlan: previousPlan.scheduleChange }, 409, 'PATCH');
  await api(organizer, 'crew-sync/recommendations/' + timePlan.id, { status: 'accepted' }, 200, 'PATCH');
  const rescheduled = (await api(organizer, laterUrl)).event;
  assert.equal(rescheduled.startTime, timePlan.scheduleChange.startTime);
  assert.equal(rescheduled.venueId, event.venueId);
  assert.equal((await scan()).venueClashes.some(matches), false);
  console.log('Verified stale-plan rejection and rescheduling when all alternative rooms are occupied.');

  const rescheduledTicket = (await api(a, 'tickets')).tickets.find(t => t.id === beforeMove.id);
  assert.equal(rescheduledTicket.eventStartTime, rescheduled.startTime);
  const { event: teamEvent } = await api(organizer, 'events', {
    ...event, title: 'Team challenge', minTeamSize: 2, maxTeamSize: 2,
  });
  await decision(teamEvent.id,'published');
  const teamUrl = 'events/' + teamEvent.id;
  const { team, ticket: leaderPass } = await api(a, teamUrl + '/register', { teamName: 'Builders' }, 201);
  await api(a, 'teams/' + team.id + '/lock', {}, 400);
  const volunteerInvite = (await api(a, 'teams/'+team.id+'/invites', {email:helper.email}, 201)).invite;
  await api(helper,teamUrl+'/register',{eventRole:'volunteer'},201);
  await api(helper,'invites/'+volunteerInvite.id+'/respond',{action:'accept'},409);
  const { invite } = await api(a, 'teams/' + team.id + '/invites', { email: b.email }, 201);
  await stop();
  await start();
  await api(b, 'invites/' + invite.id + '/respond', { action: 'accept' });
  const memberPass = (await api(b, 'tickets')).tickets.find(t => t.eventId === teamEvent.id);
  assert.equal(memberPass.teamId, team.id);
  assert.notEqual(memberPass.qrToken, leaderPass.qrToken);
  await api(b, teamUrl + '/register', {}, 409);
  await api(a, 'teams/' + team.id + '/lock', {});
  const { event: closed } = await api(organizer, 'events', {
    ...event, registrationDeadline: new Date(Date.now() - 60000).toISOString(),
  });
  await decision(closed.id,'published');
  await api(b, 'events/' + closed.id + '/register', {}, 400);
  console.log('Verified deadline enforcement, team invitation across restart, individual passes and current ticket schedule.');
  await stop();
  await start();
  assert.ok((await api(organizer, 'crew-sync/reports')).reports.some(r => r.id === volunteerReport.id));
  assert.equal((await api(organizer, 'bootstrap')).recommendations.find(r => r.id === plan.id)?.status, 'accepted');
  assert.equal((await api(a,'auth/me')).user.id,a.user.id);
  const previous = {cookie:a.cookie};
  await api(a,'auth/session',null,200,'DELETE');
  await api(previous,'auth/me',null,401);
  const returning = await api(a,'auth/session',{mode:'signin',email:a.email,password:a.password});
  assert.equal(returning.user.id,a.user.id);
  assert.deepEqual((await api(organizer,url+'/leaderboard')).leaderboard,rows);
  console.log('Passed: five personal sessions, two registrations, two independent scores, restart, logout and returning sign-in.');
} finally {
  await stop();
  await rm(scratch,{recursive:true,force:true});
}
