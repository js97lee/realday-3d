const materialRates = {
  pla: { label: "PLA", gram: 95, hourly: 2600, multiplier: 1 },
  petg: { label: "PETG", gram: 125, hourly: 2900, multiplier: 1.08 },
  abs: { label: "ABS/ASA", gram: 150, hourly: 3300, multiplier: 1.18 },
  tpu: { label: "TPU", gram: 180, hourly: 3600, multiplier: 1.32 },
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

const formatter = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0,
});

function valueOf(id) {
  const element = document.querySelector(`#${id}`);
  return element.type === "checkbox" ? element.checked : element.value;
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

  if (info.maxDimension) {
    maxSizeInput.value = Math.ceil(info.maxDimension);
  }

  calculate();
}

function setPreviewStatus(title, hint, note, state = "") {
  modelPreviewTitle.textContent = title;
  simulationHint.textContent = hint;
  simulationHint.className = `simulation-hint ${state}`;
  modelPreviewNote.textContent = note;
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
  const grid = new THREE.GridHelper(size, 32, 0xa9a9a9, 0xb8b8b8);
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
  return plate;
}

function fitObjectToView(THREE, object, camera, controls) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  object.position.sub(center);
  object.position.z += size.z / 2;

  const maxDimension = Math.max(size.x, size.y, size.z) || 1;
  const distance = Math.max(180, maxDimension * 2.6);
  camera.position.set(distance * 0.8, -distance * 1.05, distance * 0.75);
  camera.near = distance / 100;
  camera.far = distance * 100;
  camera.updateProjectionMatrix();

  controls.target.set(0, 0, Math.max(4, size.z / 3));
  controls.update();
}

function preparePreviewObject(THREE, object) {
  object.traverse((child) => {
    if (child.isMesh) {
      child.material = new THREE.MeshStandardMaterial({
        color: 0xd7d7d7,
        roughness: 0.58,
        metalness: 0.02,
      });
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
    color: 0xf15a24,
    transparent: true,
    opacity: 0.58,
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

function applyPreviewMode() {
  if (!modelViewer) return;
  modelViewer.object.traverse((child) => {
    if (child.isMesh) {
      child.material.color.set(previewMode === "source" ? 0xd7d7d7 : 0x77b7ff);
      child.material.wireframe = previewMode === "source";
      child.material.opacity = 1;
      child.material.transparent = false;
    }
  });
  if (modelViewer.supportGroup) {
    modelViewer.supportGroup.visible = previewMode === "print" && valueOf("support");
  }
  simulationHint.textContent =
    previewMode === "print"
      ? "*버튼을 눌러 실제 출력 모델을 확인해 보세요. 실제 출력 시 서포트가 추가될 수 있습니다."
      : "원본 모델을 빌드 플레이트 위에서 확인 중입니다.";
}

async function loadPreviewObject(file, extension, THREE) {
  if (extension === "stl") {
    const { STLLoader } = await import("three/addons/loaders/STLLoader.js");
    const geometry = new STLLoader().parse(await file.arrayBuffer());
    geometry.computeVertexNormals();
    return new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ color: 0x77b7ff, roughness: 0.46, metalness: 0.08 })
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

  if (["step", "stp"].includes(extension)) {
    setPreviewStatus(
      "STEP 파일은 주문 접수 후 변환 단계에서 확인합니다.",
      "변환 필요",
      "브라우저 미리보기는 STL, OBJ, 3MF, AMF 파일을 지원합니다.",
      "is-error"
    );
    return;
  }

  if (!["stl", "obj", "3mf", "amf"].includes(extension)) {
    setPreviewStatus("미리보기를 지원하지 않는 파일입니다.", "확인 필요", "STL, OBJ, 3MF, AMF 파일을 올려주세요.", "is-error");
    return;
  }

  setPreviewStatus("모델을 불러오는 중입니다.", "로딩", "파일 크기에 따라 몇 초 걸릴 수 있습니다.");

  try {
    const THREE = await import("three");
    const { OrbitControls } = await import("three/addons/controls/OrbitControls.js");
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf7f7f7);

    const width = modelStage.clientWidth || 720;
    const height = modelStage.clientHeight || 420;
    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 10000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    modelStage.append(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.screenSpacePanning = true;

    scene.add(new THREE.HemisphereLight(0xffffff, 0xcbd5e1, 2.4));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.5);
    keyLight.position.set(4, 6, 7);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0x93c5fd, 1.1);
    rimLight.position.set(-5, 2, -4);
    scene.add(rimLight);
    scene.add(makeBuildPlate(THREE));

    const object = preparePreviewObject(THREE, await loadPreviewObject(file, extension, THREE));
    scene.add(object);
    fitObjectToView(THREE, object, camera, controls);
    const supportGroup = makeSupportPreview(THREE, object);
    scene.add(supportGroup);
    modelPlaceholder.hidden = true;

    const resize = () => {
      const nextWidth = modelStage.clientWidth || width;
      const nextHeight = modelStage.clientHeight || height;
      camera.aspect = nextWidth / nextHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(nextWidth, nextHeight);
    };

    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
      modelViewer.frame = requestAnimationFrame(animate);
    };

    modelViewer = { scene, renderer, controls, resize, frame: 0, object, supportGroup };
    applyPreviewMode();
    window.addEventListener("resize", resize);
    animate();
    setPreviewStatus(file.name, "자동 시뮬레이션 생성 완료", "마우스로 회전하고 휠로 확대할 수 있습니다.", "is-ready");
    applyPreviewMode();
  } catch (error) {
    resetModelViewer();
    setPreviewStatus(
      "모델 미리보기를 불러오지 못했습니다.",
      "오류",
      "파일이 손상됐거나 브라우저에서 바로 읽기 어려운 형식입니다. 주문 접수 후 변환 단계에서 확인합니다.",
      "is-error"
    );
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
  resetModelViewer();
  fileStatus.hidden = true;
  fileName.textContent = "파일 미선택";
  fileMeta.textContent = "파일을 올리면 확인 정보가 표시됩니다.";
  resultFileCheck.textContent = "3D 파일을 올리면 파일 확인 상태가 여기에 표시됩니다.";
  setPreviewStatus(
    "파일을 올리면 모델이 표시됩니다.",
    "파일을 올리면 웹사이트가 자동으로 출력 미리보기를 생성합니다.",
    "STEP/STP 파일은 주문 접수 후 변환 단계에서 확인합니다."
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

  estimate.textContent = formatter.format(total);
  detailMaterial.textContent = material.label;
  detailWeight.textContent = `${weight}g`;
  detailInfill.textContent = support ? "보통" : "낮음";
  detailQuality.textContent = layer.label.includes("정밀") ? "Fine" : layer.label.includes("빠른") ? "Draft" : "Normal";
  detailTime.textContent = `${hours}시간`;
  detailQuantity.textContent = `${quantity}개`;
  detailPrice.textContent = formatter.format(total);
  note.textContent =
    maxSize > 256
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
      "BlueForge 주문 조건",
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
      `예상 금액: ${formatter.format(total)}`,
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
    estimate: formatter.format(total),
    note: decodeURIComponent(body),
  });
  quoteMail.href = `order.html?${orderParams.toString()}`;
}

form.addEventListener("input", calculate);
form.addEventListener("change", calculate);
form.addEventListener("change", () => {
  applyPreviewMode();
});
previewModeButtons.forEach((button) => {
  button.addEventListener("click", () => setPreviewMode(button.dataset.previewMode));
});
modelFile.addEventListener("change", () => {
  const [file] = modelFile.files;
  if (file) {
    inspectModelFile(file).catch(() => clearUploadedFile());
    renderModelPreview(file);
  }
});
clearFile.addEventListener("click", clearUploadedFile);

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
    inspectModelFile(file).catch(() => clearUploadedFile());
    renderModelPreview(file);
  }
});

calculate();
