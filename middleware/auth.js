module.exports = (req, res, next) => {
    // TEMP: allow all requests for now
    req.user = { id: req.body.userId || 1 };
    next();
  };