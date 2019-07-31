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
     * @returns {Promise<Array<Object>>} ES response
     */
    async save(force = false) {
        if (this.length <= 0) {
            throw Error(`Array is empty!`);
        }

        const items = [];
        const bulkBody = [];
        for (const item of this) {
            if (!_.hasIn(item, `constructor.__fullIndex`) ||
                !_.hasIn(item, `constructor.__esType`) ||
                !_.hasIn(item, `validate`)) {
                throw Error(`Incorrect item type!`);
            }

            items.push(item);
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
            items[i]._id = result.body.items[i].index._id;
            items[i]._version = result.body.items[i].index._version;
        }
        return result.body.items;
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
     * @returns {Promise<Array<Object>>} ES response
     */
    async update(body, retryOnConflict = defaultConfiguration.RETRY_ON_CONFLICT) {
        if (this.length <= 0) {
            throw Error(`Array is empty!`);
        }

        const items = [];
        const bulkBody = [];
        for (const item of this) {
            if (!_.hasIn(item, `constructor.__fullIndex`) ||
                !_.hasIn(item, `constructor.__esType`) ||
                _.isNil(item._id)) {
                throw Error(`Incorrect item type!`);
            }

            items.push(item);
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
            items[i]._version = result.body.items[i].index._version;
        }
        return result.body.items;
    }
}

module.exports = BulkArray;
