require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

// Import route handlers
const registerHandler = require('./src/register');
const loginHandler = require('./src/login');
const menuHandler = require('./src/menu');
const packagesHandler = require('./src/packages');
const singlesHandler = require('./src/singles');
const ordersHandler = require('./src/orders');
const ridersHandler = require('./src/riders');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS || '*',
  credentials: true
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Satvamirtham API Server is running',
    version: '2.0.0',
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Auth Routes
app.post('/api/auth/register', registerHandler);
app.post('/api/auth/login', loginHandler);

// Legacy Menu Routes (for backward compatibility)
app.get('/api/menu', menuHandler.getAllMenuItems);
app.get('/api/menu/day/:day', menuHandler.getItemsByDay);
app.get('/api/menu/:id', menuHandler.getMenuItemById);
app.post('/api/menu', menuHandler.createMenuItem);
app.put('/api/menu/:id', menuHandler.updateMenuItem);
app.delete('/api/menu/:id', menuHandler.deleteMenuItem);

// ============================================
// NEW ADMIN PANEL ROUTES
// ============================================

// Package Meals Routes
app.get('/api/packages', packagesHandler.getAllPackages);
app.get('/api/packages/day/:day', packagesHandler.getPackagesByDay);
app.get('/api/packages/:id', packagesHandler.getPackageById);
app.post('/api/packages', packagesHandler.createPackage);
app.put('/api/packages/:id', packagesHandler.updatePackage);
app.delete('/api/packages/:id', packagesHandler.deletePackage);

// Single Meals Routes
app.get('/api/singles/categories', singlesHandler.getCategories);
app.get('/api/singles', singlesHandler.getAllSingles);
app.get('/api/singles/category/:category', singlesHandler.getSinglesByCategory);
app.get('/api/singles/:id', singlesHandler.getSingleById);
app.post('/api/singles', singlesHandler.createSingle);
app.put('/api/singles/:id', singlesHandler.updateSingle);
app.patch('/api/singles/:id/visibility', singlesHandler.toggleVisibility);
app.delete('/api/singles/:id', singlesHandler.deleteSingle);

// Orders Routes
app.get('/api/orders/stats', ordersHandler.getOrderStats);
app.get('/api/orders', ordersHandler.getAllOrders);
app.get('/api/orders/status/:status', ordersHandler.getOrdersByStatus);
app.get('/api/orders/:id', ordersHandler.getOrderById);
app.post('/api/orders', ordersHandler.createOrder);
app.patch('/api/orders/:id/status', ordersHandler.updateOrderStatus);
app.patch('/api/orders/:id/assign', ordersHandler.assignRider);

// Riders Routes
app.get('/api/riders/stats', ridersHandler.getRiderStats);
app.get('/api/riders/available', ridersHandler.getAvailableRiders);
app.get('/api/riders', ridersHandler.getAllRiders);
app.get('/api/riders/:id', ridersHandler.getRiderById);
app.post('/api/riders', ridersHandler.createRider);
app.put('/api/riders/:id', ridersHandler.updateRider);
app.patch('/api/riders/:id/status', ridersHandler.updateRiderStatus);
app.delete('/api/riders/:id', ridersHandler.deleteRider);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    path: req.path
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Start server
app.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log(`🚀 ${process.env.APP_NAME} API Server v2.0`);
  console.log(`📍 Environment: ${process.env.NODE_ENV}`);
  console.log(`🌐 Server running on port: ${PORT}`);
  console.log(`🔗 API URL: http://localhost:${PORT}`);
  console.log('='.repeat(60));
  console.log('📦 Available Routes:');
  console.log('   - Auth: /api/auth/register, /api/auth/login');
  console.log('   - Packages: /api/packages');
  console.log('   - Singles: /api/singles');
  console.log('   - Orders: /api/orders');
  console.log('   - Riders: /api/riders');
  console.log('='.repeat(60));
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  process.exit(0);
});

module.exports = app;
