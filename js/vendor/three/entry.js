/* The slice of three.js the homepage uses, and nothing else. Bundled and
   minified once into three-home.min.js by scripts/vendor-three.ts; the site
   itself has no build step and imports that file directly, the same way it
   imports the vendored Lenis. Add a name here, re-run the script, commit
   both. */
export {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Mesh, Object3D,
  BoxGeometry, PlaneGeometry, CylinderGeometry,
  MeshStandardMaterial, MeshBasicMaterial, ShaderMaterial,
  HemisphereLight, DirectionalLight, AmbientLight, PointLight,
  AnimationMixer, LoopOnce, LoopRepeat, Clock,
  Color, Vector2, Vector3, Box3, MathUtils,
  CanvasTexture, TextureLoader, SRGBColorSpace, ACESFilmicToneMapping,
  DoubleSide, Fog, LinearFilter,
} from 'three';
export { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
export { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
