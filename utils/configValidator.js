// Configuration validation utility
class ConfigValidator {
    static validateRequiredEnvVars() {
        const required = [
            'MONGODB_URI',
            'JWT_SECRET'
        ];

        const missing = required.filter(key => !process.env[key]);
        
        if (missing.length > 0) {
            console.error('❌ Missing required environment variables:');
            missing.forEach(key => console.error(`   - ${key}`));
            return false;
        }

        return true;
    }

    static validateOptionalEnvVars() {
        const optional = {
            'ADMIN_EMAIL': 'Admin email for automatic setup',
            'ADMIN_PASSWORD': 'Admin password for automatic setup', 
            'ADMIN_NAME': 'Admin name for automatic setup',
            'ADMIN_SECRET_KEY': 'Admin secret key for automatic setup',
            'PORT': 'Server port (defaults to 3000)',
            'NODE_ENV': 'Environment mode (development/production)'
        };

        const missing = Object.keys(optional).filter(key => !process.env[key]);
        
        if (missing.length > 0) {
            console.warn('⚠️  Optional environment variables not set:');
            missing.forEach(key => {
                console.warn(`   - ${key}: ${optional[key]}`);
            });
        }

        return true;
    }

    static validatePromoCodesFormat() {
        if (process.env.PROMO_CODES) {
            try {
                const promoCodes = JSON.parse(process.env.PROMO_CODES);
                
                // Validate format
                if (typeof promoCodes !== 'object' || Array.isArray(promoCodes)) {
                    console.error('❌ PROMO_CODES must be a JSON object');
                    return false;
                }

                // Validate values are numbers
                for (const [code, discount] of Object.entries(promoCodes)) {
                    if (typeof discount !== 'number' || discount < 0 || discount > 100) {
                        console.error(`❌ Invalid discount value for promo code ${code}: ${discount}`);
                        return false;
                    }
                }

                console.log('✅ Promo codes configuration valid');
                return true;
            } catch (error) {
                console.error('❌ Invalid PROMO_CODES JSON format:', error.message);
                return false;
            }
        }

        console.log('ℹ️  No promo codes configured, using defaults');
        return true;
    }

    static validatePasswordStrength(password, minLength = 8) {
        if (!password || password.length < minLength) {
            return {
                valid: false,
                message: `Password must be at least ${minLength} characters long`
            };
        }

        const hasUpperCase = /[A-Z]/.test(password);
        const hasLowerCase = /[a-z]/.test(password);
        const hasNumbers = /\d/.test(password);
        const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

        const score = [hasUpperCase, hasLowerCase, hasNumbers, hasSpecialChar].filter(Boolean).length;

        if (score < 3) {
            return {
                valid: false,
                message: 'Password should contain uppercase, lowercase, numbers, and special characters'
            };
        }

        return { valid: true, message: 'Password strength is good' };
    }

    static validateEmailFormat(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    static validateAllConfigurations() {
        console.log('🔍 Validating system configuration...');
        
        const requiredValid = this.validateRequiredEnvVars();
        if (!requiredValid) {
            return false;
        }

        this.validateOptionalEnvVars();
        
        const promoValid = this.validatePromoCodesFormat();
        if (!promoValid) {
            return false;
        }

        // Validate admin credentials if provided
        if (process.env.ADMIN_EMAIL && !this.validateEmailFormat(process.env.ADMIN_EMAIL)) {
            console.error('❌ Invalid ADMIN_EMAIL format');
            return false;
        }

        if (process.env.ADMIN_PASSWORD) {
            const passwordCheck = this.validatePasswordStrength(process.env.ADMIN_PASSWORD);
            if (!passwordCheck.valid) {
                console.error('❌ Admin password validation failed:', passwordCheck.message);
                return false;
            }
        }

        console.log('✅ Configuration validation complete');
        return true;
    }
}

module.exports = ConfigValidator;