const Invoice = require('../models/Invoice');
const Ride = require('../models/Ride');
const FareEstimationService = require('./trip-planning/fareEstimationService');
const RatingFeedbackService = require('./post-trip/ratingFeedbackService');

class InvoiceService {
    constructor() {
        this.fareEstimationService = new FareEstimationService();
        this.ratingService = new RatingFeedbackService();
    }

    // Generate invoice for completed ride
    async generateInvoice(rideId) {
        try {
            const ride = await Ride.findById(rideId)
                .populate('user_id', 'name email phone')
                .populate('driver_id', 'name email phone rating');

            if (!ride || ride.status !== 'completed') {
                throw new Error('Ride not found or not completed');
            }

            // Check if invoice already exists
            const existingInvoice = await Invoice.findOne({ ride_id: rideId });
            if (existingInvoice) {
                return existingInvoice;
            }

            // Calculate trip duration
            const duration = ride.timestamps?.started_at && ride.timestamps?.completed_at
                ? Math.ceil((new Date(ride.timestamps.completed_at) - new Date(ride.timestamps.started_at)) / 60000)
                : Math.ceil(ride.distance / 40 * 60); // Fallback estimate

            // Get vehicle type from driver info
            const vehicleType = ride.driver_id?.driverInfo?.vehicleType || 'sedan';

            // Calculate fare using existing ride data or estimate
            const baseFare = ride.fare || ride.estimatedFare || 100;
            const fareDetails = {
                base_fare: Math.round(baseFare * 0.4) || 40,
                distance_fare: Math.round(baseFare * 0.4) || 40,
                time_fare: Math.round(baseFare * 0.15) || 15,
                surge_multiplier: ride.surge_multiplier || 1.0,
                tax: Math.round(baseFare * 0.05) || 5,
                total_fare: baseFare
            };

            // Generate invoice number
            const invoiceNumber = `INV-${Date.now()}-${rideId.slice(-6)}`;
            
            // Create invoice with payment status
            const invoice = new Invoice({
                invoice_number: invoiceNumber,
                ride_id: rideId,
                user_id: ride.user_id._id,
                driver_id: ride.driver_id._id,
                payment_status: ride.payment_status || 'pending',
                
                fare_breakdown: {
                    base_fare: fareDetails.base_fare,
                    distance_fare: fareDetails.distance_fare,
                    time_fare: fareDetails.time_fare,
                    surge_multiplier: fareDetails.surge_multiplier,
                    tax: fareDetails.tax,
                    total_fare: fareDetails.total_fare
                },
                
                trip_details: {
                    distance: ride.distance,
                    duration,
                    pickup_address: ride.pickup_location?.address,
                    drop_address: ride.drop_location?.address,
                    vehicle_type: vehicleType,
                    started_at: ride.timestamps?.started_at,
                    completed_at: ride.timestamps?.completed_at
                }
            });

            await invoice.save();

            // Update ride with final fare
            await Ride.findByIdAndUpdate(rideId, { 
                fare: fareDetails.total_fare 
            });

            return invoice;
        } catch (error) {
            throw new Error(`Invoice generation failed: ${error.message}`);
        }
    }

    // Get invoice with full details
    async getInvoiceDetails(invoiceId) {
        const invoice = await Invoice.findById(invoiceId)
            .populate('user_id', 'name email phone')
            .populate('driver_id', 'name email phone rating')
            .populate('ride_id');

        if (!invoice) {
            throw new Error('Invoice not found');
        }

        return {
            _id: invoice._id.toString(),
            invoice_number: invoice.invoice_number,
            date: invoice.createdAt,
            
            customer: {
                name: invoice.user_id.name,
                email: invoice.user_id.email,
                phone: invoice.user_id.phone
            },
            
            driver: {
                name: invoice.driver_id.name,
                phone: invoice.driver_id.phone,
                rating: invoice.driver_id.rating
            },
            
            trip: invoice.trip_details,
            fare: invoice.fare_breakdown,
            payment_status: invoice.payment_status,
            feedback: invoice.feedback
        };
    }

    // Submit feedback (legacy - redirects to rating service)
    async submitFeedback(invoiceId, rating, comment) {
        const invoice = await Invoice.findById(invoiceId).populate('user_id');
        if (!invoice) {
            throw new Error('Invoice not found');
        }

        // Use new rating system - pass the user ID as string
        const ratingData = { rating, feedback: comment };
        await this.ratingService.submitRating(invoice.ride_id, invoice.user_id._id.toString(), 'user', ratingData);

        // Update invoice feedback for backward compatibility
        invoice.feedback = {
            rating,
            comment,
            submitted_at: new Date()
        };
        await invoice.save();

        return invoice.feedback;
    }

    // Update driver's average rating
    async updateDriverRating(driverId, newRating) {
        const Driver = require('../models/Driver');
        
        const invoices = await Invoice.find({
            driver_id: driverId,
            'feedback.rating': { $exists: true }
        });

        const totalRatings = invoices.length;
        const sumRatings = invoices.reduce((sum, inv) => sum + inv.feedback.rating, 0);
        const averageRating = totalRatings > 0 ? sumRatings / totalRatings : 0;

        await Driver.findByIdAndUpdate(driverId, {
            rating: Math.round(averageRating * 10) / 10
        });
    }

    // Get trip summary
    async getTripSummary(rideId) {
        const invoice = await Invoice.findOne({ ride_id: rideId })
            .populate('user_id', 'name')
            .populate('driver_id', 'name rating')
            .populate('ride_id');

        if (!invoice) {
            throw new Error('Trip summary not available');
        }

        return {
            trip_id: rideId,
            invoice_number: invoice.invoice_number,
            date: invoice.createdAt,
            
            summary: {
                pickup: invoice.trip_details.pickup_address,
                drop: invoice.trip_details.drop_address,
                distance: `${invoice.trip_details.distance} km`,
                duration: `${invoice.trip_details.duration} min`,
                vehicle_type: invoice.trip_details.vehicle_type
            },
            
            fare_summary: {
                base_fare: `₹${invoice.fare_breakdown.base_fare}`,
                distance_fare: `₹${invoice.fare_breakdown.distance_fare}`,
                time_fare: `₹${invoice.fare_breakdown.time_fare}`,
                tax: `₹${invoice.fare_breakdown.tax}`,
                total: `₹${invoice.fare_breakdown.total_fare}`
            },
            
            driver: {
                name: invoice.driver_id.name,
                rating: invoice.driver_id.rating
            },
            
            feedback_submitted: !!invoice.feedback.rating,
            can_rate_driver: true,
            can_rate_user: invoice.driver_id ? true : false
        };
    }
}

module.exports = InvoiceService;