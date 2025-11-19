require('dotenv').config();
const mongoose = require('mongoose');
const Question = require('./models/Question');
const { logError } = require('./utils/logger');

const questions = [
  {
    question: "Wie viele Einwohner hat Deutschland?",
    answer: "83200000",
    hints: [
      "Es sind mehr als 80 Millionen.",
      "Die Zahl liegt zwischen 80 und 90 Millionen."
    ],
    category: "Allgemein",
    difficulty: "mittel"
  },
  {
    question: "Wie viele Kilometer ist die Erde vom Mond entfernt?",
    answer: "384400",
    hints: [
      "Die Entfernung liegt zwischen 300.000 und 400.000 Kilometern.",
      "Die genaue Entfernung beträgt 384.400 Kilometer."
    ],
    category: "Wissenschaft",
    difficulty: "schwer"
  },
  {
    question: "Wie viele Tage hat ein Jahr?",
    answer: "365",
    hints: [
      "Es sind mehr als 360 Tage.",
      "Die genaue Anzahl beträgt 365 Tage."
    ],
    category: "Allgemein",
    difficulty: "leicht"
  },
  {
    question: "Wie viele Knochen hat ein erwachsener Mensch?",
    answer: "206",
    hints: [
      "Die Anzahl liegt zwischen 200 und 210.",
      "Ein Erwachsener hat genau 206 Knochen."
    ],
    category: "Wissenschaft",
    difficulty: "mittel"
  },
  {
    question: "Wie viele Zähne hat ein erwachsener Mensch?",
    answer: "32",
    hints: [
      "Die Anzahl liegt zwischen 30 und 35.",
      "Ein Erwachsener hat normalerweise 32 Zähne."
    ],
    category: "Wissenschaft",
    difficulty: "leicht"
  },
  {
    question: "In welchem Jahr wurde die Berliner Mauer gebaut?",
    answer: "1961",
    hints: [
      "Es war in den 1960er Jahren.",
      "Es war im Jahr 1961."
    ],
    category: "Geschichte",
    difficulty: "mittel"
  },
  {
    question: "Wie viele Bundesländer hat Deutschland?",
    answer: "16",
    hints: [
      "Es sind mehr als 10.",
      "Die Zahl liegt zwischen 15 und 17."
    ],
    category: "Geographie",
    difficulty: "leicht"
  },
  {
    question: "Wie hoch ist der Mount Everest in Metern?",
    answer: "8848",
    hints: [
      "Er ist höher als 8000 Meter.",
      "Die Höhe liegt zwischen 8800 und 8900 Metern."
    ],
    category: "Geographie",
    difficulty: "mittel"
  },
  {
    question: "Wie viele Spieler hat eine Fußballmannschaft auf dem Feld?",
    answer: "11",
    hints: [
      "Es sind mehr als 10 Spieler.",
      "Die genaue Anzahl beträgt 11 Spieler."
    ],
    category: "Sport",
    difficulty: "leicht"
  },
  {
    question: "In welchem Jahr fand die erste Fußball-Weltmeisterschaft statt?",
    answer: "1930",
    hints: [
      "Es war in den 1930er Jahren.",
      "Es war genau 1930."
    ],
    category: "Sport",
    difficulty: "schwer"
  }
];

async function seedDatabase() {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost/quizpoker';
    await mongoose.connect(mongoUri);
    console.log('Verbunden mit MongoDB für Seeding');

    // Lösche alle bestehenden Fragen
    await Question.deleteMany({});
    console.log('Bestehende Fragen gelöscht');

    // Füge die Fragen ein
    const result = await Question.insertMany(questions);
    console.log(`${result.length} Fragen erfolgreich eingefügt`);

    // Statistiken ausgeben
    const stats = {
      total: result.length,
      byCategory: {},
      byDifficulty: {}
    };

    result.forEach(q => {
      stats.byCategory[q.category] = (stats.byCategory[q.category] || 0) + 1;
      stats.byDifficulty[q.difficulty] = (stats.byDifficulty[q.difficulty] || 0) + 1;
    });

    console.log('\nStatistiken:');
    console.log('Gesamt:', stats.total);
    console.log('\nNach Kategorie:');
    Object.entries(stats.byCategory).forEach(([cat, count]) => {
      console.log(`${cat}: ${count}`);
    });
    console.log('\nNach Schwierigkeit:');
    Object.entries(stats.byDifficulty).forEach(([diff, count]) => {
      console.log(`${diff}: ${count}`);
    });

    await mongoose.connection.close();
    console.log('\nSeeding abgeschlossen');
  } catch (error) {
    logError(error, { context: 'Database Seeding' });
    process.exit(1);
  }
}

seedDatabase();
