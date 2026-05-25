function requireLogin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Not logged in' });
  next();
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.session.user) return res.status(401).json({ error: 'Not logged in' });
    if (req.session.user.Role !== role) return res.status(403).json({ error: 'Forbidden' });
    next();
  };
}

// For HTML page routes — redirects instead of returning JSON
function requireAdmin(req, res, next) {
  if (!req.session.user) return res.redirect('/admin/login');
  if (req.session.user.Role !== 'admin') return res.redirect('/admin/login');
  next();
}

module.exports = { requireLogin, requireRole, requireAdmin };
