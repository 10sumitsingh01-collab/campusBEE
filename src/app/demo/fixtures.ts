import {detectVenueClashes} from '@/lib/coordination/clashCheck';
import type { CampusEvent, Venue } from '@/types/domain';

// Public fictional fixtures only. No production identifiers or account records.
export const students = [
  {code:'DEMO-1001', name:'Mira Vale', department:'Computer Science', year:2, skills:['Design','Prototyping']},
  {code:'DEMO-1002', name:'Noor Reed', department:'Electronics', year:3, skills:['Robotics','Prototyping']},
  {code:'DEMO-1003', name:'Ari Finch', department:'Design', year:1, skills:['Design','Photography']},
  {code:'DEMO-1004', name:'Dev Lake', department:'Mechanical', year:2, skills:['Robotics','Photography']},
];
export const clubs = [
  {id:'builders',name:'Builder Society',tags:['Prototyping','Software'],history:[2,3,4]},
  {id:'robotics',name:'Robotics Club',tags:['Hardware','Prototyping'],history:[4,3,1]},
  {id:'design',name:'Design Collective',tags:['Design','Prototyping'],history:[1,2,3]},
];
export const venues: Venue[] = [
  {id:'hall',name:'Assembly Hall',capacity:60,building:'North Wing',equipment:[]},
  {id:'lab',name:'Innovation Lab',capacity:40,building:'East Wing',equipment:[]},
];
function event(id:string,title:string,clubId:string,start:string,end:string,eventType:CampusEvent['eventType']): CampusEvent {
  return {id,title,clubId,eventType,startTime:'2026-11-28T'+start+':00+05:30',endTime:'2026-11-28T'+end+':00+05:30',
    venueId:'hall',status:'published',registrationsCount:0,setupBufferMinutes:15,teardownBufferMinutes:15,
    tags:[],eligibilityDepartments:['All Departments'],eligibilityYears:[],description:'',registrationDeadline:'2026-11-28',
    minTeamSize:1,maxTeamSize:1};
}
export const events = [
  event('sprint','Campus Build Sprint','builders','10:00','13:00','Hackathon'),
  event('robot','Robotics Studio','robotics','11:00','12:30','Workshop'),
  event('design','Design Exchange','design','15:00','17:00','Design Jam'),
];
export const passKey = (eventId:string,code:string) => 'CAMPUSOS-DEMO/'+eventId+'/'+code;
export const initialPasses = [passKey('sprint','DEMO-1002'),passKey('sprint','DEMO-1003'),passKey('robot','DEMO-1004')];
export function recommend(action:string, schedule:CampusEvent[],skill:string) {
  if(action==='Collaboration') return clubs.slice(1).flatMap(club=>{
    const shared=clubs[0].tags.filter(tag=>club.tags.includes(tag));
    return shared.length ? [club.name+' could co-host a workshop with '+clubs[0].name+'. Both list '+shared.join(', ')+'.'] : [];
  });
  if(action==='Volunteer matching') return students.filter(s=>s.skills.includes(skill)).map(s=>s.name+' matches the requested skill '+skill+' · '+s.department+'.');
  if(action==='Club revival') return clubs.filter(c=>c.history[2]<c.history[1] && c.history[1]<c.history[0]).map(c=>c.name+' ran '+c.history.join(' → ')+' events from September to November. Invite members to a beginner session to rebuild participation.');
  return detectVenueClashes(schedule,venues).map(c=>c.eventA.title+' and '+c.eventB.title+' overlap in '+c.venue.name+' including 15-minute setup and teardown buffers. Move '+c.eventB.title+' to '+(c.alternateVenues.map(v=>v.name+' ('+v.capacity+' seats)').join(', ') || 'an alternative time')+'. Alternate time: '+(c.alternateTimeSlots[0]?.label ?? 'none available')+'.');
}
