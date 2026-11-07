# ▶ INICIO RÁPIDO — ECOSYSTEM MÉTODO en local

Guía para levantar la aplicación completa en tu propio ordenador (o en cualquier
máquina de desarrollo). Sin Docker, sin instalar PostgreSQL: los binarios van
embebidos y se descargan solos al instalar dependencias.

---

## 1) Requisitos

| Necesitas | Versión | Nota |
|---|---|---|
| Node.js | 20 o superior | [nodejs.org](https://nodejs.org) — o [Bun](https://bun.sh) |
| PostgreSQL | **no hace falta** | binarios embebidos (`embedded-postgres`) |
| SO | Linux / macOS | en Windows usa **WSL2** (los binarios embebidos son Linux/macOS) |

## 2) Arranque en 3 comandos

```bash
npm install          # instala dependencias (descarga también los binarios de PG)
npm run db:push      # crea el esquema (19 modelos) en la base local
npm run db:seed      # siembra la Cátedra + club demo + usuarios
npm run dev          # arranca PostgreSQL + la app en http://localhost:3000
```

> `npm run dev` ya se encarga de todo: levanta PostgreSQL idempotentemente
> (si ya está activo no lo toca) y después arranca Next.js. Si prefieres
> gestionar la base por separado: `npm run local:up` en otra terminal.

Abre **http://localhost:3000** y entra con:

| Usuario | Email | Contraseña | Rol |
|---|---|---|---|
| El Míster | `mister@cfmetodo.es` | `metodo2025` | COACH_ADMIN |
| Analista | `analista@cfmetodo.es` | `metodo2025` | ANALYST |
| Cátedra | `plataforma@ecosystem.es` | `metodo2025` | PLATFORM_ADMIN |

## 3) Qué trae sembrado el club demo

- **Pilar 1 — Biblioteca de Sabiduría**: Principios → SubPrincipios (Cátedra global) + Tareas conectadas por relevancia (la receta ponderada del motor).
- **Pilar 2 — Roster + TeamPulse**: plantilla del CF Método, pulsos del vestuario.
- **Pilar 3 — Ingesta**: partidos con reporte y pizarra de eventos tácticos.
- **Pilar 4 — Motor Prescriptivo + Hoy**: microciclos propuestos con sesiones MD+1/MD-3/MD-2/MD-1 y auditoría EngineRun (`/dashboard/quality` = panel de control E2E).

## 4) Variables de entorno (opcional)

Copia `.env.example` a `.env` si quieres personalizar algo:

- `DATABASE_URL` — por defecto se fuerza al PG embebido local. Para apuntar a
  tu propio PostgreSQL o a Neon, pon aquí tu cadena postgres.
- `NEXTAUTH_SECRET` — firma de sesiones. En local ya funciona; en producción
  genera uno propio (`openssl rand -hex 24`).

## 5) Problemas frecuentes

| Síntoma | Solución |
|---|---|
| `P1012` o `Environment variable not found: DATABASE_URL` al hacer `db:push`/`db:migrate` | El CLI de Prisma lee `.env` directamente: `cp .env.example .env` y repite el comando |
| `Can't reach database server at localhost:5432` | Lanza `npm run local:up` y revisa `pg.log`. El primer arranque puede tardar unos segundos |
| `Failed to load external module @prisma/client-…` | Caché de Turbopack apuntando a un cliente Prisma regenerado: `rm -rf .next` y repite `npm run dev` |
| Puerto 5432 ocupado por otro Postgres | Cambia el `port` en `scripts/dev-postgres.mjs` y tu `DATABASE_URL` al mismo puerto |
| La app pide regenerar el cliente Prisma | `npm run db:generate` |
| Reset total de la base | para PG y borra la carpeta `.pgdata/`; vuelve a lanzar `npm run dev` + `db:push` + `db:seed` |

## 6) Producción (Vercel + Neon)

- Crea una base en [Neon](https://neon.tech) y pon su `DATABASE_URL` en Vercel.
- `NEXTAUTH_SECRET` y `NEXTAUTH_URL` (dominio público) como env vars en Vercel.
- `npx prisma migrate deploy` (o `db:push`) contra Neon + seed si quieres la Cátedra global.
- El guard de entorno (`src/lib/env-guard.ts`) detecta que la URL ya es
  postgres y no toca nada: cero cambios de código.
