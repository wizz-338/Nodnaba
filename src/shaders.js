export const vert = `
attribute vec2 a_pos;
void main(){ gl_Position = vec4(a_pos, 0.0, 1.0); }
`

// The key illustration as a living background: cover-fitted, panned by
// scroll, swayed by scroll velocity, bent by a pointer lens, RGB-split and
// torn into bands during glitch bursts.
export const frag = `
precision highp float;
uniform sampler2D u_tex;
uniform vec2 u_img;
uniform vec2 u_res;
uniform float u_time;
uniform float u_pan;
uniform float u_vel;
uniform vec2 u_pointer;
uniform float u_glitch;
uniform float u_dim;
uniform float u_fade;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main(){
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 p = (gl_FragCoord.xy - 0.5 * u_res) / min(u_res.x, u_res.y);

  // Show at least ~36% of the illustration's width so the character stays
  // readable on tall phones; the rows above and below smear into streaks.
  float sa = u_res.x / u_res.y;
  float ia = u_img.x / u_img.y;
  vec2 span = sa < ia ? vec2(sa / ia, 1.0) : vec2(1.0, ia / sa);
  span /= 1.06;
  if (span.x < 0.36) span = vec2(0.36, 0.36 * ia / sa);

  // pan from the face toward the logo while scrolling
  float cx = clamp(mix(0.5, 0.16, u_pan), span.x * 0.5, 1.0 - span.x * 0.5);
  vec2 q = uv - 0.5;

  // space sways harder while scrolling
  float sway = 0.003 + abs(u_vel) * 0.012;
  q.x += sin(q.y * 9.0 + u_time * 0.6) * sway;
  q.y += sin(q.x * 7.0 - u_time * 0.4) * sway * 0.6;

  // pointer lens
  vec2 d = p - u_pointer;
  q -= d * min(u_res.x, u_res.y) / u_res * 0.22 * exp(-dot(d, d) * 9.0);

  // torn bands
  float row = floor(uv.y * 34.0);
  float tear = step(0.5, u_glitch) * step(0.8, hash(vec2(row, floor(u_time * 24.0))));
  q.x += tear * (hash(vec2(row, u_time)) - 0.5) * 0.12;
  // a faint idle tear line that drifts down the screen
  float line = smoothstep(0.012, 0.0, abs(fract(uv.y + u_time * 0.07) - 0.5));
  q.x += line * 0.006;

  vec2 t = vec2(cx, 0.5) + q * span;
  // outside the picture: pixel-sorted streaks with a little jitter
  float outside = max(-t.y, t.y - 1.0);
  t.x += step(0.0, outside) * (hash(vec2(floor(gl_FragCoord.x * 0.25), 1.0)) - 0.5) * 0.01;
  t = clamp(t, 0.001, 0.999);

  float split = 0.0012 + abs(u_vel) * 0.003 + u_glitch * 0.006;
  vec3 col;
  col.r = texture2D(u_tex, t + vec2(split, 0.0)).r;
  col.g = texture2D(u_tex, t).g;
  col.b = texture2D(u_tex, t - vec2(split, 0.0)).b;

  // glitch tint on torn bands
  col = mix(col, col.gbr * 1.2, tear * 0.6);

  // grade toward the illustration's palette: inky shadows, sakura lift
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(col, vec3(l) * vec3(1.05, 0.9, 0.95), 0.12);
  col += vec3(0.07, 0.0, 0.02) * (1.0 - l);

  // scan + vignette + dim
  col *= 0.94 + 0.06 * sin(gl_FragCoord.y * 3.14159);
  col *= 1.0 - dot(uv - 0.5, uv - 0.5) * 1.3;
  col *= 1.0 - smoothstep(0.0, 0.35, outside) * 0.75;
  col *= u_dim * u_fade;

  gl_FragColor = vec4(col, 1.0);
}
`
