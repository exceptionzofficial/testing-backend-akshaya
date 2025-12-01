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
 * Register new user
 * @route POST /api/auth/register
 */
const registerHandler = async (req, res) => {
  try {
    const { name, email, phone, password, role } = req.body;

    // Validation - Phone is mandatory, email is optional
    if (!name || !phone || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name, phone, and password are required'
      });
    }

    // Validate phone number (10 digits)
    if (!/^\d{10}$/.test(phone)) {
      return res.status(400).json({
        success: false,
        message: 'Phone number must be exactly 10 digits'
      });
    }

    // Validate email format (if provided)
    if (email && !/\S+@\S+\.\S+/.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format'
      });
    }

    // Validate password length
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long'
      });
    }

    // Check if user already exists (phone is primary key)
    const existingUserParams = {
      TableName: TABLE_NAME,
      Key: { phone }
    };

    const existingUser = await dynamoDB.get(existingUserParams).promise();

    if (existingUser.Item) {
      return res.status(409).json({
        success: false,
        message: 'User with this phone number already exists'
      });
    }

    // Hash password
    const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create user object
    const newUser = {
      phone, // Primary key (mandatory)
      name,
      email: email || null, // Optional - for marketing only
      password: hashedPassword,
      role: role || 'user', // 'user' or 'rider'
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isActive: true,
      isVerified: false,
      profileImage: null,
      address: null,
      lastLogin: null
    };

    // Save to DynamoDB
    const putParams = {
      TableName: TABLE_NAME,
      Item: newUser,
      ConditionExpression: 'attribute_not_exists(phone)'
    };

    await dynamoDB.put(putParams).promise();

    // Generate JWT token
    const token = generateToken(newUser);

    // Remove password from response
    const { password: _, ...userWithoutPassword } = newUser;

    // Success response
    res.status(201).json({
      success: true,
      message: 'Registration successful',
      data: {
        user: userWithoutPassword,
        token
      }
    });

  } catch (error) {
    console.error('Registration error:', error);

    if (error.code === 'ConditionalCheckFailedException') {
      return res.status(409).json({
        success: false,
        message: 'User already exists'
      });
    }

    if (error.code === 'ResourceNotFoundException') {
      return res.status(500).json({
        success: false,
        message: 'Database table not found. Please contact support.'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Registration failed. Please try again.',
      ...(process.env.NODE_ENV === 'development' && { error: error.message })
    });
  }
};

module.exports = registerHandler;
