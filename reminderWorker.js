const db = require("./db");
const { sendPushNotification } = require("./pushNotification");

/*
|-----------------------------------------------------------
| Convert 12-hour time (e.g. 4:30 PM) → 24-hour (16:30:00)
|-----------------------------------------------------------
*/
function convertTo24Hour(timeStr) {
  if (!timeStr) return "00:00:00";

  const parts = timeStr.trim().split(" ");

  // If already 24h format like "16:30"
  if (parts.length === 1) {
    return parts[0] + ":00";
  }

  const [time, modifier] = parts;
  let [hours, minutes] = time.split(":");

  hours = parseInt(hours, 10);

  if (modifier.toUpperCase() === "PM" && hours !== 12) {
    hours += 12;
  }

  if (modifier.toUpperCase() === "AM" && hours === 12) {
    hours = 0;
  }

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
    console.log("Checking appointment reminders...");

    const sql = `
      SELECT 
        a.id,
        a.date,
        a.time,
        a.service,
        u.push_token,
        d.name AS doctor_name
      FROM appointments a
      JOIN users u ON u.id = a.user_id
      LEFT JOIN doctors d ON d.id = a.doctor
      WHERE a.status = 'approved'
        AND a.reminder_sent = 0
    `;

    db.query(sql, async (err, rows) => {
      if (err) {
        console.error("Reminder query error:", err);
        return;
      }

      const now = new Date();

      for (const appt of rows) {
        try {
          const appointmentTime24 = convertTo24Hour(appt.time);

          // ✅ SAFE DATE BUILD
          const dateOnly = appt.date.toISOString().slice(0, 10);
          const apptDateTime = new Date(`${dateOnly}T${appointmentTime24}`);

          if (isNaN(apptDateTime.getTime())) {
            console.log("❌ Invalid appointment:", appt);
            continue;
          }

          const diffMinutes = (apptDateTime - now) / (1000 * 60);

          console.log("📍 ID:", appt.id);
          console.log("🕒 Now:", now);
          console.log("📅 Appt:", apptDateTime);
          console.log("⏱ Diff:", diffMinutes);

          if (diffMinutes >= -10 && diffMinutes <= 60) {
            if (appt.push_token) {
              const message = `Reminder: You have an appointment for ${appt.service} with ${appt.doctor_name} at ${appt.time}`;

              await sendPushNotification(
                appt.push_token,
                "🔔 Mediq Reminder",
                message
              );

              console.log("✅ Reminder sent:", appt.id);
            }

            db.query(
              "UPDATE appointments SET reminder_sent = 1 WHERE id = ?",
              [appt.id]
            );
          }
        } catch (error) {
          console.error("Reminder error:", error);
        }
      }
    });
  }, 60000);
}

module.exports = startReminderWorker;
