'use client';

import { campusFetch } from '@/lib/auth/tabClient';
import ProjectMaterials from './ProjectMaterials';
import React, { useCallback, useEffect, useState } from 'react';
import { Award, CheckCircle2, Gavel, Send, Trophy } from 'lucide-react';
import {
  CampusEvent,
  RubricCriterion,
  Submission,
  Team,
  UserRole,
} from '@/types/domain';

interface LeaderboardRow {
  rank: number;
  submissionId: string;
  submissionTitle: string;
  teamId: string;
  teamName: string;
  judgeCount: number;
  averageWeightedScore: number;
  maxPossibleWeightedScore: number;
}

interface CompetitionsViewProps {
  role: UserRole;
  events: CampusEvent[];
  teams: Team[];
}

export default function CompetitionsView({
  role,
  events,
  teams,
}: CompetitionsViewProps) {
  const [eventChoice, setSelectedEventId] = useState('');
  const selectedEventId=events.find(e=>e.id===eventChoice)?.id??events[0]?.id??'';
  const [submissions, setSubmissions] = useState<(Submission & { assignmentId?: string; teamName?: string })[]>([]);
  const [criteria, setCriteria] = useState<RubricCriterion[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [judges, setJudges] = useState<{id: string; name: string; email: string}[]>([]);
  const [judgeId, setJudgeId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [problem,setProblem]=useState('');
  const [live,setLive]=useState('');
  const [artifact,setArtifact]=useState('');
  const [published,setPublished]=useState<{name:string;rows:{rank:number;team:string;score:number;maximum:number}[]}[]>([]);
  useEffect(()=>{let active=true;
    if(selectedEventId)campusFetch('/api/evaluation/results?eventId='+encodeURIComponent(selectedEventId)).then(r=>r.json()).then(d=>{if(active)setPublished(d.rounds??[]);}).catch(()=>{if(active)setPublished([]);});
    return()=>{active=false;};
  },[selectedEventId]);
  const [repoUrl, setRepoUrl] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  // Judge scoring state
  const [selectedSubmissionId, setSelectedSubmissionId] = useState('');
  const [scoreInputs, setScoreInputs] = useState<Record<string, number>>({});
  const [judgeFeedback, setJudgeFeedback] = useState('');

  const headers = useCallback(
    () => ({
      'Content-Type': 'application/json',
      'x-demo-role': role,
    }),
    [role]
  );

  const [revision, setRevision] = useState(0);
  const refresh = () => setRevision(n => n + 1);
  useEffect(() => {
    const timer = window.setInterval(() => { if (!document.hidden) refresh(); }, 10000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!selectedEventId) return;
    let active = true;

    if (role === 'club_organizer' || role === 'college_admin') {
      campusFetch(`/api/events/${selectedEventId}/assign-judges`).then(r => r.ok ? r.json() : { judges: [] }).then(data => {
        if (active) setJudges(data.judges ?? []);
      }).catch(() => { if (active) setJudges([]); });
    }
    Promise.all([
      campusFetch(`/api/events/${selectedEventId}/submissions`, {
        headers: { 'x-demo-role': role },
      }).then((r) => (r.ok ? r.json() : null)),
      campusFetch(`/api/events/${selectedEventId}/rubric`, {
        headers: { 'x-demo-role': role },
      }).then((r) => (r.ok ? r.json() : null)),
      campusFetch(`/api/events/${selectedEventId}/leaderboard`, {
        headers: { 'x-demo-role': role },
      }).then((r) => (r.ok ? r.json() : null)),
    ]).then(([subData, rubData, lbData]) => {
      if (!active) return;
      if (subData) {
        setSubmissions(subData.submissions ?? []);
        if (subData.submissions?.[0]) {
          setSelectedSubmissionId(prev => subData.submissions.some((s: Submission) => s.id === prev) ? prev : subData.submissions[0].id);
        }
      }
      if (rubData) setCriteria(rubData.criteria ?? []);
      if (lbData) setLeaderboard(lbData.leaderboard ?? []);
    });

    return () => {
      active = false;
    };
  }, [role, selectedEventId, revision]);

  const handleSubmitProject = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const res = await campusFetch(`/api/events/${selectedEventId}/submissions`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        title,
        description,
        problemStatement:problem.trim(),
        links:[{label:'GitHub repository',url:repoUrl.trim()},{label:'Live project',url:live.trim()}].filter(l=>l.url),
        fileUrls:artifact.trim()?[artifact.trim()]:[],
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setFeedback(data.error ?? 'Failed to submit project.');
      return;
    }
    setTitle('');
    setDescription('');
    setRepoUrl('');setProblem('');setLive('');setArtifact('');
    setFeedback('Project submission saved.');
    refresh();
  };

  const handleAssignSelfOrJudge = async (submissionId: string) => {
    setFeedback(null);
    const res = await campusFetch(`/api/events/${selectedEventId}/assign-judges`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        judgeId,
        submissionId,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setFeedback(data.error ?? 'Could not assign judge.');
      return;
    }
    setFeedback(`Assigned ${judges.find(j => j.id === judgeId)?.name ?? 'judge'} to ${submissions.find(s => s.id === submissionId)?.title ?? 'the project'}.`);
  };

  const handleScoreSubmission = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    const assignmentId = submissions.find(s => s.id === selectedSubmissionId)?.assignmentId;
    if (!assignmentId) {
      setFeedback('No judge assignment found for this submission.');
      return;
    }

    const res = await campusFetch('/api/judging/scores', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        judgeAssignmentId: assignmentId,
        scores: criteria.map((c) => ({
          criterionId: c.id,
          score: scoreInputs[c.id],
          feedback: judgeFeedback,
        })),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setFeedback(data.error ?? 'Failed to submit scores.');
      return;
    }
    setFeedback('Rubric scores submitted and locked.');
    refresh();
  };

  const project = submissions.find(s => s.id === selectedSubmissionId);
  const lockedTeamForEvent = teams.find(
    (t) => t.eventId === selectedEventId && t.status === 'locked'
  );

  return (
    <div className="work-page py-10 max-w-5xl mx-auto px-6 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold text-[#4D4D4D]">
            {role === 'judge' ? 'Judging desk' : role === 'student' ? 'Projects & results' : 'Submissions & judge assignments'}
          </h1>
          <p className="text-sm text-[#717171]">
            {role === 'judge' ? 'Select an event to review assigned projects and record your scores.' : role === 'student' ? 'Submit your project and follow the event results.' : 'Review entries and assign a judge to each submission.'}
          </p>
        </div>

        <select
          value={selectedEventId}
          aria-label="Competition event"
          onChange={(e) => {
            setSelectedEventId(e.target.value);
            setSelectedSubmissionId('');
            setSubmissions([]);
            setScoreInputs({});
            setJudgeFeedback('');
            setFeedback(null);
          }}
          className="text-sm border border-gray-200 rounded px-3 py-2 bg-white text-[#4D4D4D] focus:outline-none focus:border-action"
        >
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>
              {ev.title}
            </option>
          ))}
        </select>
      </div>

      {feedback && (
        <div role="status" className="rounded-lg bg-action-tint border border-action/30 px-4 py-3 text-xs font-medium text-[#263238] flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-action shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      {/* Student Project Submission */}
      {role === 'student' && (
        <form
          onSubmit={handleSubmitProject}
          className="bg-white border border-gray-200 rounded-lg p-6 space-y-4"
        >
          <h2 className="text-base font-semibold text-[#4D4D4D] flex items-center gap-2">
            <Send className="h-4 w-4 text-action" />
            Submit Project
          </h2>
          {!lockedTeamForEvent && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-3">
              Lock your team in Registrations before submitting your project.
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              aria-label="Project title"
              placeholder="Project title"
              className="text-sm border border-gray-200 rounded px-3 py-2 focus:outline-none focus:border-action"
            />
            <input
              type="url"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              aria-label="GitHub repository URL (optional)"
              placeholder="GitHub repository URL (optional)"
              className="text-sm border border-gray-200 rounded px-3 py-2 focus:outline-none focus:border-action"
            />
            <textarea
              aria-label="Problem statement" placeholder="Problem statement" value={problem} onChange={e=>setProblem(e.target.value)}/>
            <input aria-label="Live project URL" type="url" placeholder="Live project URL" value={live} onChange={e=>setLive(e.target.value)}/>
            <input aria-label="Presentation or submission file URL" type="url" placeholder="Presentation or submission file URL" value={artifact} onChange={e=>setArtifact(e.target.value)}/>
            <textarea rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              aria-label="Project summary"
              placeholder="Summary of what your team built..."
              className="sm:col-span-2 text-sm border border-gray-200 rounded px-3 py-2 focus:outline-none focus:border-action"
            />
          </div>
          <button
            type="submit"
            className="bg-action hover:bg-action-hover text-white text-xs font-medium px-4 py-2 rounded cursor-pointer"
          >
            Submit Work
          </button>
        </form>
      )}

      {published.map((r,i)=><section key={i} className="rounded-xl border bg-white p-4"><h2>Published results · {r.name}</h2>{r.rows.map((row,j)=><p key={j}>{row.rank}. {row.team} · {row.score.toFixed(2)} / {row.maximum}</p>)}</section>)}
      {/* Judge Scoring Panel */}
      {role === 'judge' && (
        <form
          onSubmit={handleScoreSubmission}
          className="bg-white border border-gray-200 rounded-lg p-6 space-y-4"
        >
          <h2 className="text-base font-semibold text-[#4D4D4D] flex items-center gap-2">
            <Gavel className="h-4 w-4 text-action" />
            Rubric Scoring
          </h2>

          {submissions.length === 0 ? (
            <p className="text-sm text-[#717171]">
              You have no assigned submissions for this event. Your organiser can assign projects once students submit them.
            </p>
          ) : (
            <>
              <div>
                <label htmlFor="judge-submission" className="block text-xs font-medium text-[#4D4D4D] mb-1">
                  Candidate or team
                </label>
                <select id="judge-submission"
                  value={selectedSubmissionId}
                  onChange={e => { setSelectedSubmissionId(e.target.value); setScoreInputs({}); setJudgeFeedback(''); }}
                  className="w-full text-sm border border-gray-200 rounded px-3 py-2 bg-white focus:outline-none focus:border-action"
                >
                  {submissions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}{s.teamName ? ' · ' + s.teamName : ''}
                    </option>
                  ))}
                </select>
              </div>

              <article className="rounded-lg border border-gray-200 p-4">
                <h3 className="font-bold">{project?.title}</h3>
                <p>{project?.description}</p>
                {project && <ProjectMaterials key={project.id} links={project.links} files={project.fileUrls}/>}
              </article>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {criteria.map((c) => (
                  <div key={c.id} className="bg-[#F5F7FA] p-3 rounded space-y-1">
                    <label htmlFor={`score-${c.id}`} className="block text-xs font-semibold text-[#4D4D4D]">
                      {c.name} (max {c.maxScore})
                    </label>
                    <input id={`score-${c.id}`}
                      type="number"
                      min={0}
                      max={c.maxScore}
                      required
                      value={scoreInputs[c.id] ?? ''}
                      onChange={(e) =>
                        setScoreInputs((prev) => ({
                          ...prev,
                          [c.id]: Number(e.target.value),
                        }))
                      }
                      className="w-full text-sm bg-white border border-gray-200 rounded px-2.5 py-1.5"
                    />
                  </div>
                ))}
              </div>

              <input
                type="text"
                value={judgeFeedback}
                onChange={(e) => setJudgeFeedback(e.target.value)}
                aria-label="Feedback for the team"
              placeholder="Judge feedback for the team..."
                className="w-full text-sm border border-gray-200 rounded px-3 py-2"
              />

              <button
                type="submit"
                className="bg-action hover:bg-action-hover text-white text-xs font-medium px-4 py-2 rounded cursor-pointer"
              >
                Submit & Lock Scores
              </button>
            </>
          )}
        </form>
      )}

      {/* Submissions & Judge Assignment List (Organizer/Admin) */}
      {(role === 'club_organizer' || role === 'college_admin') &&
        submissions.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-3">
            <h2 className="text-base font-semibold text-[#4D4D4D] flex items-center gap-2">
              <Award className="h-4 w-4 text-action" />
              Submissions ({submissions.length})
            </h2>
            <label className="block text-sm">Assign to judge
              <select value={judgeId} onChange={e => setJudgeId(e.target.value)} className="ml-2 rounded border p-2">
                <option value="">{judges.length ? 'Choose a judge' : 'No judge accounts available'}</option>
                {judges.map(j => <option value={j.id} key={j.id}>{j.name} ({j.email})</option>)}
              </select>
            </label>
            <div className="space-y-2">
              {submissions.map((s) => (
                <div
                  key={s.id}
                  className="bg-[#F5F7FA] rounded p-3 flex items-center justify-between gap-3"
                >
                  <div>
                    <p className="text-sm font-semibold text-[#4D4D4D]">
                      {s.title}
                    </p>
                    <p className="text-xs text-[#717171]">{teams.find(t => t.id === s.teamId)?.name} · {s.description}</p>
                  </div>
                  <button
                    disabled={!judges.some(j => j.id === judgeId)}
                    onClick={() => handleAssignSelfOrJudge(s.id)}
                    className="text-xs px-3 py-1.5 rounded bg-white border border-gray-300 text-[#4D4D4D] hover:border-action cursor-pointer"
                  >
                    Assign Judge
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

      {/* Weighted Leaderboard */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
        <h2 className="text-base font-semibold text-[#4D4D4D] flex items-center gap-2">
          <Trophy className="h-4 w-4 text-action" />
          Weighted Leaderboard
        </h2>
        {leaderboard.length === 0 ? (
          <p className="text-sm text-[#717171]">
            No ranked submissions yet for this event.
          </p>
        ) : (
          <div className="divide-y divide-gray-100">
            {leaderboard.map((row) => (
              <div
                key={row.submissionId}
                className="py-3 flex items-center justify-between text-sm"
              >
                <div className="flex items-center gap-3">
                  <span className="h-7 w-7 rounded-full bg-action-tint text-action font-bold text-xs flex items-center justify-center">
                    #{row.rank}
                  </span>
                  <div>
                    <p className="font-semibold text-[#4D4D4D]">
                      {row.submissionTitle}
                    </p>
                    <p className="text-xs text-[#717171]">
                      Team: {row.teamName} · {row.judgeCount} judge(s)
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-action">
                    {row.averageWeightedScore} / {row.maxPossibleWeightedScore}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
