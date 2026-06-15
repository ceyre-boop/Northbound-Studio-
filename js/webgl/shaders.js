/* ============================================================
   webgl/shaders.js — GLSL ES 3.00 sources as inline strings.
   Inline (not fetched) so the engine works offline / from file://.
   ============================================================ */

/* ---------- Nebula: fullscreen triangle, domain-warped fbm ---------- */
export const NEBULA_VERT = `#version 300 es
precision highp float;
const vec2 verts[3] = vec2[3](vec2(-1.0,-1.0), vec2(3.0,-1.0), vec2(-1.0,3.0));
out vec2 vUv;
void main(){
  vec2 p = verts[gl_VertexID];
  vUv = p * 0.5 + 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}`;

export const NEBULA_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform float uTime;
uniform vec2  uMouse;
uniform vec2  uRes;
uniform float uScroll;
uniform float uTier;
out vec4 frag;

float hash(vec2 p){ p = fract(p*vec2(123.34,345.45)); p += dot(p,p+34.345); return fract(p.x*p.y); }
float noise(vec2 p){
  vec2 i=floor(p), f=fract(p);
  float a=hash(i), b=hash(i+vec2(1.0,0.0)), c=hash(i+vec2(0.0,1.0)), d=hash(i+vec2(1.0,1.0));
  vec2 u=f*f*(3.0-2.0*f);
  return mix(mix(a,b,u.x),mix(c,d,u.x),u.y);
}
float fbm(vec2 p){
  float v=0.0, a=0.5;
  // tier 0 uses fewer octaves for weak GPUs
  int oct = uTier < 0.5 ? 3 : 5;
  for(int i=0;i<5;i++){
    if(i>=oct) break;
    v += a*noise(p); p*=2.0; a*=0.5;
  }
  return v;
}
void main(){
  vec2 uv = vUv;
  float aspect = uRes.x/max(uRes.y,1.0);
  vec2 p = (uv-0.5)*vec2(aspect,1.0)*2.4;
  float t = uTime*0.03;
  vec2 q = vec2(fbm(p + t), fbm(p + vec2(5.2,1.3) - t));
  vec2 r = vec2(fbm(p + 2.0*q + vec2(1.7,9.2) + 0.15*t),
                fbm(p + 2.0*q + vec2(8.3,2.8) - 0.12*t));
  float f = fbm(p + 2.0*r + uMouse*0.25);
  f += 0.06*sin(uScroll*6.2831 + uv.y*3.0);
  float clouds = smoothstep(0.35, 0.95, f);
  vec3 deep = vec3(0.0, 0.035, 0.055);
  vec3 mid  = vec3(0.0, 0.11, 0.15);
  vec3 hot  = vec3(0.0, 0.52, 0.60);
  vec3 col = mix(deep, mid, clouds);
  col = mix(col, hot, pow(clouds,3.0)*0.55);
  float vig = smoothstep(1.25, 0.2, length((uv-0.5)*vec2(aspect,1.0))*1.3);
  col *= mix(0.22, 1.0, vig);
  col *= 0.92;
  frag = vec4(col, 1.0);
}`;

/* ---------- Stars: GPU points, 3D fly-through, N-formation ---------- */
export const STAR_VERT = `#version 300 es
precision highp float;
in vec3  aPos;     // x,y in clip-ish [-1,1], z depth (0.04..1)
in float aSize;
in float aSeed;
in float aIsN;     // 1 = participates in the N glyph
in vec2  aTarget;  // NDC target position for the N
uniform float uTime;
uniform float uScroll;  // 0..1 page progress
uniform vec2  uMouse;   // -1..1
uniform float uNForm;   // 0..1 how strongly N is assembled
uniform float uDpr;
uniform float uAspect;
out float vAlpha;
out float vSeed;
void main(){
  float z = fract(aPos.z - uScroll * 0.65);
  z = max(z, 0.04);
  float persp = 0.55 / z;
  vec2 p = aPos.xy * persp;
  p += uMouse * (0.10 * (1.0 - z));
  vec2 tgt = vec2(aTarget.x / uAspect, aTarget.y);
  p = mix(p, tgt, clamp(uNForm * aIsN, 0.0, 1.0));
  float tw = 0.55 + 0.45 * sin(uTime * 1.8 + aSeed * 6.2831);
  gl_Position = vec4(p, 0.0, 1.0);
  float size = aSize * persp * (0.6 + 0.4*tw) * uDpr;
  gl_PointSize = clamp(size, 1.0, 36.0);
  vAlpha = clamp((1.0 - z*0.9) * tw, 0.04, 1.0);
  vSeed = aSeed;
}`;

export const STAR_FRAG = `#version 300 es
precision highp float;
in float vAlpha;
in float vSeed;
out vec4 frag;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if(d > 0.5) discard;
  float core = smoothstep(0.5, 0.0, d);
  float glow = pow(core, 2.2);
  vec3 cyan  = vec3(0.0, 0.94, 1.0);
  vec3 white = vec3(0.85, 0.97, 1.0);
  vec3 col = mix(cyan, white, smoothstep(0.45, 1.0, vSeed));
  float a = glow * vAlpha;
  frag = vec4(col * (0.6 + 0.6*glow), a);
}`;
