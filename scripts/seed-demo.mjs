// ============================================================
// AutoRD — seed demo accounts for the end-to-end pilot loop.
// Creates 3 real Supabase auth users + links their roles:
//   buyer@autord.demo   (role: buyer)
//   dealer@autord.demo  (role: dealer, linked to Auto América)
//   bank@autord.demo    (role: bank,   linked to BHD)
//
// Run (from the autord/ folder):
//   SUPABASE_URL=https://<ref>.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
//   node scripts/seed-demo.mjs
//
// Requires the schema (0001) + seed cars/dealers/banks already applied.
// The service-role key bypasses RLS — never expose it in the frontend.
// ============================================================
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const PASSWORD = process.env.DEMO_PASSWORD || 'AutoRD2026!'

if (!url || !key) {
  console.error('✗ Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.')
  process.exit(1)
}

const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

const ACCOUNTS = [
  { email: 'buyer@autord.demo',  role: 'buyer',  full_name: 'Juan Pérez',            phone: '809-555-0100' },
  { email: 'dealer@autord.demo', role: 'dealer', full_name: 'Auto América — Dealer', dealerSlug: 'auto-america' },
  { email: 'bank@autord.demo',   role: 'bank',   full_name: 'BHD — Banco',           bankSlug: 'bhd' },
]

async function ensureUser(a) {
  const { data, error } = await admin.auth.admin.createUser({
    email: a.email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: a.full_name, role: a.role },
  })
  if (!error && data?.user) return data.user
  // Already exists → find it.
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
  const found = list?.users?.find((u) => u.email === a.email)
  if (found) return found
  throw error
}

async function main() {
  const [{ data: dealers }, { data: banks }] = await Promise.all([
    admin.from('dealers').select('id, slug'),
    admin.from('banks').select('id, slug'),
  ])

  for (const a of ACCOUNTS) {
    const user = await ensureUser(a)
    const patch = {
      id: user.id, role: a.role, full_name: a.full_name, email: a.email, phone: a.phone || null,
      dealer_id: a.dealerSlug ? dealers?.find((d) => d.slug === a.dealerSlug)?.id ?? null : null,
      bank_id: a.bankSlug ? banks?.find((b) => b.slug === a.bankSlug)?.id ?? null : null,
    }
    const { error } = await admin.from('profiles').upsert(patch)
    if (error) throw error
    console.log(`✓ ${a.role.padEnd(6)} ${a.email}`)
  }

  console.log('\nDemo accounts ready. Password for all:', PASSWORD)
  console.log('Sign in as each to walk the loop: buyer applies → dealer sees lead → bank responds → buyer sees offer.')
}

main().catch((e) => { console.error('✗', e.message || e); process.exit(1) })
