import dots from "dot-prop";
import type { Collection as MongoCollection, SortDirection } from "mongodb";
import { FieldModel, FieldType } from "./fields";

/**
 * @typedef {object} FieldToDocumentScheme
 * @property {string} key The key
 * @property {FieldType} value The value
 */
export type FieldToDocumentScheme<T extends FieldModel<unknown>> = {
    key: string;
    value: FieldType<T>;
};

/**
 * @typedef {object} CollectionSortOptions
 * @property {ascending|asc|descending|desc|1|-1} [by] Sort direction
 * @property {string|string[]} [target] The sort target
 */
export interface CollectionSortOptions {
    by?: SortDirection;
    target?: string | string[];
}

/**
 * @typedef {object} AllCollectionDocumentOptions
 * @property {number} [max] The max value
 * @property {CollectionSortOptions} [sort={}] Sort options
 */
export interface AllCollectionDocumentOptions {
    max?: number;
    sort?: CollectionSortOptions;
}

/**
 * The QuickMongo collection
 */
export class Collection<T extends FieldModel<unknown>> {
    /**
     * Create new quickmongo collection instance
     * @param {MongoCollection} collection The MongoDB collection
     * @param {FieldModel} model Field model
     * @example const mongo = await MongoClient.connect("mongodb://127.0.0.1:61582");
     * const mongoCollection = mongo.db("quickmongo").collection("test");
     * const schema = new QuickMongo.Fields.ObjectField({...});
     * const db = new QuickMongo.Collection(collection, schema);
     */
    constructor(public collection: MongoCollection<FieldToDocumentScheme<T>>, public model: T) {}

    /**
     * Get data from the collection
     * @param {string} key The key to retrieve data
     * @param {string} [path] The path to pick from the data
     * @returns {Promise<FieldType|any>}
     */
    async get(key: string): Promise<FieldType<T> | undefined>;
    async get<P = unknown>(key: string, path: string): Promise<P | undefined>;
    async get<P>(key: string, path?: string) {
        const { value } =
            (await this.collection.findOne({
                key: key
            })) || {};

        if (value) {
            this.model.validate(value);

            if (path) {
                if (typeof value !== "object") {
                    throw new Error("Received value must be an 'object'");
                }

                return dots.get<P>(value, path);
            }
        }

        return value || undefined;
    }

    /**
     * Set data to the collection
     * @param {string} key The key to retrieve data
     * @param {FieldType} value The data to save
     * @param {string} [path] The path to save data
     * @returns {Promise<void>}
     */
    async set(key: string, value: FieldType<T>): Promise<void>;
    async set<P = unknown>(key: string, value: P, path: string): Promise<void>;
    async set<P>(key: string, value: FieldType<T> | P, path?: string) {
        const nVal: FieldType<T> = path ? await this.get(key) : <FieldType<T>>value;

        if (path && nVal) {
            if (typeof nVal !== "object") {
                throw new Error("Received value must be an 'object'");
            }

            dots.set(nVal, path, value);
        }

        this.model.validate(nVal);

        await this.collection.updateOne(
            {
                key: key
            },
            {
                $set: {
                    value: nVal
                }
            },
            {
                upsert: true
            }
        );
    }

    /**
     * Delete a data from the collection
     * @param {string} key The key to remove
     * @param {string} [path] The path to remove
     * @returns {Promise<boolean>}
     */
    async delete(key: string): Promise<boolean>;
    async delete(key: string, path: string): Promise<boolean>;
    async delete(key: string, path?: string) {
        let deleted = false;

        if (path) {
            const value = await this.get(key);
            if (value) {
                if (typeof value !== "object") {
                    throw new Error("Received value must be an 'object'");
                }

                dots.set(value, path, null);
                await this.set(key, value);
                deleted = true;
            }
        } else {
            const result = await this.collection.deleteOne({
                key: key
            });
            deleted = result.deletedCount === 1;
        }

        return deleted;
    }

    /**
     * Drops this collection
     * @returns {Promise<boolean>}
     */
    async drop(): Promise<boolean> {
        try {
            return await this.collection.drop();
        } catch {
            return false;
        }
    }

    /**
     * Returns all data from this collection as array
     * @param {AllCollectionDocumentOptions} [options={}] The options
     * @returns {Promise<FieldToDocumentScheme[]>}
     */
    async all(options: AllCollectionDocumentOptions = {}): Promise<FieldToDocumentScheme<T>[]> {
        const data = await this.collection
            .find()
            .limit(options.max || 0)
            .sort(options.sort?.target, options.sort?.by || undefined)
            .toArray();

        return data;
    }
}
