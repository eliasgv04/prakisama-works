# Prakisama Works

App web instalable (PWA) para controlar las **obras** de Prakisama: personal (con reconocimiento médico, formación y vacaciones), proveedores, subcontratas, bancos y sus productos, importe, documentación (checklist de hitos), aval, certificaciones y parte de horas. Pensada para usarse desde el móvil.

- **Frontend:** JavaScript vanilla (ES modules) + Vite. Única dependencia de runtime: `@supabase/supabase-js`.
- **Backend:** Supabase (Postgres, Auth, Storage). Sin Edge Functions ni pg_cron: esta app no envía avisos ni emails, solo semáforo visual dentro de la app.
- **Hosting:** Vercel — **https://prakisama-works.vercel.app**. Repositorio en GitHub (`eliasgv04/prakisama-works`) enlazado: cada `git push` a `main` despliega solo.

> Proyecto hermano de **Prakisama Mobility** (control de flota): mismo estilo visual y las mismas convenciones, pero repositorio y proyecto Supabase independientes. Más contexto y decisiones de diseño: [CLAUDE.md](CLAUDE.md).

## Índice

1. [Puesta en marcha local](#1-puesta-en-marcha-local)
2. [Configurar Supabase](#2-configurar-supabase)
3. [Variables de entorno](#3-variables-de-entorno)
4. [Dar de alta a un usuario](#4-dar-de-alta-a-un-usuario)
5. [Instalar la app en el móvil](#5-instalar-la-app-en-el-móvil)
6. [Desplegar el frontend](#6-desplegar-el-frontend)
7. [Cómo funciona](#7-cómo-funciona)
8. [Problemas frecuentes](#8-problemas-frecuentes)

---

## 1. Puesta en marcha local

```bash
npm install
cp .env.example .env   # rellena las dos variables (sección 3)
npm run dev             # http://localhost:5173
```

## 2. Configurar Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com) (o usa el ya creado, ver `CLAUDE.md`).
2. Aplica el esquema:
   ```bash
   npx supabase login
   npx supabase link --project-ref TU-REF
   npx supabase db push
   ```
   Esto crea las tablas, las políticas RLS y el bucket de Storage `attachments`.
3. En **Authentication → Providers → Email**, desactiva el registro público (o usa la API: `disable_signup: true`). El alta de usuarios es solo por invitación (sección 4).
4. En **Authentication → URL Configuration**, pon `Site URL` a la URL donde viva la app (`https://prakisama-works.vercel.app` en producción) y añade esa misma URL con `/**` a `Redirect URLs` (además de `http://localhost:5173/**` para desarrollo).

## 3. Variables de entorno

Copia `.env.example` a `.env`:

```
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu-clave-anon
```

Solo la clave **anon** (pública por diseño): toda la seguridad la da RLS, no el frontend. En Vercel, estas mismas dos variables están puestas en **Project Settings → Environment Variables** (entorno "Production").

## 4. Dar de alta a un usuario

No hay registro público. Para dar de alta a alguien:

1. Supabase → **Authentication → Users → Add user** (con email y contraseña provisional, o mándale una invitación).
2. El trigger `handle_new_user` le crea el perfil automáticamente en `profiles`. Ya puede entrar y cambiar su contraseña desde **Cuenta**.

Cualquier usuario activo puede hacer lo mismo que los demás (sin roles). Para quitarle el acceso a alguien, desactiva su cuenta desde **Cuenta → Equipo** (no se puede desactivar la propia cuenta ni dejar el sistema sin nadie activo).

## 5. Instalar la app en el móvil

Desde **Cuenta → Instalar la app** hay instrucciones para Android (Chrome) e iPhone (Safari). Instalada, abre a pantalla completa y arranca más rápido gracias al service worker (precachea la app; los datos siempre se piden en vivo).

## 6. Desplegar el frontend

Ya desplegado en Vercel, enlazado con el repositorio de GitHub. Para otra persona que parta de cero:

1. `vercel link` desde la carpeta del proyecto (crea o enlaza el proyecto de Vercel).
2. `vercel env add VITE_SUPABASE_URL production` y `vercel env add VITE_SUPABASE_ANON_KEY production` (pegando el valor cuando lo pida).
3. `vercel git connect` para enlazarlo con el repositorio de GitHub — a partir de ahí, cada `git push` a `main` construye y publica solo (Vercel detecta Vite automáticamente: `vite build`, carpeta `dist`).
4. Actualiza en Supabase (paso 2.4) `Site URL` y `Redirect URLs` con la URL real.

## 7. Cómo funciona

- **Trabajadores, proveedores, subcontratas, bancos y obras** son listas maestras con "Dar de baja" (`active=false`, reversible) y también "Eliminar" (borrado real). Si el registro tiene historial de verdad detrás (horas, asignación a una obra), el borrado falla solo y hay que darlo de baja en su lugar; borrar un banco sí borra en cascada sus productos. Trabajadores/proveedores/subcontratas/bancos se eligen desde un desplegable al asignarlos a una obra, al parte de horas o a un producto bancario: no hace falta volver a escribir nombres.
- **Reconocimiento médico, formación y vacaciones** (de cada trabajador) y **productos bancarios** (de cada banco) son historiales propios. El reconocimiento médico y los productos bancarios tienen **semáforo** (ok / próximo / vencido, 30 días de antelación fija) visible en su ficha, en su lista y en el panel — sin email, solo dentro de la app. Formación y vacaciones son solo historial, sin semáforo.
- **Importe de la obra**: se pone la base imponible y el % de IVA; el total lo calcula Postgres solo (columna generada), nunca se escribe a mano.
- **Documentación de la obra**: checklist fijo de 7 hitos (contrato, plan de seguridad, acta de aprobación, comunicación de apertura, libro de subcontratación, acta de replanteo, recepción de obra). Cada uno se marca con la fecha en que se hizo (vacía = pendiente) y admite un adjunto (PDF o foto). Sin plazos ni avisos: es solo un estado de la obra.
- **Aval**: no es un hito suelto, es un producto bancario (banco, importe, fin del periodo de garantía, solicitud de devolución) vinculado a la obra. Se ve y se da de alta igual desde la ficha de la obra ("Aval") o desde la ficha del banco ("Añadir producto" → obra relacionada).
- **Subcontratas de la obra**: además de asignarlas, se marca si han mandado su documentación (con fecha).
- **Certificaciones**: fecha, importe y fecha de cobro (vacía = pendiente de cobro).
- **Parte de horas**: qué trabajador hizo cuántas horas en qué obra, cada día. La pantalla "Horas" navega día a día como una agenda.
- **Panel**: centrado en los vencimientos (reconocimiento médico + productos bancarios/avales), ordenados por urgencia, con tarjetas semáforo que filtran la lista. Las certificaciones sin cobrar van aparte, debajo.
- **Alta con todo de una vez**: al crear un trabajador o una obra nueva se puede rellenar ya todo lo que normalmente cuelga de su ficha (reconocimiento médico/formación/vacaciones; hitos/aval/proveedores/subcontratas/certificaciones) aunque el registro todavía no exista — se manda en cuanto se guarda.
- Todas las fechas se tratan como cadenas `YYYY-MM-DD` (nunca `Date` local) para no arrastrar errores de zona horaria — ver `src/lib/dates.js`.

## 8. Problemas frecuentes

| Síntoma | Causa / solución |
|---|---|
| "Falta la configuración de Supabase" al abrir la app | No existe `.env` o le faltan las variables (sección 3). |
| Email o contraseña incorrectos al entrar | Revisa que el usuario esté dado de alta en Supabase Auth y con la cuenta activa en `profiles`. |
| "No tienes permiso para hacer esto" | Casi siempre RLS: la cuenta no está activa, o se intenta borrar algo con baja lógica (trabajador, proveedor, subcontrata, banco u obra) en vez de darlo de baja. |
| Una obra nueva no muestra los 7 hitos | El trigger `seed_project_milestones` los siembra al crear la obra; si faltan, revisa que la migración 1 se haya aplicado entera. |
| Tras `git push` no se actualiza la web | Comprueba que el repositorio esté enlazado (`vercel git connect`) y mira el build en el dashboard de Vercel. |

## Identidad visual

Igual que Prakisama Mobility (detalle en su propio README/CLAUDE.md): azul `#074290` y granate `#c62654` de prakisama.com, Big Shoulders Display en titulares, Barlow en texto. Nombre corto en el móvil: "Works".

## Estructura

```
src/                  frontend (JS vanilla, ES modules)
  lib/                 supabase, sesión, acceso a datos (api.js), fechas, formato, imágenes
  ui/                  helpers DOM, componentes de interfaz y el patrón de "staging" (alta con todo)
  views/               una pantalla por archivo
supabase/
  migrations/          esquema versionado (1 esquema, 2 RLS, 3 storage, 4 personal, 5 finanzas, 6 aval)
```
