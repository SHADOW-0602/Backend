const crypto = require('crypto');

class DataEncryption {
    constructor() {
        this.algorithm = 'aes-256-gcm';
        this.secretKey = process.env.ENCRYPTION_KEY || crypto.randomBytes(32);
        this.ivLength = 16;
    }

    // Encrypt sensitive data
    encrypt(text) {
        if (!text) return text;
        
        const iv = crypto.randomBytes(this.ivLength);
        const cipher = crypto.createCipher(this.algorithm, this.secretKey);
        cipher.setAAD(Buffer.from('CarRental', 'utf8'));
        
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        
        const authTag = cipher.getAuthTag();
        
        return {
            encrypted,
            iv: iv.toString('hex'),
            authTag: authTag.toString('hex')
        };
    }

    // Decrypt sensitive data
    decrypt(encryptedData) {
        if (!encryptedData || typeof encryptedData !== 'object') {
            return encryptedData;
        }
        
        try {
            const { encrypted, iv, authTag } = encryptedData;
            const decipher = crypto.createDecipher(this.algorithm, this.secretKey);
            
            decipher.setAAD(Buffer.from('CarRental', 'utf8'));
            decipher.setAuthTag(Buffer.from(authTag, 'hex'));
            
            let decrypted = decipher.update(encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            
            return decrypted;
        } catch (error) {
            console.error('Decryption failed:', error.message);
            return null;
        }
    }

    // Hash sensitive data (one-way)
    hash(data, salt = null) {
        const actualSalt = salt || crypto.randomBytes(16).toString('hex');
        const hash = crypto.pbkdf2Sync(data, actualSalt, 10000, 64, 'sha512').toString('hex');
        return { hash, salt: actualSalt };
    }

    // Verify hashed data
    verifyHash(data, hash, salt) {
        const { hash: newHash } = this.hash(data, salt);
        return newHash === hash;
    }
}

// Middleware to encrypt sensitive fields before saving
const encryptSensitiveFields = (sensitiveFields = []) => {
    return function(next) {
        const encryption = new DataEncryption();
        
        sensitiveFields.forEach(field => {
            if (this[field] && this.isModified(field)) {
                this[field] = encryption.encrypt(this[field]);
            }
        });
        
        next();
    };
};

// Middleware to decrypt sensitive fields after loading
const decryptSensitiveFields = (sensitiveFields = []) => {
    return function() {
        const encryption = new DataEncryption();
        
        sensitiveFields.forEach(field => {
            if (this[field]) {
                this[field] = encryption.decrypt(this[field]);
            }
        });
    };
};

// Sanitize output data (remove sensitive fields)
const sanitizeOutput = (data, userRole, sensitiveFields = []) => {
    if (!data) return data;
    
    const sanitized = JSON.parse(JSON.stringify(data));
    
    // Admin can see more fields than regular users
    const fieldsToRemove = userRole === 'admin' 
        ? ['password', 'secretKey'] 
        : ['password', 'secretKey', ...sensitiveFields];
    
    const removeSensitiveFields = (obj) => {
        if (Array.isArray(obj)) {
            return obj.map(removeSensitiveFields);
        }
        
        if (obj && typeof obj === 'object') {
            const cleaned = { ...obj };
            fieldsToRemove.forEach(field => {
                delete cleaned[field];
            });
            
            // Recursively clean nested objects
            Object.keys(cleaned).forEach(key => {
                if (cleaned[key] && typeof cleaned[key] === 'object') {
                    cleaned[key] = removeSensitiveFields(cleaned[key]);
                }
            });
            
            return cleaned;
        }
        
        return obj;
    };
    
    return removeSensitiveFields(sanitized);
};

// Mask sensitive data for logging
const maskSensitiveData = (data, fieldsToMask = ['password', 'secretKey', 'phone', 'email']) => {
    if (!data || typeof data !== 'object') return data;
    
    const masked = { ...data };
    
    fieldsToMask.forEach(field => {
        if (masked[field]) {
            const value = masked[field].toString();
            if (field === 'email') {
                const [local, domain] = value.split('@');
                masked[field] = `${local.charAt(0)}***@${domain}`;
            } else if (field === 'phone') {
                masked[field] = `***${value.slice(-4)}`;
            } else {
                masked[field] = '***';
            }
        }
    });
    
    return masked;
};

module.exports = {
    DataEncryption,
    encryptSensitiveFields,
    decryptSensitiveFields,
    sanitizeOutput,
    maskSensitiveData
};