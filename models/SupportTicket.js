const mongoose = require('mongoose');

const supportTicketSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    userEmail: {
        type: String,
        required: true
    },
    userName: {
        type: String,
        required: true
    },
    category: {
        type: String,
        required: true,
        enum: ['ride', 'account', 'payment']
    },
    issue: {
        type: String,
        required: true
    },
    sessionId: {
        type: String,
        required: true
    },
    messages: [{
        text: String,
        sender: String,
        senderType: {
            type: String,
            enum: ['user', 'bot', 'admin']
        },
        timestamp: Date
    }],
    status: {
        type: String,
        enum: ['escalated', 'in-progress', 'resolved', 'closed'],
        default: 'escalated'
    },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'urgent'],
        default: 'medium'
    },
    adminResponse: {
        type: String
    },
    assignedTo: {
        type: String
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('SupportTicket', supportTicketSchema);