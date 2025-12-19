/**
 * Statically Avatar Generator
 *
 * Generates customizable SVG avatars with gradient backgrounds and text initials.
 * Supports various shapes (square, circle, rounded) and configurable sizes.
 *
 * Usage:
 *   GET /avatar/JD?s=120&shape=circle
 *   - Path after BASEPATH becomes the avatar text (max 2 chars)
 *   - Query params: s (size), shape (circle|rounded|square)
 */

// ============================================================================
// Configuration
// ============================================================================

const BASEPATH = "/avatar/";

// Default avatar settings
const DEFAULTS = {
  size: 60,
  text: "A",
  maxTextLength: 2,
  fontSizeRatio: 0.9, // Font size relative to avatar size
};

// Cache durations (in seconds)
const CACHE = {
  none: "no-cache",
  longTerm: "public, max-age=31536000, immutable", // 1 year
};

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
 * @param {number} textLength - The number of characters to display
 * @returns {number} The calculated font size in pixels
 */
function calculateFontSize(avatarSize, textLength) {
  return (avatarSize * DEFAULTS.fontSizeRatio) / textLength;
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
  const fontSize = calculateFontSize(size, text.length);

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
    <text x="50%" y="50%" alignment-baseline="central" dominant-baseline="central" text-anchor="middle" fill="#fff" font-family="sans-serif" font-size="${fontSize}">${text}</text>
  </g>
</svg>`;
}

// ============================================================================
// Request Handling
// ============================================================================

/**
 * Parses avatar options from the request URL.
 * @param {URL} url - The parsed request URL
 * @returns {Object} Parsed avatar options (size, text, shape)
 */
function parseAvatarOptions(url) {
  const path = url.pathname;

  // Extract text from path (e.g., "/avatar/JD" -> "JD")
  const avatarText = path.startsWith(BASEPATH)
    ? path.slice(BASEPATH.length).substring(0, DEFAULTS.maxTextLength)
    : DEFAULTS.text;

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
