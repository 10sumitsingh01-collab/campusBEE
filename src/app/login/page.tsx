'use client';

import React, { useEffect, useState } from 'react';
import AuthModal from '@/components/AuthModal';
import UnstopDiscoveryView from '@/components/UnstopDiscoveryView';
import { CampusEvent, Club, UserRole, Venue } from '@/types/domain';

export default function LoginPage() {
  const [events, setEvents] = useState<CampusEvent[]>([]);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [entryRole, setEntryRole] = useState<UserRole>('student');
  const [modalOpen, setModalOpen] = useState(true);
  const [modalMode, setModalMode] = useState<'signup' | 'signin'>('signin');
  const [selectedEvent, setSelectedEvent] = useState<CampusEvent | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/public/discover')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!active || !data) return;
        setClubs(data.clubs ?? []);
        setVenues(data.venues ?? []);
        setEvents(data.events ?? []);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <>
      <UnstopDiscoveryView
        events={events}
        clubs={clubs}
        venues={venues}
        onSelectEvent={(ev) => {
          setEntryRole('student');
          setSelectedEvent(ev);
          setModalMode('signup');
          setModalOpen(true);
        }}
        onOpenLogin={() => {
          setEntryRole('student');
          setSelectedEvent(null);
          setModalMode('signin');
          setModalOpen(true);
        }}
        onOpenSignup={() => {
          setEntryRole('club_organizer');
          setSelectedEvent(null);
          setModalMode('signup');
          setModalOpen(true);
        }}
      />
      {modalOpen && (
        <AuthModal
          initialRole={entryRole}
          initialMode={modalMode}
          selectedEvent={selectedEvent}
          onClose={() => setModalOpen(false)}
          onAuthenticated={(role) => {
            if (selectedEvent && role === 'student') window.sessionStorage.setItem('campusos_registration_event', selectedEvent.id);
            window.location.replace('/');
          }}
        />
      )}
    </>
  );
}
