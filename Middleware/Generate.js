// Import dependencies
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
dotenv.config();

// Load environment variables
const SECRET_KEY = process.env.JWT_SECRET;

export function generateToken(user) {
  const payload = { id: user.id, email: user.email };
  const options = { expiresIn: "360d" };
  return jwt.sign(payload, SECRET_KEY, options);
}

// Example usage (optional, usually you don't execute code like this in modules)
const user = { id: 118, email: "heystak@gmail.com" };
const token = generateToken(user);
console.log(token);
