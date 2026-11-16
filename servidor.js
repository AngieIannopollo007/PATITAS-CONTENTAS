// Entrada de la app y configuración de la conexión a PostgreSQL.
const fs=require('node:fs');
const path=require('node:path');
const {crearApp}=require('./backend/app');
const {configuracionPostgres}=require('./backend/base');
async function iniciar() {
  if(Number(process.versions.node.split('.')[0])<24) throw Error('Necesitás Node.js 24 o superior.');
  if(fs.existsSync(path.join(__dirname,'.env'))) process.loadEnvFile(path.join(__dirname,'.env'));
  const origenPublico=process.env.APP_ORIGIN?.trim();
  if(process.env.NODE_ENV==='production' && !origenPublico) throw Error('Configurá APP_ORIGIN con la URL HTTPS pública de PATITAS.');
  const host=process.env.HOST || (origenPublico ? '0.0.0.0' : '127.0.0.1');
  const puerto=Number(process.env.PORT || 3000);
  if(!Number.isInteger(puerto) || puerto<1 || puerto>65535) throw Error('Revisá PORT. Debe ser un puerto entre 1 y 65535.');
  const usuario=(process.env.GMAIL_USER || '').trim();
  const clave=(process.env.GMAIL_APP_PASSWORD || '').replace(/\s/g,'');
  if(clave && !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(usuario)) throw Error('Revisá GMAIL_USER en .env.');
  const app=await crearApp({
    conexion:configuracionPostgres(), origenPublico, confiarProxy:process.env.TRUST_PROXY==='1',
    demo:process.env.DEMO!=='0', gmail:usuario&&clave?{usuario,clave}:null,
  });
  let envio;
  const timer=setInterval(()=>{
    if (!envio) envio=app.bandeja().catch(e=>console.error('Cola de correo:',e.code || e.name)).finally(()=>{envio=undefined;});
  },5000);timer.unref();
  async function cerrarBase() {
    clearInterval(timer);
    await envio;
    await app.db.end();
  }
  app.servidor.once('error',e=>{
    cerrarBase().catch(error=>console.error(error.message));
    console.error(e.code==='EADDRINUSE'?'El puerto está ocupado. Cerrá la otra ventana de PATITAS y volvé a abrir.':e.message);process.exitCode=1;
  });
  app.servidor.listen(puerto,host,()=>{
    console.log(`🐾 PATITAS está lista en ${origenPublico || `http://127.0.0.1:${puerto}`}`);
    console.log(clave?'Gmail configurado: se procesará la cola de notificaciones.':'Gmail sin configurar: las notificaciones quedan en la bandeja local de la app.');
  });
  const cerrar=()=>{
    clearInterval(timer);
    app.servidor.close(()=>cerrarBase().catch(error=>{console.error(error.message);process.exitCode=1;}));
  };
  process.once('SIGINT',cerrar);
  process.once('SIGTERM',cerrar);
}
iniciar().catch(e=>{console.error(e.message);process.exitCode=1;});
