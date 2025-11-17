/**
 * Database Configuration Module
 * Manages MongoDB Atlas connection
 */

const { MongoClient } = require('mongodb');

class Database {
  constructor() {
    this.client = null;
    this.db = null;
  }

  async connect() {
    try {
      const MONGODB_URI = process.env.MONGODB_URI;
      const MONGODB_DATABASE = process.env.MONGODB_DATABASE || 'bvi';

      if (!MONGODB_URI) {
        throw new Error('MONGODB_URI environment variable is not set');
      }

      this.client = new MongoClient(MONGODB_URI);
      await this.client.connect();
      this.db = this.client.db(MONGODB_DATABASE);

      console.log(`✅ Connected to MongoDB Atlas: ${MONGODB_DATABASE}`);
      return this.db;
    } catch (error) {
      console.error('❌ MongoDB connection error:', error);
      throw error;
    }
  }

  getDB() {
    if (!this.db) {
      throw new Error('Database not connected. Call connect() first.');
    }
    return this.db;
  }

  async close() {
    if (this.client) {
      await this.client.close();
      console.log('Database connection closed');
    }
  }
}

module.exports = new Database();
