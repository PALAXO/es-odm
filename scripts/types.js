/*
 * Generates the "types/" declarations out of the JS sources and their JSDoc, and verifies the result before
 * it is written. The declarations are never edited by hand - "npm run types" is the only way to change them;
 * run it after any public signature change and commit whatever it produces. With "--check" nothing is written and
 * the run fails when the declarations in "types/" are out of date - "prepublishOnly" uses it to refuse stale ones.
 *
 * Usage: node scripts/types.js [--check]
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), `..`);
const TYPES_DIR = path.join(ROOT, `types`);
const TEMP_DIR = path.join(ROOT, `node_modules`, `.cache`, `es-odm-types`);
const TSC = path.join(ROOT, `node_modules`, `typescript`, `lib`, `tsc.js`);
const LIB_DIR = path.join(ROOT, `lib`);
const SELF_LINK = path.join(ROOT, `node_modules`, `es-odm`);
const CHECK_ONLY = process.argv.includes(`--check`);

/**
 * Reports the problem and ends the run
 * @param message {string} What went wrong
 * @param details {Array<string>=} Individual problems
 * @returns {never}
 */
function fail(message, details = []) {
    console.error(message);
    for (const detail of details) {
        console.error(`  - ${detail}`);
    }
    process.exit(1);
}

/**
 * Links the package into its own "node_modules", so that the type level test resolves "es-odm" the way a consumer
 * does - through "main", "types" and "typesVersions" of "package.json" instead of a direct path into "types/"
 * @returns {void}
 */
function linkSelf() {
    try {
        if (fs.existsSync(SELF_LINK) && (fs.realpathSync(SELF_LINK) === fs.realpathSync(ROOT))) {
            return;
        }
        fs.rmSync(SELF_LINK, { recursive: true, force: true });

        //"junction" is the only link Windows creates without elevated rights, the other platforms ignore the type
        fs.symlinkSync(ROOT, SELF_LINK, `junction`);
    } catch (e) {
        fail(`Cannot link the package into its own "node_modules" as "${SELF_LINK}": ${e.message}`);
    }
}

/**
 * Returns all the declaration files of given directory, relative to it
 * @param directory {string} Directory to be listed
 * @returns {Array<string>} Relative paths of the found files
 */
function listDeclarations(directory) {
    if (!fs.existsSync(directory)) {
        return [];
    }

    return fs.readdirSync(directory, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith(`.d.ts`))
        .map((entry) => path.relative(directory, path.join(entry.parentPath, entry.name)).replaceAll(path.sep, `/`))
        .sort();
}

/**
 * Refuses a hand written declaration sitting next to a JS source - TypeScript would read it instead of the
 * source and the generation would silently stop being idempotent
 * @returns {void}
 */
function checkNoDeclarationBesideSource() {
    //Exactly the sources the "tsconfig.json" compiles - "index.js" in the root and everything under "lib"
    const strays = fs.readdirSync(LIB_DIR, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith(`.d.ts`))
        .map((entry) => path.relative(ROOT, path.join(entry.parentPath, entry.name)).replaceAll(path.sep, `/`));

    if (fs.existsSync(path.join(ROOT, `index.d.ts`))) {
        strays.unshift(`index.d.ts`);
    }

    if (strays.length > 0) {
        fail(`A declaration file must never sit next to a JS source, TypeScript would read it instead of the source:`, strays);
    }
}

/**
 * Reads given file with the line endings normalized - git checks them out platform dependently
 * @param filePath {string} File to be read
 * @returns {string} Normalized content
 */
function readNormalized(filePath) {
    return fs.readFileSync(filePath, `utf8`).replaceAll(`\r\n`, `\n`);
}

/**
 * Parses the "@type" tags of the members a class defines through "Object.defineProperty(this, ...)"
 * @param source {string} JS source of the module
 * @returns {Array<{type: string, description: string, name: string}>} Parsed members
 */
function parseDefinedProperties(source) {
    const definitions = [];
    const tag = /\/\*\*\s*@type \{/g;

    let match;
    while ((match = tag.exec(source)) !== null) {
        //Scan for the closing brace of the type - a nested object type carries braces of its own
        let depth = 1;
        let index = match.index + match[0].length;
        while (index < source.length && depth > 0) {
            if (source[index] === `{`) {
                depth++;
            } else if (source[index] === `}`) {
                depth--;
            }
            index++;
        }
        if (depth !== 0) {
            fail(`Unterminated "@type" tag in a source of the declarations.`);
        }

        const type = source.substring(match.index + match[0].length, index - 1).trim();
        const commentEnd = source.indexOf(`*/`, index);
        const description = source.substring(index, commentEnd).trim();

        const property = source.substring(commentEnd + 2).match(/^\s*Object\.defineProperty\(this, `(\w+)`/);
        if (property) {
            definitions.push({ type: type, description: description, name: property[1] });
        }
    }

    return definitions;
}

/**
 * Declares the members a class defines through "Object.defineProperty(this, ...)" - TypeScript reads neither those calls
 * nor the "@type" tags above them, so the tags are the source and the declaration is completed here
 * @param sourcePath {string} JS source of the module
 * @param declarationPath {string} Generated declaration of the module
 * @returns {void}
 */
function declareDefinedProperties(sourcePath, declarationPath) {
    const source = fs.readFileSync(sourcePath, `utf8`);
    const expected = source.match(/Object\.defineProperty\(this, `/g)?.length ?? 0;
    if (expected === 0) {
        return;
    }

    //A member which the tag above it failed to describe would silently disappear from the declaration
    const definitions = parseDefinedProperties(source);
    if (definitions.length !== expected) {
        fail(`${path.relative(ROOT, sourcePath)} defines ${expected} properties, but only ${definitions.length} carry a readable "@type" tag above them.`);
    }

    let declaration = fs.readFileSync(declarationPath, `utf8`);
    const classNames = [...declaration.matchAll(/^declare class (\w+)/gm)].map((match) => match[1]);
    if (classNames.length !== 1) {
        fail(`${path.relative(ROOT, declarationPath)} declares ${classNames.length} classes, the defined properties cannot be assigned to one of them.`);
    }
    const className = classNames[0];

    const members = [];
    for (const { type, description, name } of definitions) {
        if (type.includes(`*`) && /['"`]/.test(type)) {
            fail(`The "@type" tag of "${name}" mixes a wildcard with a string literal, its conversion to "any" would corrupt it.`);
        }

        //TypeScript may have inferred the member as "any" from a "this.x = ..." assignment in a method - the tag is more precise
        declaration = declaration.replace(new RegExp(`^ {4}${name}: any;\\r?\\n`, `m`), ``);
        members.push(`    /** ${description} */\n    ${name}: ${type.replaceAll(`*`, `any`)};`);
    }

    //A class header printed differently would make the members silently disappear from the declaration
    const classHeader = new RegExp(`^(declare class ${className}\\b[^\\n]*\\{)$`, `m`);
    if (!classHeader.test(declaration)) {
        fail(`${path.relative(ROOT, declarationPath)} has no single line header of the class "${className}", the defined properties cannot be declared.`);
    }
    declaration = declaration.replace(classHeader, `$1\n${members.join(`\n`)}`);
    fs.writeFileSync(declarationPath, declaration);
}

/**
 * Runs the TypeScript compiler, ends the run when it reports a problem
 * @param args {Array<string>} Compiler arguments
 * @param message {string} What to report when it fails
 * @returns {void}
 */
function runTsc(args, message) {
    const result = spawnSync(process.execPath, [TSC, ...args], { stdio: `inherit` });
    if (result.status !== 0) {
        fail(message);
    }
}

checkNoDeclarationBesideSource();
linkSelf();

//Emit into a temporary directory - the declarations of the previous run must not shadow the JS sources
fs.rmSync(TEMP_DIR, { recursive: true, force: true });
runTsc([`-p`, path.join(ROOT, `tsconfig.json`), `--outDir`, TEMP_DIR], `Declaration generation failed.`);

const generated = listDeclarations(TEMP_DIR);
for (const relativePath of generated) {
    declareDefinedProperties(path.join(ROOT, relativePath.replace(/\.d\.ts$/, `.js`)), path.join(TEMP_DIR, relativePath));
}

//The generated declarations have to type check on their own, before anything is written - the consumer test runs
//with "skipLibCheck" and would not notice
runTsc([
    `--ignoreConfig`, `--noEmit`, `--module`, `nodenext`, `--moduleResolution`, `nodenext`, `--target`, `es2022`, `--strict`,
    ...generated.map((relativePath) => path.join(TEMP_DIR, relativePath))
], `The generated declarations do not type check, nothing was written into "types/".`);

const committed = listDeclarations(TYPES_DIR);
const changed = generated.filter((relativePath) => !committed.includes(relativePath) ||
    readNormalized(path.join(TEMP_DIR, relativePath)) !== readNormalized(path.join(TYPES_DIR, relativePath)));
const removed = committed.filter((relativePath) => !generated.includes(relativePath));

const differences = [
    ...changed.map((relativePath) => `types/${relativePath}`),
    ...removed.map((relativePath) => `types/${relativePath} (no longer generated from any source)`)
];

if (!CHECK_ONLY) {
    fs.rmSync(TYPES_DIR, { recursive: true, force: true });
    fs.cpSync(TEMP_DIR, TYPES_DIR, { recursive: true });
}
fs.rmSync(TEMP_DIR, { recursive: true, force: true });

if (differences.length === 0) {
    console.log(`The declarations in "types/" are up to date (${generated.length} files).`);
} else if (CHECK_ONLY) {
    fail(`The declarations in "types/" are out of date, run "npm run types" and commit the result:`, differences);
} else {
    console.log(`Updated "types/" (${generated.length} files) - commit the result:`);
    for (const difference of differences) {
        console.log(`  - ${difference}`);
    }
}
