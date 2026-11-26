// The tab selector identifies a cookie namespace. Authentication still requires
// the server-issued session in that namespace.
export const tabHeader = 'x-campusbee-tab';

export function cookiePrefix(headers: Pick<Headers,'get'>) {
  const id = headers.get(tabHeader);
  if (id === null) return ''; // Existing API clients use the original cookies.
  if (!/^[a-f0-9]{32}$/.test(id)) throw new Error('Invalid tab selector');
  return 'cb_' + id + '_';
}

export const collegeCookie = (id: string) => 'cb_' + id + '_college';
