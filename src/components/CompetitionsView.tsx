'use client';

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
  const [selectedEventId, setSelectedEventId] = useState(events[0]?.id ?? '');
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [criteria, setCriteria] = useState<RubricCriterion[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
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

  const loadEventCompetitionData = useCallback(async () => {
    if (!selectedEventId) return;
    const [subRes, rubRes, lbRes] = await Promise.all([
      fetch(`/api/events/${selectedEventId}/submissions`, {
        headers: { 'x-demo-role': role },
      }),
      fetch(`/api/events/${selectedEventId}/rubric`, {
        headers: { 'x-demo-role': role },
      }),
      fetch(`/api/events/${selectedEventId}/leaderboard`, {
        headers: { 'x-demo-role': role },
      }),
    ]);

    if (subRes.ok) {
      const data = await subRes.json();
      setSubmissions(data.submissions ?? []);
      if (data.submissions?.[0] && !selectedSubmissionId) {
        setSelectedSubmissionId(data.submissions[0].id);
      }
    }
    if (rubRes.ok) {
      const data = await rubRes.json();
      setCriteria(data.criteria ?? []);
    }
    if (lbRes.ok) {
      const data = await lbRes.json();
      setLeaderboard(data.leaderboard ?? []);
    }
  }, [role, selectedEventId, selectedSubmissionId]);

  useEffect(() => {
    if (!selectedEventId) return;
    let active = true;

    Promise.all([
      fetch(`/api/events/${selectedEventId}/submissions`, {
        headers: { 'x-demo-role': role },
      }).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/events/${selectedEventId}/rubric`, {
        headers: { 'x-demo-role': role },
      }).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/events/${selectedEventId}/leaderboard`, {
        headers: { 'x-demo-role': role },
      }).then((r) => (r.ok ? r.json() : null)),
    ]).then(([subData, rubData, lbData]) => {
      if (!active) return;
      if (subData) {
        setSubmissions(subData.submissions ?? []);
        if (subData.submissions?.[0]) {
          setSelectedSubmissionId((prev) => prev || subData.submissions[0].id);
        }
      }
      if (rubData) setCriteria(rubData.criteria ?? []);
      if (lbData) setLeaderboard(lbData.leaderboard ?? []);
    });

    return () => {
      active = false;
    };
  }, [role, selectedEventId]);

  const handleSubmitProject = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const res = await fetch(`/api/events/${selectedEventId}/submissions`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        title,
        description,
        links: repoUrl.trim() ? [{ label: 'Project Link', url: repoUrl.trim() }] : [],
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setFeedback(data.error ?? 'Failed to submit project.');
      return;
    }
    setTitle('');
    setDescription('');
    setRepoUrl('');
    setFeedback('Project submission saved.');
    await loadEventCompetitionData();
  };

  const handleAssignSelfOrJudge = async (submissionId: string) => {
    setFeedback(null);
    const res = await fetch(`/api/events/${selectedEventId}/assign-judges`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        judgeId: 'user-judge-1',
        submissionId,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setFeedback(data.error ?? 'Could not assign judge.');
      return;
    }
    setFeedback(`Assigned Dr. Vikram Mehta to submission (${data.assignment.id}).`);
  };

  const handleScoreSubmission = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    // Ensure judge assignment exists (or organizer/admin assigned it)
    const assignRes = await fetch(
      `/api/events/${selectedEventId}/assign-judges`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-demo-role': 'college_admin' },
        body: JSON.stringify({
          judgeId: 'user-judge-1',
          submissionId: selectedSubmissionId,
        }),
      }
    );
    const assignData = await assignRes.json();
    const assignmentId = assignData.assignment?.id;
    if (!assignmentId) {
      setFeedback('No judge assignment found for this submission.');
      return;
    }

    const res = await fetch('/api/judging/scores', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        judgeAssignmentId: assignmentId,
        scores: criteria.map((c) => ({
          criterionId: c.id,
          score: scoreInputs[c.id] ?? Math.round(c.maxScore * 0.8),
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
    await loadEventCompetitionData();
  };

  const lockedTeamForEvent = teams.find(
    (t) => t.eventId === selectedEventId && t.status === 'locked'
  );

  return (
    <div className="py-10 max-w-5xl mx-auto px-6 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold text-[#4D4D4D]">
            Competitions, Judging & Results
          </h1>
          <p className="text-sm text-[#717171]">
            Project submissions, rubric scoring, and deterministic weighted
            leaderboards
          </p>
        </div>

        <select
          value={selectedEventId}
          onChange={(e) => setSelectedEventId(e.target.value)}
          className="text-sm border border-gray-200 rounded px-3 py-2 bg-white text-[#4D4D4D] focus:outline-none focus:border-[#4CAF4F]"
        >
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>
              {ev.title}
            </option>
          ))}
        </select>
      </div>

      {feedback && (
        <div className="rounded-lg bg-[#E8F5E9] border border-[#4CAF4F]/30 px-4 py-3 text-xs font-medium text-[#263238] flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-[#4CAF4F] shrink-0" />
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
            <Send className="h-4 w-4 text-[#4CAF4F]" />
            Submit Project
          </h2>
          {!lockedTeamForEvent && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-3">
              Note: Your team must be locked in My Teams & Registrations before
              submitting.
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Project title"
              className="text-sm border border-gray-200 rounded px-3 py-2 focus:outline-none focus:border-[#4CAF4F]"
            />
            <input
              type="url"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="Demo or repository URL (optional)"
              className="text-sm border border-gray-200 rounded px-3 py-2 focus:outline-none focus:border-[#4CAF4F]"
            />
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Summary of what your team built..."
              className="sm:col-span-2 text-sm border border-gray-200 rounded px-3 py-2 focus:outline-none focus:border-[#4CAF4F]"
            />
          </div>
          <button
            type="submit"
            className="bg-[#4CAF4F] hover:bg-[#43A046] text-white text-xs font-medium px-4 py-2 rounded cursor-pointer"
          >
            Submit Work
          </button>
        </form>
      )}

      {/* Judge Scoring Panel */}
      {(role === 'judge' || role === 'college_admin') && (
        <form
          onSubmit={handleScoreSubmission}
          className="bg-white border border-gray-200 rounded-lg p-6 space-y-4"
        >
          <h2 className="text-base font-semibold text-[#4D4D4D] flex items-center gap-2">
            <Gavel className="h-4 w-4 text-[#4CAF4F]" />
            Rubric Scoring
          </h2>

          {submissions.length === 0 ? (
            <p className="text-sm text-[#717171]">
              No submissions yet for this event.
            </p>
          ) : (
            <>
              <div>
                <label className="block text-xs font-medium text-[#4D4D4D] mb-1">
                  Submission
                </label>
                <select
                  value={selectedSubmissionId}
                  onChange={(e) => setSelectedSubmissionId(e.target.value)}
                  className="w-full text-sm border border-gray-200 rounded px-3 py-2 bg-white focus:outline-none focus:border-[#4CAF4F]"
                >
                  {submissions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {criteria.map((c) => (
                  <div key={c.id} className="bg-[#F5F7FA] p-3 rounded space-y-1">
                    <label className="block text-xs font-semibold text-[#4D4D4D]">
                      {c.name} (max {c.maxScore})
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={c.maxScore}
                      value={scoreInputs[c.id] ?? Math.round(c.maxScore * 0.8)}
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
                placeholder="Judge feedback for the team..."
                className="w-full text-sm border border-gray-200 rounded px-3 py-2"
              />

              <button
                type="submit"
                className="bg-[#4CAF4F] hover:bg-[#43A046] text-white text-xs font-medium px-4 py-2 rounded cursor-pointer"
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
              <Award className="h-4 w-4 text-[#4CAF4F]" />
              Submissions ({submissions.length})
            </h2>
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
                    <p className="text-xs text-[#717171]">{s.description}</p>
                  </div>
                  <button
                    onClick={() => handleAssignSelfOrJudge(s.id)}
                    className="text-xs px-3 py-1.5 rounded bg-white border border-gray-300 text-[#4D4D4D] hover:border-[#4CAF4F] cursor-pointer"
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
          <Trophy className="h-4 w-4 text-[#4CAF4F]" />
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
                  <span className="h-7 w-7 rounded-full bg-[#E8F5E9] text-[#4CAF4F] font-bold text-xs flex items-center justify-center">
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
                  <p className="font-bold text-[#4CAF4F]">
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
