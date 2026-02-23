const express = require("express");
const supabase = require("@supabase/supabase-js");
const { v2: cloudinary } = require("cloudinary");
const { CLOUD_NAME, CLOUD_KEY, CLOUD_SECRET } = require("./cloud-config").default;
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE } = require("./supabase-config").default;
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");
const pool = require("./db-config");


// Konfigurasi Cloudinary

cloudinary.config({
  cloud_name: CLOUD_NAME,
  api_key: CLOUD_KEY,
  api_secret: CLOUD_SECRET,
});

const app = express();
const cors = require("cors");
app.use(cors()); //Allow all origins by default
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));
const PORT = 3211;

const db = supabase.createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

app.use(bodyParser.urlencoded({ extended:true }));

const multer = require('multer');

var upload = multer({
    dest: "uploads/",
    storage: multer.diskStorage({}),
    limits: { fileSize: 20000000 }, 
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    },
});


//JENJANG ROUTES
app.get("/jenjang", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT j."idJenjang",
       j."jenjang",
       j."image",
       COUNT(m."idModul") AS count
      FROM jenjang j
      LEFT JOIN modul m ON j."idJenjang" = m."idJenjang"
      GROUP BY j."idJenjang", j."jenjang", j."image"
      ORDER BY j."idJenjang" ASC;
    `);

    res.json(result.rows);
  } catch (error) {
    console.error("Gagal mengambil data jenjang:", error);
    res.status(500).json({ error: "Terjadi kesalahan saat mengambil data" });
  }

});

const uploadFileJenjang = async (filePath) => {
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder: "jenjang_image",
    });
    return result;
  } catch (error) {
    console.error("Error uploading file to Cloudinary:", error);
    throw error;
  }
}

// app.post('/jenjang', upload.single("file"), async (req, res) => {
//   try {
//     const filePath = req.file.path;
//     const { jenjang } = req.body;
//     const result = await uploadFileJenjang(filePath);
//     const addData = await db.from("jenjang").insert({ jenjang: jenjang, images: result.secure_url });
//     res.json(addData);
//   } catch (error) {
//     console.error("Error handling file upload:", error);
//     res.status(500).json({ error: "Internal Server Error" });
//   }
// });

app.post("/jenjang", upload.single("file"), async (req, res) => {
  try {
    const filePath = req.file.path;
    const { jenjang } = req.body;
    const resultUpload = await uploadFileJenjang(filePath);

    const insertQuery = `
      INSERT INTO jenjang (jenjang, image)
      VALUES ($1, $2) RETURNING *
    `;
    const values = [jenjang, resultUpload.secure_url];

    const result = await pool.query(insertQuery, values);
    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error handling file upload:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});


app.delete("/jenjang/:id", async (req, res) => {
  // try {
  //   const { id } = req.params;
  //   const deleteData = await db.from("jenjang").delete().eq("idJenjang", id);
  //   res.json(deleteData);
  // } catch (error) {
  //   console.error("Error deleting jenjang:", error);
  //   res.status(500).json({ error: "Internal Server Error" });
  // }
  try {
    const { id } = req.params;
    const result = await pool.query(
      `DELETE FROM jenjang WHERE "idJenjang" = $1 RETURNING *`,
      [id]
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error deleting jenjang:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

//MODUL ROUTES
app.get("/modul", async (req, res) => {
  const { search, sort, limit, id, kategori } = req.query;
  // let query = db
  //   .from("modul")
  //   .select("*, jenjang(*)", { count: "exact" });

  // if (id) {
  //   query = query.eq("idJenjang", id);
  // }

  let query = `
    SELECT m.*, j.*
    FROM modul m
    LEFT JOIN jenjang j ON m."idJenjang" = j."idJenjang"
  `;
  let params = [];

  let conditions = [];

  if (id) {
    params.push(id);
    conditions.push(`j."idJenjang" = $${params.length}`);
  }

  if (kategori) {
    params.push(kategori);
    conditions.push(`m."idKategori" = $${params.length}`);
  }

  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(m."title" ILIKE $${params.length} OR m."desc" ILIKE $${params.length} OR m."name" ILIKE $${params.length})`);
  }

  if (conditions.length > 0) {
    query += " WHERE " + conditions.join(" AND ");
  }


  // Sort logic
  // if (sort === "asc" || sort === "desc") {
  //   query = query.order("createdAt", { ascending: sort === "asc" });
  // } else if (sort === "random") {
  //   query = query.order("RANDOM()");
  // }
  if (sort === "asc" || sort === "desc") {
    query += ` ORDER BY m."createdAt" ${sort.toUpperCase()}`;
  } else if (sort === "random") {
    query += ` ORDER BY RANDOM()`;
  }


  // Limit logic (optional)
  // if (limit) {
  //   const maxLimit = parseInt(limit);
  //   if (!isNaN(maxLimit)) {
  //     query = query.limit(maxLimit);
  //   }
  // }
  if (limit) {
    const maxLimit = parseInt(limit);
    if (!isNaN(maxLimit)) {
      params.push(maxLimit);
      query += ` LIMIT $${params.length}`;
    }
  }
  // const { data, count, status } = await query;
  // res.json({ data, count, status });
  try {
    const { rows } = await pool.query(query, params);
    res.json({ data: rows, count: rows.length, status: 200 });
  } catch (err) {
    console.error("Error fetching modul:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

//get modul by jenjang
app.get("/modul/jenjang/:id", async (req, res) => {
  // try {
  //   const idJenjang = req.params.id;
  //   const { search } = req.query;
  //   let query = db
  //     .from("modul")
  //     .select("*", { count: "exact" })
  //     .eq("idJenjang", idJenjang);
  //   // Pencarian berdasarkan title / desc (case-insensitive)
  //   if (search) {
  //     query = query.or(`title.ilike.%${search}%,desc.ilike.%${search}%,name.ilike.%${search}%`);
  //   }
  //   const { data, count, status } = await query;
  //   res.json({ data, count, status });
  // } catch (error) {
  //   console.error("Error fetching modul by jenjang:", error);
  //   res.status(500).json({ error: "Internal server error" });
  // }
  const idJenjang = req.params.id;
  const { search } = req.query;

  let sql = `
    SELECT *
    FROM modul
    WHERE "idJenjang" = $1
  `;
  let params = [idJenjang];
  console.log('serach ',search);

  if (search) {
    params.push(`%${search}%`);
    console.log('length ',params.length);
    sql += ` AND ("title" ILIKE $${params.length} OR "desc" ILIKE $${params.length} OR "name" ILIKE $${params.length})`;
  }

  console.log('sql ',params);

  try {
    const { rows } = await pool.query(sql, params);
    res.json({ data: rows, count: rows.length, status: 200 });
  } catch (err) {
    console.error("Error fetching modul by jenjang:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Fungsi upload ke Cloudinary
const uploadFileModul = async (filePath) => {
  try {
    const fileName = path.basename(filePath); // ambil nama file
    const ext = path.extname(fileName) || ".pdf"; // ambil ekstensi
    const baseName = path.basename(fileName, ext); // nama tanpa ekstensi

    const result = await cloudinary.uploader.upload(filePath, {
      folder: "modul_files",
      resource_type: "raw", // wajib untuk PDF
      access_mode: "public",
      public_id: `${baseName}${ext}`, // => akan jadi .../modul_files/materi.pdf
      use_filename: true,
      unique_filename: false,
    });
    return result;
  } catch (error) {
    console.error("Error uploading file to Cloudinary:", error);
    throw error;
  } finally {
    // hapus file sementara setelah diupload
    fs.unlink(filePath, (err) => {
      if (err) console.warn("Gagal hapus file sementara:", err);
    });
  }
};

// Endpoint upload modul
app.post("/modul", upload.single("file"), async (req, res) => {
  try {
    const { idJenjang, title, desc, name, idKategori, link } = req.body;
    const filePath = req.file?.path;

    let fileUrl = null;
    if(parseInt(idKategori) === 3){
      if (!filePath) {
        return res.status(400).json({ error: "File tidak ditemukan" });
      }
      // Upload file ke Cloudinary
      const result = await uploadFileModul(filePath);
      fileUrl = result.secure_url;
    } else {
      if (!link) {
        return res.status(400).json({ error: "Link diperlukan untuk kategori ini" });
      }
      fileUrl = link;
    }

    // Insert ke tabel modul
    const insertSql = `
      INSERT INTO modul ("idJenjang", "title", "desc", "name", "files", "idKategori")
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *;
    `;
    const insertParams = [idJenjang, title, desc, name, fileUrl, idKategori];

    const { rows: insertedRows } = await pool.query(insertSql, insertParams);

    if (!insertedRows?.[0]) {
      throw new Error("Gagal menyimpan data modul");
    }

    const idModul = insertedRows[0].idModul;

    // Ambil kembali data modul yang baru diinsert
    const fetchSql = `SELECT * FROM modul WHERE "idModul" = $1;`;
    const { rows: fetchedRows } = await pool.query(fetchSql, [idModul]);

    res.json({
      message: "Modul berhasil diupload",
      fileUrl,
      idModul,
      data: fetchedRows[0],
    });
  } catch (error) {
    console.error("Error handling file upload:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});


app.delete("/modul/:id", async (req, res) => {
  // try {
  //   const { id } = req.params;
  //   const deleteData = await db.from("modul").delete().eq("idModul", id);
  //   res.json(deleteData);
  // } catch (error) {
  //   console.error("Error deleting modul:", error);
  //   res.status(500).json({ error: "Internal Server Error" });
  // }
  try {
    const { id } = req.params;

    const sql = `
      DELETE FROM modul
      WHERE "idModul" = $1
      RETURNING *;
    `;
    const { rows } = await pool.query(sql, [id]);

    res.json({ data: rows, status: 200 });
  } catch (error) {
    console.error("Error deleting modul:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

//get modul by id
app.get("/modul/:id", async (req, res) => {
  
  const { id } = req.params;
  console.log('modul id ',id);

  // Validasi ID
  if (!id) {
    return res.status(400).json({ error: "ID modul diperlukan." });
  }

  // Query modul dengan join ke jenjang (hanya namaJenjang)
  // const query = db
  //   .from("modul")
  //   .select("*, jenjang(*)", { count: "exact" })
  //   .eq("idModul", id)
  //   .single(); // Ambil satu baris

  // const { data, error, status } = await query;

  // if (error) {
  //   return res.status(500).json({ error: error.message });
  // }

  // res.status(200).json({ data, status });
  const sql = `
    SELECT m.*, j."jenjang"
    FROM modul m
    LEFT JOIN jenjang j ON m."idJenjang" = j."idJenjang"
    WHERE m."idModul" = $1
    LIMIT 1;
  `;

  try {
    const { rows } = await pool.query(sql, [id]);

    if (rows.length === 0) {
      return res.status(404).json({ error: "Modul tidak ditemukan." });
    }

    res.status(200).json({ data: rows[0], status: 200 });
  } catch (error) {
    console.error("Error fetching modul by id:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }

});

//KATEGORI
app.get("/kategori", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT k."idKategori",
       k."kategori",
       k."icon",
       k."color",
       COUNT(m."idModul") AS count
      FROM kategori k
      LEFT JOIN modul m ON k."idKategori" = m."idKategori"
      GROUP BY k."idKategori", k."kategori"
      ORDER BY k."idKategori" ASC;
    `);

    res.json(result.rows);
  } catch (error) {
    console.error("Gagal mengambil data kategori:", error);
    res.status(500).json({ error: "Terjadi kesalahan saat mengambil data" });
  }

});

app.listen(PORT, () => {
  console.log("Server is running on port 3211");
});