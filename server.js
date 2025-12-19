const express = require("express");
const session = require("express-session");
const fs = require("fs");
const path = require("path");
const fetch = (...args) => import("node-fetch").then(({default: fetch}) => fetch(...args));

const app = express();
const PORT = 3000;

/* ===== CONFIG ===== */
const REWARD_5MIN = 0.00001;
const REWARD_DAILY = 0.0001;

const COOLDOWN_5MIN = 5 * 60 * 1000;
const COOLDOWN_DAILY = 24 * 60 * 60 * 1000;

/* 🔐 TU SECRET KEY DE hCAPTCHA */
const HCAPTCHA_SECRET = "ES_1866de7b7e854715801be748fb9010e2";

/* ===== MIDDLEWARE ===== */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  name: "faucet_session",
  secret: "SUPER_SECRET_KEY_123",
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax" }
}));

app.use(express.static(path.join(__dirname, "public")));

/* ===== DATA ===== */
const DATA_FILE = path.join(__dirname, "data.json");

function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ users: {} }, null, 2));
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

/* ===== CAPTCHA VERIFY ===== */
async function verifyCaptcha(token, ip) {
  const res = await fetch("https://hcaptcha.com/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      secret: HCAPTCHA_SECRET,
      response: token,
      remoteip: ip
    })
  });

  const data = await res.json();
  return data.success === true;
}

/* ===== ROOT ===== */
app.get("/", (req, res) => {
  if (!req.session.email) {
    return res.sendFile(path.join(__dirname, "public/login.html"));
  }
  res.sendFile(path.join(__dirname, "public/faucet.html"));
});

/* ===== LOGIN ===== */
app.post("/login", (req, res) => {
  const { email } = req.body;
  if (!email) return res.json({ success: false, error: "Email requerido" });

  req.session.email = email;

  const data = loadData();
  if (!data.users[email]) {
    data.users[email] = {
      balance: 0,
      last5: 0,
      lastDaily: 0
    };
    saveData(data);
  }

  res.json({ success: true });
});

/* ===== LOGOUT ===== */
app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/");
  });
});

/* ===== STATUS ===== */
app.get("/status", (req, res) => {
  if (!req.session.email) return res.json({ logged: false });

  const data = loadData();
  const user = data.users[req.session.email];

  res.json({
    logged: true,
    balance: user.balance,
    last5: user.last5,
    lastDaily: user.lastDaily
  });
});

/* ===== CLAIM 5 MIN ===== */
app.post("/claim/5min", async (req, res) => {
  if (!req.session.email) {
    return res.json({ success: false, error: "No autenticado" });
  }

  const { token } = req.body;
  if (!token) {
    return res.json({ success: false, error: "Captcha requerido" });
  }

  const captchaOK = await verifyCaptcha(token, req.ip);
  if (!captchaOK) {
    return res.json({ success: false, error: "Captcha inválido" });
  }

  const data = loadData();
  const user = data.users[req.session.email];
  const now = Date.now();

  if (now - user.last5 < COOLDOWN_5MIN) {
    return res.json({ success: false, error: "Cooldown activo" });
  }

  user.balance += REWARD_5MIN;
  user.last5 = now;
  saveData(data);

  res.json({ success: true, balance: user.balance });
});

/* ===== CLAIM DAILY ===== */
app.post("/claim/daily", async (req, res) => {
  if (!req.session.email) {
    return res.json({ success: false, error: "No autenticado" });
  }

  const { token } = req.body;
  if (!token) {
    return res.json({ success: false, error: "Captcha requerido" });
  }

  const captchaOK = await verifyCaptcha(token, req.ip);
  if (!captchaOK) {
    return res.json({ success: false, error: "Captcha inválido" });
  }

  const data = loadData();
  const user = data.users[req.session.email];
  const now = Date.now();

  if (now - user.lastDaily < COOLDOWN_DAILY) {
    return res.json({ success: false, error: "Reclamo diario ya usado" });
  }

  user.balance += REWARD_DAILY;
  user.lastDaily = now;
  saveData(data);

  res.json({ success: true, balance: user.balance });
});

/* ===== START ===== */
app.listen(PORT, () => {
  console.log(`✅ Faucet activo en http://localhost:${PORT}`);
});
