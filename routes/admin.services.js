const express = require("express");
const router = express.Router();
const db = require("../db");
const adminAuth = require("../middleware/adminAuth");

const upload = require("../middleware/uploadServiceCloudinary");

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
  let { name, description, price } = req.body;

  if (!name || !name.trim()) {
    return res.json({ success: false, message: "Name required" });
  }

  name = name.trim();
  description = description?.trim() || null;

  let parsedPrice;

  if (price !== null && price !== undefined && price !== "") {
    parsedPrice = parseFloat(price);
  
    if (isNaN(parsedPrice) || parsedPrice < 0) {
      return res.json({ success: false, message: "Invalid price" });
    }
  }
  db.query(
    "INSERT INTO services (name, description, price, status) VALUES (?, ?, ?, 'active')",
    [name, description, parsedPrice],
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
  console.log("🔥 UPDATE ROUTE HIT");
  console.log("UPDATE BODY:", req.body);

  const { id } = req.params;
  let { name, description, price, status } = req.body;

  if (!name || !name.trim()) {
    return res.json({ success: false, message: "Name required" });
  }

  name = name.trim();
  description = description?.trim() || null;

  // ✅ allow null price
  let parsedPrice;

  if (price !== undefined && price !== null && price !== "") {
    parsedPrice = parseFloat(price);
  
    if (isNaN(parsedPrice) || parsedPrice < 0) {
      return res.json({ success: false, message: "Invalid price" });
    }
  }
  console.log("Incoming price:", price);
  console.log("Parsed price:", parsedPrice);

  db.query(
    "UPDATE services SET name=?, description=?, price=?, status=? WHERE id=?",
    [name, description, parsedPrice, status || "active", id],
    (err, result) => {
      if (err) {
        console.error("UPDATE SERVICE ERROR:", err);
        return res.json({ success: false });
      }
  
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