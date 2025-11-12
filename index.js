const express = require("express");
const supabase = require("@supabase/supabase-js");
const { v2: cloudinary } = require("cloudinary");
const { CLOUD_NAME, CLOUD_KEY, CLOUD_SECRET } = require("./cloud-config").default;
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE } = require("./supabase-config").default;
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");

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
    const { data, error } = await db.from("jenjang")
      .select(`
        idJenjang,
        jenjang,
        images,
        modul ( idModul )
    `);
    if (error) throw error;

    const result = data.map(j => ({
      idJenjang: j.idJenjang,
      jenjang: j.jenjang,
      images: j.images,
      count: j.modul ? j.modul.length : 0
    }));

    res.json(result);
  } catch (error) {
    console.error("Gagal mengambil data jenjang:", error);
    res.status(500).json({ error: "Terjadi kesalahan saat mengambil data" });
  }

});

const uploadFileJenjang = async (filePath) => {
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder: "jenjang_images",
    });
    return result;
  } catch (error) {
    console.error("Error uploading file to Cloudinary:", error);
    throw error;
  }
}

app.post('/jenjang', upload.single("file"), async (req, res) => {
  try {
    const filePath = req.file.path;
    const { jenjang } = req.body;
    const result = await uploadFileJenjang(filePath);
    const addData = await db.from("jenjang").insert({ jenjang: jenjang, images: result.secure_url });
    res.json(addData);
  } catch (error) {
    console.error("Error handling file upload:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.delete("/jenjang/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const deleteData = await db.from("jenjang").delete().eq("idJenjang", id);
    res.json(deleteData);
  } catch (error) {
    console.error("Error deleting jenjang:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

//MODUL ROUTES
app.get("/modul", async (req, res) => {
  const { search, id, sort, limit } = req.query;
  let query = db
    .from("modul")
    .select("*, jenjang(*)", { count: "exact" });

  if (id) {
    query = query.eq("idJenjang", id);
  }

  // Pencarian berdasarkan title / desc (case-insensitive)
  if (search) {
    query = query.or(`title.ilike.%${search}%,desc.ilike.%${search}%,name.ilike.%${search}%`);
  }

  // Sort logic
  if (sort === "asc" || sort === "desc") {
    query = query.order("createdAt", { ascending: sort === "asc" });
  } else if (sort === "random") {
    query = query.order("RANDOM()");
  }

  // Limit logic (optional)
  if (limit) {
    const maxLimit = parseInt(limit);
    if (!isNaN(maxLimit)) {
      query = query.limit(maxLimit);
    }
  }

  const { data, count, status } = await query;
  res.json({ data, count, status });
});

//get modul by jenjang
app.get("/modul/jenjang/:id", async (req, res) => {
  try {
    const idJenjang = req.params.id;
    const { search } = req.query;
    let query = db
      .from("modul")
      .select("*", { count: "exact" })
      .eq("idJenjang", idJenjang);
    // Pencarian berdasarkan title / desc (case-insensitive)
    if (search) {
      query = query.or(`title.ilike.%${search}%,desc.ilike.%${search}%,name.ilike.%${search}%`);
    }
    const { data, count, status } = await query;
    res.json({ data, count, status });
  } catch (error) {
    console.error("Error fetching modul by jenjang:", error);
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
    const { idJenjang, title, desc, name } = req.body;
    const filePath = req.file?.path;

    if (!filePath) {
      return res.status(400).json({ error: "File tidak ditemukan" });
    }

    const result = await uploadFileModul(filePath);

    const { data: inserted, error: insertError } = await db
      .from("modul")
      .insert({
        idJenjang,
        title,
        desc,
        name,
        files: result.secure_url,
      })
      .select();

    if (insertError || !inserted?.[0]) {
      throw new Error("Gagal menyimpan data modul");
    }

    const idModul = inserted[0].idModul;

    const { data: insertedData, error: fetchError } = await db
      .from("modul")
      .select("*")
      .eq("idModul", idModul)
      .single();

    res.json({
      message: "Modul berhasil diupload",
      fileUrl: result.secure_url,
      idModul,
      data: insertedData,
    });
  } catch (error) {
    console.error("Error handling file upload:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});


app.delete("/modul/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const deleteData = await db.from("modul").delete().eq("idModul", id);
    res.json(deleteData);
  } catch (error) {
    console.error("Error deleting modul:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

//get modul by id
app.get("/modul/:id", async (req, res) => {
  
  const { id } = req.params;

  // Validasi ID
  if (!id) {
    return res.status(400).json({ error: "ID modul diperlukan." });
  }

  // Query modul dengan join ke jenjang (hanya namaJenjang)
  const query = db
    .from("modul")
    .select("*, jenjang(*)", { count: "exact" })
    .eq("idModul", id)
    .single(); // Ambil satu baris

  const { data, error, status } = await query;

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.status(200).json({ data, status });

});

app.listen(PORT, () => {
  console.log("Server is running on port 3211");
});