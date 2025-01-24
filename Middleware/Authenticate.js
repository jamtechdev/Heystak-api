// Import dependencies
import jwt from 'jsonwebtoken';
import { generateToken } from './Generate.js';

// Load environment variables
const SECRET_KEY = process.env.JWT_SECRET;

export const Authenticate = (req, res, next) => {
  const token = req.headers["authorization"];
  if (!token) {
    return res.status(403).json({ error: "No token provided" });
  }

  jwt.verify(token.split(" ")[1], SECRET_KEY, (err, decoded) => {
    if (err) {
      // Check if the error is due to token expiration
      if (err.name === 'TokenExpiredError') {
        // Optionally generate a new token if the old one expired
        const newToken = generateToken({ id: decoded.id, email: decoded.email });
        res.setHeader('Authorization', `Bearer ${newToken}`);
      }
      return res.status(401).json({ error: "Unauthorized access" });
    }

    req.user = decoded;
    next();
  });
};
