// Called with the disposable event, two submitted teams, and real HTTP sessions.
import assert from 'node:assert/strict';

export async function checkJudging({api,organizer,student,eventId,submissions,expireSession}){
  const owner='evaluation/manage?eventId='+eventId;
  const view=()=>api(organizer,owner);
  async function manage(action,fields={},expected=200){
    return api(organizer,'evaluation/manage',{eventId,revision:(await view()).revision,action,...fields},expected);
  }
  const publicResults=()=>api({},'evaluation/results?eventId='+eventId);
  await api(student,owner,undefined,403);
  await api({},owner,undefined,401);
  const window={start:new Date(Date.now()-60000),end:new Date(Date.now()+3600000),deadline:new Date(Date.now()+7200000)};
  const roundSpec={...window,name:'Prototype',description:'Working project',anonymous:false,method:'weighted',criteria:[{name:'Execution',maxScore:60},{name:'Impact',maxScore:40}]};
  await manage('round',roundSpec);
  const round=(await view()).rounds[0];
  async function enroll(name){
    const {invite}=await manage('invite',{name});
    const session={};await api(session,'evaluation/session',{invite},200);
    await api({},'evaluation/session',{invite},401);
    const judge=(await view()).judges.find(j=>j.name===name);
    return {session,id:judge.id};
  }
  const first=await enroll('Industry judge A'),second=await enroll('Industry judge B');
  const [a,b]=submissions.map(s=>s.teamId);
  for(const [teamId,judge,weight] of [[a,first,1],[a,second,3],[b,first,1]]){
    await manage('assign',{roundId:round.id,teamId,judgeId:judge.id,weight});
  }
  const desk=async j=>(await api(j.session,'evaluation/desk')).items;
  const own=await desk(first),other=await desk(second);
  assert.equal(own.length,2);assert.equal(other.length,1);
  assert.equal(other[0].project.title,submissions[0].title);
  assert.ok(other[0].members.length);
  const ids=(await view()).evaluations;
  const unassigned=own.find(i=>ids.find(e=>e.id===i.evaluation.id).teamId===b);
  const assigned=own.find(i=>ids.find(e=>e.id===i.evaluation.id).teamId===a);
  const payload=(item,action,values)=>({eventId,evaluationId:item.evaluation.id,revision:item.evaluation.revision,action,
    marks:Object.fromEntries(values.map((v,i)=>[round.criteria[i].id,v])),strengths:'Clear prototype',weaknesses:'Small dataset',feedback:'Validate at scale'});
  const save=(judge,b,status=200)=>api(judge.session,'evaluation/desk',b,status);
  await save(second,payload(unassigned,'submit',[10,10]),403);
  await save(second,payload(assigned,'draft',[5]),403);
  await save(first,payload(assigned,'submit',[10]),400);
  await save(first,payload(assigned,'draft',[61]),400);
  await save(first,payload(assigned,'draft',[30]));
  const readDraft=(await desk(first)).find(i=>i.evaluation.id===assigned.evaluation.id);
  assert.deepEqual(readDraft.evaluation.marks,{[round.criteria[0].id]:30});
  await save(first,payload(readDraft,'submit',[30,30]));
  await save(first,payload(readDraft,'draft',[0]),409);
  await manage('reopen',{roundId:round.id,evaluationId:assigned.evaluation.id});
  const reopened=(await desk(first)).find(i=>i.evaluation.id===assigned.evaluation.id);
  assert.equal(reopened.evaluation.submittedAt,null);
  await save(first,payload(reopened,'submit',[40,20]));
  await save(second,payload(other[0],'submit',[60,40]));
  await manage('finalize',{roundId:round.id},409);
  await save(first,payload(unassigned,'submit',[45,35]));
  await manage('publish',{roundId:round.id},409);
  await manage('finalize',{roundId:round.id});
  const panel=await view();assert.ok(panel.evaluations.every(e=>e.submittedAt && e.judgeId));
  assert.deepEqual((await publicResults()).rounds,[]);
  for(const principal of [student,second.session])await api(principal,'evaluation/manage',{eventId,action:'publish',roundId:round.id,revision:panel.revision},principal===student?403:401);
  await manage('publish',{roundId:round.id});
  assert.deepEqual((await publicResults()).rounds[0].rows.map(r=>[r.rank,r.score]),[[1,90],[2,80]]);
  await manage('reopen',{roundId:round.id,evaluationId:assigned.evaluation.id},409);
  await manage('round',{...roundSpec,name:'Blind final',anonymous:true,method:'average'});
  const blind=(await view()).rounds[1];
  for(const judge of [first,second])await manage('assign',{roundId:blind.id,teamId:a,judgeId:judge.id,weight:3,brief:'An anonymized prototype.'});
  for(const [judge,score] of [[first,40],[second,20]]){
    const item=(await desk(judge)).find(i=>i.round.id===blind.id);
    assert.equal(item.team,'Entry 01');assert.deepEqual(item.members,[]);assert.deepEqual(item.project.links,[]);
    assert.equal(item.evaluation.teamId,undefined);assert.equal(item.project.description,'An anonymized prototype.');
    await save(judge,{...payload(item,'submit',[]),marks:{[blind.criteria[0].id]:score,[blind.criteria[1].id]:20}});
  }
  await manage('finalize',{roundId:blind.id});await manage('publish',{roundId:blind.id});
  assert.equal((await publicResults()).rounds[1].rows[0].score,50);
  await manage('round',{...roundSpec,name:'Late entries',start:new Date(Date.now()-7200000),end:new Date(Date.now()-3600000),deadline:new Date(Date.now()-60000)});
  const late=(await view()).rounds[2];await manage('assign',{roundId:late.id,teamId:a,judgeId:second.id,weight:1});
  const overdue=(await desk(second)).find(i=>i.round.id===late.id);
  await save(second,payload(overdue,'draft',[]),409);
  await manage('extend',{roundId:late.id,deadline:window.deadline});
  await save(second,payload(overdue,'draft',[]));
  await manage('unassign',{roundId:late.id,evaluationId:overdue.evaluation.id});
  assert.ok(!(await desk(second)).some(i=>i.round.id===late.id));
  await manage('revoke',{judgeId:second.id});await api(second.session,'evaluation/desk',undefined,401);
  await expireSession(first.id);
  await api(first.session,'evaluation/desk',undefined,401);
  const fresh=await manage('reissue',{judgeId:first.id});
  await api(first.session,'evaluation/session',{invite:fresh.invite},200);
  await api(first.session,'evaluation/session',undefined,200,'DELETE');await api(first.session,'evaluation/desk',undefined,401);
  console.log('Verified two judges, assignment boundaries, blind projection, draft, bounds, final lock/reopen, incomplete finalization, weighted 90/80 ranking, average 50, publication permissions, invite replay and session revocation.');
}
