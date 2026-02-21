const express = require("express");
const db = require("../db");
const { sendPushNotification } = require("../pushNotification");

const router = express.Router();


const isHoliday = (date) => {
  const year = date.split("-")[0];

  const holidays = {
    [`${year}-01-01`]: true,
    [`${year}-02-10`]: true,
    [`${year}-04-02`]: true,
    [`${year}-04-03`]: true,
    [`${year}-04-09`]: true,
    [`${year}-05-01`]: true,
    [`${year}-06-12`]: true,
    [`${year}-08-21`]: true,
    [`${year}-08-26`]: true,
    [`${year}-11-01`]: true,
    [`${year}-11-30`]: true,
    [`${year}-12-25`]: true,
    [`${year}-12-30`]: true,
  };

  return !!holidays[date];
};


/*
|--------------------------------------------------------------------------
| GET ALL APPOINTMENTS (STAFF VIEW)
|--------------------------------------------------------------------------
*/
/*
|---------------------------------------------------------------------------
| CREATE APPOINTMENT
|---------------------------------------------------------------------------
| - Prevent double booking (same user, same slot)
| - Prevent booking on holidays
| - Lock time slot
| - Reduce slot & daily availability
*/
router.post("/", (req, res) => {
  const {
    user_id,
    service_id,
    service,
    doctor,
    date,
    time,
    patient_name,
    patient_age,
    patient_notes,
  } = req.body;

  const appointmentDateTime = new Date(`${date} ${time}`);
  const now = new Date();

  if (appointmentDateTime < now) {
    return res.json({
      success: false,
      message: "Cannot book appointment in the past",
    });
  }

  if (isHoliday(date)) {
    return res.json({
      success: false,
      message: "Appointments cannot be booked on holidays",
    });
  }

  if (
    !user_id ||
    !service_id ||
    !doctor ||
    !date ||
    !time ||
    !patient_name ||
    !patient_age
  ) {
    return res.json({ success: false, message: "Missing fields" });
  }

  // ✅ GET CONNECTION FROM POOL
  db.getConnection((err, conn) => {
    if (err) return res.status(500).json({ success: false });

    conn.beginTransaction((err) => {
      if (err) {
        conn.release();
        return res.status(500).json({ success: false });
      }

      const lockSlotSql = `
        SELECT id, total_slots, booked_slots
        FROM doctor_time_slots
        WHERE doctor_id = ? AND DATE(date) = ? AND time = ?
        FOR UPDATE
      `;

      conn.query(lockSlotSql, [doctor, date, time], (err, slots) => {
        if (err || slots.length === 0) {
          return conn.rollback(() => {
            conn.release();
            res.json({ success: false, message: "Slot not found" });
          });
        }

        const slot = slots[0];

        if (slot.booked_slots >= slot.total_slots) {
          return conn.rollback(() => {
            conn.release();
            res.json({ success: false, message: "Slot full" });
          });
        }

        const insertSql = `
          INSERT INTO appointments
          (user_id, service_id, service, doctor, date, time, patient_name, patient_age, patient_notes, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
        `;

        conn.query(
          insertSql,
          [
            user_id,
            service_id,
            service,
            doctor,
            date,
            time,
            patient_name,
            patient_age,
            patient_notes || null,
          ],
          (err) => {
            if (err) {
              return conn.rollback(() => {
                conn.release();
                res.json({ success: false, message: "Insert failed" });
              });
            }

            conn.query(
              `
              UPDATE doctor_time_slots
              SET booked_slots = booked_slots + 1
              WHERE id = ?
              `,
              [slot.id],
              (err) => {
                if (err) {
                  return conn.rollback(() => {
                    conn.release();
                    res.json({ success: false });
                  });
                }

                conn.query(
                  `
                  UPDATE doctor_availability
                  SET booked_slots = booked_slots + 1
                  WHERE doctor_id = ? AND DATE(date) = ?
                  `,
                  [doctor, date],
                  (err) => {
                    if (err) {
                      return conn.rollback(() => {
                        conn.release();
                        res.json({ success: false });
                      });
                    }

                    conn.commit((err) => {
                      conn.release();

                      if (err) {
                        return res.json({ success: false });
                      }

                      res.json({ success: true });
                    });
                  }
                );
              }
            );
          }
        );
      });
    });
  });
});




/*
|--------------------------------------------------------------------------
| EDIT APPOINTMENT (PENDING ONLY)
|--------------------------------------------------------------------------
*/
router.put("/:id", (req, res) => {
  const { id } = req.params;
  const {
    service,
    doctor,
    date,
    time,
    patient_name,
    patient_age,
    patient_notes,
  } = req.body;

  const appointmentDateTime = new Date(`${date} ${time}`);
  const now = new Date();

  if (appointmentDateTime < now) {
    return res.json({
      success: false,
      message: "Cannot reschedule to past time",
    });
  }

  if (!service || !doctor || !date || !time || !patient_name || !patient_age) {
    return res.json({ success: false, message: "Missing fields" });
  }

  db.getConnection((err, conn) => {
    if (err) return res.json({ success: false });

    conn.beginTransaction((err) => {
      if (err) {
        conn.release();
        return res.json({ success: false });
      }

      // 1️⃣ Get old appointment info
      conn.query(
        "SELECT doctor, date, time, status FROM appointments WHERE id = ?",
        [id],
        (err, rows) => {
          if (err || rows.length === 0) {
            return conn.rollback(() => {
              conn.release();
              res.json({ success: false, message: "Appointment not found" });
            });
          }

          const oldAppt = rows[0];

          if (oldAppt.status !== "pending") {
            return conn.rollback(() => {
              conn.release();
              res.json({
                success: false,
                message: "Only pending appointments can be edited",
              });
            });
          }

          // 2️⃣ Restore OLD slot
          conn.query(
            `UPDATE doctor_time_slots
             SET booked_slots = booked_slots - 1
             WHERE doctor_id = ?
               AND DATE(date) = ?
               AND time = ?
               AND booked_slots > 0`,
            [oldAppt.doctor, oldAppt.date, oldAppt.time],
            (err) => {
              if (err) {
                return conn.rollback(() => {
                  conn.release();
                  res.json({ success: false });
                });
              }

              // 3️⃣ Lock NEW slot
              conn.query(
                `SELECT id, total_slots, booked_slots
                 FROM doctor_time_slots
                 WHERE doctor_id = ?
                   AND DATE(date) = ?
                   AND time = ?
                 FOR UPDATE`,
                [doctor, date, time],
                (err, slotRows) => {
                  if (err || slotRows.length === 0) {
                    return conn.rollback(() => {
                      conn.release();
                      res.json({ success: false, message: "New slot not found" });
                    });
                  }

                  const newSlot = slotRows[0];

                  if (newSlot.booked_slots >= newSlot.total_slots) {
                    return conn.rollback(() => {
                      conn.release();
                      res.json({ success: false, message: "New slot is full" });
                    });
                  }

                  // 4️⃣ Deduct NEW slot
                  conn.query(
                    `UPDATE doctor_time_slots
                     SET booked_slots = booked_slots + 1
                     WHERE id = ?`,
                    [newSlot.id],
                    (err) => {
                      if (err) {
                        return conn.rollback(() => {
                          conn.release();
                          res.json({ success: false });
                        });
                      }

                      // 5️⃣ Update appointment
                      conn.query(
                        `UPDATE appointments
                         SET service = ?,
                             doctor = ?,
                             date = ?,
                             time = ?,
                             patient_name = ?,
                             patient_age = ?,
                             patient_notes = ?,
                             reminder_sent = 0
                         WHERE id = ?`,
                        [
                          service,
                          doctor,
                          date,
                          time,
                          patient_name,
                          patient_age,
                          patient_notes || null,
                          id,
                        ],
                        (err) => {
                          if (err) {
                            return conn.rollback(() => {
                              conn.release();
                              res.json({ success: false });
                            });
                          }

                          conn.commit(() => {
                            conn.release();
                            res.json({ success: true });
                          });
                        }
                      );
                    }
                  );
                }
              );
            }
          );
        }
      );
    });
  });
});


/*
|--------------------------------------------------------------------------
| CANCEL APPOINTMENT (PENDING / APPROVED)
|--------------------------------------------------------------------------
*/
router.put("/:id/cancel", (req, res) => {
  const { id } = req.params;

  db.getConnection((err, conn) => {
    if (err) return res.json({ success: false });

    conn.beginTransaction((err) => {
      if (err) {
        conn.release();
        return res.json({ success: false });
      }

      conn.query(
        `SELECT status, doctor, date, time, user_id
         FROM appointments
         WHERE id = ?`,
        [id],
        (err, rows) => {
          if (err || rows.length === 0) {
            return conn.rollback(() => {
              conn.release();
              res.json({ success: false, message: "Appointment not found" });
            });
          }

          const appt = rows[0];

          const apptDateTime = new Date(`${appt.date} ${appt.time}`);
          if (apptDateTime < new Date()) {
            return conn.rollback(() => {
              conn.release();
              res.json({
                success: false,
                message: "Cannot cancel past appointment",
              });
            });
          }

          if (!["pending", "approved"].includes(appt.status)) {
            return conn.rollback(() => {
              conn.release();
              res.json({
                success: false,
                message: "Cannot cancel appointment",
              });
            });
          }

          conn.query(
            `UPDATE appointments
             SET status = 'cancelled', 
                 arrived = 0, 
                 reminder_sent = 1
             WHERE id = ?`,
            [id],
            (err) => {
              if (err) {
                return conn.rollback(() => {
                  conn.release();
                  res.json({ success: false });
                });
              }

              conn.query(
                `UPDATE doctor_time_slots
                 SET booked_slots = booked_slots - 1
                 WHERE doctor_id = ?
                 AND DATE(date) = ?
                 AND time = ?
                 AND booked_slots > 0`,
                [appt.doctor, appt.date, appt.time],
                (err) => {
                  if (err) {
                    return conn.rollback(() => {
                      conn.release();
                      res.json({ success: false });
                    });
                  }

                  conn.query(
                    `UPDATE doctor_availability
                     SET booked_slots = booked_slots - 1
                     WHERE doctor_id = ?
                     AND DATE(date) = ?`,
                    [appt.doctor, appt.date],
                    (err) => {
                      if (err) {
                        return conn.rollback(() => {
                          conn.release();
                          res.json({ success: false });
                        });
                      }

                      conn.query(
                        "SELECT push_token FROM users WHERE id = ?",
                        [appt.user_id],
                        async (err, userRows) => {
                          if (!err && userRows.length > 0) {
                            const pushToken = userRows[0].push_token;

                            if (pushToken) {
                              await sendPushNotification(
                                pushToken,
                                "Appointment Cancelled ❌",
                                "Your appointment has been cancelled. Contact the clinic for more info"
                              );
                            }
                          }

                          conn.commit((err) => {
                            conn.release();

                            if (err) {
                              return res.json({ success: false });
                            }

                            res.json({ success: true });
                          });
                        }
                      );
                    }
                  );
                }
              );
            }
          );
        }
      );
    });
  });
});





/*
|--------------------------------------------------------------------------
| GET DOCTOR / STAFF APPOINTMENTS
|--------------------------------------------------------------------------
*/
router.get("/doctor/:doctor_id", (req, res) => {
  const { doctor_id } = req.params;

  db.query(
    `SELECT *
     FROM appointments
     WHERE doctor = ?
     ORDER BY date ASC, time ASC`,
    [doctor_id],
    (err, results) => {
      if (err) {
        console.error(err);
        return res.json({ success: false });
      }

      res.json({
        success: true,
        appointments: results,
      });
    }
  );
});


/*
|--------------------------------------------------------------------------
| APPROVE APPOINTMENT (STAFF)
|--------------------------------------------------------------------------
*/

// Helper — convert time to 24h
function convertTo24Hour(timeStr) {
  if (!timeStr) return "00:00:00";

  const parts = timeStr.trim().split(" ");
  if (parts.length === 1) return parts[0] + ":00";

  const [time, modifier] = parts;
  let [hours, minutes] = time.split(":");

  hours = parseInt(hours, 10);

  if (modifier.toUpperCase() === "PM" && hours !== 12) hours += 12;
  if (modifier.toUpperCase() === "AM" && hours === 12) hours = 0;

  return `${String(hours).padStart(2, "0")}:${minutes}:00`;
}

router.put("/:id/approve", (req, res) => {
  const { id } = req.params;

  console.log("✅ APPROVE HIT:", id);

  db.query(
    "SELECT date, time FROM appointments WHERE id = ?",
    [id],
    (err, rows) => {
      if (err || rows.length === 0) {
        console.log("❌ Appointment not found");
        return res.json({ success: false });
      }

      const appointmentTime24 = convertTo24Hour(rows[0].time);

      // SAFE DATE BUILD (fix timezone bug)
      const dateOnly = rows[0].date.toISOString().slice(0, 10);
      const apptDateTime = new Date(`${dateOnly}T${appointmentTime24}`);
      const now = new Date();

      console.log("📅 Approve check:", apptDateTime, now);

      if (apptDateTime < now) {
        return res.json({
          success: false,
          message: "Cannot approve past appointment",
        });
      }

      db.query(
        `UPDATE appointments
         SET status = 'approved',
             reminder_sent = 0
         WHERE id = ? AND status = 'pending'`,
        [id],
        (err, result) => {
          if (err || result.affectedRows === 0) {
            console.log("❌ Update failed");
            return res.json({
              success: false,
              message: "Cannot approve appointment",
            });
          }

          db.query(
            `SELECT a.*, u.push_token, d.name AS doctor_name
             FROM appointments a
             JOIN users u ON u.id = a.user_id
             LEFT JOIN doctors d ON d.id = a.doctor
             WHERE a.id = ?`,
            [id],
            async (err, rows) => {
              if (err || rows.length === 0) {
                return res.json({ success: true });
              }

              const appt = rows[0];

              // Save notification
              db.query(
                `INSERT INTO notifications (user_id, title, message, is_read)
                 VALUES (?, ?, ?, 0)`,
                [
                  appt.user_id,
                  "Appointment Approved",
                  "Your appointment has been approved by the clinic.",
                ]
              );

              // Approval push
              if (appt.push_token) {
                await sendPushNotification(
                  appt.push_token,
                  "Appointment Approved ✅",
                  "Your appointment has been approved by the clinic."
                );
              }

              // ⭐ Instant reminder check
              const appointmentTime24 = convertTo24Hour(appt.time);
              const dateOnly = appt.date.toISOString().slice(0, 10);

              const apptDateTime = new Date(`${dateOnly}T${appointmentTime24}`);
              const now = new Date();

              const diffMinutes = (apptDateTime - now) / (1000 * 60);

              console.log("⏱ Instant diff:", diffMinutes);

              if (diffMinutes >= -10 && diffMinutes <= 60 && appt.push_token) {
                const message = `Reminder: You have an appointment for ${appt.service} with ${appt.doctor_name} at ${appt.time} today`;

                await sendPushNotification(
                  appt.push_token,
                  "🔔 Mediq Reminder",
                  message
                );

                console.log("⚡ Instant reminder sent:", id);
              }

              res.json({ success: true });
            }
          );
        }
      );
    }
  );
});

/*
|--------------------------------------------------------------------------
| COMPLETE APPOINTMENT (STAFF)
|--------------------------------------------------------------------------
*/
router.put("/:id/complete", (req, res) => {
  const { id } = req.params;

  // 1️⃣ Update status
  db.query(
    `UPDATE appointments
     SET status = 'completed',
     arrived = 0,
      reminder_sent = 1
     WHERE id = ? AND status = 'approved'`,
    [id],
    (err, result) => {
      if (err || result.affectedRows === 0) {
        return res.json({
          success: false,
          message: "Cannot complete appointment",
        });
      }

      // 2️⃣ Get user_id
      db.query(
        "SELECT user_id FROM appointments WHERE id = ?",
        [id],
        async (err, rows) => {
          if (!err && rows.length > 0) {
            const userId = rows[0].user_id;

            // 3️⃣ Get push token
            db.query(
              "SELECT push_token FROM users WHERE id = ?",
              [userId],
              async (err, userRows) => {
                if (!err && userRows.length > 0) {
                  const pushToken = userRows[0].push_token;

                  if (pushToken) {
                    await sendPushNotification(
                      pushToken,
                      "Appointment Completed 🏥",
                      "Your appointment has been marked as completed."
                    );
                  }
                }

                res.json({ success: true });
              }
            );
          } else {
            res.json({ success: true });
          }
        }
      );
    }
  );
});

/*
|--------------------------------------------------------------------------
| GET SINGLE APPOINTMENT (FOR EDIT)
|--------------------------------------------------------------------------
*/
router.get("/single/:id", (req, res) => {
  const { id } = req.params;

  db.query(
    "SELECT * FROM appointments WHERE id = ?",
    [id],
    (err, rows) => {
      if (err || rows.length === 0) {
        return res.json({ success: false });
      }

      res.json({
        success: true,
        appointment: rows[0],
      });
    }
  );
});

/*
|--------------------------------------------------------------------------|
| GET ALL APPOINTMENTS (STAFF)
|--------------------------------------------------------------------------|
*/
router.get("/", (req, res) => {
  db.query(
    `
    SELECT 
      a.*,
      d.name AS doctor_name,
      d.specialty AS doctor_specialty
    FROM appointments a
    LEFT JOIN doctors d ON d.id = a.doctor
    ORDER BY a.date DESC, a.time DESC
    `,
    (err, results) => {
      if (err) {
        console.error("STAFF APPOINTMENTS ERROR:", err);
        return res.status(500).json({ success: false });
      }

      res.json({
        success: true,
        appointments: results,
      });
    }
  );
});

router.get("/user/:user_id", (req, res) => {
  const { user_id } = req.params;
  const page = Number(req.query.page) || 1;
  const limit = 10;
  const offset = (page - 1) * limit;

  db.query(
    `
    SELECT 
      a.*,
      d.name AS doctor_name,
       d.specialty AS doctor_specialty
    FROM appointments a
    LEFT JOIN doctors d ON d.id = a.doctor
    WHERE a.user_id = ?
    ORDER BY a.date DESC, a.time DESC
    LIMIT ? OFFSET ?
    `,
    [user_id, limit, offset],
    (err, results) => {
      if (err) {
        return res.status(500).json({ success: false });
      }

      res.json({
        success: true,
        appointments: results,
        page,
      });
    }
  );
});

/*
|--------------------------------------------------
| UPDATE STATUS (ARRIVED / NO SHOW)
|--------------------------------------------------
*/
router.put("/:id/status", (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const allowed = ["arrived", "no_show", "completed"];

  if (!allowed.includes(status)) {
    return res.json({ success: false, message: "Invalid status" });
  }

  db.query(
    "UPDATE appointments SET status = ? WHERE id = ?",
    [status, id],
    (err) => {
      if (err) {
        console.error(err);
        return res.json({ success: false });
      }

      res.json({ success: true });
    }
  );
});


module.exports = router;
