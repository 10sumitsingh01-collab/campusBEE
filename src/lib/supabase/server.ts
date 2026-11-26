import { createServerClient } from '@supabase/ssr';
import { cookiePrefix } from '@/lib/auth/sessionScope';
import { cookies, headers } from 'next/headers';

export async function createServerSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    return null;
  }

  const cookieStore = await cookies();

  const prefix = cookiePrefix(await headers());
  return createServerClient(url, key, {
    ...(prefix && {cookieOptions:{name:prefix + 'college'}}),
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Called from a Server Component; middleware handles session refresh.
        }
      },
    },
  });
}
