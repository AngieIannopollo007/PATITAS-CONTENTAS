# PATITAS 🐾

Una aplicación basada en la idea original de Angie: conectar refugios, rescatistas y adoptantes, organizar adopciones y reconocer las colaboraciones con puntos PATITAS. Código creado desde cero con asistencia de IA.

**Hay una sola versión.** No hay carpetas ANTES y DESPUÉS. Esta es la aplicación, con frontend, backend y base de datos.

## Si ya tenías PATITAS

Leé **docs/ACTUALIZACION.md** para actualizar sin perder datos: cerrá el servidor, reemplazá los archivos del programa y conservá `datos/` y `.env`. Reiniciá y recargá la página.

## Empezá por acá

1. Extraé el ZIP completo con «Extraer todo». No trabajes dentro del ZIP.
2. Entrá en la carpeta **PATITAS**.
3. Hacé doble clic en **ABRIR PATITAS.cmd**. Si Windows oculta extensiones, puede aparecer como **ABRIR PATITAS**.
4. Dejá abierta esa ventana y entrá a **http://127.0.0.1:3000** en Chrome o Edge.
5. Primero vas a ver el inicio de sesión. Podés crear una cuenta o desplegar «¿Querés probar? Usá una cuenta de ejemplo».

Solo necesitás **Node.js 24 o superior**. No descargues MySQL, SQL Server ni SQLite: la app crea su base automáticamente. No hace falta `npm install` y no usa servicios de pago.

Si preferís Visual Studio Code: abrí esta carpeta, elegí Terminal → Nueva terminal y ejecutá **`node servidor.js`** o **`npm.cmd start`**. Se usa npm.cmd para evitar el bloqueo de scripts que puede aparecer en PowerShell.

No abras public/index.html con doble clic: el inicio de sesión y el guardado necesitan el servidor.

## Cuentas de ejemplo

Todas usan la contraseña **Patitas2026!** y contienen información ficticia.

| Cuenta | Correo | Para qué sirve |
| --- | --- | --- |
| Adoptante | ana@patitas.test | Solicitar adopciones, colaborar, escribir mensajes y calificar experiencias |
| Refugio | refugio@patitas.test | Publicar, resolver solicitudes, consultar planilla y confirmar donaciones |
| Particular / rescatista | sofia@patitas.test | Las mismas herramientas de publicación para una persona particular |
| Moderación | admin@patitas.test | Revisar reportes de reseñas y ocultarlas si corresponde |

Estas cuentas se crean una sola vez al iniciar una base vacía. La app conserva la sesión durante siete días; «Salir» la cierra. Las contraseñas no se guardan como texto visible.

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

La app ya tiene como remitente sugerido **iannopolloangeline@gmail.com** en `.env.example`. Falta que completes vos una contraseña de aplicación de Google en tu computadora.

Leé **docs/GMAIL.md**. No compartas esa contraseña ni la subas a GitHub. Sin configurarla, todo lo demás funciona y los avisos se guardan en Mi espacio → Notificaciones; en la pestaña Correos los emails figuran como «local». La app no dice que envió un correo si no lo hizo.

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
| backend/base.js | Tablas y consultas de la base de datos |
| backend/seguridad.js | Protección de contraseñas y validaciones |
| backend/correo.js | Cola de notificaciones y conexión con Gmail |
| datos/patitas.sqlite | Se crea al usar la app; contiene tus registros privados |
| test | Pruebas automáticas |
| docs | Guías y explicación del proyecto |
| reportes | Evidencia de las pruebas y captura del catálogo |

## Pruebas

En una terminal dentro de PATITAS ejecutá:

```sh
node --test
```

Usan datos ficticios y bases temporales separadas. No borran tu base. Los resultados verificados están en reportes/pruebas.tap y docs/PRUEBAS.md.

## Si algo no abre

- **No reconoce node:** instalá Node.js 24 o superior y cerrá/reabrí la terminal.
- **npm.ps1 bloqueado:** usá `npm.cmd start` o el archivo ABRIR PATITAS.cmd.
- **Puerto ocupado:** cerrá la otra ventana que tenga el servidor abierto. Si cambiaste PORT en .env, usá la dirección que muestra la terminal.
- **La página dice que no conecta:** el servidor debe permanecer encendido.
- **El correo quedó local:** falta completar Gmail y reiniciar. Después podés enviarlo desde Notificaciones.
- **Datos de antes siguen ahí:** es lo esperado; ahora están en una base persistente.

Para detener la app: Ctrl+C en la ventana del servidor. No borres la carpeta datos si querés conservar tus registros. Hacé una copia de datos con la app cerrada para tener un respaldo.

## Alcance de esta entrega

Versión educativa completa para uso local y pruebas. No está publicada en Internet. No incluye cobros online, verificación de identidad, recuperación de contraseña, mensajes instantáneos o certificación de refugios. Antes de recibir usuarios reales requiere preparación para publicación, HTTPS, controles contra abuso, recuperación de cuentas y un proceso real de administración y protección de datos. Las cuentas demo tienen contraseñas conocidas: no se deben usar en un despliegue real.

Los registros recientes del panel tienen límites indicados en pantalla. Las mascotas del ejemplo son ficticias. El envío real por Gmail requiere configuración y no se verificó con credenciales de la usuaria.

## Documentación del proyecto

La carpeta [documentacion](documentacion/README.md) reúne los manuales, requerimientos, DER, pruebas y explicación del código, con carátulas y PDF.

Para ver la lista de documentos, descargá el repositorio y abrí **documentacion/index.html** en tu navegador.
