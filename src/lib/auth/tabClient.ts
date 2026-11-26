import { tabHeader } from './sessionScope';

const key = 'campusbee_tab';
let identity: Promise<string> | undefined;

function freshId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2,'0')).join('');
}

async function identifyTab() {
  const saved = sessionStorage.getItem(key);
  let id = saved && window.name === 'campusbee-' + saved ? saved : freshId();
  // A duplicated tab can inherit sessionStorage and the browsing context name.
  // Only one live document may resume an existing namespace.
  if (navigator.locks) {
    const claim = (candidate: string) => new Promise<boolean>((resolve, reject) => {
      navigator.locks.request('campusbee-tab-' + candidate, { ifAvailable: true }, lock => {
        resolve(Boolean(lock));
        if (lock) return new Promise<void>(release => window.addEventListener('pagehide', () => release(), {once:true}));
      }).catch(reject);
    });
    if (!await claim(id)) {
      id = freshId();
      await claim(id);
    }
  }
  sessionStorage.setItem(key,id);
  window.name = 'campusbee-' + id;
  return id;
}

export function getTabId() {
  return identity ??= identifyTab();
}

export function usesHostedDemo() {
  return sessionStorage.getItem('campusbee_active_workspace') === 'demo';
}

export function setHostedDemo(enabled: boolean) {
  if (enabled) sessionStorage.setItem('campusbee_active_workspace','demo');
  else sessionStorage.removeItem('campusbee_active_workspace');
}

export async function campusFetch(path: string, init?: RequestInit) {
  if (!path.startsWith('/api/') && !path.startsWith('/hosted-demo/')) throw new Error('Expected a campus API path');
  const headers = new Headers(init?.headers);
  headers.set(tabHeader, await getTabId());
  if (usesHostedDemo()) headers.set('x-campusbee-demo','1');
  const send = () => fetch(path, { ...init, headers, cache: 'no-store' });
  let response = await send();
  // Multiple simultaneous demo logins may contend for the same storage revision.
  if (path.endsWith('/auth/session')) {
    for (let attempt = 0; attempt < 4 && response.headers.has('x-campusbee-revision-conflict'); attempt++) {
      await new Promise(resolve => setTimeout(resolve, (100 + Math.random() * 200) * (attempt + 1)));
      response = await send();
    }
  }
  return response;
}
