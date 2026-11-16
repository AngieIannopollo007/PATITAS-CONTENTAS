const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { isIP } = require('node:net');
const { conectar,datosDemo } = require('./base');
const { crearServicios } = require('./servicios');
const { ErrorApp,exigir,entero } = require('./seguridad');
const { crearBandeja } = require('./correo');

async function crearApp({ conexion, demo = true, gmail = null, transporte, origenPublico, confiarProxy = false } = {}) {
  const publico = origenPublico ? URL.parse(origenPublico) : null;
  if (origenPublico && (!publico || publico.protocol !== 'https:' || publico.username || publico.password ||
    publico.pathname !== '/' || publico.href !== publico.origin + '/')) {
    throw Error('APP_ORIGIN debe ser una URL HTTPS sin ruta, usuario ni parámetros.');
  }
  const mostrarDemo = demo && !publico;
  const atributosCookie = 'HttpOnly; SameSite=Strict; Path=/' + (publico ? '; Secure' : '');
  const { db, repo } = await conectar(conexion);
  const configurado = Boolean(gmail?.usuario && gmail?.clave);
  const servicios = crearServicios(repo,{gmail:configurado,publico:Boolean(publico)});
  let bandeja;
  try {
    if (mostrarDemo) await datosDemo(repo);
    bandeja = await crearBandeja(repo,configurado ? gmail : null,transporte);
  } catch (error) {
    await db.end();
    throw error;
  }
  const limites = new Map();
  function limitar(ip) {
    const ahora = Date.now();
    for (const [k,v] of limites) if (v.vence < ahora) limites.delete(k);
    const registro = limites.get(ip) || { cantidad:0,vence:ahora+15*60000 };
    registro.cantidad++; limites.set(ip,registro);
    exigir(registro.cantidad <= 40,'Demasiados intentos. Esperá 15 minutos.',429);
  }
  async function leerBody(req) {
    exigir((req.headers['content-type'] || '').split(';')[0].trim().toLowerCase() === 'application/json','Se esperaba un formulario JSON.',415);
    const partes = []; let bytes=0;
    for await (const parte of req) {
        bytes += parte.length; exigir(bytes <= 1500000,'El formulario o las imágenes son demasiado grandes.',413);
      partes.push(parte);
    }
    try {
      const b = JSON.parse(Buffer.concat(partes).toString('utf8'));
      exigir(b && typeof b === 'object' && !Array.isArray(b),'Formulario inválido.'); return b;
    } catch(e) { if(e instanceof ErrorApp) throw e; throw new ErrorApp(400,'El formulario JSON no es válido.'); }
  }
  function responder(res,status,data,headers={}) {
    res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers});
    res.end(JSON.stringify(data));
  }
  const servidor = http.createServer(async(req,res) => {
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'");
    if (publico) res.setHeader('Strict-Transport-Security','max-age=31536000');
    try {
      if (req.url === '/salud' && ['GET','HEAD'].includes(req.method)) {
        try { await db.query({text:'SELECT 1',query_timeout:2000}); }
        catch { return responder(res,503,{estado:'no disponible'}); }
        return responder(res,200,{estado:'ok'});
      }
      const host=(req.headers.host || '').toLowerCase();
      const hostValido=publico ? host === publico.host : /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host);
      exigir(hostValido,'Abrí PATITAS desde su dirección configurada.',403);
      const origen=publico?.origin || `http://${host}`;
      const url = new URL(req.url,origen), ruta=url.pathname;
      if (!ruta.startsWith('/api/')) {
        exigir(['GET','HEAD'].includes(req.method),'Método no permitido.',405);
        const relativa = ruta === '/' ? 'index.html' : decodeURIComponent(ruta).slice(1);
        exigir(!relativa.includes('..') && !relativa.includes('\\') && !relativa.split('/').some(p=>p.startsWith('.')),'Archivo no disponible.',404);
        const base=path.join(__dirname,'../public'), archivoPublico=path.resolve(base,relativa);
        exigir(archivoPublico.startsWith(base+path.sep),'Archivo no disponible.',404);
        const tipos={'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml'};
        const tipo=tipos[path.extname(archivoPublico)]; exigir(tipo,'Archivo no disponible.',404);
        let datos;
        try { datos=await fs.readFile(archivoPublico); } catch { throw new ErrorApp(404,'Archivo no encontrado.'); }
        if (mostrarDemo && relativa === 'index.html') {
          datos=datos.toString('utf8').replace('data-demo="0"','data-demo="1"');
        }
        res.writeHead(200,{'Content-Type':tipo+'; charset=utf-8','Cache-Control':'no-cache'});
        return res.end(req.method === 'HEAD' ? undefined : datos);
      }
      const muta=!['GET','HEAD'].includes(req.method);
      if (muta && req.headers.origin) exigir(req.headers.origin === origen,'La petición debe salir de PATITAS.',403);
      const secreto = /(?:^|;\s*)patitas=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
      const sesion = await servicios.autenticar(secreto);
      if (ruta === '/api/registro' || ruta === '/api/ingreso') {
        exigir(req.method === 'POST','Método no permitido.',405);
        // Solo usar la IP que agrega el proxy cuando este es el único ingreso al servidor.
        const ipProxy=confiarProxy ? req.headers['x-forwarded-for']?.split(',').at(-1).trim() : undefined;
        limitar(isIP(ipProxy) ? ipProxy : req.socket.remoteAddress);
        const b=await leerBody(req);
        const s=await servicios[ruta === '/api/registro' ? 'registrar' : 'ingresar'](b);
        if (secreto) await servicios.salir(secreto);
        return responder(res,ruta === '/api/registro' ? 201 : 200,{usuario:s.usuario,csrf:s.csrf},{'Set-Cookie':`patitas=${s.secreto}; ${atributosCookie}; Max-Age=604800`});
      }
      exigir(sesion,'Primero iniciá sesión.',401);
      const u=sesion.usuario;
      if (muta) exigir(req.headers['x-csrf-token'] === sesion.csrf,'La sesión del formulario cambió. Recargá la página.',403);
      const b=muta ? await leerBody(req) : {};
      let salida, status=200, match;
      const id = valor => entero(Number(valor),'Identificador',1,Number.MAX_SAFE_INTEGER);
      if (req.method==='GET' && ruta==='/api/yo') salida={usuario:u,csrf:sesion.csrf};
      else if (req.method==='POST' && ruta==='/api/salir') { await servicios.salir(secreto); return responder(res,200,{mensaje:'Sesión cerrada.'},{'Set-Cookie':`patitas=; ${atributosCookie}; Max-Age=0`}); }
      else if(req.method==='PATCH' && ruta==='/api/perfil') salida={usuario:await servicios.actualizarPerfil(u,b)};
      else if(req.method==='GET' && ruta==='/api/mascotas') salida=await servicios.listarMascotas(url.searchParams);
      else if(req.method==='POST' && ruta==='/api/mascotas') { salida=await servicios.publicar(u,b);status=201; }
      else if((match=/^\/api\/mascotas\/(\d+)$/.exec(ruta))) {
        if(req.method==='GET') { const m=await servicios.verMascota(id(match[1])); exigir(m.estado!=='archivada'||m.responsable_id===u.id,'Publicación no disponible.',404);salida=m; }
        else if(req.method==='PATCH') salida=await servicios.editarMascota(u,id(match[1]),b);
        else if(req.method==='DELETE') salida=await servicios.archivar(u,id(match[1]));
        else throw new ErrorApp(405,'Método no permitido.');
      }
      else if(req.method==='GET' && ruta==='/api/refugios') salida=await servicios.refugios();
      else if(req.method==='GET' && (match=/^\/api\/perfiles\/(\d+)$/.exec(ruta))) salida=await servicios.detallePerfil(u,id(match[1]));
      else if(req.method==='GET' && ruta==='/api/panel') salida=await servicios.panel(u);
      else if(req.method==='GET' && ruta==='/api/notificaciones') salida=await servicios.novedades(u);
      else if(req.method==='POST' && ruta==='/api/notificaciones/leer-todas') salida=await servicios.leerNotificacion(u,null);
      else if(req.method==='POST' && (match=/^\/api\/notificaciones\/(\d+)\/leer$/.exec(ruta))) salida=await servicios.leerNotificacion(u,id(match[1]));
      else if(req.method==='GET' && ruta==='/api/conversaciones') salida=await servicios.conversaciones(u);
      else if(req.method==='GET' && (match=/^\/api\/chat\/(\d+)$/.exec(ruta))) salida=await servicios.chat(u,id(match[1]),url.searchParams.has('antes')?id(url.searchParams.get('antes')):Number.MAX_SAFE_INTEGER);
      else if(req.method==='POST' && (match=/^\/api\/chat\/(\d+)\/leido$/.exec(ruta))) salida=await servicios.leerChat(u,id(match[1]),b.hasta);
      else if(req.method==='POST' && ruta==='/api/solicitudes') {salida=await servicios.solicitar(u,b);status=201;}
      else if(req.method==='PATCH' && (match=/^\/api\/solicitudes\/(\d+)$/.exec(ruta))) salida=await servicios.cambiarSolicitud(u,id(match[1]),b);
      else if(req.method==='PATCH' && (match=/^\/api\/adopciones\/(\d+)$/.exec(ruta))) salida=await servicios.seguimiento(u,id(match[1]),b);
      else if(req.method==='POST' && ruta==='/api/donaciones') {salida=await servicios.donar(u,b);status=201;}
      else if(req.method==='PATCH' && (match=/^\/api\/donaciones\/(\d+)$/.exec(ruta))) salida=await servicios.cambiarDonacion(u,id(match[1]),b);
      else if(req.method==='POST' && ruta==='/api/resenas') {salida=await servicios.resenar(u,b);status=201;}
      else if(req.method==='POST' && (match=/^\/api\/resenas\/(\d+)\/reportar$/.exec(ruta))) {salida=await servicios.reportar(u,id(match[1]),b);status=201;}
      else if(req.method==='PATCH' && (match=/^\/api\/reportes\/(\d+)$/.exec(ruta))) salida=await servicios.moderar(u,id(match[1]),b);
      else if(req.method==='POST' && ruta==='/api/mensajes') {salida=await servicios.mensaje(u,b);status=201;}
      else if(req.method==='POST' && (match=/^\/api\/correos\/(\d+)\/reintentar$/.exec(ruta))) salida=await servicios.reintentarCorreo(u,id(match[1]));
      else throw new ErrorApp(404,'Ruta no encontrada.');
      responder(res,status,salida);
    } catch(error) {
      const status=error instanceof ErrorApp ? error.status : 500;
      if(status===500) console.error('Error interno:',error.code || error.name);
      if(!res.headersSent) responder(res,status,{error:status===500 ? 'No se pudo completar la operación. Intentá nuevamente.' : error.message});
      else res.end();
    }
  });
  servidor.requestTimeout=30000;
  servidor.headersTimeout=15000;
  return { db,repo,servicios,servidor,bandeja };
}
module.exports={crearApp};
