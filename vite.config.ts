import { defineConfig, loadEnv, type Plugin } from 'vite';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import solarlunar from 'solarlunar';
import meta from './src/generated/hero-meta.json';
import { resolveSite } from './src/config/resolve';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * 农历在**构建期**换算并内联（solarlunar 仅为 devDependency，不进产物）：
 * 婚期由 VITE_DATE_ISO 决定，改日期后重新构建即可得到新的农历。
 */
function lunarText(dateISO: string): string {
  const [y, m, d] = dateISO.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return '';
  try {
    const l = solarlunar.solar2lunar(y, m, d);
    return `农历 ${l.gzYear}${l.animal}年 ${l.monthCn}${l.dayCn}`;
  } catch {
    return ''; // 换算失败不阻断构建，只是少显示一行
  }
}

/**
 * 标题 / 描述 / og:url 与页面 DOM **共用同一份解析逻辑**（config/resolve.ts），
 * 消除「两处硬编码不一致」的历史问题。
 */
function siteMetaPlugin(site: ReturnType<typeof resolveSite>): Plugin {
  const ogImage = site.siteUrl ? `${site.siteUrl}/og.jpg` : '/og.jpg';
  return {
    name: 'invite-html',
    transformIndexHtml(html) {
      return html
        .replace(/__LQIP__/g, meta.lqip)
        .replace(/__TITLE__/g, site.title)
        .replace(/__DESC__/g, site.description)
        .replace(/__SITE_URL__/g, site.siteUrl)
        .replace(/__OG_IMAGE__/g, ogImage);
    },
  };
}

export default defineConfig(({ mode }) => {
  // loadEnv 读取 .env / .env.<mode> + 真实环境变量，使本地与 CI（Cloudflare Pages）行为一致
  const env = loadEnv(mode, process.cwd(), '');
  const site = resolveSite(env);

  return {
    build: {
      target: 'es2019',
      cssCodeSplit: false,
      assetsInlineLimit: 0,
      sourcemap: false,
      rollupOptions: {
        input: {
          // 主请柬页
          main: resolve(__dirname, 'index.html'),
          // 面板页。输出为 dashboard/index.html —— 目录式结构避开
          // clean-URL 重定向自环（dashboard.html 会被 308 到 /dashboard 再自环）
          dashboard: resolve(__dirname, 'dashboard/index.html'),
        },
      },
    },
    define: {
      __LUNAR__: JSON.stringify(lunarText(site.wedding.dateISO)),
    },
    plugins: [siteMetaPlugin(site)],
  };
});
