import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MdastPluginEntry, PluginFactoryContext } from 'satteri';
import { chapters } from '../data/chapters';

/**
 * A Markdown plugin that turns "lesson 2.4" in lesson text into a link to that lesson, as soon as
 * the lesson is written. Mentions of lessons that do not exist yet stay plain text, and so do
 * mentions inside links, headings and glossary terms, and a lesson's mentions of itself.
 */
export function lessonLinks(options: { base: string }): MdastPluginEntry {
  const base = options.base.replace(/\/+$/, '');
  const lessonsDir = join(process.cwd(), 'src/content/lessons');
  const byNumber = new Map<string, { href: string; file: string }>();
  for (const c of chapters) {
    for (const l of c.lessons) {
      const file = join(lessonsDir, c.slug, `${l.slug}.mdx`);
      if (existsSync(file)) byNumber.set(l.n, { href: `${base}/chapters/${c.slug}/${l.slug}/`, file });
    }
  }
  const pattern = /\b([Ll]essons? )(\d+\.\d+)\b/g;

  return (factory: PluginFactoryContext) => {
    const here = factory.fileURL ? fileURLToPath(factory.fileURL) : '';
    return {
      name: 'lesson-links',
      text(node, ctx) {
        let p: { type: string; name?: string | null } | undefined = ctx.parent(node);
        for (; p && p.type !== 'root'; p = ctx.parent(p as Parameters<typeof ctx.parent>[0])) {
          const t = p;
          if (t.type === 'link' || t.type === 'linkReference' || t.type === 'heading') return;
          if (t.type.startsWith('mdxJsx') && (t.name === 'a' || t.name === 'Term')) return;
        }
        const value = node.value;
        const parts: ({ type: 'text'; value: string } | { type: 'link'; url: string; children: { type: 'text'; value: string }[] })[] = [];
        let last = 0;
        for (const m of value.matchAll(pattern)) {
          const target = byNumber.get(m[2]);
          if (!target || target.file === here) continue;
          const start = m.index ?? 0;
          if (start > last) parts.push({ type: 'text', value: value.slice(last, start) });
          parts.push({ type: 'link', url: target.href, children: [{ type: 'text', value: m[0] }] });
          last = start + m[0].length;
        }
        if (parts.length === 0) return;
        if (last < value.length) parts.push({ type: 'text', value: value.slice(last) });
        ctx.replaceNode(node, parts);
      },
    };
  };
}
