# es-odm

### Some thoughts about data abstraction / Fields

There appears to be more and more problems with proposed data abstraction and it seems like we are trying to reinvent wheel. 

We basically need to achieve three goals:
 1. It must work = no bugs and work with fields (from user perspective) the same (or very similar) as if they don't exist
 2. We must be able to validate = before ES operations check if defined data is correct
 3. It should work with autocompleters
 
 
For goal 1.
 - As we discussed, user is allowed to store into class instance / Field any data he wants, no matter defined structure
   - He can store Object to BooleanField and vice versa, until validated, this will be OK
   - It means all Field types must be able to save any data type
     - For all fields there must be `_value` to store original user specified value, no matter what it is
       - So it basically doesn't matter what the field is, they all work the same
   
 - Next thing is, if user saves Object to class instance and then does some operations/changes with it, these must propagate to instance
   ```
       cons myObject = { a: `b` };
       userInstance.object = myObject;
       myObject.a = `c`;
       // -> userInstance.object.a === c;
   ```
   - The same is for ArrayField
   
   - Good thing is, if user does any change in object, we have access to this information, as we will have this object stored in `_value`
     - But what about defined Fields structure in this NestedField?
     - We would need to set any ?watcher? to this user object and update field structure when Object changes
       - is this even possible? We would need to somehow change Object/Array properties to watch these changes, not sure if doable
       - another solution is mentioned in goal 3 bellow - we could replace Object values by our Fields... but this is kinda weird and would't work for ArrayField
     - Basically, the NestedField and ArrayField (its even worse) can't flexibly react to its Object / Array changes and perform changes in Field structure
       - For ArrayField we don't know number of sub-variables (BTW they may be NestedFields), so we have to store definition info only like schema and create Field instances only when array changes
         - which we don't know anyway
     - But as we allow users to save anything and we don't validate anything at this time, we don't really need to rebuild this structure
         
 - My point is, this structure definition is there because of points 2. (validation) and 3. (autocompleters/jsdoc), point 1. (functionality) doesn't need it
   - It only makes things more difficult
 
To goal 2.
 - As we said, the validation will be done using Joi
   - We don't need structure definition, as we will use Joi object for validating
 - In BE, for custom class, we specify one Joi object and that is
 
And finally goal 3.
 - The proposed solution expects accessing field values using `value` property
   - So user have to write `myInstance.myVariable.value` 
     - Just because of autocompleters!
   - What if user saves value which is not in definition? 
     - We don't know its type, so we need to save it as it is - not in Field 
       - This value doesn't use `value` -> mismatch, source of problems / bugs
       - Otherwise we would have to create another `AnyField` to store unknown values and this is psycho
   - If user does `myInstance.object = myObject;` we would have to intercept `myObject` and replace all values by Fields, because of `.value` consistency
       - Doable but only makes things more complicated / surprising for user, possible bug source
         - Variables specified in structure would be replaced (now will need `.value`, surprise for user), other ones don't... #mindfuck
       - Not sure if doable for arrays...
 - I partially bypassed `value` problem using proxies - `if (Object instanceof Field)`, it returns/sets value directly
   - But this breaks jsdoc, not sure if it can be fixed...
     - So it is not suitable to achieve goal 3.

 
And there are probably another, not mentioned problems.

 
Now to my final point
 - Ultimate goal is to have one definition Object to achieve all three goals
   - In proposed solution we need 2 - our custom definition (for goals 1. and 3.) and Joi validation object for goal 2.
     - But our definition is pointless, because it makes goal 1. very hard / undoable and goal 3. wouldn't probably work either

 - OK, so use KISS principle and get rid of Fields
   - We need Joi object for validations, we can't get rid of this
     - Optimal would be to generate jsdoc from it
       - But this seems impossible

   - So for jsdoc... we have to write it manually
     - Yeah, not the best, better to write code and let it to be generated automatically, but this is the price for JS
     
   - In this solution, we again have 2 definitions - Joi object for goal 2. and jsdoc for goal 3.
     - Goal 1. works as is, no definition required
     - And we have much simpler code (less bugs), which is guaranteed to work as user expects


---

## Current state:

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
