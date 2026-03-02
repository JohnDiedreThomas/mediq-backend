process.env.TZ = "Asia/Manila";
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const http = require("http");
const { Server } = require("socket.io");

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
const profileRoutes = require("./routes/profile");
const adminAnalytics = require("./routes/admin.analytics");
console.log("adminAnalytics type:", typeof adminAnalytics);
console.log("adminAnalytics value:", adminAnalytics);

console.log("authRoutes:", typeof authRoutes);
console.log("doctorsRoutes:", typeof doctorsRoutes);
console.log("availabilityRoutes:", typeof availabilityRoutes);
console.log("appointmentsRoutes:", typeof appointmentsRoutes);
console.log("holidayRoutes:", typeof holidayRoutes);

console.log("adminRoutes:", typeof adminRoutes);
console.log("adminServices:", typeof adminServices);
console.log("adminStaffRoutes:", typeof adminStaffRoutes);
console.log("adminAvailabilityRoutes:", typeof adminAvailabilityRoutes);
console.log("adminDoctorsRoutes:", typeof adminDoctorsRoutes);
console.log("adminAnalytics:", typeof adminAnalytics);
const app = express();

app.use(cors());
app.use(express.json());

// ✅ Health endpoint (NEW — useful for uptime monitoring)
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// ✅ Serve uploaded files
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
app.use("/api/admin/analytics", adminAnalytics);

// 📬 OTHER FEATURES
app.use("/api/contact", require("./routes/contact"));
app.use("/api/notifications", require("./routes/notifications"));
app.use("/api/arrival", require("./routes/arrival"));
app.use("/api/reviews", require("./routes/reviews"));
app.use("/api/profile", profileRoutes);

const PORT = process.env.PORT || 3000;

// 🔥 Global error handler
app.use((err, req, res, next) => {
  console.error("🔥 GLOBAL ERROR:", err);
  res.status(500).json({
    success: false,
    message: err.message || "Server error",
  });
});

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
  },
  pingInterval: 25000,
  pingTimeout: 60000,
});

// ⭐ Socket connection logs
io.on("connection", (socket) => {
  console.log("🟢 Client connected:", socket.id);

  socket.on("disconnect", () => {
    console.log("🔴 Client disconnected:", socket.id);
  });
});

// make io accessible in routes
app.set("io", io);

server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log("🧠 Realtime sockets enabled");

  startReminderWorker();

  runDailyCleanup();
  setInterval(runDailyCleanup, 24 * 60 * 60 * 1000);
});