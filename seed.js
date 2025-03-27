const mongoose = require('mongoose');
const Question = require('./models/Question');

mongoose.connect('mongodb://localhost/quizpoker', { useNewUrlParser: true })
  .then(async () => {
    console.log('Verbunden mit MongoDB für Seeding');
    await Question.deleteMany({});
    const questions = [
      {
        question: "Wie viele Bundesländer hat Deutschland?",
        answer: "16",
        hints: [
          "Mehr als 10, aber weniger als 20.",
          "Genauer: Es sind 16 Bundesländer."
        ]
      },
      {
        question: "Wie heißt die Hauptstadt von Frankreich?",
        answer: "Paris",
        hints: [
          "Die Stadt der Liebe.",
          "Sie heißt Paris."
        ]
      }
    ];
    await Question.insertMany(questions);
    console.log('Fragen erfolgreich eingefügt');
    mongoose.connection.close();
  })
  .catch(err => {
    console.error('Fehler beim Seeding:', err);
  });
