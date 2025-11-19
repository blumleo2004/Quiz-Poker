require('dotenv').config();
const mongoose = require('mongoose');
const Question = require('./models/Question');
const { logError } = require('./utils/logger');

const questions = [
  {
    question: "Kevin Kühnert war im Jahr 2023 der meist eingeladene Gast in den fünf großen Polit-Talkshows von ARD und ZDF. Wie oft war er in diesem Jahr insgesamt in diesen Shows zu Gast?",
    answer: "18",
    hints: [
      "Wäre er bei DSDS in allen Casting- und Recall-Folgen sowie in der ersten Liveshow einer Staffel aufgetreten, wäre er genauso oft im TV gewesen.",
      "Karl Lauterbach war 2021 mit 40 Auftritten mehr als doppelt so oft zu sehen."
    ],
    category: "Politik & Medien",
    difficulty: "mittel"
  },
  {
    question: "Wie viele Studioalben veröffentlichten die Beatles insgesamt?",
    answer: "13",
    hints: [
      "Die Beatles waren von 1960 bis 1970 aktiv.",
      "Das „White Album“ erschien als neuntes Studioalbum im Jahr 1968."
    ],
    category: "Musik",
    difficulty: "mittel"
  },
  {
    question: "Wie viele verschiedene Bundesautobahnen befinden sich aktuell in Deutschland in Betrieb?",
    answer: "119",
    hints: [
      "Das Autobahnnetz hat eine Länge von 13.172 km, wovon 962 km allein zur A7 gehören.",
      "Etwa 44 % des gesamten Netzes machen allein die zehn längsten Autobahnen aus."
    ],
    category: "Verkehr & Geografie",
    difficulty: "schwer"
  },
  {
    question: "In welchem Jahr hatte die Comicfigur Iron Man ihren allerersten Auftritt?",
    answer: "1962",
    hints: [
      "Captain America hatte seinen ersten Auftritt schon früher, im Jahr 1941.",
      "Im Jahr 1968 erhielt Iron Man eine nach ihm benannte, eigene Comicserie."
    ],
    category: "Popkultur",
    difficulty: "mittel"
  },
  {
    question: "Wie viele Minuten benötigte der Extrembergsteiger Ueli Steck für seine Rekordbesteigung der Eiger-Nordwand im Jahr 2015?",
    answer: "143",
    hints: [
      "Die Erstbesteiger im Jahr 1938 benötigten für die gleiche Strecke noch mehr als drei Tage.",
      "Die Nordwand ist 1800 Meter hoch."
    ],
    category: "Sport",
    difficulty: "schwer"
  },
  {
    question: "Welche Distanz legt ein Lichtstrahl in einer Sekunde im Vakuum zurück (in Kilometern, gerundet)?",
    answer: "300000",
    hints: [
      "Die Distanz entspricht ungefähr 54-mal der Luftlinie von London nach New York City.",
      "Das Licht benötigt etwas über eine Sekunde, um vom Mond zur Erde zu gelangen."
    ],
    category: "Physik",
    difficulty: "mittel"
  },
  {
    question: "Wie viel Euro kostet der neue Thermomix TM7 in seiner Grundausstattung?",
    answer: "1549",
    hints: [
      "Für denselben Preis erhält man 13.468 Bevara-Verschlussklemmen bei IKEA.",
      "Würde man von vier McDonald's Cheeseburgern pro Tag satt werden, könnte man sich für denselben Preis mehr als 150 Tage lang ernähren."
    ],
    category: "Lifestyle",
    difficulty: "mittel"
  },
  {
    question: "Wie viele Millionen Apple iPhones wurden bis zum zweiten Quartal 2025 insgesamt (seit Beginn) verkauft?",
    answer: "3000",
    hints: [
      "Die erste iPhone-Generation wurde ab 2008 insgesamt 13,7 Millionen Mal verkauft.",
      "Ende Juli 2016 meldete Apple die erste Milliarde verkaufter iPhones."
    ],
    category: "Technik",
    difficulty: "schwer"
  },
  {
    question: "Wie viele Satelliten wurden für das Starlink-Netzwerk bis September 2025 ins Weltall befördert?",
    answer: "7978",
    hints: [
      "Im Februar 2018 wurden die ersten zwei Satelliten ins All gebracht, danach gab es weitere 311 Starts.",
      "Maximal 60 Satelliten können pro Raketenstart ins Weltall gebracht werden."
    ],
    category: "Technik / Weltraum",
    difficulty: "schwer"
  },
  {
    question: "Wie viele Millionen Menschen reisten 2024 im Schnitt pro Tag mit der Deutschen Bahn (Schiene)?",
    answer: "5.1",
    hints: [
      "Pro Tag fuhren im Schnitt 22.448 Züge.",
      "Im Fernverkehr (ICE/IC) nutzten täglich etwa 360.000 Menschen die Deutsche Bahn, der große Rest ist Nahverkehr."
    ],
    category: "Verkehr",
    difficulty: "schwer"
  },
  {
    question: "Wie viele Menschen lebten am 31. Dezember 2024 in der Vatikanstadt (Einwohner auf dem Staatsgebiet)?",
    answer: "882",
    hints: [
      "Arnis ist mit 254 Menschen die kleinste Stadt in Deutschland und damit wesentlich kleiner als die Vatikanstadt.",
      "618 Menschen besitzen die vatikanische Staatsbürgerschaft."
    ],
    category: "Geografie",
    difficulty: "mittel"
  },
  {
    question: "Wie oft singt Michael Jackson den Namen „Annie“ in der Originalversion von „Smooth Criminal“?",
    answer: "53",
    hints: [
      "Die gesamten Lyrics bestehen aus nur 278 Wörtern.",
      "Er singt allein 30 Mal die Zeile „Annie are you okay“."
    ],
    category: "Musik",
    difficulty: "schwer"
  },
  {
    question: "Wie viele Kilokalorien haben zusammen: 300g gekochter Reis, 200g Hähnchenbrustfilet und 100g Brokkoli?",
    answer: "644",
    hints: [
      "Wäre die gesuchte Zahl ein Jahr, so wäre Mohammed (Religionsstifter des Islam) wenige Jahre zuvor gestorben.",
      "Man müsste etwas mehr als 1,5 Liter Coca-Cola trinken, um auf den gleichen Kalorienwert zu kommen."
    ],
    category: "Ernährung",
    difficulty: "schwer"
  },
  {
    question: "In welchem Jahr wurde Frank-Walter Steinmeier zum Bundespräsidenten wiedergewählt?",
    answer: "2022",
    hints: [
      "Die Amtszeit eines Bundespräsidenten beträgt 5 Jahre.",
      "Christian Wulff wurde 2010 zum Bundespräsidenten gewählt."
    ],
    category: "Politik",
    difficulty: "leicht"
  },
  {
    question: "Wie viele Baseballspiele absolvierte Cal Ripken Jr. ohne Unterbrechung in Folge (Iron Man of Baseball)?",
    answer: "2632",
    hints: [
      "Er stellte seinen Rekord im Zeitraum zwischen dem 30. Mai 1982 und dem 20. September 1998 auf.",
      "Insgesamt absolvierte er 3.001 Spiele in seiner gesamten Karriere."
    ],
    category: "Sport",
    difficulty: "schwer"
  },
  {
    question: "In wie vielen europäischen Ländern (geografisch) gilt derzeit Linksverkehr?",
    answer: "4",
    hints: [
      "In Europa gibt es keine Fahrtrichtungswechsel an Landesgrenzen auf durchgehender Fahrbahn (Insel-Hinweis).",
      "Es sind Großbritannien, Irland und zwei weitere Inselstaaten."
    ],
    category: "Geografie",
    difficulty: "mittel"
  },
  {
    question: "In welchem Jahr erschien die Erstausgabe der Bild-Zeitung?",
    answer: "1952",
    hints: [
      "Auf der Titelseite wurde der mögliche Rücktritt von Winston Churchill diskutiert.",
      "Der Axel Springer Verlag wurde etwas früher, bereits 1946, gegründet."
    ],
    category: "Medien / Geschichte",
    difficulty: "mittel"
  },
  {
    question: "Wie viele Flugzeuge der Boeing 737-Familie wurden bis Juli 2025 ausgeliefert?",
    answer: "12171",
    hints: [
      "Die 737 ist die weltweit meistgebaute Familie strahlgetriebener Verkehrsflugzeuge.",
      "Die 737 befindet sich bereits seit 1967 in Serienproduktion."
    ],
    category: "Technik / Wirtschaft",
    difficulty: "sehr schwer"
  },
  {
    question: "In welchem Jahr wurde GPT-1, das erste Sprachmodell von OpenAI, eingeführt?",
    answer: "2018",
    hints: [
      "Ex-Bundeskanzler Helmut Kohl (gestorben 2017) hätte GPT-1 nicht mehr nutzen können.",
      "Das Unternehmen OpenAI wurde am 8. Dezember 2015 gegründet."
    ],
    category: "Technik / KI",
    difficulty: "mittel"
  },
  {
    question: "Wie viele Tage nach dem offiziellen Ausbruch der Covid-19-Pandemie (31.12.2019) wurde der erste Impfstoff in der EU zugelassen?",
    answer: "356",
    hints: [
      "Der Impfstoff erhielt im April 2020 die Genehmigung für die klinische Prüfung in Deutschland.",
      "In Pakistan wurde der Impfstoff erst sehr spät, am 31. Mai 2021, eingeführt."
    ],
    category: "Geschichte / Medizin",
    difficulty: "schwer"
  },
  {
    question: "Wie viele verschiedene Pokémon gibt es aktuell offiziell (Stand Generation 9)?",
    answer: "1025",
    hints: [
      "In der allerersten Generation (Rot/Blau) waren es ursprünglich 151 Pokémon.",
      "Die Marke von 1.000 wurde im Jahr 2022 überschritten."
    ],
    category: "Gaming",
    difficulty: "mittel"
  },
  {
    question: "Wie viele offizielle James-Bond-Filme (produziert von Eon Productions) gab es bis einschließlich \"Keine Zeit zu sterben\" (2021)?",
    answer: "25",
    hints: [
      "Sean Connery und Roger Moore spielten jeweils in 7 bzw. 6 offiziellen Filmen mit.",
      "Der erste Film \"Dr. No\" erschien 1962."
    ],
    category: "Film",
    difficulty: "leicht"
  },
  {
    question: "Wie oft schlägt ein durchschnittliches menschliches Herz im Laufe eines 80-jährigen Lebens (in Millionen)?",
    answer: "3000",
    hints: [
      "Pro Tag sind es bei einem Ruhepuls von ca. 70 schon etwa 100.000 Schläge.",
      "Die Milliardengrenze wird deutlich überschritten."
    ],
    category: "Biologie",
    difficulty: "schwer"
  },
  {
    question: "Wie viele E-Mails wurden im Jahr 2024 weltweit pro Tag versendet (inkl. Spam, in Milliarden)?",
    answer: "361",
    hints: [
      "Es gibt etwa 4,5 Milliarden E-Mail-Nutzer weltweit.",
      "Ein sehr großer Teil davon ist automatisierter Spam; die Zahl ist höher als 300 Milliarden."
    ],
    category: "Internet",
    difficulty: "schwer"
  },
  {
    question: "Wie viele offizielle Zeitzonen hat Russland aktuell?",
    answer: "11",
    hints: [
      "China ist fast so breit, nutzt aber nur eine einzige Zeitzone.",
      "Die USA haben inklusive Hawaii und Alaska 6 Zeitzonen; Russland hat fast doppelt so viele."
    ],
    category: "Geografie",
    difficulty: "mittel"
  },
  {
    question: "LEGO ist stückzahlenmäßig der größte Reifenhersteller der Welt. Wie viele Reifen produziert LEGO pro Jahr (in Millionen)?",
    answer: "381",
    hints: [
      "Echte Reifenhersteller wie Michelin produzieren ca. 200 Millionen Reifen pro Jahr.",
      "LEGO produziert mehr als das Doppelte, aber weniger als das Vierfache davon."
    ],
    category: "Wirtschaft / Kurioses",
    difficulty: "mittel"
  },
  {
    question: "Wie viele Knochen hat ein erwachsener Mensch im Normalfall?",
    answer: "206",
    hints: [
      "Ein Baby kommt mit ca. 300 Knochen auf die Welt, aber viele wachsen zusammen.",
      "Mehr als die Hälfte aller Knochen befinden sich allein in den Händen und Füßen."
    ],
    category: "Biologie",
    difficulty: "leicht"
  },
  {
    question: "Wie viel wiegt eine typische Schönwetter-Wolke (Cumulus) mittlerer Größe (in Tonnen)?",
    answer: "500",
    hints: [
      "Eine solche Wolke hat ein Volumen von ca. 1 Kubikkilometer.",
      "Sie wiegt etwa so viel wie 100 Elefanten."
    ],
    category: "Naturwissenschaft",
    difficulty: "schwer"
  },
  {
    question: "Wie viele Jahre vergingen von der Grundsteinlegung bis zur endgültigen Fertigstellung des Kölner Doms?",
    answer: "632",
    hints: [
      "Der Bau begann im Mittelalter (1248).",
      "Es gab eine Baubause von über 300 Jahren; fertig wurde er erst 1880."
    ],
    category: "Geschichte / Architektur",
    difficulty: "schwer"
  },
  {
    question: "In welchem Jahr wurde die allererste SMS der Welt mit dem Text \"Merry Christmas\" verschickt?",
    answer: "1992",
    hints: [
      "Handys waren damals noch riesig; es war vor der Einführung des Euro als Buchgeld.",
      "Es geschah im selben Jahr, in dem Bill Clinton zum US-Präsidenten gewählt wurde."
    ],
    category: "Technik",
    difficulty: "mittel"
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
