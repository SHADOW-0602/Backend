const socketIO = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('./models/User');
const Driver = require('./models/Driver');
const TripTrackingService = require('./services/trip-execution/tripTrackingService');

function initSocket(server) {
    const io = socketIO(server, {
        cors: {
            origin: ["http://localhost:3000", "http://localhost:3001"],
            methods: ["GET", "POST"],
            credentials: true
        },
        transports: ['websocket', 'polling']
    });

    // Initialize tracking service
    const trackingService = new TripTrackingService(io);

    // Socket authentication middleware
    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
            
            if (!token) {
                console.log('Socket connection without token - allowing for public access');
                socket.user = null;
                return next();
            }

            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            
            let user;
            if (decoded.role === 'driver') {
                user = await Driver.findById(decoded.id).select('-password');
            } else if (decoded.role === 'admin') {
                const Admin = require('./models/Admin');
                user = await Admin.findById(decoded.id).select('-password');
            } else {
                user = await User.findById(decoded.id).select('-password');
            }

            if (!user) {
                console.log('Socket auth: User not found for ID:', decoded.id, 'Role:', decoded.role);
                // Clear the invalid session and allow anonymous connection
                socket.user = null;
                return next();
            }

            socket.user = { ...user.toObject(), role: decoded.role };
            next();
        } catch (error) {
            console.log('Socket auth error:', error.message);
            socket.user = null;
            next();
        }
    });

    io.on('connection', socket => {
        console.log(`🔌 User connected: ${socket.id} (${socket.user?.name || 'Anonymous'})`);
        
        // Send connection confirmation
        socket.emit('connection-confirmed', { 
            socketId: socket.id, 
            user: socket.user ? { name: socket.user.name, role: socket.user.role } : null,
            timestamp: new Date() 
        });



        // Live driver location updates
        socket.on('updateLocation', async data => {
            // Update tracking service if this is for an active ride
            if (data.rideId) {
                const trackingData = trackingService.activeTracking.get(data.rideId);
                if (trackingData) {
                    await trackingService.updateDriverLocation(data.rideId, trackingData);
                }
            }
            
            // Broadcast to admin and other listeners
            io.emit('driverLocationUpdate', data);
        });
        
        // Join ride room for real-time tracking
        socket.on('joinRideRoom', (rideId) => {
            socket.join(`ride_${rideId}`);
            console.log(`Socket ${socket.id} joined ride room: ${rideId}`);
            
            // Send current tracking status if available
            const trackingData = trackingService.activeTracking.get(rideId);
            if (trackingData) {
                socket.emit('trackingStatus', {
                    rideId,
                    phase: trackingData.phase,
                    lastUpdate: trackingData.lastUpdate
                });
            }
        });
        
        // Leave ride room
        socket.on('leaveRideRoom', (rideId) => {
            socket.leave(`ride_${rideId}`);
            console.log(`Socket ${socket.id} left ride room: ${rideId}`);
        });
        
        // Start trip tracking (when driver picks up passenger)
        socket.on('startTrip', async (data) => {
            const { rideId } = data;
            await trackingService.startTripTracking(rideId);
            
            io.to(`ride_${rideId}`).emit('tripStarted', {
                rideId,
                message: 'Trip started - tracking your journey',
                timestamp: new Date()
            });
        });
        
        // Complete trip
        socket.on('completeTrip', async (rideId) => {
            await trackingService.completeTrip(rideId);
        });
        
        // Emergency stop tracking
        socket.on('emergencyStop', async (data) => {
            const { rideId, reason } = data;
            await trackingService.emergencyStop(rideId, reason || 'Emergency stop requested');
        });
        
        // Join admin room for admin-specific updates
        socket.on('joinAdminRoom', () => {
            socket.join('admin-room');
            console.log('Admin joined admin room for live monitoring');
            
            // Send initial live data to newly connected admin
            socket.emit('adminConnected', {
                message: 'Connected to live monitoring',
                timestamp: new Date()
            });
        });
        
        // Admin-specific driver location updates
        socket.on('adminLocationUpdate', data => {
            io.to('admin-room').emit('driverLocationUpdate', data);
        });
        
        // Live trip updates for admin monitoring
        socket.on('tripUpdate', data => {
            io.to('admin-room').emit('tripUpdate', data);
        });
        
        // System alerts for admin
        socket.on('systemAlert', data => {
            io.to('admin-room').emit('systemAlert', data);
        });
        
        // Real-time metrics updates
        socket.on('metricsUpdate', data => {
            io.to('admin-room').emit('liveUpdate', data);
        });

        // New ride request from user
        socket.on('rideRequest', data => {
            io.emit('newRideRequest', data);
        });

        // Analytics updates for admin dashboard
        socket.on('analyticsUpdate', data => {
            io.emit('analyticsUpdate', data);
        });

        // General custom notifications
        socket.on('sendNotification', data => {
            io.emit('notification', data);
        });

        // Disconnect
        socket.on('disconnect', () => {
            console.log(`❌ User disconnected: ${encodeURIComponent(socket.id)}`);
        });
    });

    // Store tracking service in io for access from other modules
    io.trackingService = trackingService;
    
    return io;
}



module.exports = { initSocket };