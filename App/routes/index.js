const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  if (req.session.user) {
    const role = req.session.user.Role;
    if (role === 'driver')    return res.redirect('/driver/dashboard');
    if (role === 'admin')     return res.redirect('/admin/dashboard');
    return res.redirect('/passenger/dashboard');
  }
  res.render('index', { title: 'Ride Sharing System' });
});

module.exports = router;
