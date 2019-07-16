'use strict';

const BaseModel = require(`./lib/BaseModel`);
const StringField = require(`./lib/fields/StringField`);
const BooleanField = require(`./lib/fields/BooleanField`);
const NumberField = require(`./lib/fields/NumberField`);
const NestedField = require(`./lib/fields/NestedField`);

//PlayGround
class User extends BaseModel {
    constructor(data = {}) {
        super();

        this.name = new StringField({ required: true }, data.name);

        this.configuration = new NestedField({
            x: new BooleanField(),
            y: new NumberField(),
            undef: new StringField({ required: true })
        }, data.configuration);
    }
}

const application = function () {
    //??? validace - co, chyba vs false
    //??? array ve Field
    //??? zmena ve Field jen pres .value?
    //??? ma undefined StringField vracet undefined nebo ''?
    //??? field nezna sve jmeno, je to OK? (treba pri vyhozeni chyby)

    const user = new User({
        name: `unman`,
        configuration: { x: true, y: 5 }
    });

    console.log(user.name); //StringField {}
    console.log(user.name.value);   //unman

    console.log(user.configuration);    //NestedField {}
    console.log(user.configuration.value);  //{ x: true, y: 5, undef: undefined }

    console.log(user.configuration.x);  //BooleanField {}
    console.log(user.configuration.x.value);    //true

    try {
        user.configuration.validate();
    } catch (e) {
        console.log(e.toString());  //Value is required!
    }
};

module.exports = application();
