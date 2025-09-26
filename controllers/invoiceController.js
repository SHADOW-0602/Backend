const InvoiceService = require('../services/invoiceService');
const FareEstimationService = require('../services/trip-planning/fareEstimationService');

const invoiceService = new InvoiceService();
const fareEstimationService = new FareEstimationService();

// Generate invoice for completed ride
exports.generateInvoice = async (req, res) => {
    try {
        const { rideId } = req.params;
        const invoice = await invoiceService.generateInvoice(rideId);
        
        res.json({
            success: true,
            message: 'Invoice generated successfully',
            invoice
        });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

// Get invoice details
exports.getInvoice = async (req, res) => {
    try {
        const { invoiceId } = req.params;
        const invoiceDetails = await invoiceService.getInvoiceDetails(invoiceId);
        
        res.json({
            success: true,
            invoice: invoiceDetails
        });
    } catch (err) {
        res.status(404).json({ success: false, error: err.message });
    }
};

// Get trip summary
exports.getTripSummary = async (req, res) => {
    try {
        const { rideId } = req.params;
        const summary = await invoiceService.getTripSummary(rideId);
        
        res.json({
            success: true,
            summary
        });
    } catch (err) {
        res.status(404).json({ success: false, error: err.message });
    }
};

// Submit feedback
exports.submitFeedback = async (req, res) => {
    try {
        const { invoiceId } = req.params;
        const { rating, comment } = req.body;
        
        if (!rating || rating < 1 || rating > 5) {
            return res.status(400).json({ 
                success: false, 
                error: 'Rating must be between 1 and 5' 
            });
        }
        
        const feedback = await invoiceService.submitFeedback(invoiceId, rating, comment);
        
        res.json({
            success: true,
            message: 'Feedback submitted successfully',
            feedback
        });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

// Estimate fare for trip planning
exports.estimateFare = async (req, res) => {
    try {
        const { pickup_location, drop_location, vehicle_type } = req.body;
        
        const vehicleTypes = vehicle_type ? [vehicle_type] : null;
        const estimate = await fareEstimationService.getUpfrontPricing(
            pickup_location, 
            drop_location, 
            vehicleTypes
        );
        
        res.json({
            success: true,
            estimate
        });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

// Apply discount to fare
exports.applyDiscount = async (req, res) => {
    try {
        const { fare_amount, discount_percent, promo_code } = req.body;
        
        // Load promo codes from environment or config
        const validPromoCodes = this.getValidPromoCodes();
        
        const discountPercent = promo_code && validPromoCodes[promo_code] 
            ? validPromoCodes[promo_code] 
            : discount_percent || 0;
        
        const discountAmount = Math.round((fare_amount * discountPercent) / 100);
        const discountedFare = {
            original_fare: fare_amount,
            discount_percent: discountPercent,
            discount_amount: discountAmount,
            final_fare: fare_amount - discountAmount
        };
        
        res.json({
            success: true,
            promo_applied: !!promo_code && validPromoCodes[promo_code],
            discount: discountedFare
        });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

// Get user's invoices
exports.getUserInvoices = async (req, res) => {
    try {
        const Invoice = require('../models/Invoice');
        
        const invoices = await Invoice.find({ user_id: req.user.id })
            .populate('driver_id', 'name rating')
            .sort({ createdAt: -1 })
            .limit(20);
        
        res.json({
            success: true,
            invoices: invoices.map(inv => ({
                invoice_id: inv._id,
                invoice_number: inv.invoice_number,
                date: inv.createdAt,
                total_fare: inv.fare_breakdown.total_fare,
                pickup: inv.trip_details.pickup_address,
                drop: inv.trip_details.drop_address,
                driver_name: inv.driver_id.name,
                payment_status: inv.payment_status,
                feedback_given: !!inv.feedback.rating
            }))
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Get valid promo codes from environment or default config
exports.getValidPromoCodes = function() {
    try {
        // Try to load from environment variable (JSON format)
        if (process.env.PROMO_CODES) {
            return JSON.parse(process.env.PROMO_CODES);
        }
    } catch (error) {
        console.warn('Invalid PROMO_CODES format in environment');
    }
    
    // Default promo codes for development
    return {
        'WELCOME10': 10,
        'SAVE15': 15,
        'NEWUSER20': 20
    };
};