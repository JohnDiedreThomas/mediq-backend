const express = require("express");
const cors = require("cors");

// Load DB
require("./db");

const authRoutes = require("./routes/auth");
const doctorsRoutes = require("./routes/doctors");  
const appointmentRoutes = require("./routes/appointments");

const app = express();
app.use(cors());
app.use(express.json());

// AUTH
app.use("/api", authRoutes);

// DOCTORS + AVAILABILITY  ✅ IMPORTANT
app.use("/api/doctors", doctorsRoutes);

// APPOINTMENTS
app.use("/appointments", appointmentRoutes);

// ROOT TEST
app.get("/", (req, res) => {
  res.send("MEDIQ Backend Running");
});

const PORT = 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on port " + PORT);
});
