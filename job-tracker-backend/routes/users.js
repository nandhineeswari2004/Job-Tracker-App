const express = require("express");
const router = express.Router();
const db = require("../db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

// ✅ Password strength check function
function isPasswordStrong(password) {
  // At least 8 chars, one uppercase, one lowercase, one number, one special char
  const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
  return regex.test(password);
}

// 📝 Sign-Up API
router.post("/signup", async (req, res) => {
  const { name, email, password } = req.body;

  if (!isPasswordStrong(password)) {
    return res.status(400).json({
      message:
        "Password must be 8+ characters, include uppercase, lowercase, number, and special character.",
    });
  }

  try {
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert user into DB
    db.query(
      "INSERT INTO users (name, email, password) VALUES (?, ?, ?)",
      [name, email, hashedPassword],
      (err, result) => {
        if (err) {
          if (err.code === "ER_DUP_ENTRY") {
            return res.status(400).json({ message: "Email already registered" });
          }
          return res.status(500).json({ message: "Database error", error: err });
        }
        return res.status(201).json({ message: "✅ User registered successfully!" });
      }
    );
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err });
  }
});

// 🔑 Login API
router.post("/login", (req, res) => {
  const { email, password } = req.body;

  db.query("SELECT * FROM users WHERE email = ?", [email], async (err, results) => {
    if (err) return res.status(500).json({ message: "Database error" });
    if (results.length === 0) return res.status(400).json({ message: "User not found" });

    const user = results[0];

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: "Invalid credentials" });

    // Generate JWT token
    const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, {
      expiresIn: "2h",
    });

    res.status(200).json({
      message: "✅ Login successful",
      token: token,
      user: { id: user.id, name: user.name, email: user.email },
    });
  });
});

module.exports = router;
