const mongoose = require('mongoose');

// Connection cache for serverless environments
let cachedConnection = null;

/**
 * Optimized MongoDB connection for Vercel serverless functions
 * Implements connection pooling and caching for better performance
 */
const connectToDatabase = async () => {
    // Return cached connection if available
    if (cachedConnection && mongoose.connection.readyState === 1) {
        console.log('🔄 Using cached MongoDB connection');
        return cachedConnection;
    }

    try {
        // Optimized connection options for serverless
        const connectionOptions = {
            maxPoolSize: 10,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
            bufferCommands: false,
            maxIdleTimeMS: 30000,
            heartbeatFrequencyMS: 10000
        };

        console.log('🔌 Connecting to MongoDB...');
        
        // Connect to MongoDB
        cachedConnection = await mongoose.connect(process.env.MONGODB_URI, connectionOptions);
        
        console.log('✅ MongoDB connected successfully');
        
        // Handle connection events
        mongoose.connection.on('error', (error) => {
            console.error('❌ MongoDB connection error:', error);
            cachedConnection = null;
        });

        mongoose.connection.on('disconnected', () => {
            console.warn('⚠️ MongoDB disconnected');
            cachedConnection = null;
        });

        mongoose.connection.on('reconnected', () => {
            console.log('🔄 MongoDB reconnected');
        });

        return cachedConnection;
    } catch (error) {
        console.error('❌ MongoDB connection failed:', error);
        cachedConnection = null;
        throw error;
    }
};

/**
 * Gracefully close MongoDB connection
 */
const closeConnection = async () => {
    if (cachedConnection) {
        try {
            await mongoose.connection.close();
            cachedConnection = null;
            console.log('✅ MongoDB connection closed');
        } catch (error) {
            console.error('❌ Error closing MongoDB connection:', error);
        }
    }
};

/**
 * Check if database is connected
 */
const isConnected = () => {
    return mongoose.connection.readyState === 1;
};

/**
 * Get connection status
 */
const getConnectionStatus = () => {
    const states = {
        0: 'disconnected',
        1: 'connected',
        2: 'connecting',
        3: 'disconnecting'
    };
    
    return {
        state: states[mongoose.connection.readyState] || 'unknown',
        readyState: mongoose.connection.readyState,
        host: mongoose.connection.host,
        name: mongoose.connection.name
    };
};

module.exports = {
    connectToDatabase,
    closeConnection,
    isConnected,
    getConnectionStatus
};