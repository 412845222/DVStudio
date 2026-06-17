from __future__ import annotations


SCENE_LIGHTING_RESPONSE_SCHEMA = {
	'type': 'object',
	'properties': {
		'sceneSummary': {'type': 'string'},
		'lightingStyle': {'type': 'string'},
		'atmosphere': {
			'type': 'object',
			'properties': {
				'preset': {'type': 'string'},
				'brightness': {'type': 'string'},
				'contrast': {'type': 'string'},
				'warmth': {'type': 'string'},
				'intensityScale': {'type': 'number'},
				'notes': {'type': 'string'},
			},
			'additionalProperties': True,
		},
		'globalSettings': {
			'type': 'object',
			'properties': {
				'exposure': {'type': 'number'},
				'environmentIntensity': {'type': 'number'},
				'intensityScale': {'type': 'number'},
				'notes': {'type': 'string'},
			},
			'additionalProperties': True,
		},
		'ambientLight': {
			'type': 'object',
			'properties': {
				'color': {'type': 'string'},
				'intensity': {'type': 'number'},
			},
			'additionalProperties': True,
		},
		'hemisphereLight': {
			'type': 'object',
			'properties': {
				'skyColor': {'type': 'string'},
				'groundColor': {'type': 'string'},
				'intensity': {'type': 'number'},
			},
			'additionalProperties': True,
		},
		'mainDirectionalLight': {
			'type': 'object',
			'properties': {
				'color': {'type': 'string'},
				'intensity': {'type': 'number'},
				'position': {
					'type': 'object',
					'properties': {
						'x': {'type': 'number'},
						'y': {'type': 'number'},
						'z': {'type': 'number'},
					},
					'additionalProperties': True,
				},
				'target': {
					'type': 'object',
					'properties': {
						'x': {'type': 'number'},
						'y': {'type': 'number'},
						'z': {'type': 'number'},
					},
					'additionalProperties': True,
				},
			},
			'additionalProperties': True,
		},
		'lights': {
			'type': 'array',
			'items': {
				'type': 'object',
				'properties': {
					'id': {'type': 'string'},
					'name': {'type': 'string'},
					'type': {'type': 'string'},
					'sourceKind': {'type': 'string'},
					'emitMode': {'type': 'string'},
					'fixtureShape': {'type': 'string'},
					'role': {'type': 'string'},
					'anchorObjectId': {'type': 'string'},
					'color': {'type': 'string'},
					'groundColor': {'type': 'string'},
					'intensity': {'type': 'number'},
					'distance': {'type': 'number'},
					'decay': {'type': 'number'},
					'angle': {'type': 'number'},
					'penumbra': {'type': 'number'},
					'width': {'type': 'number'},
					'height': {'type': 'number'},
					'castShadow': {'type': 'boolean'},
					'position': {
						'type': 'object',
						'properties': {
							'x': {'type': 'number'},
							'y': {'type': 'number'},
							'z': {'type': 'number'},
						},
						'required': ['x', 'y', 'z'],
					},
					'target': {
						'type': 'object',
						'properties': {
							'x': {'type': 'number'},
							'y': {'type': 'number'},
							'z': {'type': 'number'},
						},
						'additionalProperties': True,
					},
					'direction': {
						'type': 'object',
						'properties': {
							'x': {'type': 'number'},
							'y': {'type': 'number'},
							'z': {'type': 'number'},
						},
						'additionalProperties': True,
					},
					'rotation': {
						'type': 'object',
						'properties': {
							'x': {'type': 'number'},
							'y': {'type': 'number'},
							'z': {'type': 'number'},
						},
						'additionalProperties': True,
					},
					'reason': {'type': 'string'},
				},
				'required': ['id', 'type', 'position'],
				'additionalProperties': True,
			},
		},
	},
	'required': ['sceneSummary', 'lights'],
	'additionalProperties': True,
}