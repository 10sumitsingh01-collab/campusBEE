import {NextRequest} from 'next/server';
import {readInput,judgeCookies,judgePrefix,fail,load,persist,respond,token} from '@/lib/server/competition';
import {sessionDigest} from '@/lib/server/authGuard';
export async function POST(req:NextRequest){
  let cookie:{name:string;value:string}|undefined;
  const response=await respond(async()=>{
    const b=await readInput(req);if(typeof b.invite!=='string'||b.invite.length>200)fail(401,'Invalid invitation.');
    const [eventId,secret]=b.invite.split('.');if(!secret)fail(401,'Invalid invitation.');
    const w=await load(eventId);
    const judge=w.state.judges.find(j=>!j.revoked && j.inviteHash===sessionDigest(secret) && j.inviteExpires>Date.now());
    if(!judge)fail(401,'Invitation expired, already used or revoked.');
    const value=token();judge.inviteHash='';judge.sessionHash=sessionDigest(value);judge.sessionExpires=Date.now()+8*3600000;
    await persist(w);cookie={name:judgePrefix(req) + eventId,value};return {accepted:true};
  });
  if(cookie)response.cookies.set(cookie.name,cookie.value,{httpOnly:true,sameSite:'strict',secure:req.nextUrl.protocol==='https:',path:'/api/evaluation',maxAge:8*3600});
  return response;
}
export async function DELETE(req:NextRequest){
  const response=await respond(async()=>{
    for(const c of judgeCookies(req)){
      const w=await load(c.eventId);const j=w.state.judges.find(j=>j.sessionHash===sessionDigest(c.value));
      if(j){j.sessionHash='';await persist(w);}
    }return {signedOut:true};
  });
  for(const c of judgeCookies(req))response.cookies.set(c.name,'',{path:'/api/evaluation',maxAge:0});
  return response;
}
