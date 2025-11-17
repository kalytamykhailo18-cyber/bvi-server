/**
 * BVI Social Listening Dashboard API
 * Express server with MongoDB Atlas connection
 * MVC Architecture
 * Meets client requirement: <3 second response time
 */

const express = require('express');
const cors = require('cors');
const compression = require('compression');
require('dotenv').config();

const database = require('./config/database');
const apiRoutes = require('./routes/api');
const dashboardController = require('./controllers/dashboardController');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(compression());
app.use(express.json());

// API Routes
app.use('/api', apiRoutes);

// Health check endpoint
app.get('/health', dashboardController.healthCheck);

// Start server
database.connect().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 BVI Dashboard API running on port ${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
  });
}).catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n⏸️  Shutting down gracefully...');
  await database.close();
  process.exit(0);
});
