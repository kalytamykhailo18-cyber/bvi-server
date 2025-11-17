/**
 * Dashboard Controller
 * Business logic for dashboard endpoints
 */

const Post = require('../models/Post');

class DashboardController {
  // GET /api/stats/overview
  async getOverviewStats(req, res) {
    try {
      const [totalPosts, sentimentDist, platformDist, avgEngagement] = await Promise.all([
        Post.count(),
        Post.aggregate([{ $group: { _id: '$sentiment', count: { $sum: 1 } } }]),
        Post.aggregate([{ $group: { _id: '$platform', count: { $sum: 1 } } }]),
        Post.aggregate([{
          $group: {
            _id: null,
            avgLikes: { $avg: '$likes' },
            avgShares: { $avg: '$shares' },
            avgComments: { $avg: '$comments' }
          }
        }])
      ]);

      res.json({
        totalPosts,
        sentiment: sentimentDist,
        platforms: platformDist,
        engagement: avgEngagement[0] || { avgLikes: 0, avgShares: 0, avgComments: 0 }
      });
    } catch (error) {
      console.error('Error in getOverviewStats:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // GET /api/posts
  async getPosts(req, res) {
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
        Object.assign(filter, Post.buildTextSearchFilter(keyword));
      }
      if (sentiment) filter.sentiment = sentiment;
      if (platform) filter.platform = platform;
      if (sourceId) filter.sourceId = sourceId;
      if (topic) filter.topics = topic;

      Object.assign(filter, Post.buildDateFilter(startDate, endDate));

      const [posts, total] = await Promise.all([
        Post.find(filter, {
          sort: { time: -1 },
          limit: parseInt(limit),
          skip: parseInt(skip)
        }),
        Post.count(filter)
      ]);

      res.json({ posts, total, page: Math.floor(skip / limit) + 1 });
    } catch (error) {
      console.error('Error in getPosts:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // GET /api/posts/export
  async exportPosts(req, res) {
    try {
      const { keyword, sentiment, startDate, endDate, platform, sourceId } = req.query;

      const filter = {};
      if (keyword) Object.assign(filter, Post.buildTextSearchFilter(keyword));
      if (sentiment) filter.sentiment = sentiment;
      if (platform) filter.platform = platform;
      if (sourceId) filter.sourceId = sourceId;
      Object.assign(filter, Post.buildDateFilter(startDate, endDate));

      const posts = await Post.find(filter, { limit: 10000 });

      // Convert to CSV
      const headers = ['Post ID', 'Platform', 'Source', 'Text', 'Sentiment', 'Confidence', 'Topics', 'Likes', 'Shares', 'Comments', 'Date'];
      const rows = posts.map(p => [
        p.postId,
        p.platform,
        p.sourceId,
        `"${(p.text || '').replace(/"/g, '""')}"`,
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
      console.error('Error in exportPosts:', error);
      res.status(500).json({ error: 'Export failed' });
    }
  }

  // GET /api/sentiment/distribution
  async getSentimentDistribution(req, res) {
    try {
      const { startDate, endDate, groupBy = 'sentiment' } = req.query;
      const matchStage = Post.buildDateFilter(startDate, endDate);

      let groupId;
      if (groupBy === 'source') {
        groupId = { sentiment: '$sentiment', source: '$sourceId' };
      } else if (groupBy === 'topic') {
        groupId = { sentiment: '$sentiment', topic: { $arrayElemAt: ['$topics', 0] } };
      } else {
        groupId = '$sentiment';
      }

      const distribution = await Post.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: groupId,
            count: { $sum: 1 },
            avgConfidence: { $avg: '$sentimentConfidence' }
          }
        },
        { $sort: { count: -1 } }
      ]);

      res.json(distribution);
    } catch (error) {
      console.error('Error in getSentimentDistribution:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // GET /api/topics/distribution
  async getTopicsDistribution(req, res) {
    try {
      const { startDate, endDate } = req.query;
      const matchStage = Post.buildDateFilter(startDate, endDate);

      const topicDist = await Post.aggregate([
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
      ]);

      res.json(topicDist);
    } catch (error) {
      console.error('Error in getTopicsDistribution:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // GET /api/influencers
  async getInfluencers(req, res) {
    try {
      const { startDate, endDate, limit = 10 } = req.query;
      const matchStage = Post.buildDateFilter(startDate, endDate);

      const influencers = await Post.aggregate([
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
      ]);

      res.json(influencers);
    } catch (error) {
      console.error('Error in getInfluencers:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // GET /api/virality/early-signals
  async getViralitySignals(req, res) {
    try {
      const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recentPosts = await Post.find({ time: { $gte: last24h } });

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

      postsWithVelocity.sort((a, b) => b.velocity - a.velocity);
      res.json(postsWithVelocity.slice(0, 10));
    } catch (error) {
      console.error('Error in getViralitySignals:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // GET /api/trends/timeline
  async getTimeline(req, res) {
    try {
      const { startDate, endDate, platform, topic } = req.query;
      const matchStage = Post.buildDateFilter(startDate, endDate);

      if (platform) matchStage.platform = platform;
      if (topic) matchStage.topics = topic;

      const timeline = await Post.aggregate([
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
      ]);

      res.json(timeline);
    } catch (error) {
      console.error('Error in getTimeline:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // GET /api/keywords/frequency
  async getKeywordsFrequency(req, res) {
    try {
      const { startDate, endDate, limit = 20 } = req.query;
      const matchStage = Post.buildDateFilter(startDate, endDate);

      const posts = await Post.find(matchStage, { project: { combinedText: 1 } });

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
      console.error('Error in getKeywordsFrequency:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // GET /api/filters/options
  async getFilterOptions(req, res) {
    try {
      const [sources, platforms, sentiments, topics] = await Promise.all([
        Post.distinct('sourceId'),
        Post.distinct('platform'),
        Post.distinct('sentiment'),
        Post.aggregate([
          { $unwind: '$topics' },
          { $group: { _id: '$topics' } }
        ])
      ]);

      res.json({
        sources: sources.filter(Boolean),
        platforms: platforms.filter(Boolean),
        sentiments: sentiments.filter(Boolean),
        topics: topics.map(t => t._id).filter(Boolean)
      });
    } catch (error) {
      console.error('Error in getFilterOptions:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // GET /health
  async healthCheck(req, res) {
    const database = require('../config/database');
    res.json({
      status: 'OK',
      database: database.db ? 'connected' : 'disconnected'
    });
  }
}

module.exports = new DashboardController();
