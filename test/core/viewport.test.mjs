import test from 'node:test';
import assert from 'node:assert/strict';

import { Viewport } from '../../src/core/viewport.js';

const approxEqual = (a, b, epsilon = 1e-6) => Math.abs(a - b) <= epsilon;

test('zoomAt preserves the anchor point and respects zoom bounds', () => {
  const vp = new Viewport({ zoom: 1.5, panX: 25, panY: -10 });
  vp.setZoomBounds(0.5, 4);

  const anchor = vp.screenToImage(120, 80);
  const zoom = vp.zoomAt(120, 80, 10);

  assert.equal(zoom, 4, 'zoom should be clamped to the configured maximum');

  const after = vp.imageToScreen(anchor.x, anchor.y);
  assert.ok(approxEqual(after.x, 120), 'anchor x position should remain stable');
  assert.ok(approxEqual(after.y, 80), 'anchor y position should remain stable');
});

test('containment clamps panning when the image is larger than the viewport', () => {
  const vp = new Viewport({ zoom: 1 });
  vp.setViewportSize(500, 400);
  vp.setImageSize(1000, 800);
  vp.setContainImage(true);

  vp.setPan(0, 0);
  const { panX, panY } = vp.panBy(-1000, -1000);

  assert.equal(panX, -500);
  assert.equal(panY, -400);
});

test('containment recentres smaller images with padding applied', () => {
  const vp = new Viewport({ zoom: 0.5 });
  vp.setViewportSize(400, 400);
  vp.setImageSize(200, 200);
  vp.setContainImage(true, { padding: 20 });

  assert.equal(vp.panX, 150);
  assert.equal(vp.panY, 150);
});

test('fitToScreen positions the image centre with padding and updates sizes', () => {
  const vp = new Viewport();
  const result = vp.fitToScreen(
    400,
    200,
    { width: 800, height: 400 },
    { padding: 20 }
  );

  assert.equal(result.zoom, 1.8);
  assert.equal(vp.zoom, 1.8);
  assert.equal(vp.imageWidth, 400);
  assert.equal(vp.imageHeight, 200);
  assert.equal(vp.screenWidth, 800);
  assert.equal(vp.screenHeight, 400);

  const centre = vp.imageToScreen(200, 100);
  assert.ok(approxEqual(centre.x, 400));
  assert.ok(approxEqual(centre.y, 200));
});
