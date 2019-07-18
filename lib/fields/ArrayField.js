'use strict';

const _ = require(`lodash`);
const Joi = require(`@hapi/joi`);
const Field = require(`../Field`);

class ArrayField extends Field {
    /**
     * @param data {* | Array<*>}
     * @param content {Object}
     * @param schema {Object}
     */
    constructor(data, content, schema = Joi.array()) {
        if (!_.isObject(content)) {
            throw new Error(`Content must be an object!`);
        }

        super(data, schema, `array`);
        this.__content = content;
    }

    validate() {
        //Two steps
        //1. build complete field tree and call validate on childs -> ensures correct data types
        //2. call validate on user object -> Joi validation

        const myData = this.value;
        const errors = [];
        let isError = false;

        //1st step
        if (!_.isUndefined(myData)) {
            if (_.isArray(myData)) {

                const Field = this.__content.type;
                const myContent = this.__content.content;

                for (let i = 0; i < myData.length; i++) {
                    let field = void 0;
                    if (_.isNil(myContent)) {
                        field = new Field(myData[i]);
                    } else {
                        field = new Field(myData[i], myContent);
                    }

                    try {
                        field.validate();
                    } catch (err) {
                        isError = true;
                        errors.push(err);
                    }
                }
            }
        }

        if (isError) {
            throw Error(errors);
        }

        //2nd step
        try {
            super.validate();
        } catch (err) {
            isError = true;
            errors.push(err);
        }

        if (isError) {
            throw Error(errors);
        }
    }
}

module.exports = ArrayField;
