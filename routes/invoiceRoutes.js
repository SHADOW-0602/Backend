const express = require('express');
const router = express.Router();
const InvoiceService = require('../services/invoiceService');
const auth = require('../middleware/auth');

const invoiceService = new InvoiceService();

// Get invoice for a ride
router.get('/ride/:rideId', auth, async (req, res) => {
    try {
        const { rideId } = req.params;
        console.log('Getting invoice for ride:', rideId);
        
        // Check if ride exists and is completed
        const Ride = require('../models/Ride');
        const ride = await Ride.findById(rideId);
        
        if (!ride) {
            return res.status(404).json({ success: false, error: 'Ride not found' });
        }
        
        if (ride.status !== 'completed') {
            return res.status(400).json({ success: false, error: 'Ride not completed yet' });
        }
        
        // Try to generate/get invoice
        const invoice = await invoiceService.generateInvoice(rideId);
        const details = await invoiceService.getInvoiceDetails(invoice._id);
        
        // Ensure _id is included in response
        details._id = invoice._id.toString();
        
        console.log('Invoice generated successfully:', invoice._id);
        console.log('Invoice details:', details);
        res.json({ success: true, invoice: details });
    } catch (error) {
        console.error('Invoice error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// Submit rating
router.post('/:invoiceId/rating', auth, async (req, res) => {
    try {
        const { invoiceId } = req.params;
        const { rating, comment } = req.body;
        const feedback = await invoiceService.submitFeedback(invoiceId, rating, comment);
        res.json({ success: true, feedback });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

module.exports = router;