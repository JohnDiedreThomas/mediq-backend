const express = require("express");
const router = express.Router();
const db = require("../db");

const upload = require("../middleware/uploadServiceImage");

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

router.post("/upload-image/:id", upload.single("image"), (req, res) => {
  const serviceId = req.params.id;

  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: "No file uploaded",
    });
  }

  const imagePath = `/uploads/services/${req.file.filename}`;

  db.query(
    "UPDATE services SET image=? WHERE id=?",
    [imagePath, serviceId],
    (err) => {
      if (err) {
        console.error("UPLOAD IMAGE ERROR:", err);
        return res.status(500).json({ success: false });
      }

      res.json({ success: true, image: imagePath });
    }
  );
});
module.exports = router;
