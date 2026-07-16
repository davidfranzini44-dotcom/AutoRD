# Activar KYC real con Didit

El flujo de financiamiento ya llama a Didit. Sin backend desplegado usa un
**fallback simulado** (para que nada se rompa). Al completar estos pasos, el paso
"Verificar identidad" abre la verificación real de Didit (cédula + prueba de vida).

**Workflow a usar:** `Verificacion Cedula RD`
**Workflow ID:** `657c955c-8aa0-4844-b2d2-d344269accd3`
(app "My Application" — OCR + LIVENESS + FACE_MATCH)

---

## 1. Migración de base de datos
En Supabase → **SQL Editor**, corre:
`supabase/migrations/0003_didit.sql`
(añade columnas de sesión Didit a `kyc_verifications`).

## 2. Desplegar las Edge Functions
Con el Supabase CLI, desde la carpeta `autord/`:

```bash
supabase link --project-ref <TU-PROJECT-REF>
supabase functions deploy didit-session  --no-verify-jwt
supabase functions deploy didit-webhook  --no-verify-jwt
```

> `--no-verify-jwt` es necesario: `didit-session` valida el token del usuario por
> su cuenta, y `didit-webhook` lo llama Didit (no un usuario). Igual que tu
> `didit-webhook` de Reparando.

## 3. Secrets (variables de entorno)
```bash
supabase secrets set \
  DIDIT_API_KEY=<tu-api-key-de-didit> \
  DIDIT_WORKFLOW_ID=657c955c-8aa0-4844-b2d2-d344269accd3 \
  DIDIT_WEBHOOK_SECRET=<secret-del-webhook-didit> \
  APP_URL=https://<tu-app>.vercel.app
```
- **DIDIT_API_KEY** → Didit console → API Keys de "My Application".
- **DIDIT_WEBHOOK_SECRET** → Didit console → Webhooks (el mismo esquema HMAC-SHA256 que Reparando).
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` los inyecta Supabase automáticamente — no hace falta setearlos.
- Si tu API de Didit usa otra base, setéala también: `DIDIT_BASE_URL` (por defecto `https://verification.didit.me/v2`).

## 4. Configurar el webhook en Didit
En el Didit console (workflow / app), pon la URL del webhook:
```
https://<TU-PROJECT-REF>.functions.supabase.co/didit-webhook
```
Evento: cambios de estado de sesión (Approved / Declined).

## 5. Listo
Recarga la app. En **Solicitud de financiamiento → Verificar identidad**, el botón
"Verificar mi identidad con Didit" ahora:
1. Crea una sesión real (`didit-session`) con `vendor_data = tu user id`.
2. Abre la verificación de Didit en una pestaña nueva.
3. Al aprobarse, el webhook actualiza `kyc_verifications` y `financing_applications`,
   y la app avanza automáticamente (o toca "Ya completé la verificación").

---

### Cómo se conecta el código
- Frontend: `src/pages/Financing.jsx` (paso Identidad) → `src/data/api.js`
  (`createKycSession`, `getKycStatus`) → `supabase.functions.invoke('didit-session')`.
- Backend: `supabase/functions/didit-session` (crea sesión / consulta estado) y
  `supabase/functions/didit-webhook` (recibe decisión, verifica firma, actualiza KYC).
- Privacidad: solo se guardan flags + estado (`cedula_validated`, `liveness_validated`,
  `status`) y el `decision` crudo de Didit; los dealers **nunca** ven biometría (RLS).
