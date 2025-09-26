const mongoose = require('mongoose');

const ratingSchema = new mongoose.Schema({
    ride_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Ride', required: true },
    rater_id: { type: mongoose.Schema.Types.ObjectId, required: true },
    rated_id: { type: mongoose.Schema.Types.ObjectId, required: true },
    rater_type: { type: String, enum: ['user', 'driver'], required: true },
    rated_type: { type: String, enum: ['user', 'driver'], required: true },
    
    rating: { type: Number, min: 1, max: 5, required: true },
    comment: { type: String, maxlength: 500 },
    
    categories: {
        punctuality: { type: Number, min: 1, max: 5 },
        behavior: { type: Number, min: 1, max: 5 },
        cleanliness: { type: Number, min: 1, max: 5 },
        communication: { type: Number, min: 1, max: 5 }
    }
}, { timestamps: true });

// Ensure one rating per person per ride
ratingSchema.index({ ride_id: 1, rater_id: 1 }, { unique: true });

module.exports = mongoose.model('Rating', ratingSchema);