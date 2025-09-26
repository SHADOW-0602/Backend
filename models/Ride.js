const mongoose = require('mongoose');

const rideSchema = new mongoose.Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    driver_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Driver' },
    preferred_driver_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    pickup_location: {
        latitude: { type: Number, required: true },
        longitude: { type: Number, required: true },
        address: { type: String, required: true }
    },
    drop_location: {
        latitude: { type: Number, required: true },
        longitude: { type: Number, required: true },
        address: { type: String, required: true }
    },
    fare: { type: Number, required: true },
    distance: { type: Number, required: true },
    vehicle_type: {
        type: String,
        enum: ['bike', 'sedan', 'suv'],
        required: true
    },
    payment_method: {
        type: String,
        enum: ['cash', 'razorpay', 'stripe', 'paypal'],
        default: 'cash'
    },
    status: { 
        type: String, 
        enum: ['requested', 'searching', 'accepted', 'driver_arrived', 'driver_arriving', 'in_progress', 'completed', 'cancelled', 'emergency_stopped'], 
        default: 'searching' 
    },
    payment_status: {
        type: String,
        enum: ['pending', 'paid', 'failed', 'refunded'],
        default: 'pending'
    },
    tracking: {
        isActive: { type: Boolean, default: false },
        currentLocation: {
            latitude: Number,
            longitude: Number,
            address: String,
            timestamp: { type: Date, default: Date.now }
        },
        eta: Number, // minutes
        progress: { type: Number, default: 0 }, // 0-100%
        lastUpdate: { type: Date, default: Date.now }
    },
    payment_details: {
        payment_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment' },
        gateway_used: String,
        transaction_id: String
    },
    otp: {
        code: { type: String },
        generated_at: { type: Date, default: Date.now },
        expires_at: { type: Date },
        verified: { type: Boolean, default: false }
    },
    driver_info: {
        name: String,
        phone: String,
        vehicle_number: String,
        vehicle_model: String,
        rating: { type: Number, default: 4.5 },
        distance_from_user: Number, // in km
        eta: Number, // in minutes
        photo: String
    },
    ride_phases: {
        searching_started: Date,
        driver_found: Date,
        driver_accepted: Date,
        driver_arriving: Date,
        trip_started: Date,
        trip_completed: Date
    },
    search_timeout: { type: Date },
    driver_search_radius: { type: Number, default: 10 }, // km
    surge_multiplier: { type: Number, default: 1.0 },
    demandMultiplier: { type: Number, default: 1.0 },
    promoApplied: {
        code: String,
        discount: Number,
        originalFare: Number,
        finalFare: Number
    },
    actualFare: Number,
    actualDistance: Number,
    actualTime: Number, // in minutes
    potentialDrivers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Driver' }],
    broadcastAt: Date,
    emergencyReason: String,
    emergencyStoppedAt: Date,
    declined_by: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // Track which drivers declined
    rating: { type: Number, min: 1, max: 5 }, // Driver rating by user
    feedback: { type: String }, // Driver feedback by user
    user_rating: { type: Number, min: 1, max: 5 }, // User rating by driver
    user_feedback: { type: String }, // User feedback by driver
    timestamps: {
        createdAt: { type: Date, default: Date.now },
        accepted_at: Date,
        started_at: Date,
        completed_at: Date,
        cancelled_at: Date
    }
}, { timestamps: true });

// Add indexes for efficient queries
rideSchema.index({ status: 1, createdAt: -1 });
rideSchema.index({ driver_id: 1, status: 1 });
rideSchema.index({ preferred_driver_id: 1, status: 1 });
rideSchema.index({ user_id: 1, createdAt: -1 });
rideSchema.index({ 'pickup_location.latitude': 1, 'pickup_location.longitude': 1 });
rideSchema.index({ 'tracking.isActive': 1 });

// Virtual for ride duration
rideSchema.virtual('duration').get(function() {
    if (this.timestamps.started_at && this.timestamps.completed_at) {
        return Math.ceil((this.timestamps.completed_at - this.timestamps.started_at) / (1000 * 60));
    }
    return null;
});

// Method to update tracking info
rideSchema.methods.updateTracking = function(location, eta, progress) {
    this.tracking.currentLocation = {
        latitude: location.latitude,
        longitude: location.longitude,
        address: location.address || 'En route',
        timestamp: new Date()
    };
    this.tracking.eta = eta;
    this.tracking.progress = progress;
    this.tracking.lastUpdate = new Date();
    this.tracking.isActive = true;
    return this.save();
};

// Method to complete ride
rideSchema.methods.completeRide = function() {
    this.status = 'completed';
    this.timestamps.completed_at = new Date();
    this.ride_phases.trip_completed = new Date();
    this.tracking.isActive = false;
    this.tracking.progress = 100;
    return this.save();
};

module.exports = mongoose.model('Ride', rideSchema);