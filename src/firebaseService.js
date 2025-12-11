const admin = require('firebase-admin');
const path = require('path');
require('dotenv').config();

const initializeFirebase = () => {
    if (admin.apps.length > 0) {
        return; // Already initialized
    }

    let serviceAccount;

    // 1. Try Local File
    try {
        serviceAccount = require('../config/serviceAccountKey.json');
        console.log('Using local serviceAccountKey.json');
    } catch (err) {
        console.log('Local serviceAccountKey.json not found, checking environment variables...');
    }

    // 2. Try Environment Variables
    if (!serviceAccount) {
        const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = process.env;

        // Log presence of keys (not values) for debugging
        console.log('Checking Environment Variables:', {
            hasProjectId: !!FIREBASE_PROJECT_ID,
            hasClientEmail: !!FIREBASE_CLIENT_EMAIL,
            hasPrivateKey: !!FIREBASE_PRIVATE_KEY
        });

        if (FIREBASE_PROJECT_ID && FIREBASE_CLIENT_EMAIL && FIREBASE_PRIVATE_KEY) {
            console.log('Found Firebase Environment Variables');
            serviceAccount = {
                projectId: FIREBASE_PROJECT_ID,
                clientEmail: FIREBASE_CLIENT_EMAIL,
                privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            };
        } else {
            console.error('❌ Missing Firebase Environment Variables');
        }
    }

    if (serviceAccount) {
        try {
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
            console.log('✅ Firebase Admin Initialized Successfully');
        } catch (error) {
            console.error('❌ Firebase Admin Initialization Failed:', error);
        }
    } else {
        console.error('❌ Could not initialize Firebase: No credentials found (File or Env)');
    }
};

// Attempt initialization on load
initializeFirebase();

const sendNotificationToRider = async (fcmToken, title, body, data = {}) => {
    // Ensure initialized
    if (admin.apps.length === 0) {
        console.log('⚠️ Firebase not initialized. Attempting re-initialization...');
        initializeFirebase();
        if (admin.apps.length === 0) {
            console.error('❌ Cannot send notification: Firebase not initialized.');
            return null;
        }
    }

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
