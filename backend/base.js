// SQLite guarda todo en un único archivo. Todas las consultas reciben parámetros.
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const { proteger } = require('./seguridad');

function conectar(archivo) {
  if (archivo !== ':memory:') fs.mkdirSync(path.dirname(archivo), { recursive: true });
  const db = new DatabaseSync(archivo);
  db.exec(`
    PRAGMA foreign_keys=ON;
    PRAGMA journal_mode=WAL;
    PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY, nombre TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
      clave TEXT NOT NULL, tipo TEXT NOT NULL CHECK(tipo IN ('adoptante','refugio','particular','admin')),
      ciudad TEXT NOT NULL DEFAULT '', descripcion TEXT NOT NULL DEFAULT '',
      telefono TEXT NOT NULL DEFAULT '', direccion TEXT NOT NULL DEFAULT '',
      alias_donacion TEXT NOT NULL DEFAULT '', contacto_publico TEXT NOT NULL DEFAULT '',
      creado TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE TABLE IF NOT EXISTS sesiones (
      token TEXT PRIMARY KEY, usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
      csrf TEXT NOT NULL, vence INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS mascotas (
      id INTEGER PRIMARY KEY, responsable_id INTEGER NOT NULL REFERENCES usuarios(id),
      nombre TEXT NOT NULL, especie TEXT NOT NULL CHECK(especie IN ('Perro','Gato','Otro')),
      raza TEXT NOT NULL DEFAULT '', edad_meses INTEGER NOT NULL CHECK(edad_meses BETWEEN 0 AND 600),
      sexo TEXT NOT NULL CHECK(sexo IN ('Hembra','Macho','Sin informar')),
      tamano TEXT NOT NULL CHECK(tamano IN ('Pequeño','Mediano','Grande')),
      descripcion TEXT NOT NULL, salud TEXT NOT NULL DEFAULT '', foto TEXT NOT NULL DEFAULT '',
      estado TEXT NOT NULL DEFAULT 'disponible' CHECK(estado IN ('disponible','adoptada','archivada')),
      creado TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE TABLE IF NOT EXISTS solicitudes (
      id INTEGER PRIMARY KEY, mascota_id INTEGER NOT NULL REFERENCES mascotas(id),
      adoptante_id INTEGER NOT NULL REFERENCES usuarios(id), nombre TEXT NOT NULL,
      edad INTEGER NOT NULL CHECK(edad BETWEEN 18 AND 120), email TEXT NOT NULL,
      telefono TEXT NOT NULL, direccion TEXT NOT NULL, vivienda TEXT NOT NULL,
      motivo TEXT NOT NULL, compromiso INTEGER NOT NULL CHECK(compromiso=1),
      estado TEXT NOT NULL DEFAULT 'pendiente' CHECK(estado IN ('pendiente','en_revision','aprobada','rechazada','cancelada')),
      observaciones TEXT NOT NULL DEFAULT '',
      creado TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS solicitud_activa ON solicitudes(mascota_id,adoptante_id)
      WHERE estado IN ('pendiente','en_revision','aprobada');
    CREATE TABLE IF NOT EXISTS adopciones (
      id INTEGER PRIMARY KEY, solicitud_id INTEGER UNIQUE NOT NULL REFERENCES solicitudes(id),
      mascota_id INTEGER UNIQUE NOT NULL REFERENCES mascotas(id),
      adoptante_id INTEGER NOT NULL REFERENCES usuarios(id), responsable_id INTEGER NOT NULL REFERENCES usuarios(id),
      seguimiento TEXT NOT NULL DEFAULT '', fecha TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE TABLE IF NOT EXISTS donaciones (
      id INTEGER PRIMARY KEY, donante_id INTEGER NOT NULL REFERENCES usuarios(id),
      destinatario_id INTEGER NOT NULL REFERENCES usuarios(id), tipo TEXT NOT NULL CHECK(tipo IN ('Dinero','Alimentos','Medicamentos','Accesorios','Otros')),
      descripcion TEXT NOT NULL, centavos INTEGER NOT NULL DEFAULT 0 CHECK(centavos>=0),
      estado TEXT NOT NULL DEFAULT 'pendiente' CHECK(estado IN ('pendiente','confirmada','rechazada','cancelada')),
      puntos INTEGER NOT NULL DEFAULT 0 CHECK(puntos IN (0,10)),
      creado TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE TABLE IF NOT EXISTS resenas (
      id INTEGER PRIMARY KEY, autor_id INTEGER NOT NULL REFERENCES usuarios(id),
      destinatario_id INTEGER NOT NULL REFERENCES usuarios(id), adopcion_id INTEGER REFERENCES adopciones(id),
      donacion_id INTEGER REFERENCES donaciones(id), puntuacion INTEGER NOT NULL CHECK(puntuacion BETWEEN 1 AND 5),
      comentario TEXT NOT NULL, oculta INTEGER NOT NULL DEFAULT 0 CHECK(oculta IN(0,1)),
      creado TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      CHECK((adopcion_id IS NOT NULL) != (donacion_id IS NOT NULL))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS resena_adopcion ON resenas(autor_id,adopcion_id) WHERE adopcion_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS resena_donacion ON resenas(autor_id,donacion_id) WHERE donacion_id IS NOT NULL;
    CREATE TABLE IF NOT EXISTS reportes (
      id INTEGER PRIMARY KEY, resena_id INTEGER NOT NULL REFERENCES resenas(id),
      autor_id INTEGER NOT NULL REFERENCES usuarios(id), motivo TEXT NOT NULL,
      estado TEXT NOT NULL DEFAULT 'pendiente' CHECK(estado IN('pendiente','resuelto')),
      UNIQUE(resena_id,autor_id)
    );
    CREATE TABLE IF NOT EXISTS mensajes (
      id INTEGER PRIMARY KEY, emisor_id INTEGER NOT NULL REFERENCES usuarios(id),
      receptor_id INTEGER NOT NULL REFERENCES usuarios(id), cuerpo TEXT NOT NULL,
      creado TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE TABLE IF NOT EXISTS correos (
      id INTEGER PRIMARY KEY, usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
      destinatario TEXT NOT NULL, asunto TEXT NOT NULL, cuerpo TEXT NOT NULL,
      estado TEXT NOT NULL DEFAULT 'local' CHECK(estado IN('local','pendiente','enviando','enviado','error')),
      intentos INTEGER NOT NULL DEFAULT 0, error TEXT NOT NULL DEFAULT '',
      creado TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE INDEX IF NOT EXISTS mascotas_responsable ON mascotas(responsable_id);
    CREATE INDEX IF NOT EXISTS solicitudes_adoptante ON solicitudes(adoptante_id);
    CREATE INDEX IF NOT EXISTS mensajes_receptor ON mensajes(receptor_id,id);
  `);
  // Migraciones aditivas: conservar los registros de versiones anteriores.
  db.exec('BEGIN IMMEDIATE');
  try {
    const columnas = tabla => db.prepare(`PRAGMA table_info(${tabla})`).all().map(c=>c.name);
    if(!columnas('usuarios').includes('foto')) db.exec("ALTER TABLE usuarios ADD COLUMN foto TEXT NOT NULL DEFAULT ''");
    if(!columnas('usuarios').includes('bienvenida')) db.exec('ALTER TABLE usuarios ADD COLUMN bienvenida INTEGER NOT NULL DEFAULT 5 CHECK(bienvenida=5)');
    if(!columnas('mascotas').includes('foto_extra')) db.exec("ALTER TABLE mascotas ADD COLUMN foto_extra TEXT NOT NULL DEFAULT ''");
    db.exec(`CREATE TABLE IF NOT EXISTS notificaciones (
      id INTEGER PRIMARY KEY, usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
      asunto TEXT NOT NULL, cuerpo TEXT NOT NULL, tipo TEXT NOT NULL,
      referencia INTEGER, leida INTEGER NOT NULL DEFAULT 0 CHECK(leida IN(0,1)),
      correo_id INTEGER REFERENCES correos(id),
      creado TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS aviso_correo ON notificaciones(correo_id) WHERE correo_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS avisos_usuario ON notificaciones(usuario_id,id);
    INSERT OR IGNORE INTO notificaciones(usuario_id,asunto,cuerpo,tipo,correo_id)
      SELECT usuario_id,asunto,cuerpo,'general',id FROM correos;
    `);
    if(!columnas('notificaciones').includes('mensaje_id')) db.exec('ALTER TABLE notificaciones ADD COLUMN mensaje_id INTEGER REFERENCES mensajes(id)');
    db.exec("UPDATE usuarios SET foto='/imagenes/perfil-demo.svg' WHERE foto='' AND email IN ('refugio@patitas.test','ana@patitas.test','admin@patitas.test','sofia@patitas.test')");
    db.exec('COMMIT');
  } catch(error) { db.exec('ROLLBACK'); db.close(); throw error; }
  return db;
}
function repositorio(db) {
  return {
    db,
    uno: (sql, ...p) => db.prepare(sql).get(...p),
    todos: (sql, ...p) => db.prepare(sql).all(...p),
    ejecutar: (sql, ...p) => db.prepare(sql).run(...p),
    transaccion(fn) {
      db.exec('BEGIN IMMEDIATE');
      try { const respuesta = fn(); db.exec('COMMIT'); return respuesta; }
      catch(error) { db.exec('ROLLBACK'); throw error; }
    },
  };
}
async function datosDemo(repo) {
  if (repo.uno('SELECT id FROM usuarios LIMIT 1')) return;
  const clave = await proteger('Patitas2026!');
  repo.transaccion(() => {
    const insertar = (nombre, correo, tipo, ciudad, descripcion) => Number(repo.ejecutar(
      'INSERT INTO usuarios(nombre,email,clave,tipo,ciudad,descripcion) VALUES(?,?,?,?,?,?)',
      nombre, correo, clave, tipo, ciudad, descripcion).lastInsertRowid);
    const refugio = insertar('Refugio Huellitas', 'refugio@patitas.test', 'refugio', 'Buenos Aires', 'Somos un refugio de ejemplo. Rescatamos, cuidamos y buscamos familias con mucho amor para dar.');
    insertar('Ana Pérez', 'ana@patitas.test', 'adoptante', 'Buenos Aires', 'Tengo ganas de sumar un nuevo integrante a mi familia.');
    insertar('Administración PATITAS', 'admin@patitas.test', 'admin', '', 'Cuenta local para moderar reseñas.');
    insertar('Rescatista Sofía', 'sofia@patitas.test', 'particular', 'La Plata', 'Ayudo a animales del barrio a encontrar un hogar.');
    repo.ejecutar("UPDATE usuarios SET foto='/imagenes/perfil-demo.svg' WHERE email IN ('refugio@patitas.test','ana@patitas.test','admin@patitas.test','sofia@patitas.test')");
    const mascotas = [
      ['Luna','Perro',24,'Hembra','Mediano','Compañera de paseos y experta en siestas al sol. Busca una familia paciente y cariñosa.','Vacunas al día. Castrada.','/imagenes/luna.svg'],
      ['Milo','Gato',12,'Macho','Pequeño','Curioso, tranquilo y muy mimoso. Le encanta mirar por la ventana y dormir cerquita.','Vacunado y desparasitado.','/imagenes/milo.svg'],
      ['Coco','Perro',48,'Macho','Pequeño','Un compañero dulce que disfruta de los paseos cortos y los momentos en familia.','Castrado. Requiere control anual.','/imagenes/coco.svg'],
    ];
    for (const m of mascotas) repo.ejecutar('INSERT INTO mascotas(responsable_id,nombre,especie,edad_meses,sexo,tamano,descripcion,salud,foto) VALUES(?,?,?,?,?,?,?,?,?)', refugio, ...m);
  });
}
module.exports = { conectar, repositorio, datosDemo };
