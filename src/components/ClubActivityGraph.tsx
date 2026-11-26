'use client';

import {useId, useState} from 'react';
import type {CampusEvent, Club} from '@/types/domain';

// Archived event totals for the three founding clubs, before calendar tracking began.
const archivedEvents: Record<string, Record<string, number>> = {
  'club-coding': {'2026-07': 2, '2026-08': 4, '2026-09': 2, '2026-10': 5},
  'club-robotics': {'2026-07': 3, '2026-08': 1, '2026-09': 2, '2026-10': 1},
  'club-design': {'2026-07': 1, '2026-08': 3, '2026-09': 2, '2026-10': 4},
};

export default function ClubActivityGraph({clubs, events, initialClubId}: {initialClubId?:string; clubs:Club[]; events:CampusEvent[]}) {
  const chartId = useId();
  const [choice,setChoice] = useState(initialClubId ?? '');
  const [measure,setMeasure] = useState('auto');
  const club = clubs.find(c => c.id === choice) ?? clubs[0];
  if (!club) return <p>No clubs available.</p>;
  const archive = archivedEvents[club.id];
  const hasSignups = events.some(e=>e.clubId===club.id && e.signupsByMonth);
  const series = measure==='auto' ? (archive || !hasSignups ? 'events' : 'signups') : measure;
  const unit = series==='signups' ? 'registrations' : 'events';
  const monthKey = (d:Date) => d.toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'}).slice(0,7);
  const now = new Date();
  const currentMonth = monthKey(now);
  const points = Array.from({length:6},(_,i) => {
    const date = new Date(currentMonth+'-15T12:00:00Z');
    date.setUTCMonth(date.getUTCMonth()-5+i);
    const key = monthKey(date);
    const count = series==='signups' ? events.filter(e=>e.clubId===club.id).reduce((total,e)=>total+(e.signupsByMonth?.[key] ?? 0),0) : (archive?.[key] ?? 0) + events.filter(e => e.clubId === club.id && ['published','ongoing','completed'].includes(e.status) &&
      Date.parse(e.startTime)<=now.getTime() && monthKey(new Date(e.startTime))===key).length;
    return {label:date.toLocaleDateString('en-IN',{month:'short',year:'2-digit',timeZone:'UTC'}),count};
  });
  const peak = Math.max(1,...points.map(p => p.count));
  const width = Math.max(480, points.length * 84);
  const baseline = 148;
  const x = (i:number) => points.length === 1 ? width / 2 : 40 + i * (width - 80) / (points.length - 1);
  const y = (count:number) => baseline - count * 108 / peak;
  const curve = points.map((point, i) => {
    if (i === 0) return `M ${x(i)} ${y(point.count)}`;
    const middle = (x(i - 1) + x(i)) / 2;
    return `C ${middle} ${y(points[i - 1].count)} ${middle} ${y(point.count)} ${x(i)} ${y(point.count)}`;
  }).join(' ');
  return <section className="min-w-0 overflow-hidden rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm space-y-3 md:col-span-2">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2>Club activity history</h2>
      <label>Club <select className="p-2 border" value={club.id} onChange={e=>{setChoice(e.target.value);setMeasure('auto');}}>{clubs.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
    </div>
    <label>Activity <select className="p-2 border" value={series} onChange={e=>setMeasure(e.target.value)}>
      {hasSignups && <option value="signups">Monthly student registrations</option>}
      <option value="events">Events started per month</option>
    </select></label>
    <p>{club.name} · Last six months</p>
    <div className="overflow-x-auto rounded-xl border border-emerald-100 bg-gradient-to-b from-emerald-50 to-white">
      <svg viewBox={`0 0 ${width} 192`} style={{width:'100%', minWidth:width * 0.7, maxHeight:280}} aria-label={club.name+' '+unit+' over time'} role="img">
        <defs>
          <linearGradient id={chartId} x1="0" x2="0" y1="0" y2="1" gradientUnits="objectBoundingBox">
            <stop offset="0%" stopColor="#10b981" stopOpacity=".4"/>
            <stop offset="100%" stopColor="#10b981" stopOpacity=".03"/>
          </linearGradient>
        </defs>
        {[40,76,112,baseline].map(level=><path key={level} d={`M 22 ${level} H ${width-22}`} stroke="#c9ded6" strokeDasharray="3 5"/>)}
        <path d={`${curve} L ${x(points.length-1)} ${baseline} L ${x(0)} ${baseline} Z`} fill={`url(#${chartId})`}/>
        <path d={curve} fill="none" stroke="#087b62" strokeWidth="3.5" strokeLinecap="round"/>
        {points.map((p,i)=><g key={p.label}>
          <title>{p.label} · {p.count} {unit}</title>
          <circle cx={x(i)} cy={y(p.count)} r="5" fill="white" stroke="#087b62" strokeWidth="3"/>
          <text x={x(i)} y={y(p.count)-13} textAnchor="middle" fill="#164a3e" fontSize="12" fontWeight="700">{p.count}</text>
          <text x={x(i)} y="176" textAnchor="middle" fill="#3c5b52" fontSize="10">{p.label}</text>
        </g>)}
      </svg>
    </div>
    <ul className="sr-only">{points.map(p=><li key={p.label}>{p.label} · {p.count} {unit}</li>)}</ul>
  </section>;
}
