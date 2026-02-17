const bcrypt = require("bcryptjs");

(async () => {
  const hash = await bcrypt.hash("staff123", 10);
  console.log(hash);
})();