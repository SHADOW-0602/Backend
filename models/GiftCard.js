const mongoose = require('mongoose');

const giftCardSchema = new mongoose.Schema({
    code: { type: String, unique: true, required: true },
    amount: { type: Number, required: true },
    balance: { type: Number, required: true },
    purchaser_id: { type: mongoose.Schema.Types.Mixed, required: true },
    recipient_email: { type: String },
    recipient_name: { type: String },
    status: { type: String, enum: ['active', 'used', 'expired'], default: 'active' },
    payment_id: { type: String, required: true },
    payment_gateway: { type: String, enum: ['razorpay', 'stripe', 'paypal'], required: true },
    expires_at: { type: Date, required: true },
    used_by: [{ 
        user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        amount: Number,
        used_at: Date
    }]
}, { timestamps: true });

giftCardSchema.methods.generateCode = function() {
    this.code = 'GC' + Math.random().toString(36).substr(2, 8).toUpperCase();
};

module.exports = mongoose.model('GiftCard', giftCardSchema);