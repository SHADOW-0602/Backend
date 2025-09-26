const TripTrackingService = require('../services/trip-execution/tripTrackingService');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Driver = require('../models/Driver');

module.exports = (io) => {
    const trackingService = new TripTrackingService(io);

    // Socket authentication middleware
    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
            
            if (!token) {
                return next(new Error('Authentication token required'));
            }
            
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            
            // Get user from database
            let user = await User.findById(decoded.id).select('-password');
            if (!user) {
                user = await Driver.findById(decoded.id).select('-password');
            }
            
            if (!user) {
                return next(new Error('User not found'));
            }
            
            socket.user = user;
            next();
        } catch (error) {
            next(new Error('Invalid authentication token'));
        }
    });

    io.on('connection', (socket) => {
        console.log(`User connected for tracking: ${encodeURIComponent(socket.id)} (${encodeURIComponent(socket.user.name)})`);

        // Join ride room for real-time updates
        socket.on('joinRide', async (rideId) => {
            try {
                if (!rideId) {
                    return socket.emit('error', { message: 'Ride ID is required' });
                }
                
                // Verify user has access to this ride
                const Ride = require('../models/Ride');
                const ride = await Ride.findById(rideId);
                
                if (!ride) {
                    return socket.emit('error', { message: 'Ride not found' });
                }
                
                // Check if user is authorized for this ride
                const isAuthorized = ride.user_id.toString() === socket.user._id.toString() || 
                                   ride.driver_id?.toString() === socket.user._id.toString();
                
                if (!isAuthorized) {
                    return socket.emit('error', { message: 'Unauthorized access to ride' });
                }
                
                socket.join(`ride_${rideId}`);
                console.log(`Socket ${encodeURIComponent(socket.id)} (${encodeURIComponent(socket.user.name)}) joined ride ${encodeURIComponent(rideId)}`);
                
                // Send current tracking status if exists
                const trackingStatus = trackingService.getTrackingStatus(rideId);
                if (trackingStatus) {
                    socket.emit('trackingStatus', trackingStatus);
                }
            } catch (error) {
                console.error('Error joining ride:', error);
                socket.emit('error', { message: 'Failed to join ride' });
            }
        });

        // Leave ride room
        socket.on('leaveRide', (rideId) => {
            socket.leave(`ride_${rideId}`);
            console.log(`Socket ${socket.id} left ride ${rideId}`);
        });

        // Start trip tracking (driver initiates)
        socket.on('startTrip', async (data) => {
            try {
                const { rideId, driverLocation, destination } = data;
                
                if (!rideId || !driverLocation || !destination) {
                    return socket.emit('error', { message: 'Missing required trip data' });
                }
                
                // Verify driver is authorized for this ride
                const Ride = require('../models/Ride');
                const ride = await Ride.findById(rideId);
                
                if (!ride || ride.driver_id.toString() !== socket.user._id.toString()) {
                    return socket.emit('error', { message: 'Unauthorized to start this trip' });
                }
                
                const trackingData = trackingService.startDriverTracking(rideId, driverLocation, destination);
                
                io.to(`ride_${rideId}`).emit('trackingStarted', {
                    message: 'Tracking started',
                    trackingData,
                    timestamp: new Date()
                });
            } catch (error) {
                console.error('Error starting trip:', error);
                socket.emit('error', { message: 'Failed to start trip tracking' });
            }
        });

        // Manual location update from driver
        socket.on('updateLocation', async (data) => {
            try {
                const { rideId, location } = data;
                
                if (!rideId || !location) {
                    return socket.emit('locationUpdated', { success: false, error: 'Missing required data' });
                }
                
                // Verify driver authorization
                const Ride = require('../models/Ride');
                const ride = await Ride.findById(rideId);
                
                if (!ride || ride.driver_id.toString() !== socket.user._id.toString()) {
                    return socket.emit('locationUpdated', { success: false, error: 'Unauthorized' });
                }
                
                const update = trackingService.updateDriverLocation(rideId, location);
                
                if (update) {
                    socket.emit('locationUpdated', { success: true, update });
                } else {
                    socket.emit('locationUpdated', { success: false, error: 'Trip not found' });
                }
            } catch (error) {
                socket.emit('locationUpdated', { success: false, error: 'Update failed' });
            }
        });

        // Stop trip tracking
        socket.on('stopTrip', async (rideId) => {
            try {
                if (!rideId) {
                    return socket.emit('error', { message: 'Ride ID required' });
                }
                
                // Verify authorization
                const Ride = require('../models/Ride');
                const ride = await Ride.findById(rideId);
                
                if (!ride || ride.driver_id.toString() !== socket.user._id.toString()) {
                    return socket.emit('error', { message: 'Unauthorized' });
                }
                
                trackingService.stopTracking(rideId);
                io.to(`ride_${rideId}`).emit('trackingStopped', {
                    message: 'Tracking stopped',
                    timestamp: new Date()
                });
            } catch (error) {
                socket.emit('error', { message: 'Failed to stop tracking' });
            }
        });

        // Complete trip
        socket.on('completeTrip', async (rideId) => {
            try {
                if (!rideId) {
                    return socket.emit('error', { message: 'Ride ID required' });
                }
                
                // Verify authorization
                const Ride = require('../models/Ride');
                const ride = await Ride.findById(rideId);
                
                if (!ride || ride.driver_id.toString() !== socket.user._id.toString()) {
                    return socket.emit('error', { message: 'Unauthorized' });
                }
                
                trackingService.handleTripCompletion(rideId);
            } catch (error) {
                socket.emit('error', { message: 'Failed to complete trip' });
            }
        });

        // Get current trip status
        socket.on('getTripStatus', async (rideId) => {
            try {
                if (!rideId) {
                    return socket.emit('tripStatus', { error: 'Ride ID required' });
                }
                
                // Verify authorization
                const Ride = require('../models/Ride');
                const ride = await Ride.findById(rideId);
                
                if (!ride) {
                    return socket.emit('tripStatus', { error: 'Trip not found' });
                }
                
                const isAuthorized = ride.user_id.toString() === socket.user._id.toString() || 
                                   ride.driver_id?.toString() === socket.user._id.toString();
                
                if (!isAuthorized) {
                    return socket.emit('tripStatus', { error: 'Unauthorized' });
                }
                
                const status = trackingService.getTrackingStatus(rideId);
                socket.emit('trackingStatus', status || { error: 'Tracking not found' });
            } catch (error) {
                socket.emit('tripStatus', { error: 'Failed to get status' });
            }
        });

        socket.on('disconnect', () => {
            console.log(`User disconnected from tracking: ${encodeURIComponent(socket.id)}`);
        });
    });

    return trackingService;
};