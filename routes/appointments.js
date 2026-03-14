const express = require("express");
const db = require("../db");
const { sendPushNotification } = require("../pushNotification");

const router = express.Router();
function convertTo24Hour(timeStr) {
  if (!timeStr) return "00:00:00";

  timeStr = timeStr.replace(/\s+/gu, " ").trim();

  const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return "00:00:00";

  let [_, h, m, mod] = match;

  h = parseInt(h, 10);
  if (mod.toUpperCase() === "PM" && h !== 12) h += 12;
  if (mod.toUpperCase() === "AM" && h === 12) h = 0;

  return `${String(h).padStart(2, "0")}:${m}:00`;
}

function formatPH(dateStr, timeStr) {
  const time24 = convertTo24Hour(timeStr);

  const phDate = new Date(`${dateStr}T${time24}+08:00`);

  return phDate.toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

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
    patient_birthdate,
    patient_age,
    patient_gender,          
    connection_to_clinic, 
    patient_notes,
  } = req.body;

  const appointmentDateTime = new Date(`${date}T${convertTo24Hour(time)}+08:00`);
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
    !patient_birthdate ||
    !patient_age ||
    !patient_gender ||            
    !connection_to_clinic 
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

        // ✅ NEW: CHECK IF SAME USER ALREADY BOOKED THIS SLOT
        const duplicateSql = `
        SELECT id
        FROM appointments
        WHERE user_id = ?
        AND doctor = ?
        AND date = ?
        AND time = ?
        AND status != 'cancelled'
        LIMIT 1
      `;

      conn.query(duplicateSql, [user_id, doctor, date, time], (err, dupRows) => {

        if (err) {
          return conn.rollback(() => {
            conn.release();
            res.json({ success: false });
          });
        }

        // 🚫 SAME USER DUPLICATE SLOT
        if (dupRows.length > 0) {
          return conn.rollback(() => {
            conn.release();
            res.json({
              success: false,
              message: "You already have an appointment at this time slot",
            });
          });
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
          (user_id, service_id, service, doctor, date, time, patient_name, patient_birthdate, patient_age, patient_gender, connection_to_clinic, patient_notes, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
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
            patient_birthdate,
            patient_age,
            patient_gender,
            connection_to_clinic,
            patient_notes || null,
          ],
          (err) => {
            if (err) {
              console.error("INSERT ERROR:", err);   // ⭐ ADD THIS
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
                    
                      // ✅ Save staff notification (in app list)
                      db.query(
                        `INSERT INTO staff_notifications (title, message)
                         VALUES (?, ?)`,
                        [
                          "New Appointment 📅",
                          `New booking: ${patient_name} scheduled on ${date} at ${time}`
                        ]
                      );
                    
                      // ✅ PUSH to ALL STAFF
                      db.query(
                        "SELECT push_token FROM users WHERE role = 'staff'",
                        async (err, rows) => {
                          if (!err && rows.length > 0) {
                            for (const staff of rows) {
                              if (staff.push_token) {
                                await sendPushNotification(
                                  staff.push_token,
                                  "New Appointment 📅",
                                  `${patient_name} booked for ${formatPH(date, time)}`
                                );
                              }
                            }
                          }
                        }
                      );
                      // 🔔 PUSH TO PATIENT
                      db.query(
                        "SELECT push_token FROM users WHERE id = ?",
                        [user_id],
                        async (err, rows) => {
                          if (!err && rows.length > 0 && rows[0].push_token) {
                            await sendPushNotification(
                              rows[0].push_token,
                              "Appointment Requested 📅",
                              `Your appointment for ${service} on ${formatPH(date, time)} is pending approval`
                            );
                          }
                        }
                      );
                      
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
});




/*
|--------------------------------------------------
| EDIT / RESCHEDULE APPOINTMENT (SAFE)
|--------------------------------------------------
*/
router.put("/:id", (req, res) => {
  const { id } = req.params;
  const {
    service_id,
    service,
    doctor,
    date,
    time,
    patient_name,
    patient_birthdate,
    patient_age,
    patient_gender,         
    connection_to_clinic, 
    patient_notes,
  } = req.body;

  if (
    !service_id ||
    !service ||
    !doctor ||
    !date ||
    !time ||
    !patient_name ||
    !patient_birthdate ||
    !patient_age ||
    !patient_gender ||
    !connection_to_clinic
  ) {
    return res.json({ success: false, message: "Missing fields" });
  }

  const appointmentDateTime = new Date(`${date}T${convertTo24Hour(time)}+08:00`);
  if (appointmentDateTime < new Date()) {
    return res.json({ success: false, message: "Cannot reschedule to past time" });
  }

  db.getConnection((err, conn) => {
    if (err) return res.json({ success: false });

    conn.beginTransaction(err => {
      if (err) {
        conn.release();
        return res.json({ success: false });
      }

      conn.query(
        "SELECT doctor, date, time, status FROM appointments WHERE id = ?",
        [id],
        (err, rows) => {
          if (err || rows.length === 0) {
            return conn.rollback(() => {
              conn.release();
              res.json({ success: false });
            });
          }

          const oldAppt = rows[0];

          if (oldAppt.status !== "pending") {
            return conn.rollback(() => {
              conn.release();
              res.json({ success: false, message: "Only pending appointments can be rescheduled" });
            });
          }

          conn.query(
            `UPDATE doctor_time_slots
             SET booked_slots = GREATEST(booked_slots - 1, 0)
             WHERE doctor_id = ? AND DATE(date) = ? AND time = ? AND booked_slots > 0`,
            [oldAppt.doctor, oldAppt.date, oldAppt.time],
            err => {
              if (err) {
                return conn.rollback(() => {
                  conn.release();
                  res.json({ success: false });
                });
              }

              conn.query(
                `UPDATE doctor_availability
                 SET booked_slots = booked_slots - 1
                 WHERE doctor_id = ? AND DATE(date) = ?`,
                [oldAppt.doctor, oldAppt.date],
                err => {
                  if (err) {
                    return conn.rollback(() => {
                      conn.release();
                      res.json({ success: false });
                    });
                  }

                  conn.query(
                    `SELECT id, total_slots, booked_slots
                     FROM doctor_time_slots
                     WHERE doctor_id = ? AND DATE(date) = ? AND time = ?
                     FOR UPDATE`,
                    [doctor, date, time],
                    (err, slotRows) => {
                      if (err || slotRows.length === 0) {
                        return conn.rollback(() => {
                          conn.release();
                          res.json({ success: false });
                        });
                      }

                      const slot = slotRows[0];

                      if (slot.booked_slots >= slot.total_slots) {
                        return conn.rollback(() => {
                          conn.release();
                          res.json({ success: false, message: "Slot full" });
                        });
                      }

                      conn.query(
                        `UPDATE doctor_time_slots
                         SET booked_slots = booked_slots + 1
                         WHERE id = ?`,
                        [slot.id],
                        err => {
                          if (err) {
                            return conn.rollback(() => {
                              conn.release();
                              res.json({ success: false });
                            });
                          }

                          conn.query(
                            `UPDATE doctor_availability
                             SET booked_slots = booked_slots + 1
                             WHERE doctor_id = ? AND DATE(date) = ?`,
                            [doctor, date],
                            err => {
                              if (err) {
                                return conn.rollback(() => {
                                  conn.release();
                                  res.json({ success: false });
                                });
                              }

                              conn.query(
                                `UPDATE appointments
                                 SET service_id=?, service=?, doctor=?, date=?, time=?,
                                     patient_name=?, patient_birthdate=?, patient_age=?,  patient_gender=?, connection_to_clinic=?, 
                                     patient_notes=?,
                                     rescheduled=1, reminder_sent=0
                                 WHERE id=?`,
                                [
                                  service_id,
                                  service,
                                  doctor,
                                  date,
                                  time,
                                  patient_name,
                                  patient_birthdate,
                                  patient_age,
                                  patient_gender,
                                  connection_to_clinic,
                                  patient_notes || null,
                                  id,
                                ],
                                err => {
                                  if (err) {
                                    return conn.rollback(() => {
                                      conn.release();
                                      res.json({ success: false });
                                    });
                                  }

                                  conn.commit(async err => {
                                    conn.release();
                                  
                                    if (err) return res.json({ success: false });
                                  
                                    // ✅ Save staff notification
                                    db.query(
                                      `INSERT INTO staff_notifications (title,message)
                                       VALUES (?,?)`,
                                      [
                                        "Patient Rescheduled 🔄",
                                        `Appointment ID ${id} moved to ${date} ${time}`,
                                      ]
                                    );
                                  
                                    // 🔔 PUSH TO STAFF
                                    db.query(
                                      "SELECT push_token FROM users WHERE role = 'staff'",
                                      async (err, staffRows) => {
                                        if (!err && staffRows.length > 0) {
                                          for (const staff of staffRows) {
                                            if (staff.push_token) {
                                              await sendPushNotification(
                                                staff.push_token,
                                                "Patient Rescheduled 🔄",
                                                `Appointment moved to ${date} at ${time}`
                                              );
                                            }
                                          }
                                        }
                                      }
                                    );
                                  
                                    // 🔔 PUSH TO PATIENT
                                    db.query(
                                      "SELECT a.user_id, u.push_token FROM appointments a JOIN users u ON u.id=a.user_id WHERE a.id=?",
                                      [id],
                                      async (err, rows) => {
                                        if (!err && rows.length > 0 && rows[0].push_token) {
                                          await sendPushNotification(
                                            rows[0].push_token,
                                            "Appointment Rescheduled 🔄",
                                            `Your appointment is now ${formatPH(date, time)}`
                                          );
                                        }
                                      }
                                    );
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
  const staffId = req.headers["x-user-id"];

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
                cancelled_by = ?,
                 arrived = 0, 
                 reminder_sent = 1
             WHERE id = ?`,
             [staffId, id],
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
                          db.query(
                            `INSERT INTO notifications (user_id, title, message, is_read)
                             VALUES (?, ?, ?, 0)`,
                            [
                              appt.user_id,
                              "Appointment Cancelled",
                              "Your appointment has been cancelled, please contact (Contact Us) the clinic for more info"
                            ]
                          );

                          conn.commit((err) => {
                            conn.release();

                            if (err) {
                              return res.json({ success: false });
                            }
                            db.query(
                              `INSERT INTO staff_notifications (title, message)
                               VALUES (?, ?)`,
                               [
                                "Appointment Cancelled ❌",
                                `Appointment ID ${id} was cancelled`
                              ]
                            );

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
router.put("/:id/approve", (req, res) => {
  const { id } = req.params;
  const staffId = req.headers["x-user-id"];

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

      // ✅ SIMPLE — NO timezone math
      const apptDateTime = new Date(`${rows[0].date}T${appointmentTime24}+08:00`);
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
         approved_by = ?,
            rescheduled = 0,
            reminder_sent = 0
         WHERE id = ? AND status = 'pending'`,
         [staffId, id],
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

              // save notification
              db.query(
                `INSERT INTO notifications (user_id, title, message, is_read)
                 VALUES (?, ?, ?, 0)`,
                [
                  appt.user_id,
                  "Appointment Approved",
                  "Your appointment has been approved by the clinic.",
                ]
              );

              // approval push
              if (appt.push_token) {
                await sendPushNotification(
                  appt.push_token,
                  "Appointment Approved ✅",
                  "Your appointment has been approved by the clinic."
                );
              }

              // instant reminder
              const appointmentTime24 = convertTo24Hour(appt.time);
              const apptDateTime = new Date(`${appt.date}T${appointmentTime24}+08:00`);
              const now = new Date();

              const diffMinutes = (apptDateTime - now) / (1000 * 60);

              console.log("⏱ Instant diff:", diffMinutes);

              if (diffMinutes >= -10 && diffMinutes <= 60 && appt.push_token) {
                const message = `Reminder: You have an appointment for ${appt.service} with ${appt.doctor_name} at ${formatPH(appt.date, appt.time)}`;

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
  const staffId = req.headers["x-user-id"];

  db.getConnection((err, conn) => {
    if (err) return res.json({ success: false });

    conn.beginTransaction((err) => {
      if (err) {
        conn.release();
        return res.json({ success: false });
      }

      conn.query(
        `UPDATE appointments
         SET status = 'completed',
             completed_by = ?,
             arrived = 0,
             reminder_sent = 1
         WHERE id = ? AND status IN ('approved','arrived')`,
         [staffId, id],
        (err, result) => {
          if (err || result.affectedRows === 0) {
            return conn.rollback(() => {
              conn.release();
              res.json({
                success: false,
                message: "Cannot complete appointment",
              });
            });
          }

          conn.query(
            `SELECT user_id, patient_name FROM appointments WHERE id = ?`,
            [id],
            (err, rows) => {
              if (err || rows.length === 0) {
                return conn.rollback(() => {
                  conn.release();
                  res.json({ success: false });
                });
              }

              const userId = rows[0].user_id;
              const patientName = rows[0].patient_name;

              conn.query(
                "SELECT push_token FROM users WHERE id = ?",
                [userId],
                async (err, userRows) => {
                  if (!err && userRows.length > 0) {
                    const pushToken = userRows[0].push_token;

                    if (pushToken) {
                      try {
                        await sendPushNotification(
                          pushToken,
                          "Appointment Completed 🏥",
                          `Your appointment for ${patientName} has been completed.`
                        );
                      } catch (e) {
                        console.log("Push error:", e);
                      }
                    }
                  }

                  // patient notification
                  conn.query(
                    `INSERT INTO notifications (user_id, title, message, is_read)
                     VALUES (?, ?, ?, 0)`,
                    [
                      userId,
                      "Appointment Completed",
                      "Your appointment has been completed. Thank you!",
                    ]
                  );

                  // staff notification
                  conn.query(
                    `INSERT INTO staff_notifications (title, message)
                     VALUES (?, ?)`,
                    [
                      "Appointment Completed 🏥",
                      `Appointment ID ${id} marked as completed`,
                    ]
                  );

                  conn.commit((err) => {
                    conn.release();

                    if (err) return res.json({ success: false });

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
       u.name AS account_name,  
      u.phone AS patient_phone,
      d.name AS doctor_name,
      d.specialty AS doctor_specialty
    FROM appointments a
    LEFT JOIN doctors d ON d.id = a.doctor
    LEFT JOIN users u ON u.id = a.user_id
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

  const staffId = req.headers["x-user-id"];

  const allowed = ["arrived", "no_show"];

  if (!allowed.includes(status)) {
    return res.json({ success: false, message: "Invalid status" });
  }

  let column = null;

  if (status === "arrived") column = "arrived_by";
  if (status === "no_show") column = "no_show_by";

  db.query(
    `UPDATE appointments
     SET status = ?, ${column} = ?
     WHERE id = ?`,
    [status, staffId, id],
    (err) => {
      if (err) {
        console.error(err);
        return res.json({ success: false });
      }

      // 🔔 PUSH TO PATIENT
      db.query(
        `SELECT a.user_id, u.push_token
         FROM appointments a
         JOIN users u ON u.id = a.user_id
         WHERE a.id = ?`,
        [id],
        async (err, rows) => {
          if (!err && rows.length > 0 && rows[0].push_token) {
            await sendPushNotification(
              rows[0].push_token,
              "Appointment Status Update",
              `Your appointment status is now ${status.replace("_", " ")}`
            );
          }
        }
      );

      res.json({ success: true });
    }
  );
});
/*
|--------------------------------------------------
| STAFF RESCHEDULE APPOINTMENT
|--------------------------------------------------
*/

router.put("/:id/staff-reschedule", (req, res) => {
  const { id } = req.params;
  const { doctor, date, time } = req.body;
  const staffId = req.headers["x-user-id"];

  if (!doctor || !date || !time) {
    return res.json({ success: false, message: "Missing fields" });
  }

  db.getConnection((err, conn) => {
    if (err) return res.json({ success: false });

    conn.beginTransaction(err => {
      if (err) {
        conn.release();
        return res.json({ success: false });
      }

      conn.query(
        "SELECT doctor, date, time, user_id FROM appointments WHERE id = ?",
        [id],
        (err, rows) => {
          if (err || rows.length === 0) {
            return conn.rollback(() => {
              conn.release();
              res.json({ success: false });
            });
          }

          const old = rows[0];

          conn.query(
            `UPDATE doctor_time_slots
             SET booked_slots = booked_slots - 1
             WHERE doctor_id=? AND DATE(date)=? AND time=? AND booked_slots>0`,
            [old.doctor, old.date, old.time],
            err => {
              if (err) {
                return conn.rollback(() => {
                  conn.release();
                  res.json({ success: false });
                });
              }

              conn.query(
                `UPDATE doctor_availability
                 SET booked_slots = booked_slots - 1
                 WHERE doctor_id=? AND DATE(date)=?`,
                [old.doctor, old.date],
                err => {
                  if (err) {
                    return conn.rollback(() => {
                      conn.release();
                      res.json({ success: false });
                    });
                  }

                  conn.query(
                    `SELECT id,total_slots,booked_slots
                     FROM doctor_time_slots
                     WHERE doctor_id=? AND DATE(date)=? AND time=?
                     FOR UPDATE`,
                    [doctor, date, time],
                    (err, slotRows) => {
                      if (err || slotRows.length === 0) {
                        return conn.rollback(() => {
                          conn.release();
                          res.json({ success: false });
                        });
                      }

                      const slot = slotRows[0];

                      if (slot.booked_slots >= slot.total_slots) {
                        return conn.rollback(() => {
                          conn.release();
                          res.json({ success: false, message: "Slot full" });
                        });
                      }

                      conn.query(
                        `UPDATE doctor_time_slots
                         SET booked_slots = booked_slots + 1
                         WHERE id=?`,
                        [slot.id],
                        err => {
                          if (err) {
                            return conn.rollback(() => {
                              conn.release();
                              res.json({ success: false });
                            });
                          }

                          conn.query(
                            `UPDATE doctor_availability
                             SET booked_slots = booked_slots + 1
                             WHERE doctor_id=? AND DATE(date)=?`,
                            [doctor, date],
                            err => {
                              if (err) {
                                return conn.rollback(() => {
                                  conn.release();
                                  res.json({ success: false });
                                });
                              }

                              conn.query(
                                `UPDATE appointments
                                 SET doctor=?, date=?, time=?, rescheduled=1, rescheduled_by=?, reminder_sent=0
                                 WHERE id=?`,
                                 [doctor, date, time, staffId, id],
                                err => {
                                  if (err) {
                                    return conn.rollback(() => {
                                      conn.release();
                                      res.json({ success: false });
                                    });
                                  }

                                  conn.commit(err => {
                                    conn.release();

                                    if (err) return res.json({ success: false });

                                    // ✅ STAFF LOG
                                    db.query(
                                      `INSERT INTO staff_notifications (title,message)
                                       VALUES (?,?)`,
                                      [
                                        "Staff Rescheduled 🔄",
                                        `Appointment ${id} moved to ${date} ${time}`,
                                      ]
                                    );

                                    // ✅ PATIENT NOTIFICATION
                                    db.query(
                                      `INSERT INTO notifications (user_id,title,message,is_read)
                                       VALUES (?,?,?,0)`,
                                      [
                                        old.user_id,
                                        "Appointment Rescheduled",
                                        `Clinic moved your appointment to ${date} ${time}`,
                                      ]
                                    );
                                    // 🔔 PUSH TO PATIENT
                                    db.query(
                                      "SELECT push_token FROM users WHERE id = ?",
                                      [old.user_id],
                                      async (err, rows) => {
                                        if (!err && rows.length > 0 && rows[0].push_token) {
                                          await sendPushNotification(
                                            rows[0].push_token,
                                            "Appointment Rescheduled 🔄",
                                            `Clinic moved your appointment to ${formatPH(date, time)}`
                                          );
                                        }
                                      }
                                    );

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
            }
          );
        }
      );
    });
  });
});

/*
|--------------------------------------------------
| CHECK DUPLICATE BOOKING (SAME USER SAME SLOT)
|--------------------------------------------------
*/
router.get("/check-duplicate", (req, res) => {

  const { user_id, doctor, date, time } = req.query;

  if (!user_id || !doctor || !date || !time) {
    return res.json({ duplicate: false });
  }

  db.query(
    `SELECT id
     FROM appointments
     WHERE user_id = ?
     AND doctor = ?
     AND date = ?
     AND time = ?
     AND status != 'cancelled'
     LIMIT 1`,
    [user_id, doctor, date, time],
    (err, rows) => {

      if (err) {
        console.error("Duplicate check error:", err);
        return res.json({ duplicate: false });
      }

      res.json({
        duplicate: rows.length > 0
      });

    }
  );

});
module.exports = router;
