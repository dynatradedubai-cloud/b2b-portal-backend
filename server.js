const express = require("express");
const cors = require("cors");
const multer = require("multer");
const XLSX = require("xlsx");
const bcrypt = require("bcryptjs");

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });

let USERS = [];
let PRICE = [];

// LOGIN
app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  const user = USERS.find(u => u.username === username);
  if (!user) return res.json({ message: "User not found" });

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.json({ message: "Invalid password" });

  res.json({
    message: "Login success",
    name: user.customerName,
    salesman: user.salesmanPhone
  });
});

// SEARCH
app.post("/search", (req, res) => {
  const q = req.body.query?.toLowerCase() || "";

  const result = PRICE.filter(p =>
    Object.values(p).some(v =>
      String(v).toLowerCase().includes(q)
    )
  ).slice(0, 20);

  res.json(result);
});

// ADMIN LOGIN
app.post("/admin/login", (req, res) => {
  if (
    req.body.email === process.env.ADMIN_EMAIL &&
    req.body.password === process.env.ADMIN_PASSWORD
  ) return res.json({ token: "ok" });

  res.status(401).json({ message: "Invalid" });
});

// UPLOAD USERS
app.post("/admin/upload-users", upload.single("file"), async (req, res) => {
  const wb = XLSX.read(req.file.buffer);
  const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);

  USERS = await Promise.all(
    data.map(async r => ({
      username: r.Username,
      password: await bcrypt.hash(String(r.Password), 10),
      customerName: r["Customer Name"],
      salesmanPhone: r["Salesman contact no."]
    }))
  );

  res.json({ message: "Users uploaded", count: USERS.length });
});

// UPLOAD PRICE
app.post("/admin/upload-price", upload.single("file"), (req, res) => {
  const wb = XLSX.read(req.file.buffer);
  PRICE = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
  res.json({ message: "Price uploaded", count: PRICE.length });
});

app.listen(5000, () => console.log("Running"));
