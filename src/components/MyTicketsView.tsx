'use client';

import React, { useEffect, useState } from 'react';
import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import {
  Calendar,
  CheckCircle2,
  Download,
  MapPin,
  Ticket,
} from 'lucide-react';
import { EventTicket } from '@/types/domain';

interface MyTicketsViewProps {
  role: string;
}

export default function MyTicketsView({ role }: MyTicketsViewProps) {
  const [tickets, setTickets] = useState<EventTicket[]>([]);
  const [qrImages, setQrImages] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/tickets', {
      headers: { 'x-demo-role': role },
    })
      .then(async (r) => {
        const body = await r.json().catch(() => null);
        if (!r.ok) {
          throw new Error(body?.error ?? `Failed to load tickets (${r.status})`);
        }
        return body;
      })
      .then(async (data) => {
        if (!active || !data) return;
        const list: EventTicket[] = data.tickets ?? [];
        setTickets(list);

        const images: Record<string, string> = {};
        for (const t of list) {
          if (t.qrToken) {
            images[t.id] = await QRCode.toDataURL(t.qrToken, {
              width: 240,
              margin: 2,
            });
          }
        }
        if (active) {
          setQrImages(images);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (active) {
          setErrorMsg(
            err instanceof Error ? err.message : 'Unable to load tickets.'
          );
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [role]);

  const handleDownloadPdf = (ticket: EventTicket) => {
    const doc = new jsPDF({ unit: 'pt', format: 'a5' });

    doc.setFillColor(28, 73, 128);
    doc.rect(0, 0, 420, 72, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.text('CampusOS Event Pass', 28, 36);
    doc.setFontSize(10);
    doc.text(`Ticket ID: ${ticket.ticketCode}`, 28, 54);

    doc.setTextColor(38, 50, 56);
    doc.setFontSize(15);
    doc.text(ticket.eventTitle, 28, 108);

    doc.setFontSize(10);
    doc.setTextColor(90, 90, 90);
    const dateStr = new Date(ticket.eventStartTime).toLocaleString('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
    doc.text(`Date & Time: ${dateStr}`, 28, 132);
    doc.text(`Venue: ${ticket.venueName} (${ticket.venueBuilding})`, 28, 150);

    doc.setDrawColor(220, 220, 220);
    doc.line(28, 168, 392, 168);

    doc.setTextColor(38, 50, 56);
    doc.setFontSize(11);
    doc.text(`Attendee: ${ticket.attendeeName}`, 28, 192);
    doc.text(`Email: ${ticket.attendeeEmail}`, 28, 210);
    if (ticket.college) doc.text(`College: ${ticket.college}`, 28, 228);
    if (ticket.phone) doc.text(`Phone: ${ticket.phone}`, 28, 246);

    const qrDataUrl = qrImages[ticket.id];
    if (qrDataUrl) {
      doc.addImage(qrDataUrl, 'PNG', 120, 276, 180, 180);
    }

    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.text(
      'Present this QR pass at the venue entrance for organizer check-in.',
      28,
      485
    );

    doc.save(`${ticket.ticketCode}.pdf`);
  };

  return (
    <div className="py-10 max-w-5xl mx-auto px-6 space-y-8">
      <div className="space-y-1">
        <h1 className="text-3xl font-semibold text-[#4D4D4D]">My Tickets</h1>
        <p className="text-sm text-[#717171]">
          Your Smart QR Event Passes for registered campus events
        </p>
      </div>

      {loading ? (
        <div className="bg-[#F5F7FA] rounded-lg p-10 text-center text-sm text-[#717171]">
          Loading your event passes...
        </div>
      ) : errorMsg ? (
        <div className="bg-rose-50 border border-rose-200 rounded-lg p-6 text-sm text-rose-800 space-y-1">
          <p className="font-semibold">Could not load tickets</p>
          <p className="text-xs">{errorMsg}</p>
        </div>
      ) : tickets.length === 0 ? (
        <div className="bg-[#F5F7FA] border border-gray-200 rounded-lg p-10 text-center space-y-2">
          <Ticket className="h-8 w-8 text-[#4CAF4F] mx-auto" />
          <p className="text-sm font-medium text-[#4D4D4D]">
            No event passes yet
          </p>
          <p className="text-xs text-[#717171]">
            Register for an event in My Teams & Registrations to generate your
            QR ticket.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {tickets.map((t) => (
            <div
              key={t.id}
              className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-xs flex flex-col justify-between"
            >
              <div className="bg-[#1C4980] text-white px-5 py-4 flex items-center justify-between">
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-blue-200">
                    Smart QR Event Pass
                  </p>
                  <h2 className="text-lg font-bold">{t.eventTitle}</h2>
                </div>
                <span className="text-xs font-mono bg-white/15 px-2.5 py-1 rounded">
                  {t.ticketCode}
                </span>
              </div>

              <div className="p-5 grid grid-cols-1 sm:grid-cols-12 gap-4 items-center">
                <div className="sm:col-span-7 space-y-2 text-xs text-[#4D4D4D]">
                  <p className="text-sm font-semibold">{t.attendeeName}</p>
                  <p className="text-[#717171]">{t.attendeeEmail}</p>
                  {t.college && (
                    <p className="text-[#717171]">College: {t.college}</p>
                  )}
                  {t.phone && <p className="text-[#717171]">Phone: {t.phone}</p>}

                  <div className="pt-2 space-y-1 text-[#717171]">
                    <p className="flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 text-[#4CAF4F]" />
                      {new Date(t.eventStartTime).toLocaleString('en-IN', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </p>
                    <p className="flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-[#4CAF4F]" />
                      {t.venueName}
                    </p>
                  </div>

                  {t.checkedInAt && (
                    <span className="inline-flex items-center gap-1 mt-2 text-[11px] px-2.5 py-1 rounded bg-[#E8F5E9] text-[#4CAF4F] font-semibold">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Checked In
                    </span>
                  )}
                </div>

                <div className="sm:col-span-5 flex flex-col items-center justify-center bg-[#F5F7FA] rounded-lg p-3">
                  {qrImages[t.id] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={qrImages[t.id]}
                      alt={`QR pass for ${t.ticketCode}`}
                      className="w-36 h-36 rounded"
                    />
                  ) : (
                    <div className="w-36 h-36 flex items-center justify-center text-xs text-gray-400">
                      Generating QR...
                    </div>
                  )}
                </div>
              </div>

              <div className="px-5 py-3 bg-[#F5F7FA] border-t border-gray-100 flex items-center justify-between">
                <span className="text-[11px] text-[#717171]">
                  Token secured · No PII in QR
                </span>
                <button
                  type="button"
                  onClick={() => handleDownloadPdf(t)}
                  className="inline-flex items-center gap-1.5 bg-[#4CAF4F] hover:bg-[#43A046] text-white text-xs font-medium px-3.5 py-1.5 rounded transition cursor-pointer"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download PDF
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
