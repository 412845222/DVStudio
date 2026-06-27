export function parseSSELine(line) {
  const trimmed = String(line || '').trim()
  if (!trimmed || trimmed.startsWith(':')) return null

  const colonIndex = trimmed.indexOf(':')
  if (colonIndex === -1) {
    return { event: 'message', data: trimmed }
  }

  const field = trimmed.slice(0, colonIndex).trim()
  const value = trimmed.slice(colonIndex + 1).trim()

  return { event: field, data: value }
}

export async function* parseSSEStream(lineIterator) {
  let eventType = 'message'
  let dataBuffer = []
  let lastEventId = ''

  for await (const line of lineIterator) {
    if (line === '') {
      if (dataBuffer.length > 0) {
        yield {
          event: eventType,
          data: dataBuffer.join('\n'),
          id: lastEventId,
        }
        eventType = 'message'
        dataBuffer = []
      }
      continue
    }

    const parsed = parseSSELine(line)
    if (!parsed) continue

    switch (parsed.event) {
      case 'event':
        eventType = parsed.data
        break
      case 'data':
        dataBuffer.push(parsed.data)
        break
      case 'id':
        lastEventId = parsed.data
        break
      case 'retry':
        break
    }
  }

  if (dataBuffer.length > 0) {
    yield {
      event: eventType,
      data: dataBuffer.join('\n'),
      id: lastEventId,
    }
  }
}

export function tryParseJson(data) {
  try {
    return JSON.parse(data)
  } catch {
    return null
  }
}
