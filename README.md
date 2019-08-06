# es-odm

### Data type abstraction

 - As discussed, this has been completely discarded
 
 - No Fields, only Joi (and maybe manually written jsdoc)

### ODM

#### Library usage
 - `const { createClass, BulkArray, BaseModel, setClient } = require('odm');`
 - `createClass` function creates new cloned class
   - Each class contains properties
     - `_index`, `_type`, `_tenant`, custom functions, ...
   - Class static methods profits from those properties
     - eg. `static search()` uses them to get index and type
     - You may write your own static function, which will use those properties
       - Or rewrite existing functions
         - Which may influence another functions
       - Or redefine class properties
     - This way we can define model functions specific to each document type
   - Instances have access to those properties / functions
     - `myInstance.constructor.staticProperty`
     - And they use them during ES operations
       - eq. to set correct type, index, ...
   - Whenever we need new / independent class, we must either create new one or clone existing one
 - Additionally library provides `BulkArray`
   - Class inherited from `Array`
   - Contains methods which uses ES Bulk API
 - Exported `BaseModel` should be used mainly for `instanceof` checks
   - Do not create instances from it / change its parameters
 - `setClient` replaces ES client singleton
   - Should be called once at application startup
   - New client is then used even in already created classes


#### Class usage

##### Create new class
 - To create new class, call `createClass(index, ?schema, ?type)`:
   - `index` - absolutely necessary, it must be specified
   - `schema` - may be undefined or Joi object, it is there because of validations
   - `type` - Serves as ES type and document type
     - Specify it for all types, but `documents`!
     - For `documents` do not specify it!
       - It will create class suitable for searching in all documents
       - When working with concrete document type, clone it using `type()`
         - `const specificTypeClass = MyClass.type('newType');`
 
##### Modify / clone existing class
 - Class can be modified / cloned using:
   - `in(tenant)`
     - Returns class clone with tenant changed to given value
   - `type(type)`
     - Returns class clone with type changed to given value
     - Use only for Circularo documents!
       - Use it when working with concrete document type
   - `clone(?changes)`
     - Clones class
     - `changes` is optional object to set cloned class properties
     - This method is internally used by `in()` and `type()`
     - Might be usable on BE when rewriting functions
 
 - Cloning class means:
   - All own properties / functions are copied
     - Deep copy
   - Changes made afterwards to cloned class are NOT transferred to original one
     - and vice versa
       
##### How types work:
 - if type is specified in `createClass(index, schema, type)`, is uses indexes like `<tenant>_<index>`
 - if not, it uses index `<tenant>_<index>_*`
   - only suitable for searching
 - once `.type(type)` is called, it uses indexes like `<tenant>_<index>_<type>`

 
#### Instances
 - Instances are made from prepared class
   - Manually: 
     - You prepare class and then you can call `new MyClass(?data, ?_id, ?_version)`
       - `data` is optional object whose properties are placed to instance
       - `_id` is optional ES _id
       - `_version` is optional ES _version
   - From static functions: 
     - When you call functions like `findAll()`, `search()`, ...
       - Instance is made from class and correct data is loaded from ES
       - When type is not specified (documents generic searches), then for each found entry the class is cloned
          - Correct `_type` is set to each cloned class and instance is made from it
 - Instance contains only ES data (with `_id` and `_version`) and methods to save / reload / validate
   - All ES properties, custom functions, ... are saved in class
   - `_id` and `_version` are not enumerable

#### BulkArray
 - For ES Bulk API, you can use `BulkArray`
 - Class inherited from `Array`
 - All static search functions in BaseModel class returns `BulkArray` of instances instead of `Array`
 - Provides bulk functions:
   - `async save(?force, ?useVersion)`
     - Saves all items to ES
       - Not existing ids are generated and pushed to instances
       - `force = true` skips validations
     - Returns ES response
     - `useVersion` - Sends ES `_version`
     
   - `async delete(?useVersion)`
     - Deletes all items from ES
     - BulkArray and its instances remain intact
     - Returns ES response
     - `useVersion` - Sends ES `_version`
         
   - `async update(body, ?retryOnConflict)`
     - Performs ES update on every item
     - Returns ES response
       
#### Custom functions:
 - They can be defined in class level
 - They have access to class static functions and defined properties 
   - Use like `this.staticFunction()`
 - They are copied to class clones
 ```
  const MyClass = createClass(`myIndex`);
  MyClass.showType = function () {
      return this._type;
  }
  
  const TypeClass = MyClass.type(`myType`);
  
  MyClass.showType();       //returns `*`
  TypeClass.showType();     //returns `myType`
  
  ```
       
       
#### Basic usage example:
  ```
  const { createClass, BulkArray, BaseModel, setClient } = require(`es-odm`);
  
  setClient('http://elasticsearch:9200');
  
  const userIndex = `users`;
  const userType = `user`;
  const userSchema = Joi.object({ name: Joi.string(), ... });
  
  const UserClass = createClass(userIndex, userSchema, userType);
  //Class is prepared, may be instantiated, tenant is `default`
  
  const SouthParkUserClass = UserClass.in(`SouthPark`); //Tenant is `SouthPark`
  const data = {...};
  const userInstance = new SouthParkUserClass(data, `eric`);
  userInstance.name = 'Eric Cartmanez';
  await userInstance.save();
  
  const ZaronUserClass = UserClass.in(`Zaron`); //Tenant is `Zaron`
  ZaronUserClass.getRuler = function() {  //define custom static function
    return `Motortart`;
  }
  ZaronUserClass.prototype.isRuler = function() {  //define custom instance method
    return (this.name === this.constructor.getRuler());
  }
  
  const allUsers = ZaronUserClass.findAll();    //BulkArray
  console.log('Looking for ${ZaronUserClass.getRuler()}!');   //Use custom static function from class
  for (const user of allUsers) {
    user.company = 'Kingdom of Kupa Keep';
    if (user.isRuler()) {                       //Use custom instance method
      user.role = `The Grand Wizard King`;
      user.status = `Jews can't be paladins.`;
    } else {
      console.log('This is not ${user.constructor.getRuler()}!');   //Use custom static function from instance
    }
  }
  await allUsers.save(); //save using bulk
  ```
   
    
#### Functions / Methods

##### Internal
 - `static async __es()`
   - Returns ES singleton
     
 - `static async __fullIndex()`
   - Returns class full index, usable for ES queries
   - It consist of tenant, index and optionally from type
     - Exact rule is described above
     
 - `static async __esType()`
   - Returns ES type

##### Class level API
 - `static async search(body, ?from, ?size)`
   - Performs ES search
   - Returns `BulkArray` of instances
     - For documents, default `*` type is replaced with real one for all returned instances
       - It means you can perform search with generic document class (no type specified) and returned instances have correct instance specified in parental class
   - Used by another static functions
     - Redefining this function will affect their behavior
   - User must specify `body`
     - `tenant`, `index` and `type` are already defined in class
   - `from` and `size` are optional
     - Returns all results if not specified, no how many there are
       - Uses scroll API
   
 - `static async findAll()`
   - Finds all entries in ES matching class `tenant`, `index` and `type`
   - Uses `this.search()`
     - Returns `BulkArray`
     
 - `static async find(ids)`
   - Performs ES 'search' query
   - If 'ids' is strings, returns single instance
   - Else if 'ids' is array of strings, returns `BulkArray` of instances
   - Uses `this.search()`
   
 - `static async get(ids)`
   - Performs ES 'get'
   - Class must have specified `type`
     - Can't be used for general document's findings
   - If 'ids' is strings, returns single instance
   - Else if 'ids' is array of strings, returns `BulkArray` of instances
   
 - `static async delete(ids)`
   - Performs ES 'delete'
   - Uses bulk API
   - Class must have specified `type`
   - Returns ES response
   
 - `static async exists(ids)`
   - Performs ES 'exists'
   - Class must have specified `type`
   - If 'ids' is strings, returns single boolean
   - Else if 'ids' is array of strings, returns array of booleans
     - true if exists, else otherwise
   
 - `static async update(ids, body, ?retryOnConflict)`
   - Performs ES 'update'
   - Uses bulk API
   - Class must have specified `type`
   - Returns ES response
 
 - `static async updateByQuery(body)`
   - Performs ES 'update_by_query'
   - Returns ES response
 
 - `static async deleteByQuery(body)`
   - Performs ES 'delete_by_query'
   - Returns ES response
   
##### Instance level API
 - `async save(?force, ?useVersion)`
   - saves or re-saves instance
   - it uses specified `_id` or generates new one if not specified
     - it uses ES 'index' function
   - `force` - disables validation
   - `useVersion` - Sends ES `_version`
   
 - `async reload()`
   - reloads instance data from ES
     - all user specified data are discarded
   - `_id` must be specified and entry must exists in ES
     
 - `async delete()`
   - Deletes instance from ES
   - Instance properties remain intact
   - `_id` must be specified and entry must exists in ES
     
 - `clone(?_id)`
   - Returns clone of current instance
     - Deep copy
   - Clone instance is created from parental class
     - Class properties are shared (influences are possible)
   - `_id` and `_version` properties are not cloned
     - New `_id` can be set via parameter or manually
     
 - `async validate()`
   - Validates instance using Joi
   - Throws in case of error / incorrect data
     
##### Class copy
 - `static clone(?changes)`
   - Creates class copy
   - `changes` is optional object with properties to set
 
 - `static in(newTenant)`
   - Clones class using `clone()`
   - Sets given tenant
 
 - `static type(newType)`
   - Clones class using `clone()`
   - Sets given type
 
#### ElasticSearch instance
 - singleton, implemented in separated module
 