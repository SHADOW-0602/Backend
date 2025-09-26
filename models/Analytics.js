const mongoose = require('mongoose');

const analyticsSchema = new mongoose.Schema({
    date: { type: Date, required: true, unique: true },
    totalRides: { type: Number, default: 0 },
    completedRides: { type: Number, default: 0 },
    cancelledRides: { type: Number, default: 0 },
    totalRevenue: { type: Number, default: 0 },
    totalUsers: { type: Number, default: 0 },
    totalDrivers: { type: Number, default: 0 },
    activeDrivers: { type: Number, default: 0 },
    averageRating: { type: Number, default: 0 },
    averageRideDistance: { type: Number, default: 0 },
    averageRideFare: { type: Number, default: 0 },
    peakHours: [{
        hour: { type: Number },
        rideCount: { type: Number }
    }],
    paymentMethods: {
        cash: { type: Number, default: 0 },
        card: { type: Number, default: 0 },
        upi: { type: Number, default: 0 }
    }
}, { timestamps: true });

module.exports = mongoose.model('Analytics', analyticsSchema);