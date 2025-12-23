const AWS = require('aws-sdk');

// Configure AWS DynamoDB
const dynamoDB = new AWS.DynamoDB.DocumentClient({
    region: process.env.AWS_REGION,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

const TABLE_NAME = process.env.DYNAMODB_TABLE;

/**
 * Get all users from DynamoDB
 * @route GET /api/users
 */
const getAllUsers = async (req, res) => {
    try {
        const params = {
            TableName: TABLE_NAME,
            FilterExpression: '#role = :userRole',
            ExpressionAttributeNames: {
                '#role': 'role'
            },
            ExpressionAttributeValues: {
                ':userRole': 'user'
            }
        };

        const result = await dynamoDB.scan(params).promise();

        // Remove sensitive data (password) from response
        const users = (result.Items || []).map(user => {
            const { password, ...userWithoutPassword } = user;
            return userWithoutPassword;
        });

        // Sort by createdAt (newest first)
        users.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        res.json({
            success: true,
            data: {
                users,
                count: users.length
            }
        });

    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch users',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Get user statistics
 * @route GET /api/users/stats
 */
const getUserStats = async (req, res) => {
    try {
        const params = {
            TableName: TABLE_NAME,
            FilterExpression: '#role = :userRole',
            ExpressionAttributeNames: {
                '#role': 'role'
            },
            ExpressionAttributeValues: {
                ':userRole': 'user'
            }
        };

        const result = await dynamoDB.scan(params).promise();
        const users = result.Items || [];

        // Calculate stats
        const total = users.length;
        const active = users.filter(u => u.isActive === true).length;
        const verified = users.filter(u => u.isVerified === true).length;
        const inactive = users.filter(u => u.isActive === false).length;

        // Get recent registrations (last 7 days)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const recentSignups = users.filter(u =>
            u.createdAt && new Date(u.createdAt) >= sevenDaysAgo
        ).length;

        res.json({
            success: true,
            data: {
                total,
                active,
                verified,
                inactive,
                recentSignups
            }
        });

    } catch (error) {
        console.error('Error fetching user stats:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch user statistics',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Get user by phone number
 * @route GET /api/users/:phone
 */
const getUserByPhone = async (req, res) => {
    try {
        const { phone } = req.params;

        const params = {
            TableName: TABLE_NAME,
            Key: { phone }
        };

        const result = await dynamoDB.get(params).promise();

        if (!result.Item) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Remove password from response
        const { password, ...userWithoutPassword } = result.Item;

        res.json({
            success: true,
            data: userWithoutPassword
        });

    } catch (error) {
        console.error('Error fetching user:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch user',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Update user status (active/inactive)
 * @route PATCH /api/users/:phone/status
 */
const updateUserStatus = async (req, res) => {
    try {
        const { phone } = req.params;
        const { isActive } = req.body;

        if (typeof isActive !== 'boolean') {
            return res.status(400).json({
                success: false,
                message: 'isActive must be a boolean'
            });
        }

        const params = {
            TableName: TABLE_NAME,
            Key: { phone },
            UpdateExpression: 'SET isActive = :isActive, updatedAt = :updatedAt',
            ExpressionAttributeValues: {
                ':isActive': isActive,
                ':updatedAt': new Date().toISOString()
            },
            ReturnValues: 'ALL_NEW'
        };

        const result = await dynamoDB.update(params).promise();

        // Remove password from response
        const { password, ...userWithoutPassword } = result.Attributes;

        res.json({
            success: true,
            message: `User ${isActive ? 'activated' : 'deactivated'} successfully`,
            data: userWithoutPassword
        });

    } catch (error) {
        console.error('Error updating user status:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update user status',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = {
    getAllUsers,
    getUserStats,
    getUserByPhone,
    updateUserStatus
};
