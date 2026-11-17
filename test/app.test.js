const {test}=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter,once}=require('node:events');
const http=require('node:http');
const {randomUUID}=require('node:crypto');
const {Pool}=require('pg');
const {crearApp}=require('../backend/app');
const {configuracionPostgres}=require('../backend/base');
const {promoverAdministrador}=require('../backend/administrador');
const {enviarGmail}=require('../backend/correo');
const FOTO='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';

if (!process.env.PATITAS_TEST_DATABASE) throw Error('Configurá PATITAS_TEST_DATABASE para ejecutar las pruebas con PostgreSQL.');
const config=configuracionPostgres({...process.env,DATABASE_URL:'',PGDATABASE:process.env.PATITAS_TEST_DATABASE});
const postgres=new Pool(config);
test.after(()=>postgres.end());

async function conexionPrueba(t) {
  const esquema='test_'+randomUUID().replaceAll('-','');
  await postgres.query('CREATE SCHEMA '+esquema);
  t.after(()=>postgres.query('DROP SCHEMA '+esquema+' CASCADE'));
  return {...config,options:'-c search_path='+esquema};
}

// http.request permite enviar el Host público que recibiría la app detrás del proxy.
async function pedirHTTP(url,{method,headers,body}={}) {
  const req=http.request(url,{method,headers});
  const respuesta=once(req,'response');
  req.end(body);
  const [res]=await respuesta;
  const partes=[];
  for await(const parte of res) partes.push(parte);
  return new Response(Buffer.concat(partes),{status:res.statusCode,headers:res.headers});
}

async function entorno(t,opciones={}) {
  const app=await crearApp({conexion:await conexionPrueba(t),...opciones});
  await new Promise((resolve,reject)=>{app.servidor.once('error',reject);app.servidor.listen(0,'127.0.0.1',resolve);});
  const base=`http://127.0.0.1:${app.servidor.address().port}`;
  t.after(async()=>{await new Promise(resolve=>app.servidor.close(resolve));await app.db.end();});
  const host=opciones.origenPublico ? {Host:new URL(opciones.origenPublico).host} : {};
  const pedir=opciones.origenPublico ? pedirHTTP : fetch;
  function cliente() {
    let cookie='',csrf='';
    return {
      async pedir(ruta,method='GET',body,extra={}) {
        const res=await pedir(base+ '/api'+ruta,{method,headers:{...host,...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{}),...(csrf?{'X-CSRF-Token':csrf}:{}),...extra},body:body?JSON.stringify(body):undefined});
        const c=res.headers.get('set-cookie');if(c)cookie=c.split(';')[0];
        const datos=await res.json();if(datos.csrf)csrf=datos.csrf;
        return {status:res.status,datos,cookie:c};
      },
      async ingresar(correo='ana@patitas.test') {const res=await this.pedir('/ingreso','POST',{email:correo,password:'Patitas2026!'});assert.equal(res.status,200);return res.datos.usuario;},
      async registrar(correo='nueva@example.com',tipo='adoptante') {const res=await this.pedir('/registro','POST',{nombre:'Cuenta Nueva',email:correo,foto:FOTO,password:'MiClave12345!',ciudad:'Buenos Aires',tipo});assert.equal(res.status,201);return res.datos.usuario;},
    };
  }
  return {app,base,cliente};
}
const solicitud=(mascota_id=1)=>({mascota_id,nombre:'Ana Pérez',edad:18,email:'ana@example.com',telefono:'1155551234',direccion:'Calle Ficticia 123',vivienda:'Casa con patio y familia.',motivo:'Quiero adoptar y brindar cuidado responsable.',compromiso:true});
const mascota={nombre:'Nube',especie:'Gato',raza:'Mestizo',edad_meses:0,sexo:'Hembra',tamano:'Pequeño',descripcion:'Un gatito que busca una familia cariñosa.',salud:'Control veterinario pendiente.',foto:FOTO};

test('primero login: ningún dato de la comunidad sin sesión',async t=>{
  const {cliente}=await entorno(t);const c=cliente();
  for(const ruta of ['/yo','/mascotas','/refugios','/panel','/perfiles/1'])assert.equal((await c.pedir(ruta)).status,401);
});
test('registro, sesión persistida y cierre efectivo',async t=>{
  const {cliente,app}=await entorno(t);const c=cliente();const u=await c.registrar();
  assert.equal(u.tipo,'adoptante');assert.equal(u.clave,undefined);
  const guardada=(await app.repo.uno('SELECT clave FROM usuarios WHERE id=$1',u.id)).clave;
  assert.ok(!guardada.includes('MiClave'));assert.match(guardada,/^[a-f0-9]+:[a-f0-9]+$/);
  assert.equal((await c.pedir('/yo')).status,200);
  assert.equal((await c.pedir('/salir','POST',{})).status,200);
  assert.equal((await c.pedir('/yo')).status,401);
});
test('login incorrecto, correo duplicado y rol admin no registrable',async t=>{
  const {cliente}=await entorno(t);const c=cliente();
  assert.equal((await c.pedir('/ingreso','POST',{email:'ana@patitas.test',password:'incorrecta'})).status,401);
  assert.equal((await c.pedir('/registro','POST',{nombre:'Ana',email:'ana@patitas.test',foto:FOTO,password:'Clave12345!',tipo:'adoptante',ciudad:'Ciudad'})).status,409);
  assert.equal((await c.pedir('/registro','POST',{nombre:'Atacante',email:'x@example.com',foto:FOTO,password:'Clave12345!',tipo:'admin',ciudad:'Ciudad'})).status,400);
});
test('CSRF: rechaza token falso y origen ajeno',async t=>{
  const {cliente}=await entorno(t);const c=cliente();await c.ingresar();
  assert.equal((await c.pedir('/salir','POST',{}, {'X-CSRF-Token':'falso'})).status,403);
  assert.equal((await c.pedir('/salir','POST',{}, {Origin:'https://otro.example'})).status,403);
});
test('producción: host y origen HTTPS, cookie segura y arranque sin cuentas demo',async t=>{
  const origenPublico='https://patitas.example.com';
  const {app,base,cliente}=await entorno(t,{origenPublico});
  const c=cliente();
  assert.equal((await fetch(base)).status,403);
  const pagina=await pedirHTTP(base,{headers:{Host:'patitas.example.com'}});
  assert.equal(pagina.status,200);
  assert.match(pagina.headers.get('strict-transport-security'),/max-age=/);
  assert.match(await pagina.text(),/data-demo="0"/);
  const salud=await fetch(base+'/salud');
  assert.equal(salud.status,200);
  assert.deepEqual(await salud.json(),{estado:'ok'});
  assert.equal((await app.repo.uno('SELECT COUNT(*) AS n FROM usuarios')).n,0);
  const u=await c.registrar();
  const datos={email:u.email,password:'MiClave12345!'};
  assert.equal((await c.pedir('/ingreso','POST',datos,{Origin:'http://patitas.example.com'})).status,403);
  const ingreso=await c.pedir('/ingreso','POST',datos,{Origin:origenPublico});
  assert.equal(ingreso.status,200);
  assert.match(ingreso.cookie,/; Secure;/);
  const salida=await c.pedir('/salir','POST',{},{Origin:origenPublico});
  assert.equal(salida.status,200);
  assert.match(salida.cookie,/; Secure; Max-Age=0/);
});
test('producción: bloquea cuentas y sesiones demo existentes y habilita moderación propia',async t=>{
  const conexion=await conexionPrueba(t);
  const local=await crearApp({conexion});
  let demo;
  try {
    demo=await local.servicios.ingresar({email:'admin@patitas.test',password:'Patitas2026!'});
  } finally { await local.db.end(); }
  const {cliente}=await entorno(t,{conexion,origenPublico:'https://patitas.example.com'});
  const c=cliente();
  assert.equal((await c.pedir('/yo','GET',null,{Cookie:'patitas='+demo.secreto})).status,401);
  assert.equal((await c.pedir('/ingreso','POST',{email:'admin@patitas.test',password:'Patitas2026!'})).status,401);
  await assert.rejects(promoverAdministrador(conexion,'demo@patitas.test'),/cuenta propia/);
  const u=await c.registrar();
  assert.equal(await promoverAdministrador(conexion,u.email),u.email);
  assert.equal((await c.pedir('/yo')).status,401);
  const ingreso=await c.pedir('/ingreso','POST',{email:u.email,password:'MiClave12345!'});
  assert.equal(ingreso.status,200);
  assert.equal((await c.pedir('/yo')).datos.usuario.tipo,'admin');
});
test('publicación, edición y retiro: solo su responsable',async t=>{
  const {cliente}=await entorno(t);const refugio=cliente(),adoptante=cliente(),otro=cliente();
  await refugio.ingresar('refugio@patitas.test');await adoptante.ingresar();await otro.ingresar('sofia@patitas.test');
  assert.equal((await adoptante.pedir('/mascotas','POST',mascota)).status,403);
  const creada=await refugio.pedir('/mascotas','POST',mascota);assert.equal(creada.status,201);
  assert.equal((await otro.pedir('/mascotas/'+creada.datos.id,'PATCH',mascota)).status,403);
  assert.equal((await refugio.pedir('/mascotas/'+creada.datos.id,'PATCH',{...mascota,nombre:'Nubecita'})).status,200);
  const filtradas=(await adoptante.pedir('/mascotas?buscar=NUBECITA&especie=Gato')).datos;
  assert.equal(filtradas.total,1);
  assert.deepEqual(filtradas.datos.map(m=>m.id),[creada.datos.id]);
  assert.equal((await refugio.pedir('/mascotas/'+creada.datos.id,'DELETE',{})).status,200);
  assert.ok(!(await adoptante.pedir('/mascotas')).datos.datos.some(m=>m.id===creada.datos.id));
});
test('formularios inválidos, límite de edad y mascota inexistente',async t=>{
  const {cliente}=await entorno(t);const c=cliente();await c.ingresar();
  for(const cambios of [{edad:17},{edad:'18'},{email:'no-es-correo'},{compromiso:false},{direccion:''}])assert.equal((await c.pedir('/solicitudes','POST',{...solicitud(),...cambios})).status,400);
  assert.equal((await c.pedir('/solicitudes','POST',solicitud(9999))).status,404);
  assert.equal((await c.pedir('/solicitudes','POST',solicitud())).status,201);
  assert.equal((await c.pedir('/solicitudes','POST',solicitud())).status,409);
});
test('privacidad: solicitudes y datos de contacto no pasan a otro refugio',async t=>{
  const {cliente}=await entorno(t);const a=cliente(),r=cliente(),o=cliente();await a.ingresar();await r.ingresar('refugio@patitas.test');await o.ingresar('sofia@patitas.test');
  const s=await a.pedir('/solicitudes','POST',solicitud());
  const visible=(await r.pedir('/panel')).datos;assert.equal(visible.solicitudes.length,1);assert.equal(visible.solicitudes[0].direccion,solicitud().direccion);
  assert.equal((await o.pedir('/panel')).datos.solicitudes.length,0);
  assert.equal((await o.pedir('/solicitudes/'+s.datos.id,'PATCH',{estado:'aprobada'})).status,403);
  const perfil=(await a.pedir('/perfiles/1')).datos.perfil;
  assert.equal(perfil.email,undefined);assert.equal(perfil.telefono,undefined);assert.equal(perfil.clave,undefined);
  assert.equal((await o.pedir('/perfiles/2')).status,403);
  assert.equal((await r.pedir('/perfiles/2')).status,200);
});
test('aprobación: genera planilla, rechaza otras solicitudes y evita doble adopción',async t=>{
  const {cliente}=await entorno(t);const a=cliente(),b=cliente(),r=cliente();await a.ingresar();await b.registrar('segunda@example.com');await r.ingresar('refugio@patitas.test');
  const s1=(await a.pedir('/solicitudes','POST',solicitud())).datos;
  const s2=(await b.pedir('/solicitudes','POST',{...solicitud(),nombre:'Otra Persona'})).datos;
  const decisiones=await Promise.all([s1,s2].map(s =>
    r.pedir('/solicitudes/'+s.id,'PATCH',{estado:'aprobada',observaciones:'Entrevista realizada.'})));
  assert.deepEqual(decisiones.map(r=>r.status).sort(),[200,409]);
  const p=(await r.pedir('/panel')).datos;assert.equal(p.adopciones.length,1);assert.equal(p.adopciones[0].direccion,solicitud().direccion);
  assert.deepEqual(p.solicitudes.map(s=>s.estado).sort(),['aprobada','rechazada']);
  assert.equal((await r.pedir('/solicitudes/'+s1.id,'PATCH',{estado:'aprobada'})).status,409);
  assert.equal((await b.pedir('/solicitudes','POST',solicitud())).status,409);
  assert.equal((await r.pedir('/adopciones/'+p.adopciones[0].id,'PATCH',{seguimiento:'Visita de seguimiento: todo bien.'})).status,200);
  assert.equal((await a.pedir('/adopciones/'+p.adopciones[0].id,'PATCH',{seguimiento:'No autorizado'})).status,403);
});
test('cancelación: solo el solicitante, antes de resolver',async t=>{
  const {cliente}=await entorno(t);const a=cliente(),r=cliente();await a.ingresar();await r.ingresar('refugio@patitas.test');
  const s=(await a.pedir('/solicitudes','POST',solicitud())).datos;
  assert.equal((await r.pedir('/solicitudes/'+s.id,'PATCH',{estado:'cancelada'})).status,403);
  assert.equal((await a.pedir('/solicitudes/'+s.id,'PATCH',{estado:'cancelada'})).status,200);
  assert.equal((await a.pedir('/solicitudes','POST',solicitud())).status,201);
});
test('donación: puntos solo al confirmar, una sola vez, sin auto-donación',async t=>{
  const {cliente}=await entorno(t);const a=cliente(),r=cliente();await a.ingresar();await r.ingresar('refugio@patitas.test');
  const d=await a.pedir('/donaciones','POST',{destinatario_id:1,tipo:'Dinero',centavos:150000,descripcion:'Transferencia a coordinar.'});assert.equal(d.status,201);
  assert.equal((await a.pedir('/yo')).datos.usuario.patitas,5);
  assert.equal((await a.pedir('/donaciones/'+d.datos.id,'PATCH',{estado:'confirmada'})).status,403);
  assert.equal((await r.pedir('/donaciones/'+d.datos.id,'PATCH',{estado:'confirmada'})).status,200);
  assert.equal((await a.pedir('/yo')).datos.usuario.patitas,15);
  assert.equal((await r.pedir('/donaciones/'+d.datos.id,'PATCH',{estado:'confirmada'})).status,409);
  assert.equal((await a.pedir('/yo')).datos.usuario.patitas,15);
  assert.equal((await r.pedir('/donaciones','POST',{destinatario_id:1,tipo:'Alimentos',descripcion:'Una bolsa de alimento.'})).status,400);
});
test('reseñas requieren experiencia, no se duplican y pueden moderarse',async t=>{
  const {cliente}=await entorno(t);const a=cliente(),r=cliente(),admin=cliente();await a.ingresar();await r.ingresar('refugio@patitas.test');await admin.ingresar('admin@patitas.test');
  const reseña={clase:'donacion',experiencia_id:999,puntuacion:5,comentario:'Muy buena experiencia.'};
  assert.equal((await a.pedir('/resenas','POST',reseña)).status,403);
  const d=(await a.pedir('/donaciones','POST',{destinatario_id:1,tipo:'Alimentos',descripcion:'Bolsa de alimento.'})).datos;
  assert.equal((await a.pedir('/resenas','POST',{...reseña,experiencia_id:d.id})).status,403);
  await r.pedir('/donaciones/'+d.id,'PATCH',{estado:'confirmada'});
  const review=await a.pedir('/resenas','POST',{...reseña,experiencia_id:d.id});assert.equal(review.status,201);
  assert.equal((await a.pedir('/resenas','POST',{...reseña,experiencia_id:d.id})).status,409);
  assert.equal((await r.pedir('/resenas','POST',{...reseña,experiencia_id:d.id})).status,201);
  assert.equal((await a.pedir('/perfiles/1')).datos.resenas.length,1);
  await r.pedir('/resenas/'+review.datos.id+'/reportar','POST',{motivo:'Solicito revisar este comentario.'});
  const reporte=(await admin.pedir('/panel')).datos.reportes[0];
  assert.equal((await a.pedir('/reportes/'+reporte.id,'PATCH',{ocultar:true})).status,403);
  assert.equal((await admin.pedir('/reportes/'+reporte.id,'PATCH',{ocultar:true})).status,200);
  assert.equal((await a.pedir('/perfiles/1')).datos.resenas.length,0);
});
test('mensajes privados: contacto con refugio y respuesta, sin filtración',async t=>{
  const {cliente}=await entorno(t);const a=cliente(),r=cliente(),o=cliente();await a.ingresar();await r.ingresar('refugio@patitas.test');await o.ingresar('sofia@patitas.test');
  assert.equal((await a.pedir('/mensajes','POST',{receptor_id:1,cuerpo:'Hola, quisiera conocer a Luna.'})).status,201);
  assert.equal((await r.pedir('/mensajes','POST',{receptor_id:2,cuerpo:'¡Coordinemos una visita!'})).status,201);
  assert.equal((await r.pedir('/panel')).datos.mensajes.length,2);
  assert.equal((await o.pedir('/panel')).datos.mensajes.length,0);
});
test('correo sin configurar: queda local y privado, nunca dice enviado',async t=>{
  const {cliente}=await entorno(t);const a=cliente(),r=cliente();await a.ingresar();await r.ingresar('refugio@patitas.test');
  assert.equal((await a.pedir('/solicitudes','POST',solicitud())).datos.correo,'local');
  const p=(await r.pedir('/panel')).datos;assert.equal(p.correos[0].estado,'local');assert.match(p.correos[0].cuerpo,/Calle Ficticia/);
  assert.equal((await a.pedir('/panel')).datos.correos.length,0);
});
test('cola Gmail: éxito, error recuperable y sin reenvío al procesar de nuevo',async t=>{
  let envios=0;
  const {cliente,app}=await entorno(t,{gmail:{usuario:'test@example.com',clave:'clave-ficticia'},transporte:async()=>{envios++;if(envios===2)throw Error('fallo ficticio');}});
  const a=cliente(),r=cliente();await a.ingresar();await r.ingresar('refugio@patitas.test');
  await a.pedir('/solicitudes','POST',solicitud(1));await a.pedir('/solicitudes','POST',solicitud(2));
  await app.bandeja();await app.bandeja();assert.equal(envios,2);
  const p=(await r.pedir('/panel')).datos;assert.equal(p.correos.filter(c=>c.estado==='enviado').length,1);assert.equal(p.correos.filter(c=>c.estado==='error').length,1);
  const fallido=p.correos.find(c=>c.estado==='error');await r.pedir('/correos/'+fallido.id+'/reintentar','POST',{});await app.bandeja();assert.equal(envios,3);
});
test('SMTP: diálogo TLS simulado, MIME base64 y aceptación final',async()=>{
  const socket=new EventEmitter();const enviados=[];
  socket.setTimeout=()=>{};socket.destroy=()=>{};
  socket.write=linea=>{
    enviados.push(linea);
    const codigos=[250,334,334,235,250,250,354,250];
    if(enviados.length<=8)setImmediate(()=>socket.emit('data',Buffer.from(codigos[enviados.length-1]+' OK\r\n')));
  };
  const conectar=config=>{assert.equal(config.rejectUnauthorized,true);assert.equal(config.port,465);setImmediate(()=>socket.emit('data',Buffer.from('220 Gmail de prueba\r\n')));return socket;};
  await enviarGmail({usuario:'test@example.com',clave:'ficticia'},{destinatario:'destino@example.com',asunto:'Solicitud para Luna',cuerpo:'Datos ficticios áéí'},conectar);
  assert.ok(enviados.some(l=>l.includes('Content-Transfer-Encoding: base64')));assert.equal(enviados.at(-1),'QUIT\r\n');
});
test('persistencia real después de cerrar y reabrir la conexión PostgreSQL',async t=>{
  const conexion=await conexionPrueba(t);
  const primera=await crearApp({conexion,demo:true});
  try {
    const u=await primera.repo.uno("SELECT * FROM usuarios WHERE email='ana@patitas.test'");
    await primera.servicios.solicitar(u,solicitud());
  } finally { await primera.db.end(); }
  const segunda=await crearApp({conexion,demo:true});
  try {
    assert.equal((await segunda.repo.uno('SELECT COUNT(*) AS n FROM solicitudes')).n,1);
    assert.equal((await segunda.repo.uno('SELECT COUNT(*) AS n FROM usuarios')).n,4);
  } finally { await segunda.db.end(); }
});
test('archivos privados no disponibles, CSP presente y login estático accesible',async t=>{
  const {base}=await entorno(t);
  const pagina=await fetch(base);assert.equal(pagina.status,200);assert.ok(pagina.headers.get('content-security-policy').includes("script-src 'self'"));
  for(const ruta of ['/.env','/backend/base.js','/backend/esquema.sql'])assert.equal((await fetch(base+ruta)).status,404);
  assert.equal((await fetch(base+'/imagenes/luna.svg')).status,200);
});

test('perfil editable: ignora escalada de rol y conserva contacto privado',async t=>{
  const {cliente}=await entorno(t);const c=cliente(),r=cliente();await c.ingresar();await r.ingresar('refugio@patitas.test');
  const actualizado=await c.pedir('/perfil','PATCH',{nombre:'Ana de prueba',ciudad:'Rosario',telefono:'111111111',direccion:'Domicilio privado ficticio',descripcion:'Hola comunidad',contacto_publico:'Solo un contacto elegido',tipo:'admin'});
  assert.equal(actualizado.status,200);assert.equal(actualizado.datos.usuario.tipo,'adoptante');
  assert.equal(actualizado.datos.usuario.direccion,'Domicilio privado ficticio');
  const p=(await r.pedir('/perfil','PATCH',{nombre:'Refugio',ciudad:'Rosario',telefono:'222222222',direccion:'Otra dirección privada',alias_donacion:'ALIAS.FICTICIO',contacto_publico:'Contacto elegido'})).datos;
  assert.equal(p.usuario.alias_donacion,'ALIAS.FICTICIO');
  const publico=(await c.pedir('/perfiles/1')).datos.perfil;assert.equal(publico.telefono,undefined);assert.equal(publico.direccion,undefined);assert.equal(publico.contacto_publico,'Contacto elegido');
});
test('fotos: acepta imagen data limitada y rechaza SVG subido o URL ejecutable',async t=>{
  const {cliente}=await entorno(t);const r=cliente();await r.ingresar('refugio@patitas.test');
  for(const foto of ['javascript:alert(1)','data:image/svg+xml;base64,PHN2Zz4=','https://otro.example/imagen.jpg'])assert.equal((await r.pedir('/mascotas','POST',{...mascota,foto})).status,400);
  const foto=FOTO;
  assert.equal((await r.pedir('/mascotas','POST',{...mascota,foto})).status,201);
});
test('calificación tras adopción en ambos sentidos, sin duplicar',async t=>{
  const {cliente}=await entorno(t);const a=cliente(),r=cliente();await a.ingresar();await r.ingresar('refugio@patitas.test');
  const s=(await a.pedir('/solicitudes','POST',solicitud())).datos;
  await r.pedir('/solicitudes/'+s.id,'PATCH',{estado:'aprobada'});
  const id=(await a.pedir('/panel')).datos.adopciones[0].id;
  const resena={clase:'adopcion',experiencia_id:id,puntuacion:5,comentario:'Una buena experiencia de ejemplo.'};
  assert.equal((await a.pedir('/resenas','POST',resena)).status,201);
  assert.equal((await r.pedir('/resenas','POST',resena)).status,201);
  assert.equal((await r.pedir('/resenas','POST',resena)).status,409);
});
test('HTTP: errores de JSON y de tipo, sin cambios en datos',async t=>{
  const {base,app}=await entorno(t);
  const mal=await fetch(base+'/api/ingreso',{method:'POST',headers:{'Content-Type':'application/json'},body:'{invalido'});
  assert.equal(mal.status,400);
  assert.equal((await fetch(base+'/api/ingreso',{method:'POST',body:'texto'})).status,415);
  assert.equal((await app.repo.uno('SELECT COUNT(*) AS n FROM sesiones')).n,0);
});
test('sesiones vencidas no habilitan acceso aunque exista la cookie',async t=>{
  const {cliente,app}=await entorno(t);const c=cliente();await c.ingresar();
  const s=await app.repo.uno('SELECT * FROM sesiones');assert.match(s.token,/^[a-f0-9]{64}$/);
  await app.repo.ejecutar('UPDATE sesiones SET vence=0');assert.equal((await c.pedir('/panel')).status,401);
});

test('registro con foto obligatoria y 5 PATITAS de bienvenida una sola vez',async t=>{
  const {cliente}=await entorno(t);const c=cliente();
  for(const tipo of ['adoptante','refugio','particular'])assert.equal((await c.pedir('/registro','POST',{nombre:'Sin Foto',email:tipo+'@example.com',password:'MiClave12345!',ciudad:'Buenos Aires',tipo})).status,400);
  const u=await c.registrar();assert.equal(u.patitas,5);assert.equal(u.foto,FOTO);
  for(let i=0;i<3;i++)assert.equal((await c.pedir('/yo')).datos.usuario.patitas,5);
  assert.equal((await c.pedir('/perfil','PATCH',{nombre:u.nombre,ciudad:u.ciudad,foto:''})).status,400);
  await c.pedir('/salir','POST',{});
  assert.equal((await c.pedir('/ingreso','POST',{email:'nueva@example.com',password:'MiClave12345!'})).datos.usuario.patitas,5);
});
test('mascota: una foto obligatoria y segunda opcional, conservadas al editar',async t=>{
  const {cliente}=await entorno(t);const c=cliente();await c.ingresar('refugio@patitas.test');
  assert.equal((await c.pedir('/mascotas','POST',{...mascota,foto:''})).status,400);
  assert.equal((await c.pedir('/mascotas','POST',{...mascota,foto:'data:image/png;base64,iVBORw0KGgo='})).status,400);
  const m=await c.pedir('/mascotas','POST',{...mascota,foto_extra:FOTO});assert.equal(m.status,201);assert.equal(m.datos.foto_extra,FOTO);
  assert.equal((await c.pedir('/mascotas/'+m.datos.id,'PATCH',{...mascota,foto_extra:FOTO})).datos.foto,FOTO);
});
test('chat individual: cada sala solo contiene mensajes entre sus dos participantes',async t=>{
  const {cliente}=await entorno(t);const a=cliente(),r=cliente(),s=cliente(),tercero=cliente();
  await a.ingresar();await r.ingresar('refugio@patitas.test');await s.ingresar('sofia@patitas.test');await tercero.registrar('tercero@example.com');
  await a.pedir('/mensajes','POST',{receptor_id:1,cuerpo:'Solo para Huellitas'});
  await a.pedir('/mensajes','POST',{receptor_id:4,cuerpo:'Solo para Sofía'});
  const huellitas=(await a.pedir('/chat/1')).datos;assert.equal(huellitas.persona.nombre,'Refugio Huellitas');assert.deepEqual(huellitas.mensajes.map(m=>m.cuerpo),['Solo para Huellitas']);
  assert.deepEqual((await a.pedir('/chat/4')).datos.mensajes.map(m=>m.cuerpo),['Solo para Sofía']);
  assert.equal((await a.pedir('/conversaciones')).datos.length,2);
  assert.equal((await tercero.pedir('/chat/1')).datos.mensajes.length,0);
  assert.equal((await tercero.pedir('/chat/2')).status,403);
});
test('notificaciones privadas: contador, lectura persistente y sin marcar mensajes aún no mostrados',async t=>{
  const {cliente}=await entorno(t);const a=cliente(),r=cliente(),s=cliente();await a.ingresar();await r.ingresar('refugio@patitas.test');await s.ingresar('sofia@patitas.test');
  const m1=(await a.pedir('/mensajes','POST',{receptor_id:1,cuerpo:'Mensaje primero'})).datos;
  const m2=(await a.pedir('/mensajes','POST',{receptor_id:1,cuerpo:'Mensaje segundo'})).datos;
  let n=(await r.pedir('/notificaciones')).datos;assert.equal(n.noLeidas,2);assert.equal(n.datos[0].tipo,'mensaje');
  assert.equal((await s.pedir('/notificaciones')).datos.noLeidas,0);
  assert.equal((await s.pedir('/notificaciones/'+n.datos[0].id+'/leer','POST',{})).status,404);
  await r.pedir('/chat/2/leido','POST',{hasta:m1.id});
  n=(await r.pedir('/notificaciones')).datos;assert.equal(n.noLeidas,1);assert.equal(n.datos.find(n=>n.mensaje_id===m2.id).leida,0);
  await r.pedir('/notificaciones/leer-todas','POST',{});assert.equal((await r.pedir('/notificaciones')).datos.noLeidas,0);
});
test('historial del chat paginado: permite recuperar mensajes anteriores sin mezclarlos',async t=>{
  const {cliente,app}=await entorno(t);const a=cliente();const u=await a.ingresar();
  for(let i=0;i<105;i++)await app.servicios.mensaje(u,{receptor_id:1,cuerpo:'Mensaje '+i});
  const actual=(await a.pedir('/chat/1')).datos;assert.equal(actual.mensajes.length,100);assert.equal(actual.hayAnteriores,true);
  const antes=(await a.pedir('/chat/1?antes='+actual.mensajes[0].id)).datos;assert.equal(antes.mensajes.length,5);assert.equal(antes.hayAnteriores,false);
  assert.equal(new Set([...antes.mensajes,...actual.mensajes].map(m=>m.id)).size,105);
});
test('avisos y emails importantes: donación, confirmación y mensaje llegan a su destinatario',async t=>{
  const {cliente}=await entorno(t);const a=cliente(),r=cliente();await a.ingresar();await r.ingresar('refugio@patitas.test');
  const d=(await a.pedir('/donaciones','POST',{destinatario_id:1,tipo:'Dinero',centavos:12000,descripcion:'Transferencia ficticia'})).datos;
  let p=(await r.pedir('/panel')).datos;assert.equal(p.correos.length,1);assert.match(p.correos[0].asunto,/donación/);assert.equal(p.correos[0].estado,'local');
  await r.pedir('/donaciones/'+d.id,'PATCH',{estado:'confirmada'});
  assert.match((await a.pedir('/panel')).datos.correos[0].asunto,/confirmada/);
  await a.pedir('/mensajes','POST',{receptor_id:1,cuerpo:'Mensaje privado ficticio'});
  p=(await r.pedir('/panel')).datos;assert.equal(p.correos.length,2);assert.match(p.correos[0].asunto,/mensaje/);
  const ns=(await r.pedir('/notificaciones')).datos;assert.deepEqual(ns.datos.map(n=>n.tipo),['mensaje','donacion']);
});
test('chat con administración: refugio responde al admin desde la sala y el aviso',async t=>{
  const {cliente}=await entorno(t);const admin=cliente(),refugio=cliente(),sofia=cliente();
  await admin.ingresar('admin@patitas.test');await refugio.ingresar('refugio@patitas.test');await sofia.ingresar('sofia@patitas.test');
  assert.equal((await admin.pedir('/mensajes','POST',{receptor_id:1,cuerpo:'Hola Huellitas, este es un mensaje de administración.'})).status,201);
  const aviso=(await refugio.pedir('/notificaciones')).datos.datos[0];
  assert.equal(aviso.tipo,'mensaje');assert.equal(aviso.referencia,3);
  const sala=await refugio.pedir('/chat/'+aviso.referencia);assert.equal(sala.status,200);
  assert.equal(sala.datos.persona.tipo,'admin');assert.equal(sala.datos.mensajes.length,1);
  assert.equal((await refugio.pedir('/mensajes','POST',{receptor_id:3,cuerpo:'Gracias admin, puedo responderte.'})).status,201);
  assert.equal((await admin.pedir('/chat/1')).datos.mensajes.length,2);
  assert.equal((await refugio.pedir('/chat/3/leido','POST',{hasta:sala.datos.mensajes[0].id})).status,200);
  assert.equal((await refugio.pedir('/notificaciones')).datos.noLeidas,0);
  assert.equal((await sofia.pedir('/chat/3')).datos.mensajes.length,0);
});
