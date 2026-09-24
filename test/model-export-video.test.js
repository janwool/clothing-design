const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/js/model-export-video.js'), 'utf8'), context);
const { sample } = context.window.ModelExportVideo;

test('video templates produce distinct 3D camera paths with smooth transitions', () => {
  const midpoint = ['orbit', 'front-back', 'three', 'detail', 'reveal', 'before-after', 'social', 'story'].map(template => {
    const pose = sample(template, .4);
    assert.ok(Number.isFinite(pose.azimuth) && Number.isFinite(pose.polar) && Number.isFinite(pose.distance));
    assert.equal(pose.target.length, 3);
    return JSON.stringify([pose.azimuth, pose.polar, pose.distance, pose.target]);
  });
  assert.equal(new Set(midpoint).size, midpoint.length);
  for (const template of ['front-back', 'three', 'detail', 'story']) {
    const left = sample(template, .499);
    const right = sample(template, .501);
    assert.ok(Math.abs(left.azimuth - right.azimuth) < 10, `${template} should not jump between frames`);
  }
});

test('camera direction and texture reveal follow the selected video template', () => {
  assert.ok(sample('orbit', .25, 'clockwise').azimuth > sample('orbit', 0).azimuth);
  assert.ok(sample('orbit', .25, 'counterclockwise').azimuth < sample('orbit', 0).azimuth);
  assert.equal(sample('before-after', .25).before, true);
  assert.equal(sample('before-after', .75).before, false);
  assert.equal(sample('reveal', .25).before, false);
  assert.equal(sample('reveal', .75).before, false);
  assert.ok(sample('detail', .3).target[1] > sample('orbit', .3).target[1]);
});

test('video templates use a straight-on front camera at the start', () => {
  for (const template of ['orbit', 'three', 'detail', 'reveal', 'before-after', 'social', 'story']) {
    const angle = sample(template, 0).azimuth;
    assert.equal(((angle % 360) + 360) % 360, 0, `${template} should begin from the front`);
  }
  assert.equal(sample('front-back', 0).azimuth, -30, 'front and back retains its requested 30-degree sweep');
});

test('design reveal keeps the model designed while the camera tours front and back', () => {
  const [topLeft, bottomLeft, bottomRight, topRight, frontWide, backWide, backLeft, backRight, backRecentered, frontFinish] = [0, .1, .22, .34, .46, .54, .64, .78, .88, 1].map(progress => sample('reveal', progress));
  assert.deepEqual([topLeft, bottomLeft, bottomRight, topRight, backLeft, backRight].map(pose => pose.distance), [62, 62, 62, 62, 62, 62]);
  assert.ok(topLeft.target[0] < 0 && topLeft.target[1] > 0);
  assert.ok(bottomLeft.target[0] < 0 && bottomLeft.target[1] < 0);
  assert.ok(bottomRight.target[0] > 0 && bottomRight.target[1] < 0);
  assert.ok(topRight.target[0] > 0 && topRight.target[1] > 0);
  assert.deepEqual([frontWide.distance, backWide.distance, backRecentered.distance, frontFinish.distance], [132, 132, 132, 132]);
  assert.deepEqual([frontWide.azimuth, backWide.azimuth, frontFinish.azimuth], [0, 180, 360]);
  assert.ok(backLeft.target[0] > 0 && backRight.target[0] < 0, 'screen left and right reverse on the back');
  assert.ok([topLeft, bottomLeft, bottomRight, topRight, backLeft, backRight].every(pose => !pose.before));
});

test('before and after reveals the design bottom-up before turning to the back and returning', () => {
  const [start, halfway, covered, back, held, finish] = [0, .225, .45, .6, .78, 1].map(progress => sample('before-after', progress));
  assert.deepEqual([start.azimuth, halfway.azimuth, covered.azimuth, back.azimuth, held.azimuth, finish.azimuth], [0, 0, 0, 180, 180, 360]);
  assert.equal(start.reveal, 0);
  assert.ok(Math.abs(halfway.reveal - .5) < .001);
  assert.equal(covered.reveal, 1);
  assert.equal(start.before, true);
  assert.equal(covered.before, false);
});

test('front and back sweeps each side by 30 degrees before changing sides', () => {
  const angles = [0, .25, .5, .75, 1].map(progress => sample('front-back', progress).azimuth);
  assert.deepEqual(angles, [-30, 30, 150, 210, 330]);
  assert.ok(sample('front-back', .01).azimuth - angles[0] < 1, 'the first sweep eases in');
  assert.ok(angles[1] - sample('front-back', .24).azimuth < 1, 'the first sweep eases out');
  assert.ok(Math.abs(angles[4] - angles[0] - 360) < .001, 'the preview loop closes on its starting angle');
});

test('detail tour stays close enough to frame the collar, chest, and sleeve', () => {
  assert.deepEqual([0, .3, .65, 1].map(progress => sample('detail', progress).distance), [72, 56, 63, 72]);
  assert.ok(sample('detail', .3).distance < sample('social', .3).distance);
  assert.ok(sample('detail', .65).target[0] > sample('detail', .3).target[0]);
});

test('social cover makes three continuous turns while rapidly approaching, then settles back', () => {
  const [start, firstTurn, middle, secondTurn, arrival, close, settled, finish] = [0, .095, .19, .285, .38, .52, .68, 1].map(progress => sample('social', progress));
  assert.deepEqual([start.azimuth, firstTurn.azimuth, middle.azimuth, secondTurn.azimuth, arrival.azimuth], [-1080, -911.25, -540, -168.75, 0]);
  assert.deepEqual([start.distance, middle.distance, arrival.distance, close.distance, settled.distance, finish.distance], [420, 252, 84, 78, 108, 108]);
  assert.ok(start.distance > firstTurn.distance && firstTurn.distance > middle.distance && middle.distance > secondTurn.distance && secondTurn.distance > arrival.distance, 'the camera moves inward during every turn');
  assert.ok(sample('social', .01).distance > 419, 'the entrance eases in');
  assert.ok(sample('social', .37).distance < 85, 'the entrance eases out');
  assert.equal(sample('social', 0, 'counterclockwise').azimuth, 1080);
  assert.ok(sample('social', .6).distance > close.distance && sample('social', .6).distance < settled.distance);
});

test('product story pans across four close-ups on both the front and back', () => {
  const poses = [0, .08, .18, .28, .38, .5, .58, .68, .78, .88, 1].map(progress => sample('story', progress));
  const [front, frontTop, frontLeft, frontBottom, frontRight, back, backTop, backLeft, backBottom, backRight, finish] = poses;
  assert.deepEqual([frontTop, frontLeft, frontBottom, frontRight, backTop, backLeft, backBottom, backRight].map(pose => pose.distance), [62, 60, 64, 60, 62, 60, 64, 60]);
  assert.ok([frontTop, frontLeft, frontBottom, frontRight].every(pose => pose.distance < front.distance));
  assert.ok([backTop, backLeft, backBottom, backRight].every(pose => pose.distance < back.distance));
  assert.ok(frontTop.target[1] > .25 && frontBottom.target[1] < -.25);
  assert.ok(backTop.target[1] > .25 && backBottom.target[1] < -.25);
  assert.ok(frontLeft.target[0] < -.25 && frontRight.target[0] > .25);
  assert.ok(backLeft.target[0] > .25 && backRight.target[0] < -.25, 'screen left and right reverse behind the garment');
  assert.equal(back.azimuth, 180);
  assert.equal(finish.azimuth, 360);
});
