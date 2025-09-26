const Driver = require('../../models/Driver');
const Ride = require('../../models/Ride');
const { calculateDistance } = require('../../utils/haversine');

class DriverMatchingService {
    constructor() {
        this.matchingRadius = 10; // km
        this.maxDriversToConsider = 20;
        this.batchProcessingInterval = 2000; // 2 seconds
    }

    async findOptimalDriverMatch(rideRequest) {
        const { pickup_location, vehicle_type, user_id } = rideRequest;
        
        // Get available drivers in batches for efficiency
        const availableDrivers = await this.getAvailableDrivers(pickup_location, vehicle_type);
        
        if (availableDrivers.length === 0) {
            return { success: false, reason: 'No drivers available' };
        }

        // Batch evaluation for optimal matching
        const driverScores = await this.evaluateDriverBatch(
            availableDrivers, 
            pickup_location, 
            user_id
        );

        // Sort by matching score (highest first)
        const rankedDrivers = driverScores.sort((a, b) => b.matchScore - a.matchScore);
        
        return {
            success: true,
            recommendedDriver: rankedDrivers[0],
            alternativeDrivers: rankedDrivers.slice(1, 3),
            totalAvailable: availableDrivers.length
        };
    }

    async getAvailableDrivers(pickup_location, vehicle_type) {
        console.log(`🔍 Searching for drivers with vehicle type: ${vehicle_type}`);
        
        const drivers = await Driver.find({
            status: 'available',
            'driverInfo.isVerified': true,
            'driverInfo.vehicleType': vehicle_type,
            location: { $exists: true },
            // Exclude drivers who are already assigned or recently declined
            $and: [
                { 
                    $or: [
                        { currentRideId: { $exists: false } },
                        { currentRideId: null }
                    ]
                },
                {
                    $or: [
                        { lastDeclinedAt: { $exists: false } },
                        { lastDeclinedAt: { $lt: new Date(Date.now() - 5 * 60 * 1000) } }
                    ]
                }
            ]
        })
        .select('name phone rating location lastActive driverInfo acceptanceRate responseTime')
        .limit(this.maxDriversToConsider);
        
        console.log(`✅ Found ${drivers.length} drivers with vehicle type ${vehicle_type}`);
        drivers.forEach(driver => {
            console.log(`  - ${driver.name}: ${driver.driverInfo?.vehicleType}`);
        });

        // Filter by distance
        return drivers.filter(driver => {
            const distance = calculateDistance(
                pickup_location.latitude, pickup_location.longitude,
                driver.location.latitude, driver.location.longitude
            );
            return distance <= this.matchingRadius;
        });
    }

    async evaluateDriverBatch(drivers, pickup_location, user_id) {
        const evaluatedDrivers = [];
        
        for (const driver of drivers) {
            const score = await this.calculateMatchingScore(driver, pickup_location, user_id);
            evaluatedDrivers.push({
                ...driver.toObject(),
                matchScore: score.totalScore,
                scoreBreakdown: score.breakdown,
                estimatedArrival: score.eta
            });
        }
        
        return evaluatedDrivers;
    }

    async calculateMatchingScore(driver, pickup_location, user_id) {
        const distance = calculateDistance(
            pickup_location.latitude, pickup_location.longitude,
            driver.location.latitude, driver.location.longitude
        );

        let totalScore = 0;
        const breakdown = {};

        // Distance score (40% weight) - closer is better
        const distanceScore = Math.max(0, (this.matchingRadius - distance) / this.matchingRadius) * 40;
        breakdown.distance = Math.round(distanceScore);
        totalScore += distanceScore;

        // Driver rating score (25% weight)
        const ratingScore = ((driver.rating || 4.0) / 5.0) * 25;
        breakdown.rating = Math.round(ratingScore);
        totalScore += ratingScore;

        // Acceptance rate score (15% weight)
        const acceptanceScore = (driver.acceptanceRate || 0.8) * 15;
        breakdown.acceptance = Math.round(acceptanceScore);
        totalScore += acceptanceScore;

        // Response time score (10% weight) - faster response is better
        const avgResponseTime = driver.responseTime || 30; // seconds
        const responseScore = Math.max(0, (60 - avgResponseTime) / 60) * 10;
        breakdown.responseTime = Math.round(responseScore);
        totalScore += responseScore;

        // Activity score (10% weight) - recent activity is better
        const lastActiveMinutes = (new Date() - new Date(driver.lastActive)) / (1000 * 60);
        const activityScore = Math.max(0, (30 - lastActiveMinutes) / 30) * 10;
        breakdown.activity = Math.round(activityScore);
        totalScore += activityScore;

        // Calculate ETA
        const eta = Math.ceil((distance / 30) * 60); // Assuming 30 km/h average speed

        return {
            totalScore: Math.round(totalScore),
            breakdown,
            eta,
            distance: Math.round(distance * 100) / 100
        };
    }

    async broadcastRideRequest(rideId, vehicleType, pickup_location, drop_location, estimatedFare, io) {
        // Get top 5 drivers for this request
        const availableDrivers = await this.getAvailableDrivers(pickup_location, vehicleType);
        const topDrivers = availableDrivers.slice(0, 5);

        // Broadcast to selected drivers with personalized info
        for (const driver of topDrivers) {
            const distance = calculateDistance(
                pickup_location.latitude, pickup_location.longitude,
                driver.location.latitude, driver.location.longitude
            );
            
            const eta = Math.ceil((distance / 30) * 60);

            io.emit(`driver_notification_${driver._id}`, {
                type: 'ride_request',
                rideId,
                pickup: pickup_location.address,
                destination: drop_location.address,
                estimatedFare,
                vehicleType,
                distance: Math.round(distance * 100) / 100,
                eta,
                priority: topDrivers.indexOf(driver) + 1,
                expiresAt: new Date(Date.now() + 30 * 1000), // 30 seconds to respond
                timestamp: new Date()
            });
        }

        // Update ride with potential drivers
        await Ride.findByIdAndUpdate(rideId, {
            potentialDrivers: topDrivers.map(d => d._id),
            broadcastAt: new Date()
        });

        return {
            driversNotified: topDrivers.length,
            estimatedResponseTime: '30 seconds'
        };
    }

    async handleDriverResponse(rideId, driverId, response) {
        console.log(`🚗 Driver ${driverId} ${response}ed ride ${rideId}`);
        
        const ride = await Ride.findById(rideId);
        if (!ride || ride.status !== 'searching') {
            console.log(`⚠️ Ride ${rideId} no longer available (status: ${ride?.status})`);
            return { success: false, reason: 'Ride no longer available' };
        }

        if (response === 'accept') {
            // First driver to accept gets the ride
            const driver = await Driver.findById(driverId);
            if (!driver) {
                console.log(`⚠️ Driver ${driverId} not found`);
                return { success: false, reason: 'Driver not found' };
            }
            
            // Check if driver already has an active ride
            const activeRide = await Ride.findOne({
                driver_id: driverId,
                status: { $in: ['accepted', 'in_progress'] }
            });
            
            if (activeRide) {
                console.log(`⚠️ Driver ${driverId} already has active ride ${activeRide._id}`);
                return { success: false, reason: 'Driver already has an active ride' };
            }

            console.log(`✅ Assigning ride ${rideId} to driver ${driverId}`);
            
            // Assign ride to driver
            ride.driver_id = driverId;
            ride.status = 'accepted';
            ride.timestamps.accepted_at = new Date();
            await ride.save();

            // Update driver status to busy regardless of current status
            await Driver.findByIdAndUpdate(driverId, {
                status: 'busy',
                currentRideId: rideId
            });

            console.log(`✅ Ride ${rideId} successfully accepted by driver ${driverId}`);
            return { success: true, message: 'Ride accepted successfully' };
        } else {
            console.log(`❌ Driver ${driverId} declined ride ${rideId}`);
            
            // Add to declined list
            await Ride.findByIdAndUpdate(rideId, {
                $addToSet: { declined_by: driverId }
            });

            // Update driver's last declined time
            await Driver.findByIdAndUpdate(driverId, {
                lastDeclinedAt: new Date()
            });

            return { success: true, message: 'Ride declined' };
        }
    }

    async optimizeBatchMatching() {
        // DISABLED: Auto-assignment removed to ensure manual driver acceptance
        console.log('⚠️ Batch matching disabled - rides require manual driver acceptance');
        return {
            ridesProcessed: 0,
            assignmentsMade: 0,
            message: 'Auto-assignment disabled'
        };
    }

    calculateOptimalAssignments(rides, drivers) {
        // Simplified optimization algorithm
        // In production, this would use more sophisticated algorithms like Hungarian algorithm
        const assignments = [];
        const usedDrivers = new Set();

        for (const ride of rides) {
            let bestDriver = null;
            let bestScore = -1;

            for (const driver of drivers) {
                if (usedDrivers.has(driver._id.toString())) continue;
                if (driver.driverInfo.vehicleType !== ride.vehicle_type) continue;

                const distance = calculateDistance(
                    ride.pickup_location.latitude, ride.pickup_location.longitude,
                    driver.location.latitude, driver.location.longitude
                );

                if (distance > this.matchingRadius) continue;

                // Simple scoring based on distance and rating
                const score = (this.matchingRadius - distance) * 10 + (driver.rating || 4.0) * 5;

                if (score > bestScore) {
                    bestScore = score;
                    bestDriver = driver;
                }
            }

            if (bestDriver) {
                assignments.push({
                    rideId: ride._id,
                    driverId: bestDriver._id,
                    score: bestScore
                });
                usedDrivers.add(bestDriver._id.toString());
            }
        }

        return assignments;
    }

    async assignDriverToRide(rideId, driverId) {
        // DISABLED: Manual assignment only through driver acceptance
        console.log('⚠️ Auto-assignment disabled - use handleDriverResponse instead');
        return false;
    }
}

module.exports = DriverMatchingService;