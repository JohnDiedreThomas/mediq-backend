const express = require("express");
const router = express.Router();

/*
|--------------------------------------------------
| GET PHILIPPINE HOLIDAYS (REAL)
| /api/holidays/:year
|--------------------------------------------------
*/
router.get("/:year", (req, res) => {
  const year = req.params.year;

  const holidays = {
    [`${year}-01-01`]: "New Year's Day",
    [`${year}-02-10`]: "Chinese New Year",
    [`${year}-04-02`]: "Maundy Thursday",
    [`${year}-04-03`]: "Good Friday",
    [`${year}-04-09`]: "Araw ng Kagitingan",
    [`${year}-05-01`]: "Labor Day",
    [`${year}-06-12`]: "Independence Day",
    [`${year}-08-21`]: "Ninoy Aquino Day",
    [`${year}-08-26`]: "National Heroes Day",
    [`${year}-11-01`]: "All Saints' Day",
    [`${year}-11-30`]: "Bonifacio Day",
    [`${year}-12-25`]: "Christmas Day",
    [`${year}-12-30`]: "Rizal Day",
  };

  res.json({
    success: true,
    holidays,
  });
});

module.exports = router;
