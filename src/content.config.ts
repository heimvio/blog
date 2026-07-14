// Zwei Content-Collections: „blog" (Artikel) und „doku" (Benutzerdokumentation).
// Beide liegen bewusst im Repo-Root (blog/, doku/), nicht unter src/ — Content und
// Code getrennt (siehe blog_ARCHITECTURE.md).
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

// Kein `date`/`tags`/`audience`: eine Doku-Seite ist kein Artikel — sie hat keinen
// Erscheinungstermin, sondern einen Platz in einer Ordnung.
const doku = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './doku' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    /** Gruppierung in der Doku-Navigation, z. B. „Erste Schritte". */
    section: z.string().default('Grundlagen'),
    /** Sortierung — global über alle Seiten, nicht je Sektion. Klein = weiter oben. */
    order: z.number().default(100),
    slug: z.string().optional(),
    updated: z.coerce.date().optional(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { blog, doku };
