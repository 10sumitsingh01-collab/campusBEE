import 'server-only';
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import fixtures from './hosted-demo-fixtures.json';
import { createInitialStore, hostedDemo, type CampusOSStore } from './store';
import type { Competition } from '@/lib/judging/model';

const bucket = 'campusbee-role-demo-v1';
const file = (revision: number) => String(revision).padStart(12, '0') + '.bin';

function startingData(): CampusOSStore {
  const { round, tickets, ...records } = structuredClone(fixtures);
  const base = createInitialStore();
  for (const profile of Object.values(base.users)) {
    profile.id = 'demo-' + profile.role;
    profile.name = 'Demo ' + profile.role.replaceAll('_', ' ');
    profile.email = profile.role + '@example.invalid';
    delete profile.rollNumber;
  }
  return {
    ...base, ...records, accounts: [], sessions: [], invites: [],
    competitions: { 'cluster4-build24': { revision: 1, state: {
      rounds: [round], judges: [], evaluations: []
    } as Competition } },
    rubrics: [
      ...records.rubrics,
      ...round.criteria.map((criterion, sortOrder) => ({
        ...criterion, eventId: 'cluster4-build24', description: '', weight: 1, sortOrder,
      })),
    ],
    tickets: tickets.map(ticket => ({ ...ticket, ticketCode: 'TKT-' + randomUUID().slice(0, 8), qrToken: randomBytes(32).toString('hex') })),
  } as CampusOSStore;
}

function seal(text: string, key: Buffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
}

function open(bytes: Buffer, key: Buffer): CampusOSStore {
  const cipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
  cipher.setAuthTag(bytes.subarray(12, 28));
  return JSON.parse(Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString('utf8'));
}

export async function inHostedDemo(req: NextRequest, handler: () => Promise<Response>) {
  const secret = process.env.CAMPUSBEE_DEMO_STORAGE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const failure = (error: string, status: number) => NextResponse.json({ error }, { status, headers: { 'Cache-Control': 'private, no-store' } });
  if (!secret || !/^[0-9a-f]{64}$/i.test(secret) || !url || !serviceKey)
    return failure('The hosted demo is unavailable.', 503);
  if (req.method !== 'GET' && req.headers.get('origin') && req.headers.get('origin') !== req.nextUrl.origin)
    return failure('This action must originate from CampusBEE.', 403);
  const key = Buffer.from(secret, 'hex');
  const storage = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } }).storage;
  try {
    const info = await storage.getBucket(bucket);
    if (info.error) {
      const created = await storage.createBucket(bucket, { public: false, fileSizeLimit: 4 * 1024 * 1024 });
      if (created.error && !(await storage.getBucket(bucket)).data) throw Error('bucket');
    } else if (info.data.public) throw Error('bucket access');
    const files = storage.from(bucket);
    const listing = await files.list('state', { limit: 1, sortBy: { column: 'name', order: 'desc' } });
    if (listing.error) throw Error('list');
    const latest = listing.data[0]?.name;
    if (latest && !/^\d{12}\.bin$/.test(latest)) throw Error('revision');
    const revision = latest ? Number(latest.slice(0, 12)) : 0;
    let store: CampusOSStore;
    if (latest) {
      const saved = await files.download('state/' + latest);
      if (saved.error) throw Error('download');
      store = open(Buffer.from(await saved.data.arrayBuffer()), key);
    } else {
      store = startingData();
    }
    const before = JSON.stringify(store);
    const context = { store };
    const response = await hostedDemo.run(context, handler);
    if (response.ok && req.method !== 'GET') {
      const after = JSON.stringify(context.store);
      if (before !== after) {
        // Create-only writes give concurrent requests a single winning revision.
        const write = await files.upload('state/' + file(revision + 1), seal(after, key), { upsert: false, contentType: 'application/octet-stream' });
        if (write.error) {
          if (write.error.status === 409 || /already exists|duplicate/i.test(write.error.message)) {
            const conflict = failure('Another demo user just saved a change. Refresh and retry.', 409);
            conflict.headers.set('x-campusbee-revision-conflict','1');
            return conflict;
          }
          throw Error('upload');
        }
        if (revision > 1) await files.remove(['state/' + file(revision - 1)]);
      }
    }
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  } catch {
    return failure('Could not load or save the shared demo. Please try again.', 503);
  }
}
