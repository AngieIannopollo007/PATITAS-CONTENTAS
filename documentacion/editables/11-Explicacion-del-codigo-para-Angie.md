# El código de PATITAS explicado para Angie

## Cómo leer esta guía

No necesitás entender todos los archivos al mismo tiempo. Empezá por las tres partes de la app y seguí el recorrido de una acción. Los fragmentos de esta guía son ejemplos abreviados para aprender: no son instrucciones para reemplazar los archivos del proyecto.

La idea de PATITAS es tu propuesta original. El código se creó con asistencia de IA. Entender cómo funciona te permite explicar decisiones, reconocer límites y pedir cambios concretos, aunque todavía no escribas cada parte por tu cuenta.

## 1. Las tres partes de tu aplicación

El frontend es lo que ves en el navegador: pantallas, tarjetas, formularios y botones. El backend es el programa que recibe pedidos, comprueba reglas y permisos y decide qué guardar. La base de datos conserva los registros cuando cerrás o refrescás la página.

En PATITAS, public contiene el frontend, backend contiene las reglas y consultas, y datos/patitas.sqlite es el archivo que guarda información. servidor.js enciende el conjunto. Un archivo JavaScript puede ser frontend o backend: lo determina dónde se ejecuta, no la extensión .js.

Ejemplo: escribir el nombre de Luna en una tarjeta es una tarea de interfaz. Comprobar que solamente su responsable puede editarla es una tarea del servidor. Recordar el nombre y el responsable después de reiniciar es una tarea de persistencia.

## 2. Qué hace cada carpeta sin tecnicismos

| Archivo o carpeta | Pensalo así |
| --- | --- |
| public/index.html | El esqueleto de la pantalla |
| public/estilos.css | Su presentación: colores, tamaños y distribución |
| public/app.js | Quien arma las pantallas y escucha tus clics |
| servidor.js | El interruptor que pone el servicio en funcionamiento |
| backend/app.js | La entrada que recibe pedidos y los dirige |
| backend/servicios.js | Las reglas de PATITAS |
| backend/base.js | La organización del archivo de datos y las consultas |
| backend/seguridad.js | Comprobaciones de campos, claves, tokens y fotos |
| backend/correo.js | Quien organiza e intenta enviar emails |
| test/app.test.js | Ejemplos automáticos que comprueban comportamientos |
| .env | Configuración privada que no se publica |
| .env.example | Un modelo sin contraseña para saber qué completar |

## 3. Por qué index.html parece tan corto

Tu HTML no contiene escritas todas las pantallas. Carga app.js, y ese JavaScript las construye cuando hace falta. Por eso no vas a encontrar cada mascota buscando su nombre dentro de index.html.

La etiqueta main con id contenido es el lugar donde se dibujan las vistas. header con id cabecera contiene la navegación. dialog con id modal permite abrir formularios sin salir de la pantalla. El elemento aviso muestra mensajes breves de confirmación o error.

```html
<link rel="stylesheet" href="/estilos.css">
<script src="/app.js" defer></script>
<main id="contenido"></main>
```

link conecta el CSS; script carga el comportamiento. defer hace que ese script espere a que el HTML se haya analizado antes de utilizar sus elementos. id es un nombre para localizar un elemento específico. class agrupa elementos que comparten aspecto o comportamiento.

## 4. Cómo leer el CSS

Una regla CSS tiene un selector y propiedades. El selector indica qué elementos afecta; cada propiedad define un aspecto.

```css
.tarjeta {
  border-radius: 12px;
  background: #fffefb;
}
```

El punto significa clase. Esta regla afecta a elementos con class="tarjeta". border-radius redondea sus bordes y background cambia el fondo. Un selector como #contenido usa el id; uno como button afecta a todas las etiquetas button.

En el archivo aparecen variables como --verde y --fondo. Se definen en :root y se reutilizan con var(...). Esto permite cambiar un color compartido sin buscar cada aparición. Las grillas distribuyen tarjetas o columnas; las reglas @media ajustan el diseño para pantallas más pequeñas.

Cambiar un color normalmente no cambia la regla de adopción. Pero ocultar un botón con CSS tampoco impide que alguien intente llamar a la API. Los permisos deben estar en el backend.

## 5. Palabras de JavaScript que vas a encontrar

const declara una referencia que no se reasigna; let se usa cuando una variable puede recibir otro valor. function define una tarea reutilizable. return devuelve un resultado. if elige qué hacer según una condición. Un objeto reúne datos con nombres, por ejemplo {nombre: 'Luna', especie: 'Perro'}. Un array es una lista, por ejemplo una lista de mascotas.

```javascript
const nombre = 'Luna';
let disponible = true;
function puedeSolicitar() {
  return disponible;
}
```

true y false son booleanos: sí o no. No son lo mismo que los textos 'true' y 'false'. Por eso el compromiso de adopción se toma de checkbox.checked y el backend exige que sea exactamente true.

El signo === compara valor y tipo. El signo = asigna. ! niega una condición. && exige que se cumplan ambas condiciones; || permite que se cumpla al menos una. No conviene reemplazarlos al azar: cambian las reglas.

## 6. Las primeras funciones de public/app.js

La función $ es un atajo de document.querySelector. Por ejemplo, $('#contenido') encuentra el contenedor principal. escapar transforma caracteres especiales de textos para mostrarlos como texto dentro del HTML generado; ayuda a que un comentario no se interprete como una etiqueta ejecutable.

fecha y pesos presentan datos. La base y la API pueden guardar una fecha o centavos de una forma y mostrarlos de otra. Mostrar $150 no significa que se haya efectuado un pago.

Las variables sesion, paginaActual, tab y panel recuerdan qué usuario y sección se muestran. Viven en la memoria del navegador; la información permanente está en SQLite. Al recargar, el script consulta /api/yo para reconstruir el acceso a partir de la cookie vigente.

mascotasCache es un Map que recuerda datos ya obtenidos para algunos formularios. No reemplaza la base ni autoriza operaciones: el backend vuelve a comprobar cada pedido.

## 7. Cómo funcionan pantallas y botones

navegar solicita los datos de una vista y llama a funciones como renderMascotas, renderPerfil o renderPanel. Estas funciones devuelven el HTML que se coloca en el contenedor. Mientras espera se muestra Cargando; si la petición falla se presenta un mensaje.

contadorVista ayuda a no dibujar una respuesta vieja si cambiaste de sección antes de que terminara. Es importante porque los pedidos no siempre llegan en el mismo orden en que los hiciste.

Los botones tienen data-accion y a veces data-id. Un único escuchador de clics busca el botón con closest y decide qué hacer. data-id puede indicar la mascota, la solicitud o el interlocutor. El servidor no confía en que ese id sea legítimo solo porque vino de un botón: comprueba quién lo usa.

## 8. El camino de un formulario

El escuchador submit detecta el formulario. preventDefault evita que el navegador recargue toda la página al enviarlo. FormData recoge sus campos y Object.fromEntries los organiza en un objeto.

Antes del envío se realizan conversiones. La edad que sale de un campo suele ser texto, por eso se convierte a Number. El compromiso se lee como booleano. Las fotos se leen con FileReader y se envían como un texto que representa sus bytes, llamado Data URL Base64.

El botón de envío se deshabilita mientras se procesa. Si aparece un error, try/catch lo convierte en un mensaje comprensible; finally vuelve a habilitar el botón. Evitar clics repetidos ayuda, pero la protección contra puntos duplicados también debe existir en el servidor.

## 9. Qué es fetch y qué hace api

fetch envía un pedido HTTP. api es la función auxiliar del frontend que agrega /api a las rutas, incluye el tipo JSON y el token CSRF cuando corresponde, y convierte la respuesta con respuesta.json().

```javascript
await api('/solicitudes', {
  method: 'POST',
  body: datosDelFormulario
});
```

POST pide crear algo. GET pide consultar. PATCH se usa en actualizaciones y DELETE retira una publicación. JSON es un formato de intercambio, no una base de datos. async y await permiten esperar una respuesta sin escribir el código como si llegara inmediatamente.

response.ok indica si el estado HTTP es exitoso. Una solicitud rechazada por el servidor no debe mostrarse como guardada. El frontend tampoco debe decir que un email llegó solo porque la solicitud se registró.

## 10. Qué pasa al ejecutar servidor.js

Node comprueba su versión. Si encuentra .env, carga su configuración. crearApp abre la base, prepara servicios y devuelve el servidor. listen lo deja esperando pedidos en la dirección local y puerto elegidos. setInterval programa la revisión de correos pendientes cada cinco segundos.

El proceso necesita seguir abierto. Si cerrás la terminal, el navegador todavía puede mostrar una pantalla ya cargada, pero sus pedidos nuevos dejan de funcionar. Actualizar archivos en disco no reemplaza automáticamente los módulos que el servidor ya cargó: hay que reiniciarlo.

La palabra require carga otro módulo en Node. module.exports indica qué funciones ofrece ese archivo a otros. Esto conecta servidor.js con backend/app.js y ese archivo con base, seguridad, servicios y correo.

## 11. Qué hace backend/app.js con tu pedido

Primero distingue archivos de la interfaz y rutas /api. Para la API identifica la sesión de la cookie, comprueba su vencimiento y, si la operación cambia datos, revisa el token CSRF y el cuerpo JSON. Después compara método y ruta y llama al servicio correspondiente.

Ejemplo: POST /api/solicitudes termina en servicios.solicitar(u,b). u es el usuario que el servidor obtuvo de una sesión válida; b son los campos recibidos. No se permite al formulario decidir libremente quién es u.

El servidor valida tamaño, tipo de contenido y campos. La respuesta de error usa un mensaje general si ocurre una falla interna, evitando devolver detalles privados de la base o credenciales.

## 12. Seguí una solicitud de adopción completa

1. Ana abre Conoceme en la ficha de Luna y pulsa Quiero adoptar.
2. formularioSolicitud dibuja los campos; todavía no se guardó una solicitud.
3. Al enviar, el frontend forma el objeto y hace POST /api/solicitudes.
4. app.js comprueba acceso y dirige el pedido a solicitar.
5. solicitar exige cuenta adoptante, mascota existente y disponible, datos válidos y compromiso aceptado.
6. Dentro de una transacción comprueba duplicados, guarda en solicitudes y crea correo y notificación para el responsable.
7. El servidor responde con id, estado pendiente y situación de correo. El frontend puede mostrar confirmación de guardado.
8. Más tarde, el responsable aprueba: se crea adopciones, cambia mascotas y se cierran otras solicitudes activas dentro de otra transacción.

La base conserva el formulario enviado. Si después Ana cambia su teléfono en Mi perfil, no se reescribe silenciosamente la fotografía de datos de una solicitud anterior.

## 13. Cómo leer una consulta de SQLite

SELECT consulta, INSERT agrega, UPDATE modifica y CREATE TABLE define una estructura. WHERE indica qué registros se consideran. JOIN reúne datos relacionados, por ejemplo una solicitud con el nombre de su mascota.

```javascript
r.uno('SELECT * FROM mascotas WHERE id=?', id);
```

El signo ? es un lugar reservado para un dato. id se envía por separado, en lugar de pegarlo dentro de la instrucción. Así, un texto parecido a SQL no cambia por sí solo la estructura de la consulta.

En el objeto repositorio, uno devuelve una fila, todos una lista y ejecutar realiza una operación y devuelve información como changes o lastInsertRowid. El servicio transforma esos resultados en decisiones de negocio.

## 14. PK, FK y transacciones con un ejemplo

Una PK identifica un registro sin ambigüedad. Una FK apunta al registro con el que se relaciona. solicitudes.mascota_id guarda el id de una mascota y no su nombre, porque dos animales podrían llamarse Luna.

Una transacción agrupa operaciones que deben ocurrir juntas. Aprobar una solicitud no puede dejar la mascota disponible si ya se creó su adopción. BEGIN IMMEDIATE inicia el grupo, COMMIT lo confirma y ROLLBACK lo revierte si algo falla.

La transacción de base no obliga a Gmail a entregar un email. Por eso primero se guarda una cola de correo y el envío externo se intenta después. Esto permite conservar la solicitud si Google no responde.

## 15. De dónde salen tus PATITAS

No se guardan en una variable del navegador como única fuente. puntos(id) consulta bienvenida del usuario, que vale cinco, y suma puntos de sus donaciones confirmadas. Una pendiente conserva cero puntos.

```text
PATITAS = 5 de bienvenida + 10 por cada donación confirmada
```

No hay una columna usuarios.puntos que tengas que buscar. El cálculo usa usuarios.bienvenida y donaciones.puntos. Cambiar el número que ves en la pantalla no modifica esta regla en el servidor.

cambiarDonacion comprueba que confirme el destinatario y que siga pendiente. El UPDATE vuelve a exigir estado pendiente y se revisa changes. Esto evita que dos pedidos otorguen otra vez la misma confirmación.

## 16. Por qué ahora hay un chat para cada persona

No se creó una tabla distinta por refugio. mensajes conserva emisor_id y receptor_id. La consulta exige que los dos participantes sean el usuario actual y la persona elegida, en cualquiera de los sentidos. Un tercer usuario no aparece en esa condición.

```sql
WHERE (emisor_id = usuarioActual AND receptor_id = interlocutor)
   OR (emisor_id = interlocutor AND receptor_id = usuarioActual)
```

Este fragmento es conceptual; el código real usa parámetros. El botón de Huellitas cambia chatActivo a su id. cargarChat pide esa sala y renderHistorial muestra sus mensajes. El textarea se conserva cuando se actualiza el historial, de modo que el ciclo de cinco segundos no necesita borrar lo que escribís.

El error anterior con admin provenía de una regla que rechazaba a cualquier destinatario de tipo admin. La corrección permite soporte en ambos sentidos, pero conserva el filtro de participantes. Dar permiso para conversar no significa dar permiso para leer chats de otras personas.

## 17. Notificación y email no son lo mismo

notificar crea un registro en correos y otro en notificaciones. La notificación tiene su propio leida; el correo tiene su estado de envío. Marcar leído un aviso no significa enviar un email, y aceptar un email no significa que la persona haya leído el aviso.

actualizarNovedades consulta al servidor cada cinco segundos si la pestaña está visible y no hay una consulta de ese ciclo en curso. Refresca el contador y el chat activo. Esto se llama consulta periódica: no es una notificación push que siga apareciendo con la app cerrada.

leerChat recibe hasta, el último id mostrado. Así no marca automáticamente un mensaje posterior que todavía no viste. La lectura se guarda en SQLite y no se pierde al refrescar.

## 18. Qué guarda seguridad y qué no debes compartir

proteger no guarda tu contraseña como texto. Usa scrypt y una sal aleatoria para derivar un valor que se puede comprobar al ingresar. No es «cifrar y luego descifrar»: verificar vuelve a calcular y compara.

La cookie conserva un token de sesión; HttpOnly impide que el JavaScript de la página lo lea directamente. El servidor guarda su hash y vencimiento. CSRF es otro token que la app envía para operaciones de cambio. Ninguno debe registrarse en una captura pública.

.env guarda configuración privada de Gmail. .env.example muestra nombres de campos sin una contraseña válida. No subas .env, la base de datos ni respaldos con domicilios a GitHub. Una foto validada por formato solo demuestra que se aceptó una imagen compatible, no la identidad de una persona.

## 19. Cómo entender una prueba

Un test prepara datos, ejecuta una acción y compara el resultado con algo esperado. Por ejemplo, el de doble confirmación registra una donación, verifica que todavía no dio puntos, confirma desde el destinatario y comprueba que un segundo intento se rechace.

assert.equal(a,b) exige igualdad. Cuando una comparación falla, el reporte informa expected y actual. No se cambia expected solo para que pase: primero se entiende si la regla o la implementación están equivocadas.

El proyecto tiene 30 pruebas que se ejecutaron para estos documentos. Las de Gmail usan un transporte o conexión simulada; no mandan emails reales. Las bases temporales permiten probar sin borrar tu información habitual.

## 20. Orden recomendado para estudiar

Primero abrí index.html y ubicá los contenedores. Después buscá .tarjeta y .boton en el CSS. En app.js leé mostrarAcceso, tarjeta y formularioSolicitud; luego el escuchador submit y api. Recién después seguí /api/solicitudes en backend/app.js hasta solicitar en servicios.js y sus INSERT en la base.

En otra sesión estudiá el acceso: registrar, ingresar, sesion, autenticar, proteger y verificar. Por último seguí mensaje, chat, notificar y crearBandeja. No intentes aprender SQL, sesiones, imágenes y correo al mismo tiempo.

## 21. Cómo pedir una corrección sin perder control

Describí el paso concreto, la cuenta usada, lo que esperabas y lo que apareció. Por ejemplo: «Desde refugio recibo un mensaje de admin; al abrirlo da destinatario inválido. Quiero responder sin acceder a chats ajenos». Pedí identificar la causa, indicar archivos afectados y agregar una prueba del caso.

No pegues contraseñas ni datos personales reales. Antes de cambiar una base, respaldala. Después de un cambio, revisá el diff y ejecutá los tests. Para cambios visuales comprobá además la pantalla: un test de API no detecta por sí solo un botón tapado en el celular.

## 22. Respuestas para explicar tu proyecto

¿Dónde se guardan los datos? En un archivo SQLite del servidor. ¿Por qué no se pierden al refrescar? Porque el navegador vuelve a pedir registros persistidos. ¿Quién decide los permisos? El backend, a partir de la sesión y la relación con cada registro. ¿Por qué hay frontend y backend? Para separar interacción de reglas y acceso a datos.

¿La app paga donaciones? No: registra y confirma recepción manual. ¿Una foto verifica identidad? No. ¿Gmail está probado con mi cuenta? El código está preparado y se probó con simulación; la entrega real depende de la configuración y debe verificarse. ¿Está lista para miles de usuarios? Todavía no se midió ese escenario ni se preparó la infraestructura pública.
