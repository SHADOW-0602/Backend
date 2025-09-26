const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
    ride_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Ride', required: true },
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    invoice_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice' },
    
    amount: { type: Number, required: true },
    currency: { type: String, default: 'INR' },
    
    payment_method: {
        type: String,
        enum: ['razorpay', 'stripe', 'paypal', 'wallet', 'cash'],
        required: true
    },
    
    gateway_details: {
        payment_id: String,
        order_id: String,
        signature: String,
        gateway_response: mongoose.Schema.Types.Mixed
    },
    
    status: {
        type: String,
        enum: ['pending', 'processing', 'completed', 'failed', 'refunded', 'cancelled'],
        default: 'pending'
    },
    
    transaction_details: {
        initiated_at: { type: Date, default: Date.now },
        completed_at: Date,
        failed_at: Date,
        failure_reason: String,
        refund_amount: Number,
        refund_reason: String,
        refunded_at: Date
    },
    
    metadata: {
        ip_address: String,
        user_agent: String,
        device_info: mongoose.Schema.Types.Mixed
    }
}, { timestamps: true });

// Index for efficient queries
paymentSchema.index({ ride_id: 1, status: 1 });
paymentSchema.index({ user_id: 1, createdAt: -1 });

module.exports = mongoose.model('Payment', paymentSchema);