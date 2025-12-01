require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

// Import route handlers
const registerHandler = require('./src/register');
const loginHandler = require('./src/login');
const menuHandler = require('./src/menu');

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
    version: '1.0.0',
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

// Menu Routes
app.get('/api/menu', menuHandler.getAllMenuItems);
app.get('/api/menu/day/:day', menuHandler.getItemsByDay);
app.get('/api/menu/:id', menuHandler.getMenuItemById);
app.post('/api/menu', menuHandler.createMenuItem);
app.put('/api/menu/:id', menuHandler.updateMenuItem);
app.delete('/api/menu/:id', menuHandler.deleteMenuItem);

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
  console.log(`🚀 ${process.env.APP_NAME} API Server`);
  console.log(`📍 Environment: ${process.env.NODE_ENV}`);
  console.log(`🌐 Server running on port: ${PORT}`);
  console.log(`🗄️  Users Table: ${process.env.DYNAMODB_TABLE}`);
  console.log(`🍽️  Menu Table: ${process.env.DYNAMODB_MENU_TABLE}`);
  console.log(`🔗 API URL: http://localhost:${PORT}`);
  console.log('='.repeat(60));
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
  });
});

module.exports = app;
