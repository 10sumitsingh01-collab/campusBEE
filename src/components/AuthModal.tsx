'use client';

import React, { useState } from 'react';
import { X } from 'lucide-react';
import { ROLE_LABELS } from '@/lib/auth/roles';
import { createClient } from '@/lib/supabase/client';
import { CampusEvent, UserRole } from '@/types/domain';

const ROLE_OPTIONS: { value: UserRole; label: string; hint: string }[] = [
  { value: 'student', label: 'Student', hint: 'Discover events & join teams' },
  {
    value: 'club_organizer',
    label: 'Club Organizer',
    hint: 'Host events & use Crew Sync',
  },
  { value: 'judge', label: 'Judge', hint: 'Evaluate submissions & score' },
  {
    value: 'college_admin',
    label: 'College Admin',
    hint: 'Manage venues & approvals',
  },
];

interface AuthModalProps {
  initialMode?: 'signup' | 'signin';
  selectedEvent?: CampusEvent | null;
  onClose: () => void;
  onAuthenticated: (role: UserRole) => void;
}

export default function AuthModal({
  initialMode = 'signup',
  selectedEvent,
  onClose,
  onAuthenticated,
}: AuthModalProps) {
  const [mode, setMode] = useState<'signup' | 'signin'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [department, setDepartment] = useState('Computer Science');
  const [selectedRole, setSelectedRole] = useState<UserRole>('student');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);
    setLoading(true);

    const supabase = createClient();
    if (!supabase) {
      setStatusMessage('Supabase client is not configured in .env.local.');
      setLoading(false);
      return;
    }

    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              name: name.trim() || email.split('@')[0],
              department,
              role: selectedRole,
            },
          },
        });
        if (error) {
          setStatusMessage(error.message);
          return;
        }

        if (typeof window !== 'undefined') {
          window.localStorage.setItem('campusos_preferred_role', selectedRole);
        }

        if (data.session && data.user) {
          await supabase.from('users').upsert({
            id: data.user.id,
            name: name.trim() || email.split('@')[0],
            email,
            department,
            role: selectedRole,
          });
          onAuthenticated(selectedRole);
          return;
        }

        setStatusMessage(
          `Registered as ${ROLE_LABELS[selectedRole]}! Please confirm your email, then switch to Sign In to continue.`
        );
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) {
          setStatusMessage(error.message);
          return;
        }

        const meta = data.user?.user_metadata as
          | { name?: string; department?: string; role?: UserRole }
          | undefined;

        const rememberedRole = meta?.role ?? 'student';
        if (data.user) {
          if (typeof window !== 'undefined') {
            window.localStorage.setItem(
              'campusos_preferred_role',
              rememberedRole
            );
          }

          await supabase.from('users').upsert(
            {
              id: data.user.id,
              name: meta?.name ?? email.split('@')[0],
              email: data.user.email ?? email,
              department: meta?.department ?? 'General',
              role: rememberedRole,
            },
            { onConflict: 'id', ignoreDuplicates: true }
          );
        }

        onAuthenticated(rememberedRole);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-[2px] flex items-center justify-center p-4">
      <div className="bg-white border border-gray-200 rounded-2xl max-w-md w-full p-7 shadow-2xl space-y-5 relative">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 text-gray-400 hover:text-gray-700 p-1 cursor-pointer"
          aria-label="Close sign up modal"
        >
          <X className="h-5 w-5" />
        </button>

        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg font-extrabold tracking-tight text-[#1C4980]">
              Campus<span className="text-[#0073E6]">OS</span>
            </span>
          </div>
          <h2 className="text-xl font-bold text-[#1C4980]">
            {mode === 'signup'
              ? selectedEvent
                ? `Continue to ${selectedEvent.title}`
                : 'Create your CampusOS account'
              : 'Welcome back'}
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {mode === 'signup'
              ? 'Select your role to continue'
              : 'Sign in with your registered college email'}
          </p>
        </div>

        {/* Mode Tabs */}
        <div className="grid grid-cols-2 bg-gray-100 p-1 rounded-lg text-xs font-semibold">
          <button
            type="button"
            onClick={() => {
              setMode('signup');
              setStatusMessage(null);
            }}
            className={`py-2 rounded-md transition cursor-pointer ${
              mode === 'signup'
                ? 'bg-white text-[#0073E6] shadow-xs'
                : 'text-gray-600'
            }`}
          >
            Sign Up
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('signin');
              setStatusMessage(null);
            }}
            className={`py-2 rounded-md transition cursor-pointer ${
              mode === 'signin'
                ? 'bg-white text-[#0073E6] shadow-xs'
                : 'text-gray-600'
            }`}
          >
            Sign In
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {mode === 'signup' && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                  Select Your Role
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {ROLE_OPTIONS.map((opt) => {
                    const active = selectedRole === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setSelectedRole(opt.value)}
                        className={`text-left p-2.5 rounded-xl border transition cursor-pointer ${
                          active
                            ? 'bg-[#EBF4FF] border-[#0073E6] text-[#1C4980]'
                            : 'bg-gray-50 border-gray-200 text-gray-700 hover:border-gray-300'
                        }`}
                      >
                        <p className="text-xs font-semibold">{opt.label}</p>
                        <p className="text-[11px] text-gray-500 leading-tight mt-0.5">
                          {opt.hint}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Full Name
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Aarav Sharma"
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#0073E6]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Department
                  </label>
                  <input
                    type="text"
                    required
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#0073E6]"
                  />
                </div>
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              College Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@campus.edu"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#0073E6]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimum 6 characters"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#0073E6]"
            />
          </div>

          {statusMessage && (
            <p className="text-xs text-gray-700 bg-blue-50 border border-blue-200 rounded-lg p-3">
              {statusMessage}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#0073E6] hover:bg-[#0060C2] disabled:opacity-60 text-white text-sm font-semibold py-2.5 rounded-full transition cursor-pointer"
          >
            {loading
              ? 'Please wait...'
              : mode === 'signup'
              ? `Continue as ${ROLE_LABELS[selectedRole]}`
              : 'Sign In & Continue'}
          </button>
        </form>
      </div>
    </div>
  );
}
