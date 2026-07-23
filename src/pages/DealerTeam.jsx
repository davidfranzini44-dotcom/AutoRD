import { useState, useEffect } from 'react'
import { UserPlus, Shield, Check, X, Copy, KeyRound, UserCheck, UserX, Mail, Crown } from 'lucide-react'
import { listTeam, createEmployee, setEmployeePermissions, setEmployeeActive } from '../data/api'
import { useAuth } from '../context/AuthContext'

const PERMS = [
  { key: 'inventario', label: 'Inventario', desc: 'Publicar y editar vehículos' },
  { key: 'financiamiento', label: 'Financiamiento', desc: 'Leads y solicitudes de financiamiento' },
  { key: 'whatsapp', label: 'Leads / WhatsApp', desc: 'Bandeja de mensajes de compradores' },
  { key: 'perfil', label: 'Perfil del dealer', desc: 'Datos, logo y sucursales' },
  { key: 'equipo', label: 'Equipo', desc: 'Crear y administrar empleados' },
]

export default function DealerTeam() {
  const { isOwner } = useAuth() || {}
  const [team, setTeam] = useState([])
  const [loading, setLoading] = useState(true)
  const [reload, setReload] = useState(0)
  const [adding, setAdding] = useState(false)
  const [created, setCreated] = useState(null)
  const [busyId, setBusyId] = useState(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    listTeam().then((t) => { if (alive) { setTeam(t); setLoading(false) } }).catch(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [reload])
  const refetch = () => setReload((x) => x + 1)

  async function togglePerm(m, key) {
    const permissions = { ...(m.permissions || {}), [key]: !m.permissions?.[key] }
    setBusyId(m.id)
    try { await setEmployeePermissions(m.id, permissions); refetch() }
    catch (e) { alert(e?.message || 'No se pudo actualizar') }
    finally { setBusyId(null) }
  }
  async function toggleActive(m) {
    setBusyId(m.id)
    try { await setEmployeeActive(m.id, !m.active); refetch() }
    catch (e) { alert(e?.message || 'No se pudo actualizar') }
    finally { setBusyId(null) }
  }

  const owners = team.filter((m) => m.dealer_role === 'owner')
  const employees = team.filter((m) => m.dealer_role !== 'owner')

  return (
    <div className="dlrx">
      <div className="container dlrx-container">
      <div className="dlrx-head">
        <div>
          <h1>Equipo</h1>
          <p className="small muted">Crea empleados, activa/desactiva cuentas y controla permisos.</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setCreated(null); setAdding(true) }}><UserPlus size={17} /> Agregar empleado</button>
      </div>

      {loading ? (
        <div className="muted">Cargando equipo…</div>
      ) : (
        <>
          {owners.map((m) => (
            <div className="card card-pad" key={m.id} style={{ marginBottom: 12 }}>
              <div className="row center gap-10">
                <div className="verify-ic" style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--teal-50)', color: 'var(--teal-700)', flex: 'none' }}><Crown size={18} /></div>
                <div className="grow">
                  <div className="strong">{m.full_name || 'Propietario'}</div>
                  <div className="tiny muted">{m.email} · Propietario (acceso total)</div>
                </div>
                <span className="chip chip-teal">Propietario</span>
              </div>
            </div>
          ))}

          <div className="card">
            <div className="row between center" style={{ padding: '14px 16px 6px' }}>
              <h3 style={{ fontSize: 15 }}>Empleados ({employees.length})</h3>
            </div>
            {employees.length === 0 ? (
              <div className="muted tiny" style={{ padding: '4px 16px 18px' }}>Aún no has agregado empleados. Crea el primero con “Agregar empleado”.</div>
            ) : (
              <div className="col" style={{ padding: '0 16px 12px' }}>
                {employees.map((m) => (
                  <div key={m.id} style={{ borderTop: '1px solid var(--line-2, #e2e8f0)', padding: '14px 0' }}>
                    <div className="row between center wrap gap-8">
                      <div className="row center gap-10" style={{ minWidth: 0 }}>
                        <div className="verify-ic" style={{ width: 38, height: 38, borderRadius: 10, background: m.active ? 'var(--surface-2, #f1f5f9)' : '#fef2f2', color: m.active ? 'var(--muted)' : '#dc2626', flex: 'none' }}>
                          {m.active ? <UserCheck size={17} /> : <UserX size={17} />}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div className="strong small">{m.full_name || m.email}</div>
                          <div className="tiny muted row center gap-4"><Mail size={11} /> {m.email}</div>
                        </div>
                      </div>
                      <div className="row center gap-8">
                        {!m.active && <span className="chip" style={{ background: '#fee2e2', color: '#b91c1c' }}>Desactivado</span>}
                        <button className="btn btn-outline btn-sm" disabled={busyId === m.id} onClick={() => toggleActive(m)}>
                          {m.active ? <><UserX size={14} /> Desactivar</> : <><UserCheck size={14} /> Reactivar</>}
                        </button>
                      </div>
                    </div>
                    <div className="row wrap gap-6" style={{ marginTop: 10 }}>
                      {PERMS.map((p) => {
                        const on = !!m.permissions?.[p.key]
                        return (
                          <button key={p.key} type="button" title={p.desc} disabled={busyId === m.id || !m.active}
                            onClick={() => togglePerm(m, p.key)}
                            className={`chip ${on ? 'chip-teal' : ''}`}
                            style={{ cursor: m.active ? 'pointer' : 'not-allowed', opacity: m.active ? 1 : 0.55, border: on ? 'none' : '1px solid var(--line-2, #e2e8f0)', background: on ? undefined : 'transparent' }}>
                            {on ? <Check size={12} /> : <X size={12} />} {p.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="tiny muted row center gap-6" style={{ marginTop: 12 }}>
            <Shield size={13} /> Los empleados inician sesión con su correo. Tú controlas su acceso desde aquí.
          </div>
        </>
      )}

      {adding && (
        <AddEmployeeModal
          onClose={() => setAdding(false)}
          onCreated={(res) => { setAdding(false); setCreated(res); refetch() }}
        />
      )}

      {created && <CredentialsModal created={created} onClose={() => setCreated(null)} />}
      </div>
    </div>
  )
}

function AddEmployeeModal({ onClose, onCreated }) {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [permissions, setPermissions] = useState({ inventario: true, financiamiento: true, whatsapp: true, perfil: false, equipo: false })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const toggle = (k) => setPermissions((p) => ({ ...p, [k]: !p[k] }))

  async function submit() {
    setErr('')
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setErr('Ingresa un correo válido'); return }
    setSaving(true)
    try {
      const res = await createEmployee({ fullName: fullName.trim(), email: email.trim(), permissions })
      onCreated({ email: email.trim(), tempPassword: res.tempPassword })
    } catch (e) {
      setErr(e?.message === 'email_invalido' ? 'Correo inválido' : (e?.message || 'No se pudo crear el empleado'))
      setSaving(false)
    }
  }

  return (
    <ModalShell title="Agregar empleado" onClose={onClose}>
      <div className="col gap-12" style={{ padding: 18 }}>
        <label className="col gap-4"><span className="tiny strong">Nombre completo</span>
          <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Ej: María Pérez" /></label>
        <label className="col gap-4"><span className="tiny strong">Correo electrónico</span>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="maria@dealer.com" /></label>
        <div>
          <div className="tiny strong" style={{ marginBottom: 6 }}>Permisos</div>
          <div className="col gap-6">
            {PERMS.map((p) => (
              <label key={p.key} className="row between center" style={{ border: '1px solid var(--line-2, #e2e8f0)', borderRadius: 10, padding: '8px 12px', cursor: 'pointer' }}>
                <div>
                  <div className="small strong">{p.label}</div>
                  <div className="tiny muted">{p.desc}</div>
                </div>
                <input type="checkbox" checked={!!permissions[p.key]} onChange={() => toggle(p.key)} style={{ width: 18, height: 18 }} />
              </label>
            ))}
          </div>
        </div>
        {err && <div className="tiny" style={{ color: '#dc2626' }}>{err}</div>}
      </div>
      <div className="row between center" style={{ padding: '12px 18px', borderTop: '1px solid var(--line-2, #e2e8f0)' }}>
        <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
        <button className="btn btn-primary" onClick={submit} disabled={saving}>{saving ? 'Creando…' : <><UserPlus size={16} /> Crear cuenta</>}</button>
      </div>
    </ModalShell>
  )
}

function CredentialsModal({ created, onClose }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try { await navigator.clipboard.writeText(`Correo: ${created.email}\nContraseña temporal: ${created.tempPassword}`); setCopied(true); setTimeout(() => setCopied(false), 1600) } catch (_) { /* ignore */ }
  }
  return (
    <ModalShell title="Empleado creado" onClose={onClose}>
      <div className="col gap-12" style={{ padding: 18 }}>
        <div className="notice" style={{ borderColor: 'var(--green-bd)', background: 'var(--green-bg)' }}>
          <KeyRound size={16} /><span>Comparte estas credenciales con el empleado. La contraseña temporal <strong>no se volverá a mostrar</strong>.</span>
        </div>
        <div className="card" style={{ padding: 12 }}>
          <div className="row between center" style={{ marginBottom: 6 }}><span className="tiny muted">Correo</span><span className="small strong">{created.email}</span></div>
          <div className="row between center"><span className="tiny muted">Contraseña temporal</span><span className="small strong" style={{ fontFamily: 'monospace' }}>{created.tempPassword}</span></div>
        </div>
        <button className="btn btn-outline btn-block" onClick={copy}><Copy size={15} /> {copied ? 'Copiado' : 'Copiar credenciales'}</button>
        <div className="tiny muted">Pídele que cambie la contraseña después de iniciar sesión.</div>
      </div>
      <div className="row" style={{ padding: '12px 18px', borderTop: '1px solid var(--line-2, #e2e8f0)', justifyContent: 'flex-end' }}>
        <button className="btn btn-primary" onClick={onClose}>Entendido</button>
      </div>
    </ModalShell>
  )
}

function ModalShell({ title, onClose, children }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.5)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div className="card" style={{ width: '100%', maxWidth: 480, maxHeight: '92vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div className="row between center" style={{ padding: '16px 18px', borderBottom: '1px solid var(--line-2, #e2e8f0)' }}>
          <h3 style={{ fontSize: 16 }}>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}
