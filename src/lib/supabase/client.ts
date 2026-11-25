import { createBrowserClient } from '@supabase/ssr';

export function getSupabaseKey(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  );
}

export function isMockMode(): boolean {
  return (
    process.env.NEXT_PUBLIC_USE_MOCK_DATA !== 'false' ||
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !getSupabaseKey()
  );
}

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = getSupabaseKey();

  if (!url || !key) {
    return null;
  }

  return createBrowserClient(url, key);
}
