'use client';

import React, { useState } from 'react';
import { Award, CheckCircle2, Search, ShieldCheck, XCircle } from 'lucide-react';
import { CampusEvent, CertificateRecord, UserRole } from '@/types/domain';

interface CertificatesViewProps {
  role: UserRole;
  events: CampusEvent[];
}

export default function CertificatesView({
  role,
  events,
}: CertificatesViewProps) {
  const [selectedEventId, setSelectedEventId] = useState(events[0]?.id ?? '');
  const [certType, setCertType] =
    useState<CertificateRecord['type']>('participation');
  const [rankLabel, setRankLabel] = useState('');
  const [issuedCerts, setIssuedCerts] = useState<CertificateRecord[]>([]);
  const [verifyCode, setVerifyCode] = useState('');
  const [verifyResult, setVerifyResult] = useState<{
    valid: boolean;
    eventTitle?: string;
    clubName?: string;
    certificate?: CertificateRecord;
    error?: string;
  } | null>(null);

  const canIssue = role === 'club_organizer' || role === 'college_admin';

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch(
      `/api/events/${selectedEventId}/certificates/generate`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-demo-role': role,
        },
        body: JSON.stringify({
          type: certType,
          rankLabel: rankLabel.trim() || undefined,
        }),
      }
    );
    const data = await res.json();
    if (res.ok && data.certificate) {
      setIssuedCerts((prev) => [data.certificate, ...prev]);
      setVerifyCode(data.certificate.certificateCode);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyCode.trim()) return;
    const res = await fetch(
      `/api/certificates/verify/${encodeURIComponent(verifyCode.trim())}`
    );
    const data = await res.json();
    setVerifyResult(data);
  };

  return (
    <div className="work-page py-10 max-w-5xl mx-auto px-6 space-y-8">
      <div className="space-y-1">
        <h1 className="text-3xl font-semibold text-[#4D4D4D]">
          Certificates & Verification
        </h1>
        <p className="text-sm text-[#717171]">
          {role === 'student' ? 'Look up a certificate using its verification code.' : 'Verify certificates and issue them for completed events.'}
        </p>
      </div>

      {/* Verify Certificate */}
      <form
        onSubmit={handleVerify}
        className="bg-white border border-gray-200 rounded-lg p-6 space-y-4"
      >
        <h2 className="text-base font-semibold text-[#4D4D4D] flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-action" />
          Verify Certificate Code
        </h2>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="h-4 w-4 text-[#717171] absolute left-3 top-2.5" />
            <input
              type="text"
              value={verifyCode}
              onChange={(e) => setVerifyCode(e.target.value)}
              placeholder="Enter certificate code (e.g., COS-THON-A1B2C3)"
              className="w-full text-sm border border-gray-200 rounded pl-9 pr-3 py-2 focus:outline-none focus:border-action"
            />
          </div>
          <button
            type="submit"
            className="bg-action hover:bg-action-hover text-white text-sm font-medium px-5 py-2 rounded cursor-pointer"
          >
            Verify
          </button>
        </div>

        {verifyResult && (
          <div
            className={`rounded p-4 text-xs flex items-center gap-2 ${
              verifyResult.valid
                ? 'bg-action-tint text-[#263238]'
                : 'bg-rose-50 text-rose-800 border border-rose-200'
            }`}
          >
            {verifyResult.valid ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-action shrink-0" />
                <span>
                  Valid {verifyResult.certificate?.type} certificate for{' '}
                  <strong>{verifyResult.eventTitle}</strong> (
                  {verifyResult.clubName}) · Issued{' '}
                  {new Date(
                    verifyResult.certificate?.issuedAt ?? ''
                  ).toLocaleDateString('en-IN')}
                </span>
              </>
            ) : (
              <>
                <XCircle className="h-4 w-4 text-rose-600 shrink-0" />
                <span>{verifyResult.error ?? 'Invalid certificate code.'}</span>
              </>
            )}
          </div>
        )}
      </form>

      {/* Issue Certificate (Organizer / Admin) */}
      {canIssue && (
        <form
          onSubmit={handleGenerate}
          className="bg-white border border-gray-200 rounded-lg p-6 space-y-4"
        >
          <h2 className="text-base font-semibold text-[#4D4D4D] flex items-center gap-2">
            <Award className="h-4 w-4 text-action" />
            Issue Certificate
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <select
              value={selectedEventId}
              onChange={(e) => setSelectedEventId(e.target.value)}
              className="text-sm border border-gray-200 rounded px-3 py-2 bg-white"
            >
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.title}
                </option>
              ))}
            </select>

            <select
              value={certType}
              onChange={(e) =>
                setCertType(e.target.value as CertificateRecord['type'])
              }
              className="text-sm border border-gray-200 rounded px-3 py-2 bg-white"
            >
              <option value="participation">Participation</option>
              <option value="winner">Winner</option>
              <option value="volunteer">Volunteer</option>
            </select>

            <input
              type="text"
              value={rankLabel}
              onChange={(e) => setRankLabel(e.target.value)}
              placeholder="Rank label (e.g., 1st Place)"
              className="text-sm border border-gray-200 rounded px-3 py-2"
            />
          </div>
          <button
            type="submit"
            className="bg-action hover:bg-action-hover text-white text-xs font-medium px-4 py-2 rounded cursor-pointer"
          >
            Generate Verifiable Certificate
          </button>
        </form>
      )}

      {/* Issued Certificates */}
      {issuedCerts.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-3">
          <h2 className="text-base font-semibold text-[#4D4D4D]">
            Recently Issued ({issuedCerts.length})
          </h2>
          <div className="space-y-2">
            {issuedCerts.map((c) => (
              <div
                key={c.id}
                className="bg-[#F5F7FA] rounded p-3 flex items-center justify-between text-xs"
              >
                <div>
                  <p className="font-semibold text-[#4D4D4D] capitalize">
                    {c.type} {c.rankLabel ? `· ${c.rankLabel}` : ''}
                  </p>
                  <p className="text-[#717171]">
                    Code: <code className="font-mono">{c.certificateCode}</code>
                  </p>
                </div>
                <span className="text-action font-medium">Verified</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
