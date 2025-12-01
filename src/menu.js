const AWS = require('aws-sdk');

// Configure AWS DynamoDB
const dynamoDB = new AWS.DynamoDB.DocumentClient({
  region: process.env.AWS_REGION,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

const MENU_TABLE = process.env.DYNAMODB_MENU_TABLE;

/**
 * Get all menu items
 * @route GET /api/menu
 */
const getAllMenuItems = async (req, res) => {
  try {
    const { limit = 100, lastKey } = req.query;

    const params = {
      TableName: MENU_TABLE,
      Limit: parseInt(limit)
    };

    if (lastKey) {
      params.ExclusiveStartKey = JSON.parse(decodeURIComponent(lastKey));
    }

    const result = await dynamoDB.scan(params).promise();

    res.status(200).json({
      success: true,
      message: 'Menu items fetched successfully',
      data: {
        items: result.Items || [],
        count: result.Count || 0,
        lastKey: result.LastEvaluatedKey
          ? encodeURIComponent(JSON.stringify(result.LastEvaluatedKey))
          : null
      }
    });

  } catch (error) {
    console.error('Get all menu items error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch menu items',
      ...(process.env.NODE_ENV === 'development' && { error: error.message })
    });
  }
};

/**
 * Get menu items by day
 * @route GET /api/menu/day/:day
 */
const getItemsByDay = async (req, res) => {
  try {
    const { day } = req.params;

    const params = {
      TableName: MENU_TABLE,
      FilterExpression: '#day = :day AND isActive = :isActive',
      ExpressionAttributeNames: {
        '#day': 'day'
      },
      ExpressionAttributeValues: {
        ':day': day,
        ':isActive': true
      }
    };

    const result = await dynamoDB.scan(params).promise();

    res.status(200).json({
      success: true,
      message: `Items for ${day} fetched successfully`,
      data: {
        day,
        items: result.Items || [],
        count: result.Count || 0
      }
    });

  } catch (error) {
    console.error('Get items by day error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch items by day',
      ...(process.env.NODE_ENV === 'development' && { error: error.message })
    });
  }
};

/**
 * Get menu items by day and meal type
 * @route GET /api/menu/day/:day/meal/:mealType
 */
const getItemsByDayAndMeal = async (req, res) => {
  try {
    const { day, mealType } = req.params;

    const params = {
      TableName: MENU_TABLE,
      FilterExpression: '#day = :day AND mealType = :mealType AND isActive = :isActive',
      ExpressionAttributeNames: {
        '#day': 'day'
      },
      ExpressionAttributeValues: {
        ':day': day,
        ':mealType': mealType,
        ':isActive': true
      }
    };

    const result = await dynamoDB.scan(params).promise();

    res.status(200).json({
      success: true,
      message: `${mealType} items for ${day} fetched successfully`,
      data: {
        day,
        mealType,
        items: result.Items || [],
        count: result.Count || 0
      }
    });

  } catch (error) {
    console.error('Get items by day and meal error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch items',
      ...(process.env.NODE_ENV === 'development' && { error: error.message })
    });
  }
};

/**
 * Get single menu item by ID
 * @route GET /api/menu/:id
 */
const getMenuItemById = async (req, res) => {
  try {
    const { id } = req.params;

    const params = {
      TableName: MENU_TABLE,
      Key: { id }
    };

    const result = await dynamoDB.get(params).promise();

    if (!result.Item) {
      return res.status(404).json({
        success: false,
        message: 'Menu item not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Menu item fetched successfully',
      data: result.Item
    });

  } catch (error) {
    console.error('Get menu item by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch menu item',
      ...(process.env.NODE_ENV === 'development' && { error: error.message })
    });
  }
};

/**
 * Create new menu item
 * @route POST /api/menu
 */
const createMenuItem = async (req, res) => {
  try {
    const {
      name,
      description,
      price,
      day,
      mealType,
      image,
      rating
    } = req.body;

    // Validation
    if (!name || !price || !day) {
      return res.status(400).json({
        success: false,
        message: 'Name, price, and day are required'
      });
    }

    // Validate day
    const validDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    if (!validDays.includes(day)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid day. Must be one of: ' + validDays.join(', ')
      });
    }

    // Generate unique ID
    const id = `MENU${Date.now()}`;

    const menuItem = {
      id, // Primary key
      name,
      description: description || '',
      price: parseFloat(price),
      day, // Monday to Sunday
      image: image || 'https://via.placeholder.com/400',
      rating: parseFloat(rating) || 4.5,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const params = {
      TableName: MENU_TABLE,
      Item: menuItem,
      ConditionExpression: 'attribute_not_exists(id)'
    };

    await dynamoDB.put(params).promise();

    res.status(201).json({
      success: true,
      message: 'Menu item created successfully',
      data: menuItem
    });

  } catch (error) {
    console.error('Create menu item error:', error);

    if (error.code === 'ConditionalCheckFailedException') {
      return res.status(409).json({
        success: false,
        message: 'Menu item already exists'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to create menu item',
      ...(process.env.NODE_ENV === 'development' && { error: error.message })
    });
  }
};

/**
 * Update menu item
 * @route PUT /api/menu/:id
 */
const updateMenuItem = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Check if item exists
    const getParams = {
      TableName: MENU_TABLE,
      Key: { id }
    };

    const existing = await dynamoDB.get(getParams).promise();

    if (!existing.Item) {
      return res.status(404).json({
        success: false,
        message: 'Menu item not found'
      });
    }

    // Validate day if provided
    if (updates.day) {
      const validDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
      if (!validDays.includes(updates.day)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid day'
        });
      }
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
      message: 'Menu item updated successfully',
      data: result.Attributes
    });

  } catch (error) {
    console.error('Update menu item error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update menu item',
      ...(process.env.NODE_ENV === 'development' && { error: error.message })
    });
  }
};

/**
 * Delete menu item (soft delete)
 * @route DELETE /api/menu/:id
 */
const deleteMenuItem = async (req, res) => {
  try {
    const { id } = req.params;

    // Soft delete - just mark as inactive
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

    const result = await dynamoDB.update(params).promise();

    res.status(200).json({
      success: true,
      message: 'Menu item deleted successfully',
      data: result.Attributes
    });

  } catch (error) {
    console.error('Delete menu item error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete menu item',
      ...(process.env.NODE_ENV === 'development' && { error: error.message })
    });
  }
};

module.exports = {
  getAllMenuItems,
  getItemsByDay,
  getItemsByDayAndMeal,
  getMenuItemById,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem
};
