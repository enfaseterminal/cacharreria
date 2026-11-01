export function getApplicationUrl(href = globalThis.location?.href, baseUrl = "./") {
  if (!href) return "URL no disponible";
  try {
    const current = new URL(href);
    if (!["http:", "https:"].includes(current.protocol)) return "URL no disponible";
    let appPath = current.pathname;
    if (/\/index\.html?$/i.test(appPath)) appPath = appPath.slice(0, appPath.lastIndexOf("/") + 1);
    else if (!appPath.endsWith("/")) appPath += "/";
    const base = new URL(baseUrl || "./", `${current.origin}${appPath}`);
    base.search = "";
    base.hash = "";
    if (!base.pathname.endsWith("/")) base.pathname += "/";
    return base.href;
  } catch {
    return "URL no disponible";
  }
}
