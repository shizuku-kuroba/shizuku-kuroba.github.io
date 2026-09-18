import { z } from 'astro/zod'

export const shareList = ['weibo', 'x', 'bluesky', 'plurk', 'threads'] as const

export const ShareSchema = () =>
  z
    .array(z.enum(shareList))
    .default(['plurk', 'threads'])
    .describe('Options for sharing content on social media platforms.')
