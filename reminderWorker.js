const db = require("./db");
const { sendPushNotification } = require("./pushNotification");

/*
|-----------------------------------------------------------
| Convert time safely (handles Unicode spaces)
|-----------------------------------------------------------
*/
function convertTo24Hour(timeStr) {
  if (!timeStr) return "00:00:00";

  // normalize weird spaces
  timeStr = timeStr
    .replace(/\u202F/g, " ")
    .replace(/\u00A0/g, " ")
    .trim();

  const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);

  if (!match) {
    console.log("⚠️ Bad time format:", timeStr);
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
        a.date,
        a.time,
        a.service,
        a.reminder_sent,
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
        console.error("❌ Reminder query error:", err);
        return;
      }

      const now = new Date();

      for (const appt of rows) {
        try {
          const dateString =
            typeof appt.date === "string"
              ? appt.date
              : appt.date.toISOString().slice(0, 10);

          const time24 = convertTo24Hour(appt.time);

          if (!time24) {
            console.log("❌ Invalid appointment:", appt);
            continue;
          }

          // PH timezone offset
          const apptDateTime = new Date(`${dateString}T${time24}+08:00`);

          if (isNaN(apptDateTime.getTime())) {
            console.log("❌ Invalid datetime:", appt);
            continue;
          }

          const diffMinutes = (apptDateTime - now) / (1000 * 60);

          console.log("📍 ID:", appt.id);
          console.log(
            "🕒 Now PH:",
            now.toLocaleString("en-PH", { timeZone: "Asia/Manila" })
          );
          console.log(
            "📅 Appt PH:",
            apptDateTime.toLocaleString("en-PH", { timeZone: "Asia/Manila" })
          );
          console.log("⏱ Diff:", diffMinutes.toFixed(2));

          // reminder window
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
          console.error("❌ Reminder error:", error);
        }
      }
    });
  }, 60000);
}

module.exports = startReminderWorker;