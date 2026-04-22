const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const XLSX = require("xlsx");
const fs = require("fs");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

// ✅ IMPORTANT (Render safe)
const upload = multer({ dest: "/tmp" });

/* ================= DATA ================= */
let users = [];
let priceList = [];

/* ================= LOAD DATA ================= */
if (fs.existsSync("users.json")) {
  users = JSON.parse(fs.readFileSync("users.json"));
}
if (fs.existsSync("price.json")) {
  priceList = JSON.parse(fs.readFileSync("price.json"));
}

/* ================= AUTH ================= */
function verifyAdmin(req, res, next) {
  let auth = req.headers.authorization;

  if (!auth) {
    return res.status(403).json({ message: "No token" });
  }

  let token = auth.startsWith("Bearer ")
    ? auth.split(" ")[1]
    : auth;

  try {
    jwt.verify(token.trim(), process.env.JWT_SECRET);
    next();
  } catch (err) {
    console.log("TOKEN ERROR:", err.message);
    return res.status(403).json({ message: "Invalid token" });
  }
}

/* ================= ADMIN LOGIN ================= */
app.post("/admin/login", (req, res) => {
  const { username, password } = req.body;

  if (
    username === process.env.ADMIN_EMAIL &&
    password === process.env.ADMIN_PASSWORD
  ) {
    const token = jwt.sign({ role: "admin" }, process.env.JWT_SECRET);
    return res.json({ token });
  }

  res.status(401).json({ message: "Invalid login" });
});

/* ================= UPLOAD USERS ================= */
app.post("/admin/upload-users", verifyAdmin, upload.single("file"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const wb = XLSX.readFile(req.file.path);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(sheet);

    if (!data.length) {
      return res.status(400).json({ message: "Excel empty" });
    }

    users = data.map((u) => ({
      username: String(u["Username"]).trim(),
      password: bcrypt.hashSync(String(u["Password"]), 10),
      name: u["Customer Name"] || "",
      email: u["Customer email ID"] || "",
      limit: Number(u["Max search per day"] || 50)
    }));

    fs.writeFileSync("users.json", JSON.stringify(users, null, 2));

    res.json({
      message: "Users uploaded",
      count: users.length
    });

  } catch (err) {
    console.log("UPLOAD USERS ERROR:", err);
    res.status(500).json({
      message: "Upload failed",
      error: err.message
    });
  }
});

/* ================= UPLOAD PRICE ================= */
app.post("/admin/upload-price", verifyAdmin, upload.single("file"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const wb = XLSX.readFile(req.file.path);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(sheet);

    priceList = data;

    fs.writeFileSync("price.json", JSON.stringify(priceList, null, 2));

    res.json({
      message: "Price uploaded",
      count: priceList.length
    });

  } catch (err) {
    console.log("UPLOAD PRICE ERROR:", err);
    res.status(500).json({
      message: "Upload failed",
      error: err.message
    });
  }
});

/* ================= CUSTOMER LOGIN ================= */
app.post("/login", (req, res) => {
  const { username, password } = req.body;

  const user = users.find((u) => u.username === username);

  if (!user) {
    return res.json({ message: "User not found" });
  }

  if (!bcrypt.compareSync(password, user.password)) {
    return res.json({ message: "Wrong password" });
  }

  res.json({ message: "Login success" });
});

/* ================= SEARCH ================= */
app.post("/search", (req, res) => {
  const { query } = req.body;

  const result = priceList
    .filter((p) =>
      Object.values(p)
        .join(" ")
        .toLowerCase()
        .includes(String(query).toLowerCase())
    )
    .slice(0, 20);

  res.json(result);
});

/* ================= START ================= */
app.listen(process.env.PORT || 5000, () => {
  console.log("Server running...");
});
