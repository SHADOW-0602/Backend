const mongoose = require('mongoose');

const invoiceSchema = new mongoose.Schema({
    ride_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Ride', required: true },
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    driver_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Driver', required: true },
    invoice_number: { type: String, unique: true, required: true },
    
    fare_breakdown: {
        base_fare: { type: Number, required: true },
        distance_fare: { type: Number, required: true },
        time_fare: { type: Number, required: true },
        surge_multiplier: { type: Number, default: 1.0 },
        discount: { type: Number, default: 0 },
        tax: { type: Number, required: true },
        total_fare: { type: Number, required: true }
    },
    
    trip_details: {
        distance: { type: Number, required: true },
        duration: { type: Number, required: true }, // minutes
        pickup_address: String,
        drop_address: String,
        vehicle_type: String,
        started_at: Date,
        completed_at: Date
    },
    
    payment_status: {
        type: String,
        enum: ['pending', 'paid', 'failed', 'refunded'],
        default: 'pending'
    },
    
    feedback: {
        rating: { type: Number, min: 1, max: 5 },
        comment: String,
        submitted_at: Date
    }
}, { timestamps: true });

// Generate invoice number
invoiceSchema.pre('save', async function(next) {
    if (!this.invoice_number) {
        const count = await mongoose.model('Invoice').countDocuments();
        this.invoice_number = `INV-${Date.now()}-${String(count + 1).padStart(4, '0')}`;
    }
    next();
});

module.exports = mongoose.model('Invoice', invoiceSchema);