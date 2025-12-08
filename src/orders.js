const AWS = require('aws-sdk');

// Configure AWS DynamoDB
const dynamoDB = new AWS.DynamoDB.DocumentClient({
    region: process.env.AWS_REGION,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

const ORDERS_TABLE = process.env.DYNAMODB_ORDERS_TABLE || 'satvamirtham-orders';

// Valid order statuses
const ORDER_STATUSES = ['placed', 'inProgress', 'delivered', 'cancelled'];

/**
 * Get all orders
 * @route GET /api/orders
 */
const getAllOrders = async (req, res) => {
    try {
        const { limit = 100, status, phone } = req.query;

        let params = {
            TableName: ORDERS_TABLE,
            Limit: parseInt(limit)
        };

        const filterExpressions = [];
        const expressionAttributeNames = {};
        const expressionAttributeValues = {};

        if (status && ORDER_STATUSES.includes(status)) {
            filterExpressions.push('#status = :status');
            expressionAttributeNames['#status'] = 'status';
            expressionAttributeValues[':status'] = status;
        }

        if (phone) {
            filterExpressions.push('customer.phone = :phone');
            expressionAttributeValues[':phone'] = phone;
        }

        if (filterExpressions.length > 0) {
            params.FilterExpression = filterExpressions.join(' AND ');
            if (Object.keys(expressionAttributeNames).length > 0) {
                params.ExpressionAttributeNames = expressionAttributeNames;
            }
            params.ExpressionAttributeValues = expressionAttributeValues;
        }

        const result = await dynamoDB.scan(params).promise();

        // Sort by createdAt descending
        const sortedItems = (result.Items || []).sort((a, b) =>
            new Date(b.createdAt) - new Date(a.createdAt)
        );

        res.status(200).json({
            success: true,
            message: 'Orders fetched successfully',
            data: {
                orders: sortedItems,
                count: result.Count || 0,
                statuses: ORDER_STATUSES
            }
        });

    } catch (error) {
        console.error('Get all orders error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch orders',
            ...(process.env.NODE_ENV === 'development' && { error: error.message })
        });
    }
};

/**
 * Get orders by status
 * @route GET /api/orders/status/:status
 */
const getOrdersByStatus = async (req, res) => {
    try {
        const { status } = req.params;

        if (!ORDER_STATUSES.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid status. Valid statuses: ' + ORDER_STATUSES.join(', ')
            });
        }

        const params = {
            TableName: ORDERS_TABLE,
            FilterExpression: '#status = :status',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: { ':status': status }
        };

        const result = await dynamoDB.scan(params).promise();

        // Sort by createdAt descending
        const sortedItems = (result.Items || []).sort((a, b) =>
            new Date(b.createdAt) - new Date(a.createdAt)
        );

        res.status(200).json({
            success: true,
            message: `${status} orders fetched successfully`,
            data: {
                status,
                orders: sortedItems,
                count: result.Count || 0
            }
        });

    } catch (error) {
        console.error('Get orders by status error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch orders',
            ...(process.env.NODE_ENV === 'development' && { error: error.message })
        });
    }
};

/**
 * Get single order by ID
 * @route GET /api/orders/:id
 */
const getOrderById = async (req, res) => {
    try {
        const { id } = req.params;

        const params = {
            TableName: ORDERS_TABLE,
            Key: { id }
        };

        const result = await dynamoDB.get(params).promise();

        if (!result.Item) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Order fetched successfully',
            data: result.Item
        });

    } catch (error) {
        console.error('Get order by ID error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch order',
            ...(process.env.NODE_ENV === 'development' && { error: error.message })
        });
    }
};

/**
 * Create new order
 * @route POST /api/orders
 */
const createOrder = async (req, res) => {
    try {
        const {
            items,
            customer,
            totalAmount,
            paymentMethod,
            deliveryAddress,
            notes
        } = req.body;

        // Validation
        if (!items || !customer || !totalAmount) {
            return res.status(400).json({
                success: false,
                message: 'Items, customer info, and total amount are required'
            });
        }

        if (!customer.name || !customer.phone) {
            return res.status(400).json({
                success: false,
                message: 'Customer name and phone are required'
            });
        }

        // Generate unique ID
        const id = `ORD${Date.now()}`;

        const order = {
            id,
            items: items || [],
            customer: {
                name: customer.name,
                phone: customer.phone,
                email: customer.email || '',
                address: customer.address || deliveryAddress || ''
            },
            status: 'placed',
            riderId: null,
            riderName: null,
            totalAmount: parseFloat(totalAmount),
            paymentMethod: paymentMethod || 'Cash',
            notes: notes || '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            deliveredAt: null
        };

        const params = {
            TableName: ORDERS_TABLE,
            Item: order
        };

        await dynamoDB.put(params).promise();

        res.status(201).json({
            success: true,
            message: 'Order created successfully',
            data: order
        });

    } catch (error) {
        console.error('Create order error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create order',
            ...(process.env.NODE_ENV === 'development' && { error: error.message })
        });
    }
};

/**
 * Update order status
 * @route PATCH /api/orders/:id/status
 */
const updateOrderStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!ORDER_STATUSES.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid status'
            });
        }

        // Check if order exists
        const getParams = {
            TableName: ORDERS_TABLE,
            Key: { id }
        };

        const existing = await dynamoDB.get(getParams).promise();

        if (!existing.Item) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        let updateExpression = 'SET #status = :status, updatedAt = :updatedAt';
        const expressionAttributeValues = {
            ':status': status,
            ':updatedAt': new Date().toISOString()
        };

        // If delivered, add deliveredAt timestamp
        if (status === 'delivered') {
            updateExpression += ', deliveredAt = :deliveredAt';
            expressionAttributeValues[':deliveredAt'] = new Date().toISOString();
        }

        const params = {
            TableName: ORDERS_TABLE,
            Key: { id },
            UpdateExpression: updateExpression,
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: expressionAttributeValues,
            ReturnValues: 'ALL_NEW'
        };

        const result = await dynamoDB.update(params).promise();

        res.status(200).json({
            success: true,
            message: `Order status updated to ${status}`,
            data: result.Attributes
        });

    } catch (error) {
        console.error('Update order status error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update order status',
            ...(process.env.NODE_ENV === 'development' && { error: error.message })
        });
    }
};

/**
 * Assign rider to order
 * @route PATCH /api/orders/:id/assign
 */
const assignRider = async (req, res) => {
    try {
        const { id } = req.params;
        const { riderId, riderName } = req.body;

        if (!riderId) {
            return res.status(400).json({
                success: false,
                message: 'Rider ID is required'
            });
        }

        // Check if order exists
        const getParams = {
            TableName: ORDERS_TABLE,
            Key: { id }
        };

        const existing = await dynamoDB.get(getParams).promise();

        if (!existing.Item) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        const params = {
            TableName: ORDERS_TABLE,
            Key: { id },
            UpdateExpression: 'SET riderId = :riderId, riderName = :riderName, #status = :status, updatedAt = :updatedAt',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: {
                ':riderId': riderId,
                ':riderName': riderName || 'Assigned Rider',
                ':status': 'inProgress',
                ':updatedAt': new Date().toISOString()
            },
            ReturnValues: 'ALL_NEW'
        };

        const result = await dynamoDB.update(params).promise();

        res.status(200).json({
            success: true,
            message: 'Rider assigned successfully',
            data: result.Attributes
        });

    } catch (error) {
        console.error('Assign rider error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to assign rider',
            ...(process.env.NODE_ENV === 'development' && { error: error.message })
        });
    }
};

/**
 * Get order stats
 * @route GET /api/orders/stats
 */
const getOrderStats = async (req, res) => {
    try {
        const params = {
            TableName: ORDERS_TABLE
        };

        const result = await dynamoDB.scan(params).promise();
        const orders = result.Items || [];

        // Calculate stats
        const today = new Date().toISOString().split('T')[0];
        const todayOrders = orders.filter(o => o.createdAt && o.createdAt.startsWith(today));

        const stats = {
            total: orders.length,
            placed: orders.filter(o => o.status === 'placed').length,
            inProgress: orders.filter(o => o.status === 'inProgress').length,
            delivered: orders.filter(o => o.status === 'delivered').length,
            cancelled: orders.filter(o => o.status === 'cancelled').length,
            todayCount: todayOrders.length,
            todayRevenue: todayOrders
                .filter(o => o.status === 'delivered')
                .reduce((sum, o) => sum + (o.totalAmount || 0), 0)
        };

        res.status(200).json({
            success: true,
            data: stats
        });

    } catch (error) {
        console.error('Get order stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch order stats',
            ...(process.env.NODE_ENV === 'development' && { error: error.message })
        });
    }
};

module.exports = {
    getAllOrders,
    getOrdersByStatus,
    getOrderById,
    createOrder,
    updateOrderStatus,
    assignRider,
    getOrderStats
};
