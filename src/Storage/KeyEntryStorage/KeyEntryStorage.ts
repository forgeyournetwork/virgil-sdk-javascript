import { Buffer as NodeBuffer, dataToUint8Array, toBuffer } from '@virgilsecurity/data-utils';

import { Data } from '../../types';
import {
	IKeyEntry,
	IKeyEntryStorage,
	IKeyEntryStorageConfig,
	ISaveKeyEntryParams,
	IUpdateKeyEntryParams,
	KeyEntryMeta
} from './IKeyEntryStorage';
import { DefaultStorageAdapter } from '../adapters/DefaultStorageAdapter';
import { IStorageAdapter, IStorageAdapterConfig } from '../adapters/IStorageAdapter';
import { InvalidKeyEntryError, KeyEntryAlreadyExistsError, KeyEntryDoesNotExistError } from './errors';

const DEFAULTS: IStorageAdapterConfig = {
	dir: '.virgil_key_entries',
	name: 'VirgilKeyEntries'
};

const VALUE_KEY = 'value';
const CREATION_DATE_KEY = 'creationDate';
const MODIFICATION_DATE_KEY = 'modificationDate';

export { IKeyEntry, IKeyEntryStorage, IKeyEntryStorageConfig, ISaveKeyEntryParams, IUpdateKeyEntryParams };

/**
 * Class responsible for persisting private key bytes with optional
 * user-defined metadata.
 */
export class KeyEntryStorage implements IKeyEntryStorage {
	private adapter: IStorageAdapter;

	/**
	 * Initializes a new instance of `KeyEntryStorage`.
	 *
	 * @param {IKeyEntryStorageConfig} config - Instance configuration.
	 */
	constructor (config: IKeyEntryStorageConfig | string = {}) {
		this.adapter = resolveAdapter(config);
	}

	/**
	 * @inheritDoc
	 */
	exists(name: string): Promise<boolean> {
		validateName(name);
		return this.adapter.exists(name);
	}

	/**
	 * @inheritDoc
	 */
	load(name: string): Promise<IKeyEntry | null> {
		validateName(name);
		return this.adapter.load(name).then(data => {
			if (data == null) {
				return null;
			}

			return deserializeKeyEntry(data);
		});
	}

	/**
	 * @inheritDoc
	 */
	remove(name: string): Promise<boolean> {
		validateName(name);
		return this.adapter.remove(name);
	}

	/**
	 * @inheritDoc
	 */
	save({ name, value, meta }: { name: string; value: Data; meta?: KeyEntryMeta; }): Promise<IKeyEntry> {
		validateNameProperty(name);
		validateValueProperty(value);

		const myValue = dataToUint8Array(value, 'base64');

		const keyEntry = {
			name: name,
			value: myValue,
			meta: meta,
			creationDate: new Date(),
			modificationDate: new Date()
		};

		return this.adapter.store(name, serializeKeyEntry(keyEntry))
			.then(() => keyEntry)
			.catch(error => {
				if (error && error.name === 'StorageEntryAlreadyExistsError') {
					throw new KeyEntryAlreadyExistsError(name);
				}

				throw error;
			});
	}

	/**
	 * @inheritDoc
	 */
	list (): Promise<IKeyEntry[]> {
		return this.adapter.list()
			.then(entries => entries.map(entry => deserializeKeyEntry(entry)));
	}

	/**
	 * @inheritDoc
	 */
	update ({ name, value, meta }: { name: string; value?: Data; meta?: KeyEntryMeta; }): Promise<IKeyEntry> {
		validateNameProperty(name);
		if (!(value || meta)) {
			throw new TypeError(
				'Invalid argument. Either `value` or `meta` property is required.'
			);
		}

		return this.adapter.load(name)
			.then(data => {
				if (data === null) {
					throw new KeyEntryDoesNotExistError(name)
				}

				const entry = deserializeKeyEntry(data);
				const updatedEntry = Object.assign(entry,{
					value: value ? dataToUint8Array(value, 'base64') : entry.value,
					meta: meta || entry.meta,
					modificationDate: new Date()
				});
				return this.adapter.update(name, serializeKeyEntry(updatedEntry))
					.then(() => updatedEntry);
			});
	}

	/**
	 * @inheritDoc
	 */
	clear () {
		return this.adapter.clear();
	}
}

function serializeKeyEntry (keyEntry: IKeyEntry) {
	const { value, ...rest } = keyEntry;
	const serializableEntry = {
		...rest,
		value: toBuffer(keyEntry.value).toString('base64')
	};

	return NodeBuffer.from(JSON.stringify(serializableEntry), 'utf8');
}

function deserializeKeyEntry (data: Uint8Array): IKeyEntry {
	const dataStr = toBuffer(data).toString('utf8');
	try {
		return JSON.parse(
			dataStr,
			(key, value) => {
				if (key === VALUE_KEY) {
					return NodeBuffer.from(value, 'base64');
				}

				if (key === CREATION_DATE_KEY || key === MODIFICATION_DATE_KEY) {
					return new Date(value);
				}

				return value;
			}
		);
	} catch (error) {
		throw new InvalidKeyEntryError();
	}
}

function resolveAdapter (config: IKeyEntryStorageConfig|string) {
	if (typeof config === 'string') {
		return new DefaultStorageAdapter({ dir: config, name: config });
	}

	const { adapter, ...rest } = config;
	if (adapter != null) {
		return adapter;
	}

	return new DefaultStorageAdapter({ ...DEFAULTS, ...rest });
}

const requiredArg = (name: string) => (value: any) => {
	if (!value) throw new TypeError(`Argument '${name}' is required.`);
};
const requiredProp = (name: string) => (value: any) => {
	if (!value) throw new TypeError(`Invalid argument. Property ${name} is required`)
};

const validateName = requiredArg('name');
const validateNameProperty = requiredProp('name');
const validateValueProperty = requiredProp('value');
