/**
 * FILE 3: src/components/DynamicBoxEngine.tsx
 * THE 3D PRESENTATION COMPONENT — VIEW LAYER ONLY.
 *
 * - Imports `FEFCO_0215_TOPOLOGY` from `src/config/topologies/fefco0215_tuck_end.ts` (File 1).
 * - Imports `calculateBoxKinematics` from `src/engines/BoxKinematicsSolver.ts` (File 2).
 * - Maps over the panels from File 1, queries File 2 for their current 3D position & Euler rotation,
 *   and updates the Three.js mesh instances:
 *     * Outer faces (+Z in local panel space) render packaging artwork with BlueStone branding.
 *     * Inner cavity faces (-Z in local panel space) render raw unprinted Kraft/Greyboard substrate (#D1C7BD).
 * - Handles mouse wheel zoom clamping (minDistance: 350mm, maxDistance: 1600mm) without polluting folding logic.
 */

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Compass, RotateCw } from 'lucide-react';
import {
  AgentAnPbrTexturePack,
  ChoreographyPhaseId,
  ChoreographyStatus,
  Language,
  PackagingContract,
  SubstratePresetId,
} from '../types/packaging';
import {
  CHOREOGRAPHY_CONFIG,
  SUBSTRATE_MATERIAL_CONFIG,
  getTranslation,
} from '../config/studioConfig';
import {
  GeneratedBoxTextures,
  buildProceduralBoxTextures,
} from '../utils/proceduralBoxTextures';
import { TextureSlotId } from '../config/topologies/fefco0215_tuck_end';
import fefco0201RscJson from '../config/topologies/FEFCO_0201_RSC.json';
import fefco0215TuckJson from '../config/topologies/FEFCO_0215_TUCK.json';
import {
  BoxTopologyPanelNode,
  BoxTopologySpec,
  solveTopologyGraphKinematics,
} from '../engines/BoxKinematicsSolver';

const DEFAULT_CARTON_TOPOLOGY = fefco0201RscJson as unknown as BoxTopologySpec;
const DEFAULT_GIFTBOX_TOPOLOGY = fefco0215TuckJson as unknown as BoxTopologySpec;

export interface DynamicBoxEngineProps {
  lang: Language;
  contract: PackagingContract;
  /** Data-driven kinematic topology JSON conforming to box_topology.schema.json */
  topologyConfig?: BoxTopologySpec;
  /** Primary folding progress (0..100%) or normalized foldProgress (0.0..1.0) */
  foldPercent: number;
  foldProgress?: number;
  onFoldPercentChange: (percent: number) => void;
  /** Material substrate preset (also supports alias `materialPreset`) */
  activeSubstrate: SubstratePresetId;
  materialPreset?: SubstratePresetId;
  customPbrPack: AgentAnPbrTexturePack;
  /** Zoom scale (also supports alias `zoomScale`) */
  zoom: number;
  zoomScale?: number;
  onZoomChange?: (nextZoom: number) => void;
  choreographyStatus: ChoreographyStatus;
  onChoreographyStatusChange: (status: ChoreographyStatus) => void;
  choreographyPhase: ChoreographyPhaseId;
  onChoreographyPhaseChange: (phase: ChoreographyPhaseId) => void;
  replayTriggerCount: number;
  recordRequestCount: number;
  isRecordingWebm: boolean;
  onRecordingStateChange: (recording: boolean) => void;
  onRecordingElapsedChange: (elapsedSec: number) => void;
  onRecordingComplete: (fileName: string) => void;
  cameraAzimuthDeg: number;
  cameraPolarDeg: number;
  onCameraAngleChange: (azimuthDeg: number, polarDeg: number) => void;
  xrayMode: boolean;
  fitToScreenTriggerCount?: number;
}

// Probe for software WebGL renderer (SwiftShader / llvmpipe / Basic Render)
function detectSoftwareWebGL(): boolean {
  try {
    const probe = document.createElement('canvas');
    const pgl = probe.getContext('webgl');
    if (!pgl) return false;
    const dbg = pgl.getExtension('WEBGL_debug_renderer_info');
    const rendererStr = dbg
      ? String(pgl.getParameter(dbg.UNMASKED_RENDERER_WEBGL))
      : '';
    pgl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(
      rendererStr
    );
  } catch {
    return false;
  }
}

const IS_SOFTWARE_GL = detectSoftwareWebGL();

// Pre-allocated math temporaries outside the render loop (Zero GC pressure)
const _camPos = new THREE.Vector3();
const _lookTarget = new THREE.Vector3();

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function smoothstep(v: number, edge0: number, edge1: number): number {
  if (edge1 <= edge0) return v >= edge1 ? 1 : 0;
  const t = clamp01((v - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

interface PanelMeshRecord {
  id: string;
  mesh: THREE.Mesh;
}

interface PanelOuterMaterialRecord {
  id: string;
  textureSlot: TextureSlotId;
  uvBounds: [number, number, number, number];
  material: THREE.MeshPhysicalMaterial;
}

interface PresentationRigState {
  rootGroup: THREE.Group;
  panelMeshes: PanelMeshRecord[];
  outerMaterials: THREE.MeshPhysicalMaterial[];
  panelOuterMaterials: PanelOuterMaterialRecord[];
  innerMaterial: THREE.MeshStandardMaterial;
  edgeLines: THREE.LineSegments[];
  unitPerMm: number;
  boxHeightUnits: number;
  disposeRig: () => void;
}

export const DynamicBoxEngine: React.FC<DynamicBoxEngineProps> = ({
  lang,
  contract,
  topologyConfig,
  foldPercent,
  foldProgress,
  onFoldPercentChange,
  activeSubstrate,
  materialPreset,
  customPbrPack,
  zoom,
  zoomScale,
  onZoomChange,
  choreographyStatus,
  onChoreographyStatusChange,
  choreographyPhase,
  onChoreographyPhaseChange,
  replayTriggerCount,
  recordRequestCount,
  isRecordingWebm,
  onRecordingStateChange,
  onRecordingElapsedChange,
  onRecordingComplete,
  cameraAzimuthDeg,
  cameraPolarDeg,
  onCameraAngleChange,
  xrayMode,
  fitToScreenTriggerCount = 0,
}) => {
  const fullT = getTranslation(lang);
  const t = fullT.col2;

  const activeTopology: BoxTopologySpec =
    topologyConfig ??
    (contract.product.artworkType === 'CARTON_BOX'
      ? DEFAULT_CARTON_TOPOLOGY
      : DEFAULT_GIFTBOX_TOPOLOGY);
  const activeTopologyRef = useRef<BoxTopologySpec>(activeTopology);
  activeTopologyRef.current = activeTopology;

  const resolvedSubstrate = materialPreset ?? activeSubstrate;
  const resolvedZoom = zoomScale ?? zoom;
  const resolvedFoldPercent =
    typeof foldProgress === 'number' ? foldProgress * 100 : foldPercent;

  const {
    minDistanceMm = 250,
    maxDistanceMm = 3600,
    defaultDistanceMm = 1150,
  } = activeTopology.cameraLimitsMm ?? {};

  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rigRef = useRef<PresentationRigState | null>(null);
  const [rigVersion, setRigVersion] = useState<number>(0);
  const texturesRef = useRef<GeneratedBoxTextures | null>(null);
  const requestRenderRef = useRef<() => void>(() => {});

  // Physical camera distance in millimeters (strictly clamped 250mm .. 3600mm)
  const [cameraDistanceMm, setCameraDistanceMm] = useState<number>(
    defaultDistanceMm
  );
  const cameraDistanceMmRef = useRef<number>(defaultDistanceMm);
  cameraDistanceMmRef.current = cameraDistanceMm;

  const foldPercentRef = useRef<number>(resolvedFoldPercent);
  foldPercentRef.current = resolvedFoldPercent;

  const azimuthDegRef = useRef<number>(cameraAzimuthDeg);
  azimuthDegRef.current = cameraAzimuthDeg;

  const polarDegRef = useRef<number>(cameraPolarDeg);
  polarDegRef.current = cameraPolarDeg;

  const xrayRef = useRef<boolean>(xrayMode);
  xrayRef.current = xrayMode;

  const choreographyStatusRef = useRef<ChoreographyStatus>(choreographyStatus);
  choreographyStatusRef.current = choreographyStatus;

  const isRecordingRef = useRef<boolean>(isRecordingWebm);
  isRecordingRef.current = isRecordingWebm;

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordedChunksRef = useRef<BlobPart[]>([]);
  const choreographyStartPerfRef = useRef<number>(0);

  const { length_mm: L, width_mm: W, height_mm: H } = contract.product.dimensions;
  const dimsRef = useRef({ L, W, H });
  dimsRef.current = { L, W, H };

  const baseSubstrateSpec = SUBSTRATE_MATERIAL_CONFIG[resolvedSubstrate];
  const effectiveRoughness =
    resolvedSubstrate === 'AGENT_AN_CUSTOM_PBR'
      ? customPbrPack.roughness
      : baseSubstrateSpec.roughness;
  const effectiveMetalness =
    resolvedSubstrate === 'AGENT_AN_CUSTOM_PBR'
      ? customPbrPack.metalness
      : baseSubstrateSpec.metalness;

  // Map toolbar zoom scale (0.25 .. 3.4) to physical camera distance in mm (250mm .. 3600mm)
  useEffect(() => {
    const mappedMm = clamp(
      Math.round(defaultDistanceMm / Math.max(0.24, resolvedZoom)),
      minDistanceMm,
      maxDistanceMm
    );
    setCameraDistanceMm(mappedMm);
    cameraDistanceMmRef.current = mappedMm;
    requestRenderRef.current();
  }, [resolvedZoom, defaultDistanceMm, minDistanceMm, maxDistanceMm]);

  // Dynamic [ ⛶ FIT TO SCREEN ] computation based on flat dieline (0%) vs folded 3D carton (100%)
  useEffect(() => {
    if (fitToScreenTriggerCount === 0) return;
    const container = containerRef.current;
    const aspect = container
      ? Math.max(0.6, container.clientWidth / Math.max(1, container.clientHeight))
      : 1.45;

    const p = clamp01(foldPercentRef.current / 100);
    // Flat sheet width is ~2*(L + W) + 15mm, flat height is ~H + 2*W
    const flatSpanW = 2 * (L + W) + 30;
    const flatSpanH = H + 2 * W;
    const foldedSpanW = Math.hypot(L, W) * 1.15;
    const foldedSpanH = H * 1.25;

    const spanW = lerp(flatSpanW, foldedSpanW, smoothstep(p, 0.0, 0.55));
    const spanH = lerp(flatSpanH, foldedSpanH, smoothstep(p, 0.0, 0.55));

    // PerspectiveCamera vertical FOV is 36 deg -> half-FOV tan is ~0.3249
    const tanHalfFov = Math.tan(THREE.MathUtils.degToRad(18));
    const distForH = (spanH * 0.58) / tanHalfFov;
    const distForW = (spanW * 0.58) / (tanHalfFov * aspect);

    const optimalDistMm = clamp(
      Math.round(Math.max(distForH, distForW)),
      minDistanceMm,
      maxDistanceMm
    );

    setCameraDistanceMm(optimalDistMm);
    cameraDistanceMmRef.current = optimalDistMm;
    if (onZoomChange) {
      const nextZoom = Number(
        clamp(defaultDistanceMm / optimalDistMm, 0.25, 3.4).toFixed(2)
      );
      onZoomChange(nextZoom);
    }
    requestRenderRef.current();
  }, [
    fitToScreenTriggerCount,
    L,
    W,
    H,
    defaultDistanceMm,
    minDistanceMm,
    maxDistanceMm,
    onZoomChange,
  ]);

  // Query schema-driven kinematics solver and apply 3D positions & Euler angles to all panel meshes
  const syncMeshesWithKinematicsSolver = (percent: number) => {
    const rig = rigRef.current;
    if (!rig) return;

    const normalizedProgress = clamp01(percent / 100);
    const poses = solveTopologyGraphKinematics(
      activeTopologyRef.current,
      dimsRef.current,
      normalizedProgress
    );

    const u = rig.unitPerMm;
    for (let i = 0; i < rig.panelMeshes.length; i++) {
      const item = rig.panelMeshes[i];
      const pose = poses[item.id];
      if (!pose) continue;

      item.mesh.position.set(
        pose.position[0] * u,
        pose.position[1] * u,
        pose.position[2] * u
      );
      item.mesh.rotation.set(
        pose.rotation[0],
        pose.rotation[1],
        pose.rotation[2],
        'XYZ'
      );
    }
  };

  // Position camera on spherical orbit using physical millimeter distance [350mm .. 1600mm]
  const updateCameraTransform = (
    azimuthDeg: number,
    polarDeg: number,
    percent: number,
    distanceMm: number
  ) => {
    const camera = cameraRef.current;
    const rig = rigRef.current;
    if (!camera) return;

    const p = clamp01(percent / 100);
    const boxHeightUnits = rig ? rig.boxHeightUnits : 1.5;
    const unitPerMm = rig ? rig.unitPerMm : 1.65 / 485;

    const clampedMm = clamp(distanceMm, minDistanceMm, maxDistanceMm);
    const radiusUnits = clampedMm * unitPerMm;

    const azRad = THREE.MathUtils.degToRad(azimuthDeg);
    const polRad = THREE.MathUtils.degToRad(clamp(polarDeg, 6, 86));

    // At 0% flat dieline, the horizontal sleeve extends farther to the right (+X) than left (-X),
    // so smoothly pan the camera lookAt X target toward the geometric center of the flat sheet ((W + L)/2 * (1 - sleeveProgress))
    const sleeveProgress = smoothstep(p, 0.0, 0.40);
    const sheetCenterOffsetX =
      ((W + L - 15) * 0.5) * unitPerMm * (1 - sleeveProgress);
    const lookY = boxHeightUnits * 0.5;
    _lookTarget.set(sheetCenterOffsetX, lookY, 0);

    _camPos.set(
      sheetCenterOffsetX + radiusUnits * Math.sin(polRad) * Math.sin(azRad),
      lookY + radiusUnits * Math.cos(polRad) - boxHeightUnits * 0.35,
      radiusUnits * Math.sin(polRad) * Math.cos(azRad)
    );

    camera.position.copy(_camPos);
    camera.lookAt(_lookTarget);
  };

  // Native Mouse Wheel Scroll-to-Zoom Listener (strictly clamped 250mm .. 3600mm, prevents page scroll)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();

      const deltaMm = event.deltaY * 0.85;
      const nextDistMm = clamp(
        Math.round(cameraDistanceMmRef.current + deltaMm),
        minDistanceMm,
        maxDistanceMm
      );

      if (nextDistMm !== cameraDistanceMmRef.current) {
        cameraDistanceMmRef.current = nextDistMm;
        setCameraDistanceMm(nextDistMm);
        if (onZoomChange) {
          const equivalentZoom = Number(
            clamp(defaultDistanceMm / nextDistMm, 0.25, 3.4).toFixed(2)
          );
          onZoomChange(equivalentZoom);
        }
        requestRenderRef.current();
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, [defaultDistanceMm, minDistanceMm, maxDistanceMm, onZoomChange]);

  // Initialize Three.js WebGL Scene, PMREM RoomEnvironment & Grounded Turntable Stage
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#05050A');
    sceneRef.current = scene;

    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);

    // Near plane set to 0.25 (equivalent to ~58mm physical distance) and far to 45.0 (~10,000mm)
    // to maximize 24-bit Z-buffer depth precision and eliminate Z-fighting flicker
    const camera = new THREE.PerspectiveCamera(36, width / height, 0.25, 45.0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({
      antialias: !IS_SOFTWARE_GL,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(
      IS_SOFTWARE_GL ? 1 : Math.min(window.devicePixelRatio, 2)
    );
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = !IS_SOFTWARE_GL;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;

    renderer.domElement.className = 'w-full h-full block outline-none';
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Populate scene.environment via PMREM RoomEnvironment for metallic foil & clearcoat reflections
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envRT = pmremGenerator.fromScene(roomEnv, 0.04);
    scene.environment = envRT.texture;
    roomEnv.dispose();
    pmremGenerator.dispose();

    // 3-Point Studio Lighting Rig (balanced so +Z/+X/-X/-Z/+Y outer faces render crisp BlueStone artwork without specular washout)
    const hemiLight = new THREE.HemisphereLight('#FFFFFF', '#2A2D3E', 0.95);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight('#FFFFFF', 1.45);
    keyLight.position.set(4.5, 5.8, 5.2);
    if (!IS_SOFTWARE_GL) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.camera.near = 1;
      keyLight.shadow.camera.far = 16;
      const d = 3.2;
      keyLight.shadow.camera.left = -d;
      keyLight.shadow.camera.right = d;
      keyLight.shadow.camera.top = d;
      keyLight.shadow.camera.bottom = -d;
      keyLight.shadow.bias = -0.0005;
    }
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight('#D8F8FF', 1.05);
    fillLight.position.set(-4.8, 3.6, -4.5);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight('#C4B5FD', 0.85);
    rimLight.position.set(0.5, -3.5, -5.2);
    scene.add(rimLight);

    // Studio Turntable Pedestal + Radial Contact Shadow + Technical Grid
    const stageGroup = new THREE.Group();
    scene.add(stageGroup);

    const pedestalGeo = new THREE.CylinderGeometry(2.65, 2.75, 0.08, 64);
    const pedestalMat = new THREE.MeshStandardMaterial({
      color: '#0A0C14',
      roughness: 0.72,
      metalness: 0.2,
    });
    const pedestalMesh = new THREE.Mesh(pedestalGeo, pedestalMat);
    pedestalMesh.position.y = -0.045;
    pedestalMesh.receiveShadow = !IS_SOFTWARE_GL;
    stageGroup.add(pedestalMesh);

    const ringGeo = new THREE.RingGeometry(2.58, 2.62, 64);
    ringGeo.rotateX(-Math.PI * 0.5);
    const ringMat = new THREE.MeshBasicMaterial({
      color: '#00E5FF',
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.45,
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.position.y = 0.001;
    stageGroup.add(ringMesh);

    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = 256;
    shadowCanvas.height = 256;
    const sCtx = shadowCanvas.getContext('2d')!;
    const radGrad = sCtx.createRadialGradient(128, 128, 12, 128, 128, 120);
    radGrad.addColorStop(0, 'rgba(0, 0, 0, 0.72)');
    radGrad.addColorStop(0.55, 'rgba(0, 0, 0, 0.28)');
    radGrad.addColorStop(1, 'rgba(0, 0, 0, 0.0)');
    sCtx.fillStyle = radGrad;
    sCtx.fillRect(0, 0, 256, 256);
    const shadowTex = new THREE.CanvasTexture(shadowCanvas);

    const contactShadowGeo = new THREE.PlaneGeometry(3.4, 3.4);
    contactShadowGeo.rotateX(-Math.PI * 0.5);
    const contactShadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    });
    const contactShadowMesh = new THREE.Mesh(contactShadowGeo, contactShadowMat);
    contactShadowMesh.position.y = 0.002;
    stageGroup.add(contactShadowMesh);

    const gridHelper = new THREE.GridHelper(5.2, 20, '#1F1F2E', '#121524');
    gridHelper.position.y = 0.003;
    stageGroup.add(gridHelper);

    const gl = renderer.getContext() as WebGL2RenderingContext;
    const afterDraw = IS_SOFTWARE_GL
      ? () => {
          const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
          gl.flush();
          if (sync) gl.deleteSync(sync);
        }
      : () => {};

    let renderQueued = false;
    const renderOnce = () => {
      renderQueued = false;
      syncMeshesWithKinematicsSolver(foldPercentRef.current);
      updateCameraTransform(
        azimuthDegRef.current,
        polarDegRef.current,
        foldPercentRef.current,
        cameraDistanceMmRef.current
      );
      renderer.render(scene, camera);
      afterDraw();
    };

    const requestRender = () => {
      if (!renderQueued) {
        renderQueued = true;
        requestAnimationFrame(renderOnce);
      }
    };
    requestRenderRef.current = requestRender;

    const resizeObserver = new ResizeObserver(() => {
      if (!container) return;
      const w = Math.max(1, container.clientWidth);
      const h = Math.max(1, container.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      requestRender();
    });
    resizeObserver.observe(container);

    requestRender();

    return () => {
      resizeObserver.disconnect();
      if (rigRef.current) {
        rigRef.current.disposeRig();
        rigRef.current = null;
      }
      if (texturesRef.current) {
        texturesRef.current.disposeAll();
        texturesRef.current = null;
      }
      pedestalGeo.dispose();
      pedestalMat.dispose();
      ringGeo.dispose();
      ringMat.dispose();
      contactShadowGeo.dispose();
      contactShadowMat.dispose();
      shadowTex.dispose();
      envRT.dispose();
      renderer.dispose();
    };
  }, []);

  // Recursively instantiate Three.js panel meshes from the active BoxTopologySpec JSON graph
  useEffect(() => {
    const scene = sceneRef.current;
    const renderer = rendererRef.current;
    if (!scene || !renderer) return;

    if (rigRef.current) {
      scene.remove(rigRef.current.rootGroup);
      rigRef.current.disposeRig();
      rigRef.current = null;
    }
    if (texturesRef.current) {
      texturesRef.current.disposeAll();
      texturesRef.current = null;
    }

    const maxAniso = IS_SOFTWARE_GL
      ? 1
      : Math.min(renderer.capabilities.getMaxAnisotropy(), 8);

    const effectiveSubSpec = {
      ...baseSubstrateSpec,
      roughness: effectiveRoughness,
      metalness: effectiveMetalness,
    };

    const textures = buildProceduralBoxTextures(
      contract,
      effectiveSubSpec,
      maxAniso
    );
    texturesRef.current = textures;

    const maxMm = Math.max(L, W, H, 1);
    const unitPerMm = 1.65 / maxMm;
    const boxHeightUnits = H * unitPerMm;

    const initialPoses = solveTopologyGraphKinematics(
      activeTopology,
      { L, W, H },
      clamp01(foldPercentRef.current / 100)
    );

    const geometriesToDispose: THREE.BufferGeometry[] = [];
    const materialsToDispose: THREE.Material[] = [];
    const outerMaterials: THREE.MeshPhysicalMaterial[] = [];
    const panelOuterMaterials: PanelOuterMaterialRecord[] = [];
    const edgeLines: THREE.LineSegments[] = [];
    const panelMeshes: PanelMeshRecord[] = [];

    // Inner cavity faces (-Z in panel space): Raw unprinted Kraft/Greyboard substrate
    const innerMaterial = new THREE.MeshStandardMaterial({
      color: activeTopology.interiorSubstrateHex || '#D1C7BD',
      roughness: 0.9,
      metalness: 0.02,
      side: THREE.FrontSide,
      polygonOffset: true,
      polygonOffsetFactor: 1.0,
      polygonOffsetUnits: 4.0,
      depthWrite: true,
      depthTest: true,
      wireframe: xrayRef.current,
    });
    materialsToDispose.push(innerMaterial);

    const cutEdgeMaterial = new THREE.MeshStandardMaterial({
      color: '#B8AEA2',
      roughness: 0.92,
      metalness: 0.0,
      side: THREE.FrontSide,
      polygonOffset: true,
      polygonOffsetFactor: 1.0,
      polygonOffsetUnits: 4.0,
      depthWrite: true,
      depthTest: true,
      wireframe: xrayRef.current,
    });
    materialsToDispose.push(cutEdgeMaterial);

    const edgeMat = new THREE.LineBasicMaterial({
      color: '#00E5FF',
      transparent: true,
      opacity: xrayRef.current ? 0.92 : 0.42,
    });
    materialsToDispose.push(edgeMat);

    const rootGroup = new THREE.Group();
    rootGroup.position.set(0, 0.01, 0);

    // Build parent -> children graph and recursively instantiate panel meshes
    const childrenByParent = new Map<string | null, BoxTopologyPanelNode[]>();
    for (const panelDef of activeTopology.panels) {
      const siblings = childrenByParent.get(panelDef.parentId) || [];
      siblings.push(panelDef);
      childrenByParent.set(panelDef.parentId, siblings);
    }

    const visitedPanelIds = new Set<string>();
    const instantiatePanelSubtree = (panelDef: BoxTopologyPanelNode) => {
      if (visitedPanelIds.has(panelDef.id)) return;
      visitedPanelIds.add(panelDef.id);

      const pose = initialPoses[panelDef.id];
      const [widthMm, heightMm, thickMm] = pose
        ? pose.size
        : [L, H, activeTopology.parametricDimensions.caliperMm];

      const wUnits = widthMm * unitPerMm;
      const hUnits = heightMm * unitPerMm;
      const tUnits = Math.max(0.012, thickMm * unitPerMm);

      const geo = new THREE.BoxGeometry(wUnits, hUnits, tUnits);
      geometriesToDispose.push(geo);

      const isInternalFlap = Boolean(panelDef.isInternalFlap);
      const textureSlot: TextureSlotId = panelDef.textureSlot ?? 'flap';
      const artTex = textures[textureSlot];

      const outerMat = new THREE.MeshPhysicalMaterial({
        map: artTex,
        color: '#FFFFFF',
        roughness: Math.max(0.32, effectiveRoughness),
        metalness: Math.min(0.28, effectiveMetalness * 0.35),
        clearcoat: Math.min(0.22, baseSubstrateSpec.clearcoat * 0.35),
        clearcoatRoughness: 0.35,
        reflectivity: 0.35,
        envMapIntensity: 0.35,
        side: THREE.FrontSide,
        polygonOffset: true,
        polygonOffsetFactor: isInternalFlap ? 1.0 : -1.0,
        polygonOffsetUnits: isInternalFlap ? 4.0 : -4.0,
        depthWrite: true,
        depthTest: true,
        wireframe: xrayRef.current,
      });
      materialsToDispose.push(outerMat);
      outerMaterials.push(outerMat);
      panelOuterMaterials.push({
        id: panelDef.id,
        textureSlot,
        uvBounds: panelDef.uvBounds,
        material: outerMat,
      });

      const faceMaterials = [
        cutEdgeMaterial,
        cutEdgeMaterial,
        cutEdgeMaterial,
        cutEdgeMaterial,
        outerMat,
        innerMaterial,
      ];

      const mesh = new THREE.Mesh(geo, faceMaterials);
      mesh.name = `panel_${panelDef.id}`;
      mesh.castShadow = !IS_SOFTWARE_GL;
      mesh.receiveShadow = !IS_SOFTWARE_GL;

      if (pose) {
        mesh.position.set(
          pose.position[0] * unitPerMm,
          pose.position[1] * unitPerMm,
          pose.position[2] * unitPerMm
        );
        mesh.rotation.set(
          pose.rotation[0],
          pose.rotation[1],
          pose.rotation[2],
          'XYZ'
        );
      }

      const edgesGeo = new THREE.EdgesGeometry(geo);
      geometriesToDispose.push(edgesGeo);
      const lineSeg = new THREE.LineSegments(edgesGeo, edgeMat);
      edgeLines.push(lineSeg);
      mesh.add(lineSeg);

      rootGroup.add(mesh);
      panelMeshes.push({ id: panelDef.id, mesh });

      const children = childrenByParent.get(panelDef.id) || [];
      for (const child of children) {
        instantiatePanelSubtree(child);
      }
    };

    const rootNodes = childrenByParent.get(null) || [];
    for (const rootNode of rootNodes) {
      instantiatePanelSubtree(rootNode);
    }

    scene.add(rootGroup);

    rigRef.current = {
      rootGroup,
      panelMeshes,
      outerMaterials,
      panelOuterMaterials,
      innerMaterial,
      edgeLines,
      unitPerMm,
      boxHeightUnits,
      disposeRig: () => {
        geometriesToDispose.forEach((g) => g.dispose());
        materialsToDispose.forEach((m) => m.dispose());
      },
    };

    setRigVersion((v) => v + 1);
    requestRenderRef.current();
  }, [
    activeTopology,
    contract,
    resolvedSubstrate,
    effectiveRoughness,
    effectiveMetalness,
    baseSubstrateSpec,
    L,
    W,
    H,
  ]);

  // Sync X-Ray wireframe toggle
  useEffect(() => {
    const rig = rigRef.current;
    if (!rig) return;
    rig.outerMaterials.forEach((mat) => {
      mat.wireframe = xrayMode;
      mat.needsUpdate = true;
    });
    rig.innerMaterial.wireframe = xrayMode;
    rig.innerMaterial.needsUpdate = true;
    rig.edgeLines.forEach((line) => {
      const mat = line.material as THREE.LineBasicMaterial;
      mat.opacity = xrayMode ? 0.95 : 0.42;
    });
    requestRenderRef.current();
  }, [xrayMode]);

  // Force Three.js material.map & schema-driven uvBounds cropping when rig or customPbrPack updates
  useEffect(() => {
    const rig = rigRef.current;
    if (
      !rig ||
      !rig.panelOuterMaterials ||
      resolvedSubstrate !== 'AGENT_AN_CUSTOM_PBR' ||
      !customPbrPack?.albedoMap
    ) {
      return;
    }

    let cancelled = false;
    const loadedTextures: THREE.Texture[] = [];

    console.log('🚀 AGENT AN PBR LOADED:', customPbrPack, {
      topologyId: activeTopology.topologyId,
      standardCode: activeTopology.standardCode,
    });
    const loader = new THREE.TextureLoader();
    loader.load(
      customPbrPack.albedoMap,
      (baseTexture) => {
        if (cancelled) {
          baseTexture.dispose();
          return;
        }
        baseTexture.colorSpace = THREE.SRGBColorSpace;
        baseTexture.anisotropy = 8;
        baseTexture.wrapS = THREE.ClampToEdgeWrapping;
        baseTexture.wrapT = THREE.ClampToEdgeWrapping;
        baseTexture.needsUpdate = true;
        loadedTextures.push(baseTexture);

        const uvTextureCache = new Map<string, THREE.Texture>();

        const getTextureForUvBounds = (
          uvBounds: [number, number, number, number]
        ): THREE.Texture => {
          const [uMin, vMin, uMax, vMax] = uvBounds;
          if (uMin === 0 && vMin === 0 && uMax === 1 && vMax === 1) {
            return baseTexture;
          }
          const cacheKey = uvBounds.join(',');
          const cached = uvTextureCache.get(cacheKey);
          if (cached) return cached;

          const croppedTex = baseTexture.clone();
          croppedTex.colorSpace = THREE.SRGBColorSpace;
          croppedTex.anisotropy = 8;
          croppedTex.wrapS = THREE.ClampToEdgeWrapping;
          croppedTex.wrapT = THREE.ClampToEdgeWrapping;
          croppedTex.offset.set(uMin, vMin);
          croppedTex.repeat.set(Math.max(0.0001, uMax - uMin), Math.max(0.0001, vMax - vMin));
          croppedTex.needsUpdate = true;

          uvTextureCache.set(cacheKey, croppedTex);
          loadedTextures.push(croppedTex);
          return croppedTex;
        };

        const isGlossyGiftBox =
          contract.product.artworkType === 'GIFT_BOX' ||
          Boolean(customPbrPack.albedoMap?.includes('giftbox_'));

        rig.panelOuterMaterials.forEach(({ uvBounds, material }) => {
          material.map = getTextureForUvBounds(uvBounds);
          material.roughness = customPbrPack.roughness ?? (isGlossyGiftBox ? 0.28 : 0.82);
          material.metalness = customPbrPack.metalness ?? (isGlossyGiftBox ? 0.04 : 0.02);
          material.clearcoat = isGlossyGiftBox ? 0.55 : 0.04;
          material.clearcoatRoughness = isGlossyGiftBox ? 0.1 : 0.6;
          material.needsUpdate = true;
        });
        requestRenderRef.current?.();
      },
      undefined,
      (err) => {
        console.error('❌ Failed to load texture at:', customPbrPack.albedoMap, err);
      }
    );

    return () => {
      cancelled = true;
      loadedTextures.forEach((tex) => tex.dispose());
    };
  }, [rigVersion, activeTopology, customPbrPack, resolvedSubstrate]);

  // Trigger render when foldProgress / foldPercent or camera angles update
  useEffect(() => {
    requestRenderRef.current();
  }, [resolvedFoldPercent, cameraAzimuthDeg, cameraPolarDeg]);

  // Replay choreography from 0% when user clicks Replay button
  useEffect(() => {
    if (replayTriggerCount === 0) return;
    choreographyStartPerfRef.current = performance.now();
    onFoldPercentChange(0);
    onChoreographyPhaseChange('PHASE_1_INSPECTION');
    onChoreographyStatusChange('CHOREOGRAPHY_ACTIVE');
  }, [replayTriggerCount]);

  // Stop & finalize WebM MediaRecorder cleanly
  const stopWebmRecording = (shouldSaveFile: boolean) => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      if (!shouldSaveFile) {
        recorder.ondataavailable = null;
        recorder.onstop = null;
      }
      recorder.stop();
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    mediaRecorderRef.current = null;
    onRecordingStateChange(false);
  };

  // Start or stop WebM recording when user clicks [ ⏺ RECORD 3D SHOWCASE (WEBM) ]
  useEffect(() => {
    if (recordRequestCount === 0) return;

    if (isRecordingRef.current) {
      stopWebmRecording(true);
      onChoreographyStatusChange('SEQUENCE_IDLE');
      onChoreographyPhaseChange('IDLE');
      return;
    }

    const renderer = rendererRef.current;
    if (!renderer) return;

    const canvas = renderer.domElement;
    if (
      typeof canvas.captureStream !== 'function' ||
      typeof MediaRecorder === 'undefined'
    ) {
      return;
    }

    try {
      const stream = canvas.captureStream(CHOREOGRAPHY_CONFIG.captureFps);
      mediaStreamRef.current = stream;

      const mimeCandidates = [
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm',
      ];
      const selectedMime =
        mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) || '';

      const recorder = selectedMime
        ? new MediaRecorder(stream, {
            mimeType: selectedMime,
            videoBitsPerSecond: 10_000_000,
          })
        : new MediaRecorder(stream);

      recordedChunksRef.current = [];

      recorder.ondataavailable = (ev: BlobEvent) => {
        if (ev.data && ev.data.size > 0) {
          recordedChunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, {
          type: selectedMime || 'video/webm',
        });
        recordedChunksRef.current = [];
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach((track) => track.stop());
          mediaStreamRef.current = null;
        }

        const sanitizedModel = contract.product.model
          .trim()
          .replace(/[^a-zA-Z0-9_-]/g, '_');
        const deliverableName = `${sanitizedModel || 'SKU'}_3D_Presentation_Deliverable.webm`;

        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = deliverableName;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        setTimeout(() => URL.revokeObjectURL(url), 3000);

        onRecordingStateChange(false);
        onRecordingComplete(deliverableName);
      };

      mediaRecorderRef.current = recorder;
      recorder.start(100);

      choreographyStartPerfRef.current = performance.now();
      onRecordingElapsedChange(0);
      onRecordingStateChange(true);
      onFoldPercentChange(0);
      onChoreographyPhaseChange('PHASE_1_INSPECTION');
      onChoreographyStatusChange('CHOREOGRAPHY_ACTIVE');
    } catch {
      onRecordingStateChange(false);
    }
  }, [recordRequestCount]);

  // 3-Phase Cinematic Camera Director & Kinematic Choreography RAF Loop
  useEffect(() => {
    if (choreographyStatus !== 'CHOREOGRAPHY_ACTIVE') {
      return;
    }

    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    if (!renderer || !scene || !camera) return;

    const gl = renderer.getContext() as WebGL2RenderingContext;
    const afterDraw = IS_SOFTWARE_GL
      ? () => {
          const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
          gl.flush();
          if (sync) gl.deleteSync(sync);
        }
      : () => {};

    if (choreographyStartPerfRef.current <= 0) {
      choreographyStartPerfRef.current = performance.now();
    }

    let rafId = 0;
    let lastUiSyncTime = 0;

    const stepChoreography = (now: number) => {
      const elapsedSec = (now - choreographyStartPerfRef.current) / 1000;
      const { totalDurationSec, phase1EndSec, phase2EndSec } =
        CHOREOGRAPHY_CONFIG;

      let nextFold = 0;
      let nextAzimuth = 0;
      let nextPolar = 78;
      let nextPhase: ChoreographyPhaseId = 'PHASE_1_INSPECTION';

      if (elapsedSec <= phase1EndSec) {
        nextPhase = 'PHASE_1_INSPECTION';
        const p1 = smoothstep(elapsedSec, 0, phase1EndSec);
        nextFold = 0;
        nextAzimuth = lerp(0, 18, p1);
        nextPolar = lerp(78, 66, p1);
      } else if (elapsedSec <= phase2EndSec) {
        nextPhase = 'PHASE_2_KINEMATICS';
        const p2 = smoothstep(elapsedSec, phase1EndSec, phase2EndSec);
        nextFold = p2 * 100;
        nextAzimuth = lerp(18, 45, p2);
        nextPolar = lerp(66, 56, p2);
      } else if (elapsedSec <= totalDurationSec) {
        nextPhase = 'PHASE_3_TURNTABLE';
        const p3 = smoothstep(elapsedSec, phase2EndSec, totalDurationSec);
        nextFold = 100;
        nextAzimuth = 45 + p3 * 360;
        nextPolar = 56 - Math.sin(p3 * Math.PI) * 6;
      } else {
        nextFold = 100;
        nextAzimuth = 45;
        nextPolar = 56;

        foldPercentRef.current = nextFold;
        azimuthDegRef.current = nextAzimuth;
        polarDegRef.current = nextPolar;

        syncMeshesWithKinematicsSolver(nextFold);
        updateCameraTransform(
          nextAzimuth,
          nextPolar,
          nextFold,
          cameraDistanceMmRef.current
        );
        renderer.render(scene, camera);
        afterDraw();

        onFoldPercentChange(100);
        onCameraAngleChange(45, 56);
        onRecordingElapsedChange(totalDurationSec);

        if (isRecordingRef.current) {
          stopWebmRecording(true);
        }
        onChoreographyPhaseChange('IDLE');
        onChoreographyStatusChange('SEQUENCE_IDLE');
        choreographyStartPerfRef.current = 0;
        return;
      }

      foldPercentRef.current = nextFold;
      azimuthDegRef.current = nextAzimuth;
      polarDegRef.current = nextPolar;

      syncMeshesWithKinematicsSolver(nextFold);
      updateCameraTransform(
        nextAzimuth,
        nextPolar,
        nextFold,
        cameraDistanceMmRef.current
      );
      renderer.render(scene, camera);
      afterDraw();

      if (now - lastUiSyncTime > 48) {
        lastUiSyncTime = now;
        onFoldPercentChange(Math.round(nextFold));
        onChoreographyPhaseChange(nextPhase);
        onCameraAngleChange(
          Math.round(nextAzimuth % 360),
          Math.round(nextPolar)
        );
        if (isRecordingRef.current) {
          onRecordingElapsedChange(Math.min(totalDurationSec, elapsedSec));
        }
      }

      rafId = requestAnimationFrame(stepChoreography);
    };

    rafId = requestAnimationFrame(stepChoreography);

    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [choreographyStatus]);

  // Interactive Pointer Drag-to-Orbit
  const isPointerDownRef = useRef<boolean>(false);
  const pointerLastRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    isPointerDownRef.current = true;
    pointerLastRef.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);

    if (
      choreographyStatusRef.current === 'CHOREOGRAPHY_ACTIVE' &&
      !isRecordingRef.current
    ) {
      choreographyStartPerfRef.current = 0;
      onChoreographyStatusChange('SEQUENCE_IDLE');
      onChoreographyPhaseChange('IDLE');
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPointerDownRef.current) return;
    const dx = e.clientX - pointerLastRef.current.x;
    const dy = e.clientY - pointerLastRef.current.y;
    pointerLastRef.current = { x: e.clientX, y: e.clientY };

    const nextAz = (azimuthDegRef.current - dx * 0.45 + 360) % 360;
    const nextPol = clamp(polarDegRef.current - dy * 0.35, 8, 84);

    azimuthDegRef.current = nextAz;
    polarDegRef.current = nextPol;
    onCameraAngleChange(Math.round(nextAz), Math.round(nextPol));
    requestRenderRef.current();
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPointerDownRef.current) return;
    isPointerDownRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore if pointer capture was already released
    }
  };

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className="w-full h-full relative select-none overflow-hidden cursor-grab active:cursor-grabbing"
    >
      {/* Visual Beacon for Active 3D Rig Verification */}
      <div
        style={{
          position: 'absolute',
          top: 10,
          left: 10,
          zIndex: 9999,
          background: 'red',
          color: 'white',
          padding: 8,
          fontSize: 18,
          fontWeight: 'bold',
          pointerEvents: 'none',
        }}
      >
        AGENT_AN_RIG_ACTIVE: {rigVersion}
      </div>

      {/* Top-Left Technical Telemetry Overlay (Zero backdrop-filter per Three.js WebGL spec) */}
      <div className="absolute top-3 left-3 z-20 bg-[#0A0C14] border border-[#1F1F2E] px-2.5 py-1.5 font-mono text-[10px] text-[#8A8FA3] tabular-nums flex flex-wrap items-center gap-3 pointer-events-none">
        <span className="flex items-center gap-1 text-[#00E5FF]">
          <Compass size={14} strokeWidth={1.25} />
          AZIMUTH: {Math.round(cameraAzimuthDeg)}° | POLAR: {Math.round(cameraPolarDeg)}°
        </span>
        <span className="text-[#00E5FF] font-bold">
          FOLD: {Math.round(resolvedFoldPercent)}%
        </span>
        <span className="text-white">
          DIST: {cameraDistanceMm}MM [{minDistanceMm}–{maxDistanceMm}MM]
        </span>
        <span className="text-white hidden xl:inline">
          PBR: {baseSubstrateSpec.shortCode} | INNER:{' '}
          {activeTopology.interiorSubstrateHex || '#D1C7BD'}
        </span>
        {choreographyPhase !== 'IDLE' && (
          <span className="px-1.5 py-0.5 bg-[#5322FF] border border-[#00E5FF] text-white font-semibold">
            {choreographyPhase}
          </span>
        )}
      </div>

      {/* Top-Right Recording Indicator Badge */}
      {isRecordingWebm && (
        <div className="absolute top-3 right-3 z-20 bg-[#05050A] border-2 border-[#EF4444] px-3 py-1.5 font-mono text-xs font-bold text-[#EF4444] tabular-nums flex items-center gap-2 pointer-events-none">
          <span className="inline-block w-2.5 h-2.5 bg-[#EF4444]" />
          <span>{fullT.showcase.recordingActiveBtn}</span>
        </div>
      )}

      {/* Three.js WebGL Canvas Mount Container */}
      <div ref={containerRef} className="w-full h-full" />

      {/* Bottom Telemetry Strip inside 3D Viewport */}
      <div className="absolute bottom-3 left-3 right-3 z-20 flex items-center justify-between px-3 py-1.5 bg-[#0A0C14] border border-[#1F1F2E] font-mono text-[10px] text-[#8A8FA3] pointer-events-none">
        <span className="flex items-center gap-1.5">
          <RotateCw size={14} strokeWidth={1.25} className="text-[#00E5FF]" />
          {t.dragOrbitHint} // WHEEL ZOOM: {minDistanceMm}MM – {maxDistanceMm}MM
        </span>
        <span className="text-white tabular-nums">
          TOPOLOGY: {activeTopology.standardCode} (
          {activeTopology.panels.length} PANELS) // {t.foldedVolume}:{' '}
          {((L * W * H) / 1_000_000).toFixed(2)} L ({L}×{W}×{H}MM)
        </span>
      </div>
    </div>
  );
};
