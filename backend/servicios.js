const { exigir, texto, email, entero, opcion, proteger, verificar, token, resumir, ErrorApp, validarFoto } = require('./seguridad');
const PUBLICO = 'id,nombre,tipo,ciudad,descripcion,contacto_publico,alias_donacion,foto';
const publica = tipo => ['refugio','particular'].includes(tipo);

function crearServicios(r, opciones = {}) {
  const gmail = Boolean(opciones.gmail);
  const buscarUsuario = id => r.uno('SELECT * FROM usuarios WHERE id=?', id);
  const puntos = id => Number(r.uno('SELECT bienvenida FROM usuarios WHERE id=?',id).bienvenida) + Number(r.uno("SELECT COALESCE(SUM(puntos),0) AS total FROM donaciones WHERE donante_id=? AND estado='confirmada'", id).total);
  function perfil(id) {
    const u = r.uno(`SELECT ${PUBLICO} FROM usuarios WHERE id=?`, id);
    exigir(u, 'No encontramos ese perfil.', 404);
    u.patitas = puntos(id);
    const nota = r.uno('SELECT ROUND(AVG(puntuacion),1) AS promedio, COUNT(*) AS cantidad FROM resenas WHERE destinatario_id=? AND oculta=0', id);
    return { ...u, ...nota };
  }
  function privado(id) {
    const u = buscarUsuario(id);
    const { clave, ...datos } = u;
    return { ...datos, patitas: puntos(id) };
  }
  function notificar(id, asunto, cuerpo, tipo='general', referencia=null, mensajeId=null) {
    const u = buscarUsuario(id);
    const correoId=Number(r.ejecutar('INSERT INTO correos(usuario_id,destinatario,asunto,cuerpo,estado) VALUES(?,?,?,?,?)', id, u.email, asunto, cuerpo, gmail ? 'pendiente' : 'local').lastInsertRowid);
    r.ejecutar('INSERT INTO notificaciones(usuario_id,asunto,cuerpo,tipo,referencia,correo_id,mensaje_id) VALUES(?,?,?,?,?,?,?)',id,asunto,cuerpo,tipo,referencia,correoId,mensajeId);
  }
  function sesion(id) {
    const secreto = token(), csrf = token();
    r.ejecutar('DELETE FROM sesiones WHERE vence < ?', Date.now());
    r.ejecutar('INSERT INTO sesiones(token,usuario_id,csrf,vence) VALUES(?,?,?,?)', resumir(secreto), id, csrf, Date.now() + 7 * 86400000);
    return { secreto, csrf, usuario: privado(id) };
  }
  const verMascota = id => {
    const m = r.uno('SELECT m.*,u.nombre AS responsable,u.ciudad FROM mascotas m JOIN usuarios u ON u.id=m.responsable_id WHERE m.id=?', id);
    exigir(m, 'No encontramos esa mascota.', 404); return m;
  };
  function propia(u, id) {
    const m = verMascota(id);
    exigir(m.responsable_id === u.id, 'Solo el responsable puede administrar esta mascota.', 403);
    return m;
  }
  function validarMascota(b, anterior={}) {
    const foto = validarFoto(b.foto,'Foto principal',anterior.foto);
    const extra = validarFoto(b.foto_extra || '','Foto adicional',anterior.foto_extra,false);
    return [texto(b.nombre,'Nombre',80), opcion(b.especie,['Perro','Gato','Otro'],'Especie'),
      texto(b.raza || '', 'Raza',80,0), entero(b.edad_meses,'Edad en meses',0,600),
      opcion(b.sexo,['Hembra','Macho','Sin informar'],'Sexo'), opcion(b.tamano,['Pequeño','Mediano','Grande'],'Tamaño'),
      texto(b.descripcion,'Descripción',1500,10), texto(b.salud || '', 'Salud',1000,0), foto,extra];
  }
  function relacion(u, clase, id) {
    if (clase === 'adopcion') {
      const a = r.uno('SELECT * FROM adopciones WHERE id=?', id);
      exigir(a && [a.responsable_id,a.adoptante_id].includes(u.id), 'No podés calificar esta experiencia.',403);
      return { destinatario: u.id === a.adoptante_id ? a.responsable_id : a.adoptante_id, adopcion: a.id, donacion: null };
    }
    const d = r.uno("SELECT * FROM donaciones WHERE id=? AND estado='confirmada'",id);
    exigir(d && [d.donante_id,d.destinatario_id].includes(u.id), 'Necesitás una donación confirmada para calificar.',403);
    return { destinatario: u.id === d.donante_id ? d.destinatario_id : d.donante_id, adopcion: null, donacion: d.id };
  }
  function interlocutor(u,id) {
    const destino=buscarUsuario(id);
    exigir(destino&&destino.id!==u.id,'Elegí un destinatario válido.',404);
    // Administración participa en sus propios chats de soporte, sin acceso a salas ajenas.
    const ligado=destino.tipo==='admin'||u.tipo==='admin'||publica(destino.tipo)
      ||r.uno('SELECT id FROM mensajes WHERE (emisor_id=? AND receptor_id=?) OR (emisor_id=? AND receptor_id=?) LIMIT 1',u.id,id,id,u.id)
      ||r.uno('SELECT s.id FROM solicitudes s JOIN mascotas m ON m.id=s.mascota_id WHERE s.adoptante_id=? AND m.responsable_id=? LIMIT 1',id,u.id)
      ||r.uno('SELECT id FROM donaciones WHERE donante_id=? AND destinatario_id=? LIMIT 1',id,u.id);
    exigir(ligado,'Primero necesitás un contacto o experiencia con esa persona.',403);
    return {id:destino.id,nombre:destino.nombre,foto:destino.foto,tipo:destino.tipo};
  }
  function novedades(u) {
    return { noLeidas:r.uno('SELECT COUNT(*) AS n FROM notificaciones WHERE usuario_id=? AND leida=0',u.id).n,
      datos:r.todos('SELECT n.*,c.estado AS correo_estado FROM notificaciones n LEFT JOIN correos c ON c.id=n.correo_id WHERE n.usuario_id=? ORDER BY n.id DESC LIMIT 100',u.id),
      patitas:puntos(u.id) };
  }
  return {
    perfil, privado, notificar,
    novedades,
    leerNotificacion(u,id) {
      const cambio=id===null?r.ejecutar('UPDATE notificaciones SET leida=1 WHERE usuario_id=?',u.id)
        :r.ejecutar('UPDATE notificaciones SET leida=1 WHERE id=? AND usuario_id=?',id,u.id);
      exigir(id===null||cambio.changes===1,'Notificación no encontrada.',404);
      return {mensaje:'Notificaciones actualizadas.'};
    },
    conversaciones(u) {
      return r.todos(`WITH ultimos AS (
        SELECT CASE WHEN emisor_id=? THEN receptor_id ELSE emisor_id END AS persona_id,MAX(id) AS ultimo
        FROM mensajes WHERE emisor_id=? OR receptor_id=? GROUP BY persona_id
      ) SELECT u.id,u.nombre,u.foto,m.cuerpo AS ultimo_mensaje,m.creado,
        (SELECT COUNT(*) FROM notificaciones n WHERE n.usuario_id=? AND n.tipo='mensaje' AND n.referencia=u.id AND n.leida=0) AS no_leidos
        FROM ultimos x JOIN usuarios u ON u.id=x.persona_id JOIN mensajes m ON m.id=x.ultimo ORDER BY m.id DESC LIMIT 200`,u.id,u.id,u.id,u.id);
    },
    chat(u,id,antes=Number.MAX_SAFE_INTEGER) {
      const persona=interlocutor(u,id);
      const mensajes=r.todos('SELECT id,emisor_id,receptor_id,cuerpo,creado FROM mensajes WHERE ((emisor_id=? AND receptor_id=?) OR (emisor_id=? AND receptor_id=?)) AND id<? ORDER BY id DESC LIMIT 101',u.id,id,id,u.id,antes);
      return {persona,hayAnteriores:mensajes.length>100,mensajes:mensajes.slice(0,100).reverse()};
    },
    leerChat(u,id,hasta) {
      interlocutor(u,id);
      entero(hasta,'Último mensaje mostrado',0,Number.MAX_SAFE_INTEGER);
      r.ejecutar("UPDATE notificaciones SET leida=1 WHERE usuario_id=? AND tipo='mensaje' AND referencia=? AND mensaje_id<=?",u.id,id,hasta);
      return {mensaje:'Conversación leída.'};
    },
    async registrar(b) {
      const nombre = texto(b.nombre,'Nombre',100,2), correo = email(b.email);
      const tipo = opcion(b.tipo,['adoptante','refugio','particular'],'Tipo de cuenta');
      const ciudad = texto(b.ciudad,'Ciudad',100,2);
      const foto = validarFoto(b.foto,'Foto de perfil');
      exigir(!r.uno('SELECT id FROM usuarios WHERE email=?',correo), 'Ya hay una cuenta con ese correo.',409);
      const clave = await proteger(b.password);
      // La restricción UNIQUE protege también registros simultáneos.
      try {
        const id = Number(r.ejecutar('INSERT INTO usuarios(nombre,email,clave,tipo,ciudad,foto) VALUES(?,?,?,?,?,?)',nombre,correo,clave,tipo,ciudad,foto).lastInsertRowid);
        return sesion(id);
      } catch(error) {
        if (error.message.includes('UNIQUE')) throw new ErrorApp(409,'Ya hay una cuenta con ese correo.');
        throw error;
      }
    },
    async ingresar(b) {
      const correo = email(b.email), u = r.uno('SELECT * FROM usuarios WHERE email=?',correo);
      // Siempre se deriva una clave, incluso si no existe el correo.
      const falsa = '00000000000000000000000000000000:' + '00'.repeat(64);
      const ok = await verificar(b.password, u?.clave || falsa);
      exigir(u && ok, 'El correo o la contraseña no son correctos.',401);
      return sesion(u.id);
    },
    autenticar(secreto) {
      if (!secreto || !/^[a-f0-9]{64}$/.test(secreto)) return null;
      const s = r.uno('SELECT * FROM sesiones WHERE token=? AND vence>?',resumir(secreto),Date.now());
      if (!s) return null;
      return { ...s, usuario: privado(s.usuario_id) };
    },
    salir(secreto) { if (secreto) r.ejecutar('DELETE FROM sesiones WHERE token=?',resumir(secreto)); },
    actualizarPerfil(u,b) {
      const valores = [texto(b.nombre,'Nombre',100,2),texto(b.ciudad,'Ciudad',100,2),texto(b.descripcion || '', 'Descripción',1500,0),
        texto(b.telefono || '', 'Teléfono privado',50,0),texto(b.direccion || '', 'Dirección privada',250,0),
        texto(b.alias_donacion || '', 'Datos de donación',200,0),texto(b.contacto_publico || '', 'Contacto público',200,0)];
      const foto=validarFoto(b.foto===undefined?u.foto:b.foto,'Foto de perfil',u.foto);
      r.ejecutar('UPDATE usuarios SET nombre=?,ciudad=?,descripcion=?,telefono=?,direccion=?,alias_donacion=?,contacto_publico=?,foto=? WHERE id=?',...valores,foto,u.id);
      return privado(u.id);
    },
    listarMascotas(q) {
      const buscar = String(q.get('buscar') || '').slice(0,100), especie = String(q.get('especie') || '');
      const pagina = Math.max(1,Math.min(10000,Number(q.get('pagina')) || 1));
      const where = "m.estado='disponible' AND (?='' OR m.nombre LIKE ? OR u.ciudad LIKE ?) AND (?='' OR m.especie=?)";
      const params = [buscar,`%${buscar}%`,`%${buscar}%`,especie,especie];
      return { datos: r.todos(`SELECT m.*,u.nombre AS responsable,u.ciudad FROM mascotas m JOIN usuarios u ON u.id=m.responsable_id WHERE ${where} ORDER BY m.id DESC LIMIT 24 OFFSET ?`,...params,Math.floor(pagina-1)*24),
        total: r.uno(`SELECT COUNT(*) AS n FROM mascotas m JOIN usuarios u ON u.id=m.responsable_id WHERE ${where}`,...params).n, pagina };
    },
    refugios() { return r.todos(`SELECT ${PUBLICO} FROM usuarios WHERE tipo IN ('refugio','particular') ORDER BY nombre LIMIT 200`).map(u => perfil(u.id)); },
    detallePerfil(u,id) {
      const p = perfil(id);
      // Un adoptante solo es visible para participantes de una experiencia real o administradores.
      if (p.tipo === 'adoptante') {
        const ligado = r.uno('SELECT s.id FROM solicitudes s JOIN mascotas m ON m.id=s.mascota_id WHERE s.adoptante_id=? AND m.responsable_id=? LIMIT 1',id,u.id)
          || r.uno('SELECT id FROM donaciones WHERE donante_id=? AND destinatario_id=? LIMIT 1',id,u.id);
        exigir(u.id === id || u.tipo === 'admin' || ligado, 'Este perfil es privado.',403);
      }
      return { perfil: p, mascotas: r.todos("SELECT * FROM mascotas WHERE responsable_id=? AND estado='disponible' ORDER BY id DESC LIMIT 100",id),
        resenas: r.todos('SELECT r.id,r.puntuacion,r.comentario,r.creado,u.nombre AS autor FROM resenas r JOIN usuarios u ON u.id=r.autor_id WHERE r.destinatario_id=? AND r.oculta=0 ORDER BY r.id DESC LIMIT 50',id) };
    },
    verMascota,
    publicar(u,b) {
      exigir(publica(u.tipo),'Solo refugios o particulares pueden publicar.',403);
      exigir(u.foto,'Completá tu foto de perfil antes de publicar.');
      const id = Number(r.ejecutar('INSERT INTO mascotas(responsable_id,nombre,especie,raza,edad_meses,sexo,tamano,descripcion,salud,foto,foto_extra) VALUES(?,?,?,?,?,?,?,?,?,?,?)',u.id,...validarMascota(b)).lastInsertRowid);
      return verMascota(id);
    },
    editarMascota(u,id,b) {
      const m = propia(u,id);
      exigir(m.estado !== 'adoptada','La mascota ya tiene una adopción registrada.',409);
      r.ejecutar('UPDATE mascotas SET nombre=?,especie=?,raza=?,edad_meses=?,sexo=?,tamano=?,descripcion=?,salud=?,foto=?,foto_extra=? WHERE id=?',...validarMascota(b,m),id);
      return verMascota(id);
    },
    archivar(u,id) {
      const m = propia(u,id);
      exigir(m.estado !== 'adoptada','La mascota ya fue adoptada.',409);
      r.transaccion(() => {
        const pendientes=r.todos("SELECT id,adoptante_id FROM solicitudes WHERE mascota_id=? AND estado IN('pendiente','en_revision')",id);
        r.ejecutar("UPDATE mascotas SET estado='archivada' WHERE id=?",id);
        r.ejecutar("UPDATE solicitudes SET estado='rechazada',observaciones='Publicación retirada por el responsable.' WHERE mascota_id=? AND estado IN('pendiente','en_revision')",id);
        for(const s of pendientes)notificar(s.adoptante_id,'Publicación retirada',`El responsable retiró la publicación de ${m.nombre}. Tu solicitud #${s.id} se cerró.`,'solicitud',s.id);
      });
      return { mensaje:'Publicación retirada. Se conserva el historial.' };
    },
    solicitar(u,b) {
      exigir(u.tipo === 'adoptante','Para solicitar una adopción usá una cuenta de adoptante.',403);
      const m = verMascota(entero(b.mascota_id,'Mascota',1,Number.MAX_SAFE_INTEGER));
      exigir(m.estado === 'disponible','Esta mascota ya no está disponible.',409);
      exigir(m.responsable_id !== u.id,'No podés solicitar tu propia mascota.');
      const datos = [m.id,u.id,texto(b.nombre,'Nombre',100,2),entero(b.edad,'Edad',18,120),email(b.email),
        texto(b.telefono,'Teléfono',50,5),texto(b.direccion,'Dirección',250,5),texto(b.vivienda,'Vivienda',500,5),texto(b.motivo,'Motivo',1500,15)];
      exigir(b.compromiso === true,'Aceptá el compromiso de cuidado.');
      return r.transaccion(() => {
        exigir(!r.uno("SELECT id FROM solicitudes WHERE mascota_id=? AND adoptante_id=? AND estado IN('pendiente','en_revision','aprobada')",m.id,u.id),'Ya tenés una solicitud activa para esta mascota.',409);
        const id = Number(r.ejecutar('INSERT INTO solicitudes(mascota_id,adoptante_id,nombre,edad,email,telefono,direccion,vivienda,motivo,compromiso) VALUES(?,?,?,?,?,?,?,?,?,1)',...datos).lastInsertRowid);
        notificar(m.responsable_id,`Nueva solicitud para ${m.nombre}`,`Recibiste la solicitud #${id} de ${datos[2]} para ${m.nombre}.\nEdad: ${datos[3]}\nCorreo: ${datos[4]}\nTeléfono: ${datos[5]}\nDirección: ${datos[6]}\nVivienda: ${datos[7]}\nMotivo: ${datos[8]}\nCompromiso de cuidado: aceptado.\nIngresá a PATITAS para revisarla. No respondas a este remitente: contactá al solicitante.`,'solicitud',id);
        return { id, estado:'pendiente', correo: gmail ? 'pendiente' : 'local' };
      });
    },
    cambiarSolicitud(u,id,b) {
      const s = r.uno('SELECT s.*,m.responsable_id,m.nombre AS mascota,m.estado AS estado_mascota FROM solicitudes s JOIN mascotas m ON m.id=s.mascota_id WHERE s.id=?',id);
      exigir(s,'Solicitud no encontrada.',404);
      const estado = opcion(b.estado,['en_revision','aprobada','rechazada','cancelada'],'Estado');
      if (estado === 'cancelada') exigir(s.adoptante_id === u.id,'Solo el solicitante puede cancelar.',403);
      else exigir(s.responsable_id === u.id,'No podés administrar esta solicitud.',403);
      exigir(['pendiente','en_revision'].includes(s.estado),'La solicitud ya fue resuelta.',409);
      const obs = texto(b.observaciones || '', 'Observaciones',2000,0);
      return r.transaccion(() => {
        if (estado === 'aprobada') {
          exigir(s.estado_mascota === 'disponible','La mascota ya no está disponible.',409);
          r.ejecutar('INSERT INTO adopciones(solicitud_id,mascota_id,adoptante_id,responsable_id) VALUES(?,?,?,?)',s.id,s.mascota_id,s.adoptante_id,u.id);
          r.ejecutar("UPDATE mascotas SET estado='adoptada' WHERE id=?",s.mascota_id);
          const otras=r.todos("SELECT id,adoptante_id FROM solicitudes WHERE mascota_id=? AND id!=? AND estado IN('pendiente','en_revision')",s.mascota_id,s.id);
          r.ejecutar("UPDATE solicitudes SET estado='rechazada',observaciones='La mascota encontró un hogar.' WHERE mascota_id=? AND id!=? AND estado IN('pendiente','en_revision')",s.mascota_id,s.id);
          for(const otra of otras)notificar(otra.adoptante_id,`${s.mascota} encontró un hogar`,`Tu solicitud #${otra.id} se cerró porque la mascota fue adoptada. Podés conocer otros compañeros en PATITAS.`,'solicitud',otra.id);
        }
        r.ejecutar('UPDATE solicitudes SET estado=?,observaciones=? WHERE id=?',estado,obs,id);
        const receptor=estado==='cancelada'?s.responsable_id:s.adoptante_id;
        notificar(receptor,`Solicitud de ${s.mascota}: ${estado}`,`La solicitud #${id} está ${estado}.\n${obs}\nConsultá el detalle en PATITAS.`,'solicitud',id);
        return { mensaje:'Solicitud actualizada.',estado };
      });
    },
    seguimiento(u,id,b) {
      const a = r.uno('SELECT * FROM adopciones WHERE id=?',id);
      exigir(a && a.responsable_id === u.id,'No podés modificar este seguimiento.',403);
      r.ejecutar('UPDATE adopciones SET seguimiento=? WHERE id=?',texto(b.seguimiento || '', 'Seguimiento',5000,0),id);
      return { mensaje:'Seguimiento guardado.' };
    },
    donar(u,b) {
      exigir(u.tipo !== 'admin','Usá una cuenta de la comunidad para donar.',403);
      const destino = buscarUsuario(entero(b.destinatario_id,'Destinatario',1,Number.MAX_SAFE_INTEGER));
      exigir(destino && publica(destino.tipo),'Elegí un refugio o particular válido.');
      exigir(destino.id !== u.id,'No podés donarte a vos mismo.');
      const tipo = opcion(b.tipo,['Dinero','Alimentos','Medicamentos','Accesorios','Otros'],'Tipo de donación');
      const centavos = tipo === 'Dinero' ? entero(b.centavos,'Importe en centavos',1,100000000) : 0;
      const descripcion=texto(b.descripcion,'Detalle',1000,5);
      const id=r.transaccion(()=>{
        const id=Number(r.ejecutar('INSERT INTO donaciones(donante_id,destinatario_id,tipo,descripcion,centavos) VALUES(?,?,?,?,?)',u.id,destino.id,tipo,descripcion,centavos).lastInsertRowid);
        notificar(destino.id,`Nueva donación de ${u.nombre}`,`${u.nombre} registró una donación de ${tipo}: ${descripcion}.\n${tipo==='Dinero'?`Importe: ARS ${(centavos/100).toFixed(2)}.\n`:''}Coordiná la entrega en el chat y confirmá la recepción en PATITAS. Registrar no significa que ya se haya recibido.`,'donacion',id);
        return id;
      });
      return { id, mensaje:'Colaboración registrada. Coordiná la entrega por mensaje; las PATITAS se suman cuando el destinatario confirma la recepción.' };
    },
    cambiarDonacion(u,id,b) {
      const d = r.uno('SELECT * FROM donaciones WHERE id=?',id);
      exigir(d,'Donación no encontrada.',404);
      const estado = opcion(b.estado,['confirmada','rechazada','cancelada'],'Estado');
      if (estado === 'cancelada') exigir(d.donante_id === u.id,'No podés cancelar esta donación.',403);
      else exigir(d.destinatario_id === u.id,'Solo el destinatario puede confirmar la recepción.',403);
      exigir(d.estado === 'pendiente','La donación ya fue resuelta.',409);
      r.transaccion(()=>{
        const cambio = r.ejecutar("UPDATE donaciones SET estado=?,puntos=? WHERE id=? AND estado='pendiente'",estado,estado === 'confirmada' ? 10 : 0,id);
        exigir(cambio.changes === 1,'La donación ya fue resuelta.',409);
        notificar(estado==='cancelada'?d.destinatario_id:d.donante_id,`Donación ${estado}`,`La donación #${id} de ${d.tipo} está ${estado}.${estado==='confirmada'?' Se sumaron 10 PATITAS al donante.':''}\nConsultá el detalle en PATITAS.`,'donacion',id);
      });
      return { mensaje:estado === 'confirmada' ? 'Recepción confirmada: 10 PATITAS para el donante.' : 'Donación actualizada.' };
    },
    resenar(u,b) {
      const clase = opcion(b.clase,['adopcion','donacion'],'Experiencia');
      const e = relacion(u,clase,entero(b.experiencia_id,'Experiencia',1,Number.MAX_SAFE_INTEGER));
      const puntuacion = entero(b.puntuacion,'Puntuación',1,5), comentario = texto(b.comentario,'Comentario',1000,5);
      const existente = clase === 'adopcion' ? r.uno('SELECT id FROM resenas WHERE autor_id=? AND adopcion_id=?',u.id,e.adopcion) : r.uno('SELECT id FROM resenas WHERE autor_id=? AND donacion_id=?',u.id,e.donacion);
      exigir(!existente,'Ya calificaste esta experiencia.',409);
      const id = r.transaccion(()=>{
        const id=Number(r.ejecutar('INSERT INTO resenas(autor_id,destinatario_id,adopcion_id,donacion_id,puntuacion,comentario) VALUES(?,?,?,?,?,?)',u.id,e.destinatario,e.adopcion,e.donacion,puntuacion,comentario).lastInsertRowid);
        notificar(e.destinatario,'Recibiste una nueva reseña',`${u.nombre} calificó su experiencia con ${puntuacion} estrellas.\n${comentario}\nPodés consultar tu perfil o reportar el comentario desde PATITAS.`,'resena',e.destinatario);
        return id;
      });
      return { id,mensaje:'Reseña publicada. Cualquier usuario puede reportarla para su moderación.' };
    },
    reportar(u,id,b) {
      exigir(r.uno('SELECT id FROM resenas WHERE id=? AND oculta=0',id),'Reseña no encontrada.',404);
      exigir(!r.uno('SELECT id FROM reportes WHERE resena_id=? AND autor_id=?',id,u.id),'Ya reportaste esta reseña.',409);
      r.ejecutar('INSERT INTO reportes(resena_id,autor_id,motivo) VALUES(?,?,?)',id,u.id,texto(b.motivo,'Motivo',500,5));
      return { mensaje:'Reporte enviado a moderación.' };
    },
    moderar(u,id,b) {
      exigir(u.tipo === 'admin','Solo administración puede moderar.',403);
      const reporte = r.uno('SELECT * FROM reportes WHERE id=?',id);
      exigir(reporte,'Reporte no encontrado.',404);
      exigir(typeof b.ocultar === 'boolean','Indicá si corresponde ocultar.');
      r.transaccion(() => {
        if (b.ocultar) r.ejecutar('UPDATE resenas SET oculta=1 WHERE id=?',reporte.resena_id);
        r.ejecutar("UPDATE reportes SET estado='resuelto' WHERE id=?",id);
      });
      return { mensaje:'Reporte revisado.' };
    },
    mensaje(u,b) {
      const destino=interlocutor(u,entero(b.receptor_id,'Destinatario',1,Number.MAX_SAFE_INTEGER));
      const cuerpo=texto(b.cuerpo,'Mensaje',2000,1);
      return r.transaccion(()=>{
        const id=Number(r.ejecutar('INSERT INTO mensajes(emisor_id,receptor_id,cuerpo) VALUES(?,?,?)',u.id,destino.id,cuerpo).lastInsertRowid);
        notificar(destino.id,`Nuevo mensaje de ${u.nombre}`,`${u.nombre} te escribió en el chat privado:\n\n${cuerpo}\n\nIngresá a PATITAS y abrí la conversación con ${u.nombre} para responder. No respondas a este remitente.`,'mensaje',u.id,id);
        return {id,mensaje:'Mensaje enviado.'};
      });
    },
    panel(u) {
      const solicitudes = r.todos('SELECT s.*,m.nombre AS mascota,m.responsable_id,u.nombre AS responsable FROM solicitudes s JOIN mascotas m ON m.id=s.mascota_id JOIN usuarios u ON u.id=m.responsable_id WHERE s.adoptante_id=? OR m.responsable_id=? ORDER BY s.id DESC LIMIT 500',u.id,u.id);
      const adopciones = r.todos('SELECT a.*,m.nombre AS mascota,s.nombre,s.email,s.telefono,s.direccion,s.edad FROM adopciones a JOIN mascotas m ON m.id=a.mascota_id JOIN solicitudes s ON s.id=a.solicitud_id WHERE a.adoptante_id=? OR a.responsable_id=? ORDER BY a.id DESC LIMIT 500',u.id,u.id);
      const donaciones = r.todos('SELECT d.*,u.nombre AS donante,v.nombre AS destinatario FROM donaciones d JOIN usuarios u ON u.id=d.donante_id JOIN usuarios v ON v.id=d.destinatario_id WHERE d.donante_id=? OR d.destinatario_id=? ORDER BY d.id DESC LIMIT 500',u.id,u.id);
      const mensajes = r.todos('SELECT m.*,a.nombre AS emisor,b.nombre AS receptor FROM mensajes m JOIN usuarios a ON a.id=m.emisor_id JOIN usuarios b ON b.id=m.receptor_id WHERE m.emisor_id=? OR m.receptor_id=? ORDER BY m.id DESC LIMIT 200',u.id,u.id);
      const correos = r.todos('SELECT id,asunto,cuerpo,estado,creado FROM correos WHERE usuario_id=? ORDER BY id DESC LIMIT 100',u.id);
      const reportes = u.tipo === 'admin' ? r.todos("SELECT p.*,r.comentario,r.puntuacion FROM reportes p JOIN resenas r ON r.id=p.resena_id WHERE p.estado='pendiente' ORDER BY p.id LIMIT 200") : [];
      return { usuario:privado(u.id), mascotas:r.todos('SELECT * FROM mascotas WHERE responsable_id=? ORDER BY id DESC LIMIT 500',u.id), solicitudes,adopciones,donaciones,mensajes,correos,reportes,
        resenas:r.todos('SELECT adopcion_id,donacion_id FROM resenas WHERE autor_id=?',u.id), correoConfigurado:gmail };
    },
    reintentarCorreo(u,id) {
      exigir(gmail,'Primero configurá Gmail en .env.');
      const c = r.uno('SELECT * FROM correos WHERE id=? AND usuario_id=?',id,u.id);
      exigir(c,'Correo no encontrado.',404);
      exigir(['local','error'].includes(c.estado),'El correo ya está enviado o en proceso.',409);
      r.ejecutar("UPDATE correos SET estado='pendiente',error='' WHERE id=?",id);
      return { mensaje:'Correo puesto en cola.' };
    },
  };
}
module.exports = { crearServicios, publica };
