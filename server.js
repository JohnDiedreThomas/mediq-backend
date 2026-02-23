process.env.TZ = "Asia/Manila";
const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth");          // ✅ CORRECT FILE
const doctorsRoutes = require("./routes/doctors");
const availabilityRoutes = require("./routes/availability");
const appointmentsRoutes = require("./routes/appointments");
const holidayRoutes = require("./routes/holidays");
const adminRoutes = require("./routes/admin");
const adminServices = require("./routes/admin.services");
const servicesRoutes = require("./routes/services");
const adminStaffRoutes = require("./routes/admin.staff");
const adminAvailabilityRoutes = require("./routes/admin.availability");
const adminDoctorsRoutes = require("./routes/admin.doctors");
const startReminderWorker = require("./reminderWorker");
const runDailyCleanup = require("./utils/cleanupScheduler");

const app = express();

app.use(cors());
app.use(express.json());

app.use("/uploads", express.static("uploads"));

// 🔐 AUTH ROUTES (LOGIN & REGISTER)
app.use("/api", authRoutes);

// 🩺 OTHER API ROUTES
app.use("/api/doctors", doctorsRoutes);
app.use("/api/doctors", availabilityRoutes);
app.use("/api/holidays", holidayRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/admin/services", adminServices);
app.use("/api/services", servicesRoutes); 
app.use("/api/admin/staff", adminStaffRoutes);
app.use("/api/admin/availability", adminAvailabilityRoutes);
app.use("/api/admin/doctors", adminDoctorsRoutes);
app.use("/api/appointments", appointmentsRoutes);
app.use("/api/admin/schedule", require("./routes/admin.schedule"));
app.use("/api/admin/overview", require("./routes/admin.overview"));
app.use("/api/contact", require("./routes/contact"));
app.use("/api/notifications", require("./routes/notifications"));
app.use("/api/arrival", require("./routes/arrival"));
app.use("/api/reviews", require("./routes/reviews"));
app.use("/uploads", express.static("uploads"));

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on port", PORT);

  // start reminder worker
  startReminderWorker();

  runDailyCleanup();

  setInterval(runDailyCleanup, 24 * 60 * 60 * 1000);
});
