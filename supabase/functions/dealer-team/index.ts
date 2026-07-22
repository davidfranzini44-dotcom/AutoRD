// Dealer team management (create / list / update / deactivate employees).
// Runs with the service role; every action verifies the caller is the OWNER of
// the dealer. Account creation happens here (never in the browser); a generated
// temp password is returned once for the owner to share with the employee.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const PERM_KEYS = ['inventario', 'financiamiento', 'whatsapp', 'perfil', 'equipo']
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
    const { data: me } = await admin.from('profiles').select('dealer_id, dealer_role').eq('id', user.id).single()
    if (!me?.dealer_id || me.dealer_role !== 'owner') return json({ error: 'forbidden' }, 403)

    const body = await req.json().catch(() => ({}))
    const action = body.action

    if (action === 'list') {
      const { data } = await admin.from('profiles')
        .select('id, full_name, email, permissions, dealer_role, active, created_at')
        .eq('dealer_id', me.dealer_id).order('created_at', { ascending: true })
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
        user_metadata: { full_name: fullName, role: 'dealer' },
      })
      if (cErr || !created?.user) return json({ error: cErr?.message || 'no_se_pudo_crear' }, 400)
      const uid = created.user.id
      const { error: pErr } = await admin.from('profiles').upsert({
        id: uid, role: 'dealer', dealer_id: me.dealer_id, dealer_role: 'employee',
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
      const { data: t } = await admin.from('profiles').select('dealer_id, dealer_role').eq('id', userId).single()
      if (!t || t.dealer_id !== me.dealer_id || t.dealer_role === 'owner') return json({ error: 'forbidden' }, 403)
      const patch: Record<string, unknown> = {}
      if (body.permissions) patch.permissions = cleanPerms(body.permissions)
      if (body.active !== undefined) {
        patch.active = !!body.active
        // Truly block/allow login by banning/unbanning the auth user.
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
