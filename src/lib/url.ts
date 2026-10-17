/**
 * Build an internal link that respects the site's base path, so links keep working
 * on hkarsilar.github.io/biopsychology_companion/ and later on a custom domain.
 */
export function url(path = '/'): string {
  const base = import.meta.env.BASE_URL.replace(/\/+$/, '');
  const clean = path.startsWith('/') ? path : `/${path}`;
  const withSlash = /[?#]|\.[a-z0-9]+$/i.test(clean) || clean.endsWith('/') ? clean : `${clean}/`;
  return `${base}${withSlash}`;
}
