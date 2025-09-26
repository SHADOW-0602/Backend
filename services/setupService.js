const bcrypt = require('bcryptjs');
const Admin = require('../models/Admin');
const User = require('../models/User');
const Driver = require('../models/Driver');
const ConfigValidator = require('../utils/configValidator');

class SetupService {
    // Create initial admin from environment variables
    static async createInitialAdmin() {
        try {
            const adminEmail = process.env.ADMIN_EMAIL;
            const adminPassword = process.env.ADMIN_PASSWORD;
            const adminName = process.env.ADMIN_NAME;
            const adminSecretKey = process.env.ADMIN_SECRET_KEY;

            if (!adminEmail || !adminPassword || !adminName || !adminSecretKey) {
                console.log('⚠️  Admin environment variables not set. Skipping admin creation.');
                return false;
            }

            // Check if admin already exists
            const existingAdmin = await Admin.findOne({ email: adminEmail });
            if (existingAdmin) {
                console.log('✅ Admin already exists');
                return true;
            }

            // Hash credentials
            const hashedPassword = await bcrypt.hash(adminPassword, 10);
            const hashedSecretKey = await bcrypt.hash(adminSecretKey, 10);

            // Create admin
            const admin = new Admin({
                name: adminName,
                email: adminEmail,
                password: hashedPassword,
                secretKey: hashedSecretKey
            });

            await admin.save();
            console.log('✅ Initial admin created successfully');
            console.log(`📧 Email: ${adminEmail}`);
            console.log('🔑 Use environment variables for credentials');
            
            return true;
        } catch (error) {
            console.error('❌ Error creating initial admin:', error.message);
            return false;
        }
    }

    // Create test data if enabled
    static async createTestData() {
        try {
            if (process.env.CREATE_TEST_DATA !== 'true') {
                return false;
            }

            const testUserEmail = process.env.TEST_USER_EMAIL;
            const testUserPassword = process.env.TEST_USER_PASSWORD;
            const testDriverEmail = process.env.TEST_DRIVER_EMAIL;
            const testDriverPassword = process.env.TEST_DRIVER_PASSWORD;

            if (!testUserEmail || !testUserPassword || !testDriverEmail || !testDriverPassword) {
                console.log('⚠️  Test data environment variables not complete. Skipping test data creation.');
                return false;
            }

            // Create test user
            const existingUser = await User.findOne({ email: testUserEmail });
            if (!existingUser) {
                const hashedUserPassword = await bcrypt.hash(testUserPassword, 10);
                await User.create({
                    name: 'Test User',
                    email: testUserEmail,
                    phone: '9876543210',
                    password: hashedUserPassword
                });
                console.log('✅ Test user created');
            }

            // Create test driver
            const existingDriver = await Driver.findOne({ email: testDriverEmail });
            if (!existingDriver) {
                const hashedDriverPassword = await bcrypt.hash(testDriverPassword, 10);
                await Driver.create({
                    name: 'Test Driver',
                    email: testDriverEmail,
                    phone: '9876543211',
                    password: hashedDriverPassword,
                    driverInfo: {
                        licenseNumber: 'DL1234567890',
                        vehicleType: 'sedan',
                        experience: 3,
                        isVerified: true
                    }
                });
                console.log('✅ Test driver created');
            }

            return true;
        } catch (error) {
            console.error('❌ Error creating test data:', error.message);
            return false;
        }
    }

    // Initialize system setup
    static async initializeSystem() {
        console.log('🚀 Initializing Car Rental System...');
        
        await this.createInitialAdmin();
        await this.createTestData();
        
        console.log('✅ System initialization complete');
    }

    // Validate environment configuration
    static validateEnvironment() {
        return ConfigValidator.validateAllConfigurations();
    }
}

module.exports = SetupService;