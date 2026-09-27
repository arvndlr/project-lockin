const bcrypt = require("bcryptjs");

function attachUser(store) {
  return (req, res, next) => {
    if (req.session.userId) {
      req.user = store.get().users.find((u) => u.id === req.session.userId) || null;
      if (!req.user) req.session.userId = null;
    }
    next();
  };
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ ok: false, reason: "Not logged in." });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ ok: false, reason: "Not allowed for this role." });
    }
    next();
  };
}

function verifyLogin(store, username, password) {
  const user = store.get().users.find((u) => u.username === username);
  if (!user) return null;
  if (!bcrypt.compareSync(password, user.passwordHash)) return null;
  return user;
}

function publicUser(user) {
  if (!user) return null;
  const { passwordHash, ...rest } = user;
  return rest;
}

module.exports = { attachUser, requireRole, verifyLogin, publicUser };
