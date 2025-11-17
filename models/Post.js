/**
 * Post Model
 * Data access layer for social media posts
 */

const database = require('../config/database');

class Post {
  static getCollection() {
    const db = database.getDB();
    return db.collection('clean_posts');
  }

  static async count(filter = {}) {
    return await this.getCollection().countDocuments(filter);
  }

  static async find(filter = {}, options = {}) {
    let query = this.getCollection().find(filter);

    if (options.sort) {
      query = query.sort(options.sort);
    }
    if (options.limit) {
      query = query.limit(options.limit);
    }
    if (options.skip) {
      query = query.skip(options.skip);
    }
    if (options.project) {
      query = query.project(options.project);
    }

    return await query.toArray();
  }

  static async aggregate(pipeline) {
    return await this.getCollection().aggregate(pipeline).toArray();
  }

  static async distinct(field) {
    return await this.getCollection().distinct(field);
  }

  static buildDateFilter(startDate, endDate) {
    const filter = {};
    if (startDate || endDate) {
      filter.time = {};
      if (startDate) filter.time.$gte = new Date(startDate);
      if (endDate) filter.time.$lte = new Date(endDate);
    }
    return filter;
  }

  static buildTextSearchFilter(keyword) {
    if (!keyword) return {};
    return {
      $or: [
        { text: { $regex: keyword, $options: 'i' } },
        { combinedText: { $regex: keyword, $options: 'i' } }
      ]
    };
  }
}

module.exports = Post;
