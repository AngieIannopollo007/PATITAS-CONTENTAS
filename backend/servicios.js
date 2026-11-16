const { exigir, texto, email, correoDemo, entero, opcion, proteger, verificar, token, resumir, validarFoto } = require('./seguridad');
const PUBLICO = 'id,nombre,tipo,ciudad,descripcion,contacto_publico,alias_donacion,foto';
const publica = tipo => ['refugio','particular'].includes(tipo);

function crearServicios(r, opciones = {}) {
  const gmail = Boolean(opciones.gmail);
  const demoBloqueado = correo => opciones.publico && correoDemo(correo);
  const buscarUsuario = (id, consulta = r) => consulta.uno('SELECT * FROM usuarios WHERE id=$1', id);
  async function puntos(id, consulta = r) {
    const fila = await consulta.uno("SELECT bienvenida + COALESCE((SELECT SUM(puntos) FROM donaciones WHERE donante_id=$1 AND estado='confirmada'),0) AS total FROM usuarios WHERE id=$1", id);
    return fila.total;
  }
  async function perfil(id) {
    const u = await r.uno(`SELECT ${PUBLICO} FROM usuarios WHERE id=$1`, id);
    exigir(u, 'No encontramos ese perfil.', 404);
    u.patitas = await puntos(id);
    const nota = await r.uno('SELECT ROUND(AVG(puntuacion),1)::double precision AS promedio, COUNT(*) AS cantidad FROM resenas WHERE destinatario_id=$1 AND oculta=0', id);
    return { ...u, ...nota };
  }
  async function privado(id, consulta = r) {
    const u = await buscarUsuario(id,consulta);
    const { clave, ...datos } = u;
    return { ...datos, patitas: await puntos(id,consulta) };
  }
  async function notificar(tx,id, asunto, cuerpo, tipo='general', referencia=null, mensajeId=null) {
    const u = await tx.uno('SELECT email FROM usuarios WHERE id=$1',id);
    const correoId=(await tx.uno('INSERT INTO correos(usuario_id,destinatario,asunto,cuerpo,estado) VALUES($1,$2,$3,$4,$5) RETURNING id', id, u.email, asunto, cuerpo, gmail ? 'pendiente' : 'local')).id;
    await tx.ejecutar('INSERT INTO notificaciones(usuario_id,asunto,cuerpo,tipo,referencia,correo_id,mensaje_id) VALUES($1,$2,$3,$4,$5,$6,$7)',id,asunto,cuerpo,tipo,referencia,correoId,mensajeId);
  }
  async function sesion(tx,id) {
    const secreto = token(), csrf = token();
    await tx.ejecutar('DELETE FROM sesiones WHERE vence < $1', Date.now());
    await tx.ejecutar('INSERT INTO sesiones(token,usuario_id,csrf,vence) VALUES($1,$2,$3,$4)', resumir(secreto), id, csrf, Date.now() + 7 * 86400000);
    return { secreto, csrf, usuario: await privado(id,tx) };
  }
  async function verMascota(id, tx) {
    const bloqueo = tx ? ' FOR NO KEY UPDATE OF m' : '';
    const m = await (tx || r).uno('SELECT m.*,u.nombre AS responsable,u.ciudad FROM mascotas m JOIN usuarios u ON u.id=m.responsable_id WHERE m.id=$1'+bloqueo, id);
    exigir(m, 'No encontramos esa mascota.', 404); return m;
  }
  async function propia(u, id, tx) {
    const m = await verMascota(id,tx);
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
  async function relacion(u, clase, id) {
    if (clase === 'adopcion') {
      const a = await r.uno('SELECT * FROM adopciones WHERE id=$1', id);
      exigir(a && [a.responsable_id,a.adoptante_id].includes(u.id), 'No podés calificar esta experiencia.',403);
      return { destinatario: u.id === a.adoptante_id ? a.responsable_id : a.adoptante_id, adopcion: a.id, donacion: null };
    }
    const d = await r.uno("SELECT * FROM donaciones WHERE id=$1 AND estado='confirmada'",id);
    exigir(d && [d.donante_id,d.destinatario_id].includes(u.id), 'Necesitás una donación confirmada para calificar.',403);
    return { destinatario: u.id === d.donante_id ? d.destinatario_id : d.donante_id, adopcion: null, donacion: d.id };
  }
  async function interlocutor(u,id) {
    const destino=await buscarUsuario(id);
    exigir(destino&&destino.id!==u.id,'Elegí un destinatario válido.',404);
    // Administración participa en sus propios chats de soporte, sin acceso a salas ajenas.
    const ligado=destino.tipo==='admin'||u.tipo==='admin'||publica(destino.tipo)
      ||await r.uno('SELECT id FROM mensajes WHERE (emisor_id=$1 AND receptor_id=$2) OR (emisor_id=$2 AND receptor_id=$1) LIMIT 1',u.id,id)
      ||await r.uno('SELECT s.id FROM solicitudes s JOIN mascotas m ON m.id=s.mascota_id WHERE s.adoptante_id=$1 AND m.responsable_id=$2 LIMIT 1',id,u.id)
      ||await r.uno('SELECT id FROM donaciones WHERE donante_id=$1 AND destinatario_id=$2 LIMIT 1',id,u.id);
    exigir(ligado,'Primero necesitás un contacto o experiencia con esa persona.',403);
    return {id:destino.id,nombre:destino.nombre,foto:destino.foto,tipo:destino.tipo};
  }
  async function novedades(u) {
    return { noLeidas:(await r.uno('SELECT COUNT(*) AS n FROM notificaciones WHERE usuario_id=$1 AND leida=0',u.id)).n,
      datos:await r.todos('SELECT n.*,c.estado AS correo_estado FROM notificaciones n LEFT JOIN correos c ON c.id=n.correo_id WHERE n.usuario_id=$1 ORDER BY n.id DESC LIMIT 100',u.id),
      patitas:await puntos(u.id) };
  }
  return {
    perfil, privado,
    novedades,
    async leerNotificacion(u,id) {
      const cambio=id===null?await r.ejecutar('UPDATE notificaciones SET leida=1 WHERE usuario_id=$1',u.id)
        :await r.ejecutar('UPDATE notificaciones SET leida=1 WHERE id=$1 AND usuario_id=$2',id,u.id);
      exigir(id===null||cambio.rowCount===1,'Notificación no encontrada.',404);
      return {mensaje:'Notificaciones actualizadas.'};
    },
    conversaciones(u) {
      return r.todos(`WITH ultimos AS (
        SELECT CASE WHEN emisor_id=$1 THEN receptor_id ELSE emisor_id END AS persona_id,MAX(id) AS ultimo
        FROM mensajes WHERE emisor_id=$2 OR receptor_id=$3 GROUP BY persona_id
      ) SELECT u.id,u.nombre,u.foto,m.cuerpo AS ultimo_mensaje,m.creado,
        (SELECT COUNT(*) FROM notificaciones n WHERE n.usuario_id=$4 AND n.tipo='mensaje' AND n.referencia=u.id AND n.leida=0) AS no_leidos
        FROM ultimos x JOIN usuarios u ON u.id=x.persona_id JOIN mensajes m ON m.id=x.ultimo ORDER BY m.id DESC LIMIT 200`,u.id,u.id,u.id,u.id);
    },
    async chat(u,id,antes=Number.MAX_SAFE_INTEGER) {
      const persona=await interlocutor(u,id);
      const mensajes=await r.todos('SELECT id,emisor_id,receptor_id,cuerpo,creado FROM mensajes WHERE ((emisor_id=$1 AND receptor_id=$2) OR (emisor_id=$2 AND receptor_id=$1)) AND id<$3 ORDER BY id DESC LIMIT 101',u.id,id,antes);
      return {persona,hayAnteriores:mensajes.length>100,mensajes:mensajes.slice(0,100).reverse()};
    },
    async leerChat(u,id,hasta) {
      await interlocutor(u,id);
      entero(hasta,'Último mensaje mostrado',0,Number.MAX_SAFE_INTEGER);
      await r.ejecutar("UPDATE notificaciones SET leida=1 WHERE usuario_id=$1 AND tipo='mensaje' AND referencia=$2 AND mensaje_id<=$3",u.id,id,hasta);
      return {mensaje:'Conversación leída.'};
    },
    async registrar(b) {
      const nombre = texto(b.nombre,'Nombre',100,2), correo = email(b.email);
      exigir(!demoBloqueado(correo),'Usá un correo propio para crear tu cuenta.');
      const tipo = opcion(b.tipo,['adoptante','refugio','particular'],'Tipo de cuenta');
      const ciudad = texto(b.ciudad,'Ciudad',100,2);
      const foto = validarFoto(b.foto,'Foto de perfil');
      exigir(!await r.uno('SELECT id FROM usuarios WHERE email=$1',correo), 'Ya hay una cuenta con ese correo.',409);
      const clave = await proteger(b.password);
      // La restricción UNIQUE protege también registros simultáneos.
      return r.transaccion(async tx => {
        const nuevo = await tx.uno('INSERT INTO usuarios(nombre,email,clave,tipo,ciudad,foto) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT (email) DO NOTHING RETURNING id',nombre,correo,clave,tipo,ciudad,foto);
        exigir(nuevo,'Ya hay una cuenta con ese correo.',409);
        return sesion(tx,nuevo.id);
      });
    },
    async ingresar(b) {
      const correo = email(b.email);
      const u = demoBloqueado(correo) ? null : await r.uno('SELECT * FROM usuarios WHERE email=$1',correo);
      // Siempre se deriva una clave, incluso si no existe el correo.
      const falsa = '00000000000000000000000000000000:' + '00'.repeat(64);
      const ok = await verificar(b.password, u?.clave || falsa);
      exigir(u && ok, 'El correo o la contraseña no son correctos.',401);
      return r.transaccion(tx => sesion(tx,u.id));
    },
    async autenticar(secreto) {
      if (!secreto || !/^[a-f0-9]{64}$/.test(secreto)) return null;
      const s = await r.uno('SELECT * FROM sesiones WHERE token=$1 AND vence>$2',resumir(secreto),Date.now());
      if (!s) return null;
      const usuario = await privado(s.usuario_id);
      if (demoBloqueado(usuario.email)) return null;
      return { ...s, usuario };
    },
    async salir(secreto) { if (secreto) await r.ejecutar('DELETE FROM sesiones WHERE token=$1',resumir(secreto)); },
    async actualizarPerfil(u,b) {
      const valores = [texto(b.nombre,'Nombre',100,2),texto(b.ciudad,'Ciudad',100,2),texto(b.descripcion || '', 'Descripción',1500,0),
        texto(b.telefono || '', 'Teléfono privado',50,0),texto(b.direccion || '', 'Dirección privada',250,0),
        texto(b.alias_donacion || '', 'Datos de donación',200,0),texto(b.contacto_publico || '', 'Contacto público',200,0)];
      const foto=validarFoto(b.foto===undefined?u.foto:b.foto,'Foto de perfil',u.foto);
      await r.ejecutar('UPDATE usuarios SET nombre=$1,ciudad=$2,descripcion=$3,telefono=$4,direccion=$5,alias_donacion=$6,contacto_publico=$7,foto=$8 WHERE id=$9',...valores,foto,u.id);
      return privado(u.id);
    },
    async listarMascotas(q) {
      const buscar = String(q.get('buscar') || '').slice(0,100), especie = String(q.get('especie') || '');
      const pagina = Math.max(1,Math.min(10000,Number(q.get('pagina')) || 1));
      const where = "m.estado='disponible' AND ($1='' OR m.nombre ILIKE $2 ESCAPE '' OR u.ciudad ILIKE $2 ESCAPE '') AND ($3='' OR m.especie=$3)";
      const params = [buscar,`%${buscar}%`,especie];
      return { datos: await r.todos(`SELECT m.*,u.nombre AS responsable,u.ciudad FROM mascotas m JOIN usuarios u ON u.id=m.responsable_id WHERE ${where} ORDER BY m.id DESC LIMIT 24 OFFSET $4`,...params,Math.floor(pagina-1)*24),
        total: (await r.uno(`SELECT COUNT(*) AS n FROM mascotas m JOIN usuarios u ON u.id=m.responsable_id WHERE ${where}`,...params)).n, pagina };
    },
    async refugios() {
      const usuarios = await r.todos("SELECT id FROM usuarios WHERE tipo IN ('refugio','particular') ORDER BY nombre LIMIT 200");
      return Promise.all(usuarios.map(u => perfil(u.id)));
    },
    async detallePerfil(u,id) {
      const p = await perfil(id);
      // Un adoptante solo es visible para participantes de una experiencia real o administradores.
      if (p.tipo === 'adoptante') {
        const ligado = await r.uno('SELECT s.id FROM solicitudes s JOIN mascotas m ON m.id=s.mascota_id WHERE s.adoptante_id=$1 AND m.responsable_id=$2 LIMIT 1',id,u.id)
          || await r.uno('SELECT id FROM donaciones WHERE donante_id=$1 AND destinatario_id=$2 LIMIT 1',id,u.id);
        exigir(u.id === id || u.tipo === 'admin' || ligado, 'Este perfil es privado.',403);
      }
      return { perfil: p, mascotas: await r.todos("SELECT * FROM mascotas WHERE responsable_id=$1 AND estado='disponible' ORDER BY id DESC LIMIT 100",id),
        resenas: await r.todos('SELECT r.id,r.puntuacion,r.comentario,r.creado,u.nombre AS autor FROM resenas r JOIN usuarios u ON u.id=r.autor_id WHERE r.destinatario_id=$1 AND r.oculta=0 ORDER BY r.id DESC LIMIT 50',id) };
    },
    verMascota,
    async publicar(u,b) {
      exigir(publica(u.tipo),'Solo refugios o particulares pueden publicar.',403);
      exigir(u.foto,'Completá tu foto de perfil antes de publicar.');
      const id = (await r.uno('INSERT INTO mascotas(responsable_id,nombre,especie,raza,edad_meses,sexo,tamano,descripcion,salud,foto,foto_extra) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id',u.id,...validarMascota(b))).id;
      return verMascota(id);
    },
    async editarMascota(u,id,b) {
      return r.transaccion(async tx => {
        const m = await propia(u,id,tx);
        exigir(m.estado !== 'adoptada','La mascota ya tiene una adopción registrada.',409);
        await tx.ejecutar('UPDATE mascotas SET nombre=$1,especie=$2,raza=$3,edad_meses=$4,sexo=$5,tamano=$6,descripcion=$7,salud=$8,foto=$9,foto_extra=$10 WHERE id=$11',...validarMascota(b,m),id);
        return verMascota(id,tx);
      });
    },
    async archivar(u,id) {
      await r.transaccion(async tx => {
        const m = await propia(u,id,tx);
        exigir(m.estado !== 'adoptada','La mascota ya fue adoptada.',409);
        const pendientes=await tx.todos("SELECT id,adoptante_id FROM solicitudes WHERE mascota_id=$1 AND estado IN('pendiente','en_revision')",id);
        await tx.ejecutar("UPDATE mascotas SET estado='archivada' WHERE id=$1",id);
        await tx.ejecutar("UPDATE solicitudes SET estado='rechazada',observaciones='Publicación retirada por el responsable.' WHERE mascota_id=$1 AND estado IN('pendiente','en_revision')",id);
        for(const s of pendientes)await notificar(tx,s.adoptante_id,'Publicación retirada',`El responsable retiró la publicación de ${m.nombre}. Tu solicitud #${s.id} se cerró.`,'solicitud',s.id);
      });
      return { mensaje:'Publicación retirada. Se conserva el historial.' };
    },
    async solicitar(u,b) {
      exigir(u.tipo === 'adoptante','Para solicitar una adopción usá una cuenta de adoptante.',403);
      const mascotaId = entero(b.mascota_id,'Mascota',1,Number.MAX_SAFE_INTEGER);
      return r.transaccion(async tx => {
        const m = await verMascota(mascotaId,tx);
        exigir(m.estado === 'disponible','Esta mascota ya no está disponible.',409);
        exigir(m.responsable_id !== u.id,'No podés solicitar tu propia mascota.');
        const datos = [mascotaId,u.id,texto(b.nombre,'Nombre',100,2),entero(b.edad,'Edad',18,120),email(b.email),
          texto(b.telefono,'Teléfono',50,5),texto(b.direccion,'Dirección',250,5),texto(b.vivienda,'Vivienda',500,5),texto(b.motivo,'Motivo',1500,15)];
        exigir(b.compromiso === true,'Aceptá el compromiso de cuidado.');
        exigir(!await tx.uno("SELECT id FROM solicitudes WHERE mascota_id=$1 AND adoptante_id=$2 AND estado IN('pendiente','en_revision','aprobada')",m.id,u.id),'Ya tenés una solicitud activa para esta mascota.',409);
        const id = (await tx.uno('INSERT INTO solicitudes(mascota_id,adoptante_id,nombre,edad,email,telefono,direccion,vivienda,motivo,compromiso) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,1) RETURNING id',...datos)).id;
        await notificar(tx,m.responsable_id,`Nueva solicitud para ${m.nombre}`,`Recibiste la solicitud #${id} de ${datos[2]} para ${m.nombre}.\nEdad: ${datos[3]}\nCorreo: ${datos[4]}\nTeléfono: ${datos[5]}\nDirección: ${datos[6]}\nVivienda: ${datos[7]}\nMotivo: ${datos[8]}\nCompromiso de cuidado: aceptado.\nIngresá a PATITAS para revisarla. No respondas a este remitente: contactá al solicitante.`,'solicitud',id);
        return { id, estado:'pendiente', correo: gmail ? 'pendiente' : 'local' };
      });
    },
    async cambiarSolicitud(u,id,b) {
      return r.transaccion(async tx => {
        const solicitud = await tx.uno('SELECT mascota_id FROM solicitudes WHERE id=$1',id);
        exigir(solicitud,'Solicitud no encontrada.',404);
        // Los cambios de la mascota y sus solicitudes toman el mismo bloqueo.
        const m = await verMascota(solicitud.mascota_id,tx);
        const s = await tx.uno('SELECT * FROM solicitudes WHERE id=$1',id);
        const estado = opcion(b.estado,['en_revision','aprobada','rechazada','cancelada'],'Estado');
        if (estado === 'cancelada') exigir(s.adoptante_id === u.id,'Solo el solicitante puede cancelar.',403);
        else exigir(m.responsable_id === u.id,'No podés administrar esta solicitud.',403);
        exigir(['pendiente','en_revision'].includes(s.estado),'La solicitud ya fue resuelta.',409);
        const obs = texto(b.observaciones || '', 'Observaciones',2000,0);
        if (estado === 'aprobada') {
          exigir(m.estado === 'disponible','La mascota ya no está disponible.',409);
          await tx.ejecutar('INSERT INTO adopciones(solicitud_id,mascota_id,adoptante_id,responsable_id) VALUES($1,$2,$3,$4)',s.id,s.mascota_id,s.adoptante_id,u.id);
          await tx.ejecutar("UPDATE mascotas SET estado='adoptada' WHERE id=$1",s.mascota_id);
          const otras=await tx.todos("SELECT id,adoptante_id FROM solicitudes WHERE mascota_id=$1 AND id!=$2 AND estado IN('pendiente','en_revision')",s.mascota_id,s.id);
          await tx.ejecutar("UPDATE solicitudes SET estado='rechazada',observaciones='La mascota encontró un hogar.' WHERE mascota_id=$1 AND id!=$2 AND estado IN('pendiente','en_revision')",s.mascota_id,s.id);
          for(const otra of otras)await notificar(tx,otra.adoptante_id,`${m.nombre} encontró un hogar`,`Tu solicitud #${otra.id} se cerró porque la mascota fue adoptada. Podés conocer otros compañeros en PATITAS.`,'solicitud',otra.id);
        }
        await tx.ejecutar('UPDATE solicitudes SET estado=$1,observaciones=$2 WHERE id=$3',estado,obs,id);
        const receptor=estado==='cancelada'?m.responsable_id:s.adoptante_id;
        await notificar(tx,receptor,`Solicitud de ${m.nombre}: ${estado}`,`La solicitud #${id} está ${estado}.\n${obs}\nConsultá el detalle en PATITAS.`,'solicitud',id);
        return { mensaje:'Solicitud actualizada.',estado };
      });
    },
    async seguimiento(u,id,b) {
      const a = await r.uno('SELECT * FROM adopciones WHERE id=$1',id);
      exigir(a && a.responsable_id === u.id,'No podés modificar este seguimiento.',403);
      await r.ejecutar('UPDATE adopciones SET seguimiento=$1 WHERE id=$2',texto(b.seguimiento || '', 'Seguimiento',5000,0),id);
      return { mensaje:'Seguimiento guardado.' };
    },
    async donar(u,b) {
      exigir(u.tipo !== 'admin','Usá una cuenta de la comunidad para donar.',403);
      const destino = await buscarUsuario(entero(b.destinatario_id,'Destinatario',1,Number.MAX_SAFE_INTEGER));
      exigir(destino && publica(destino.tipo),'Elegí un refugio o particular válido.');
      exigir(destino.id !== u.id,'No podés donarte a vos mismo.');
      const tipo = opcion(b.tipo,['Dinero','Alimentos','Medicamentos','Accesorios','Otros'],'Tipo de donación');
      const centavos = tipo === 'Dinero' ? entero(b.centavos,'Importe en centavos',1,100000000) : 0;
      const descripcion=texto(b.descripcion,'Detalle',1000,5);
      const id=await r.transaccion(async tx => {
        const id=(await tx.uno('INSERT INTO donaciones(donante_id,destinatario_id,tipo,descripcion,centavos) VALUES($1,$2,$3,$4,$5) RETURNING id',u.id,destino.id,tipo,descripcion,centavos)).id;
        await notificar(tx,destino.id,`Nueva donación de ${u.nombre}`,`${u.nombre} registró una donación de ${tipo}: ${descripcion}.\n${tipo==='Dinero'?`Importe: ARS ${(centavos/100).toFixed(2)}.\n`:''}Coordiná la entrega en el chat y confirmá la recepción en PATITAS. Registrar no significa que ya se haya recibido.`,'donacion',id);
        return id;
      });
      return { id, mensaje:'Colaboración registrada. Coordiná la entrega por mensaje; las PATITAS se suman cuando el destinatario confirma la recepción.' };
    },
    async cambiarDonacion(u,id,b) {
      const d = await r.uno('SELECT * FROM donaciones WHERE id=$1',id);
      exigir(d,'Donación no encontrada.',404);
      const estado = opcion(b.estado,['confirmada','rechazada','cancelada'],'Estado');
      if (estado === 'cancelada') exigir(d.donante_id === u.id,'No podés cancelar esta donación.',403);
      else exigir(d.destinatario_id === u.id,'Solo el destinatario puede confirmar la recepción.',403);
      exigir(d.estado === 'pendiente','La donación ya fue resuelta.',409);
      await r.transaccion(async tx => {
        const cambio = await tx.ejecutar("UPDATE donaciones SET estado=$1,puntos=$2 WHERE id=$3 AND estado='pendiente'",estado,estado === 'confirmada' ? 10 : 0,id);
        exigir(cambio.rowCount === 1,'La donación ya fue resuelta.',409);
        await notificar(tx,estado==='cancelada'?d.destinatario_id:d.donante_id,`Donación ${estado}`,`La donación #${id} de ${d.tipo} está ${estado}.${estado==='confirmada'?' Se sumaron 10 PATITAS al donante.':''}\nConsultá el detalle en PATITAS.`,'donacion',id);
      });
      return { mensaje:estado === 'confirmada' ? 'Recepción confirmada: 10 PATITAS para el donante.' : 'Donación actualizada.' };
    },
    async resenar(u,b) {
      const clase = opcion(b.clase,['adopcion','donacion'],'Experiencia');
      const e = await relacion(u,clase,entero(b.experiencia_id,'Experiencia',1,Number.MAX_SAFE_INTEGER));
      const puntuacion = entero(b.puntuacion,'Puntuación',1,5), comentario = texto(b.comentario,'Comentario',1000,5);
      const id = await r.transaccion(async tx => {
        const nueva=await tx.uno('INSERT INTO resenas(autor_id,destinatario_id,adopcion_id,donacion_id,puntuacion,comentario) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING id',u.id,e.destinatario,e.adopcion,e.donacion,puntuacion,comentario);
        exigir(nueva,'Ya calificaste esta experiencia.',409);
        await notificar(tx,e.destinatario,'Recibiste una nueva reseña',`${u.nombre} calificó su experiencia con ${puntuacion} estrellas.\n${comentario}\nPodés consultar tu perfil o reportar el comentario desde PATITAS.`,'resena',e.destinatario);
        return nueva.id;
      });
      return { id,mensaje:'Reseña publicada. Cualquier usuario puede reportarla para su moderación.' };
    },
    async reportar(u,id,b) {
      exigir(await r.uno('SELECT id FROM resenas WHERE id=$1 AND oculta=0',id),'Reseña no encontrada.',404);
      const cambio=await r.ejecutar('INSERT INTO reportes(resena_id,autor_id,motivo) VALUES($1,$2,$3) ON CONFLICT (resena_id,autor_id) DO NOTHING',id,u.id,texto(b.motivo,'Motivo',500,5));
      exigir(cambio.rowCount===1,'Ya reportaste esta reseña.',409);
      return { mensaje:'Reporte enviado a moderación.' };
    },
    async moderar(u,id,b) {
      exigir(u.tipo === 'admin','Solo administración puede moderar.',403);
      const reporte = await r.uno('SELECT * FROM reportes WHERE id=$1',id);
      exigir(reporte,'Reporte no encontrado.',404);
      exigir(typeof b.ocultar === 'boolean','Indicá si corresponde ocultar.');
      await r.transaccion(async tx => {
        if (b.ocultar) await tx.ejecutar('UPDATE resenas SET oculta=1 WHERE id=$1',reporte.resena_id);
        await tx.ejecutar("UPDATE reportes SET estado='resuelto' WHERE id=$1",id);
      });
      return { mensaje:'Reporte revisado.' };
    },
    async mensaje(u,b) {
      const destino=await interlocutor(u,entero(b.receptor_id,'Destinatario',1,Number.MAX_SAFE_INTEGER));
      const cuerpo=texto(b.cuerpo,'Mensaje',2000,1);
      return r.transaccion(async tx => {
        const id=(await tx.uno('INSERT INTO mensajes(emisor_id,receptor_id,cuerpo) VALUES($1,$2,$3) RETURNING id',u.id,destino.id,cuerpo)).id;
        await notificar(tx,destino.id,`Nuevo mensaje de ${u.nombre}`,`${u.nombre} te escribió en el chat privado:\n\n${cuerpo}\n\nIngresá a PATITAS y abrí la conversación con ${u.nombre} para responder. No respondas a este remitente.`,'mensaje',u.id,id);
        return {id,mensaje:'Mensaje enviado.'};
      });
    },
    async panel(u) {
      const solicitudes = await r.todos('SELECT s.*,m.nombre AS mascota,m.responsable_id,u.nombre AS responsable FROM solicitudes s JOIN mascotas m ON m.id=s.mascota_id JOIN usuarios u ON u.id=m.responsable_id WHERE s.adoptante_id=$1 OR m.responsable_id=$2 ORDER BY s.id DESC LIMIT 500',u.id,u.id);
      const adopciones = await r.todos('SELECT a.*,m.nombre AS mascota,s.nombre,s.email,s.telefono,s.direccion,s.edad FROM adopciones a JOIN mascotas m ON m.id=a.mascota_id JOIN solicitudes s ON s.id=a.solicitud_id WHERE a.adoptante_id=$1 OR a.responsable_id=$2 ORDER BY a.id DESC LIMIT 500',u.id,u.id);
      const donaciones = await r.todos('SELECT d.*,u.nombre AS donante,v.nombre AS destinatario FROM donaciones d JOIN usuarios u ON u.id=d.donante_id JOIN usuarios v ON v.id=d.destinatario_id WHERE d.donante_id=$1 OR d.destinatario_id=$2 ORDER BY d.id DESC LIMIT 500',u.id,u.id);
      const mensajes = await r.todos('SELECT m.*,a.nombre AS emisor,b.nombre AS receptor FROM mensajes m JOIN usuarios a ON a.id=m.emisor_id JOIN usuarios b ON b.id=m.receptor_id WHERE m.emisor_id=$1 OR m.receptor_id=$2 ORDER BY m.id DESC LIMIT 200',u.id,u.id);
      const correos = await r.todos('SELECT id,asunto,cuerpo,estado,creado FROM correos WHERE usuario_id=$1 ORDER BY id DESC LIMIT 100',u.id);
      const reportes = u.tipo === 'admin' ? await r.todos("SELECT p.*,r.comentario,r.puntuacion FROM reportes p JOIN resenas r ON r.id=p.resena_id WHERE p.estado='pendiente' ORDER BY p.id LIMIT 200") : [];
      return { usuario:await privado(u.id), mascotas:await r.todos('SELECT * FROM mascotas WHERE responsable_id=$1 ORDER BY id DESC LIMIT 500',u.id), solicitudes,adopciones,donaciones,mensajes,correos,reportes,
        resenas:await r.todos('SELECT adopcion_id,donacion_id FROM resenas WHERE autor_id=$1',u.id), correoConfigurado:gmail };
    },
    async reintentarCorreo(u,id) {
      exigir(gmail,'Primero configurá Gmail en .env.');
      const c = await r.uno('SELECT * FROM correos WHERE id=$1 AND usuario_id=$2',id,u.id);
      exigir(c,'Correo no encontrado.',404);
      exigir(['local','error'].includes(c.estado),'El correo ya está enviado o en proceso.',409);
      const cambio = await r.ejecutar("UPDATE correos SET estado='pendiente',error='' WHERE id=$1 AND estado IN ('local','error')",id);
      exigir(cambio.rowCount===1,'El correo ya está enviado o en proceso.',409);
      return { mensaje:'Correo puesto en cola.' };
    },
  };
}
module.exports = { crearServicios, publica };
