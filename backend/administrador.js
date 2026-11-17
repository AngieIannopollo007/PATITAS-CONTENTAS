const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
const { configuracionPostgres } = require('./base');
const { correoDemo, email } = require('./seguridad');

async function promoverAdministrador(conexion, valor) {
  const correo = email(valor);
  if (correoDemo(correo)) throw Error('Elegí una cuenta propia para moderación.');
  const db = new Client({ ...conexion, connectionTimeoutMillis: 5000 });
  try {
    await db.connect();
    const { rows: [cuenta] } = await db.query(
      `WITH cuenta AS (
        UPDATE usuarios SET tipo='admin' WHERE email=$1 AND tipo IN ('adoptante','admin') RETURNING id,email
      ), revocadas AS (
        DELETE FROM sesiones USING cuenta WHERE sesiones.usuario_id=cuenta.id
      ) SELECT email FROM cuenta`,
      [correo],
    );
    if (!cuenta) throw Error('Primero registrá una cuenta de adoptante con ese correo.');
    return cuenta.email;
  } finally {
    await db.end();
  }
}

if (require.main === module) {
  async function ejecutar() {
    if (process.argv.length !== 3) throw Error('Uso: npm run admin:promover -- tu-correo@ejemplo.com');
    const env = path.join(__dirname, '..', '.env');
    if (fs.existsSync(env)) process.loadEnvFile(env);
    const correo = await promoverAdministrador(configuracionPostgres(), process.argv[2]);
    console.log(`Cuenta de moderación habilitada para ${correo}.`);
  }
  ejecutar().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { promoverAdministrador };
