// Run offline against the local prototype snapshot, with its server stopped.
import {readFileSync,writeFileSync,renameSync,existsSync} from 'node:fs';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {dirname,join} from 'node:path';
const [snapshot,origin]=process.argv.slice(2);
if(!snapshot || !origin) throw Error('Pass the local demo snapshot path and site origin.');
const base=new URL(origin).origin;
const store=JSON.parse(readFileSync(snapshot,'utf8'));
const eventId='cluster4-build24',roundId='cluster4-final';
if(store.events.some(e=>e.id===eventId)){console.log('CLUSTER4 workflow already exists.');process.exit(0);}
const club=store.clubs.find(c=>c.name.toUpperCase()==='CLUSTER4');
const venue=store.venues.find(v=>v.id==='venue-maker-studio');
const students=store.collegeIdCards.filter(c=>c.isDemo).slice(0,3);
if(!club || !venue || students.length!==3)throw Error('CLUSTER4, Maker Studio and three demo students are required.');
const now=Date.now(),hour=3600000,day=24*hour,iso=t=>new Date(t).toISOString();
let start=Math.ceil((now+hour)/hour)*hour;
while(store.events.some(e=>e.venueId===venue.id && !['cancelled','rejected'].includes(e.status) && start<Date.parse(e.endTime)+(e.teardownBufferMinutes||0)*60000 && start+day>Date.parse(e.startTime)-(e.setupBufferMinutes||0)*60000))start+=hour;
const end=start+day,expiry=now+7*day;
const event={id:eventId,clubId:club.id,title:'Build/24 · Campus Hackathon',description:'CLUSTER4 hosts a 24-hour build for campus projects. Twelve teams can enter. The showcase includes three individually registered demo candidates with prepared project briefs.',eventType:'Hackathon',tags:['CLUSTER4','Campus technology'],eligibilityDepartments:['All Departments'],eligibilityYears:[1,2,3,4],minTeamSize:1,maxTeamSize:4,maxTeams:12,registrationDeadline:iso(end-hour),submissionDeadline:iso(end),startTime:iso(start),endTime:iso(end),setupBufferMinutes:0,teardownBufferMinutes:0,venueId:venue.id,status:'published',registrationsCount:3};
store.events.push(event);
const specs=[
 ['Team Wayfinder','QuietRoute','Students need accessible paths when entrances close.','Model step-free paths as a graph. Filter closed entrances and return an alternative route.','Test a wheelchair route with a closed lift and compare the additional travel time.'],
 ['Team Relay','LabShare','Students struggle to find equipment across labs.','Track inventory and reservation windows. Reject overlapping reservations for the same kit.','Request the same device from two sessions and verify that only one booking succeeds.'],
 ['Team Loop','PlatePlan','Campus kitchens need earlier signals about meal demand.','Aggregate opt-in meal counts by dining hall and time slot to estimate the next service.','Compare predicted demand against served portions and report absolute error.']
];
const entries=[],evaluations=[],judgeId=randomUUID();
const criteria=[['Problem and impact',30],['Technical approach',40],['Validation and presentation',30]].map(([name,maxScore])=>({id:randomUUID(),name,maxScore}));
for(const [i,student] of students.entries()){
 const [name,title,problem,description,test]=specs[i],teamId=randomUUID();
 store.teams.push({id:teamId,eventId,name,leaderId:student.userId,status:'locked',lockedAt:iso(now),members:[{userId:student.userId,name:student.name,email:student.email,role:'leader'}]});
 store.tickets.push({id:randomUUID(),eventId,eventTitle:event.title,eventStartTime:event.startTime,eventEndTime:event.endTime,venueName:venue.name,venueBuilding:venue.building,userId:student.userId,teamId,attendeeName:student.name,attendeeEmail:student.email,phone:'',college:'BMSIT',customFields:{},ticketCode:'TKT-'+randomBytes(4).toString('hex').toUpperCase(),qrToken:randomBytes(32).toString('hex'),status:'registered',eventRole:'contestant',registeredAt:iso(now)});
 store.submissions.push({id:randomUUID(),eventId,teamId,title,description,problemStatement:problem,links:[],fileUrls:[base+'/cluster4-projects/'+title+'.txt'],submittedBy:student.userId,submittedAt:iso(now)});
 entries.push({teamId,alias:'Entry 0'+(i+1),brief:description,artifact:''});
 evaluations.push({id:randomUUID(),roundId,teamId,judgeId,weight:1,revision:0,marks:{},strengths:'',weaknesses:'',feedback:'',submittedAt:null});
}
const secret=randomBytes(32).toString('base64url');
store.competitions??={};
store.competitions[eventId]={revision:1,state:{rounds:[{id:roundId,name:'Campus prototype review',description:'Review the problem, technical proposal and validation plan in each team brief.',start:iso(now),end:iso(end),deadline:iso(expiry),anonymous:false,method:'average',criteria,entries,status:'open'}],judges:[{id:judgeId,name:'CLUSTER4 guest evaluator',inviteHash:createHash('sha256').update(secret).digest('hex'),inviteExpires:expiry,sessionHash:'',sessionExpires:0,revoked:false}],evaluations}};
const invite=join(dirname(snapshot),'cluster4-judge-invitation.txt');
if(existsSync(invite))throw Error('A private invitation file already exists. Inspect it before provisioning.');
writeFileSync(snapshot+'.cluster4.tmp',JSON.stringify(store),{mode:0o600,flag:'wx'});
writeFileSync(invite,base+'/judge#'+eventId+'.'+secret+'\n',{mode:0o600,flag:'wx'});
renameSync(snapshot+'.cluster4.tmp',snapshot);
console.log('Prepared event, three teams, tickets, projects and judge assignments.');
