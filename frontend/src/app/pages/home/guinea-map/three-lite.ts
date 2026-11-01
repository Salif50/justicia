/* Sous-ensemble de Three.js réellement utilisé par la carte :
   importé à la demande pour que le bundle reste léger (tree-shaking). */
export {
  BufferGeometry, Color, Float32BufferAttribute, Group, PerspectiveCamera, Plane, Points, Raycaster,
  Scene, ShaderMaterial, Vector2, Vector3, WebGLRenderer,
} from 'three';
