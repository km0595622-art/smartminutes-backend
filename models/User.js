const db = require("../config/db");

async function createUser(name, email, password) {
  const query = `
    INSERT INTO users (name, email, password)
    VALUES ($1, $2, $3)
    RETURNING id, name, email;
  `;

  const values = [name, email, password];
  const result = await db.query(query, values);

  return result.rows[0];
}

async function findUserByEmail(email) {
  const result = await db.query(
    "SELECT * FROM users WHERE email = $1",
    [email]
  );

  return result.rows[0];
}

module.exports = {
  createUser,
  findUserByEmail,
};