// Strip the "This site is hosted on Netlify" comment Netlify injects into HTML.
export default async (request, context) => {
  const res = await context.next();
  if (!(res.headers.get('content-type') || '').includes('text/html')) return res;
  const html = (await res.text()).replace(/<!--\s*This site is hosted on Netlify[\s\S]*?-->/, '');
  const headers = new Headers(res.headers);
  headers.delete('content-length');
  return new Response(html, { status: res.status, headers });
};

export const config = { path: '/*', excludedPath: ['/static/*', '/company-logos/*'] };
