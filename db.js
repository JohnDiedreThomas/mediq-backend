const mysql = require("mysql2");

const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,

  timezone: "+08:00",

  dateStrings: true // ⭐ IMPORTANT
});

console.log("MySQL Pool Ready ✅");

module.exports = db;