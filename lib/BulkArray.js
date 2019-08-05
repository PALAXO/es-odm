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
     * @param force         {boolean}           Skip validations?
     * @param useVersion    {boolean}           Sends versions to ES
     * @returns             {Promise<Object>}   ES response
     */
    async save(force = false, useVersion = false) {
        if (this.length <= 0) {
            throw Error(`Array is empty!`);
        }

        const bulkBody = [];
        for (let i = 0; i < this.length; i++) {
            const item = this[i];
            //Can't use instanceof because of circular
            if (!_.hasIn(item, `constructor.__fullIndex`) ||
                !_.isString(item.constructor.__fullIndex) ||
                !_.hasIn(item, `constructor.__esType`) ||
                !_.isString(item.constructor.__esType) ||
                !_.hasIn(item, `validate`) ||
                !_.isFunction(item.validate)) {
                throw Error(`Incorrect item type at index ${i}!`);
            }

            if (!force) {
                await item.validate();
            }

            bulkBody.push({
                index: {
                    _index: item.constructor.__fullIndex,
                    _type: item.constructor.__esType,
                    _id: item._id,
                    _version: (useVersion) ? item._version : void 0
                }
            });
            bulkBody.push(item);
        }

        const result = await es().bulk(bulkBody);

        for (let i = 0; i < result.body.items.length; i++) {
            this[i]._id = result.body.items[i].index._id;
            this[i]._version = result.body.items[i].index._version;
        }

        return result.body;
    }

    /**
     * Deletes array items from ES
     * @param useVersion    {boolean}           Sends versions to ES
     * @returns             {Promise<Object>}   ES response
     */
    async delete(useVersion = false) {
        if (this.length <= 0) {
            throw Error(`Array is empty!`);
        }

        const bulkBody = [];
        for (let i = 0; i < this.length; i++) {
            const item = this[i];
            bulkBody.push({
                delete: {
                    _index: _.get(item, `constructor.__fullIndex`, ``),
                    _type: _.get(item, `constructor.__esType`, ``),
                    _id: _.get(item, `_id`, ``),
                    _version: (useVersion) ? item._version : void 0
                }
            });
        }

        const result = await es().bulk(bulkBody);
        return result.body;
    }

    /**
     * Updates array items
     * @param body              {Object}            ES body
     * @param retryOnConflict   {number}            Number of retries in case of version conflict
     * @returns                 {Promise<Object>}   ES response
     */
    async update(body, retryOnConflict = defaultConfiguration.RETRY_ON_CONFLICT) {
        if (_.isNil(body) || !_.isObject(body)) {
            throw Error(`Body must be an object!`);
        }

        if (this.length <= 0) {
            throw Error(`Array is empty!`);
        }

        const bulkBody = [];
        for (let i = 0; i < this.length; i++) {
            const item = this[i];
            //Can't use instanceof because of circular
            if (!_.hasIn(item, `constructor.__fullIndex`) ||
                !_.isString(item.constructor.__fullIndex) ||
                !_.hasIn(item, `constructor.__esType`) ||
                !_.isString(item.constructor.__esType) ||
                _.isNil(item._id) ||
                !_.isString(item._id)) {
                throw Error(`Incorrect item type at index ${i}!`);
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

        return result.body;
    }
}

module.exports = BulkArray;
