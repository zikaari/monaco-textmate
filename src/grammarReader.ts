/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import { IRawGrammar } from './types';
import * as plist from 'fast-plist';
import { CAPTURE_METADATA } from './debug';
import { parse as manualParseJSON } from './json';

export function parseJSONGrammar(contents: string, filename: string): IRawGrammar {
	if (CAPTURE_METADATA) {
		return <IRawGrammar>manualParseJSON(contents, filename, true);
	}
	return <IRawGrammar>JSON.parse(contents);
}

export function parsePLISTGrammar(contents: string, filename: string): IRawGrammar {
	if (CAPTURE_METADATA) {
		return <IRawGrammar>plist.parseWithLocation(contents, filename, '$vscodeTextmateLocation');
	}
	return <IRawGrammar>plist.parse(contents);
}
