const express = require("express");
const router = express.Router();
const db = require("../db");
const adminAuth = require("../middleware/adminAuth");

router.use(adminAuth); // 🔒 ADMIN ONLY

/*
|--------------------------------------------------------------------------
| ADMIN DASHBOARD
| GET /api/admin/dashboard
|--------------------------------------------------------------------------
| Shows real system overview (ALL records)
*/
router.get("/dashboard", (req, res) => {

  const sql = `
    SELECT
      (SELECT COUNT(*) FROM users WHERE role = 'patient') AS patients,
      (SELECT COUNT(*) FROM users WHERE role = 'staff') AS staff,

      (SELECT COUNT(*) FROM appointments 
       WHERE DATE(date) = CURDATE()
      ) AS appointments_today,

      (SELECT COUNT(*) FROM appointments WHERE status = 'pending') AS pending,
      (SELECT COUNT(*) FROM appointments WHERE status = 'approved') AS approved,
      (SELECT COUNT(*) FROM appointments WHERE status = 'completed') AS completed,
      (SELECT COUNT(*) FROM appointments WHERE status = 'cancelled') AS cancelled
  `;

  db.query(sql, (err, rows) => {
    if (err) {
      console.error("ADMIN DASHBOARD ERROR:", err);
      return res.status(500).json({ success: false });
    }

    res.json({
      success: true,
      stats: rows[0],
    });
  });
});


  /*
|--------------------------------------------------------------------------
| GET all services (admin)
|--------------------------------------------------------------------------
*/
router.get("/services", (req, res) => {
    db.query("SELECT * FROM services ORDER BY id DESC", (err, rows) => {
      if (err) return res.status(500).json({ success: false });
      res.json({ success: true, services: rows });
    });
  });
  
  /*
  |--------------------------------------------------------------------------
  | ADD service
  |--------------------------------------------------------------------------
  */
  router.post("/services", (req, res) => {
    const { name, description } = req.body;
  
    if (!name) {
      return res.json({ success: false, message: "Service name required" });
    }
  
    db.query(
      "INSERT INTO services (name, description) VALUES (?, ?)",
      [name, description],
      (err) => {
        if (err) return res.status(500).json({ success: false });
        res.json({ success: true });
      }
    );
  });
  
  /*
  |--------------------------------------------------------------------------
  | UPDATE service
  |--------------------------------------------------------------------------
  */
  router.put("/services/:id", (req, res) => {
    const { id } = req.params;
    const { name, description, status } = req.body;
  
    db.query(
      "UPDATE services SET name=?, description=?, status=? WHERE id=?",
      [name, description, status, id],
      (err) => {
        if (err) return res.status(500).json({ success: false });
        res.json({ success: true });
      }
    );
  });

  router.delete("/services/:id", (req, res) => {
    const { id } = req.params;
  
    // 1️⃣ Get service name
    db.query(
      "SELECT name FROM services WHERE id = ?",
      [id],
      (err, rows) => {
        if (err || rows.length === 0) {
          return res.status(404).json({
            success: false,
            message: "Service not found",
          });
        }
  
        const serviceName = rows[0].name;
  
        // 2️⃣ Check if used in appointments
        db.query(
          "SELECT COUNT(*) AS count FROM appointments WHERE service = ?",
          [serviceName],
          (err, result) => {
            if (err) {
              console.error("CHECK SERVICE USAGE ERROR:", err);
              return res.status(500).json({ success: false });
            }
  
            if (result[0].count > 0) {
              return res.status(400).json({
                success: false,
                message:
                  "Cannot delete service. It is used by existing appointments.",
              });
            }
  
            // 3️⃣ Safe delete
            db.query(
              "DELETE FROM services WHERE id = ?",
              [id],
              (err) => {
                if (err) {
                  console.error("DELETE SERVICE ERROR:", err);
                  return res.status(500).json({ success: false });
                }
  
                res.json({ success: true });
              }
            );
          }
        );
      }
    );
  });
  
module.exports = router;
