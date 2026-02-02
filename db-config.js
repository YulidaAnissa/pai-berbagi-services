const { Pool } = require("pg");

const pool = new Pool({
  user: "postgres",       // ganti sesuai user
  host: "localhost",      // atau host server Anda
  database: "pai-berbagi-db",    // nama database
  password: "admin",   // password postgres
  port: 5432,             // default port PostgreSQL
});

module.exports = pool;
