'use strict';

const _ = require(`lodash`);

const { es } = require(`./ElasticSearch`);

const nconf = require(`./config/config`);
const defaultConfiguration = {
    RETRY_ON_CONFLICT: nconf.get(`es:retryOnConflict`)
};

class BulkArray extends Array {
    /**
     * Saves array items to ES
     * @param force {boolean} Skip validations?
     * @returns {Promise<void>}
     */
    async save(force = false) {
        if (this.length <= 0) {
            throw Error(`Array is empty!`);
        }

        const bulkBody = [];
        for (const item of this) {
            if (!_.hasIn(item, `constructor.__fullIndex`) ||
                !_.hasIn(item, `constructor.__esType`) ||
                !_.hasIn(item, `validate`)) {
                throw Error(`Incorrect item type!`);
            }

            bulkBody.push({
                index: {
                    _index: item.constructor.__fullIndex,
                    _type: item.constructor.__esType,
                    _id: item._id
                }
            });

            if (!force) {
                await item.validate();
            }

            const body = _.cloneDeep(item);
            delete body._id;
            delete body._version;

            bulkBody.push(body);
        }

        const result = await es().bulk(bulkBody);

        for (let i = 0; i < result.body.items.length; i++) {
            this[i]._id = result.body.items[i].index._id;
            this[i]._version = result.body.items[i].index._version;
        }

        const results = [];
        for (const res of result.body.items) {
            results.push(res.index.result === `created` || res.index.result === `updated`);
        }
        return results;
    }

    /**
     * Deletes array items from ES
     * @returns {Promise<Array<boolean>>} Boolean for each item, true if deleted
     */
    async delete() {
        if (this.length <= 0) {
            throw Error(`Array is empty!`);
        }

        const bulkBody = [];
        for (const item of this) {
            bulkBody.push({
                delete: {
                    _index: _.get(item, `constructor.__fullIndex`, ``),
                    _type: _.get(item, `constructor.__esType`, ``),
                    _id: _.get(item, `_id`, ``)
                }
            });
        }

        const result = await es().bulk(bulkBody);
        const results = [];
        for (const res of result.body.items) {
            results.push(res.delete.result === `deleted`);
        }
        return results;
    }

    /**
     * Updates array items
     * @param body {Object} ES body
     * @param retryOnConflict {number} Number of retries in case of version conflict
     * @returns {Promise<void>}
     */
    async update(body, retryOnConflict = defaultConfiguration.RETRY_ON_CONFLICT) {
        if (_.isNil(body) || !_.isObject(body)) {
            throw Error(`Body must be an object!`);
        }

        if (this.length <= 0) {
            throw Error(`Array is empty!`);
        }

        const bulkBody = [];
        for (const item of this) {
            if (!_.hasIn(item, `constructor.__fullIndex`) ||
                !_.hasIn(item, `constructor.__esType`) ||
                _.isNil(item._id)) {
                throw Error(`Incorrect item type!`);
            }

            bulkBody.push({
                update: {
                    _index: item.constructor.__fullIndex,
                    _type: item.constructor.__esType,
                    _id: item._id,
                    retry_on_conflict: retryOnConflict
                }
            });

            bulkBody.push(body);
        }
        const result = await es().bulk(bulkBody);

        for (let i = 0; i < result.body.items.length; i++) {
            this[i]._version = result.body.items[i].update._version;
        }

        const results = [];
        for (const res of result.body.items) {
            results.push(res.update.result === `updated`);
        }
        return results;
    }
}

module.exports = BulkArray;
