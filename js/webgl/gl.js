/* ============================================================
   webgl/gl.js — WebGL2 helpers. Every function fails safe:
   returns null instead of throwing, so callers can fall back.
   ============================================================ */

export function getGL(canvas) {
  const opts = {
    alpha: true,
    antialias: false, // we do our own soft points; AA costs fill rate
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    powerPreference: "high-performance",
    failIfMajorPerformanceCaveat: false,
    preserveDrawingBuffer: false,
  };
  try {
    const gl = canvas.getContext("webgl2", opts);
    return gl || null;
  } catch (e) {
    return null;
  }
}

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.warn("[northbound] shader compile error:", gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

export function createProgram(gl, vertSrc, fragSrc) {
  const vs = compile(gl, gl.VERTEX_SHADER, vertSrc);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fragSrc);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.warn("[northbound] program link error:", gl.getProgramInfoLog(prog));
    gl.deleteProgram(prog);
    return null;
  }
  return prog;
}

/* Cache uniform + attribute locations for a program. */
export function locations(gl, prog, uniforms = [], attribs = []) {
  const u = {};
  const a = {};
  for (const name of uniforms) u[name] = gl.getUniformLocation(prog, name);
  for (const name of attribs) a[name] = gl.getAttribLocation(prog, name);
  return { u, a };
}

export function buffer(gl, data, usage) {
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, data, usage || gl.STATIC_DRAW);
  return buf;
}
