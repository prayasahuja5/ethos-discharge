const { PGlite } = require("@electric-sql/pglite");
const path = require("path");

let dbInstance;

async function getDb() {
  if (dbInstance) return dbInstance;
  // Use a local folder inside the server repo for the database
  dbInstance = new PGlite(path.join(__dirname, "../.ethos_db"));
  return dbInstance;
}

async function initDb() {
  const p = await getDb();
  await p.query("SELECT 1");
  return true;
}

module.exports = {
  initDb,
  db: {
    async query(text, params) {
      const p = await getDb();
      return p.query(text, params);
    }
  }
};
