let io;
exports.setSocketInstance = (socketInstance) => {
    io = socketInstance;
};

exports.sendNotification = (req, res) => {
    try {
        const { message, to } = req.body;
        io.emit(to ? `notify_${to}` : 'notify_all', { message });
        res.json({ success: true, message: 'Notification sent' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};