require('dotenv').config()
const { Pool } = require("pg");

// const pool = new Pool({
//   user: "postgres",       // ganti sesuai user
//   host: "localhost",      // atau host server Anda
//   database: "pai-berbagi-db",    // nama database
//   password: "admin",   // password postgres
//   port: 5432,             // default port PostgreSQL
// });

// Setup koneksi ke Supabase Postgres
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } // Supabase butuh SSL
})


module.exports = pool;
