const AWS = require('aws-sdk');

// Configure AWS DynamoDB
const dynamoDB = new AWS.DynamoDB.DocumentClient({
    region: process.env.AWS_REGION,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

const MENU_TABLE = process.env.DYNAMODB_MENU_TABLE;

/**
 * Get all package meals
 * @route GET /api/packages
 */
const getAllPackages = async (req, res) => {
    try {
        const params = {
            TableName: MENU_TABLE,
            FilterExpression: '#type = :type AND isActive = :isActive',
            ExpressionAttributeNames: {
                '#type': 'type'
            },
            ExpressionAttributeValues: {
                ':type': 'package',
                ':isActive': true
            }
        };

        const result = await dynamoDB.scan(params).promise();

        res.status(200).json({
            success: true,
            message: 'Packages fetched successfully',
            data: {
                packages: result.Items || [],
                count: result.Count || 0
            }
        });

    } catch (error) {
        console.error('Get all packages error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch packages',
            ...(process.env.NODE_ENV === 'development' && { error: error.message })
        });
    }
};

/**
 * Get packages by day
 * @route GET /api/packages/day/:day
 */
const getPackagesByDay = async (req, res) => {
    try {
        const { day } = req.params;
        const { mealType } = req.query;

        let filterExpression = '#type = :type AND #day = :day AND isActive = :isActive';
        const expressionAttributeNames = {
            '#type': 'type',
            '#day': 'day'
        };
        const expressionAttributeValues = {
            ':type': 'package',
            ':day': day,
            ':isActive': true
        };

        if (mealType && mealType !== 'all') {
            filterExpression += ' AND mealType = :mealType';
            expressionAttributeValues[':mealType'] = mealType;
        }

        const params = {
            TableName: MENU_TABLE,
            FilterExpression: filterExpression,
            ExpressionAttributeNames: expressionAttributeNames,
            ExpressionAttributeValues: expressionAttributeValues
        };

        const result = await dynamoDB.scan(params).promise();

        res.status(200).json({
            success: true,
            message: `Packages for ${day} fetched successfully`,
            data: {
                day,
                packages: result.Items || [],
                count: result.Count || 0
            }
        });

    } catch (error) {
        console.error('Get packages by day error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch packages',
            ...(process.env.NODE_ENV === 'development' && { error: error.message })
        });
    }
};

/**
 * Get single package by ID
 * @route GET /api/packages/:id
 */
const getPackageById = async (req, res) => {
    try {
        const { id } = req.params;

        const params = {
            TableName: MENU_TABLE,
            Key: { id }
        };

        const result = await dynamoDB.get(params).promise();

        if (!result.Item || result.Item.type !== 'package') {
            return res.status(404).json({
                success: false,
                message: 'Package not found'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Package fetched successfully',
            data: result.Item
        });

    } catch (error) {
        console.error('Get package by ID error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch package',
            ...(process.env.NODE_ENV === 'development' && { error: error.message })
        });
    }
};

/**
 * Create new package
 * @route POST /api/packages
 */
const createPackage = async (req, res) => {
    try {
        const {
            name,
            description,
            price,
            day,
            mealType,
            items,
            image
        } = req.body;

        // Validation
        if (!name || !price || !day || !mealType || !items || items.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Name, price, day, mealType, and items are required'
            });
        }

        // Validate day
        const validDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
        if (!validDays.includes(day)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid day'
            });
        }

        // Validate mealType
        const validMealTypes = ['breakfast', 'lunch', 'dinner'];
        if (!validMealTypes.includes(mealType)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid meal type'
            });
        }

        // Generate unique ID
        const id = `PKG${Date.now()}`;

        const packageItem = {
            id,
            type: 'package',
            name,
            description: description || '',
            price: parseFloat(price),
            day,
            mealType,
            items: items || [],
            image: image || 'https://via.placeholder.com/400',
            isActive: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        const params = {
            TableName: MENU_TABLE,
            Item: packageItem
        };

        await dynamoDB.put(params).promise();

        res.status(201).json({
            success: true,
            message: 'Package created successfully',
            data: packageItem
        });

    } catch (error) {
        console.error('Create package error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create package',
            ...(process.env.NODE_ENV === 'development' && { error: error.message })
        });
    }
};

/**
 * Update package
 * @route PUT /api/packages/:id
 */
const updatePackage = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        // Check if package exists
        const getParams = {
            TableName: MENU_TABLE,
            Key: { id }
        };

        const existing = await dynamoDB.get(getParams).promise();

        if (!existing.Item || existing.Item.type !== 'package') {
            return res.status(404).json({
                success: false,
                message: 'Package not found'
            });
        }

        // Build update expression
        let updateExpression = 'SET updatedAt = :updatedAt';
        const expressionAttributeValues = {
            ':updatedAt': new Date().toISOString()
        };
        const expressionAttributeNames = {};

        Object.keys(updates).forEach((key) => {
            if (key !== 'id' && key !== 'type') {
                updateExpression += `, #${key} = :${key}`;
                expressionAttributeNames[`#${key}`] = key;
                expressionAttributeValues[`:${key}`] = updates[key];
            }
        });

        const updateParams = {
            TableName: MENU_TABLE,
            Key: { id },
            UpdateExpression: updateExpression,
            ExpressionAttributeNames: expressionAttributeNames,
            ExpressionAttributeValues: expressionAttributeValues,
            ReturnValues: 'ALL_NEW'
        };

        const result = await dynamoDB.update(updateParams).promise();

        res.status(200).json({
            success: true,
            message: 'Package updated successfully',
            data: result.Attributes
        });

    } catch (error) {
        console.error('Update package error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update package',
            ...(process.env.NODE_ENV === 'development' && { error: error.message })
        });
    }
};

/**
 * Delete package (soft delete)
 * @route DELETE /api/packages/:id
 */
const deletePackage = async (req, res) => {
    try {
        const { id } = req.params;

        const params = {
            TableName: MENU_TABLE,
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
            message: 'Package deleted successfully'
        });

    } catch (error) {
        console.error('Delete package error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete package',
            ...(process.env.NODE_ENV === 'development' && { error: error.message })
        });
    }
};

module.exports = {
    getAllPackages,
    getPackagesByDay,
    getPackageById,
    createPackage,
    updatePackage,
    deletePackage
};
