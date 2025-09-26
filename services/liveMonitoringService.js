const Driver = require('../models/Driver');
const Ride = require('../models/Ride');

class LiveMonitoringService {
    constructor(io) {
        this.io = io;
        this.startLiveUpdates();
    }

    startLiveUpdates() {
        // Broadcast live updates every 10 seconds
        setInterval(async () => {
            try {
                const liveData = await this.getLiveData();
                this.io.to('admin-room').emit('liveUpdate', liveData);
            } catch (error) {
                console.error('Error broadcasting live updates:', error);
            }
        }, 10000);
    }

    async getLiveData() {
        try {
            const [activeTrips, onlineDrivers, systemMetrics] = await Promise.all([
                this.getActiveTrips(),
                this.getOnlineDrivers(),
                this.getSystemMetrics()
            ]);

            return {
                activeTrips,
                onlineDrivers,
                systemMetrics,
                alerts: this.generateAlerts(activeTrips, onlineDrivers),
                timestamp: new Date()
            };
        } catch (error) {
            console.error('Error getting live data:', error);
            return null;
        }
    }

    async getActiveTrips() {
        try {
            const trips = await Ride.find({
                status: { $in: ['accepted', 'in_progress'] }
            })
            .populate('user_id', 'name email phone')
            .populate('driver_id', 'name email phone')
            .sort({ createdAt: -1 });

            return trips;
        } catch (error) {
            console.error('Error fetching active trips:', error);
            return [];
        }
    }

    async getOnlineDrivers() {
        try {
            const drivers = await Driver.find({
                status: { $in: ['available', 'busy'] },
                'driverInfo.isVerified': true
            }).select('name email phone status rating location currentLocation');

            return drivers;
        } catch (error) {
            console.error('Error fetching online drivers:', error);
            return [];
        }
    }

    async getSystemMetrics() {
        try {
            const now = new Date();
            const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

            const [activeTrips, onlineDrivers, recentTrips] = await Promise.all([
                Ride.countDocuments({ status: { $in: ['accepted', 'in_progress'] } }),
                Driver.countDocuments({ status: 'available' }),
                Ride.countDocuments({ createdAt: { $gte: oneHourAgo } })
            ]);

            // Calculate ongoing revenue
            const ongoingRevenue = await Ride.aggregate([
                { $match: { status: { $in: ['accepted', 'in_progress'] } } },
                { $group: { _id: null, total: { $sum: '$fare' } } }
            ]);

            return {
                activeTrips,
                onlineDrivers,
                realtimeRevenue: ongoingRevenue[0]?.total || 0,
                systemLoad: Math.floor(Math.random() * 100), // Simulate system load
                tripsTrend: recentTrips > 5 ? 1 : -1,
                driversTrend: onlineDrivers > 3 ? 1 : -1
            };
        } catch (error) {
            console.error('Error getting system metrics:', error);
            return {};
        }
    }

    generateAlerts(trips, drivers) {
        const alerts = [];

        // Long duration trips
        trips.forEach(trip => {
            if (trip.timestamps?.started_at) {
                const duration = (new Date() - new Date(trip.timestamps.started_at)) / (1000 * 60);
                if (duration > 60) {
                    alerts.push({
                        type: 'warning',
                        message: `Trip ${trip._id.toString().slice(-6)} running for ${Math.floor(duration)} minutes`,
                        priority: 'high',
                        tripId: trip._id
                    });
                }
            }
        });

        // Low driver availability
        const availableDrivers = drivers.filter(d => d.status === 'available').length;
        if (availableDrivers < 3) {
            alerts.push({
                type: 'error',
                message: `Only ${availableDrivers} drivers available`,
                priority: 'urgent'
            });
        }

        // High system load simulation
        const systemLoad = Math.floor(Math.random() * 100);
        if (systemLoad > 85) {
            alerts.push({
                type: 'warning',
                message: `High system load: ${systemLoad}%`,
                priority: 'medium'
            });
        }

        return alerts;
    }

    // Broadcast trip status change
    broadcastTripUpdate(tripData) {
        this.io.to('admin-room').emit('tripUpdate', {
            type: 'trip_status_change',
            trip: tripData,
            timestamp: new Date()
        });
    }

    // Broadcast driver location update
    broadcastDriverLocation(driverData) {
        this.io.to('admin-room').emit('driverLocationUpdate', {
            driverId: driverData.driverId,
            location: driverData.location,
            timestamp: new Date()
        });
    }

    // Broadcast system alert
    broadcastAlert(alert) {
        this.io.to('admin-room').emit('systemAlert', {
            ...alert,
            timestamp: new Date()
        });
    }
}

module.exports = LiveMonitoringService;