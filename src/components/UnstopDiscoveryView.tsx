'use client';

import React, { useMemo, useState } from 'react';
import {
  Award,
  Bot,
  Briefcase,
  Building2,
  Code2,
  Cpu,
  Heart,
  HelpCircle,
  Home,
  LogIn,
  Palette,
  Plus,
  Search,
  Sparkles,
  Trophy,
  Users,
} from 'lucide-react';
import { CampusEvent, Club, Venue } from '@/types/domain';

interface UnstopDiscoveryViewProps {
  events: CampusEvent[];
  clubs: Club[];
  venues: Venue[];
  onSelectEvent: (event: CampusEvent) => void;
  onOpenLogin: () => void;
  onOpenSignup: () => void;
}

const CARD_THEMES = [
  'from-[#0F3D5E] to-[#1C4980]',
  'from-[#1E293B] to-[#334155]',
  'from-[#311042] to-[#5B21B6]',
  'from-[#0B3B2E] to-[#047857]',
];

const CATEGORIES = [
  { id: 'all', label: 'All Events', icon: <Sparkles className="h-5 w-5 text-[#0073E6]" />, bg: 'bg-[#EBF4FF]' },
  { id: 'Hackathon', label: 'Hackathons', icon: <Code2 className="h-5 w-5 text-[#0073E6]" />, bg: 'bg-[#EBF4FF]' },
  { id: 'Workshop', label: 'Workshops', icon: <Cpu className="h-5 w-5 text-[#0073E6]" />, bg: 'bg-[#EBF4FF]' },
  { id: 'Competition', label: 'Competitions', icon: <Trophy className="h-5 w-5 text-[#F59E0B]" />, bg: 'bg-[#FEF3C7]/60' },
  { id: 'Design Jam', label: 'Design Jams', icon: <Palette className="h-5 w-5 text-[#7C3AED]" />, bg: 'bg-[#F3E8FF]' },
  { id: 'Clubs', label: 'Clubs', icon: <Building2 className="h-5 w-5 text-[#059669]" />, bg: 'bg-[#D1FAE5]/70' },
  { id: 'CrewSync', label: 'Crew Sync', icon: <Bot className="h-5 w-5 text-[#0073E6]" />, bg: 'bg-[#EBF4FF]' },
];

export default function UnstopDiscoveryView({
  events,
  clubs,
  venues,
  onSelectEvent,
  onOpenLogin,
  onOpenSignup,
}: UnstopDiscoveryViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  const getClubName = (id: string) =>
    clubs.find((c) => c.id === id)?.name ?? 'Campus Club';
  const getVenueName = (id: string) =>
    venues.find((v) => v.id === id)?.name ?? 'Campus Venue';

  const filteredEvents = useMemo(() => {
    return events.filter((ev) => {
      if (
        selectedCategory !== 'all' &&
        selectedCategory !== 'Clubs' &&
        selectedCategory !== 'CrewSync' &&
        ev.eventType !== selectedCategory
      ) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const hit =
          ev.title.toLowerCase().includes(q) ||
          ev.description.toLowerCase().includes(q) ||
          ev.tags.some((t) => t.toLowerCase().includes(q)) ||
          getClubName(ev.clubId).toLowerCase().includes(q);
        if (!hit) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, clubs, searchQuery, selectedCategory]);

  return (
    <div className="min-h-screen bg-[#F5F7FA] text-[#1C4980] flex flex-col md:flex-row">
      {/* Unstop-style Left White Sidebar */}
      <aside className="w-full md:w-56 bg-white border-b md:border-b-0 md:border-r border-gray-200/80 flex flex-col justify-between p-4 shrink-0">
        <div className="space-y-4">
          {/* Logo */}
          <div className="flex items-center justify-between px-1">
            <span className="text-xl font-extrabold tracking-tight text-[#1C4980]">
              campus<span className="text-[#0073E6]">os</span>
            </span>
          </div>

          {/* + Post Pill */}
          <button
            type="button"
            onClick={onOpenSignup}
            className="w-full flex items-center justify-center gap-1.5 py-2 px-4 rounded-full border border-[#0073E6]/40 text-[#1C4980] hover:bg-[#EBF4FF] text-sm font-medium transition cursor-pointer"
          >
            <Plus className="h-4 w-4 text-[#0073E6]" />
            <span>Post</span>
          </button>

          {/* Vertical Nav */}
          <nav className="flex md:flex-col gap-1 overflow-x-auto md:overflow-x-visible">
            {[
              { id: 'all', label: 'Home', icon: <Home className="h-4 w-4" /> },
              {
                id: 'Hackathon',
                label: 'Hackathons',
                icon: <Code2 className="h-4 w-4" />,
              },
              {
                id: 'Workshop',
                label: 'Workshops',
                icon: <Cpu className="h-4 w-4" />,
              },
              {
                id: 'Competition',
                label: 'Competitions',
                icon: <Trophy className="h-4 w-4" />,
              },
              {
                id: 'Design Jam',
                label: 'Design Jams',
                icon: <Palette className="h-4 w-4" />,
              },
              {
                id: 'Clubs',
                label: 'Campus Clubs',
                icon: <Building2 className="h-4 w-4" />,
              },
              {
                id: 'CrewSync',
                label: 'Crew Sync AI',
                icon: <Bot className="h-4 w-4" />,
              },
            ].map((item) => {
              const active = selectedCategory === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    if (item.id === 'CrewSync') {
                      onOpenSignup();
                    } else {
                      setSelectedCategory(item.id);
                    }
                  }}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition cursor-pointer ${
                    active
                      ? 'bg-[#EBF4FF] text-[#0073E6]'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom Sidebar Promo Cards (Unstop style) */}
        <div className="hidden md:space-y-2.5 md:block pt-4">
          <button
            type="button"
            onClick={onOpenSignup}
            className="w-full text-left p-3 rounded-xl bg-[#F5F7FA] hover:bg-[#EBF4FF]/60 transition cursor-pointer flex items-center justify-between gap-2"
          >
            <div>
              <p className="text-xs font-semibold text-[#1C4980]">
                Host a Campus Event
              </p>
              <p className="text-[10px] text-gray-500">
                Publish & check venue clashes
              </p>
            </div>
            <Briefcase className="h-4 w-4 text-[#0073E6] shrink-0" />
          </button>

          <button
            type="button"
            onClick={onOpenSignup}
            className="w-full text-left p-3 rounded-xl bg-[#F5F7FA] hover:bg-[#EBF4FF]/60 transition cursor-pointer flex items-center justify-between gap-2"
          >
            <div>
              <p className="text-xs font-semibold text-[#1C4980]">
                Volunteer on Campus
              </p>
              <p className="text-[10px] text-gray-500">
                Match skills to club events
              </p>
            </div>
            <Award className="h-4 w-4 text-[#7C3AED] shrink-0" />
          </button>
        </div>
      </aside>

      {/* Main Content Card */}
      <div className="flex-1 p-3 md:p-5 min-w-0">
        <div className="bg-white rounded-2xl border border-gray-200/70 min-h-full p-5 md:p-8 space-y-8 shadow-xs">
          {/* Top Search & Auth Header */}
          <header className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="hidden sm:block w-16" />

            <div className="relative w-full max-w-md">
              <Search className="h-4 w-4 text-gray-400 absolute left-3.5 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search events, clubs, or tags..."
                className="w-full text-sm bg-white border border-gray-200 rounded-full pl-10 pr-4 py-2 focus:outline-none focus:border-[#0073E6]"
              />
            </div>

            <div className="flex items-center gap-2.5 self-end sm:self-auto">
              <HelpCircle className="h-5 w-5 text-gray-400 hidden md:block" />
              <button
                type="button"
                onClick={onOpenSignup}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-gray-300 text-xs font-medium text-[#1C4980] hover:bg-gray-50 cursor-pointer"
              >
                <Users className="h-3.5 w-3.5 text-[#0073E6]" />
                For Clubs
              </button>
              <button
                type="button"
                onClick={onOpenLogin}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-[#0073E6] hover:bg-[#0060C2] text-white text-xs font-semibold transition cursor-pointer"
              >
                <LogIn className="h-3.5 w-3.5" />
                Login
              </button>
            </div>
          </header>

          {/* Hero Heading + Stat Pill */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-[#1C4980]">
              Unlock Your <span className="text-[#0073E6]">Campus!</span>
            </h1>
            <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#F3E8FF] text-[#6D28D9] text-xs font-medium self-start">
              <Sparkles className="h-3.5 w-3.5" />
              <span>
                {clubs.length} Active Clubs · {venues.length} Campus Venues
              </span>
            </div>
          </div>

          {/* Horizontal Category Tiles */}
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            {CATEGORIES.map((cat) => {
              const active = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    if (cat.id === 'CrewSync') {
                      onOpenSignup();
                    } else {
                      setSelectedCategory(cat.id);
                    }
                  }}
                  className={`rounded-xl p-3.5 flex flex-col items-center justify-center gap-2 text-center transition border cursor-pointer ${
                    cat.bg
                  } ${
                    active
                      ? 'border-[#0073E6] ring-1 ring-[#0073E6]'
                      : 'border-transparent hover:border-[#0073E6]/40'
                  }`}
                >
                  <span className="text-xs font-semibold text-[#1C4980]">
                    {cat.label}
                  </span>
                  <div className="h-9 w-9 rounded-lg bg-white/80 flex items-center justify-center shadow-2xs">
                    {cat.icon}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Featured Events Section */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-[#1C4980] flex items-center gap-2">
                <span className="h-5 w-1 bg-[#0073E6] rounded-full" />
                Featured
              </h2>
              <span className="text-xs text-gray-500">
                Select any event to register or sign in
              </span>
            </div>

            {filteredEvents.length === 0 ? (
              <div className="rounded-xl bg-[#F5F7FA] p-10 text-center text-sm text-gray-500">
                No matching events found. Try clearing your search.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {filteredEvents.map((ev, idx) => {
                  const gradient = CARD_THEMES[idx % CARD_THEMES.length];
                  const dateLabel = new Date(ev.startTime).toLocaleDateString(
                    'en-IN',
                    { day: 'numeric', month: 'short' }
                  );
                  return (
                    <button
                      key={ev.id}
                      type="button"
                      onClick={() => onSelectEvent(ev)}
                      className="text-left group rounded-2xl border border-gray-200 bg-white overflow-hidden hover:shadow-md hover:border-[#0073E6]/50 transition flex flex-col justify-between cursor-pointer"
                    >
                      {/* Poster Banner */}
                      <div
                        className={`bg-gradient-to-br ${gradient} p-5 text-white space-y-3 min-h-[168px] flex flex-col justify-between`}
                      >
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="px-2.5 py-0.5 rounded-full bg-white/15 backdrop-blur-xs font-medium">
                            {getClubName(ev.clubId)}
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-white/15 font-medium">
                            {dateLabel}
                          </span>
                        </div>

                        <div className="space-y-1">
                          <h3 className="text-xl font-extrabold leading-tight">
                            {ev.title}
                          </h3>
                          <p className="text-xs text-white/80 line-clamp-2">
                            {ev.description}
                          </p>
                        </div>

                        <div className="pt-1">
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-[#FACC15] text-[#1E293B]">
                            Register Now →
                          </span>
                        </div>
                      </div>

                      {/* Card Footer */}
                      <div className="p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-[11px] text-gray-600">
                            <span className="px-2 py-0.5 rounded-full bg-gray-100">
                              {getVenueName(ev.venueId)}
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-gray-100">
                              Free
                            </span>
                          </div>
                          <Heart className="h-4 w-4 text-gray-400 group-hover:text-rose-500 transition" />
                        </div>
                        <p className="text-sm font-semibold text-[#1C4980]">
                          {ev.title} · {ev.eventType}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* Trusted by Campus Clubs Strip */}
          <footer className="pt-4 border-t border-gray-100 text-center space-y-4">
            <p className="text-xs font-semibold text-gray-500">
              <span className="text-[#0073E6]">Trusted</span> by Campus Clubs &
              Organizers
            </p>
            <div className="flex flex-wrap items-center justify-center gap-8 text-xs font-semibold text-gray-400">
              {clubs.map((c) => (
                <span key={c.id} className="text-gray-600">
                  {c.name}
                </span>
              ))}
              {venues.slice(0, 2).map((v) => (
                <span key={v.id}>{v.name}</span>
              ))}
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
