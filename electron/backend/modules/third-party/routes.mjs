import * as handlers from './handlers.mjs'

export const routes = [
	{ channel: 'dweb:third-party:nanobanana:ref-cache', handler: handlers.nanobananaRefCache },
	{ channel: 'dweb:third-party:seedream:ref-cache', handler: handlers.seedreamRefCache },
	{ channel: 'dweb:third-party:nanobanana:generate', handler: handlers.nanobananaGenerate },
	{
		channel: 'dweb:third-party:nanobanana:generate:stream',
		handler: handlers.nanobananaGenerateStream,
		stream: true
	},
	{
		channel: 'dweb:third-party:seedream:generate:stream',
		handler: handlers.seedreamGenerateStream,
		stream: true
	},
	{
		channel: 'dweb:third-party:gemini:image:generate:stream',
		handler: handlers.geminiImageGenerateStream,
		stream: true
	},
	{
		channel: 'dweb:third-party:jimeng:image:generate:stream',
		handler: handlers.jimengImageGenerateStream,
		stream: true
	},
	{
		channel: 'dweb:third-party:jimeng:video:generate:stream',
		handler: handlers.jimengVideoGenerateStream,
		stream: true
	},
	{ channel: 'dweb:third-party:blueprint:chat', handler: handlers.blueprintChat },
	{
		channel: 'dweb:third-party:blueprint:chat:stream',
		handler: handlers.blueprintChatStream,
		stream: true
	}
]
