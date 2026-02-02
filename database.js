const { Client } = require('pg');

const client = new Client({
    user: 'postgres',
    host: 'localhost',
    database: 'pai-berbagi-db',
    password: 'admin',
    port: 5432, // Port default PostgreSQL
});

async function connectDB() {
    try {
        await client.connect();
        console.log('Terhubung ke database!');
    } catch (err) {
        console.error('Gagal terhubung', err);
    }
}

// Contoh query
async function getData() {
    await connectDB();
    const res = await client.query('SELECT * FROM nama_tabel LIMIT 5');
    console.log(res.rows);
    await client.end(); // Tutup koneksi
}

getData();