/* Build the Oregon outline from real coordinates instead of sketching it.
   Waypoints run clockwise from the mouth of the Columbia: the north border
   (the river to Wallula, then the straight 46th-parallel line to the Snake),
   the Snake down the Idaho line, the straight -117.03 meridian to the corner,
   the 42nd parallel west along the whole south border, and the coast back up
   past Cape Blanco - which is the westernmost point in the state and the thing
   that makes the silhouette read as Oregon rather than as a box. */
const PTS = [
  // --- mouth of the Columbia, north-west corner
  [-124.05, 46.27],
  // --- the Columbia east: it sags south to Portland, then climbs back
  [-123.72, 46.18], [-123.42, 46.16], [-123.18, 46.14], [-122.90, 46.07],
  [-122.80, 45.95], [-122.76, 45.84], [-122.66, 45.73], [-122.50, 45.64],
  [-122.25, 45.55], [-121.92, 45.64], [-121.70, 45.70], [-121.42, 45.70],
  [-121.18, 45.73], [-120.92, 45.64], [-120.65, 45.74], [-120.48, 45.70],
  [-120.20, 45.77], [-119.88, 45.84], [-119.60, 45.92], [-119.32, 45.93],
  [-119.03, 45.96], [-118.98, 46.00],
  // --- the straight run east along 46 degrees to the Snake
  [-118.20, 46.00], [-117.40, 46.00], [-116.92, 46.00],
  // --- the Snake south: the wiggliest border in the state
  [-116.78, 45.84], [-116.72, 45.70], [-116.85, 45.60], [-116.78, 45.44],
  [-116.66, 45.32], [-116.55, 45.20], [-116.53, 45.10], [-116.70, 44.98],
  [-116.84, 44.85], [-116.93, 44.74], [-116.97, 44.60], [-117.06, 44.50],
  [-117.22, 44.40], [-117.22, 44.28], [-117.05, 44.20], [-116.90, 44.15],
  [-116.98, 44.08], [-117.03, 43.95],
  // --- straight down the meridian to the south-east corner
  [-117.03, 43.20], [-117.03, 42.40], [-117.03, 42.00],
  // --- the 42nd parallel, dead straight, all the way west
  [-118.20, 42.00], [-119.40, 42.00], [-120.60, 42.00], [-121.80, 42.00],
  [-123.00, 42.00], [-124.21, 42.00],
  // --- the coast north, out to Cape Blanco and back in
  [-124.40, 42.42], [-124.52, 42.70], [-124.57, 42.84], [-124.45, 43.12],
  [-124.32, 43.40], [-124.22, 43.70], [-124.12, 44.02], [-124.07, 44.40],
  [-124.05, 44.80], [-124.01, 45.20], [-123.97, 45.60], [-123.94, 45.95],
];

const lons = PTS.map(p => p[0]), lats = PTS.map(p => p[1]);
const lo0 = Math.min(...lons), lo1 = Math.max(...lons);
const la0 = Math.min(...lats), la1 = Math.max(...lats);

/* A degree of longitude at 44 degrees north is about 0.72 of a degree of
   latitude on the ground, so projecting straight from degrees would squash the
   state. Scale x by cos(lat) and the proportions come out at the real 1.36:1
   rather than 1.89:1. */
const K = Math.cos(44.0 * Math.PI / 180);
const W = 100;
const H = +(W * (la1 - la0) / ((lo1 - lo0) * K)).toFixed(2);

const x = lo => ((lo - lo0) / (lo1 - lo0) * W);
const y = la => ((la1 - la) / (la1 - la0) * H);
const r = n => (Math.round(n * 10) / 10);

const d = 'M' + PTS.map(p => r(x(p[0])) + ' ' + r(y(p[1]))).join('L') + 'Z';

console.log('viewBox 0 0 ' + W + ' ' + H + '   aspect ' + (W / H).toFixed(3));
console.log('points ' + PTS.length + ', path ' + d.length + ' chars');
console.log(d);
// Prints the path for index.html's OR_PATH. Re-run and paste if the shape changes.
require('fs').writeFileSync(
  'C:/Users/markf/AppData/Local/Temp/claude/C--Users-markf-xc-analysis/d9d632e3-6905-40f3-83de-59067cda8a99/scratchpad/or.json',
  JSON.stringify({ d, W, H }));
