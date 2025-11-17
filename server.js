/**
 * BVI Social Listening Dashboard API
 * Express server with MongoDB Atlas connection
 * Meets client requirement: <3 second response time
 */

const express = require('express');
const { MongoClient } = require('mongodb');
const cors = require('cors');
const compression = require('compression');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(compression()); // Compress responses for faster load
app.use(express.json());

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DATABASE = process.env.MONGODB_DATABASE || 'bvi';

let db;
let client;

async function connectDB() {
  try {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db(MONGODB_DATABASE);
    console.log(`✅ Connected to MongoDB Atlas: ${MONGODB_DATABASE}`);
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
}

// Helper function to parse date filters
function buildDateFilter(startDate, endDate) {
  const filter = {};
  if (startDate || endDate) {
    filter.time = {};
    if (startDate) filter.time.$gte = new Date(startDate);
    if (endDate) filter.time.$lte = new Date(endDate);
  }
  return filter;
}

// ==================== API ENDPOINTS ====================

/**
 * GET /api/stats/overview
 * Dashboard overview stats (Day one requirement)
 */
app.get('/api/stats/overview', async (req, res) => {
  try {
    const collection = db.collection('clean_posts');

    const [
      totalPosts,
      sentimentDist,
      platformDist,
      avgEngagement
    ] = await Promise.all([
      // Total posts
      collection.countDocuments(),

      // Sentiment distribution
      collection.aggregate([
        { $group: { _id: '$sentiment', count: { $sum: 1 } } }
      ]).toArray(),

      // Platform distribution
      collection.aggregate([
        { $group: { _id: '$platform', count: { $sum: 1 } } }
      ]).toArray(),

      // Average engagement
      collection.aggregate([
        {
          $group: {
            _id: null,
            avgLikes: { $avg: '$likes' },
            avgShares: { $avg: '$shares' },
            avgComments: { $avg: '$comments' }
          }
        }
      ]).toArray()
    ]);

    res.json({
      totalPosts,
      sentiment: sentimentDist,
      platforms: platformDist,
      engagement: avgEngagement[0] || { avgLikes: 0, avgShares: 0, avgComments: 0 }
    });
  } catch (error) {
    console.error('Error in /api/stats/overview:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/posts
 * Get posts with filters (keyword, sentiment, date, account, platform)
 * Client requirement: All filters available
 */
app.get('/api/posts', async (req, res) => {
  try {
    const {
      keyword,
      sentiment,
      startDate,
      endDate,
      platform,
      sourceId,
      topic,
      limit = 50,
      skip = 0
    } = req.query;

    // Build filter
    const filter = {};

    if (keyword) {
      filter.$or = [
        { text: { $regex: keyword, $options: 'i' } },
        { combinedText: { $regex: keyword, $options: 'i' } }
      ];
    }

    if (sentiment) filter.sentiment = sentiment;
    if (platform) filter.platform = platform;
    if (sourceId) filter.sourceId = sourceId;
    if (topic) filter.topics = topic;

    // Date filter
    Object.assign(filter, buildDateFilter(startDate, endDate));

    const [posts, total] = await Promise.all([
      db.collection('clean_posts')
        .find(filter)
        .sort({ time: -1 })
        .limit(parseInt(limit))
        .skip(parseInt(skip))
        .toArray(),

      db.collection('clean_posts').countDocuments(filter)
    ]);

    res.json({ posts, total, page: Math.floor(skip / limit) + 1 });
  } catch (error) {
    console.error('Error in /api/posts:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/posts/export
 * Export posts to CSV (Client requirement)
 */
app.get('/api/posts/export', async (req, res) => {
  try {
    const { keyword, sentiment, startDate, endDate, platform, sourceId } = req.query;

    const filter = {};
    if (keyword) {
      filter.$or = [
        { text: { $regex: keyword, $options: 'i' } },
        { combinedText: { $regex: keyword, $options: 'i' } }
      ];
    }
    if (sentiment) filter.sentiment = sentiment;
    if (platform) filter.platform = platform;
    if (sourceId) filter.sourceId = sourceId;
    Object.assign(filter, buildDateFilter(startDate, endDate));

    const posts = await db.collection('clean_posts')
      .find(filter)
      .limit(10000) // Max 10k rows for CSV
      .toArray();

    // Convert to CSV
    const headers = ['Post ID', 'Platform', 'Source', 'Text', 'Sentiment', 'Confidence', 'Topics', 'Likes', 'Shares', 'Comments', 'Date'];
    const rows = posts.map(p => [
      p.postId,
      p.platform,
      p.sourceId,
      `"${(p.text || '').replace(/"/g, '""')}"`, // Escape quotes
      p.sentiment,
      p.sentimentConfidence,
      (p.topics || []).join(';'),
      p.likes || 0,
      p.shares || 0,
      p.comments || 0,
      p.time
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=bvi-social-listening.csv');
    res.send(csv);
  } catch (error) {
    console.error('Error in /api/posts/export:', error);
    res.status(500).json({ error: 'Export failed' });
  }
});

/**
 * GET /api/sentiment/distribution
 * Sentiment breakdown by source, time, topic
 */
app.get('/api/sentiment/distribution', async (req, res) => {
  try {
    const { startDate, endDate, groupBy = 'sentiment' } = req.query;

    const matchStage = buildDateFilter(startDate, endDate);

    let groupId;
    if (groupBy === 'source') {
      groupId = { sentiment: '$sentiment', source: '$sourceId' };
    } else if (groupBy === 'topic') {
      groupId = { sentiment: '$sentiment', topic: { $arrayElemAt: ['$topics', 0] } };
    } else {
      groupId = '$sentiment';
    }

    const distribution = await db.collection('clean_posts')
      .aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: groupId,
            count: { $sum: 1 },
            avgConfidence: { $avg: '$sentimentConfidence' }
          }
        },
        { $sort: { count: -1 } }
      ]).toArray();

    res.json(distribution);
  } catch (error) {
    console.error('Error in /api/sentiment/distribution:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/topics/distribution
 * Topic distribution
 */
app.get('/api/topics/distribution', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const matchStage = buildDateFilter(startDate, endDate);

    const topicDist = await db.collection('clean_posts')
      .aggregate([
        { $match: matchStage },
        { $unwind: '$topics' },
        {
          $group: {
            _id: '$topics',
            count: { $sum: 1 },
            avgEngagement: {
              $avg: { $add: ['$likes', '$shares', '$comments'] }
            }
          }
        },
        { $sort: { count: -1 } }
      ]).toArray();

    res.json(topicDist);
  } catch (error) {
    console.error('Error in /api/topics/distribution:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/influencers
 * Top influencers by engagement (Client requirement)
 */
app.get('/api/influencers', async (req, res) => {
  try {
    const { startDate, endDate, limit = 10 } = req.query;
    const matchStage = buildDateFilter(startDate, endDate);

    const influencers = await db.collection('clean_posts')
      .aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: '$sourceId',
            totalPosts: { $sum: 1 },
            totalLikes: { $sum: '$likes' },
            totalShares: { $sum: '$shares' },
            totalComments: { $sum: '$comments' },
            avgSentiment: { $avg: { $cond: [{ $eq: ['$sentiment', 'positive'] }, 1, { $cond: [{ $eq: ['$sentiment', 'negative'] }, -1, 0] }] } }
          }
        },
        {
          $addFields: {
            totalEngagement: { $add: ['$totalLikes', '$totalShares', '$totalComments'] }
          }
        },
        { $sort: { totalEngagement: -1 } },
        { $limit: parseInt(limit) }
      ]).toArray();

    res.json(influencers);
  } catch (error) {
    console.error('Error in /api/influencers:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/virality/early-signals
 * Early momentum detection (Client requirement: virality detection)
 */
app.get('/api/virality/early-signals', async (req, res) => {
  try {
    // Get posts from last 24 hours
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const recentPosts = await db.collection('clean_posts')
      .find({ time: { $gte: last24h } })
      .toArray();

    // Calculate engagement velocity (engagement per hour since post)
    const postsWithVelocity = recentPosts.map(post => {
      const hoursSincePost = (Date.now() - new Date(post.time).getTime()) / (1000 * 60 * 60);
      const totalEngagement = (post.likes || 0) + (post.shares || 0) + (post.comments || 0);
      const velocity = hoursSincePost > 0 ? totalEngagement / hoursSincePost : 0;

      return {
        ...post,
        velocity,
        hoursSincePost: hoursSincePost.toFixed(1)
      };
    });

    // Sort by velocity (highest first)
    postsWithVelocity.sort((a, b) => b.velocity - a.velocity);

    // Return top 10 viral candidates
    res.json(postsWithVelocity.slice(0, 10));
  } catch (error) {
    console.error('Error in /api/virality/early-signals:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/trends/timeline
 * Daily volume and sentiment timeline
 */
app.get('/api/trends/timeline', async (req, res) => {
  try {
    const { startDate, endDate, platform, topic } = req.query;

    const matchStage = buildDateFilter(startDate, endDate);
    if (platform) matchStage.platform = platform;
    if (topic) matchStage.topics = topic;

    const timeline = await db.collection('clean_posts')
      .aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: {
              date: { $dateToString: { format: '%Y-%m-%d', date: '$time' } },
              sentiment: '$sentiment'
            },
            count: { $sum: 1 }
          }
        },
        { $sort: { '_id.date': 1 } }
      ]).toArray();

    res.json(timeline);
  } catch (error) {
    console.error('Error in /api/trends/timeline:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/keywords/frequency
 * Keyword frequency analysis
 */
app.get('/api/keywords/frequency', async (req, res) => {
  try {
    const { startDate, endDate, limit = 20 } = req.query;
    const matchStage = buildDateFilter(startDate, endDate);

    const posts = await db.collection('clean_posts')
      .find(matchStage)
      .project({ combinedText: 1 })
      .toArray();

    // Simple word frequency (can be enhanced with NLP)
    const wordCount = {};
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been', 'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they']);

    posts.forEach(post => {
      const text = (post.combinedText || '').toLowerCase();
      const words = text.match(/\b[a-z]{3,}\b/g) || [];
      words.forEach(word => {
        if (!stopWords.has(word)) {
          wordCount[word] = (wordCount[word] || 0) + 1;
        }
      });
    });

    const keywords = Object.entries(wordCount)
      .map(([word, count]) => ({ word, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, parseInt(limit));

    res.json(keywords);
  } catch (error) {
    console.error('Error in /api/keywords/frequency:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/filters/options
 * Get available filter options for dropdowns
 */
app.get('/api/filters/options', async (req, res) => {
  try {
    const [sources, platforms, sentiments, topics] = await Promise.all([
      db.collection('clean_posts').distinct('sourceId'),
      db.collection('clean_posts').distinct('platform'),
      db.collection('clean_posts').distinct('sentiment'),
      db.collection('clean_posts').aggregate([
        { $unwind: '$topics' },
        { $group: { _id: '$topics' } }
      ]).toArray()
    ]);

    res.json({
      sources: sources.filter(Boolean),
      platforms: platforms.filter(Boolean),
      sentiments: sentiments.filter(Boolean),
      topics: topics.map(t => t._id).filter(Boolean)
    });
  } catch (error) {
    console.error('Error in /api/filters/options:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({ status: 'OK', database: db ? 'connected' : 'disconnected' });
});

// Start server
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 BVI Dashboard API running on port ${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
  });
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n⏸️  Shutting down gracefully...');
  if (client) await client.close();
  process.exit(0);
});
