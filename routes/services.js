const express = require("express");
const router = express.Router();
const db = require("../db");

// 🔁 CHANGE THIS — Cloudinary uploader
const upload = require("../middleware/uploadServiceCloudinary");

/* GET ACTIVE SERVICES (PATIENT) */
router.get("/", (req, res) => {
  db.query(
    "SELECT id, name, description, category, image FROM services WHERE status='active'",
    (err, rows) => {
      if (err) return res.status(500).json({ success: false });
      res.json({ success: true, services: rows });
    }
  );
});

/* UPLOAD SERVICE IMAGE */
router.post("/upload-image/:id", upload.single("image"), (req, res) => {
  const serviceId = req.params.id;

  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: "No file uploaded",
    });
  }

  // ⭐ Cloudinary URL
  const imageUrl = req.file.path;

  db.query(
    "UPDATE services SET image=? WHERE id=?",
    [imageUrl, serviceId],
    (err) => {
      if (err) {
        console.error("UPLOAD IMAGE ERROR:", err);
        return res.status(500).json({ success: false });
      }

      res.json({ success: true, image: imageUrl });
    }
  );
});

module.exports = router;