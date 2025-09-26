const express = require('express');
const auth = require('../middleware/auth');
const role = require('../middleware/role');
const ContactMessage = require('../models/ContactMessage');
const Ride = require('../models/Ride');

const router = express.Router();

// Get driver earnings
router.get('/earnings', auth, role(['driver']), async (req, res) => {
  try {
    const driverId = req.user.id;
    
    // Get all completed rides for this driver
    const rides = await Ride.find({ 
      driver_id: driverId, 
      status: 'completed' 
    }).populate('user_id', 'name').sort({ createdAt: -1 });
    
    // Calculate earnings
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thisWeekStart = new Date(today);
    thisWeekStart.setDate(today.getDate() - today.getDay());
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    
    const todayEarnings = rides
      .filter(r => new Date(r.createdAt) >= today)
      .reduce((sum, r) => sum + (r.fare || 0), 0);
    
    const thisWeekEarnings = rides
      .filter(r => new Date(r.createdAt) >= thisWeekStart)
      .reduce((sum, r) => sum + (r.fare || 0), 0);
    
    const thisMonthEarnings = rides
      .filter(r => new Date(r.createdAt) >= thisMonthStart)
      .reduce((sum, r) => sum + (r.fare || 0), 0);
    
    const totalEarnings = rides.reduce((sum, r) => sum + (r.fare || 0), 0);
    
    // Format recent rides
    const recentRides = rides.slice(0, 10).map(ride => ({
      id: ride._id,
      from: ride.pickup_location?.address || 'Unknown',
      to: ride.drop_location?.address || 'Unknown',
      fare: ride.fare || 0,
      date: ride.createdAt.toLocaleDateString(),
      passenger: ride.user_id?.name || 'Unknown',
      status: 'Completed'
    }));
    
    res.json({
      success: true,
      earnings: {
        today: todayEarnings,
        thisWeek: thisWeekEarnings,
        thisMonth: thisMonthEarnings,
        total: totalEarnings,
        rides: recentRides
      }
    });
  } catch (error) {
    console.error('Earnings fetch error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Support messages for drivers
router.get('/support/messages', auth, role(['driver']), async (req, res) => {
  try {
    const messages = await ContactMessage.find({ 
      $or: [
        { driverId: req.user.id },
        { email: req.user.email, userType: 'driver' }
      ]
    }).sort({ createdAt: -1 });
    res.json({ success: true, messages });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Submit support message for drivers
router.post('/support/contact', auth, role(['driver']), async (req, res) => {
  try {
    const { subject, message } = req.body;
    const contactMessage = new ContactMessage({ 
      name: req.user.name,
      email: req.user.email,
      subject, 
      message, 
      driverId: req.user.id,
      userType: 'driver'
    });
    await contactMessage.save();
    res.json({ success: true, message: 'Message sent successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;