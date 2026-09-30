// Tutor lesson plans returned in AI demo mode (dev without AI_API_KEY), in the shape
// normalizePlanContent expects. SAMPLE_PLAN follows SAMPLE_LESSON (weekend in Lyon).

export const SAMPLE_PLAN = {
  title: 'Raconter un voyage : le passé composé avec être',
  duration_min: 50,
  objectives: [
    'Maintenant je peux raconter un voyage au passé.',
    'Maintenant je peux choisir entre avoir et être avec les verbes de mouvement.',
    'Maintenant je peux réagir avec « C’était génial ! » ou « Ça valait le coup ».',
  ],
  sections: [
    {
      heading: 'Warm-up',
      minutes: 5,
      body: 'Question brise-glace : **Quel est le meilleur voyage que tu as fait ?**\n- Où es-tu allé(e) ? Avec qui ?\n- Qu’est-ce que tu as préféré ?\n- Et dans ton pays, où est-ce qu’on part le week-end ?\nRéutilise les mots du dernier cours : un bouchon, se promener, complet.',
    },
    {
      heading: 'Objectifs',
      minutes: 2,
      body: 'Dis-lui : « Aujourd’hui, tu vas apprendre à raconter un voyage au passé sans hésiter entre **avoir** et **être**. »',
    },
    {
      heading: 'Présentation',
      minutes: 10,
      body: 'Montre ces phrases et demande-lui de trouver la règle :\n- Je **suis** parti à 8 heures.\n- Nous **sommes** arrivés à Lyon.\n- J’**ai** visité la cathédrale.\n- Elle **est** rentrée tard.\n- Ils **ont** mangé dans un bouchon.\nQuestion : « Quels verbes utilisent être ? Qu’est-ce qui change avec elle et ils ? »\nRègle : les verbes de mouvement (aller, partir, arriver, rentrer, rester, tomber…) et les verbes pronominaux utilisent **être** ; le participe s’accorde avec le sujet.',
    },
    {
      heading: 'Pratique dirigée',
      minutes: 13,
      body: 'Texte à trous (à coller dans le Canva) :\nSamedi, je ___ (partir) tôt. Nous ___ (arriver) à Lyon à 10 heures. J’___ (visiter) le Vieux-Lyon, puis nous ___ (manger) dans un bouchon. Le soir, ma sœur ___ (aller) au concert et elle ___ (rentrer) à minuit.\nRéponses : suis parti(e) — sommes arrivé(e)s — ai visité — avons mangé — est allée — est rentrée\n\nDictée (lis lentement, deux fois) :\n« Le week-end dernier, nous sommes partis à Lyon. Nous nous sommes promenés dans le Vieux-Lyon et nous avons mangé dans un bouchon. Le soir, nous sommes allés à un concert. C’était génial ! »',
    },
    {
      heading: 'Pratique libre / Jeu de rôle',
      minutes: 15,
      body: 'Situation : l’élève rentre d’un week-end et raconte son voyage à un collègue curieux.\n- Ton rôle : le collègue qui pose beaucoup de questions.\n- Son rôle : raconter le voyage (réel ou imaginaire) au passé composé.\n- Objectif : utiliser au moins 5 verbes avec être.\nQuestions à poser :\n- Tu es parti(e) quand ?\n- Comment tu es allé(e) là-bas ?\n- Qu’est-ce que tu as fait le premier jour ?\n- Tu es sorti(e) le soir ?\n- Qu’est-ce qui ne s’est pas bien passé ?\n- Tu y retournerais ?\nExpressions à lui donner : C’était génial ! — Ça valait le coup. — Le lendemain… — Au final…\nRègle des 70/30 : laisse-le parler, note les erreurs sans l’interrompre.',
    },
    {
      heading: 'Wrap-up',
      minutes: 5,
      body: '- Reprends les 3 erreurs les plus fréquentes notées pendant le jeu de rôle.\n- Demande : « Qu’est-ce que tu peux faire maintenant que tu ne pouvais pas faire avant ? »\n- Devoirs proposés : écrire 6 phrases sur son dernier voyage avec au moins 4 verbes avec être.',
    },
  ],
}

export const SAMPLE_TRIAL_PLAN = {
  title: 'Cours d’essai : faire connaissance et évaluer le niveau',
  duration_min: 50,
  objectives: [
    'Maintenant je peux me présenter simplement en français.',
    'Maintenant je peux expliquer pourquoi j’apprends le français.',
  ],
  sections: [
    {
      heading: 'Accueil',
      minutes: 5,
      body: 'Mets l’élève à l’aise : présente-toi en deux phrases et explique le déroulé (discussion, petite évaluation, mini-activité, questions sur les devoirs).\nQuestion d’ouverture : « Comment ça va aujourd’hui ? Tu es où en ce moment ? »',
    },
    {
      heading: 'Découverte',
      minutes: 10,
      body: 'Questions ouvertes :\n- Pourquoi est-ce que tu apprends le français ?\n- Tu as déjà pris des cours ? Qu’est-ce qui a marché, qu’est-ce qui n’a pas marché ?\n- Dans quelles situations tu veux parler français (travail, voyage, famille…) ?\n- Qu’est-ce que tu aimes faire pendant ton temps libre ?\n- Combien de cours par semaine tu imagines ?',
    },
    {
      heading: 'Mini-évaluation',
      minutes: 10,
      body: 'Pose ces questions de plus en plus difficiles et arrête-toi quand l’élève bloque :\n- A1 : Comment tu t’appelles ? Tu habites où ?\n- A2 : Qu’est-ce que tu as fait le week-end dernier ?\n- B1 : Raconte-moi un voyage qui t’a marqué.\n- B2 : Qu’est-ce que tu penses du télétravail ? Pourquoi ?\nÉcoute : la conjugaison au présent et au passé, le vocabulaire courant, la prononciation, la fluidité.',
    },
    {
      heading: 'Mini-activité',
      minutes: 15,
      body: 'Jeu de rôle court adapté à ses objectifs (par défaut : commander dans un café).\n- Ton rôle : le serveur.\n- Son rôle : le client qui commande et pose une question.\n- Expressions à lui donner : Je voudrais… — Qu’est-ce que vous me conseillez ? — L’addition, s’il vous plaît.\nÀ la fin, correction rapide : 2 ou 3 erreurs, avec la bonne forme.',
    },
    {
      heading: 'Devoirs : préférences',
      minutes: 5,
      body: 'Pose les 4 questions sur les devoirs et note les réponses dans sa fiche (« Contexte pour l’IA »).',
    },
    {
      heading: 'Wrap-up',
      minutes: 5,
      body: '- Donne ton estimation du niveau (par ex. **A2 solide**) et deux points forts.\n- Propose un parcours pour les 4 prochains cours (par ex. passé composé, raconter une expérience, vocabulaire du travail, révision).\n- Explique comment il ou elle recevra le bilan et les exercices après chaque cours.',
    },
  ],
}
