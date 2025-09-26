const { calculateDistance } = require('../../utils/haversine');

class FareEstimationService {
    constructor() {
        this.vehicleTypes = {
            bike: { 
                baseFare: 20, 
                perKm: 8, 
                perMin: 1.5,
                displayName: 'Bike',
                description: 'Quick and affordable rides for solo travel'
            },
            sedan: { 
                baseFare: 50, 
                perKm: 15, 
                perMin: 2.5,
                displayName: 'Sedan',
                description: 'Comfortable cars for city travel'
            },
            suv: { 
                baseFare: 80, 
                perKm: 25, 
                perMin: 3,
                displayName: 'SUV',
                description: 'Spacious rides for groups and families'
            }
        };
        
        this.surgeFactors = {
            peakHours: [7, 8, 9, 17, 18, 19, 20],
            nightHours: [22, 23, 0, 1, 2, 3, 4, 5],
            weekendMultiplier: 1.2,
            peakMultiplier: 1.5,
            nightMultiplier: 1.3
        };
    }

    async getUpfrontPricing(pickup, destination, requestedVehicleTypes = null) {
        const distance = calculateDistance(
            pickup.latitude, pickup.longitude,
            destination.latitude, destination.longitude
        );
        
        const estimatedTime = this.calculateEstimatedTime(distance);
        const currentDateTime = new Date();
        
        const vehicleOptions = [];
        const typesToProcess = requestedVehicleTypes || Object.keys(this.vehicleTypes);
        
        for (const vehicleType of typesToProcess) {
            if (!this.vehicleTypes[vehicleType]) continue;
            
            const fareDetails = this.calculateDetailedFare(
                distance, 
                estimatedTime, 
                vehicleType, 
                currentDateTime,
                pickup
            );
            
            vehicleOptions.push({
                vehicleType,
                ...this.vehicleTypes[vehicleType],
                ...fareDetails,
                estimatedArrival: await this.getEstimatedArrival(pickup, vehicleType)
            });
        }
        
        return {
            tripDetails: {
                distance: Math.round(distance * 100) / 100,
                estimatedTime,
                pickup: pickup.address,
                destination: destination.address
            },
            vehicleOptions: vehicleOptions.sort((a, b) => a.totalFare - b.totalFare),
            priceGuarantee: 'Price shown is final - no surprises',
            validUntil: new Date(Date.now() + 5 * 60 * 1000) // 5 minutes
        };
    }

    calculateDetailedFare(distance, duration, vehicleType, dateTime, location) {
        const rates = this.vehicleTypes[vehicleType];
        
        // Base components
        const baseFare = rates.baseFare;
        const distanceFare = distance * rates.perKm;
        const timeFare = duration * rates.perMin;
        
        // Dynamic pricing factors
        const surgeMultiplier = this.calculateSurgeMultiplier(dateTime, location);
        const demandMultiplier = this.calculateDemandMultiplier(location);
        
        // Subtotal before surge
        const subtotal = baseFare + distanceFare + timeFare;
        
        // Apply multipliers
        const surgeAmount = subtotal * (surgeMultiplier - 1);
        const demandAmount = subtotal * (demandMultiplier - 1);
        
        // Tolls and fees (simplified)
        const tollFees = this.estimateTolls(distance);
        const serviceFee = Math.min(subtotal * 0.05, 25); // 5% service fee, max ₹25
        
        // Total calculation
        const totalBeforeTax = subtotal + surgeAmount + demandAmount + tollFees + serviceFee;
        const tax = totalBeforeTax * 0.05; // 5% GST
        const totalFare = Math.round(totalBeforeTax + tax);
        
        return {
            fareBreakdown: {
                baseFare: Math.round(baseFare),
                distanceFare: Math.round(distanceFare),
                timeFare: Math.round(timeFare),
                surgeAmount: Math.round(surgeAmount),
                demandAmount: Math.round(demandAmount),
                tollFees: Math.round(tollFees),
                serviceFee: Math.round(serviceFee),
                tax: Math.round(tax)
            },
            subtotal: Math.round(subtotal),
            totalFare,
            surgeMultiplier: Math.round(surgeMultiplier * 100) / 100,
            demandLevel: demandMultiplier > 1 ? 'High' : 'Normal',
            currency: 'INR'
        };
    }

    calculateEstimatedTime(distance) {
        // Average speed based on distance (city vs highway)
        let avgSpeed;
        if (distance < 5) avgSpeed = 25; // City traffic
        else if (distance < 20) avgSpeed = 35; // Mixed traffic
        else avgSpeed = 50; // Highway
        
        return Math.ceil((distance / avgSpeed) * 60); // Convert to minutes
    }

    calculateSurgeMultiplier(dateTime, location) {
        const hour = dateTime.getHours();
        const day = dateTime.getDay();
        let multiplier = 1.0;
        
        // Peak hours surge
        if (this.surgeFactors.peakHours.includes(hour)) {
            multiplier = this.surgeFactors.peakMultiplier;
        }
        // Night hours surge
        else if (this.surgeFactors.nightHours.includes(hour)) {
            multiplier = this.surgeFactors.nightMultiplier;
        }
        // Weekend surge
        else if (day === 0 || day === 6) {
            multiplier = this.surgeFactors.weekendMultiplier;
        }
        
        return Math.min(multiplier, 3.0); // Cap at 3x
    }

    calculateDemandMultiplier(location) {
        // Simplified demand calculation
        // In real implementation, this would use historical data and current demand
        const hour = new Date().getHours();
        
        // High demand areas/times
        if ((hour >= 8 && hour <= 10) || (hour >= 17 && hour <= 20)) {
            return 1.2; // 20% demand surge
        }
        
        return 1.0;
    }

    estimateTolls(distance) {
        // Simplified toll estimation
        if (distance > 15) return 50; // Highway tolls
        if (distance > 8) return 20;  // City tolls
        return 0;
    }

    async getEstimatedArrival(pickup, vehicleType) {
        // Simplified - in real app, this would check actual driver locations
        const baseTime = Math.floor(Math.random() * 8) + 2; // 2-10 minutes
        
        // Adjust based on vehicle type availability
        const adjustments = {
            bike: 0,
            sedan: 1,
            suv: 2
        };
        
        return baseTime + (adjustments[vehicleType] || 0);
    }

    async applyPromoCode(fareDetails, promoCode) {
        // Simplified promo code logic
        const promoCodes = {
            'WELCOME10': { type: 'percentage', value: 10, maxDiscount: 100 },
            'FLAT50': { type: 'flat', value: 50, minFare: 200 },
            'NEWUSER20': { type: 'percentage', value: 20, maxDiscount: 150 }
        };
        
        const promo = promoCodes[promoCode.toUpperCase()];
        if (!promo) {
            return { ...fareDetails, promoError: 'Invalid promo code' };
        }
        
        let discount = 0;
        if (promo.type === 'percentage') {
            discount = Math.min(
                (fareDetails.totalFare * promo.value) / 100,
                promo.maxDiscount
            );
        } else if (promo.type === 'flat') {
            if (fareDetails.totalFare >= promo.minFare) {
                discount = promo.value;
            } else {
                return { 
                    ...fareDetails, 
                    promoError: `Minimum fare of ₹${promo.minFare} required` 
                };
            }
        }
        
        return {
            ...fareDetails,
            promoApplied: {
                code: promoCode,
                discount: Math.round(discount),
                originalFare: fareDetails.totalFare,
                finalFare: Math.round(fareDetails.totalFare - discount)
            }
        };
    }
}

module.exports = FareEstimationService;