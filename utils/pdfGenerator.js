// Simple invoice template generator (text-based)
class InvoiceTemplate {
    static generateInvoiceText(invoiceData) {
        const { invoice_number, date, customer, driver, trip, fare } = invoiceData;
        
        return `
═══════════════════════════════════════════════════════════════
                        CAR RENTAL INVOICE
═══════════════════════════════════════════════════════════════

Invoice Number: ${invoice_number}
Date: ${new Date(date).toLocaleDateString('en-IN')}
Time: ${new Date(date).toLocaleTimeString('en-IN')}

───────────────────────────────────────────────────────────────
CUSTOMER DETAILS
───────────────────────────────────────────────────────────────
Name: ${customer.name}
Phone: ${customer.phone}
Email: ${customer.email}

───────────────────────────────────────────────────────────────
DRIVER DETAILS
───────────────────────────────────────────────────────────────
Name: ${driver.name}
Phone: ${driver.phone}
Rating: ${driver.rating}/5 ⭐

───────────────────────────────────────────────────────────────
TRIP DETAILS
───────────────────────────────────────────────────────────────
From: ${trip.pickup_address}
To: ${trip.drop_address}
Distance: ${trip.distance} km
Duration: ${trip.duration} minutes
Vehicle: ${trip.vehicle_type.toUpperCase()}
Started: ${new Date(trip.started_at).toLocaleString('en-IN')}
Completed: ${new Date(trip.completed_at).toLocaleString('en-IN')}

───────────────────────────────────────────────────────────────
FARE BREAKDOWN
───────────────────────────────────────────────────────────────
Base Fare                                           ₹${fare.base_fare}
Distance Fare (${trip.distance} km)                 ₹${fare.distance_fare}
Time Fare (${trip.duration} min)                    ₹${fare.time_fare}
${fare.surge_multiplier > 1 ? `Surge (${fare.surge_multiplier}x)                                  Applied` : ''}
${fare.discount > 0 ? `Discount                                         -₹${fare.discount}` : ''}
                                                   ───────────
Subtotal                                            ₹${fare.base_fare + fare.distance_fare + fare.time_fare}
Tax (18% GST)                                       ₹${fare.tax}
                                                   ═══════════
TOTAL AMOUNT                                        ₹${fare.total_fare}
                                                   ═══════════

───────────────────────────────────────────────────────────────
PAYMENT STATUS: ${invoiceData.payment_status.toUpperCase()}
───────────────────────────────────────────────────────────────

Thank you for choosing our service!
For support, contact: support@carrental.com

═══════════════════════════════════════════════════════════════
        `;
    }

    static generateReceiptSummary(invoiceData) {
        const { trip, fare } = invoiceData;
        
        return {
            trip_summary: `${trip.pickup_address} → ${trip.drop_address}`,
            distance: `${trip.distance} km`,
            duration: `${trip.duration} min`,
            vehicle: trip.vehicle_type,
            total_fare: `₹${fare.total_fare}`,
            breakdown: {
                base: `₹${fare.base_fare}`,
                distance: `₹${fare.distance_fare}`,
                time: `₹${fare.time_fare}`,
                tax: `₹${fare.tax}`
            }
        };
    }
}

module.exports = InvoiceTemplate;