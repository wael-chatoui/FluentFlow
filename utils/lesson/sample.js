// Canonical example of a generated lesson, in the raw shape the AI is asked to
// return (see utils/lesson/schema.js). Used as the AI demo-mode output, as a
// format example in the prompt, and by the dev preview page. Every exercise type
// has at least 4 items so demo mode can honour type-restricted options.

export const SAMPLE_LESSON = {
  title: 'Weekend plans & the passé composé',
  summary:
    "Today we talked about your weekend in Lyon: you visited the Vieux-Lyon, tried a bouchon lyonnais and went to a concert on Saturday night.\n\nYou are getting much more confident telling stories in the past. The main thing to work on is choosing between **avoir** and **être** in the passé composé — especially with verbs of movement like aller, partir and arriver.",
  topics: ['Weekend in Lyon', 'Food: the bouchon lyonnais', 'Going to a concert'],
  vocabulary: [
    { fr: 'un bouchon', en: 'a traditional Lyon restaurant', example: "On a mangé dans un bouchon près de la cathédrale." },
    { fr: 'se promener', en: 'to go for a walk', example: 'Je me suis promené dans le Vieux-Lyon.' },
    { fr: 'la veille', en: 'the day before', example: "La veille, j'ai acheté les billets." },
    { fr: 'complet', en: 'sold out / full', example: 'Le concert était complet !' },
    { fr: 'rentrer', en: 'to go back home', example: 'Je suis rentré à minuit.' },
  ],
  corrections: [
    { wrong: "J'ai allé au concert.", right: 'Je suis allé au concert.', explanation: 'Aller uses être in the passé composé.' },
    { wrong: "Nous avons arrivé à 8h.", right: 'Nous sommes arrivés à 8h.', explanation: 'Arriver uses être, and the participle agrees with the subject.' },
    { wrong: "C'était très bon le repas.", right: 'Le repas était très bon.', explanation: 'More natural word order in French.' },
  ],
  grammar: [
    {
      title: 'Passé composé: avoir or être?',
      explanation:
        'Most verbs use **avoir**. About 15 verbs of movement or change of state use **être** (aller, venir, partir, arriver, entrer, sortir, rentrer, rester, tomber, naître, mourir…), and so do all reflexive verbs.\n\nWith être, the past participle agrees with the subject: elle est allé**e**, ils sont parti**s**.',
      examples: ["J'ai mangé une salade lyonnaise.", 'Elle est partie tôt.', 'Nous nous sommes promenés.'],
    },
  ],
  expressions: [
    { fr: "C'était génial !", en: 'It was great!', example: "Le concert ? C'était génial !" },
    { fr: 'Ça valait le coup.', en: 'It was worth it.', example: 'Le billet était cher, mais ça valait le coup.' },
  ],
  homework: [
    { task: 'Write 5 sentences about your last weekend using at least 3 verbs with être.', link: '' },
    { task: 'Watch this short video on avoir vs être and note 3 new examples.', link: 'https://www.youtube.com/results?search_query=pass%C3%A9+compos%C3%A9+avoir+ou+%C3%AAtre' },
  ],
  can_do: [
    'Now I can tell a short story about my weekend in the past.',
    'Now I can choose between avoir and être for common verbs.',
  ],
  exercises: [
    { type: 'mcq', prompt: 'Choose the right auxiliary', sentence: 'Samedi soir, je ___ allé au concert.', choices: ['suis', 'ai', 'es'], answer: 0, explanation: 'Aller uses être: je suis allé.' },
    { type: 'mcq', prompt: 'Choose the right form', sentence: 'Nous ___ dans un bouchon.', choices: ['avons mangé', 'sommes mangés', 'avons manger'], answer: 0, explanation: 'Manger uses avoir, and the participle is mangé.' },
    { type: 'mcq', prompt: 'What does it mean?', sentence: 'Le concert était complet.', choices: ['The concert was sold out.', 'The concert was complete.', 'The concert was long.'], answer: 0, explanation: 'Complet = full / sold out.' },
    { type: 'fill_blank', prompt: 'Complete with the passé composé of "arriver"', sentence: 'Elle ___ à huit heures.', answers: ['est arrivée'], hint: 'arriver → être + agreement', explanation: 'Elle est arrivée: être, and the participle takes -e.' },
    { type: 'fill_blank', prompt: 'Complete with the right word', sentence: 'Je me suis ___ dans le Vieux-Lyon.', answers: ['promené', 'promenée'], hint: 'se promener', explanation: 'Reflexive verbs use être: je me suis promené(e).' },
    { type: 'match', prompt: 'Match the words', pairs: [ { fr: 'la veille', en: 'the day before' }, { fr: 'rentrer', en: 'to go back home' }, { fr: 'complet', en: 'sold out' }, { fr: 'se promener', en: 'to go for a walk' } ], explanation: '' },
    { type: 'mcq', prompt: 'Which sentence is correct?', sentence: 'Pick the correct sentence.', choices: ['Ils sont partis tôt.', 'Ils ont partis tôt.', 'Ils sont parti tôt.'], answer: 0, explanation: 'Partir uses être and agrees with ils: partis.' },
    { type: 'fill_blank', prompt: 'Translate the expression', sentence: 'It was worth it → Ça ___ le coup.', answers: ['valait'], hint: 'valoir, imparfait', explanation: 'Ça valait le coup = it was worth it.' },
    { type: 'match', prompt: 'Match the expressions', pairs: [ { fr: "C'était génial !", en: 'It was great!' }, { fr: 'Ça valait le coup.', en: 'It was worth it.' }, { fr: 'un bouchon', en: 'a traditional Lyon restaurant' } ], explanation: '' },
    { type: 'fill_blank', prompt: 'Complete with the passé composé of "partir"', sentence: 'Ils ___ tôt le matin.', answers: ['sont partis'], hint: 'partir → être + agreement', explanation: 'Partir uses être, and with ils the participle takes -s: ils sont partis.' },
    { type: 'match', prompt: 'Match the verbs of movement', pairs: [ { fr: 'partir', en: 'to leave' }, { fr: 'arriver', en: 'to arrive' }, { fr: 'rester', en: 'to stay' }, { fr: 'tomber', en: 'to fall' } ], explanation: 'All these verbs use **être** in the passé composé.' },
    { type: 'match', prompt: 'Match the sentences', pairs: [ { fr: 'Je suis allé', en: 'I went' }, { fr: "J'ai mangé", en: 'I ate' }, { fr: 'Elle est partie', en: 'She left' }, { fr: 'Nous sommes rentrés', en: 'We went back home' } ], explanation: '' },
  ],
}
