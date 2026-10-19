import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";
import type {
  CampusPackage,
  Locale,
  Localized,
  Place,
  Route,
  ContextShape,
} from "../domain/types";
import type { MapHandle } from "./map-types";
import { campusBounds } from "../domain/mapGeometry";
import { localize } from "../domain/localization";
import { translate } from "../i18n";

interface Props {
  campus: CampusPackage;
  floor: number;
  locale: Locale;
  dark: boolean;
  overview: boolean;
  exploded: boolean;
  selected: Place | null;
  route: Route | null;
  progressNode?: string;
  onSelect: (p: Place) => void;
  onFallback: () => void;
}
interface SceneState {
  origin: { x: number; y: number };
  defaultCamera: THREE.Vector3;
  selectedId?: string;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  renderer: THREE.WebGLRenderer;
  floors: Map<number, THREE.Group>;
  rooms: Map<number, THREE.InstancedMesh>;
  route: THREE.Group;
  draw: () => void;
  labels: {
    element: HTMLButtonElement;
    point: THREE.Vector3;
    text: Localized;
    placeId: string;
    buildingId?: string;
  }[];
}
const categoryColor = (category: string, dark: boolean) =>
  ({
    food: dark ? "#a88b5b" : "#e6c99d",
    library: dark ? "#5b8c88" : "#b0d7cf",
    museum: dark ? "#8b779d" : "#d1c0e0",
    sport: dark ? "#5b859c" : "#bad7e4",
    stairs: dark ? "#68837b" : "#c2d3c9",
    toilet: dark ? "#687a99" : "#ccd7e7",
  })[category] ?? (dark ? "#6a807c" : "#e1e8e2");
export const Map3D = forwardRef<MapHandle, Props>(function Map3D(props, ref) {
  const container = useRef<HTMLDivElement>(null),
    state = useRef<SceneState | null>(null),
    live = useRef(props);
  live.current = props;
  const [failed, setFailed] = useState(false);
  const t = translate(props.locale);
  useImperativeHandle(ref, () => ({
    zoom(factor) {
      const s = state.current;
      if (!s) return;
      s.camera.position
        .sub(s.controls.target)
        .multiplyScalar(1 / factor)
        .add(s.controls.target);
      s.controls.update();
      s.draw();
    },
    reset() {
      const s = state.current;
      if (!s) return;
      s.camera.position.copy(s.defaultCamera);
      s.controls.target.set(0, 0, 0);
      s.controls.update();
      s.draw();
    },
    focus(p) {
      const s = state.current;
      if (!s) return;
      const target = new THREE.Vector3(p.x - s.origin.x, 8, p.y - s.origin.y);
      const diff = target.clone().sub(s.controls.target);
      s.controls.target.copy(target);
      s.camera.position.add(diff);
      s.controls.update();
      s.draw();
    },
  }));
  useEffect(() => {
    const host = container.current;
    if (!host) return;
    setFailed(false);
    const bounds = campusBounds(props.campus);
    const origin = { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 };
    const span = Math.max(bounds.w, bounds.h);
    const defaultCamera = new THREE.Vector3(
      span * 0.65,
      span * 0.9,
      span * 0.95,
    );
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "low-power",
      });
    } catch {
      setFailed(true);
      return;
    }
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, span * 10);
    camera.position.copy(defaultCamera);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(renderer.domElement);
    renderer.domElement.setAttribute(
      "aria-label",
      translate(props.locale)("modelAria"),
    );
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, 0);
    controls.enableDamping = false;
    controls.minDistance = span / 20;
    controls.maxDistance = span * 4;
    controls.maxPolarAngle = Math.PI * 0.46;
    controls.minPolarAngle = 0.15;
    controls.touches.ONE = THREE.TOUCH.ROTATE;
    controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
    controls.update();
    scene.add(
      new THREE.HemisphereLight(
        0xffffff,
        props.dark ? 0x132320 : 0xc8d3bd,
        2.6,
      ),
    );
    const light = new THREE.DirectionalLight(0xffffff, 2.4);
    light.position.set(-span * 0.4, span, span * 0.15);
    light.castShadow = true;
    light.shadow.mapSize.set(2048, 2048);
    light.shadow.camera.left = -span;
    light.shadow.camera.right = span;
    light.shadow.camera.top = span;
    light.shadow.camera.bottom = -span;
    light.shadow.camera.far = span * 4;
    light.shadow.normalBias = 0.8;
    scene.add(light);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(span * 5, span * 5),
      new THREE.MeshStandardMaterial({
        color: props.dark ? "#182925" : "#e9eee5",
        roughness: 1,
      }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -1;
    ground.receiveShadow = true;
    scene.add(ground);
    const grid = new THREE.GridHelper(
      span * 3,
      50,
      props.dark ? 0x294039 : 0xdde5d8,
      props.dark ? 0x243931 : 0xe2e8dd,
    );
    grid.position.y = -0.9;
    scene.add(grid);
    const floors = new Map<number, THREE.Group>(),
      rooms = new Map<number, THREE.InstancedMesh>();
    for (const f of props.campus.floors) {
      const g = new THREE.Group();
      floors.set(f, g);
      scene.add(g);
    }
    const loader = new SVGLoader();
    const parsePath = (path: string, transform?: ContextShape["transform"]) =>
      loader.parse(
        `<svg xmlns="http://www.w3.org/2000/svg"><path d="${path}" ${transform ? `transform="matrix(${transform.join(" ")})"` : ""} fill="#ffffff"/></svg>`,
      ).paths;
    const shapeMesh = (
      path: string,
      depth: number,
      color: string,
      transform?: ContextShape["transform"],
    ) => {
      const paths = parsePath(path, transform);
      const group = new THREE.Group();
      for (const p of paths)
        for (const shape of SVGLoader.createShapes(p)) {
          const geometry = new THREE.ExtrudeGeometry(shape, {
            depth,
            bevelEnabled: false,
            curveSegments: 5,
          });
          geometry.translate(-origin.x, -origin.y, 0);
          geometry.rotateX(Math.PI / 2);
          const mesh = new THREE.Mesh(
            geometry,
            new THREE.MeshStandardMaterial({ color, roughness: 0.86 }),
          );
          mesh.position.y = depth;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          group.add(mesh);
        }
      return group;
    };
    for (const g of props.campus.geometry) {
      for (const path of g.footprint) {
        const mesh = shapeMesh(path, 1.4, props.dark ? "#577069" : "#fbfcf9");
        mesh.userData.placeId = "building-" + g.buildingId;
        mesh.traverse(
          (child) => (child.userData.placeId = mesh.userData.placeId),
        );
        floors.get(g.floor)!.add(mesh);
      }
    }
    const box = new THREE.BoxGeometry(1, 1, 1),
      matrix = new THREE.Matrix4(),
      rotation = new THREE.Quaternion();
    for (const floor of props.campus.floors) {
      const places = props.campus.places.filter(
        (p) => p.floor === floor && p.width > 0 && p.mapVisible !== false,
      );
      const mesh = new THREE.InstancedMesh(
        box,
        new THREE.MeshStandardMaterial({ roughness: 0.9 }),
        places.length,
      );
      mesh.userData.places = places;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      places.forEach((p, i) => {
        matrix.compose(
          new THREE.Vector3(
            p.x + p.width / 2 - origin.x,
            2.4,
            p.y + p.height / 2 - origin.y,
          ),
          rotation,
          new THREE.Vector3(
            Math.max(0.2, p.width - 0.45),
            2,
            Math.max(0.2, p.height - 0.45),
          ),
        );
        mesh.setMatrixAt(i, matrix);
        mesh.setColorAt(
          i,
          new THREE.Color(categoryColor(p.category, props.dark)),
        );
      });
      floors.get(floor)!.add(mesh);
      rooms.set(floor, mesh);
    }
    const surroundings = new THREE.Group();
    for (const s of props.campus.contextShapes) {
      try {
        if (s.kind === "outline") continue;
        if (s.kind === "marking") {
          for (const path of parsePath(s.path, s.transform))
            for (const sub of path.subPaths) {
              const line = new THREE.Line(
                new THREE.BufferGeometry().setFromPoints(
                  sub
                    .getPoints(48)
                    .map(
                      (p) =>
                        new THREE.Vector3(p.x - origin.x, 0.8, p.y - origin.y),
                    ),
                ),
                new THREE.LineBasicMaterial({ color: "#f3f6e8" }),
              );
              line.userData.placeId = s.placeId;
              surroundings.add(line);
            }
        } else {
          const flat = s.kind === "track" || s.kind === "field";
          const color =
            s.kind === "track"
              ? props.dark
                ? "#715a4e"
                : "#b98d70"
              : s.kind === "field"
                ? props.dark
                  ? "#466b51"
                  : "#8fb985"
                : props.dark
                  ? "#334b41"
                  : "#cad7c8";
          const mesh = shapeMesh(
            s.path,
            flat ? 0.25 : Math.min(s.levels, 8) * 3.5,
            color,
            s.transform,
          );
          if (s.kind === "field") mesh.position.y = 0.25;
          mesh.traverse((child) => {
            child.userData.placeId = s.placeId;
          });
          surroundings.add(mesh);
        }
      } catch {
        /* Unsupported legacy shape does not prevent navigation. */
      }
    }
    scene.add(surroundings);
    const nodeMap = new Map(props.campus.nodes.map((n) => [n.id, n]));
    const outside = new THREE.Group();
    for (const edge of props.campus.edges) {
      const a = nodeMap.get(edge.from)!,
        b = nodeMap.get(edge.to)!;
      if (a.environment !== "outdoor" || b.environment !== "outdoor") continue;
      const v1 = new THREE.Vector3(a.x - origin.x, 0.1, a.y - origin.y),
        v2 = new THREE.Vector3(b.x - origin.x, 0.1, b.y - origin.y);
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([v1, v2]),
        new THREE.LineBasicMaterial({
          color: props.dark ? "#73876f" : "#b0bca8",
        }),
      );
      outside.add(line);
    }
    scene.add(outside);
    const labels: SceneState["labels"] = [];
    for (const b of props.campus.buildings) {
      const el = document.createElement("button");
      el.type = "button";
      el.className = "map3d-label";
      el.textContent = localize(b.shortName, props.locale);
      host.appendChild(el);
      el.onclick = () => {
        const place = live.current.campus.places.find(
          (p) => p.id === "building-" + b.id,
        );
        if (place) live.current.onSelect(place);
      };
      labels.push({
        element: el,
        text: b.shortName,
        placeId: "building-" + b.id,
        buildingId: b.id,
        point: new THREE.Vector3(
          b.center.x - origin.x,
          30,
          b.center.y - origin.y,
        ),
      });
    }
    for (const p of props.campus.places.filter(
      (p) => p.environment === "outdoor",
    )) {
      const el = document.createElement("button");
      el.type = "button";
      el.className = "map3d-label map3d-landmark";
      el.onclick = () => live.current.onSelect(p);
      host.appendChild(el);
      labels.push({
        element: el,
        text: p.mapLabel ?? p.name,
        placeId: p.id,
        point: new THREE.Vector3(
          p.x + p.width / 2 - origin.x,
          p.category === "dormitory" ? 35 : 5,
          p.y + p.height / 2 - origin.y,
        ),
      });
    }
    const route = new THREE.Group();
    scene.add(route);
    const draw = () => {
      renderer.render(scene, camera);
      const w = Math.max(1, host.clientWidth),
        h = Math.max(1, host.clientHeight);
      labels.forEach(({ element, point, text, placeId }) => {
        const p = point.clone().project(camera);
        element.style.transform = `translate(-50%,-50%) translate(${((p.x + 1) * w) / 2}px,${((1 - p.y) * h) / 2}px)`;
        element.style.display =
          p.z > 1 || p.z < -1 || Math.abs(p.x) > 1 || Math.abs(p.y) > 1
            ? "none"
            : "";
        element.textContent = localize(text, live.current.locale);
        element.classList.toggle(
          "selected",
          live.current.selected?.id === placeId,
        );
      });
    };
    const s: SceneState = {
      origin,
      defaultCamera,
      scene,
      camera,
      controls,
      renderer,
      floors,
      rooms,
      route,
      draw,
      labels,
    };
    state.current = s;
    const resize = () => {
      const w = Math.max(1, host.clientWidth),
        h = Math.max(1, host.clientHeight);
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      draw();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    controls.addEventListener("change", draw);
    let down = { x: 0, y: 0 };
    const pointerDown = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY };
    };
    const pointerUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
      const rect = renderer.domElement.getBoundingClientRect();
      const ray = new THREE.Raycaster();
      ray.setFromCamera(
        new THREE.Vector2(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          1 - ((e.clientY - rect.top) / rect.height) * 2,
        ),
        camera,
      );
      const intersections = ray.intersectObjects(
        [...floors.values(), surroundings].filter((g) => g.visible),
        true,
      );
      for (const hit of intersections) {
        let place: Place | undefined;
        if (
          hit.object instanceof THREE.InstancedMesh &&
          hit.instanceId !== undefined
        )
          place = hit.object.userData.places[hit.instanceId];
        else if (hit.object.userData.placeId)
          place = live.current.campus.places.find(
            (p) => p.id === hit.object.userData.placeId,
          );
        if (place) {
          live.current.onSelect(place);
          break;
        }
      }
    };
    const contextLost = (e: Event) => {
      e.preventDefault();
      setFailed(true);
    };
    renderer.domElement.addEventListener("pointerdown", pointerDown);
    renderer.domElement.addEventListener("pointerup", pointerUp);
    renderer.domElement.addEventListener("webglcontextlost", contextLost);
    resize();
    updateScene(s, live.current);
    return () => {
      ro.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener("pointerdown", pointerDown);
      renderer.domElement.removeEventListener("pointerup", pointerUp);
      renderer.domElement.removeEventListener("webglcontextlost", contextLost);
      disposeGroup(scene);
      renderer.dispose();
      renderer.forceContextLoss();
      host.replaceChildren();
      state.current = null;
    };
  }, [props.campus, props.dark]);
  useEffect(() => {
    const s = state.current;
    if (s) updateScene(s, props);
  }, [
    props.floor,
    props.overview,
    props.exploded,
    props.selected,
    props.route,
    props.progressNode,
    props.locale,
  ]);
  return (
    <div className="map3d">
      <div className="map3d-host" ref={container} />
      {failed && (
        <div className="map-fallback">
          <p>{t("mapUnavailable")}</p>
          <button className="primary" onClick={props.onFallback}>
            {t("show2d")}
          </button>
        </div>
      )}
    </div>
  );
});
function disposeGroup(group: THREE.Object3D) {
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) {
      obj.geometry.dispose();
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of mats) mat.dispose();
    }
  });
}
function updateScene(s: SceneState, p: Props) {
  const spacing = p.exploded ? 23 : 5.2;
  const groundFloor = Math.min(...p.campus.floors);
  for (const [floor, group] of s.floors) {
    group.visible = p.overview || floor === p.floor;
    group.position.y = p.overview ? (floor - groundFloor) * spacing : 0;
  }
  for (const [floor, mesh] of s.rooms) {
    const places = mesh.userData.places as Place[];
    places.forEach((place, i) =>
      mesh.setColorAt(
        i,
        new THREE.Color(
          place.id === p.selected?.id
            ? "#1baf86"
            : categoryColor(place.category, p.dark),
        ),
      ),
    );
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
  disposeGroup(s.route);
  s.route.clear();
  const nodes = new Map(p.campus.nodes.map((n) => [n.id, n]));
  const vector = (id: string) => {
    const n = nodes.get(id)!;
    return new THREE.Vector3(
      n.x - s.origin.x,
      (p.overview ? (n.floor - groundFloor) * spacing : 0) + 4.5,
      n.y - s.origin.y,
    );
  };
  if (p.route) {
    for (let i = 1; i < p.route.nodeIds.length; i++) {
      const a = nodes.get(p.route.nodeIds[i - 1])!,
        b = nodes.get(p.route.nodeIds[i])!;
      if (!p.overview && (a.floor !== p.floor || b.floor !== p.floor)) continue;
      const start = vector(a.id),
        end = vector(b.id),
        dir = end.clone().sub(start),
        length = dir.length();
      if (length < 0.01) continue;
      const tube = new THREE.Mesh(
        new THREE.CylinderGeometry(0.65, 0.65, length, 8),
        new THREE.MeshBasicMaterial({ color: "#18ac88" }),
      );
      tube.position.copy(start).add(end).multiplyScalar(0.5);
      tube.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        dir.normalize(),
      );
      s.route.add(tube);
    }
    const markers = [
      { id: p.route.nodeIds[0], color: "#effbf5" },
      { id: p.route.nodeIds.at(-1)!, color: "#147d65" },
      ...(p.progressNode ? [{ id: p.progressNode, color: "#478cfe" }] : []),
    ];
    for (const marker of markers) {
      const n = nodes.get(marker.id)!;
      if (!p.overview && n.floor !== p.floor) continue;
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(2.6, 18, 12),
        new THREE.MeshStandardMaterial({
          color: marker.color,
          emissive: marker.color,
          emissiveIntensity: 0.1,
        }),
      );
      mesh.position.copy(vector(marker.id));
      s.route.add(mesh);
    }
  }
  for (const label of s.labels) {
    const b = p.campus.buildings.find((b) => b.id === label.buildingId);
    if (!b) continue;
    label.point.y = p.overview
      ? (Math.max(...b.floors) - groundFloor) * spacing + 7
      : 10;
  }
  if (p.selected && s.selectedId !== p.selected.id) {
    const target = new THREE.Vector3(
      p.selected.x + p.selected.width / 2 - s.origin.x,
      4,
      p.selected.y + p.selected.height / 2 - s.origin.y,
    );
    const direction = s.camera.position
      .clone()
      .sub(s.controls.target)
      .normalize();
    const distance =
      p.selected.environment === "outdoor"
        ? Math.max(200, p.selected.width * 2.5, p.selected.height * 2.5)
        : p.selected.category === "building"
          ? 220
          : 110;
    s.controls.target.copy(target);
    s.camera.position.copy(target).addScaledVector(direction, distance);
    s.controls.update();
  }
  s.selectedId = p.selected?.id;
  s.renderer.domElement.setAttribute(
    "aria-label",
    translate(p.locale)("modelAria"),
  );
  s.draw();
}
