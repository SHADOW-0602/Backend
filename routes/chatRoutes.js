const express = require('express');
const router = express.Router();
const Chat = require('../models/Chat');
const auth = require('../middleware/auth');
const role = require('../middleware/role');

// Send a chat message
router.post('/send', auth, async (req, res) => {
  try {
    const { text } = req.body;
    
    if (!text || text.trim() === '') {
      return res.status(400).json({ success: false, error: 'Message text is required' });
    }
    
    const chat = new Chat({
      userId: req.user.id,
      text: text.trim(),
      isFromUser: true
    });
    
    await chat.save();
    
    res.json({ success: true, message: 'Message sent successfully', chat });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get chat history for a user
router.get('/history', auth, async (req, res) => {
  try {
    const chats = await Chat.find({ userId: req.user.id })
      .sort({ timestamp: 1 })
      .limit(100);
    
    res.json({ success: true, chats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Admin: Reply to a chat
router.post('/reply/:userId', auth, role(['admin']), async (req, res) => {
  try {
    const { userId } = req.params;
    const { text } = req.body;
    
    if (!text || text.trim() === '') {
      return res.status(400).json({ success: false, error: 'Reply text is required' });
    }
    
    const chat = new Chat({
      userId,
      text: text.trim(),
      isFromUser: false,
      adminId: req.user.id
    });
    
    await chat.save();
    
    res.json({ success: true, message: 'Reply sent successfully', chat });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Admin: Get chat history for a specific user
router.get('/user/:userId', auth, role(['admin']), async (req, res) => {
  try {
    const { userId } = req.params;
    
    const chats = await Chat.find({ userId })
      .populate('adminId', 'name')
      .sort({ timestamp: 1 });
    
    res.json({ success: true, chats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;