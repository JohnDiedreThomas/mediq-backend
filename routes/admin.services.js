const express = require("express");
const router = express.Router();
const db = require("../db");
const adminAuth = require("../middleware/adminAuth");

const upload = require("../middleware/uploadServiceCloudinary");

const getCategory = (name) => {
    const n = name.toLowerCase();
  
    if (n.includes("dental") || n.includes("tooth") || n.includes("oral")) return "dental";
    if (n.includes("therapy")) return "therapy";
    return "general";
  };
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
  console.log("📥 BACKEND RECEIVED:", req.body);
  let { name, description } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, message: "Name required" });
  }

  name = name.trim();
  description = (description || "").trim();
  const category = getCategory(name);

  db.query(
    "INSERT INTO services (name, description, category, status) VALUES (?, ?, ?, 'active')",
    [name, description, category],
    (err) => {
      if (err) {
        console.error("ADD SERVICE ERROR:", err);
        return res.status(500).json({
          success: false,
          message: err.message || "Database error"
        });
      }

      res.json({ success: true });
    }
  );
});

/* UPDATE SERVICE */
router.put("/:id", (req, res) => {
  console.log("UPDATE BODY:", req.body);
  console.log("🔥 UPDATE ROUTE HIT");
  console.log("UPDATE BODY:", req.body);

  const { id } = req.params;
  let { name, description, status } = req.body;


  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, message: "Name required" });
  }

  name = name.trim();
  description = (description || "").trim();
  const category = getCategory(name);
  
  db.query(
    "UPDATE services SET name=?, description=?, category=?, status=? WHERE id=?",
    [name, description, category, status || "active", id],
    (err, result) => {
      if (err) {
        console.error("UPDATE SERVICE ERROR:", err);
        return res.status(500).json({
          success: false,
          message: err.message || "Database error"
        });
      }
      console.log("SQL RESULT:", result); // <-- ADD THIS
  
      if (result.affectedRows === 0) {
        return res.json({
          success: false,
          message: "No service updated — wrong ID",
        });
      }
  
      res.json({ success: true });
    }
  );
});
/* 📸 UPLOAD SERVICE IMAGE */
router.post("/:id/image", upload.single("image"), (req, res) => {
  try {
    const { id } = req.params;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded",
      });
    }

    const imageUrl = req.file.path;

    db.query(
      "UPDATE services SET image=? WHERE id=?",
      [imageUrl, id],
      (err) => {
        if (err) {
          console.error("DB error:", err);
          return res.status(500).json({ success: false });
        }

        res.json({ success: true, image: imageUrl });
      }
    );
  } catch (error) {
    console.error("UPLOAD CRASH:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/* TOGGLE STATUS */
router.put("/:id/status", (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!["active", "inactive"].includes(status)) {
    return res.json({ success: false });
  }

  db.query(
    "UPDATE services SET status=? WHERE id=?",
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

/* SAFE DELETE */
router.delete("/:id", (req, res) => {
  const { id } = req.params;

  db.query(
    "SELECT COUNT(*) AS count FROM appointments WHERE service_id=?",
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

      db.query("DELETE FROM services WHERE id=?", [id], (err, result) => {
        if (err) {
          console.error("DELETE SERVICE ERROR:", err);
          return res.status(500).json({ success: false });
        }

        res.json({ success: true });
      });
    }
  );
});

module.exports = router;