'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AuthModal from '@/components/AuthModal';
import UnstopDiscoveryView from '@/components/UnstopDiscoveryView';
import { CampusEvent, Club, Venue } from '@/types/domain';

export default function LoginPage() {
  const router = useRouter();
  const [events, setEvents] = useState<CampusEvent[]>([]);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [modalOpen, setModalOpen] = useState(true);
  const [modalMode, setModalMode] = useState<'signup' | 'signin'>('signup');
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
          setSelectedEvent(ev);
          setModalMode('signup');
          setModalOpen(true);
        }}
        onOpenLogin={() => {
          setSelectedEvent(null);
          setModalMode('signin');
          setModalOpen(true);
        }}
        onOpenSignup={() => {
          setSelectedEvent(null);
          setModalMode('signup');
          setModalOpen(true);
        }}
      />
      {modalOpen && (
        <AuthModal
          initialMode={modalMode}
          selectedEvent={selectedEvent}
          onClose={() => setModalOpen(false)}
          onAuthenticated={() => {
            setModalOpen(false);
            router.push('/');
            router.refresh();
          }}
        />
      )}
    </>
  );
}
