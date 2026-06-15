const path = require('path');
const fs = require('fs');
const { createRequire } = require('module');

function toPg(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

function wrapSqlite(nativeDb) {
  const prepare = (sql) => ({
    run(...params) {
      const result = nativeDb.prepare(sql).run(...params);
      return { lastInsertRowid: result.lastInsertRowid, changes: result.changes };
    },
    get(...params) {
      return nativeDb.prepare(sql).get(...params);
    },
    all(...params) {
      return nativeDb.prepare(sql).all(...params);
    }
  });
  return {
    exec: (sql) => nativeDb.exec(sql),
    prepare,
    isPostgres: false
  };
}

function wrapPostgres(pool) {
  const prepare = (sql) => {
    const pgSql = toPg(sql);
    const isInsert = /^\s*INSERT\s+/i.test(sql.trim());
    return {
      async run(...params) {
        if (isInsert && !/RETURNING/i.test(pgSql)) {
          try {
            const r = await pool.query(`${pgSql} RETURNING id`, params);
            return { lastInsertRowid: r.rows[0]?.id, changes: r.rowCount };
          } catch {
            const r = await pool.query(pgSql, params);
            return { lastInsertRowid: undefined, changes: r.rowCount };
          }
        }
        const r = await pool.query(pgSql, params);
        return { lastInsertRowid: r.rows[0]?.id, changes: r.rowCount };
      },
      async get(...params) {
        const r = await pool.query(pgSql, params);
        return r.rows[0];
      },
      async all(...params) {
        const r = await pool.query(pgSql, params);
        return r.rows;
      }
    };
  };
  return {
    exec: async (sql) => {
      const statements = sql.split(';').map(s => s.trim()).filter(Boolean);
      for (const s of statements) await pool.query(s);
    },
    prepare,
    isPostgres: true
  };
}

async function createDb({ sqliteSchema, pgSchema, seed, sqlitePath, projectDir }) {
  const req = createRequire(path.join(projectDir, 'package.json'));

  if (process.env.DATABASE_URL) {
    const { Pool } = req('pg');
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });
    const db = wrapPostgres(pool);
    await db.exec(pgSchema);
    if (seed) await seed(db);
    console.log('Connected to PostgreSQL (Railway)');
    return db;
  }

  const Database = req('better-sqlite3');
  const filePath = sqlitePath || path.join(projectDir, 'db.sqlite3');
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const nativeDb = new Database(filePath);
  const db = wrapSqlite(nativeDb);
  nativeDb.exec(sqliteSchema);
  if (seed) await seed(db);
  console.log(`Connected to SQLite at ${filePath}`);
  return db;
}

module.exports = { createDb };
