const mongoose = require('mongoose');

const chatSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  text: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  isFromUser: {
    type: Boolean,
    default: true
  },
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Chat', chatSchema);