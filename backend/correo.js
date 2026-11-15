// Gmail SMTP con TLS directo (puerto 465). Sin paquetes externos.
// Las notificaciones se guardan antes de intentar enviarlas.
const tls = require('node:tls');
const { randomUUID } = require('node:crypto');

function enviarGmail(config, correo, conectar = tls.connect) {
  return new Promise((resolve, reject) => {
    const socket = conectar({ host:'smtp.gmail.com',port:465,servername:'smtp.gmail.com',rejectUnauthorized:true });
    let buffer = '', paso = 0, terminado = false;
    const terminar = error => {
      if (terminado) return;
      terminado = true; socket.destroy();
      if (error) reject(error); else resolve();
    };
    const comando = linea => socket.write(linea + '\r\n');
    socket.setTimeout(20000, () => terminar(new Error('El servidor de correo no respondió a tiempo.')));
    socket.on('error', () => terminar(new Error('No se pudo conectar con Gmail.')));
    socket.on('close', () => { if (!terminado) terminar(new Error('Gmail cerró la conexión.')); });
    const pasos = [
      [220, () => comando('EHLO patitas.local')],
      [250, () => comando('AUTH LOGIN')],
      [334, () => comando(Buffer.from(config.usuario).toString('base64'))],
      [334, () => comando(Buffer.from(config.clave).toString('base64'))],
      [235, () => comando(`MAIL FROM:<${config.usuario}>`)],
      [250, () => comando(`RCPT TO:<${correo.destinatario}>`)],
      [250, () => comando('DATA')],
      [354, () => {
        const asunto = Buffer.from(correo.asunto.replace(/[\r\n]/g,' ')).toString('base64');
        const cuerpo = Buffer.from(correo.cuerpo,'utf8').toString('base64').match(/.{1,76}/g)?.join('\r\n') || '';
        comando([`From: PATITAS <${config.usuario}>`,`To: <${correo.destinatario}>`,`Subject: =?UTF-8?B?${asunto}?=`,
          `Date: ${new Date().toUTCString()}`,`Message-ID: <${randomUUID()}@patitas.local>`,
          'MIME-Version: 1.0','Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',cuerpo,'.'].join('\r\n'));
      }],
      [250, () => { comando('QUIT'); terminar(); }],
    ];
    socket.on('data', trozo => {
      buffer += trozo.toString('utf8');
      if (buffer.length > 65536) return terminar(new Error('Respuesta SMTP demasiado grande.'));
      while (buffer.includes('\r\n') && !terminado) {
        const fin = buffer.indexOf('\r\n'), linea = buffer.slice(0,fin);
        buffer = buffer.slice(fin+2);
        const respuesta = /^(\d{3})([ -])/.exec(linea);
        if (!respuesta || respuesta[2] === '-') continue;
        const actual = pasos[paso];
        if (!actual || Number(respuesta[1]) !== actual[0]) return terminar(new Error('Gmail rechazó el envío. Revisá la cuenta y su contraseña de aplicación.'));
        paso++; actual[1]();
      }
    });
  });
}
function crearBandeja(repo, config, transporte = enviarGmail) {
  let ocupado = false;
  // Si una ejecución anterior se interrumpió, el estado es incierto: no reenviar solo.
  repo.ejecutar("UPDATE correos SET estado='error',error='Envío interrumpido; comprobar antes de reintentar.' WHERE estado='enviando'");
  return async function procesar() {
    if (ocupado || !config?.usuario || !config?.clave) return;
    ocupado = true;
    try {
      const pendientes = repo.todos("SELECT * FROM correos WHERE estado='pendiente' ORDER BY id LIMIT 5");
      for (const c of pendientes) {
        repo.ejecutar("UPDATE correos SET estado='enviando',intentos=intentos+1 WHERE id=?",c.id);
        try { await transporte(config,c); repo.ejecutar("UPDATE correos SET estado='enviado',error='' WHERE id=?",c.id); }
        catch { repo.ejecutar("UPDATE correos SET estado='error',error='No se pudo enviar. Revisá Gmail y reintentá desde la app.' WHERE id=?",c.id); }
      }
    } finally { ocupado=false; }
  };
}
module.exports = { enviarGmail, crearBandeja };
