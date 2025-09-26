const VALID_RIDE_STATUSES = [
    'requested', 
    'searching', 
    'accepted', 
    'driver_arrived', 
    'driver_arriving', 
    'in_progress', 
    'completed', 
    'cancelled', 
    'emergency_stopped'
];

const VALID_PAYMENT_STATUSES = [
    'pending', 
    'paid', 
    'failed', 
    'refunded'
];

const validateRideStatus = (req, res, next) => {
    const { status, payment_status } = req.body;
    
    // Validate ride status if provided
    if (status && !VALID_RIDE_STATUSES.includes(status)) {
        return res.status(400).json({
            success: false,
            error: `Invalid ride status: ${status}. Valid statuses are: ${VALID_RIDE_STATUSES.join(', ')}`
        });
    }
    
    // Validate payment status if provided
    if (payment_status && !VALID_PAYMENT_STATUSES.includes(payment_status)) {
        return res.status(400).json({
            success: false,
            error: `Invalid payment status: ${payment_status}. Valid payment statuses are: ${VALID_PAYMENT_STATUSES.join(', ')}`
        });
    }
    
    next();
};

module.exports = {
    validateRideStatus,
    VALID_RIDE_STATUSES,
    VALID_PAYMENT_STATUSES
};