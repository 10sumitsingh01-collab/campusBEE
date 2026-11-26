import type { CampusEvent } from '@/types/domain';

type PosterSubject = Pick<CampusEvent, 'eventType' | 'title' | 'tags'>;

export default function EventPoster({ event }: { event: PosterSubject }) {
  const subject = [event.title, ...event.tags].join(' ');
  let artwork: string;
  if (event.eventType === 'Design Jam' || /\b(design|ux|ui)\b/i.test(subject)) artwork = 'design';
  else if (event.eventType === 'Competition') artwork = 'competition';
  else if (event.eventType === 'Hackathon') artwork = 'hackathon';
  else if (event.eventType === 'Workshop') artwork = 'workshop';
  else artwork = 'campus';

  return <span aria-hidden="true" className={'event-print event-print-' + artwork}>
    <span className="print-type">{event.eventType}</span>
    <span className="print-title">{event.title}</span>
  </span>;
}
