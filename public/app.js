/* PATITAS: este archivo dibuja las pantallas y se comunica con el backend.
   Los datos importantes y los permisos se comprueban también en el servidor. */
const $ = selector => document.querySelector(selector);
const escapar = valor => String(valor ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fecha = valor => new Date(valor).toLocaleDateString('es-AR');
const pesos = centavos => new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS'}).format(centavos/100);
const publicador = u => ['refugio','particular'].includes(u.tipo);
const estado = valor => `<span class="chip ${escapar(valor)}">${escapar(valor.replaceAll('_',' '))}</span>`;
const iniciales = nombre => escapar(nombre.split(' ').slice(0,2).map(x=>x[0]).join(''));
const vacio = (titulo,texto='') => `<div class="vacio"><strong>${escapar(titulo)}</strong>${escapar(texto)}</div>`;
const boton = (accion,texto,id='',clase='secundario chico') => `<button type="button" class="boton ${clase}" data-accion="${accion}" data-id="${escapar(id)}">${texto}</button>`;
let sesion=null, csrf='', paginaActual='mascotas', tab='solicitudes', panel=null, pagina=1, filtro={buscar:'',especie:''};
let contadorVista=0;
const mascotasCache=new Map();
let avisoTimer;
let avisos={datos:[],noLeidas:0},conversaciones=[],chatActivo=null,chatDatos=null,actualizando=false,cuentaAvisos=null;
function avatar(u) {
  return fotoSegura(u.foto)?`<img class="avatar foto-perfil" src="${escapar(u.foto)}" alt="Foto de ${escapar(u.nombre)}">`:`<span class="avatar">${iniciales(u.nombre)}</span>`;
}
function fotoSegura(src) { return typeof src==='string'&&(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(src)||/^\/imagenes\/(luna|milo|coco|perfil-demo)\.svg$/.test(src)); }
async function leerImagen(archivo,anterior='',obligatoria=true) {
  if(!archivo||!archivo.size){if(obligatoria&&!anterior)throw Error('Agregá la foto obligatoria.');return anterior;}
  if(!['image/jpeg','image/png','image/webp'].includes(archivo.type)||archivo.size>512000)throw Error('Elegí una imagen JPG, PNG o WebP de hasta 500 KB.');
  return new Promise((resolve,reject)=>{const lector=new FileReader();lector.onload=()=>resolve(lector.result);lector.onerror=()=>reject(Error('No se pudo leer la foto.'));lector.readAsDataURL(archivo);});
}
function campoFoto(nombre,actual='',obligatoria=true) {
  return `<label class="ancho">${nombre==='foto_perfil'?'Foto de perfil':nombre==='archivo'?'Foto principal de la mascota':'Otra foto de la mascota'} ${obligatoria?'(obligatoria)':'(opcional)'}${fotoSegura(actual)?`<img class="mini-foto" src="${escapar(actual)}" alt="Foto actual">`:''}<input type="file" name="${nombre}" accept="image/jpeg,image/png,image/webp" ${obligatoria&&!actual?'required':''}><span class="ayuda">JPG, PNG o WebP, hasta 500 KB.${actual?' Si no elegís otra foto, se conserva la actual.':''}</span></label>`;
}
function avisar(mensaje,error=false) {
  $('#aviso').textContent=mensaje;$('#aviso').className=error?'error':'';$('#aviso').hidden=false;
  clearTimeout(avisoTimer);avisoTimer=setTimeout(()=>{$('#aviso').hidden=true;},6500);
}
async function api(ruta,{method='GET',body}={}) {
  const cuentaSolicitud=sesion?.id;
  const respuesta=await fetch('/api'+ruta,{method,credentials:'same-origin',headers:{...(body?{'Content-Type':'application/json'}:{}),...(csrf?{'X-CSRF-Token':csrf}:{})},body:body?JSON.stringify(body):undefined});
  const datos=await respuesta.json();
  if(!respuesta.ok) {
    if(respuesta.status===401 && sesion?.id===cuentaSolicitud && !['/ingreso','/registro'].includes(ruta)){sesion=null;csrf='';mostrarAcceso();}
    throw Error(datos.error || 'No se pudo completar la operación.');
  }
  return datos;
}
function encabezado() {
  $('#cabecera').hidden=false;$('#pie').hidden=false;
  $('#cabecera').innerHTML=`<div class="nav"><a href="#mascotas" class="marca" data-accion="navegar" data-id="mascotas"><span>🐾</span> PATITAS</a>
    <nav class="nav-links" aria-label="Principal">${[['mascotas','Encontrá tu compañero'],['refugios','Refugios y rescatistas'],['panel','Mi espacio']].map(([id,nombre])=>`<button class="${paginaActual===id?'activo':''}" data-accion="navegar" data-id="${id}">${nombre}</button>`).join('')}</nav>
    <div class="usuario"><button type="button" class="campana" data-accion="tab" data-id="notificaciones" aria-label="Centro de notificaciones">🔔 <span id="contador-avisos">${avisos.noLeidas}</span></button><span class="patitas">🐾 ${sesion.patitas} PATITAS</span>${avatar(sesion)}<span class="nombre-usuario">${escapar(sesion.nombre.split(' ')[0])}</span><button class="enlace" data-accion="salir">Salir</button></div></div>`;
}
function mostrarAcceso(registro=false) {
  contadorVista++;avisos={datos:[],noLeidas:0};conversaciones=[];chatActivo=null;chatDatos=null;cuentaAvisos=null;$('#cabecera').hidden=true;$('#pie').hidden=true;
  $('#contenido').innerHTML=`<div class="login"><section class="login-historia"><div class="marca">🐾 PATITAS</div><div><p class="etiqueta">UNA COMUNIDAD QUE DEJA HUELLA</p><h1>Pequeñas patitas.<br>Grandes <em>historias.</em></h1><p>Conectamos a quienes buscan un hogar con quienes tienen mucho amor para dar.</p><div class="login-arte"><img src="/imagenes/luna.svg" alt="Ilustración de una perrita esperando un hogar"><span class="sello">El amor<br>se adopta ♡</span></div></div><small>Adopciones responsables · Ayuda a refugios · Comunidad</small></section>
    <section class="login-form"><div class="pestanas"><button data-accion="acceso" class="${!registro?'activo':''}" data-id="ingreso">Iniciar sesión</button><button data-accion="acceso" class="${registro?'activo':''}" data-id="registro">Crear cuenta</button></div>
    <h2>${registro?'Tu historia empieza acá.':'Qué lindo verte por acá.'}</h2><p class="muted">${registro?'Elegí cómo querés formar parte de PATITAS.':'Ingresá para conocer mascotas y ayudar a la comunidad.'}</p>
    <form data-form="${registro?'registro':'ingreso'}" class="stack">${registro?`<label>Tu nombre o nombre del refugio<input name="nombre" required minlength="2" maxlength="100" autocomplete="name"></label><label>Quiero participar como<select name="tipo"><option value="adoptante">Persona que quiere adoptar</option><option value="refugio">Refugio u organización</option><option value="particular">Particular / rescatista que da en adopción</option></select></label><label>Ciudad<input name="ciudad" required minlength="2" maxlength="100" autocomplete="address-level2"></label>${campoFoto("foto_perfil")}<p class="ayuda">La foto identifica visualmente tu perfil; no es una verificación de identidad. Recibís 5 PATITAS de bienvenida, una sola vez.</p>`:''}
    <label>Correo electrónico<input name="email" type="email" required autocomplete="email" placeholder="nombre@ejemplo.com" maxlength="254"></label><label>Contraseña<input name="password" type="password" required ${registro?'minlength="10"':''} maxlength="128" autocomplete="${registro?'new-password':'current-password'}" placeholder="${registro?'Mínimo 10 caracteres':'Tu contraseña'}"></label>
    <p class="form-error" hidden role="alert"></p><button class="boton" type="submit">${registro?'Crear mi cuenta':'Ingresar'} <span aria-hidden="true">↗</span></button></form>
    <details class="demo"><summary>¿Querés probar? Usá una cuenta de ejemplo</summary><div class="acciones">${boton('demo','Adoptante','ana')}${boton('demo','Refugio','refugio')}${boton('demo','Rescatista','sofia')}${boton('demo','Moderación','admin')}</div><p>Datos y mascotas ficticios. Contraseña de ejemplo: Patitas2026!<br>Las cuentas de ejemplo están disponibles al iniciar una base nueva con DEMO=1.</p></details><p class="nota-pie">Primero iniciás sesión. Tus solicitudes y mensajes solo los ven sus participantes.</p></section></div>`;
}
async function navegar(vista='mascotas',id) {
  if(!sesion) return mostrarAcceso();
  const turno=++contadorVista;paginaActual=vista;encabezado();
  $('#contenido').innerHTML='<p class="cargando">Cargando… 🐾</p>';
  try {
    let html;
    if(vista==='mascotas') {
      const datos=await api(`/mascotas?${new URLSearchParams({...filtro,pagina})}`);
      html=renderMascotas(datos);
    } else if(vista==='refugios') html=renderRefugios(await api('/refugios'));
    else if(vista==='perfil') html=renderPerfil(await api('/perfiles/'+id));
    else {
      panel=await api('/panel');sesion=panel.usuario;
      html=renderPanel();
    }
    if(turno!==contadorVista) return;
    $('#contenido').innerHTML=html;encabezado();
    if(vista==='panel'&&tab==='mensajes'&&chatActivo) {
      try {await cargarChat(chatActivo,true);}
      catch(error) {
        if(turno===contadorVista&&$('#chat-detalle')) {
          chatActivo=null;chatDatos=null;
          $('#chat-detalle').innerHTML=vacio('No pudimos abrir esta conversación.',error.message+' Podés elegir otra conversación de la lista.');
        }
      }
    }
    actualizarNovedades();
  } catch(e) {if(turno===contadorVista && sesion)$('#contenido').innerHTML=`<div class="contenedor">${vacio('No pudimos cargar esta sección.',e.message)}${boton('navegar','Volver a las mascotas','mascotas')}</div>`;}
}
function fotoMascota(m,clase='foto') {
  const src = m.foto && (/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(m.foto) || /^\/imagenes\/[a-z]+\.svg$/.test(m.foto)) ? m.foto : '';
  return src?`<img class="${clase}" src="${escapar(src)}" alt="${escapar(m.nombre)}" loading="lazy">`:`<div class="sin-foto" aria-label="Sin fotografía">${m.especie==='Gato'?'🐈':'🐕'}</div>`;
}
function tarjeta(m,admin=false) {
  mascotasCache.set(m.id,m);
  const anios=Math.floor(m.edad_meses/12);
  const edad=m.edad_meses<12?`${m.edad_meses} ${m.edad_meses===1?'mes':'meses'}`:`${anios} ${anios===1?'año':'años'}`;
  return `<article class="tarjeta">${fotoMascota(m)}<div class="ficha"><div class="fila"><span class="chip">${escapar(m.especie)} · ${edad}</span>${admin?estado(m.estado):''}</div><h3 class="serif">${escapar(m.nombre)}</h3><p>${escapar(m.descripcion.slice(0,115))}${m.descripcion.length>115?'…':''}</p><p>⌖ ${escapar(m.ciudad||sesion.ciudad||'Sin ciudad')} ${m.responsable?'· '+escapar(m.responsable):''}</p><div class="acciones">${boton('mascota','Conoceme ↗',m.id)}${admin&&m.estado==='disponible'?boton('editar-mascota','Editar',m.id):''}</div></div></article>`;
}
function renderMascotas(datos) {
  return `<div class="contenedor"><section class="hero"><div><p class="etiqueta">UN ENCUENTRO PUEDE CAMBIAR DOS VIDAS</p><h1>Tu próximo amigo<br>te está <em>esperando.</em></h1><p>Cada mascota tiene una historia. Podés ser parte de su próximo capítulo.</p><div class="acciones"><a class="boton" href="#catalogo">Conocé a la manada ↓</a>${boton('navegar','Quiero ayudar ♡','refugios','secundario')}</div></div><div class="hero-arte"><img src="/imagenes/compania.svg" alt="Ilustración de un perro y un gato juntos"><span class="sello">Un hogar.<br>Mil aventuras.</span></div></section>
    <section id="catalogo"><div class="fila section-head"><div><p class="etiqueta">BUSCAN SU LUGAR EN EL MUNDO</p><h2>¿A quién vas a conocer hoy?</h2></div><span class="muted">${datos.total} ${datos.total===1?'compañero disponible':'compañeros disponibles'}</span></div><form data-form="buscar" class="filtros"><label>Buscar por nombre o ciudad<input name="buscar" value="${escapar(filtro.buscar)}" placeholder="Por ejemplo: Luna o Buenos Aires" maxlength="100"></label><label>Especie<select name="especie">${['','Perro','Gato','Otro'].map(x=>`<option value="${x}" ${filtro.especie===x?'selected':''}>${x||'Todas las mascotas'}</option>`).join('')}</select></label><button class="boton" type="submit">Buscar</button></form>
    ${datos.datos.length?`<div class="grid">${datos.datos.map(m=>tarjeta(m)).join('')}</div>`:vacio('Todavía no encontramos coincidencias.','Probá con otra búsqueda o volvé más tarde.')}
    <div class="paginacion">${pagina>1?boton('pagina','← Anterior',pagina-1):''}<span>Página ${pagina}</span>${pagina*24<datos.total?boton('pagina','Siguiente →',pagina+1):''}</div></section></div>`;
}
function renderRefugios(datos) {
  return `<div class="contenedor"><div class="section-head"><p class="etiqueta">QUIENES HACEN POSIBLE EL ENCUENTRO</p><h1>Una red de buenas personas.</h1><p class="muted">Conocé a los refugios y rescatistas. Cada ayuda deja una huella.</p></div><div class="grid">${datos.map(p=>`<article class="tarjeta"><div class="ficha">${avatar(p)}<p class="etiqueta separado">${p.tipo==='refugio'?'REFUGIO':'RESCATISTA / PARTICULAR'}</p><h2>${escapar(p.nombre)}</h2><p>⌖ ${escapar(p.ciudad)}</p><p>${escapar(p.descripcion.slice(0,170)||'Este perfil está preparando su historia.')}</p><p>${p.cantidad?`★ ${p.promedio} · ${p.cantidad} reseñas`:'Todavía sin reseñas'}</p><div class="acciones">${boton('perfil','Ver perfil ↗',p.id)}${p.id!==sesion.id?boton('donar','Ayudar ♡',p.id):''}</div></div></article>`).join('')}</div>${!datos.length?vacio('La comunidad está empezando.','Los nuevos refugios aparecerán acá.'):''}</div>`;
}
function renderPerfil(datos) {
  const {perfil:p,mascotas,resenas}=datos;
  return `<div class="contenedor"><button class="enlace" data-accion="navegar" data-id="refugios">← Volver a la comunidad</button><section class="perfil-portada">${avatar(p)}<h1>${escapar(p.nombre)}</h1><p>⌖ ${escapar(p.ciudad)} · ${escapar(p.tipo)} · 🐾 ${p.patitas} PATITAS</p><p>${escapar(p.descripcion||'Todavía no agregó una descripción.')}</p>${p.contacto_publico?`<p><strong>Contacto publicado:</strong> ${escapar(p.contacto_publico)}</p>`:''}<div class="acciones">${p.id!==sesion.id?boton('mensaje','Enviar mensaje',p.id,'')+(publicador(p)?boton('donar','Donar ♡',p.id,'secundario'):''):boton('tab','Editar mi perfil','perfil')}</div></section><div class="perfil-layout"><section><h2>${publicador(p)?'Sus mascotas':'Experiencias en la comunidad'}</h2>${mascotas.length?`<div class="grid">${mascotas.map(m=>tarjeta({...m,ciudad:p.ciudad,responsable:p.nombre})).join('')}</div>`:vacio('No hay mascotas disponibles en este perfil.')}</section><aside><h2>Reseñas</h2><p class="muted">${p.cantidad?`★ ${p.promedio} de 5 · ${p.cantidad} experiencias`:'Todavía sin calificaciones.'}</p>${resenas.map(x=>`<article class="resena"><div class="estrellas" aria-label="${x.puntuacion} de 5 estrellas">${'★'.repeat(x.puntuacion)}${'☆'.repeat(5-x.puntuacion)}</div><p>${escapar(x.comentario)}</p><small>${escapar(x.autor)} · ${fecha(x.creado)}</small><br><button class="enlace" data-accion="reportar" data-id="${x.id}">Reportar</button></article>`).join('')}<p class="nota-pie">Las reseñas requieren una experiencia registrada. Las PATITAS reconocen colaboraciones; no garantizan aptitud para adoptar.</p></aside></div></div>`;
}
function resenable(clase,id) {
  return !panel.resenas.some(r=>clase==='adopcion'?r.adopcion_id===id:r.donacion_id===id);
}
function renderPanel() {
  const esPublicador=publicador(sesion),u=sesion;
  const tabs=[...(esPublicador?[['mascotas','Mis mascotas']]:[]),['solicitudes',esPublicador?'Solicitudes recibidas':'Mis solicitudes'],['adopciones',esPublicador?'Planilla de seguimiento':'Mis adopciones'],['donaciones','Donaciones'],['mensajes','Chats privados'],['notificaciones','Notificaciones'],['correos','Correos'],['perfil','Mi perfil'],...(u.tipo==='admin'?[['moderacion','Moderación']]:[])];
  if(!tabs.some(t=>t[0]===tab)) tab='solicitudes';
  let html='';
  if(tab==='mascotas') html=`<div class="fila section-head"><h2>Tus publicaciones</h2>${boton('publicar','+ Publicar mascota','','')}</div>${panel.mascotas.length?`<div class="grid">${panel.mascotas.map(m=>tarjeta({...m,ciudad:u.ciudad},true)).join('')}</div>`:vacio('La primera historia puede empezar hoy.','Usá «Publicar mascota» para agregarla.')}`;
  if(tab==='solicitudes') html=`<h2>${esPublicador?'Un hogar empieza con una solicitud.':'Tus primeros pasos.'}</h2><div class="lista">${panel.solicitudes.map(s=>`<article class="registro"><div class="fila"><h3>${escapar(s.mascota)} · ${escapar(s.nombre)}</h3>${estado(s.estado)}</div><p>${esPublicador?'Solicitud de adopción':'Responsable: '+escapar(s.responsable)} · ${fecha(s.creado)}</p><details><summary>Ver formulario y observaciones</summary><div class="datos"><span><b>Correo</b>${escapar(s.email)}</span><span><b>Teléfono</b>${escapar(s.telefono)}</span><span><b>Dirección</b>${escapar(s.direccion)}</span><span><b>Edad</b>${s.edad}</span><span><b>Vivienda</b>${escapar(s.vivienda)}</span><span><b>Motivo</b>${escapar(s.motivo)}</span></div><p><strong>Observaciones:</strong> ${escapar(s.observaciones||'Sin observaciones.')}</p></details><div class="acciones">${boton('mensaje','Contactar',u.id===s.adoptante_id?s.responsable_id:s.adoptante_id)}${boton('perfil','Ver perfil',u.id===s.adoptante_id?s.responsable_id:s.adoptante_id)}${['pendiente','en_revision'].includes(s.estado)?(s.responsable_id===u.id?boton('solicitud-estado','Revisar / resolver',s.id):boton('cancelar-solicitud','Cancelar solicitud',s.id,'peligro chico')):''}</div></article>`).join('')||vacio('Todavía no hay solicitudes.',esPublicador?'Aparecerán cuando alguien complete el formulario de una mascota.':'Elegí una mascota y completá su formulario para empezar.')}</div>`;
  if(tab==='adopciones') html=`<div class="fila"><h2>${esPublicador?'La historia sigue después de adoptar.':'Tu nueva familia.'}</h2>${panel.adopciones.length?boton('exportar','Descargar planilla CSV'):''}</div><p class="muted">Datos privados de las adopciones registradas. ${esPublicador?'Podés guardar notas de seguimiento.':''}</p>${panel.adopciones.length?`<div class="tabla-wrap"><table><thead><tr><th>Mascota / fecha</th><th>Adoptante</th><th>Contacto</th><th>Dirección</th><th>Seguimiento</th><th>Acciones</th></tr></thead><tbody>${panel.adopciones.map(a=>`<tr><td><strong>${escapar(a.mascota)}</strong><br>${fecha(a.fecha)}</td><td>${escapar(a.nombre)}</td><td>${escapar(a.email)}<br>${escapar(a.telefono)}</td><td>${escapar(a.direccion)}</td><td>${escapar(a.seguimiento||'Sin notas.')}</td><td><div class="acciones">${a.responsable_id===u.id?boton('seguimiento','Anotar',a.id):''}${resenable('adopcion',a.id)?boton('resena-adopcion','Calificar',a.id):'<small>Ya calificaste</small>'}</div></td></tr>`).join('')}</tbody></table></div>`:vacio('Todavía no hay adopciones registradas.','Aprobar una solicitud genera automáticamente este registro.')}`;
  if(tab==='donaciones') html=`<h2>Cada ayuda cuenta.</h2><div class="info">Cada donación recibida y confirmada suma <strong>10 PATITAS</strong>, sin importar su importe. Registrar no transfiere dinero. Coordiná la entrega o transferencia con el destinatario.</div><div class="lista">${panel.donaciones.map(d=>`<article class="registro"><div class="fila"><h3>${escapar(d.tipo)} ${d.tipo==='Dinero'?'· '+pesos(d.centavos):''}</h3>${estado(d.estado)}</div><p>De ${escapar(d.donante)} para ${escapar(d.destinatario)} · ${fecha(d.creado)}</p><p>${escapar(d.descripcion)}</p><p>🐾 ${d.puntos} PATITAS otorgadas</p><div class="acciones">${boton('mensaje','Coordinar por mensaje',u.id===d.donante_id?d.destinatario_id:d.donante_id)}${d.estado==='pendiente'?(d.destinatario_id===u.id?boton('confirmar-donacion','Confirmar recepción',d.id)+boton('rechazar-donacion','No recibida',d.id):boton('cancelar-donacion','Cancelar',d.id,'peligro chico')):''}${d.estado==='confirmada'&&resenable('donacion',d.id)?boton('resena-donacion','Dejar reseña',d.id):''}</div></article>`).join('')||vacio('Tu próxima ayuda empieza con un gesto.','Entrá al perfil de un refugio o rescatista y elegí «Donar».')}</div>`;
  if(tab==='mensajes') html=renderChats();
  if(tab==='notificaciones') html=`<div class="fila"><h2>Tu centro de notificaciones.</h2>${boton('leer-todas','Marcar todas como leídas')}</div><p class="muted">Se actualiza automáticamente cada 5 segundos mientras la app está abierta. Los avisos importantes también se preparan para enviar por Gmail.</p><div id="lista-avisos">${renderAvisos()}</div>`;
  if(tab==='correos') html=`<h2>No te pierdas ninguna novedad.</h2><div class="info">${panel.correoConfigurado?'Gmail está configurado. «Enviado» significa que Gmail aceptó el mensaje, no garantiza que haya llegado a la bandeja principal.':'Gmail todavía no está configurado. Las notificaciones se conservan acá como «local» y no se enviaron por email. Consultá la guía de Gmail incluida.'}</div><div class="lista">${panel.correos.map(c=>`<article class="registro"><div class="fila"><h3>${escapar(c.asunto)}</h3>${estado(c.estado)}</div><p>${fecha(c.creado)}</p><details><summary>Leer notificación</summary><div class="correo-cuerpo">${escapar(c.cuerpo)}</div></details>${['local','error'].includes(c.estado)&&panel.correoConfigurado?`<div class="acciones">${boton('reintentar','Enviar / reintentar email',c.id)}</div>`:''}</article>`).join('')||vacio('Sin notificaciones por ahora.')}</div>`;
  if(tab==='perfil') html=`<section class="limite"><h2>Tu lugar en PATITAS.</h2><p class="muted">${escapar(u.email)} · ${escapar(u.tipo)} · 🐾 ${u.patitas} PATITAS (incluyen 5 de bienvenida)</p>${!u.foto?'<p class="info">Completá la foto obligatoria de tu perfil.</p>':''}<form data-form="perfil" class="perfil-form"><div class="campos">${campoFoto("foto_perfil",u.foto)}${campo('Nombre','nombre',u.nombre,'text',100)}${campo('Ciudad','ciudad',u.ciudad,'text',100)}<label class="ancho">Tu historia<textarea name="descripcion" maxlength="1500">${escapar(u.descripcion)}</textarea></label>${campo('Teléfono privado','telefono',u.telefono,'tel',50,false)}${campo('Dirección privada','direccion',u.direccion,'text',250,false)}<label class="ancho">Contacto público (opcional)<input name="contacto_publico" maxlength="200" value="${escapar(u.contacto_publico)}" placeholder="Solo lo que quieras compartir con la comunidad"></label>${esPublicador?`<label class="ancho">Alias o instrucciones de donación (opcional)<textarea name="alias_donacion" maxlength="200">${escapar(u.alias_donacion)}</textarea></label>`:`<input type="hidden" name="alias_donacion" value="">`}</div><p class="ayuda">Teléfono y dirección privados no aparecen en tu perfil público. Los datos de cada solicitud se completan y guardan por separado.</p><p class="form-error" hidden role="alert"></p><button class="boton" type="submit">Guardar perfil</button></form></section>`;
  if(tab==='moderacion') html=`<h2>Cuidemos la comunidad.</h2><p class="muted">Revisá el comentario y el motivo antes de decidir.</p><div class="lista">${panel.reportes.map(r=>`<article class="registro"><h3>Reporte #${r.id} · reseña ${r.puntuacion}/5</h3><p>${escapar(r.comentario)}</p><p><strong>Motivo:</strong> ${escapar(r.motivo)}</p><div class="acciones">${boton('ocultar-resena','Ocultar reseña',r.id,'peligro chico')}${boton('conservar-resena','Conservar y resolver',r.id)}</div></article>`).join('')||vacio('No hay reportes pendientes.')}</div>`;
  return `<div class="contenedor"><div class="fila"><div><p class="etiqueta">TU COMUNIDAD, TU ESPACIO</p><h1>Hola, ${escapar(u.nombre.split(' ')[0])}.</h1></div>${boton('actualizar','↻ Actualizar')}</div><div class="numeros"><div class="numero"><strong>${esPublicador?panel.mascotas.length:panel.solicitudes.length}</strong><span>${esPublicador?'Mascotas publicadas':'Solicitudes realizadas'}</span></div><div class="numero"><strong>${panel.adopciones.length}</strong><span>Adopciones registradas</span></div><div class="numero"><strong>${panel.donaciones.filter(d=>d.estado==='confirmada').length}</strong><span>Donaciones confirmadas</span></div><div class="numero"><strong>${u.patitas}</strong><span>PATITAS por colaborar</span></div></div><nav class="tabs-panel" aria-label="Mi espacio">${tabs.map(([id,nombre])=>`<button class="${tab===id?'activo':''}" data-accion="tab" data-id="${id}">${nombre}</button>`).join('')}</nav>${html}<p class="nota-pie">Se muestran hasta 500 registros por sección, conversaciones con historial paginado y 100 notificaciones recientes. Actualizá para ver novedades.</p></div>`;
}
function campo(label,name,value='',type='text',max=200,required=true) {
  return `<label>${label}<input name="${name}" type="${type}" value="${escapar(value)}" ${required?'required':''} ${type==='number'?'min="0" step="1"':`maxlength="${max}"`}></label>`;
}
function seleccionar(label,name,opciones,valor) {
  return `<label>${label}<select name="${name}">${opciones.map(x=>`<option ${x===valor?'selected':''}>${x}</option>`).join('')}</select></label>`;
}
function abrirModal(titulo,contenido) {
  $('#modal-contenido').innerHTML=`<div class="modal-head"><h2 id="titulo-modal">${escapar(titulo)}</h2><button type="button" class="cerrar" data-accion="cerrar" aria-label="Cerrar">×</button></div><div class="modal-body">${contenido}</div>`;
  if(!$('#modal').open)$('#modal').showModal();
}
function formModal(nombre,contenido,id='') {
  return `<form data-form="${nombre}" data-id="${escapar(id)}">${contenido}<p class="form-error" hidden role="alert"></p><button class="boton" type="submit">${nombre==='solicitar'?'Enviar solicitud':nombre==='donar'?'Registrar colaboración':nombre==='mensaje'?'Enviar mensaje':'Guardar'}</button></form>`;
}
async function detalleMascota(id) {
  const m=await api('/mascotas/'+id);mascotasCache.set(m.id,m);
  abrirModal(m.nombre,`${fotoMascota(m)}${fotoSegura(m.foto_extra)?`<img class="foto foto-adicional" src="${escapar(m.foto_extra)}" alt="Otra foto de ${escapar(m.nombre)}">`:""}${estado(m.estado)}<div class="detalle-grid"><span><strong>Especie</strong>${escapar(m.especie)}</span><span><strong>Edad</strong>${m.edad_meses} meses</span><span><strong>Sexo</strong>${escapar(m.sexo)}</span><span><strong>Tamaño</strong>${escapar(m.tamano)}</span><span><strong>Raza</strong>${escapar(m.raza||'Sin informar')}</span><span><strong>Ciudad</strong>${escapar(m.ciudad)}</span></div><p>${escapar(m.descripcion)}</p><p><strong>Salud informada:</strong> ${escapar(m.salud||'Consultar con su responsable.')}</p><p><strong>Responsable:</strong> ${escapar(m.responsable)}</p><div class="acciones">${m.estado==='disponible'&&sesion.tipo==='adoptante'?boton('solicitar','Quiero adoptar ♡',m.id,''):''}${boton('perfil','Ver perfil responsable',m.responsable_id)}${m.responsable_id===sesion.id&&m.estado==='disponible'?boton('editar-mascota','Editar',m.id)+boton('archivar','Retirar publicación',m.id,'peligro chico'):''}</div>`);
}
function formularioMascota(m={}) {
  if(m.id)mascotasCache.set(m.id,m);
  abrirModal(m.id?'Editar mascota':'Una nueva historia',formModal('mascota',`<p class="ayuda">Completá su información. La salud es informada por el responsable.</p><div class="campos">${campo('Nombre','nombre',m.nombre,'text',80)}${seleccionar('Especie','especie',['Perro','Gato','Otro'],m.especie)}${campo('Raza (opcional)','raza',m.raza,'text',80,false)}<label>Edad en meses<input type="number" name="edad_meses" value="${m.edad_meses??''}" min="0" max="600" step="1" required></label>${seleccionar('Sexo','sexo',['Hembra','Macho','Sin informar'],m.sexo)}${seleccionar('Tamaño','tamano',['Pequeño','Mediano','Grande'],m.tamano)}<label class="ancho">Su historia<textarea name="descripcion" required minlength="10" maxlength="1500">${escapar(m.descripcion)}</textarea></label><label class="ancho">Salud y cuidados<textarea name="salud" maxlength="1000">${escapar(m.salud)}</textarea></label>${campoFoto("archivo",m.foto)}${campoFoto("archivo_extra",m.foto_extra,false)}</div>`,m.id||''));
}
function formularioSolicitud(id) {
  const m=mascotasCache.get(Number(id));
  abrirModal(`Tu solicitud para ${m?.nombre||'adoptar'}`,formModal('solicitar',`<p class="ayuda">Estos datos solo los ven vos y el responsable de la mascota. La solicitud no garantiza la adopción.</p><div class="campos">${campo('Nombre completo','nombre',sesion.nombre,'text',100)}<label>Edad<input name="edad" type="number" min="18" max="120" step="1" required></label>${campo('Correo','email',sesion.email,'email',254)}${campo('Teléfono','telefono',sesion.telefono,'tel',50)}<label class="ancho">Dirección<input name="direccion" value="${escapar(sesion.direccion)}" required minlength="5" maxlength="250"></label><label class="ancho">¿Cómo es tu vivienda y quién vive con vos?<textarea name="vivienda" required minlength="5" maxlength="500"></textarea></label><label class="ancho">¿Por qué querés adoptar? ¿Cómo vas a cuidarla?<textarea name="motivo" required minlength="15" maxlength="1500"></textarea></label></div><label class="check"><input name="compromiso" type="checkbox" required><span>Me comprometo a brindar cuidado responsable y acepto compartir este formulario con el responsable para gestionar la solicitud.</span></label>`,id));
}
async function formularioDonacion(id) {
  const {perfil:p}=await api('/perfiles/'+id);
  abrirModal(`Ayudá a ${p.nombre}`,formModal('donar',`<div class="info">Registrar una donación <strong>no realiza un cobro ni una transferencia</strong>. Coordiná la entrega con el destinatario. Cuando confirme que la recibió, sumarás 10 PATITAS.</div><p><strong>Datos publicados para colaborar:</strong><br>${escapar(p.alias_donacion||'Todavía no publicó instrucciones. Podés contactarlo por mensaje.')}</p><div class="campos">${seleccionar('Quiero donar','tipo',['Dinero','Alimentos','Medicamentos','Accesorios','Otros'])}<label>Importe en pesos (solo dinero)<input name="importe" type="number" min="0.01" max="1000000" step="0.01" placeholder="Ejemplo: 1500"></label><label class="ancho">Detalle de tu ayuda<textarea name="descripcion" required minlength="5" maxlength="1000" placeholder="Ejemplo: bolsa de alimento de 10 kg, para coordinar entrega"></textarea></label></div>`,id));
}
async function refrescar(mensaje) { $('#modal').close();if(mensaje)avisar(mensaje);await navegar('panel'); }

document.addEventListener('click',async evento=>{
  const b=evento.target.closest('[data-accion]');if(!b)return;
  evento.preventDefault();const {accion,id}=b.dataset;
  try {
    if(accion==='acceso')return mostrarAcceso(id==='registro');
    if(accion==='demo') {
      b.disabled=true;
      const r=await api('/ingreso',{method:'POST',body:{email:id+'@patitas.test',password:'Patitas2026!'}});
      sesion=r.usuario;csrf=r.csrf;return navegar('mascotas');
    }
    if(accion==='navegar') {if($('#modal').open)$('#modal').close();return navegar(id);}
    if(accion==='salir') {await api('/salir',{method:'POST',body:{}});sesion=null;csrf='';return mostrarAcceso();}
    if(accion==='cerrar')return $('#modal').close();
    if(accion==='pagina'){pagina=Number(id);return navegar('mascotas');}
    if(accion==='perfil'){if($('#modal').open)$('#modal').close();return navegar('perfil',id);}
    if(accion==='tab'){tab=id;if($('#modal').open)$('#modal').close();return navegar('panel');}
    if(accion==='actualizar')return navegar('panel');
    if(accion==='mascota')return await detalleMascota(id);
    if(accion==='publicar')return formularioMascota();
    if(accion==='editar-mascota')return formularioMascota(await api('/mascotas/'+id));
    if(accion==='solicitar')return formularioSolicitud(id);
    if(accion==='donar')return await formularioDonacion(id);
    if(accion==='archivar') {
      if(!confirm('¿Retirar esta publicación? Se conserva el historial y se cierran las solicitudes pendientes.'))return;
      const r=await api('/mascotas/'+id,{method:'DELETE',body:{}});return refrescar(r.mensaje);
    }
    if(accion==='solicitud-estado') {
      const s=panel.solicitudes.find(x=>x.id===Number(id));
      return abrirModal('Revisar solicitud',formModal('estado-solicitud',`<p>${escapar(s.nombre)} quiere adoptar a ${escapar(s.mascota)}.</p><label>Decisión<select name="estado"><option value="en_revision">Continuar en revisión</option><option value="aprobada">Aprobar y registrar la adopción</option><option value="rechazada">Rechazar solicitud</option></select></label><p class="ayuda">Al aprobar se marca la mascota como adoptada y se cierran otras solicitudes para esa mascota.</p><label>Observaciones para el adoptante<textarea name="observaciones" maxlength="2000">${escapar(s.observaciones)}</textarea></label>`,id));
    }
    if(accion==='cancelar-solicitud') {
      if(!confirm('¿Cancelar esta solicitud?'))return;
      const r=await api('/solicitudes/'+id,{method:'PATCH',body:{estado:'cancelada'}});return refrescar(r.mensaje);
    }
    if(accion==='seguimiento') {
      const a=panel.adopciones.find(x=>x.id===Number(id));
      return abrirModal('Seguimiento de '+a.mascota,formModal('seguimiento',`<label>Notas privadas del seguimiento<textarea name="seguimiento" maxlength="5000">${escapar(a.seguimiento)}</textarea></label><p class="ayuda">Estas notas también pueden ser consultadas por el adoptante de esta experiencia.</p>`,id));
    }
    if(['confirmar-donacion','rechazar-donacion','cancelar-donacion'].includes(accion)) {
      const valor=accion==='confirmar-donacion'?'confirmada':accion==='rechazar-donacion'?'rechazada':'cancelada';
      if(!confirm(valor==='confirmada'?'¿Confirmás que recibiste esta donación? Se otorgarán 10 PATITAS una sola vez.':'¿Confirmás actualizar esta donación?'))return;
      const r=await api('/donaciones/'+id,{method:'PATCH',body:{estado:valor}});return refrescar(r.mensaje);
    }
    if(accion==='mensaje'||accion==='abrir-chat'){chatActivo=Number(id);chatDatos=null;tab='mensajes';if($('#modal').open)$('#modal').close();return await navegar('panel');}
    if(accion==='leer-todas'){await api('/notificaciones/leer-todas',{method:'POST',body:{}});return await actualizarNovedades(true);}
    if(accion==='abrir-aviso')return await abrirAviso(Number(id));
    if(accion==='chat-anteriores')return await cargarAnteriores();
    if(accion==='resena-adopcion'||accion==='resena-donacion')return abrirModal('Compartí tu experiencia',formModal('resena',`<input type="hidden" name="clase" value="${accion==='resena-adopcion'?'adopcion':'donacion'}"><label>¿Cómo fue la experiencia?<select name="puntuacion"><option value="5">★★★★★ · Excelente</option><option value="4">★★★★☆ · Buena</option><option value="3">★★★☆☆ · Regular</option><option value="2">★★☆☆☆ · Mala</option><option value="1">★☆☆☆☆ · Muy mala</option></select></label><label>Comentario<textarea name="comentario" required minlength="5" maxlength="1000"></textarea></label><p class="ayuda">Sé respetuoso y no publiques domicilios ni datos privados. Tu comentario aparecerá en el perfil de la otra persona y podrá reportarse.</p>`,id));
    if(accion==='reportar')return abrirModal('Reportar una reseña',formModal('reportar','<label>¿Qué problema encontraste?<textarea name="motivo" required minlength="5" maxlength="500"></textarea></label>',id));
    if(accion==='ocultar-resena'||accion==='conservar-resena') {
      const r=await api('/reportes/'+id,{method:'PATCH',body:{ocultar:accion==='ocultar-resena'}});return refrescar(r.mensaje);
    }
    if(accion==='reintentar') {
      const r=await api('/correos/'+id+'/reintentar',{method:'POST',body:{}});return refrescar(r.mensaje);
    }
    if(accion==='exportar') {
      const celda=x=>{let v=String(x??'');if(/^(?:\s*[=+\-@]|[\t\r])/.test(v))v="'"+v;return '"'+v.replaceAll('"','""')+'"';};
      const filas=[['Mascota','Adoptante','Email','Teléfono','Dirección','Fecha','Seguimiento'],...panel.adopciones.map(a=>[a.mascota,a.nombre,a.email,a.telefono,a.direccion,a.fecha,a.seguimiento])];
      const archivo=new Blob(['\uFEFF'+filas.map(f=>f.map(celda).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'});
      const url=URL.createObjectURL(archivo),link=document.createElement('a');link.href=url;link.download='patitas-seguimiento.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }
  } catch(e){avisar(e.message,true);}finally{if(b.isConnected)b.disabled=false;}
});
document.addEventListener('submit',async evento=>{
  const form=evento.target;if(!form.dataset.form)return;evento.preventDefault();
  const accion=form.dataset.form,id=form.dataset.id,b=Object.fromEntries(new FormData(form)),submit=form.querySelector('[type=submit]'),error=form.querySelector('.form-error');
  if(error)error.hidden=true;submit.disabled=true;
  try {
    if(accion==='buscar'){filtro={buscar:b.buscar,especie:b.especie};pagina=1;return await navegar('mascotas');}
    if(accion==='ingreso'||accion==='registro') {
      if(accion==='registro'){b.foto=await leerImagen(form.elements.foto_perfil.files[0]);delete b.foto_perfil;}
      const r=await api('/'+accion,{method:'POST',body:b});sesion=r.usuario;csrf=r.csrf;return await navegar('mascotas');
    }
    let r;
    if(accion==='perfil') {b.foto=await leerImagen(form.elements.foto_perfil.files[0],sesion.foto);delete b.foto_perfil;r=await api('/perfil',{method:'PATCH',body:b});sesion=r.usuario;await refrescar('Perfil actualizado.');return;}
    if(accion==='mascota') {
      const anterior=id?mascotasCache.get(Number(id)):null;
      b.foto=await leerImagen(form.elements.archivo.files[0],anterior?.foto||'');
      b.foto_extra=await leerImagen(form.elements.archivo_extra.files[0],anterior?.foto_extra||'',false);
      delete b.archivo;delete b.archivo_extra;b.edad_meses=Number(b.edad_meses);
      r=await api('/mascotas'+(id?'/'+id:''),{method:id?'PATCH':'POST',body:b});tab='mascotas';return await refrescar(id?'Publicación actualizada.':'¡Una nueva historia publicada!');
    }
    if(accion==='solicitar'){b.mascota_id=Number(id);b.edad=Number(b.edad);b.compromiso=form.elements.compromiso.checked;r=await api('/solicitudes',{method:'POST',body:b});tab='solicitudes';return await refrescar(r.correo==='local'?'Solicitud guardada. Notificación local creada; falta configurar Gmail para enviarla.':'Solicitud guardada. El correo quedó en cola de envío.');}
    if(accion==='estado-solicitud')r=await api('/solicitudes/'+id,{method:'PATCH',body:b});
    if(accion==='seguimiento')r=await api('/adopciones/'+id,{method:'PATCH',body:b});
    if(accion==='donar'){b.destinatario_id=Number(id);b.centavos=b.tipo==='Dinero'?Math.round(Number(b.importe)*100):0;delete b.importe;r=await api('/donaciones',{method:'POST',body:b});tab='donaciones';}
    if(accion==='chat'){b.receptor_id=Number(id);r=await api('/mensajes',{method:'POST',body:b});form.elements.cuerpo.value='';await cargarChat(Number(id),false,true);await actualizarNovedades(true);return;}
    if(accion==='resena'){b.experiencia_id=Number(id);b.puntuacion=Number(b.puntuacion);r=await api('/resenas',{method:'POST',body:b});}
    if(accion==='reportar')r=await api('/resenas/'+id+'/reportar',{method:'POST',body:b});
    await refrescar(r?.mensaje||'Guardado.');
  } catch(e) {if(error && error.isConnected){error.textContent=e.message;error.hidden=false;}else avisar(e.message,true);}finally{submit.disabled=false;}
});
$('#modal').addEventListener('click',e=>{if(e.target===$('#modal'))$('#modal').close();});
function renderAvisos() {
  return avisos.datos.map(n=>`<article class="registro aviso-item ${n.leida?'':'sin-leer'}"><div class="fila"><h3>${escapar(n.asunto)}</h3><span class="chip">${n.leida?'Leída':'Nueva'}</span></div><p>${escapar(n.cuerpo.slice(0,180))}${n.cuerpo.length>180?'…':''}</p><small>${fecha(n.creado)} · Correo: ${escapar(n.correo_estado||'sin correo')}</small><div class="acciones">${boton('abrir-aviso',n.tipo==='mensaje'?'Abrir este chat':'Ver detalle',n.id)}</div></article>`).join('')||vacio('Estás al día.','Los nuevos mensajes, donaciones y solicitudes aparecerán acá.');
}
function renderConversaciones() {
  return conversaciones.map(c=>`<button type="button" class="conversacion ${chatActivo===c.id?'seleccionada':''}" data-accion="abrir-chat" data-id="${c.id}">${avatar(c)}<span><strong>${escapar(c.nombre)}</strong><small>${escapar(c.ultimo_mensaje.slice(0,65))}</small></span>${c.no_leidos?`<span class="contador-chat">${c.no_leidos}</span>`:''}</button>`).join('')||'<p class="ayuda">Todavía no hay conversaciones. Podés iniciar una desde el perfil de un refugio.</p>';
}
function renderChats() {
  return `<h2>Una conversación, un encuentro.</h2><p class="muted">Cada chat es privado entre vos y esa persona. Se actualiza solo cada cinco segundos.</p><div class="chats-layout"><aside class="chats-lista"><h3>Conversaciones</h3><div id="conversaciones">${renderConversaciones()}</div></aside><section id="chat-detalle" class="chat-detalle" aria-label="Chat privado">${vacio('Elegí una conversación.','También podés abrir un chat desde «Enviar mensaje» en un perfil.')}</section></div>`;
}
function renderHistorial() {
  if(!chatDatos)return '';
  return `${chatDatos.hayAnteriores?boton('chat-anteriores','↑ Ver mensajes anteriores'):''}${chatDatos.mensajes.map(m=>`<article class="mensaje ${m.emisor_id===sesion.id?'mio':''}"><small>${m.emisor_id===sesion.id?'Vos':escapar(chatDatos.persona.nombre)} · ${new Date(m.creado).toLocaleString('es-AR')}</small><p>${escapar(m.cuerpo)}</p></article>`).join('')||'<p class="ayuda">Este chat todavía no tiene mensajes. Podés escribir el primero.</p>'}`;
}
async function cargarChat(id,completo=false,forzarAbajo=false) {
  const cuenta=sesion?.id;
  const datos=await api('/chat/'+id);
  if(sesion?.id!==cuenta||paginaActual!=='panel'||tab!=='mensajes'||chatActivo!==id)return;
  const nuevo=completo||!chatDatos||chatDatos.persona.id!==id;
  if(nuevo)chatDatos=datos;
  else {
    const previos=chatDatos.mensajes,ids=new Set(datos.mensajes.map(m=>m.id));
    if(previos.length&&datos.mensajes.length&&!previos.some(m=>ids.has(m.id))&&datos.mensajes[0].id>previos.at(-1).id&&datos.hayAnteriores)chatDatos=datos;
    else chatDatos={...chatDatos,persona:datos.persona,mensajes:[...new Map([...previos,...datos.mensajes].map(m=>[m.id,m])).values()].sort((a,b)=>a.id-b.id)};
  }
  const contenedor=$('#chat-detalle');if(!contenedor)return;
  if(nuevo)contenedor.innerHTML=`<header class="chat-cabecera">${avatar(chatDatos.persona)}<div><h3>${escapar(chatDatos.persona.nombre)}</h3><small>Solo vos y esta persona pueden leer esta conversación.</small></div></header><div id="chat-historial" class="chat-historial" role="log" aria-live="polite" aria-relevant="additions"></div><form data-form="chat" data-id="${id}" class="chat-form"><label>Mensaje para ${escapar(chatDatos.persona.nombre)}<textarea name="cuerpo" required maxlength="2000" placeholder="Escribí tu mensaje…"></textarea></label><p class="form-error" hidden role="alert"></p><button type="submit" class="boton">Enviar mensaje</button></form>`;
  const historial=$('#chat-historial');
  const alFinal=historial.scrollHeight-historial.scrollTop-historial.clientHeight<70;
  const html=renderHistorial();
  if(historial.innerHTML!==html) {historial.innerHTML=html;if(nuevo||forzarAbajo||alFinal)historial.scrollTop=historial.scrollHeight;}
  await api('/chat/'+id+'/leido',{method:'POST',body:{hasta:chatDatos.mensajes.at(-1)?.id||0}});
}
async function cargarAnteriores() {
  if(!chatDatos?.mensajes.length||!chatDatos.hayAnteriores)return;
  const id=chatActivo,cuenta=sesion?.id;
  const datos=await api('/chat/'+id+'?antes='+chatDatos.mensajes[0].id);
  if(sesion?.id!==cuenta||chatActivo!==id||!$('#chat-historial'))return;
  chatDatos={...chatDatos,hayAnteriores:datos.hayAnteriores,mensajes:[...datos.mensajes,...chatDatos.mensajes]};
  const historial=$('#chat-historial'),altura=historial.scrollHeight;
  historial.innerHTML=renderHistorial();historial.scrollTop=historial.scrollHeight-altura;
}
async function actualizarNovedades(forzar=false) {
  if(!sesion||document.hidden||actualizando)return;
  actualizando=true;
  const cuenta=sesion.id;
  try {
    const n=await api('/notificaciones');
    if(sesion?.id!==cuenta)return;
    if(cuentaAvisos!==cuenta){if(cuentaAvisos!==null){chatActivo=null;chatDatos=null;}cuentaAvisos=cuenta;}
    const cambio=JSON.stringify(avisos)!==JSON.stringify(n);
    avisos=n;sesion.patitas=n.patitas;
    const badge=$('#contador-avisos');if(badge)badge.textContent=n.noLeidas;
    const patitas=$('.usuario .patitas');if(patitas)patitas.textContent=`🐾 ${n.patitas} PATITAS`;
    if($('#lista-avisos')&&(cambio||forzar))$('#lista-avisos').innerHTML=renderAvisos();
    if(paginaActual==='panel'&&tab==='mensajes') {
      const nuevas=await api('/conversaciones');if(sesion?.id!==cuenta)return;
      conversaciones=nuevas;
      const lista=$('#conversaciones'),htmlLista=renderConversaciones();
      if(lista&&lista.innerHTML!==htmlLista)lista.innerHTML=htmlLista;
      if(chatActivo)await cargarChat(chatActivo);
    }
    if(paginaActual==='panel'&&tab==='correos'&&!$('#modal').open) {
      const correos=await api('/panel');
      if(sesion?.id===cuenta&&paginaActual==='panel'&&tab==='correos'&&panel&&JSON.stringify(correos.correos)!==JSON.stringify(panel.correos)) {
        panel=correos;$('#contenido').innerHTML=renderPanel();
      }
    }
  } catch(e) {if(forzar)avisar(e.message,true);}
  finally{actualizando=false;}
}
async function abrirAviso(id) {
  const n=avisos.datos.find(x=>x.id===id);if(!n)return;
  await api('/notificaciones/'+id+'/leer',{method:'POST',body:{}});
  if(n.tipo==='mensaje') {chatActivo=n.referencia;chatDatos=null;tab='mensajes';await navegar('panel');}
  else if(n.tipo==='resena')await navegar('perfil',n.referencia);
  else {tab=n.tipo==='donacion'?'donaciones':n.tipo==='solicitud'?'solicitudes':'correos';await navegar('panel');}
  await actualizarNovedades(true);
}
setInterval(()=>actualizarNovedades(),5000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)actualizarNovedades();});
(async()=>{try{const r=await api('/yo');sesion=r.usuario;csrf=r.csrf;if(!sesion.foto){tab='perfil';await navegar('panel');}else await navegar('mascotas');}catch{mostrarAcceso();}})();


