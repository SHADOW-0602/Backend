const Rating = require('../models/Rating');

const getDriverSummary = async (req, res) => {
    try {
        const driverId = req.user.id;
        
        const totalRatings = await Rating.countDocuments({
            rated_id: driverId,
            rated_type: 'driver'
        });
        
        res.json({
            success: true,
            totalRatings
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

module.exports = {
    getDriverSummary
};