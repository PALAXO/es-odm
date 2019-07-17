'use strict';

const BaseModel = require(`./lib/BaseModel`);
const StringField = require(`./lib/fields/StringField`);
const BooleanField = require(`./lib/fields/BooleanField`);
const NumberField = require(`./lib/fields/NumberField`);
const NestedField = require(`./lib/fields/NestedField`);
const ArrayField = require(`./lib/fields/ArrayField`);

//PlayGround
class User extends BaseModel {
    constructor(data = {}) {
        super();

        this.name = new StringField(data.name);

        this.configuration = new NestedField(
            data.configuration,
            {
                x: BooleanField,
                y: NumberField,
                undef: StringField
            }
        );

        this.object = new NestedField(data.object, {
            name: StringField,
            id: NumberField,
            phones: {
                type: ArrayField, content: {
                    type: NestedField, content: {
                        mobile: BooleanField,
                        number: StringField
                    }
                }
            },
            preferences: {
                type: NestedField, content: {
                    language: StringField,
                    flags: {
                        type: ArrayField, content: {
                            type: BooleanField
                        }
                    }
                }
            }
        });
    }
}

const application = function () {
    //TODO ↓↓↓

    //intercept ArrayField returned array -> changes backpropagated
    //array.pop() not working

    //rewrite [util.inspect.custom](depth, opts) { } for BaseModel, NestedField and ArrayField

    //Simplify it

    //Joi - validations not working

    //use ES6
    // - new library + ES6 -> don't send any type
    // - type() same as in()
    //
    // - _id -> StringField in base class - undefined by default

    const user = new User({
        name: `unman`,
        configuration: { x: true, y: 5 },
        object: {
            preferences: {
                flags: [true, false, false, true]
            }
        }
    });

    console.log(user);

    //console.log(user.configuration.x);
    //console.log(user.object.preferences.flags);
    //console.log(user.object.preferences.flags[0]);
    //console.log(user.object.preferences.flags[1]);
    //console.log(user.object.preferences.flags[2]);
    //console.log(user.object.preferences.flags[3]);

    /*
    try {
        user.validate();
    } catch (e) {
        console.log(e);
    }
    */
};

module.exports = application();
