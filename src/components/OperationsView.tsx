'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import {
  AlertTriangle,
  Camera,
  CameraOff,
  CheckCircle2,
  CreditCard,
  MapPin,
  Plus,
  QrCode,
  Server,
  Users,
  Volume2,
  VolumeX,
  XCircle,
} from 'lucide-react';
import DemoIdCardsSection from '@/components/DemoIdCardsSection';
import { playErrorTone, playSuccessTing } from '@/lib/audio/scanSounds';
import { CampusEvent, CollegeIdCard, UserRole, Venue } from '@/types/domain';

interface CheckInRecord {
  id: string;
  checkInTime: string;
  checkInMethod: string;
  attendeeName: string;
  attendeeEmail: string;
  college: string;
  ticketCode: string;
}

interface ScanFeedback {
  status:
    | 'VALID'
    | 'ATTENDANCE_MARKED'
    | 'ALREADY_CHECKED_IN'
    | 'INVALID_TICKET'
    | 'INVALID_STUDENT'
    | 'STUDENT_IDENTIFIED_NOT_REGISTERED';
  message: string;
  timestamp?: string;
  eventTitle?: string;
  attendee?: {
    name: string;
    email: string;
    college: string | null;
    ticketCode?: string;
    usn?: string | null;
    department?: string | null;
    year?: number | null;
  };
}

type ScanLifecycleStatus =
  | 'Idle'
  | 'Scanning'
  | 'Barcode Detected'
  | 'Student Found'
  | 'Student Not Found';

interface OperationsViewProps {
  role: UserRole;
  events: CampusEvent[];
  venues: Venue[];
  dataMode: 'supabase' | 'local_seed';
  onVenueAdded: (venue: Venue) => void;
}

export default function OperationsView({
  role,
  events,
  venues,
  dataMode,
  onVenueAdded,
}: OperationsViewProps) {
  const [scannerMode, setScannerMode] = useState<'qr_pass' | 'college_id'>(
    'qr_pass'
  );
  const [selectedEventId, setSelectedEventId] = useState(events[0]?.id ?? '');
  const effectiveEventId = selectedEventId || events[0]?.id || '';
  const [manualInput, setManualInput] = useState('');
  const [lastDecodedValue, setLastDecodedValue] = useState<string | null>(null);
  const [scanStatus, setScanStatus] = useState<ScanLifecycleStatus>('Idle');
  const [scanResult, setScanResult] = useState<ScanFeedback | null>(null);
  const [attendanceCount, setAttendanceCount] = useState(0);
  const [totalRegistrations, setTotalRegistrations] = useState(0);
  const [records, setRecords] = useState<CheckInRecord[]>([]);
  const [demoCards, setDemoCards] = useState<CollegeIdCard[]>([]);
  const [muted, setMuted] = useState(false);

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const processingRef = useRef(false);

  const [venueName, setVenueName] = useState('');
  const [building, setBuilding] = useState('');
  const [capacity, setCapacity] = useState(100);

  const isOrganizerOrAdmin =
    role === 'club_organizer' || role === 'college_admin';

  const loadAttendance = useCallback(async () => {
    if (!effectiveEventId || !isOrganizerOrAdmin) return;
    const res = await fetch(`/api/events/${effectiveEventId}/checkin`, {
      headers: { 'x-demo-role': role },
    });
    if (!res.ok) return;
    const data = await res.json();
    setAttendanceCount(data.count ?? 0);
    setTotalRegistrations(data.totalRegistrations ?? 0);
    setRecords(data.records ?? []);
  }, [effectiveEventId, isOrganizerOrAdmin, role]);

  useEffect(() => {
    if (!effectiveEventId || !isOrganizerOrAdmin) return;
    let active = true;
    fetch(`/api/events/${effectiveEventId}/checkin`, {
      headers: { 'x-demo-role': role },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!active || !data) return;
        setAttendanceCount(data.count ?? 0);
        setTotalRegistrations(data.totalRegistrations ?? 0);
        setRecords(data.records ?? []);
      });
    return () => {
      active = false;
    };
  }, [effectiveEventId, isOrganizerOrAdmin, role]);

  useEffect(() => {
    if (!isOrganizerOrAdmin) return;
    let active = true;
    fetch(
      `/api/events/${effectiveEventId || 'evt-ai-hackathon'}/college-id-checkin`,
      {
        headers: { 'x-demo-role': role },
      }
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!active || !data) return;
        setDemoCards(data.cards ?? []);
      });
    return () => {
      active = false;
    };
  }, [effectiveEventId, isOrganizerOrAdmin, role]);

  const stopCamera = useCallback(() => {
    if (controlsRef.current) {
      try {
        controlsRef.current.stop();
      } catch {
        // ignore stop errors
      }
      controlsRef.current = null;
    }
    setCameraActive(false);
  }, []);

  useEffect(() => {
    return () => {
      if (controlsRef.current) {
        try {
          controlsRef.current.stop();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  const handleScanCode = useCallback(
    async (
      codeValue: string,
      method: 'qr' | 'manual' | 'barcode',
      modeOverride?: 'qr_pass' | 'college_id'
    ) => {
      const normalized = String(codeValue ?? '').trim();
      if (!effectiveEventId || !normalized || processingRef.current) {
        return;
      }

      processingRef.current = true;
      setLastDecodedValue(normalized);
      setScanStatus('Barcode Detected');
      const activeMode = modeOverride ?? scannerMode;

      console.log('[ZXing Scanner] Processing decoded code:', {
        mode: activeMode,
        method,
        eventId: effectiveEventId,
        code: normalized,
      });

      try {
        if (activeMode === 'college_id') {
          const res = await fetch(
            `/api/events/${effectiveEventId}/college-id-checkin`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-demo-role': role,
              },
              body: JSON.stringify({
                barcodeOrUsn: normalized,
                method: method === 'manual' ? 'manual' : 'barcode',
              }),
            }
          );
          const data = await res.json();

          if (data.status === 'ATTENDANCE_MARKED' || data.status === 'VALID') {
            setScanStatus('Student Found');
            playSuccessTing(muted);
            setScanResult({
              status: 'ATTENDANCE_MARKED',
              message: 'Student identified and attendance marked.',
              timestamp: data.checkInTime,
              eventTitle: data.eventTitle,
              attendee: data.student,
            });
            await loadAttendance();
          } else if (data.status === 'ALREADY_CHECKED_IN') {
            setScanStatus('Student Found');
            playSuccessTing(muted);
            setScanResult({
              status: 'ALREADY_CHECKED_IN',
              message: 'Duplicate scan rejected — already checked in.',
              timestamp: data.checkInTime,
              eventTitle: data.eventTitle,
              attendee: data.student,
            });
          } else if (
            data.status === 'STUDENT_IDENTIFIED_NOT_REGISTERED' ||
            data.status === 'NOT_REGISTERED'
          ) {
            setScanStatus('Student Found');
            playSuccessTing(muted);
            setScanResult({
              status: 'STUDENT_IDENTIFIED_NOT_REGISTERED',
              message:
                'Student identified, but not registered for this event. Attendance was not marked.',
              eventTitle: data.eventTitle,
              attendee: data.student,
            });
          } else {
            setScanStatus('Student Not Found');
            playErrorTone(muted);
            setScanResult({
              status: 'INVALID_STUDENT',
              message: data.error ?? 'No matching student ID found.',
            });
          }
          return;
        }

        // Existing QR Event Pass Scanner flow
        const res = await fetch(`/api/events/${effectiveEventId}/checkin`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-demo-role': role,
          },
          body: JSON.stringify({
            qrToken: method === 'qr' ? normalized : undefined,
            ticketCode: method === 'manual' ? normalized : undefined,
            method: method === 'manual' ? 'manual' : 'qr',
          }),
        });
        const data = await res.json();

        if (data.status === 'VALID') {
          setScanStatus('Student Found');
          playSuccessTing(muted);
          setScanResult({
            status: 'VALID',
            message: 'Check-in verified and recorded.',
            timestamp:
              data.attendance?.check_in_time ?? data.attendance?.checkInTime,
            attendee: data.attendee,
          });
          await loadAttendance();
        } else if (data.status === 'ALREADY_CHECKED_IN') {
          setScanStatus('Student Found');
          playSuccessTing(muted);
          setScanResult({
            status: 'ALREADY_CHECKED_IN',
            message: 'Duplicate scan rejected — attendee already checked in.',
            timestamp:
              data.attendance?.check_in_time ?? data.attendance?.checkInTime,
            attendee: data.attendee,
          });
        } else {
          setScanStatus('Student Not Found');
          playErrorTone(muted);
          setScanResult({
            status: 'INVALID_TICKET',
            message:
              data.error ??
              'Invalid ticket for this event. (If scanning a College ID barcode like 19764, switch to the "College ID Scanner" tab above.)',
          });
        }
      } finally {
        setTimeout(() => {
          processingRef.current = false;
        }, 1000);
      }
    },
    [effectiveEventId, loadAttendance, muted, role, scannerMode]
  );

  const startCamera = async () => {
    setCameraError(null);
    stopCamera();
    setCameraActive(true);
    setScanStatus('Scanning');

    try {
      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.QR_CODE,
        BarcodeFormat.CODE_128,
        BarcodeFormat.CODE_39,
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.ITF,
        BarcodeFormat.CODABAR,
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
      ]);
      hints.set(DecodeHintType.TRY_HARDER, true);

      const reader = new BrowserMultiFormatReader(hints, {
        delayBetweenScanAttempts: 120,
      });

      if (!videoRef.current) {
        throw new Error('Video element not mounted');
      }

      const controls = await reader.decodeFromConstraints(
        {
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        },
        videoRef.current,
        (result) => {
          if (result && !processingRef.current) {
            const decodedText = result.getText();
            const formatName = result.getBarcodeFormat();
            console.log('[ZXing Scanner] Decoded:', {
              decodedText,
              format: formatName,
            });
            stopCamera();
            void handleScanCode(
              decodedText,
              scannerMode === 'college_id' ? 'barcode' : 'qr'
            );
          }
        }
      );

      controlsRef.current = controls;
    } catch (err) {
      setCameraActive(false);
      setScanStatus('Idle');
      setCameraError(
        err instanceof Error
          ? `Camera unavailable or permission denied (${err.message}). Use manual entry below.`
          : 'Camera permission denied. Use manual entry below.'
      );
    }
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await handleScanCode(manualInput, 'manual');
    setManualInput('');
  };

  const handleAddVenue = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/venues', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-demo-role': role,
      },
      body: JSON.stringify({
        name: venueName,
        building,
        capacity,
      }),
    });
    const data = await res.json();
    if (res.ok && data.venue) {
      onVenueAdded(data.venue);
      setVenueName('');
      setBuilding('');
    }
  };

  return (
    <div className="py-10 max-w-5xl mx-auto px-6 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold text-[#4D4D4D]">
            Organizer & Admin Operations
          </h1>
          <p className="text-sm text-[#717171]">
            QR Event Pass Scanner, College ID Barcode Scanner, and venue
            inventory
          </p>
        </div>

        <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-[#E8F5E9] text-[#4CAF4F] font-medium self-start">
          <Server className="h-3.5 w-3.5" />
          Backend:{' '}
          {dataMode === 'supabase' ? 'Supabase PostgreSQL' : 'Local API Store'}
        </span>
      </div>

      {/* Organizer Scanner Card */}
      {isOrganizerOrAdmin && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-5">
          {/* Mode Switcher + Event Selector + Sound Mute + Live Counter */}
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="inline-flex rounded-lg border border-gray-200 bg-[#F5F7FA] p-1 text-xs font-medium self-start">
              <button
                type="button"
                onClick={() => {
                  setScannerMode('qr_pass');
                  setScanResult(null);
                  setScanStatus(cameraActive ? 'Scanning' : 'Idle');
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md cursor-pointer transition ${
                  scannerMode === 'qr_pass'
                    ? 'bg-white text-[#4CAF4F] shadow-xs font-semibold'
                    : 'text-[#717171]'
                }`}
              >
                <QrCode className="h-3.5 w-3.5" />
                QR Event Pass
              </button>
              <button
                type="button"
                onClick={() => {
                  setScannerMode('college_id');
                  setScanResult(null);
                  setScanStatus(cameraActive ? 'Scanning' : 'Idle');
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md cursor-pointer transition ${
                  scannerMode === 'college_id'
                    ? 'bg-white text-[#4CAF4F] shadow-xs font-semibold'
                    : 'text-[#717171]'
                }`}
              >
                <CreditCard className="h-3.5 w-3.5" />
                College ID Scanner
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <select
                value={effectiveEventId}
                onChange={(e) => {
                  setSelectedEventId(e.target.value);
                  setScanResult(null);
                }}
                className="text-sm border border-gray-200 rounded px-3 py-2 bg-white"
              >
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.title}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => setMuted((m) => !m)}
                title={muted ? 'Unmute scan sound' : 'Mute scan sound'}
                className="inline-flex items-center gap-1 text-xs px-3 py-2 rounded border border-gray-200 bg-white text-[#4D4D4D] hover:bg-gray-50 cursor-pointer"
              >
                {muted ? (
                  <VolumeX className="h-4 w-4 text-gray-400" />
                ) : (
                  <Volume2 className="h-4 w-4 text-[#4CAF4F]" />
                )}
                <span>{muted ? 'Muted' : 'Sound On'}</span>
              </button>

              <div className="px-3.5 py-2 rounded bg-[#E8F5E9] text-[#263238] text-xs font-semibold flex items-center gap-1.5">
                <Users className="h-4 w-4 text-[#4CAF4F]" />
                <span>
                  Checked In: {attendanceCount}
                  {totalRegistrations > 0 ? ` / ${totalRegistrations}` : ''}
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* ZXing HD Camera Scanner */}
            <div className="bg-[#F5F7FA] border border-gray-200 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-[#4D4D4D]">
                    {scannerMode === 'college_id'
                      ? 'ZXing 1D Barcode & QR Camera'
                      : 'ZXing QR Pass Camera'}
                  </span>
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                      scanStatus === 'Scanning'
                        ? 'bg-blue-100 text-blue-700'
                        : scanStatus === 'Barcode Detected'
                        ? 'bg-amber-100 text-amber-800'
                        : scanStatus === 'Student Found'
                        ? 'bg-[#E8F5E9] text-[#4CAF4F]'
                        : scanStatus === 'Student Not Found'
                        ? 'bg-rose-100 text-rose-700'
                        : 'bg-gray-200 text-gray-600'
                    }`}
                  >
                    {scanStatus}
                  </span>
                </div>

                {cameraActive ? (
                  <button
                    type="button"
                    onClick={() => {
                      stopCamera();
                      setScanStatus('Idle');
                    }}
                    className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded bg-rose-600 text-white font-medium cursor-pointer"
                  >
                    <CameraOff className="h-3.5 w-3.5" />
                    Stop Camera
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void startCamera()}
                    className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded bg-[#4CAF4F] hover:bg-[#43A046] text-white font-medium cursor-pointer"
                  >
                    <Camera className="h-3.5 w-3.5" />
                    Start Camera
                  </button>
                )}
              </div>

              <div className="relative w-full h-[240px] bg-black/90 rounded border border-gray-300 overflow-hidden flex items-center justify-center">
                <video
                  ref={videoRef}
                  className={`w-full h-full object-cover ${
                    cameraActive ? 'block' : 'hidden'
                  }`}
                  muted
                  playsInline
                />
                {!cameraActive && (
                  <p className="text-xs text-gray-300 px-4 text-center">
                    {scannerMode === 'college_id'
                      ? 'Click "Start Camera" and hold the College ID barcode steadily in view'
                      : 'Click "Start Camera" to scan a QR pass'}
                  </p>
                )}
              </div>

              {cameraError && (
                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2.5">
                  {cameraError}
                </p>
              )}
            </div>

            {/* Manual Fallback & Scan Result UI */}
            <div className="space-y-4">
              <form
                onSubmit={handleManualSubmit}
                className="bg-[#F5F7FA] border border-gray-200 rounded-lg p-4 space-y-3"
              >
                <label className="block text-xs font-semibold text-[#4D4D4D]">
                  {scannerMode === 'college_id'
                    ? 'Manual Barcode / USN Fallback'
                    : 'Manual Ticket ID / Token Fallback'}
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    value={manualInput}
                    onChange={(e) => setManualInput(e.target.value)}
                    placeholder={
                      scannerMode === 'college_id'
                        ? 'e.g., 19764 or 1BY25EC137'
                        : 'e.g., TKT-AI2026 or QR token'
                    }
                    className="flex-1 text-sm bg-white border border-gray-200 rounded px-3 py-2"
                  />
                  <button
                    type="submit"
                    className="bg-[#4CAF4F] hover:bg-[#43A046] text-white text-xs font-medium px-4 py-2 rounded cursor-pointer"
                  >
                    Verify
                  </button>
                </div>
              </form>

              {lastDecodedValue && (
                <div className="rounded bg-slate-100 border border-gray-200 px-3 py-2 text-xs text-[#4D4D4D] flex items-center justify-between">
                  <span>Last scanned / entered value:</span>
                  <code className="font-mono font-semibold">
                    {lastDecodedValue}
                  </code>
                </div>
              )}

              {scanResult && (
                <div
                  className={`rounded-xl border p-5 space-y-2 text-xs ${
                    scanResult.status === 'VALID' ||
                    scanResult.status === 'ATTENDANCE_MARKED'
                      ? 'bg-[#E8F5E9] border-[#4CAF4F]/40 text-[#263238]'
                      : scanResult.status === 'ALREADY_CHECKED_IN' ||
                        scanResult.status ===
                          'STUDENT_IDENTIFIED_NOT_REGISTERED'
                      ? 'bg-amber-50 border-amber-300 text-amber-950'
                      : 'bg-rose-50 border-rose-300 text-rose-900'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 font-bold text-sm">
                      {(scanResult.status === 'VALID' ||
                        scanResult.status === 'ATTENDANCE_MARKED') && (
                        <CheckCircle2 className="h-5 w-5 text-[#4CAF4F]" />
                      )}
                      {(scanResult.status === 'ALREADY_CHECKED_IN' ||
                        scanResult.status ===
                          'STUDENT_IDENTIFIED_NOT_REGISTERED') && (
                        <AlertTriangle className="h-5 w-5 text-amber-600" />
                      )}
                      {(scanResult.status === 'INVALID_TICKET' ||
                        scanResult.status === 'INVALID_STUDENT') && (
                        <XCircle className="h-5 w-5 text-rose-600" />
                      )}
                      <span>
                        {scanResult.status ===
                        'STUDENT_IDENTIFIED_NOT_REGISTERED'
                          ? 'STUDENT IDENTIFIED — NOT REGISTERED'
                          : scanResult.status.replace(/_/g, ' ')}
                      </span>
                    </div>
                    {scanResult.eventTitle && (
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-white/70">
                        {scanResult.eventTitle}
                      </span>
                    )}
                  </div>

                  {scanResult.attendee && (
                    <div className="pt-1 space-y-1">
                      <p className="text-xl font-bold tracking-tight">
                        {scanResult.attendee.name}
                      </p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                        {scanResult.attendee.usn && (
                          <span className="font-mono font-semibold">
                            USN: {scanResult.attendee.usn}
                          </span>
                        )}
                        {scanResult.attendee.department && (
                          <span>
                            {scanResult.attendee.department} · Year{' '}
                            {scanResult.attendee.year}
                          </span>
                        )}
                        {scanResult.attendee.ticketCode && (
                          <span className="font-mono">
                            Ticket: {scanResult.attendee.ticketCode}
                          </span>
                        )}
                      </div>
                      {scanResult.attendee.college && (
                        <p className="opacity-85">
                          {scanResult.attendee.college}
                        </p>
                      )}
                    </div>
                  )}

                  <p className="pt-1 font-medium">{scanResult.message}</p>
                  {scanResult.timestamp && (
                    <p className="text-[11px] opacity-80">
                      Check-in timestamp:{' '}
                      {new Date(scanResult.timestamp).toLocaleString('en-IN')}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Recent Check-in Log */}
          {records.length > 0 && (
            <div className="pt-3 border-t border-gray-100 space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#717171]">
                Recent Check-Ins ({records.length})
              </h3>
              <div className="divide-y divide-gray-100 text-xs">
                {records.slice(0, 8).map((r) => (
                  <div
                    key={r.id}
                    className="py-2 flex items-center justify-between gap-2"
                  >
                    <div>
                      <span className="font-semibold text-[#4D4D4D]">
                        {r.attendeeName}
                      </span>{' '}
                      {r.ticketCode && (
                        <span className="font-mono text-[#717171]">
                          ({r.ticketCode})
                        </span>
                      )}
                    </div>
                    <span className="text-[#717171]">
                      {new Date(r.checkInTime).toLocaleTimeString('en-IN')} ·{' '}
                      {r.checkInMethod.toUpperCase()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Demo ID Cards Section */}
      {isOrganizerOrAdmin && scannerMode === 'college_id' && (
        <DemoIdCardsSection
          cards={demoCards}
          onQuickTestScan={(barcodeToken) =>
            void handleScanCode(barcodeToken, 'barcode', 'college_id')
          }
        />
      )}

      {/* Venue Inventory */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
        <h2 className="text-base font-semibold text-[#4D4D4D] flex items-center gap-2">
          <MapPin className="h-4 w-4 text-[#4CAF4F]" />
          Campus Venue Inventory ({venues.length})
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {venues.map((v) => (
            <div
              key={v.id}
              className="bg-[#F5F7FA] rounded p-4 border border-gray-100 space-y-1"
            >
              <div className="flex items-center justify-between">
                <p className="font-semibold text-sm text-[#4D4D4D]">{v.name}</p>
                <span className="text-xs text-[#4CAF4F] font-medium">
                  Cap {v.capacity}
                </span>
              </div>
              <p className="text-xs text-[#717171]">{v.building}</p>
              <p className="text-[11px] text-[#717171]">
                {v.equipment.join(' · ')}
              </p>
            </div>
          ))}
        </div>

        {role === 'college_admin' && (
          <form
            onSubmit={handleAddVenue}
            className="pt-4 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-4 gap-3"
          >
            <input
              type="text"
              required
              value={venueName}
              onChange={(e) => setVenueName(e.target.value)}
              placeholder="New venue name"
              className="text-xs border border-gray-200 rounded px-3 py-2"
            />
            <input
              type="text"
              required
              value={building}
              onChange={(e) => setBuilding(e.target.value)}
              placeholder="Building / Wing"
              className="text-xs border border-gray-200 rounded px-3 py-2"
            />
            <input
              type="number"
              min={10}
              value={capacity}
              onChange={(e) => setCapacity(Number(e.target.value))}
              className="text-xs border border-gray-200 rounded px-3 py-2"
            />
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-1 bg-[#4CAF4F] hover:bg-[#43A046] text-white text-xs font-medium px-3 py-2 rounded cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Venue
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
