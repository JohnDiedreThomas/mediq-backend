const express = require("express");
const router = express.Router();
const db = require("../db");
const adminAuth = require("../middleware/adminAuth");
const upload = require("../middleware/uploadServiceImage");

/* 🔒 Protect all admin service routes */
router.use(adminAuth);

/* GET ALL SERVICES */
router.get("/", (req, res) => {
  db.query(
    "SELECT * FROM services ORDER BY created_at DESC",
    (err, rows) => {
      if (err) {
        console.error("ADMIN SERVICES ERROR:", err);
        return res.status(500).json({ success: false });
      }

      res.json({ success: true, services: rows });
    }
  );
});

/* ADD SERVICE */
router.post("/", (req, res) => {
  const { name, description } = req.body;

  if (!name) {
    return res.json({ success: false, message: "Name required" });
  }

  db.query(
    "INSERT INTO services (name, description) VALUES (?, ?)",
    [name, description || null],
    (err) => {
      if (err) {
        console.error("ADD SERVICE ERROR:", err);
        return res.json({ success: false });
      }

      res.json({ success: true });
    }
  );
});

/* UPDATE SERVICE */
router.put("/:id", (req, res) => {
  const { id } = req.params;
  const { name, description } = req.body;

  db.query(
    "UPDATE services SET name = ?, description = ? WHERE id = ?",
    [name, description, id],
    (err) => {
      if (err) {
        console.error("UPDATE SERVICE ERROR:", err);
        return res.json({ success: false });
      }

      res.json({ success: true });
    }
  );
});

/* 📸 UPLOAD SERVICE IMAGE */
router.post("/:id/image", upload.single("image"), (req, res) => {
  const { id } = req.params;

  if (!req.file) {
    return res.status(400).json({ success: false, message: "No file uploaded" });
  }

  const imagePath = `/uploads/services/${req.file.filename}`;

  db.query(
    "UPDATE services SET image = ? WHERE id = ?",
    [imagePath, id],
    (err) => {
      if (err) {
        console.error("UPLOAD IMAGE ERROR:", err);
        return res.status(500).json({ success: false });
      }

      res.json({ success: true, image: imagePath });
    }
  );
});

/* TOGGLE SERVICE STATUS */
router.put("/:id/status", (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!["active", "inactive"].includes(status)) {
    return res.json({ success: false });
  }

  db.query(
    "UPDATE services SET status = ? WHERE id = ?",
    [status, id],
    (err) => {
      if (err) {
        console.error("STATUS ERROR:", err);
        return res.json({ success: false });
      }

      res.json({ success: true });
    }
  );
});

/* 🔥 SAFE DELETE SERVICE ← STEP 2 GOES HERE */
router.delete("/:id", (req, res) => {
  const { id } = req.params;

  // 1️⃣ Check if service is used
  db.query(
    "SELECT COUNT(*) AS count FROM appointments WHERE service_id = ?",
    [id],
    (err, rows) => {
      if (err) {
        console.error("SERVICE CHECK ERROR:", err);
        return res.status(500).json({ success: false });
      }

      if (rows[0].count > 0) {
        return res.status(400).json({
          success: false,
          message:
            "Cannot delete service. It is currently used by existing appointments.",
        });
      }

      // 2️⃣ Safe delete
      db.query(
        "DELETE FROM services WHERE id = ?",
        [id],
        (err, result) => {
          if (err) {
            console.error("DELETE SERVICE ERROR:", err);
            return res.status(500).json({ success: false });
          }

          if (result.affectedRows === 0) {
            return res.status(404).json({
              success: false,
              message: "Service not found",
            });
          }

          res.json({ success: true });
        }
      );
    }
  );
});

module.exports = router;
