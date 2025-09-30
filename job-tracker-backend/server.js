const express = require("express");
const cors = require("cors");
require("dotenv").config();
const db = require("./db"); // make sure this exports a valid MySQL connection

const app = express();
app.use(cors());
app.use(express.json());

// Import routes
const userRoutes = require("./routes/users"); // use the correct filename here
app.use("/api/users", userRoutes);

const jobRoutes = require("./routes/jobs");
app.use("/api/jobs", jobRoutes);

const testEmailRoutes = require('./routes/testEmail');
app.use('/api/test-email', testEmailRoutes);

// Test route
app.get("/", (req, res) => {
  res.send("🚀 Job Tracker Backend Running!");
});



// after app setup and db connection
if (process.env.ENABLE_REMINDERS === "true") {
  require("./reminder");
}


// Start server (after all routes are added)
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});

