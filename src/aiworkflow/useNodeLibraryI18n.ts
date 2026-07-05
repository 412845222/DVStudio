import { computed } from 'vue'
import { useI18n } from '../i18n'
import {
	NEWUI2_NODE_CATALOG,
	NEWUI2_NODE_CATALOG_CATEGORIES,
	NEWUI2_NODE_SPECIAL_GROUPS,
	NEWUI2_NODE_TOP_CATEGORIES,
} from './nodeLibrary'
import type {
	Newui2NodeCatalogCategory,
	Newui2NodeCatalogItem,
	Newui2NodeSpecialGroup,
	Newui2NodeTopCategory,
} from '../ui/UIComponent/DwebCanvasMenu.types'
import type { TranslateMessages } from '../i18n/types'

function getTranslatedString(
	t: (key: string, params?: Record<string, string | number>) => string,
	key: string,
	fallback: string
): string {
	const translated = t(key)
	if (translated !== key) return translated
	return fallback
}

function getTranslatedStringArray(
	messages: TranslateMessages,
	key: string,
	fallback: string[] | undefined
): string[] | undefined {
	const value = messages[key]
	if (Array.isArray(value)) return value
	return fallback
}

export function useNodeLibraryI18n() {
	const { t, messages, locale } = useI18n()

	const categories = computed<Newui2NodeCatalogCategory[]>(() => {
		void locale.value
		const msgs = messages.value
		return NEWUI2_NODE_CATALOG_CATEGORIES.map((cat) => {
			const labelKey = `aiworkflow.nodeLibrary.categories.${cat.id}.label`
			const descKey = `aiworkflow.nodeLibrary.categories.${cat.id}.description`
			return {
				...cat,
				label: getTranslatedString(t, labelKey, cat.label),
				description: cat.description
					? getTranslatedString(t, descKey, cat.description)
					: cat.description,
			}
		})
	})

	const topCategories = computed<Newui2NodeTopCategory[]>(() => {
		void locale.value
		const msgs = messages.value
		return NEWUI2_NODE_TOP_CATEGORIES.map((cat) => {
			const labelKey = `aiworkflow.nodeLibrary.topCategories.${cat.id}.label`
			const descKey = `aiworkflow.nodeLibrary.topCategories.${cat.id}.description`
			return {
				...cat,
				label: getTranslatedString(t, labelKey, cat.label),
				description: cat.description
					? getTranslatedString(t, descKey, cat.description)
					: cat.description,
			}
		})
	})

	const specialGroups = computed<Newui2NodeSpecialGroup[]>(() => {
		void locale.value
		const msgs = messages.value
		return NEWUI2_NODE_SPECIAL_GROUPS.map((group) => {
			const labelKey = `aiworkflow.nodeLibrary.specialGroups.${group.id}.label`
			const descKey = `aiworkflow.nodeLibrary.specialGroups.${group.id}.description`
			return {
				...group,
				label: getTranslatedString(t, labelKey, group.label),
				description: group.description
					? getTranslatedString(t, descKey, group.description)
					: group.description,
			}
		})
	})

	const catalogItems = computed<Newui2NodeCatalogItem[]>(() => {
		void locale.value
		const msgs = messages.value
		return NEWUI2_NODE_CATALOG.map((item) => {
			const labelKey = `aiworkflow.nodeLibrary.nodes.${item.actionId}.label`
			const descKey = `aiworkflow.nodeLibrary.nodes.${item.actionId}.description`
			const aliasesKey = `aiworkflow.nodeLibrary.nodes.${item.actionId}.searchAliases`

			return {
				...item,
				label: getTranslatedString(t, labelKey, item.label),
				description: item.description
					? getTranslatedString(t, descKey, item.description)
					: item.description,
				searchAliases: getTranslatedStringArray(msgs, aliasesKey, item.searchAliases),
			}
		})
	})

	return {
		categories,
		topCategories,
		specialGroups,
		catalogItems,
	}
}
