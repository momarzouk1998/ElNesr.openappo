/**
 * Safe wrapper around html2canvas.
 * Converts oklch/color()/oklab functions to standard rgb()/rgba() format,
 * completely shielding html2canvas from unsupported CSS color syntax
 * while preserving 100% of stylesheet layout, typography, and geometry.
 *
 * Supports renderWidth option to enforce full desktop/document width on mobile captures.
 */

function parseNumberOrPercent(val: string): number {
  if (!val) return 0;
  const trimmed = val.trim();
  if (trimmed.endsWith("%")) {
    return parseFloat(trimmed) / 100;
  }
  return parseFloat(trimmed);
}

function oklabToRgb(L: number, a: number, b: number, alpha?: number): string {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;

  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;

  const r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bl = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;

  function toGamma(c: number): number {
    if (c <= 0) return 0;
    if (c >= 1) return 255;
    const v = c <= 0.0031308 ? 12.92 * c : 1.055 * (c ** (1 / 2.4)) - 0.055;
    return Math.round(Math.min(255, Math.max(0, v * 255)));
  }

  const red = toGamma(r);
  const green = toGamma(g);
  const blue = toGamma(bl);

  return alpha !== undefined && alpha < 1
    ? `rgba(${red}, ${green}, ${blue}, ${Number(alpha.toFixed(3))})`
    : `rgb(${red}, ${green}, ${blue})`;
}

function oklchToRgb(L: number, C: number, h: number, alpha?: number): string {
  const hRad = ((h || 0) * Math.PI) / 180;
  const a = C * Math.cos(hRad);
  const b = C * Math.sin(hRad);
  return oklabToRgb(L, a, b, alpha);
}

export function sanitizeCssColor(str: string): string {
  if (!str || typeof str !== "string") return str;
  if (!/(oklch|oklab|color)\(/i.test(str)) return str;

  return str.replace(/(oklch|oklab|color)\(([^)]+)\)/gi, (match, fn, content) => {
    try {
      const parts = content.trim().split(/\s*\/\s*/);
      const mainParts = parts[0].trim().split(/[\s,]+/);
      const alpha =
        parts[1] !== undefined
          ? parseNumberOrPercent(parts[1])
          : mainParts[3] !== undefined
          ? parseNumberOrPercent(mainParts[3])
          : 1;

      const lowerFn = fn.toLowerCase();
      if (lowerFn === "oklab") {
        const L = parseNumberOrPercent(mainParts[0]);
        const a = parseFloat(mainParts[1]) || 0;
        const b = parseFloat(mainParts[2]) || 0;
        return oklabToRgb(L, a, b, alpha);
      }
      if (lowerFn === "oklch") {
        const L = parseNumberOrPercent(mainParts[0]);
        const C = parseFloat(mainParts[1]) || 0;
        const h = parseFloat(mainParts[2]) || 0;
        return oklchToRgb(L, C, h, alpha);
      }
      if (lowerFn === "color") {
        const offset = mainParts[0] === "srgb" || mainParts[0] === "display-p3" ? 1 : 0;
        const r = Math.round(Math.min(255, Math.max(0, parseNumberOrPercent(mainParts[offset]) * 255)));
        const g = Math.round(Math.min(255, Math.max(0, parseNumberOrPercent(mainParts[offset + 1]) * 255)));
        const b = Math.round(Math.min(255, Math.max(0, parseNumberOrPercent(mainParts[offset + 2]) * 255)));
        return alpha < 1 ? `rgba(${r}, ${g}, ${b}, ${alpha})` : `rgb(${r}, ${g}, ${b})`;
      }
    } catch {
      return "rgb(15, 65, 133)";
    }
    return "rgb(15, 65, 133)";
  });
}

function wrapStyleDeclaration(cs: CSSStyleDeclaration): CSSStyleDeclaration {
  return new Proxy(cs, {
    get(target, prop) {
      if (prop === "getPropertyValue") {
        return (cssProp: string) => {
          const val = target.getPropertyValue(cssProp);
          return sanitizeCssColor(val);
        };
      }
      // ⚠️ لازم نقرأ الخاصية من الـ target نفسه مش عن طريق Reflect.get بالـ receiver،
      // لأن receiver هنا هو الـ Proxy، وخصائص زي length بتتنفّذ بـ this = Proxy
      // فيرمي المتصفح TypeError: Illegal invocation ويفشل تصوير الإيصال بالكامل.
      const origVal = (target as any)[prop];
      if (typeof origVal === "function") {
        return origVal.bind(target);
      }
      if (typeof origVal === "string") {
        return sanitizeCssColor(origVal);
      }
      return origVal;
    },
  });
}

/**
 * Downloads a canvas as a PNG via a blob: object URL instead of a data: URL.
 * Some mobile browsers (e.g. Samsung Internet) intercept data: URL downloads
 * and show a raw "do you want to download this file?" confirmation dialog
 * with the base64 source visible — blob: URLs download silently instead.
 */
export async function downloadCanvasAsPng(canvas: HTMLCanvasElement, filename: string): Promise<void> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
  if (!blob) {
    const link = document.createElement("a");
    link.download = filename;
    link.href = canvas.toDataURL("image/png");
    link.click();
    return;
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.download = filename;
  link.href = url;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export async function captureElementToCanvas(
  element: HTMLElement,
  options: {
    scale?: number;
    backgroundColor?: string;
    renderWidth?: number;
  } = {}
): Promise<HTMLCanvasElement> {
  const html2canvas = (await import("html2canvas")).default;

  // 1. Intercept global window.getComputedStyle and CSSStyleDeclaration.prototype.getPropertyValue
  const origWindowGetComputedStyle = typeof window !== "undefined" ? window.getComputedStyle : null;
  const origGetPropertyValue =
    typeof CSSStyleDeclaration !== "undefined" ? CSSStyleDeclaration.prototype.getPropertyValue : null;

  if (origWindowGetComputedStyle && typeof window !== "undefined") {
    window.getComputedStyle = function (elt: Element, pseudoElt?: string | null) {
      const cs = origWindowGetComputedStyle.call(window, elt, pseudoElt);
      return wrapStyleDeclaration(cs);
    };
  }

  if (origGetPropertyValue && typeof CSSStyleDeclaration !== "undefined") {
    CSSStyleDeclaration.prototype.getPropertyValue = function (prop: string) {
      const val = origGetPropertyValue.call(this, prop);
      return sanitizeCssColor(val);
    };
  }

  try {
    return await html2canvas(element, {
      useCORS: true,
      allowTaint: true,
      scale: options.scale ?? 2.5,
      logging: false,
      backgroundColor: options.backgroundColor ?? "#ffffff",
      scrollX: 0,
      scrollY: 0,
      windowWidth: options.renderWidth ? Math.max(options.renderWidth + 100, 1024) : undefined,
      onclone: (clonedDoc, clonedElement) => {
        // 2. Enforce high-res document layout width if requested (prevents mobile squishing)
        if (options.renderWidth) {
          clonedElement.style.setProperty("width", `${options.renderWidth}px`, "important");
          clonedElement.style.setProperty("min-width", `${options.renderWidth}px`, "important");
          clonedElement.style.setProperty("max-width", `${options.renderWidth}px`, "important");
          clonedElement.style.setProperty("box-sizing", "border-box", "important");
        }

        // 3. Intercept getComputedStyle in the cloned document iframe window
        if (clonedDoc.defaultView && clonedDoc.defaultView.getComputedStyle) {
          const origIframeGetComputedStyle = clonedDoc.defaultView.getComputedStyle.bind(clonedDoc.defaultView);
          clonedDoc.defaultView.getComputedStyle = function (elt: Element, pseudoElt?: string | null) {
            const cs = origIframeGetComputedStyle(elt, pseudoElt);
            return wrapStyleDeclaration(cs);
          };
        }

        // 4. Sanitize any style tags inside the cloned document
        try {
          const styleTags = clonedDoc.querySelectorAll("style");
          styleTags.forEach((styleTag) => {
            if (styleTag.textContent && /(oklch|oklab|color)\(/i.test(styleTag.textContent)) {
              styleTag.textContent = sanitizeCssColor(styleTag.textContent);
            }
          });
        } catch (err) {
          console.warn("Style tag sanitization warning:", err);
        }

        // 5. Walk all elements in the cloned document and fix any inline styles
        try {
          const allCloned = [clonedElement, ...Array.from(clonedElement.querySelectorAll("*"))] as HTMLElement[];
          allCloned.forEach((el) => {
            // Force normal letter-spacing to prevent Arabic cursive text from breaking into disjointed letters in html2canvas
            el.style.setProperty("letter-spacing", "normal", "important");
            if (el.style) {
              for (let i = 0; i < el.style.length; i++) {
                const prop = el.style[i];
                const val = el.style.getPropertyValue(prop);
                if (val && /(oklch|oklab|color)\(/i.test(val)) {
                  el.style.setProperty(prop, sanitizeCssColor(val), el.style.getPropertyPriority(prop));
                }
              }
            }
          });
        } catch (err) {
          console.warn("Inline style sanitization warning:", err);
        }
      },
    });
  } finally {
    // Always restore original functions cleanly
    if (origWindowGetComputedStyle && typeof window !== "undefined") {
      window.getComputedStyle = origWindowGetComputedStyle;
    }
    if (origGetPropertyValue && typeof CSSStyleDeclaration !== "undefined") {
      CSSStyleDeclaration.prototype.getPropertyValue = origGetPropertyValue;
    }
  }
}
