'use strict';

const Joi = require(`@hapi/joi`);
const _ = require(`lodash`);
const rewire = require(`rewire`);

//PlayGround
const application = function () {
    const MyClass = prepareClass(`user`);

    const MyCustomClass = MyClass.in(`:)`).type(`:(`);
    const myInstance = new MyCustomClass();
};

/**
 * @param index {string}
 * @param schema {*}
 * @param esType {string}
 * @returns {BaseClass}
 */
function prepareClass(index, schema = Joi.any(), esType = `*`) {
    if (_.isNil(index) || !_.isString(index) || _.isEmpty(index)) {
        throw Error(`You have to specify index.`);
    }

    const constructor = rewire(`./lib/BaseModel`);
    constructor.__set__(`_index`, index);
    constructor.__set__(`__schema`, schema);
    constructor.__set__(`_esType`, esType);

    return constructor;
}

module.exports = application();
