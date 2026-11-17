// Contraseñas protegidas y validaciones compartidas por las rutas.
const { scrypt, randomBytes, createHash, timingSafeEqual } = require('node:crypto');
const { promisify } = require('node:util');
const derivar = promisify(scrypt);
class ErrorApp extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
function exigir(condicion, mensaje, status = 400) {
  if (!condicion) throw new ErrorApp(status, mensaje);
}
function texto(valor, nombre, max = 200, min = 1) {
  exigir(typeof valor === 'string', `${nombre}: completá el campo.`);
  const limpio = valor.trim();
  exigir(limpio.length >= min && limpio.length <= max, `${nombre}: entre ${min} y ${max} caracteres.`);
  return limpio;
}
function email(valor) {
  const limpio = texto(valor, 'Correo', 254).toLowerCase();
  exigir(/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(limpio), 'Escribí un correo válido.');
  return limpio;
}
const correoDemo = correo => correo.endsWith('@patitas.test');
function entero(valor, nombre, min, max) {
  exigir(Number.isSafeInteger(valor) && valor >= min && valor <= max, `${nombre}: usá un número entero entre ${min} y ${max}.`);
  return valor;
}
function opcion(valor, opciones, nombre) {
  exigir(opciones.includes(valor), `${nombre}: elegí una opción válida.`);
  return valor;
}
async function proteger(password) {
  exigir(typeof password === 'string' && password.length >= 10 && password.length <= 128, 'La contraseña debe tener entre 10 y 128 caracteres.');
  const sal = randomBytes(16).toString('hex');
  const clave = await derivar(password, sal, 64);
  return `${sal}:${clave.toString('hex')}`;
}
async function verificar(password, guardada) {
  if (typeof password !== 'string' || password.length > 128) return false;
  const [sal, hash] = guardada.split(':');
  const clave = await derivar(password, sal, 64);
  return timingSafeEqual(clave, Buffer.from(hash, 'hex'));
}
const token = () => randomBytes(32).toString('hex');
const resumir = valor => createHash('sha256').update(valor).digest('hex');
function validarFoto(valor, nombre='Foto', anterior='', obligatoria=true) {
  if(!valor && !obligatoria) return '';
  exigir(typeof valor === 'string' && valor.length>0,`${nombre}: agregá una foto obligatoria.`);
  // Solo se conservan las ilustraciones demo ya guardadas; no se aceptan como subida nueva.
  if(valor===anterior && /^\/imagenes\/(luna|milo|coco|perfil-demo)\.svg$/.test(valor)) return valor;
  const match=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(valor);
  exigir(match,`${nombre}: usá JPG, PNG o WebP.`);
  const bytes=Buffer.from(match[2],'base64');
  exigir(bytes.length<=512000,`${nombre}: el máximo es 500 KB.`);
  const valida=match[1]==='png' ? bytes.length>=24&&bytes.subarray(0,8).toString('hex')==='89504e470d0a1a0a'
    : match[1]==='jpeg' ? bytes.length>=10&&bytes.subarray(0,3).toString('hex')==='ffd8ff'&&bytes.subarray(-2).toString('hex')==='ffd9'
    : bytes.length>=16&&bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP';
  exigir(valida,`${nombre}: el archivo no parece una imagen válida.`);
  return valor;
}
module.exports = { ErrorApp, exigir, texto, email, correoDemo, entero, opcion, proteger, verificar, token, resumir, validarFoto };
