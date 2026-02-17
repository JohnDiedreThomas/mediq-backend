const express = require("express");
const router = express.Router();
const db = require("../db");
const adminAuth = require("../middleware/adminAuth");

router.use(adminAuth);

router.get("/", (req, res) => {
  const data = {};

  db.query("SELECT id, name, email, phone FROM users WHERE role='patient'", (err, patients) => {
    if (err) return res.json({ success: false });

    data.patients = patients;

    db.query("SELECT id, name, role FROM users WHERE role='staff'", (err2, staff) => {
      if (err2) return res.json({ success: false });

      data.staff = staff;

      db.query(`
        SELECT 
          a.id,
          a.patient_name,
          a.date,
          a.time, 
          a.status,
          d.name AS doctor_name
        FROM appointments a
        JOIN doctors d ON a.doctor = d.id
      `, (err3, appointments) => {
        if (err3) return res.json({ success: false });

        data.appointments = appointments;

        res.json({
          success: true,
          ...data
        });
      });
    });
  });
});

module.exports = router;
