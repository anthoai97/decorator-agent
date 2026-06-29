import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const url = process.env.SMOKE_URL ?? 'http://localhost:5173/';
const browserPath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ??
  [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].find((path) => existsSync(path));
const viewports = [
  { name: 'desktop', width: 1440, height: 920 },
  { name: 'mobile', width: 390, height: 844 },
];

const browser = await chromium.launch({
  headless: true,
  executablePath: browserPath,
  args: ['--enable-unsafe-webgpu', '--disable-gpu-sandbox'],
});

try {
  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport });
    const errors = [];

    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') {
        errors.push(message.text());
      }
    });

    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 15000 });
    await page.waitForTimeout(900);

    const clickTarget = {
      x: Math.round(viewport.width * (viewport.width <= 720 ? 0.5 : 0.53)),
      y: Math.round(viewport.height * (viewport.width <= 720 ? 0.42 : 0.62)),
    };
    await page.mouse.move(clickTarget.x, clickTarget.y);
    await page.mouse.click(clickTarget.x, clickTarget.y);
    await page.waitForTimeout(300);
    const inspectorXInput = page.locator('.field-grid input').nth(1);
    const originalXValue = await inspectorXInput.inputValue();
    await inspectorXInput.fill('');
    await inspectorXInput.type('-');
    const partialXValue = await inspectorXInput.inputValue();
    if (partialXValue !== '-') {
      throw new Error(`${viewport.name}: inspector X input rejected partial negative value: ${partialXValue}`);
    }
    await inspectorXInput.type('1');
    await page.waitForTimeout(300);
    const committedXValue = await inspectorXInput.inputValue();
    if (Number(committedXValue) !== -1) {
      throw new Error(`${viewport.name}: inspector X input did not commit negative value: ${committedXValue}`);
    }
    await inspectorXInput.fill('');
    await inspectorXInput.type(originalXValue);
    await page.waitForTimeout(300);
    const decimalXValue = await inspectorXInput.inputValue();
    if (decimalXValue !== originalXValue) {
      throw new Error(`${viewport.name}: inspector X input did not preserve decimal draft: ${decimalXValue}`);
    }
    await inspectorXInput.fill(originalXValue);
    await page.waitForTimeout(300);
    const rotationBefore = await page.locator('#selected-position').textContent();
    await page.click('#rotate-object');
    await page.waitForTimeout(300);
    await page.mouse.move(clickTarget.x, clickTarget.y);
    await page.mouse.down();
    await page.mouse.move(Math.round(viewport.width * 0.49), Math.round(viewport.height * 0.47), {
      steps: 24,
    });
    await page.mouse.up();
    await page.waitForTimeout(300);

    const result = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      const hud = document.querySelector('.hud');
      const sidePanel = document.querySelector('.side-panel');
      const webgpuMessage = document.querySelector('#webgpu-message');
      const selectedName = document.querySelector('#selected-name');
      const selectedPosition = document.querySelector('#selected-position');
      const rotateButton = document.querySelector('#rotate-object');
      const debug = window.__roomComposerDebug;

      if (!canvas) {
        return { ok: false, reason: 'missing canvas' };
      }

      if (!hud || !sidePanel || !selectedName || !selectedPosition || !rotateButton) {
        return { ok: false, reason: 'missing React shell controls' };
      }

      if (!debug) {
        return { ok: false, reason: 'missing debug API' };
      }

      const probe = document.createElement('canvas');
      probe.width = 80;
      probe.height = 80;
      const context = probe.getContext('2d', { willReadFrequently: true });
      context.drawImage(canvas, 0, 0, probe.width, probe.height);
      const pixels = context.getImageData(0, 0, probe.width, probe.height).data;
      let changedPixels = 0;
      let darkest = 255;
      let brightest = 0;

      for (let index = 0; index < pixels.length; index += 4) {
        const r = pixels[index];
        const g = pixels[index + 1];
        const b = pixels[index + 2];
        const alpha = pixels[index + 3];
        const brightness = (r + g + b) / 3;
        darkest = Math.min(darkest, brightness);
        brightest = Math.max(brightest, brightness);

        if (alpha > 0 && (r !== pixels[0] || g !== pixels[1] || b !== pixels[2])) {
          changedPixels += 1;
        }
      }

      const canvasBox = canvas.getBoundingClientRect();
      const hudBox = hud.getBoundingClientRect();
      const sidePanelBox = sidePanel.getBoundingClientRect();
      const messageVisible = Boolean(webgpuMessage && !webgpuMessage.hidden);
      const exported = debug.exportLayout();
      const validImport = debug.importLayout(exported);
      const invalid = structuredClone(exported);
      invalid.furniture[1].position = { ...invalid.furniture[0].position };
      let invalidRejected = false;

      try {
        debug.importLayout(invalid);
      } catch {
        invalidRejected = true;
      }

      return {
        ok: !messageVisible,
        readbackChangedPixels: changedPixels,
        readbackContrast: Number((brightest - darkest).toFixed(2)),
        changedPixels,
        contrast: Number((brightest - darkest).toFixed(2)),
        canvas: {
          width: Math.round(canvasBox.width),
          height: Math.round(canvasBox.height),
        },
        hud: {
          top: Math.round(hudBox.top),
          left: Math.round(hudBox.left),
          right: Math.round(hudBox.right),
          bottom: Math.round(hudBox.bottom),
        },
        sidePanel: {
          top: Math.round(sidePanelBox.top),
          left: Math.round(sidePanelBox.left),
          right: Math.round(sidePanelBox.right),
          bottom: Math.round(sidePanelBox.bottom),
        },
        messageVisible,
        selectedName: selectedName.textContent,
        selectedPosition: selectedPosition.textContent,
        rotateDisabled: rotateButton.disabled,
        hasAnyOverlap: debug.hasAnyOverlap(),
        interchange: {
          schemaVersion: exported.schemaVersion,
          furnitureCount: exported.furniture.length,
          validApplied: validImport.applied,
          invalidRejected,
          hasAnyOverlap: debug.hasAnyOverlap(),
        },
      };
    });

    await page.screenshot({ path: `smoke-${viewport.name}.png`, fullPage: true });
    const canvasScreenshot = await page.locator('canvas').screenshot({
      path: `smoke-${viewport.name}-canvas.png`,
    });
    const canvasPixels = analyzePng(canvasScreenshot);
    await page.close();

    if (errors.length > 0) {
      throw new Error(`${viewport.name}: browser errors:\n${errors.join('\n')}`);
    }

    if (
      !result.ok ||
      result.selectedName === 'Nothing selected' ||
      result.rotateDisabled ||
      result.selectedPosition === rotationBefore ||
      result.hasAnyOverlap !== false ||
      result.interchange?.schemaVersion !== 1 ||
      result.interchange?.furnitureCount < 5 ||
      result.interchange?.validApplied < 5 ||
      !result.interchange?.invalidRejected ||
      result.interchange?.hasAnyOverlap !== false ||
      canvasPixels.changedPixels <= 400 ||
      canvasPixels.contrast <= 8
    ) {
      throw new Error(
        `${viewport.name}: scene pixel check failed: ${JSON.stringify({ result, canvasPixels })}`,
      );
    }

    const hudFits = result.hud.left >= 0 && result.hud.right <= viewport.width && result.hud.bottom < viewport.height;
    if (!hudFits) {
      throw new Error(`${viewport.name}: HUD layout escapes viewport: ${JSON.stringify(result.hud)}`);
    }

    const sidePanelFits =
      result.sidePanel.left >= 0 &&
      result.sidePanel.right <= viewport.width &&
      result.sidePanel.top >= 0 &&
      result.sidePanel.bottom < viewport.height;
    if (!sidePanelFits) {
      throw new Error(`${viewport.name}: side panel layout escapes viewport: ${JSON.stringify(result.sidePanel)}`);
    }

    console.log(
      `${viewport.name}: canvas ${result.canvas.width}x${result.canvas.height}, screenshot changed pixels ${canvasPixels.changedPixels}, contrast ${canvasPixels.contrast}`,
    );
  }
} finally {
  await browser.close();
}

function analyzePng(buffer) {
  const pngSignature = '89504e470d0a1a0a';
  if (buffer.subarray(0, 8).toString('hex') !== pngSignature) {
    throw new Error('Screenshot is not a PNG');
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatChunks = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
    const data = buffer.subarray(offset + 8, offset + 8 + length);

    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') {
      idatChunks.push(data);
    } else if (type === 'IEND') {
      break;
    }

    offset += 12 + length;
  }

  const channelsByColorType = new Map([
    [2, 3],
    [6, 4],
  ]);
  const channels = channelsByColorType.get(colorType);
  if (bitDepth !== 8 || !channels) {
    throw new Error(`Unsupported PNG format: bitDepth=${bitDepth}, colorType=${colorType}`);
  }

  const inflated = inflateSync(Buffer.concat(idatChunks));
  const bytesPerRow = width * channels;
  const previous = Buffer.alloc(bytesPerRow);
  const current = Buffer.alloc(bytesPerRow);

  let sourceOffset = 0;
  let changedPixels = 0;
  let darkest = 255;
  let brightest = 0;
  let firstR = null;
  let firstG = null;
  let firstB = null;

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[sourceOffset];
    sourceOffset += 1;

    for (let x = 0; x < bytesPerRow; x += 1) {
      const raw = inflated[sourceOffset + x];
      const left = x >= channels ? current[x - channels] : 0;
      const up = previous[x];
      const upLeft = x >= channels ? previous[x - channels] : 0;
      current[x] = unfilter(raw, filter, left, up, upLeft);
    }

    sourceOffset += bytesPerRow;

    for (let x = 0; x < bytesPerRow; x += channels) {
      const r = current[x];
      const g = current[x + 1];
      const b = current[x + 2];
      const alpha = channels === 4 ? current[x + 3] : 255;
      const brightness = (r + g + b) / 3;
      darkest = Math.min(darkest, brightness);
      brightest = Math.max(brightest, brightness);

      if (firstR === null) {
        firstR = r;
        firstG = g;
        firstB = b;
      }

      if (alpha > 0 && (Math.abs(r - firstR) + Math.abs(g - firstG) + Math.abs(b - firstB) > 4)) {
        changedPixels += 1;
      }
    }

    previous.set(current);
  }

  return {
    width,
    height,
    changedPixels,
    contrast: Number((brightest - darkest).toFixed(2)),
  };
}

function unfilter(raw, filter, left, up, upLeft) {
  if (filter === 0) {
    return raw;
  }

  if (filter === 1) {
    return (raw + left) & 255;
  }

  if (filter === 2) {
    return (raw + up) & 255;
  }

  if (filter === 3) {
    return (raw + Math.floor((left + up) / 2)) & 255;
  }

  if (filter === 4) {
    return (raw + paeth(left, up, upLeft)) & 255;
  }

  throw new Error(`Unsupported PNG filter: ${filter}`);
}

function paeth(left, up, upLeft) {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upLeftDistance = Math.abs(estimate - upLeft);

  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) {
    return left;
  }

  if (upDistance <= upLeftDistance) {
    return up;
  }

  return upLeft;
}
