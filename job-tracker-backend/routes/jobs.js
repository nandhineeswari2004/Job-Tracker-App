const express = require("express");
const router = express.Router();
const db = require("../db");
const authenticateToken = require("../middleware/auth");
const multer = require("multer");
const csv = require("csv-parser");
const fs = require("fs");
const path = require("path");

// ---------- Multer temp upload folder ----------
const uploadDir = path.join(__dirname, "..", "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const upload = multer({ dest: uploadDir });

// ---------- CREATE a job ----------
router.post("/", authenticateToken, (req, res) => {
  const userId = req.user.id;
  const { company, role, status, deadline, applied_through, interview_date } = req.body;

  if (!company || !role) {
    return res.status(400).json({ message: "company and role are required" });
  }

  const sql = `INSERT INTO jobs (user_id, company, role, status, deadline, applied_through, interview_date) VALUES (?, ?, ?, ?, ?, ?, ?)`;
  db.query(
    sql,
    [userId, company, role, status || "Applied", deadline || null, applied_through || null, interview_date || null],
    (err, result) => {
      if (err) return res.status(500).json({ message: "DB error", error: err });
      const insertedId = result.insertId;
      db.query("SELECT * FROM jobs WHERE id = ?", [insertedId], (e, rows) => {
        if (e) return res.status(500).json({ message: "DB error", error: e });
        res.status(201).json(rows[0]);
      });
    }
  );
});

// ---------- READ (Get all jobs with search, filter, sort, pagination) ----------
router.get("/", authenticateToken, (req, res) => {
  const userId = req.user.id;
  const { company, status, q } = req.query;
  let page = parseInt(req.query.page) || 1;
  let limit = parseInt(req.query.limit) || 20;
  const sortBy = req.query.sortBy || "deadline";
  const sortOrder = (req.query.sortOrder || "asc").toLowerCase() === "desc" ? "DESC" : "ASC";

  if (page < 1) page = 1;
  if (limit < 1 || limit > 100) limit = 20;

  const where = ["user_id = ?"];
  const params = [userId];
  if (company) { where.push("company LIKE ?"); params.push(`%${company}%`); }
  if (status)  { where.push("status = ?"); params.push(status); }
  if (q)       { where.push("(company LIKE ? OR role LIKE ?)"); params.push(`%${q}%`, `%${q}%`); }

  const whereSql = where.join(" AND ");

  const countSql = `SELECT COUNT(*) AS total FROM jobs WHERE ${whereSql}`;
  db.query(countSql, params, (cErr, cRows) => {
    if (cErr) return res.status(500).json({ message: "DB error", error: cErr });
    const total = cRows[0].total;
    const offset = (page - 1) * limit;

    let orderSql = "ORDER BY ";
    if (sortBy === "created_at") {
      orderSql += `created_at ${sortOrder}`;
    } else {
      orderSql += `(deadline IS NULL), deadline ${sortOrder}`;
    }

    const sql = `SELECT * FROM jobs WHERE ${whereSql} ${orderSql} LIMIT ? OFFSET ?`;
    const dataParams = params.concat([limit, offset]);

    db.query(sql, dataParams, (err, rows) => {
      if (err) return res.status(500).json({ message: "DB error", error: err });
      res.json({
        jobs: rows,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      });
    });
  });
});

// ---------- JOB STATS (for progress bar) ----------
router.get("/stats", authenticateToken, (req, res) => {
  const userId = req.user.id;
  const sql = `SELECT status, COUNT(*) AS count FROM jobs WHERE user_id = ? GROUP BY status`;
  db.query(sql, [userId], (err, rows) => {
    if (err) return res.status(500).json({ message: "DB error", error: err });

    const stats = {};
    rows.forEach(r => stats[r.status] = r.count);

    res.json({ stats });
  });
});

// ---------- UPDATE job (✅ Updated with applied_through & interview_date) ----------
router.put("/:id", authenticateToken, (req, res) => {
  const userId = req.user.id;
  const jobId = req.params.id;
  const { company, role, status, deadline, applied_through, interview_date } = req.body;

  const fields = [];
  const params = [];

  if (company !== undefined) { fields.push("company = ?"); params.push(company); }
  if (role !== undefined)    { fields.push("role = ?"); params.push(role); }
  if (status !== undefined)  { fields.push("status = ?"); params.push(status); }
  if (deadline !== undefined){ fields.push("deadline = ?"); params.push(deadline || null); }
  if (applied_through !== undefined) { fields.push("applied_through = ?"); params.push(applied_through || null); }
  if (interview_date !== undefined)  { fields.push("interview_date = ?"); params.push(interview_date || null); }

  if (fields.length === 0) return res.status(400).json({ message: "No fields to update" });

  params.push(jobId, userId);
  const sql = `UPDATE jobs SET ${fields.join(", ")} WHERE id = ? AND user_id = ?`;

  db.query(sql, params, (err, result) => {
    if (err) return res.status(500).json({ message: "DB error", error: err });
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Job not found or not authorized" });
    }
    db.query("SELECT * FROM jobs WHERE id = ?", [jobId], (e, rows) => {
      if (e) return res.status(500).json({ message: "DB error", error: e });
      res.json(rows[0]);
    });
  });
});

// ---------- DELETE job ----------
router.delete("/:id", authenticateToken, (req, res) => {
  const userId = req.user.id;
  const jobId = req.params.id;

  db.query("DELETE FROM jobs WHERE id = ? AND user_id = ?", [jobId, userId], (err, result) => {
    if (err) return res.status(500).json({ message: "DB error", error: err });
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Job not found or not authorized" });
    }
    res.json({ message: "Job deleted successfully" });
  });
});

// ---------- BULK IMPORT CSV ----------
router.post("/import", authenticateToken, upload.single("file"), (req, res) => {
  const userId = req.user.id;
  if (!req.file) return res.status(400).json({ message: "CSV file is required (form-data, key=file)" });

  const filePath = req.file.path;
  const rows = [];

  fs.createReadStream(filePath)
    .pipe(csv({ mapHeaders: ({ header }) => header.trim() }))
    .on("data", (data) => {
      rows.push({
        company: (data.company || "").trim(),
        role: (data.role || "").trim(),
        status: (data.status || "Applied").trim(),
        deadline: (data.deadline || "").trim() || null,
        applied_through: (data.applied_through || "").trim() || null,
        interview_date: (data.interview_date || "").trim() || null,
      });
    })
    .on("end", () => {
      try { fs.unlinkSync(filePath); } catch (e) {}

      if (rows.length === 0) return res.status(400).json({ message: "CSV is empty or invalid headers" });

      const values = rows.map(r => [userId, r.company, r.role, r.status, r.deadline, r.applied_through, r.interview_date]);

      const sql = "INSERT INTO jobs (user_id, company, role, status, deadline, applied_through, interview_date) VALUES ?";
      db.query(sql, [values], (err, result) => {
        if (err) return res.status(500).json({ message: "DB error", error: err });
        res.json({ message: "Import successful", insertedRows: result.affectedRows });
      });
    })
    .on("error", (err) => {
      try { fs.unlinkSync(filePath); } catch (e) {}
      res.status(500).json({ message: "CSV parse error", error: err.message });
    });
});

module.exports = router;
