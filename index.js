async function handleRequest(request) {
    const url = new URL(request.url);
    const path = url.pathname;
    const avatarText = path.replace(BASEPATH, '');

    let size = '60';
    let text = 'A';
    let radius = '';
    let color1 = await getRandomColor();
    let color2 = await getRandomColor();

    if (url.searchParams.has('s')) size = url.searchParams.get('s');
    if (url.searchParams.get('shape') == 'circle')
        radius = `style="border-radius: 50%;"`;
    if (url.searchParams.get('shape') == 'rounded')
        radius = `style="border-radius: 10px;"`;
    if (path.startsWith(BASEPATH)) text = avatarText.substr(0, 2);

    let fontsize = (size * 0.9) / text.length;
    const avatar = `<?xml version="1.0" standalone="no"?>
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
<svg ${radius} width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" version="1.1" xmlns="http://www.w3.org/2000/svg">
  <g>
    <defs>
      <linearGradient id="avatar" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${color1}"/>
        <stop offset="100%" stop-color="${color2}"/>
      </linearGradient>
    </defs>
    <rect fill="url(#avatar)" x="0" y="0" width="${size}" height="${size}"/>
    <text x="50%" y="50%" alignment-baseline="central" dominant-baseline="central" text-anchor="middle" fill="#fff" font-family="sans-serif" font-size="${fontsize}">${text}</text>
  </g>
</svg>
`;

    const response = new Response(avatar);

    if (path === '/') {
        // no cache
        response.headers.set('Cache-Control', 'no-cache');
    } else {
        // Set cache for 1 year
        response.headers.set(
            'Cache-Control',
            'public, max-age=31536000, immutable',
        );
    }

    response.headers.set('Content-Type', 'image/svg+xml; charset=utf8');

    return response;
}

async function getRandomColor() {
    var letters = '0123456789abcdef';
    var color = '#';
    for (var i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
}

addEventListener('fetch', event => {
    event.respondWith(handleRequest(event.request));
});
