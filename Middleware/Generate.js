const jwt = require("jsonwebtoken");
const dotenv = require("dotenv");
dotenv.config();
// Secret key for signing JWTs (keep this secure and don't hardcode in production)
const SECRET_KEY = process.env.JWT_SECRET;

// Function to create a JWT token
function generateToken(user) {
  // Payload can include user information, like id or email
  const payload = {
    id: user.id,
    email: user.email,
  };

  // Options for the token
  const options = {
    expiresIn: "360d", // Token expires in 1 hour
  };

  // Create and return the token
  const token = jwt.sign(payload, SECRET_KEY, options);
  return token;
}

// Example usage
const user = { id: 118, email: "heystak@gmail.com" };
const token = generateToken(user);
console.log(token); // This is the JWT token
