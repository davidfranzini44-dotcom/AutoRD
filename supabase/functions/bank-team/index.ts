// Bank team management (enroll a bank + owner, then owner adds/administers users).
// Runs with the service role. Two authz tiers:
//   - `enroll`  → platform admin only (role='admin'): create the bank + seed its
//                 rate card/rules + create its first OWNER account.
//   - list/create/update → the bank's OWNER only: manage that bank's analysts.
// Accounts are always created here (never in the browser); a generated temp
// password is returned once for the owner/admin to share.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

// What a bank user can access (mirrors the granular dealer model).
const PERM_KEYS = ['solicitudes', 'tasas', 'whatsapp', 'reportes', 'equipo']
function cleanPerms(input: Record<string, unknown> | null | undefined) {
  const out: Record<string, boolean> = {}
  for (const k of PERM_KEYS) out[k] = !!(input && input[k])
  return out
}
function genPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  return 'Rd' + Array.from(bytes, (b) => chars[b % chars.length]).join('') + '#7'
}
function slugify(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}
const initialsOf = (name: string) =>
  String(name || '').split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const authHeader = req.headers.get('Authorization') || ''

    const caller = createClient(url, anon, { global: { headers: { Authorization: authHeader } } })
    const { data: { user } } = await caller.auth.getUser()
    if (!user) return json({ error: 'unauthenticated' }, 401)

    const admin = createClient(url, service)
    const { data: me } = await admin.from('profiles').select('bank_id, bank_role, role').eq('id', user.id).single()

    const body = await req.json().catch(() => ({}))
    const action = body.action

    // ---- Platform admin: enroll a new partner bank + its first owner ----
    if (action === 'enroll') {
      if (me?.role !== 'admin') return json({ error: 'forbidden' }, 403)
      const name = String(body.bankName || '').trim()
      const email = String(body.ownerEmail || '').trim().toLowerCase()
      const ownerName = String(body.ownerName || '').trim() || name
      if (!name) return json({ error: 'nombre_requerido' }, 400)
      if (!email || !/^\S+@\S+\.\S+$/.test(email)) return json({ error: 'email_invalido' }, 400)
      const slug = slugify(String(body.slug || name))
      if (!slug) return json({ error: 'slug_invalido' }, 400)

      // Create the bank if it doesn't exist yet; seed its rate card + rules.
      let { data: bank } = await admin.from('banks').select('id').eq('slug', slug).maybeSingle()
      if (!bank) {
        const { data: nb, error: bErr } = await admin.from('banks')
          .insert({ name, slug, color: body.color || '#0f766e', initials: initialsOf(name), active: true })
          .select('id').single()
        if (bErr || !nb) return json({ error: bErr?.message || 'no_se_pudo_crear_banco' }, 400)
        bank = nb
        await admin.rpc('seed_bank_defaults', { p_bank_id: bank.id })
      }

      // Create the owner account (role=bank, bank_role=owner).
      const tempPassword = genPassword()
      const { data: created, error: cErr } = await admin.auth.admin.createUser({
        email, password: tempPassword, email_confirm: true,
        user_metadata: { full_name: ownerName, role: 'bank' },
      })
      if (cErr || !created?.user) return json({ error: cErr?.message || 'no_se_pudo_crear_usuario' }, 400)
      const uid = created.user.id
      const { error: pErr } = await admin.from('profiles').upsert({
        id: uid, role: 'bank', bank_id: bank.id, bank_role: 'owner',
        full_name: ownerName, email, active: true,
      })
      if (pErr) {
        await admin.auth.admin.deleteUser(uid).catch(() => {})
        return json({ error: pErr.message }, 400)
      }
      return json({ ok: true, bankId: bank.id, slug, userId: uid, tempPassword })
    }

    // ---- Bank owner: manage this bank's analysts ----
    if (!me?.bank_id || me.bank_role !== 'owner') return json({ error: 'forbidden' }, 403)

    if (action === 'list') {
      const { data } = await admin.from('profiles')
        .select('id, full_name, email, permissions, bank_role, active, created_at')
        .eq('bank_id', me.bank_id).order('created_at', { ascending: true })
      return json({ team: data || [] })
    }

    if (action === 'create') {
      const email = String(body.email || '').trim().toLowerCase()
      const fullName = String(body.fullName || '').trim()
      if (!email || !/^\S+@\S+\.\S+$/.test(email)) return json({ error: 'email_invalido' }, 400)
      const permissions = cleanPerms(body.permissions)
      const tempPassword = genPassword()
      const { data: created, error: cErr } = await admin.auth.admin.createUser({
        email, password: tempPassword, email_confirm: true,
        user_metadata: { full_name: fullName, role: 'bank' },
      })
      if (cErr || !created?.user) return json({ error: cErr?.message || 'no_se_pudo_crear' }, 400)
      const uid = created.user.id
      const { error: pErr } = await admin.from('profiles').upsert({
        id: uid, role: 'bank', bank_id: me.bank_id, bank_role: 'employee',
        full_name: fullName, email, permissions, active: true,
      })
      if (pErr) {
        await admin.auth.admin.deleteUser(uid).catch(() => {})
        return json({ error: pErr.message }, 400)
      }
      return json({ ok: true, userId: uid, tempPassword })
    }

    if (action === 'update') {
      const userId = String(body.userId || '')
      const { data: t } = await admin.from('profiles').select('bank_id, bank_role').eq('id', userId).single()
      if (!t || t.bank_id !== me.bank_id || t.bank_role === 'owner') return json({ error: 'forbidden' }, 403)
      const patch: Record<string, unknown> = {}
      if (body.permissions) patch.permissions = cleanPerms(body.permissions)
      if (body.active !== undefined) {
        patch.active = !!body.active
        await admin.auth.admin.updateUserById(userId, { ban_duration: body.active ? 'none' : '876000h' }).catch(() => {})
      }
      if (Object.keys(patch).length) await admin.from('profiles').update(patch).eq('id', userId)
      return json({ ok: true })
    }

    return json({ error: 'accion_desconocida' }, 400)
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500)
  }
})
