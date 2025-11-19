const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect('mongodb://localhost/quizpoker', {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    
    console.log(`MongoDB verbunden: ${conn.connection.host}`);
    
    // Event Listener für Verbindungsprobleme
    mongoose.connection.on('error', err => {
      console.error('MongoDB Verbindungsfehler:', err);
    });

    mongoose.connection.on('disconnected', () => {
      console.log('MongoDB Verbindung getrennt');
    });

    return conn;
  } catch (error) {
    console.error('Fehler beim Verbinden mit MongoDB:', error);
    process.exit(1);
  }
};

module.exports = connectDB; 