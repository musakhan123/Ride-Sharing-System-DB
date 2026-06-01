function _wantsHtml(req) {
  return !req.xhr && req.accepts('html');
}

function _dashboardFor(user) {
  if (user.Role === 'driver') return '/driver/dashboard';
  if (user.Role === 'admin')  return '/admin/dashboard';
  return '/passenger/dashboard';
}

// ── Named role guards ────────────────────────────────────────────────────────
// Each guard redirects unauthenticated users to the login page and wrong-role
// users directly to THEIR OWN dashboard, so there is never an intermediate
// hop through /auth/login that accidentally lands them on the wrong page.

function isPassenger(req, res, next) {
  if (!req.session.user) {
    if (_wantsHtml(req)) return res.redirect('/auth/login');
    return res.status(401).json({ error: 'Not logged in' });
  }
  if (req.session.user.Role !== 'passenger') {
    if (_wantsHtml(req)) return res.redirect(_dashboardFor(req.session.user));
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}

function isDriver(req, res, next) {
  if (!req.session.user) {
    if (_wantsHtml(req)) return res.redirect('/auth/login');
    return res.status(401).json({ error: 'Not logged in' });
  }
  if (req.session.user.Role !== 'driver') {
    if (_wantsHtml(req)) return res.redirect(_dashboardFor(req.session.user));
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}

function isAdmin(req, res, next) {
  if (!req.session.user) return res.redirect('/admin/login');
  if (req.session.user.Role !== 'admin') return res.redirect(_dashboardFor(req.session.user));
  next();
}

// ── Backward-compatible aliases ──────────────────────────────────────────────
function requireLogin(req, res, next) {
  if (!req.session.user) {
    if (_wantsHtml(req)) return res.redirect('/auth/login');
    return res.status(401).json({ error: 'Not logged in' });
  }
  next();
}

// requireRole kept so any code that still references it keeps working
function requireRole(role) {
  const guards = { passenger: isPassenger, driver: isDriver, admin: isAdmin };
  return guards[role] || ((req, res, next) => next());
}

const requireAdmin = isAdmin;

module.exports = { requireLogin, requireRole, requireAdmin, isPassenger, isDriver, isAdmin };
