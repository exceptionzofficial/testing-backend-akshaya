const AWS = require('aws-sdk');
require('dotenv').config({ path: '../.env' }); // Load from backend root .env

// Configure AWS
AWS.config.update({
    region: process.env.AWS_REGION || 'ap-south-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

const dynamoDB = new AWS.DynamoDB();

const ORDERS_TABLE = process.env.DYNAMODB_ORDERS_TABLE || 'satvamirtham-orders';
const RIDERS_TABLE = process.env.DYNAMODB_RIDERS_TABLE || 'satvamirtham-riders';

const createTable = async (tableName) => {
    const params = {
        TableName: tableName,
        KeySchema: [
            { AttributeName: 'id', KeyType: 'HASH' } // Partition key
        ],
        AttributeDefinitions: [
            { AttributeName: 'id', AttributeType: 'S' }
        ],
        ProvisionedThroughput: {
            ReadCapacityUnits: 5,
            WriteCapacityUnits: 5
        }
    };

    try {
        await dynamoDB.createTable(params).promise();
        console.log(`✅ Table "${tableName}" created successfully.`);
    } catch (error) {
        if (error.code === 'ResourceInUseException') {
            console.log(`⚠️ Table "${tableName}" already exists.`);
        } else {
            console.error(`❌ Error creating table "${tableName}":`, error);
        }
    }
};

const init = async () => {
    console.log('🚀 Initializing DynamoDB Tables...');
    await createTable(ORDERS_TABLE);
    await createTable(RIDERS_TABLE);
    console.log('🎉 Initialization complete.');
};

init();
