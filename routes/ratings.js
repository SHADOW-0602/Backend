const express = require('express');
const router = express.Router();
const ratingController = require('../controllers/ratingController');
const auth = require('../middleware/auth');

router.get('/driver-summary', auth, ratingController.getDriverSummary);

module.exports = router;