/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import { SyncRegistry } from './registry';
import { parseJSONGrammar, parsePLISTGrammar } from './grammarReader';
import { Theme } from './theme';
import { StackElement as StackElementImpl } from './grammar';
import { IGrammarDefinition, IRawGrammar } from './types';

export { IGrammarDefinition, IRawGrammar }

let DEFAULT_OPTIONS: RegistryOptions = {
	getGrammarDefinition: (scopeName: string) => null,
	getInjections: (scopeName: string) => null
};

/**
 * A single theme setting.
 */
export interface IRawThemeSetting {
	readonly name?: string;
	readonly scope?: string | string[];
	readonly settings: {
		readonly fontStyle?: string;
		readonly foreground?: string;
		readonly background?: string;
	};
}

/**
 * A TextMate theme.
 */
export interface IRawTheme {
	readonly name?: string;
	readonly settings: IRawThemeSetting[];
}

/**
 * A registry helper that can locate grammar file paths given scope names.
 */
export interface RegistryOptions {
	theme?: IRawTheme;
	getGrammarDefinition(scopeName: string, dependentScope: string): Promise<IGrammarDefinition>;
	getInjections?(scopeName: string): string[];
}

/**
 * A map from scope name to a language id. Please do not use language id 0.
 */
export interface IEmbeddedLanguagesMap {
	[scopeName: string]: number;
}

/**
 * A map from selectors to token types.
 */
export interface ITokenTypeMap {
	[selector: string]: StandardTokenType;
}

export const enum StandardTokenType {
	Other = 0,
	Comment = 1,
	String = 2,
	RegEx = 4
}

export interface IGrammarConfiguration {
	embeddedLanguages?: IEmbeddedLanguagesMap;
	tokenTypes?: ITokenTypeMap;
}

/**
 * The registry that will hold all grammars.
 */
export class Registry {

	private readonly _locator: RegistryOptions;
	private readonly _syncRegistry: SyncRegistry;
	private readonly installationQueue: Map<string, Promise<IGrammar>>;

	constructor(locator: RegistryOptions = DEFAULT_OPTIONS) {
		this._locator = locator;
		this._syncRegistry = new SyncRegistry(Theme.createFromRawTheme(locator.theme));
		this.installationQueue = new Map();
	}

	/**
	 * Change the theme. Once called, no previous `ruleStack` should be used anymore.
	 */
	public setTheme(theme: IRawTheme): void {
		this._syncRegistry.setTheme(Theme.createFromRawTheme(theme));
	}

	/**
	 * Returns a lookup array for color ids.
	 */
	public getColorMap(): string[] {
		return this._syncRegistry.getColorMap();
	}

	/**
	 * Load the grammar for `scopeName` and all referenced included grammars asynchronously.
	 * Please do not use language id 0.
	 */
	public loadGrammarWithEmbeddedLanguages(initialScopeName: string, initialLanguage: number, embeddedLanguages: IEmbeddedLanguagesMap): Promise<IGrammar> {
		return this.loadGrammarWithConfiguration(initialScopeName, initialLanguage, { embeddedLanguages });
	}

	/**
	 * Load the grammar for `scopeName` and all referenced included grammars asynchronously.
	 * Please do not use language id 0.
	 */
	public async loadGrammarWithConfiguration(initialScopeName: string, initialLanguage: number, configuration: IGrammarConfiguration): Promise<IGrammar> {
		await this._loadGrammar(initialScopeName);
		return this.grammarForScopeName(initialScopeName, initialLanguage, configuration.embeddedLanguages, configuration.tokenTypes);
	}

	/**
	 * Load the grammar for `scopeName` and all referenced included grammars asynchronously.
	 */
	public async loadGrammar(initialScopeName: string): Promise<IGrammar> {
		return this._loadGrammar(initialScopeName);
	}

	private async _loadGrammar(initialScopeName: string, dependentScope: string = null): Promise<IGrammar> {

		// already installed
		if (this._syncRegistry.lookup(initialScopeName)) {
			return this.grammarForScopeName(initialScopeName);
		}
		// installation in progress
		if (this.installationQueue.has(initialScopeName)) {
			return this.installationQueue.get(initialScopeName);
		}
		// start installation process
		const prom = new Promise<IGrammar>(async (resolve, reject) => {
			let grammarDefinition = await this._locator.getGrammarDefinition(initialScopeName, dependentScope);
			if (!grammarDefinition) {
				throw new Error(`A tmGrammar load was requested but registry host failed to provide grammar definition`);
			}
			if ((grammarDefinition.format !== 'json' && grammarDefinition.format !== 'plist') ||
				(grammarDefinition.format === 'json' && typeof grammarDefinition.content !== 'object' && typeof grammarDefinition.content !== 'string') ||
				(grammarDefinition.format === 'plist' && typeof grammarDefinition.content !== 'string')
			) {
				throw new TypeError('Grammar definition must be an object, either `{ content: string | object, format: "json" }` OR `{ content: string, format: "plist" }`)');
			}
			const rawGrammar: IRawGrammar = grammarDefinition.format === 'json'
				? typeof grammarDefinition.content === 'string'
					? parseJSONGrammar(grammarDefinition.content, 'c://fakepath/grammar.json')
					: grammarDefinition.content as IRawGrammar
				: parsePLISTGrammar(grammarDefinition.content as string, 'c://fakepath/grammar.plist');
			let injections = (typeof this._locator.getInjections === 'function') && this._locator.getInjections(initialScopeName);

			(rawGrammar as any).scopeName = initialScopeName;
			let deps = this._syncRegistry.addGrammar(rawGrammar, injections);
			await Promise.all(deps.map(async (scopeNameD) => {
				try {
					return this._loadGrammar(scopeNameD, initialScopeName);
				} catch (error) {
					throw new Error(`While trying to load tmGrammar with scopeId: '${initialScopeName}', it's dependency (scopeId: ${scopeNameD}) loading errored: ${error.message}`);
				}
			}));
			resolve(this.grammarForScopeName(initialScopeName));
		});
		this.installationQueue.set(initialScopeName, prom);
		await prom;
		this.installationQueue.delete(initialScopeName);
		return prom;
	}

	/**
	 * Get the grammar for `scopeName`. The grammar must first be created via `loadGrammar` or `loadGrammarFromPathSync`.
	 */
	public grammarForScopeName(scopeName: string, initialLanguage: number = 0, embeddedLanguages: IEmbeddedLanguagesMap = null, tokenTypes: ITokenTypeMap = null): IGrammar {
		return this._syncRegistry.grammarForScopeName(scopeName, initialLanguage, embeddedLanguages, tokenTypes);
	}
}

/**
 * A grammar
 */
export interface IGrammar {
	/**
	 * Tokenize `lineText` using previous line state `prevState`.
	 */
	tokenizeLine(lineText: string, prevState: StackElement): ITokenizeLineResult;

	/**
	 * Tokenize `lineText` using previous line state `prevState`.
	 * The result contains the tokens in binary format, resolved with the following information:
	 *  - language
	 *  - token type (regex, string, comment, other)
	 *  - font style
	 *  - foreground color
	 *  - background color
	 * e.g. for getting the languageId: `(metadata & MetadataConsts.LANGUAGEID_MASK) >>> MetadataConsts.LANGUAGEID_OFFSET`
	 */
	tokenizeLine2(lineText: string, prevState: StackElement): ITokenizeLineResult2;
}

export interface ITokenizeLineResult {
	readonly tokens: IToken[];
	/**
	 * The `prevState` to be passed on to the next line tokenization.
	 */
	readonly ruleStack: StackElement;
}

/**
 * Helpers to manage the "collapsed" metadata of an entire StackElement stack.
 * The following assumptions have been made:
 *  - languageId < 256 => needs 8 bits
 *  - unique color count < 512 => needs 9 bits
 *
 * The binary format is:
 * - -------------------------------------------
 *     3322 2222 2222 1111 1111 1100 0000 0000
 *     1098 7654 3210 9876 5432 1098 7654 3210
 * - -------------------------------------------
 *     xxxx xxxx xxxx xxxx xxxx xxxx xxxx xxxx
 *     bbbb bbbb bfff ffff ffFF FTTT LLLL LLLL
 * - -------------------------------------------
 *  - L = LanguageId (8 bits)
 *  - T = StandardTokenType (3 bits)
 *  - F = FontStyle (3 bits)
 *  - f = foreground color (9 bits)
 *  - b = background color (9 bits)
 */
export const enum MetadataConsts {
	LANGUAGEID_MASK = 0b00000000000000000000000011111111,
	TOKEN_TYPE_MASK = 0b00000000000000000000011100000000,
	FONT_STYLE_MASK = 0b00000000000000000011100000000000,
	FOREGROUND_MASK = 0b00000000011111111100000000000000,
	BACKGROUND_MASK = 0b11111111100000000000000000000000,

	LANGUAGEID_OFFSET = 0,
	TOKEN_TYPE_OFFSET = 8,
	FONT_STYLE_OFFSET = 11,
	FOREGROUND_OFFSET = 14,
	BACKGROUND_OFFSET = 23
}

export interface ITokenizeLineResult2 {
	/**
	 * The tokens in binary format. Each token occupies two array indices. For token i:
	 *  - at offset 2*i => startIndex
	 *  - at offset 2*i + 1 => metadata
	 *
	 */
	readonly tokens: Uint32Array;
	/**
	 * The `prevState` to be passed on to the next line tokenization.
	 */
	readonly ruleStack: StackElement;
}

export interface IToken {
	startIndex: number;
	readonly endIndex: number;
	readonly scopes: string[];
}

/**
 * **IMPORTANT** - Immutable!
 */
export interface StackElement {
	_stackElementBrand: void;
	readonly depth: number;

	clone(): StackElement;
	equals(other: StackElement): boolean;
}

export const INITIAL: StackElement = StackElementImpl.NULL;
