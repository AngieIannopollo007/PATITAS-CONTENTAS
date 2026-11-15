const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { conectar,repositorio,datosDemo } = require('./base');
const { crearServicios } = require('./servicios');
const { ErrorApp,exigir,entero } = require('./seguridad');
const { crearBandeja } = require('./correo');

async function crearApp({ archivo, demo = true, gmail = null, transporte } = {}) {
  const db = conectar(archivo || ':memory:'), repo = repositorio(db);
  if (demo) await datosDemo(repo);
  const configurado = Boolean(gmail?.usuario && gmail?.clave);
  const servicios = crearServicios(repo,{gmail:configurado});
  const bandeja = crearBandeja(repo,configurado ? gmail : null,transporte);
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
    try {
      const host=req.headers.host || '';
      exigir(/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host),'Usá localhost o 127.0.0.1 para abrir PATITAS.',403);
      const url = new URL(req.url,`http://${host}`), ruta=url.pathname;
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
        res.writeHead(200,{'Content-Type':tipo+'; charset=utf-8','Cache-Control':'no-cache'});
        return res.end(req.method === 'HEAD' ? undefined : datos);
      }
      const muta=!['GET','HEAD'].includes(req.method);
      if (muta && req.headers.origin) exigir(req.headers.origin === `http://${host}`,'La petición debe salir de PATITAS.',403);
      const secreto = /(?:^|;\s*)patitas=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
      const sesion = servicios.autenticar(secreto);
      if (ruta === '/api/registro' || ruta === '/api/ingreso') {
        exigir(req.method === 'POST','Método no permitido.',405); limitar(req.socket.remoteAddress);
        const b=await leerBody(req);
        const s=await servicios[ruta === '/api/registro' ? 'registrar' : 'ingresar'](b);
        if (secreto) servicios.salir(secreto);
        return responder(res,ruta === '/api/registro' ? 201 : 200,{usuario:s.usuario,csrf:s.csrf},{'Set-Cookie':`patitas=${s.secreto}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800`});
      }
      exigir(sesion,'Primero iniciá sesión.',401);
      const u=sesion.usuario;
      if (muta) exigir(req.headers['x-csrf-token'] === sesion.csrf,'La sesión del formulario cambió. Recargá la página.',403);
      const b=muta ? await leerBody(req) : {};
      let salida, status=200, match;
      const id = valor => entero(Number(valor),'Identificador',1,Number.MAX_SAFE_INTEGER);
      if (req.method==='GET' && ruta==='/api/yo') salida={usuario:u,csrf:sesion.csrf};
      else if (req.method==='POST' && ruta==='/api/salir') { servicios.salir(secreto); return responder(res,200,{mensaje:'Sesión cerrada.'},{'Set-Cookie':'patitas=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'}); }
      else if(req.method==='PATCH' && ruta==='/api/perfil') salida={usuario:servicios.actualizarPerfil(u,b)};
      else if(req.method==='GET' && ruta==='/api/mascotas') salida=servicios.listarMascotas(url.searchParams);
      else if(req.method==='POST' && ruta==='/api/mascotas') { salida=servicios.publicar(u,b);status=201; }
      else if((match=/^\/api\/mascotas\/(\d+)$/.exec(ruta))) {
        if(req.method==='GET') { const m=servicios.verMascota(id(match[1])); exigir(m.estado!=='archivada'||m.responsable_id===u.id,'Publicación no disponible.',404);salida=m; }
        else if(req.method==='PATCH') salida=servicios.editarMascota(u,id(match[1]),b);
        else if(req.method==='DELETE') salida=servicios.archivar(u,id(match[1]));
        else throw new ErrorApp(405,'Método no permitido.');
      }
      else if(req.method==='GET' && ruta==='/api/refugios') salida=servicios.refugios();
      else if(req.method==='GET' && (match=/^\/api\/perfiles\/(\d+)$/.exec(ruta))) salida=servicios.detallePerfil(u,id(match[1]));
      else if(req.method==='GET' && ruta==='/api/panel') salida=servicios.panel(u);
      else if(req.method==='GET' && ruta==='/api/notificaciones') salida=servicios.novedades(u);
      else if(req.method==='POST' && ruta==='/api/notificaciones/leer-todas') salida=servicios.leerNotificacion(u,null);
      else if(req.method==='POST' && (match=/^\/api\/notificaciones\/(\d+)\/leer$/.exec(ruta))) salida=servicios.leerNotificacion(u,id(match[1]));
      else if(req.method==='GET' && ruta==='/api/conversaciones') salida=servicios.conversaciones(u);
      else if(req.method==='GET' && (match=/^\/api\/chat\/(\d+)$/.exec(ruta))) salida=servicios.chat(u,id(match[1]),url.searchParams.has('antes')?id(url.searchParams.get('antes')):Number.MAX_SAFE_INTEGER);
      else if(req.method==='POST' && (match=/^\/api\/chat\/(\d+)\/leido$/.exec(ruta))) salida=servicios.leerChat(u,id(match[1]),b.hasta);
      else if(req.method==='POST' && ruta==='/api/solicitudes') {salida=servicios.solicitar(u,b);status=201;}
      else if(req.method==='PATCH' && (match=/^\/api\/solicitudes\/(\d+)$/.exec(ruta))) salida=servicios.cambiarSolicitud(u,id(match[1]),b);
      else if(req.method==='PATCH' && (match=/^\/api\/adopciones\/(\d+)$/.exec(ruta))) salida=servicios.seguimiento(u,id(match[1]),b);
      else if(req.method==='POST' && ruta==='/api/donaciones') {salida=servicios.donar(u,b);status=201;}
      else if(req.method==='PATCH' && (match=/^\/api\/donaciones\/(\d+)$/.exec(ruta))) salida=servicios.cambiarDonacion(u,id(match[1]),b);
      else if(req.method==='POST' && ruta==='/api/resenas') {salida=servicios.resenar(u,b);status=201;}
      else if(req.method==='POST' && (match=/^\/api\/resenas\/(\d+)\/reportar$/.exec(ruta))) {salida=servicios.reportar(u,id(match[1]),b);status=201;}
      else if(req.method==='PATCH' && (match=/^\/api\/reportes\/(\d+)$/.exec(ruta))) salida=servicios.moderar(u,id(match[1]),b);
      else if(req.method==='POST' && ruta==='/api/mensajes') {salida=servicios.mensaje(u,b);status=201;}
      else if(req.method==='POST' && (match=/^\/api\/correos\/(\d+)\/reintentar$/.exec(ruta))) salida=servicios.reintentarCorreo(u,id(match[1]));
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
