// ツール仕様: 概要=表現効果を追加する特殊ブラシ群。スタンプや粒状感、物理風の挙動を備えます。 入力=ペン/マウスのポインタイベント、筆圧/速度、必要に応じて修飾キー。 出力=質感や模様を含むストロークやスタンプ。 操作=左ドラッグで効果を適用し、移動でパラメータが更新、離して確定。
/**
 * GPU Instanced Stamps（GPUインスタンス描画）
 * - スタンプ（テクスチャ付き矩形）をインスタンシングで一括描画
 * - 大量スタンプを高速化（1ドローあたり数千〜数万）
 * - 既存エンジンのダメージ通知（expandPendingRectByRect）と併用可能
 *
 * 使い方（概要）:
 *   const gpu = makeGpuInstancedStamps(glCanvas, { maxInstances: 20000 });
 *   await gpu.setAtlas(imageBitmapOrHTMLImageElement); // アトラス設定（1枚）
 *   // 1フレーム中:
 *   gpu.beginFrame();
 *   gpu.pushStamp({ x, y, angle, sx, sy, uv: {u0,v0,u1,v1}, color: '#000', opacity: 1 });
 *   // ... pushStamp を多数
 *   gpu.flush(); // or gpu.endFrame();
 *
 * 既存ツール連携（例）:
 *   const tool = makeGpuInstancedStampBrush(store, gpu);
 *   tool.onPointerDown(gpu, ev, eng);  // ctx の代わりに gpu を渡す
 *   tool.onPointerMove(gpu, ev, eng);
 *   tool.onPointerUp(gpu, ev, eng);
 */

export function makeGpuInstancedStamps(canvas, opts = {}) {
  // ======== 基本設定 ========
  const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: true });
  if (!gl) throw new Error('WebGL2 not available');

  const state = {
    maxInstances: clampInt(opts.maxInstances ?? 20000, 256, 2000000),
    // バッファは必要に応じて自動拡張
    atlas: null,
    atlasSize: { w: 1, h: 1 },
    count: 0,
    shader: null,
    vao: null,
    quadVbo: null,
    instBufs: {
      posSize: null, // vec4: x, y, sx, sy   （px）
      rot: null,     // vec2: cos, sin
      uvRect: null,  // vec4: u0, v0, u1, v1
      color: null,   // vec4: r, g, b, a（プリマルチ、0..1）
    },
    arrays: {
      posSize: null,
      rot: null,
      uvRect: null,
      color: null,
    },
    damageAabb: null, // {x,y,w,h}（pushStamp 累積）
  };

  // ======== 初期化 ========
  setupGL();
  setupProgram();
  setupBuffers(state.maxInstances);

  // ======== 公開API ========
  const api = {
    canvas,
    gl,

    setAtlas(image) {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true); // アトラステクスチャはプリマルチ前提推奨
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      gl.bindTexture(gl.TEXTURE_2D, null);

      state.atlas = tex;
      state.atlasSize = { w: image.width || 1, h: image.height || 1 };
    },

    resize(width, height) {
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        gl.viewport(0, 0, width, height);
      }
    },

    clear(r = 0, g = 0, b = 0, a = 0) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(r, g, b, a);
      gl.clear(gl.COLOR_BUFFER_BIT);
    },

    beginFrame() {
      state.count = 0;
      state.damageAabb = null;
    },

    // stamp: { x, y, angle, sx, sy, uv:{u0,v0,u1,v1}, color:'#RRGGBB'|{r,g,b}, opacity:0..1 }
    pushStamp(stamp) {
      if (state.count >= state.maxInstances) {
        // バッファ拡張（倍々で）
        growBuffers(Math.ceil(state.maxInstances * 1.5));
      }
      const i = state.count++;
      const angle = Number.isFinite(stamp.angle) ? stamp.angle : 0;
      const c = Math.cos(angle), s = Math.sin(angle);
      const sx = Math.max(0.5, stamp.sx || 8);
      const sy = Math.max(0.5, stamp.sy || sx);

      // UV
      const uv = normalizeUv(stamp.uv, state.atlasSize);

      // 色（プリマルチ）
      const col = typeof stamp.color === 'string' ? hexToRgb(stamp.color) : (stamp.color || { r: 0, g: 0, b: 0 });
      const a = clamp(Number(stamp.opacity ?? 1), 0, 1);
      const r = clamp(col.r / 255, 0, 1) * a;
      const g = clamp(col.g / 255, 0, 1) * a;
      const b = clamp(col.b / 255, 0, 1) * a;

      // 書き込み
      writeVec4(state.arrays.posSize, i, stamp.x || 0, stamp.y || 0, sx, sy);
      writeVec2(state.arrays.rot, i, c, s);
      writeVec4(state.arrays.uvRect, i, uv.u0, uv.v0, uv.u1, uv.v1);
      writeVec4(state.arrays.color, i, r, g, b, a);

      // ダメージ（回転矩形のAABB）
      const rx = Math.abs(c) * sx + Math.abs(s) * sy;
      const ry = Math.abs(s) * sx + Math.abs(c) * sy;
      const pad = 2;
      state.damageAabb = unionAabb(state.damageAabb, {
        x: Math.floor(stamp.x - rx - pad),
        y: Math.floor(stamp.y - ry - pad),
        w: Math.ceil(rx * 2 + pad * 2),
        h: Math.ceil(ry * 2 + pad * 2),
      });
    },

    flush() {
      if (!state.atlas || state.count === 0) return null;

      gl.useProgram(state.shader.prog);
      gl.bindVertexArray(state.vao);

      // UBO/Uniform
      gl.uniform2f(state.shader.uResolution, canvas.width, canvas.height);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, state.atlas);
      gl.uniform1i(state.shader.uAtlas, 0);

      // 転送（必要分だけ）
      gl.bindBuffer(gl.ARRAY_BUFFER, state.instBufs.posSize);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, state.arrays.posSize.subarray(0, state.count * 4));
      gl.bindBuffer(gl.ARRAY_BUFFER, state.instBufs.rot);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, state.arrays.rot.subarray(0, state.count * 2));
      gl.bindBuffer(gl.ARRAY_BUFFER, state.instBufs.uvRect);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, state.arrays.uvRect.subarray(0, state.count * 4));
      gl.bindBuffer(gl.ARRAY_BUFFER, state.instBufs.color);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, state.arrays.color.subarray(0, state.count * 4));

      // 描画（インスタンス）
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, state.count);

      gl.bindVertexArray(null);
      gl.bindTexture(gl.TEXTURE_2D, null);

      const rect = state.damageAabb ? { ...state.damageAabb } : null;
      state.count = 0;
      state.damageAabb = null;
      return rect;
    },

    endFrame() {
      return this.flush();
    },
  };

  return api;

  // ====== 初期化詳細 =======================================================
  function setupGL() {
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    // プリマルチαの over
    gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  function setupProgram() {
    const vsSrc = `#version 300 es
      layout(location=0) in vec2 aPos;          // -0.5..0.5 の正方形
      layout(location=1) in vec4 aPosSize;      // x,y,sx,sy  (px)
      layout(location=2) in vec2 aRot;          // cos,sin
      layout(location=3) in vec4 aUvRect;       // u0,v0,u1,v1
      layout(location=4) in vec4 aColor;        // premul RGBA

      uniform vec2 uResolution;

      out vec2 vUv;
      out vec4 vColor;

      void main(){
        // 回転・スケール
        vec2 p = aPos * vec2(aPosSize.z, aPosSize.w);
        vec2 r = vec2(
          p.x * aRot.x - p.y * aRot.y,
          p.x * aRot.y + p.y * aRot.x
        );
        vec2 world = r + aPosSize.xy;

        // pixel → NDC
        vec2 ndc = (world / uResolution) * 2.0 - 1.0;
        ndc.y = -ndc.y;

        gl_Position = vec4(ndc, 0.0, 1.0);

        // UV: aPos(-0.5..0.5) → 0..1 → uvRectでスケール
        vec2 t = aPos + 0.5;
        vUv = mix(aUvRect.xy, aUvRect.zw, t);
        vColor = aColor;
      }
    `;
    const fsSrc = `#version 300 es
      precision mediump float;
      in vec2 vUv;
      in vec4 vColor;
      uniform sampler2D uAtlas;
      out vec4 outColor;
      void main(){
        vec4 tex = texture(uAtlas, vUv); // （アトラスはプリマルチ推奨）
        // vColor もプリマルチ → 乗算でOK
        outColor = tex * vColor;
      }
    `;

    const prog = link(gl, vsSrc, fsSrc);
    const uResolution = gl.getUniformLocation(prog, 'uResolution');
    const uAtlas = gl.getUniformLocation(prog, 'uAtlas');
    state.shader = { prog, uResolution, uAtlas };

    // ベースQuad（-0.5〜0.5）
    const quad = new Float32Array([
      -0.5,-0.5,  0.5,-0.5,  0.5, 0.5,
      -0.5,-0.5,  0.5, 0.5, -0.5, 0.5,
    ]);
    state.quadVbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, state.quadVbo);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);

    // VAO
    state.vao = gl.createVertexArray();
    gl.bindVertexArray(state.vao);

    // slot 0: quad
    gl.bindBuffer(gl.ARRAY_BUFFER, state.quadVbo);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    gl.bindVertexArray(null);
  }

  function setupBuffers(n) {
    // CPU 側アレイ
    state.arrays.posSize = new Float32Array(n * 4);
    state.arrays.rot     = new Float32Array(n * 2);
    state.arrays.uvRect  = new Float32Array(n * 4);
    state.arrays.color   = new Float32Array(n * 4);

    // GPU 側バッファ
    state.instBufs.posSize = gl.createBuffer();
    state.instBufs.rot     = gl.createBuffer();
    state.instBufs.uvRect  = gl.createBuffer();
    state.instBufs.color   = gl.createBuffer();

    // レイアウト（VAOへ）
    gl.bindVertexArray(state.vao);

    // posSize (loc=1)
    gl.bindBuffer(gl.ARRAY_BUFFER, state.instBufs.posSize);
    gl.bufferData(gl.ARRAY_BUFFER, state.arrays.posSize.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(1, 1);

    // rot (loc=2)
    gl.bindBuffer(gl.ARRAY_BUFFER, state.instBufs.rot);
    gl.bufferData(gl.ARRAY_BUFFER, state.arrays.rot.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(2, 1);

    // uvRect (loc=3)
    gl.bindBuffer(gl.ARRAY_BUFFER, state.instBufs.uvRect);
    gl.bufferData(gl.ARRAY_BUFFER, state.arrays.uvRect.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 4, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(3, 1);

    // color (loc=4)
    gl.bindBuffer(gl.ARRAY_BUFFER, state.instBufs.color);
    gl.bufferData(gl.ARRAY_BUFFER, state.arrays.color.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4, 4, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(4, 1);

    gl.bindVertexArray(null);
  }

  function growBuffers(newCap) {
    newCap = clampInt(newCap, state.maxInstances + 1, 2000000);
    state.maxInstances = newCap;
    setupBuffers(newCap);
  }

  // ====== ヘルパ ===========================================================
  function link(gl, vs, fs) {
    const prog = gl.createProgram();
    const sv = gl.createShader(gl.VERTEX_SHADER);
    const sf = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(sv, vs);
    gl.shaderSource(sf, fs);
    gl.compileShader(sv);
    gl.compileShader(sf);
    if (!gl.getShaderParameter(sv, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sv) || 'VS compile error');
    if (!gl.getShaderParameter(sf, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sf) || 'FS compile error');
    gl.attachShader(prog, sv);
    gl.attachShader(prog, sf);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || 'Link error');
    gl.deleteShader(sv);
    gl.deleteShader(sf);
    return prog;
  }

  function writeVec2(arr, i, a, b) {
    const k = i * 2; arr[k] = a; arr[k + 1] = b;
  }
  function writeVec4(arr, i, a, b, c, d) {
    const k = i * 4; arr[k] = a; arr[k + 1] = b; arr[k + 2] = c; arr[k + 3] = d;
  }
  function hexToRgb(hex) {
    const n = (hex && hex[0] === '#') ? hex.slice(1) : (hex || '');
    const s = n.length === 3 ? n.replace(/(.)/g, '$1$1') : n;
    const v = Number.isNaN(parseInt(s, 16)) ? 0 : parseInt(s, 16);
    return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
  }
  function normalizeUv(uv, atlas) {
    if (!uv) return { u0: 0, v0: 0, u1: 1, v1: 1 };
    if ('u0' in uv) return uv;
    // px 指定 {x,y,w,h} → 正規化
    const u0 = (uv.x || 0) / atlas.w;
    const v0 = (uv.y || 0) / atlas.h;
    const u1 = (uv.x + (uv.w || atlas.w)) / atlas.w;
    const v1 = (uv.y + (uv.h || atlas.h)) / atlas.h;
    return { u0, v0, u1, v1 };
  }
  function unionAabb(a, b) {
    if (!b) return a || null;
    if (!a) return { ...b };
    const x1 = Math.min(a.x, b.x);
    const y1 = Math.min(a.y, b.y);
    const x2 = Math.max(a.x + a.w, b.x + b.w);
    const y2 = Math.max(a.y + a.h, b.y + b.h);
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function clampInt(v, lo, hi) { v = v | 0; return v < lo ? lo : (v > hi ? hi : v); }
}
/* =======================================================================================
 * 参考ツール：GPUスタンプブラシ（距離主導）
 * - 既存の onPointerDown/Move/Up 様式に合わせた薄いラッパ
 * - ctx の代わりに gpu (makeGpuInstancedStamps の戻り値) を受け取ります
 * - ダメージは eng.expandPendingRectByRect に集約して通知
 * =======================================================================================
 */
export function makeGpuInstancedStampBrush(store, gpu) {
  const id = 'gpu-instanced-brush';
  let drawing = false;
  let last = null;
  let acc = 0;
  let aabb = null;

  const DEFAULTS = {
    brushSize: 24,
    spacingRatio: 0.5,      // Δs = w/2 基準
    opacity: 1.0,
    atlasUv: { u0: 0, v0: 0, u1: 1, v1: 1 }, // 1枚全体
  };

  return {
    id,
    cursor: 'crosshair',
    previewRect: null,

    onPointerDown(_ctxIgnored, ev, eng) {
      if (!gpu) return;
      eng.clearSelection?.();
      eng.beginStrokeSnapshot?.();

      drawing = true;
      last = { ...ev.img };
      acc = 0;
      aabb = null;

      const s = getState(store, id, DEFAULTS);
      gpu.beginFrame();
      pushOne(last.x, last.y, 0, s); // 起点
    },

    onPointerMove(_ctxIgnored, ev) {
      if (!drawing || !gpu || !last) return;
      const s = getState(store, id, DEFAULTS);

      let px = last.x, py = last.y;
      const qx = ev.img.x, qy = ev.img.y;
      let dx = qx - px, dy = qy - py;
      let dist = Math.hypot(dx, dy);
      if (dist === 0) return;

      const spacing = Math.max(1, s.spacingRatio * s.brushSize);
      while (acc + dist >= spacing) {
        const t = (spacing - acc) / dist;
        const nx = px + dx * t;
        const ny = py + dy * t;
        const ang = Math.atan2(qy - py, qx - px); // 進行方向で回転
        pushOne(nx, ny, ang, s);
        px = nx; py = ny;
        dx = qx - px; dy = qy - py;
        dist = Math.hypot(dx, dy);
        acc = 0;
      }
      acc += dist;
      last = { x: qx, y: qy };
    },

    onPointerUp(_ctxIgnored, ev, eng) {
      if (!drawing || !gpu) return;
      drawing = false;

      // 終端を詰める
      const s = getState(store, id, DEFAULTS);
      let px = last.x, py = last.y;
      const qx = ev.img.x, qy = ev.img.y;
      let dx = qx - px, dy = qy - py;
      let dist = Math.hypot(dx, dy);
      const spacing = Math.max(1, s.spacingRatio * s.brushSize);

      if (dist > 0) {
        while (acc + dist >= spacing) {
          const t = (spacing - acc) / dist;
          const nx = px + dx * t;
          const ny = py + dy * t;
          const ang = Math.atan2(qy - py, qx - px);
          pushOne(nx, ny, ang, s);
          px = nx; py = ny;
          dx = qx - px; dy = qy - py;
          dist = Math.hypot(dx, dy);
          acc = 0;
        }
      }

      // 実描画（GPUドロー）
      const rect = gpu.endFrame(); // flush
      if (rect) {
        aabb = unionAabb(aabb, rect);
        eng.expandPendingRectByRect?.(aabb.x, aabb.y, aabb.w, aabb.h);
      }

      last = null;
      acc = 0;
      aabb = null;

      (eng.commitStrokeSnapshot?.() || eng.endStrokeSnapshot?.());
    },

    drawPreview() {}, // GPUで確定描画するためプレビューは省略
  };

  function pushOne(x, y, angle, s) {
    // スタンプ寸法（正方形2三角形）
    const w = Math.max(1, s.brushSize);
    const sx = w * 0.5;
    const sy = sx;

    gpu.pushStamp({
      x, y, angle,
      sx, sy,
      uv: s.atlasUv,
      color: s.primaryColor || '#000',
      opacity: s.opacity,
    });

    // ダメージは flush 後にまとめて通知するが、AABB は先に積んでおく
    const c = Math.cos(angle), si = Math.sin(angle);
    const rx = Math.abs(c) * sx + Math.abs(si) * sy;
    const ry = Math.abs(si) * sx + Math.abs(c) * sy;
    const pad = 2;
    aabb = unionAabb(aabb, {
      x: Math.floor(x - rx - pad),
      y: Math.floor(y - ry - pad),
      w: Math.ceil(rx * 2 + pad * 2),
      h: Math.ceil(ry * 2 + pad * 2),
    });
  }

  function getState(store, id, defs) {
    const s = store.getToolState(id) || {};
    return {
      brushSize: clamp(Number(s.brushSize ?? defs.brushSize), 1, 512),
      spacingRatio: Number.isFinite(s.spacingRatio) ? s.spacingRatio : defs.spacingRatio,
      opacity: clamp(Number(s.opacity ?? defs.opacity), 0, 1),
      atlasUv: s.atlasUv || defs.atlasUv,
      primaryColor: s.primaryColor || '#000',
    };
  }
  function unionAabb(a, b) {
    if (!b) return a || null;
    if (!a) return { ...b };
    const x1 = Math.min(a.x, b.x);
    const y1 = Math.min(a.y, b.y);
    const x2 = Math.max(a.x + a.w, b.x + b.w);
    const y2 = Math.max(a.y + a.h, b.y + b.h);
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
}
