const AWS = require('aws-sdk');

// Configure AWS DynamoDB
const dynamoDB = new AWS.DynamoDB.DocumentClient({
    region: process.env.AWS_REGION,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

const RIDERS_TABLE = process.env.DYNAMODB_RIDERS_TABLE || 'satvamirtham-riders';

// Valid rider statuses
const RIDER_STATUSES = ['available', 'on-delivery', 'offline'];

/**
 * Get all riders
 * @route GET /api/riders
 */
const getAllRiders = async (req, res) => {
    try {
        const { status } = req.query;

        let params = {
            TableName: RIDERS_TABLE,
            FilterExpression: 'isActive = :isActive',
            ExpressionAttributeValues: { ':isActive': true }
        };

        if (status && RIDER_STATUSES.includes(status)) {
            params.FilterExpression += ' AND #status = :status';
            params.ExpressionAttributeNames = { '#status': 'status' };
            params.ExpressionAttributeValues[':status'] = status;
        }

        const result = await dynamoDB.scan(params).promise();

        res.status(200).json({
            success: true,
            message: 'Riders fetched successfully',
            data: {
                riders: result.Items || [],
                count: result.Count || 0,
                statuses: RIDER_STATUSES
            }
        });

    } catch (error) {
        console.error('Get all riders error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch riders',
            ...(process.env.NODE_ENV === 'development' && { error: error.message })
        });
    }
};

/**
 * Get single rider by ID
 * @route GET /api/riders/:id
 */
const getRiderById = async (req, res) => {
    try {
        const { id } = req.params;

        const params = {
            TableName: RIDERS_TABLE,
            Key: { id }
        };

        const result = await dynamoDB.get(params).promise();

        if (!result.Item) {
            return res.status(404).json({
                success: false,
                message: 'Rider not found'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Rider fetched successfully',
            data: result.Item
        });

    } catch (error) {
        console.error('Get rider by ID error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch rider',
            ...(process.env.NODE_ENV === 'development' && { error: error.message })
        });
    }
};

/**
 * Create new rider
 * @route POST /api/riders
 */
const createRider = async (req, res) => {
    try {
        const {
            name,
            phone,
            email,
            vehicleType,
            vehicleNumber
        } = req.body;

        // Validation
        if (!name || !phone) {
            return res.status(400).json({
                success: false,
                message: 'Name and phone are required'
            });
        }

        // Generate unique ID
        const id = `RDR${Date.now()}`;

        const rider = {
            id,
            name,
            phone,
            email: email || '',
            vehicleType: vehicleType || 'Bike',
            vehicleNumber: vehicleNumber || '',
            status: 'offline',
            currentOrderId: null,
            totalDeliveries: 0,
            rating: 5.0,
            isActive: true,
            joinedAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        const params = {
            TableName: RIDERS_TABLE,
            Item: rider
        };

        await dynamoDB.put(params).promise();

        res.status(201).json({
            success: true,
            message: 'Rider created successfully',
            data: rider
        });

    } catch (error) {
        console.error('Create rider error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create rider',
            ...(process.env.NODE_ENV === 'development' && { error: error.message })
        });
    }
};

/**
 * Update rider
 * @route PUT /api/riders/:id
 */
const updateRider = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        // Check if rider exists
        const getParams = {
            TableName: RIDERS_TABLE,
            Key: { id }
        };

        const existing = await dynamoDB.get(getParams).promise();

        if (!existing.Item) {
            return res.status(404).json({
                success: false,
                message: 'Rider not found'
            });
        }

        // Build update expression
        let updateExpression = 'SET updatedAt = :updatedAt';
        const expressionAttributeValues = {
            ':updatedAt': new Date().toISOString()
        };
        const expressionAttributeNames = {};

        Object.keys(updates).forEach((key) => {
            if (key !== 'id') {
                updateExpression += `, #${key} = :${key}`;
                expressionAttributeNames[`#${key}`] = key;
                expressionAttributeValues[`:${key}`] = updates[key];
            }
        });

        const updateParams = {
            TableName: RIDERS_TABLE,
            Key: { id },
            UpdateExpression: updateExpression,
            ExpressionAttributeNames: expressionAttributeNames,
            ExpressionAttributeValues: expressionAttributeValues,
            ReturnValues: 'ALL_NEW'
        };

        const result = await dynamoDB.update(updateParams).promise();

        res.status(200).json({
            success: true,
            message: 'Rider updated successfully',
            data: result.Attributes
        });

    } catch (error) {
        console.error('Update rider error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update rider',
            ...(process.env.NODE_ENV === 'development' && { error: error.message })
        });
    }
};

/**
 * Update rider status
 * @route PATCH /api/riders/:id/status
 */
const updateRiderStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, currentOrderId } = req.body;

        if (!RIDER_STATUSES.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid status. Valid: ' + RIDER_STATUSES.join(', ')
            });
        }

        // Check if rider exists
        const getParams = {
            TableName: RIDERS_TABLE,
            Key: { id }
        };

        const existing = await dynamoDB.get(getParams).promise();

        if (!existing.Item) {
            return res.status(404).json({
                success: false,
                message: 'Rider not found'
            });
        }

        let updateExpression = 'SET #status = :status, updatedAt = :updatedAt';
        const expressionAttributeValues = {
            ':status': status,
            ':updatedAt': new Date().toISOString()
        };

        // If on-delivery, set currentOrderId
        if (status === 'on-delivery' && currentOrderId) {
            updateExpression += ', currentOrderId = :currentOrderId';
            expressionAttributeValues[':currentOrderId'] = currentOrderId;
        }

        // If available or offline, clear currentOrderId and increment deliveries if was on-delivery
        if ((status === 'available' || status === 'offline') && existing.Item.status === 'on-delivery') {
            updateExpression += ', currentOrderId = :nullValue, totalDeliveries = totalDeliveries + :increment';
            expressionAttributeValues[':nullValue'] = null;
            expressionAttributeValues[':increment'] = 1;
        }

        const params = {
            TableName: RIDERS_TABLE,
            Key: { id },
            UpdateExpression: updateExpression,
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: expressionAttributeValues,
            ReturnValues: 'ALL_NEW'
        };

        const result = await dynamoDB.update(params).promise();

        res.status(200).json({
            success: true,
            message: `Rider status updated to ${status}`,
            data: result.Attributes
        });

    } catch (error) {
        console.error('Update rider status error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update rider status',
            ...(process.env.NODE_ENV === 'development' && { error: error.message })
        });
    }
};

/**
 * Delete rider (soft delete)
 * @route DELETE /api/riders/:id
 */
const deleteRider = async (req, res) => {
    try {
        const { id } = req.params;

        const params = {
            TableName: RIDERS_TABLE,
            Key: { id },
            UpdateExpression: 'SET isActive = :isActive, updatedAt = :updatedAt',
            ExpressionAttributeValues: {
                ':isActive': false,
                ':updatedAt': new Date().toISOString()
            },
            ReturnValues: 'ALL_NEW'
        };

        await dynamoDB.update(params).promise();

        res.status(200).json({
            success: true,
            message: 'Rider deleted successfully'
        });

    } catch (error) {
        console.error('Delete rider error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete rider',
            ...(process.env.NODE_ENV === 'development' && { error: error.message })
        });
    }
};

/**
 * Get rider stats
 * @route GET /api/riders/stats
 */
const getRiderStats = async (req, res) => {
    try {
        const params = {
            TableName: RIDERS_TABLE,
            FilterExpression: 'isActive = :isActive',
            ExpressionAttributeValues: { ':isActive': true }
        };

        const result = await dynamoDB.scan(params).promise();
        const riders = result.Items || [];

        const stats = {
            total: riders.length,
            available: riders.filter(r => r.status === 'available').length,
            onDelivery: riders.filter(r => r.status === 'on-delivery').length,
            offline: riders.filter(r => r.status === 'offline').length,
            totalDeliveries: riders.reduce((sum, r) => sum + (r.totalDeliveries || 0), 0),
            avgRating: riders.length > 0
                ? (riders.reduce((sum, r) => sum + (r.rating || 0), 0) / riders.length).toFixed(1)
                : 0
        };

        res.status(200).json({
            success: true,
            data: stats
        });

    } catch (error) {
        console.error('Get rider stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch rider stats',
            ...(process.env.NODE_ENV === 'development' && { error: error.message })
        });
    }
};

/**
 * Get available riders
 * @route GET /api/riders/available
 */
const getAvailableRiders = async (req, res) => {
    try {
        const params = {
            TableName: RIDERS_TABLE,
            FilterExpression: '#status = :status AND isActive = :isActive',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: {
                ':status': 'available',
                ':isActive': true
            }
        };

        const result = await dynamoDB.scan(params).promise();

        res.status(200).json({
            success: true,
            data: {
                riders: result.Items || [],
                count: result.Count || 0
            }
        });

    } catch (error) {
        console.error('Get available riders error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch available riders',
            ...(process.env.NODE_ENV === 'development' && { error: error.message })
        });
    }
};

module.exports = {
    getAllRiders,
    getRiderById,
    createRider,
    updateRider,
    updateRiderStatus,
    deleteRider,
    getRiderStats,
    getAvailableRiders
};
