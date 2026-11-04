/* js/smoke.js — slow drifting smoke behind the page.
 * One fixed canvas, one fragment shader (domain-warped noise), rendered at
 * reduced resolution and capped at 30fps. Reduced-motion visitors get a single
 * still frame; ?motion=full overrides that for checking locally. No WebGL, no
 * smoke: the flat page colour underneath is the fallback. */
(function () {
  var q = /[?&]motion=full\b/.test(location.search);
  var still = !q && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var c = document.createElement('canvas');
  c.setAttribute('aria-hidden', 'true');
  c.className = 'smoke';
  var gl = c.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' });
  if (!gl) return;

  var vs = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
  var fs = [
    'precision mediump float;',
    'uniform vec2 r;uniform float t;',
    'float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}',
    'float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);',
    ' return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}',
    'float fbm(vec2 p){float a=.5,s=0.;for(int i=0;i<5;i++){s+=a*n(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return s;}',
    'void main(){',
    ' vec2 uv=gl_FragCoord.xy/r.y*1.5;',
    ' vec2 q=vec2(fbm(uv+t*.05),fbm(uv+vec2(5.2,1.3)-t*.04));',
    ' vec2 w=vec2(fbm(uv+2.5*q+vec2(1.7,9.2)+t*.06),fbm(uv+2.5*q+vec2(8.3,2.8)-t*.05));',
    ' float f=fbm(uv+2.8*w);',
    ' f=smoothstep(.18,.85,f);',
    ' vec3 lo=vec3(.098,.106,.125);',   /* #191B20  deep smoke */
    ' vec3 mid=vec3(.165,.176,.208);',  /* #2A2D35 */
    ' vec3 hi=vec3(.30,.32,.36);',      /* #4D525C  the pale patches */
    ' vec3 col=mix(lo,mid,smoothstep(0.,.55,f));',
    ' col=mix(col,hi,smoothstep(.55,1.,f)*.75);',
    ' col+=vec3(.0,.01,.03)*q.x;',      /* a breath of blue in the shadows */
    ' gl_FragColor=vec4(col,1.);}'
  ].join('\n');

  function sh(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; }
  var pr = gl.createProgram();
  gl.attachShader(pr, sh(gl.VERTEX_SHADER, vs));
  gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return;
  gl.useProgram(pr);
  var b = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, b);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  var loc = gl.getAttribLocation(pr, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  var ur = gl.getUniformLocation(pr, 'r'), ut = gl.getUniformLocation(pr, 't');

  function size() {
    var s = Math.min(0.5, 900 / Math.max(window.innerWidth, 1));
    c.width = Math.max(2, Math.round(window.innerWidth * s));
    c.height = Math.max(2, Math.round(window.innerHeight * s));
    gl.viewport(0, 0, c.width, c.height);
    gl.uniform2f(ur, c.width, c.height);
  }
  function draw(ms) { gl.uniform1f(ut, ms / 1000); gl.drawArrays(gl.TRIANGLES, 0, 3); }

  var last = 0, raf = 0, t0 = performance.now();
  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (now - last < 33) return;
    last = now; draw(now - t0 + 20000);
  }
  function start() { if (!raf && !still) raf = requestAnimationFrame(loop); }
  function stop() { cancelAnimationFrame(raf); raf = 0; }

  document.body.insertBefore(c, document.body.firstChild);
  size(); draw(26000);
  window.addEventListener('resize', function () { size(); draw(26000); });
  document.addEventListener('visibilitychange', function () { document.hidden ? stop() : start(); });
  start();
})();
