const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, unique: true, required: true },
    phone: { type: String },
    password: { type: String, required: true },
    role: { type: String, default: 'user' },
    profile_image: { type: String },
    location: {
        latitude: Number,
        longitude: Number,
        address: String
    },
    rating: { type: Number, default: 0 },
    twoFactorEnabled: { type: Boolean, default: false },
    twoFactorSecret: { type: String },
    twoFactorBackupCodes: [{ type: String }],
    settings: {
        shareLocation: { type: Boolean, default: true },
        marketingEmails: { type: Boolean, default: false },
        showProfile: { type: Boolean, default: true },
        rideUpdates: { type: Boolean, default: true },
        promotionalOffers: { type: Boolean, default: false },
        emailNotifications: { type: Boolean, default: true },
        smsNotifications: { type: Boolean, default: false },
        pushNotifications: { type: Boolean, default: true },
        theme: { type: String, enum: ['light', 'dark', 'auto'], default: 'auto' },
        language: { type: String, default: 'en' },
        currency: { type: String, default: 'USD' },
        timezone: { type: String, default: 'UTC' }
    },
    
    // Account Status
    accountStatus: {
        isActive: { type: Boolean, default: true },
        isVerified: { type: Boolean, default: false },
        isBlocked: { type: Boolean, default: false },
        deactivatedAt: { type: Date },
        deactivationReason: { type: String },
        lastLoginAt: { type: Date },
        loginAttempts: { type: Number, default: 0 },
        lockedUntil: { type: Date }
    },
    
    // Profile Completion
    profileCompletion: {
        percentage: { type: Number, default: 0 },
        missingFields: [{ type: String }],
        lastUpdated: { type: Date, default: Date.now }
    },
    
    // Security & Device Management
    devices: [{
        deviceId: { type: String },
        deviceName: { type: String },
        deviceType: { type: String },
        browser: { type: String },
        os: { type: String },
        ip: { type: String },
        location: { type: String },
        lastUsed: { type: Date, default: Date.now },
        isActive: { type: Boolean, default: true },
        isTrusted: { type: Boolean, default: false }
    }],
    
    // Login History
    loginHistory: [{
        timestamp: { type: Date, default: Date.now },
        ip: { type: String },
        userAgent: { type: String },
        location: { type: String },
        success: { type: Boolean },
        failureReason: { type: String },
        deviceInfo: {
            browser: { type: String },
            os: { type: String },
            device: { type: String }
        }
    }],
    
    // User Activity Analytics
    analytics: {
        totalRides: { type: Number, default: 0 },
        totalSpent: { type: Number, default: 0 },
        averageRating: { type: Number, default: 0 },
        favoriteLocations: [{
            name: { type: String },
            coordinates: {
                latitude: { type: Number },
                longitude: { type: Number }
            },
            frequency: { type: Number, default: 1 }
        }],
        activityScore: { type: Number, default: 0 },
        lastActivityAt: { type: Date, default: Date.now }
    },
    
    // Verification & Badges
    verification: {
        email: { type: Boolean, default: false },
        phone: { type: Boolean, default: false },
        identity: { type: Boolean, default: false },
        address: { type: Boolean, default: false }
    },
    
    badges: [{
        type: { type: String },
        name: { type: String },
        description: { type: String },
        earnedAt: { type: Date, default: Date.now },
        icon: { type: String }
    }],
    
    // Preferences
    preferences: {
        defaultPaymentMethod: { type: String },
        autoBooking: { type: Boolean, default: false },
        shareRideData: { type: Boolean, default: false },
        emergencyContacts: [{
            name: { type: String },
            phone: { type: String },
            relationship: { type: String }
        }],
        accessibility: {
            wheelchairAccess: { type: Boolean, default: false },
            visualImpairment: { type: Boolean, default: false },
            hearingImpairment: { type: Boolean, default: false }
        }
    },
    driverApplication: {
        status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
        appliedAt: { type: Date },
        reviewedAt: { type: Date },
        reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
        rejectionReason: { type: String },
        
        // Personal Information
        fullName: { type: String },
        phone: { type: String },
        email: { type: String },
        dateOfBirth: { type: Date },
        address: { type: String },
        city: { type: String },
        state: { type: String },
        pincode: { type: String },
        
        // License Information
        licenseNumber: { type: String },
        licenseExpiry: { type: Date },
        licenseState: { type: String },
        drivingExperience: { type: String },
        previousExperience: { type: Boolean },
        
        // Vehicle Information
        vehicleType: { type: String },
        vehicleMake: { type: String },
        vehicleModel: { type: String },
        vehicleYear: { type: Number },
        vehicleColor: { type: String },
        registrationNumber: { type: String },
        
        // Documents
        documents: {
            licensePhoto: { type: String },
            vehicleRC: { type: String },
            insurance: { type: String },
            profilePhoto: { type: String }
        },
        
        // Verification
        backgroundCheck: { type: Boolean },
        termsAccepted: { type: Boolean }
    }
}, { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Virtual for profile completion percentage
userSchema.virtual('completionPercentage').get(function() {
    const requiredFields = ['name', 'email', 'phone', 'profile_image'];
    const completedFields = requiredFields.filter(field => this[field]);
    return Math.round((completedFields.length / requiredFields.length) * 100);
});

// Index for better query performance
// Note: email index is created automatically by unique: true
userSchema.index({ 'accountStatus.isActive': 1 });
userSchema.index({ 'accountStatus.lastLoginAt': -1 });
userSchema.index({ createdAt: -1 });

// Pre-save middleware to update profile completion and check email uniqueness
userSchema.pre('save', async function(next) {
    if (this.isModified('email')) {
        const Driver = mongoose.model('Driver');
        const driverExists = await Driver.findOne({ 
            email: this.email, 
            ...(this._id ? { _id: { $ne: this._id } } : {})
        });
        
        if (driverExists) {
            const error = new Error('Email already exists in the system');
            error.code = 11000;
            return next(error);
        }
    }
    
    if (this.isModified()) {
        this.profileCompletion.percentage = this.completionPercentage;
        this.profileCompletion.lastUpdated = new Date();
        
        // Update missing fields
        const requiredFields = ['name', 'email', 'phone', 'profile_image'];
        this.profileCompletion.missingFields = requiredFields.filter(field => !this[field]);
    }
    next();
});

module.exports = mongoose.model('User', userSchema);