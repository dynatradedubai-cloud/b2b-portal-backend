const express = require("express");
const cors = require("cors");
const multer = require("multer");
const XLSX = require("xlsx");
const bcrypt = require("bcryptjs");

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });

// IN-MEMORY DATABASE
let USERS = [];
let PRICE_LIST = [];
let SEARCH_LOG = [];

// ================= LOGIN =================
app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  const user = USERS.find((u) => u.username === username);
  if (!user) return res.json({ message: "User not found" });

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.json({ message: "Invalid password" });

  res.json({
    message: "Login success",
    customer: user.customerName,
    salesman: {
      name: user.salesmanName,
      phone: user.salesmanPhone,
      email: user.salesmanEmail,
    },
  });
});

// ================= SEARCH =================
app.post("/search", (req, res) => {
  const { query } = req.body;

  if (!query) return res.json([]);

  const q = query.toLowerCase();

  const result = PRICE_LIST.filter((item) =>
    Object.values(item).some((v) =>
      String(v).toLowerCase().includes(q)
    )
  ).slice(0, 20);

  res.json(result);
});

// ================= ADMIN LOGIN =================
app.post("/admin/login", (req, res) => {
  const { email, password } = req.body;

  if (
    email === process.env.ADMIN_EMAIL &&
    password === process.env.ADMIN_PASSWORD
  ) {
    return res.json({ token: "admin-token" });
  }

  res.status(401).json({ message: "Invalid admin" });
});

// ================= UPLOAD USERS =================
app.post(
  "/admin/upload-users",
  upload.single("file"),
  async (req, res) => {
    try {
      const wb = XLSX.read(req.file.buffer, { type: "buffer" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(sheet);

      USERS = await Promise.all(
        data.map(async (row) => ({
          username: row.Username,
          password: await bcrypt.hash(String(row.Password), 10),
          customerName: row["Customer Name"],
          customerCode: row["Customer Code"],
          maxSearch: row["Max search per day"],
          email: row["Customer email ID"],
          salesmanName: row["Sales Man name"],
          salesmanPhone: row["Salesman contact no."],
          salesmanEmail: row["Salesman Email ID"],
        }))
      );

      res.json({ message: "Users uploaded", count: USERS.length });
    } catch (err) {
      res.status(500).json({ message: "Upload error" });
    }
  }
);

// ================= UPLOAD PRICE LIST =================
app.post(
  "/admin/upload-price",
  upload.single("file"),
  (req, res) => {
    try {
      const wb = XLSX.read(req.file.buffer, { type: "buffer" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      PRICE_LIST = XLSX.utils.sheet_to_json(sheet);

      res.json({
        message: "Price list uploaded",
        count: PRICE_LIST.length,
      });
    } catch (err) {
      res.status(500).json({ message: "Upload error" });
    }
  }
);

// ================= START =================
app.listen(5000, () =>
  console.log("Server running on port 5000")
);
