const db = require("./db");
const { sendPushNotification } = require("./pushNotification");
const { sendPushIfAllowed } = require("./routes/appointments");
const sentTodayReminders = new Set();
const sentReminders = new Set();
/*
|-----------------------------------------------------------
| Convert time safely (handles Unicode spaces)
|-----------------------------------------------------------
*/
function convertTo24Hour(timeStr) {
  if (!timeStr) return null;

  // normalize ANY whitespace (unicode safe)
  timeStr = timeStr.replace(/\s+/gu, " ").trim();

  const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);

  if (!match) {
    console.log("⚠️ Bad time format:", JSON.stringify(timeStr));
    return null;
  }

  let [_, hours, minutes, modifier] = match;

  hours = parseInt(hours, 10);

  if (modifier.toUpperCase() === "PM" && hours !== 12) hours += 12;
  if (modifier.toUpperCase() === "AM" && hours === 12) hours = 0;

  return `${String(hours).padStart(2, "0")}:${minutes}:00`;
}

/*
|-----------------------------------------------------------
| Reminder Worker
|-----------------------------------------------------------
*/
function startReminderWorker() {
  console.log("🕒 Reminder worker running...");

  setInterval(() => {
    console.log("🔎 Checking appointment reminders...");

    const sql = `
      SELECT 
        a.id,
         a.user_id, 
        a.patient_name, 
        a.date,
        a.time,
        a.service,
         a.status, 
        a.reminder_sent,
        a.staff_reminder_sent,
        u.push_token,
        d.name AS doctor_name
      FROM appointments a
      JOIN users u ON u.id = a.user_id
      LEFT JOIN doctors d ON d.id = a.doctor
      WHERE a.status IN ('approved','pending')
    `;

    db.query(sql, async (err, rows) => {
      if (err) {
        console.error("❌ Reminder query error:", err);
        return;
      }

      const now = new Date();

      for (const appt of rows) {
        try {
          /*
          |---------------------------------------------------
          | SAFE DATE EXTRACTION (NO timezone shifting)
          |---------------------------------------------------
          */
          const dateString = appt.date;

          const time24 = convertTo24Hour(appt.time);

          if (!time24) {
            console.log("❌ Invalid appointment:", appt);
            continue;
          }

          /*
          |---------------------------------------------------
          | Build PH datetime explicitly
          |---------------------------------------------------
          */
          const apptDateTime = new Date(`${dateString}T${time24}+08:00`);

          if (isNaN(apptDateTime.getTime())) {
            console.log("❌ Invalid datetime:", appt);
            continue;
          }

          const diffMinutes = (apptDateTime - now) / (1000 * 60);

          const diffHours = diffMinutes / 60;

          // =======================================================
          // 📅 APPROVED → STAFF REMINDER
          // =======================================================
          if (
            appt.status === "approved" &&
            diffHours <= 24 &&
            diffHours > 23 &&
            appt.staff_reminder_sent === 0
          ) {
            console.log("📅 Approved reminder:", appt.id);
          
            try {
              const staffRows = await new Promise((resolve, reject) => {
                db.query("SELECT id FROM users WHERE role='staff'", (err, rows) => {
                  if (err) return reject(err);
                  resolve(rows);
                });
              });
          
              if (!staffRows.length) return;
          
              await Promise.all(
                staffRows.map(staff =>
                  sendPushIfAllowed(
                    staff.id,
                    "📅 Upcoming Patient Appointment",
                    `Reminder: ${appt.patient_name} has a ${appt.service} appointment tomorrow at ${appt.time} with ${appt.doctor_name}`
                  )
                )
              );
          
              await new Promise((resolve, reject) => {
                db.query(
                  "UPDATE appointments SET staff_reminder_sent = 1 WHERE id=?",
                  [appt.id],
                  err => (err ? reject(err) : resolve())
                );
              });
          
              console.log("✅ Approved reminder sent:", appt.id);
          
            } catch (error) {
              console.error("❌ Approved reminder error:", error);
            }
          }


          // =======================================================
// 📅 APPROVED → PATIENT 1 DAY REMINDER (NO DB COLUMN)
// =======================================================
if (
  appt.status === "approved" &&
  diffHours <= 24 &&
  diffHours > 23 &&
  !sentTodayReminders.has(appt.id)
) {
  sentTodayReminders.add(appt.id);

  console.log("📅 Patient 1-day reminder:", appt.id);

  await sendPushIfAllowed(
    appt.user_id,
    "📅 Appointment Reminder",
    `Reminder: You have an appointment tomorrow at ${appt.time} for ${appt.service}`
  );
}
          
          // =======================================================
          // ⚠️ PENDING → STAFF REMINDER
          // =======================================================
          if (
            appt.status === "pending" &&
            diffHours <= 24 &&
            diffHours > 23 &&
            appt.staff_reminder_sent === 0
          ) {
            console.log("⚠️ Pending reminder:", appt.id);
          
            try {
              const staffRows = await new Promise((resolve, reject) => {
                db.query("SELECT id FROM users WHERE role='staff'", (err, rows) => {
                  if (err) return reject(err);
                  resolve(rows);
                });
              });
          
              if (!staffRows.length) return;
          
              await Promise.all(
                staffRows.map(staff =>
                  sendPushIfAllowed(
                    staff.id,
                    "⚠️ Pending Appointment Needs Approval",
                    `Reminder: ${appt.patient_name} has a pending ${appt.service} tomorrow at ${appt.time}. Please approve or manage it.`
                  )
                )
              );
          
              await new Promise((resolve, reject) => {
                db.query(
                  "UPDATE appointments SET staff_reminder_sent = 1 WHERE id=?",
                  [appt.id],
                  err => (err ? reject(err) : resolve())
                );
              });
          
              console.log("✅ Pending reminder sent:", appt.id);
          
            } catch (error) {
              console.error("❌ Pending reminder error:", error);
            }
          }


          console.log("📍 ID:", appt.id);
          console.log(
            "🕒 Now PH:",
            now.toLocaleString("en-PH", { timeZone: "Asia/Manila" })
          );
          console.log(
            "📅 Appt PH:",
            apptDateTime.toLocaleString("en-PH", {
              timeZone: "Asia/Manila",
            })
          );
          console.log("⏱ Diff:", diffMinutes.toFixed(2));

          /*
          |---------------------------------------------------
          | Reminder window
          |---------------------------------------------------
          */
        
          const key = appt.id + "_" + Math.floor(diffMinutes / 10);

if (
  (
    (diffMinutes <= 65 && diffMinutes > 50) ||
    (diffMinutes <= 35 && diffMinutes > 20)
  ) &&
  !sentReminders.has(key)
) {
            if (appt.push_token) {

              let label = "";

              if (diffMinutes <= 65 && diffMinutes > 50) {
                label = "1 Hour";
              } else if (diffMinutes <= 35 && diffMinutes > 20) {
                label = "30 Minutes";
              }

              const message = `Reminder: You have an appointment for ${appt.service} with ${appt.doctor_name} at ${appt.time}`;

              await sendPushIfAllowed(
                appt.user_id,
                `🔔 Mediq Reminder (${label})`,
                message
              );

              console.log("✅ Reminder sent:", appt.id, label);
              sentReminders.add(key);
            }

            await new Promise((resolve) => {
              db.query(
                "UPDATE appointments SET reminder_sent = 1 WHERE id = ?",
                [appt.id],
                () => resolve()
              );
            });
          }

        } catch (error) {
          console.error("❌ Reminder error:", error);
        }
      }
    });
  }, 60000);
}

module.exports = startReminderWorker;