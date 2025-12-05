const AWS = require('aws-sdk');

// Configure AWS DynamoDB
const dynamoDB = new AWS.DynamoDB.DocumentClient({
    region: process.env.AWS_REGION,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

const MENU_TABLE = process.env.DYNAMODB_MENU_TABLE;

// Valid categories for single meals
const VALID_CATEGORIES = [
    'Soups',
    'Classic Soups',
    'Traditional & Healthy Soups',
    'Salads',
    'International Salads',
    'Shutters Veg',
    'Starters & Snacks',
    'Chaat',
    'Sandwich',
    'Mojito',
    'Milk Shake',
    'Fresh Juices',
    'Falooda & Desserts'
];

/**
 * Get all single meal items
 * @route GET /api/singles
 */
const getAllSingles = async (req, res) => {
    try {
        const { includeHidden } = req.query;

        let filterExpression = '#type = :type AND isActive = :isActive';
        const expressionAttributeValues = {
            ':type': 'single',
            ':isActive': true
        };

        // If not admin view, only show visible items
        if (includeHidden !== 'true') {
            filterExpression += ' AND isVisible = :isVisible';
            expressionAttributeValues[':isVisible'] = true;
        }

        const params = {
            TableName: MENU_TABLE,
            FilterExpression: filterExpression,
            ExpressionAttributeNames: {
                '#type': 'type'
            },
            ExpressionAttributeValues: expressionAttributeValues
        };

        const result = await dynamoDB.scan(params).promise();

        res.status(200).json({
            success: true,
            message: 'Single items fetched successfully',
            data: {
                items: result.Items || [],
                count: result.Count || 0,
                categories: VALID_CATEGORIES
            }
        });

    } catch (error) {
        console.error('Get all singles error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch items',
            ...(process.env.NODE_ENV === 'development' && { error: error.message })
        });
    }
};

/**
 * Get single items by category
 * @route GET /api/singles/category/:category
 */
const getSinglesByCategory = async (req, res) => {
    try {
        const { category } = req.params;
        const { includeHidden } = req.query;

        let filterExpression = '#type = :type AND category = :category AND isActive = :isActive';
        const expressionAttributeValues = {
            ':type': 'single',
            ':category': category,
            ':isActive': true
        };

        if (includeHidden !== 'true') {
            filterExpression += ' AND isVisible = :isVisible';
            expressionAttributeValues[':isVisible'] = true;
        }

        const params = {
            TableName: MENU_TABLE,
            FilterExpression: filterExpression,
            ExpressionAttributeNames: {
                '#type': 'type'
            },
            ExpressionAttributeValues: expressionAttributeValues
        };

        const result = await dynamoDB.scan(params).promise();

        res.status(200).json({
            success: true,
            message: `Items in ${category} fetched successfully`,
            data: {
                category,
                items: result.Items || [],
                count: result.Count || 0
            }
        });

    } catch (error) {
        console.error('Get singles by category error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch items',
            ...(process.env.NODE_ENV === 'development' && { error: error.message })
        });
    }
};

/**
 * Get single item by ID
 * @route GET /api/singles/:id
 */
const getSingleById = async (req, res) => {
    try {
        const { id } = req.params;

        const params = {
            TableName: MENU_TABLE,
            Key: { id }
        };

        const result = await dynamoDB.get(params).promise();

        if (!result.Item || result.Item.type !== 'single') {
            return res.status(404).json({
                success: false,
                message: 'Item not found'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Item fetched successfully',
            data: result.Item
        });

    } catch (error) {
        console.error('Get single by ID error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch item',
            ...(process.env.NODE_ENV === 'development' && { error: error.message })
        });
    }
};

/**
 * Create new single item
 * @route POST /api/singles
 */
const createSingle = async (req, res) => {
    try {
        const {
            name,
            description,
            price,
            category,
            image,
            isVisible = true
        } = req.body;

        // Validation
        if (!name || !price || !category) {
            return res.status(400).json({
                success: false,
                message: 'Name, price, and category are required'
            });
        }

        // Validate category
        if (!VALID_CATEGORIES.includes(category)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid category. Valid categories: ' + VALID_CATEGORIES.join(', ')
            });
        }

        // Generate unique ID
        const id = `SNG${Date.now()}`;

        const singleItem = {
            id,
            type: 'single',
            name,
            description: description || '',
            price: parseFloat(price),
            category,
            image: image || 'https://via.placeholder.com/400',
            isVisible: isVisible !== false,
            isActive: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        const params = {
            TableName: MENU_TABLE,
            Item: singleItem
        };

        await dynamoDB.put(params).promise();

        res.status(201).json({
            success: true,
            message: 'Item created successfully',
            data: singleItem
        });

    } catch (error) {
        console.error('Create single error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create item',
            ...(process.env.NODE_ENV === 'development' && { error: error.message })
        });
    }
};

/**
 * Update single item
 * @route PUT /api/singles/:id
 */
const updateSingle = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        // Check if item exists
        const getParams = {
            TableName: MENU_TABLE,
            Key: { id }
        };

        const existing = await dynamoDB.get(getParams).promise();

        if (!existing.Item || existing.Item.type !== 'single') {
            return res.status(404).json({
                success: false,
                message: 'Item not found'
            });
        }

        // Validate category if provided
        if (updates.category && !VALID_CATEGORIES.includes(updates.category)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid category'
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
            message: 'Item updated successfully',
            data: result.Attributes
        });

    } catch (error) {
        console.error('Update single error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update item',
            ...(process.env.NODE_ENV === 'development' && { error: error.message })
        });
    }
};

/**
 * Toggle visibility of single item
 * @route PATCH /api/singles/:id/visibility
 */
const toggleVisibility = async (req, res) => {
    try {
        const { id } = req.params;
        const { isVisible } = req.body;

        // Check if item exists
        const getParams = {
            TableName: MENU_TABLE,
            Key: { id }
        };

        const existing = await dynamoDB.get(getParams).promise();

        if (!existing.Item || existing.Item.type !== 'single') {
            return res.status(404).json({
                success: false,
                message: 'Item not found'
            });
        }

        const newVisibility = isVisible !== undefined ? isVisible : !existing.Item.isVisible;

        const params = {
            TableName: MENU_TABLE,
            Key: { id },
            UpdateExpression: 'SET isVisible = :isVisible, updatedAt = :updatedAt',
            ExpressionAttributeValues: {
                ':isVisible': newVisibility,
                ':updatedAt': new Date().toISOString()
            },
            ReturnValues: 'ALL_NEW'
        };

        const result = await dynamoDB.update(params).promise();

        res.status(200).json({
            success: true,
            message: `Item ${newVisibility ? 'shown' : 'hidden'} successfully`,
            data: result.Attributes
        });

    } catch (error) {
        console.error('Toggle visibility error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to toggle visibility',
            ...(process.env.NODE_ENV === 'development' && { error: error.message })
        });
    }
};

/**
 * Delete single item (soft delete)
 * @route DELETE /api/singles/:id
 */
const deleteSingle = async (req, res) => {
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
            message: 'Item deleted successfully'
        });

    } catch (error) {
        console.error('Delete single error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete item',
            ...(process.env.NODE_ENV === 'development' && { error: error.message })
        });
    }
};

/**
 * Get all categories
 * @route GET /api/singles/categories
 */
const getCategories = async (req, res) => {
    res.status(200).json({
        success: true,
        data: {
            categories: VALID_CATEGORIES
        }
    });
};

module.exports = {
    getAllSingles,
    getSinglesByCategory,
    getSingleById,
    createSingle,
    updateSingle,
    toggleVisibility,
    deleteSingle,
    getCategories
};
