/**
 * Cloudflare Worker: Dynamic SVG Avatar Generator
 *
 * Generates customizable SVG avatars with gradient backgrounds and text initials.
 * Supports various shapes (square, circle, rounded) and configurable sizes.
 * Supports Punycode for internationalized text (e.g., emoji, non-Latin scripts).
 *
 * Usage:
 *   GET /avatar/JD?s=120&shape=circle
 *   GET /avatar/xn--e77h?s=80              (Punycode for "😀")
 *   GET /avatar/xn--nxasmq5b?s=80          (Punycode for "日本")
 *   - Path after BASEPATH becomes the avatar text (max 2 graphemes)
 *   - Query params: s (size), shape (circle|rounded|square)
 *
 * Punycode Encoding:
 *   To use Unicode characters, encode them with Punycode prefix "xn--"
 *   Example: "日本" -> "xn--nxasmq5b"
 *   Online tool: https://www.punycoder.com/
 */

// ============================================================================
// Configuration
// ============================================================================

const BASEPATH = "/avatar/";

// Default avatar settings
const DEFAULTS = {
  size: 60,
  text: "A",
  maxTextLength: 2, // Maximum graphemes (visual characters) to display
  fontSizeRatio: 0.9, // Font size relative to avatar size
};

// Cache durations (in seconds)
const CACHE = {
  none: "no-cache",
  longTerm: "public, max-age=31536000, immutable", // 1 year
};

// ============================================================================
// Punycode Decoder
// ============================================================================

/**
 * Punycode bootstring parameters (RFC 3492)
 * These constants define the encoding/decoding algorithm
 */
const PUNYCODE = {
  base: 36,
  tMin: 1,
  tMax: 26,
  skew: 38,
  damp: 700,
  initialBias: 72,
  initialN: 128,
  delimiter: "-",
  prefix: "xn--",
};

/**
 * Decodes a single Punycode digit to its numeric value.
 * @param {number} codePoint - The Unicode code point of the digit
 * @returns {number} The numeric value (0-35) or Infinity if invalid
 */
function punycodeDigitToBasic(codePoint) {
  // 0-9 maps to 26-35, a-z maps to 0-25
  if (codePoint >= 0x30 && codePoint <= 0x39) {
    return codePoint - 0x30 + 26; // '0'-'9' -> 26-35
  }
  if (codePoint >= 0x41 && codePoint <= 0x5a) {
    return codePoint - 0x41; // 'A'-'Z' -> 0-25
  }
  if (codePoint >= 0x61 && codePoint <= 0x7a) {
    return codePoint - 0x61; // 'a'-'z' -> 0-25
  }
  return Infinity; // Invalid digit
}

/**
 * Adapts the bias value during Punycode decoding.
 * This is part of the bootstring algorithm (RFC 3492).
 * @param {number} delta - The current delta value
 * @param {number} numPoints - Number of code points processed
 * @param {boolean} firstTime - Whether this is the first adaptation
 * @returns {number} The new bias value
 */
function punycodAdapt(delta, numPoints, firstTime) {
  let k = 0;
  delta = firstTime ? Math.floor(delta / PUNYCODE.damp) : delta >> 1;
  delta += Math.floor(delta / numPoints);

  const threshold = ((PUNYCODE.base - PUNYCODE.tMin) * PUNYCODE.tMax) >> 1;
  while (delta > threshold) {
    delta = Math.floor(delta / (PUNYCODE.base - PUNYCODE.tMin));
    k += PUNYCODE.base;
  }

  return Math.floor(
    k + ((PUNYCODE.base - PUNYCODE.tMin + 1) * delta) / (delta + PUNYCODE.skew)
  );
}

/**
 * Decodes a Punycode string to Unicode.
 * Implements the bootstring algorithm from RFC 3492.
 * @param {string} input - The Punycode-encoded string (without "xn--" prefix)
 * @returns {string} The decoded Unicode string
 * @throws {Error} If the input contains invalid Punycode
 */
function punycodeDecode(input) {
  const output = [];
  let i = 0;
  let n = PUNYCODE.initialN;
  let bias = PUNYCODE.initialBias;

  // Find the last delimiter to separate basic from extended characters
  let basic = input.lastIndexOf(PUNYCODE.delimiter);
  if (basic < 0) basic = 0;

  // Copy basic characters (ASCII) to output
  for (let j = 0; j < basic; j++) {
    const codePoint = input.charCodeAt(j);
    if (codePoint >= 0x80) {
      throw new Error("Invalid Punycode: non-ASCII character in basic portion");
    }
    output.push(input.charAt(j));
  }

  // Process the encoded portion (after the last delimiter)
  let index = basic > 0 ? basic + 1 : 0;

  while (index < input.length) {
    const oldi = i;
    let w = 1;
    let k = PUNYCODE.base;

    // Decode a variable-length integer
    while (true) {
      if (index >= input.length) {
        throw new Error("Invalid Punycode: unexpected end of input");
      }

      const digit = punycodeDigitToBasic(input.charCodeAt(index++));
      if (digit === Infinity) {
        throw new Error("Invalid Punycode: invalid digit");
      }

      i += digit * w;

      const t =
        k <= bias
          ? PUNYCODE.tMin
          : k >= bias + PUNYCODE.tMax
          ? PUNYCODE.tMax
          : k - bias;

      if (digit < t) break;

      w *= PUNYCODE.base - t;
      k += PUNYCODE.base;
    }

    const outputLength = output.length + 1;
    bias = punycodAdapt(i - oldi, outputLength, oldi === 0);
    n += Math.floor(i / outputLength);
    i %= outputLength;

    // Insert the decoded character at position i
    output.splice(i++, 0, String.fromCodePoint(n));
  }

  return output.join("");
}

/**
 * Checks if a string is Punycode-encoded (has "xn--" prefix).
 * @param {string} str - The string to check
 * @returns {boolean} True if the string is Punycode-encoded
 */
function isPunycode(str) {
  return str.toLowerCase().startsWith(PUNYCODE.prefix);
}

/**
 * Decodes a string if it's Punycode-encoded, otherwise returns as-is.
 * @param {string} str - The input string (possibly Punycode-encoded)
 * @returns {string} The decoded string
 */
function decodePunycodeIfNeeded(str) {
  if (!isPunycode(str)) {
    return str;
  }

  try {
    // Remove the "xn--" prefix and decode
    const encoded = str.slice(PUNYCODE.prefix.length);
    return punycodeDecode(encoded);
  } catch (error) {
    // If decoding fails, return the original string
    console.error("Punycode decoding failed:", error.message);
    return str;
  }
}

// ============================================================================
// Text Utilities
// ============================================================================

/**
 * Extracts the first N graphemes (visual characters) from a string.
 * Properly handles emoji, combining characters, and complex scripts.
 * @param {string} str - The input string
 * @param {number} count - Maximum number of graphemes to extract
 * @returns {string} The extracted graphemes
 */
function getFirstGraphemes(str, count) {
  // Use Intl.Segmenter if available (modern browsers/Node.js)
  if (typeof Intl !== "undefined" && Intl.Segmenter) {
    const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });
    const segments = [...segmenter.segment(str)];
    return segments
      .slice(0, count)
      .map((s) => s.segment)
      .join("");
  }

  // Fallback: basic character extraction
  // This handles most cases but may split some complex emoji
  const chars = [...str]; // Spread handles basic Unicode better than substring
  return chars.slice(0, count).join("");
}

/**
 * Counts the number of graphemes (visual characters) in a string.
 * @param {string} str - The input string
 * @returns {number} The number of graphemes
 */
function countGraphemes(str) {
  if (typeof Intl !== "undefined" && Intl.Segmenter) {
    const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });
    return [...segmenter.segment(str)].length;
  }

  // Fallback: count array elements after spread
  return [...str].length;
}

/**
 * Escapes special XML characters to prevent XSS and rendering issues.
 * @param {string} str - The input string
 * @returns {string} The escaped string safe for XML/SVG
 */
function escapeXml(str) {
  const xmlEntities = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;",
  };

  return str.replace(/[&<>"']/g, (char) => xmlEntities[char]);
}

// ============================================================================
// Color Utilities
// ============================================================================

/**
 * Generates a random hexadecimal color code.
 * Uses crypto.getRandomValues for better randomness when available.
 * @returns {string} A hex color string (e.g., "#a3f2c1")
 */
function getRandomColor() {
  const hex = "0123456789abcdef";
  let color = "#";

  for (let i = 0; i < 6; i++) {
    color += hex[Math.floor(Math.random() * 16)];
  }

  return color;
}

/**
 * Generates a pair of random colors for gradient backgrounds.
 * @returns {{ color1: string, color2: string }} Two hex color strings
 */
function getGradientColors() {
  return {
    color1: getRandomColor(),
    color2: getRandomColor(),
  };
}

// ============================================================================
// SVG Generation
// ============================================================================

/**
 * Determines the border-radius style based on the shape parameter.
 * @param {string|null} shape - The shape type: "circle", "rounded", or null/undefined for square
 * @returns {string} CSS border-radius style attribute or empty string
 */
function getShapeStyle(shape) {
  const styles = {
    circle: 'style="border-radius: 50%;"',
    rounded: 'style="border-radius: 10px;"',
  };

  return styles[shape] || "";
}

/**
 * Calculates the optimal font size based on avatar size and text length.
 * Ensures text fits within the avatar boundaries.
 * @param {number} avatarSize - The width/height of the avatar
 * @param {string} text - The text to display
 * @returns {number} The calculated font size in pixels
 */
function calculateFontSize(avatarSize, text) {
  const graphemeCount = countGraphemes(text);
  return (avatarSize * DEFAULTS.fontSizeRatio) / Math.max(graphemeCount, 1);
}

/**
 * Generates an SVG avatar with a gradient background and centered text.
 * @param {Object} options - Avatar configuration options
 * @param {number} options.size - Width and height of the avatar
 * @param {string} options.text - Text to display (typically initials)
 * @param {string} options.shapeStyle - CSS style for border-radius
 * @param {string} options.color1 - Start color of the gradient
 * @param {string} options.color2 - End color of the gradient
 * @returns {string} Complete SVG markup
 */
function generateSvgAvatar({ size, text, shapeStyle, color1, color2 }) {
  const fontSize = calculateFontSize(size, text);
  const safeText = escapeXml(text); // Escape for XML safety

  // Using XML declaration for maximum compatibility
  // The gradient flows diagonally from top-left to bottom-right
  return `<?xml version="1.0" standalone="no"?>
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
<svg ${shapeStyle} width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" version="1.1" xmlns="http://www.w3.org/2000/svg">
  <g>
    <defs>
      <linearGradient id="avatar" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${color1}"/>
        <stop offset="100%" stop-color="${color2}"/>
      </linearGradient>
    </defs>
    <rect fill="url(#avatar)" x="0" y="0" width="${size}" height="${size}"/>
    <text x="50%" y="50%" alignment-baseline="central" dominant-baseline="central" text-anchor="middle" fill="#fff" font-family="sans-serif" font-size="${fontSize}">${safeText}</text>
  </g>
</svg>`;
}

// ============================================================================
// Request Handling
// ============================================================================

/**
 * Parses avatar options from the request URL.
 * Handles Punycode-encoded text for international character support.
 * @param {URL} url - The parsed request URL
 * @returns {Object} Parsed avatar options (size, text, shape)
 */
function parseAvatarOptions(url) {
  const path = url.pathname;

  // Extract text from path (e.g., "/avatar/JD" -> "JD")
  let avatarText = DEFAULTS.text;

  if (path.startsWith(BASEPATH)) {
    const rawText = path.slice(BASEPATH.length);

    // Decode URL encoding first (e.g., %20 -> space)
    const decodedText = decodeURIComponent(rawText);

    // Decode Punycode if present (e.g., "xn--nxasmq5b" -> "日本")
    const unicodeText = decodePunycodeIfNeeded(decodedText);

    // Extract first N graphemes (handles emoji and complex scripts)
    avatarText = getFirstGraphemes(unicodeText, DEFAULTS.maxTextLength);
  }

  // Parse query parameters with defaults
  const size = parseInt(url.searchParams.get("s"), 10) || DEFAULTS.size;
  const shape = url.searchParams.get("shape");

  return {
    size: Math.max(1, Math.min(size, 1000)), // Clamp size between 1-1000
    text: avatarText || DEFAULTS.text,
    shape,
    isRootPath: path === "/",
  };
}

/**
 * Creates a Response with appropriate headers for SVG content.
 * @param {string} svgContent - The SVG markup
 * @param {boolean} shouldCache - Whether to apply long-term caching
 * @returns {Response} Configured Response object
 */
function createSvgResponse(svgContent, shouldCache) {
  const response = new Response(svgContent, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": shouldCache ? CACHE.longTerm : CACHE.none,
    },
  });

  return response;
}

/**
 * Main request handler for the Cloudflare Worker.
 * Generates and returns an SVG avatar based on URL parameters.
 * @param {Request} request - The incoming HTTP request
 * @returns {Response} SVG avatar response
 */
async function handleRequest(request) {
  const url = new URL(request.url);
  const options = parseAvatarOptions(url);
  const { color1, color2 } = getGradientColors();

  const svgAvatar = generateSvgAvatar({
    size: options.size,
    text: options.text,
    shapeStyle: getShapeStyle(options.shape),
    color1,
    color2,
  });

  // Cache avatars except for root path (which shows a random avatar each time)
  const shouldCache = !options.isRootPath;

  return createSvgResponse(svgAvatar, shouldCache);
}

// ============================================================================
// Worker Entry Point
// ============================================================================

// Register the fetch event handler
// This is the entry point for all incoming requests to this Worker
addEventListener("fetch", (event) => {
  event.respondWith(handleRequest(event.request));
});
