const mongoose = require('mongoose');

const driverSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, unique: true, required: true },
    phone: { type: String, required: true },
    password: { type: String, required: true },
    role: { type: String, default: 'driver' },
    profile_image: { type: String },
    location: {
        latitude: Number,
        longitude: Number,
        address: String
    },
    rating: { type: Number, default: 0 },
    originalUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: ['available', 'busy', 'offline', 'suspended'], default: 'available' },
    lastActive: { type: Date, default: Date.now },
    suspension: {
        isSuspended: { type: Boolean, default: false },
        suspendedAt: { type: Date },
        suspendedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
        reason: { type: String },
        suspensionType: { type: String, enum: ['temporary', 'permanent'], default: 'temporary' },
        suspensionEndDate: { type: Date },
        emailSent: { type: Boolean, default: false }
    },
    earnings: {
        total: { type: Number, default: 0 },
        thisMonth: { type: Number, default: 0 }
    },
    completedRides: { type: Number, default: 0 },
    experience: { type: String }, // Direct experience field for easier access
    driverInfo: {
        licenseNumber: { type: String, required: true },
        licenseExpiry: { type: Date },
        vehicleType: { type: String, enum: ['bike', 'sedan', 'suv'], required: true },
        vehicleMake: { type: String },
        vehicleModel: { type: String },
        vehicleYear: { type: Number },
        vehicleColor: { type: String },
        registrationNumber: { type: String, required: true },
        drivingExperience: { type: String },
        isVerified: { type: Boolean, default: false },
        documents: {
            licensePhoto: { type: String },
            vehicleRC: { type: String },
            insurance: { type: String },
            profilePhoto: { type: String }
        }
    },
    verificationRequest: {
        status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
        submittedAt: { type: Date },
        reviewedAt: { type: Date },
        reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
        notes: { type: String }
    },
    settings: {
        shareLocation: { type: Boolean, default: true },
        marketingEmails: { type: Boolean, default: false },
        showProfile: { type: Boolean, default: true },
        rideUpdates: { type: Boolean, default: true },
        promotionalOffers: { type: Boolean, default: false },
        emailNotifications: { type: Boolean, default: true },
        // Driver-specific settings
        autoAcceptRides: { type: Boolean, default: false },
        rideNotifications: { type: Boolean, default: true },
        earningsReport: { type: Boolean, default: true },
        shareLocationWithPassengers: { type: Boolean, default: true }
    },
    lastLocationUpdate: { type: Date, default: Date.now }
}, { timestamps: true });

// Pre-save middleware to check email uniqueness
driverSchema.pre('save', async function(next) {
    if (this.isModified('email')) {
        const User = mongoose.model('User');
        const userExists = await User.findOne({ 
            email: this.email, 
            ...(this._id ? { _id: { $ne: this._id } } : {})
        });
        
        if (userExists) {
            const error = new Error('Email already exists in the system');
            error.code = 11000;
            return next(error);
        }
    }
    next();
});

module.exports = mongoose.model('Driver', driverSchema);