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
          a.date,
          a.time,
          a.status,
          a.patient_name,
          a.patient_age,
          a.patient_gender,
          a.connection_to_clinic,
          a.patient_notes,
          u.id AS user_id,
          u.name AS account_name,
          u.email,
          u.phone,
          d.name AS doctor_name
        FROM appointments a
        JOIN users u ON u.id = a.user_id
        LEFT JOIN doctors d ON d.id = a.doctor
        ORDER BY a.date DESC, a.time DESC
      `, (err3, appointments) => {
        if (err3) return res.json({ success: false });
        console.log("APPOINTMENTS RESULT:", appointments);


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
