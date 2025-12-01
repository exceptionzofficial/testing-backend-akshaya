const AWS = require('aws-sdk');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Configure AWS DynamoDB
const dynamoDB = new AWS.DynamoDB.DocumentClient({
  region: process.env.AWS_REGION,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

const TABLE_NAME = process.env.DYNAMODB_TABLE;

/**
 * Generate JWT Token
 */
const generateToken = (user) => {
  return jwt.sign(
    {
      phone: user.phone,
      name: user.name,
      role: user.role,
      email: user.email
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN }
  );
};

/**
 * Login user with phone number
 * @route POST /api/auth/login
 */
const loginHandler = async (req, res) => {
  try {
    const { phone, password } = req.body;

    // Validation
    if (!phone || !password) {
      return res.status(400).json({
        success: false,
        message: 'Phone number and password are required'
      });
    }

    // Validate phone number format
    if (!/^\d{10}$/.test(phone)) {
      return res.status(400).json({
        success: false,
        message: 'Phone number must be exactly 10 digits'
      });
    }

    // Get user by phone (primary key)
    const getUserParams = {
      TableName: TABLE_NAME,
      Key: { phone }
    };

    const result = await dynamoDB.get(getUserParams).promise();

    if (!result.Item) {
      return res.status(401).json({
        success: false,
        message: 'Invalid phone number or password'
      });
    }

    const user = result.Item;

    // Check if user is active
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been deactivated. Please contact support.'
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid phone number or password'
      });
    }

    // Update last login timestamp
    const updateParams = {
      TableName: TABLE_NAME,
      Key: { phone: user.phone },
      UpdateExpression: 'SET lastLogin = :lastLogin',
      ExpressionAttributeValues: {
        ':lastLogin': new Date().toISOString()
      }
    };

    await dynamoDB.update(updateParams).promise();

    // Generate JWT token
    const token = generateToken(user);

    // Remove password from response
    const { password: _, ...userWithoutPassword } = user;

    // Success response
    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user: userWithoutPassword,
        token
      }
    });

  } catch (error) {
    console.error('Login error:', error);

    if (error.code === 'ResourceNotFoundException') {
      return res.status(500).json({
        success: false,
        message: 'Database table not found. Please contact support.'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Login failed. Please try again.',
      ...(process.env.NODE_ENV === 'development' && { error: error.message })
    });
  }
};

module.exports = loginHandler;
