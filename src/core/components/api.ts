import type { JsonValue } from '../shared/json'

import type { ComponentTemplate, InstantiateTemplateOptions, InstantiateTemplateResult } from './types'
import type { ExportTemplateFromSelectionArgs } from './exportTemplate'

import type { ValidateResult } from './validate'

import { exportTemplateFromSelection } from './exportTemplate'
import { instantiateTemplate, instantiateValidatedTemplate } from './instantiate'
import { validateComponentTemplate } from './validate'

export type ComponentTemplateApi = {
	validateTemplate: (v: unknown) => ValidateResult<ComponentTemplate>
	instantiateTemplate: (
		template: unknown,
		params?: Record<string, JsonValue>,
		options?: InstantiateTemplateOptions
	) => InstantiateTemplateResult
	instantiateValidatedTemplate: (
		template: ComponentTemplate,
		params?: Record<string, JsonValue>,
		options?: InstantiateTemplateOptions
	) => InstantiateTemplateResult
	exportTemplateFromSelection: (args: ExportTemplateFromSelectionArgs) => ComponentTemplate
}

export const componentTemplateApi: ComponentTemplateApi = {
	validateTemplate: validateComponentTemplate,
	instantiateTemplate,
	instantiateValidatedTemplate,
	exportTemplateFromSelection,
}
