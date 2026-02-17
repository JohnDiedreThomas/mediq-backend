const mysql = require("mysql2");

const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "",       
  database: "mediq",
  port: 3306          
});

db.connect((err) => {
  if (err) {
    console.error("MySQL Connection Error:", err.message);
  } else {
    console.log("MySQL Connected");
  }
});

module.exports = db;
