# Calculadora NOM-001 (PWA con licencias)

Contenido de la carpeta:

| Archivo | Para qué sirve |
|---|---|
| `index.html` | La calculadora, con pantalla de acceso y barra de cuenta |
| `admin.html` | Panel para dar, renovar, suspender licencias y administrar dispositivos |
| `config.js` | Datos de tu proyecto de Supabase (lo único que debes editar) |
| `circuitos.js` | Proyectos, tableros, circuitos y cuadro de cargas |
| `unifilar.js` | Diagrama unifilar (SVG, PNG, DXF) generado desde los tableros |
| `license.js` | Login, validación de licencia, límite de dispositivos y modo sin conexión |
| `logo.png`, `logo-cubo.png` | Logo de D3 (completo y solo el cubo). Se puede reemplazar por otro con el mismo nombre |
| `sw.js`, `manifest.webmanifest`, `icons/` | Hacen que se instale como app y funcione sin internet |
| `supabase/schema.sql` | Tablas, seguridad y funciones del servidor |

## Puesta en marcha

1. **Crear el proyecto.** Entra a supabase.com, crea una cuenta y un proyecto nuevo (el plan gratuito alcanza para empezar).
2. **Cargar el esquema.** En el proyecto abre *SQL Editor*, pega todo `supabase/schema.sql` y presiona *Run*.
3. **Autenticación.** En *Authentication > Providers* deja Email activo y la confirmación de correo encendida. En *Authentication > URL Configuration* pon como *Site URL* la dirección donde publicarás la app (paso 5).
4. **Conectar la app.** En *Project Settings > API* copia *Project URL* y la clave *anon public*, y pégalas en `config.js`. No uses nunca la clave `service_role`.
5. **Publicar.** Sube la carpeta completa a un hosting con HTTPS (Cloudflare Pages, Netlify o GitHub Pages). HTTPS es obligatorio para instalarla como app.
6. **Crear tu administrador.** Abre la app, crea tu cuenta y confirma tu correo. Luego, en *SQL Editor*, ejecuta:
   `update public.profiles set is_admin = true where email = 'tu@correo.com';`
7. **Dar licencias.** Entra a `tu-dirección/admin.html` con esa cuenta. Cada persona se registra en la app y aparece en la lista; ahí le pones +30 días, +1 año o la editas.

Mientras `config.js` conserve los valores de ejemplo, la app corre en **modo prueba sin control de licencias**. No la publiques así.

## Circuitos, tableros y cuadro de cargas

- **Calcular:** en la sección *Circuito* elige el tablero, escribe el número y el nombre, y toca *Guardar en TAB-X*. El tablero fija el sistema y la tensión.
- **Tableros:** crea los tableros del proyecto (sistema, tensión, capacidad interruptiva y datos del alimentador). Desde ahí editas, duplicas o eliminas circuitos y puedes fijar la fase de cada uno.
- **Fuente del tablero:** cada tablero indica de dónde se alimenta (transformador, medidor, otro tablero u otra fuente). Si es otro tablero, su alimentador aparece como un circuito del tablero fuente, con número asignado automáticamente (se puede cambiar), y su carga instalada se suma al total de ese tablero. En el cuadro del tablero fuente, cada subtablero muestra su carga instalada, su factor de demanda y su carga demandada. El factor de demanda de cada tablero se aplica a la suma de las cargas instaladas (al 100 %) de sus circuitos y subtableros, nunca a cargas ya demandadas.
- **Cuadro de cargas:** se arma solo con los circuitos guardados. Balancea las fases, calcula el desbalance y dimensiona el alimentador y el interruptor principal del tablero. Se imprime o guarda como PDF, y se descarga en CSV para abrirlo en Excel.
- **Proyectos:** puedes tener varios (por obra). Los datos se guardan en el dispositivo; usa *Exportar respaldo* para copiarlos o pasarlos a otro equipo.

## Diagrama unifilar

La pestaña *Unifilar* dibuja, a partir de los datos ya capturados:
- el **transformador** (ficha en la pestaña Tableros: kVA, conexión, tensiones y factor de demanda) con su tabla de carga demandada;
- la tabla de **alimentadores**, uno por tablero alimentado por ese transformador;
- un bloque por tablero con sus circuitos: ITM, tamaño y tipo de cable, corriente, caída de tensión, longitud, kW y carga. Si el tablero es *centro de medición* se dibuja un medidor por circuito;
- el cuadro de datos del plano, con el logo.

Con la opción *Todo el proyecto* se dibuja la **cadena completa**: cada transformador, medidor u otra fuente con sus tableros, y sus subtableros. Los bloques se acomodan en columnas aprovechando el alto de la hoja (la app prueba varias alturas y elige la que mejor llena una A1). Cada subtablero se une, con una línea azul, al circuito que ocupa en su tablero fuente. Con *Incluir subtableros* apagado solo se dibuja el primer nivel. También se puede dibujar un solo transformador o un solo tablero. Se exporta como SVG, PNG o DXF (para retocar en AutoCAD) y se imprime.

## Cómo funciona el control

- **Login por usuario.** Correo y contraseña; hay recuperación de contraseña por correo.
- **Licencia con vencimiento.** Se valida en el servidor cada vez que se abre la app y cada 15 minutos mientras está abierta.
- **Revocar.** Al suspender una licencia, el usuario pierde acceso en su siguiente validación (máximo 15 minutos con internet).
- **Límite de dispositivos.** Por defecto 2 por licencia. Si el usuario llega al límite, puede liberar uno por su cuenta (máximo 3 veces cada 30 días); el administrador puede quitar o bloquear dispositivos sin límite.
- **Sin internet.** Funciona hasta 2 días desde la última validación (`OFFLINE_GRACE_DAYS: 2` en `config.js`, editable hasta 7 días). Pasado ese plazo, o si la licencia vence en ese lapso, pide conectarse. Si detecta que el reloj del equipo se movió hacia atrás, también pide conexión.
- **Prueba gratis opcional.** En `schema.sql`, dentro de `handle_new_user`, hay un bloque comentado que da 7 días a cada cuenta nueva.

## Límites que conviene conocer

- Los cálculos corren en el celular para que funcionen sin señal. La licencia controla el acceso, pero una persona con conocimientos técnicos podría copiar las tablas y fórmulas de la página. Si más adelante necesitas protegerlas, el cálculo se puede mover a una función del servidor (se pierde el modo sin internet).
- Un usuario con licencia válida puede compartir su contraseña. El límite de dispositivos y su control en el panel reducen ese riesgo.

## Actualizar la app

Cuando cambies cualquier archivo, sube el número de `VERSION` en `sw.js` (por ejemplo `calc-nom-v13`) y vuelve a publicar. Los usuarios reciben la versión nueva al abrirla con conexión.

## Instalar en el celular

- **Android (Chrome):** menú de tres puntos > *Instalar app*.
- **iPhone (Safari):** botón Compartir > *Añadir a pantalla de inicio*.

## Despliegue rápido para prueba interna en D3 (PC y celular)

1. **Activar licencias en Supabase:**
   - Crea tu proyecto gratuito en [supabase.com](https://supabase.com) y ejecuta `supabase/schema.sql` en *SQL Editor*.
   - Copia *Project URL* y la clave *anon public* en `config.js` (`OFFLINE_GRACE_DAYS` viene configurado en `2` días para control estricto de residentes).
2. **Publicar con HTTPS (sin comprar dominio):**
   - **Opción recomendada (oficina + obra con PWA instalable):** Arrastra la carpeta `pwa-calculo-electrico` a [Netlify Drop](https://app.netlify.com/drop) o actívala en GitHub Pages / Cloudflare Pages. Tendrás una URL `https://...` lista para instalar en Android, iPhone y PC.
   - **Opción intranet D3 (Synology NAS):** Copia el contenido de `pwa-calculo-electrico` a una carpeta compartida web en Web Station de tu Synology NAS (`\SYNOLOGY-D3\web\calculo-nom`) para probarlo dentro de la red de oficina o por Synology VPN.
3. **Dar de alta tu usuario administrador y equipo:**
   - Abre la app, registra tu cuenta con tu correo y ejecuta en Supabase *SQL Editor*:
     `update public.profiles set is_admin = true where email = 'tu@correo.com';`
   - Entra a `tu-url/admin.html`, asigna licencias a cada residente (puedes limitar a `1` o `2` dispositivos por persona) y suspende o bloquea equipos al instante si alguien deja de colaborar con D3.
