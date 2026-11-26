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
  const localDemo = isMockMode();
  const [environment, setEnvironment] = useState<'demo'|'college'>(() => initialMode === 'signup' || (typeof window !== 'undefined' && localStorage.getItem('campusbee_workspace') === 'demo') ? 'demo' : 'college');
  const mockMode = localDemo || environment === 'demo';

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  function changeMode(nextMode: 'signin' | 'signup') {
    setMode(nextMode);
    if (nextMode === 'signup') setEnvironment('demo');
    setStatusMessage(null);
    setShowPassword(false);
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);
    setLoading(true);

    try {
      if (mockMode) {
        const response = await fetch(localDemo ? '/api/auth/session' : '/hosted-demo/auth/session', { method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode, email, password, name, department, role: selectedRole, clubName: !localDemo && !clubName.trim() ? 'CLUSTER4' : clubName }),
        });
        const data = await response.json();
        if (response.ok) {
          if (!localDemo) localStorage.setItem('campusbee_workspace', 'demo');
          if (selectedEvent && data.user.role === 'student') {
            sessionStorage.setItem('campusbee_demo_event', JSON.stringify([selectedEvent.title,Date.parse(selectedEvent.startTime)]));
          }
          onAuthenticated(data.user.role);
        }
        else setStatusMessage(data.error);
        return;
      }
      const supabase = createClient();
      if (!supabase) {
        setStatusMessage('College sign-in is unavailable.');
        return;
      }

      const result = mode === 'signup'
        ? await supabase.auth.signUp({ email, password, options: { data: { name: name.trim(), department } } })
        : await supabase.auth.signInWithPassword({ email, password });
      if (result.error) {
        setStatusMessage(result.error.message);
        return;
      }
      const { user, session } = result.data;
      if (!user || !session) {
        setStatusMessage('Please confirm your college email, then sign in.');
        return;
      }
      // Ignore existing rows so signing in preserves roles assigned by the college.
      const created = await supabase.from('users').upsert({
        id: user.id, email: user.email ?? email,
        name: user.user_metadata.name || email.split('@')[0],
        department: user.user_metadata.department || 'General',
      }, { onConflict: 'id', ignoreDuplicates: true });
      if (created.error) { setStatusMessage('Could not initialize your college profile.'); return; }
      const profile = await supabase.from('users').select('role').eq('id', user.id).single();
      if (profile.error || !profile.data) { setStatusMessage('Could not load your college role.'); return; }
      localStorage.setItem('campusbee_workspace', 'college');
      document.cookie = 'campusbee_demo=; Max-Age=0; Path=/; SameSite=Lax';
      onAuthenticated(profile.data.role);
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
              {!localDemo && <label>Workspace
                <select value={environment} disabled={loading} onChange={event => { setEnvironment(event.target.value as 'college'|'demo'); setStatusMessage(null); }}>
                  <option value="demo">Demo workspace · all four roles</option>
                  <option value="college">College workspace</option>
                </select>
                <small>{environment === 'demo' ? 'Shared practice events and teams. Use a fictional name and email for your demo account.' : 'Use your college email. The college assigns staff access.'}</small>
              </label>}
              {mode === 'signup' && (
                <>
                  {mockMode && <fieldset>
                    <legend>Your role</legend>
                    <div className="crew-auth-roles">
                      {ROLE_OPTIONS.map((option) => (
                        <label key={option.value}>
                          <input type="radio" name="role" value={option.value} checked={selectedRole === option.value} onChange={() => setSelectedRole(option.value)} />
                          <span><strong>{option.label}</strong><small>{option.hint}</small></span>
                        </label>
                      ))}
                    </div>
                  </fieldset>}
                  {mockMode && selectedRole === 'club_organizer' && <label> {localDemo ? 'Your new club name' : 'Demo club'}<input required={localDemo} placeholder={localDemo ? undefined : 'CLUSTER4'} value={clubName} onChange={e => setClubName(e.target.value)} /></label>}
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

              <label>{!localDemo && mockMode ? 'Demo email' : 'College email'}
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
                {loading ? 'Please wait…' : mode === 'signup' ? (mockMode ? `Continue as ${ROLE_LABELS[selectedRole]}` : 'Create student account') : 'Sign in'}
                <ArrowRight size={18} />
              </button>
            </form>
        </section>
      </div>
    </dialog>
  );
}
