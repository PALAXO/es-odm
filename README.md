# ElasticSearch 7 Node.js ODM library

## Basic information
 
 - Maps ES documents and functions to JS classes
 
 - Index can be created from up to three parts:
   - tenant (AKA prefix) - optional, defaults to `*`
   - base index - required, must be specified
   - index type (AKA suffinx) - optional, defaults to `` (empty)
 - You can dismiss part of the index by setting it to empty string
 - Index parts are divided by lodash:
   - `test_index_type`
 
 - Base index is specified when model is created - `createClass('myIndex')`
 - Tenant can be specified using `createClass('myIndex', void 0, void 0, 'myTenant')` 
   - or later by using `.in('myTenant')`
 - Index type can be specified using `createClass('myIndex', void 0, 'myType')` 
   - or later by using `.type('myType')`
 - example:
   - `createClass('myIndex').in('default').type('myType')` -> `default_myIndex_myType`
   - `createClass('myIndex')` -> `*_myIndex`
   - `createClass('myIndex').in('tenant')` -> `tenant_myIndex`
   
 - When creating new instance (or performing most of the operations), the index can't contain any wildcard
   - it means you must specify the tenant 
     - If you don't want to use it, use `createClass('myIndex', void 0, void 0, '')` -> `myIndex`

#### Usage
 - `const { createClass, BulkArray, BaseModel, setClient } = require('odm');`
 - `createClass` function creates new class
   - Each class contains several properties
     - `_name`, `_type`, `_tenant`, `__schema`, `__fullAlias`
   - Class static functions profit from those properties
     - eg. `static search()` uses them to get index
     - You may write your own static function, which will use those properties
       - Or rewrite existing functions
         - Which may influence another functions
       - Or redefine class properties
     - This way we can define model functions specific to each document type
   - Instances have access to those properties / functions
     - `myInstance.constructor.__fullAlias`
     - And they use them during ES operations
       - eq. to set correct index, validate data, ...
   - Whenever we need new / independent class, we must either create new one or clone existing one
 - Additionally, library provides `BulkArray`
   - Class inherited from `Array`
   - Contains methods which uses ES Bulk API
     - `save`, `delete` and `reload`
 - Exported `BaseModel` should be used mainly for `instanceof` checks
   - Do not create instances from it / do not change its parameters
 - `setClient` replaces ES client singleton
   - Should be called once at application startup
   - New client is then used - even in already created classes


#### Class usage

##### Create new class
 - To create new class, call `createClass(index, ?schema, ?indexType, ?tenant)`:
   - `index` - essential, it must be specified
   - `schema` - may be undefined or Joi object, it is there because of validations
   - `indexType` - Serves as part of the index (suffix)
     - By default, it is not used (empty string, doesn't appear in full index)
       - You can rewrite it later by using `.type('newType')`
         - It will create inherited class
         - `const SpecificTypeClass = MyClass.type('newType');`
       - You can use index type `*` to search in multiple indices
         - Found records will have correctly set index type
   - `tenant` - Serves as part of the index (prefix)
     - By default, it is `*`
       - You can rewrite it later by using `.in('newTenant')`
         - It will create inherited class
         - `const SpecificTenantClass = MyClass.in('newTenant');`
       - You must specify it before creating new instance
       - When searching for records, found records will have correctly set tenant
 
##### Modify / clone existing class
 - Class can be modified / cloned using:
   - `in(tenant)`
     - Returns class clone with tenant changed to given value
   - `type(type)`
     - Returns class clone with index type changed to given value
   - `clone(?changes)`
     - Clones class
     - `changes` is optional object to set cloned class properties
     - This method is internally used by `in()` and `type()`
     - You should not need to use it
 
 - Cloning class means:
   - New inherited class is created
   - Changes made afterwards to cloned class are NOT transferred to original one
 
#### Instances
 - Instances are made from prepared class
   - Manually: 
     - You prepare class and then you can call `new MyClass(?data, ?_id, ?_version, ?_highlight, ?_primary_term, ?_seq_no)`
       - `data` is optional object whose properties are placed to instance
       - `_id` is optional ES _id
       - `_version` is optional ES _version
       - `_highlight` is optional ES _highlight
       - `_primary_term` is optional ES _primary_term
       - `_seq_no` is optional ES _seq_no
   - From static functions: 
     - When you call functions like `findAll()`, `search()`, ...
       - Instance is made from class and correct data is loaded from ES
 - Instance contains only ES data (with `_id`, `_version`, `_highlight`, `_primary_term` and `_seq_no`) and methods to save / reload / validate / ...
   - All ES properties, search functions, ... are saved in class
 - NOTE: `_id`, `_version`, `_highlight`, `_primary_term` and `_seq_no` are not enumerable

#### BulkArray
 - For ES Bulk API, you can use `BulkArray`
 - Class inherited from `Array`
 - All static search functions in BaseModel class returns `BulkArray` of instances instead of `Array`
 - Provides bulk functions:
   - `async save(?useVersion)`
     - Saves all items to ES
       - Not existing ids are generated and pushed to instances
     - Returns ES response
     - `useVersion` - Checks if version match
       - uses sequence numbers internally, if not presented, it will fetch them and checks version automatically
     
   - `async delete(?useVersion)`
     - Deletes all items from ES
     - Returns ES response
     - `useVersion` - Checks if version match
                          - uses sequence numbers internally, if not presented, it will fetch them and checks version automatically
         
#### Examples:
  ```
  class Counter extends createClass('counter', Joi.object()) {
    async customFunction() {
        return 666;
    }
    
    static customStatic() {
        return new this({ a: 4 }, `myId`);
    }
    
    static async search(...args) {
        // Rewritting static function -> affects search, find and findAll
        const results = await super.search(...args);
        if (results.length <= 0) {
            throw Error(`Nothing`);
        } else {
            return results;
        }
    }
  }

  ...

  const MyCounter = Counter.in('default'); //Index is 'default_counter'

  const allCounters = await MyCounter.findAll();    //BulkArray with all counters in index
  await allCounters.delete();   //Everything deleted from ES

  const instanceCounter = new MyCounter({ counter: 15 }, 'myId');   //Prepared new instance
  await instanceCounter.save(); //New instance saved

  ```
   
    
#### Functions / Methods

##### Internal getters
 - `static get __fullAlias()`
   - Returns class full alias, usable for ES queries
   - It consists of tenant, base index and index type

##### Class level API
 - `static async search(body, ?from, ?size, ?source)`
   - Performs ES search
   - Returns `BulkArray` of instances
   - Used by another static functions
     - Redefining this function will affect their behavior
   - User must specify `body`
     - `tenant`, `index` and `indexType` are already defined in class
   - `from` and `size` are optional
     - Returns all results if `from` / `size` are not specified, no matter how many there are
       - Uses scroll API
   - `source` can be used to return plain object with only required source fields
   
 - `static async findAll()`
   - Finds all entries in ES, matching class `tenant`, `index` and `indexType`
   - Uses `this.search()`
     - Returns `BulkArray`
     
 - `static async find(ids)`
   - Performs ES 'search' query
   - Always returns `BulkArray` of instances
   - Uses `this.search()`
   
 - `static async get(ids)`
   - Performs ES 'get'
   - If 'ids' is strings, returns single instance
   - Else if 'ids' is an array of strings, returns `BulkArray` of instances
   
 - `static async delete(ids, ?version)`
   - Performs ES 'delete'
   - Uses bulk API
   - Class must have specified `type`
   - Returns ES response
   - If `version` is specified, only one id is allowed
   
 - `static async exists(ids)`
   - Performs ES 'exists'
   - If 'ids' is strings, returns single boolean
   - Else if 'ids' is array of strings, returns array of booleans
     - true if exists, else otherwise
   
 - `static async update(ids, body)`
   - Performs ES 'update'
   - Uses bulk API
   - Returns ES response
 
 - `static async count(?body)`
   - Performs ES 'count'
   - Returns number
   
 - `static async updateByQuery(body)`
   - Performs ES 'update_by_query'
   - Returns ES response
 
 - `static async deleteByQuery(body)`
   - Performs ES 'delete_by_query'
   - Returns ES response

##### Indices API
 - `static async createIndex(?body)`
   - Creates index given by current class
   - `body` is optional settings
   
 - `static async indexExists()`
   - Checks index existence
   - Returns boolean
   
 - `static async deleteIndex()`
   - Deletes index given by current class
   
 - `static async getMapping()`
   - Gets mapping of index given by current class
   
 - `static async putMapping(mapping)`
   - Puts mapping to index given by current class
   
 - `static async reindex(destinationModel)`
   - Reindex from current model class to selected one
   
##### Instance level API
 - `async save(?useVersion)`
   - saves or re-saves instance
   - it uses specified `_id` or generates new one if not specified
     - it uses ES 'index' function
   - `useVersion` - checks if version matches, `_id` and `_version` must be specified
     - sequence number will be fetched automatically in not presented
     
 - `async reload()`
   - Reloads instance data from ES
   - Uses `get` and `new this.constructor()` internally
     
 - `async delete(?useVersion)`
   - Deletes an instance from ES
   - `_id` must be specified and entry must exist in ES
   - `useVersion` - checks if version matches, `_version` must be specified
     - sequence number will be fetched automatically in not presented
     
 - `clone(?_preserveAttributes)`
   - Returns clone of current instance
     - Deep copy
   - Cloned instance is created from the same class
   - `preserveAttributes` (defaults true) can be used to preserve attributes (`_id`, `_version`, ...)
     
 - `async validate()`
   - Validates instance using Joi
   - Throws in case of error / incorrect data
     
##### Class copy
 - `static clone(?changes)`
   - Creates class copy
   - In fact, it creates new class which inherits from the current one
   - `changes` is an optional object with properties to be set
 
 - `static in(newTenant)`
   - Clones class using `clone()`
   - Sets given tenant
 
 - `static type(newType)`
   - Clones class using `clone()`
   - Sets given index type
 