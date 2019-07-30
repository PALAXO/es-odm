'use strict';

const _ = require(`lodash`);

const es = require(`./ElasticSearch`);

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
                continue;
            }

            items.push(item);
            bulkBody.push({
                index: {
                    _index: _.get(item, `constructor.__fullIndex`, ``),
                    _type: _.get(item, `constructor.__esType`, ``),
                    _id: _.get(item, `_id`, void 0)
                }
            });

            let body = {};
            if (force) {
                body = _.cloneDeep(item);
            } else {
                body = await item.validate();
            }
            delete body._id;

            bulkBody.push(body);
        }

        if (bulkBody.length <= 0) {
            throw Error(`No items to send!`);
        }

        const result = await es.bulk(bulkBody, true);

        for (let i = 0; i < result.body.items.length; i++) {
            items[i]._id = result.body.items[i].index._id;
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

        const result = await es.bulk(bulkBody, true);
        const results = [];
        for (const res of result.body.items) {
            results.push((res.delete.result === `deleted`) ? true : false);
        }
        return results;
    }
}

module.exports = BulkArray;
