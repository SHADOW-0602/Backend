const Ride = require('../../models/Ride');
const Driver = require('../../models/Driver');
const { calculateDistance } = require('../../utils/haversine');

class TripTrackingService {
    constructor(io) {
        this.io = io;
        this.activeTracking = new Map(); // rideId -> tracking data
        this.trackingInterval = 5000; // 5 seconds
    }

    async startDriverTracking(rideId, driverLocation, pickupLocation) {
        const ride = await Ride.findById(rideId).populate('user_id driver_id');
        if (!ride) return;

        const trackingData = {
            rideId,
            driverId: ride.driver_id._id,
            userId: ride.user_id._id,
            phase: 'driver_arriving',
            destination: pickupLocation,
            lastUpdate: new Date(),
            intervalId: null
        };

        // Start real-time tracking
        const intervalId = setInterval(async () => {
            await this.updateDriverLocation(rideId, trackingData);
        }, this.trackingInterval);

        trackingData.intervalId = intervalId;
        this.activeTracking.set(rideId, trackingData);

        // Initial location update
        await this.updateDriverLocation(rideId, trackingData);
    }

    async updateDriverLocation(rideId, trackingData) {
        try {
            const driver = await Driver.findById(trackingData.driverId);
            if (!driver || !driver.location) return;

            const currentLocation = driver.location;
            const destination = trackingData.destination;

            // Calculate distance and ETA
            const distanceToDestination = calculateDistance(
                currentLocation.latitude, currentLocation.longitude,
                destination.latitude, destination.longitude
            );

            const eta = Math.ceil((distanceToDestination / 30) * 60); // 30 km/h average
            const progress = this.calculateProgress(trackingData.phase, distanceToDestination);

            // Update ride tracking in database
            await Ride.findByIdAndUpdate(rideId, {
                'tracking.currentLocation': {
                    latitude: currentLocation.latitude,
                    longitude: currentLocation.longitude,
                    address: currentLocation.address || 'En route',
                    timestamp: new Date()
                },
                'tracking.eta': eta,
                'tracking.progress': progress,
                'tracking.lastUpdate': new Date(),
                'tracking.isActive': true
            });

            // Emit real-time updates to user
            this.io.emit(`ride_tracking_${rideId}`, {
                type: 'location_update',
                driverLocation: {
                    latitude: currentLocation.latitude,
                    longitude: currentLocation.longitude,
                    address: currentLocation.address || 'En route'
                },
                eta,
                progress,
                phase: trackingData.phase,
                timestamp: new Date()
            });

            // Emit to user specifically
            this.io.emit(`user_notification_${trackingData.userId}`, {
                type: 'driver_location_update',
                rideId,
                eta: `${eta} min`,
                progress,
                phase: trackingData.phase,
                timestamp: new Date()
            });

            // Check if driver has arrived at pickup
            if (trackingData.phase === 'driver_arriving' && distanceToDestination < 0.1) {
                await this.handleDriverArrival(rideId, trackingData);
            }

        } catch (error) {
            console.error('Error updating driver location:', error);
        }
    }

    async handleDriverArrival(rideId, trackingData) {
        // Update ride status
        await Ride.findByIdAndUpdate(rideId, {
            status: 'driver_arrived',
            'ride_phases.driver_arriving': new Date()
        });

        // Notify user that driver has arrived
        this.io.emit(`user_notification_${trackingData.userId}`, {
            type: 'driver_arrived',
            rideId,
            message: 'Your driver has arrived at the pickup location',
            timestamp: new Date()
        });

        // Update tracking phase
        trackingData.phase = 'waiting_for_pickup';
    }

    async startTripTracking(rideId) {
        const ride = await Ride.findById(rideId).populate('user_id driver_id');
        if (!ride) return;

        // Update tracking destination to drop location
        const trackingData = this.activeTracking.get(rideId);
        if (trackingData) {
            trackingData.phase = 'in_progress';
            trackingData.destination = ride.drop_location;
            trackingData.tripStartTime = new Date();
        }

        // Update ride status
        await Ride.findByIdAndUpdate(rideId, {
            status: 'in_progress',
            'timestamps.started_at': new Date(),
            'ride_phases.trip_started': new Date()
        });

        // Notify user
        this.io.emit(`user_notification_${ride.user_id._id}`, {
            type: 'trip_started',
            rideId,
            message: 'Your trip has started. Enjoy your ride!',
            timestamp: new Date()
        });
    }

    async completeTrip(rideId) {
        const trackingData = this.activeTracking.get(rideId);
        if (!trackingData) return;

        // Stop tracking
        if (trackingData.intervalId) {
            clearInterval(trackingData.intervalId);
        }

        // Calculate trip metrics
        const ride = await Ride.findById(rideId);
        const actualDistance = this.calculateActualDistance(trackingData);
        const actualDuration = trackingData.tripStartTime ? 
            Math.ceil((new Date() - trackingData.tripStartTime) / (1000 * 60)) : 
            ride.estimatedTime;

        // Update ride with final data
        await Ride.findByIdAndUpdate(rideId, {
            status: 'completed',
            'timestamps.completed_at': new Date(),
            'ride_phases.trip_completed': new Date(),
            'tracking.isActive': false,
            'tracking.progress': 100,
            actualDistance,
            actualDuration
        });

        // Remove from active tracking
        this.activeTracking.delete(rideId);

        // Notify user
        this.io.emit(`user_notification_${ride.user_id}`, {
            type: 'trip_completed',
            rideId,
            message: 'Trip completed successfully!',
            actualDistance,
            actualDuration,
            timestamp: new Date()
        });
    }

    calculateProgress(phase, distanceToDestination) {
        switch (phase) {
            case 'driver_arriving':
                // Progress based on how close driver is to pickup
                return Math.max(0, Math.min(50, 50 - (distanceToDestination * 10)));
            case 'waiting_for_pickup':
                return 50;
            case 'in_progress':
                // Progress based on trip completion (simplified)
                return Math.min(100, 50 + (50 * Math.random())); // Simplified calculation
            default:
                return 0;
        }
    }

    calculateActualDistance(trackingData) {
        // Simplified - in real implementation, this would sum up all location updates
        return trackingData.totalDistance || 0;
    }

    async getGodViewData() {
        const activeRides = await Ride.find({
            status: { $in: ['accepted', 'driver_arrived', 'in_progress'] }
        }).populate('user_id driver_id', 'name phone');

        const liveData = [];

        for (const ride of activeRides) {
            const driver = await Driver.findById(ride.driver_id._id);
            if (driver && driver.location) {
                liveData.push({
                    rideId: ride._id,
                    status: ride.status,
                    user: {
                        name: ride.user_id.name,
                        phone: ride.user_id.phone
                    },
                    driver: {
                        name: ride.driver_id.name,
                        phone: ride.driver_id.phone,
                        location: driver.location,
                        vehicleType: driver.driverInfo?.vehicleType
                    },
                    pickup: ride.pickup_location,
                    destination: ride.drop_location,
                    tracking: ride.tracking,
                    estimatedFare: ride.estimatedFare,
                    startTime: ride.timestamps.started_at,
                    lastUpdate: new Date()
                });
            }
        }

        return {
            totalActiveRides: liveData.length,
            rides: liveData,
            timestamp: new Date()
        };
    }

    async emergencyStop(rideId, reason) {
        const trackingData = this.activeTracking.get(rideId);
        if (trackingData && trackingData.intervalId) {
            clearInterval(trackingData.intervalId);
        }

        await Ride.findByIdAndUpdate(rideId, {
            status: 'emergency_stopped',
            'tracking.isActive': false,
            emergencyReason: reason,
            emergencyStoppedAt: new Date()
        });

        this.activeTracking.delete(rideId);

        // Notify all relevant parties
        const ride = await Ride.findById(rideId).populate('user_id driver_id');
        
        this.io.emit(`emergency_${rideId}`, {
            type: 'emergency_stop',
            reason,
            timestamp: new Date()
        });

        // Notify admin
        this.io.emit('admin_emergency', {
            type: 'ride_emergency_stop',
            rideId,
            reason,
            user: ride.user_id.name,
            driver: ride.driver_id.name,
            timestamp: new Date()
        });
    }

    stopTracking(rideId) {
        const trackingData = this.activeTracking.get(rideId);
        if (trackingData && trackingData.intervalId) {
            clearInterval(trackingData.intervalId);
            this.activeTracking.delete(rideId);
        }
    }

    getActiveTrackingCount() {
        return this.activeTracking.size;
    }
}

module.exports = TripTrackingService;