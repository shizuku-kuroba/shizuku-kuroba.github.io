export type TumblrImage = {
  url: string
  previewUrl: string
  width?: number
  height?: number
}

export type TumblrPostContent = {
  title: string
  body: string
}

type TumblrPhoto = {
  original_size?: { url?: string; width?: number; height?: number }
  alt_sizes?: { url?: string; width?: number; height?: number }[]
  [key: string]: unknown
}

type TumblrPost = {
  type?: string
  photos?: TumblrPhoto[]
  [key: string]: unknown
}

const decodeAttribute = (value: string) =>
  value.replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#39;', "'")

const htmlToText = (value: unknown) => {
  if (typeof value !== 'string') return ''

  return decodeAttribute(
    value
      .replace(/<br\s*\/?\s*>/gi, '\n')
      .replace(/<\/(?:p|div|li|h[1-6]|blockquote)>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .replaceAll('&nbsp;', ' ')
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>')
  )
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const getAttribute = (tag: string, name: string) => {
  const match = tag.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'))
  return decodeAttribute(match?.[1] ?? match?.[2] ?? '')
}

const parseDimension = (value: unknown) => {
  const dimension = Number(value)
  return Number.isFinite(dimension) && dimension > 0 ? dimension : undefined
}

const largestSrcsetUrl = (srcset: string) => {
  const candidates = srcset
    .split(',')
    .map((candidate) => {
      const [url, descriptor = '0w'] = candidate.trim().split(/\s+/)
      return { url, width: Number.parseInt(descriptor, 10) || 0 }
    })
    .filter(({ url }) => Boolean(url))

  return candidates.sort((a, b) => b.width - a.width)[0]?.url
}

const imageFromPhoto = (photo: TumblrPhoto): TumblrImage | null => {
  const original = photo.original_size
  const altSizes = Array.isArray(photo.alt_sizes) ? photo.alt_sizes : []
  const legacyUrl = photo['photo-url-1280'] ?? photo['photo-url-500']
  const url = original?.url ?? (typeof legacyUrl === 'string' ? legacyUrl : undefined)
  if (!url) return null

  const preview = altSizes
    .filter(({ width, url: candidateUrl }) => Boolean(candidateUrl) && Number(width) <= 640)
    .sort((a, b) => Number(b.width) - Number(a.width))[0]

  return {
    url,
    previewUrl: preview?.url ?? url,
    width: parseDimension(original?.width ?? photo.width),
    height: parseDimension(original?.height ?? photo.height)
  }
}

export function extractTumblrImages(post: TumblrPost): TumblrImage[] {
  if (Array.isArray(post.photos) && post.photos.length > 0) {
    return post.photos.map(imageFromPhoto).filter((image): image is TumblrImage => Boolean(image))
  }

  if (post.type === 'photo') {
    const legacyImage = imageFromPhoto(post)
    return legacyImage ? [legacyImage] : []
  }

  if (post.type !== 'regular' || typeof post['regular-body'] !== 'string') return []

  return [...post['regular-body'].matchAll(/<img\b[^>]*>/gi)]
    .map(([tag]): TumblrImage | null => {
      const previewUrl = getAttribute(tag, 'src')
      const url = largestSrcsetUrl(getAttribute(tag, 'srcset')) ?? previewUrl
      if (!url) return null

      return {
        url,
        previewUrl: previewUrl || url,
        width: parseDimension(getAttribute(tag, 'data-orig-width')),
        height: parseDimension(getAttribute(tag, 'data-orig-height'))
      }
    })
    .filter((image): image is TumblrImage => Boolean(image))
}

export function extractTumblrPostContent(post: TumblrPost): TumblrPostContent {
  if (post.type === 'regular') {
    const rawBody = typeof post['regular-body'] === 'string' ? post['regular-body'] : ''
    const embeddedTitle = rawBody.match(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/i)
    const title = htmlToText(post['regular-title']) || htmlToText(embeddedTitle?.[1])
    const body = embeddedTitle ? rawBody.replace(embeddedTitle[0], '') : rawBody

    return {
      title,
      body: htmlToText(body)
    }
  }

  if (post.type === 'photo') {
    return {
      title: '',
      body: htmlToText(post['photo-caption'])
    }
  }

  return { title: '', body: '' }
}
