require('dotenv').config();
const mongoose = require('mongoose');
const GameSession = require('./src/models/GameSession');

async function clearDatabase() {
    try {
        await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });

        console.log('Connected to MongoDB');

        const result = await GameSession.deleteMany({});
        console.log(`Deleted ${result.deletedCount} game sessions`);

        await mongoose.connection.close();
        console.log('Database cleared successfully');
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

clearDatabase();
