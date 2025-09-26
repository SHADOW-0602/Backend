const Ride = require('../models/Ride');
const User = require('../models/User');
const Driver = require('../models/Driver');

// Debug endpoint to check ride status consistency
exports.debugRideStatus = async (req, res) => {
    try {
        const { rideId } = req.params;
        
        // Get ride from database
        const ride = await Ride.findById(rideId)
            .populate('user_id', 'name email')
            .populate('driver_id', 'name email');
            
        if (!ride) {
            return res.status(404).json({
                success: false,
                error: 'Ride not found'
            });
        }
        
        // Check authorization
        const isAuthorized = 
            req.user.role === 'admin' ||
            (req.user.role === 'user' && ride.user_id && ride.user_id._id.toString() === req.user.id) ||
            (req.user.role === 'driver' && ride.driver_id && ride.driver_id._id.toString() === req.user.id);
            
        if (!isAuthorized) {
            return res.status(403).json({
                success: false,
                error: 'Unauthorized access to this ride'
            });
        }
        
        // Get raw data from database
        const rawRide = await Ride.collection.findOne({ _id: ride._id });
        
        // Validate status fields
        const validRideStatuses = ['requested', 'searching', 'accepted', 'driver_arrived', 'driver_arriving', 'in_progress', 'completed', 'cancelled', 'emergency_stopped'];
        const validPaymentStatuses = ['pending', 'paid', 'failed', 'refunded'];
        const validVehicleTypes = ['bike', 'sedan', 'suv'];
        
        const statusValidation = {
            ride_status: {
                value: ride.status,
                isValid: validRideStatuses.includes(ride.status),
                validOptions: validRideStatuses
            },
            payment_status: {
                value: ride.payment_status,
                isValid: validPaymentStatuses.includes(ride.payment_status),
                validOptions: validPaymentStatuses
            },
            vehicle_type: {
                value: ride.vehicle_type,
                isValid: validVehicleTypes.includes(ride.vehicle_type),
                validOptions: validVehicleTypes
            }
        };
        
        res.json({
            success: true,
            debug: {
                rideId: ride._id,
                mongooseData: {
                    status: ride.status,
                    payment_status: ride.payment_status,
                    vehicle_type: ride.vehicle_type,
                    user: ride.user_id?.name,
                    driver: ride.driver_id?.name || 'None assigned',
                    createdAt: ride.createdAt,
                    updatedAt: ride.updatedAt
                },
                rawData: {
                    status: rawRide.status,
                    payment_status: rawRide.payment_status,
                    vehicle_type: rawRide.vehicle_type
                },
                validation: statusValidation,
                timestamps: ride.timestamps,
                isConsistent: ride.status === rawRide.status && ride.payment_status === rawRide.payment_status
            }
        });
        
    } catch (error) {
        console.error('Debug ride status error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// Get all rides with status summary for admin
exports.getRideStatusSummary = async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                error: 'Admin access required'
            });
        }
        
        // Get status distribution
        const statusDistribution = await Ride.aggregate([
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 },
                    latestRide: { $max: '$createdAt' }
                }
            },
            {
                $sort: { count: -1 }
            }
        ]);
        
        // Get payment status distribution
        const paymentStatusDistribution = await Ride.aggregate([
            {
                $group: {
                    _id: '$payment_status',
                    count: { $sum: 1 }
                }
            },
            {
                $sort: { count: -1 }
            }
        ]);
        
        // Get vehicle type distribution
        const vehicleTypeDistribution = await Ride.aggregate([
            {
                $group: {
                    _id: '$vehicle_type',
                    count: { $sum: 1 }
                }
            },
            {
                $sort: { count: -1 }
            }
        ]);
        
        // Check for any invalid statuses
        const validRideStatuses = ['requested', 'searching', 'accepted', 'driver_arrived', 'driver_arriving', 'in_progress', 'completed', 'cancelled', 'emergency_stopped'];
        const validPaymentStatuses = ['pending', 'paid', 'failed', 'refunded'];
        const validVehicleTypes = ['bike', 'sedan', 'suv'];
        
        const invalidRideStatuses = await Ride.find({
            status: { $nin: validRideStatuses }
        }).select('_id status user_id createdAt');
        
        const invalidPaymentStatuses = await Ride.find({
            payment_status: { $nin: validPaymentStatuses }
        }).select('_id payment_status user_id createdAt');
        
        const invalidVehicleTypes = await Ride.find({
            vehicle_type: { $nin: validVehicleTypes }
        }).select('_id vehicle_type user_id createdAt');
        
        res.json({
            success: true,
            summary: {
                totalRides: await Ride.countDocuments(),
                statusDistribution,
                paymentStatusDistribution,
                vehicleTypeDistribution,
                validation: {
                    invalidRideStatuses: invalidRideStatuses.length,
                    invalidPaymentStatuses: invalidPaymentStatuses.length,
                    invalidVehicleTypes: invalidVehicleTypes.length,
                    details: {
                        invalidRideStatuses,
                        invalidPaymentStatuses,
                        invalidVehicleTypes
                    }
                }
            }
        });
        
    } catch (error) {
        console.error('Get ride status summary error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// Fix invalid ride data (admin only)
exports.fixInvalidRideData = async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                error: 'Admin access required'
            });
        }
        
        const fixes = [];
        
        // Fix invalid vehicle types
        const vehicleTypeMapping = {
            'comfort': 'sedan',
            'economy': 'bike',
            'luxury': 'suv',
            'premium': 'suv'
        };
        
        const invalidVehicleTypes = await Ride.find({
            vehicle_type: { $nin: ['bike', 'sedan', 'suv'] }
        });
        
        for (const ride of invalidVehicleTypes) {
            const newVehicleType = vehicleTypeMapping[ride.vehicle_type] || 'sedan';
            await Ride.findByIdAndUpdate(ride._id, {
                vehicle_type: newVehicleType
            });
            fixes.push({
                rideId: ride._id,
                field: 'vehicle_type',
                oldValue: ride.vehicle_type,
                newValue: newVehicleType
            });
        }
        
        // Fix any rides with "pending" status (should be "searching")
        const pendingStatusRides = await Ride.find({ status: 'pending' });
        for (const ride of pendingStatusRides) {
            await Ride.findByIdAndUpdate(ride._id, {
                status: 'searching'
            });
            fixes.push({
                rideId: ride._id,
                field: 'status',
                oldValue: 'pending',
                newValue: 'searching'
            });
        }
        
        res.json({
            success: true,
            message: `Fixed ${fixes.length} invalid ride data entries`,
            fixes
        });
        
    } catch (error) {
        console.error('Fix invalid ride data error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};