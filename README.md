# es-odm

### Data type abstraction

 - As discussed, this has been completely discarded
 
 - No Fields, only Joi (and maybe manually written jsdoc)

### ODM

#### Basic logic
 - Library creates / clones classes
   - Each class may contain properties
     - `_index`, `_type`, `_tenant`, custom functions, ...
   - Class static methods profits from those properties
     - eg. `static search()` uses them to get index and type
     - You may write your own static function, which will use those properties
       - Or rewrite existing functions
         - Which may influence another functions
       - Or redefine class properties
     - This way we can define model functions specific to each type
 - Instance has access to those properties / functions
   - `myInstance.constructor.staticProperty`
   - And it uses them during ES operations
     - eq. to get correct type, index, ...
 - Whenever we need new / independent class, we must either create new one or clone existing one
 - Library provides `BulkArray`
   - Class inherited from `Array`
   - Contains methods which uses ES Bulk API
     
#### Create new class
 - To create new class, call `createClass(index, ?schema, ?type)`:
   - `index` - absolutely necessary, it must be specified
   - `schema` - may be undefined or Joi object, it is there because of validations
   - `type` - Serves as ES type and document type
     - Specify it for all types, but `documents`!
     - For `documents` do not specify it!
       - It will create class suitable for searching in all documents
       - When working with concrete document type, clone it using `type()`
         - `const specificTypeClass = MyClass.type('newType');`
 
#### Clone existing class
 - Class can be cloned using:
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
       
#### Instances
 - Instances are made from prepared class
   - Manually
     - You prepare class and then you can call `new MyClass(?data, ?_id)`
       - `data` is optional object whose properties are copied to instance
       - `_id` is optional ES _id
   - From static functions
     - When you call functions like `findAll`, `search()`, ...
       - Instance is made from class and correct data is loaded from ES
       - When type is not specified (documents generic searches), then for each found entry the class is cloned
          - Correct `_type` is set to each cloned class and instance is made from it
 - Instance contains only ES data (with `_id`) and methods to save / reload / validate
   - `_id` is not enumerable
        
#### How types work:
 - if type is specified in `createClass(index, schema, type)`, is uses indexes like `<tenant>_<index>`
 - if not, it uses index `<tenant>_<index>_*`
   - only suitable for searching
 - once `.type(type)` is called, it uses indexes like `<tenant>_<index>_<type>`

#### BulkArray
 - For ES Bulk API, you can use `BulkArray`
 - Class inherited from `Array`
 - All static search functions in BaseModel class returns `BulkArray` of instances instead of `Array`
 - Provides save / delete functions:
   - `async save(force)`
     - Saves all items to ES
       - Item must have all necessary functions (`__fullIndex()`, `__esType()`, `validate()`), otherwise is skipped
       - Not existing ids are generated and pushed to instances
     - Returns ES response
     
   - `async delete()`
     - Deletes all items from ES
     - Instances remain intact
     - Returns array with booleans
       - One boolean for each item
         - True if item deleted
       
#### Custom functions:
 - They can be defined in class level
 - They have access to class static functions and defined properties 
   - Use `this.staticFunction()`
 - They are copied to class clones
 ```
  const MyClass = createClass(`myIndex`);
  MyClass.showType = function () {
      return this._type;
  }
  
  const TypeClass = MyClass.type(`myType`);
  
  MyClass.showType;       //returns `*`
  TypeClass.showType;     //returns `myType`
  
  ```
       
       
#### Usage example:
  ```
  const { createClass, BulkArray } = require(`es-odm`);
  
  const index = `users`;
  const userSchema = Joi.any(...);
  
  const UserClass = createClass(index, userSchema);
  //Class is prepared, may be instantiated, tenant is `default`
  
  const MyTenantUserClass = UserClass.in(`myTenant`);
  //Tenant is `myTenant`
  
  const data = {...};
  const userInstance = new MyTenantUserClass(data, `myId`);
  userInstance.myProperty = 5;
  
  await userInstance.save();
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

##### Class ES API
 - `static async search(body, ?from, ?size, ?scroll)`
   - Performs ES search
   - Returns _BulkArray_ of instance
     - For documents, default `*` type is replaced with real one for all returned instances
   - Used by another static functions
     - Redefining this function will affect their behavior
   - User must specify `body`
     - `tenant`, `index` and `type` are already defined in class
   - `from` and `size` is defined in configuration, requests max range by default
   - supports scroll /NOT TESTED/
   
 - `static async findAll()`
   - Finds all entries in ES matching class `tenant`, `index` and `type`
   - Uses `this.search()`
     - Returns _BulkArray_
   
 - `static async get(ids)`
   - Performs ES 'get'
   - Class must have specified `type`
     - can't be used for general document's findings
   - If 'ids' is strings, returns single instance
   - Else if 'ids' is array of strings, returns `BulkArray` of instances
   
 - `static async find(ids)`
   - Performs ES 'search' query
   - May be used even without `type` specified
   - If 'ids' is strings, returns single instance
   - Else if 'ids' is array of strings, returns `BulkArray` of instances
   - Uses `this.search()`
   
 - `static async delete(ids)`
   - Performs ES 'delete'
   - Uses bulk API
   - Class must have specified `type`
   - If 'ids' is strings, returns single boolean
     - true if deleted, else otherwise
   - Else if 'ids' is array of strings, returns array of booleans
   
 - `static async exists(ids)`
   - Performs ES 'exists'
   - Class must have specified `type`
   - If 'ids' is strings, returns single boolean
     - true if exists, else otherwise
   - Else if 'ids' is array of strings, returns array of booleans
   
##### Instance ES API
 - `async save(?force)`
   - saves or re-saves instance
   - it uses specified `_id` or generates new one if not specified
     - it uses ES `index()` function
   - `force` - disables validation
   
 - `async reload()`
   - reloads instance data from ES
     - all user specified data are discarded
   - `_id` must be specified and entry must exist in ES
     
 - `async validate()`
   - Validates instance
     - if OK, returns validated object (deep copy)
     - otherwise throws an error
     
 - `async delete()`
   - Deletes instance from ES
   - Instance properties remain intact
   - Throws error if instance is not saved in ES
     
 - `clone(?_id)`
   - Returns clone of current instance
     - Deep copy
   - Clone is created from the same class
     - Class properties are shared (influences are possible)
   - Original `_id` is deleted
     - New one can be set via parameter or manually

##### Class copy
 - `static clone(?changes)`
 - `static in(newTenant)`
 - `static type(newType)`
 
#### ElasticSearch instance
 - singleton, implemented in separated module