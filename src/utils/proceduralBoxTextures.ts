import * as THREE from 'three';
import {
  PackagingContract,
  SubstrateMaterialConfigItem,
} from '../types/packaging';
import {
  OVERFLOW_THRESHOLDS,
  encodeEan13Bits,
  evaluateEan13,
} from '../config/studioConfig';

export interface GeneratedBoxTextures {
  front: THREE.CanvasTexture;
  back: THREE.CanvasTexture;
  left: THREE.CanvasTexture;
  right: THREE.CanvasTexture;
  topLid: THREE.CanvasTexture;
  base: THREE.CanvasTexture;
  flap: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
  disposeAll: () => void;
}

function drawSubstrateBackground(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  substrate: SubstrateMaterialConfigItem,
  hasOverflow: boolean
) {
  ctx.fillStyle = substrate.surfaceTint3D;
  ctx.fillRect(0, 0, w, h);

  if (substrate.patternType === 'MATTE_EFLUTE') {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 2;
    for (let x = 0; x < w; x += 10) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
  } else if (substrate.patternType === 'KRAFT_FIBER') {
    ctx.strokeStyle = 'rgba(217, 119, 6, 0.12)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 140; i++) {
      const x = (i * 37) % w;
      const y = (i * 53) % h;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 18, y + 7);
      ctx.stroke();
    }
  } else if (substrate.patternType === 'GLOSS_IVORY') {
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, 'rgba(0, 229, 255, 0.05)');
    grad.addColorStop(0.5, 'rgba(255, 255, 255, 0.10)');
    grad.addColorStop(1, 'rgba(0, 229, 255, 0.03)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  } else if (
    substrate.patternType === 'FOIL_SPOT_UV' ||
    substrate.patternType === 'CUSTOM_PBR'
  ) {
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, 'rgba(83, 34, 255, 0.22)');
    grad.addColorStop(0.5, 'rgba(0, 229, 255, 0.18)');
    grad.addColorStop(1, 'rgba(16, 185, 129, 0.14)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }

  // Outer CAD technical border
  ctx.strokeStyle = hasOverflow ? '#EF4444' : substrate.borderAccent;
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, w - 8, h - 8);

  // Inner subtle technical trim
  ctx.strokeStyle = '#1F1F2E';
  ctx.lineWidth = 2;
  ctx.strokeRect(18, 18, w - 36, h - 36);
}

function drawBarcodeOnCanvas(
  ctx: CanvasRenderingContext2D,
  rawCode: string,
  bx: number,
  by: number,
  bw: number,
  bh: number
) {
  const bits = encodeEan13Bits(rawCode);
  const info = evaluateEan13(rawCode);

  ctx.fillStyle = '#05050A';
  ctx.fillRect(bx - 10, by - 10, bw + 20, bh + 34);
  ctx.strokeStyle = info.isChecksumMatch ? '#00E5FF' : '#EF4444';
  ctx.lineWidth = 2;
  ctx.strokeRect(bx - 10, by - 10, bw + 20, bh + 34);

  const modW = bw / 95;
  ctx.fillStyle = '#FFFFFF';
  for (let i = 0; i < bits.length; i++) {
    if (bits[i] === '1') {
      const isGuard = i < 3 || (i >= 45 && i < 50) || i >= 92;
      ctx.fillRect(bx + i * modW, by, modW * 1.05, isGuard ? bh + 8 : bh);
    }
  }

  ctx.fillStyle = info.isChecksumMatch ? '#00E5FF' : '#EF4444';
  ctx.font = 'bold 16px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText(rawCode, bx + bw / 2, by + bh + 18);
  ctx.textAlign = 'left';
}

export function buildProceduralBoxTextures(
  contract: PackagingContract,
  substrate: SubstrateMaterialConfigItem,
  maxAnisotropy: number
): GeneratedBoxTextures {
  const { length_mm: L, width_mm: W, height_mm: H } = contract.product.dimensions;
  const getSpec = (id: string, fallback: string) =>
    contract.technicalSpecs.find((s) => s.id === id)?.value || fallback;

  const voltageVal = getSpec('voltage', '220V - 50Hz');
  const powerVal = getSpec('power', '1800W');
  const capacityVal = getSpec('capacity', '6.5 Lít');
  const barcodeVal = getSpec('barcode', '8935219412345');

  const createColorTex = (canvas: HTMLCanvasElement) => {
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = maxAnisotropy;
    tex.needsUpdate = true;
    return tex;
  };

  // 1. FRONT HERO PANEL (512 x 512)
  const frontCanvas = document.createElement('canvas');
  frontCanvas.width = 512;
  frontCanvas.height = 512;
  const fCtx = frontCanvas.getContext('2d')!;
  const frontOverflow =
    contract.product.brand.length > OVERFLOW_THRESHOLDS.brandMaxChars ||
    contract.product.model.length > OVERFLOW_THRESHOLDS.modelMaxChars ||
    contract.product.category.length > OVERFLOW_THRESHOLDS.categoryMaxChars;

  drawSubstrateBackground(fCtx, 512, 512, substrate, frontOverflow);

  // Header brand bar
  fCtx.fillStyle = '#05050A';
  fCtx.fillRect(28, 28, 456, 72);
  fCtx.strokeStyle = '#00E5FF';
  fCtx.lineWidth = 2;
  fCtx.strokeRect(28, 28, 456, 72);

  fCtx.fillStyle = '#FFFFFF';
  fCtx.font = 'bold 34px "Plus Jakarta Sans", sans-serif';
  fCtx.fillText(contract.product.brand, 44, 75);

  fCtx.fillStyle = '#5322FF';
  fCtx.fillRect(330, 40, 140, 48);
  fCtx.strokeStyle = '#00E5FF';
  fCtx.strokeRect(330, 40, 140, 48);

  fCtx.fillStyle = '#FFFFFF';
  fCtx.font = 'bold 20px "JetBrains Mono", monospace';
  fCtx.textAlign = 'center';
  fCtx.fillText(contract.product.model, 400, 71);
  fCtx.textAlign = 'left';

  // Category Title
  fCtx.fillStyle = '#00E5FF';
  fCtx.font = 'bold 20px "Plus Jakarta Sans", sans-serif';
  fCtx.fillText(contract.product.category.toUpperCase(), 32, 134);

  // Center Product Schematic Blueprint Box
  fCtx.fillStyle = '#05050A';
  fCtx.fillRect(32, 152, 448, 224);
  fCtx.strokeStyle = '#2D2D44';
  fCtx.lineWidth = 2;
  fCtx.strokeRect(32, 152, 448, 224);

  // Appliance CAD vector illustration inside Front Panel
  fCtx.strokeStyle = '#00E5FF';
  fCtx.lineWidth = 3;
  fCtx.strokeRect(186, 174, 140, 160);
  fCtx.fillStyle = '#0D0E17';
  fCtx.fillRect(204, 190, 104, 48);
  fCtx.strokeStyle = '#5322FF';
  fCtx.lineWidth = 2;
  fCtx.strokeRect(204, 190, 104, 48);

  fCtx.fillStyle = '#00E5FF';
  fCtx.font = 'bold 16px "JetBrains Mono", monospace';
  fCtx.textAlign = 'center';
  fCtx.fillText('200°C // 60M', 256, 220);

  fCtx.strokeStyle = '#10B981';
  fCtx.strokeRect(200, 252, 112, 66);
  fCtx.fillStyle = '#FFFFFF';
  fCtx.font = 'bold 22px "JetBrains Mono", monospace';
  fCtx.fillText(`${capacityVal} // ${powerVal}`, 256, 292);
  fCtx.textAlign = 'left';

  fCtx.fillStyle = '#8A8FA3';
  fCtx.font = '14px "JetBrains Mono", monospace';
  fCtx.fillText(`[ FRONT_PRIMARY // ${L}x${H}MM ]`, 46, 360);

  // Bottom KSP Cards on Front Panel
  const frontKsps = contract.keySellingPoints.slice(0, 2);
  frontKsps.forEach((ksp, idx) => {
    const kx = 32 + idx * 228;
    fCtx.fillStyle = '#05050A';
    fCtx.fillRect(kx, 392, 220, 88);
    fCtx.strokeStyle = ksp.status === 'READY' ? '#00E5FF' : '#5322FF';
    fCtx.lineWidth = 2;
    fCtx.strokeRect(kx, 392, 220, 88);

    fCtx.fillStyle = '#00E5FF';
    fCtx.font = 'bold 17px "Plus Jakarta Sans", sans-serif';
    fCtx.fillText(ksp.title.slice(0, 20), kx + 14, 424);

    fCtx.fillStyle = '#FFFFFF';
    fCtx.font = '14px "Plus Jakarta Sans", sans-serif';
    fCtx.fillText(ksp.description.slice(0, 26), kx + 14, 450);

    fCtx.fillStyle = '#10B981';
    fCtx.font = '12px "JetBrains Mono", monospace';
    fCtx.fillText(`[${ksp.status === 'READY' ? 'VERIFIED_VEC' : 'PENDING_AN'}]`, kx + 14, 470);
  });

  // 2. BACK TECHNICAL PANEL (512 x 512)
  const backCanvas = document.createElement('canvas');
  backCanvas.width = 512;
  backCanvas.height = 512;
  const bCtx = backCanvas.getContext('2d')!;
  drawSubstrateBackground(bCtx, 512, 512, substrate, false);

  bCtx.fillStyle = '#05050A';
  bCtx.fillRect(32, 32, 448, 448);
  bCtx.strokeStyle = '#2D2D44';
  bCtx.lineWidth = 2;
  bCtx.strokeRect(32, 32, 448, 448);

  bCtx.fillStyle = '#00E5FF';
  bCtx.font = 'bold 26px "Plus Jakarta Sans", sans-serif';
  bCtx.fillText(`${contract.product.brand.toUpperCase()} // ${contract.product.model}`, 52, 78);

  bCtx.fillStyle = '#8A8FA3';
  bCtx.font = '16px "Plus Jakarta Sans", sans-serif';
  bCtx.fillText(contract.product.category, 52, 106);

  bCtx.strokeStyle = '#1F1F2E';
  bCtx.beginPath();
  bCtx.moveTo(52, 124);
  bCtx.lineTo(460, 124);
  bCtx.stroke();

  bCtx.fillStyle = '#00E5FF';
  bCtx.font = 'bold 16px "JetBrains Mono", monospace';
  bCtx.fillText('[ 01 // ELECTRICAL_&_THERMAL_RATINGS ]', 52, 156);

  const allSpecs = [...contract.technicalSpecs, ...contract.dynamicSpecs];
  allSpecs.slice(0, 6).forEach((s, idx) => {
    const sy = 190 + idx * 32;
    bCtx.fillStyle = '#8A8FA3';
    bCtx.font = '16px "JetBrains Mono", monospace';
    bCtx.fillText(`• ${s.label}:`, 52, sy);
    bCtx.fillStyle = '#FFFFFF';
    bCtx.font = 'bold 16px "JetBrains Mono", monospace';
    bCtx.fillText(s.value, 240, sy);
  });

  drawBarcodeOnCanvas(bCtx, barcodeVal, 230, 392, 215, 52);

  // CE & Class II Double Square Marks
  bCtx.strokeStyle = '#8A8FA3';
  bCtx.lineWidth = 2;
  bCtx.strokeRect(52, 392, 54, 54);
  bCtx.fillStyle = '#FFFFFF';
  bCtx.font = 'bold 22px "JetBrains Mono", monospace';
  bCtx.fillText('CE', 64, 427);
  bCtx.strokeRect(118, 392, 54, 54);
  bCtx.strokeRect(130, 404, 30, 30);

  // 3. LEFT KSP SIDE PANEL (512 x 512)
  const leftCanvas = document.createElement('canvas');
  leftCanvas.width = 512;
  leftCanvas.height = 512;
  const lCtx = leftCanvas.getContext('2d')!;
  drawSubstrateBackground(lCtx, 512, 512, substrate, false);

  lCtx.fillStyle = '#05050A';
  lCtx.fillRect(32, 32, 448, 60);
  lCtx.strokeStyle = '#00E5FF';
  lCtx.strokeRect(32, 32, 448, 60);
  lCtx.fillStyle = '#00E5FF';
  lCtx.font = 'bold 24px "Plus Jakarta Sans", sans-serif';
  lCtx.fillText(`${contract.product.brand.toUpperCase()} // KSP`, 48, 70);

  contract.keySellingPoints.forEach((ksp, idx) => {
    const ky = 114 + idx * 116;
    lCtx.fillStyle = '#05050A';
    lCtx.fillRect(32, ky, 448, 98);
    lCtx.strokeStyle = ksp.status === 'READY' ? '#00E5FF' : '#5322FF';
    lCtx.lineWidth = 2;
    lCtx.strokeRect(32, ky, 448, 98);

    // Icon badge box
    lCtx.fillStyle = '#0D0E17';
    lCtx.fillRect(48, ky + 18, 62, 62);
    lCtx.strokeStyle = '#00E5FF';
    lCtx.strokeRect(48, ky + 18, 62, 62);

    lCtx.beginPath();
    lCtx.arc(79, ky + 49, 20, 0, Math.PI * 2);
    lCtx.stroke();

    lCtx.fillStyle = '#FFFFFF';
    lCtx.font = 'bold 22px "Plus Jakarta Sans", sans-serif';
    lCtx.fillText(ksp.title, 128, ky + 44);

    lCtx.fillStyle = '#8A8FA3';
    lCtx.font = '17px "Plus Jakarta Sans", sans-serif';
    lCtx.fillText(ksp.description, 128, ky + 74);
  });

  lCtx.fillStyle = '#05050A';
  lCtx.fillRect(32, 420, 448, 56);
  lCtx.strokeStyle = '#1F1F2E';
  lCtx.strokeRect(32, 420, 448, 56);
  lCtx.fillStyle = '#00E5FF';
  lCtx.font = 'bold 18px "JetBrains Mono", monospace';
  lCtx.fillText(`${powerVal} // ${capacityVal} // ${voltageVal}`, 48, 454);

  // 4. RIGHT SPECS & BARCODE SIDE PANEL (512 x 512)
  const rightCanvas = document.createElement('canvas');
  rightCanvas.width = 512;
  rightCanvas.height = 512;
  const rCtx = rightCanvas.getContext('2d')!;
  drawSubstrateBackground(rCtx, 512, 512, substrate, false);

  rCtx.fillStyle = '#05050A';
  rCtx.fillRect(32, 32, 448, 56);
  rCtx.strokeStyle = '#2D2D44';
  rCtx.strokeRect(32, 32, 448, 56);
  rCtx.fillStyle = '#FFFFFF';
  rCtx.font = 'bold 22px "JetBrains Mono", monospace';
  rCtx.fillText(`[ TECH_SPEC_TABLE // ${W}x${H}MM ]`, 48, 68);

  allSpecs.slice(0, 6).forEach((spec, idx) => {
    const ry = 104 + idx * 44;
    rCtx.fillStyle = idx % 2 === 0 ? '#05050A' : '#0D0E17';
    rCtx.fillRect(32, ry, 448, 38);
    rCtx.strokeStyle = '#1F1F2E';
    rCtx.strokeRect(32, ry, 448, 38);

    rCtx.fillStyle = '#8A8FA3';
    rCtx.font = '16px "Plus Jakarta Sans", sans-serif';
    rCtx.fillText(spec.label, 46, ry + 25);

    rCtx.fillStyle = '#FFFFFF';
    rCtx.font = 'bold 16px "JetBrains Mono", monospace';
    rCtx.textAlign = 'right';
    rCtx.fillText(spec.value, 464, ry + 25);
    rCtx.textAlign = 'left';
  });

  drawBarcodeOnCanvas(rCtx, barcodeVal, 116, 396, 280, 56);

  // 5. TOP CLOSURE LID PANEL (512 x 512)
  const topCanvas = document.createElement('canvas');
  topCanvas.width = 512;
  topCanvas.height = 512;
  const tCtx = topCanvas.getContext('2d')!;
  drawSubstrateBackground(tCtx, 512, 512, substrate, false);

  tCtx.fillStyle = '#05050A';
  tCtx.fillRect(40, 160, 432, 192);
  tCtx.strokeStyle = '#00E5FF';
  tCtx.lineWidth = 3;
  tCtx.strokeRect(40, 160, 432, 192);

  tCtx.fillStyle = '#00E5FF';
  tCtx.font = 'bold 34px "Plus Jakarta Sans", sans-serif';
  tCtx.textAlign = 'center';
  tCtx.fillText(
    `${contract.product.brand.toUpperCase()} // ${contract.product.model}`,
    256,
    252
  );
  tCtx.fillStyle = '#8A8FA3';
  tCtx.font = '18px "JetBrains Mono", monospace';
  tCtx.fillText(`[ TOP_CLOSURE_LID // ${L}x${W}MM ]`, 256, 294);
  tCtx.textAlign = 'left';

  // 6. BASE PANEL (512 x 512)
  const baseCanvas = document.createElement('canvas');
  baseCanvas.width = 512;
  baseCanvas.height = 512;
  const bsCtx = baseCanvas.getContext('2d')!;
  drawSubstrateBackground(bsCtx, 512, 512, substrate, false);

  bsCtx.fillStyle = '#8A8FA3';
  bsCtx.font = 'bold 20px "JetBrains Mono", monospace';
  bsCtx.textAlign = 'center';
  bsCtx.fillText(`[ CRASH_LOCK_BASE // ${L}x${W}MM ]`, 256, 256);
  bsCtx.textAlign = 'left';

  // 7. FLAP PANEL (256 x 256)
  const flapCanvas = document.createElement('canvas');
  flapCanvas.width = 256;
  flapCanvas.height = 256;
  const flCtx = flapCanvas.getContext('2d')!;
  flCtx.fillStyle = substrate.surfaceTint3D;
  flCtx.fillRect(0, 0, 256, 256);
  flCtx.strokeStyle = '#00E5FF';
  flCtx.lineWidth = 4;
  flCtx.strokeRect(4, 4, 248, 248);
  flCtx.fillStyle = '#8A8FA3';
  flCtx.font = '14px "JetBrains Mono", monospace';
  flCtx.textAlign = 'center';
  flCtx.fillText('[ DIE_LOCK_FLAP ]', 128, 132);

  // 8. PROCEDURAL BUMP / NORMAL RELIEF MAP (Linear Color Space)
  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = 256;
  bumpCanvas.height = 256;
  const bmCtx = bumpCanvas.getContext('2d')!;
  bmCtx.fillStyle = '#808080';
  bmCtx.fillRect(0, 0, 256, 256);

  if (substrate.patternType === 'MATTE_EFLUTE') {
    bmCtx.fillStyle = '#A0A0A0';
    for (let x = 0; x < 256; x += 8) {
      bmCtx.fillRect(x, 0, 4, 256);
    }
  } else if (substrate.patternType === 'KRAFT_FIBER') {
    bmCtx.strokeStyle = '#B0B0B0';
    bmCtx.lineWidth = 2;
    for (let i = 0; i < 180; i++) {
      const rx = (i * 29) % 256;
      const ry = (i * 43) % 256;
      bmCtx.beginPath();
      bmCtx.moveTo(rx, ry);
      bmCtx.lineTo(rx + 12, ry + 6);
      bmCtx.stroke();
    }
  }

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(3, 3);
  bumpMap.needsUpdate = true;

  const front = createColorTex(frontCanvas);
  const back = createColorTex(backCanvas);
  const left = createColorTex(leftCanvas);
  const right = createColorTex(rightCanvas);
  const topLid = createColorTex(topCanvas);
  const base = createColorTex(baseCanvas);
  const flap = createColorTex(flapCanvas);

  return {
    front,
    back,
    left,
    right,
    topLid,
    base,
    flap,
    bumpMap,
    disposeAll: () => {
      front.dispose();
      back.dispose();
      left.dispose();
      right.dispose();
      topLid.dispose();
      base.dispose();
      flap.dispose();
      bumpMap.dispose();
    },
  };
}
