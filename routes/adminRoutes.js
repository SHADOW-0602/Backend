const express = require('express');
const auth = require('../middleware/auth');
const role = require('../middleware/role');
const AnalyticsService = require('../services/analyticsService');

const User = require('../models/User');
const Driver = require('../models/Driver');
const Ride = require('../models/Ride');
const ContactMessage = require('../models/ContactMessage');

const router = express.Router();

console.log('🔧 Admin routes module loaded successfully');

// Test route to verify admin routes are working (no auth required for testing)
router.get('/test', (req, res) => {
  console.log('Admin test route hit!');
  res.json({ success: true, message: 'Admin routes are working', timestamp: new Date() });
});

// Test route with auth
router.get('/test-auth', auth, role(['admin']), (req, res) => {
  res.json({ success: true, message: 'Admin auth routes are working', user: req.user });
});

// Get all users
router.get('/users', auth, role(['admin']), async (req, res) => {
  try {
    const users = await User.find({}, { password: 0 }).sort({ createdAt: -1 });
    res.json({ success: true, users });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});



// Get all drivers
router.get('/drivers', auth, role(['admin']), async (req, res) => {
  try {
    const drivers = await Driver.find({}, { password: 0 }).sort({ createdAt: -1 });

    res.json({ success: true, drivers });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get all trips/rides
router.get('/trips', auth, role(['admin']), async (req, res) => {
  try {
    const trips = await Ride.find({})
      .populate('user_id', 'name email')
      .populate('driver_id', 'name email')
      .sort({ createdAt: -1 });
    res.json({ success: true, trips });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get all complaints
router.get('/complaints', auth, role(['admin']), async (req, res) => {
  try {
    const SupportTicket = require('../models/SupportTicket');
    const complaints = await SupportTicket.find({})
      .populate('userId', 'name email')
      .sort({ createdAt: -1 });
    res.json({ success: true, complaints });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Resolve complaint
router.put('/complaints/:complaintId/resolve', auth, role(['admin']), async (req, res) => {
  try {
    const SupportTicket = require('../models/SupportTicket');
    await SupportTicket.findByIdAndUpdate(req.params.complaintId, {
      status: 'resolved',
      updatedAt: new Date()
    });
    res.json({ success: true, message: 'Complaint resolved' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Analytics for admin dashboard
router.get('/analytics', auth, async (req, res) => {
  try {
    // Get basic counts without complex aggregations
    const [totalUsers, totalDrivers, totalRides] = await Promise.all([
      User.countDocuments().catch(() => 0),
      Driver.countDocuments().catch(() => 0),
      Ride.countDocuments().catch(() => 0)
    ]);
    
    const data = {
      success: true,
      data: {
        summary: {
          totalRides,
          totalRevenue: totalRides * 150, // Mock calculation
          averageRating: 4.2,
          completionRate: 85
        },
        today: {
          totalUsers,
          activeDrivers: Math.floor(totalDrivers * 0.3),
          rides: Math.floor(totalRides * 0.1),
          revenue: Math.floor(totalRides * 15)
        }
      }
    };
    
    res.json(data);
  } catch (err) {
    console.error('Analytics error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Generate analytics
router.post('/analytics/generate', auth, role(['admin']), async (req, res) => {
  try {
    res.json({ success: true, message: 'Analytics generated successfully' });
  } catch (err) {
    console.error('Generate analytics error:', err);
    res.status(500).json({ error: err.message });
  }
});

// System stats for real-time dashboard
router.get('/system-stats', auth, role(['admin']), async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    // Get today's rides
    const todayRides = await Ride.find({
      createdAt: { $gte: today, $lt: tomorrow },
      status: 'completed'
    });
    
    // Get all completed rides for total stats
    const allCompletedRides = await Ride.find({ status: 'completed' });
    
    // Calculate stats
    const totalRides = allCompletedRides.length;
    const todayRidesCount = todayRides.length;
    const totalRevenue = allCompletedRides.reduce((sum, ride) => sum + (ride.fare || 0), 0);
    const todayRevenue = todayRides.reduce((sum, ride) => sum + (ride.fare || 0), 0);
    
    // Calculate average rating from completed rides with ratings
    const ridesWithRatings = allCompletedRides.filter(ride => ride.rating && ride.rating > 0);
    const averageRating = ridesWithRatings.length > 0 ? 
      (ridesWithRatings.reduce((sum, ride) => sum + ride.rating, 0) / ridesWithRatings.length).toFixed(1) : 0;
    
    // Calculate completion rate
    const allRides = await Ride.find({});
    const completionRate = allRides.length > 0 ? 
      Math.round((allCompletedRides.length / allRides.length) * 100) : 0;
    
    const stats = {
      totalRides,
      todayRides: todayRidesCount,
      totalRevenue: Math.round(totalRevenue),
      todayRevenue: Math.round(todayRevenue),
      averageRating: parseFloat(averageRating),
      completionRate
    };
    
    res.json({ success: true, stats });
  } catch (error) {
    console.error('Error fetching system stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get online drivers for live monitoring
router.get('/online-drivers', auth, role(['admin']), async (req, res) => {
  try {
    const onlineDrivers = await Driver.find({
      status: { $in: ['available', 'busy'] },
      'driverInfo.isVerified': true
    }).select('name email phone status rating completedRides currentLocation location settings');
    
    res.json({
      success: true,
      drivers: onlineDrivers
    });
  } catch (error) {
    console.error('Error fetching online drivers:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch online drivers' });
  }
});

// Get real-time system metrics
router.get('/system-metrics', auth, role(['admin']), async (req, res) => {
  try {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    
    const [activeTrips, onlineDrivers, recentTrips] = await Promise.all([
      Ride.countDocuments({ status: { $in: ['accepted', 'in_progress'] } }),
      Driver.countDocuments({ status: 'available' }),
      Ride.countDocuments({ createdAt: { $gte: oneHourAgo } })
    ]);
    
    // Calculate real-time revenue (ongoing trips)
    const ongoingRevenue = await Ride.aggregate([
      { $match: { status: { $in: ['accepted', 'in_progress'] } } },
      { $group: { _id: null, total: { $sum: '$fare' } } }
    ]);
    
    // Simulate system load (in real app, get from system metrics)
    const systemLoad = Math.floor(Math.random() * 100);
    
    res.json({
      success: true,
      metrics: {
        activeTrips,
        onlineDrivers,
        realtimeRevenue: ongoingRevenue[0]?.total || 0,
        systemLoad,
        tripsTrend: recentTrips > 5 ? 1 : -1,
        driversTrend: onlineDrivers > 3 ? 1 : -1
      }
    });
  } catch (error) {
    console.error('Error fetching system metrics:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch system metrics' });
  }
});



// Driver application management
router.get('/driver-applications', auth, role(['admin']), async (req, res) => {
  try {
    const applications = await User.find(
      { 'driverApplication.status': { $exists: true } },
      { name: 1, email: 1, driverApplication: 1 }
    ).sort({ 'driverApplication.appliedAt': -1 });
    
    res.json({ success: true, applications });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/approve-driver/:userId', auth, role(['admin']), async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId);
    
    if (!user || !user.driverApplication) {
      return res.status(404).json({ success: false, error: 'Application not found' });
    }
    
    // Create driver record with all user data
    const driverData = {
      name: user.name,
      email: user.email,
      phone: user.phone,
      password: user.password,
      profile_image: user.profile_image,
      location: user.location,
      rating: user.rating,
      originalUserId: user._id,
      settings: user.settings,
      
      // Driver-specific info from application
      driverInfo: {
        licenseNumber: user.driverApplication.licenseNumber,
        licenseExpiry: user.driverApplication.licenseExpiry,
        vehicleType: user.driverApplication.vehicleType,
        vehicleMake: user.driverApplication.vehicleMake,
        vehicleModel: user.driverApplication.vehicleModel,
        vehicleYear: user.driverApplication.vehicleYear,
        vehicleColor: user.driverApplication.vehicleColor,
        registrationNumber: user.driverApplication.registrationNumber,
        drivingExperience: user.driverApplication.drivingExperience,
        documents: user.driverApplication.documents
      }
    };
    
    // Create driver record
    const driver = await Driver.create(driverData);
    

    
    // Remove user from users collection
    await User.findByIdAndDelete(userId);
    
    res.json({ 
      success: true, 
      message: 'Driver application approved and user migrated to drivers collection',
      driverId: driver._id
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/reject-driver/:userId', auth, role(['admin']), async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body;
    
    const user = await User.findById(userId);
    if (!user || !user.driverApplication) {
      return res.status(404).json({ success: false, error: 'Application not found' });
    }
    
    user.driverApplication.status = 'rejected';
    user.driverApplication.reviewedAt = new Date();
    user.driverApplication.reviewedBy = req.user.id;
    user.driverApplication.rejectionReason = reason;
    await user.save();
    
    res.json({ success: true, message: 'Driver application rejected' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Verification request routes
router.get('/verification-requests', auth, role(['admin']), async (req, res) => {
  try {
    // Only show drivers who have explicitly submitted verification requests with documents
    const requests = await Driver.find({
      $and: [
        // Must have a verification request that was submitted
        { 'verificationRequest.status': 'pending' },
        { 'verificationRequest.submittedAt': { $exists: true } },
        // Must not be verified yet
        { 'driverInfo.isVerified': false },
        // Must have uploaded at least one document
        {
          $or: [
            { 'driverInfo.documents.licensePhoto': { $exists: true, $ne: null, $ne: '' } },
            { 'driverInfo.documents.vehicleRC': { $exists: true, $ne: null, $ne: '' } },
            { 'driverInfo.documents.insurance': { $exists: true, $ne: null, $ne: '' } },
            { 'driverInfo.documents.profilePhoto': { $exists: true, $ne: null, $ne: '' } }
          ]
        }
      ]
    }, { 
      name: 1, 
      email: 1, 
      phone: 1, 
      driverInfo: 1, 
      verificationRequest: 1,
      createdAt: 1 
    }).sort({ 'verificationRequest.submittedAt': -1 });
    

    res.json(requests);
  } catch (error) {
    console.error('Error fetching verification requests:', error);
    res.status(500).json({ error: error.message });
  }
});

router.put('/verification/:driverId/approve', auth, role(['admin']), async (req, res) => {
  try {
    await Driver.findByIdAndUpdate(req.params.driverId, {
      'verificationRequest.status': 'approved',
      'verificationRequest.reviewedAt': new Date(),
      'verificationRequest.reviewedBy': req.user.id,
      'driverInfo.isVerified': true
    });
    
    res.json({ success: true, message: 'Verification approved' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/verification/:driverId/reject', auth, role(['admin']), async (req, res) => {
  try {
    await Driver.findByIdAndUpdate(req.params.driverId, {
      'verificationRequest.status': 'rejected',
      'verificationRequest.reviewedAt': new Date(),
      'verificationRequest.reviewedBy': req.user.id,
      'driverInfo.isVerified': false
    });
    
    res.json({ success: true, message: 'Verification rejected' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update driver status (admin only)
router.put('/drivers/:driverId/status', auth, role(['admin']), async (req, res) => {
  try {
    const driverId = req.params.driverId;
    const { status } = req.body;
    
    console.log('Backend - Driver status update request:', {
      driverId,
      driverIdType: typeof driverId,
      driverIdLength: driverId?.length,
      status,
      user: req.user?.id
    });
    
    // Check if driverId is a valid ObjectId
    const mongoose = require('mongoose');
    if (!mongoose.Types.ObjectId.isValid(driverId)) {
      console.log('Backend - Invalid ObjectId format:', driverId);
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid driver ID format' 
      });
    }
    
    if (!['available', 'busy', 'offline', 'suspended'].includes(status)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid status. Must be available, busy, offline, or suspended' 
      });
    }
    
    // First check if driver exists
    const existingDriver = await Driver.findById(driverId);
    console.log('Backend - Driver exists check:', existingDriver ? 'Found' : 'Not found');
    
    if (!existingDriver) {
      // List all drivers for debugging
      const allDrivers = await Driver.find({}, { _id: 1, name: 1 });
      console.log('Backend - All drivers in DB:', allDrivers.map(d => ({ id: d._id.toString(), name: d.name })));
      return res.status(404).json({ success: false, error: 'Driver not found' });
    }
    
    const updatedDriver = await Driver.findByIdAndUpdate(
      driverId,
      { status },
      { new: true, select: '-password' }
    );
    
    console.log('Backend - Driver update result:', updatedDriver ? 'Updated successfully' : 'Update failed');
    
    res.json({ 
      success: true, 
      message: 'Driver status updated successfully',
      driver: updatedDriver
    });
  } catch (error) {
    console.error('Backend - Driver status update error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get driver details (admin only)
router.get('/drivers/:driverId', auth, role(['admin']), async (req, res) => {
  try {
    const driver = await Driver.findById(req.params.driverId, { password: 0 });
    
    if (!driver) {
      return res.status(404).json({ success: false, error: 'Driver not found' });
    }
    
    res.json({ success: true, driver });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get driver location (admin only)
router.get('/drivers/:driverId/location', auth, role(['admin']), async (req, res) => {
  try {
    const driverId = req.params.driverId;
    
    // First try to get from database
    const dbDriver = await Driver.findById(driverId);
    if (dbDriver && dbDriver.location && dbDriver.location.latitude && dbDriver.location.longitude) {
      return res.json({
        success: true,
        location: {
          latitude: dbDriver.location.latitude,
          longitude: dbDriver.location.longitude,
          address: dbDriver.location.address || 'Delhi, India',
          updatedAt: dbDriver.lastLocationUpdate || dbDriver.updatedAt
        }
      });
    }
    
    // Try to get from location file
    const { parseDriverLocationFile } = require('../services/locationService');
    const drivers = await parseDriverLocationFile();
    const fileDriver = drivers.find(d => d.driverId === driverId);
    
    if (fileDriver) {
      return res.json({
        success: true,
        location: {
          latitude: fileDriver.latitude,
          longitude: fileDriver.longitude,
          address: fileDriver.address,
          updatedAt: fileDriver.timestamp
        }
      });
    }
    
    // Fallback to default Delhi location
    res.json({
      success: true,
      location: {
        latitude: 28.6139,
        longitude: 77.2090,
        address: 'Delhi, India',
        updatedAt: new Date()
      }
    });
  } catch (error) {
    console.error('Error getting driver location:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update driver settings (admin only)
router.put('/drivers/:driverId/settings', auth, role(['admin']), async (req, res) => {
  try {
    console.log('Driver settings update route hit:', req.params.driverId, req.body);
    const driverId = req.params.driverId;
    const settings = req.body;
    
    const updatedDriver = await Driver.findByIdAndUpdate(
      driverId,
      { $set: { [`settings.${Object.keys(settings)[0]}`]: Object.values(settings)[0] } },
      { new: true, select: '-password' }
    );
    
    if (!updatedDriver) {
      return res.status(404).json({ success: false, error: 'Driver not found' });
    }
    
    res.json({ success: true, driver: updatedDriver });
  } catch (error) {
    console.error('Driver settings update error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

console.log('Driver settings and location routes registered');



// Get all contact messages
router.get('/contact-messages', auth, role(['admin']), async (req, res) => {
  try {
    const messages = await ContactMessage.find({})
      .populate('userId', 'name email')
      .populate('driverId', 'name email')
      .sort({ createdAt: -1 });
    res.json({ success: true, messages });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Submit contact message (public route)
router.post('/contact', async (req, res) => {
  try {
    const { name, email, subject, message, userId, driverId, userType } = req.body;
    const contactMessage = new ContactMessage({ 
      name, 
      email, 
      subject, 
      message, 
      userId, 
      driverId, 
      userType: userType || 'user' 
    });
    await contactMessage.save();
    res.json({ success: true, message: 'Message sent successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get user's own messages (authenticated users and drivers)
router.get('/contact/my-messages', auth, async (req, res) => {
  try {
    let query;
    if (req.user.role === 'driver') {
      query = {
        $or: [
          { driverId: req.user.id },
          { email: req.user.email, userType: 'driver' }
        ]
      };
    } else {
      query = {
        $or: [
          { userId: req.user.id },
          { email: req.user.email, userType: 'user' }
        ]
      };
    }
    
    const messages = await ContactMessage.find(query).sort({ createdAt: -1 });
    res.json({ success: true, messages });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Reply to contact message (single reply only)
router.post('/contact-messages/:messageId/reply', auth, role(['admin']), async (req, res) => {
  try {
    const { replyText } = req.body;
    const messageId = req.params.messageId;
    
    const message = await ContactMessage.findById(messageId);
    if (!message) {
      return res.status(404).json({ success: false, error: 'Message not found' });
    }
    
    // Check if already replied
    if (message.reply && message.reply.text) {
      return res.status(400).json({ success: false, error: 'Message already has a reply' });
    }
    
    const updatedMessage = await ContactMessage.findByIdAndUpdate(
      messageId,
      {
        'reply.text': replyText,
        'reply.repliedBy': req.user.id,
        'reply.repliedAt': new Date(),
        status: 'replied'
      },
      { new: true }
    );
    
    // Try to send email reply (don't fail if email fails)
    console.log('=== SENDING EMAIL REPLY ===');
    console.log('Recipient email:', message.email);
    console.log('Email environment check:', {
      EMAIL_USER: process.env.EMAIL_USER ? 'Set' : 'Not set',
      EMAIL_PASS: process.env.EMAIL_PASS ? 'Set' : 'Not set'
    });
    
    let emailDelivered = false;
    try {
      const emailService = require('../services/emailService');
      console.log('Email service loaded successfully');
      
      const emailTemplate = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #667eea;">📧 Reply to Your Contact Message</h2>
          <p>Dear ${message.name},</p>
          <p>Thank you for contacting us. Here's our response to your message:</p>
          
          <div style="background: #f8fafc; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #e2e8f0;">
            <p style="margin: 0; color: #64748b; font-size: 14px;"><strong>Your original message:</strong></p>
            <p style="margin: 5px 0 0 0; color: #1e293b;">${message.message}</p>
          </div>
          
          <div style="background: #f0f9ff; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #3b82f6;">
            <p style="margin: 0; color: #1e40af; font-size: 14px;"><strong>Our response:</strong></p>
            <p style="margin: 5px 0 0 0; color: #1e293b;">${replyText}</p>
          </div>
          
          <p>If you have any further questions, please don't hesitate to contact us again.</p>
          <p>Best regards,<br>The UrbanFleet Support Team</p>
        </div>
      `;
      
      console.log('Attempting to send email...');
      const emailResult = await emailService.sendMarketingEmail(
        message.email, 
        `Re: ${message.subject}`, 
        emailTemplate
      );
      
      console.log('Email send result:', emailResult);
      emailDelivered = emailResult === true;
      
      if (emailDelivered) {
        console.log('✅ Email sent successfully');
      } else {
        console.log('❌ Email sending failed - result was not true');
      }
    } catch (emailError) {
      console.error('❌ Email sending failed with error:', emailError);
      console.error('Error stack:', emailError.stack);
    }
    
    // Update email delivery status
    await ContactMessage.findByIdAndUpdate(messageId, { emailDelivered });
    
    const responseMessage = emailDelivered ? 
      'Reply sent successfully and email delivered' : 
      'Reply sent successfully (email delivery failed - user can view reply in portal)';
    
    console.log('Final response:', responseMessage);
    console.log('=== EMAIL REPLY PROCESS COMPLETE ===');
    
    res.json({ success: true, message: responseMessage, emailDelivered });
  } catch (error) {
    console.error('Reply error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

console.log('🔧 Admin routes exported successfully');
module.exports = router;