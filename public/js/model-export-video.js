(() => {
  'use strict';

  const smooth = value => value * value * (3 - 2 * value);
  const front = 0;
  const back = front + 180;
  const tracks = {
    'front-back': [[0, front - 30, 72, 142], [.25, front + 30, 72, 142], [.5, back - 30, 72, 142], [.75, back + 30, 72, 142], [1, front + 360 - 30, 72, 142]],
    three: [[0, front, 72, 142], [.18, front, 72, 142], [.34, 90, 72, 142], [.51, 90, 72, 142], [.67, back, 72, 142], [.84, back, 72, 142], [1, front + 360, 72, 142]],
    detail: [[0, front, 66, 72, 0, .28, 0], [.3, 24, 61, 56, 0, .08, 0], [.65, 81, 68, 63, .34, .13, 0], [1, front, 66, 72, 0, .28, 0]],
    reveal: [[0, front, 72, 62, -.3, .28, 0], [.1, front, 72, 62, -.3, -.26, 0], [.22, front, 72, 62, .3, -.26, 0], [.34, front, 72, 62, .3, .28, 0], [.46, front, 72, 132], [.54, back, 72, 132], [.64, back, 72, 62, .3, .28, 0], [.78, back, 72, 62, -.3, .28, 0], [.88, back, 72, 132], [1, front + 360, 72, 132]],
    'before-after': [[0, front, 72, 132], [.45, front, 72, 132], [.6, back, 72, 132], [.78, back, 72, 132], [1, front + 360, 72, 132]],
    social: [[0, front - 1080, 78, 420, 0, -.06, 0], [.38, front, 72, 84, 0, .08, 0], [.52, front + 10, 70, 78, 0, .08, 0], [.68, front, 72, 108], [1, front, 72, 108]],
    story: [[0, front, 72, 112], [.08, front, 60, 62, 0, .3, 0], [.18, -20, 70, 60, -.3, .05, 0], [.28, front, 80, 64, 0, -.28, 0], [.38, 34, 70, 60, .3, .05, 0], [.5, back, 72, 112], [.58, back, 60, 62, 0, .3, 0], [.68, 160, 70, 60, .3, .05, 0], [.78, back, 80, 64, 0, -.28, 0], [.88, 214, 70, 60, -.3, .05, 0], [1, front + 360, 72, 112]]
  };

  function sample(template, progress, motion = 'clockwise') {
    const p = Math.max(0, Math.min(1, Number(progress) || 0));
    const direction = motion === 'counterclockwise' ? -1 : 1;
    if (template === 'orbit') return { azimuth: front + 360 * p * direction, polar: 72, distance: 142, target: [0, 0, 0], before: false, reveal: 1 };
    const points = tracks[template] || tracks['front-back'];
    const nextIndex = Math.max(1, points.findIndex(point => point[0] >= p));
    const previous = points[nextIndex - 1];
    const next = points[nextIndex] || points[points.length - 1];
    const t = next[0] === previous[0] ? 0 : smooth((p - previous[0]) / (next[0] - previous[0]));
    const between = column => (previous[column] || 0) + ((next[column] || 0) - (previous[column] || 0)) * t;
    return {
      azimuth: front + (between(1) - front) * direction,
      polar: between(2),
      distance: between(3),
      target: [between(4), between(5), between(6)],
      before: template === 'before-after' && p < .45,
      reveal: template === 'before-after' ? smooth(Math.min(1, p / .45)) : 1
    };
  }

  window.ModelExportVideo = { sample };
})();
