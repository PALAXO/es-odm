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
        this.value = data;
    }

    set value(value) {
        if (_.isUndefined(this.__content)) {
            return;
        }

        if (_.isNil(value)) {
            value = [];
        } else {
            value = _.castArray(value);
        }

        const myArray = [];

        const Field = this.__content.type;
        const myContent = this.__content;
        for (const myData of value) {
            //TODO propagovat schema
            if (_.isUndefined(this.__)) {
                myArray.push(new Field(myData));
            } else {
                myArray.push(new Field(myData, myContent));
            }
        }

        super.value = myArray;
    }

    get value() {
        const that = this;
        const myArray = [];
        for (const myData of super.value) {
            myArray.push(myData);
        }

        const handler = {
            get: function (target, name) {
                if (target[name] instanceof Field) {
                    return target[name].value;
                } else {
                    return Reflect.get(...arguments);
                }
            },
            set: function (target, name, value) {
                if (target[name] instanceof Field) {

                    //TODO -> check field[1000] = `:)`
                    const actualValues = that.__value;
                    actualValues[name] = value;

                    that.value = actualValues;

                    return true;
                } else {
                    return Reflect.set(...arguments);
                }
            }
        };
        const myProxy = new Proxy(myArray, handler);

        return myProxy;
    }

    validate() {
        //TODO overovat array schema
        const errors = [];
        let isError = false;

        for (const val of this.value) {
            try {
                val.validate();
            } catch (err) {
                isError = true;
                errors.push(err);
            }
        }

        if (isError) {
            throw errors;
        }
    }
}

module.exports = ArrayField;
