'use strict';

const Joi = require(`@hapi/joi`);
const _ = require(`lodash`);
const rewire = require(`rewire`);

const es = require(`./ElasticSearch`);

const nconf = require(`./config/config`);
const VALIDATOR_CONFIG = nconf.get(`joi:validatorConfig`);
const INDEX_DELIMITER = nconf.get(`es:indexDelimiter`);

const __schema = Joi.any();
const _index = `*`;
const _type = `*`;

const _tenant = `default`;
const __typeInIndex = false;

class BaseModel {

    /**
     * Creates new instance
     * @param data {Object} Optional object, from which the instance is constructed
     * @param _id {string} Optional id
     */
    constructor(data = {}, _id = void 0) {
        if (_id) {
            this._id = _id;
        }

        for (const [key, value] of Object.entries(data)) {
            this[key] = value;
        }
    }

    /**
     * @returns {Joi}
     */
    static get __schema() {
        return __schema;
    }

    /**
     * @returns {string}
     */
    static get _index() {
        return _index;
    }

    /**
     * @returns {string} Serves as both ES and document type
     */
    static get _type() {
        return _type;
    }

    /**
     * @returns {string}
     */
    static get _tenant() {
        return _tenant;
    }

    /**
     * @returns {boolean} True if type is used as part of the index
     */
    static get __typeInIndex() {
        return __typeInIndex;
    }

    /**
     * @returns {string}
     */
    static get _fullIndex() {
        const fullIndex = `${this._tenant}${INDEX_DELIMITER}${this._index}`;
        if (__typeInIndex) {
            return `${fullIndex}${INDEX_DELIMITER}${this._type}`;
        } else {
            return fullIndex;
        }
    }

    /**
     * Returns ElasticSearch client
     * @private {Client}
     */
    get __es() {
        return es.elasticSearch;
    }


    static async _search(body, from = void 0, size = void 0, scroll = void 0) {
        //TODO
        const results = await es.search(this._fullIndex, this._type, body, from, size, scroll);

        return _.map(results.body.hits.hits, (result) => {
            //todo - set correct type
            return new this(result._source, result._id);
        });
    }

    static async findAll() {
        //TODO
        const body = {
            query: {
                match_all: {}
            }
        };
        const results = await es.search(this._fullIndex, this._type, body);

        return _.map(results.body.hits.hits, (result) => {
            //todo - set correct type
            return new this(result._source, result._id);
        });
    }

    static async get(id) {
        //TODO
        const result = await es.get(this._fullIndex, this._type, id);
        //todo - set correct type
        return new this(result, id);
    }

    static async find(ids) {
        //TODO
        const body = {
            query: {
                ids: {
                    values: ids
                }
            }
        };
        const results = await es.search(this._fullIndex, this._type, body);

        return _.map(results.body.hits.hits, (result) => {
            //todo - set correct type
            return new this(result._source, result._id);
        });
    }

    /**
     * Saves document to database
     * @param force {boolean} If true, skips validations
     * @param clone {boolean} If true AND this instance has specified _id, it creates and return its copy with random _id
     * @returns {Promise<void | BaseModel>} Nothing or new instance when cloning
     */
    async save(force = false, clone = false) {
        let body = {};
        if (force) {
            body = _.cloneDeep(this);
        } else {
            body = await this.validate();
        }

        //ensure ID is not presented in body
        delete body._id;

        if (!clone || !this._id) {
            const result = await es.index(this.constructor._fullIndex, this.constructor._type, body, this._id);
            this._id = result.body._id;
        } else {
            const newObject = await es.index(this.constructor._fullIndex, this.constructor._type, body, void 0);
            return new this.constructor(body, newObject.body._id);
        }
    }

    async reload(clean = false) {
        //TODO
        if (_.isNil(this._id) || !_.isString(this._id) || _.isEmpty(this._id)) {
            throw Error(`Document has not been saved into ES yet.`);
        }

        const result = await es.get(this.constructor._fullIndex, this.constructor._type, this._id);

        if (clean) {
            for (const key of Object.keys(this)) {
                delete this[key];
            }
        }

        for (const [key, value] of Object.entries(result)) {
            this[key] = value;
        }
    }

    async update(force = false) {
        //TODO
        if (_.isNil(this._id) || !_.isString(this._id) || _.isEmpty(this._id)) {
            throw Error(`Document has not been saved into ES yet.`);
        }

        let body = {};
        if (force) {
            body = _.cloneDeep(this);
        } else {
            body = await this.validate();
        }

        //ensure ID is not presented in body
        delete body._id;

        await es.index(this.constructor._fullIndex, this.constructor._type, body, this._id);
    }

    /**
     * Runs joi validation on this instance, returns deep copy of validated object
     * @returns {Promise<*>} Deep copy of validated object
     */
    async validate() {
        const validated = await Joi.validate(this, this.constructor.__schema, VALIDATOR_CONFIG);

        return _.cloneDeep(validated);
    }

    /**
     * Creates class copy with tenant specified
     * @param newTenant {string}
     * @returns {BaseModel}
     */
    static in(newTenant) {
        const copy = rewire(`./BaseModel`);

        copy.__set__(`__schema`, this.__get__(`__schema`));
        copy.__set__(`_index`, this.__get__(`_index`));
        copy.__set__(`_type`, this.__get__(`_type`));

        copy.__set__(`_tenant`, newTenant);
        copy.__set__(`__typeInIndex`, this.__get__(`__typeInIndex`));

        return copy;
    }

    /**
     * Creates class copy with type specified, only for documents
     * @param newType {string}
     * @returns {BaseModel}
     */
    static type(newType) {
        const copy = rewire(`./BaseModel`);

        copy.__set__(`__schema`, this.__get__(`__schema`));
        copy.__set__(`_index`, this.__get__(`_index`));
        copy.__set__(`_type`, newType);

        copy.__set__(`_tenant`, this.__get__(`_tenant`));
        copy.__set__(`__typeInIndex`, true);

        return copy;
    }
}

module.exports = BaseModel;
