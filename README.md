# AutoRD

Marketplace de vehículos + orquestación de financiamiento para la República Dominicana.
Prototipo funcional (React + Vite), 100% frontend con datos de demostración.

> **AutoRD no es una entidad financiera.** No realiza consultas de crédito ni otorga
> préstamos. Recolecta interés de compra, estado de KYC, consentimiento del cliente,
> datos de la solicitud y documentos. **Los bancos** hacen la consulta de crédito de
> forma externa y responden manualmente desde el portal del banco.

## Cómo correrlo

```bash
cd autord
npm install     # solo la primera vez
npm run dev
```

Abre: **http://localhost:5174**

Otros comandos: `npm run build` (producción) · `npm run preview` (previsualizar el build).

## Rutas

| Ruta | Pantalla |
|------|----------|
| `/` | Marketplace público con buscador, filtros, vehículos destacados y panel de financiamiento para compradores |
| `/vehiculo/:id` | Detalle del vehículo, estimado de cuota, CTA de financiamiento, similares |
| `/financiamiento` | Flujo KYC de 6 pasos (datos, cédula, prueba de vida, consentimiento, envío, respuestas) |
| `/mi-financiamiento` | Estado de la solicitud: timeline + respuestas de bancos con condiciones |
| `/dealer` | Panel del dealer: métricas, inventario, cola de leads (sin datos biométricos) |
| `/banco` | Panel del banco: cola de solicitudes, filtros, detalle y formulario de respuesta |

## Stack

- React 18 + Vite 5 · React Router 6 · lucide-react (iconos)
- Sistema de diseño en CSS puro (`src/styles.css`): paleta blanco / teal / navy
- Datos de demostración en `src/data/demo.js` — sin backend; los estados se simulan localmente

## Estructura

```
src/
  components/   Layout, VehicleCard, StatusChip, CarImage
  pages/        Home, VehicleDetail, Financing, MyFinancing, DealerPanel, BankPanel
  data/demo.js  vehículos, bancos, solicitudes, métricas
  styles.css    tokens + componentes + responsive
```
