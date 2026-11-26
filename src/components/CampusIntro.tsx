'use client';

import { useLayoutEffect, useRef } from 'react';
import { ArrowRight } from 'lucide-react';

export default function CampusIntro() {
  const dialog = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const dismiss = useRef<() => void>(() => {});

  useLayoutEffect(() => {
    const modal = dialog.current;
    const film = video.current;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (!modal || !film || motion.matches) return;
    const storageKey = 'campusbee.intro.festival.v2.seen';
    try {
      if (sessionStorage.getItem(storageKey)) return;
    } catch { /* The intro still works with browser storage disabled. */ }

    let active = true;
    let closing = false;
    let fadeTimer: number;
    function finish() {
      film!.pause();
      modal!.close();
    }
    function fade() {
      if (closing) return;
      closing = true;
      modal!.dataset.leaving = 'true';
      fadeTimer = window.setTimeout(finish, 800);
    }
    dismiss.current = fade;
    modal.showModal();
    film.src = '/buzzing-campus-festival.mp4';
    // Mark on the next frame so a development effect replay can still open it.
    const mark = requestAnimationFrame(() => {
      try { sessionStorage.setItem(storageKey, '1'); } catch { /* Optional storage. */ }
    });
    void film.play().catch(() => { if (active && modal.open) fade(); });
    let timeout: number;
    function watchPlayback() {
      clearTimeout(timeout);
      if (modal!.open && !closing) timeout = window.setTimeout(fade, 8000);
    }
    watchPlayback();
    film.addEventListener('timeupdate', watchPlayback);
    function motionChanged() { if (motion.matches) finish(); }
    motion.addEventListener('change', motionChanged);
    return () => {
      active = false;
      film.removeEventListener('timeupdate', watchPlayback);
      cancelAnimationFrame(mark);
      clearTimeout(timeout);
      clearTimeout(fadeTimer);
      motion.removeEventListener('change', motionChanged);
      finish();
      delete modal.dataset.leaving;
    };
  }, []);

  return (
    <dialog ref={dialog} className="festival-intro" aria-labelledby="campus-welcome"
      onCancel={event => { event.preventDefault(); dismiss.current(); }}>
      <video ref={video} className="festival-film" muted playsInline preload="none"
        aria-hidden="true" onPlaying={event => { event.currentTarget.closest('dialog')!.dataset.playing = 'true'; }}
        onError={() => dismiss.current()} onEnded={() => dismiss.current()} />
      <div className="festival-brand">campus<span>BEE</span></div>
      <button type="button" className="festival-skip" onClick={() => dismiss.current()}>
        Skip intro <ArrowRight size={16} aria-hidden="true" />
      </button>
      <h1 className="festival-title" id="campus-welcome">CREATING THE BUZZ <span>AROUND CAMPUS</span></h1>
    </dialog>
  );
}
