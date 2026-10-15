export const vert = `
attribute vec2 a_pos;
void main(){ gl_Position = vec4(a_pos, 0.0, 1.0); }
`

// Domain-warped indigo nebula + a bending checkerboard corridor (floor and
// ceiling) that sways with time, scroll velocity and the pointer lens.
export const frag = `
precision highp float;
uniform vec2 u_res;
uniform float u_time;
uniform float u_scroll;
uniform float u_vel;
uniform vec2 u_pointer;
uniform float u_glitch;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x),
             mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 4; i++){ v += a * noise(p); p = m * p; a *= 0.5; }
  return v;
}

void main(){
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 p = (gl_FragCoord.xy - 0.5 * u_res) / min(u_res.x, u_res.y);

  // glitch: torn horizontal bands
  float row = floor(uv.y * 28.0);
  float tear = step(0.5, u_glitch) * step(0.86, hash(vec2(row, floor(u_time * 24.0))));
  p.x += tear * (hash(vec2(row, u_time)) - 0.5) * 0.35;

  // pointer lens
  vec2 d = p - u_pointer;
  p -= d * 0.32 * exp(-dot(d, d) * 7.0);

  // the whole space sways harder while scrolling
  float sway = 0.05 + abs(u_vel) * 0.35;
  p.y += sin(p.x * 2.2 + u_time * 0.35 + u_scroll * 0.8) * sway * 0.5;
  p.x += sin(p.y * 3.0 - u_time * 0.25) * sway * 0.25;

  float t = u_time * 0.05;
  vec2 q = vec2(fbm(p * 1.3 + t), fbm(p * 1.3 - t + 5.2));
  vec2 w = vec2(fbm(p * 1.1 + 3.0 * q + vec2(1.7, 9.2) + t * 1.5 + u_scroll * 0.25),
                fbm(p * 1.1 + 3.0 * q + vec2(8.3, 2.8) - t));
  float f = fbm(p + 2.6 * w);

  vec3 col = mix(vec3(0.016, 0.02, 0.07), vec3(0.08, 0.13, 0.48), f * f * 1.8);
  col = mix(col, vec3(0.20, 0.32, 0.95), clamp(length(q) * 0.6 - 0.3, 0.0, 1.0) * 0.55);
  col = mix(col, vec3(1.0, 0.45, 0.75), clamp(w.x * w.x * 1.1 - 0.42, 0.0, 1.0) * 0.55);

  // checkerboard corridor
  float ay = abs(p.y);
  float z = 0.26 / max(ay, 0.015);
  vec2 g = vec2(p.x * z, z + u_time * 0.32 + u_scroll * 1.2);
  g.x += sin(g.y * 0.33 + u_time * 0.4) * 0.9 + sin(g.y * 0.11 - u_time * 0.17) * 1.8;
  vec2 c = floor(g);
  float checker = mod(c.x + c.y, 2.0);
  vec2 e = abs(fract(g) - 0.5);
  float edge = smoothstep(0.44, 0.5, max(e.x, e.y));
  float fog = exp(-z * 0.16) * smoothstep(0.03, 0.22, ay);
  float ceil = p.y > 0.0 ? 0.45 : 1.0;
  vec3 tile = mix(vec3(0.05, 0.06, 0.2), vec3(0.85, 0.86, 1.0), checker);
  col = mix(col, tile, fog * 0.22 * ceil);
  col += mix(vec3(0.5, 0.75, 1.0), vec3(1.0, 0.5, 0.8), fract(c.y * 0.13)) * edge * fog * 0.35 * ceil;

  // horizon seam
  col += vec3(0.55, 0.6, 1.0) * exp(-ay * 26.0) * 0.28;

  // glitch tint
  col = mix(col, col.brg * 1.3, tear * 0.8);

  // vignette
  col *= 1.0 - dot(uv - 0.5, uv - 0.5) * 1.1;
  gl_FragColor = vec4(col, 1.0);
}
`
