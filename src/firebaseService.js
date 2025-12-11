const admin = require('firebase-admin');
const path = require('path');
require('dotenv').config();

let serviceAccount;

try {
    // Try to require the file first (Local Dev)
    // Using try/catch for the require itself
    try {
        serviceAccount = require('../config/serviceAccountKey.json');
    } catch (err) {
        // File not found, ignore
    }

    // If no file, check env vars (Production / Vercel)
    if (!serviceAccount && process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
        console.log('Using Environment Variables for Firebase Config');
        serviceAccount = {
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        };
    }

    if (serviceAccount) {
        if (admin.apps.length === 0) {
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
            console.log('Firebase Admin Initialized Successfully');
        }
    } else {
        console.warn('⚠️ Firebase credentials not found. Notification service will not work.');
        console.warn('Set FIREBASE_PRIVATE_KEY and FIREBASE_CLIENT_EMAIL env vars or provide config/serviceAccountKey.json');
    }
} catch (error) {
    console.error('Firebase Admin Initialization Error:', error);
}

const sendNotificationToRider = async (fcmToken, title, body, data = {}) => {
    if (!fcmToken) {
        console.warn('No FCM token provided for notification');
        return null;
    }

    try {
        console.log(`Sending notification to rider: "${title}"`);

        const message = {
            notification: {
                title,
                body,
            },
            data: {
                ...data,
                click_action: 'FLUTTER_NOTIFICATION_CLICK',
                timestamp: new Date().toISOString(),
            },
            token: fcmToken,
            android: {
                priority: 'high',
                notification: {
                    sound: 'default',
                    channelId: 'orders_channel',
                    clickAction: 'FLUTTER_NOTIFICATION_CLICK',
                },
                ttl: 3600, // 1 hour
            },
            apns: {
                headers: {
                    'apns-priority': '10',
                },
                payload: {
                    aps: {
                        alert: {
                            title,
                            body,
                        },
                        sound: 'default',
                        'content-available': 1,
                    },
                },
            },
        };

        const response = await admin.messaging().send(message);
        console.log('✅ Notification sent successfully:', response);
        return response;
    } catch (error) {
        console.error('❌ Error sending notification:', error.message);
        return null;
    }
};

module.exports = {
    admin,
    sendNotificationToRider
};
