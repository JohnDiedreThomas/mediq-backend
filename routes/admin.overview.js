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
           a.rescheduled,
          a.patient_name,
            a.patient_birthdate,
          a.patient_age,
          a.patient_gender,
          a.connection_to_clinic,
          a.patient_notes,
          s.name AS service,
          u.id AS user_id,
          u.name AS account_name,
          u.email,
          u.phone,
          d.name AS doctor_name,
          u1.name AS approved_by_name,
u2.name AS cancelled_by_name,
u3.name AS completed_by_name,
u4.name AS arrived_by_name,
u5.name AS no_show_by_name,
u6.name AS rescheduled_by_name
        FROM appointments a
        JOIN users u ON u.id = a.user_id
        LEFT JOIN doctors d ON d.id = a.doctor
        LEFT JOIN users u1 ON u1.id = a.approved_by
        LEFT JOIN users u2 ON u2.id = a.cancelled_by
        LEFT JOIN users u3 ON u3.id = a.completed_by
        LEFT JOIN users u4 ON u4.id = a.arrived_by
        LEFT JOIN users u5 ON u5.id = a.no_show_by
        LEFT JOIN users u6 ON u6.id = a.rescheduled_by
        LEFT JOIN services s ON s.id = a.service_id
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
