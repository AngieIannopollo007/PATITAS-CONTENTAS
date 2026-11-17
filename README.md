# PATITAS 🐾

Una aplicación basada en la idea original de Angie: conectar refugios, rescatistas y adoptantes, organizar adopciones y reconocer las colaboraciones con puntos PATITAS. Código creado desde cero con asistencia de IA.

**Hay una sola versión.** No hay carpetas ANTES y DESPUÉS. Esta es la aplicación, con frontend, backend y base de datos.

## Configurar PostgreSQL desde pgAdmin en Windows

Necesitás **Node.js 24 o superior**, PostgreSQL y pgAdmin. Si ya instalaste PostgreSQL, abrí pgAdmin desde el menú Inicio. El instalador de Windows incluye ambos. [Descarga oficial de PostgreSQL](https://www.postgresql.org/download/windows/)

### 1. Creá el usuario y la base

1. En pgAdmin, desplegá **Servers → PostgreSQL** y conectate con el usuario administrador (`postgres` en una instalación típica) y la contraseña que elegiste al instalar. Si no aparece el servidor, hacé clic derecho en **Servers → Register → Server**. En **General**, poné un nombre, por ejemplo `PostgreSQL local`. En **Connection**, completá el host `127.0.0.1`, el puerto `5432`, la base de mantenimiento `postgres` y el usuario `postgres`. [Registro de servidores en pgAdmin](https://www.pgadmin.org/docs/pgadmin4/latest/server_dialog.html)
2. Hacé clic derecho en **Login/Group Roles → Create → Login/Group Role**. En **General**, escribí `patitas_app`. En **Definition**, poné una contraseña propia. En **Privileges**, activá **Can login?** y guardá. [Creación de roles en pgAdmin](https://www.pgadmin.org/docs/pgadmin4/latest/role_dialog.html)
3. Hacé clic derecho en **Databases → Create → Database**. Escribí `patitas` como nombre, elegí `patitas_app` en **Owner** y guardá. PATITAS crea las tablas al arrancar por primera vez. [Creación de bases en pgAdmin](https://www.pgadmin.org/docs/pgadmin4/latest/database_dialog.html)

### 2. Configurá PATITAS

Si estás usando un ZIP, extraelo completo. Abrí PowerShell en la carpeta de PATITAS y ejecutá:

```powershell
npm.cmd ci
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
notepad .env
```

Completá estas variables. Conservá los valores de correo que ya tengas. Usá el puerto de tu instancia PostgreSQL si lo cambiaste al instalar.

```dotenv
PGHOST=127.0.0.1
PGPORT=5432
PGDATABASE=patitas
PGUSER=patitas_app
PGPASSWORD="la contraseña que elegiste para patitas_app"
DEMO=0
```

Si empezás de cero y querés cuentas ficticias, usá `DEMO=1` antes del primer arranque. Guardá `.env` solo en tu computadora.

### 3. Abrí la app y comprobá los datos

1. Ejecutá `npm.cmd start` o hacé doble clic en **ABRIR PATITAS.cmd**. Dejá la ventana abierta y entrá a [PATITAS](http://127.0.0.1:3000).
2. Ingresá con tu cuenta o creá una. En pgAdmin, refrescá **Databases → patitas → Schemas → public → Tables**. También podés abrir **Query Tool** sobre la base `patitas` y comprobar los totales:

   ```sql
   SELECT (SELECT COUNT(*) FROM public.usuarios) AS usuarios,
          (SELECT COUNT(*) FROM public.mascotas) AS mascotas;
   ```

## Despliegue desde GitHub

1. Subí el código con `package-lock.json`, `backend/esquema.sql` y `.env.example`. Guardá `.env`, las credenciales y los respaldos de PostgreSQL fuera del repositorio.
2. Creá un servicio web Node.js 24 o superior conectado al repositorio. Usá `npm ci` para instalar y `npm start` para arrancar. Elegí un servicio que permanezca activo si necesitás mantener el servidor encendido.
3. Creá una base PostgreSQL persistente y conectala al servicio. Cargá `DATABASE_URL` en las variables privadas del proveedor o completá `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER` y `PGPASSWORD`. Usá la red privada del proveedor cuando esté disponible y TLS con verificación de certificado para conexiones externas. Para conservar datos previos, exportá y restaurá la base por un canal privado. [Conexión a PostgreSQL con TLS](https://node-postgres.com/features/ssl) · [Exportación de PostgreSQL](https://www.postgresql.org/docs/current/app-pgdump.html)
4. Configurá las variables del servicio. Usá como `APP_ORIGIN` la URL HTTPS exacta desde la que se va a abrir PATITAS, con el dominio del proveedor o tu dominio propio. El proxy del proveedor debe conservar el encabezado `Host` del dominio público. En producción, la app escucha por defecto en `0.0.0.0` y toma el puerto de `PORT`.

   ```dotenv
   NODE_ENV=production
   APP_ORIGIN=https://patitas.ejemplo.com
   DEMO=0
   ```

   Usá `/salud` como ruta de verificación. Devuelve `200` cuando responde PostgreSQL y `503` cuando falla. Activá `TRUST_PROXY=1` únicamente si el proxy es el único ingreso al servidor y agrega la IP real del cliente al final de `X-Forwarded-For`. El servidor usa esa IP para limitar intentos de acceso y registro.
5. Creá una cuenta propia de adoptante desde PATITAS y habilitala para moderación. Ejecutá este comando desde una consola con acceso a PostgreSQL de producción y sus variables privadas. Volvé a iniciar sesión después de promover la cuenta.

   ```sh
   npm run admin:promover -- tu-correo@ejemplo.com
   ```

   El modo público bloquea las cuentas demo y sus sesiones, incluso si venían en un respaldo.
6. Desde la URL pública, probá crear una cuenta, ingresar y salir, enviar una solicitud y acceder a **Mi espacio → Moderación**. Activá los respaldos de la base en el proveedor. Gmail es opcional y requiere que el servicio permita conexiones SMTP salientes al puerto `465`.

En Render, usá **Web Service** para Node.js y **Postgres** para la base. Podés configurar `/salud` en **Health Check Path**. Los planes gratuitos tienen límites de disponibilidad y duración. [Servicios web](https://render.com/docs/web-services) · [Verificaciones de estado](https://render.com/docs/health-checks) · [Límites gratuitos](https://render.com/docs/free)

## Cuentas de ejemplo

Todas usan la contraseña **Patitas2026!** y contienen información ficticia.

| Cuenta | Correo | Para qué sirve |
| --- | --- | --- |
| Adoptante | ana@patitas.test | Solicitar adopciones, colaborar, escribir mensajes y calificar experiencias |
| Refugio | refugio@patitas.test | Publicar, resolver solicitudes, consultar planilla y confirmar donaciones |
| Particular / rescatista | sofia@patitas.test | Las mismas herramientas de publicación para una persona particular |
| Moderación | admin@patitas.test | Revisar reportes de reseñas y ocultarlas si corresponde |

Estas cuentas se crean al iniciar localmente una base vacía con `DEMO=1`. La app conserva la sesión durante siete días. «Salir» cierra la sesión. Las contraseñas se guardan como hashes.

## Qué hace la aplicación

- Registro e inicio de sesión obligatorio, con roles y foto de perfil requerida. Cada cuenta recibe 5 PATITAS de bienvenida una sola vez.
- Perfiles de refugios y particulares con historia, ciudad, contacto público opcional, mascotas, donaciones y reseñas.
- Publicación y edición de mascotas con foto principal obligatoria, segunda foto opcional, especie, edad, sexo, tamaño, historia y salud informada. Para eliminarlas del catálogo se retira la publicación, conservando el historial.
- Búsqueda por nombre o ciudad y filtro por especie, con páginas de 24 mascotas.
- Formulario de adopción privado con datos personales, vivienda, motivo y compromiso.
- Solicitudes pendientes, en revisión, aprobadas, rechazadas o canceladas. Aprobar crea una adopción y evita que la mascota sea adoptada dos veces.
- Planilla privada de adopciones con nombres, direcciones, teléfonos, fechas y notas. Descarga CSV para abrir con Excel.
- Chats privados separados por persona para consultar y coordinar entregas, con actualización automática cada cinco segundos.
- Centro de notificaciones con campana, contador y avisos leídos/no leídos guardados.
- Registro de donaciones de dinero, alimentos, medicamentos, accesorios u otros elementos. El destinatario confirma la recepción y se otorgan 10 PATITAS una sola vez.
- Reseñas de 1 a 5 estrellas, en ambos sentidos, solo después de una adopción registrada o una donación confirmada. Una reseña por autor y experiencia.
- Reportes de comentarios y panel de moderación.
- Notificaciones dentro de la app y envío por Gmail cuando esté configurado.

## Probá el recorrido completo

1. Entrá como **Adoptante**. Elegí Luna → Conoceme → Quiero adoptar. Completá datos ficticios y enviá.
2. Salí y entrá como **Refugio**. Abrí Mi espacio → Solicitudes recibidas. Podés ver el formulario y resolverlo.
3. Si aprobás, mirá **Planilla de seguimiento**: se creó el registro de adopción. Podés guardar una nota y descargar la planilla.
4. Volvé como Adoptante. Entrá al perfil de Refugio Huellitas → Donar. Registrá, por ejemplo, alimentos. Todavía conserva las 5 PATITAS de bienvenida; esta donación no sumó puntos aún.
5. Como Refugio, en Donaciones, confirmá que la recibiste. El adoptante suma **10 PATITAS** y pasa de 5 a 15 si es su primera donación.
6. Ambas cuentas pueden dejar una reseña desde esa experiencia. El perfil muestra las reseñas recibidas.
7. Para probar moderación, reportá una reseña, entrá como Moderación y abrí Mi espacio → Moderación.

Los cambios entre cuentas se hacen con Salir. El centro de avisos y el chat activo se actualizan cada cinco segundos con la pestaña visible; no son notificaciones push del sistema. Las otras secciones conservan el botón Actualizar.

## Gmail

Completá `GMAIL_USER` con el remitente y `GMAIL_APP_PASSWORD` con una contraseña de aplicación de Google. Para un deploy, cargá ambos valores en las variables privadas del proveedor.

Leé [la guía de Gmail](https://github.com/AngieIannopollo007/docmentacion-patitas/blob/main/material-complementario/docs/GMAIL.md). No compartas esa contraseña ni la subas a GitHub. Sin configurarla, todo lo demás funciona y los avisos se guardan en Mi espacio → Notificaciones; en la pestaña Correos los emails figuran como «local». La app no dice que envió un correo si no lo hizo.

## Donaciones y confianza

El botón Donar registra y organiza la ayuda. **No cobra tarjetas ni transfiere dinero.** Las transferencias se coordinan por fuera usando el alias o instrucciones del refugio, y se confirman después de recibirlas. No ingreses datos de tarjetas.

Cada cuenta tiene 5 puntos de bienvenida. Cada donación confirmada suma 10 puntos, sin importar su importe. Las PATITAS muestran colaboración, no certifican identidad ni aptitud para adoptar. Un refugio debe entrevistar y evaluar a cada adoptante. Las cuentas del ejemplo no están verificadas por ninguna organización.

## Dónde está cada cosa

| Archivo / carpeta | Explicación sencilla |
| --- | --- |
| public/index.html | La estructura inicial de la página |
| public/estilos.css | Colores, tamaños y adaptación a celular |
| public/app.js | Pantallas, botones, formularios y llamadas al servidor |
| public/imagenes | Ilustraciones incluidas; podés subir fotos a tus publicaciones |
| servidor.js | Enciende la app y lee la configuración privada |
| backend/app.js | Recibe peticiones y comprueba sesión, permisos de formulario y rutas |
| backend/servicios.js | Reglas de adopciones, donaciones, mensajes y reseñas |
| backend/base.js y backend/esquema.sql | Conexión, transacciones y tablas de PostgreSQL |
| backend/administrador.js | Habilita una cuenta propia para moderación |
| backend/seguridad.js | Protección de contraseñas y validaciones |
| backend/correo.js | Cola de notificaciones y conexión con Gmail |
| test | Pruebas automáticas |
| docs | Guías y explicación del proyecto |
| reportes | Evidencia de las pruebas y captura del catálogo |

## Pruebas

Creá una base separada `patitas_pruebas` en pgAdmin con el rol `patitas_app` como dueño. Desde PowerShell, cargá la conexión de `.env` y elegí la base de pruebas:

```powershell
$env:PATITAS_TEST_DATABASE = "patitas_pruebas"
node --env-file=.env --test
```

Las pruebas crean un esquema temporal por caso con datos ficticios.

## Si algo no abre

- **No reconoce node:** instalá Node.js 24 o superior y cerrá/reabrí la terminal.
- **npm.ps1 bloqueado:** usá `npm.cmd start` o el archivo ABRIR PATITAS.cmd.
- **Puerto ocupado:** cerrá la otra ventana que tenga el servidor abierto. Si cambiaste PORT en .env, usá la dirección que muestra la terminal.
- **PostgreSQL rechaza la conexión:** comprobá en pgAdmin que el servidor esté iniciado y revisá `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER` y `PGPASSWORD` en `.env`.
- **La página dice que no conecta:** el servidor debe permanecer encendido.
- **El correo quedó local:** falta completar Gmail y reiniciar. Después podés enviarlo desde Notificaciones.

Para detener la app, usá **Ctrl+C** en la ventana del servidor. Para respaldar los datos nuevos, hacé clic derecho en la base `patitas` de pgAdmin y elegí **Backup**.

## Alcance de esta entrega

Versión educativa con configuración para uso local y despliegue HTTPS. Antes de abrir registros a usuarios reales, definí cómo vas a gestionar la privacidad de los formularios de adopción, la moderación y la recuperación de cuentas.

Los registros recientes del panel tienen límites indicados en pantalla. Las mascotas del ejemplo son ficticias. El envío real por Gmail requiere configuración y no se verificó con credenciales de la usuaria.

## Documentación del proyecto

Los manuales, requerimientos, DER, guías y resultados de pruebas están en el [repositorio independiente de documentación](https://github.com/AngieIannopollo007/docmentacion-patitas).
