const fs = require('node:fs/promises');
const path = require('node:path');
const { Pool, types } = require('pg');
const { proteger } = require('./seguridad');

function configuracionPostgres(env = process.env) {
  const connectionString = env.DATABASE_URL?.trim();
  if (connectionString) {
    const url = URL.parse(connectionString);
    if (!url || !['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname) {
      throw Error('Revisá DATABASE_URL. Usá una URL de conexión de PostgreSQL.');
    }
    return { connectionString };
  }
  const { PGHOST = '127.0.0.1', PGPORT = '5432', PGDATABASE, PGUSER, PGPASSWORD } = env;
  if (!PGDATABASE || !PGUSER || !PGPASSWORD) {
    throw Error('Configurá DATABASE_URL o PGDATABASE, PGUSER y PGPASSWORD. Seguí la guía de PostgreSQL del README.');
  }
  const port = Number(PGPORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('Revisá PGPORT en .env.');
  return { host: PGHOST, port, database: PGDATABASE, user: PGUSER, password: PGPASSWORD };
}

function repositorio(cliente) {
  return {
    ejecutar: (sql, ...parametros) => cliente.query(sql, parametros),
    async uno(sql, ...parametros) { return (await this.ejecutar(sql, ...parametros)).rows[0]; },
    async todos(sql, ...parametros) { return (await this.ejecutar(sql, ...parametros)).rows; },
  };
}

async function bloquearInicializacion(repo) {
  await repo.ejecutar("SELECT pg_advisory_xact_lock(hashtext('patitas'), hashtext(current_schema()))");
}

async function conectar(conexion) {
  const db = new Pool({ ...conexion, connectionTimeoutMillis: 5000, types: {
    getTypeParser(oid, formato) {
      if (oid !== types.builtins.INT8 || formato === 'binary') return types.getTypeParser(oid, formato);
      return valor => {
        const numero = Number(valor);
        if (!Number.isSafeInteger(numero)) throw new RangeError('El entero de PostgreSQL supera el rango de la aplicación.');
        return numero;
      };
    },
  } });
  db.on('error', error => console.error('Conexión PostgreSQL:', error.code || error.name));
  const repo = repositorio(db);
  repo.transaccion = async fn => {
    const cliente = await db.connect();
    let cerrado;
    try {
      await cliente.query('BEGIN');
      const respuesta = await fn(repositorio(cliente));
      await cliente.query('COMMIT');
      return respuesta;
    } catch (error) {
      try { await cliente.query('ROLLBACK'); } catch (fallo) { cerrado = fallo; }
      throw error;
    } finally {
      cliente.release(cerrado);
    }
  };
  try {
    const esquema = await fs.readFile(path.join(__dirname, 'esquema.sql'), 'utf8');
    await repo.transaccion(async tx => {
      await bloquearInicializacion(tx);
      await tx.ejecutar(esquema);
    });
  } catch (error) {
    await db.end();
    throw error;
  }
  return { db, repo };
}

async function datosDemo(repo) {
  if (await repo.uno('SELECT id FROM usuarios LIMIT 1')) return;
  const clave = await proteger('Patitas2026!');
  await repo.transaccion(async tx => {
    await bloquearInicializacion(tx);
    if (await tx.uno('SELECT id FROM usuarios LIMIT 1')) return;
    const insertar = (nombre, correo, tipo, ciudad, descripcion) => tx.uno(
      'INSERT INTO usuarios(nombre,email,clave,tipo,ciudad,descripcion) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',
      nombre, correo, clave, tipo, ciudad, descripcion);
    const { id: refugio } = await insertar('Refugio Huellitas', 'refugio@patitas.test', 'refugio', 'Buenos Aires', 'Somos un refugio de ejemplo. Rescatamos, cuidamos y buscamos familias con mucho amor para dar.');
    await insertar('Ana Pérez', 'ana@patitas.test', 'adoptante', 'Buenos Aires', 'Tengo ganas de sumar un nuevo integrante a mi familia.');
    await insertar('Administración PATITAS', 'admin@patitas.test', 'admin', '', 'Cuenta local para moderar reseñas.');
    await insertar('Rescatista Sofía', 'sofia@patitas.test', 'particular', 'La Plata', 'Ayudo a animales del barrio a encontrar un hogar.');
    await tx.ejecutar("UPDATE usuarios SET foto='/imagenes/perfil-demo.svg' WHERE email IN ('refugio@patitas.test','ana@patitas.test','admin@patitas.test','sofia@patitas.test')");
    const mascotas = [
      ['Luna','Perro',24,'Hembra','Mediano','Compañera de paseos y experta en siestas al sol. Busca una familia paciente y cariñosa.','Vacunas al día. Castrada.','/imagenes/luna.svg'],
      ['Milo','Gato',12,'Macho','Pequeño','Curioso, tranquilo y muy mimoso. Le encanta mirar por la ventana y dormir cerquita.','Vacunado y desparasitado.','/imagenes/milo.svg'],
      ['Coco','Perro',48,'Macho','Pequeño','Un compañero dulce que disfruta de los paseos cortos y los momentos en familia.','Castrado. Requiere control anual.','/imagenes/coco.svg'],
    ];
    for (const m of mascotas) await tx.ejecutar('INSERT INTO mascotas(responsable_id,nombre,especie,edad_meses,sexo,tamano,descripcion,salud,foto) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)', refugio, ...m);
  });
}
module.exports = { conectar, configuracionPostgres, datosDemo };
