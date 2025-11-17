/**
 * API Routes
 * All dashboard endpoint definitions
 */

const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');

// Stats
router.get('/stats/overview', dashboardController.getOverviewStats);

// Posts
router.get('/posts', dashboardController.getPosts);
router.get('/posts/export', dashboardController.exportPosts);

// Sentiment
router.get('/sentiment/distribution', dashboardController.getSentimentDistribution);

// Topics
router.get('/topics/distribution', dashboardController.getTopicsDistribution);

// Influencers
router.get('/influencers', dashboardController.getInfluencers);

// Virality
router.get('/virality/early-signals', dashboardController.getViralitySignals);

// Trends
router.get('/trends/timeline', dashboardController.getTimeline);

// Keywords
router.get('/keywords/frequency', dashboardController.getKeywordsFrequency);

// Filters
router.get('/filters/options', dashboardController.getFilterOptions);

module.exports = router;
