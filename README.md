# es-odm

- Some notes, might change...

### Fields

 - Not validated until explicitly requested, eq. call `user.validate()`, save to ES, ...
   - possible to save eq. Object to BooleanField, OK until it's validated
 
 - In fact, they serve only for validation, otherwise plain Object structure could be used

 - Two types of fields:
   - Primitive - for 'primitive'-like variables: boolean, string, number, date...
     - They should not contain any sub-variables
   - Special - for 'object'-like variables = nested and array
     - They should contain sub-variables
     
 - Both types store variable as is, no matter the type
   - The only real difference is the special fields know its sub-variables structure
     - this structure is created only for validation
       - rest of the time the value is just user specified Object
       - the only way (or the easiest way) to ensure Object/Array changes are propagated to instance (and vice versa)
       ```
       cons myObject = { a: `b` };
       userInstance.object = myObject;
       myObject.a = `c`;
       // -> userInstance.object.a === c;
       ```
       - After some ES operations (and maybe after some validations???), this connection will be lost


#### Usage 

 - Specify fields in inherited class constructor
 ```
 class MyClass extends BaseModel {
    constructor(data = {}) {
        super();
        this.name = new StringField(...);
        this.age = new NumberField(...);
    }
 }
 ```

##### Primitive fields

 - NumberField, StringField, BooleanField, ...
 
 - Use like `new Field(data, ?joi)`
   - eq. `new NumberField(data.number, Joi.number(...) );`
 
##### Special fields

 - requires content Object
   - Use like `new Field(data, content, ?joi);`
 
 
 - ArrayField
   - `new ArrayField(data.array, { type: StringField }, Joi.array(...) );`
   - `new ArrayField(data.array, { type: NestedField, content: {...} }, Joi.array(...) );`
   - content requires parameters:
     - `type` - type of Field in array, eq. NumberField
     - `content` - only when `type` is one of special types -> its content
 
 
 - NestedField
   - `new NestedField(data.object, { a: BooleanField, b: NumberField }, Joi.any(...) )`
   - `new NestedField(data.object, { c: { type: NestedField, content: {...} } }, Joi.any(...) )`
   - content requires object structure
     - For special fields you have to specify its content
 
 
##### Nesting

```
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
}, Joi.any(...) );
```
 
 
### BaseModel
