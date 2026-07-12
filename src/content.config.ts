// Content-Collection „blog": MDX-Posts liegen bewusst in blog/ (Repo-Root),
// nicht unter src/ — Content und Code getrennt (siehe blog_ARCHITECTURE.md).
// Slug = Dateiname ohne Endung; optional per Frontmatter „slug" überschreibbar.
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blog = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    tags: z.array(z.string()).default([]),
    slug: z.string().optional(),
    /** Zielgruppe steuert die Heimvio-Erwähnung (nur vermieter: dezent erlaubt). */
    audience: z.enum(['vermieter', 'mieter', 'messdienst']).default('vermieter'),
    draft: z.boolean().default(false),
  }),
});

export const collections = { blog };
