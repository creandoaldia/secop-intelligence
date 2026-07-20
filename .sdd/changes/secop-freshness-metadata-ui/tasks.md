# Tasks: Freshness Metadata UI

## Task 1: Crear FreshnessBadge component
**Priority**: P0
**Files**: `apps/web/components/freshness-badge.tsx` (new)
**Depends on**: none
**Description**: Crear un componente `"use client"` que acepte `timestamp: Date | number | null | undefined`, `label?: string` y `status?: "healthy" | "degraded" | "down"`. Normaliza timestamps a epoch ms: `Date` → `.getTime()`, `number` → Unix seconds × 1000. Calcula edad relativa en montaje y refresca cada 60s. Rangos: <24h verde ("hace Nh"), <7d amarillo ("hace Nd"), ≥7d rojo. `status="down"` fuerza rojo independientemente del timestamp. Timestamps futuros → "Sin datos" (clock-skew protection). Tooltip con fecha absoluta `es-CO` en hover/focus. Server placeholder no vacío (`"—"` o tiempo absoluto) para evitar hydration flash.
**Acceptance**: El componente renderiza colores correctos según antigüedad, tooltip con fecha localizada, status prop sobrecarga color, timestamps nulos/futuros muestran "Sin datos", server placeholder evita flash blancos.

---

## Task 2: Integrar FreshnessBadge en Dashboard
**Priority**: P0
**Files**: `apps/web/app/page.tsx`
**Depends on**: Task 1
**Description**: Agregar import de `eq`, `sourceHealth` y `FreshnessBadge` en la página del dashboard. Hacer query `db.select().from(sourceHealth).where(eq(sourceHealth.source, "socrata"))` con `.get()` para obtener `lastSuccessAt`. Renderizar `<FreshnessBadge label="Datos sincronizados:" timestamp={...} />` debajo de `WelcomeBanner`. Manejar fila ausente pasando `null`.
**Acceptance**: Dashboard muestra badge con texto "Datos sincronizados: hace X" con color según antigüedad. Si no hay registro, no se rompe ni muestra NaN. Badge visible sin admin.

---

## Task 3: Integrar FreshnessBadge en lista de Procesos
**Priority**: P0
**Files**: `apps/web/app/(authenticated)/procesos/page.tsx`, `apps/web/components/procesos/procesos-table.tsx`
**Depends on**: Task 1
**Description**: En `page.tsx` extender el tipado local de la respuesta de API para incluir `ultima_sincronizacion: number | null` opcional y pasarlo como prop `lastSuccessAt` a `ProcesosTable`. En `procesos-table.tsx` agregar `lastSuccessAt` a props, importar `FreshnessBadge` y renderizarlo en un contenedor pequeño sobre `<Table>` con label `"Datos sincronizados:"`. El badge debe seguir visible incluso cuando `data.length === 0`.
**Acceptance**: La lista de procesos muestra badge con la hora de sincronización sobre la tabla. Sigue visible en estado vacío. No altera columnas, paginación ni navegación existente.

---

## Task 4: Integrar FreshnessBadge en detalle de Proceso
**Priority**: P1
**Files**: `apps/web/app/(authenticated)/procesos/[id]/page.tsx`, `apps/web/components/procesos/proceso-detail.tsx`
**Depends on**: Task 1
**Description**: En `[id]/page.tsx` agregar `leftJoin(sourceHealth, eq(sourceHealth.source, "socrata"))` a la query del proceso, seleccionando además `lastSuccessAt`. Pasar el timestamp como prop separada a `ProcesoDetail`. En `proceso-detail.tsx` agregar `lastSuccessAt` a props y un `DetailRow` con label `"Última sincronización de datos"` que contiene `<FreshnessBadge>` dentro de la tarjeta General Information. LEFT JOIN garantiza que un proceso sin health row aún se muestre (timestamp `null`).
**Acceptance**: Detalle de proceso muestra fila "Última sincronización de datos" con badge de frescura. Si no hay health data, el badge muestra "Sin datos" sin bloquear el render del proceso.

---

## Task 5: Integrar FreshnessBadge en Header global (no-admin)
**Priority**: P2
**Files**: `apps/web/app/(authenticated)/layout.tsx`, `apps/web/components/layout/header.tsx`
**Depends on**: Task 1
**Description**: En `layout.tsx` hacer query a `sourceHealth` para obtener `lastSuccessAt` y pasarlo al `Header` solo cuando `session.user.role !== "admin"` (para admins pasar `null`). En `header.tsx` agregar prop `lastSuccessAt?: number | null` opcional y renderizar un `FreshnessBadge` compacto antes del dropdown de usuario, solo cuando el timestamp exista. Ocultar en mobile (< sm breakpoint) para no romper controles de cuenta. No renderizar placeholder vacío si no hay timestamp.
**Acceptance**: Header muestra badge compacto de frescura para usuarios no-admin. No se renderiza para admins. No hay placeholder vacío. Mobile sigue funcionando sin regresión.

---

## Task 6: Tests unitarios de FreshnessBadge
**Priority**: P1
**Files**: `apps/web/components/__tests__/freshness-badge.test.tsx` (new)
**Depends on**: Task 1
**Description**: Crear tests con jsdom y fake timers (vi.useFakeTimers) que cubran: umbral de horas (<24h verde), umbral de días (<7d amarillo, ≥7d rojo), status="down" sobreescribe color, timestamps futuro/null/undefined → "Sin datos", tooltip contiene fecha absoluta formateada, label opcional se renderiza antes del valor relativo, server placeholder coincide post-hidratación.
**Acceptance**: `npx vitest run components/__tests__/freshness-badge` pasa todos los tests. Cobertura de branches ≥ 85% en el componente FreshnessBadge.
