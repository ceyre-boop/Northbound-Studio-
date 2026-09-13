import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('http://localhost:8099/index.html', { waitUntil: 'networkidle' });
const result = await page.evaluate(async () => {
  const Loops = await import('/js/gl/offering-loops.js');
  const GL = window.NB_GL;
  const canvas = document.createElement('canvas');
  canvas.width = 4; canvas.height = 4;
  const gl = canvas.getContext('webgl');
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,3,-1,-1,3]), gl.STATIC_DRAW);
  const out = {};
  for (let idx=0; idx<Loops.COUNT; idx++) {
    const prog = GL.buildProgram(gl, Loops.VERT, Loops.loopSource(idx), 'w'+idx, {a_pos:0});
    const uT = gl.getUniformLocation(prog,'u_t');
    const uI = gl.getUniformLocation(prog,'u_intensity');
    const uRes = gl.getUniformLocation(prog,'u_res');
    gl.viewport(0,0,1,1);
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
    gl.useProgram(prog);
    function render(t){
      gl.uniform1f(uT,t); gl.uniform1f(uI,0.7); gl.uniform2f(uRes,128,128);
      gl.drawArrays(gl.TRIANGLES,0,3);
      const px = new Uint8Array(4);
      gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,px);
      return px;
    }
    const results = [];
    for (const eps of [0.001, 0.00001, 0.0000001]) {
      const a = render(1.0-eps), b = render(0.0+eps);
      let maxDiff=0;
      for (let k=0;k<a.length;k++) maxDiff=Math.max(maxDiff, Math.abs(a[k]-b[k]));
      results.push({eps, maxDiff});
    }
    out[idx]=results;
  }
  return out;
});
console.log(JSON.stringify(result));
await browser.close();
