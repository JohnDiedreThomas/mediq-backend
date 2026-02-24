process.env.TZ = "Asia/Manila";
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");

const authRoutes = require("./routes/auth");
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

// ✅ Serve uploaded files (keep for now — safe even if you move to Cloudinary)
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// 🔐 AUTH
app.use("/api", authRoutes);

// 🩺 CORE ROUTES
app.use("/api/doctors", doctorsRoutes);
app.use("/api/doctors", availabilityRoutes);
app.use("/api/holidays", holidayRoutes);
app.use("/api/services", servicesRoutes);
app.use("/api/appointments", appointmentsRoutes);

// 👨‍💼 ADMIN
app.use("/api/admin", adminRoutes);
app.use("/api/admin/services", adminServices);
app.use("/api/admin/staff", adminStaffRoutes);
app.use("/api/admin/availability", adminAvailabilityRoutes);
app.use("/api/admin/doctors", adminDoctorsRoutes);
app.use("/api/admin/schedule", require("./routes/admin.schedule"));
app.use("/api/admin/overview", require("./routes/admin.overview"));

// 📬 OTHER FEATURES
app.use("/api/contact", require("./routes/contact"));
app.use("/api/notifications", require("./routes/notifications"));
app.use("/api/arrival", require("./routes/arrival"));
app.use("/api/reviews", require("./routes/reviews"));

const PORT = process.env.PORT || 3000;
app.use((err, req, res, next) => {
  console.error("🔥 GLOBAL ERROR:", err);

  res.status(500).json({
    success: false,
    message: err.message || "Server error",
  });
});
app.listen(PORT, "0.0.0.0", () => {
  console.log("✅ Server running on port", PORT);

  // Start background workers
  startReminderWorker();

  runDailyCleanup();
  setInterval(runDailyCleanup, 24 * 60 * 60 * 1000);
});