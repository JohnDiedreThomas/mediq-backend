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
        a.user_id,
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

      for (const appt of rows) {
        try {
          
      // Convert time to 24h
// Convert time to 24h
const appointmentTime24 = convertTo24Hour(appt.time);

// Convert DB date safely (UTC → PH)
const dbDate = new Date(appt.date);

const year = dbDate.getUTCFullYear();
const month = String(dbDate.getUTCMonth() + 1).padStart(2, "0");
const day = String(dbDate.getUTCDate()).padStart(2, "0");

// Build PH datetime explicitly
const apptDateTime = new Date(`${year}-${month}-${day}T${appointmentTime24}+08:00`);

if (isNaN(apptDateTime.getTime())) {
  console.log("❌ Invalid appointment time:", appt.date, appt.time);
  continue;
}

// PH current time
const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" }));

const diffMinutes = (apptDateTime - now) / (1000 * 60);

console.log("📍 Appointment ID:", appt.id);
console.log("🕒 PH now:", now);
console.log("📅 Appointment time:", apptDateTime);
console.log("⏱ Diff minutes:", diffMinutes);
           // 🔔 Send reminder within 60 minutes
          if (diffMinutes >= -10 && diffMinutes <= 60) {
            if (appt.push_token) {
              const serviceName = appt.service || "Appointment";
              const doctorName = appt.doctor_name || "Doctor";
              const appointmentTime = appt.time;

              const isToday =
              apptDateTime.toDateString() === now.toDateString();

              const message = isToday
                ? `Reminder: You have an appointment for ${serviceName} with ${doctorName} at ${appointmentTime} today`
                : `Reminder: You have an appointment for ${serviceName} with ${doctorName} at ${appointmentTime} tomorrow`;

              await sendPushNotification(
                appt.push_token,
                "🔔 Mediq Reminder",
                message
              );

              console.log("Reminder sent for appointment:", appt.id);
            }

            // Mark reminder sent
            db.query(
              "UPDATE appointments SET reminder_sent = 1 WHERE id = ?",
              [appt.id]
            );
          }
        } catch (error) {
          console.error("Reminder processing error:", error);
        }
      }
    });
  }, 60000); 
}

module.exports = startReminderWorker;
