const materialRates = {
  pla: { label: "PLA", gram: 95, hourly: 2600, multiplier: 1 },
  petg: { label: "PETG", gram: 125, hourly: 2900, multiplier: 1.08 },
};

const layerMultipliers = {
  standard: { label: "0.20mm 표준", value: 1 },
  fine: { label: "0.12mm 정밀", value: 1.28 },
  draft: { label: "0.28mm 빠른 출력", value: 0.9 },
};

const finishRates = {
  none: { label: "서포트 제거", value: 0 },
  clean: { label: "기본 다듬기", value: 6000 },
  premium: { label: "표면 정리 집중", value: 16000 },
};

const form = document.querySelector("#quoteForm");
const estimate = document.querySelector("#estimate");
const note = document.querySelector("#estimateNote");
const breakdown = document.querySelector("#breakdown");
const quoteMail = document.querySelector("#quoteMail");
const modelFile = document.querySelector("#modelFile");
const fileDrop = document.querySelector("#fileDrop");
const samplePreview = document.querySelector("#samplePreview");
const fileStatus = document.querySelector("#fileStatus");
const fileName = document.querySelector("#fileName");
const fileMeta = document.querySelector("#fileMeta");
const clearFile = document.querySelector("#clearFile");
const resultFileCheck = document.querySelector("#resultFileCheck");
const maxSizeInput = document.querySelector("#maxSize");
const modelStage = document.querySelector("#modelStage");
const modelPlaceholder = document.querySelector("#modelPlaceholder");
const modelPreviewTitle = document.querySelector("#modelPreviewTitle");
const modelPreviewNote = document.querySelector("#modelPreviewNote");
const simulationHint = document.querySelector("#simulationHint");
const slicerStatus = document.querySelector("#slicerStatus");
const viewportStats = document.querySelector("#viewportStats");
const previewModeButtons = document.querySelectorAll("[data-preview-mode]");
const detailMaterial = document.querySelector("#detailMaterial");
const detailWeight = document.querySelector("#detailWeight");
const detailSize = document.querySelector("#detailSize");
const detailInfill = document.querySelector("#detailInfill");
const detailQuality = document.querySelector("#detailQuality");
const detailTime = document.querySelector("#detailTime");
const detailQuantity = document.querySelector("#detailQuantity");
const detailPrice = document.querySelector("#detailPrice");

let uploadedFileInfo = null;
let modelViewer = null;
let previewMode = "source";
let slicerRequestId = 0;
let activeSlicerQuote = null;

const formatter = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0,
});

function valueOf(id) {
  const element = document.querySelector(`#${id}`);
  return element.type === "checkbox" ? element.checked : element.value;
}

function setText(element, value) {
  if (element) {
    element.textContent = value;
  }
}

function setViewportStats(title, lines) {
  if (!viewportStats) return;
  viewportStats.querySelector("strong").textContent = title;
  viewportStats.querySelector("span").innerHTML = lines.filter(Boolean).join("<br />");
}

function roundPrice(price) {
  return Math.ceil(price / 1000) * 1000;
}

function formatBytes(bytes) {
  if (!bytes) return "0 KB";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function getExtension(name) {
  return name.split(".").pop().toLowerCase();
}

function getBinaryStlBounds(buffer) {
  if (buffer.byteLength < 84) return null;
  const view = new DataView(buffer);
  const triangles = view.getUint32(80, true);
  if (84 + triangles * 50 !== buffer.byteLength || triangles === 0) return null;

  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let offset = 84;

  for (let i = 0; i < triangles; i += 1) {
    offset += 12;
    for (let vertex = 0; vertex < 3; vertex += 1) {
      for (let axis = 0; axis < 3; axis += 1) {
        const value = view.getFloat32(offset, true);
        min[axis] = Math.min(min[axis], value);
        max[axis] = Math.max(max[axis], value);
        offset += 4;
      }
    }
    offset += 2;
  }

  return { triangles, size: max.map((value, index) => Math.max(0, value - min[index])) };
}

function getAsciiStlBounds(text) {
  const vertexPattern = /vertex\s+(-?\d*\.?\d+(?:e[-+]?\d+)?)\s+(-?\d*\.?\d+(?:e[-+]?\d+)?)\s+(-?\d*\.?\d+(?:e[-+]?\d+)?)/gi;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let vertices = 0;
  let match = vertexPattern.exec(text);

  while (match) {
    for (let axis = 0; axis < 3; axis += 1) {
      const value = Number(match[axis + 1]);
      min[axis] = Math.min(min[axis], value);
      max[axis] = Math.max(max[axis], value);
    }
    vertices += 1;
    match = vertexPattern.exec(text);
  }

  if (!vertices) return null;
  return {
    triangles: Math.floor(vertices / 3),
    size: max.map((value, index) => Math.max(0, value - min[index])),
  };
}

function summarizeDimensions(size) {
  if (!size) return null;
  const rounded = size.map((value) => Math.round(value * 10) / 10);
  return `${rounded[0]} x ${rounded[1]} x ${rounded[2]} mm`;
}

function applyFileInfo(info) {
  uploadedFileInfo = info;
  fileStatus.hidden = false;
  fileName.textContent = info.name;
  fileMeta.textContent = info.meta;
  resultFileCheck.textContent = info.resultText;
  detailSize.textContent = info.dimensions || "-";
  setViewportStats(info.name, [
    info.dimensions ? `크기: ${info.dimensions}` : info.meta,
    info.triangles ? `삼각형 수: ${info.triangles.toLocaleString("ko-KR")}` : "",
  ]);

  if (info.maxDimension) {
    maxSizeInput.value = Math.ceil(info.maxDimension);
  }

  calculate();
}

function setPreviewStatus(title, hint, note, state = "") {
  setText(modelPreviewTitle, title);
  setText(simulationHint, hint);
  simulationHint.className = `simulation-hint ${state}`;
  setText(modelPreviewNote, note);
}

function setSlicerStatus(state, title, message) {
  if (!slicerStatus) return;
  slicerStatus.className = `slicer-status ${state}`;
  slicerStatus.querySelector("strong").textContent = title;
  slicerStatus.querySelector("p").textContent = message;
}

function normalizeSlicerQuote(data) {
  const quote = data?.quote || data?.result?.quote || data;
  const stats = data?.stats || data?.result?.stats || {};
  const grams =
    quote?.filament_g ?? quote?.filamentGrams ?? quote?.filament_grams ?? stats?.filament_g ?? null;
  const seconds =
    quote?.print_time_seconds ??
    quote?.printTimeSeconds ??
    stats?.print_time_seconds ??
    null;
  const hours = quote?.print_time_hours ?? quote?.printTimeHours ?? (seconds ? seconds / 3600 : null);
  const total = quote?.total_krw ?? quote?.totalKrw ?? quote?.price_krw ?? null;

  return {
    grams: Number.isFinite(Number(grams)) ? Number(grams) : null,
    hours: Number.isFinite(Number(hours)) ? Number(hours) : null,
    total: Number.isFinite(Number(total)) ? Number(total) : null,
  };
}

function applySlicerQuote(data) {
  const quote = normalizeSlicerQuote(data);
  const applied = [];
  activeSlicerQuote = quote;

  if (quote.grams && quote.grams > 0) {
    document.querySelector("#weight").value = Math.max(1, Math.round(quote.grams));
    applied.push(`${quote.grams.toFixed(1)}g`);
  }
  if (quote.hours && quote.hours > 0) {
    document.querySelector("#hours").value = Math.max(1, Math.ceil(quote.hours * 10) / 10);
    applied.push(`${quote.hours.toFixed(1)}시간`);
  }

  calculate();

  setSlicerStatus(
    "is-ready",
    "Bambu 슬라이싱 견적 반영됨",
    applied.length
      ? `실제 슬라이싱 결과 기준으로 ${applied.join(", ")} 정보를 견적에 반영했습니다.`
      : "슬라이서 워커 응답을 받았습니다. 상세 값은 결과 JSON 형식에 맞춰 추가 반영할 수 있습니다."
  );
}

async function requestSlicerEstimate(file) {
  const requestId = (slicerRequestId += 1);
  activeSlicerQuote = null;
  setSlicerStatus("is-loading", "Bambu 슬라이싱 요청 중", "파일과 출력 조건을 서버 슬라이서 워커로 전달하고 있습니다.");

  const formData = new FormData();
  formData.append("model", file, file.name);
  formData.append("material", valueOf("material"));
  formData.append("layer", valueOf("layer"));
  formData.append("support", valueOf("support") ? "true" : "false");
  formData.append("quantity", valueOf("quantity"));
  formData.append("maxSize", valueOf("maxSize"));

  try {
    const response = await fetch("/api/slice-estimate", {
      method: "POST",
      body: formData,
    });
    const data = await response.json().catch(() => ({}));
    if (requestId !== slicerRequestId) return;

    if (response.status === 202 || data?.mode === "browser-estimate") {
      setSlicerStatus(
        "is-pending",
        "예상 견적 계산 완료",
        data?.message || "업로드 파일과 선택한 출력 조건을 기준으로 예상 견적을 계산했습니다."
      );
      return;
    }

    if (!response.ok || data?.ok === false) {
      throw new Error(data?.message || "슬라이싱 견적을 받을 수 없습니다.");
    }

    applySlicerQuote(data);
  } catch (error) {
    if (requestId !== slicerRequestId) return;
    setSlicerStatus(
      "is-error",
      "예상 견적 계산 중",
      "업로드 파일과 선택한 출력 조건을 기준으로 예상 견적을 계산합니다."
    );
  }
}

function updatePreviewModeButtons() {
  previewModeButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.previewMode === previewMode);
  });
}

function setPreviewMode(mode) {
  previewMode = mode;
  updatePreviewModeButtons();
  if (modelViewer) {
    applyPreviewMode();
  }
}

function resetModelViewer() {
  if (modelViewer) {
    cancelAnimationFrame(modelViewer.frame);
    window.removeEventListener("resize", modelViewer.resize);
    modelViewer.controls?.dispose();
    modelViewer.renderer?.dispose();
    modelViewer.scene?.traverse((object) => {
      object.geometry?.dispose?.();
      if (Array.isArray(object.material)) {
        object.material.forEach((material) => material.dispose?.());
      } else {
        object.material?.dispose?.();
      }
    });
    modelViewer = null;
  }
  modelStage.querySelector("canvas")?.remove();
  modelPlaceholder.hidden = false;
}

function makeBuildPlate(THREE) {
  const plate = new THREE.Group();
  const size = 256;
  const base = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshStandardMaterial({ color: 0x3f424a, roughness: 0.86, metalness: 0.02 })
  );
  base.position.z = -0.02;
  base.receiveShadow = true;
  plate.add(base);

  const grid = new THREE.GridHelper(size, 32, 0x777d88, 0x555b66);
  grid.rotation.x = Math.PI / 2;
  grid.position.z = 0;
  plate.add(grid);

  const borderGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-size / 2, -size / 2, 0.01),
    new THREE.Vector3(size / 2, -size / 2, 0.01),
    new THREE.Vector3(size / 2, size / 2, 0.01),
    new THREE.Vector3(-size / 2, size / 2, 0.01),
    new THREE.Vector3(-size / 2, -size / 2, 0.01),
  ]);
  const border = new THREE.Line(borderGeometry, new THREE.LineBasicMaterial({ color: 0x9ca3af }));
  plate.add(border);

  const axisMaterialX = new THREE.LineBasicMaterial({ color: 0xef4444 });
  const axisMaterialY = new THREE.LineBasicMaterial({ color: 0x22c55e });
  const axisLength = size / 2 - 16;
  const xAxis = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-axisLength, -size / 2 - 8, 0.04),
      new THREE.Vector3(axisLength, -size / 2 - 8, 0.04),
    ]),
    axisMaterialX
  );
  const yAxis = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-size / 2 - 8, -axisLength, 0.04),
      new THREE.Vector3(-size / 2 - 8, axisLength, 0.04),
    ]),
    axisMaterialY
  );
  plate.add(xAxis, yAxis);

  return plate;
}

function setupPlateCamera(THREE, camera) {
  camera.up.set(0, 0, 1);
  camera.lookAt(new THREE.Vector3(0, 0, 0));
}

function setupPlateControls(controls) {
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enableRotate = true;
  controls.enableZoom = true;
  controls.enablePan = true;
  controls.screenSpacePanning = false;
  controls.minPolarAngle = 0.08;
  controls.maxPolarAngle = Math.PI / 2 - 0.06;
}

function getObjectBounds(THREE, object) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  if (!Number.isFinite(size.x + size.y + size.z) || Math.max(size.x, size.y, size.z) <= 0) {
    return null;
  }
  return { box, size };
}

function normalizeObjectForPlate(THREE, object) {
  const group = new THREE.Group();
  group.add(object);

  let bounds = getObjectBounds(THREE, group);
  if (!bounds) return { object: group, displayScale: 1, size: new THREE.Vector3(0, 0, 0) };

  let center = bounds.box.getCenter(new THREE.Vector3());
  group.position.x -= center.x;
  group.position.y -= center.y;
  group.position.z -= bounds.box.min.z;
  group.updateMatrixWorld(true);

  bounds = getObjectBounds(THREE, group);
  const maxDimension = Math.max(bounds.size.x, bounds.size.y, bounds.size.z);
  let displayScale = 1;
  if (maxDimension > 220) {
    displayScale = 220 / maxDimension;
  } else if (maxDimension > 0 && maxDimension < 28) {
    displayScale = 48 / maxDimension;
  }

  group.scale.setScalar(displayScale);
  group.updateMatrixWorld(true);

  bounds = getObjectBounds(THREE, group);
  center = bounds.box.getCenter(new THREE.Vector3());
  group.position.x -= center.x;
  group.position.y -= center.y;
  group.position.z -= bounds.box.min.z;
  group.updateMatrixWorld(true);

  bounds = getObjectBounds(THREE, group);
  return { object: group, displayScale, size: bounds.size };
}

function fitObjectToView(THREE, object, camera, controls) {
  const bounds = getObjectBounds(THREE, object);
  const size = bounds?.size || new THREE.Vector3(120, 120, 60);
  const center = bounds?.box.getCenter(new THREE.Vector3()) || new THREE.Vector3(0, 0, 0);
  const maxDimension = Math.max(size.x, size.y, size.z, 120);
  const distance = Math.max(220, maxDimension * 1.85);

  camera.position.set(distance * 0.72, -distance * 0.92, distance * 0.64);
  setupPlateCamera(THREE, camera);
  camera.near = Math.max(0.1, distance / 1000);
  camera.far = Math.max(2000, distance * 8);
  camera.updateProjectionMatrix();

  controls.target.set(center.x, center.y, Math.max(4, Math.min(60, size.z * 0.45)));
  controls.minDistance = Math.max(30, distance * 0.22);
  controls.maxDistance = Math.max(620, distance * 3.2);
  controls.update();
}

function preparePreviewObject(THREE, object) {
  object.traverse((child) => {
    if (child.isMesh) {
      if (!child.material?.userData?.preserve) {
        child.material = new THREE.MeshStandardMaterial({
          color: 0xf8fafc,
          roughness: 0.62,
          metalness: 0.02,
          side: THREE.DoubleSide,
        });
      }
      child.geometry?.computeBoundingBox?.();
      child.geometry?.computeBoundingSphere?.();
      child.geometry?.computeVertexNormals?.();
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  return object;
}

function makeSupportPreview(THREE, object) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const min = box.min;
  const group = new THREE.Group();
  const supportMaterial = new THREE.MeshStandardMaterial({
    color: 0x246bfe,
    transparent: true,
    opacity: 0.5,
    roughness: 0.7,
  });

  const radius = Math.max(1.6, Math.min(size.x, size.y) / 28);
  const height = Math.max(6, size.z * 0.72);
  const positions = [
    [min.x + size.x * 0.28, min.y + size.y * 0.28],
    [min.x + size.x * 0.62, min.y + size.y * 0.45],
    [min.x + size.x * 0.45, min.y + size.y * 0.68],
  ];

  positions.forEach(([x, y]) => {
    const geometry = new THREE.CylinderGeometry(radius, radius * 0.72, height, 8);
    const support = new THREE.Mesh(geometry, supportMaterial);
    support.rotation.x = Math.PI / 2;
    support.position.set(x, y, height / 2);
    group.add(support);
  });

  return group;
}

function makeFallbackPreviewObject(THREE) {
  const group = new THREE.Group();
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    roughness: 0.52,
    metalness: 0.04,
  });
  const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x1d4ed8 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(96, 72, 28), bodyMaterial);
  base.position.z = 14;
  group.add(base);

  const dome = new THREE.Mesh(new THREE.CylinderGeometry(22, 34, 34, 28), bodyMaterial);
  dome.position.set(-18, 2, 48);
  group.add(dome);

  const tower = new THREE.Mesh(new THREE.BoxGeometry(26, 22, 58), bodyMaterial);
  tower.position.set(30, -12, 57);
  group.add(tower);

  group.add(new THREE.LineSegments(new THREE.EdgesGeometry(base.geometry), edgeMaterial));
  return group;
}

function makeProductMaterial(THREE, color, roughness = 0.64) {
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness: 0.02,
  });
  material.userData.preserve = true;
  return material;
}

function makeRoundedBox(THREE, width, depth, height, radius) {
  const x = -width / 2;
  const y = -depth / 2;
  const shape = new THREE.Shape();
  shape.moveTo(x + radius, y);
  shape.lineTo(x + width - radius, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + radius);
  shape.lineTo(x + width, y + depth - radius);
  shape.quadraticCurveTo(x + width, y + depth, x + width - radius, y + depth);
  shape.lineTo(x + radius, y + depth);
  shape.quadraticCurveTo(x, y + depth, x, y + depth - radius);
  shape.lineTo(x, y + radius);
  shape.quadraticCurveTo(x, y, x + radius, y);

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: true,
    bevelSegments: 5,
    bevelSize: Math.min(radius * 0.38, 3),
    bevelThickness: Math.min(radius * 0.38, 3),
  });
  geometry.computeVertexNormals();
  return geometry;
}

function makeSamplePreviewObject(THREE) {
  const group = new THREE.Group();
  const body = makeProductMaterial(THREE, 0xf8fafc, 0.68);
  const accent = makeProductMaterial(THREE, 0xe5e7eb, 0.72);
  const detail = makeProductMaterial(THREE, 0xdbeafe, 0.74);
  const darkCut = makeProductMaterial(THREE, 0x475569, 0.8);

  const tag = new THREE.Mesh(makeRoundedBox(THREE, 108, 62, 5, 12), body);
  group.add(tag);

  const holeRing = new THREE.Mesh(new THREE.TorusGeometry(8.5, 2.2, 16, 48), detail);
  holeRing.position.set(-42, 0, 7.2);
  group.add(holeRing);

  const holeShadow = new THREE.Mesh(new THREE.CylinderGeometry(5.6, 5.6, 1.4, 32), darkCut);
  holeShadow.position.set(-42, 0, 7.4);
  group.add(holeShadow);

  const raisedBar = new THREE.Mesh(makeRoundedBox(THREE, 48, 8, 3.2, 4), accent);
  raisedBar.position.set(14, 12, 6);
  group.add(raisedBar);

  const raisedBar2 = raisedBar.clone();
  raisedBar2.position.y = -2;
  raisedBar2.scale.x = 0.72;
  group.add(raisedBar2);

  const raisedBar3 = raisedBar.clone();
  raisedBar3.position.y = -16;
  raisedBar3.scale.x = 0.52;
  group.add(raisedBar3);

  const cornerDot = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 3, 32), detail);
  cornerDot.position.set(44, 20, 6.2);
  group.add(cornerDot);

  const cornerDot2 = cornerDot.clone();
  cornerDot2.position.y = -20;
  group.add(cornerDot2);

  return group;
}

function setupRenderer(THREE, renderer, width, height) {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(width, height);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
}

function addStudioLights(THREE, scene) {
  scene.add(new THREE.HemisphereLight(0xffffff, 0x4b5563, 1.8));

  const keyLight = new THREE.DirectionalLight(0xffffff, 3.2);
  keyLight.position.set(4, -5, 8);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.camera.left = -180;
  keyLight.shadow.camera.right = 180;
  keyLight.shadow.camera.top = 180;
  keyLight.shadow.camera.bottom = -180;
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0xdbeafe, 0.72);
  fillLight.position.set(-5, 4, 5);
  scene.add(fillLight);

  const rimLight = new THREE.DirectionalLight(0xffffff, 0.85);
  rimLight.position.set(-4, -6, 6);
  scene.add(rimLight);
}

function applyPreviewMode() {
  if (!modelViewer) return;
  modelViewer.object.traverse((child) => {
    if (child.isMesh) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => {
        if (!material) return;
        material.color?.set(previewMode === "source" ? 0xf8fafc : 0xdbeafe);
        material.wireframe = false;
        material.opacity = 1;
        material.transparent = false;
        material.side = modelViewer.THREE?.DoubleSide ?? material.side;
        material.needsUpdate = true;
      });
    }
  });
  if (modelViewer.supportGroup) {
    modelViewer.supportGroup.visible = previewMode === "print" && valueOf("support");
  }
  simulationHint.textContent =
    previewMode === "print"
      ? "서포트 예상 형태를 함께 표시합니다."
      : "드래그 회전 · 휠 확대/축소";
}

function savePreviewSnapshot() {
  const canvas = modelStage.querySelector("canvas");
  if (!canvas) {
    sessionStorage.removeItem("real3dmaker-preview-image");
    return;
  }

  const maxWidth = 640;
  const ratio = Math.min(1, maxWidth / canvas.width);
  const target = document.createElement("canvas");
  target.width = Math.max(1, Math.round(canvas.width * ratio));
  target.height = Math.max(1, Math.round(canvas.height * ratio));
  const context = target.getContext("2d");
  context.drawImage(canvas, 0, 0, target.width, target.height);
  sessionStorage.setItem("real3dmaker-preview-image", target.toDataURL("image/png"));
}

async function loadPreviewObject(file, extension, THREE) {
  if (extension === "stl") {
    const { STLLoader } = await import("three/addons/loaders/STLLoader.js");
    const geometry = new STLLoader().parse(await file.arrayBuffer());
    geometry.deleteAttribute?.("normal");
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        color: 0xf8fafc,
        roughness: 0.58,
        metalness: 0.02,
        side: THREE.DoubleSide,
      })
    );
  }

  const url = URL.createObjectURL(file);
  try {
    if (extension === "obj") {
      const { OBJLoader } = await import("three/addons/loaders/OBJLoader.js");
      return new OBJLoader().loadAsync(url);
    }
    if (extension === "3mf") {
      const { ThreeMFLoader } = await import("three/addons/loaders/3MFLoader.js");
      return new ThreeMFLoader().loadAsync(url);
    }
    if (extension === "amf") {
      const { AMFLoader } = await import("three/addons/loaders/AMFLoader.js");
      return new AMFLoader().loadAsync(url);
    }
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  throw new Error("unsupported-preview-format");
}

async function renderModelPreview(file) {
  const extension = getExtension(file.name);
  resetModelViewer();

  if (!["stl", "obj", "3mf", "amf"].includes(extension)) {
    setPreviewStatus(
      file.name,
      "파일을 받았습니다.",
      "이 형식은 접수 후 실제 형상을 확인합니다.",
      "is-ready"
    );
  } else {
    setPreviewStatus("모델을 불러오는 중입니다.", "잠시만 기다려주세요.", "드래그 회전 · 휠 확대/축소");
  }

  try {
    const THREE = await import("three");
    const { OrbitControls } = await import("three/addons/controls/OrbitControls.js");
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x575a63);

    const bounds = modelStage.getBoundingClientRect();
    const width = Math.max(1, Math.round(bounds.width || modelStage.clientWidth || 720));
    const height = Math.max(1, Math.round(bounds.height || modelStage.clientHeight || 420));
    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 10000);
    setupPlateCamera(THREE, camera);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    setupRenderer(THREE, renderer, width, height);
    renderer.domElement.dataset.engine = "three.js r159";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.opacity = "1";
    renderer.domElement.style.transition = "opacity 0.2s";
    renderer.domElement.style.touchAction = "none";
    renderer.domElement.style.cursor = "grab";
    modelStage.append(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    setupPlateControls(controls);

    addStudioLights(THREE, scene);
    scene.add(makeBuildPlate(THREE));

    let object;
    let fallback = false;
    try {
      object = ["stl", "obj", "3mf", "amf"].includes(extension)
        ? await loadPreviewObject(file, extension, THREE)
        : makeFallbackPreviewObject(THREE);
    } catch (error) {
      console.warn("Real3DMaker preview fallback:", error);
      object = makeFallbackPreviewObject(THREE);
      fallback = true;
    }

    const normalized = normalizeObjectForPlate(THREE, preparePreviewObject(THREE, object));
    object = normalized.object;
    scene.add(object);
    fitObjectToView(THREE, object, camera, controls);
    const supportGroup = makeSupportPreview(THREE, object);
    scene.add(supportGroup);
    modelPlaceholder.hidden = true;

    const resize = () => {
      const nextBounds = modelStage.getBoundingClientRect();
      const nextWidth = Math.max(1, Math.round(nextBounds.width || modelStage.clientWidth || width));
      const nextHeight = Math.max(1, Math.round(nextBounds.height || modelStage.clientHeight || height));
      camera.aspect = nextWidth / nextHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(nextWidth, nextHeight);
    };

    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
      modelViewer.frame = requestAnimationFrame(animate);
    };

    modelViewer = { THREE, scene, renderer, controls, resize, frame: 0, object, supportGroup };
    applyPreviewMode();
    window.addEventListener("resize", resize);
    animate();
    setPreviewStatus(
      file.name,
      fallback || !["stl", "obj", "3mf", "amf"].includes(extension)
        ? "파일은 접수됐고, 대체 출력 시뮬레이션을 표시합니다."
        : "미리보기 준비 완료",
      fallback || !["stl", "obj", "3mf", "amf"].includes(extension)
        ? "정확한 형상은 주문 접수 후 확인합니다."
        : normalized.displayScale !== 1
        ? `미리보기 배율 ${normalized.displayScale.toFixed(2)}x · 드래그 회전 · 휠 확대/축소`
        : "드래그 회전 · 휠 확대/축소",
      "is-ready"
    );
    applyPreviewMode();
  } catch (error) {
    console.error("Real3DMaker preview failed:", error);
    resetModelViewer();
    setPreviewStatus(
      "모델 미리보기를 불러오지 못했습니다.",
      "오류",
      "파일이 손상됐거나 브라우저에서 바로 읽기 어려운 형식입니다. 주문 접수 후 변환 단계에서 확인합니다.",
      "is-error"
    );
  }
}

async function renderSamplePreview() {
  resetModelViewer();
  activeSlicerQuote = null;
  uploadedFileInfo = null;
  modelFile.value = "";
  fileStatus.hidden = true;
  resultFileCheck.textContent = "샘플 모델은 조작 예시입니다. 견적은 파일을 올리면 계산됩니다.";
  detailSize.textContent = "-";
  setViewportStats("샘플 키링 태그", ["크기: 108 x 62 x 9 mm", "조작: 드래그 회전 · 휠 확대/축소"]);
  calculate();
  setPreviewStatus("샘플 키링 태그", "드래그 회전 · 휠 확대/축소", "실제 견적은 파일 업로드 후 계산됩니다.", "is-ready");

  try {
    const THREE = await import("three");
    const { OrbitControls } = await import("three/addons/controls/OrbitControls.js");
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x575a63);
    const bounds = modelStage.getBoundingClientRect();
    const width = Math.max(1, Math.round(bounds.width || modelStage.clientWidth || 720));
    const height = Math.max(1, Math.round(bounds.height || modelStage.clientHeight || 420));
    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 10000);
    setupPlateCamera(THREE, camera);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    setupRenderer(THREE, renderer, width, height);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.touchAction = "none";
    renderer.domElement.style.cursor = "grab";
    modelStage.append(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    setupPlateControls(controls);

    addStudioLights(THREE, scene);
    scene.add(makeBuildPlate(THREE));

    const { object } = normalizeObjectForPlate(THREE, preparePreviewObject(THREE, makeSamplePreviewObject(THREE)));
    scene.add(object);
    fitObjectToView(THREE, object, camera, controls);
    modelPlaceholder.hidden = true;

    const resize = () => {
      const nextBounds = modelStage.getBoundingClientRect();
      const nextWidth = Math.max(1, Math.round(nextBounds.width || modelStage.clientWidth || width));
      const nextHeight = Math.max(1, Math.round(nextBounds.height || modelStage.clientHeight || height));
      camera.aspect = nextWidth / nextHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(nextWidth, nextHeight);
    };
    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
      modelViewer.frame = requestAnimationFrame(animate);
    };

    modelViewer = { THREE, scene, renderer, controls, resize, frame: 0, object, supportGroup: null };
    window.addEventListener("resize", resize);
    animate();
  } catch (error) {
    console.error("Real3DMaker sample preview failed:", error);
    resetModelViewer();
    setPreviewStatus("샘플을 열지 못했습니다.", "파일을 직접 올려주세요.", "브라우저가 3D 렌더링을 지원하지 않을 수 있습니다.", "is-error");
  }
}

async function inspectModelFile(file) {
  const extension = getExtension(file.name);
  const baseInfo = `${extension.toUpperCase()} · ${formatBytes(file.size)}`;
  const supported = ["stl", "3mf", "step", "stp", "obj", "amf"].includes(extension);

  if (!supported) {
    applyFileInfo({
      name: file.name,
      meta: `${baseInfo} · 지원 권장 형식이 아닙니다`,
      resultText: "확장자를 확인해주세요. 권장 형식은 STL, 3MF, STEP, OBJ입니다.",
    });
    return;
  }

  if (extension === "stl") {
    const buffer = await file.arrayBuffer();
    const binaryBounds = getBinaryStlBounds(buffer);
    const textBounds = binaryBounds
      ? null
      : getAsciiStlBounds(new TextDecoder("utf-8", { fatal: false }).decode(buffer));
    const bounds = binaryBounds || textBounds;

    if (bounds) {
      const dimensions = summarizeDimensions(bounds.size);
      const maxDimension = Math.max(...bounds.size);
      applyFileInfo({
        name: file.name,
        meta: `${baseInfo} · 삼각형 ${bounds.triangles.toLocaleString("ko-KR")}개 · ${dimensions}`,
        resultText: `STL 파일 확인됨. 대략 치수는 ${dimensions}이며 최대 치수를 견적기에 반영했습니다.`,
        maxDimension,
        dimensions,
        triangles: bounds.triangles,
      });
      return;
    }
  }

  applyFileInfo({
    name: file.name,
    meta: `${baseInfo} · 파일 선택 완료`,
    resultText: `${extension.toUpperCase()} 파일이 선택되었습니다. 최종 치수와 출력 가능 여부는 파일 검토 후 확정됩니다.`,
  });
}

function clearUploadedFile() {
  modelFile.value = "";
  uploadedFileInfo = null;
  slicerRequestId += 1;
  activeSlicerQuote = null;
  resetModelViewer();
  fileStatus.hidden = true;
  fileName.textContent = "파일 미선택";
  fileMeta.textContent = "파일을 올리면 확인 정보가 표시됩니다.";
  resultFileCheck.textContent = "3D 파일을 올리면 파일 확인 상태가 여기에 표시됩니다.";
  setViewportStats("모델 정보", ["파일을 올리면 크기와 형식이 표시됩니다."]);
  setPreviewStatus(
    "파일을 올리거나 샘플을 열어보세요.",
    "드래그 회전 · 휠 확대/축소",
    "실제 출력 가능 여부는 주문 접수 후 최종 확인합니다."
  );
  setSlicerStatus(
    "is-pending",
    "파일 업로드 대기",
    "파일을 올리면 예상 견적을 계산합니다."
  );
  calculate();
}

function calculate() {
  const material = materialRates[valueOf("material")];
  const layer = layerMultipliers[valueOf("layer")];
  const finish = finishRates[valueOf("finish")];
  const weight = Number(valueOf("weight")) || 0;
  const quantity = Number(valueOf("quantity")) || 1;
  const hours = Number(valueOf("hours")) || 0;
  const maxSize = Number(valueOf("maxSize")) || 0;
  const support = valueOf("support");
  const multiColor = valueOf("multiColor");
  const rush = valueOf("rush");
  const fileReviewCost = uploadedFileInfo ? 3000 : 0;

  if (!uploadedFileInfo) {
    estimate.textContent = formatter.format(0);
    detailMaterial.textContent = material.label;
    detailWeight.textContent = `${weight}g`;
    setText(detailInfill, support ? "보통" : "낮음");
    setText(detailQuality, layer.label.includes("정밀") ? "Fine" : layer.label.includes("빠른") ? "Draft" : "Normal");
    setText(detailTime, `${hours}시간`);
    setText(detailQuantity, `${quantity}개`);
    detailPrice.textContent = formatter.format(0);
    note.textContent = "3D 모델 파일을 올리면 파일 정보와 출력 조건을 기준으로 견적을 계산합니다.";
    breakdown.innerHTML = [
      ["소재", material.label],
      ["적층", layer.label],
      ["재료/장비", "파일 업로드 후 계산"],
      ["서포트/색상", support || multiColor ? "조건 선택됨" : "기본"],
      ["후가공/납기", finish.label],
      ["파일 검토", "미업로드"],
    ]
      .map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`)
      .join("");
    quoteMail.href = "#quote";
    quoteMail.setAttribute("aria-disabled", "true");
    return;
  }

  const setup = 9000;
  const materialCost = weight * material.gram * quantity;
  const machineCost = hours * material.hourly * quantity;
  const supportCost = support ? Math.max(4000, weight * 38 * quantity) : 0;
  const colorCost = multiColor ? Math.max(8000, weight * 42 * quantity) : 0;
  const finishCost = finish.value * quantity;
  const sizeCost = maxSize > 240 ? 24000 : maxSize > 180 ? 12000 : 0;

  const subtotal =
    (setup + materialCost + machineCost + supportCost + colorCost + finishCost + sizeCost + fileReviewCost) *
    material.multiplier *
    layer.value;
  const rushCost = rush ? subtotal * 0.25 : 0;
  const total = Math.max(15000, roundPrice(subtotal + rushCost));
  const finalTotal = activeSlicerQuote?.total && activeSlicerQuote.total > 0 ? activeSlicerQuote.total : total;

  estimate.textContent = formatter.format(finalTotal);
  detailMaterial.textContent = material.label;
  detailWeight.textContent = `${weight}g`;
  setText(detailInfill, support ? "보통" : "낮음");
  setText(detailQuality, layer.label.includes("정밀") ? "Fine" : layer.label.includes("빠른") ? "Draft" : "Normal");
  setText(detailTime, `${hours}시간`);
  setText(detailQuantity, `${quantity}개`);
  detailPrice.textContent = formatter.format(finalTotal);
  note.textContent =
    activeSlicerQuote?.total && activeSlicerQuote.total > 0
      ? "Bambu 슬라이싱 워커가 내려준 총액을 반영한 사전 견적입니다."
      : maxSize > 256
      ? "256mm를 넘는 모델은 분할 출력 검토가 필요합니다."
      : "업로드 파일과 출력 조건을 기준으로 계산한 사전 견적입니다.";

  breakdown.innerHTML = [
    ["소재", material.label],
    ["적층", layer.label],
    ["재료/장비", formatter.format(roundPrice(materialCost + machineCost))],
    ["서포트/색상", formatter.format(roundPrice(supportCost + colorCost))],
    ["후가공/납기", formatter.format(roundPrice(finishCost + rushCost))],
    ["파일 검토", uploadedFileInfo ? formatter.format(fileReviewCost) : "미업로드"],
  ]
    .map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`)
    .join("");

  const subject = encodeURIComponent("3D 프린팅 견적 문의");
  const body = encodeURIComponent(
    [
      "Real3DMaker 주문 조건",
      `소재: ${material.label}`,
      `예상 필라멘트: ${weight}g`,
      `수량: ${quantity}개`,
      `출력 시간: ${hours}시간`,
      `최대 치수: ${maxSize}mm`,
      `적층 높이: ${layer.label}`,
      `후가공: ${finish.label}`,
      `서포트: ${support ? "필요" : "불필요"}`,
      `다색 출력: ${multiColor ? "예" : "아니오"}`,
      `빠른 납기: ${rush ? "예" : "아니오"}`,
      `업로드 파일: ${uploadedFileInfo ? uploadedFileInfo.name : "없음"}`,
      `예상 금액: ${formatter.format(finalTotal)}`,
      "",
      "모델 파일을 첨부해 최종 견적을 확인해주세요.",
    ].join("\n")
  );

  const orderParams = new URLSearchParams({
    material: material.label,
    weight,
    quantity,
    hours,
    maxSize,
    layer: layer.label,
    finish: finish.label,
    support: support ? "필요" : "불필요",
    multicolor: multiColor ? "예" : "아니오",
    rush: rush ? "예" : "아니오",
    file: uploadedFileInfo ? uploadedFileInfo.name : "미업로드",
    estimate: formatter.format(finalTotal),
    note: decodeURIComponent(body),
  });
  quoteMail.href = `order.html?${orderParams.toString()}`;
  quoteMail.removeAttribute("aria-disabled");
}

function handleQuoteFormChange(event) {
  if (event.target !== modelFile && activeSlicerQuote) {
    activeSlicerQuote = null;
    setSlicerStatus(
      "is-pending",
      "조건 변경됨",
      "출력 조건이 바뀌어 정밀 슬라이싱 총액 적용을 해제하고 현재 조건 기반 견적으로 계산합니다."
    );
  }
  calculate();
  applyPreviewMode();
}

if (form) {
  form.addEventListener("input", handleQuoteFormChange);
  form.addEventListener("change", handleQuoteFormChange);
  previewModeButtons.forEach((button) => {
    button.addEventListener("click", () => setPreviewMode(button.dataset.previewMode));
  });
  modelFile.addEventListener("change", () => {
    const [file] = modelFile.files;
    if (file) {
      inspectModelFile(file).catch(() => clearUploadedFile());
      renderModelPreview(file);
      requestSlicerEstimate(file);
    }
  });
  clearFile.addEventListener("click", clearUploadedFile);
  samplePreview?.addEventListener("click", renderSamplePreview);
  quoteMail.addEventListener("click", savePreviewSnapshot);

  ["dragenter", "dragover"].forEach((eventName) => {
    fileDrop.addEventListener(eventName, (event) => {
      event.preventDefault();
      fileDrop.classList.add("is-dragover");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    fileDrop.addEventListener(eventName, (event) => {
      event.preventDefault();
      fileDrop.classList.remove("is-dragover");
    });
  });

  fileDrop.addEventListener("drop", (event) => {
    const [file] = event.dataTransfer.files;
    if (file) {
      try {
        modelFile.files = event.dataTransfer.files;
      } catch {
        modelFile.value = "";
      }
      inspectModelFile(file).catch(() => clearUploadedFile());
      renderModelPreview(file);
      requestSlicerEstimate(file);
    }
  });

  calculate();
}
