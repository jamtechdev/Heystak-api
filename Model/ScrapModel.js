// userModel.js

// Factory function to create a new User object
export const createUser = (username, email) => {
  return { username, email };
};

// Function to simulate fetching a user from a database
export const findUserByUsername = (username) => {
  // This is a mock function. Replace it with actual database query logic.
  return { username, email: `${username}@example.com` };
};

// Additional functions as needed for update, delete, etc.
