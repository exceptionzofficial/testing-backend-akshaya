const AWS = require('aws-sdk');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Configure AWS DynamoDB
const dynamoDB = new AWS.DynamoDB.DocumentClient({
    region: process.env.AWS_REGION,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

const USERS_TABLE = process.env.DYNAMODB_TABLE; // Users table for Auth
const RIDERS_TABLE = process.env.DYNAMODB_RIDERS_TABLE || 'satvamirtham-riders'; // Riders table for profile

/**
 * Generate JWT Token
 */
const generateToken = (user) => {
    return jwt.sign(
        {
            phone: user.phone,
            name: user.name,
            role: 'rider', // Force rider role
            riderId: user.riderId
        },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN }
    );
};

/**
 * Register Rider
 * Creates entry in BOTH Users table (for auth) and Riders table (for profile)
 * @route POST /api/rider/auth/register
 */
const registerRider = async (req, res) => {
    try {
        const { name, phone, password, email, vehicleType, vehicleNumber } = req.body;

        if (!name || !phone || !password || !vehicleType || !vehicleNumber) {
            return res.status(400).json({
                success: false,
                message: 'Name, phone, password, vehicle type, and vehicle number are required'
            });
        }

        // 1. Check if phone exists in Users table
        const existingUser = await dynamoDB.get({
            TableName: USERS_TABLE,
            Key: { phone }
        }).promise();

        if (existingUser.Item) {
            return res.status(409).json({
                success: false,
                message: 'User with this phone number already exists'
            });
        }

        // 2. Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // 3. Generate Rider ID
        const riderId = `RDR${Date.now()}`;
        const now = new Date().toISOString();

        // 4. Create User Record (for Auth)
        const userRecord = {
            phone,
            name,
            password: hashedPassword,
            role: 'rider',
            riderId, // Link to rider profile
            isActive: true,
            createdAt: now,
            updatedAt: now
        };

        if (email) {
            userRecord.email = email;
        }

        // 5. Create Rider Record (for Profile)
        const riderRecord = {
            id: riderId, // Primary Key for Riders Table
            name,
            phone,
            vehicleType,
            vehicleNumber,
            status: 'offline', // Default status
            totalDeliveries: 0,
            rating: 5.0,
            isActive: true,
            currentOrderId: null,
            joinedAt: now,
            updatedAt: now
        };

        if (email) {
            riderRecord.email = email;
        }

        // 6. TransactWriteItems to ensure atomicity
        // Note: TransactWrite uses 'TableName' not 'Table' inside items. 
        // Also DocumentClient.transactWrite parameter structure matches underlying DynamoDB API.
        await dynamoDB.transactWrite({
            TransactItems: [
                {
                    Put: {
                        TableName: USERS_TABLE,
                        Item: userRecord,
                        ConditionExpression: 'attribute_not_exists(phone)'
                    }
                },
                {
                    Put: {
                        TableName: RIDERS_TABLE,
                        Item: riderRecord
                    }
                }
            ]
        }).promise();

        // 7. Generate Token
        const token = generateToken(userRecord);

        res.status(201).json({
            success: true,
            message: 'Rider registered successfully',
            data: {
                rider: {
                    id: riderId,
                    name,
                    phone,
                    vehicleType,
                    status: 'offline'
                },
                token
            }
        });

    } catch (error) {
        console.error('Rider Registration Error:', error);
        res.status(500).json({
            success: false,
            message: 'Registration failed',
            error: error.message
        });
    }
};

/**
 * Login Rider
 * Authenticates against Users table, then fetches profile from Riders table
 * @route POST /api/rider/auth/login
 */
const loginRider = async (req, res) => {
    try {
        const { phone, password } = req.body;

        if (!phone || !password) {
            return res.status(400).json({ success: false, message: 'Phone and password are required' });
        }

        // 1. Get User from Users Table
        const userResult = await dynamoDB.get({
            TableName: USERS_TABLE,
            Key: { phone }
        }).promise();

        const user = userResult.Item;

        if (!user || user.role !== 'rider') {
            return res.status(401).json({ success: false, message: 'Invalid credentials or not a rider account' });
        }

        // 2. Verify Password
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        // 3. Get Rider Profile from Riders Table
        let riderProfile = null;
        if (user.riderId) {
            const riderResult = await dynamoDB.get({
                TableName: RIDERS_TABLE,
                Key: { id: user.riderId }
            }).promise();
            riderProfile = riderResult.Item;
        }

        // 4. Generate Token
        const token = generateToken(user);

        res.status(200).json({
            success: true,
            message: 'Login successful',
            data: {
                rider: riderProfile || { id: user.riderId, name: user.name, phone: user.phone }, // Fallback if profile missing
                token
            }
        });

    } catch (error) {
        console.error('Rider Login Error:', error);
        res.status(500).json({ success: false, message: 'Login failed', error: error.message });
    }
};

// Update FCM Token
const updateFCMToken = async (req, res) => {
    try {
        const { riderId, fcmToken } = req.body;

        console.log('FCM Token Update Request:', { riderId, fcmToken: fcmToken ? fcmToken.substring(0, 20) + '...' : 'missing' });

        if (!riderId || !fcmToken) {
            return res.status(400).json({ 
                success: false, 
                message: 'Missing riderId or fcmToken',
                received: { riderId: !!riderId, fcmToken: !!fcmToken }
            });
        }

        const params = {
            TableName: RIDERS_TABLE,
            Key: { id: riderId },
            UpdateExpression: 'set fcmToken = :token, updatedAt = :now',
            ExpressionAttributeValues: {
                ':token': fcmToken,
                ':now': new Date().toISOString()
            },
            ReturnValues: 'ALL_NEW'
        };

        const result = await dynamoDB.update(params).promise();
        console.log('FCM Token updated successfully for rider:', riderId);
        
        res.status(200).json({ 
            success: true, 
            message: 'FCM Token updated successfully',
            data: result.Attributes
        });
    } catch (error) {
        console.error('Update FCM Error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error',
            error: error.message
        });
    }
};

module.exports = {
    registerRider,
    loginRider,
    updateFCMToken
};
