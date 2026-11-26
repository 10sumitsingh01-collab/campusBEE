'use client';

import BeeLogo from './BeeLogo';

import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, Eye, EyeOff, Ticket, X } from 'lucide-react';
import { ROLE_LABELS } from '@/lib/auth/roles';
import { createClient, isMockMode } from '@/lib/supabase/client';
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
  initialRole?: UserRole;
  initialMode?: 'signup' | 'signin';
  selectedEvent?: CampusEvent | null;
  onClose: () => void;
  onAuthenticated: (role: UserRole) => void;
}

export default function AuthModal({
  initialRole = 'student',
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
  const [selectedRole, setSelectedRole] = useState<UserRole>(initialRole);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const [clubName, setClubName] = useState('');
  const mockMode = isMockMode();

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  function changeMode(nextMode: 'signin' | 'signup') {
    setMode(nextMode);
    setStatusMessage(null);
    setShowPassword(false);
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);
    setLoading(true);

    try {
      if (mockMode) {
        const response = await fetch('/api/auth/session', { method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode, email, password, name, department, role: selectedRole, clubName }),
        });
        const data = await response.json();
        if (response.ok) onAuthenticated(data.user.role);
        else setStatusMessage(data.error);
        return;
      }
      const supabase = createClient();
    if (!supabase) {
      setStatusMessage('Supabase client is not configured in .env.local.');
      setLoading(false);
      return;
    }

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
    } catch {
      setStatusMessage('Could not connect. Please try again.');
    } finally {
      setLoading(false);
    }
  };


  return (
    <dialog
      ref={dialog}
      className="crew-auth-dialog"
      aria-labelledby="auth-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="crew-auth-layout">
        <aside className="crew-auth-hero" aria-label="campusBEE">
          <div className="crew-auth-brand"><BeeLogo/> campusBEE</div>
          <div className="crew-auth-hero-copy">
            <p className="crew-auth-headline">Your campus<br />workspace.</p>
            <p className="crew-auth-description">Join events, host with your club or review submissions from your role’s workspace.</p>
          </div>
          <div className="crew-auth-ticket" aria-hidden="true">
            <Ticket size={27} />
            <span />
            <span />
            <span />
          </div>
        </aside>

        <section className="crew-auth-panel">
          <button type="button" onClick={onClose} className="crew-auth-close" aria-label="Close account dialog">
            <X size={20} />
          </button>

            <div className="crew-auth-switcher" aria-label="Account options">
              <button type="button" disabled={loading} aria-pressed={mode === 'signin'} onClick={() => changeMode('signin')}>Sign in</button>
              <button type="button" disabled={loading} aria-pressed={mode === 'signup'} onClick={() => changeMode('signup')}>Create account</button>
            </div>

          <h1 id="auth-title">{mode === 'signin' ? 'Welcome back.' : 'Join campusBEE.'}</h1>
          <p className="crew-auth-intro">
            {selectedEvent
              ? `Continue to ${selectedEvent.title} with your campus account.`
              : mode === 'signin'
                ? 'Sign in with your registered college email.'
                : 'Set up your account to get involved on campus.'}
          </p>

            <form onSubmit={handleSubmit} className="crew-auth-form">
              {mode === 'signup' && (
                <>
                  <fieldset>
                    <legend>Your role</legend>
                    <div className="crew-auth-roles">
                      {ROLE_OPTIONS.map((option) => (
                        <label key={option.value}>
                          <input type="radio" name="role" value={option.value} checked={selectedRole === option.value} onChange={() => setSelectedRole(option.value)} />
                          <span><strong>{option.label}</strong><small>{option.hint}</small></span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  {mockMode && selectedRole === 'club_organizer' && <label>Your new club name<input required value={clubName} onChange={e => setClubName(e.target.value)} /></label>}
                  <div className="crew-auth-fields">
                    <label>Full name
                      <input type="text" autoComplete="name" required value={name} onChange={(event) => setName(event.target.value)} />
                    </label>
                    <label>Department
                      <input type="text" autoComplete="organization-title" required value={department} onChange={(event) => setDepartment(event.target.value)} />
                    </label>
                  </div>
                </>
              )}

              <label>College email
                <input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@campus.edu" />
              </label>
              <label htmlFor="auth-password">Password</label>
              <div className="crew-auth-password">
                <input
                  id="auth-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  required
                  minLength={mockMode ? 8 : 6}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={mode === 'signup' ? (mockMode ? 'At least 8 characters' : 'At least 6 characters') : 'Enter your password'}
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>

              {statusMessage && <p className="crew-auth-status" role="status">{statusMessage}</p>}

              <button type="submit" disabled={loading} className="crew-auth-primary">
                {loading ? 'Please wait…' : mode === 'signup' ? `Continue as ${ROLE_LABELS[selectedRole]}` : 'Sign in'}
                <ArrowRight size={18} />
              </button>
            </form>
        </section>
      </div>
    </dialog>
  );
}
