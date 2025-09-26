const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const http = require('http');
const cookieParser = require('cookie-parser');
const { initSocket } = require('./socket');
const errorHandler = require('./middleware/errorHandler');
const logger = require('./utils/logger');
const SetupService = require('./services/setupService');
const { securityHeaders, sanitizeData, generalLimiter } = require('./middleware/security');
const { connectToDatabase, isConnected, getConnectionStatus } = require('./utils/dbConnection');
const { asyncHandler, withDatabaseAndMonitoring } = require('./middleware/asyncHandler');
const { requestTimer, setCacheHeaders, enableCompression, collectMetrics } = require('./utils/performance');

// Load environment variables
dotenv.config();

// Express app + Create an HTTP server for socket.io
const app = express();
const server = http.createServer(app);

// Security Middleware
app.use(securityHeaders);
app.use(sanitizeData);
app.use(generalLimiter);

// Performance Middleware
app.use(requestTimer);
app.use(setCacheHeaders);
app.use(enableCompression());

// CORS middleware with environment-based origins
const allowedOrigins = process.env.ALLOWED_ORIGINS ? 
    process.env.ALLOWED_ORIGINS.split(',') : 
    ['http://localhost:3000', 'http://localhost:3001'];

app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development') {
        res.header('Access-Control-Allow-Origin', origin || '*');
    }
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Access-Control-Allow-Credentials', 'true');
    
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
});

// Body parsing with size limits
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ limit: '1mb', extended: true }));
app.use(cookieParser());

// Serve static files for verification documents
app.use('/uploads', express.static('uploads'));

// Trust proxy for accurate IP addresses
app.set('trust proxy', 1);

// Direct settings endpoint (before userRoutes)
const auth = require('./middleware/auth');
const role = require('./middleware/role');
const Driver = require('./models/Driver');
const Ride = require('./models/Ride');
const User = require('./models/User');

// Import route modules
const rideRoutes = require('./routes/rideRoutes');
const userRoutes = require('./routes/userRoutes');
const driverRoutes = require('./routes/driverRoutes');
const adminRoutes = require('./routes/adminRoutes');
const paymentRoutes = require('./routes/paymentRoutes');

const locationRoutes = require('./routes/locationRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const chatRoutes = require('./routes/chatRoutes');
const invoiceRoutes = require('./routes/invoiceRoutes');
const supportRoutes = require('./routes/supportRoutes');
const securityRoutes = require('./routes/securityRoutes');
const analyticsRoutes = require('./routes/analytics');
const setupRoutes = require('./routes/setupRoutes');

app.put('/api/users/settings', auth, async (req, res) => {
  try {
    console.log('[SETTINGS] Request received');
    console.log('[SETTINGS] User ID:', encodeURIComponent(req.user.id));
    console.log('[SETTINGS] Body keys:', Object.keys(req.body).map(k => encodeURIComponent(k)));
    
    if (!req.user || !req.user.id) {
      return res.status(401).json({ success: false, error: 'User not authenticated' });
    }
    
    if (!req.body || Object.keys(req.body).length === 0) {
      return res.status(400).json({ success: false, error: 'No settings provided' });
    }
    
    const updates = {};
    Object.keys(req.body).forEach(key => {
      updates[`settings.${key}`] = req.body[key];
    });
    
    console.log('[SETTINGS] Update count:', Object.keys(updates).length);
    console.log('[SETTINGS] User role:', encodeURIComponent(req.user.role));
    
    let result;
    if (req.user.role === 'driver') {
      console.log('[SETTINGS] Updating driver settings');
      result = await Driver.updateOne({ _id: req.user.id }, { $set: updates }, { runValidators: false });
    } else {
      console.log('[SETTINGS] Updating user settings');
      result = await User.updateOne({ _id: req.user.id }, { $set: updates }, { runValidators: false });
    }
    
    console.log('[SETTINGS] Update result - modified:', result.modifiedCount);
    res.json({ success: true, result });
  } catch (error) {
    console.error('[SETTINGS] Error:', error);
    console.error('[SETTINGS] Stack:', error.stack);
    res.status(500).json({ success: false, error: error.message, stack: error.stack });
  }
});

// Contact message endpoints (before other routes)
const ContactMessage = require('./models/ContactMessage');

// Submit contact message (public route)
app.post('/api/admin/contact', async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;
    const contactMessage = new ContactMessage({ name, email, subject, message });
    await contactMessage.save();
    res.json({ success: true, message: 'Message sent successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get all contact messages (admin only)
app.get('/api/admin/contact-messages', auth, role(['admin']), async (req, res) => {
  try {
    const messages = await ContactMessage.find({})
      .populate('userId', 'name email')
      .sort({ createdAt: -1 });
    res.json({ success: true, messages });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Reply to contact message (admin only)
app.post('/api/admin/contact-messages/:messageId/reply', auth, role(['admin']), async (req, res) => {
  try {
    const { messageId } = req.params;
    const { replyText } = req.body;
    
    const message = await ContactMessage.findById(messageId);
    if (!message) {
      return res.status(404).json({ success: false, error: 'Message not found' });
    }
    
    if (!message.replies) {
      message.replies = [];
    }
    message.replies.push({
      text: replyText,
      repliedBy: req.user.id,
      repliedAt: new Date()
    });
    message.status = 'replied';
    
    await message.save();
    
    res.json({ success: true, message: 'Reply sent successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Admin login endpoint
app.post('/api/admin/login', async (req, res) => {
  try {
    const { email, password, secretKey } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email and password are required' 
      });
    }
    
    const bcrypt = require('bcryptjs');
    const jwt = require('jsonwebtoken');
    const Admin = require('./models/Admin');
    
    // Find admin by email
    const admin = await Admin.findOne({ email: email.toLowerCase() });
    if (!admin) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid credentials' 
      });
    }
    
    // Check password
    const isValidPassword = await bcrypt.compare(password, admin.password);
    if (!isValidPassword) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid credentials' 
      });
    }
    
    // Check secret key if provided
    if (secretKey) {
      const isValidSecretKey = await bcrypt.compare(secretKey, admin.secretKey);
      if (!isValidSecretKey) {
        return res.status(401).json({ 
          success: false, 
          message: 'Invalid secret key' 
        });
      }
    }
    
    // Generate JWT token
    const token = jwt.sign(
      { 
        id: admin._id, 
        email: admin.email, 
        role: 'admin' 
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: 'admin'
      }
    });
    
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Login failed: ' + error.message 
    });
  }
});

// API Routes
app.use('/api/users', userRoutes);
app.use('/api/drivers', driverRoutes);
app.use('/api/driver', driverRoutes);
app.use('/api/vehicles', require('./routes/vehicleRoutes'));
app.use('/api/rides', rideRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/setup', setupRoutes);
app.use('/api/security', securityRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/location', locationRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/debug', require('./routes/debugRoutes'));
app.use('/api/ratings', require('./routes/ratings'));

// Admin routes
try {
  console.log('Loading admin routes...');
  const adminRoutes = require('./routes/adminRoutes');
  app.use('/api/admin', adminRoutes);
  console.log('Admin routes loaded successfully');
} catch (error) {
  console.error('Admin routes file could not be loaded:', error.message);
  console.error('Admin routes error stack:', error.stack);
}

// Admin routes - direct implementation as fallback

// System stats endpoint (direct fallback)
app.get('/api/admin/system-stats', auth, role(['admin']), async (req, res) => {
  try {
    const Ride = require('./models/Ride');
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
    
    console.log('System stats calculated:', stats);
    res.json({ success: true, stats });
  } catch (error) {
    console.error('Error fetching system stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get all drivers
app.get('/api/admin/drivers', auth, role(['admin']), async (req, res) => {
  try {
    const drivers = await Driver.find({}, { password: 0 }).sort({ createdAt: -1 });
    res.json({ success: true, drivers });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update driver status
app.put('/api/admin/drivers/:driverId/status', auth, role(['admin']), async (req, res) => {
  try {
    const { status, reason, suspensionType, suspensionEndDate } = req.body;
    const emailService = require('./services/emailService');
    
    const updateData = { status };
    
    // Get current driver to check if was suspended
    const currentDriver = await Driver.findById(req.params.driverId);
    const wasSuspended = currentDriver && currentDriver.suspension && currentDriver.suspension.isSuspended;
    
    // Handle suspension
    if (status === 'suspended') {
      updateData.suspension = {
        isSuspended: true,
        suspendedAt: new Date(),
        suspendedBy: req.user.id,
        reason: reason || 'Policy violation',
        suspensionType: suspensionType || 'temporary',
        suspensionEndDate: suspensionEndDate ? new Date(suspensionEndDate) : null,
        emailSent: false
      };
    } else if (status !== 'suspended') {
      // Clear suspension if status is changed from suspended
      updateData.suspension = {
        isSuspended: false,
        suspendedAt: null,
        suspendedBy: null,
        reason: null,
        suspensionType: null,
        suspensionEndDate: null,
        emailSent: false
      };
    }
    
    const updatedDriver = await Driver.findByIdAndUpdate(
      req.params.driverId,
      updateData,
      { new: true, select: '-password' }
    );
    
    if (!updatedDriver) {
      return res.status(404).json({ success: false, error: 'Driver not found' });
    }
    
    // Send suspension email
    if (status === 'suspended' && !updatedDriver.suspension.emailSent) {
      const emailSent = await emailService.sendDriverSuspensionEmail(updatedDriver, {
        reason: reason || 'Policy violation',
        suspensionType: suspensionType || 'temporary',
        suspensionEndDate
      });
      
      if (emailSent) {
        await Driver.findByIdAndUpdate(req.params.driverId, {
          'suspension.emailSent': true
        });
      }
    }
    
    // Send unsuspension email if driver was previously suspended
    if (wasSuspended && status !== 'suspended') {
      await emailService.sendDriverUnsuspensionEmail(updatedDriver);
    }
    
    res.json({ success: true, message: 'Driver status updated', driver: updatedDriver });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get all users
app.get('/api/admin/users', auth, role(['admin']), async (req, res) => {
  try {
    const users = await User.find({}, { password: 0 }).sort({ createdAt: -1 });
    res.json({ success: true, users });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});





// Fallback admin endpoints with actual data
app.get('/api/admin/trips', auth, role(['admin']), async (req, res) => {
  try {
    const Ride = require('./models/Ride');
    const trips = await Ride.find({})
      .populate('user_id', 'name email')
      .populate('driver_id', 'name email')
      .sort({ createdAt: -1 })
      .limit(50);
    res.json({ success: true, trips });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/admin/complaints', auth, role(['admin']), async (req, res) => {
  try {
    const SupportTicket = require('./models/SupportTicket');
    const complaints = await SupportTicket.find({})
      .populate('userId', 'name email')
      .sort({ createdAt: -1 });
    res.json({ success: true, complaints });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/admin/verification-requests', auth, role(['admin']), async (req, res) => {
  try {
    // Find drivers who have explicitly applied for verification
    const requests = await Driver.find({
      'verificationRequest.status': 'pending',
      'verificationRequest.submittedAt': { $exists: true }
    }, { 
      name: 1, 
      email: 1, 
      phone: 1, 
      driverInfo: 1, 
      verificationRequest: 1,
      createdAt: 1 
    }).sort({ 'verificationRequest.submittedAt': -1 });
    
    console.log('Verification requests found:', encodeURIComponent(requests.length));
    res.json(requests);
  } catch (error) {
    console.error('Error fetching verification requests:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Approve verification
app.put('/api/admin/verification/:driverId/approve', auth, role(['admin']), async (req, res) => {
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

// Reject verification
app.put('/api/admin/verification/:driverId/reject', auth, role(['admin']), async (req, res) => {
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

// Generate analytics for specific date
app.post('/api/admin/analytics/generate', auth, role(['admin']), async (req, res) => {
  try {
    const { date } = req.body;
    const AnalyticsService = require('./services/analyticsService');
    
    console.log('Generating analytics for date:', date || 'today');
    const analytics = await AnalyticsService.generateDailyAnalytics(date ? new Date(date) : new Date());
    
    console.log('Analytics generated successfully:', analytics._id);
    res.json({ 
      success: true, 
      message: 'Analytics generated successfully',
      analytics: {
        date: analytics.date,
        totalRides: analytics.totalRides,
        completedRides: analytics.completedRides,
        totalRevenue: analytics.totalRevenue,
        averageRating: analytics.averageRating
      }
    });
  } catch (error) {
    console.error('Analytics generation error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/admin/chats', auth, role(['admin']), async (req, res) => {
  try {
    const Chat = require('./models/Chat');
    const chats = await Chat.aggregate([
      {
        $group: {
          _id: '$userId',
          lastMessage: { $last: '$text' },
          lastMessageTime: { $last: '$timestamp' },
          messageCount: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      {
        $unwind: { path: '$user', preserveNullAndEmptyArrays: true }
      },
      {
        $project: {
          userId: '$_id',
          userName: { $ifNull: ['$user.name', 'Unknown User'] },
          userEmail: { $ifNull: ['$user.email', 'No email'] },
          lastMessage: 1,
          lastMessageTime: 1,
          messageCount: 1
        }
      },
      {
        $sort: { lastMessageTime: -1 }
      }
    ]);
    res.json({ success: true, data: chats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});



// Update driver location endpoint
app.post('/api/drivers/update-location', auth, role(['driver']), async (req, res) => {
  try {
    const { latitude, longitude, address } = req.body;
    
    const updatedDriver = await Driver.findByIdAndUpdate(req.user.id, {
      location: { latitude, longitude, address },
      lastLocationUpdate: new Date(),
      lastActive: new Date()
    }, { new: true });
    
    if (updatedDriver) {
      // Emit socket update for real-time tracking
      const io = app.get('io');
      if (io) {
        io.emit('driverLocationUpdate', {
          driverId: req.user.id,
          latitude,
          longitude,
          address,
          status: updatedDriver.status,
          timestamp: new Date()
        });
      }
      
      res.json({ success: true, message: 'Location updated successfully' });
    } else {
      res.status(404).json({ success: false, error: 'Driver not found' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Driver earnings endpoint
app.get('/api/driver/earnings', auth, role(['driver']), async (req, res) => {
  try {
    const driverId = req.user.id;
    const Ride = require('./models/Ride');
    
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    // Get completed rides for this driver
    const completedRides = await Ride.find({
      driver_id: driverId,
      status: 'completed',
      payment_status: 'paid'
    }).populate('user_id', 'name').sort({ createdAt: -1 });
    
    // Calculate earnings
    const today = completedRides
      .filter(ride => new Date(ride.createdAt) >= startOfDay)
      .reduce((sum, ride) => sum + (ride.fare || 0), 0);
    
    const thisWeek = completedRides
      .filter(ride => new Date(ride.createdAt) >= startOfWeek)
      .reduce((sum, ride) => sum + (ride.fare || 0), 0);
    
    const thisMonth = completedRides
      .filter(ride => new Date(ride.createdAt) >= startOfMonth)
      .reduce((sum, ride) => sum + (ride.fare || 0), 0);
    
    const total = completedRides.reduce((sum, ride) => sum + (ride.fare || 0), 0);
    
    // Format recent rides
    const recentRides = completedRides.slice(0, 10).map(ride => ({
      id: ride._id,
      date: ride.createdAt.toISOString().split('T')[0],
      from: ride.pickup_location?.address || 'Unknown',
      to: ride.drop_location?.address || 'Unknown',
      fare: ride.fare || 0,
      status: ride.status,
      passenger: ride.user_id?.name || 'Unknown'
    }));
    
    res.json({
      success: true,
      earnings: {
        today,
        thisWeek,
        thisMonth,
        total,
        rides: recentRides,
        totalRides: completedRides.length
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Real analytics endpoint
app.get('/api/admin/analytics', auth, role(['admin']), async (req, res) => {
  try {
    // Get current stats directly
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    
    const todayRides = await Ride.countDocuments({
      createdAt: { $gte: startOfDay }
    });
    
    const todayRevenue = await Ride.aggregate([
      { $match: { createdAt: { $gte: startOfDay }, status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$fare' } } }
    ]);
    
    const activeDriversCount = await Driver.countDocuments({ status: 'available' });
    const totalUsers = await User.countDocuments();
    const totalDrivers = await Driver.countDocuments();
    const completedRides = await Ride.countDocuments({ status: 'completed' });
    const totalRides = await Ride.countDocuments();
    
    // Calculate completion rate
    const completionRate = totalRides > 0 ? Math.round((completedRides / totalRides) * 100) : 0;
    
    // Get last 7 days data
    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      const nextDay = new Date(date);
      nextDay.setDate(nextDay.getDate() + 1);
      
      const dayRides = await Ride.countDocuments({
        createdAt: { $gte: date, $lt: nextDay }
      });
      
      const dayRevenue = await Ride.aggregate([
        { $match: { createdAt: { $gte: date, $lt: nextDay }, status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$fare' } } }
      ]);
      
      last7Days.push({
        date: date.toISOString().split('T')[0],
        rides: dayRides,
        revenue: dayRevenue[0]?.total || 0
      });
    }
    
    res.json({
      success: true,
      data: {
        summary: {
          totalRides,
          totalRevenue: await Ride.aggregate([
            { $match: { status: 'completed' } },
            { $group: { _id: null, total: { $sum: '$fare' } } }
          ]).then(result => result[0]?.total || 0),
          completionRate,
          dailyData: last7Days
        },
        today: {
          rides: todayRides,
          revenue: todayRevenue[0]?.total || 0,
          activeDrivers: activeDriversCount,
          totalUsers,
          totalDrivers
        }
      }
    });
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Mount additional route modules
app.use('/api/admin', adminRoutes);
app.use('/api/gift-cards', require('./routes/giftCardRoutes'));

// Health check endpoint for Vercel
app.get('/health', asyncHandler(async (req, res) => {
    const dbStatus = getConnectionStatus();
    const healthData = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        database: dbStatus,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        environment: process.env.NODE_ENV || 'development',
        version: process.env.npm_package_version || '1.0.0'
    };
    
    if (!isConnected()) {
        healthData.status = 'degraded';
        healthData.warnings = ['Database not connected'];
    }
    
    res.json(healthData);
}));

// Middleware to update driver lastActive timestamp
app.use(['/api/drivers/*', '/api/rides/*'], auth, async (req, res, next) => {
  if (req.user && req.user.role === 'driver') {
    try {
      await Driver.findByIdAndUpdate(req.user.id, { lastActive: new Date() });
    } catch (error) {
      console.warn('Failed to update driver lastActive:', error.message);
    }
  }
  next();
});

// Live monitoring endpoints
app.get('/api/admin/online-drivers', auth, role(['admin']), async (req, res) => {
  try {
    const onlineDrivers = await Driver.find({ 
      status: { $in: ['available', 'busy'] },
      lastActive: { $gte: new Date(Date.now() - 5 * 60 * 1000) } // Active in last 5 minutes
    }).select('name email phone status location lastActive').limit(50);
    
    res.json({ success: true, drivers: onlineDrivers });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/admin/system-metrics', auth, role(['admin']), async (req, res) => {
  try {
    const now = new Date();
    const last5Minutes = new Date(now.getTime() - 5 * 60 * 1000);
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    // Real-time metrics
    const activeRides = await Ride.countDocuments({ 
      status: { $in: ['accepted', 'in_progress'] }
    });
    
    const onlineDrivers = await Driver.countDocuments({ 
      status: { $in: ['available', 'busy'] },
      lastActive: { $gte: last5Minutes }
    });
    
    const pendingRides = await Ride.countDocuments({ status: 'pending' });
    
    // 24-hour metrics
    const ridesLast24h = await Ride.countDocuments({ 
      createdAt: { $gte: last24Hours }
    });
    
    const revenueLast24h = await Ride.aggregate([
      { $match: { createdAt: { $gte: last24Hours }, status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$fare' } } }
    ]);
    
    const completedRidesLast24h = await Ride.countDocuments({ 
      createdAt: { $gte: last24Hours },
      status: 'completed'
    });
    
    res.json({
      success: true,
      metrics: {
        realTime: {
          activeRides,
          onlineDrivers,
          pendingRides,
          timestamp: now
        },
        last24Hours: {
          totalRides: ridesLast24h,
          completedRides: completedRidesLast24h,
          revenue: revenueLast24h[0]?.total || 0,
          completionRate: ridesLast24h > 0 ? Math.round((completedRidesLast24h / ridesLast24h) * 100) : 0
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// User rides endpoint
app.get('/api/rides/user', auth, role(['user']), async (req, res) => {
  try {
    const rides = await Ride.find({ user_id: req.user.id })
      .populate('driver_id', 'name phone rating')
      .sort({ createdAt: -1 })
      .limit(20);
    
    res.json({ success: true, rides });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Active trips endpoint for live monitoring
app.get('/api/admin/active-trips', auth, role(['admin']), async (req, res) => {
  try {
    const activeTrips = await Ride.find({ 
      status: { $in: ['accepted', 'in_progress'] }
    })
    .populate('user_id', 'name phone')
    .populate('driver_id', 'name phone location')
    .sort({ createdAt: -1 })
    .limit(50);
    
    // Format trips for live monitoring
    const formattedTrips = activeTrips.map(trip => ({
      id: trip._id,
      status: trip.status,
      passenger: {
        name: trip.user_id?.name || 'Unknown',
        phone: trip.user_id?.phone || 'N/A'
      },
      driver: {
        name: trip.driver_id?.name || 'Unknown',
        phone: trip.driver_id?.phone || 'N/A',
        location: trip.driver_id?.location || null
      },
      pickup: trip.pickup_location,
      dropoff: trip.drop_location,
      fare: trip.fare,
      createdAt: trip.createdAt,
      estimatedArrival: trip.estimatedArrival || null
    }));
    
    res.json({ success: true, trips: formattedTrips });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// System alerts endpoint for live monitoring
app.get('/api/admin/system-alerts', auth, role(['admin']), async (req, res) => {
  try {
    const alerts = [];
    const now = new Date();
    const last5Minutes = new Date(now.getTime() - 5 * 60 * 1000);
    
    // Check for pending rides older than 5 minutes
    const oldPendingRides = await Ride.countDocuments({
      status: 'pending',
      createdAt: { $lt: last5Minutes }
    });
    
    if (oldPendingRides > 0) {
      alerts.push({
        id: 'pending-rides',
        type: 'warning',
        title: 'Pending Rides Alert',
        message: `${oldPendingRides} rides have been pending for more than 5 minutes`,
        timestamp: now,
        count: oldPendingRides
      });
    }
    
    // Check for low driver availability
    const availableDrivers = await Driver.countDocuments({ 
      status: 'available',
      lastActive: { $gte: last5Minutes }
    });
    
    if (availableDrivers < 3) {
      alerts.push({
        id: 'low-drivers',
        type: 'error',
        title: 'Low Driver Availability',
        message: `Only ${availableDrivers} drivers are currently available`,
        timestamp: now,
        count: availableDrivers
      });
    }
    
    // Check for system performance (mock)
    const systemLoad = Math.random() * 100;
    if (systemLoad > 80) {
      alerts.push({
        id: 'high-load',
        type: 'warning',
        title: 'High System Load',
        message: `System load is at ${Math.round(systemLoad)}%`,
        timestamp: now,
        value: Math.round(systemLoad)
      });
    }
    
    res.json({ success: true, alerts });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get driver locations for admin portal
app.get('/api/admin/driver-locations', auth, role(['admin']), async (req, res) => {
  try {
    // Get drivers with recent location updates
    const driversWithLocation = await Driver.find({
      location: { $exists: true },
      'location.latitude': { $exists: true },
      'location.longitude': { $exists: true },
      lastLocationUpdate: { $gte: new Date(Date.now() - 30 * 60 * 1000) } // Last 30 minutes
    }).select('name email phone status location lastLocationUpdate driverInfo.vehicleType').limit(50);
    
    const driverLocations = driversWithLocation.map(driver => ({
      driverId: driver._id,
      name: driver.name,
      email: driver.email,
      phone: driver.phone,
      location: {
        latitude: driver.location.latitude,
        longitude: driver.location.longitude,
        address: driver.location.address || 'Unknown location',
        updatedAt: driver.lastLocationUpdate || driver.updatedAt
      },
      status: driver.status,
      vehicleType: driver.driverInfo?.vehicleType || 'Unknown'
    }));
    
    res.json({ success: true, drivers: driverLocations });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get specific driver location
app.get('/api/admin/drivers/:driverId/location', auth, role(['admin']), async (req, res) => {
  try {
    const { driverId } = req.params;
    const driver = await Driver.findById(driverId).select('location lastLocationUpdate status');
    
    if (!driver || !driver.location) {
      return res.status(404).json({ success: false, error: 'Driver location not found' });
    }
    
    res.json({
      success: true,
      location: {
        latitude: driver.location.latitude,
        longitude: driver.location.longitude,
        address: driver.location.address || 'Unknown location',
        updatedAt: driver.lastLocationUpdate || driver.updatedAt,
        status: driver.status
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});



// Driver portal endpoint
app.get('/driver/portal', auth, role(['driver']), async (req, res) => {
  try {
    const driverId = req.user.id;
    
    // Get driver info
    const driver = await Driver.findById(driverId).select('-password');
    if (!driver) {
      return res.status(404).json({ success: false, error: 'Driver not found' });
    }
    
    // Get recent rides
    const recentRides = await Ride.find({ driver_id: driverId })
      .populate('user_id', 'name phone')
      .sort({ createdAt: -1 })
      .limit(10);
    
    // Get earnings data
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    const completedRides = await Ride.find({
      driver_id: driverId,
      status: 'completed',
      payment_status: 'paid'
    });
    
    const todayEarnings = completedRides
      .filter(ride => new Date(ride.createdAt) >= startOfDay)
      .reduce((sum, ride) => sum + (ride.fare || 0), 0);
    
    const weeklyEarnings = completedRides
      .filter(ride => new Date(ride.createdAt) >= startOfWeek)
      .reduce((sum, ride) => sum + (ride.fare || 0), 0);
    
    const monthlyEarnings = completedRides
      .filter(ride => new Date(ride.createdAt) >= startOfMonth)
      .reduce((sum, ride) => sum + (ride.fare || 0), 0);
    
    const totalEarnings = completedRides.reduce((sum, ride) => sum + (ride.fare || 0), 0);
    
    res.json({
      success: true,
      driver,
      recentRides,
      earnings: {
        today: todayEarnings,
        weekly: weeklyEarnings,
        monthly: monthlyEarnings,
        total: totalEarnings
      },
      stats: {
        totalRides: recentRides.length,
        completedRides: completedRides.length,
        rating: driver.rating || 0
      }
    });
  } catch (error) {
    console.error('Driver portal error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Real-time trip updates endpoint
app.get('/api/rides/:rideId/live-status', auth, async (req, res) => {
  try {
    const { rideId } = req.params;
    const ride = await Ride.findById(rideId)
      .populate('user_id', 'name phone')
      .populate('driver_id', 'name phone rating location');
    
    if (!ride) {
      return res.status(404).json({ success: false, error: 'Ride not found' });
    }
    
    // Get driver's current location if ride is active
    let driverLocation = null;
    if (ride.status === 'in_progress' && ride.driver_id?.location) {
      driverLocation = {
        latitude: ride.driver_id.location.latitude,
        longitude: ride.driver_id.location.longitude,
        address: ride.driver_id.location.address || 'In transit'
      };
    }
    
    res.json({
      success: true,
      ride,
      driverLocation,
      isTracking: ride.status === 'in_progress',
      timestamp: new Date()
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});



// Upload driver verification documents
app.post('/api/driver/upload-documents', auth, role(['driver']), async (req, res) => {
  try {
    const { licensePhoto, vehicleRC, insurance, profilePhoto } = req.body;
    
    const updateData = {
      'driverInfo.documents.licensePhoto': licensePhoto,
      'driverInfo.documents.vehicleRC': vehicleRC,
      'driverInfo.documents.insurance': insurance,
      'driverInfo.documents.profilePhoto': profilePhoto,
      'driverInfo.isVerified': false,
      'verificationRequest.status': 'pending',
      'verificationRequest.submittedAt': new Date()
    };
    
    const driver = await Driver.findByIdAndUpdate(req.user.id, updateData, { new: true });
    
    res.json({ success: true, message: 'Documents uploaded successfully', driver });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});





// Get user's contact message replies
app.get('/api/contact-replies', auth, async (req, res) => {
  try {
    const ContactMessage = require('./models/ContactMessage');
    const replies = await ContactMessage.find({
      $or: [
        { userId: req.user.id },
        { email: req.user.email }
      ],
      'replies.0': { $exists: true }
    }).sort({ 'replies.repliedAt': -1 });
    
    res.json({ success: true, replies });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get user's own contact messages - direct route
app.get('/api/admin/contact/my-messages', auth, async (req, res) => {
  try {
    console.log('✅ Direct contact messages route hit for user:', req.user.id);
    const messages = await ContactMessage.find({ 
      $or: [
        { userId: req.user.id },
        { email: req.user.email }
      ]
    }).sort({ createdAt: -1 });
    console.log('✅ Found messages:', messages.length);
    res.json(messages);
  } catch (error) {
    console.error('❌ Contact messages error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Role switching endpoint for multi-role users and multi-tab support
app.post('/api/auth/switch-role', auth, async (req, res) => {
  try {
    const { targetRole, tabId } = req.body;
    const userId = req.user.id;
    
    console.log(`[ROLE_SWITCH] User ${userId} switching to ${targetRole} in tab ${tabId}`);
    
    // Check if user has access to target role
    let hasAccess = false;
    let userData = null;
    
    if (targetRole === 'admin') {
      const Admin = require('./models/Admin');
      userData = await Admin.findById(userId);
      hasAccess = !!userData;
    } else if (targetRole === 'driver') {
      userData = await Driver.findById(userId);
      hasAccess = !!userData;
    } else if (targetRole === 'user') {
      userData = await User.findById(userId);
      hasAccess = !!userData;
    }
    
    if (!hasAccess) {
      return res.status(403).json({ 
        success: false, 
        error: 'Access denied for this role',
        availableRoles: await getAvailableRoles(userId)
      });
    }
    
    // Generate new token with target role
    const jwt = require('jsonwebtoken');
    const newToken = jwt.sign(
      { 
        id: userId, 
        role: targetRole, 
        roles: req.user.roles || [req.user.role],
        tabId: tabId || null
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    // Set new cookie
    const { setAuthCookie } = require('./middleware/cookieAuth');
    setAuthCookie(res, newToken, targetRole);
    
    // Log role switch for analytics
    console.log(`[ROLE_SWITCH] Success: User ${userId} switched to ${targetRole}`);
    
    res.json({ 
      success: true, 
      role: targetRole, 
      token: newToken,
      user: {
        id: userData._id,
        name: userData.name,
        email: userData.email,
        role: targetRole
      },
      message: 'Role switched successfully' 
    });
  } catch (error) {
    console.error('[ROLE_SWITCH] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Helper function to get available roles for a user
async function getAvailableRoles(userId) {
  const roles = [];
  
  try {
    const user = await User.findById(userId);
    if (user) roles.push('user');
    
    const driver = await Driver.findById(userId);
    if (driver) roles.push('driver');
    
    const Admin = require('./models/Admin');
    const admin = await Admin.findById(userId);
    if (admin) roles.push('admin');
    
    return roles;
  } catch (error) {
    console.error('Error getting available roles:', error);
    return ['user']; // Default fallback
  }
}

// Multi-tab session management endpoint
app.get('/api/auth/sessions', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const availableRoles = await getAvailableRoles(userId);
    
    res.json({
      success: true,
      currentRole: req.user.role,
      availableRoles,
      userId,
      message: 'Session data retrieved successfully'
    });
  } catch (error) {
    console.error('[SESSIONS] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});



// Global error handlers
process.on('uncaughtException', (err) => {
    logger.error('[Process] Uncaught Exception:', err);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('[Process] Unhandled Rejection:', { reason, promise });
    process.exit(1);
});

// Initialize collections if they don't exist
const initializeCollections = async () => {
    try {
        const collections = await mongoose.connection.db.listCollections().toArray();
        const existingCollections = collections.map(col => col.name);
        
        const requiredCollections = [
            'users', 'drivers', 'admins', 'vehicles', 'rides', 
            'analytics', 'invoices', 'ratings', 'payments', 
            'supporttickets', 'supportfeedbacks'
        ];
        
        console.log('📋 Checking database collections...');
        
        for (const collectionName of requiredCollections) {
            if (!existingCollections.includes(collectionName)) {
                await mongoose.connection.db.createCollection(collectionName);
                console.log(`✅ Created collection: ${encodeURIComponent(collectionName)}`);
            } else {
                console.log(`✓ Collection exists: ${encodeURIComponent(collectionName)}`);
            }
        }
        
        console.log('📋 Collection initialization completed');
    } catch (error) {
        console.error('❌ Error initializing collections:', error);
    }
};

// Async initialization function for Vercel optimization
const initializeServer = async () => {
    try {
        // Validate environment
        if (!SetupService.validateEnvironment()) {
            throw new Error('Environment validation failed');
        }

        // Connect to MongoDB using optimized connection utility
        await connectToDatabase();
        
        // Initialize collections and system in parallel
        await Promise.all([
            initializeCollections(),
            SetupService.initializeSystem()
        ]);
        
        console.log('✅ Server initialization completed');
        return true;
    } catch (error) {
        logger.error('❌ Server initialization error:', error);
        console.error('❌ Server initialization error:', error);
        throw error;
    }
};

// Async service initialization for better performance
const initializeServices = async () => {
    try {
        // Initialize Socket.io for real-time communication
        const io = initSocket(server);
        app.set('io', io);
        
        // Initialize services asynchronously
        const servicePromises = [];
        
        // Live monitoring service
        servicePromises.push(
            (async () => {
                try {
                    const LiveMonitoringService = require('./services/liveMonitoringService');
                    const liveMonitoring = new LiveMonitoringService(io);
                    app.set('liveMonitoring', liveMonitoring);
                    console.log('✅ Live monitoring service initialized');
                } catch (error) {
                    console.warn('⚠️ Live monitoring service could not be initialized:', error.message);
                }
            })()
        );
        
        // Trip tracking socket
        servicePromises.push(
            (async () => {
                try {
                    const tripTracker = require('./socket/trackingSocket')(io);
                    app.set('tripTracker', tripTracker);
                    console.log('✅ Trip tracking socket initialized');
                } catch (error) {
                    console.warn('⚠️ Trip tracking socket could not be initialized:', error.message);
                }
            })()
        );
        
        // Notification controller setup
        servicePromises.push(
            (async () => {
                try {
                    const notificationController = require('./controllers/notificationController');
                    notificationController.setSocketInstance(io);
                    console.log('✅ Notification controller initialized');
                } catch (error) {
                    console.warn('⚠️ Notification controller could not be initialized:', error.message);
                }
            })()
        );
        
        await Promise.allSettled(servicePromises);
        
        // Schedule analytics generation (only in production)
        if (process.env.NODE_ENV === 'production') {
            setInterval(async () => {
                try {
                    const AnalyticsService = require('./services/analyticsService');
                    await AnalyticsService.generateDailyAnalytics();
                    console.log('✅ Daily analytics generated automatically');
                } catch (error) {
                    console.error('❌ Error generating daily analytics:', error.message);
                }
            }, 24 * 60 * 60 * 1000);
        }
        
        return io;
    } catch (error) {
        console.error('❌ Service initialization error:', error);
        throw error;
    }
};

// Root route
app.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'Car Rental API is running',
        version: '1.0.0',
        endpoints: {
            health: '/health',
            api: '/api',
            status: '/api/status',
            routes: '/api/routes'
        }
    });
});

// Route testing endpoint
app.get('/api/routes', (req, res) => {
    const routes = {
        public: [
            'GET /',
            'GET /health',
            'GET /api/status',
            'POST /api/admin/contact',
            'POST /api/admin/login'
        ],
        authenticated: {
            users: [
                'GET /api/users/profile',
                'PUT /api/users/settings',
                'GET /api/rides/user'
            ],
            drivers: [
                'GET /api/drivers/profile',
                'POST /api/drivers/update-location',
                'GET /api/driver/earnings'
            ],
            admin: [
                'GET /api/admin/system-stats',
                'GET /api/admin/drivers',
                'GET /api/admin/users',
                'GET /api/admin/analytics'
            ]
        },
        status: 'All routes loaded successfully',
        timestamp: new Date().toISOString()
    };
    res.json(routes);
});

// Use global error handler
app.use(errorHandler);

// Handle 404 routes
app.use('*', (req, res) => {
    console.warn(`[404] Route not found: ${req.method} ${req.originalUrl}`);
    res.status(404).json({
        success: false,
        error: 'Route not found',
        message: `The requested endpoint '${req.originalUrl}' does not exist`,
        statusCode: 404,
        timestamp: new Date().toISOString()
    });
});

// API status endpoint
app.get('/api/status', asyncHandler(async (req, res) => {
    const status = {
        api: 'Car Rental API',
        status: 'operational',
        timestamp: new Date().toISOString(),
        database: isConnected() ? 'connected' : 'disconnected',
        services: {
            authentication: 'operational',
            rides: 'operational',
            payments: 'operational',
            notifications: 'operational'
        }
    };
    
    res.json(status);
}));

// Performance metrics endpoint (admin only)
app.get('/api/admin/metrics', auth, role(['admin']), asyncHandler(async (req, res) => {
    const metrics = collectMetrics();
    res.json({
        success: true,
        metrics
    });
}));

// Graceful shutdown handler
const gracefulShutdown = async (signal) => {
    console.log(`\n${signal} received. Starting graceful shutdown...`);
    
    try {
        // Close server
        await new Promise((resolve) => {
            server.close(resolve);
        });
        
        // Close database connection using utility
        const { closeConnection } = require('./utils/dbConnection');
        await closeConnection();
        
        console.log('✅ Graceful shutdown completed');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error during shutdown:', error);
        process.exit(1);
    }
};

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Main server startup function
const startServer = async () => {
    try {
        // Initialize server components
        await initializeServer();
        await initializeServices();
        
        // Start server
        const PORT = process.env.PORT || 5000;
        
        return new Promise((resolve, reject) => {
            server.listen(PORT, () => {
                logger.info(`🚗 Car Rental API started on port ${PORT}`);
                console.log(`🚗 Car Rental API running on port ${PORT}`);
                resolve(server);
            }).on('error', (err) => {
                logger.error('[Server] Failed to start:', err);
                reject(err);
            });
        });
    } catch (error) {
        console.error('❌ Server startup failed:', error);
        process.exit(1);
    }
};

// Start server only if not in Vercel environment
if (process.env.VERCEL !== '1') {
    startServer().catch(console.error);
} else {
    // For Vercel, initialize asynchronously with better error handling
    (async () => {
        try {
            console.log('🚀 Initializing for Vercel deployment...');
            await initializeServer();
            console.log('✅ Server initialized for Vercel');
            await initializeServices();
            console.log('✅ All services initialized for Vercel');
            console.log('🎉 Vercel deployment ready!');
        } catch (error) {
            console.error('❌ Vercel initialization failed:', error);
            // Don't exit in Vercel environment, let it handle the error
        }
    })();
}

// Export for Vercel
module.exports = app;