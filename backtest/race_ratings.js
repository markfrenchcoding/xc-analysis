// Race ratings: how fast each race was on its day, the Tully Runners way.
//
// Bill Meylan rates the RACE, not the course. His preferred method once the
// season has some depth is reference runners: predict every runner's time from
// their current rating, and the median of (actual - predicted) is how slow that
// race was. Fixed course tables he uses only as a check, because they "usually
// fail when the weather turns bad".
//
// fit_courses.js was the obvious version of "let the times say which course is
// harder" and it made forecasts 3% worse. It fitted
//
//     log(time) = athlete + course
//
// with one ability per athlete for the whole season, so the course term soaked
// up about 1% a week of fitness: September courses came out hard and October
// ones easy. Meylan never has that problem, because he compares each race
// against runners' ratings AS THEY STAND, which already contain whatever
// fitness they have gained by then.
//
// The same idea as a fit:
//
//     log(time_ij) = athlete_i + tau * week_j + race_j + noise
//
// tau is one number for the whole state - how much a typical runner improves a
// week. It is not shrunk. race_j is shrunk toward zero by n/(n+k). That is the
// identifying assumption, stated: race difficulty is not a function of the date,
// so a trend common to every athlete belongs to tau, which pays nothing for it,
// rather than to eighty race terms that each pay for moving off zero. Without
// tau (fit_courses.js) the trend had nowhere to go but the race terms.
//
// Medians, not means, for the athlete and race terms, because the season is
// full of races run as workouts and races where someone was ill. A race is a
// meet AND a gender: the boys' and girls' 5,000m are different fields at
// different times of day.
//
// Two outputs per mark:
//   'race'  - divide by exp(race_j): the time on a standard day, same date
//   'trend' - also carry it forward to the cutoff date by tau, so a runner who
//             last raced in early September is not frozen at early-September
//             fitness beside one who raced last weekend
//
// Only athletes with two or more races inform the fit. A single mark carries no
// information about race speed and would drag every median toward zero.
'use strict';

// The fit itself lives in pull/seed.js, so the crawl and the backtest cannot drift apart.
module.exports = { fitRaces: require('../pull/seed.js').fitRaces };
