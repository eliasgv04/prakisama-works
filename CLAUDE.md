# CLAUDE.md — Prakisama Works

App web instalable (PWA) para Prakisama, empresa de construcción: control de obras — trabajadores (con reconocimiento médico, formación y vacaciones), proveedores, bancos (con sus productos y vencimientos), importe, documentación/hitos, certificaciones y parte de horas. **Interfaz en español, simple y rápida.** Proyecto hermano de **Prakisama Mobility** (control de flota): mismo estilo visual y mismas convenciones de código, pero repositorio, proyecto Supabase y despliegue **independientes**.

## Comandos

```bash
npm install
npm run dev        # servidor local (http://localhost:5173), requiere .env
npm run build      # genera dist/ (incluye dist/sw.js con la lista de precaché)
npm run preview    # sirve dist/ para probar la PWA y el service worker
npm run icons      # regenera public/icons/*.png (scripts/generate-icons.mjs)
```

## Estructura

```
src/                 frontend (JS vanilla, ES modules)
  main.js            arranque: config, sesión, router, registro del service worker
  router.js          router por hash (#/obras/123)
  sw.js              plantilla del service worker (la procesa scripts/vite-plugin-sw.mjs)
  lib/                supabase, sesión, acceso a datos (api.js), fechas, formato, imágenes
  ui/                  helpers DOM (h()), componentes, acordeón, tarjetas, staging.js (patrón "alta con todo")
  views/               una pantalla por archivo; simpleEntity.js es la fábrica compartida de
                       proveedores/bancos (mismo formulario, dos configuraciones)
supabase/
  migrations/          esquema versionado (1 esquema, 2 RLS, 3 storage)
docs/                  (vacío por ahora)
```

Sin Edge Functions, sin pg_cron, sin proveedor de email: **nada de lo que pide esta app tiene plazos ni avisos** (a diferencia de Mobility), así que no hace falta ese motor. No hay alias `@shared`: la poca lógica de fechas (`src/lib/dates.js`) vive directamente en el frontend.

## Convenciones

Las mismas que Mobility (mismo equipo, mismo estilo):

- Idioma: interfaz, comentarios de negocio, commits y docs en **español**. Nombres de código en inglés/ASCII.
- Fechas de calendario = cadenas `YYYY-MM-DD` (`src/lib/dates.js`, copiado de `_shared/dates.js` de Mobility); nunca `new Date()` local para lógica de fechas.
- RLS en todas las tablas y en Storage. Al añadir una tabla: activar RLS y escribir las políticas en la misma migración.
- Ningún secreto en el frontend: solo la anon key (`.env`, fuera de git; hay `.env.example`).
- Sin dependencias innecesarias. Runtime del frontend: solo `@supabase/supabase-js`.
- Nunca `innerHTML` con datos de usuario: usar `h()` (crea nodos de texto).
- **Baja lógica Y borrado de verdad** en las listas maestras (`workers`, `providers`, `subcontractors`, `banks`, `projects`): cada ficha tiene los dos botones, "Dar de baja" (`active=false`, reversible) y "Eliminar" (DELETE, migración 9 — decisión posterior del usuario, revierte lo que ponía antes aquí sobre "nunca DELETE"). Las claves foráneas hacen de red de seguridad sin código adicional: `workers`/`providers`/`subcontractors`/`projects` tienen `on delete restrict` desde `work_hours`/`project_providers`/`project_subcontractors` — si tienen historial real detrás, el DELETE falla solo y hay que dar de baja en su lugar (mensaje ya traducido en `friendlyError`, código Postgres `23503`). Ojo: borrar un **banco** sí hace cascada sobre sus `bank_products` (avales incluidos), y borrar un **trabajador**/**obra** sin horas hace cascada sobre su historial (reconocimiento médico/formación/vacaciones; hitos/certificaciones/asignaciones) — el aval vinculado a una obra no se borra con ella, se queda en el banco (`on delete set null`). El resto de tablas (hitos, asignaciones, certificaciones, horas) ya se podían borrar desde el principio, para corregir errores.
- Sin tests unitarios (decisión ya tomada en Mobility, se mantiene aquí).

## Identidad visual

**Igual que Prakisama Mobility** (ver su CLAUDE.md para el detalle completo): azul `#074290` / granate `#c62654` de prakisama.com, Big Shoulders Display en titulares, Barlow en texto, tarjetas de 14 px con sombra azulada, botones de 6 px. Nombre corto en el móvil: "Works". La portada del panel usa un degradado azul liso (`--azul` → `--azul-oscuro`) en vez de una foto: Mobility tiene `hero-flota.jpg` (foto de la flota de la empresa) pero aquí todavía no hay una foto de obra propia que usar. Se puede añadir más adelante siguiendo el mismo patrón (`src/assets/hero-obra.jpg` + `.hero-band` en `styles.css`).

## Decisiones tomadas (por defecto, revisables)

- **Sin motor de avisos por email**: a diferencia de Mobility, nada de esta app manda correos ni usa Edge Functions/pg_cron/Resend (se preguntó explícitamente y así se confirmó varias veces: al montar el proyecto, al añadir el reconocimiento médico y de nuevo con los productos bancarios). El **reconocimiento médico y los productos bancarios sí tienen semáforo visual** (ok/próximo/vencido, `src/lib/dueStatus.js` — función genérica `dueStatus(fecha)`, antelación fija de 30 días sin pantalla de ajustes): se ven en su ficha, en su fila de la lista y en una sección propia del panel — pero solo dentro de la app, nada por email. Si algún día hace falta email, es la misma arquitectura que ITV en Mobility.
- **Sin subcontratas: todo es "proveedores"** (migración 10). Se probó primero con dos tablas separadas (subcontratas con control de "si han mandado la documentación", que no aplicaba a proveedores) porque el usuario pensaba separarlos a mano. Al importar 467 proveedores de golpe desde un Excel contable (sin ninguna columna que diga quién es subcontrata), separar dejó de ser viable y el usuario pidió quitar subcontratas del todo. El control de documentación **no se perdió**: se trasladó a `project_providers` (columnas `documentation_received`/`documentation_received_on`), así que sigue disponible para cualquier proveedor asignado a una obra — solo cambió a quién se le puede activar.
- **Hitos de obra = checklist fijo, no configurable**: 9 tipos fijos (`project_milestones.kind`), sembrados automáticamente al crear la obra (trigger `seed_project_milestones`). Cada uno es solo una fecha (vacía = pendiente) + notas + adjunto opcional. Si se necesitara un décimo hito, es un valor más en el `check` de la migración y en `MILESTONE_KINDS` (`src/lib/constants.js`) — no hace falta una tabla de configuración como `itv_rules` en Mobility, porque la lista de hitos no varía por obra.
- **Importe = columna generada**: `total_amount` se calcula en Postgres (`tax_base * (1 + vat_rate/100)`), nunca se guarda a mano. Así nunca puede descuadrar.
- **Parte de horas = registro por día** (no planificación de futuro): se pidió explícitamente que fuera "qué trabajador hizo cuántas horas en qué obra, un día concreto", no una agenda de asignaciones futuras. La pantalla "Horas" navega día a día.
- **Sin roles, alta solo por invitación**: igual que Mobility. Cualquier usuario activo puede hacer todo. Dar de alta a alguien es un `insert` a mano en Supabase Auth (Authentication → Users → Add user); el trigger `handle_new_user` le crea el perfil solo.
- **Sin modo offline**: a diferencia de Mobility (que guarda la última consulta para verla sin conexión), aquí no se pidió y los datos se consultan siempre en vivo. Se puede añadir después con el mismo patrón (`src/lib/offline.js` de Mobility) si hace falta.
- **Entidades maestras con una única pantalla de formulario** (`src/views/simpleEntity.js`): **proveedores y bancos** comparten el formulario (parametrizado; bancos usa su propia lista con semáforo, `banks.js`, pero el alta/edición sale de la fábrica igual). Proveedores no tiene ficha aparte (`${route}/:id` ya es el formulario, `cfg.hasDetail` sin poner); bancos sí (`cfg.hasDetail: true`, ficha en `bankDetail.js`) — importa para que el botón "Volver" al editar apunte al sitio correcto (ver más abajo, bug ya corregido). **Los trabajadores ya NO usan esta fábrica** desde que tienen reconocimiento médico/formación/vacaciones: tienen su propia ficha (`workerDetail.js`) y su propio formulario (`workerForm.js`).
- **Reconocimiento médico, formación y vacaciones son tablas propias** (`worker_medical_checkups`, `worker_trainings`, `worker_vacations`), no columnas en `workers`: son historiales con varias filas por trabajador (como `maintenance_records` en Mobility), no datos de una sola fila. Solo el reconocimiento médico calcula estado; formación y vacaciones son solo historial. El certificado de una formación reutiliza la tabla `attachments` (la misma que los adjuntos de hitos de obra), con una columna `training_id` nueva.
- **Alta con todo "en preparación"** (`src/ui/staging.js`, patrón compartido): al crear un trabajador o una obra nueva, se puede rellenar ya todo lo que normalmente cuelga de su ficha (trabajador: reconocimiento médico, formación, vacaciones; obra: los 7 hitos, aval, proveedores, certificaciones), aunque el registro padre todavía no exista en la base de datos — se guarda en memoria y se manda justo después de crear el padre (si algo falla, se avisa pero el padre queda creado igualmente; se añade luego a mano desde la ficha). Al **editar** un registro ya existente todo eso se gestiona desde su ficha, con persistencia inmediata: el formulario de edición no repite estas secciones. `stagedSection()`/`removableRow()` son el patrón "añadir a una lista en memoria" reutilizado en `workerForm.js` y `projectForm.js`; los hitos de obra no lo usan (son 7 tipos fijos, no una lista que crece) y tienen su propio `stagedMilestoneRow()` en `projectForm.js`, calcado del `milestoneRow()` de la ficha pero sin llamadas a la API hasta el guardado final. Fue un cambio pedido explícitamente por el usuario, primero para trabajadores y después, con las mismas palabras, para obras.
- **Bancos y sus productos** (`banks`, `bank_products`, migración 5): un banco (baja lógica, como trabajadores/proveedores/obras) tiene varios productos (préstamo, aval, línea de crédito...) con importe opcional y fecha de finalización/caducidad opcional; esa fecha entra en el mismo semáforo que el reconocimiento médico. **Pestaña propia "Finanzas"** en la barra de navegación (`src/ui/shell.js`), no dentro de "Listas": el usuario lo pidió explícitamente después de verlo montado ahí. `simpleEntity.js` admite `cfg.tab`/`cfg.listBack` para que una entidad pueda vivir fuera de "Listas" sin duplicar la fábrica.
- **Panel centrado en vencimientos, no en contadores de "activos"**: el usuario pidió explícitamente rehacerlo así tras ver la primera versión (que copiaba el estilo "obras activas / horas hoy" de Mobility). Ahora `dashboard.js` junta reconocimiento médico + productos bancarios en una sola lista `dueItems` ordenada por urgencia, con las mismas tres tarjetas semáforo (vencidos/próximos/al día) que Mobility pero **filtrando/contando vencimientos de Works, no vehículos**, y las tarjetas son filtros clicables de la lista de abajo (mismo patrón que el panel de Mobility). Las certificaciones sin cobrar se quedan como sección aparte, más abajo, porque no son un vencimiento por fecha.
- **El aval es un producto bancario vinculado a la obra, no un hito suelto** (migración 6): `bank_products` ganó `project_id` (enlace opcional a la obra que garantiza) y `return_requested_date` (solicitud de devolución); `end_date` hace de "fin del periodo de garantía" cuando el producto es un aval. Se quitaron del checklist fijo los hitos `constitucion_aval`/`finalizacion_aval` (quedan 7 hitos, no 9) porque un aval necesita banco + importe + fechas, más de lo que da una fecha suelta. Se ve y se crea **igual desde los dos sitios**: la ficha de la obra tiene su propia sección "Aval" (`avalCard` en `projectDetail.js`) y la ficha del banco, al añadir/editar un producto, deja elegir una "Obra relacionada" opcional (`bankDetail.js`) — es el mismo dato, `bank_products.project_id`, pedido explícitamente por el usuario para que se pueda dar de alta desde cualquiera de los dos lados.
- **Fechas calculadas del aval y prórroga de la obra** (migración 12): el aval no lleva el "fin del periodo de garantía" a mano, sino `reception_date` (recepción de la obra) + `guarantee_months` (duración, en la app en meses o años); un trigger recalcula `end_date` (la que usa el semáforo). Formulario compartido en `src/ui/avalFields.js` (la ficha del banco conserva la fecha manual para préstamos y la bloquea si hay recepción + duración). La obra tiene una prórroga opcional (`extension_amount` + `extension_unit` día/mes/año) y `extended_end_date` es columna generada; la ficha enseña la finalización original y la prorrogada. Una sola prórroga por obra. `addPeriod()` en `dates.js` reproduce la aritmética de Postgres (fin de mes recortado) para la vista previa.
- **Gastos de la obra** (`project_expenses`, migración 13): cada gasto es de un proveedor (obligatorio, `on delete restrict` como las horas), con título, importe, fecha (por defecto hoy) y descripción opcional. Sección "Gastos" en la ficha de la obra con el total. El proveedor **no** tiene que estar asignado a la obra (`project_providers` es otra cosa: control de documentación). Se elige con un buscador (`searchPickField` en `src/ui/components.js`, busca por nombre o NIF sin tildes) porque con 467 proveedores un desplegable no sirve. No está en el alta "en preparación" de la obra: se añaden desde la ficha.
- **Todo se puede editar** (petición explícita del usuario): cada registro de una ficha (reconocimiento, formación, vacaciones, aval/producto, certificación, proveedor asignado, horas) tiene "Editar" junto a "Borrar", reutilizando la misma hoja del alta con `existing` precargado. Las fichas de trabajador/obra/banco tienen además un lápiz arriba, en la cabecera.
- **Bug corregido: `openSheet()` no admitía un `build()` asíncrono.** Las hojas que necesitan cargar datos antes de mostrar el formulario (`openAddProviderSheet` en `projectDetail.js`, `openProductSheet` en `bankDetail.js`) llamaban a una función `async` y devolvían la promesa sin esperarla; `append()` no sabe pintar una promesa (la convierte en texto "[object Promise]"), así que esas dos hojas nunca llegaban a mostrar el formulario. Estaba así desde que se escribieron y no se había detectado. `openSheet()` (`src/ui/dom.js`) ahora acepta que `build()` devuelva un nodo o una promesa de un nodo: mientras tanto enseña "Cargando…". Se encontró al depurar el botón "Volver", verificando a fondo el flujo de "Añadir proveedor".

## Estado por fases

- [x] Fase 1 — proyecto, esquema, Auth, RLS, listas de trabajadores/proveedores
- [x] Fase 2 — obras: datos, importe/IVA, checklist de hitos con adjuntos, proveedores asignados, certificaciones
- [x] Fase 3 — parte de horas y panel de resumen
- [x] Fase 3.1 — personal: reconocimiento médico (con semáforo), formación (con adjunto) y vacaciones
- [x] Fase 3.2 — finanzas: bancos y sus productos, con semáforo de vencimiento
- [x] Fase 4 — desplegado en Vercel con repositorio de GitHub enlazado; README actualizado. PWA heredada de Mobility (manifest, iconos, service worker), sin pulido adicional específico de Works todavía.

### Proyecto Supabase real: "Prakisama Works" (ref `anlczsapvvvcxlzelzzm`, región eu-west-1)

- [x] Cuenta y organización de Supabase **nuevas, de la empresa** (org "Prakisama", no la cuenta personal que aloja FutsalKit): así Works no compite por el límite de 2 proyectos gratuitos de una cuenta personal.
- [x] Migraciones 1-13 aplicadas (`supabase db push`; 11: cuenta y nº S.S. en trabajadores; 12: aval con recepción + duración y prórroga de obra; 13: gastos de la obra). RLS activo en las 15 tablas (16 menos `subcontractors`/`project_subcontractors`, quitadas en la 10); bucket `attachments` privado. (7: número de cuenta y dirección en proveedores/subcontratas; 8: se quita el número de cuenta, no había fuente real; 9: DELETE en las listas maestras; 10: se quitan subcontratas del todo, control de documentación trasladado a `project_providers`.)
- [x] **467 proveedores importados** desde el listado contable de acreedores de la empresa (Excel, cuenta 410): nombre, NIF, dirección y email; sin teléfono (no estaba en el Excel). Insertado directo por API con la `service_role` (no por la app), en bloques de 100. La idea inicial era separar proveedores de subcontratas a mano, pero con 467 de golpe no fue viable — de ahí la migración 10.
- [x] Auth: registro público desactivado (`disable_signup`); `site_url` = `https://prakisama-works.vercel.app`, `uri_allow_list` incluye esa URL, las preview de Vercel (`*-elias-gonzalez-s-projects.vercel.app`) y `localhost:5173` para desarrollo.
- [x] Fases 1-3.1 probadas de punta a punta contra el proyecto real con Playwright (login, alta de trabajador/proveedor/subcontrata, obra con importe/IVA, checklist de hitos, parte de horas, reconocimiento médico/formación/vacaciones, panel). **A partir de la fase 3.2 el usuario revisa directamente en local** (`npm run dev`) en vez de que se verifique con Playwright en cada cambio — lo pidió así explícitamente. Excepción puntual: sí se usó Playwright con un usuario de prueba aparte para depurar el botón "Volver" y el bug de `openSheet()`, porque hacía falta reproducir el fallo exacto.
- [x] **Desplegado en Vercel, no en GitHub Pages** (cambio de plan respecto a Mobility): el usuario preguntó por Vercel a mitad de proyecto y se usó porque su CLI permite desplegar directo desde local sin necesitar `gh` (que no estaba disponible en el entorno). Proyecto `elias-gonzalez-s-projects/prakisama-works`, framework Vite detectado solo. Variables `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` puestas como env vars de producción (`vercel env add`). Se quitó `.github/workflows/deploy.yml` (el de GitHub Pages, ya no aplica).
- [x] Repositorio `eliasgv04/prakisama-works` en GitHub (privado, creado por el usuario) enlazado al proyecto de Vercel con `vercel git connect`: cada `git push` a `main` despliega solo.
- [ ] Pendiente (decisión del usuario, no bloqueante): si se quiere, transferir también el proyecto Supabase de **Mobility** a esta misma organización nueva ("Prakisama"), vía Settings → General → Transfer project desde la cuenta personal. No afecta a Works.
- [ ] Pendiente (opcional): el plan de Vercel usado es el gratuito "Hobby", cuyas condiciones son para uso personal/no comercial — para una app de empresa lo correcto de cara al futuro sería el plan Pro. Se avisó al usuario, decisión suya.

Notas de operación: aplicar migraciones con `SUPABASE_ACCESS_TOKEN=… npx supabase db push --linked` (proyecto ya enlazado en `supabase/config.toml`). El token de acceso de esta organización nueva no se ha guardado en ningún archivo del repo ni fuera de él: pídelo de nuevo si hace falta.

- Futuro: dominio propio, PWA con notificaciones push si algún día hace falta avisar de algo con plazo, exportar horas/certificaciones a Excel.

---

# Brief original (resumen de la conversación)

El usuario pidió una app "del mismo estilo" que Prakisama Mobility, para la misma empresa, para llevar el control de las obras. Nombre elegido: **Prakisama Works**.

Requisitos, tal y como se pidieron:

1. Listado de trabajadores y listado de obras, para poder asignar horas de cada trabajador a cada obra sin repetir datos.
2. Listado de proveedores y subcontratas (igual que trabajadores), para asignarlos a las obras. *(Cambio posterior: sin subcontratas — al importar 467 proveedores de golpe desde un Excel contable sin esa distinción, separar a mano dejó de ser viable; todo es "Proveedores", ver migración 10.)*
3. Cada obra debe tener: importe (base imponible + IVA, el total calculado solo a partir del % de IVA), nombre y referencia de ejecución, inicio y finalización, y el siguiente checklist de documentación: contrato, plan de seguridad, acta de aprobación del plan de seguridad, comunicación de apertura, libro de subcontratación, constitución de aval, finalización de aval, acta de replanteo, recepción de la obra. Además, subcontratas asignadas con si han mandado su documentación, certificaciones (fecha + pago) y notas.
4. Un calendario con las horas de los obreros (lo mencionado en el punto 1).

Preguntas hechas antes de empezar y respuestas del usuario:

- **Ubicación del proyecto**: repositorio y proyecto Supabase nuevos y separados (no dentro de `prakisama-flota`).
- **Documentos/hitos de obra**: checklist simple con fecha y adjunto, **sin** avisos ni plazos.
- **Calendario de obreros**: parte de horas por día (registro de lo ya trabajado), no planificación de futuro.
- **Proveedores y subcontratas**: dos listas separadas (no una sola tabla con un campo "tipo"), porque solo las subcontratas llevan control de documentación por obra. *(Cambio posterior: ver arriba, ya no hay subcontratas.)*

Al toparse con que la cuenta de Supabase personal del usuario ya tenía sus 2 proyectos gratuitos ocupados (uno de ellos, "Prakisama Mobility"), se decidió crear una cuenta y organización de Supabase nuevas a nombre de la empresa, en vez de mezclar Works con Mobility en el mismo proyecto (que habría obligado a esquemas separados, login compartido entre las dos apps y alta manual de usuarios) o pausar el otro proyecto personal del usuario (FutsalKit). Queda pendiente, si el usuario quiere, transferir también Mobility a esa organización nueva.

## Ampliación: personal (después de la primera base)

Con la primera base ya revisada por el usuario, pidió añadir al trabajador: **reconocimiento médico (con vencimientos y avisos), formación y vacaciones**. Preguntas y respuestas:

- **Avisos del reconocimiento médico**: semáforo visual en la app (panel, ficha y lista), **sin** email — de momento esta app sigue sin Resend/Edge Functions/cron.
- **Formación**: nombre, fecha y certificado adjunto, **sin** caducidad ni avisos (es historial, como los hitos de obra).
- **Vacaciones**: periodos con fecha de inicio y fin, **sin** cálculo de saldo de días disponibles.
