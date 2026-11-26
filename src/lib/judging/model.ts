import type {RubricCriterion} from '@/types/domain';
export type Criterion = Pick<RubricCriterion,'id'|'name'|'maxScore'>;
export interface Round {
  id:string; name:string; description:string; start:string; end:string; deadline:string;
  anonymous:boolean; method:'average'|'weighted'; criteria:Criterion[];
  entries:{teamId:string;alias:string;brief:string;artifact:string}[];
  status:'open'|'finalized'|'published';
}
export interface PanelJudge {id:string;name:string;inviteHash:string;inviteExpires:number;sessionHash:string;sessionExpires:number;revoked:boolean}
export interface Evaluation {
  id:string; roundId:string; teamId:string; judgeId:string;weight:number; revision:number;
  marks:Record<string,number>; strengths:string; weaknesses:string; feedback:string; submittedAt:string|null;
}
export interface Competition {rounds:Round[];judges:PanelJudge[];evaluations:Evaluation[]}
export interface Project {title:string;description:string;problem:string;links:{label:string;url:string}[];files:string[]}
export interface EntryTeam {id:string;name:string;members:string[];project:Project|null}
export interface DeskItem {
  eventId:string; event:string; round:Pick<Round,'id'|'name'|'description'|'start'|'end'|'deadline'|'criteria'|'status'>;
  evaluation:Omit<Evaluation,'teamId'>;team:string;members:string[];project:Project|null;
}
export function total(marks:Record<string,number>){return Object.values(marks).reduce((a,b)=>a+b,0);}
export function standings(round:Round,all:Evaluation[]){
  const maximum=round.criteria.reduce((n,c)=>n+c.maxScore,0);
  const rows=round.entries.map(entry=>{
    const assigned=all.filter(e=>e.roundId===round.id && e.teamId===entry.teamId);
    const finished=assigned.filter(e=>e.submittedAt);
    const weight=(e:Evaluation)=>round.method==='weighted'?e.weight:1;
    const divisor=finished.reduce((n,e)=>n+weight(e),0);
    const totals=finished.map(e=>total(e.marks));
    const average=divisor?finished.reduce((n,e)=>n+total(e.marks)*weight(e),0)/divisor:null;
    return {teamId:entry.teamId,average,maximum,complete:assigned.length>0 && assigned.length===finished.length,
      pending:assigned.length-finished.length,assigned:assigned.length,spread:totals.length>1?(Math.max(...totals)-Math.min(...totals))/maximum:0};
  }).sort((a,b)=>(b.average??-1)-(a.average??-1));
  return rows.map((row,i)=>({...row,rank:row.average===null?null:rows.findIndex(r=>r.average===rows[i].average)+1}));
}
