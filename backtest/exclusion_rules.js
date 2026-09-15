// Candidate reasons for leaving a meet out of the marks database.
//
// THE RULE ABOUT RULES
// Every rule here must be decidable from the meets alone, without looking at
// how well the model then scores. That is the whole difference between a
// justification and a number that will not reproduce: if a meet is dropped
// because dropping it improved the Brier score, the Brier score is no longer
// evidence of anything - it is a description of the search. So each rule states
// its reason first, the reason has to stand on its own, and the score is only
// ever consulted afterwards to see whether the reason was worth acting on.
//
// The list is fixed before any of them are scored, and exclusions.js reports
// all of them, including the ones that make things worse. A rule is only
// adopted if it also helps on a season it was not chosen on.
module.exports = {
  /* Ship as-is: 5,000m only, nothing before mid-August, minus the Ultimook at
     the Hydrangea Ranch. The comparison every other rule is measured against. */
  none: {
    reason: 'what ships today',
    test: () => false,
  },

  /* An intrasquad run is not a race. Team time trials and green-vs-gold meets
     are run against team-mates in training, often at controlled effort, and
     they cannot rank one school against another because only one school is
     there. The model reads every mark as a competitive 5,000m. */
  intrasquad: {
    reason: 'a time trial against team-mates is not a race',
    test: m => /time trial|intrasquad|green vs gold|scrimmage|team preview/i.test(m.name),
  },

  /* A course nobody else runs is a course nobody can calibrate. A handful of
     finishers means a dual on a local field, frequently measured with a wheel
     and a hope, and no overlap with the rest of the state to check it against. */
  tinyField: {
    reason: 'too few finishers to calibrate the course against anything',
    test: m => m.finishers < 40,
  },

  /* The same argument one step further out: a meet only two or three schools
     attended tells you about those schools on that day and nothing about where
     they stand. */
  fewSchools: {
    reason: 'too few schools for a mark to mean anything across the state',
    test: m => m.schools < 5,
  },

  /* The Hydrangea logic, generalised. A course whose fitted difficulty is far
     from the rest is not the same test as the rest, and the model has no way to
     know. Beware: fitted difficulty is confounded with date - early meets look
     hard because athletes are unfit - so this is expected to behave badly, and
     it is here precisely so that it is measured rather than assumed. */
  oddCourse: {
    reason: 'fitted course difficulty far from the field, though confounded with date',
    test: m => m.factor && (m.factor < 0.92 || m.factor > 1.12),
  },

  /* Everything above that survived on its own merits, applied together, so it
     can be tried once on the held-out season.

     The set arrives through the environment rather than being written here:
     build_season.js runs as its own process and would re-read this file from
     disk, so a value assigned at runtime by exclusions.js would never reach it. */
  combined: {
    reason: 'the rules that earned their place, together',
    test(m) {
      const names = (process.env.COMBINED_RULES || '').split(',').filter(Boolean);
      return names.some(n => module.exports[n] && module.exports[n].test(m));
    },
  },
};
