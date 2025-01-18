require("dotenv").config();
const jwt = require("jsonwebtoken");

function adminMiddleware(req, res, next) {
  const token = req.headers.token;
  const decodedValue = jwt.verify(token, process.env.JWT_ADMIN_SECRET);

  if (decodedValue) {
    decodedValue.adminId = req.adminId;
    next();
  } else {
    res.json({
      message: "unable to make requests",
    });
  }
}

module.exports = {
  adminMiddleware,
};
