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
const _esType = `*`;

const _tenant = `default`;
const _type = ``;

class BaseModel {
    /*
     * TODO
     * This is very first version, just to make it work, somehow
     */

    constructor(data = {}, _id = void 0) {
        this._id = _id;

        for (const [key, value] of Object.entries(data)) {
            this[key] = value;
        }
    }

    static get __schema() {
        return __schema;
    }

    static get _index() {
        return _index;
    }

    static get _esType() {
        if (_.isNil(_type) || _.isEmpty(_type)) {
            return _esType;
        } else {
            return _type;
        }
    }


    static get _tenant() {
        return _tenant;
    }

    static get _type() {
        return _type;
    }


    static get _fullIndex() {
        const fullIndex = `${this._tenant}${INDEX_DELIMITER}${this._index}`;
        if (_.isNil(this._type) || _.isEmpty(this._type)) {
            return fullIndex;
        } else {
            return `${fullIndex}${INDEX_DELIMITER}${this._type}`;
        }
    }

    get __es() {
        return es.elasticSearch;
    }


    static async _search(body, from = void 0, size = void 0, scroll = void 0) {
        const results = await es.search(this._fullIndex, this._esType, body, from, size, scroll); //TODO maybe always use * as type?

        return _.map(results.hits.hits, (result) => {
            new this.constructor(result._source, result._id);
        });
    }

    static async findAll() {
        const body = {
            query: {
                match_all: {}
            }
        };
        const results = await es.search(this._fullIndex, this._esType, body);

        return _.map(results.hits.hits, (result) => {
            new this.constructor(result._source, result._id);
        });
    }

    static async get(id) {
        const result = await es.get(this._fullIndex, this._esType, id);
        return new this.constructor(result, id);
    }

    static async find(ids) {
        const results = await es.search(this._fullIndex, this._esType, ids);

        return _.map(results.hits.hits, (result) => {
            new this.constructor(result._source, result._id);
        });
    }

    async save(force = false, clone = false) {
        let properties;
        if (!force) {
            properties = this.validate();
        } else {
            for (const [key, value] of Object.entries(this)) {
                properties[key] = value;
            }
        }

        if (clone) {
            delete properties._id;
        }

        //TODO save
        //return new instance if(clone)
    }

    async reload() {
        if (_.isNil(this._id) || !_.isString(this._id) || _.isEmpty(this._id)) {
            throw Error(`Document has not been saved into ES yet.`);
        }
        const result = await es.get(this.constructor._fullIndex, this.constructor._esType, this._id);

        for (const [key, value] of Object.entries(result)) {
            this[key] = value;
        }
        //TODO - delete custom properties???
    }

    async update(force = false) {
        //TODO
    }



    validate() {
        const properties = {};
        for (const [key, value] of Object.entries(this)) {
            properties[key] = value;
        }

        //TODO steal code from BE

        return Joi.validate(properties, this.constructor.__schema, VALIDATOR_CONFIG);
    }

    static in(newTenant) {
        const copy = rewire(`./BaseModel`);

        copy.__set__(`__schema`, this.__get__(`__schema`));
        copy.__set__(`_index`, this.__get__(`_index`));
        copy.__set__(`_esType`, this.__get__(`_esType`));

        copy.__set__(`_type`, this.__get__(`_type`));
        copy.__set__(`_tenant`, newTenant);

        return copy;
    }

    static type(newType) {
        const copy = rewire(`./BaseModel`);

        copy.__set__(`__schema`, this.__get__(`__schema`));
        copy.__set__(`_index`, this.__get__(`_index`));
        copy.__set__(`_esType`, this.__get__(`_esType`));

        copy.__set__(`_tenant`, this.__get__(`_tenant`));
        copy.__set__(`_type`, newType);

        return copy;
    }
}

module.exports = BaseModel;
