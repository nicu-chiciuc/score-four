import {
  ACESFilmicToneMapping,
  AmbientLight,
  CanvasTexture,
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Raycaster,
  Scene,
  ShadowMaterial,
  SRGBColorSpace,
  TorusGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import type { BufferGeometry, Material, Texture } from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { COLUMNS, columnCells } from "./game";
import type { BeadColor, Cell } from "./game";

const SPACING = 1.24;
const BEAD_HEIGHT = 0.76;
const BASE_TOP = 0.24;
const PEG_TOP = 3.53;
const DEFAULT_CAMERA = new Vector3(6.9, 6.4, 8.4);

function columnPosition(column: number, y: number) {
  return new Vector3(((column % 4) - 1.5) * SPACING, y, (Math.floor(column / 4) - 1.5) * SPACING);
}

function woodTexture(dark: boolean) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not prepare the wood material.");
  const pixels = ctx.createImageData(512, 512);
  const base = dark ? [95, 51, 29] : [208, 171, 112];
  for (let y = 0; y < 512; y++) {
    for (let x = 0; x < 512; x++) {
      const warp = x + 9 * Math.sin(y * 0.012) + 4 * Math.sin(y * 0.037 + x * 0.01);
      const grain = Math.sin(warp * 0.23 + Math.sin(warp * 0.067) * 2);
      const fine = Math.sin(warp * 1.73 + y * 0.004) * 1.6;
      const pore = Math.pow(Math.max(0, Math.sin(warp * 0.57 + Math.sin(y * 0.019))), 18) * 10;
      const noise = (Math.sin(x * 127.1 + y * 311.7) * 43758.5453) % 1;
      const variation = grain * 6 + fine - pore + noise * 2.2;
      const offset = (y * 512 + x) * 4;
      for (let channel = 0; channel < 3; channel++)
        pixels.data[offset + channel] = base[channel] + variation;
      pixels.data[offset + 3] = 255;
    }
  }
  ctx.putImageData(pixels, 0, 0);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function beadGeometry() {
  const profile = [
    [0.067, -0.36],
    [0.21, -0.36],
    [0.285, -0.33],
    [0.345, -0.25],
    [0.365, -0.13],
    [0.37, 0],
    [0.358, 0.17],
    [0.317, 0.29],
    [0.245, 0.35],
    [0.067, 0.36],
    [0.067, -0.36],
  ];
  return new LatheGeometry(
    profile.map(([radius, height]) => new Vector2(radius, height)),
    48,
  );
}

export type SceneState = {
  board: readonly Cell[];
  winningLine: readonly number[];
  currentColor: BeadColor;
  canDrop: boolean;
  preview: boolean;
};

export function createWoodenScene({
  canvas,
  host,
  targets,
  onDrop,
  onHover,
  onContextLost,
}: {
  canvas: HTMLCanvasElement;
  host: HTMLElement;
  targets: Map<number, HTMLButtonElement>;
  onDrop: (column: number) => void;
  onHover: (column: number | null) => void;
  onContextLost: () => void;
}) {
  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: "low-power",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  const scene = new Scene();
  const camera = new PerspectiveCamera(32, 1, 0.1, 70);
  camera.position.copy(DEFAULT_CAMERA);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 1.35, 0);
  controls.enablePan = false;
  controls.minDistance = 9;
  controls.maxDistance = 23;
  controls.minPolarAngle = 0.06;
  controls.maxPolarAngle = Math.PI / 2.25;
  controls.enableDamping = false;
  controls.rotateSpeed = 0.65;
  controls.zoomSpeed = 0.65;
  controls.update();

  const pmrem = new PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, 0.04);
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.55;
  room.dispose();
  pmrem.dispose();
  scene.add(new HemisphereLight(0xfff5df, 0x7c817c, 1.6));
  scene.add(new AmbientLight(0xffffff, 0.15));
  const sun = new DirectionalLight(0xfff4de, 3.4);
  sun.position.set(-4, 9, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -5.5;
  sun.shadow.camera.right = 5.5;
  sun.shadow.camera.top = 5.5;
  sun.shadow.camera.bottom = -5.5;
  sun.shadow.normalBias = 0.025;
  sun.shadow.bias = -0.0001;
  sun.shadow.radius = 5;
  scene.add(sun);
  const fill = new DirectionalLight(0xe4eeff, 0.8);
  fill.position.set(5, 4, -4);
  scene.add(fill);

  const maple = woodTexture(false);
  const walnut = woodTexture(true);
  const makeWood = (texture: Texture, roughness: number) =>
    new MeshPhysicalMaterial({
      map: texture,
      bumpMap: texture,
      bumpScale: 0.004,
      roughness,
      clearcoat: 0.18,
      clearcoatRoughness: 0.4,
    });
  const lightWood = makeWood(maple, 0.42);
  const darkWood = makeWood(walnut, 0.39);
  const baseWood = makeWood(maple, 0.47);
  const base = new Mesh(new RoundedBoxGeometry(5.42, 0.36, 5.42, 4, 0.09), baseWood);
  base.position.y = 0.06;
  base.castShadow = true;
  base.receiveShadow = true;
  scene.add(base);
  const bottom = new Mesh(new RoundedBoxGeometry(5.21, 0.12, 5.21, 3, 0.04), darkWood);
  bottom.position.y = -0.14;
  bottom.castShadow = true;
  scene.add(bottom);

  const floor = new Mesh(new PlaneGeometry(200, 200), new ShadowMaterial({ opacity: 0.19 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.22;
  floor.receiveShadow = true;
  scene.add(floor);

  const pegGeometry = new CylinderGeometry(0.046, 0.051, PEG_TOP - BASE_TOP, 16);
  const pegMaterial = new MeshStandardMaterial({ color: 0xc9ad7f, roughness: 0.52, map: maple });
  const holeGeometry = new TorusGeometry(0.072, 0.008, 6, 24);
  const holeMaterial = new MeshStandardMaterial({ color: 0x806241, roughness: 0.8 });
  const pickGeometry = new CylinderGeometry(0.43, 0.43, PEG_TOP, 12);
  const pickMaterial = new MeshBasicMaterial({ visible: false });
  const pickers: Mesh[] = [];
  const pickerColumns = new Map<Mesh, number>();
  for (let column = 0; column < COLUMNS; column++) {
    const peg = new Mesh(pegGeometry, pegMaterial);
    peg.position.copy(columnPosition(column, BASE_TOP + (PEG_TOP - BASE_TOP) / 2));
    peg.castShadow = true;
    peg.receiveShadow = true;
    scene.add(peg);
    const hole = new Mesh(holeGeometry, holeMaterial);
    hole.position.copy(columnPosition(column, BASE_TOP + 0.004));
    hole.rotation.x = -Math.PI / 2;
    scene.add(hole);
    const picker = new Mesh(pickGeometry, pickMaterial);
    picker.position.copy(columnPosition(column, BASE_TOP + PEG_TOP / 2));
    picker.updateMatrixWorld();
    pickers.push(picker);
    pickerColumns.set(picker, column);
  }

  const geometry = beadGeometry();
  const beads = new Group();
  scene.add(beads);
  const pieces = new Map<number, { mesh: Mesh; color: BeadColor }>();
  const ghostMaterial = new MeshPhysicalMaterial({
    color: 0xe5bf82,
    transparent: true,
    opacity: 0.38,
    roughness: 0.3,
    depthWrite: false,
  });
  const ghost = new Mesh(geometry, ghostMaterial);
  ghost.visible = false;
  scene.add(ghost);
  const haloGeometry = new TorusGeometry(0.385, 0.017, 8, 48);
  const haloMaterial = new MeshBasicMaterial({ color: 0x60796b });
  const halos = new Group();
  scene.add(halos);

  let state: SceneState = {
    board: [],
    winningLine: [],
    currentColor: "ember",
    canDrop: false,
    preview: true,
  };
  let hovered: number | null = null;
  let disposed = false;
  let frame = 0;
  let width = 1;
  let height = 1;
  const drops = new Map<Mesh, { started: number; targetY: number; fromY: number }>();
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  function render(now: number) {
    frame = 0;
    if (disposed) return;
    for (const [mesh, drop] of drops) {
      const progress = Math.min(1, (now - drop.started) / 280);
      mesh.position.y = drop.fromY + (drop.targetY - drop.fromY) * progress * progress;
      if (progress === 1) drops.delete(mesh);
    }
    renderer.render(scene, camera);
    for (const [column, button] of targets) {
      const projected = columnPosition(column, PEG_TOP + 0.31).project(camera);
      button.style.setProperty("--peg-x", `${(projected.x * 0.5 + 0.5) * width}px`);
      button.style.setProperty("--peg-y", `${(-projected.y * 0.5 + 0.5) * height}px`);
      button.style.zIndex = `${Math.round((1 - projected.z) * 1000)}`;
    }
    if (drops.size) invalidate();
  }

  function invalidate() {
    if (!frame && !disposed) frame = requestAnimationFrame(render);
  }

  function highlight(column: number | null) {
    hovered = column;
    const level = column === null ? -1 : columnCells(state.board, column).indexOf(null);
    ghost.visible = column !== null && level >= 0 && state.canDrop;
    if (column !== null && level >= 0) {
      ghost.position.copy(columnPosition(column, BASE_TOP + 0.38 + level * BEAD_HEIGHT));
      ghostMaterial.color.set(state.currentColor === "ember" ? 0xe5bf82 : 0x71452c);
    }
    invalidate();
  }

  function setState(next: SceneState) {
    const animate = state.board.length > 0 && !state.preview && !reduceMotion.matches;
    for (const [index, piece] of pieces) {
      if (next.board[index] !== piece.color) {
        beads.remove(piece.mesh);
        drops.delete(piece.mesh);
        pieces.delete(index);
      }
    }
    next.board.forEach((color, index) => {
      if (!color || pieces.has(index)) return;
      const mesh = new Mesh(geometry, color === "ember" ? lightWood : darkWood);
      const targetY = BASE_TOP + 0.38 + Math.floor(index / COLUMNS) * BEAD_HEIGHT;
      mesh.position.copy(columnPosition(index % COLUMNS, targetY));
      mesh.rotation.y = index * 2.399;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      pieces.set(index, { mesh, color });
      beads.add(mesh);
      if (animate) drops.set(mesh, { started: performance.now(), targetY, fromY: PEG_TOP + 0.8 });
    });
    halos.clear();
    for (const index of next.winningLine) {
      const halo = new Mesh(haloGeometry, haloMaterial);
      halo.position.copy(
        columnPosition(
          index % COLUMNS,
          BASE_TOP + 0.38 + Math.floor(index / COLUMNS) * BEAD_HEIGHT,
        ),
      );
      halo.rotation.x = Math.PI / 2;
      halos.add(halo);
    }
    state = next;
    highlight(hovered);
    invalidate();
  }

  const raycaster = new Raycaster();
  const pointer = new Vector2();
  let pointerStart: { x: number; y: number } | null = null;
  let dragged = false;
  function pick(event: PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(pickers)[0];
    return hit && hit.object instanceof Mesh ? (pickerColumns.get(hit.object) ?? null) : null;
  }
  function pointerDown(event: PointerEvent) {
    if (event.button !== 0) return;
    pointerStart = { x: event.clientX, y: event.clientY };
    dragged = false;
  }
  function pointerMove(event: PointerEvent) {
    if (
      pointerStart &&
      Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 6
    )
      dragged = true;
    const column = dragged ? null : pick(event);
    highlight(column);
    onHover(column);
    canvas.style.cursor = dragged
      ? "grabbing"
      : column !== null && state.canDrop && columnCells(state.board, column).includes(null)
        ? "pointer"
        : "grab";
  }
  function pointerUp(event: PointerEvent) {
    if (pointerStart && !dragged && state.canDrop) {
      const column = pick(event);
      if (column !== null && columnCells(state.board, column).includes(null)) onDrop(column);
    }
    pointerStart = null;
    dragged = false;
  }
  function pointerLeave() {
    highlight(null);
    onHover(null);
  }
  function pointerCancel() {
    pointerStart = null;
    dragged = false;
    pointerLeave();
  }
  function contextLost(event: Event) {
    event.preventDefault();
    onContextLost();
  }
  canvas.addEventListener("pointerdown", pointerDown);
  canvas.addEventListener("pointermove", pointerMove);
  canvas.addEventListener("pointerup", pointerUp);
  canvas.addEventListener("pointerleave", pointerLeave);
  canvas.addEventListener("pointercancel", pointerCancel);
  canvas.addEventListener("webglcontextlost", contextLost);
  controls.addEventListener("change", invalidate);
  const framingPoints = [
    ...Array.from({ length: COLUMNS }, (_, column) => columnPosition(column, PEG_TOP + 0.58)),
    ...[-2.77, 2.77].flatMap((x) => [-2.77, 2.77].map((z) => new Vector3(x, -0.22, z))),
  ];
  function fitBoard() {
    const direction = camera.position.clone().sub(controls.target).normalize();
    for (let distance = 9; distance < 28; distance += 0.25) {
      camera.position.copy(controls.target).addScaledVector(direction, distance);
      camera.lookAt(controls.target);
      camera.updateMatrixWorld();
      if (
        framingPoints.every((point) => {
          const projected = point.clone().project(camera);
          return Math.abs(projected.x) < 0.87 && Math.abs(projected.y) < 0.89;
        })
      )
        break;
    }
    controls.update();
  }
  const resize = new ResizeObserver(() => {
    width = host.clientWidth;
    height = host.clientHeight;
    if (!width || !height) return;
    camera.aspect = width / height;
    camera.fov = width < 600 ? 43 : 32;
    camera.updateProjectionMatrix();
    fitBoard();
    renderer.setSize(width, height, false);
    invalidate();
  });
  resize.observe(host);

  function setView(view: "perspective" | "top") {
    camera.position.copy(view === "top" ? new Vector3(0, 15, 0.01) : DEFAULT_CAMERA);
    controls.target.set(0, 1.35, 0);
    fitBoard();
    invalidate();
  }

  function dispose() {
    disposed = true;
    cancelAnimationFrame(frame);
    resize.disconnect();
    controls.removeEventListener("change", invalidate);
    controls.dispose();
    canvas.removeEventListener("pointerdown", pointerDown);
    canvas.removeEventListener("pointermove", pointerMove);
    canvas.removeEventListener("pointerup", pointerUp);
    canvas.removeEventListener("pointerleave", pointerLeave);
    canvas.removeEventListener("pointercancel", pointerCancel);
    canvas.removeEventListener("webglcontextlost", contextLost);
    const geometries = new Set<BufferGeometry>([pickGeometry, haloGeometry, geometry]);
    const materials = new Set<Material>([pickMaterial, lightWood, darkWood, haloMaterial]);
    scene.traverse((object) => {
      if (object instanceof Mesh) {
        geometries.add(object.geometry);
        const list = Array.isArray(object.material) ? object.material : [object.material];
        list.forEach((material) => materials.add(material));
      }
    });
    geometries.forEach((item) => item.dispose());
    materials.forEach((item) => item.dispose());
    maple.dispose();
    walnut.dispose();
    environment.dispose();
    sun.shadow.dispose();
    renderer.dispose();
  }

  return { setState, highlight, setView, dispose };
}
