// Entrada de la app. No requiere npm install ni un programa de base de datos.
const fs=require('node:fs');
const path=require('node:path');
const {crearApp}=require('./backend/app');
async function iniciar() {
  if(Number(process.versions.node.split('.')[0])<24) throw Error('Necesitás Node.js 24 o superior.');
  if(fs.existsSync(path.join(__dirname,'.env'))) process.loadEnvFile(path.join(__dirname,'.env'));
  const usuario=(process.env.GMAIL_USER || '').trim();
  const clave=(process.env.GMAIL_APP_PASSWORD || '').replace(/\s/g,'');
  if(clave && !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(usuario)) throw Error('Revisá GMAIL_USER en .env.');
  const app=await crearApp({archivo:path.join(__dirname,'datos/patitas.sqlite'),demo:process.env.DEMO!=='0',gmail:usuario&&clave?{usuario,clave}:null});
  const puerto=Number(process.env.PORT || 3000);
  const timer=setInterval(()=>{app.bandeja().catch(()=>{});},5000);timer.unref();
  app.servidor.once('error',e=>{
    clearInterval(timer);app.db.close();
    console.error(e.code==='EADDRINUSE'?'El puerto está ocupado. Cerrá la otra ventana de PATITAS y volvé a abrir.':e.message);process.exitCode=1;
  });
  app.servidor.listen(puerto,'127.0.0.1',()=>{
    console.log(`\n🐾 PATITAS está lista: http://127.0.0.1:${puerto}\nDejá esta ventana abierta. Para cerrar: Ctrl+C.\n`);
    console.log(clave?'Gmail configurado: se procesará la cola de notificaciones.':'Gmail sin configurar: las notificaciones quedan en la bandeja local de la app.');
  });
  process.on('SIGINT',()=>{clearInterval(timer);app.servidor.close(()=>{app.db.close();process.exit(0);});});
}
iniciar().catch(e=>{console.error(e.message);process.exitCode=1;});
