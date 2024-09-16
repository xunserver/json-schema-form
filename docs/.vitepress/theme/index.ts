import type { EnhanceAppContext, Theme } from "vitepress";
import DefaultTheme from "vitepress/theme";

function pathnameOf(to: string): string {
  if (to.startsWith("http://") || to.startsWith("https://") || to.startsWith("//")) {
    try {
      return new URL(to, "https://example.invalid").pathname;
    } catch {
      return to;
    }
  }
  return to.split("?")[0]!.split("#")[0]!;
}

function isStaticPlayground(to: string, base: string): boolean {
  const pathname = pathnameOf(to);
  const normalizedBase = base.endsWith("/") ? base : `${base}/`;
  const rest = pathname.startsWith(normalizedBase)
    ? pathname.slice(normalizedBase.length - 1)
    : pathname.startsWith("/")
      ? pathname
      : `/${pathname}`;
  return rest === "/playground" || rest.startsWith("/playground/");
}

function bindPlaygroundHardNav({ router, siteData }: EnhanceAppContext): void {
  const previous = router.onBeforeRouteChange;
  router.onBeforeRouteChange = async (to) => {
    if (previous) {
      const allowed = await previous(to);
      if (allowed === false) {
        return false;
      }
    }
    if (typeof window === "undefined") {
      return;
    }
    if (!isStaticPlayground(to, siteData.value.base)) {
      return;
    }
    window.location.assign(to);
    return false;
  };
}

export default {
  extends: DefaultTheme,
  enhanceApp(ctx) {
    bindPlaygroundHardNav(ctx);
  },
} satisfies Theme;
