const bcrypt = require('bcryptjs');
const Admin = require('../models/Admin');

// Create admin (only if no admin exists)
exports.createAdmin = async (req, res) => {
    try {
        // Check if any admin exists
        const adminCount = await Admin.countDocuments();
        if (adminCount > 0) {
            return res.status(400).json({
                success: false,
                error: 'Admin already exists. Use environment variables or contact system administrator.'
            });
        }

        const { name, email, password, secretKey } = req.body;

        if (!name || !email || !password || !secretKey) {
            return res.status(400).json({
                success: false,
                error: 'All fields are required: name, email, password, secretKey'
            });
        }

        // Validate password strength
        if (password.length < 8) {
            return res.status(400).json({
                success: false,
                error: 'Password must be at least 8 characters long'
            });
        }

        // Hash credentials
        const hashedPassword = await bcrypt.hash(password, 10);
        const hashedSecretKey = await bcrypt.hash(secretKey, 10);

        // Create admin
        const admin = new Admin({
            name,
            email,
            password: hashedPassword,
            secretKey: hashedSecretKey
        });

        await admin.save();

        res.json({
            success: true,
            message: 'Admin created successfully',
            admin: {
                id: admin._id,
                name: admin.name,
                email: admin.email
            }
        });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(400).json({
                success: false,
                error: 'Email already exists'
            });
        }
        res.status(500).json({ success: false, error: err.message });
    }
};

// Check if admin setup is required
exports.checkSetupRequired = async (req, res) => {
    try {
        const adminCount = await Admin.countDocuments();
        
        res.json({
            success: true,
            setupRequired: adminCount === 0,
            hasAdmin: adminCount > 0
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Reset admin (emergency use only - requires special token)
exports.resetAdmin = async (req, res) => {
    try {
        const { resetToken, newAdminData } = req.body;
        
        // Check reset token (should be set in environment for security)
        const validResetToken = process.env.ADMIN_RESET_TOKEN;
        if (!validResetToken || resetToken !== validResetToken) {
            return res.status(403).json({
                success: false,
                error: 'Invalid reset token'
            });
        }

        // Delete all existing admins
        await Admin.deleteMany({});

        // Create new admin
        const { name, email, password, secretKey } = newAdminData;
        const hashedPassword = await bcrypt.hash(password, 10);
        const hashedSecretKey = await bcrypt.hash(secretKey, 10);

        const admin = new Admin({
            name,
            email,
            password: hashedPassword,
            secretKey: hashedSecretKey
        });

        await admin.save();

        res.json({
            success: true,
            message: 'Admin reset successfully'
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};