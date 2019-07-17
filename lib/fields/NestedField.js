'use strict';

const _ = require(`lodash`);
const Joi = require(`@hapi/joi`);
const Field = require(`../Field`);

class NestedField extends Field {
    /**
     * @param data {Object}
     * @param content {Object}
     * @param schema {Object}
     */
    constructor(data, content, schema = Joi.any()) {
        //TODO (schema - overit typ)
        if (!_.isObject(content)) {
            throw new Error(`Content must be an object!`);
        }

        const myFields = {};

        for (const [key, val] of Object.entries(content)) {
            let myData = void 0;
            if (!_.isNil(data)) {
                myData = data[key];
            }

            let Field = val;
            let newContent = void 0;
            if (_.isObject(Field) && !_.isFunction(Field)) {
                newContent = Field.content;
                Field = Field.type;
            }

            //TODO propagovat Joi validace
            if (_.isUndefined(newContent)) {
                myFields[key] = new Field(myData);
            } else {
                myFields[key] = new Field(myData, newContent);
            }
        }

        super(myFields, schema, `any`);
    }

    /**
     * @param value {Object}
     */
    set value(value) {
        if (_.isNil(value)) {
            return;
        }

        if (!_.isObject(value)) {
            throw new Error(`Value must be an object!`);
        }

        for (const [key, val] of Object.entries(value)) {
            if (val instanceof Field) {
                this[key] = val;
            } else {
                this[key].value = val;
            }
        }
    }

    /**
     * @returns {Object}
     */
    get value() {
        const returnValue = {};
        for (const [key, val] of Object.entries(this)) {
            if (val instanceof Field) {
                returnValue[key] = val.value;
            }
        }

        return returnValue;
    }

    validate() {
        const errors = {};
        let isError = false;

        for (const [key, val] of Object.entries(this)) {
            if (val instanceof Field) {
                try {
                    val.validate();
                } catch (err) {
                    isError = true;
                    errors[key] = err;
                }
            }
        }

        if (isError) {
            throw errors;
        }
    }
}

module.exports = NestedField;
