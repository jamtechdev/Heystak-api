// middleware/authenticate.js
const jwt = require("jsonwebtoken");

// Secret key for verifying JWTs
const SECRET_KEY = process.env.JWT_SECRET;

const authenticate = (req, res, next) => {
  // Get the token from the request headers
  const token = req.headers["authorization"];

  if (!token) {
    return res.status(403).json({ error: "No token provided" });
  }

  // Verify the token
  jwt.verify(token.split(" ")[1], SECRET_KEY, (err, decoded) => {
    if (err) {
      return res.status(401).json({ error: "Unauthorized access" });
    }

    // If the token is valid, attach the decoded payload to the request object
    req.user = decoded;

    // Proceed to the next middleware or route handler
    next();
  });
};

module.exports = authenticate;
