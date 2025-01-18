require("dotenv").config();
const jwt = require("jsonwebtoken");

function userMiddleware(req, res, next) {
  const token = req.headers.token;
  const decodedValue = jwt.verify(token, process.env.JWT_USER_SECRET);

  if (decodedValue) {
    decodedValue.userId = req.userId;
    next();
  } else {
    res.json({
      message: "unable to make requests",
    });
  }
}

module.exports = {
  userMiddleware,
};
