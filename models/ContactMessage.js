const mongoose = require('mongoose');

const contactMessageSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true },
    subject: { type: String, required: true },
    message: { type: String, required: true },
    status: { type: String, enum: ['new', 'read', 'replied'], default: 'new' },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'Driver' },
    userType: { type: String, enum: ['user', 'driver'], default: 'user' },
    reply: {
        text: String,
        repliedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
        repliedAt: Date
    },
    emailDelivered: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('ContactMessage', contactMessageSchema);